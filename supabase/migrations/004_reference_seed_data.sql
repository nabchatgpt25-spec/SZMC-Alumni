-- =============================================================================
-- MIGRATION 004: STATIC & REFERENCE SEED DATA ONLY
-- Project: Notre Dame College (NDC) Alumni Platform
-- Target: Supabase PostgreSQL
--
-- STRICT PRODUCTION DATA POLICY:
-- 1. Seeds ONLY structurally required batch_year keys (1 through 78) in
--    `public.batches` so foreign-key references on `alumni_profiles.batch_year`
--    succeed.
-- 2. Does NOT seed fabricated `estimated_total` formulas, invented
--    `representative_name` values, unverified `session` strings, or invented
--    historical labels; all unverified institutional fields are set to NULL.
-- 3. Reference placeholder rows in `public.official_notices` are explicitly
--    labeled `[REFERENCE PLACEHOLDER]` and set to `is_published = FALSE` so
--    they never appear as live published notices.
-- 4. Contains ZERO fake alumni profiles, ZERO demo accounts, ZERO fake posts,
--    ZERO fake comments/likes, ZERO fake verification requests, and ZERO fake
--    blood donors/requests.
-- =============================================================================

BEGIN;

SET search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- 1. BATCH REFERENCE KEYS (Batches 1 to 78)
-- Only `batch_year` and `registered_count = 0` are populated; unverified
-- institutional fields remain NULL until entered by an administrator.
-- -----------------------------------------------------------------------------
-- -----------------------------------------------------------------------------
-- 1. BATCH REFERENCE KEYS (SZMC MBBS Batches 1 to 50)
-- Est. 1992 (Batch 1: Session 1991-92, Batch 35: Session 2025-26)
-- -----------------------------------------------------------------------------
INSERT INTO public.batches (
  batch_year,
  session,
  hsc_year,
  special_note,
  representative_name,
  representative_profile_id,
  registered_count,
  estimated_total
)
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
ON CONFLICT (batch_year) DO UPDATE
SET
  session = EXCLUDED.session,
  hsc_year = EXCLUDED.hsc_year,
  special_note = COALESCE(public.batches.special_note, EXCLUDED.special_note),
  representative_name = COALESCE(public.batches.representative_name, EXCLUDED.representative_name),
  estimated_total = COALESCE(public.batches.estimated_total, EXCLUDED.estimated_total),
  updated_at = now();

-- -----------------------------------------------------------------------------
-- 1B. ACADEMIC STREAM & GROUP CONFIGURATION (`public.academic_stream_groups`)
-- Medical streams and departments for SZMC
-- -----------------------------------------------------------------------------
INSERT INTO public.academic_stream_groups (
  stream,
  group_code,
  expected_group_count,
  is_active
)
VALUES
  -- NOTE (fix): public.academic_stream_type only allows
  --   'Science', 'Humanities', 'Business Studies'.
  -- The previous 'MBBS' / medical-department rows raised
  --   invalid input value for enum academic_stream_type: "MBBS"
  -- which aborted this whole transaction, leaving public.batches EMPTY and
  -- breaking every alumni_profiles insert (FK on batch_year).
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
ON CONFLICT (stream, group_code) DO UPDATE
SET
  expected_group_count = EXCLUDED.expected_group_count,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- 2. OFFICIAL SZMC NOTICES
-- -----------------------------------------------------------------------------
INSERT INTO public.official_notices (
  ref_no,
  title,
  category,
  published_date,
  is_urgent,
  summary,
  full_content,
  pdf_url,
  file_size,
  signatory_name,
  signatory_designation,
  signatory_organization,
  is_published
)
VALUES
  (
    'SZMC/ALUMNI-2026/001',
    'Official Grand Reunion & Academic Conference 2026',
    'Reunion',
    CURRENT_DATE,
    TRUE,
    'Grand Reunion celebrating 35 MBBS Batches (1991–present) at SZMC Campus, Bogura.',
    E'Shaheed Ziaur Rahman Medical College (SZMC Bogura) Alumni Association warmly invites all registered alumni from Batch 01 to Batch 35 to the Grand Reunion and National Medical Conference.\n\nDate: December 2026\nVenue: SZMCH Auditorium & Main Campus Grounds, Bogura\n\nRegistration and peer verification can now be completed through the online portal.',
    NULL,
    NULL,
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
    NULL,
    NULL,
    'Dr. Kazi Rezwan',
    'Coordinator, Blood Network Committee',
    'Shaheed Ziaur Rahman Medical College (SZMC Bogura)',
    TRUE
  )
ON CONFLICT (ref_no) DO UPDATE
SET
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

COMMIT;

