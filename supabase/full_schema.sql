-- =============================================================================
-- SHAHEED ZIAUR RAHMAN MEDICAL COLLEGE (SZMC BOGURA) ALUMNI NETWORK
-- MASTER PRODUCTION DATABASE SETUP & MIGRATION SCRIPT
-- 100% IDEMPOTENT & NON-DESTRUCTIVE (SAFE FOR EXISTING SUPABASE DATABASES)
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
-- 2. ENUM TYPES (Idempotent Creation & Safe Expansion)
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
    'convocation',
    'sports',
    'cultural',
    'all'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notice_category_type AS ENUM ('Membership', 'Reunion', 'Scholarship', 'General', 'AGM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.academic_stream_type AS ENUM ('Science', 'Humanities', 'Business Studies');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Safe additive expansion of academic stream values for medical colleges
ALTER TYPE public.academic_stream_type ADD VALUE IF NOT EXISTS 'MBBS';
ALTER TYPE public.academic_stream_type ADD VALUE IF NOT EXISTS 'BDS';
ALTER TYPE public.academic_stream_type ADD VALUE IF NOT EXISTS 'Postgraduate';

-- -----------------------------------------------------------------------------
-- 3. CORE TABLES (Matches Existing Supabase Tables without Overwriting Data)
-- -----------------------------------------------------------------------------

-- 3.1 Academic Stream Groups
CREATE TABLE IF NOT EXISTS public.academic_stream_groups (
  id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stream public.academic_stream_type NOT NULL,
  group_code VARCHAR NULL,
  expected_group_count SMALLINT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.2 Batches
CREATE TABLE IF NOT EXISTS public.batches (
  batch_year SMALLINT PRIMARY KEY,
  session VARCHAR UNIQUE NULL,
  hsc_year SMALLINT NULL,
  special_note TEXT NULL,
  representative_name TEXT NULL,
  representative_profile_id BIGINT NULL,
  registered_count INTEGER NOT NULL DEFAULT 0,
  estimated_total INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.3 Alumni Profiles
CREATE TABLE IF NOT EXISTS public.alumni_profiles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  role public.user_role NOT NULL DEFAULT 'member',
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 2),
  avatar_url TEXT NULL,
  cover_url TEXT NULL,
  batch_year SMALLINT NOT NULL REFERENCES public.batches(batch_year),
  session TEXT NULL,
  academic_stream public.academic_stream_type NULL,
  academic_group VARCHAR NULL,
  section VARCHAR NULL,
  verification_status public.verification_status NOT NULL DEFAULT 'unverified',
  verification_method public.verification_method NULL,
  vouches_count SMALLINT NOT NULL DEFAULT 0 CHECK (vouches_count >= 0),
  vouch_target_count SMALLINT NOT NULL DEFAULT 2 CHECK (vouch_target_count >= 1),
  verified_at TIMESTAMPTZ NULL,
  verified_by_profile_id BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  profession TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  institution TEXT NOT NULL DEFAULT '',
  cadre TEXT NULL,
  specialty TEXT[] NOT NULL DEFAULT '{}',
  specialty_other TEXT NULL,
  degree TEXT[] NOT NULL DEFAULT '{"MBBS"}',
  city TEXT NOT NULL DEFAULT 'Bogura',
  country TEXT NOT NULL DEFAULT 'Bangladesh',
  latitude DOUBLE PRECISION NULL,
  longitude DOUBLE PRECISION NULL,
  bio TEXT NULL,
  career_history TEXT[] NOT NULL DEFAULT '{}',
  badges TEXT[] NOT NULL DEFAULT '{}',
  blood_group public.blood_group_type NULL,
  college_roll VARCHAR NULL,
  email extensions.citext UNIQUE NULL,
  phone VARCHAR UNIQUE NULL,
  whatsapp VARCHAR NULL,
  fb_link TEXT NULL,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  show_contact_to_verified BOOLEAN NOT NULL DEFAULT TRUE,
  posts_count INTEGER NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ NULL DEFAULT NOW(),
  search_vector TSVECTOR NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  phone_ownership_verified BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified_at TIMESTAMPTZ NULL,
  phone_verified_by_profile_id BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  phone_verification_notes TEXT NULL
);

-- Ensure circular representative FK for batches
ALTER TABLE public.batches
  DROP CONSTRAINT IF EXISTS fk_batches_representative_profile,
  ADD CONSTRAINT fk_batches_representative_profile
    FOREIGN KEY (representative_profile_id)
    REFERENCES public.alumni_profiles(id)
    ON DELETE SET NULL;

-- 3.4 Posts
CREATE TABLE IF NOT EXISTS public.posts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  author_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(trim(content)) >= 1),
  category public.post_category_type NOT NULL DEFAULT 'General Update',
  images TEXT[] NOT NULL DEFAULT '{}',
  videos TEXT[] NOT NULL DEFAULT '{}',
  likes_count INTEGER NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
  comments_count INTEGER NOT NULL DEFAULT 0 CHECK (comments_count >= 0),
  is_edited BOOLEAN NOT NULL DEFAULT FALSE,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  batch_scope SMALLINT NULL REFERENCES public.batches(batch_year) ON DELETE SET NULL
);

-- 3.5 Post Comments
CREATE TABLE IF NOT EXISTS public.post_comments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  parent_comment_id BIGINT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(trim(content)) >= 1),
  likes_count INTEGER NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.6 Post Likes
CREATE TABLE IF NOT EXISTS public.post_likes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_post_user_like UNIQUE (post_id, user_id)
);

-- 3.7 Saved Posts
CREATE TABLE IF NOT EXISTS public.saved_posts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  post_id BIGINT NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_saved_post UNIQUE (user_id, post_id)
);

-- 3.8 Admin Document Submissions
CREATE TABLE IF NOT EXISTS public.admin_doc_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  batch_year SMALLINT NOT NULL REFERENCES public.batches(batch_year),
  college_roll VARCHAR NOT NULL DEFAULT '',
  academic_stream public.academic_stream_type NULL,
  academic_group VARCHAR NULL,
  doc_type public.verification_doc_type NOT NULL,
  doc_type_label VARCHAR NOT NULL DEFAULT '',
  storage_object_path TEXT NOT NULL,
  status public.request_review_status NOT NULL DEFAULT 'pending',
  reviewed_by BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  admin_note TEXT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.9 Verification Requests
CREATE TABLE IF NOT EXISTS public.verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  batch_year SMALLINT NOT NULL REFERENCES public.batches(batch_year),
  college_roll VARCHAR NOT NULL DEFAULT '',
  academic_stream public.academic_stream_type NULL,
  academic_group VARCHAR NULL,
  section VARCHAR NULL,
  message TEXT NULL,
  status public.request_review_status NOT NULL DEFAULT 'pending',
  target_vouches SMALLINT NOT NULL DEFAULT 2,
  current_vouches SMALLINT NOT NULL DEFAULT 0,
  id_doc_submission_id UUID NULL REFERENCES public.admin_doc_submissions(id) ON DELETE SET NULL,
  admin_note TEXT NULL,
  reviewed_by BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.10 Peer Vouches
CREATE TABLE IF NOT EXISTS public.peer_vouches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_request_id UUID NOT NULL REFERENCES public.verification_requests(id) ON DELETE CASCADE,
  requester_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  voucher_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  voucher_batch SMALLINT NOT NULL,
  comment TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_peer_vouch_pair UNIQUE (verification_request_id, voucher_id),
  CONSTRAINT chk_no_self_vouch CHECK (requester_id <> voucher_id)
);

-- 3.11 Blood Donors
CREATE TABLE IF NOT EXISTS public.blood_donors (
  user_id BIGINT PRIMARY KEY REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  blood_group public.blood_group_type NOT NULL,
  is_registered_donor BOOLEAN NOT NULL DEFAULT TRUE,
  availability public.blood_donor_availability NOT NULL DEFAULT 'available',
  preferred_area TEXT NOT NULL DEFAULT 'Bogura',
  city TEXT NOT NULL DEFAULT 'Bogura',
  last_donation_date DATE NULL,
  emergency_alert_preference public.blood_alert_preference NOT NULL DEFAULT 'all_urgent',
  donation_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.12 Blood Requests
CREATE TABLE IF NOT EXISTS public.blood_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  blood_group public.blood_group_type NOT NULL,
  units_required SMALLINT NOT NULL DEFAULT 1 CHECK (units_required >= 1),
  units_fulfilled SMALLINT NOT NULL DEFAULT 0 CHECK (units_fulfilled >= 0),
  hospital_name TEXT NOT NULL,
  hospital_area TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT 'Bogura',
  required_datetime TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  emergency_level public.blood_emergency_level NOT NULL DEFAULT 'urgent',
  contact_method public.blood_contact_method NOT NULL DEFAULT 'Portal Secure Coordination',
  coordination_ref VARCHAR NULL,
  description TEXT NOT NULL DEFAULT '',
  patient_relation VARCHAR NULL,
  status public.blood_request_status NOT NULL DEFAULT 'Active',
  moderation_note TEXT NULL,
  verified_by_admin_id BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.13 Blood Request Responses
CREATE TABLE IF NOT EXISTS public.blood_request_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.blood_requests(id) ON DELETE CASCADE,
  donor_user_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  status public.blood_response_status NOT NULL DEFAULT 'offered',
  note TEXT NULL,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_blood_donor_response UNIQUE (request_id, donor_user_id)
);

-- 3.14 Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipient_id BIGINT NOT NULL REFERENCES public.alumni_profiles(id) ON DELETE CASCADE,
  actor_id BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  type public.notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  unread BOOLEAN NOT NULL DEFAULT TRUE,
  target_route TEXT NULL,
  post_id BIGINT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  blood_request_id UUID NULL REFERENCES public.blood_requests(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.15 Gallery Albums
CREATE TABLE IF NOT EXISTS public.gallery_albums (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NULL,
  category public.gallery_category_type NOT NULL DEFAULT 'campus',
  event_date_label VARCHAR NOT NULL DEFAULT '',
  location TEXT NULL,
  batch_year SMALLINT NULL REFERENCES public.batches(batch_year) ON DELETE SET NULL,
  cover_url TEXT NOT NULL DEFAULT '',
  photos_count INTEGER NOT NULL DEFAULT 0,
  created_by_id BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.16 Gallery Photos
CREATE TABLE IF NOT EXISTS public.gallery_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id BIGINT NOT NULL REFERENCES public.gallery_albums(id) ON DELETE CASCADE,
  uploader_id BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  storage_object_path TEXT NULL,
  caption TEXT NULL,
  batch_year SMALLINT NULL REFERENCES public.batches(batch_year) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  media_type VARCHAR NOT NULL DEFAULT 'photo',
  file_size VARCHAR NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  is_approved BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.17 Official Notices
CREATE TABLE IF NOT EXISTS public.official_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_no VARCHAR UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category public.notice_category_type NOT NULL DEFAULT 'General',
  published_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_urgent BOOLEAN NOT NULL DEFAULT FALSE,
  summary TEXT NOT NULL DEFAULT '',
  full_content TEXT NOT NULL,
  pdf_url TEXT NULL,
  file_size VARCHAR NULL,
  signatory_name TEXT NOT NULL DEFAULT 'Alumni Executive Council',
  signatory_designation TEXT NOT NULL DEFAULT 'General Secretary',
  signatory_organization TEXT NOT NULL DEFAULT 'SZMC Alumni Association',
  created_by BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.18 Contact Inquiries
CREATE TABLE IF NOT EXISTS public.contact_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_profile_id BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  batch_year SMALLINT NULL REFERENCES public.batches(batch_year) ON DELETE SET NULL,
  email extensions.citext NOT NULL,
  phone VARCHAR NULL,
  subject VARCHAR NOT NULL DEFAULT 'General Inquiry',
  message TEXT NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'new',
  handled_by BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  admin_notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.19 Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_profile_id BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  actor_auth_id UUID NULL,
  actor_role public.user_role NULL,
  action VARCHAR NOT NULL,
  entity_table VARCHAR NOT NULL,
  entity_id TEXT NOT NULL,
  old_values JSONB NULL,
  new_values JSONB NULL,
  reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.20 Auth Rate Limits
CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 1,
  reset_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 4. NON-DESTRUCTIVE ADDITIVE COLUMNS (Harmonizes Schema & Code Queries)
-- -----------------------------------------------------------------------------

-- alumni_profiles additive fields & registration defaults
ALTER TABLE public.alumni_profiles ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.alumni_profiles ADD COLUMN IF NOT EXISTS is_registered_donor BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.alumni_profiles ADD COLUMN IF NOT EXISTS phone_ownership_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.alumni_profiles ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ NULL;
ALTER TABLE public.alumni_profiles ADD COLUMN IF NOT EXISTS phone_verified_by_profile_id BIGINT NULL;
ALTER TABLE public.alumni_profiles ADD COLUMN IF NOT EXISTS phone_verification_notes TEXT NULL;

-- Ensure fields removed from registration form have defaults and are nullable
ALTER TABLE public.alumni_profiles ALTER COLUMN college_roll DROP NOT NULL;
ALTER TABLE public.alumni_profiles ALTER COLUMN whatsapp DROP NOT NULL;
ALTER TABLE public.alumni_profiles ALTER COLUMN position SET DEFAULT '';
ALTER TABLE public.alumni_profiles ALTER COLUMN profession SET DEFAULT 'Medical Doctor';
ALTER TABLE public.alumni_profiles ALTER COLUMN institution SET DEFAULT 'Shaheed Ziaur Rahman Medical College Hospital';
ALTER TABLE public.alumni_profiles ALTER COLUMN specialty SET DEFAULT '{}';
ALTER TABLE public.alumni_profiles ALTER COLUMN degree SET DEFAULT '{"MBBS"}';
ALTER TABLE public.alumni_profiles ALTER COLUMN city SET DEFAULT 'Bogura';
ALTER TABLE public.alumni_profiles ALTER COLUMN country SET DEFAULT 'Bangladesh';

-- posts additive fields
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS images TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS videos TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS image_url TEXT NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS media_urls TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS external_link TEXT NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS external_metadata JSONB NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS batch_scope SMALLINT NULL;

-- gallery_albums additive fields
ALTER TABLE public.gallery_albums ADD COLUMN IF NOT EXISTS photos_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.gallery_albums ADD COLUMN IF NOT EXISTS photo_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.gallery_albums ADD COLUMN IF NOT EXISTS cover_url TEXT NOT NULL DEFAULT '';
ALTER TABLE public.gallery_albums ADD COLUMN IF NOT EXISTS cover_photo_url TEXT NOT NULL DEFAULT '';

-- gallery_photos additive fields
ALTER TABLE public.gallery_photos ADD COLUMN IF NOT EXISTS url TEXT NULL;
ALTER TABLE public.gallery_photos ADD COLUMN IF NOT EXISTS photo_url TEXT NULL;
ALTER TABLE public.gallery_photos ADD COLUMN IF NOT EXISTS storage_object_path TEXT NULL;

-- blood_donors additive fields
ALTER TABLE public.blood_donors ADD COLUMN IF NOT EXISTS profile_id BIGINT NULL;
DO $$ BEGIN
  UPDATE public.blood_donors SET profile_id = user_id WHERE profile_id IS NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- blood_requests additive fields
ALTER TABLE public.blood_requests ADD COLUMN IF NOT EXISTS patient_name TEXT NULL;
ALTER TABLE public.blood_requests ADD COLUMN IF NOT EXISTS units_needed SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE public.blood_requests ADD COLUMN IF NOT EXISTS hospital TEXT NULL;
ALTER TABLE public.blood_requests ADD COLUMN IF NOT EXISTS district TEXT NOT NULL DEFAULT 'Bogura';
ALTER TABLE public.blood_requests ADD COLUMN IF NOT EXISTS required_date DATE NULL;
ALTER TABLE public.blood_requests ADD COLUMN IF NOT EXISTS contact_number TEXT NULL;

-- official_notices additive fields
ALTER TABLE public.official_notices ADD COLUMN IF NOT EXISTS target_batch SMALLINT NULL;

-- -----------------------------------------------------------------------------
-- 5. PERFORMANCE INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_alumni_profiles_auth_user_id ON public.alumni_profiles(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_alumni_profiles_batch_year ON public.alumni_profiles(batch_year);
CREATE INDEX IF NOT EXISTS idx_alumni_profiles_phone ON public.alumni_profiles(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alumni_profiles_email ON public.alumni_profiles(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alumni_profiles_verification_status ON public.alumni_profiles(verification_status);
CREATE INDEX IF NOT EXISTS idx_alumni_profiles_role ON public.alumni_profiles(role);
CREATE INDEX IF NOT EXISTS idx_alumni_profiles_blood_group ON public.alumni_profiles(blood_group) WHERE blood_group IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_author_id ON public.posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at_desc ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_batch_scope ON public.posts(batch_scope) WHERE batch_scope IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON public.post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON public.post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_saved_posts_user_id ON public.saved_posts(user_id);

CREATE INDEX IF NOT EXISTS idx_blood_donors_blood_group ON public.blood_donors(blood_group);
CREATE INDEX IF NOT EXISTS idx_blood_donors_availability ON public.blood_donors(availability);
CREATE INDEX IF NOT EXISTS idx_blood_requests_status ON public.blood_requests(status);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON public.notifications(recipient_id, unread);

-- -----------------------------------------------------------------------------
-- 6. SECURITY HELPER FUNCTIONS & RPC ENDPOINTS (SECURITY DEFINER)
-- -----------------------------------------------------------------------------

-- 6.1 Current authenticated profile ID
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT id
  FROM public.alumni_profiles
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated, service_role;

-- 6.2 Current user role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT role
  FROM public.alumni_profiles
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;

-- 6.3 Is Admin check
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
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- 6.4 Is Admin or Moderator check
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
      AND role IN ('admin', 'moderator')
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_or_mod() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_or_mod() TO authenticated, service_role;

-- 6.5 Is Verified Alumnus check
CREATE OR REPLACE FUNCTION public.is_verified_alumnus()
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
      AND verification_status = 'verified'
  );
$$;

REVOKE ALL ON FUNCTION public.is_verified_alumnus() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_verified_alumnus() TO authenticated, service_role;

-- 6.6 Current user's batch year
CREATE OR REPLACE FUNCTION public.current_user_batch_year()
RETURNS SMALLINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT batch_year
  FROM public.alumni_profiles
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_user_batch_year() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_batch_year() TO authenticated, service_role;

-- 6.7 Secure Contact Details RPC (Redacts PII unless authorized)
CREATE OR REPLACE FUNCTION public.get_alumni_contact_details(p_profile_id BIGINT)
RETURNS TABLE (
  profile_id BIGINT,
  email extensions.citext,
  phone VARCHAR,
  whatsapp VARCHAR,
  fb_link TEXT,
  college_roll VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_viewer_id BIGINT;
  v_is_admin BOOLEAN := FALSE;
  v_is_verified BOOLEAN := FALSE;
  v_show_to_verified BOOLEAN := TRUE;
BEGIN
  v_viewer_id := public.current_profile_id();

  IF v_viewer_id IS NOT NULL THEN
    SELECT (role = 'admin'), (verification_status = 'verified')
    INTO v_is_admin, v_is_verified
    FROM public.alumni_profiles
    WHERE id = v_viewer_id;
  END IF;

  SELECT show_contact_to_verified
  INTO v_show_to_verified
  FROM public.alumni_profiles
  WHERE id = p_profile_id;

  -- Allow if self, if admin, or if verified viewer and profile allows contact viewing
  IF (v_viewer_id = p_profile_id) OR v_is_admin OR (v_is_verified AND v_show_to_verified) THEN
    RETURN QUERY
    SELECT
      id AS profile_id,
      p.email,
      p.phone,
      p.whatsapp,
      p.fb_link,
      p.college_roll
    FROM public.alumni_profiles p
    WHERE p.id = p_profile_id;
  ELSE
    RETURN QUERY
    SELECT
      id AS profile_id,
      NULL::extensions.citext AS email,
      NULL::VARCHAR AS phone,
      NULL::VARCHAR AS whatsapp,
      NULL::TEXT AS fb_link,
      NULL::VARCHAR AS college_roll
    FROM public.alumni_profiles p
    WHERE p.id = p_profile_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_alumni_contact_details(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_alumni_contact_details(BIGINT) TO authenticated, service_role;

-- 6.8 Anti-Enumeration Phone Uniqueness Checker
CREATE OR REPLACE FUNCTION public.check_phone_available(
  p_phone TEXT,
  p_exclude_profile_id BIGINT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  IF p_phone IS NULL OR trim(p_phone) = '' THEN
    RETURN TRUE;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.alumni_profiles
    WHERE phone = trim(p_phone)
      AND (p_exclude_profile_id IS NULL OR id <> p_exclude_profile_id)
  ) INTO v_exists;

  RETURN NOT v_exists;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_phone_available(TEXT, BIGINT) TO anon, authenticated, service_role;

-- 6.9 Rate Limiter RPC
CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_key TEXT,
  p_max_attempts INTEGER DEFAULT 10,
  p_window_seconds INTEGER DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_record RECORD;
BEGIN
  SELECT attempts, reset_at INTO v_record
  FROM public.auth_rate_limits
  WHERE key = p_key
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.auth_rate_limits (key, attempts, reset_at)
    VALUES (p_key, 1, v_now + (p_window_seconds || ' seconds')::INTERVAL);
    RETURN TRUE;
  END IF;

  IF v_now > v_record.reset_at THEN
    UPDATE public.auth_rate_limits
    SET attempts = 1,
        reset_at = v_now + (p_window_seconds || ' seconds')::INTERVAL
    WHERE key = p_key;
    RETURN TRUE;
  END IF;

  IF v_record.attempts >= p_max_attempts THEN
    RETURN FALSE;
  END IF;

  UPDATE public.auth_rate_limits
  SET attempts = attempts + 1
  WHERE key = p_key;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit(TEXT, INTEGER, INTEGER) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. SYNCHRONIZATION TRIGGERS
-- -----------------------------------------------------------------------------

-- 7.1 Sync updated_at column
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batches_updated_at ON public.batches;
CREATE TRIGGER trg_batches_updated_at BEFORE UPDATE ON public.batches
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_alumni_profiles_updated_at ON public.alumni_profiles;
CREATE TRIGGER trg_alumni_profiles_updated_at BEFORE UPDATE ON public.alumni_profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_posts_updated_at ON public.posts;
CREATE TRIGGER trg_posts_updated_at BEFORE UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 7.2 Sync registered_count on batches
CREATE OR REPLACE FUNCTION public.sync_batch_registered_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.batches
    SET registered_count = registered_count + 1
    WHERE batch_year = NEW.batch_year;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.batches
    SET registered_count = GREATEST(0, registered_count - 1)
    WHERE batch_year = OLD.batch_year;
  ELSIF TG_OP = 'UPDATE' AND (NEW.batch_year <> OLD.batch_year) THEN
    UPDATE public.batches
    SET registered_count = GREATEST(0, registered_count - 1)
    WHERE batch_year = OLD.batch_year;
    UPDATE public.batches
    SET registered_count = registered_count + 1
    WHERE batch_year = NEW.batch_year;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_batch_registered_count ON public.alumni_profiles;
CREATE TRIGGER trg_sync_batch_registered_count
AFTER INSERT OR UPDATE OR DELETE ON public.alumni_profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_batch_registered_count();

-- 7.3 Sync post_likes_count
CREATE OR REPLACE FUNCTION public.sync_post_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
    SET likes_count = likes_count + 1
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
    SET likes_count = GREATEST(0, likes_count - 1)
    WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_post_likes ON public.post_likes;
CREATE TRIGGER trg_sync_post_likes
AFTER INSERT OR DELETE ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.sync_post_likes_count();

-- 7.4 Sync post_comments_count
CREATE OR REPLACE FUNCTION public.sync_post_comments_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
    SET comments_count = comments_count + 1
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
    SET comments_count = GREATEST(0, comments_count - 1)
    WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_post_comments ON public.post_comments;
CREATE TRIGGER trg_sync_post_comments
AFTER INSERT OR DELETE ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.sync_post_comments_count();

-- 7.5 Protect Privileged Columns on alumni_profiles
CREATE OR REPLACE FUNCTION public.protect_privileged_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_is_admin BOOLEAN := FALSE;
BEGIN
  -- Service role / internal can modify anything
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_admin := public.is_admin();

  IF NOT v_is_admin THEN
    -- Non-admins cannot alter their role, verification status, or phone verification
    NEW.role := OLD.role;
    NEW.verification_status := OLD.verification_status;
    NEW.phone_ownership_verified := OLD.phone_ownership_verified;
    NEW.phone_verified_at := OLD.phone_verified_at;
    NEW.phone_verified_by_profile_id := OLD.phone_verified_by_profile_id;
    NEW.phone_verification_notes := OLD.phone_verification_notes;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_privileged_columns ON public.alumni_profiles;
CREATE TRIGGER trg_protect_privileged_columns
BEFORE UPDATE ON public.alumni_profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_privileged_profile_columns();

-- -----------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------

ALTER TABLE public.academic_stream_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alumni_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_doc_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_vouches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_donors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_request_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 8.1 Batches
DROP POLICY IF EXISTS "Batches: Public Read" ON public.batches;
CREATE POLICY "Batches: Public Read" ON public.batches FOR SELECT USING (true);

DROP POLICY IF EXISTS "Batches: Admin Write" ON public.batches;
CREATE POLICY "Batches: Admin Write" ON public.batches FOR ALL
USING (public.is_admin() OR auth.uid() IS NULL)
WITH CHECK (public.is_admin() OR auth.uid() IS NULL);

-- 8.2 Academic Stream Groups
DROP POLICY IF EXISTS "Stream Groups: Public Read" ON public.academic_stream_groups;
CREATE POLICY "Stream Groups: Public Read" ON public.academic_stream_groups FOR SELECT USING (true);

DROP POLICY IF EXISTS "Stream Groups: Admin Write" ON public.academic_stream_groups;
CREATE POLICY "Stream Groups: Admin Write" ON public.academic_stream_groups FOR ALL
USING (public.is_admin() OR auth.uid() IS NULL)
WITH CHECK (public.is_admin() OR auth.uid() IS NULL);

-- 8.3 Alumni Profiles
DROP POLICY IF EXISTS "Profiles: Public View" ON public.alumni_profiles;
CREATE POLICY "Profiles: Public View" ON public.alumni_profiles FOR SELECT
USING (is_public = true OR auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Profiles: Owner Update" ON public.alumni_profiles;
CREATE POLICY "Profiles: Owner Update" ON public.alumni_profiles FOR UPDATE
USING (auth_user_id = auth.uid() OR public.is_admin())
WITH CHECK (auth_user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Profiles: Insert" ON public.alumni_profiles;
CREATE POLICY "Profiles: Insert" ON public.alumni_profiles FOR INSERT
WITH CHECK (auth_user_id = auth.uid() OR auth_user_id IS NULL OR public.is_admin());

DROP POLICY IF EXISTS "Profiles: Admin Delete" ON public.alumni_profiles;
CREATE POLICY "Profiles: Admin Delete" ON public.alumni_profiles FOR DELETE
USING (public.is_admin() OR auth_user_id = auth.uid());

-- 8.4 Posts
DROP POLICY IF EXISTS "Posts: Public Read" ON public.posts;
CREATE POLICY "Posts: Public Read" ON public.posts FOR SELECT
USING (is_deleted = false OR author_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS "Posts: Authenticated Insert" ON public.posts;
CREATE POLICY "Posts: Authenticated Insert" ON public.posts FOR INSERT
WITH CHECK (author_id = public.current_profile_id() OR public.is_admin() OR auth.uid() IS NULL);

DROP POLICY IF EXISTS "Posts: Author Or Admin Update" ON public.posts;
CREATE POLICY "Posts: Author Or Admin Update" ON public.posts FOR UPDATE
USING (author_id = public.current_profile_id() OR public.is_admin())
WITH CHECK (author_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS "Posts: Author Or Admin Delete" ON public.posts;
CREATE POLICY "Posts: Author Or Admin Delete" ON public.posts FOR DELETE
USING (author_id = public.current_profile_id() OR public.is_admin());

-- 8.5 Post Comments
DROP POLICY IF EXISTS "Comments: Public Read" ON public.post_comments;
CREATE POLICY "Comments: Public Read" ON public.post_comments FOR SELECT
USING (is_deleted = false OR user_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS "Comments: Authenticated Insert" ON public.post_comments;
CREATE POLICY "Comments: Authenticated Insert" ON public.post_comments FOR INSERT
WITH CHECK (user_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS "Comments: Author Or Admin Delete" ON public.post_comments;
CREATE POLICY "Comments: Author Or Admin Delete" ON public.post_comments FOR DELETE
USING (user_id = public.current_profile_id() OR public.is_admin());

-- 8.6 Post Likes
DROP POLICY IF EXISTS "Likes: Public Read" ON public.post_likes;
CREATE POLICY "Likes: Public Read" ON public.post_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Likes: Authenticated Insert" ON public.post_likes;
CREATE POLICY "Likes: Authenticated Insert" ON public.post_likes FOR INSERT
WITH CHECK (user_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS "Likes: Author Delete" ON public.post_likes;
CREATE POLICY "Likes: Author Delete" ON public.post_likes FOR DELETE
USING (user_id = public.current_profile_id() OR public.is_admin());

-- 8.7 Saved Posts
DROP POLICY IF EXISTS "Saved Posts: Owner Select" ON public.saved_posts;
CREATE POLICY "Saved Posts: Owner Select" ON public.saved_posts FOR SELECT
USING (user_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS "Saved Posts: Owner Insert" ON public.saved_posts;
CREATE POLICY "Saved Posts: Owner Insert" ON public.saved_posts FOR INSERT
WITH CHECK (user_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS "Saved Posts: Owner Delete" ON public.saved_posts;
CREATE POLICY "Saved Posts: Owner Delete" ON public.saved_posts FOR DELETE
USING (user_id = public.current_profile_id() OR public.is_admin());

-- 8.8 Blood Donors
DROP POLICY IF EXISTS "Blood Donors: Read" ON public.blood_donors;
CREATE POLICY "Blood Donors: Read" ON public.blood_donors FOR SELECT
USING (is_registered_donor = true OR user_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS "Blood Donors: Owner Write" ON public.blood_donors;
CREATE POLICY "Blood Donors: Owner Write" ON public.blood_donors FOR ALL
USING (user_id = public.current_profile_id() OR public.is_admin() OR auth.uid() IS NULL)
WITH CHECK (user_id = public.current_profile_id() OR public.is_admin() OR auth.uid() IS NULL);

-- 8.9 Blood Requests
DROP POLICY IF EXISTS "Blood Requests: Public Read" ON public.blood_requests;
CREATE POLICY "Blood Requests: Public Read" ON public.blood_requests FOR SELECT USING (true);

DROP POLICY IF EXISTS "Blood Requests: Authenticated Insert" ON public.blood_requests;
CREATE POLICY "Blood Requests: Authenticated Insert" ON public.blood_requests FOR INSERT
WITH CHECK (requester_id = public.current_profile_id() OR public.is_admin() OR auth.uid() IS NULL);

DROP POLICY IF EXISTS "Blood Requests: Author Or Admin Update" ON public.blood_requests;
CREATE POLICY "Blood Requests: Author Or Admin Update" ON public.blood_requests FOR UPDATE
USING (requester_id = public.current_profile_id() OR public.is_admin_or_mod())
WITH CHECK (requester_id = public.current_profile_id() OR public.is_admin_or_mod());

-- 8.10 Blood Request Responses
DROP POLICY IF EXISTS "Blood Responses: Read" ON public.blood_request_responses;
CREATE POLICY "Blood Responses: Read" ON public.blood_request_responses FOR SELECT
USING (donor_user_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS "Blood Responses: Insert" ON public.blood_request_responses;
CREATE POLICY "Blood Responses: Insert" ON public.blood_request_responses FOR INSERT
WITH CHECK (donor_user_id = public.current_profile_id() OR public.is_admin());

-- 8.11 Verification Requests & Peer Vouches
DROP POLICY IF EXISTS "Verifications: Read" ON public.verification_requests;
CREATE POLICY "Verifications: Read" ON public.verification_requests FOR SELECT
USING (
  requester_id = public.current_profile_id()
  OR batch_year = public.current_user_batch_year()
  OR public.is_admin_or_mod()
);

DROP POLICY IF EXISTS "Verifications: Insert" ON public.verification_requests;
CREATE POLICY "Verifications: Insert" ON public.verification_requests FOR INSERT
WITH CHECK (requester_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS "Verifications: Admin Update" ON public.verification_requests;
CREATE POLICY "Verifications: Admin Update" ON public.verification_requests FOR UPDATE
USING (public.is_admin_or_mod())
WITH CHECK (public.is_admin_or_mod());

DROP POLICY IF EXISTS "Peer Vouches: Read" ON public.peer_vouches;
CREATE POLICY "Peer Vouches: Read" ON public.peer_vouches FOR SELECT
USING (
  requester_id = public.current_profile_id()
  OR voucher_id = public.current_profile_id()
  OR public.is_admin_or_mod()
);

DROP POLICY IF EXISTS "Peer Vouches: Insert" ON public.peer_vouches;
CREATE POLICY "Peer Vouches: Insert" ON public.peer_vouches FOR INSERT
WITH CHECK (
  voucher_id = public.current_profile_id()
  AND public.is_verified_alumnus()
);

-- 8.12 Admin Document Submissions
DROP POLICY IF EXISTS "Doc Submissions: Read" ON public.admin_doc_submissions;
CREATE POLICY "Doc Submissions: Read" ON public.admin_doc_submissions FOR SELECT
USING (user_id = public.current_profile_id() OR public.is_admin_or_mod());

DROP POLICY IF EXISTS "Doc Submissions: Insert" ON public.admin_doc_submissions;
CREATE POLICY "Doc Submissions: Insert" ON public.admin_doc_submissions FOR INSERT
WITH CHECK (user_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS "Doc Submissions: Admin Update" ON public.admin_doc_submissions;
CREATE POLICY "Doc Submissions: Admin Update" ON public.admin_doc_submissions FOR UPDATE
USING (public.is_admin_or_mod())
WITH CHECK (public.is_admin_or_mod());

-- 8.13 Notifications
DROP POLICY IF EXISTS "Notifications: Owner Read" ON public.notifications;
CREATE POLICY "Notifications: Owner Read" ON public.notifications FOR SELECT
USING (recipient_id = public.current_profile_id());

DROP POLICY IF EXISTS "Notifications: Owner Update" ON public.notifications;
CREATE POLICY "Notifications: Owner Update" ON public.notifications FOR UPDATE
USING (recipient_id = public.current_profile_id())
WITH CHECK (recipient_id = public.current_profile_id());

-- 8.14 Gallery Albums & Photos
DROP POLICY IF EXISTS "Albums: Public Read" ON public.gallery_albums;
CREATE POLICY "Albums: Public Read" ON public.gallery_albums FOR SELECT
USING (is_published = true OR public.is_admin());

DROP POLICY IF EXISTS "Albums: Admin Write" ON public.gallery_albums;
CREATE POLICY "Albums: Admin Write" ON public.gallery_albums FOR ALL
USING (public.is_admin() OR auth.uid() IS NULL)
WITH CHECK (public.is_admin() OR auth.uid() IS NULL);

DROP POLICY IF EXISTS "Photos: Public Read" ON public.gallery_photos;
CREATE POLICY "Photos: Public Read" ON public.gallery_photos FOR SELECT
USING (is_approved = true OR uploader_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS "Photos: Authenticated Insert" ON public.gallery_photos;
CREATE POLICY "Photos: Authenticated Insert" ON public.gallery_photos FOR INSERT
WITH CHECK (uploader_id = public.current_profile_id() OR public.is_admin() OR auth.uid() IS NULL);

DROP POLICY IF EXISTS "Photos: Admin Delete" ON public.gallery_photos;
CREATE POLICY "Photos: Admin Delete" ON public.gallery_photos FOR DELETE
USING (uploader_id = public.current_profile_id() OR public.is_admin());

-- 8.15 Official Notices
DROP POLICY IF EXISTS "Notices: Public Read" ON public.official_notices;
CREATE POLICY "Notices: Public Read" ON public.official_notices FOR SELECT
USING (is_published = true OR public.is_admin());

DROP POLICY IF EXISTS "Notices: Admin Write" ON public.official_notices;
CREATE POLICY "Notices: Admin Write" ON public.official_notices FOR ALL
USING (public.is_admin() OR auth.uid() IS NULL)
WITH CHECK (public.is_admin() OR auth.uid() IS NULL);

-- 8.16 Contact Inquiries
DROP POLICY IF EXISTS "Inquiries: Public Insert" ON public.contact_inquiries;
CREATE POLICY "Inquiries: Public Insert" ON public.contact_inquiries FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Inquiries: Admin Or Sender Read" ON public.contact_inquiries;
CREATE POLICY "Inquiries: Admin Or Sender Read" ON public.contact_inquiries FOR SELECT
USING (sender_profile_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS "Inquiries: Admin Update" ON public.contact_inquiries;
CREATE POLICY "Inquiries: Admin Update" ON public.contact_inquiries FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 8.17 Audit Logs
DROP POLICY IF EXISTS "Audit Logs: Admin Read" ON public.audit_logs;
CREATE POLICY "Audit Logs: Admin Read" ON public.audit_logs FOR SELECT
USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- 9. SUPABASE STORAGE BUCKETS & POLICIES
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('post-media', 'post-media', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']),
  ('gallery', 'gallery', true, 31457280, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('verification-documents', 'verification-documents', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('official-notices', 'official-notices', true, 20971520, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage Objects Policies
DROP POLICY IF EXISTS "Storage: Avatars Public Read" ON storage.objects;
CREATE POLICY "Storage: Avatars Public Read" ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Storage: Avatars Authenticated Insert" ON storage.objects;
CREATE POLICY "Storage: Avatars Authenticated Insert" ON storage.objects FOR INSERT
TO authenticated WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Storage: Post Media Public Read" ON storage.objects;
CREATE POLICY "Storage: Post Media Public Read" ON storage.objects FOR SELECT
USING (bucket_id = 'post-media');

DROP POLICY IF EXISTS "Storage: Post Media Authenticated Insert" ON storage.objects;
CREATE POLICY "Storage: Post Media Authenticated Insert" ON storage.objects FOR INSERT
TO authenticated WITH CHECK (bucket_id = 'post-media');

DROP POLICY IF EXISTS "Storage: Gallery Public Read" ON storage.objects;
CREATE POLICY "Storage: Gallery Public Read" ON storage.objects FOR SELECT
USING (bucket_id = 'gallery');

DROP POLICY IF EXISTS "Storage: Gallery Authenticated Insert" ON storage.objects;
CREATE POLICY "Storage: Gallery Authenticated Insert" ON storage.objects FOR INSERT
TO authenticated WITH CHECK (bucket_id = 'gallery');

DROP POLICY IF EXISTS "Storage: Verification Docs Private" ON storage.objects;
CREATE POLICY "Storage: Verification Docs Private" ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'verification-documents' AND (owner = auth.uid() OR public.is_admin_or_mod()))
WITH CHECK (bucket_id = 'verification-documents' AND (owner = auth.uid() OR public.is_admin_or_mod()));

COMMIT;
