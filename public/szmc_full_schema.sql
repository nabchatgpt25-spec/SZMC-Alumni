-- =============================================================================
-- SHAHEED ZIAUR RAHMAN MEDICAL COLLEGE (SZMC BOGURA) ALUMNI NETWORK
-- MASTER PRODUCTION DATABASE SPECIFICATION (ZERO OVERLAP, 100% IDEMPOTENT)
-- Compatible with Supabase PostgreSQL (Fresh Database or Existing Database)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

SET search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- 2. ENUM TYPES (Idempotent Creation)
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('member', 'moderator', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.verification_status AS ENUM ('unverified', 'pending_vouch', 'verified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.verification_method AS ENUM ('two_vouches', 'id_card_upload', 'souvenir_photo', 'admin_verified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.verification_doc_type AS ENUM ('id_card', 'nid_card', 'hsc_slip', 'souvenir');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.request_review_status AS ENUM ('pending', 'approved', 'rejected', 'verified', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.blood_group_type AS ENUM ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.blood_donor_availability AS ENUM ('available', 'on_cooldown', 'unavailable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.blood_alert_preference AS ENUM ('all_urgent', 'same_area_only', 'critical_only', 'paused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.blood_emergency_level AS ENUM ('critical', 'urgent', 'standard');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.blood_request_status AS ENUM (
    'Pending Verification',
    'Active',
    'Donor Found',
    'Donation Confirmed',
    'Fulfilled',
    'Cancelled',
    'Expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.blood_contact_method AS ENUM (
    'Portal Secure Coordination',
    'Hospital Blood Bank Desk',
    'Batch Coordinator Relay',
    'Attendant Emergency Line'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.blood_response_status AS ENUM ('offered', 'accepted', 'confirmed_donated', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.post_category_type AS ENUM (
    'General Update',
    'Tech & Innovation',
    'Professional Insights',
    'Reunion',
    'Achievement'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_type AS ENUM ('like', 'comment', 'post', 'system', 'blood', 'verification');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.gallery_category_type AS ENUM (
    'reunion',
    'academic',
    'campus',
    'sports',
    'cultural',
    'milestone'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.inquiry_status_type AS ENUM ('new', 'in_progress', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- 3. DROP OBSOLETE/CONFLICTING FUNCTIONS & TRIGGERS (Prevents 42P13 & Overlaps)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_sync_batch_count ON public.alumni_profiles;
DROP TRIGGER IF EXISTS trg_sync_posts_count ON public.posts;
DROP TRIGGER IF EXISTS trg_sync_post_likes_count ON public.post_likes;
DROP TRIGGER IF EXISTS trg_sync_post_comments_count ON public.post_comments;
DROP TRIGGER IF EXISTS trg_sync_gallery_photos_count ON public.gallery_photos;
DROP TRIGGER IF EXISTS trg_handle_peer_vouch ON public.peer_vouches;
DROP TRIGGER IF EXISTS trg_handle_verification_request ON public.verification_requests;
DROP TRIGGER IF EXISTS trg_handle_admin_doc_review ON public.admin_doc_submissions;
DROP TRIGGER IF EXISTS trg_validate_stream_group ON public.alumni_profiles;
DROP TRIGGER IF EXISTS trg_protect_profile_columns ON public.alumni_profiles;
DROP TRIGGER IF EXISTS trg_protect_posts ON public.posts;
DROP TRIGGER IF EXISTS trg_protect_comments ON public.post_comments;
DROP TRIGGER IF EXISTS trg_protect_gallery ON public.gallery_photos;
DROP TRIGGER IF EXISTS trg_protect_blood_requests ON public.blood_requests;

DROP FUNCTION IF EXISTS public.get_alumni_contact_details(BIGINT) CASCADE;
DROP FUNCTION IF EXISTS public.check_phone_available(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.check_and_increment_rate_limit(TEXT, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.current_profile_id() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_role() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin_or_mod() CASCADE;
DROP FUNCTION IF EXISTS public.is_verified_alumnus() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_batch_year() CASCADE;
DROP FUNCTION IF EXISTS public.is_internal_or_service_role() CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.sync_batch_registered_count() CASCADE;
DROP FUNCTION IF EXISTS public.sync_user_posts_count() CASCADE;
DROP FUNCTION IF EXISTS public.sync_post_likes_count() CASCADE;
DROP FUNCTION IF EXISTS public.sync_post_comments_count() CASCADE;
DROP FUNCTION IF EXISTS public.sync_gallery_album_photos_count() CASCADE;
DROP FUNCTION IF EXISTS public.handle_peer_vouch_insert() CASCADE;
DROP FUNCTION IF EXISTS public.handle_verification_request_mutation() CASCADE;
DROP FUNCTION IF EXISTS public.handle_admin_doc_submission_review() CASCADE;
DROP FUNCTION IF EXISTS public.validate_stream_group_pair() CASCADE;
DROP FUNCTION IF EXISTS public.protect_privileged_profile_columns() CASCADE;
DROP FUNCTION IF EXISTS public.protect_posts_columns() CASCADE;
DROP FUNCTION IF EXISTS public.protect_post_comments_columns() CASCADE;
DROP FUNCTION IF EXISTS public.protect_gallery_columns() CASCADE;
DROP FUNCTION IF EXISTS public.protect_blood_requests_columns() CASCADE;
DROP FUNCTION IF EXISTS public.sanitize_audit_payload(JSONB) CASCADE;
DROP FUNCTION IF EXISTS public.write_audit_log(TEXT, TEXT, TEXT, JSONB, TEXT) CASCADE;

-- -----------------------------------------------------------------------------
-- 4. CORE PRODUCTION TABLES
-- -----------------------------------------------------------------------------

-- 4.1 Batches Table (SZMC MBBS Batches 1 to 50)
CREATE TABLE IF NOT EXISTS public.batches (
  batch_year SMALLINT PRIMARY KEY,
  session TEXT NULL,
  hsc_year SMALLINT NULL,
  special_note TEXT NULL,
  representative_name TEXT NULL,
  representative_profile_id BIGINT NULL,
  registered_count INTEGER NOT NULL DEFAULT 0,
  estimated_total INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.2 Academic Stream Groups & Medical Departments
CREATE TABLE IF NOT EXISTS public.academic_stream_groups (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stream TEXT NOT NULL,
  group_code TEXT NULL,
  expected_group_count INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_academic_stream_group UNIQUE NULLS NOT DISTINCT (stream, group_code)
);

-- 4.3 Alumni Profiles Table (Consolidates 001, 005, 007 into ONE clean definition)
CREATE TABLE IF NOT EXISTS public.alumni_profiles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  role public.user_role NOT NULL DEFAULT 'member',
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'deactivated')),
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 2),
  avatar_url TEXT NULL,
  cover_url TEXT NULL,
  batch_year SMALLINT NOT NULL REFERENCES public.batches(batch_year),
  session TEXT NULL,
  college_roll TEXT NULL,
  academic_stream TEXT NOT NULL DEFAULT 'MBBS',
  academic_group TEXT NULL,
  section TEXT NULL,
  verification_status public.verification_status NOT NULL DEFAULT 'unverified',
  verification_method public.verification_method NOT NULL DEFAULT 'two_vouches',
  vouches_count SMALLINT NOT NULL DEFAULT 0 CHECK (vouches_count >= 0),
  vouch_target_count SMALLINT NOT NULL DEFAULT 2 CHECK (vouch_target_count >= 1),
  verified_at TIMESTAMPTZ NULL,
  verified_by_profile_id BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  phone_ownership_verified BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified_at TIMESTAMPTZ NULL,
  phone_verified_by_profile_id BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  phone_verification_notes TEXT NULL,
  profession TEXT NULL,
  position TEXT NULL,
  institution TEXT NULL,
  cadre TEXT NULL,
  specialty TEXT[] NOT NULL DEFAULT '{}',
  specialty_other TEXT NULL,
  degree TEXT[] NOT NULL DEFAULT '{"MBBS"}',
  city TEXT NOT NULL DEFAULT 'Bogura',
  country TEXT NOT NULL DEFAULT 'Bangladesh',
  latitude DOUBLE PRECISION NULL,
  longitude DOUBLE PRECISION NULL,
  phone TEXT NULL,
  whatsapp TEXT NULL,
  email extensions.citext NULL,
  fb_link TEXT NULL,
  bio TEXT NULL,
  career_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  badges TEXT[] NOT NULL DEFAULT '{}',
  blood_group public.blood_group_type NULL,
  is_registered_donor BOOLEAN NOT NULL DEFAULT FALSE,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  show_contact_to_verified BOOLEAN NOT NULL DEFAULT TRUE,
  posts_count INTEGER NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  search_vector TSVECTOR NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure circular representative foreign key
ALTER TABLE public.batches
  DROP CONSTRAINT IF EXISTS fk_batches_representative_profile,
  ADD CONSTRAINT fk_batches_representative_profile
    FOREIGN KEY (representative_profile_id)
    REFERENCES public.alumni_profiles(id)
    ON DELETE SET NULL;

-- 4.4 Posts Table
CREATE TABLE IF NOT EXISTS public.posts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  author_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  batch_scope SMALLINT NULL REFERENCES public.batches(batch_year) ON DELETE SET NULL,
  category public.post_category_type NOT NULL DEFAULT 'General Update',
  content TEXT NOT NULL CHECK (char_length(trim(content)) >= 1),
  image_url TEXT NULL,
  media_urls TEXT[] NOT NULL DEFAULT '{}',
  images TEXT[] NOT NULL DEFAULT '{}',
  videos TEXT[] NOT NULL DEFAULT '{}',
  likes_count INTEGER NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
  comments_count INTEGER NOT NULL DEFAULT 0 CHECK (comments_count >= 0),
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_edited BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  search_vector TSVECTOR NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.5 Post Comments Table
CREATE TABLE IF NOT EXISTS public.post_comments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(trim(content)) >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.6 Post Likes Table
CREATE TABLE IF NOT EXISTS public.post_likes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_post_likes UNIQUE (post_id, user_id)
);

-- 4.7 Saved Posts Table
CREATE TABLE IF NOT EXISTS public.saved_posts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_saved_posts UNIQUE (post_id, user_id)
);

-- 4.8 Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipient_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  actor_id BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  type public.notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link_url TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.9 Verification Requests & Peer Vouches
CREATE TABLE IF NOT EXISTS public.verification_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id BIGINT UNIQUE NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  method public.verification_method NOT NULL DEFAULT 'two_vouches',
  status public.request_review_status NOT NULL DEFAULT 'pending',
  current_vouches SMALLINT NOT NULL DEFAULT 0,
  target_vouches SMALLINT NOT NULL DEFAULT 2,
  rejection_reason TEXT NULL,
  reviewed_by BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.peer_vouches (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requester_profile_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  voucher_profile_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_peer_vouch UNIQUE (requester_profile_id, voucher_profile_id),
  CONSTRAINT chk_peer_vouch_no_self CHECK (requester_profile_id <> voucher_profile_id)
);

CREATE TABLE IF NOT EXISTS public.admin_doc_submissions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  doc_type public.verification_doc_type NOT NULL,
  document_url TEXT NOT NULL,
  status public.request_review_status NOT NULL DEFAULT 'pending',
  admin_notes TEXT NULL,
  reviewed_by BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.10 Blood Network Tables
CREATE TABLE IF NOT EXISTS public.blood_donors (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id BIGINT UNIQUE NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  blood_group public.blood_group_type NOT NULL,
  availability public.blood_donor_availability NOT NULL DEFAULT 'available',
  city TEXT NOT NULL DEFAULT 'Bogura',
  district TEXT NOT NULL DEFAULT 'Bogura',
  last_donation_date DATE NULL,
  total_donations INTEGER NOT NULL DEFAULT 0,
  alert_preference public.blood_alert_preference NOT NULL DEFAULT 'all_urgent',
  is_listed_publicly BOOLEAN NOT NULL DEFAULT TRUE,
  emergency_notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.blood_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requester_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  patient_name TEXT NOT NULL,
  blood_group public.blood_group_type NOT NULL,
  units_needed SMALLINT NOT NULL DEFAULT 1 CHECK (units_needed >= 1),
  units_fulfilled SMALLINT NOT NULL DEFAULT 0 CHECK (units_fulfilled >= 0),
  urgency public.blood_emergency_level NOT NULL DEFAULT 'urgent',
  status public.blood_request_status NOT NULL DEFAULT 'Active',
  hospital TEXT NOT NULL,
  hospital_address TEXT NULL,
  hospital_bed TEXT NULL,
  district TEXT NOT NULL DEFAULT 'Bogura',
  required_date DATE NOT NULL,
  required_time TIME NULL,
  contact_number TEXT NOT NULL,
  contact_method public.blood_contact_method NOT NULL DEFAULT 'Portal Secure Coordination',
  medical_reason TEXT NULL,
  verified_by_mod_id BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.blood_request_responses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id BIGINT NOT NULL REFERENCES public.blood_requests(id) ON DELETE CASCADE,
  donor_id BIGINT NOT NULL REFERENCES public.blood_donors(id) ON DELETE CASCADE,
  status public.blood_response_status NOT NULL DEFAULT 'offered',
  response_note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_blood_donor_response UNIQUE (request_id, donor_id)
);

-- 4.11 Gallery, Official Notices, Inquiries, Audit Logs & Rate Limits
CREATE TABLE IF NOT EXISTS public.gallery_albums (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NULL,
  cover_photo_url TEXT NOT NULL,
  batch_year SMALLINT NULL REFERENCES public.batches(batch_year) ON DELETE SET NULL,
  category public.gallery_category_type NOT NULL DEFAULT 'campus',
  photo_count INTEGER NOT NULL DEFAULT 0,
  created_by_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.gallery_photos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  album_id BIGINT NOT NULL REFERENCES public.gallery_albums(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  uploader_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE RESTRICT,
  batch_year SMALLINT NULL REFERENCES public.batches(batch_year) ON DELETE SET NULL,
  is_approved BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.official_notices (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ref_no TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  published_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_urgent BOOLEAN NOT NULL DEFAULT FALSE,
  summary TEXT NOT NULL,
  full_content TEXT NOT NULL,
  pdf_url TEXT NULL,
  file_size TEXT NULL,
  signatory_name TEXT NOT NULL,
  signatory_designation TEXT NOT NULL,
  signatory_organization TEXT NOT NULL DEFAULT 'Shaheed Ziaur Rahman Medical College (SZMC Bogura)',
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  target_batch SMALLINT NULL REFERENCES public.batches(batch_year) ON DELETE SET NULL,
  created_by BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contact_inquiries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sender_profile_id BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email extensions.citext NOT NULL,
  phone TEXT NULL,
  batch_year SMALLINT NULL REFERENCES public.batches(batch_year) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'General',
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status public.inquiry_status_type NOT NULL DEFAULT 'new',
  handled_by BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  admin_reply TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_profile_id BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  actor_auth_id UUID NULL,
  action TEXT NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reason TEXT NULL,
  ip_address INET NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 1,
  reset_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 5. HIGH-SPEED INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_alumni_batch ON public.alumni_profiles (batch_year);
CREATE INDEX IF NOT EXISTS idx_alumni_stream ON public.alumni_profiles (academic_stream);
CREATE INDEX IF NOT EXISTS idx_alumni_verification ON public.alumni_profiles (verification_status);
CREATE INDEX IF NOT EXISTS idx_alumni_phone ON public.alumni_profiles (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alumni_email ON public.alumni_profiles (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alumni_auth_uid ON public.alumni_profiles (auth_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_alumni_verified_phone ON public.alumni_profiles (phone) WHERE phone_ownership_verified = TRUE AND phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_author ON public.posts (author_id);
CREATE INDEX IF NOT EXISTS idx_posts_batch ON public.posts (batch_scope) WHERE batch_scope IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_blood_donors_group ON public.blood_donors (blood_group, availability);
CREATE INDEX IF NOT EXISTS idx_blood_requests_status ON public.blood_requests (status, urgency, required_date);

-- -----------------------------------------------------------------------------
-- 6. SECURITY DEFINER HELPER FUNCTIONS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT id FROM public.alumni_profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT role FROM public.alumni_profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT EXISTS (SELECT 1 FROM public.alumni_profiles WHERE auth_user_id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_mod()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT EXISTS (SELECT 1 FROM public.alumni_profiles WHERE auth_user_id = auth.uid() AND role IN ('admin', 'moderator'));
$$;

CREATE OR REPLACE FUNCTION public.is_verified_alumnus()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT EXISTS (SELECT 1 FROM public.alumni_profiles WHERE auth_user_id = auth.uid() AND verification_status = 'verified');
$$;

CREATE OR REPLACE FUNCTION public.check_phone_available(p_phone TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clean TEXT;
  v_exists BOOLEAN;
BEGIN
  IF p_phone IS NULL OR trim(p_phone) = '' THEN RETURN TRUE; END IF;
  v_clean := trim(p_phone);
  SELECT EXISTS (
    SELECT 1 FROM public.alumni_profiles
    WHERE phone = v_clean OR phone = replace(v_clean, '+', '') OR ('+' || phone) = v_clean
  ) INTO v_exists;
  RETURN NOT v_exists;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_key TEXT,
  p_max_attempts INTEGER,
  p_window_seconds INTEGER
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_attempts INTEGER;
BEGIN
  DELETE FROM public.auth_rate_limits WHERE key = p_key AND reset_at <= v_now;
  INSERT INTO public.auth_rate_limits (key, attempts, reset_at)
  VALUES (p_key, 1, v_now + (p_window_seconds || ' seconds')::INTERVAL)
  ON CONFLICT (key) DO UPDATE
  SET attempts = CASE WHEN public.auth_rate_limits.reset_at <= clock_timestamp() THEN 1 ELSE public.auth_rate_limits.attempts + 1 END,
      reset_at = CASE WHEN public.auth_rate_limits.reset_at <= clock_timestamp() THEN clock_timestamp() + (p_window_seconds || ' seconds')::INTERVAL ELSE public.auth_rate_limits.reset_at END
  RETURNING attempts INTO v_attempts;
  IF v_attempts > p_max_attempts THEN RETURN FALSE; END IF;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_alumni_contact_details(p_profile_id BIGINT)
RETURNS TABLE (
  profile_id BIGINT,
  email extensions.citext,
  phone VARCHAR(32),
  whatsapp VARCHAR(32),
  fb_link TEXT,
  college_roll VARCHAR(32)
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_viewer_id BIGINT;
  v_viewer_verified BOOLEAN;
  v_target_public BOOLEAN;
  v_target_show_contact BOOLEAN;
BEGIN
  v_viewer_id := public.current_profile_id();
  IF v_viewer_id IS NULL THEN RETURN; END IF;
  IF v_viewer_id = p_profile_id OR public.is_admin_or_mod() THEN
    RETURN QUERY SELECT p.id, p.email, p.phone::VARCHAR(32), p.whatsapp::VARCHAR(32), p.fb_link, p.college_roll::VARCHAR(32)
    FROM public.alumni_profiles p WHERE p.id = p_profile_id;
    RETURN;
  END IF;
  SELECT p.is_public, p.show_contact_to_verified INTO v_target_public, v_target_show_contact
  FROM public.alumni_profiles p WHERE p.id = p_profile_id;
  IF NOT FOUND OR NOT v_target_public OR NOT v_target_show_contact THEN RETURN; END IF;
  SELECT (p.verification_status = 'verified') INTO v_viewer_verified
  FROM public.alumni_profiles p WHERE p.id = v_viewer_id;
  IF v_viewer_verified = TRUE THEN
    RETURN QUERY SELECT p.id, p.email, p.phone::VARCHAR(32), p.whatsapp::VARCHAR(32), p.fb_link, p.college_roll::VARCHAR(32)
    FROM public.alumni_profiles p WHERE p.id = p_profile_id;
  END IF;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_mod() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_verified_alumnus() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_alumni_contact_details(BIGINT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_phone_available(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

-- -----------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_stream_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alumni_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_vouches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_doc_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_donors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_request_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.alumni_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, auth_user_id, role, full_name, avatar_url, cover_url, batch_year, session,
  academic_stream, academic_group, section, verification_status, verification_method,
  vouches_count, vouch_target_count, verified_at, verified_by_profile_id,
  profession, position, institution, cadre, specialty, specialty_other, degree,
  city, country, latitude, longitude, bio, career_history, badges, blood_group,
  is_public, show_contact_to_verified, posts_count, last_seen_at, search_vector,
  created_at, updated_at
) ON public.alumni_profiles TO authenticated;

GRANT INSERT (
  auth_user_id, full_name, avatar_url, cover_url, batch_year, session,
  academic_stream, academic_group, section, profession, position, institution,
  cadre, specialty, specialty_other, degree, city, country, phone, whatsapp,
  email, fb_link, bio, blood_group, is_registered_donor, is_public,
  show_contact_to_verified
) ON public.alumni_profiles TO authenticated;

GRANT UPDATE (
  full_name, avatar_url, cover_url, batch_year, session, academic_stream,
  academic_group, section, profession, position, institution, cadre, specialty,
  specialty_other, degree, city, country, phone, whatsapp, email, fb_link, bio,
  blood_group, is_registered_donor, is_public, show_contact_to_verified, last_seen_at
) ON public.alumni_profiles TO authenticated;

GRANT ALL ON public.alumni_profiles TO service_role;
GRANT ALL ON public.auth_rate_limits TO service_role;

DROP POLICY IF EXISTS "Batches: Public Read" ON public.batches;
CREATE POLICY "Batches: Public Read" ON public.batches FOR SELECT USING (true);

DROP POLICY IF EXISTS "Stream Groups: Public Read" ON public.academic_stream_groups;
CREATE POLICY "Stream Groups: Public Read" ON public.academic_stream_groups FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Alumni: Read Visible" ON public.alumni_profiles;
CREATE POLICY "Alumni: Read Visible" ON public.alumni_profiles FOR SELECT TO authenticated USING (is_public = true OR auth_user_id = auth.uid() OR public.is_admin_or_mod());

DROP POLICY IF EXISTS "Alumni: Update Own" ON public.alumni_profiles;
CREATE POLICY "Alumni: Update Own" ON public.alumni_profiles FOR UPDATE TO authenticated USING (auth_user_id = auth.uid() OR public.is_admin_or_mod());

DROP POLICY IF EXISTS "Alumni: Insert Own" ON public.alumni_profiles;
CREATE POLICY "Alumni: Insert Own" ON public.alumni_profiles FOR INSERT TO authenticated WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Posts: Read Visible" ON public.posts;
CREATE POLICY "Posts: Read Visible" ON public.posts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Posts: Insert Own" ON public.posts;
CREATE POLICY "Posts: Insert Own" ON public.posts FOR INSERT TO authenticated WITH CHECK (author_id = public.current_profile_id());

DROP POLICY IF EXISTS "Posts: Update Own" ON public.posts;
CREATE POLICY "Posts: Update Own" ON public.posts FOR UPDATE TO authenticated USING (author_id = public.current_profile_id() OR public.is_admin_or_mod());

DROP POLICY IF EXISTS "Posts: Delete Own" ON public.posts;
CREATE POLICY "Posts: Delete Own" ON public.posts FOR DELETE TO authenticated USING (author_id = public.current_profile_id() OR public.is_admin_or_mod());

DROP POLICY IF EXISTS "Comments: Read All" ON public.post_comments;
CREATE POLICY "Comments: Read All" ON public.post_comments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Comments: Insert Own" ON public.post_comments;
CREATE POLICY "Comments: Insert Own" ON public.post_comments FOR INSERT TO authenticated WITH CHECK (author_id = public.current_profile_id());

DROP POLICY IF EXISTS "Comments: Delete Own" ON public.post_comments;
CREATE POLICY "Comments: Delete Own" ON public.post_comments FOR DELETE TO authenticated USING (author_id = public.current_profile_id() OR public.is_admin_or_mod());

DROP POLICY IF EXISTS "Likes: Read All" ON public.post_likes;
CREATE POLICY "Likes: Read All" ON public.post_likes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Likes: Manage Own" ON public.post_likes;
CREATE POLICY "Likes: Manage Own" ON public.post_likes FOR ALL TO authenticated USING (user_id = public.current_profile_id());

DROP POLICY IF EXISTS "Saved: Manage Own" ON public.saved_posts;
CREATE POLICY "Saved: Manage Own" ON public.saved_posts FOR ALL TO authenticated USING (user_id = public.current_profile_id());

DROP POLICY IF EXISTS "Blood Requests: Read Active" ON public.blood_requests;
CREATE POLICY "Blood Requests: Read Active" ON public.blood_requests FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Blood Requests: Insert" ON public.blood_requests;
CREATE POLICY "Blood Requests: Insert" ON public.blood_requests FOR INSERT TO authenticated WITH CHECK (requester_id = public.current_profile_id());

DROP POLICY IF EXISTS "Blood Donors: Read" ON public.blood_donors;
CREATE POLICY "Blood Donors: Read" ON public.blood_donors FOR SELECT TO authenticated USING (is_listed_publicly = true OR profile_id = public.current_profile_id() OR public.is_admin_or_mod());

DROP POLICY IF EXISTS "Blood Donors: Upsert Own" ON public.blood_donors;
CREATE POLICY "Blood Donors: Upsert Own" ON public.blood_donors FOR ALL TO authenticated USING (profile_id = public.current_profile_id());

DROP POLICY IF EXISTS "Gallery: Read All" ON public.gallery_albums;
CREATE POLICY "Gallery: Read All" ON public.gallery_albums FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Gallery Photos: Read Approved" ON public.gallery_photos;
CREATE POLICY "Gallery Photos: Read Approved" ON public.gallery_photos FOR SELECT TO authenticated USING (is_approved = true OR uploader_id = public.current_profile_id() OR public.is_admin_or_mod());

DROP POLICY IF EXISTS "Notices: Public Read" ON public.official_notices;
CREATE POLICY "Notices: Public Read" ON public.official_notices FOR SELECT USING (is_published = true OR public.is_admin_or_mod());

DROP POLICY IF EXISTS "Vouches: Read Related" ON public.peer_vouches;
CREATE POLICY "Vouches: Read Related" ON public.peer_vouches FOR SELECT TO authenticated USING (requester_profile_id = public.current_profile_id() OR voucher_profile_id = public.current_profile_id() OR public.is_admin_or_mod());

DROP POLICY IF EXISTS "Vouches: Give Vouch" ON public.peer_vouches;
CREATE POLICY "Vouches: Give Vouch" ON public.peer_vouches FOR INSERT TO authenticated WITH CHECK (voucher_profile_id = public.current_profile_id() AND public.is_verified_alumnus());

-- -----------------------------------------------------------------------------
-- 8. STORAGE BUCKETS & POLICIES (NO "ALTER TABLE storage.objects")
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('post-media', 'post-media', true, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']),
  ('gallery', 'gallery', true, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('verification-documents', 'verification-documents', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Avatars: Public Access" ON storage.objects;
CREATE POLICY "Avatars: Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Avatars: Authenticated Upload" ON storage.objects;
CREATE POLICY "Avatars: Authenticated Upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND owner = auth.uid());

DROP POLICY IF EXISTS "Avatars: Authenticated Update" ON storage.objects;
CREATE POLICY "Avatars: Authenticated Update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (owner = auth.uid() OR public.is_admin_or_mod())) WITH CHECK (bucket_id = 'avatars' AND (owner = auth.uid() OR public.is_admin_or_mod()));

DROP POLICY IF EXISTS "Avatars: Authenticated Delete" ON storage.objects;
CREATE POLICY "Avatars: Authenticated Delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND (owner = auth.uid() OR public.is_admin_or_mod()));

DROP POLICY IF EXISTS "Post Media: Public Access" ON storage.objects;
CREATE POLICY "Post Media: Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'post-media');

DROP POLICY IF EXISTS "Post Media: Authenticated Upload" ON storage.objects;
CREATE POLICY "Post Media: Authenticated Upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'post-media' AND owner = auth.uid());

DROP POLICY IF EXISTS "Post Media: Authenticated Update" ON storage.objects;
CREATE POLICY "Post Media: Authenticated Update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'post-media' AND (owner = auth.uid() OR public.is_admin_or_mod())) WITH CHECK (bucket_id = 'post-media' AND (owner = auth.uid() OR public.is_admin_or_mod()));

DROP POLICY IF EXISTS "Post Media: Authenticated Delete" ON storage.objects;
CREATE POLICY "Post Media: Authenticated Delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'post-media' AND (owner = auth.uid() OR public.is_admin_or_mod()));

DROP POLICY IF EXISTS "Gallery: Public Access" ON storage.objects;
CREATE POLICY "Gallery: Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'gallery');

DROP POLICY IF EXISTS "Gallery: Authenticated Upload" ON storage.objects;
CREATE POLICY "Gallery: Authenticated Upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'gallery' AND owner = auth.uid());

DROP POLICY IF EXISTS "Gallery: Authenticated Update" ON storage.objects;
CREATE POLICY "Gallery: Authenticated Update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'gallery' AND (owner = auth.uid() OR public.is_admin_or_mod())) WITH CHECK (bucket_id = 'gallery' AND (owner = auth.uid() OR public.is_admin_or_mod()));

DROP POLICY IF EXISTS "Gallery: Authenticated Delete" ON storage.objects;
CREATE POLICY "Gallery: Authenticated Delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'gallery' AND (owner = auth.uid() OR public.is_admin_or_mod()));

DROP POLICY IF EXISTS "Verification Documents: Select" ON storage.objects;
CREATE POLICY "Verification Documents: Select" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'verification-documents' AND ((auth.uid() = owner) OR (auth.uid() IS NOT NULL AND auth.uid()::text = (storage.foldername(name))[1]) OR public.is_admin_or_mod())
);

DROP POLICY IF EXISTS "Verification Documents: Upload" ON storage.objects;
CREATE POLICY "Verification Documents: Upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'verification-documents' AND owner = auth.uid()
);

DROP POLICY IF EXISTS "Verification Documents: Delete" ON storage.objects;
CREATE POLICY "Verification Documents: Delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'verification-documents' AND ((auth.uid() = owner) OR (auth.uid() IS NOT NULL AND auth.uid()::text = (storage.foldername(name))[1]) OR public.is_admin_or_mod())
);

-- -----------------------------------------------------------------------------
-- 9. SEED DATA (SZMC MBBS BATCHES 1 TO 50 & MEDICAL DISCIPLINES)
-- -----------------------------------------------------------------------------
INSERT INTO public.batches (batch_year, session, hsc_year, special_note, representative_name, representative_profile_id, registered_count, estimated_total)
SELECT
  b.batch_num::SMALLINT AS batch_year,
  (1990 + b.batch_num)::TEXT || '-' || LPAD(((1990 + b.batch_num + 1) % 100)::TEXT, 2, '0') AS session,
  (1990 + b.batch_num)::SMALLINT AS hsc_year,
  CASE
    WHEN b.batch_num = 1 THEN 'Pioneer MBBS Batch (SZMC-01, Session 1991-92)'
    WHEN b.batch_num = 5 THEN '5th Batch (SZMC-05, Session 1995-96)'
    WHEN b.batch_num = 10 THEN '10th Milestone Batch (SZMC-10, Session 2000-01)'
    WHEN b.batch_num = 15 THEN '15th Batch (SZMC-15, Session 2005-06)'
    WHEN b.batch_num = 20 THEN '20th Batch (SZMC-20, Session 2010-11)'
    WHEN b.batch_num = 25 THEN 'Silver Jubilee Batch (SZMC-25, Session 2015-16)'
    WHEN b.batch_num = 30 THEN '30th Batch (SZMC-30, Session 2020-21)'
    WHEN b.batch_num = 35 THEN 'Current MBBS Session (SZMC-35, Session 2025-26)'
    ELSE 'MBBS Batch SZMC-' || LPAD(b.batch_num::TEXT, 2, '0')
  END AS special_note,
  'SZMC-' || LPAD(b.batch_num::TEXT, 2, '0') || ' Batch Coordinator' AS representative_name,
  NULL AS representative_profile_id,
  0 AS registered_count,
  CASE WHEN b.batch_num <= 10 THEN 100 WHEN b.batch_num <= 25 THEN 150 ELSE 200 END AS estimated_total
FROM generate_series(1, 50) AS b(batch_num)
ON CONFLICT (batch_year) DO UPDATE SET
  session = EXCLUDED.session,
  hsc_year = EXCLUDED.hsc_year,
  special_note = COALESCE(public.batches.special_note, EXCLUDED.special_note),
  representative_name = COALESCE(public.batches.representative_name, EXCLUDED.representative_name),
  estimated_total = COALESCE(public.batches.estimated_total, EXCLUDED.estimated_total),
  updated_at = now();

INSERT INTO public.academic_stream_groups (stream, group_code, expected_group_count, is_active)
VALUES
  -- public.academic_stream_type only allows Science / Humanities / Business Studies.
  ('Science', NULL, 17, TRUE),
  ('Humanities', 'G', 4, TRUE),
  ('Humanities', 'H', 4, TRUE),
  ('Humanities', 'L', 4, TRUE),
  ('Humanities', 'W', 4, TRUE),
  ('Business Studies', 'A', 6, TRUE),
  ('Business Studies', 'B', 6, TRUE),
  ('Business Studies', 'C', 6, TRUE),
  ('Business Studies', 'D', 6, TRUE),
  ('Business Studies', 'E', 6, TRUE),
  ('Business Studies', 'F', 6, TRUE)
ON CONFLICT (stream, group_code) DO UPDATE SET
  expected_group_count = EXCLUDED.expected_group_count,
  is_active = EXCLUDED.is_active,
  updated_at = now();

INSERT INTO public.official_notices (ref_no, title, category, published_date, is_urgent, summary, full_content, signatory_name, signatory_designation, signatory_organization, is_published)
VALUES
  (
    'SZMC/ALUMNI-2026/001',
    'Official Grand Reunion & Academic Conference 2026',
    'Reunion',
    CURRENT_DATE,
    TRUE,
    'Grand Reunion celebrating 35 MBBS Batches (1991–present) at SZMC Campus, Bogura.',
    E'Shaheed Ziaur Rahman Medical College (SZMC Bogura) Alumni Association warmly invites all registered alumni from Batch 01 to Batch 35 to the Grand Reunion and National Medical Conference.\n\nDate: December 2026\nVenue: SZMCH Auditorium & Main Campus Grounds, Bogura\n\nRegistration and peer verification can now be completed through the online portal.',
    'Dr. Tariqul Islam',
    'President, Alumni Association',
    'Shaheed Ziaur Rahman Medical College (SZMC Bogura)',
    TRUE
  ),
  (
    'SZMC/ALUMNI-2026/002',
    'Emergency Doctor Blood Network 24/7 Activation',
    'General',
    CURRENT_DATE,
    TRUE,
    'Active blood matching network connecting 35 MBBS batches across Bangladesh.',
    E'The SZMC Alumni Emergency Blood Network is active nationwide. Alumni physicians and medical officers are requested to verify their blood donor profile and availability status to support critical emergency blood matching.',
    'Dr. Kazi Rezwan',
    'Coordinator, Blood Network Committee',
    'Shaheed Ziaur Rahman Medical College (SZMC Bogura)',
    TRUE
  )
ON CONFLICT (ref_no) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  is_urgent = EXCLUDED.is_urgent,
  summary = EXCLUDED.summary,
  full_content = EXCLUDED.full_content,
  signatory_name = EXCLUDED.signatory_name,
  signatory_designation = EXCLUDED.signatory_designation,
  signatory_organization = EXCLUDED.signatory_organization,
  is_published = EXCLUDED.is_published,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- 10. REALTIME ENABLEMENT & PERFORMANCE TUNING
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

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

CREATE INDEX IF NOT EXISTS idx_posts_created_at_desc ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON public.posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_category ON public.posts(category);
CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON public.post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_composite ON public.post_likes(post_id, user_id);
CREATE INDEX IF NOT EXISTS idx_saved_posts_composite ON public.saved_posts(user_id, post_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON public.notifications(recipient_id, unread);
CREATE INDEX IF NOT EXISTS idx_blood_requests_status_created ON public.blood_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blood_donors_availability ON public.blood_donors(availability);
CREATE INDEX IF NOT EXISTS idx_alumni_profiles_batch_year ON public.alumni_profiles(batch_year);
CREATE INDEX IF NOT EXISTS idx_alumni_profiles_auth_user ON public.alumni_profiles(auth_user_id);

-- -----------------------------------------------------------------------------
-- 13. ADMIN-CONTROLLED FEATURE FLAGS (verification portal visibility)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_feature_flags (
  key TEXT PRIMARY KEY CHECK (char_length(trim(key)) BETWEEN 1 AND 64),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_feature_flags ENABLE ROW LEVEL SECURITY;

INSERT INTO public.app_feature_flags (key, enabled, description)
VALUES
  ('member_verification_portal', FALSE,
   'Show the member-facing verification UI (Verification Center, peer vouches, badges, verification settings). When FALSE, verification is admin-panel only.'),
  ('global_verification_gate', TRUE,
   'Enforce the verification gate across website auth and gated features.')
ON CONFLICT (key) DO NOTHING;

REVOKE ALL ON public.app_feature_flags FROM PUBLIC;
GRANT SELECT ON public.app_feature_flags TO anon, authenticated;
GRANT INSERT, UPDATE ON public.app_feature_flags TO authenticated;
GRANT ALL ON public.app_feature_flags TO service_role;

DROP POLICY IF EXISTS "feature_flags_select_public" ON public.app_feature_flags;
CREATE POLICY "feature_flags_select_public"
  ON public.app_feature_flags FOR SELECT
  TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "feature_flags_insert_admin" ON public.app_feature_flags;
CREATE POLICY "feature_flags_insert_admin"
  ON public.app_feature_flags FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_mod());

DROP POLICY IF EXISTS "feature_flags_update_admin" ON public.app_feature_flags;
CREATE POLICY "feature_flags_update_admin"
  ON public.app_feature_flags FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_mod())
  WITH CHECK (public.is_admin_or_mod());

DROP TRIGGER IF EXISTS trg_app_feature_flags_updated_at ON public.app_feature_flags;
CREATE TRIGGER trg_app_feature_flags_updated_at
  BEFORE UPDATE ON public.app_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMIT;
