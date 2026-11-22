-- =============================================================================
-- MIGRATION 023: PHASE 4 — UPGRADED GLOBAL FEED, RANKING WEIGHTS & CURSOR RPC
-- Project: Shaheed Ziaur Rahman Medical College Alumni Network (SZMC Bogura)
-- System:  THE QUAD — SZMC ALUMNI COMMUNITY
-- Safe & Idempotent: Run directly in Supabase Dashboard -> SQL Editor
-- =============================================================================
-- Non-destructively adds:
--   1. Audience, 8 canonical community categories, featured, official, and
--      priority columns on public.posts (preserving legacy category enum/text).
--   2. public.feed_ranking_weights singleton configuration table (admin-editable).
--   3. DB trigger guard preventing unauthorized users from setting is_official,
--      is_featured, or elevated priority_level.
--   4. Composite indexes for keyset cursor pagination and priority ordering.
--   5. public.get_quad_feed(...) RPC with:
--      - Server-enforced audience visibility
--      - Dedicated priority placement for Emergency Blood & Official Announcements
--        independent of engagement score
--      - Configurable For You ranking weights (batch, connections, followed pages,
--        recency decay, engagement cap, featured boost)
--      - Duplicate-free keyset cursor pagination
-- =============================================================================

BEGIN;

SET search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- 1. EXTEND public.posts WITH PHASE 4 GLOBAL FEED COLUMNS (NON-DESTRUCTIVE)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.posts') IS NOT NULL THEN
    ALTER TABLE public.posts
      ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'public';

    ALTER TABLE public.posts
      ADD COLUMN IF NOT EXISTS community_category TEXT NOT NULL DEFAULT 'General Discussion';

    ALTER TABLE public.posts
      ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE public.posts
      ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE public.posts
      ADD COLUMN IF NOT EXISTS priority_level SMALLINT NOT NULL DEFAULT 0;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_posts_audience') THEN
      ALTER TABLE public.posts
        ADD CONSTRAINT chk_posts_audience
        CHECK (audience IN ('public', 'alumni_only', 'my_batch', 'connections'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_posts_community_category') THEN
      ALTER TABLE public.posts
        ADD CONSTRAINT chk_posts_community_category
        CHECK (
          community_category IN (
            'General Discussion',
            'Announcement',
            'Achievement',
            'Career & Jobs',
            'Blood Request',
            'Events & Reunion',
            'Memories',
            'Help & Support'
          )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_posts_priority_level') THEN
      ALTER TABLE public.posts
        ADD CONSTRAINT chk_posts_priority_level
        CHECK (priority_level BETWEEN 0 AND 3);
    END IF;
  END IF;
END $$;

-- Non-destructive backfill of community_category from legacy category column
UPDATE public.posts
SET community_category = CASE lower(trim(COALESCE(category::text, '')))
  WHEN 'professional insights' THEN 'Career & Jobs'
  WHEN 'career' THEN 'Career & Jobs'
  WHEN 'career & jobs' THEN 'Career & Jobs'
  WHEN 'career & fellowship' THEN 'Career & Jobs'
  WHEN 'jobs' THEN 'Career & Jobs'
  WHEN 'reunion' THEN 'Events & Reunion'
  WHEN 'reunion & events' THEN 'Events & Reunion'
  WHEN 'events' THEN 'Events & Reunion'
  WHEN 'events & reunion' THEN 'Events & Reunion'
  WHEN 'achievement' THEN 'Achievement'
  WHEN 'alumni achievement' THEN 'Achievement'
  WHEN 'announcement' THEN 'Announcement'
  WHEN 'official' THEN 'Announcement'
  WHEN 'official announcement' THEN 'Announcement'
  WHEN 'blood' THEN 'Blood Request'
  WHEN 'blood request' THEN 'Blood Request'
  WHEN 'blood donation aid' THEN 'Blood Request'
  WHEN 'emergency' THEN 'Blood Request'
  WHEN 'memories' THEN 'Memories'
  WHEN 'campus memories' THEN 'Memories'
  WHEN 'nostalgia' THEN 'Memories'
  WHEN 'help' THEN 'Help & Support'
  WHEN 'help & support' THEN 'Help & Support'
  WHEN 'emergency help' THEN 'Help & Support'
  WHEN 'mentorship' THEN 'Help & Support'
  ELSE 'General Discussion'
END
WHERE community_category = 'General Discussion'
  AND COALESCE(category::text, '') <> ''
  AND lower(trim(category::text)) NOT IN ('general update', 'general discussion', 'general', 'tech & innovation');

-- Ensure existing pinned posts carry official priority cleanly
UPDATE public.posts
SET is_official = TRUE, priority_level = GREATEST(priority_level, 2)
WHERE is_pinned = TRUE AND is_official = FALSE;

-- -----------------------------------------------------------------------------
-- 2. PRIVILEGE GUARD FOR OFFICIAL / FEATURED / PRIORITY FLAGS ON public.posts
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_post_editorial_flags()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_can_official BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL OR v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  v_can_official := public.is_admin_or_mod()
    OR (
      NEW.official_page_id IS NOT NULL
      AND public.can_publish_as_official_page(NEW.official_page_id)
    );

  IF NEW.is_official IS TRUE AND NOT v_can_official THEN
    RAISE EXCEPTION 'Forbidden: Only authorized administrators, moderators, or official page editors can publish official announcements.';
  END IF;

  IF NEW.is_featured IS TRUE AND NOT public.is_admin_or_mod() THEN
    RAISE EXCEPTION 'Forbidden: Only administrators or moderators can mark posts as featured.';
  END IF;

  -- Allow Blood Request posts to carry priority_level = 3; otherwise cap non-admin priority at 0
  IF NEW.priority_level > 0 AND NOT v_can_official THEN
    IF NOT (NEW.community_category = 'Blood Request' AND NEW.priority_level = 3) THEN
      NEW.priority_level := 0;
    END IF;
  END IF;

  -- Auto-align priority_level when official/featured/emergency flags are set
  IF NEW.community_category = 'Blood Request' AND NEW.priority_level < 3 THEN
    NEW.priority_level := 3;
  ELSIF (NEW.is_official IS TRUE OR NEW.is_pinned IS TRUE) AND NEW.priority_level < 2 THEN
    NEW.priority_level := 2;
  ELSIF NEW.is_featured IS TRUE AND NEW.priority_level < 1 THEN
    NEW.priority_level := 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_post_editorial_flags ON public.posts;
CREATE TRIGGER trg_guard_post_editorial_flags
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_post_editorial_flags();

-- -----------------------------------------------------------------------------
-- 3. CONFIGURABLE FEED RANKING WEIGHTS TABLE (SINGLETON ROW id = 1)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feed_ranking_weights (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  batch_relevance_weight NUMERIC(6,2) NOT NULL DEFAULT 28.00 CHECK (batch_relevance_weight BETWEEN 0 AND 200),
  followed_alumni_weight NUMERIC(6,2) NOT NULL DEFAULT 20.00 CHECK (followed_alumni_weight BETWEEN 0 AND 200),
  followed_page_weight NUMERIC(6,2) NOT NULL DEFAULT 22.00 CHECK (followed_page_weight BETWEEN 0 AND 200),
  engagement_like_weight NUMERIC(6,2) NOT NULL DEFAULT 1.50 CHECK (engagement_like_weight BETWEEN 0 AND 50),
  engagement_comment_weight NUMERIC(6,2) NOT NULL DEFAULT 3.00 CHECK (engagement_comment_weight BETWEEN 0 AND 50),
  engagement_cap NUMERIC(6,2) NOT NULL DEFAULT 42.00 CHECK (engagement_cap BETWEEN 0 AND 300),
  recency_max_boost NUMERIC(6,2) NOT NULL DEFAULT 48.00 CHECK (recency_max_boost BETWEEN 0 AND 300),
  recency_decay_per_hour NUMERIC(6,3) NOT NULL DEFAULT 0.500 CHECK (recency_decay_per_hour BETWEEN 0.010 AND 20.000),
  featured_boost NUMERIC(6,2) NOT NULL DEFAULT 18.00 CHECK (featured_boost BETWEEN 0 AND 200),
  updated_by BIGINT NULL REFERENCES public.alumni_profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.feed_ranking_weights (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.feed_ranking_weights ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.feed_ranking_weights FROM anon;
GRANT SELECT ON public.feed_ranking_weights TO anon, authenticated;
GRANT INSERT, UPDATE ON public.feed_ranking_weights TO authenticated;

DROP POLICY IF EXISTS "feed_ranking_weights_public_read" ON public.feed_ranking_weights;
CREATE POLICY "feed_ranking_weights_public_read"
  ON public.feed_ranking_weights FOR SELECT TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "feed_ranking_weights_admin_write" ON public.feed_ranking_weights;
CREATE POLICY "feed_ranking_weights_admin_write"
  ON public.feed_ranking_weights FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 4. COMPOSITE INDEXES FOR KEYSET CURSOR PAGINATION & FILTERING
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_posts_quad_cursor_latest
  ON public.posts (created_at DESC, id DESC)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_posts_quad_category
  ON public.posts (community_category, created_at DESC, id DESC)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_posts_quad_priority
  ON public.posts (priority_level DESC, is_pinned DESC, created_at DESC, id DESC)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_posts_quad_audience
  ON public.posts (audience, created_at DESC, id DESC)
  WHERE is_deleted = FALSE;

-- -----------------------------------------------------------------------------
-- 5. UPGRADED KEYSET-PAGINATED RPC: public.get_quad_feed(...)
--    Preserves legacy public.get_feed(BIGINT, INT, INT) untouched for compatibility.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_quad_feed(
  p_user_id BIGINT DEFAULT NULL,
  p_feed_tab TEXT DEFAULT 'for_you',
  p_category TEXT DEFAULT 'All',
  p_limit INT DEFAULT 20,
  p_cursor_priority SMALLINT DEFAULT NULL,
  p_cursor_score DOUBLE PRECISION DEFAULT NULL,
  p_cursor_created_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  user_id BIGINT,
  author_id BIGINT,
  full_name TEXT,
  avatar_url TEXT,
  batch_year INT,
  verified BOOLEAN,
  profession TEXT,
  institution TEXT,
  content TEXT,
  category TEXT,
  community_category TEXT,
  audience TEXT,
  is_featured BOOLEAN,
  is_official BOOLEAN,
  priority_level SMALLINT,
  batch_lounge_year SMALLINT,
  official_page_id BIGINT,
  official_page_name TEXT,
  official_page_slug TEXT,
  images JSONB,
  videos JSONB,
  layout_template TEXT,
  linked_url TEXT,
  link_metadata JSONB,
  likes_count INT,
  comments_count INT,
  is_pinned BOOLEAN,
  is_edited BOOLEAN,
  created_at TIMESTAMPTZ,
  liked_by_me BOOLEAN,
  saved_by_me BOOLEAN,
  is_batchmate BOOLEAN,
  is_friend BOOLEAN,
  priority_tier SMALLINT,
  rank_score DOUBLE PRECISION,
  comments JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller_id BIGINT := p_user_id;
  v_my_batch SMALLINT := NULL;
  v_is_staff BOOLEAN := FALSE;
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_tab TEXT := COALESCE(NULLIF(trim(lower(p_feed_tab)), ''), 'for_you');
  v_cat TEXT := COALESCE(NULLIF(trim(p_category), ''), 'All');
  w_batch DOUBLE PRECISION := 28.0;
  w_friend DOUBLE PRECISION := 20.0;
  w_page DOUBLE PRECISION := 22.0;
  w_like DOUBLE PRECISION := 1.5;
  w_comment DOUBLE PRECISION := 3.0;
  w_eng_cap DOUBLE PRECISION := 42.0;
  w_rec_max DOUBLE PRECISION := 48.0;
  w_rec_decay DOUBLE PRECISION := 0.5;
  w_featured DOUBLE PRECISION := 18.0;
BEGIN
  -- Always prefer authenticated caller profile over arbitrary p_user_id
  IF auth.uid() IS NOT NULL THEN
    SELECT ap.id, ap.batch_year, (ap.role::text IN ('super_admin', 'admin', 'moderator'))
    INTO v_caller_id, v_my_batch, v_is_staff
    FROM public.alumni_profiles ap
    WHERE ap.auth_user_id = auth.uid()
    LIMIT 1;
  ELSIF v_caller_id IS NOT NULL THEN
    SELECT ap.batch_year, (ap.role::text IN ('super_admin', 'admin', 'moderator'))
    INTO v_my_batch, v_is_staff
    FROM public.alumni_profiles ap
    WHERE ap.id = v_caller_id
    LIMIT 1;
  END IF;

  -- Load live configurable weights
  SELECT
    batch_relevance_weight::DOUBLE PRECISION,
    followed_alumni_weight::DOUBLE PRECISION,
    followed_page_weight::DOUBLE PRECISION,
    engagement_like_weight::DOUBLE PRECISION,
    engagement_comment_weight::DOUBLE PRECISION,
    engagement_cap::DOUBLE PRECISION,
    recency_max_boost::DOUBLE PRECISION,
    recency_decay_per_hour::DOUBLE PRECISION,
    featured_boost::DOUBLE PRECISION
  INTO
    w_batch, w_friend, w_page, w_like, w_comment, w_eng_cap, w_rec_max, w_rec_decay, w_featured
  FROM public.feed_ranking_weights
  WHERE id = 1;

  RETURN QUERY
  WITH my_friends AS (
    SELECT c.friend_id AS fid
    FROM public.connections c
    WHERE c.user_id = v_caller_id AND c.status = 'accepted'
    UNION
    SELECT c.user_id AS fid
    FROM public.connections c
    WHERE c.friend_id = v_caller_id AND c.status = 'accepted'
  ),
  my_followed_pages AS (
    SELECT opf.page_id AS pid
    FROM public.official_page_followers opf
    WHERE opf.profile_id = v_caller_id
  ),
  scored AS (
    SELECT
      po.id AS r_id,
      po.author_id AS r_author_id,
      COALESCE(ap.full_name, 'SZMC Alumnus')::TEXT AS r_full_name,
      COALESCE(ap.avatar_url, '/assets/aistudio/images__1__2778177d.png')::TEXT AS r_avatar_url,
      ap.batch_year::INT AS r_batch_year,
      (ap.verification_status = 'verified') AS r_verified,
      COALESCE(ap.profession, 'Doctor / Medical Professional')::TEXT AS r_profession,
      ap.institution::TEXT AS r_institution,
      po.content::TEXT AS r_content,
      COALESCE(po.category::TEXT, 'General Update')::TEXT AS r_category,
      COALESCE(po.community_category, 'General Discussion')::TEXT AS r_community_category,
      COALESCE(po.audience, 'public')::TEXT AS r_audience,
      COALESCE(po.is_featured, FALSE) AS r_is_featured,
      COALESCE(po.is_official, FALSE) AS r_is_official,
      COALESCE(po.priority_level, 0)::SMALLINT AS r_priority_level,
      po.batch_lounge_year AS r_batch_lounge_year,
      po.official_page_id AS r_official_page_id,
      op.name::TEXT AS r_official_page_name,
      op.slug::TEXT AS r_official_page_slug,
      CASE WHEN jsonb_typeof(to_jsonb(po.images)) = 'array' THEN to_jsonb(po.images) ELSE '[]'::jsonb END AS r_images,
      CASE WHEN jsonb_typeof(to_jsonb(po.videos)) = 'array' THEN to_jsonb(po.videos) ELSE '[]'::jsonb END AS r_videos,
      COALESCE(po.layout_template, po.link_metadata->>'layout_template', 'grid')::TEXT AS r_layout_template,
      po.linked_url::TEXT AS r_linked_url,
      COALESCE(po.link_metadata, '{}'::jsonb) AS r_link_metadata,
      COALESCE(po.likes_count, 0)::INT AS r_likes_count,
      COALESCE(po.comments_count, 0)::INT AS r_comments_count,
      COALESCE(po.is_pinned, FALSE) AS r_is_pinned,
      COALESCE(po.is_edited, FALSE) AS r_is_edited,
      po.created_at AS r_created_at,
      EXISTS (
        SELECT 1 FROM public.post_likes pl
        WHERE pl.post_id = po.id AND pl.user_id = v_caller_id
      ) AS r_liked_by_me,
      EXISTS (
        SELECT 1 FROM public.saved_posts sp
        WHERE sp.post_id = po.id AND sp.user_id = v_caller_id
      ) AS r_saved_by_me,
      (
        v_my_batch IS NOT NULL
        AND ap.batch_year IS NOT NULL
        AND ap.batch_year = v_my_batch
        AND ap.id IS DISTINCT FROM v_caller_id
      ) AS r_is_batchmate,
      (ap.id IN (SELECT fid FROM my_friends)) AS r_is_friend,
      -- Priority placement independent of engagement ranking:
      -- 3 = Active Emergency / Blood Request (< 72h), 2 = Official / Pinned Announcement, 1 = Featured, 0 = Standard
      (
        CASE
          WHEN v_tab = 'latest' THEN 0
          WHEN (po.community_category = 'Blood Request' OR po.priority_level = 3)
               AND po.created_at >= (now() - interval '72 hours') THEN 3
          WHEN po.is_pinned = TRUE OR po.is_official = TRUE OR po.priority_level = 2 THEN 2
          WHEN po.is_featured = TRUE OR po.priority_level = 1 THEN 1
          ELSE 0
        END
      )::SMALLINT AS r_priority_tier,
      -- Configurable For You ranking score (rounded to 4 decimals for stable keyset cursor comparison)
      ROUND(
        (
          (CASE WHEN v_my_batch IS NOT NULL AND (ap.batch_year = v_my_batch OR po.batch_lounge_year = v_my_batch) THEN w_batch ELSE 0 END)
          + (CASE WHEN ap.id IN (SELECT fid FROM my_friends) THEN w_friend ELSE 0 END)
          + (CASE WHEN po.official_page_id IN (SELECT pid FROM my_followed_pages) THEN w_page ELSE 0 END)
          + (CASE WHEN po.is_featured = TRUE THEN w_featured ELSE 0 END)
          + LEAST(w_eng_cap, COALESCE(po.likes_count, 0) * w_like + COALESCE(po.comments_count, 0) * w_comment)
          + GREATEST(0.0, w_rec_max - (GREATEST(0.0, EXTRACT(EPOCH FROM (now() - po.created_at)) / 3600.0) * w_rec_decay))
        )::NUMERIC,
        4
      )::DOUBLE PRECISION AS r_rank_score
    FROM public.posts po
    LEFT JOIN public.alumni_profiles ap ON ap.id = po.author_id
    LEFT JOIN public.official_pages op ON op.id = po.official_page_id
    WHERE COALESCE(po.is_deleted, FALSE) = FALSE
      -- Enforce audience visibility server-side
      AND (
        v_is_staff = TRUE
        OR po.author_id = v_caller_id
        OR COALESCE(po.audience, 'public') IN ('public', 'alumni_only')
        OR (po.audience = 'my_batch' AND v_my_batch IS NOT NULL AND COALESCE(po.batch_lounge_year, ap.batch_year) = v_my_batch)
        OR (po.audience = 'connections' AND po.author_id IN (SELECT fid FROM my_friends))
      )
      -- Category filter
      AND (v_cat = 'All' OR po.community_category = v_cat)
      -- Feed tab filter
      AND (
        v_tab IN ('for_you', 'latest')
        OR (
          v_tab = 'my_batch'
          AND v_my_batch IS NOT NULL
          AND (ap.batch_year = v_my_batch OR po.batch_lounge_year = v_my_batch)
        )
        OR (
          v_tab = 'following'
          AND (
            po.author_id = v_caller_id
            OR po.author_id IN (SELECT fid FROM my_friends)
            OR po.official_page_id IN (SELECT pid FROM my_followed_pages)
          )
        )
      )
  )
  SELECT
    s.r_id,
    s.r_author_id,
    s.r_author_id,
    s.r_full_name,
    s.r_avatar_url,
    s.r_batch_year,
    s.r_verified,
    s.r_profession,
    s.r_institution,
    s.r_content,
    s.r_category,
    s.r_community_category,
    s.r_audience,
    s.r_is_featured,
    s.r_is_official,
    s.r_priority_level,
    s.r_batch_lounge_year,
    s.r_official_page_id,
    s.r_official_page_name,
    s.r_official_page_slug,
    s.r_images,
    s.r_videos,
    s.r_layout_template,
    s.r_linked_url,
    s.r_link_metadata,
    s.r_likes_count,
    s.r_comments_count,
    s.r_is_pinned,
    s.r_is_edited,
    s.r_created_at,
    s.r_liked_by_me,
    s.r_saved_by_me,
    s.r_is_batchmate,
    s.r_is_friend,
    s.r_priority_tier,
    s.r_rank_score,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', pc.id,
            'postId', pc.post_id,
            'userId', COALESCE(pc.user_id, pc.author_id),
            'fullName', COALESCE(cap.full_name, 'SZMC Alumnus'),
            'avatarUrl', COALESCE(cap.avatar_url, '/assets/aistudio/images__1__2778177d.png'),
            'content', pc.content,
            'likesCount', COALESCE(pc.likes_count, 0),
            'createdAt', pc.created_at
          )
          ORDER BY pc.created_at ASC
        )
        FROM public.post_comments pc
        LEFT JOIN public.alumni_profiles cap ON cap.id = COALESCE(pc.user_id, pc.author_id)
        WHERE pc.post_id = s.r_id AND COALESCE(pc.is_deleted, FALSE) = FALSE
      ),
      '[]'::jsonb
    ) AS comments
  FROM scored s
  WHERE
    p_cursor_id IS NULL
    OR (
      CASE
        WHEN v_tab = 'for_you' THEN
          (s.r_priority_tier, s.r_rank_score, s.r_created_at, s.r_id)
          < (
            COALESCE(p_cursor_priority, 0),
            COALESCE(p_cursor_score, 0),
            COALESCE(p_cursor_created_at, now()),
            p_cursor_id
          )
        ELSE
          (s.r_created_at, s.r_id) < (COALESCE(p_cursor_created_at, now()), p_cursor_id)
      END
    )
  ORDER BY
    CASE WHEN v_tab = 'for_you' THEN s.r_priority_tier ELSE 0 END DESC,
    CASE WHEN v_tab = 'for_you' THEN s.r_rank_score ELSE 0 END DESC,
    s.r_created_at DESC,
    s.r_id DESC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_quad_feed(BIGINT, TEXT, TEXT, INT, SMALLINT, DOUBLE PRECISION, TIMESTAMPTZ, BIGINT)
  TO authenticated, service_role;

COMMIT;
