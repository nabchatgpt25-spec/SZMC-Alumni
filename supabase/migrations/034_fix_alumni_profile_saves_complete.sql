-- =============================================================================
-- MIGRATION 034: COMPLETE FIX FOR ALUMNI PROFILE SAVES IN SUPABASE
-- Safe & Idempotent: Paste and run in Supabase Dashboard -> SQL Editor.
--
-- Fixes all root causes blocking alumni & admin profile updates:
--   1. Adds any missing editable columns (cadre, specialty_other, career_history,
--      user_preferences, account_status) without touching existing data.
--   2. Updates is_admin() and is_admin_or_mod() to support 'super_admin' as well
--      as 'admin' and 'moderator'.
--   3. Hardens handle_updated_at() and sync_profile_display_fields() triggers so
--      an enum cast or profiles-table mismatch can never roll back a profile save.
--   4. Grants column-level SELECT / INSERT / UPDATE dynamically for all editable
--      columns on public.alumni_profiles (keeping sensitive contact SELECT and
--      privileged role/verification columns strictly protected).
--   5. Reconciles clean RLS policies on public.alumni_profiles and links any
--      legacy alumni_profiles rows whose auth_user_id is NULL to matching
--      auth.users accounts by email.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Ensure all editable/expected columns exist on public.alumni_profiles
-- -----------------------------------------------------------------------------
ALTER TABLE public.alumni_profiles
  ADD COLUMN IF NOT EXISTS cadre TEXT NULL,
  ADD COLUMN IF NOT EXISTS specialty_other TEXT NULL,
  ADD COLUMN IF NOT EXISTS career_history TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS user_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';

-- -----------------------------------------------------------------------------
-- 2. Fix admin helper functions so super_admin, admin, and moderator all work
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.alumni_profiles
    WHERE auth_user_id = auth.uid()
      AND role::text IN ('super_admin', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_admin_or_mod()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.alumni_profiles
    WHERE auth_user_id = auth.uid()
      AND role::text IN ('super_admin', 'admin', 'moderator')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_mod() TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Harden triggers on public.alumni_profiles so saves never abort unexpectedly
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_display_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.auth_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF to_regclass('public.profiles') IS NOT NULL THEN
      UPDATE public.profiles
      SET
        full_name = COALESCE(NULLIF(TRIM(NEW.full_name), ''), public.profiles.full_name),
        avatar_url = COALESCE(NULLIF(TRIM(NEW.avatar_url), ''), public.profiles.avatar_url),
        batch = COALESCE(NEW.batch_year, public.profiles.batch),
        is_verified = (COALESCE(NEW.verification_status::text, 'unverified') = 'verified'),
        updated_at = now()
      WHERE user_id = NEW.auth_user_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'sync_profile_display_fields skipped: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Dynamically grant SELECT / INSERT / UPDATE on existing safe columns
--    (Works cleanly both before and after dropping college_roll / profession)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_select_cols TEXT;
  v_insert_cols TEXT;
  v_update_cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
  INTO v_select_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'alumni_profiles'
    AND column_name = ANY (ARRAY[
      'id', 'auth_user_id', 'role', 'account_status', 'full_name',
      'avatar_url', 'cover_url', 'batch_year', 'session',
      'academic_stream', 'academic_group', 'section',
      'verification_status', 'verification_method',
      'vouches_count', 'vouch_target_count', 'verified_at',
      'verified_by_profile_id', 'phone_ownership_verified',
      'position', 'institution', 'cadre', 'specialty',
      'specialty_other', 'degree', 'city', 'country',
      'latitude', 'longitude', 'bio', 'career_history',
      'badges', 'blood_group', 'is_registered_donor',
      'is_public', 'show_contact_to_verified', 'posts_count',
      'last_seen_at', 'user_preferences', 'search_vector',
      'created_at', 'updated_at'
    ]);

  SELECT string_agg(quote_ident(column_name), ', ')
  INTO v_insert_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'alumni_profiles'
    AND column_name = ANY (ARRAY[
      'auth_user_id', 'full_name', 'avatar_url', 'cover_url',
      'batch_year', 'session', 'academic_stream', 'academic_group',
      'section', 'position', 'institution', 'cadre', 'specialty',
      'specialty_other', 'degree', 'city', 'country', 'latitude',
      'longitude', 'bio', 'career_history', 'blood_group',
      'email', 'phone', 'whatsapp', 'fb_link', 'is_registered_donor',
      'is_public', 'show_contact_to_verified', 'user_preferences'
    ]);

  SELECT string_agg(quote_ident(column_name), ', ')
  INTO v_update_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'alumni_profiles'
    AND column_name = ANY (ARRAY[
      'full_name', 'avatar_url', 'cover_url', 'batch_year',
      'session', 'academic_stream', 'academic_group', 'section',
      'position', 'institution', 'cadre', 'specialty',
      'specialty_other', 'degree', 'city', 'country', 'latitude',
      'longitude', 'bio', 'career_history', 'blood_group',
      'email', 'phone', 'whatsapp', 'fb_link', 'is_registered_donor',
      'is_public', 'show_contact_to_verified', 'last_seen_at',
      'user_preferences', 'updated_at'
    ]);

  IF v_select_cols IS NOT NULL THEN
    EXECUTE format('GRANT SELECT (%s) ON public.alumni_profiles TO authenticated;', v_select_cols);
  END IF;

  IF v_insert_cols IS NOT NULL THEN
    EXECUTE format('GRANT INSERT (%s) ON public.alumni_profiles TO authenticated;', v_insert_cols);
  END IF;

  IF v_update_cols IS NOT NULL THEN
    EXECUTE format('GRANT UPDATE (%s) ON public.alumni_profiles TO authenticated;', v_update_cols);
  END IF;
END $$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Reconcile clean RLS policies on public.alumni_profiles
-- -----------------------------------------------------------------------------
ALTER TABLE public.alumni_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Alumni: Read Visible" ON public.alumni_profiles;
DROP POLICY IF EXISTS "Alumni: Update Own" ON public.alumni_profiles;
DROP POLICY IF EXISTS "Alumni: Insert Own" ON public.alumni_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.alumni_profiles;
DROP POLICY IF EXISTS "Profiles: Owner Update" ON public.alumni_profiles;
DROP POLICY IF EXISTS "alumni_profiles_select_authenticated" ON public.alumni_profiles;
DROP POLICY IF EXISTS "alumni_profiles_insert_own" ON public.alumni_profiles;
DROP POLICY IF EXISTS "alumni_profiles_update_own_or_admin" ON public.alumni_profiles;

CREATE POLICY "alumni_profiles_select_authenticated"
  ON public.alumni_profiles FOR SELECT
  TO authenticated
  USING (
    (is_public = TRUE AND COALESCE(account_status, 'active') = 'active')
    OR auth_user_id = auth.uid()
    OR public.is_admin_or_mod()
  );

CREATE POLICY "alumni_profiles_insert_own"
  ON public.alumni_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      auth_user_id = auth.uid()
      AND role::text = 'member'
      AND verification_status::text = 'unverified'
    )
    OR public.is_admin()
  );

CREATE POLICY "alumni_profiles_update_own_or_admin"
  ON public.alumni_profiles FOR UPDATE
  TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR public.is_admin_or_mod()
  )
  WITH CHECK (
    auth_user_id = auth.uid()
    OR public.is_admin_or_mod()
  );

-- -----------------------------------------------------------------------------
-- 6. Link legacy alumni_profiles rows (auth_user_id IS NULL) to auth.users
--    when email matches uniquely, so those users can immediately save edits
-- -----------------------------------------------------------------------------
UPDATE public.alumni_profiles ap
SET auth_user_id = u.id
FROM auth.users u
WHERE ap.auth_user_id IS NULL
  AND ap.email IS NOT NULL
  AND u.email IS NOT NULL
  AND lower(ap.email::text) = lower(u.email)
  AND NOT EXISTS (
    SELECT 1
    FROM public.alumni_profiles existing
    WHERE existing.auth_user_id = u.id
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
