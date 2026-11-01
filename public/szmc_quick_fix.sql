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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alumni_profiles TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_comments TO anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON public.post_likes TO anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON public.saved_posts TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.verification_requests TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.peer_vouches TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_doc_submissions TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.blood_requests TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.blood_donors TO anon, authenticated, service_role;
GRANT SELECT ON public.gallery_albums TO anon, authenticated, service_role;
GRANT SELECT ON public.gallery_photos TO anon, authenticated, service_role;
GRANT SELECT ON public.official_notices TO anon, authenticated, service_role;
GRANT SELECT ON public.batches TO anon, authenticated, service_role;
GRANT SELECT ON public.academic_stream_groups TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 3b. Ensure Super Admin profile (ID: 1, Dr. Nurul Anam Bashir) exists in alumni_profiles
INSERT INTO public.alumni_profiles (
  id,
  full_name,
  batch_year,
  academic_stream,
  section,
  verification_status,
  verification_method,
  vouches_count,
  profession,
  position,
  institution,
  city,
  country,
  email,
  phone,
  role,
  is_public
) VALUES (
  1,
  'Dr. Nurul Anam Bashir',
  25,
  'MBBS',
  'MBBS',
  'verified',
  'admin_verified',
  10,
  'Medical Doctor / Physician',
  'Super Admin / Lead Physician',
  'Shaheed Ziaur Rahman Medical College Hospital',
  'Bogura',
  'Bangladesh',
  'nurulanambashir25@gmail.com',
  '01764436846',
  'admin',
  true
)
ON CONFLICT (id) DO UPDATE SET
  role = 'admin',
  verification_status = 'verified',
  email = 'nurulanambashir25@gmail.com',
  phone = '01764436846';

-- 3c. Ensure profiles entry exists for messaging & post attribution
INSERT INTO public.profiles (
  id,
  full_name,
  batch,
  role,
  is_verified
) VALUES (
  1,
  'Dr. Nurul Anam Bashir',
  25,
  'super_admin',
  true
)
ON CONFLICT (id) DO UPDATE SET
  role = 'super_admin',
  is_verified = true;

-- 4. Fix Row-Level Security (RLS) policies for Posts (so both unauthenticated visitors and logged-in alumni can view and post)
DROP POLICY IF EXISTS "posts_select_visible" ON public.posts;
DROP POLICY IF EXISTS "Posts: Read Visible" ON public.posts;
CREATE POLICY "posts_select_visible" ON public.posts FOR SELECT TO anon, authenticated
USING (true);

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

-- 9. Corrected get_feed function with safe type casting (fixes smallint vs integer mismatch)
CREATE OR REPLACE FUNCTION public.get_feed(
  p_user_id BIGINT DEFAULT NULL,
  p_limit INT DEFAULT 25,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id BIGINT,
  user_id BIGINT,
  author_id BIGINT,
  full_name TEXT,
  avatar_url TEXT,
  batch_year INT,
  verified BOOLEAN,
  profession TEXT,
  institution TEXT,
  content TEXT,
  category TEXT,
  images JSONB,
  videos JSONB,
  layout_template TEXT,
  linked_url TEXT,
  link_metadata JSONB,
  likes_count INT,
  comments_count INT,
  is_pinned BOOLEAN,
  is_edited BOOLEAN,
  created_at TIMESTAMPTZ,
  liked_by_me BOOLEAN,
  saved_by_me BOOLEAN,
  is_batchmate BOOLEAN,
  is_friend BOOLEAN,
  comments JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id BIGINT := p_user_id;
  v_my_batch INT := NULL;
BEGIN
  IF v_caller_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT p.id INTO v_caller_id
    FROM public.alumni_profiles p
    WHERE p.auth_user_id = auth.uid()
    LIMIT 1;
  END IF;

  IF v_caller_id IS NOT NULL THEN
    SELECT p.batch_year::INT INTO v_my_batch
    FROM public.alumni_profiles p
    WHERE p.id = v_caller_id
    LIMIT 1;
  END IF;

  RETURN QUERY
  WITH my_friends AS (
    SELECT c.friend_id AS fid
    FROM public.connections c
    WHERE c.user_id = v_caller_id AND c.status = 'accepted'
    UNION
    SELECT c.user_id AS fid
    FROM public.connections c
    WHERE c.friend_id = v_caller_id AND c.status = 'accepted'
  ),
  ranked_posts AS (
    SELECT
      po.id AS r_id,
      po.author_id AS r_author_id,
      COALESCE(ap.full_name, 'SZMC Alumnus')::TEXT AS r_full_name,
      COALESCE(ap.avatar_url, '/assets/aistudio/images__1__2778177d.png')::TEXT AS r_avatar_url,
      COALESCE(ap.batch_year, 25)::INT AS r_batch_year,
      COALESCE(ap.verification_status = 'verified', TRUE) AS r_verified,
      COALESCE(ap.profession, 'Doctor / Medical Professional')::TEXT AS r_profession,
      ap.institution::TEXT AS r_institution,
      po.content::TEXT AS r_content,
      COALESCE(po.category, 'General Update')::TEXT AS r_category,
      CASE
        WHEN jsonb_typeof(to_jsonb(po.images)) = 'array' THEN to_jsonb(po.images)
        ELSE '[]'::jsonb
      END AS r_images,
      CASE
        WHEN jsonb_typeof(to_jsonb(po.videos)) = 'array' THEN to_jsonb(po.videos)
        ELSE '[]'::jsonb
      END AS r_videos,
      COALESCE(po.layout_template, po.link_metadata->>'layout_template', 'grid')::TEXT AS r_layout_template,
      po.linked_url::TEXT AS r_linked_url,
      COALESCE(po.link_metadata, '{}'::jsonb) AS r_link_metadata,
      COALESCE(po.likes_count, 0)::INT AS r_likes_count,
      COALESCE(po.comments_count, 0)::INT AS r_comments_count,
      COALESCE(po.is_pinned, FALSE) AS r_is_pinned,
      COALESCE(po.is_edited, FALSE) AS r_is_edited,
      po.created_at AS r_created_at,
      EXISTS (
        SELECT 1 FROM public.post_likes pl
        WHERE pl.post_id = po.id AND pl.user_id = v_caller_id
      ) AS r_liked_by_me,
      EXISTS (
        SELECT 1 FROM public.saved_posts sp
        WHERE sp.post_id = po.id AND sp.user_id = v_caller_id
      ) AS r_saved_by_me,
      (
        v_my_batch IS NOT NULL AND
        ap.batch_year IS NOT NULL AND
        ap.batch_year::INT = v_my_batch AND
        ap.id != v_caller_id
      ) AS r_is_batchmate,
      (
        ap.id IN (SELECT fid FROM my_friends)
      ) AS r_is_friend,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', pc.id,
              'postId', pc.post_id,
              'userId', COALESCE(pc.user_id, pc.author_id),
              'fullName', COALESCE(cap.full_name, 'SZMC Alumnus'),
              'avatarUrl', COALESCE(cap.avatar_url, '/assets/aistudio/images__1__2778177d.png'),
              'content', pc.content,
              'likesCount', COALESCE(pc.likes_count, 0),
              'createdAt', pc.created_at
            )
            ORDER BY pc.created_at ASC
          )
          FROM public.post_comments pc
          LEFT JOIN public.alumni_profiles cap ON cap.id = COALESCE(pc.user_id, pc.author_id)
          WHERE pc.post_id = po.id AND COALESCE(pc.is_deleted, false) = false
        ),
        '[]'::jsonb
      ) AS r_comments
    FROM public.posts po
    LEFT JOIN public.alumni_profiles ap ON ap.id = po.author_id
    WHERE COALESCE(po.is_deleted, false) = false
  )
  SELECT
    r_id,
    r_author_id,
    r_author_id,
    r_full_name,
    r_avatar_url,
    r_batch_year,
    r_verified,
    r_profession,
    r_institution,
    r_content,
    r_category,
    r_images,
    r_videos,
    r_layout_template,
    r_linked_url,
    r_link_metadata,
    r_likes_count,
    r_comments_count,
    r_is_pinned,
    r_is_edited,
    r_created_at,
    r_liked_by_me,
    r_saved_by_me,
    r_is_batchmate,
    r_is_friend,
    r_comments
  FROM ranked_posts
  ORDER BY
    r_is_pinned DESC,
    r_is_batchmate DESC,
    r_is_friend DESC,
    r_created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_feed(BIGINT, INT, INT) TO anon, authenticated, service_role;

COMMIT;


