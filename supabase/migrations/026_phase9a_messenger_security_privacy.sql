-- =============================================================================
-- MIGRATION 026: PHASE 9A — MESSENGER SECURITY, PRIVACY & ISOLATION HARDENING
-- Project: Shaheed Ziaur Rahman Medical College Alumni Network (SZMC Bogura)
-- Safe & Idempotent: Run directly in Supabase Dashboard -> SQL Editor
-- =============================================================================
-- Fixes covered:
--   1. Bidirectional user_blocks enforcement in Messenger:
--        - public.are_profiles_blocked(BIGINT, BIGINT)
--        - public.is_direct_conversation_blocked(TEXT, BIGINT)
--        - public.get_messenger_blocked_profile_ids()
--        - start_direct_conversation(BIGINT) rejects blocked accounts
--        - messages INSERT RLS blocks sending in direct chats between blocked accounts
--          and restricts 'announcement' channels to admins/super_admins
--        - conversation_participants INSERT RLS blocks adding blocked peers to direct chats
--   2. Admin moderation vs. sender edit permission alignment:
--        - Sender edit stays strictly limited to sender_id = get_current_profile_id()
--        - public.moderate_delete_message(TEXT) allows verified admins/super_admins
--          to soft-delete messages (setting deleted_at = now() only, never altering text)
--   3. Persistent Super Admin official broadcast announcements:
--        - Refreshes public.broadcast_announcement(TEXT) to persist into a single
--          canonical 'szmc-official-announcements' conversation (type = 'announcement'),
--          enroll active profiles idempotently, and stream via RLS-protected postgres_changes
-- =============================================================================

BEGIN;

SET search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- 1. PROFILE-LEVEL BIDIRECTIONAL BLOCK HELPERS (profiles.id <-> alumni_profiles.id)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_alumni_id_for_messaging_profile(p_profile_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_alumni_id BIGINT := NULL;
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF to_regclass('public.alumni_profiles') IS NULL THEN
    RETURN p_profile_id;
  END IF;

  -- Prefer bridging via auth_user_id when profiles.user_id exists
  IF to_regclass('public.profiles') IS NOT NULL THEN
    SELECT ap.id
    INTO v_alumni_id
    FROM public.profiles p
    JOIN public.alumni_profiles ap ON ap.auth_user_id = p.user_id
    WHERE p.id = p_profile_id
    LIMIT 1;

    IF v_alumni_id IS NOT NULL THEN
      RETURN v_alumni_id;
    END IF;
  END IF;

  -- Fallback: matching numeric id
  SELECT ap.id
  INTO v_alumni_id
  FROM public.alumni_profiles ap
  WHERE ap.id = p_profile_id
  LIMIT 1;

  RETURN COALESCE(v_alumni_id, p_profile_id);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_alumni_id_for_messaging_profile(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_alumni_id_for_messaging_profile(BIGINT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.are_profiles_blocked(p_profile_a BIGINT, p_profile_b BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_alumni_a BIGINT;
  v_alumni_b BIGINT;
BEGIN
  IF p_profile_a IS NULL OR p_profile_b IS NULL OR p_profile_a = p_profile_b THEN
    RETURN FALSE;
  END IF;

  IF to_regclass('public.user_blocks') IS NULL THEN
    RETURN FALSE;
  END IF;

  v_alumni_a := public.resolve_alumni_id_for_messaging_profile(p_profile_a);
  v_alumni_b := public.resolve_alumni_id_for_messaging_profile(p_profile_b);

  RETURN EXISTS (
    SELECT 1
    FROM public.user_blocks ub
    WHERE (ub.blocker_id IN (p_profile_a, v_alumni_a) AND ub.blocked_id IN (p_profile_b, v_alumni_b))
       OR (ub.blocker_id IN (p_profile_b, v_alumni_b) AND ub.blocked_id IN (p_profile_a, v_alumni_a))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.are_profiles_blocked(BIGINT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.are_profiles_blocked(BIGINT, BIGINT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_direct_conversation_blocked(
  p_conversation_id TEXT,
  p_profile_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_conv_type TEXT;
BEGIN
  IF p_conversation_id IS NULL OR p_profile_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF to_regclass('public.user_blocks') IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT c.type INTO v_conv_type
  FROM public.conversations c
  WHERE c.id = p_conversation_id
  LIMIT 1;

  IF COALESCE(v_conv_type, 'direct') <> 'direct' THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.profile_id <> p_profile_id
      AND public.are_profiles_blocked(p_profile_id, cp.profile_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_direct_conversation_blocked(TEXT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_direct_conversation_blocked(TEXT, BIGINT) TO authenticated, service_role;

-- Privacy-preserving RPC for the signed-in caller's Messenger UI:
-- returns messaging/alumni profile IDs blocked in either direction so search & composers
-- enforce blocks without exposing other users' raw user_blocks rows.
CREATE OR REPLACE FUNCTION public.get_messenger_blocked_profile_ids()
RETURNS TABLE (
  blocked_profile_id BIGINT,
  blocked_by_me BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_my_profile_id BIGINT;
  v_my_alumni_id BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF to_regclass('public.user_blocks') IS NULL THEN
    RETURN;
  END IF;

  v_my_profile_id := public.get_current_profile_id();
  v_my_alumni_id := public.resolve_alumni_id_for_messaging_profile(v_my_profile_id);

  IF v_my_profile_id IS NULL AND v_my_alumni_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH raw_pairs AS (
    SELECT ub.blocked_id AS peer_alumni_id, TRUE AS by_me
    FROM public.user_blocks ub
    WHERE ub.blocker_id IN (v_my_profile_id, v_my_alumni_id)
    UNION ALL
    SELECT ub.blocker_id AS peer_alumni_id, FALSE AS by_me
    FROM public.user_blocks ub
    WHERE ub.blocked_id IN (v_my_profile_id, v_my_alumni_id)
  ),
  mapped AS (
    SELECT rp.peer_alumni_id AS pid, rp.by_me FROM raw_pairs rp
    UNION ALL
    SELECT p.id AS pid, rp.by_me
    FROM raw_pairs rp
    JOIN public.alumni_profiles ap ON ap.id = rp.peer_alumni_id
    JOIN public.profiles p ON p.user_id = ap.auth_user_id
  )
  SELECT m.pid AS blocked_profile_id, BOOL_OR(m.by_me) AS blocked_by_me
  FROM mapped m
  WHERE m.pid IS NOT NULL
    AND m.pid NOT IN (COALESCE(v_my_profile_id, -1), COALESCE(v_my_alumni_id, -1))
  GROUP BY m.pid;
END;
$$;

REVOKE ALL ON FUNCTION public.get_messenger_blocked_profile_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_messenger_blocked_profile_ids() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. STAFF CHECK HELPER FOR MESSAGING MODERATION / ANNOUNCEMENTS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_messenger_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = 'super_admin'
  ) THEN
    RETURN TRUE;
  END IF;

  IF to_regclass('public.alumni_profiles') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.alumni_profiles ap
      WHERE ap.auth_user_id = auth.uid()
        AND ap.role::text IN ('admin', 'super_admin')
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.is_messenger_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_messenger_admin() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. HARDEN start_direct_conversation(BIGINT) WITH BLOCK ENFORCEMENT
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_direct_conversation(target_profile_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_profile RECORD;
  target_profile RECORD;
  target_setting TEXT := 'everyone';
  existing_conv_id TEXT;
  new_conv_id TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- 1. Identify caller profile
  SELECT id, role, is_verified, batch
  INTO caller_profile
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF caller_profile.id IS NULL THEN
    RAISE EXCEPTION 'Caller profile does not exist in public.profiles.';
  END IF;

  IF caller_profile.id = target_profile_id THEN
    RAISE EXCEPTION 'Cannot start a direct conversation with yourself.';
  END IF;

  -- 2. Identify target profile
  SELECT id, role, is_verified, batch
  INTO target_profile
  FROM public.profiles
  WHERE id = target_profile_id
  LIMIT 1;

  IF target_profile.id IS NULL THEN
    RAISE EXCEPTION 'Target alumnus profile not found.';
  END IF;

  -- 3. Enforce bidirectional user blocks (cannot start new chats with blocked accounts)
  IF public.are_profiles_blocked(caller_profile.id, target_profile_id) THEN
    RAISE EXCEPTION 'Blocked: Messaging is unavailable because one of the accounts has blocked the other.';
  END IF;

  -- 4. Check target's message privacy settings
  SELECT who_can_message
  INTO target_setting
  FROM public.user_message_settings
  WHERE profile_id = target_profile_id
  LIMIT 1;

  target_setting := COALESCE(target_setting, 'everyone');

  -- 5. Enforce privacy policy (admins/super_admins bypass who_can_message restrictions)
  IF NOT public.is_messenger_admin() THEN
    IF target_setting = 'verified_only' AND NOT caller_profile.is_verified THEN
      RAISE EXCEPTION 'Privacy Restriction: This alumnus only accepts messages from verified alumni.';
    ELSIF target_setting = 'batch_only' AND (caller_profile.batch IS NULL OR caller_profile.batch != target_profile.batch) THEN
      RAISE EXCEPTION 'Privacy Restriction: This alumnus only accepts messages from their own MBBS batch.';
    END IF;
  END IF;

  -- 6. Safe idempotent lookup: return existing direct conversation if one already exists
  SELECT c.id INTO existing_conv_id
  FROM public.conversations c
  JOIN public.conversation_participants cp1
    ON cp1.conversation_id = c.id AND cp1.profile_id = caller_profile.id
  JOIN public.conversation_participants cp2
    ON cp2.conversation_id = c.id AND cp2.profile_id = target_profile_id
  WHERE c.type = 'direct'
  LIMIT 1;

  IF existing_conv_id IS NOT NULL THEN
    RETURN existing_conv_id;
  END IF;

  -- 7. Atomically create new direct conversation
  new_conv_id := gen_random_uuid()::text;

  INSERT INTO public.conversations (id, created_by, type, last_message, last_message_at, created_at, updated_at)
  VALUES (new_conv_id, caller_profile.id, 'direct', NULL, now(), now(), now());

  -- 8. Add both participants
  INSERT INTO public.conversation_participants (conversation_id, profile_id, joined_at, last_read_at, is_muted)
  VALUES
    (new_conv_id, caller_profile.id, now(), now(), false),
    (new_conv_id, target_profile_id, now(), now(), false);

  RETURN new_conv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_direct_conversation(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_direct_conversation(BIGINT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. HARDEN RLS ON messages & conversation_participants
-- -----------------------------------------------------------------------------
-- 4.1 Block adding a blocked peer into a direct conversation via fallback INSERT
DROP POLICY IF EXISTS "participants_insert_participant" ON public.conversation_participants;
CREATE POLICY "participants_insert_participant" ON public.conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      profile_id = public.get_current_profile_id()
      OR public.is_conversation_participant(conversation_id)
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = conversation_participants.conversation_id
          AND c.created_by = public.get_current_profile_id()
      )
      OR public.is_messenger_admin()
    )
    AND (
      profile_id = public.get_current_profile_id()
      OR NOT EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = conversation_participants.conversation_id
          AND c.type = 'direct'
      )
      OR NOT public.are_profiles_blocked(public.get_current_profile_id(), profile_id)
    )
  );

-- 4.2 Prevent sending messages in blocked direct threads or read-only announcement channels
DROP POLICY IF EXISTS "messages_insert_sender" ON public.messages;
CREATE POLICY "messages_insert_sender" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = public.get_current_profile_id()
    AND public.is_conversation_participant(conversation_id)
    AND NOT public.is_direct_conversation_blocked(conversation_id, public.get_current_profile_id())
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = messages.conversation_id
          AND c.type = 'announcement'
      )
      OR public.is_messenger_admin()
    )
  );

-- 4.3 Keep messages_update_sender strictly for the original sender (admins cannot edit others' text)
DROP POLICY IF EXISTS "messages_update_sender" ON public.messages;
CREATE POLICY "messages_update_sender" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    sender_id = public.get_current_profile_id()
    AND deleted_at IS NULL
  )
  WITH CHECK (
    sender_id = public.get_current_profile_id()
  );

-- -----------------------------------------------------------------------------
-- 5. ADMIN MODERATION SOFT-DELETE RPC (NEVER ALLOWS TEXT EDITING BY ADMINS)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.moderate_delete_message(p_message_id TEXT)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller_pid BIGINT;
  v_is_admin BOOLEAN;
  v_target public.messages%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  v_caller_pid := public.get_current_profile_id();
  v_is_admin := public.is_messenger_admin();

  SELECT * INTO v_target
  FROM public.messages m
  WHERE m.id = p_message_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found.';
  END IF;

  IF v_target.sender_id <> v_caller_pid AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Permission denied: only the message author or an administrator can delete this message.';
  END IF;

  UPDATE public.messages
  SET deleted_at = COALESCE(deleted_at, now())
  WHERE id = p_message_id
  RETURNING * INTO v_target;

  -- Record moderation audit log when an admin removes another user's message
  IF v_target.sender_id <> v_caller_pid AND to_regclass('public.audit_logs') IS NOT NULL THEN
    BEGIN
      INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details, created_at)
      VALUES (
        public.resolve_alumni_id_for_messaging_profile(v_caller_pid),
        'messenger_moderate_delete',
        'message',
        NULL,
        jsonb_build_object(
          'message_id', v_target.id,
          'conversation_id', v_target.conversation_id,
          'original_sender_id', v_target.sender_id
        ),
        now()
      );
    EXCEPTION WHEN OTHERS THEN
      NULL; -- Audit log schema variations must never block moderation delete
    END;
  END IF;

  RETURN v_target;
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_delete_message(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_delete_message(TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. PERSISTENT OFFICIAL ANNOUNCEMENT BROADCAST RPC
-- -----------------------------------------------------------------------------
-- Reuses a single canonical 'szmc-official-announcements' channel (type='announcement'),
-- enrolls all active profiles idempotently, inserts a real persisted message row,
-- and streams automatically to every signed-in alumnus via RLS-protected postgres_changes.
CREATE OR REPLACE FUNCTION public.broadcast_announcement(announcement_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_admin_pid BIGINT;
  v_clean_text TEXT;
  v_channel_id CONSTANT TEXT := 'szmc-official-announcements';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT public.is_messenger_admin() THEN
    RAISE EXCEPTION 'Access Denied: Only administrators can publish official announcements.';
  END IF;

  v_clean_text := trim(COALESCE(announcement_text, ''));
  IF v_clean_text = '' THEN
    RAISE EXCEPTION 'Announcement text cannot be empty.';
  END IF;

  v_admin_pid := public.get_current_profile_id();
  IF v_admin_pid IS NULL THEN
    RAISE EXCEPTION 'Administrator messaging profile is not initialized.';
  END IF;

  -- 1. Ensure canonical announcement channel exists
  INSERT INTO public.conversations (
    id, created_by, type, title, last_message, last_message_at, created_at, updated_at
  )
  VALUES (
    v_channel_id,
    v_admin_pid,
    'announcement',
    'SZMC Official Announcements',
    left(v_clean_text, 200),
    now(),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    title = COALESCE(public.conversations.title, 'SZMC Official Announcements'),
    last_message = left(v_clean_text, 200),
    last_message_at = now(),
    updated_at = now();

  -- 2. Idempotently enroll all messaging profiles so every alumnus receives it in their inbox
  INSERT INTO public.conversation_participants (conversation_id, profile_id, joined_at, last_read_at, is_muted)
  SELECT
    v_channel_id,
    p.id,
    now(),
    CASE WHEN p.id = v_admin_pid THEN now() ELSE now() - INTERVAL '1 minute' END,
    FALSE
  FROM public.profiles p
  ON CONFLICT (conversation_id, profile_id) DO NOTHING;

  -- 3. Insert the persisted announcement message (triggers realtime delivery via postgres_changes)
  INSERT INTO public.messages (id, conversation_id, sender_id, type, body, created_at)
  VALUES (
    gen_random_uuid()::text,
    v_channel_id,
    v_admin_pid,
    'system',
    v_clean_text,
    now()
  );

  RETURN v_channel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_announcement(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.broadcast_announcement(TEXT) TO authenticated, service_role;

COMMIT;
