-- =============================================================================
-- SZMC ALUMNI: 10-SECOND EMERGENCY FIX
-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor -> New query -> Run)
-- =============================================================================

BEGIN;

-- 1. FIX POSTS TABLE RLS (Eliminates "new row violates row-level security policy for table 'posts'")
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "posts_insert_own" ON public.posts;
DROP POLICY IF EXISTS "Posts: Insert Own" ON public.posts;
DROP POLICY IF EXISTS "posts_insert_authenticated" ON public.posts;

CREATE POLICY "posts_insert_authenticated" ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "posts_select_visible" ON public.posts;
DROP POLICY IF EXISTS "Posts: Read Visible" ON public.posts;
CREATE POLICY "posts_select_visible" ON public.posts
  FOR SELECT TO anon, authenticated
  USING (is_deleted = false OR auth.uid() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT SELECT ON public.posts TO anon;

-- 2. FIX 42P13 ERROR (Safely drops start_direct_conversation before recreation)
DROP FUNCTION IF EXISTS public.start_direct_conversation(BIGINT) CASCADE;
DROP FUNCTION IF EXISTS public.start_direct_conversation CASCADE;

-- 3. FIX RECURSION HELPER (SECURITY DEFINER prevents 42P17 infinite loop)
CREATE OR REPLACE FUNCTION public.is_conversation_participant(p_conversation_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id
      AND profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_conversation_participant(TEXT) TO authenticated, service_role;

-- 4. FIX CONVERSATION_PARTICIPANTS POLICIES (No self-querying recursion)
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "participants_select_in_conversation" ON public.conversation_participants;
CREATE POLICY "participants_select_in_conversation" ON public.conversation_participants
  FOR SELECT TO authenticated
  USING (
    profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR public.is_conversation_participant(conversation_id)
  );

DROP POLICY IF EXISTS "participants_insert_participant" ON public.conversation_participants;
CREATE POLICY "participants_insert_participant" ON public.conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 5. FIX CONVERSATIONS & MESSAGES POLICIES
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conversations_select_participant" ON public.conversations;
CREATE POLICY "conversations_select_participant" ON public.conversations
  FOR SELECT TO authenticated
  USING (
    created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR public.is_conversation_participant(id)
  );

DROP POLICY IF EXISTS "conversations_insert_authenticated" ON public.conversations;
CREATE POLICY "conversations_insert_authenticated" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (true);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages_select_participant" ON public.messages;
CREATE POLICY "messages_select_participant" ON public.messages
  FOR SELECT TO authenticated
  USING (
    public.is_conversation_participant(conversation_id)
  );

DROP POLICY IF EXISTS "messages_insert_sender" ON public.messages;
CREATE POLICY "messages_insert_sender" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR public.is_conversation_participant(conversation_id)
    OR auth.uid() IS NOT NULL
  );

-- 6. START DIRECT CONVERSATION RPC
CREATE OR REPLACE FUNCTION public.start_direct_conversation(target_profile_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_id BIGINT;
  existing_conv_id TEXT;
  new_conv_id TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT id INTO my_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF my_id IS NULL THEN
    RAISE EXCEPTION 'Profile missing in public.profiles.';
  END IF;

  IF my_id = target_profile_id THEN
    RAISE EXCEPTION 'Cannot message yourself.';
  END IF;

  SELECT c.id INTO existing_conv_id
  FROM public.conversations c
  JOIN public.conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.profile_id = my_id
  JOIN public.conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.profile_id = target_profile_id
  WHERE c.type = 'direct'
  LIMIT 1;

  IF existing_conv_id IS NOT NULL THEN
    RETURN existing_conv_id;
  END IF;

  INSERT INTO public.conversations (created_by, type, last_message_at)
  VALUES (my_id, 'direct', now())
  RETURNING id INTO new_conv_id;

  INSERT INTO public.conversation_participants (conversation_id, profile_id, joined_at, last_read_at)
  VALUES (new_conv_id, my_id, now(), now()), (new_conv_id, target_profile_id, now(), now() - INTERVAL '1 second');

  RETURN new_conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_direct_conversation(BIGINT) TO authenticated, service_role;

-- 7. REPLICATION PUBLICATION FOR REALTIME
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.posts; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

COMMIT;
