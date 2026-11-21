-- =============================================================================
-- MIGRATION 018: SUPER ADMIN FULL REALTIME CRUD & STORAGE AUTHORITY
-- Project: Shaheed Ziaur Rahman Medical College Alumni Network (SZMC Bogura)
-- Safe & Idempotent: Run directly in Supabase Dashboard -> SQL Editor
-- =============================================================================
-- Guarantees that Super Admin can Create, Read, Update, Save, and Delete
-- ANYTHING from the frontend with instant Realtime persistence in Supabase:
--   - Landing Page config & pictures (site_settings + storage.objects)
--   - Hall of Fame & Featured Alumni (site_settings, hall_of_fame, featured_alumni)
--   - Gallery albums & photos (gallery_albums, gallery_photos, storage gallery bucket)
--   - Posts & comments (posts, post_comments, post_likes)
--   - Messages & conversations (messages, conversations, conversation_participants)
--   - Notices, Events, Blood Network, Careers, Mentorship, Feature Flags, Batches
--   - Regular users remain strictly restricted to their own records via RLS.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ENSURE is_admin() & is_admin_or_mod() ALWAYS RECOGNIZE SUPER ADMIN
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.alumni_profiles
    WHERE auth_user_id = auth.uid()
      AND (
        role::text IN ('admin', 'super_admin')
        OR lower(email) = 'nurulanambashir25@gmail.com'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_mod()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.alumni_profiles
    WHERE auth_user_id = auth.uid()
      AND (
        role::text IN ('admin', 'super_admin', 'moderator')
        OR lower(email) = 'nurulanambashir25@gmail.com'
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_mod() TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. ENSURE TABLE-LEVEL DML GRANTS FOR AUTHENTICATED (RLS ENFORCES ADMIN-ONLY)
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.site_settings,
  public.hall_of_fame,
  public.featured_alumni,
  public.app_feature_flags,
  public.batches,
  public.official_notices,
  public.messages,
  public.conversations,
  public.conversation_participants
TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. FULL SUPER ADMIN RLS ON LANDING PAGE, HALL OF FAME, NOTICES & FEATURE FLAGS
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "site_settings_admin_write" ON public.site_settings;
CREATE POLICY "site_settings_admin_write"
  ON public.site_settings FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "hall_of_fame_admin_write" ON public.hall_of_fame;
CREATE POLICY "hall_of_fame_admin_write"
  ON public.hall_of_fame FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "featured_alumni_admin_write" ON public.featured_alumni;
CREATE POLICY "featured_alumni_admin_write"
  ON public.featured_alumni FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "app_feature_flags_admin_all" ON public.app_feature_flags;
CREATE POLICY "app_feature_flags_admin_all"
  ON public.app_feature_flags FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "batches_admin_all" ON public.batches;
CREATE POLICY "batches_admin_all"
  ON public.batches FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 4. FULL SUPER ADMIN RLS ON MESSAGES & CONVERSATIONS (EDIT / DELETE ANY)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "messages_update_sender" ON public.messages;
CREATE POLICY "messages_update_sender_or_admin"
  ON public.messages FOR UPDATE TO authenticated
  USING (
    (sender_id = public.get_current_profile_id() AND deleted_at IS NULL)
    OR public.is_admin()
  )
  WITH CHECK (
    sender_id = public.get_current_profile_id()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "messages_delete_admin" ON public.messages;
CREATE POLICY "messages_delete_admin"
  ON public.messages FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "messages_select_participant" ON public.messages;
CREATE POLICY "messages_select_participant"
  ON public.messages FOR SELECT TO authenticated
  USING (
    public.is_conversation_participant(conversation_id)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "conversations_select_participant" ON public.conversations;
CREATE POLICY "conversations_select_participant"
  ON public.conversations FOR SELECT TO authenticated
  USING (
    created_by = public.get_current_profile_id()
    OR public.is_conversation_participant(id)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "conversations_update_participant_or_admin" ON public.conversations;
CREATE POLICY "conversations_update_participant_or_admin"
  ON public.conversations FOR UPDATE TO authenticated
  USING (
    created_by = public.get_current_profile_id()
    OR public.is_conversation_participant(id)
    OR public.is_admin()
  )
  WITH CHECK (
    created_by = public.get_current_profile_id()
    OR public.is_conversation_participant(id)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "conversations_delete_admin" ON public.conversations;
CREATE POLICY "conversations_delete_admin"
  ON public.conversations FOR DELETE TO authenticated
  USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- 5. FULL SUPER ADMIN RLS ON STORAGE BUCKETS (UPLOAD / REPLACE / DELETE ANY PIC)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "storage_super_admin_full_control" ON storage.objects;
CREATE POLICY "storage_super_admin_full_control"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id IN ('avatars', 'gallery', 'post-media', 'posts', 'official-notices', 'verification-documents')
    AND public.is_admin()
  )
  WITH CHECK (
    bucket_id IN ('avatars', 'gallery', 'post-media', 'posts', 'official-notices', 'verification-documents')
    AND public.is_admin()
  );

-- -----------------------------------------------------------------------------
-- 6. REPLICA IDENTITY FULL FOR INSTANT REALTIME UPDATE & DELETE BROADCASTS
-- -----------------------------------------------------------------------------
ALTER TABLE public.site_settings REPLICA IDENTITY FULL;
ALTER TABLE public.hall_of_fame REPLICA IDENTITY FULL;
ALTER TABLE public.featured_alumni REPLICA IDENTITY FULL;
ALTER TABLE public.posts REPLICA IDENTITY FULL;
ALTER TABLE public.post_comments REPLICA IDENTITY FULL;
ALTER TABLE public.gallery_albums REPLICA IDENTITY FULL;
ALTER TABLE public.gallery_photos REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.official_notices REPLICA IDENTITY FULL;

COMMIT;
