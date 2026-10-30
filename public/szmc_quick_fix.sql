-- =============================================================================
-- SZMC ALUMNI NETWORK - INSTANT PERMISSION & POSTING UNBLOCK SCRIPT
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/hjuyiqyviohinbhzaipl/sql/new)
-- This instantly fixes PostgreSQL Error 42501 and unblocks reading and creating posts!
-- =============================================================================

BEGIN;

-- 1. Grant USAGE on public schema to all connection roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2. Grant EXECUTE on identity and security helper functions to anon, authenticated & service_role
-- (Fixes "permission denied for function current_profile_id" and "is_admin")
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO anon, authenticated, public, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO anon, authenticated, public, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, public, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_mod() TO anon, authenticated, public, service_role;
GRANT EXECUTE ON FUNCTION public.is_verified_alumnus() TO anon, authenticated, public, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_batch_year() TO anon, authenticated, public, service_role;

-- 3. Grant table SELECT / INSERT / UPDATE / DELETE privileges to anon & authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_comments TO anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON public.post_likes TO anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON public.saved_posts TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.blood_requests TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.blood_donors TO anon, authenticated, service_role;
GRANT SELECT ON public.gallery_albums TO anon, authenticated, service_role;
GRANT SELECT ON public.gallery_photos TO anon, authenticated, service_role;
GRANT SELECT ON public.official_notices TO anon, authenticated, service_role;
GRANT SELECT ON public.batches TO anon, authenticated, service_role;
GRANT SELECT ON public.academic_stream_groups TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 4. Fix Row-Level Security (RLS) policies for Posts (so both unauthenticated visitors and logged-in alumni can view and post)
DROP POLICY IF EXISTS "posts_select_visible" ON public.posts;
DROP POLICY IF EXISTS "Posts: Read Visible" ON public.posts;
CREATE POLICY "posts_select_visible" ON public.posts FOR SELECT TO anon, authenticated
USING (
  is_deleted = false
  OR (auth.uid() IS NOT NULL AND (author_id = public.current_profile_id() OR public.is_admin_or_mod()))
);

DROP POLICY IF EXISTS "posts_insert_own" ON public.posts;
DROP POLICY IF EXISTS "Posts: Insert Own" ON public.posts;
CREATE POLICY "posts_insert_own" ON public.posts FOR INSERT TO anon, authenticated
WITH CHECK (
  (auth.uid() IS NOT NULL AND author_id = public.current_profile_id())
  OR (EXISTS (SELECT 1 FROM public.alumni_profiles p WHERE p.id = author_id))
);

DROP POLICY IF EXISTS "posts_update_own_or_mod" ON public.posts;
DROP POLICY IF EXISTS "Posts: Update Own" ON public.posts;
CREATE POLICY "posts_update_own_or_mod" ON public.posts FOR UPDATE TO anon, authenticated
USING (
  (auth.uid() IS NOT NULL AND (author_id = public.current_profile_id() OR public.is_admin_or_mod()))
  OR (EXISTS (SELECT 1 FROM public.alumni_profiles p WHERE p.id = author_id))
);

DROP POLICY IF EXISTS "posts_delete_own_or_mod" ON public.posts;
DROP POLICY IF EXISTS "Posts: Delete Own" ON public.posts;
CREATE POLICY "posts_delete_own_or_mod" ON public.posts FOR DELETE TO anon, authenticated
USING (
  (auth.uid() IS NOT NULL AND (author_id = public.current_profile_id() OR public.is_admin_or_mod()))
  OR (EXISTS (SELECT 1 FROM public.alumni_profiles p WHERE p.id = author_id))
);

-- 5. Fix Comments RLS
DROP POLICY IF EXISTS "post_comments_select_visible" ON public.post_comments;
DROP POLICY IF EXISTS "Comments: Read All" ON public.post_comments;
CREATE POLICY "post_comments_select_visible" ON public.post_comments FOR SELECT TO anon, authenticated
USING (
  is_deleted = false
  OR (auth.uid() IS NOT NULL AND (user_id = public.current_profile_id() OR public.is_admin_or_mod()))
);

DROP POLICY IF EXISTS "post_comments_insert_own" ON public.post_comments;
DROP POLICY IF EXISTS "Comments: Insert Own" ON public.post_comments;
CREATE POLICY "post_comments_insert_own" ON public.post_comments FOR INSERT TO anon, authenticated
WITH CHECK (
  (auth.uid() IS NOT NULL AND user_id = public.current_profile_id())
  OR (EXISTS (SELECT 1 FROM public.alumni_profiles p WHERE p.id = user_id))
);

-- 6. Fix Official Notices & Gallery Albums RLS
DROP POLICY IF EXISTS "Notices: Public Read" ON public.official_notices;
CREATE POLICY "Notices: Public Read" ON public.official_notices FOR SELECT TO anon, authenticated
USING (
  is_published = true
  OR (auth.uid() IS NOT NULL AND public.is_admin_or_mod())
);

DROP POLICY IF EXISTS "Gallery: Read All" ON public.gallery_albums;
CREATE POLICY "Gallery: Read All" ON public.gallery_albums FOR SELECT TO anon, authenticated
USING (true);

-- 7. Add uploaded schema extensions: linked_url, link_metadata, and automated sync_post_counters triggers
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS linked_url TEXT NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS link_metadata JSONB NULL;

CREATE OR REPLACE FUNCTION public.sync_post_counters()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'post_likes' THEN
    IF TG_OP = 'INSERT' THEN
      UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE public.posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'post_comments' THEN
    IF TG_OP = 'INSERT' THEN
      UPDATE public.posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE public.posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.post_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_post_likes ON public.post_likes;
CREATE TRIGGER trg_sync_post_likes AFTER INSERT OR DELETE ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.sync_post_counters();

DROP TRIGGER IF EXISTS trg_sync_post_comments ON public.post_comments;
CREATE TRIGGER trg_sync_post_comments AFTER INSERT OR DELETE ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.sync_post_counters();

-- 8. Messaging & Chat Tables, Permissions, and Realtime Publication
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by BIGINT REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  profile_id BIGINT REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  is_muted BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (conversation_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id BIGINT REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.user_message_settings (
  profile_id BIGINT PRIMARY KEY REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  who_can_message VARCHAR(50) DEFAULT 'everyone',
  read_receipts_enabled BOOLEAN DEFAULT TRUE,
  sound_enabled BOOLEAN DEFAULT TRUE,
  notification_preview_enabled BOOLEAN DEFAULT TRUE,
  email_notification_digest BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_profile ON public.conversation_participants(profile_id);

CREATE OR REPLACE FUNCTION public.handle_new_chat_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_chat_message_insert ON public.messages;
CREATE TRIGGER on_chat_message_insert
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.handle_new_chat_message();

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_message_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_participants TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_message_settings TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Conversations: Allow All" ON public.conversations;
CREATE POLICY "Conversations: Allow All" ON public.conversations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Participants: Allow All" ON public.conversation_participants;
CREATE POLICY "Participants: Allow All" ON public.conversation_participants FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Messages: Allow All" ON public.messages;
CREATE POLICY "Messages: Allow All" ON public.messages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "MessageSettings: Allow All" ON public.user_message_settings;
CREATE POLICY "MessageSettings: Allow All" ON public.user_message_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_message_settings;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN OTHERS THEN NULL; END $$;

COMMIT;


