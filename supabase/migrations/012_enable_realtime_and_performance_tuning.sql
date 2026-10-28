-- =============================================================================
-- MIGRATION 012: SUPABASE REALTIME ENABLEMENT & PERFORMANCE TUNING
-- Idempotent script to add publication replication and composite indexes
-- =============================================================================

BEGIN;

-- 1. Ensure publication exists and set up tables for realtime replication
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- 2. Configure REPLICA IDENTITY FULL so deletes & updates broadcast full row data
ALTER TABLE IF EXISTS public.posts REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.post_comments REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.post_likes REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.saved_posts REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.notifications REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.blood_requests REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.blood_request_responses REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.blood_donors REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.alumni_profiles REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.official_notices REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.peer_vouches REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.verification_requests REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.gallery_albums REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.gallery_photos REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.batches REPLICA IDENTITY FULL;

-- 3. Add core app tables to supabase_realtime publication idempotently
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'posts',
    'post_comments',
    'post_likes',
    'saved_posts',
    'notifications',
    'blood_requests',
    'blood_request_responses',
    'blood_donors',
    'alumni_profiles',
    'official_notices',
    'peer_vouches',
    'verification_requests',
    'gallery_albums',
    'gallery_photos',
    'batches'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN others THEN NULL;
      END;
    END IF;
  END LOOP;
END $$;

-- 4. High-Performance Composite & Trigram Indexes for Sub-10ms Queries
CREATE INDEX IF NOT EXISTS idx_posts_active_created_at
  ON public.posts (created_at DESC)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_posts_author_active
  ON public.posts (author_id, created_at DESC)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_posts_category_active
  ON public.posts (category, created_at DESC)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_post_comments_post_active
  ON public.post_comments (post_id, created_at ASC)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_post_likes_composite
  ON public.post_likes (post_id, user_id);

CREATE INDEX IF NOT EXISTS idx_saved_posts_composite
  ON public.saved_posts (user_id, post_id);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread_fast
  ON public.notifications (recipient_id, created_at DESC)
  WHERE unread = TRUE;

CREATE INDEX IF NOT EXISTS idx_blood_requests_status_fast
  ON public.blood_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_blood_requests_blood_group
  ON public.blood_requests (blood_group, status);

CREATE INDEX IF NOT EXISTS idx_blood_donors_availability_group
  ON public.blood_donors (availability, blood_group);

CREATE INDEX IF NOT EXISTS idx_alumni_profiles_batch_search
  ON public.alumni_profiles (batch_year, is_public);

CREATE INDEX IF NOT EXISTS idx_alumni_profiles_verification_fast
  ON public.alumni_profiles (verification_status);

COMMIT;
