-- =============================================================================
-- Migration 011: FIX PERMISSIONS FOR SECURITY HELPER FUNCTIONS ON PUBLIC/ANON
-- Fixes PostgreSQL error 42501: "permission denied for function current_profile_id"
-- When anonymous/public clients query tables with RLS (e.g. posts, batch directory)
-- =============================================================================

BEGIN;

SET search_path = public, extensions;

-- 1. Grant EXECUTE on safe identity and role helper functions to anon, authenticated & service_role
-- These functions evaluate auth.uid() and safely return NULL / FALSE for unauthenticated/anon visitors.
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_mod() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_verified_alumnus() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_batch_year() TO anon, authenticated, service_role;

-- 2. Optimize posts RLS select policy so anon only checks is_deleted = FALSE without unnecessary function calls
DROP POLICY IF EXISTS "posts_select_visible" ON public.posts;
CREATE POLICY "posts_select_visible"
  ON public.posts FOR SELECT
  TO anon, authenticated
  USING (
    is_deleted = FALSE
    OR (auth.uid() IS NOT NULL AND (author_id = public.current_profile_id() OR public.is_admin_or_mod()))
  );

-- 3. Optimize post_comments RLS select policy
DROP POLICY IF EXISTS "post_comments_select_visible" ON public.post_comments;
CREATE POLICY "post_comments_select_visible"
  ON public.post_comments FOR SELECT
  TO anon, authenticated
  USING (
    is_deleted = FALSE
    OR (auth.uid() IS NOT NULL AND (user_id = public.current_profile_id() OR public.is_admin_or_mod()))
  );

COMMIT;
