-- =============================================================================
-- MIGRATION 028: PHASE 9C — GROUP CHATS, MESSAGE REPLIES & LIVE REACTIONS
-- =============================================================================
-- Adds core modern messaging schema & RPCs with strict participant-only RLS:
--   1. public.messages.reply_to_message_id (nullable FK to public.messages.id)
--   2. public.message_reactions table (composite PK, strict RLS, Realtime enabled)
--   3. public.create_group_conversation(TEXT, BIGINT[]) RPC (block-aware, atomic)
--   4. public.add_group_member(TEXT, BIGINT) RPC (for existing group participants)
--   5. Optional chat-media storage bucket setup (best-effort, non-blocking)
--
-- Idempotent and safe to run multiple times in Supabase SQL Editor.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. MESSAGE REPLY / QUOTE COLUMN
-- -----------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id TEXT NULL
  REFERENCES public.messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to
  ON public.messages (reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. MESSAGE REACTIONS TABLE (STRICT PARTICIPANT-ONLY RLS + REALTIME)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_reactions (
  message_id TEXT NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  profile_id BIGINT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (char_length(trim(emoji)) BETWEEN 1 AND 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, profile_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id
  ON public.message_reactions (message_id);

REVOKE ALL ON public.message_reactions FROM anon;
GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Helper: check whether caller participates in the conversation owning a message
CREATE OR REPLACE FUNCTION public.can_access_message(p_message_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.id = p_message_id
      AND (
        public.is_conversation_participant(m.conversation_id)
        OR public.is_current_user_super_admin()
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_message(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_message(TEXT) TO authenticated, service_role;

DROP POLICY IF EXISTS "reactions_select_participant" ON public.message_reactions;
CREATE POLICY "reactions_select_participant" ON public.message_reactions
  FOR SELECT TO authenticated
  USING (public.can_access_message(message_id));

DROP POLICY IF EXISTS "reactions_insert_own" ON public.message_reactions;
CREATE POLICY "reactions_insert_own" ON public.message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = public.get_current_profile_id()
    AND public.can_access_message(message_id)
  );

DROP POLICY IF EXISTS "reactions_delete_own" ON public.message_reactions;
CREATE POLICY "reactions_delete_own" ON public.message_reactions
  FOR DELETE TO authenticated
  USING (
    profile_id = public.get_current_profile_id()
    OR public.is_current_user_super_admin()
  );

ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'message_reactions'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 3. RPC: create_group_conversation(p_title TEXT, p_member_ids BIGINT[])
--    Creates a multi-member group conversation atomically, skipping blocked pairs.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_group_conversation(
  p_title TEXT,
  p_member_ids BIGINT[]
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_pid BIGINT;
  v_clean_title TEXT;
  v_conv_id TEXT;
  v_member_id BIGINT;
  v_added_count INTEGER := 0;
  v_is_blocked BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT id INTO v_caller_pid
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_caller_pid IS NULL THEN
    RAISE EXCEPTION 'Caller profile does not exist in public.profiles.';
  END IF;

  v_clean_title := trim(COALESCE(p_title, ''));
  IF char_length(v_clean_title) < 2 OR char_length(v_clean_title) > 80 THEN
    RAISE EXCEPTION 'Group name must be between 2 and 80 characters.';
  END IF;

  v_conv_id := gen_random_uuid()::text;

  INSERT INTO public.conversations (
    id, created_by, type, title, last_message, last_message_at, created_at, updated_at
  )
  VALUES (
    v_conv_id,
    v_caller_pid,
    'group',
    v_clean_title,
    'Group created',
    now(),
    now(),
    now()
  );

  -- Always add creator
  INSERT INTO public.conversation_participants (conversation_id, profile_id, joined_at, last_read_at, is_muted)
  VALUES (v_conv_id, v_caller_pid, now(), now(), false)
  ON CONFLICT (conversation_id, profile_id) DO NOTHING;

  -- Add requested members that exist in public.profiles and are not blocked with creator
  IF p_member_ids IS NOT NULL THEN
    FOREACH v_member_id IN ARRAY p_member_ids
    LOOP
      IF v_member_id IS NULL OR v_member_id = v_caller_pid THEN
        CONTINUE;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_member_id) THEN
        CONTINUE;
      END IF;

      -- Check bidirectional block if helper exists
      v_is_blocked := FALSE;
      BEGIN
        v_is_blocked := public.are_profiles_blocked(v_caller_pid, v_member_id);
      EXCEPTION WHEN undefined_function THEN
        v_is_blocked := FALSE;
      END;

      IF v_is_blocked THEN
        CONTINUE;
      END IF;

      INSERT INTO public.conversation_participants (conversation_id, profile_id, joined_at, last_read_at, is_muted)
      VALUES (v_conv_id, v_member_id, now(), now() - INTERVAL '1 second', false)
      ON CONFLICT (conversation_id, profile_id) DO NOTHING;

      v_added_count := v_added_count + 1;
    END LOOP;
  END IF;

  IF v_added_count < 1 THEN
    DELETE FROM public.conversations WHERE id = v_conv_id;
    RAISE EXCEPTION 'Please select at least 1 valid, non-blocked alumnus to create a group.';
  END IF;

  INSERT INTO public.messages (id, conversation_id, sender_id, type, body, created_at)
  VALUES (
    gen_random_uuid()::text,
    v_conv_id,
    v_caller_pid,
    'system',
    'Created group "' || v_clean_title || '"',
    now()
  );

  RETURN v_conv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_group_conversation(TEXT, BIGINT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_conversation(TEXT, BIGINT[]) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. RPC: add_group_member(p_conversation_id TEXT, p_profile_id BIGINT)
--    Allows an existing participant of a group chat to add another alumnus.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_group_member(
  p_conversation_id TEXT,
  p_profile_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_pid BIGINT;
  v_conv_type TEXT;
  v_is_blocked BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT id INTO v_caller_pid
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_caller_pid IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found.';
  END IF;

  SELECT type INTO v_conv_type
  FROM public.conversations
  WHERE id = p_conversation_id
  LIMIT 1;

  IF v_conv_type IS DISTINCT FROM 'group' THEN
    RAISE EXCEPTION 'Members can only be added to group conversations.';
  END IF;

  IF NOT public.is_conversation_participant(p_conversation_id)
     AND NOT public.is_current_user_super_admin() THEN
    RAISE EXCEPTION 'Only existing group members can invite colleagues.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id) THEN
    RAISE EXCEPTION 'Alumnus profile not found.';
  END IF;

  BEGIN
    v_is_blocked := public.are_profiles_blocked(v_caller_pid, p_profile_id);
  EXCEPTION WHEN undefined_function THEN
    v_is_blocked := FALSE;
  END;

  IF v_is_blocked THEN
    RAISE EXCEPTION 'Cannot add a blocked account to this group.';
  END IF;

  INSERT INTO public.conversation_participants (conversation_id, profile_id, joined_at, last_read_at, is_muted)
  VALUES (p_conversation_id, p_profile_id, now(), now() - INTERVAL '1 second', false)
  ON CONFLICT (conversation_id, profile_id) DO NOTHING;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.add_group_member(TEXT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_group_member(TEXT, BIGINT) TO authenticated, service_role;

COMMIT;
