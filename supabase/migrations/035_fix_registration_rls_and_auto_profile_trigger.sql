-- =============================================================================
-- MIGRATION 035: FIX PROFILE CREATION RLS POLICIES + AUTO-CREATE TRIGGER
-- Safe & Idempotent: Run in Supabase Dashboard -> SQL Editor (or via Supabase AI)
--
-- Fixes why new registrations were not appearing in public.alumni_profiles:
--   1. Ensures batches 1..35 and 'Science' stream reference rows exist so FKs never fail.
--   2. Grants clean column-level SELECT / INSERT / UPDATE on public.alumni_profiles.
--   3. Recreates clean RLS policies for INSERT, SELECT, and UPDATE on public.alumni_profiles.
--   4. Adds an AFTER INSERT trigger on auth.users (SECURITY DEFINER) that immediately
--      creates the user's public.alumni_profiles row on sign-up — even before email confirmation.
--   5. Backfills any existing auth.users who signed up earlier without a profile row.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Ensure reference rows exist (batches 1..35 + Science stream) so FKs never reject inserts
-- -----------------------------------------------------------------------------
INSERT INTO public.batches (batch_year, session)
SELECT gs, format('Session %s-%s', 1990 + gs, right((1991 + gs)::text, 2))
FROM generate_series(1, 35) AS gs
ON CONFLICT (batch_year) DO NOTHING;

INSERT INTO public.academic_stream_groups (stream, group_code, expected_group_count, is_active)
SELECT 'Science'::public.academic_stream_type, NULL, 17, TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM public.academic_stream_groups
  WHERE stream = 'Science'::public.academic_stream_type
    AND group_code IS NULL
);

-- -----------------------------------------------------------------------------
-- 2. Column-level GRANTs for authenticated users (keeps role/verification protected)
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
-- 3. Clean RLS Policies for Profile Creation, Reading & Updating
-- -----------------------------------------------------------------------------
ALTER TABLE public.alumni_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Alumni: Read Visible" ON public.alumni_profiles;
DROP POLICY IF EXISTS "Alumni: Insert Own" ON public.alumni_profiles;
DROP POLICY IF EXISTS "Alumni: Update Own" ON public.alumni_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.alumni_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.alumni_profiles;
DROP POLICY IF EXISTS "alumni_profiles_select_authenticated" ON public.alumni_profiles;
DROP POLICY IF EXISTS "alumni_profiles_insert_own" ON public.alumni_profiles;
DROP POLICY IF EXISTS "alumni_profiles_update_own_or_admin" ON public.alumni_profiles;

CREATE POLICY "alumni_profiles_select_authenticated"
  ON public.alumni_profiles FOR SELECT
  TO authenticated
  USING (
    is_public = TRUE
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
-- 4. Auto-create alumni_profiles row immediately on auth.users INSERT
--    (Works even when "Confirm email" is enabled and signUp returns session = null)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_meta JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_raw_batch INT := NULLIF(regexp_replace(COALESCE(v_meta->>'batch_year', ''), '[^0-9]', '', 'g'), '')::INT;
  v_batch SMALLINT := 25;
  v_full_name TEXT;
  v_phone TEXT;
  v_whatsapp TEXT;
  v_blood TEXT;
  v_specialty TEXT[] := '{}'::TEXT[];
  v_degree TEXT[] := ARRAY['MBBS']::TEXT[];
BEGIN
  IF v_raw_batch IS NOT NULL THEN
    IF v_raw_batch > 1900 THEN
      v_raw_batch := v_raw_batch - 1991;
    END IF;
    IF v_raw_batch BETWEEN 1 AND 35 THEN
      v_batch := v_raw_batch::SMALLINT;
    END IF;
  END IF;

  v_full_name := NULLIF(TRIM(COALESCE(v_meta->>'full_name', v_meta->>'name', '')), '');
  IF v_full_name IS NULL OR char_length(v_full_name) < 2 THEN
    v_full_name := COALESCE(NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''), 'SZMC Doctor');
  END IF;
  IF char_length(v_full_name) < 2 THEN
    v_full_name := 'SZMC Doctor';
  END IF;

  v_phone := NULLIF(TRIM(COALESCE(v_meta->>'phone', NEW.phone, '')), '');
  v_whatsapp := NULLIF(TRIM(COALESCE(v_meta->>'whatsapp', '')), '');
  v_blood := NULLIF(TRIM(COALESCE(v_meta->>'blood_group', '')), '');
  IF v_blood IS NOT NULL AND v_blood NOT IN ('A+','A-','B+','B-','AB+','AB-','O+','O-') THEN
    v_blood := NULL;
  END IF;

  IF jsonb_typeof(v_meta->'specialty') = 'array' THEN
    SELECT COALESCE(array_agg(elem), '{}'::TEXT[])
    INTO v_specialty
    FROM jsonb_array_elements_text(v_meta->'specialty') AS elem
    WHERE TRIM(elem) <> '';
  END IF;

  IF jsonb_typeof(v_meta->'degree') = 'array' THEN
    SELECT COALESCE(array_agg(elem), ARRAY['MBBS']::TEXT[])
    INTO v_degree
    FROM jsonb_array_elements_text(v_meta->'degree') AS elem
    WHERE TRIM(elem) <> '';
  END IF;

  INSERT INTO public.alumni_profiles (
    auth_user_id,
    full_name,
    avatar_url,
    batch_year,
    session,
    academic_stream,
    academic_group,
    section,
    position,
    institution,
    specialty,
    degree,
    city,
    country,
    email,
    phone,
    whatsapp,
    blood_group,
    is_public
  )
  VALUES (
    NEW.id,
    left(v_full_name, 150),
    COALESCE(NULLIF(TRIM(COALESCE(v_meta->>'avatar_url', '')), ''), '/assets/aistudio/images__1__2778177d.png'),
    v_batch,
    format('Session %s-%s', 1990 + v_batch, right((1991 + v_batch)::text, 2)),
    'Science'::public.academic_stream_type,
    NULL,
    format('SZMC-%s', lpad(v_batch::text, 2, '0')),
    COALESCE(NULLIF(TRIM(COALESCE(v_meta->>'position', '')), ''), 'Physician'),
    COALESCE(NULLIF(TRIM(COALESCE(v_meta->>'institution', '')), ''), 'Shaheed Ziaur Rahman Medical College Hospital'),
    v_specialty,
    v_degree,
    COALESCE(NULLIF(TRIM(COALESCE(v_meta->>'city', '')), ''), 'Bogura'),
    COALESCE(NULLIF(TRIM(COALESCE(v_meta->>'country', '')), ''), 'Bangladesh'),
    NULLIF(lower(TRIM(COALESCE(NEW.email, ''))), ''),
    v_phone,
    v_whatsapp,
    v_blood,
    TRUE
  )
  ON CONFLICT (auth_user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block auth.users signup if an optional constraint (e.g. duplicate phone) fails
  RAISE WARNING 'handle_new_auth_user_profile skipped for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_alumni_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_alumni_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user_profile();

-- -----------------------------------------------------------------------------
-- 5. Backfill any existing auth.users that do not yet have an alumni_profiles row
-- -----------------------------------------------------------------------------
INSERT INTO public.alumni_profiles (
  auth_user_id,
  full_name,
  avatar_url,
  batch_year,
  session,
  academic_stream,
  academic_group,
  section,
  position,
  institution,
  degree,
  city,
  country,
  email,
  is_public
)
SELECT
  u.id,
  left(
    CASE
      WHEN char_length(TRIM(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''))) >= 2
        THEN TRIM(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'))
      WHEN char_length(split_part(COALESCE(u.email, ''), '@', 1)) >= 2
        THEN split_part(u.email, '@', 1)
      ELSE 'SZMC Doctor'
    END,
    150
  ),
  '/assets/aistudio/images__1__2778177d.png',
  25,
  'Session 2015-16',
  'Science'::public.academic_stream_type,
  NULL,
  'SZMC-25',
  'Physician',
  'Shaheed Ziaur Rahman Medical College Hospital',
  ARRAY['MBBS']::TEXT[],
  'Bogura',
  'Bangladesh',
  NULLIF(lower(TRIM(COALESCE(u.email, ''))), ''),
  TRUE
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.alumni_profiles ap
  WHERE ap.auth_user_id = u.id
    OR (u.email IS NOT NULL AND ap.email IS NOT NULL AND lower(ap.email::text) = lower(u.email))
)
ON CONFLICT (auth_user_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
