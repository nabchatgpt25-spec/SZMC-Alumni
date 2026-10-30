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

DROP POLICY IF EXISTS "Blood Requests: Read Active" ON public.blood_requests;
CREATE POLICY "Blood Requests: Read Active" ON public.blood_requests FOR SELECT TO anon, authenticated
USING (true);

COMMIT;
