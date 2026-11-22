-- =============================================================================
-- MIGRATION 020: PHASE 0 SECURITY & CANONICAL ROLE HIERARCHY HARDENING
-- Project: Shaheed Ziaur Rahman Medical College Alumni Network (SZMC Bogura)
-- Safe & Idempotent: Run directly in Supabase Dashboard -> SQL Editor
-- =============================================================================
-- Establishes one authoritative server/database role hierarchy:
--   member < batch_representative < moderator < admin < super_admin
--
-- Changes:
--   1. Non-destructively adds 'super_admin' and 'batch_representative' to public.user_role enum.
--   2. Introduces authoritative SECURITY DEFINER helper public.is_super_admin(),
--      and aligns public.is_admin() and public.is_admin_or_mod() cleanly on role column.
--   3. Promotes existing bootstrap super admin account(s) to 'super_admin' role safely.
--   4. Restricts telemetry & ad-audience RLS policies strictly to public.is_super_admin().
--   5. Adds role-escalation guard trigger so only Super Admins (or service_role) can assign
--      or modify 'admin' / 'super_admin' roles on public.alumni_profiles.
-- =============================================================================

-- 1. Extend public.user_role enum safely (ALTER TYPE ... ADD VALUE cannot run inside a transaction block in older Postgres)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role' AND typnamespace = 'public'::regnamespace) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'public.user_role'::regtype AND enumlabel = 'batch_representative'
    ) THEN
      ALTER TYPE public.user_role ADD VALUE 'batch_representative';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'public.user_role'::regtype AND enumlabel = 'super_admin'
    ) THEN
      ALTER TYPE public.user_role ADD VALUE 'super_admin';
    END IF;
  END IF;
END $$;

BEGIN;

-- 2. Promote existing bootstrap Super Admin profile(s) cleanly if present
UPDATE public.alumni_profiles
SET role = 'super_admin'
WHERE lower(email) IN (
  'admin@szmcalumni.net',
  'nurulanambashir25@gmail.com',
  'nurulanambashir20@gmail.com',
  'nabchatgpt25@gmail.com',
  'firstaidnetworkbd@gmail.com',
  'support@szmcalumni.net'
)
AND role::text <> 'super_admin';

-- 3. Authoritative Role Helpers (Single Source of Truth)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.alumni_profiles
    WHERE auth_user_id = auth.uid()
      AND role::text = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.alumni_profiles
    WHERE auth_user_id = auth.uid()
      AND role::text IN ('admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_mod()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.alumni_profiles
    WHERE auth_user_id = auth.uid()
      AND role::text IN ('super_admin', 'admin', 'moderator')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_mod() TO anon, authenticated, service_role;

-- 4. Tighten Telemetry & Ad Audience RLS strictly to Super Admin ONLY
DO $$
BEGIN
  IF to_regclass('public.user_activity_sessions') IS NOT NULL THEN
    DROP POLICY IF EXISTS "ua_sessions_update_own" ON public.user_activity_sessions;
    CREATE POLICY "ua_sessions_update_own"
      ON public.user_activity_sessions FOR UPDATE TO authenticated
      USING (auth_user_id = auth.uid() OR public.is_super_admin())
      WITH CHECK (auth_user_id = auth.uid() OR public.is_super_admin());

    DROP POLICY IF EXISTS "ua_sessions_admin_select" ON public.user_activity_sessions;
    CREATE POLICY "ua_sessions_admin_select"
      ON public.user_activity_sessions FOR SELECT TO authenticated
      USING (public.is_super_admin());

    DROP POLICY IF EXISTS "ua_sessions_admin_delete" ON public.user_activity_sessions;
    CREATE POLICY "ua_sessions_admin_delete"
      ON public.user_activity_sessions FOR DELETE TO authenticated
      USING (public.is_super_admin());
  END IF;

  IF to_regclass('public.user_activity_events') IS NOT NULL THEN
    DROP POLICY IF EXISTS "ua_events_admin_select" ON public.user_activity_events;
    CREATE POLICY "ua_events_admin_select"
      ON public.user_activity_events FOR SELECT TO authenticated
      USING (public.is_super_admin());

    DROP POLICY IF EXISTS "ua_events_admin_delete" ON public.user_activity_events;
    CREATE POLICY "ua_events_admin_delete"
      ON public.user_activity_events FOR DELETE TO authenticated
      USING (public.is_super_admin());
  END IF;

  IF to_regclass('public.ad_audience_segments') IS NOT NULL THEN
    DROP POLICY IF EXISTS "ad_segments_admin_all" ON public.ad_audience_segments;
    CREATE POLICY "ad_segments_admin_all"
      ON public.ad_audience_segments FOR ALL TO authenticated
      USING (public.is_super_admin())
      WITH CHECK (public.is_super_admin());
  END IF;
END $$;

-- 5. Database-Level Privilege Escalation Guard Trigger on public.alumni_profiles
CREATE OR REPLACE FUNCTION public.guard_alumni_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  -- Allow migrations / Postgres superuser / service_role server operations
  IF auth.uid() IS NULL OR v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Prevent any non-super-admin from changing roles to/from admin or super_admin
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_super_admin() THEN
      IF NEW.role::text IN ('admin', 'super_admin') OR OLD.role::text IN ('admin', 'super_admin') THEN
        RAISE EXCEPTION 'Forbidden: Only Super Administrators can assign or modify admin/super_admin roles.';
      END IF;
      IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Forbidden: Only Administrators can modify member roles.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_alumni_role_escalation ON public.alumni_profiles;
CREATE TRIGGER trg_guard_alumni_role_escalation
  BEFORE UPDATE ON public.alumni_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_alumni_role_escalation();

COMMIT;
