-- =============================================================================
-- MIGRATION 016: MESSENGER FULLY CLIENT-SIDE (SUPABASE DIRECT)
-- =============================================================================
-- Plain-English summary
-- ---------------------
-- Messenger/Chats no longer calls the Express backend (/api/messages/*,
-- /api/conversations). The browser talks to Supabase directly and listens to
-- Supabase Realtime. For that to work the database must be correct, and it
-- currently has TWO blocking bugs plus one missing link:
--
--   BUG 1 — INFINITE RECURSION (blocks every read)
--     migration 014 wrote the conversation_participants SELECT policy as
--         EXISTS (SELECT 1 FROM public.conversation_participants …)
--     A policy on a table may not query that same table. PostgreSQL raises
--         ERROR 42P17: infinite recursion detected in policy for relation
--         "conversation_participants"
--     so ANY select on conversation_participants fails. The conversations and
--     messages SELECT policies also sub-query conversation_participants, so
--     those fail too. Net effect: the inbox cannot load at all.
--     Fix: a SECURITY DEFINER helper, public.is_conversation_participant(text),
--     which evaluates membership without re-entering RLS. All three tables then
--     use the helper. (This is Supabase's documented remedy for recursive
--     policies.)
--
--   BUG 2 — NO public.profiles ROW FOR NEW SIGN-UPS (blocks every write)
--     messages.sender_id and conversation_participants.profile_id are FOREIGN
--     KEYS to public.profiles(id). migrations 013/014 only back-filled profiles
--     ONCE, so anyone registering afterwards gets an alumni_profiles row but no
--     profiles row → insert fails with 23503.
--     Fix: trigger public.ensure_profile_for_auth_user() on auth.users and on
--     alumni_profiles, plus a one-time back-fill.
--
--   LINK 3 — REALTIME NOT ACTUALLY PUBLISHED
--     postgres_changes only works for tables in the supabase_realtime
--     publication. Migration 012 did not include the messaging tables (only 014
--     did, and it swallowed all errors).
--     Fix: publish messages / conversations / conversation_participants /
--     user_message_settings and set REPLICA IDENTITY FULL.
--
-- Idempotent. Does not drop tables and does not rewrite application data.
-- Apply once in the Supabase SQL editor (Dashboard → SQL Editor), or with
--   supabase db push
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- STEP 0: PREREQUISITES
-- -----------------------------------------------------------------------------
-- This migration builds on migrations 013 + 014. Fail loudly and early instead of
-- with an opaque "relation public.profiles does not exist" further down.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    RAISE EXCEPTION
      'public.profiles is missing. Run supabase/migrations/013_meta_messenger_production.sql and 014_high_security_safe_rls.sql first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'conversation_participants'
  ) THEN
    RAISE EXCEPTION
      'Messaging tables are missing. Run supabase/migrations/013_meta_messenger_production.sql first.';
  END IF;
END $$;

-- Helper everything else depends on

CREATE OR REPLACE FUNCTION public.get_current_profile_id()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_profile_id() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- STEP 1: FIX BUG 1 — recursion-free membership check
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER means the inner SELECT on conversation_participants runs
-- without re-applying that table's RLS policy → no recursion, one index probe.
CREATE OR REPLACE FUNCTION public.is_conversation_participant(p_conversation_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.profile_id = public.get_current_profile_id()
  );
$$;

REVOKE ALL ON FUNCTION public.is_conversation_participant(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(TEXT) TO authenticated, service_role;

-- === 1.1 conversation_participants: no self-reference ===
DROP POLICY IF EXISTS "participants_select_in_conversation" ON public.conversation_participants;
CREATE POLICY "participants_select_in_conversation" ON public.conversation_participants
  FOR SELECT TO authenticated
  USING (
    profile_id = public.get_current_profile_id()
    OR public.is_conversation_participant(conversation_id)
    OR public.is_current_user_super_admin()
  );

DROP POLICY IF EXISTS "participants_insert_participant" ON public.conversation_participants;
CREATE POLICY "participants_insert_participant" ON public.conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = public.get_current_profile_id()
    OR public.is_conversation_participant(conversation_id)
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_participants.conversation_id
        AND c.created_by = public.get_current_profile_id()
    )
    OR public.is_current_user_super_admin()
  );

DROP POLICY IF EXISTS "participants_update_own" ON public.conversation_participants;
CREATE POLICY "participants_update_own" ON public.conversation_participants
  FOR UPDATE TO authenticated
  USING (profile_id = public.get_current_profile_id())
  WITH CHECK (profile_id = public.get_current_profile_id());

DROP POLICY IF EXISTS "participants_delete_own" ON public.conversation_participants;
CREATE POLICY "participants_delete_own" ON public.conversation_participants
  FOR DELETE TO authenticated
  USING (
    profile_id = public.get_current_profile_id()
    OR public.is_current_user_super_admin()
  );

-- === 1.2 conversations: creator + members ===
DROP POLICY IF EXISTS "conversations_select_participant" ON public.conversations;
CREATE POLICY "conversations_select_participant" ON public.conversations
  FOR SELECT TO authenticated
  USING (
    public.is_conversation_participant(id)
    OR created_by = public.get_current_profile_id()
    OR public.is_current_user_super_admin()
  );

DROP POLICY IF EXISTS "conversations_insert_authenticated" ON public.conversations;
CREATE POLICY "conversations_insert_authenticated" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = public.get_current_profile_id()
    OR public.is_current_user_super_admin()
  );

-- === 1.3 messages: members read, sender writes ===
DROP POLICY IF EXISTS "messages_select_participant" ON public.messages;
CREATE POLICY "messages_select_participant" ON public.messages
  FOR SELECT TO authenticated
  USING (
    public.is_conversation_participant(conversation_id)
    OR public.is_current_user_super_admin()
  );

DROP POLICY IF EXISTS "messages_insert_sender" ON public.messages;
CREATE POLICY "messages_insert_sender" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = public.get_current_profile_id()
    AND public.is_conversation_participant(conversation_id)
  );

DROP POLICY IF EXISTS "messages_update_sender" ON public.messages;
CREATE POLICY "messages_update_sender" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    sender_id = public.get_current_profile_id()
    AND deleted_at IS NULL
  )
  WITH CHECK (sender_id = public.get_current_profile_id());

-- === 1.4 user_message_settings: own row only ===
DROP POLICY IF EXISTS "settings_select_own" ON public.user_message_settings;
CREATE POLICY "settings_select_own" ON public.user_message_settings
  FOR SELECT TO authenticated
  USING (
    profile_id = public.get_current_profile_id()
    OR public.is_current_user_super_admin()
  );

DROP POLICY IF EXISTS "settings_insert_own" ON public.user_message_settings;
CREATE POLICY "settings_insert_own" ON public.user_message_settings
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = public.get_current_profile_id());

DROP POLICY IF EXISTS "settings_update_own" ON public.user_message_settings;
CREATE POLICY "settings_update_own" ON public.user_message_settings
  FOR UPDATE TO authenticated
  USING (profile_id = public.get_current_profile_id())
  WITH CHECK (profile_id = public.get_current_profile_id());

-- -----------------------------------------------------------------------------
-- STEP 2: FIX BUG 2 — guarantee a public.profiles row for every account
-- -----------------------------------------------------------------------------
-- 2.1 One-time back-fill (mirrors alumni_profiles, ids preserved)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'alumni_profiles'
  ) THEN
    INSERT INTO public.profiles (id, user_id, role, is_verified, batch, avatar_url, full_name, created_at)
    SELECT
      ap.id,
      ap.auth_user_id,
      -- ap.role is the public.user_role ENUM (member/moderator/admin): cast to text
      -- first, otherwise comparing a column-level enum to a literal that is not an
      -- enum label ('super_admin') raises "invalid input value for enum".
      CASE WHEN ap.role::text IN ('admin', 'super_admin') THEN 'super_admin' ELSE 'alumni' END,
      (COALESCE(ap.verification_status, 'unverified') = 'verified'),
      ap.batch_year,
      ap.avatar_url,
      ap.full_name,
      COALESCE(ap.created_at, now())
    FROM public.alumni_profiles ap
    WHERE ap.auth_user_id IS NOT NULL
    ON CONFLICT (id) DO NOTHING;

    -- Fill only the columns that are still empty on an existing profiles row.
    UPDATE public.profiles p
    SET
      full_name = COALESCE(p.full_name, ap.full_name),
      avatar_url = COALESCE(p.avatar_url, ap.avatar_url),
      batch = COALESCE(p.batch, ap.batch_year)
    FROM public.alumni_profiles ap
    WHERE ap.auth_user_id = p.user_id
      AND (p.full_name IS NULL OR p.avatar_url IS NULL OR p.batch IS NULL);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'profiles back-fill skipped: %', SQLERRM;
END $$;

-- 2.2 Trigger function used by both entry points below
CREATE OR REPLACE FUNCTION public.ensure_profile_for_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_alumni  RECORD;
BEGIN
  -- auth.users has no user_id column (its PK is id); alumni_profiles has auth_user_id.
  -- Reading the wrong column raises "record NEW has no field…", so branch explicitly.
  IF TG_TABLE_NAME = 'alumni_profiles' THEN
    v_user_id := NEW.auth_user_id;
  ELSE
    v_user_id := NEW.id;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_user_id) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'alumni_profiles' THEN
    v_alumni := NEW;
  ELSE
    BEGIN
      SELECT id, full_name, avatar_url, batch_year, verification_status, role
      INTO v_alumni
      FROM public.alumni_profiles
      WHERE auth_user_id = v_user_id
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_alumni := NULL;
    END;
  END IF;

  BEGIN
    IF v_alumni.id IS NOT NULL THEN
      INSERT INTO public.profiles (id, user_id, role, is_verified, batch, avatar_url, full_name, created_at)
      VALUES (
        v_alumni.id,
        v_user_id,
        CASE WHEN v_alumni.role::text IN ('admin', 'super_admin') THEN 'super_admin' ELSE 'alumni' END,
        (COALESCE(v_alumni.verification_status, 'unverified') = 'verified'),
        v_alumni.batch_year,
        v_alumni.avatar_url,
        v_alumni.full_name,
        now()
      )
      ON CONFLICT (id) DO UPDATE
        SET user_id = EXCLUDED.user_id
        WHERE public.profiles.user_id IS DISTINCT FROM EXCLUDED.user_id;
    ELSE
      INSERT INTO public.profiles (user_id, role, is_verified, created_at)
      VALUES (v_user_id, 'alumni', FALSE, now())
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  EXCEPTION
    WHEN unique_violation THEN NULL;  -- a concurrent request won the race
    WHEN OTHERS THEN
      RAISE NOTICE 'ensure_profile_for_auth_user skipped: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_profile_for_auth_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ensure_profile_from_auth_user ON auth.users;
DO $$
BEGIN
  CREATE TRIGGER trg_ensure_profile_from_auth_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.ensure_profile_for_auth_user();
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'auth.users trigger skipped (run this migration as postgres/owner): %', SQLERRM;
END $$;

DROP TRIGGER IF EXISTS trg_ensure_profile_from_alumni ON public.alumni_profiles;
DO $$
BEGIN
  CREATE TRIGGER trg_ensure_profile_from_alumni
  AFTER INSERT OR UPDATE OF full_name, avatar_url, batch_year, verification_status
  ON public.alumni_profiles
  FOR EACH ROW EXECUTE FUNCTION public.ensure_profile_for_auth_user();
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'alumni_profiles trigger skipped: %', SQLERRM;
END $$;

-- 2.3 Keep display fields in step with the alumni directory
CREATE OR REPLACE FUNCTION public.sync_profile_display_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.auth_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.profiles
  SET
    full_name = COALESCE(NULLIF(TRIM(NEW.full_name), ''), public.profiles.full_name),
    avatar_url = COALESCE(NULLIF(TRIM(NEW.avatar_url), ''), public.profiles.avatar_url),
    batch = COALESCE(NEW.batch_year, public.profiles.batch),
    is_verified = (COALESCE(NEW.verification_status, 'unverified') = 'verified'),
    updated_at = now()
  WHERE user_id = NEW.auth_user_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_display_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_profile_display_fields ON public.alumni_profiles;
CREATE TRIGGER trg_sync_profile_display_fields
AFTER UPDATE OF full_name, avatar_url, batch_year, verification_status ON public.alumni_profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_display_fields();

-- -----------------------------------------------------------------------------
-- STEP 3: LINK 3 — Realtime publication + replica identity
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.messages REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.conversations REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.conversation_participants REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.user_message_settings REPLICA IDENTITY FULL;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH tbl IN ARRAY ARRAY['messages', 'conversations', 'conversation_participants', 'user_message_settings']
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl)
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
       )
    THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- STEP 4: GRANTS — exactly the verbs/columns the client writes
-- -----------------------------------------------------------------------------
REVOKE ALL ON public.conversations, public.conversation_participants, public.messages
  FROM anon;

GRANT SELECT, INSERT ON public.conversations TO authenticated;
GRANT SELECT, INSERT ON public.conversation_participants TO authenticated;
GRANT UPDATE (last_read_at, is_muted) ON public.conversation_participants TO authenticated;
GRANT DELETE ON public.conversation_participants TO authenticated;

GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT UPDATE (body, edited_at, deleted_at) ON public.messages TO authenticated;

GRANT SELECT, INSERT ON public.user_message_settings TO authenticated;
GRANT UPDATE (who_can_message, read_receipts_enabled, sound_enabled,
              notification_preview_enabled, email_notification_digest, updated_at)
  ON public.user_message_settings TO authenticated;

-- RPC used by the client to open a direct chat (idempotent + privacy aware)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'start_direct_conversation'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.start_direct_conversation(BIGINT) TO authenticated';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'unread_total'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.unread_total() TO authenticated';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- VERIFICATION (read-only — run these afterwards)
-- =============================================================================
-- 1. Accounts without a profiles row (expect 0 rows):
--      SELECT ap.id, ap.full_name
--      FROM public.alumni_profiles ap
--      LEFT JOIN public.profiles p ON p.user_id = ap.auth_user_id
--      WHERE p.id IS NULL;
--
-- 2. Realtime publication membership (expect 4 rows):
--      SELECT tablename FROM pg_publication_tables
--      WHERE pubname = 'supabase_realtime'
--        AND tablename IN ('messages','conversations',
--                          'conversation_participants','user_message_settings');
--
-- 3. No recursive policy left anywhere (expect 0 rows):
--      SELECT polrelid::regclass AS table_name, polname
--      FROM pg_policy
--      WHERE pg_get_expr(polqual, polrelid) LIKE '%' || polrelid::regclass::text || '%'
--         OR pg_get_expr(polwithcheck, polrelid) LIKE '%' || polrelid::regclass::text || '%';
--
-- 4. Smoke test as a signed-in user (Supabase SQL editor with a JWT, or in the app):
--      SELECT * FROM public.conversation_participants WHERE profile_id = public.get_current_profile_id();
-- =============================================================================
