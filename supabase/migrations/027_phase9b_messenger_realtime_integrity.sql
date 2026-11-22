-- =============================================================================
-- MIGRATION 027: PHASE 9B — MESSENGER REALTIME RELIABILITY & DATA INTEGRITY
-- =============================================================================
-- Fixes data integrity & performance gaps in the Supabase Messenger layer:
--   1. Keep conversations.last_message in sync when the latest message is edited
--      or soft-deleted (previously only AFTER INSERT updated conversations).
--   2. Server-side per-conversation unread counts RPC (removes the 1,000-row
--      client-side scan cap in listConversations).
--   3. Lightweight touch_my_last_seen() RPC to keep profiles.last_seen_at fresh
--      for real offline "Last seen" status.
--   4. Composite partial index for fast unread counting & cursor pagination.
--
-- Idempotent and safe to run multiple times in Supabase SQL Editor.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. PERFORMANCE INDEXES FOR CURSOR PAGINATION & UNREAD COUNTS
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_messages_conv_active_created
  ON public.messages (conversation_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 2. TRIGGER: SYNC conversations.last_message ON MESSAGE EDIT OR SOFT-DELETE
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_message_updated_sync_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest_id TEXT;
  v_preview   TEXT;
BEGIN
  -- Only act when body or deleted_at actually changed
  IF NEW.body IS NOT DISTINCT FROM OLD.body
     AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN
    RETURN NEW;
  END IF;

  -- Check whether the modified message is currently the latest message in this conversation
  SELECT m.id
  INTO v_latest_id
  FROM public.messages m
  WHERE m.conversation_id = NEW.conversation_id
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT 1;

  IF v_latest_id IS DISTINCT FROM NEW.id THEN
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    v_preview := 'Message deleted';
  ELSIF NEW.type = 'like' THEN
    v_preview := '👍 Sent a like';
  ELSIF NEW.type = 'image' THEN
    v_preview := CASE
      WHEN NULLIF(TRIM(COALESCE(NEW.body, '')), '') IS NOT NULL AND NEW.body <> 'Photo'
        THEN '📷 ' || substring(NEW.body from 1 for 180)
      ELSE '📷 Sent a photo'
    END;
  ELSE
    v_preview := substring(COALESCE(NEW.body, '') from 1 for 200);
  END IF;

  UPDATE public.conversations
  SET
    last_message = v_preview,
    updated_at = now()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_message_updated_sync_conversation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_message_updated_sync_conversation ON public.messages;
CREATE TRIGGER trg_message_updated_sync_conversation
AFTER UPDATE OF body, deleted_at ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.handle_message_updated_sync_conversation();

-- -----------------------------------------------------------------------------
-- 3. RPC: get_unread_counts_by_conversation()
--    Accurate per-conversation unread counts for the signed-in user with no
--    client-side row limit.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_unread_counts_by_conversation()
RETURNS TABLE (
  conversation_id TEXT,
  unread_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cp.conversation_id,
    COUNT(m.id)::INTEGER AS unread_count
  FROM public.conversation_participants cp
  LEFT JOIN public.messages m
    ON m.conversation_id = cp.conversation_id
   AND m.sender_id <> cp.profile_id
   AND m.deleted_at IS NULL
   AND m.created_at > cp.last_read_at
  WHERE cp.profile_id = public.get_current_profile_id()
  GROUP BY cp.conversation_id;
$$;

REVOKE ALL ON FUNCTION public.get_unread_counts_by_conversation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_unread_counts_by_conversation() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. RPC: touch_my_last_seen()
--    Updates profiles.last_seen_at for the authenticated caller.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_my_last_seen()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET last_seen_at = now()
  WHERE user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.touch_my_last_seen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_my_last_seen() TO authenticated, service_role;

COMMIT;
