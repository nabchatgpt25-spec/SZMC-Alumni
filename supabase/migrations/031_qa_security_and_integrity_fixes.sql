-- =============================================================================
-- MIGRATION 031: QA SECURITY, STORAGE & INTEGRITY REMEDIATION
-- Project: Shaheed Ziaur Rahman Medical College Alumni Network (SZMC Bogura)
-- Safe & Idempotent: Run directly in Supabase Dashboard -> SQL Editor
-- =============================================================================
-- What this migration fixes:
--   1. Adds 'MBBS' to public.academic_stream_type enum & academic_stream_groups
--      so profile writes defaulting to 'MBBS' never violate enum/FK constraints.
--   2. Fixes public.moderate_delete_message(TEXT) to insert valid columns into
--      public.audit_logs without swallowing audit-insert errors.
--   3. Revokes anonymous SELECT access on public.blood_requests, public.post_likes,
--      and public.gallery_photo_likes (authenticated alumni only).
--   4. Provisions private 'chat-media' storage bucket with participant-scoped RLS.
--   5. Adds atomic JSONB append RPCs for mentorship answers & career applications.
-- =============================================================================

-- Step 1: Add 'MBBS' enum value outside explicit transaction block
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'academic_stream_type'
  ) THEN
    ALTER TYPE public.academic_stream_type ADD VALUE IF NOT EXISTS 'MBBS';
  END IF;
END $$;

BEGIN;

SET search_path = public, extensions;

-- Step 2: Fix moderate_delete_message audit_logs column mapping
CREATE OR REPLACE FUNCTION public.moderate_delete_message(p_message_id TEXT)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller_pid BIGINT;
  v_caller_alumni_id BIGINT;
  v_caller_role public.user_role;
  v_is_admin BOOLEAN;
  v_target public.messages%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  v_caller_pid := public.get_current_profile_id();
  v_is_admin := public.is_messenger_admin();

  SELECT * INTO v_target
  FROM public.messages m
  WHERE m.id = p_message_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found.';
  END IF;

  IF v_target.sender_id <> v_caller_pid AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Permission denied: only the message author or an administrator can delete this message.';
  END IF;

  UPDATE public.messages
  SET deleted_at = COALESCE(deleted_at, now())
  WHERE id = p_message_id
  RETURNING * INTO v_target;

  -- Record moderation audit log accurately when an admin removes another user's message
  IF v_target.sender_id <> v_caller_pid AND to_regclass('public.audit_logs') IS NOT NULL THEN
    v_caller_alumni_id := public.resolve_alumni_id_for_messaging_profile(v_caller_pid);

    SELECT ap.role INTO v_caller_role
    FROM public.alumni_profiles ap
    WHERE ap.auth_user_id = auth.uid()
    LIMIT 1;

    INSERT INTO public.audit_logs (
      actor_profile_id,
      actor_auth_id,
      actor_role,
      action,
      entity_table,
      entity_id,
      old_values,
      new_values,
      reason,
      created_at
    ) VALUES (
      v_caller_alumni_id,
      auth.uid(),
      v_caller_role,
      'messenger_moderate_delete',
      'messages',
      v_target.id::text,
      jsonb_build_object(
        'conversation_id', v_target.conversation_id,
        'original_sender_id', v_target.sender_id
      ),
      jsonb_build_object('deleted_at', v_target.deleted_at),
      'Moderation soft-delete via Messenger security RPC',
      now()
    );
  END IF;

  RETURN v_target;
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_delete_message(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_delete_message(TEXT) TO authenticated, service_role;

-- Step 3: Restrict anonymous reads on sensitive/interaction tables
DO $$
BEGIN
  IF to_regclass('public.blood_requests') IS NOT NULL THEN
    REVOKE ALL ON public.blood_requests FROM anon;
    DROP POLICY IF EXISTS "Blood Requests: Public Read" ON public.blood_requests;
    DROP POLICY IF EXISTS "Blood Requests: Read Active" ON public.blood_requests;
    DROP POLICY IF EXISTS "Public view blood requests" ON public.blood_requests;
    DROP POLICY IF EXISTS "blood_requests_public_read" ON public.blood_requests;
    DROP POLICY IF EXISTS "blood_requests_select_authenticated" ON public.blood_requests;
    CREATE POLICY "blood_requests_select_authenticated"
      ON public.blood_requests FOR SELECT
      TO authenticated
      USING (
        status IN ('Active', 'Pending Verification', 'Fulfilled')
        OR requester_id = public.current_alumni_profile_id()
        OR public.is_admin_or_mod()
      );
  END IF;

  IF to_regclass('public.post_likes') IS NOT NULL THEN
    REVOKE ALL ON public.post_likes FROM anon;
    DROP POLICY IF EXISTS "Likes: Public Read" ON public.post_likes;
    DROP POLICY IF EXISTS "likes_select" ON public.post_likes;
    DROP POLICY IF EXISTS "post_likes_select_authenticated" ON public.post_likes;
    CREATE POLICY "post_likes_select_authenticated"
      ON public.post_likes FOR SELECT
      TO authenticated
      USING (TRUE);
  END IF;

  IF to_regclass('public.gallery_photo_likes') IS NOT NULL THEN
    REVOKE ALL ON public.gallery_photo_likes FROM anon;
    DROP POLICY IF EXISTS "gallery_photo_likes_select_all" ON public.gallery_photo_likes;
    DROP POLICY IF EXISTS "gallery_photo_likes_select_authenticated" ON public.gallery_photo_likes;
    CREATE POLICY "gallery_photo_likes_select_authenticated"
      ON public.gallery_photo_likes FOR SELECT
      TO authenticated
      USING (TRUE);
  END IF;
END $$;

-- Step 4: Private chat-media storage bucket & participant-scoped policies
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  false,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Chat Media: Participant Select" ON storage.objects;
CREATE POLICY "Chat Media: Participant Select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (
    auth.uid() = owner
    OR public.is_admin_or_mod()
    OR EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      JOIN public.profiles p ON p.id = cp.profile_id
      WHERE p.user_id = auth.uid()
        AND cp.conversation_id::text = (storage.foldername(name))[1]
    )
  )
);

DROP POLICY IF EXISTS "Chat Media: Participant Upload" ON storage.objects;
CREATE POLICY "Chat Media: Participant Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-media'
  AND owner = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    JOIN public.profiles p ON p.id = cp.profile_id
    WHERE p.user_id = auth.uid()
      AND cp.conversation_id::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS "Chat Media: Owner or Admin Delete" ON storage.objects;
CREATE POLICY "Chat Media: Owner or Admin Delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (owner = auth.uid() OR public.is_admin_or_mod())
);

-- Step 5: Atomic JSONB append RPCs for mentorship answers & career applications
CREATE OR REPLACE FUNCTION public.append_mentorship_answer(
  p_request_id TEXT,
  p_answer JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_updated JSONB;
BEGIN
  UPDATE public.mentorship_requests
  SET answers = COALESCE(answers, '[]'::jsonb) || jsonb_build_array(p_answer),
      status = 'answered',
      updated_at = now()
  WHERE id::text = p_request_id
  RETURNING answers INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mentorship request not found.';
  END IF;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.append_mentorship_answer(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_mentorship_answer(TEXT, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.append_career_applicant(
  p_opportunity_id TEXT,
  p_applicant JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_updated JSONB;
BEGIN
  UPDATE public.career_opportunities
  SET applicants = jsonb_build_array(p_applicant) || COALESCE(applicants, '[]'::jsonb),
      updated_at = now()
  WHERE id::text = p_opportunity_id
  RETURNING applicants INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Career opportunity not found.';
  END IF;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.append_career_applicant(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_career_applicant(TEXT, JSONB) TO service_role;

COMMIT;

-- Step 6: Seed 'MBBS' in academic_stream_groups after COMMIT of enum addition
DO $$
BEGIN
  IF to_regclass('public.academic_stream_groups') IS NOT NULL THEN
    INSERT INTO public.academic_stream_groups (stream, group_code, expected_group_count, is_active)
    VALUES ('MBBS'::public.academic_stream_type, NULL, 0, TRUE)
    ON CONFLICT DO NOTHING;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
