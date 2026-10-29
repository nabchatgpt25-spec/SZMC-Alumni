-- =============================================================================
-- MIGRATION 014: FIX "ALUMNI CANNOT PUBLISH A POST" (PROFILE CREATION & GRANTS)
-- Project: SZMC Alumni Platform
-- Target: Supabase PostgreSQL
--
-- ROOT CAUSE THIS FIXES
--   The client (src/lib/supabase-auth.ts) inserts role / verification_status /
--   verification_method / phone_ownership_verified into public.alumni_profiles,
--   but migration 003 revoked those columns at the GRANT level. Postgres rejects
--   the WHOLE row with 42501 "permission denied for table alumni_profiles", so a
--   self-registered alumnus never gets a profile row. createFeedPostInDb() then
--   cannot resolve author_id and the INSERT INTO public.posts is never attempted.
--
-- WHAT THIS MIGRATION DOES
--   1. Hardens the phone-verification columns with a trigger, then grants them to
--      `authenticated` so the existing client insert payload succeeds. Members can
--      never mark their own phone as verified (server-controlled).
--   2. Creates public.ensure_alumni_profile(...) — an idempotent, exception-safe
--      profile creator.
--   3. Adds an AFTER INSERT trigger on auth.users so every new signup gets exactly
--      one alumni_profiles row automatically (no client insert needed at all).
--   4. Backfills profiles for every existing auth user that is missing one.
--
--   Idempotent and additive. Safe to re-run. No data is deleted.
-- =============================================================================

BEGIN;

SET search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- 1. PHONE-VERIFICATION COLUMNS ARE SERVER-CONTROLLED
--    Guards the columns we are about to grant: a member may submit them, but only
--    admins / service_role can actually set them to true.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_phone_verification_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Trusted callers (service_role, SQL editor, admin actions) are untouched.
  IF public.is_internal_or_service_role() OR public.is_admin_or_mod() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.phone_ownership_verified := FALSE;
    NEW.phone_verified_at := NULL;
    NEW.phone_verified_by_profile_id := NULL;
    NEW.phone_verification_notes := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: changing the phone number always drops the verified flag;
  -- otherwise the stored server value wins and client input is ignored.
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    NEW.phone_ownership_verified := FALSE;
    NEW.phone_verified_at := NULL;
    NEW.phone_verified_by_profile_id := NULL;
  ELSE
    NEW.phone_ownership_verified := OLD.phone_ownership_verified;
    NEW.phone_verified_at := OLD.phone_verified_at;
    NEW.phone_verified_by_profile_id := OLD.phone_verified_by_profile_id;
  END IF;
  NEW.phone_verification_notes := OLD.phone_verification_notes;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_phone_verification_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_phone_verification_columns ON public.alumni_profiles;
CREATE TRIGGER trg_protect_phone_verification_columns
  BEFORE INSERT OR UPDATE ON public.alumni_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_phone_verification_columns();

-- -----------------------------------------------------------------------------
-- 2. COLUMN GRANTS
--    Now safe to grant: the triggers above already force role='member',
--    verification_status='unverified', vouches_count=0, phone_ownership_verified=FALSE.
-- -----------------------------------------------------------------------------
GRANT INSERT (
  role,
  verification_status,
  verification_method,
  vouches_count,
  vouch_target_count,
  badges,
  phone_ownership_verified,
  phone_verified_at,
  phone_verified_by_profile_id,
  phone_verification_notes
) ON public.alumni_profiles TO authenticated;

GRANT UPDATE (
  role,
  verification_status,
  verification_method,
  vouches_count,
  vouch_target_count,
  badges,
  phone_ownership_verified,
  phone_verified_at,
  phone_verified_by_profile_id,
  phone_verification_notes
) ON public.alumni_profiles TO authenticated;

-- The app reads these back (mapSupabaseRowToAlumniProfile -> phoneOwnershipVerified)
-- and INSERT ... RETURNING needs SELECT on the returned columns.
-- None of them are secret, and writes stay server-controlled by the trigger above.
GRANT SELECT (
  phone_ownership_verified,
  phone_verified_at,
  phone_verified_by_profile_id,
  phone_verification_notes
) ON public.alumni_profiles TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. IDEMPOTENT, EXCEPTION-SAFE PROFILE CREATOR
--    Returns the alumni_profiles.id (existing or newly created), or NULL.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_alumni_profile(
  p_auth_user_id UUID,
  p_email TEXT DEFAULT NULL,
  p_meta JSONB DEFAULT '{}'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_existing_id BIGINT;
  v_full_name TEXT;
  v_batch SMALLINT;
  v_raw_batch TEXT;
  v_phone TEXT;
  v_email TEXT;
  v_session TEXT;
  v_new_id BIGINT;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_existing_id
  FROM public.alumni_profiles
  WHERE auth_user_id = p_auth_user_id;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');

  v_full_name := coalesce(
    nullif(trim(p_meta ->> 'full_name'), ''),
    nullif(trim(p_meta ->> 'name'), ''),
    CASE WHEN v_email IS NOT NULL THEN split_part(v_email, '@', 1) END,
    'SZMC Alumnus'
  );
  IF char_length(v_full_name) < 2 THEN
    v_full_name := 'SZMC Alumnus';
  END IF;

  -- batch_year: only accept a sane 1..150 value from metadata
  v_raw_batch := trim(coalesce(p_meta ->> 'batch_year', ''));
  IF v_raw_batch ~ '^[0-9]{1,3}$' THEN
    IF v_raw_batch::int BETWEEN 1 AND 150 THEN
      v_batch := v_raw_batch::smallint;
    END IF;
  END IF;

  IF v_batch IS NULL THEN
    SELECT min(batch_year) INTO v_batch FROM public.batches;
  END IF;
  IF v_batch IS NULL THEN
    v_batch := 1;
  END IF;

  -- Guarantee the referenced batch row exists (FK on alumni_profiles.batch_year)
  IF NOT EXISTS (SELECT 1 FROM public.batches WHERE batch_year = v_batch) THEN
    INSERT INTO public.batches (batch_year) VALUES (v_batch)
    ON CONFLICT (batch_year) DO NOTHING;
  END IF;

  v_session := coalesce(
    nullif(trim(p_meta ->> 'session'), ''),
    format('Session %s-%s', 1990 + v_batch, lpad(((1991 + v_batch) % 100)::text, 2, '0'))
  );

  v_phone := nullif(trim(coalesce(p_meta ->> 'phone', '')), '');

  BEGIN
    INSERT INTO public.alumni_profiles (
      auth_user_id, full_name, avatar_url, batch_year, session, section,
      profession, position, institution, city, country, email, phone
    )
    VALUES (
      p_auth_user_id,
      v_full_name,
      '/szmc-logo.png',
      v_batch,
      v_session,
      'MBBS',
      'Medical Doctor / Physician',
      'Physician',
      'Shaheed Ziaur Rahman Medical College Hospital',
      'Bogura',
      'Bangladesh',
      v_email,
      v_phone
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
  EXCEPTION WHEN OTHERS THEN
    -- Never let profile creation break signup. Log and report the real problem.
    RAISE WARNING 'ensure_alumni_profile failed for %: % (%)', p_auth_user_id, SQLERRM, SQLSTATE;
    RETURN NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_alumni_profile(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_alumni_profile(UUID, TEXT, JSONB) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. AUTOMATIC PROFILE ON SIGNUP (no client insert required)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_alumni_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public.ensure_alumni_profile(
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data, '{}'::jsonb)
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_alumni_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_alumni_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_alumni_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_alumni_user();

-- -----------------------------------------------------------------------------
-- 5. BACKFILL: give every existing auth user the profile row they never got
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_created INT := 0;
BEGIN
  FOR r IN
    SELECT u.id, u.email, coalesce(u.raw_user_meta_data, '{}'::jsonb) AS meta
    FROM auth.users u
    LEFT JOIN public.alumni_profiles p ON p.auth_user_id = u.id
    WHERE p.id IS NULL
  LOOP
    IF public.ensure_alumni_profile(r.id, r.email, r.meta) IS NOT NULL THEN
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Migration 014: created % missing alumni_profiles row(s).', v_created;
END $$;

-- -----------------------------------------------------------------------------
-- 6. POSTS: make sure an alumni can always insert their own post
--    (re-assert the insert policy in case it was altered by hand in the dashboard)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "posts_insert_own" ON public.posts;
CREATE POLICY "posts_insert_own"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = public.current_profile_id()
    AND is_deleted = FALSE
    AND (is_pinned = FALSE OR public.is_admin_or_mod())
  );

COMMIT;
