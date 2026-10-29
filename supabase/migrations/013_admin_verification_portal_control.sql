-- =============================================================================
-- MIGRATION 013: ADMIN-CONTROLLED VERIFICATION PORTAL (SERVER-SIDE FEATURE FLAGS)
-- Project: SZMC Alumni Platform
-- Target: Supabase PostgreSQL
-- Description:
--   Adds a tiny, auditable feature-flag table so that platform-wide switches
--   (most importantly: whether the member-facing VERIFICATION SYSTEM is visible
--   or completely hidden) are stored in the database instead of only in the
--   administrator's browser localStorage.
--
--   - `member_verification_portal` = FALSE  -> alumni never see the Verification
--     Center, peer-vouch banners, verification badges or verification settings.
--     Verification is then performed exclusively from the Admin Panel.
--   - `member_verification_portal` = TRUE   -> the member verification UI is shown.
--
--   Reads are public (anon + authenticated) so the UI can decide what to render
--   before login; writes are restricted to admins/moderators by RLS.
--
--   Idempotent and additive. Safe to re-run.
-- =============================================================================

BEGIN;

SET search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- 1. TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_feature_flags (
  key TEXT PRIMARY KEY CHECK (char_length(trim(key)) BETWEEN 1 AND 64),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_feature_flags IS
  'Platform-wide switches managed from the Admin Panel. Public read, admin-only write.';

COMMENT ON COLUMN public.app_feature_flags.key IS
  'Stable flag key. Currently: member_verification_portal, global_verification_gate.';

-- -----------------------------------------------------------------------------
-- 2. DEFAULT FLAGS
--    member_verification_portal defaults to FALSE (hidden) per product decision:
--    the verification system is controlled from the Admin Panel only.
-- -----------------------------------------------------------------------------
INSERT INTO public.app_feature_flags (key, enabled, description)
VALUES
  ('member_verification_portal', FALSE,
   'Show the member-facing verification UI (Verification Center, peer vouches, badges, verification settings). When FALSE, verification is admin-panel only.'),
  ('global_verification_gate', TRUE,
   'Enforce the verification gate across website auth and gated features.')
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY + GRANTS
-- -----------------------------------------------------------------------------
ALTER TABLE public.app_feature_flags ENABLE ROW LEVEL SECURITY;

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

-- No DELETE policy: flags are permanent keys, only their value changes.

-- -----------------------------------------------------------------------------
-- 4. Keep updated_at accurate (reuses the shared helper from migration 002)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_app_feature_flags_updated_at ON public.app_feature_flags;
CREATE TRIGGER trg_app_feature_flags_updated_at
  BEFORE UPDATE ON public.app_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Realtime (optional): let open clients react instantly to a flag change
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.app_feature_flags;
    EXCEPTION
      WHEN duplicate_object THEN NULL; -- already a member of the publication
      WHEN undefined_object THEN NULL; -- table/publication mismatch on exotic setups
    END;
  END IF;
END $$;

COMMIT;
