-- =============================================================================
-- MIGRATION 033: DROP college_roll AND profession FROM public.alumni_profiles
-- Safe & Idempotent: Run in Supabase Dashboard -> SQL Editor.
-- Updates all dependent views, RPC functions, generated full-text search
-- column, and indexes before dropping college_roll and profession.
-- =============================================================================

BEGIN;

-- 1. Drop indexes referencing college_roll, profession, or search_vector
DROP INDEX IF EXISTS public.uq_alumni_batch_college_roll;
DROP INDEX IF EXISTS public.idx_alumni_profession_cursor;
DROP INDEX IF EXISTS public.idx_alumni_search_vector_gin;

-- 2. Recreate public_alumni_directory view without profession
DROP VIEW IF EXISTS public.public_alumni_directory;
CREATE VIEW public.public_alumni_directory
WITH (security_invoker = true)
AS
SELECT
  id,
  full_name,
  avatar_url,
  cover_url,
  batch_year,
  session,
  academic_stream,
  academic_group,
  section,
  verification_status,
  position,
  institution,
  cadre,
  specialty,
  specialty_other,
  degree,
  city,
  country,
  latitude,
  longitude,
  bio,
  career_history,
  badges,
  blood_group,
  is_public,
  posts_count,
  last_seen_at,
  created_at
FROM public.alumni_profiles
WHERE is_public = TRUE;

REVOKE ALL ON public.public_alumni_directory FROM PUBLIC, anon;
GRANT SELECT ON public.public_alumni_directory TO authenticated, service_role;

-- 3. Recreate get_alumni_contact_details RPC without college_roll
DROP FUNCTION IF EXISTS public.get_alumni_contact_details(BIGINT) CASCADE;
CREATE OR REPLACE FUNCTION public.get_alumni_contact_details(p_profile_id BIGINT)
RETURNS TABLE (
  profile_id BIGINT,
  email extensions.citext,
  phone VARCHAR(32),
  whatsapp VARCHAR(32),
  fb_link TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to access alumni contact details.';
  END IF;

  RETURN QUERY
  SELECT
    ap.id AS profile_id,
    CASE
      WHEN ap.auth_user_id = auth.uid()
        OR public.is_admin_or_mod()
        OR (public.is_verified_alumnus() AND ap.is_public = TRUE AND ap.show_contact_to_verified = TRUE)
      THEN ap.email
      ELSE NULL
    END AS email,
    CASE
      WHEN ap.auth_user_id = auth.uid()
        OR public.is_admin_or_mod()
        OR (public.is_verified_alumnus() AND ap.is_public = TRUE AND ap.show_contact_to_verified = TRUE)
      THEN ap.phone
      ELSE NULL
    END AS phone,
    CASE
      WHEN ap.auth_user_id = auth.uid()
        OR public.is_admin_or_mod()
        OR (public.is_verified_alumnus() AND ap.is_public = TRUE AND ap.show_contact_to_verified = TRUE)
      THEN ap.whatsapp
      ELSE NULL
    END AS whatsapp,
    CASE
      WHEN ap.auth_user_id = auth.uid()
        OR public.is_admin_or_mod()
        OR (public.is_verified_alumnus() AND ap.is_public = TRUE AND ap.show_contact_to_verified = TRUE)
      THEN ap.fb_link
      ELSE NULL
    END AS fb_link
  FROM public.alumni_profiles ap
  WHERE ap.id = p_profile_id
    AND (
      ap.is_public = TRUE
      OR ap.auth_user_id = auth.uid()
      OR public.is_admin_or_mod()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_alumni_contact_details(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_alumni_contact_details(BIGINT) TO authenticated, service_role;

-- 4. Update get_feed RPC to read ap.position instead of dropped ap.profession
CREATE OR REPLACE FUNCTION public.get_feed(
  p_user_id BIGINT DEFAULT NULL,
  p_limit INT DEFAULT 25,
  p_offset INT DEFAULT 0
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
  comments JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller_id BIGINT := NULL;
  v_my_batch INT := NULL;
  v_safe_limit INT := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
  v_safe_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT p.id INTO v_caller_id
    FROM public.alumni_profiles p
    WHERE p.auth_user_id = auth.uid()
    LIMIT 1;
  END IF;

  IF v_caller_id IS NULL AND public.is_internal_or_service_role() THEN
    v_caller_id := p_user_id;
  END IF;

  IF v_caller_id IS NOT NULL THEN
    SELECT p.batch_year INTO v_my_batch
    FROM public.alumni_profiles p
    WHERE p.id = v_caller_id
    LIMIT 1;
  END IF;

  RETURN QUERY
  WITH my_friends AS (
    SELECT c.friend_id AS fid
    FROM public.connections c
    WHERE v_caller_id IS NOT NULL AND c.user_id = v_caller_id AND c.status = 'accepted'
    UNION
    SELECT c.user_id AS fid
    FROM public.connections c
    WHERE v_caller_id IS NOT NULL AND c.friend_id = v_caller_id AND c.status = 'accepted'
  ),
  ranked_posts AS (
    SELECT
      po.id AS r_id,
      po.author_id AS r_author_id,
      COALESCE(ap.full_name, 'SZMC Alumnus')::TEXT AS r_full_name,
      COALESCE(ap.avatar_url, '/assets/aistudio/images__1__2778177d.png')::TEXT AS r_avatar_url,
      ap.batch_year AS r_batch_year,
      (ap.verification_status = 'verified') AS r_verified,
      COALESCE(NULLIF(ap.position, ''), 'Doctor / Medical Professional')::TEXT AS r_profession,
      ap.institution::TEXT AS r_institution,
      po.content::TEXT AS r_content,
      COALESCE(po.category, 'General Update')::TEXT AS r_category,
      CASE
        WHEN jsonb_typeof(to_jsonb(po.images)) = 'array' THEN to_jsonb(po.images)
        ELSE '[]'::jsonb
      END AS r_images,
      CASE
        WHEN jsonb_typeof(to_jsonb(po.videos)) = 'array' THEN to_jsonb(po.videos)
        ELSE '[]'::jsonb
      END AS r_videos,
      COALESCE(po.layout_template, po.link_metadata->>'layout_template', 'grid')::TEXT AS r_layout_template,
      po.linked_url::TEXT AS r_linked_url,
      COALESCE(po.link_metadata, '{}'::jsonb) AS r_link_metadata,
      COALESCE(po.likes_count, 0)::INT AS r_likes_count,
      COALESCE(po.comments_count, 0)::INT AS r_comments_count,
      COALESCE(po.is_pinned, FALSE) AS r_is_pinned,
      COALESCE(po.is_edited, FALSE) AS r_is_edited,
      po.created_at AS r_created_at,
      (
        v_caller_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.post_likes pl
          WHERE pl.post_id = po.id AND pl.user_id = v_caller_id
        )
      ) AS r_liked_by_me,
      (
        v_caller_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.saved_posts sp
          WHERE sp.post_id = po.id AND sp.user_id = v_caller_id
        )
      ) AS r_saved_by_me,
      (
        v_caller_id IS NOT NULL AND
        v_my_batch IS NOT NULL AND
        ap.batch_year IS NOT NULL AND
        ap.batch_year = v_my_batch AND
        ap.id != v_caller_id
      ) AS r_is_batchmate,
      (
        v_caller_id IS NOT NULL AND ap.id IN (SELECT fid FROM my_friends)
      ) AS r_is_friend,
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
          WHERE pc.post_id = po.id AND COALESCE(pc.is_deleted, false) = false
        ),
        '[]'::jsonb
      ) AS r_comments
    FROM public.posts po
    LEFT JOIN public.alumni_profiles ap ON ap.id = po.author_id
    WHERE COALESCE(po.is_deleted, FALSE) = FALSE
    ORDER BY
      COALESCE(po.is_pinned, FALSE) DESC,
      (CASE WHEN v_caller_id IS NOT NULL AND v_my_batch IS NOT NULL AND ap.batch_year = v_my_batch AND ap.id != v_caller_id THEN 1 ELSE 0 END) DESC,
      (CASE WHEN v_caller_id IS NOT NULL AND ap.id IN (SELECT fid FROM my_friends) THEN 1 ELSE 0 END) DESC,
      (COALESCE(po.likes_count, 0) * 2 + COALESCE(po.comments_count, 0) * 3) DESC,
      po.created_at DESC
    LIMIT v_safe_limit
    OFFSET v_safe_offset
  )
  SELECT
    r_id, r_author_id, r_author_id, r_full_name, r_avatar_url, r_batch_year,
    r_verified, r_profession, r_institution, r_content, r_category,
    r_images, r_videos, r_layout_template, r_linked_url, r_link_metadata,
    r_likes_count, r_comments_count, r_is_pinned, r_is_edited, r_created_at,
    r_liked_by_me, r_saved_by_me, r_is_batchmate, r_is_friend, r_comments
  FROM ranked_posts;
END;
$$;

-- 5. Update get_quad_feed RPC to read ap.position instead of dropped ap.profession
DROP FUNCTION IF EXISTS public.get_quad_feed(BIGINT, TEXT, TEXT, INT, SMALLINT, DOUBLE PRECISION, TIMESTAMPTZ, BIGINT);

CREATE OR REPLACE FUNCTION public.get_quad_feed(
  p_user_id BIGINT DEFAULT NULL,
  p_feed_tab TEXT DEFAULT 'for_you',
  p_category TEXT DEFAULT 'All',
  p_limit INT DEFAULT 20,
  p_cursor_priority INT DEFAULT NULL,
  p_cursor_score NUMERIC DEFAULT NULL,
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
  batch_lounge_year INT,
  official_page_id BIGINT,
  official_page_name TEXT,
  official_page_slug TEXT,
  repost_of_id BIGINT,
  repost_count INT,
  mentioned_user_ids BIGINT[],
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
  user_reaction TEXT,
  reactions_summary JSONB,
  saved_by_me BOOLEAN,
  is_batchmate BOOLEAN,
  is_friend BOOLEAN,
  is_following BOOLEAN,
  priority_tier INT,
  rank_score NUMERIC,
  comments JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller_id BIGINT := NULL;
  v_my_batch INT := NULL;
  v_is_staff BOOLEAN := FALSE;
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_tab TEXT := lower(COALESCE(p_feed_tab, 'for_you'));
  v_cat TEXT := COALESCE(p_category, 'All');
  v_w public.feed_ranking_weights%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT ap.id, ap.batch_year, (ap.role IN ('super_admin', 'admin', 'moderator'))
      INTO v_caller_id, v_my_batch, v_is_staff
    FROM public.alumni_profiles ap
    WHERE ap.auth_user_id = auth.uid()
    LIMIT 1;
  ELSIF p_user_id IS NOT NULL THEN
    SELECT ap.id, ap.batch_year, (ap.role IN ('super_admin', 'admin', 'moderator'))
      INTO v_caller_id, v_my_batch, v_is_staff
    FROM public.alumni_profiles ap
    WHERE ap.id = p_user_id
    LIMIT 1;
  END IF;

  SELECT * INTO v_w FROM public.feed_ranking_weights WHERE public.feed_ranking_weights.id = 1;
  IF NOT FOUND THEN
    v_w.batch_relevance_weight := 28.00;
    v_w.followed_alumni_weight := 20.00;
    v_w.followed_page_weight := 22.00;
    v_w.engagement_like_weight := 1.50;
    v_w.engagement_comment_weight := 3.00;
    v_w.engagement_cap := 42.00;
    v_w.recency_max_boost := 48.00;
    v_w.recency_decay_per_hour := 0.50;
    v_w.featured_boost := 18.00;
  END IF;

  RETURN QUERY
  WITH blocked_peers AS (
    SELECT ub.blocked_id AS peer_id
    FROM public.user_blocks ub
    WHERE v_caller_id IS NOT NULL AND ub.blocker_id = v_caller_id
    UNION
    SELECT ub.blocker_id AS peer_id
    FROM public.user_blocks ub
    WHERE v_caller_id IS NOT NULL AND ub.blocked_id = v_caller_id
  ),
  my_friends AS (
    SELECT CASE WHEN c.user_id = v_caller_id THEN c.friend_id ELSE c.user_id END AS friend_profile_id
    FROM public.connections c
    WHERE v_caller_id IS NOT NULL
      AND c.status = 'accepted'
      AND (c.user_id = v_caller_id OR c.friend_id = v_caller_id)
  ),
  my_follows AS (
    SELECT uf.following_id AS followed_profile_id
    FROM public.user_follows uf
    WHERE v_caller_id IS NOT NULL
      AND uf.follower_id = v_caller_id
  ),
  my_pages AS (
    SELECT opf.page_id
    FROM public.official_page_followers opf
    WHERE v_caller_id IS NOT NULL
      AND opf.profile_id = v_caller_id
  ),
  scored AS (
    SELECT
      p.id,
      p.author_id AS user_id,
      p.author_id,
      COALESCE(ap.full_name, 'SZMC Alumnus') AS full_name,
      COALESCE(ap.avatar_url, '/assets/aistudio/images__1__2778177d.png') AS avatar_url,
      ap.batch_year,
      (COALESCE(ap.verification_status, '') = 'verified') AS verified,
      COALESCE(NULLIF(ap.position, ''), 'Doctor / Medical Professional') AS profession,
      ap.institution,
      p.content,
      p.category::text AS category,
      COALESCE(p.community_category, 'General Discussion') AS community_category,
      COALESCE(p.audience, 'public') AS audience,
      COALESCE(p.is_featured, FALSE) AS is_featured,
      COALESCE(p.is_official, FALSE) AS is_official,
      COALESCE(p.priority_level, 0) AS priority_level,
      p.batch_lounge_year,
      p.official_page_id,
      op.name AS official_page_name,
      op.slug AS official_page_slug,
      p.repost_of_id,
      COALESCE(p.repost_count, 0) AS repost_count,
      COALESCE(p.mentioned_user_ids, '{}'::BIGINT[]) AS mentioned_user_ids,
      COALESCE(p.images, '[]'::jsonb) AS images,
      COALESCE(p.videos, '[]'::jsonb) AS videos,
      COALESCE(p.layout_template, 'carousel') AS layout_template,
      p.linked_url,
      p.link_metadata,
      COALESCE(p.likes_count, 0) AS likes_count,
      COALESCE(p.comments_count, 0) AS comments_count,
      COALESCE(p.is_pinned, FALSE) AS is_pinned,
      COALESCE(p.is_edited, FALSE) AS is_edited,
      p.created_at,
      EXISTS (
        SELECT 1 FROM public.post_likes pl
        WHERE pl.post_id = p.id AND v_caller_id IS NOT NULL AND pl.user_id = v_caller_id
      ) AS liked_by_me,
      (
        SELECT pl.reaction FROM public.post_likes pl
        WHERE pl.post_id = p.id AND v_caller_id IS NOT NULL AND pl.user_id = v_caller_id
        LIMIT 1
      ) AS user_reaction,
      COALESCE(
        (
          SELECT jsonb_object_agg(rx.reaction, rx.cnt)
          FROM (
            SELECT COALESCE(pl2.reaction, 'like') AS reaction, COUNT(*)::INT AS cnt
            FROM public.post_likes pl2
            WHERE pl2.post_id = p.id
            GROUP BY COALESCE(pl2.reaction, 'like')
          ) rx
        ),
        '{}'::jsonb
      ) AS reactions_summary,
      EXISTS (
        SELECT 1 FROM public.saved_posts sp
        WHERE sp.post_id = p.id AND v_caller_id IS NOT NULL AND sp.user_id = v_caller_id
      ) AS saved_by_me,
      (
        v_my_batch IS NOT NULL
        AND COALESCE(p.batch_lounge_year, ap.batch_year) = v_my_batch
        AND p.author_id <> COALESCE(v_caller_id, -1)
      ) AS is_batchmate,
      EXISTS (SELECT 1 FROM my_friends mf WHERE mf.friend_profile_id = p.author_id) AS is_friend,
      EXISTS (SELECT 1 FROM my_follows mfl WHERE mfl.followed_profile_id = p.author_id) AS is_following,
      CASE
        WHEN v_tab = 'latest' THEN 0
        WHEN (COALESCE(p.community_category, '') = 'Blood Request' OR COALESCE(p.priority_level, 0) = 3)
             AND p.created_at >= (now() - INTERVAL '72 hours') THEN 3
        WHEN (COALESCE(p.is_pinned, FALSE) = TRUE OR COALESCE(p.is_official, FALSE) = TRUE OR COALESCE(p.priority_level, 0) = 2) THEN 2
        WHEN (COALESCE(p.is_featured, FALSE) = TRUE OR COALESCE(p.priority_level, 0) = 1) THEN 1
        ELSE 0
      END AS priority_tier,
      CASE
        WHEN v_tab = 'latest' THEN EXTRACT(EPOCH FROM p.created_at)::NUMERIC
        ELSE ROUND((
          (CASE WHEN v_my_batch IS NOT NULL AND COALESCE(p.batch_lounge_year, ap.batch_year) = v_my_batch THEN v_w.batch_relevance_weight ELSE 0 END)
          + (CASE WHEN EXISTS (SELECT 1 FROM my_friends mf WHERE mf.friend_profile_id = p.author_id)
                    OR EXISTS (SELECT 1 FROM my_follows mfl WHERE mfl.followed_profile_id = p.author_id)
                  THEN v_w.followed_alumni_weight ELSE 0 END)
          + (CASE WHEN p.official_page_id IS NOT NULL AND EXISTS (SELECT 1 FROM my_pages mp WHERE mp.page_id = p.official_page_id) THEN v_w.followed_page_weight ELSE 0 END)
          + (CASE WHEN COALESCE(p.is_featured, FALSE) THEN v_w.featured_boost ELSE 0 END)
          + LEAST(
              v_w.engagement_cap,
              COALESCE(p.likes_count, 0) * v_w.engagement_like_weight
              + COALESCE(p.comments_count, 0) * v_w.engagement_comment_weight
            )
          + GREATEST(
              0,
              v_w.recency_max_boost - (GREATEST(0, EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600.0) * v_w.recency_decay_per_hour)
            )
        )::NUMERIC, 4)
      END AS rank_score,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', pc.id,
              'postId', pc.post_id,
              'userId', pc.user_id,
              'parentCommentId', pc.parent_comment_id,
              'fullName', COALESCE(cap.full_name, 'SZMC Alumnus'),
              'avatarUrl', COALESCE(cap.avatar_url, '/assets/aistudio/images__1__2778177d.png'),
              'content', pc.content,
              'likesCount', COALESCE(pc.likes_count, 0),
              'likedByMe', FALSE,
              'createdAt', pc.created_at
            )
            ORDER BY pc.created_at ASC
          )
          FROM public.post_comments pc
          LEFT JOIN public.alumni_profiles cap ON cap.id = pc.user_id
          WHERE pc.post_id = p.id
            AND COALESCE(pc.is_deleted, FALSE) = FALSE
            AND NOT EXISTS (SELECT 1 FROM blocked_peers bp WHERE bp.peer_id = pc.user_id)
        ),
        '[]'::jsonb
      ) AS comments
    FROM public.posts p
    LEFT JOIN public.alumni_profiles ap ON ap.id = p.author_id
    LEFT JOIN public.official_pages op ON op.id = p.official_page_id
    WHERE COALESCE(p.is_deleted, FALSE) = FALSE
      AND NOT EXISTS (SELECT 1 FROM blocked_peers bp WHERE bp.peer_id = p.author_id)
      AND (
        v_is_staff
        OR p.author_id = v_caller_id
        OR COALESCE(p.audience, 'public') = 'public'
        OR (COALESCE(p.audience, 'public') = 'alumni_only' AND v_caller_id IS NOT NULL)
        OR (
          COALESCE(p.audience, 'public') = 'my_batch'
          AND v_my_batch IS NOT NULL
          AND COALESCE(p.batch_lounge_year, ap.batch_year) = v_my_batch
        )
        OR (
          COALESCE(p.audience, 'public') = 'connections'
          AND EXISTS (SELECT 1 FROM my_friends mf WHERE mf.friend_profile_id = p.author_id)
        )
      )
      AND (v_cat = 'All' OR COALESCE(p.community_category, 'General Discussion') = v_cat)
      AND (
        v_tab IN ('for_you', 'latest')
        OR (
          v_tab = 'my_batch'
          AND v_my_batch IS NOT NULL
          AND COALESCE(p.batch_lounge_year, ap.batch_year) = v_my_batch
        )
        OR (
          v_tab = 'following'
          AND (
            p.author_id = v_caller_id
            OR EXISTS (SELECT 1 FROM my_friends mf WHERE mf.friend_profile_id = p.author_id)
            OR EXISTS (SELECT 1 FROM my_follows mfl WHERE mfl.followed_profile_id = p.author_id)
            OR (p.official_page_id IS NOT NULL AND EXISTS (SELECT 1 FROM my_pages mp WHERE mp.page_id = p.official_page_id))
          )
        )
      )
  )
  SELECT *
  FROM scored s
  WHERE (
    p_cursor_id IS NULL
    OR (
      s.priority_tier,
      s.rank_score,
      s.created_at,
      s.id
    ) < (
      COALESCE(p_cursor_priority, 0),
      COALESCE(p_cursor_score, 0),
      COALESCE(p_cursor_created_at, 'infinity'::timestamptz),
      p_cursor_id
    )
  )
  ORDER BY s.priority_tier DESC, s.rank_score DESC, s.created_at DESC, s.id DESC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_quad_feed(BIGINT, TEXT, TEXT, INT, INT, NUMERIC, TIMESTAMPTZ, BIGINT)
  TO anon, authenticated, service_role;

-- 6. Rebuild generated search_vector without profession, then drop both columns
ALTER TABLE public.alumni_profiles
  DROP COLUMN IF EXISTS search_vector;

ALTER TABLE public.alumni_profiles
  DROP COLUMN IF EXISTS college_roll,
  DROP COLUMN IF EXISTS profession;

ALTER TABLE public.alumni_profiles
  ADD COLUMN search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(full_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(institution, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(position, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(city, '') || ' ' || coalesce(country, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_alumni_search_vector_gin
  ON public.alumni_profiles USING GIN (search_vector);

NOTIFY pgrst, 'reload schema';

COMMIT;
