-- =============================================================================
-- MIGRATION 019: SUPER ADMIN USER ACTIVITY TELEMETRY & AD AUDIENCE DATA CENTER
-- Project: Shaheed Ziaur Rahman Medical College Alumni Network (SZMC Bogura)
-- Safe & Idempotent: Run directly in Supabase Dashboard -> SQL Editor
-- =============================================================================
-- Creates high-granularity user behavioral tracking tables & ad audience builder:
--   1. public.user_activity_sessions  (per-session dwell, clicks, device, route)
--   2. public.user_activity_events    (page views, clicks, dwell, scroll, searches)
--   3. public.ad_audience_segments    (behavioral audience cohorts for ad targeting)
-- Security:
--   - Authenticated users can INSERT their own telemetry & UPDATE their own session.
--   - ONLY Super Admins (public.is_admin()) can SELECT or DELETE telemetry records.
--   - Sensitive inputs (passwords, form values) are never collected by the client.
-- =============================================================================

BEGIN;

-- 1. USER ACTIVITY SESSIONS TABLE
CREATE TABLE IF NOT EXISTS public.user_activity_sessions (
  session_id TEXT PRIMARY KEY,
  profile_id BIGINT REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL DEFAULT 'Guest Visitor',
  user_email TEXT,
  batch_year INTEGER,
  specialty TEXT,
  city TEXT,
  country TEXT,
  device_type TEXT NOT NULL DEFAULT 'desktop',
  browser TEXT NOT NULL DEFAULT 'Unknown',
  os TEXT NOT NULL DEFAULT 'Unknown',
  screen_resolution TEXT,
  referrer TEXT,
  timezone TEXT,
  language TEXT,
  connection_type TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  color_scheme TEXT,
  current_route TEXT NOT NULL DEFAULT 'landing',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_duration_sec INTEGER NOT NULL DEFAULT 0,
  total_clicks INTEGER NOT NULL DEFAULT 0,
  rage_clicks INTEGER NOT NULL DEFAULT 0,
  total_page_views INTEGER NOT NULL DEFAULT 0,
  max_scroll_pct INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_ua_sessions_profile_last
  ON public.user_activity_sessions (profile_id, last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_ua_sessions_last_active
  ON public.user_activity_sessions (last_active_at DESC);

-- 2. USER ACTIVITY EVENTS TABLE
CREATE TABLE IF NOT EXISTS public.user_activity_events (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  profile_id BIGINT REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL DEFAULT 'Guest Visitor',
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'session_start',
      'session_heartbeat',
      'page_view',
      'page_leave',
      'click',
      'rage_click',
      'scroll_milestone',
      'search',
      'profile_view',
      'post_interaction',
      'ad_impression',
      'ad_click'
    )
  ),
  route TEXT NOT NULL DEFAULT 'landing',
  route_label TEXT NOT NULL DEFAULT 'Landing Page',
  element_tag TEXT,
  element_label TEXT,
  element_section TEXT,
  click_x_pct NUMERIC(5, 2),
  click_y_pct NUMERIC(5, 2),
  duration_sec INTEGER NOT NULL DEFAULT 0,
  scroll_depth_pct INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ua_events_profile_created
  ON public.user_activity_events (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ua_events_route_created
  ON public.user_activity_events (route, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ua_events_type_created
  ON public.user_activity_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ua_events_session
  ON public.user_activity_events (session_id, created_at DESC);

-- 3. AD AUDIENCE SEGMENTS TABLE
CREATE TABLE IF NOT EXISTS public.ad_audience_segments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  target_routes TEXT[] NOT NULL DEFAULT '{}',
  target_interests TEXT[] NOT NULL DEFAULT '{}',
  target_devices TEXT[] NOT NULL DEFAULT '{}',
  min_clicks INTEGER NOT NULL DEFAULT 0,
  min_dwell_sec INTEGER NOT NULL DEFAULT 0,
  min_batch INTEGER,
  max_batch INTEGER,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. GRANTS & STRICT ROW-LEVEL SECURITY
ALTER TABLE public.user_activity_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_audience_segments ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.user_activity_sessions,
  public.user_activity_events,
  public.ad_audience_segments
TO authenticated;

GRANT USAGE, SELECT ON SEQUENCE public.user_activity_events_id_seq TO authenticated;

-- Sessions policies: Users can log their own session; ONLY Super Admin can read/delete all
DROP POLICY IF EXISTS "ua_sessions_insert_own" ON public.user_activity_sessions;
CREATE POLICY "ua_sessions_insert_own"
  ON public.user_activity_sessions FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid() OR auth_user_id IS NULL);

DROP POLICY IF EXISTS "ua_sessions_update_own" ON public.user_activity_sessions;
CREATE POLICY "ua_sessions_update_own"
  ON public.user_activity_sessions FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid() OR public.is_admin())
  WITH CHECK (auth_user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "ua_sessions_admin_select" ON public.user_activity_sessions;
CREATE POLICY "ua_sessions_admin_select"
  ON public.user_activity_sessions FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ua_sessions_admin_delete" ON public.user_activity_sessions;
CREATE POLICY "ua_sessions_admin_delete"
  ON public.user_activity_sessions FOR DELETE TO authenticated
  USING (public.is_admin());

-- Events policies: Users can append their own events; ONLY Super Admin can read/delete all
DROP POLICY IF EXISTS "ua_events_insert_own" ON public.user_activity_events;
CREATE POLICY "ua_events_insert_own"
  ON public.user_activity_events FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid() OR auth_user_id IS NULL);

DROP POLICY IF EXISTS "ua_events_admin_select" ON public.user_activity_events;
CREATE POLICY "ua_events_admin_select"
  ON public.user_activity_events FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "ua_events_admin_delete" ON public.user_activity_events;
CREATE POLICY "ua_events_admin_delete"
  ON public.user_activity_events FOR DELETE TO authenticated
  USING (public.is_admin());

-- Ad Audience Segments: Super Admin only
DROP POLICY IF EXISTS "ad_segments_admin_all" ON public.ad_audience_segments;
CREATE POLICY "ad_segments_admin_all"
  ON public.ad_audience_segments FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5. REALTIME BROADCASTING FOR LIVE SUPER ADMIN MONITORING
ALTER TABLE public.user_activity_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.user_activity_events REPLICA IDENTITY FULL;
ALTER TABLE public.ad_audience_segments REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_activity_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_activity_sessions;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_activity_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_activity_events;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ad_audience_segments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_audience_segments;
  END IF;
END $$;

COMMIT;
