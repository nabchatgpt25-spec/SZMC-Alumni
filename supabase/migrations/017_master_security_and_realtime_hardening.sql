-- =============================================================================
-- MIGRATION 017: MASTER SECURITY, RLS, GRANTS, STORAGE & REALTIME HARDENING
-- Project: Shaheed Ziaur Rahman Medical College Alumni Network (SZMC Bogura)
-- Safe & Idempotent: Run directly in Supabase Dashboard -> SQL Editor
-- =============================================================================
-- Fixes addressed:
-- 1. Revokes dangerous TRUNCATE/TRIGGER/REFERENCES & anon write grants
-- 2. Restores missing UPDATE grants on messages & conversation_participants
-- 3. Drops all conflicting/duplicate legacy PERMISSIVE RLS policies causing OR-bypasses
--    (posts INSERT with_check:true, messages sender spoofing, private alumni_profiles,
--     unpublished gallery/notices, soft-deleted posts, verification_requests, etc.)
-- 4. Adds missing RLS policies on events, event_registrations, connections,
--    notifications (actor-verified insert), career_opportunities, mentorship tables
-- 5. Hardens SECURITY DEFINER functions (get_feed, unread_notifications, sync_post_counters)
--    with explicit search_path and auth.uid() IDOR protection
-- 6. Removes PII/sensitive tables (alumni_profiles, admin_doc_submissions, etc.)
--    from supabase_realtime publication to prevent column-level PII leaks
-- 7. Hardens storage.buckets limits/MIME types and removes loose storage.objects policies
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. HARDEN TABLE-LEVEL GRANTS (REVOKE TRUNCATE / TRIGGER / REFERENCES / ANON WRITES)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.%I FROM anon, authenticated;', r.tablename);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM anon;', r.tablename);
  END LOOP;
END $$;

-- Allow anonymous visitors to submit contact inquiries only (enforced by RLS WITH CHECK)
GRANT INSERT ON TABLE public.contact_inquiries TO anon;

-- Restore missing UPDATE grants for authenticated users on messaging tables
-- (Required by messages_update_sender and participants_update_own RLS policies)
GRANT SELECT, INSERT, UPDATE ON TABLE public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.conversation_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_message_settings TO authenticated;

-- Ensure authenticated users have appropriate DML privileges on social/community tables
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.posts,
  public.post_comments,
  public.post_likes,
  public.saved_posts,
  public.connections,
  public.notifications,
  public.blood_donors,
  public.blood_requests,
  public.blood_request_responses,
  public.gallery_albums,
  public.gallery_photos,
  public.career_opportunities,
  public.mentor_offers,
  public.mentorship_requests,
  public.events,
  public.event_registrations,
  public.verification_requests,
  public.admin_doc_submissions,
  public.peer_vouches,
  public.contact_inquiries
TO authenticated;

-- Public read-only tables for anon visitors
GRANT SELECT ON TABLE
  public.academic_stream_groups,
  public.app_feature_flags,
  public.batches,
  public.blood_requests,
  public.events,
  public.featured_alumni,
  public.gallery_albums,
  public.gallery_photos,
  public.hall_of_fame,
  public.official_notices,
  public.post_comments,
  public.post_likes,
  public.posts,
  public.site_settings
TO anon;

-- Keep internal/private tables inaccessible to anon
REVOKE ALL ON TABLE
  public.audit_logs,
  public.auth_rate_limits,
  public.admin_doc_submissions,
  public.connections,
  public.conversations,
  public.conversation_participants,
  public.messages,
  public.notifications,
  public.peer_vouches,
  public.saved_posts,
  public.user_message_settings,
  public.verification_requests
FROM anon;

-- Revoke excessive grants on public_alumni_directory if it exists as a table/view
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'public_alumni_directory'
  ) THEN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.public_alumni_directory FROM anon, authenticated;
    GRANT SELECT ON public.public_alumni_directory TO anon, authenticated;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. DROP ALL CONFLICTING & DUPLICATE LEGACY RLS POLICIES ON PUBLIC TABLES
-- -----------------------------------------------------------------------------

-- academic_stream_groups
DROP POLICY IF EXISTS "Stream Groups: Public Read" ON public.academic_stream_groups;
DROP POLICY IF EXISTS "academic_stream_groups_select_all" ON public.academic_stream_groups;
CREATE POLICY "academic_stream_groups_select_active_or_admin"
  ON public.academic_stream_groups FOR SELECT TO anon, authenticated
  USING (is_active = true OR (auth.uid() IS NOT NULL AND public.is_admin_or_mod()));

-- admin_doc_submissions
DROP POLICY IF EXISTS "Doc Submissions: Read" ON public.admin_doc_submissions;

-- alumni_profiles (remove OR-bypass policies: Profiles: Insert, Profiles: Public View, Profiles: Admin Delete, etc.)
DROP POLICY IF EXISTS "Profiles: Admin Delete" ON public.alumni_profiles;
DROP POLICY IF EXISTS "Profiles: Insert" ON public.alumni_profiles;
DROP POLICY IF EXISTS "Profiles: Owner Update" ON public.alumni_profiles;
DROP POLICY IF EXISTS "Profiles: Public View" ON public.alumni_profiles;
DROP POLICY IF EXISTS "Public can view active profiles" ON public.alumni_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.alumni_profiles;
DROP POLICY IF EXISTS "alumni_profiles_public_read" ON public.alumni_profiles;
DROP POLICY IF EXISTS "alumni_profiles_select_authenticated" ON public.alumni_profiles;
DROP POLICY IF EXISTS "alumni_profiles_select_anon" ON public.alumni_profiles;
DROP POLICY IF EXISTS "alumni_profiles_insert_own" ON public.alumni_profiles;
DROP POLICY IF EXISTS "alumni_profiles_update_own_or_admin" ON public.alumni_profiles;
DROP POLICY IF EXISTS "alumni_profiles_delete_admin" ON public.alumni_profiles;
DROP POLICY IF EXISTS "alumni_profiles_delete_own_or_admin" ON public.alumni_profiles;

CREATE POLICY "alumni_profiles_select_anon"
  ON public.alumni_profiles FOR SELECT TO anon
  USING (is_public = true AND COALESCE(account_status, 'active') = 'active');

CREATE POLICY "alumni_profiles_select_authenticated"
  ON public.alumni_profiles FOR SELECT TO authenticated
  USING (
    (is_public = true AND COALESCE(account_status, 'active') = 'active')
    OR auth_user_id = auth.uid()
    OR public.is_admin_or_mod()
  );

CREATE POLICY "alumni_profiles_insert_own"
  ON public.alumni_profiles FOR INSERT TO authenticated
  WITH CHECK (
    (
      auth_user_id = auth.uid()
      AND role = 'member'::user_role
      AND verification_status = 'unverified'::verification_status
    )
    OR public.is_admin()
  );

CREATE POLICY "alumni_profiles_update_own_or_admin"
  ON public.alumni_profiles FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid() OR public.is_admin_or_mod())
  WITH CHECK (auth_user_id = auth.uid() OR public.is_admin_or_mod());

CREATE POLICY "alumni_profiles_delete_own_or_admin"
  ON public.alumni_profiles FOR DELETE TO authenticated
  USING (auth_user_id = auth.uid() OR public.is_admin());

-- audit_logs (deduplicate)
DROP POLICY IF EXISTS "Audit Logs: Admin Read" ON public.audit_logs;

-- batches (deduplicate)
DROP POLICY IF EXISTS "Batches: Public Read" ON public.batches;
DROP POLICY IF EXISTS "batches_public_read" ON public.batches;

-- blood_donors (deduplicate)
DROP POLICY IF EXISTS "Blood Donors: Read" ON public.blood_donors;

-- blood_requests (deduplicate 9 policies -> 4 clean policies)
DROP POLICY IF EXISTS "Blood Requests: Author Or Admin Update" ON public.blood_requests;
DROP POLICY IF EXISTS "Blood Requests: Public Read" ON public.blood_requests;
DROP POLICY IF EXISTS "Blood Requests: Read Active" ON public.blood_requests;
DROP POLICY IF EXISTS "Public view blood requests" ON public.blood_requests;
DROP POLICY IF EXISTS "blood_requests_public_read" ON public.blood_requests;
DROP POLICY IF EXISTS "blood_requests_select_authenticated" ON public.blood_requests;

CREATE POLICY "blood_requests_select_visible"
  ON public.blood_requests FOR SELECT TO anon, authenticated
  USING (true);

-- blood_request_responses (fix using:true leak so only donor, requester, or admin/mod can read)
DROP POLICY IF EXISTS "Blood Responses: Insert" ON public.blood_request_responses;
DROP POLICY IF EXISTS "Blood Responses: Read" ON public.blood_request_responses;
DROP POLICY IF EXISTS "blood_responses_select_authenticated" ON public.blood_request_responses;

CREATE POLICY "blood_responses_select_authorized"
  ON public.blood_request_responses FOR SELECT TO authenticated
  USING (
    donor_user_id = public.current_profile_id()
    OR public.is_admin_or_mod()
    OR EXISTS (
      SELECT 1 FROM public.blood_requests br
      WHERE br.id = blood_request_responses.request_id
        AND br.requester_id = public.current_profile_id()
    )
  );

-- contact_inquiries (deduplicate legacy public policies)
DROP POLICY IF EXISTS "Inquiries: Admin Or Sender Read" ON public.contact_inquiries;
DROP POLICY IF EXISTS "Inquiries: Admin Update" ON public.contact_inquiries;

-- conversations & conversation_participants (deduplicate)
DROP POLICY IF EXISTS "Participants can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "participants_insert_own" ON public.conversation_participants;

-- messages (CRITICAL: remove sender-spoofing policy & duplicate SELECTs)
DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;
DROP POLICY IF EXISTS "messages_select_in_conversation" ON public.messages;
DROP POLICY IF EXISTS "messages_select_participant" ON public.messages;

CREATE POLICY "messages_select_participant"
  ON public.messages FOR SELECT TO authenticated
  USING (
    public.is_conversation_participant(conversation_id)
    OR public.is_current_user_super_admin()
  );

-- gallery_albums (fix unpublished albums leak)
DROP POLICY IF EXISTS "Albums: Public Read" ON public.gallery_albums;
DROP POLICY IF EXISTS "Gallery: Read All" ON public.gallery_albums;
DROP POLICY IF EXISTS "gallery_albums_public_read" ON public.gallery_albums;
DROP POLICY IF EXISTS "gallery_albums_delete_mod" ON public.gallery_albums;

CREATE POLICY "gallery_albums_delete_creator_or_mod"
  ON public.gallery_albums FOR DELETE TO authenticated
  USING (created_by_id = public.current_profile_id() OR public.is_admin_or_mod());

-- gallery_photos (fix unapproved photos leak)
DROP POLICY IF EXISTS "Photos: Admin Delete" ON public.gallery_photos;
DROP POLICY IF EXISTS "Photos: Public Read" ON public.gallery_photos;
DROP POLICY IF EXISTS "gallery_photos_public_read" ON public.gallery_photos;

-- official_notices (fix unpublished draft notices leak)
DROP POLICY IF EXISTS "Notices: Public Read" ON public.official_notices;
DROP POLICY IF EXISTS "official_notices_public_read" ON public.official_notices;

-- peer_vouches (deduplicate)
DROP POLICY IF EXISTS "Peer Vouches: Read" ON public.peer_vouches;

-- post_comments (deduplicate)
DROP POLICY IF EXISTS "Comments: Authenticated Insert" ON public.post_comments;
DROP POLICY IF EXISTS "Comments: Author Or Admin Delete" ON public.post_comments;
DROP POLICY IF EXISTS "Comments: Public Read" ON public.post_comments;
DROP POLICY IF EXISTS "comments_select" ON public.post_comments;

-- post_likes (deduplicate)
DROP POLICY IF EXISTS "Likes: Authenticated Insert" ON public.post_likes;
DROP POLICY IF EXISTS "Likes: Author Delete" ON public.post_likes;
DROP POLICY IF EXISTS "Likes: Public Read" ON public.post_likes;
DROP POLICY IF EXISTS "likes_select" ON public.post_likes;
DROP POLICY IF EXISTS "post_likes_select_authenticated" ON public.post_likes;

CREATE POLICY "post_likes_select_public"
  ON public.post_likes FOR SELECT TO anon, authenticated
  USING (true);

-- posts (CRITICAL: remove Authenticated can create posts with_check:true & posts_select_all)
DROP POLICY IF EXISTS "Authenticated can create posts" ON public.posts;
DROP POLICY IF EXISTS "Authors can update their own posts" ON public.posts;
DROP POLICY IF EXISTS "Posts: Author Or Admin Delete" ON public.posts;
DROP POLICY IF EXISTS "Posts: Author Or Admin Update" ON public.posts;
DROP POLICY IF EXISTS "Posts: Public Read" ON public.posts;
DROP POLICY IF EXISTS "Public can view active posts" ON public.posts;
DROP POLICY IF EXISTS "Users can create posts" ON public.posts;
DROP POLICY IF EXISTS "posts_delete_own_or_mod" ON public.posts;
DROP POLICY IF EXISTS "posts_insert_own" ON public.posts;
DROP POLICY IF EXISTS "posts_insert_verified_author" ON public.posts;
DROP POLICY IF EXISTS "posts_public_read" ON public.posts;
DROP POLICY IF EXISTS "posts_select_all" ON public.posts;
DROP POLICY IF EXISTS "posts_select_visible" ON public.posts;
DROP POLICY IF EXISTS "posts_update_own_or_mod" ON public.posts;

CREATE POLICY "posts_select_visible"
  ON public.posts FOR SELECT TO anon, authenticated
  USING (
    COALESCE(is_deleted, false) = false
    OR (
      auth.uid() IS NOT NULL
      AND (author_id = public.current_profile_id() OR public.is_admin_or_mod())
    )
  );

CREATE POLICY "posts_insert_own"
  ON public.posts FOR INSERT TO authenticated
  WITH CHECK (
    (author_id = public.current_profile_id() OR public.is_admin_or_mod())
    AND COALESCE(is_deleted, false) = false
  );

CREATE POLICY "posts_update_own_or_mod"
  ON public.posts FOR UPDATE TO authenticated
  USING (author_id = public.current_profile_id() OR public.is_admin_or_mod())
  WITH CHECK (author_id = public.current_profile_id() OR public.is_admin_or_mod());

CREATE POLICY "posts_delete_own_or_mod"
  ON public.posts FOR DELETE TO authenticated
  USING (author_id = public.current_profile_id() OR public.is_admin_or_mod());

-- saved_posts (deduplicate)
DROP POLICY IF EXISTS "Saved Posts: Owner Delete" ON public.saved_posts;
DROP POLICY IF EXISTS "Saved Posts: Owner Insert" ON public.saved_posts;
DROP POLICY IF EXISTS "Saved Posts: Owner Select" ON public.saved_posts;

-- user_message_settings (deduplicate dual-identity policies)
DROP POLICY IF EXISTS "settings_insert_own" ON public.user_message_settings;
DROP POLICY IF EXISTS "settings_select_own" ON public.user_message_settings;
DROP POLICY IF EXISTS "settings_update_own" ON public.user_message_settings;
DROP POLICY IF EXISTS "users_insert_own_message_settings" ON public.user_message_settings;
DROP POLICY IF EXISTS "users_read_own_message_settings" ON public.user_message_settings;
DROP POLICY IF EXISTS "users_update_own_message_settings" ON public.user_message_settings;

CREATE POLICY "user_message_settings_select_own"
  ON public.user_message_settings FOR SELECT TO authenticated
  USING (
    profile_id = public.get_current_profile_id()
    OR profile_id = public.current_profile_id()
    OR public.is_current_user_super_admin()
  );

CREATE POLICY "user_message_settings_insert_own"
  ON public.user_message_settings FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = public.get_current_profile_id()
    OR profile_id = public.current_profile_id()
  );

CREATE POLICY "user_message_settings_update_own"
  ON public.user_message_settings FOR UPDATE TO authenticated
  USING (
    profile_id = public.get_current_profile_id()
    OR profile_id = public.current_profile_id()
  )
  WITH CHECK (
    profile_id = public.get_current_profile_id()
    OR profile_id = public.current_profile_id()
  );

-- verification_requests (remove loose public policy)
DROP POLICY IF EXISTS "Verifications: Read" ON public.verification_requests;

-- notifications (deduplicate & allow authenticated actors to trigger notifications safely)
DROP POLICY IF EXISTS "Notifications: Owner Read" ON public.notifications;
DROP POLICY IF EXISTS "Notifications: Owner Update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_admin_only" ON public.notifications;

CREATE POLICY "notifications_insert_authenticated_actor"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_mod()
    OR (
      actor_id = public.current_profile_id()
      AND recipient_id <> public.current_profile_id()
    )
  );

-- -----------------------------------------------------------------------------
-- 3. ADD MISSING RLS POLICIES (CONNECTIONS, EVENTS, CAREERS, MENTORSHIP)
-- -----------------------------------------------------------------------------

-- connections: allow members to manage their own connections (previously admin-only!)
DROP POLICY IF EXISTS "connections_admin_only" ON public.connections;
DROP POLICY IF EXISTS "connections_all_access" ON public.connections;

CREATE POLICY "connections_select_own_or_mod"
  ON public.connections FOR SELECT TO authenticated
  USING (
    user_id = public.current_profile_id()
    OR friend_id = public.current_profile_id()
    OR public.is_admin_or_mod()
  );

CREATE POLICY "connections_insert_own"
  ON public.connections FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.current_profile_id()
    AND user_id <> friend_id
  );

CREATE POLICY "connections_update_participant_or_mod"
  ON public.connections FOR UPDATE TO authenticated
  USING (
    user_id = public.current_profile_id()
    OR friend_id = public.current_profile_id()
    OR public.is_admin_or_mod()
  )
  WITH CHECK (
    user_id = public.current_profile_id()
    OR friend_id = public.current_profile_id()
    OR public.is_admin_or_mod()
  );

CREATE POLICY "connections_delete_participant_or_mod"
  ON public.connections FOR DELETE TO authenticated
  USING (
    user_id = public.current_profile_id()
    OR friend_id = public.current_profile_id()
    OR public.is_admin_or_mod()
  );

-- career_opportunities: allow authenticated alumni to post & owners/admins to update/delete
DROP POLICY IF EXISTS "career_opportunities_insert_own" ON public.career_opportunities;
DROP POLICY IF EXISTS "career_opportunities_update_own_or_mod" ON public.career_opportunities;
DROP POLICY IF EXISTS "career_opportunities_delete_own_or_mod" ON public.career_opportunities;

CREATE POLICY "career_opportunities_insert_own"
  ON public.career_opportunities FOR INSERT TO authenticated
  WITH CHECK (poster_id = public.current_profile_id() OR public.is_admin_or_mod());

CREATE POLICY "career_opportunities_update_own_or_mod"
  ON public.career_opportunities FOR UPDATE TO authenticated
  USING (poster_id = public.current_profile_id() OR public.is_admin_or_mod())
  WITH CHECK (poster_id = public.current_profile_id() OR public.is_admin_or_mod());

CREATE POLICY "career_opportunities_delete_own_or_mod"
  ON public.career_opportunities FOR DELETE TO authenticated
  USING (poster_id = public.current_profile_id() OR public.is_admin_or_mod());

-- mentor_offers: allow authenticated alumni to offer mentorship & manage own offer
DROP POLICY IF EXISTS "mentor_offers_insert_own" ON public.mentor_offers;
DROP POLICY IF EXISTS "mentor_offers_update_own_or_mod" ON public.mentor_offers;
DROP POLICY IF EXISTS "mentor_offers_delete_own_or_mod" ON public.mentor_offers;

CREATE POLICY "mentor_offers_insert_own"
  ON public.mentor_offers FOR INSERT TO authenticated
  WITH CHECK (user_id = public.current_profile_id() OR public.is_admin_or_mod());

CREATE POLICY "mentor_offers_update_own_or_mod"
  ON public.mentor_offers FOR UPDATE TO authenticated
  USING (user_id = public.current_profile_id() OR public.is_admin_or_mod())
  WITH CHECK (user_id = public.current_profile_id() OR public.is_admin_or_mod());

CREATE POLICY "mentor_offers_delete_own_or_mod"
  ON public.mentor_offers FOR DELETE TO authenticated
  USING (user_id = public.current_profile_id() OR public.is_admin_or_mod());

-- mentorship_requests: allow authenticated alumni to ask & manage own questions
DROP POLICY IF EXISTS "mentorship_requests_insert_own" ON public.mentorship_requests;
DROP POLICY IF EXISTS "mentorship_requests_update_own_or_mod" ON public.mentorship_requests;
DROP POLICY IF EXISTS "mentorship_requests_delete_own_or_mod" ON public.mentorship_requests;

CREATE POLICY "mentorship_requests_insert_own"
  ON public.mentorship_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = public.current_profile_id() OR public.is_admin_or_mod());

CREATE POLICY "mentorship_requests_update_own_or_mod"
  ON public.mentorship_requests FOR UPDATE TO authenticated
  USING (user_id = public.current_profile_id() OR public.is_admin_or_mod())
  WITH CHECK (user_id = public.current_profile_id() OR public.is_admin_or_mod());

CREATE POLICY "mentorship_requests_delete_own_or_mod"
  ON public.mentorship_requests FOR DELETE TO authenticated
  USING (user_id = public.current_profile_id() OR public.is_admin_or_mod());

-- events & event_registrations (previously had 0 policies with RLS enabled!)
DROP POLICY IF EXISTS "events_select_public" ON public.events;
DROP POLICY IF EXISTS "events_admin_write" ON public.events;

CREATE POLICY "events_select_public"
  ON public.events FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "events_admin_write"
  ON public.events FOR ALL TO authenticated
  USING (public.is_admin_or_mod())
  WITH CHECK (public.is_admin_or_mod());

-- Dynamically inspect owner column on event_registrations (user_id vs profile_id vs alumni_id)
DO $$
DECLARE
  v_owner_col TEXT;
BEGIN
  SELECT column_name INTO v_owner_col
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'event_registrations'
    AND column_name IN ('user_id', 'profile_id', 'alumni_id')
  ORDER BY CASE column_name WHEN 'user_id' THEN 1 WHEN 'profile_id' THEN 2 ELSE 3 END
  LIMIT 1;

  DROP POLICY IF EXISTS "event_registrations_select_own_or_mod" ON public.event_registrations;
  DROP POLICY IF EXISTS "event_registrations_insert_own" ON public.event_registrations;
  DROP POLICY IF EXISTS "event_registrations_update_own_or_mod" ON public.event_registrations;
  DROP POLICY IF EXISTS "event_registrations_delete_own_or_mod" ON public.event_registrations;

  IF v_owner_col IS NOT NULL THEN
    EXECUTE format(
      'CREATE POLICY "event_registrations_select_own_or_mod" ON public.event_registrations FOR SELECT TO authenticated USING (%I = public.current_profile_id() OR public.is_admin_or_mod());',
      v_owner_col
    );
    EXECUTE format(
      'CREATE POLICY "event_registrations_insert_own" ON public.event_registrations FOR INSERT TO authenticated WITH CHECK (%I = public.current_profile_id() OR public.is_admin_or_mod());',
      v_owner_col
    );
    EXECUTE format(
      'CREATE POLICY "event_registrations_update_own_or_mod" ON public.event_registrations FOR UPDATE TO authenticated USING (%I = public.current_profile_id() OR public.is_admin_or_mod()) WITH CHECK (%I = public.current_profile_id() OR public.is_admin_or_mod());',
      v_owner_col, v_owner_col
    );
    EXECUTE format(
      'CREATE POLICY "event_registrations_delete_own_or_mod" ON public.event_registrations FOR DELETE TO authenticated USING (%I = public.current_profile_id() OR public.is_admin_or_mod());',
      v_owner_col
    );
  ELSE
    CREATE POLICY "event_registrations_admin_only"
      ON public.event_registrations FOR ALL TO authenticated
      USING (public.is_admin_or_mod())
      WITH CHECK (public.is_admin_or_mod());
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. HARDEN SECURITY DEFINER FUNCTIONS (search_path + IDOR DEFENSE)
-- -----------------------------------------------------------------------------

-- Fix search_path on sync_post_counters
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sync_post_counters'
  ) THEN
    ALTER FUNCTION public.sync_post_counters() SET search_path = public, pg_catalog;
  END IF;
END $$;

-- Fix get_feed: set immutable search_path AND bind caller identity strictly to auth.uid()
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
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller_id BIGINT := NULL;
  v_my_batch INT := NULL;
  v_safe_limit INT := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
  v_safe_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  -- Always derive caller identity from authenticated JWT (prevents IDOR spoofing)
  IF auth.uid() IS NOT NULL THEN
    SELECT p.id INTO v_caller_id
    FROM public.alumni_profiles p
    WHERE p.auth_user_id = auth.uid()
    LIMIT 1;
  END IF;

  -- Allow service_role / admins to optionally query on behalf of p_user_id
  IF v_caller_id IS NULL AND public.is_internal_or_service_role() THEN
    v_caller_id := p_user_id;
  END IF;

  IF v_caller_id IS NOT NULL THEN
    SELECT p.batch_year INTO v_my_batch
    FROM public.alumni_profiles p
    WHERE p.id = v_caller_id
    LIMIT 1;
  END IF;

  RETURN QUERY
  WITH my_friends AS (
    SELECT c.friend_id AS fid
    FROM public.connections c
    WHERE v_caller_id IS NOT NULL AND c.user_id = v_caller_id AND c.status = 'accepted'
    UNION
    SELECT c.user_id AS fid
    FROM public.connections c
    WHERE v_caller_id IS NOT NULL AND c.friend_id = v_caller_id AND c.status = 'accepted'
  ),
  ranked_posts AS (
    SELECT
      po.id AS r_id,
      po.author_id AS r_author_id,
      COALESCE(ap.full_name, 'SZMC Alumnus')::TEXT AS r_full_name,
      COALESCE(ap.avatar_url, '/assets/aistudio/images__1__2778177d.png')::TEXT AS r_avatar_url,
      ap.batch_year AS r_batch_year,
      (ap.verification_status = 'verified') AS r_verified,
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
      (
        v_caller_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.post_likes pl
          WHERE pl.post_id = po.id AND pl.user_id = v_caller_id
        )
      ) AS r_liked_by_me,
      (
        v_caller_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.saved_posts sp
          WHERE sp.post_id = po.id AND sp.user_id = v_caller_id
        )
      ) AS r_saved_by_me,
      (
        v_caller_id IS NOT NULL AND
        v_my_batch IS NOT NULL AND
        ap.batch_year IS NOT NULL AND
        ap.batch_year = v_my_batch AND
        ap.id != v_caller_id
      ) AS r_is_batchmate,
      (
        v_caller_id IS NOT NULL AND ap.id IN (SELECT fid FROM my_friends)
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
    WHERE COALESCE(po.is_deleted, FALSE) = FALSE
    ORDER BY
      COALESCE(po.is_pinned, FALSE) DESC,
      (CASE WHEN v_caller_id IS NOT NULL AND v_my_batch IS NOT NULL AND ap.batch_year = v_my_batch AND ap.id != v_caller_id THEN 1 ELSE 0 END) DESC,
      (CASE WHEN v_caller_id IS NOT NULL AND ap.id IN (SELECT fid FROM my_friends) THEN 1 ELSE 0 END) DESC,
      (COALESCE(po.likes_count, 0) * 2 + COALESCE(po.comments_count, 0) * 3) DESC,
      po.created_at DESC
    LIMIT v_safe_limit
    OFFSET v_safe_offset
  )
  SELECT
    r_id, r_author_id, r_author_id, r_full_name, r_avatar_url, r_batch_year,
    r_verified, r_profession, r_institution, r_content, r_category,
    r_images, r_videos, r_layout_template, r_linked_url, r_link_metadata,
    r_likes_count, r_comments_count, r_is_pinned, r_is_edited, r_created_at,
    r_liked_by_me, r_saved_by_me, r_is_batchmate, r_is_friend, r_comments
  FROM ranked_posts;
END;
$$;

-- Fix unread_notifications: set immutable search_path, revoke anon, enforce auth.uid() IDOR protection
CREATE OR REPLACE FUNCTION public.unread_notifications(
  p_user_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  recipient_id BIGINT,
  actor_id BIGINT,
  actor_name TEXT,
  actor_avatar TEXT,
  type TEXT,
  title TEXT,
  message TEXT,
  unread BOOLEAN,
  target_route TEXT,
  post_id BIGINT,
  blood_request_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller_id BIGINT := NULL;
BEGIN
  -- Strictly resolve caller from auth.uid(); ignore spoofed p_user_id unless service_role
  IF auth.uid() IS NOT NULL THEN
    SELECT p.id INTO v_caller_id
    FROM public.alumni_profiles p
    WHERE p.auth_user_id = auth.uid()
    LIMIT 1;
  ELSIF public.is_internal_or_service_role() THEN
    v_caller_id := p_user_id;
  END IF;

  IF v_caller_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    n.id,
    n.recipient_id,
    n.actor_id,
    COALESCE(ap.full_name, 'SZMC Alumnus')::TEXT AS actor_name,
    COALESCE(ap.avatar_url, '/assets/aistudio/images__1__2778177d.png')::TEXT AS actor_avatar,
    n.type::TEXT,
    n.title,
    n.message,
    n.unread,
    n.target_route,
    n.post_id,
    n.blood_request_id,
    n.created_at
  FROM public.notifications n
  LEFT JOIN public.alumni_profiles ap ON ap.id = n.actor_id
  WHERE n.recipient_id = v_caller_id
    AND n.unread = TRUE
  ORDER BY n.created_at DESC
  LIMIT 100;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unread_notifications(BIGINT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.unread_notifications(BIGINT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. REMOVE SENSITIVE / PII TABLES FROM SUPABASE REALTIME PUBLICATION
-- -----------------------------------------------------------------------------
-- Realtime postgres_changes broadcasts full rows (bypassing column-level SELECT revokes).
-- Removing alumni_profiles & admin/private tables eliminates PII broadcast leaks.
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'alumni_profiles',
    'admin_doc_submissions',
    'verification_requests',
    'peer_vouches',
    'user_message_settings',
    'saved_posts'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I;', tbl);
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 6. HARDEN STORAGE BUCKETS & DROP DUPLICATE / LOOSE STORAGE POLICIES
-- -----------------------------------------------------------------------------

-- Tighten unrestricted 'posts' bucket
UPDATE storage.buckets
SET
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
WHERE id = 'posts';

-- Align 'post-media' bucket with frontend video upload support (50 MB + mp4/webm/mov/ogg + images)
UPDATE storage.buckets
SET
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg'
  ]
WHERE id = 'post-media';

-- Drop loose duplicate storage.objects INSERT policies lacking owner=auth.uid() checks
DROP POLICY IF EXISTS "Auth Upload Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload Gallery" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload Media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload Post Media" ON storage.objects;
DROP POLICY IF EXISTS "Private Upload Verification" ON storage.objects;
DROP POLICY IF EXISTS "Storage: Avatars Authenticated Insert" ON storage.objects;
DROP POLICY IF EXISTS "Storage: Gallery Authenticated Insert" ON storage.objects;
DROP POLICY IF EXISTS "Storage: Post Media Authenticated Insert" ON storage.objects;

-- Drop redundant duplicate SELECT policies on storage.objects
DROP POLICY IF EXISTS "Public Post Media Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Read Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public Read Gallery" ON storage.objects;
DROP POLICY IF EXISTS "Public Read Media" ON storage.objects;
DROP POLICY IF EXISTS "Storage: Avatars Public Read" ON storage.objects;
DROP POLICY IF EXISTS "Storage: Gallery Public Read" ON storage.objects;
DROP POLICY IF EXISTS "Storage: Post Media Public Read" ON storage.objects;
DROP POLICY IF EXISTS "public_read_gallery" ON storage.objects;

-- Ensure clean owner-enforced upload policy for gallery and posts buckets
DROP POLICY IF EXISTS "Gallery: Authenticated Upload" ON storage.objects;
CREATE POLICY "Gallery: Authenticated Upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'gallery' AND owner = auth.uid());

DROP POLICY IF EXISTS "Posts Bucket: Public Access" ON storage.objects;
CREATE POLICY "Posts Bucket: Public Access"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'posts');

DROP POLICY IF EXISTS "Posts Bucket: Authenticated Upload" ON storage.objects;
CREATE POLICY "Posts Bucket: Authenticated Upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'posts' AND owner = auth.uid());

DROP POLICY IF EXISTS "Posts Bucket: Authenticated Delete" ON storage.objects;
CREATE POLICY "Posts Bucket: Authenticated Delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'posts' AND (owner = auth.uid() OR public.is_admin_or_mod()));

COMMIT;
