-- =============================================================================
-- MIGRATION 032: RECONCILE ALUMNI PROFILE UPDATE COLUMN GRANTS
-- Safe & Idempotent: Run in Supabase Dashboard -> SQL Editor if needed.
-- Ensures authenticated alumni can update all their own non-privileged profile
-- fields (including career_history, specialty_other, cadre,
-- user_preferences, and updated_at) while keeping role, verification_status,
-- badges, vouches_count, and phone_ownership_verified strictly server-controlled.
-- =============================================================================

BEGIN;

ALTER TABLE public.alumni_profiles
  ADD COLUMN IF NOT EXISTS cadre TEXT NULL,
  ADD COLUMN IF NOT EXISTS specialty_other TEXT NULL,
  ADD COLUMN IF NOT EXISTS user_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

GRANT UPDATE (
  full_name,
  avatar_url,
  cover_url,
  batch_year,
  session,
  academic_stream,
  academic_group,
  section,
  position,
  institution,
  cadre,
  specialty,
  specialty_other,
  degree,
  city,
  country,
  latitude,
  longitude,
  bio,
  career_history,
  blood_group,
  email,
  phone,
  whatsapp,
  fb_link,
  is_public,
  show_contact_to_verified,
  last_seen_at,
  user_preferences,
  updated_at
) ON public.alumni_profiles TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
