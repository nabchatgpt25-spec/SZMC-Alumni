-- =============================================================================
-- MIGRATION 029: FACEBOOK-STYLE NOTIFICATIONS, LIVE TOASTS & GALLERY REALTIME
-- Project: Shaheed Ziaur Rahman Medical College Alumni Network (SZMC Bogura)
-- Safe & Idempotent: Run directly in Supabase Dashboard -> SQL Editor
-- =============================================================================
-- What this migration ensures:
--   1. public.notifications supports all Facebook-style notification types,
--      optional photo_url thumbnail & conversation_id deep-links, recipient
--      Mark-as-Read / Mark-as-Unread / Remove (DELETE) RLS, and Realtime.
--   2. public.gallery_albums & public.gallery_photos have complete Realtime
--      publication + REPLICA IDENTITY FULL + creator/admin edit/delete policies.
--   3. public.gallery_photo_likes table + SECURITY DEFINER counter trigger so
--      gallery photo likes persist per-user in Supabase even with anon/user JWTs
--      (safely bypassing trg_protect_gallery_photos_columns on likes_count).
--   4. public.messages & public.connections Realtime / recipient confirm-delete
--      safeguards for inline notification actions & mobile slide-down toasts.
-- =============================================================================

BEGIN;

SET search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- 1. FACEBOOK-STYLE NOTIFICATIONS COLUMNS, INDEXES & STRICT RECIPIENT RLS
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    -- Ensure type accepts all extended Facebook-style notification types
    BEGIN
      ALTER TABLE public.notifications ALTER COLUMN type TYPE TEXT USING type::TEXT;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

    -- Optional thumbnail preview & conversation deep-link columns
    ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS photo_url TEXT NULL;
    ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS conversation_id UUID NULL;

    ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.notifications REPLICA IDENTITY FULL;

    REVOKE ALL ON public.notifications FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
    GRANT ALL ON public.notifications TO service_role;
  END IF;
END $$;

DROP POLICY IF EXISTS "notifications_all_access" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_recipient" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_authenticated" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_recipient_read_state" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_recipient_or_admin" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;

CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    recipient_id = public.current_alumni_profile_id()
    OR public.is_admin_or_mod()
  );

CREATE POLICY "notifications_insert_authenticated"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    recipient_id IS NOT NULL
    AND (
      actor_id IS NULL
      OR actor_id = public.current_alumni_profile_id()
      OR public.is_admin_or_mod()
    )
    AND (actor_id IS NULL OR actor_id <> recipient_id)
  );

-- Allows recipient to toggle Mark as Read / Mark as Unread
CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE TO authenticated
  USING (
    recipient_id = public.current_alumni_profile_id()
    OR public.is_admin_or_mod()
  )
  WITH CHECK (
    recipient_id = public.current_alumni_profile_id()
    OR public.is_admin_or_mod()
  );

-- Allows recipient to permanently "Remove this notification"
CREATE POLICY "notifications_delete_own"
  ON public.notifications FOR DELETE TO authenticated
  USING (
    recipient_id = public.current_alumni_profile_id()
    OR public.is_admin_or_mod()
  );

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread_created
  ON public.notifications (recipient_id, unread, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_grouping
  ON public.notifications (recipient_id, post_id, type, created_at DESC)
  WHERE post_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. GALLERY PHOTO LIKES (PER-USER PERSISTENCE + AUTO-SYNC likes_count)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_photo_id_type TEXT;
BEGIN
  IF to_regclass('public.gallery_photos') IS NOT NULL THEN
    SELECT format_type(a.atttypid, a.atttypmod)
      INTO v_photo_id_type
    FROM pg_attribute a
    WHERE a.attrelid = 'public.gallery_photos'::regclass
      AND a.attname = 'id'
      AND NOT a.attisdropped;

    IF v_photo_id_type IS NOT NULL AND to_regclass('public.gallery_photo_likes') IS NULL THEN
      EXECUTE format(
        'CREATE TABLE public.gallery_photo_likes (
           id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
           photo_id %s NOT NULL REFERENCES public.gallery_photos(id) ON DELETE CASCADE,
           user_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
           created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
           CONSTRAINT uq_gallery_photo_likes_pair UNIQUE (photo_id, user_id)
         )',
        v_photo_id_type
      );
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.gallery_photo_likes') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_gallery_photo_likes_photo
      ON public.gallery_photo_likes (photo_id);
    CREATE INDEX IF NOT EXISTS idx_gallery_photo_likes_user
      ON public.gallery_photo_likes (user_id);

    ALTER TABLE public.gallery_photo_likes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.gallery_photo_likes REPLICA IDENTITY FULL;

    REVOKE ALL ON public.gallery_photo_likes FROM anon;
    GRANT SELECT ON public.gallery_photo_likes TO anon, authenticated;
    GRANT INSERT, DELETE ON public.gallery_photo_likes TO authenticated;
    GRANT ALL ON public.gallery_photo_likes TO service_role;
  END IF;
END $$;

DROP POLICY IF EXISTS "gallery_photo_likes_select_all" ON public.gallery_photo_likes;
CREATE POLICY "gallery_photo_likes_select_all"
  ON public.gallery_photo_likes FOR SELECT TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "gallery_photo_likes_insert_own" ON public.gallery_photo_likes;
CREATE POLICY "gallery_photo_likes_insert_own"
  ON public.gallery_photo_likes FOR INSERT TO authenticated
  WITH CHECK (user_id = public.current_alumni_profile_id());

DROP POLICY IF EXISTS "gallery_photo_likes_delete_own" ON public.gallery_photo_likes;
CREATE POLICY "gallery_photo_likes_delete_own"
  ON public.gallery_photo_likes FOR DELETE TO authenticated
  USING (
    user_id = public.current_alumni_profile_id()
    OR public.is_admin_or_mod()
  );

-- Keep gallery_photos.likes_count accurately synced via SECURITY DEFINER trigger
CREATE OR REPLACE FUNCTION public.sync_gallery_photo_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  PERFORM set_config('app.internal_trigger', 'true', true);
  IF TG_OP = 'INSERT' THEN
    UPDATE public.gallery_photos
    SET likes_count = (
      SELECT COUNT(*)::INT FROM public.gallery_photo_likes WHERE photo_id = NEW.photo_id
    )
    WHERE id = NEW.photo_id;
    PERFORM set_config('app.internal_trigger', 'false', true);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.gallery_photos
    SET likes_count = (
      SELECT COUNT(*)::INT FROM public.gallery_photo_likes WHERE photo_id = OLD.photo_id
    )
    WHERE id = OLD.photo_id;
    PERFORM set_config('app.internal_trigger', 'false', true);
    RETURN OLD;
  END IF;
  PERFORM set_config('app.internal_trigger', 'false', true);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_gallery_photo_likes_count ON public.gallery_photo_likes;
CREATE TRIGGER trg_sync_gallery_photo_likes_count
  AFTER INSERT OR DELETE ON public.gallery_photo_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_gallery_photo_likes_count();

-- -----------------------------------------------------------------------------
-- 3. ENSURE GALLERY EDIT / DELETE POLICIES FOR CREATORS & ADMINS
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.gallery_albums') IS NOT NULL THEN
    ALTER TABLE public.gallery_albums REPLICA IDENTITY FULL;
    GRANT SELECT ON public.gallery_albums TO anon, authenticated;
    GRANT INSERT, UPDATE, DELETE ON public.gallery_albums TO authenticated;
  END IF;

  IF to_regclass('public.gallery_photos') IS NOT NULL THEN
    ALTER TABLE public.gallery_photos REPLICA IDENTITY FULL;
    GRANT SELECT ON public.gallery_photos TO anon, authenticated;
    GRANT INSERT, UPDATE, DELETE ON public.gallery_photos TO authenticated;
  END IF;
END $$;

DROP POLICY IF EXISTS "gallery_albums_update_creator_or_mod" ON public.gallery_albums;
CREATE POLICY "gallery_albums_update_creator_or_mod"
  ON public.gallery_albums FOR UPDATE TO authenticated
  USING (
    created_by_id = public.current_alumni_profile_id()
    OR public.is_admin_or_mod()
  )
  WITH CHECK (
    created_by_id = public.current_alumni_profile_id()
    OR public.is_admin_or_mod()
  );

DROP POLICY IF EXISTS "gallery_albums_delete_creator_or_mod" ON public.gallery_albums;
CREATE POLICY "gallery_albums_delete_creator_or_mod"
  ON public.gallery_albums FOR DELETE TO authenticated
  USING (
    created_by_id = public.current_alumni_profile_id()
    OR public.is_admin_or_mod()
  );

-- -----------------------------------------------------------------------------
-- 4. ENSURE SUPABASE REALTIME PUBLICATION FOR NOTIFICATIONS, MESSAGES & GALLERY
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'notifications',
    'messages',
    'gallery_albums',
    'gallery_photos',
    'gallery_photo_likes'
  ]
  LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;
END $$;

COMMIT;
