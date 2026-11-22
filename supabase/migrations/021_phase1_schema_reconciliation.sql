-- =============================================================================
-- MIGRATION 021: PHASE 1 DATABASE & SCHEMA RECONCILIATION
-- Project: Shaheed Ziaur Rahman Medical College Alumni Network (SZMC Bogura)
-- Safe & Idempotent: Non-destructive reconciliation for both fresh & existing DBs
-- =============================================================================
-- Purpose:
--   1. Reconciles 8 tables present in master_schema.sql into versioned migration
--      history with canonical runtime columns, constraints, and indexes:
--        - public.site_settings
--        - public.featured_alumni
--        - public.hall_of_fame
--        - public.career_opportunities
--        - public.mentorship_requests
--        - public.mentor_offers
--        - public.events
--        - public.event_registrations
--   2. Formally defines public.app_feature_flags (previously referenced without
--      a CREATE TABLE migration) and seeds non-destructive default community flags.
--   3. Harmonizes legacy column drift non-destructively (preserving existing rows).
--   4. Hardens RLS policies and revokes anon write privileges on all 9 tables,
--      aligned with Phase 0 canonical role helpers (is_super_admin / is_admin /
--      is_admin_or_mod).
--   5. Hardens the alumni_profiles <-> profiles identity bridge (role + display
--      sync + self-escalation guard on public.profiles).
--   6. Enables REPLICA IDENTITY FULL & supabase_realtime publication membership.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. SHARED UPDATED_AT TRIGGER HELPER (Idempotent)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_reconciled_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 1. ENSURE POSTS MEDIA & REACTION COLUMNS EXIST IN VERSIONED MIGRATIONS
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.posts') IS NOT NULL THEN
    ALTER TABLE public.posts
      ADD COLUMN IF NOT EXISTS videos TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS linked_url TEXT NULL,
      ADD COLUMN IF NOT EXISTS reactions_summary JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. RECONCILE 8 TABLES FROM master_schema.sql INTO VERSIONED MIGRATIONS
-- -----------------------------------------------------------------------------

-- 2.1 public.site_settings
CREATE TABLE IF NOT EXISTS public.site_settings (
  key TEXT PRIMARY KEY CHECK (char_length(trim(key)) BETWEEN 1 AND 128),
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS value JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2.2 public.featured_alumni
CREATE TABLE IF NOT EXISTS public.featured_alumni (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
  is_alumni BOOLEAN NOT NULL DEFAULT TRUE,
  non_alumni_role TEXT NULL,
  batch SMALLINT NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'Medicine',
  designation TEXT NOT NULL DEFAULT '',
  institution TEXT NOT NULL DEFAULT '',
  city TEXT NULL DEFAULT 'Bogura',
  country TEXT NULL DEFAULT 'Bangladesh',
  avatar_url TEXT NOT NULL DEFAULT '',
  achievement_summary TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.featured_alumni
  ADD COLUMN IF NOT EXISTS is_alumni BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS non_alumni_role TEXT NULL,
  ADD COLUMN IF NOT EXISTS batch SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Medicine',
  ADD COLUMN IF NOT EXISTS designation TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS institution TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city TEXT NULL DEFAULT 'Bogura',
  ADD COLUMN IF NOT EXISTS country TEXT NULL DEFAULT 'Bangladesh',
  ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS achievement_summary TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2.3 public.hall_of_fame
CREATE TABLE IF NOT EXISTS public.hall_of_fame (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
  is_alumni BOOLEAN NOT NULL DEFAULT TRUE,
  non_alumni_role TEXT NULL,
  batch SMALLINT NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'Medicine',
  designation TEXT NOT NULL DEFAULT '',
  institution TEXT NOT NULL DEFAULT '',
  city TEXT NULL DEFAULT 'Bogura',
  country TEXT NULL DEFAULT 'Bangladesh',
  avatar_url TEXT NOT NULL DEFAULT '',
  achievement_summary TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.hall_of_fame
  ADD COLUMN IF NOT EXISTS is_alumni BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS non_alumni_role TEXT NULL,
  ADD COLUMN IF NOT EXISTS batch SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Medicine',
  ADD COLUMN IF NOT EXISTS designation TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS institution TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city TEXT NULL DEFAULT 'Bogura',
  ADD COLUMN IF NOT EXISTS country TEXT NULL DEFAULT 'Bangladesh',
  ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS achievement_summary TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2.4 public.career_opportunities (Canonical runtime schema + non-destructive type harmonization)
CREATE TABLE IF NOT EXISTS public.career_opportunities (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (char_length(trim(title)) >= 1),
  company TEXT NOT NULL CHECK (char_length(trim(company)) >= 1),
  location TEXT NOT NULL DEFAULT 'Bangladesh',
  type TEXT NOT NULL DEFAULT 'job',
  description TEXT NOT NULL DEFAULT '',
  poster_id BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  poster_name TEXT NOT NULL DEFAULT 'SZMC Doctor',
  poster_batch TEXT NULL,
  poster_avatar TEXT NULL,
  poster_email TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  applicants JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.career_opportunities
  ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT 'Bangladesh',
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'job',
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS poster_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS poster_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS poster_batch TEXT NULL,
  ADD COLUMN IF NOT EXISTS poster_avatar TEXT NULL,
  ADD COLUMN IF NOT EXISTS poster_email TEXT NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS applicants JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Non-destructively widen poster_batch from smallint/integer to TEXT if bootstrapped from legacy master_schema.sql
DO $$
DECLARE
  v_dtype TEXT;
BEGIN
  SELECT data_type INTO v_dtype
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'career_opportunities'
    AND column_name = 'poster_batch';

  IF v_dtype IN ('smallint', 'integer', 'bigint') THEN
    ALTER TABLE public.career_opportunities
      ALTER COLUMN poster_batch TYPE TEXT USING poster_batch::TEXT;
  END IF;
END $$;

-- 2.5 public.mentorship_requests (Canonical runtime schema + legacy column backfill)
CREATE TABLE IF NOT EXISTS public.mentorship_requests (
  id TEXT PRIMARY KEY,
  user_id BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL DEFAULT 'SZMC Alumnus',
  user_batch INTEGER NULL,
  user_avatar TEXT NULL,
  topic TEXT NOT NULL DEFAULT 'Medical',
  question TEXT NOT NULL DEFAULT '',
  contact_info TEXT NULL,
  target_mentor_id BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  target_mentor_name TEXT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.mentorship_requests
  ADD COLUMN IF NOT EXISTS user_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS user_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS user_batch INTEGER NULL,
  ADD COLUMN IF NOT EXISTS user_avatar TEXT NULL,
  ADD COLUMN IF NOT EXISTS topic TEXT NOT NULL DEFAULT 'Medical',
  ADD COLUMN IF NOT EXISTS question TEXT NULL,
  ADD COLUMN IF NOT EXISTS contact_info TEXT NULL,
  ADD COLUMN IF NOT EXISTS target_mentor_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS target_mentor_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Non-destructively backfill canonical columns if legacy master_schema.sql columns exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mentorship_requests' AND column_name = 'mentee_id'
  ) THEN
    EXECUTE 'UPDATE public.mentorship_requests SET user_id = COALESCE(user_id, mentee_id) WHERE user_id IS NULL AND mentee_id IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mentorship_requests' AND column_name = 'mentee_name'
  ) THEN
    EXECUTE 'UPDATE public.mentorship_requests SET user_name = COALESCE(NULLIF(trim(user_name), ''''), mentee_name) WHERE user_name IS NULL OR trim(user_name) = ''''';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mentorship_requests' AND column_name = 'mentee_batch'
  ) THEN
    EXECUTE 'UPDATE public.mentorship_requests SET user_batch = COALESCE(user_batch, mentee_batch::INTEGER) WHERE user_batch IS NULL AND mentee_batch IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mentorship_requests' AND column_name = 'mentee_avatar'
  ) THEN
    EXECUTE 'UPDATE public.mentorship_requests SET user_avatar = COALESCE(user_avatar, mentee_avatar) WHERE user_avatar IS NULL AND mentee_avatar IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mentorship_requests' AND column_name = 'details'
  ) THEN
    EXECUTE 'UPDATE public.mentorship_requests SET question = COALESCE(NULLIF(trim(question), ''''), details) WHERE question IS NULL OR trim(question) = ''''';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mentorship_requests' AND column_name = 'preferred_contact'
  ) THEN
    EXECUTE 'UPDATE public.mentorship_requests SET contact_info = COALESCE(contact_info, preferred_contact) WHERE contact_info IS NULL AND preferred_contact IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mentorship_requests' AND column_name = 'responses'
  ) THEN
    EXECUTE 'UPDATE public.mentorship_requests SET answers = responses WHERE (answers IS NULL OR answers = ''[]''::jsonb) AND responses IS NOT NULL AND responses <> ''[]''::jsonb';
  END IF;
END $$;

-- 2.6 public.mentor_offers
CREATE TABLE IF NOT EXISTS public.mentor_offers (
  id TEXT PRIMARY KEY,
  user_id BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 1),
  batch_year INTEGER NULL,
  avatar_url TEXT NULL,
  category TEXT NOT NULL DEFAULT 'Medical',
  expertise TEXT NOT NULL DEFAULT '',
  short_description TEXT NOT NULL DEFAULT '',
  institution TEXT NULL,
  position TEXT NULL,
  contact_preference TEXT NOT NULL DEFAULT 'WhatsApp',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.mentor_offers
  ADD COLUMN IF NOT EXISTS user_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS batch_year INTEGER NULL,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Medical',
  ADD COLUMN IF NOT EXISTS expertise TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS short_description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS institution TEXT NULL,
  ADD COLUMN IF NOT EXISTS position TEXT NULL,
  ADD COLUMN IF NOT EXISTS contact_preference TEXT NOT NULL DEFAULT 'WhatsApp',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2.7 public.events
CREATE TABLE IF NOT EXISTS public.events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (char_length(trim(title)) >= 1),
  description TEXT NULL,
  event_date TIMESTAMPTZ NULL,
  venue TEXT NULL,
  banner_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  capacity INTEGER NULL CHECK (capacity IS NULL OR capacity > 0),
  registration_fee NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (registration_fee >= 0),
  created_by BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS description TEXT NULL,
  ADD COLUMN IF NOT EXISTS event_date TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS venue TEXT NULL,
  ADD COLUMN IF NOT EXISTS banner_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS capacity INTEGER NULL,
  ADD COLUMN IF NOT EXISTS registration_fee NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by BIGINT NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2.8 public.event_registrations
CREATE TABLE IF NOT EXISTS public.event_registrations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  profile_id BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 1),
  batch_year SMALLINT NULL,
  ticket_type TEXT NOT NULL DEFAULT 'general',
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  payment_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS profile_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS batch_year SMALLINT NULL,
  ADD COLUMN IF NOT EXISTS ticket_type TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- -----------------------------------------------------------------------------
-- 3. FORMALLY DEFINE public.app_feature_flags (Missing CREATE TABLE fixed)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_feature_flags (
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-z0-9_]{2,64}$'),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_feature_flags
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS description TEXT NULL,
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_by BIGINT NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Non-destructive seed of default flags (never overwrites existing remote values)
INSERT INTO public.app_feature_flags (key, enabled, description, config)
VALUES
  ('the_quad_enabled', TRUE, 'Master toggle for THE QUAD Hybrid Community System', '{"version": 1}'::jsonb),
  ('batch_lounges_enabled', TRUE, 'Dedicated Batch Lounges across all 35 SZMC batches', '{"total_batches": 35}'::jsonb),
  ('official_pages_enabled', TRUE, 'Institutional Official Pages inside THE QUAD', '{"official_pages": 6}'::jsonb),
  ('community_polls_enabled', TRUE, 'Interactive polls inside community posts', '{}'::jsonb),
  ('content_moderation_queue_enabled', TRUE, 'User reporting, blocking, and moderator review queue', '{}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. RECONCILE toggle_auto_verification() RPC (Strict Admin-Only + Safe Search Path)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_auto_verification(
  p_paused BOOLEAN DEFAULT FALSE,
  p_reset_7_days BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_until TIMESTAMPTZ;
  v_payload JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: Administrator permissions required to toggle auto-verification.';
  END IF;

  IF p_reset_7_days THEN
    v_until := NOW() + INTERVAL '7 days';
  ELSE
    SELECT COALESCE((value->>'until')::TIMESTAMPTZ, NOW() + INTERVAL '7 days')
    INTO v_until
    FROM public.site_settings
    WHERE key = 'auto_verification';

    IF v_until IS NULL THEN
      v_until := NOW() + INTERVAL '7 days';
    END IF;
  END IF;

  v_payload := jsonb_build_object(
    'enabled', TRUE,
    'paused', p_paused,
    'until', v_until,
    'updated_at', NOW()
  );

  INSERT INTO public.site_settings (key, value, updated_at)
  VALUES ('auto_verification', v_payload, NOW())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = NOW();

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_auto_verification(BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_auto_verification(BOOLEAN, BOOLEAN) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. INDEXES & CONSTRAINTS FOR ALL 9 RECONCILED TABLES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_featured_alumni_order
  ON public.featured_alumni(display_order ASC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hall_of_fame_order
  ON public.hall_of_fame(display_order ASC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_career_opportunities_status_created
  ON public.career_opportunities(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_career_opportunities_type_created
  ON public.career_opportunities(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_career_opportunities_poster_id
  ON public.career_opportunities(poster_id);

CREATE INDEX IF NOT EXISTS idx_mentorship_requests_status_created
  ON public.mentorship_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mentorship_requests_topic_created
  ON public.mentorship_requests(topic, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mentorship_requests_user_id
  ON public.mentorship_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_mentorship_requests_target_mentor
  ON public.mentorship_requests(target_mentor_id);

CREATE INDEX IF NOT EXISTS idx_mentor_offers_category_created
  ON public.mentor_offers(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mentor_offers_user_id
  ON public.mentor_offers(user_id);

CREATE INDEX IF NOT EXISTS idx_events_status_date
  ON public.events(status, event_date ASC);

CREATE INDEX IF NOT EXISTS idx_event_registrations_event_id
  ON public.event_registrations(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_registrations_profile_id
  ON public.event_registrations(profile_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_payment_status
  ON public.event_registrations(payment_status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_registrations_event_profile
  ON public.event_registrations(event_id, profile_id)
  WHERE profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_app_feature_flags_enabled
  ON public.app_feature_flags(enabled);

-- Attach updated_at triggers cleanly
DO $$
DECLARE
  tbl TEXT;
  tlist TEXT[] := ARRAY[
    'site_settings',
    'featured_alumni',
    'hall_of_fame',
    'career_opportunities',
    'mentorship_requests',
    'mentor_offers',
    'events',
    'event_registrations',
    'app_feature_flags'
  ];
BEGIN
  FOREACH tbl IN ARRAY tlist LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_reconciled_updated_at();',
      tbl, tbl
    );
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 6. HARDENED LEAST-PRIVILEGE GRANTS & RLS POLICIES (All 9 Tables)
-- -----------------------------------------------------------------------------
-- Revoke any legacy anon write grants (anon gets SELECT only where public read is intended)
REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.site_settings,
  public.featured_alumni,
  public.hall_of_fame,
  public.career_opportunities,
  public.mentorship_requests,
  public.mentor_offers,
  public.events,
  public.event_registrations,
  public.app_feature_flags
FROM anon;

GRANT SELECT ON TABLE
  public.site_settings,
  public.featured_alumni,
  public.hall_of_fame,
  public.career_opportunities,
  public.mentorship_requests,
  public.mentor_offers,
  public.events,
  public.app_feature_flags
TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE
  public.site_settings,
  public.featured_alumni,
  public.hall_of_fame,
  public.career_opportunities,
  public.mentorship_requests,
  public.mentor_offers,
  public.events,
  public.event_registrations,
  public.app_feature_flags
TO authenticated;

GRANT SELECT ON TABLE public.event_registrations TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.featured_alumni ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hall_of_fame ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentorship_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_feature_flags ENABLE ROW LEVEL SECURITY;

-- 6.1 Governance-only write tables: site_settings, featured_alumni, hall_of_fame, app_feature_flags
DROP POLICY IF EXISTS "Site Settings: Public Read" ON public.site_settings;
DROP POLICY IF EXISTS "Site Settings: Admin & Service Write" ON public.site_settings;
DROP POLICY IF EXISTS "site_settings_public_read" ON public.site_settings;
DROP POLICY IF EXISTS "site_settings_admin_write" ON public.site_settings;

CREATE POLICY "site_settings_public_read"
  ON public.site_settings FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "site_settings_admin_write"
  ON public.site_settings FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Featured Alumni: Public Read" ON public.featured_alumni;
DROP POLICY IF EXISTS "Featured Alumni: Admin Write" ON public.featured_alumni;
DROP POLICY IF EXISTS "featured_alumni_public_read" ON public.featured_alumni;
DROP POLICY IF EXISTS "featured_alumni_admin_write" ON public.featured_alumni;

CREATE POLICY "featured_alumni_public_read"
  ON public.featured_alumni FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "featured_alumni_admin_write"
  ON public.featured_alumni FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Hall of Fame: Public Read" ON public.hall_of_fame;
DROP POLICY IF EXISTS "Hall of Fame: Admin Write" ON public.hall_of_fame;
DROP POLICY IF EXISTS "hall_of_fame_public_read" ON public.hall_of_fame;
DROP POLICY IF EXISTS "hall_of_fame_admin_write" ON public.hall_of_fame;

CREATE POLICY "hall_of_fame_public_read"
  ON public.hall_of_fame FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "hall_of_fame_admin_write"
  ON public.hall_of_fame FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "feature_flags_select_public" ON public.app_feature_flags;
DROP POLICY IF EXISTS "feature_flags_insert_admin" ON public.app_feature_flags;
DROP POLICY IF EXISTS "feature_flags_update_admin" ON public.app_feature_flags;
DROP POLICY IF EXISTS "app_feature_flags_admin_all" ON public.app_feature_flags;
DROP POLICY IF EXISTS "app_feature_flags_public_read" ON public.app_feature_flags;

CREATE POLICY "app_feature_flags_public_read"
  ON public.app_feature_flags FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "app_feature_flags_admin_all"
  ON public.app_feature_flags FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 6.2 Member-contributed tables: career_opportunities, mentorship_requests, mentor_offers
DROP POLICY IF EXISTS "Career Opportunities: Public Read" ON public.career_opportunities;
DROP POLICY IF EXISTS "Career Opportunities: Authenticated Write" ON public.career_opportunities;
DROP POLICY IF EXISTS "career_opportunities_all" ON public.career_opportunities;
DROP POLICY IF EXISTS "career_opportunities_read" ON public.career_opportunities;
DROP POLICY IF EXISTS "career_opportunities_admin_write" ON public.career_opportunities;
DROP POLICY IF EXISTS "career_opportunities_insert_own" ON public.career_opportunities;
DROP POLICY IF EXISTS "career_opportunities_update_own_or_mod" ON public.career_opportunities;
DROP POLICY IF EXISTS "career_opportunities_delete_own_or_mod" ON public.career_opportunities;
DROP POLICY IF EXISTS "career_opportunities_public_read" ON public.career_opportunities;

CREATE POLICY "career_opportunities_public_read"
  ON public.career_opportunities FOR SELECT TO anon, authenticated
  USING (true);

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

DROP POLICY IF EXISTS "Mentorship Requests: Public Read" ON public.mentorship_requests;
DROP POLICY IF EXISTS "Mentorship Requests: Authenticated Write" ON public.mentorship_requests;
DROP POLICY IF EXISTS "mentorship_requests_all" ON public.mentorship_requests;
DROP POLICY IF EXISTS "mentorship_requests_read" ON public.mentorship_requests;
DROP POLICY IF EXISTS "mentorship_requests_admin_write" ON public.mentorship_requests;
DROP POLICY IF EXISTS "mentorship_requests_insert_own" ON public.mentorship_requests;
DROP POLICY IF EXISTS "mentorship_requests_update_own_or_mod" ON public.mentorship_requests;
DROP POLICY IF EXISTS "mentorship_requests_delete_own_or_mod" ON public.mentorship_requests;
DROP POLICY IF EXISTS "mentorship_requests_public_read" ON public.mentorship_requests;

CREATE POLICY "mentorship_requests_public_read"
  ON public.mentorship_requests FOR SELECT TO anon, authenticated
  USING (true);

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

DROP POLICY IF EXISTS "Mentor Offers: Public Read" ON public.mentor_offers;
DROP POLICY IF EXISTS "Mentor Offers: Authenticated Write" ON public.mentor_offers;
DROP POLICY IF EXISTS "mentor_offers_all" ON public.mentor_offers;
DROP POLICY IF EXISTS "mentor_offers_read" ON public.mentor_offers;
DROP POLICY IF EXISTS "mentor_offers_admin_write" ON public.mentor_offers;
DROP POLICY IF EXISTS "mentor_offers_insert_own" ON public.mentor_offers;
DROP POLICY IF EXISTS "mentor_offers_update_own_or_mod" ON public.mentor_offers;
DROP POLICY IF EXISTS "mentor_offers_delete_own_or_mod" ON public.mentor_offers;
DROP POLICY IF EXISTS "mentor_offers_public_read" ON public.mentor_offers;

CREATE POLICY "mentor_offers_public_read"
  ON public.mentor_offers FOR SELECT TO anon, authenticated
  USING (true);

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

-- 6.3 Events & Event Registrations
DROP POLICY IF EXISTS "Events: Public Read" ON public.events;
DROP POLICY IF EXISTS "Events: Admin Write" ON public.events;
DROP POLICY IF EXISTS "events_select_public" ON public.events;
DROP POLICY IF EXISTS "events_admin_write" ON public.events;

CREATE POLICY "events_select_public"
  ON public.events FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "events_admin_write"
  ON public.events FOR ALL TO authenticated
  USING (public.is_admin_or_mod())
  WITH CHECK (public.is_admin_or_mod());

DO $$
DECLARE
  v_owner_col TEXT;
BEGIN
  SELECT column_name INTO v_owner_col
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'event_registrations'
    AND column_name IN ('profile_id', 'user_id', 'alumni_id')
  ORDER BY CASE column_name WHEN 'profile_id' THEN 1 WHEN 'user_id' THEN 2 ELSE 3 END
  LIMIT 1;

  DROP POLICY IF EXISTS "Event Registrations: Read Own or Admin" ON public.event_registrations;
  DROP POLICY IF EXISTS "Event Registrations: Authenticated Insert" ON public.event_registrations;
  DROP POLICY IF EXISTS "event_registrations_select_own_or_mod" ON public.event_registrations;
  DROP POLICY IF EXISTS "event_registrations_insert_own" ON public.event_registrations;
  DROP POLICY IF EXISTS "event_registrations_update_own_or_mod" ON public.event_registrations;
  DROP POLICY IF EXISTS "event_registrations_delete_own_or_mod" ON public.event_registrations;
  DROP POLICY IF EXISTS "event_registrations_admin_only" ON public.event_registrations;

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
-- 7. HARDEN alumni_profiles <-> profiles IDENTITY BRIDGE (Messenger & Community)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL
     AND to_regclass('public.alumni_profiles') IS NOT NULL THEN

    -- 7.1 Align is_current_user_super_admin() with authoritative Phase 0 role helpers
    CREATE OR REPLACE FUNCTION public.is_current_user_super_admin()
    RETURNS BOOLEAN
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public, pg_catalog
    AS $fn$
      SELECT public.is_super_admin() OR EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE user_id = auth.uid()
          AND role = 'super_admin'
      );
    $fn$;

    GRANT EXECUTE ON FUNCTION public.is_current_user_super_admin() TO authenticated, service_role;

    -- 7.2 Keep display fields AND role synchronized whenever alumni_profiles updates
    CREATE OR REPLACE FUNCTION public.sync_profile_display_fields()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_catalog
    AS $fn$
    BEGIN
      IF NEW.auth_user_id IS NULL THEN
        RETURN NEW;
      END IF;

      UPDATE public.profiles
      SET
        full_name = COALESCE(NULLIF(TRIM(NEW.full_name), ''), public.profiles.full_name),
        avatar_url = COALESCE(NULLIF(TRIM(NEW.avatar_url), ''), public.profiles.avatar_url),
        batch = COALESCE(NEW.batch_year, public.profiles.batch),
        is_verified = (COALESCE(NEW.verification_status::text, 'unverified') = 'verified'),
        role = CASE
          WHEN NEW.role::text IN ('admin', 'super_admin') THEN 'super_admin'
          ELSE 'alumni'
        END,
        updated_at = NOW()
      WHERE user_id = NEW.auth_user_id;

      RETURN NEW;
    END;
    $fn$;

    REVOKE ALL ON FUNCTION public.sync_profile_display_fields() FROM PUBLIC, anon, authenticated;

    DROP TRIGGER IF EXISTS trg_sync_profile_display_fields ON public.alumni_profiles;
    CREATE TRIGGER trg_sync_profile_display_fields
      AFTER UPDATE OF full_name, avatar_url, batch_year, verification_status, role
      ON public.alumni_profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_profile_display_fields();

    -- 7.3 Guard public.profiles against client-side role self-escalation
    CREATE OR REPLACE FUNCTION public.guard_profiles_role_escalation()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_catalog
    AS $fn$
    DECLARE
      v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), '');
    BEGIN
      IF auth.uid() IS NULL OR v_jwt_role = 'service_role' OR pg_trigger_depth() > 1 THEN
        RETURN NEW;
      END IF;

      IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden: public.profiles.role is managed automatically by server governance.';
      END IF;

      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_guard_profiles_role_escalation ON public.profiles;
    CREATE TRIGGER trg_guard_profiles_role_escalation
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.guard_profiles_role_escalation();

    -- 7.4 Non-destructive one-time reconciliation backfill for any unlinked alumni_profiles
    INSERT INTO public.profiles (id, user_id, role, is_verified, batch, avatar_url, full_name, created_at)
    SELECT
      ap.id,
      ap.auth_user_id,
      CASE WHEN ap.role::text IN ('admin', 'super_admin') THEN 'super_admin' ELSE 'alumni' END,
      (COALESCE(ap.verification_status::text, 'unverified') = 'verified'),
      ap.batch_year,
      ap.avatar_url,
      ap.full_name,
      COALESCE(ap.created_at, NOW())
    FROM public.alumni_profiles ap
    WHERE ap.auth_user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = ap.auth_user_id)
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = ap.id)
    ON CONFLICT DO NOTHING;

    -- Synchronize role & verification flags for already-bridged rows
    UPDATE public.profiles p
    SET
      role = CASE WHEN ap.role::text IN ('admin', 'super_admin') THEN 'super_admin' ELSE 'alumni' END,
      is_verified = (COALESCE(ap.verification_status::text, 'unverified') = 'verified'),
      full_name = COALESCE(NULLIF(TRIM(ap.full_name), ''), p.full_name),
      avatar_url = COALESCE(NULLIF(TRIM(ap.avatar_url), ''), p.avatar_url),
      batch = COALESCE(ap.batch_year, p.batch),
      updated_at = NOW()
    FROM public.alumni_profiles ap
    WHERE ap.auth_user_id = p.user_id
      AND (
        p.role IS DISTINCT FROM (CASE WHEN ap.role::text IN ('admin', 'super_admin') THEN 'super_admin' ELSE 'alumni' END)
        OR p.is_verified IS DISTINCT FROM (COALESCE(ap.verification_status::text, 'unverified') = 'verified')
      );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 8. REALTIME REPLICATION FOR RECONCILED TABLES
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.site_settings REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.featured_alumni REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.hall_of_fame REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.career_opportunities REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.mentorship_requests REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.mentor_offers REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.events REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.event_registrations REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.app_feature_flags REPLICA IDENTITY FULL;

DO $$
DECLARE
  tbl TEXT;
  tlist TEXT[] := ARRAY[
    'site_settings',
    'featured_alumni',
    'hall_of_fame',
    'career_opportunities',
    'mentorship_requests',
    'mentor_offers',
    'events',
    'event_registrations',
    'app_feature_flags'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH tbl IN ARRAY tlist LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
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

COMMIT;

-- =============================================================================
-- POST-MIGRATION READ-ONLY VERIFICATION QUERIES (Run in Supabase SQL Editor)
-- =============================================================================
-- 1. Confirm all 9 reconciled tables exist with RLS enabled (expect 9 rows, rowsecurity = true):
--    SELECT tablename, rowsecurity
--    FROM pg_tables
--    WHERE schemaname = 'public'
--      AND tablename IN (
--        'site_settings','featured_alumni','hall_of_fame','career_opportunities',
--        'mentorship_requests','mentor_offers','events','event_registrations','app_feature_flags'
--      )
--    ORDER BY tablename;
--
-- 2. Confirm zero unbridged alumni_profiles with auth_user_id (expect 0 rows):
--    SELECT ap.id, ap.email
--    FROM public.alumni_profiles ap
--    LEFT JOIN public.profiles p ON p.user_id = ap.auth_user_id
--    WHERE ap.auth_user_id IS NOT NULL AND p.id IS NULL;
--
-- 3. Confirm default feature flags seeded:
--    SELECT key, enabled, description FROM public.app_feature_flags ORDER BY key;
-- =============================================================================
