import { supabase, getClientAuthHeaders } from '../lib/supabase';
import { PostItem, PostComment, LinkMetadata, PostAudience } from '../types/post';
import type { QuadFeedFilter, QuadPostCategory } from '../components/community/quadConstants';
import {
  buildCursorFromPost,
  dedupeAndRankFeedPosts,
  fetchFeedRankingWeights,
  type FeedCursor,
} from './feedRankingService';
import { buildCommentTree } from './richInteractionsUtils';
import {
  createPostPoll,
  fetchPostPollsMap,
  notifyMentionedUsers,
} from './richInteractionsService';
import { isPublicRowProfileCompleted } from '../utils/profileCompletion';

const POST_AUTHOR_PUBLIC_COLS =
  'id, full_name, avatar_url, batch_year, verification_status, profession, position, institution, cadre, specialty, degree, city, country, bio, career_history';

async function fetchAuthorCompletionMap(authorIds: number[]): Promise<Map<number, boolean>> {
  const map = new Map<number, boolean>();
  const unique = Array.from(new Set(authorIds.filter((id) => Number.isFinite(id) && id > 0)));
  if (unique.length === 0) return map;
  try {
    const { data } = await supabase
      .from('alumni_profiles')
      .select(POST_AUTHOR_PUBLIC_COLS)
      .in('id', unique);
    (data || []).forEach((row: any) => {
      map.set(Number(row.id), isPublicRowProfileCompleted(row));
    });
  } catch {}
  return map;
}

/**
 * Fetch feed posts via Supabase get_feed RPC.
 * Ranking in get_feed:
 * 1. Pinned posts
 * 2. Batchmates first (author batch_year === current user batch_year)
 * 3. Accepted connections (friends)
 * 4. Likes / reactions / comments count + recency
 *
 * NOTE: The client MUST preserve this exact ordering without re-sorting.
 */
export async function fetchFeedPosts(limit = 25, offset = 0, currentUserId?: number): Promise<PostItem[]> {
  try {
    // 1. Primary: Only supabase.rpc('get_feed')
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_feed', {
      p_user_id: currentUserId || null,
      p_limit: limit,
      p_offset: offset,
    });

    if (!rpcErr && Array.isArray(rpcData)) {
      const rpcAuthorIds = Array.from(
        new Set(rpcData.map((r: any) => Number(r.user_id || r.author_id)).filter(Boolean))
      );
      const completionMap = await fetchAuthorCompletionMap(rpcAuthorIds);
      return rpcData.map((row: any) => {
        const rawComments = Array.isArray(row.comments) ? row.comments : [];
        const formattedComments: PostComment[] = rawComments.map((c: any) => ({
          id: Number(c.id),
          postId: Number(c.postId || c.post_id || row.id),
          userId: Number(c.userId || c.user_id),
          fullName: c.fullName || c.full_name || 'SZMC Alumnus',
          avatarUrl: c.avatarUrl || c.avatar_url || '/assets/aistudio/images__1__2778177d.png',
          content: c.content || '',
          likesCount: Number(c.likesCount || c.likes_count || 0),
          likedByMe: Boolean(c.likedByMe),
          createdAt: c.createdAt || c.created_at || new Date().toISOString(),
        }));

        const cleanImages = Array.isArray(row.images)
          ? row.images
          : typeof row.images === 'string'
          ? (() => { try { return JSON.parse(row.images); } catch { return []; } })()
          : [];
        const cleanVideos = Array.isArray(row.videos)
          ? row.videos
          : typeof row.videos === 'string'
          ? (() => { try { return JSON.parse(row.videos); } catch { return []; } })()
          : [];

        const uid = Number(row.user_id || row.author_id);
        return {
          id: Number(row.id),
          userId: uid,
          fullName: row.full_name || 'SZMC Alumnus',
          avatarUrl: row.avatar_url || '/assets/aistudio/images__1__2778177d.png',
          batchYear: row.batch_year ? Number(row.batch_year) : undefined,
          verified: Boolean(row.verified),
          profileCompleted: completionMap.get(uid) ?? false,
          profession: row.profession || 'Doctor / Medical Professional',
          institution: row.institution || undefined,
          content: row.content || '',
          category: row.category || 'General Update',
          images: cleanImages,
          videos: cleanVideos,
          layout_template: row.layout_template || (cleanImages.length > 1 ? 'carousel' : 'grid'),
          linked_url: row.linked_url || undefined,
          link_metadata: row.link_metadata || undefined,
          likesCount: Number(row.likes_count || 0),
          commentsCount: Number(row.comments_count || 0),
          createdAt: row.created_at || new Date().toISOString(),
          likedByMe: Boolean(row.liked_by_me),
          isSaved: Boolean(row.saved_by_me),
          pinned: Boolean(row.is_pinned),
          isEdited: Boolean(row.is_edited),
          isBatchmate: Boolean(row.is_batchmate),
          isFriend: Boolean(row.is_friend),
          comments: formattedComments,
          // Legacy aliases
          author: row.full_name || 'SZMC Alumnus',
          authorAvatar: row.avatar_url || '/assets/aistudio/images__1__2778177d.png',
          authorBatch: row.batch_year ? Number(row.batch_year) : undefined,
          authorRole: 'Alumnus',
          timestamp: row.created_at || 'Just now',
          likes: Number(row.likes_count || 0),
          liked: Boolean(row.liked_by_me),
          commentsList: formattedComments,
          shares: 0,
        };
      });
    }

    // 2. Direct Supabase Query Fallback replicating the exact get_feed ranking
    // (Active if remote database schema cache has not yet refreshed for the RPC)
    const { data: postsData, error: postsErr } = await supabase
      .from('posts')
      .select(`
        id,
        author_id,
        content,
        category,
        images,
        videos,
        layout_template,
        linked_url,
        link_metadata,
        likes_count,
        comments_count,
        is_pinned,
        is_edited,
        created_at
      `)
      .eq('is_deleted', false)
      .range(offset, offset + limit * 2);

    if (postsErr || !postsData || postsData.length === 0) {
      // Fallback: fetch from server endpoint /api/posts
      try {
        const sRes = await fetch(`/api/posts?limit=${limit}`);
        if (sRes.ok) {
          const sJson = await sRes.json();
          if (Array.isArray(sJson?.posts) && sJson.posts.length > 0) {
            return sJson.posts;
          }
        }
      } catch {}
      return [];
    }

    const postIds = postsData.map((p) => p.id);
    const authorIds = Array.from(new Set(postsData.map((p) => p.author_id))).filter(Boolean);

    // Fetch author profiles, my connections, my batch, comments, likes and saves
    const [profilesRes, myProfileRes, connectionsRes, commentsRes, likesRes, savedRes, serverPostsRes] = await Promise.all([
      authorIds.length > 0
        ? Promise.resolve(
            supabase
              .from('alumni_profiles')
              .select(POST_AUTHOR_PUBLIC_COLS)
              .in('id', authorIds)
          )
        : Promise.resolve({ data: [] }),
      currentUserId
        ? Promise.resolve(
            supabase.from('alumni_profiles').select('batch_year').eq('id', currentUserId).maybeSingle()
          )
        : Promise.resolve({ data: null }),
      currentUserId
        ? Promise.resolve(
            supabase
              .from('connections')
              .select('user_id, friend_id')
              .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`)
              .eq('status', 'accepted')
          )
        : Promise.resolve({ data: [] }),
      postIds.length > 0
        ? Promise.resolve(
            supabase
              .from('post_comments')
              .select('id, post_id, user_id, author_id, content, likes_count, created_at')
              .in('post_id', postIds)
              .eq('is_deleted', false)
              .order('created_at', { ascending: true })
          )
        : Promise.resolve({ data: [] }),
      currentUserId && postIds.length > 0
        ? Promise.resolve(
            supabase.from('post_likes').select('post_id').eq('user_id', currentUserId).in('post_id', postIds)
          )
        : Promise.resolve({ data: [] }),
      currentUserId && postIds.length > 0
        ? Promise.resolve(
            supabase.from('saved_posts').select('post_id').eq('user_id', currentUserId).in('post_id', postIds)
          )
        : Promise.resolve({ data: [] }),
      fetch(`/api/posts?limit=${limit}`).then(r => r.ok ? r.json() : { posts: [] }).catch(() => ({ posts: [] })),
    ]);

    const myBatchYear = (myProfileRes as any)?.data?.batch_year || null;
    const myFriendIds = new Set<number>();
    ((connectionsRes as any)?.data || []).forEach((c: any) => {
      if (Number(c.user_id) === currentUserId) myFriendIds.add(Number(c.friend_id));
      else if (Number(c.friend_id) === currentUserId) myFriendIds.add(Number(c.user_id));
    });

    const authorMap = new Map<number, any>(((profilesRes as any)?.data || []).map((a: any) => [Number(a.id), a]));
    const myLikedPostIds = new Set<number>(((likesRes as any)?.data || []).map((l: any) => Number(l.post_id)));
    const mySavedPostIds = new Set<number>(((savedRes as any)?.data || []).map((s: any) => Number(s.post_id)));

    const commentsByPost = new Map<number, PostComment[]>();
    ((commentsRes as any)?.data || []).forEach((c: any) => {
      const pId = Number(c.post_id);
      const list = commentsByPost.get(pId) || [];
      const cUserId = Number(c.user_id || c.author_id);
      const author = authorMap.get(cUserId) || {};
      list.push({
        id: Number(c.id),
        postId: pId,
        userId: cUserId,
        fullName: author.full_name || 'SZMC Alumnus',
        avatarUrl: author.avatar_url || '/assets/aistudio/images__1__2778177d.png',
        content: c.content || '',
        likesCount: Number(c.likes_count || 0),
        likedByMe: false,
        createdAt: c.created_at || new Date().toISOString(),
      });
      commentsByPost.set(pId, list);
    });

    // Rank exactly as specified in get_feed:
    // 1. Pinned
    // 2. Batchmates first
    // 3. Accepted connections
    // 4. Likes/reactions/comments + recency
    const rankedPosts = [...postsData].sort((a: any, b: any) => {
      const aPinned = a.is_pinned ? 1 : 0;
      const bPinned = b.is_pinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;

      const aAuthor: any = authorMap.get(Number(a.author_id));
      const bAuthor: any = authorMap.get(Number(b.author_id));

      const aIsBatchmate =
        myBatchYear && aAuthor?.batch_year === myBatchYear && Number(a.author_id) !== currentUserId ? 1 : 0;
      const bIsBatchmate =
        myBatchYear && bAuthor?.batch_year === myBatchYear && Number(b.author_id) !== currentUserId ? 1 : 0;
      if (aIsBatchmate !== bIsBatchmate) return bIsBatchmate - aIsBatchmate;

      const aIsFriend = myFriendIds.has(Number(a.author_id)) ? 1 : 0;
      const bIsFriend = myFriendIds.has(Number(b.author_id)) ? 1 : 0;
      if (aIsFriend !== bIsFriend) return bIsFriend - aIsFriend;

      const aEngagement = (Number(a.likes_count) || 0) * 2 + (Number(a.comments_count) || 0) * 3;
      const bEngagement = (Number(b.likes_count) || 0) * 2 + (Number(b.comments_count) || 0) * 3;
      if (aEngagement !== bEngagement) return bEngagement - aEngagement;

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }).slice(0, limit);

    const supabaseMapped = rankedPosts.map((row: any) => {
      const author = authorMap.get(Number(row.author_id)) || {};
      const meta = typeof row.link_metadata === 'object' && row.link_metadata ? row.link_metadata : {};
      const authorName = author.full_name || meta.authorName || 'SZMC Alumnus';
      const authorAvatar = author.avatar_url || meta.authorAvatar || '/assets/aistudio/images__1__2778177d.png';
      const authorBatch = author.batch_year ? Number(author.batch_year) : (meta.authorBatch ? Number(meta.authorBatch) : 20);

      const isBatchmate = Boolean(
        myBatchYear && authorBatch === myBatchYear && Number(row.author_id) !== currentUserId
      );
      const isFriend = myFriendIds.has(Number(row.author_id));
      const cleanImages = Array.isArray(row.images) ? row.images : [];
      const cleanVideos = Array.isArray(row.videos) ? row.videos : [];

      return {
        id: Number(row.id),
        userId: Number(row.author_id),
        fullName: authorName,
        avatarUrl: authorAvatar,
        batchYear: authorBatch,
        verified: author.verification_status === 'verified',
        profileCompleted: isPublicRowProfileCompleted(author),
        profession: author.profession || 'Doctor / Medical Professional',
        institution: author.institution || undefined,
        content: row.content || '',
        category: row.category || 'General Update',
        images: cleanImages,
        videos: cleanVideos,
        layout_template: row.layout_template || (cleanImages.length > 1 ? 'carousel' : 'grid'),
        linked_url: row.linked_url || undefined,
        link_metadata: row.link_metadata || undefined,
        likesCount: Number(row.likes_count || 0),
        commentsCount: Number(row.comments_count || 0),
        createdAt: row.created_at || new Date().toISOString(),
        likedByMe: myLikedPostIds.has(Number(row.id)),
        isSaved: mySavedPostIds.has(Number(row.id)),
        pinned: Boolean(row.is_pinned),
        isEdited: Boolean(row.is_edited),
        isBatchmate,
        isFriend,
        comments: commentsByPost.get(Number(row.id)) || [],
        // Legacy compatibility
        author: authorName,
        authorAvatar: authorAvatar,
        authorBatch: authorBatch,
        authorRole: 'Alumnus',
        timestamp: row.created_at || 'Just now',
        likes: Number(row.likes_count || 0),
        liked: myLikedPostIds.has(Number(row.id)),
        commentsList: commentsByPost.get(Number(row.id)) || [],
        shares: 0,
      };
    });

    // Merge with server-side posts so newly created posts are never lost
    const serverPosts: PostItem[] = Array.isArray((serverPostsRes as any)?.posts) ? (serverPostsRes as any).posts : [];
    const mergedMap = new Map<number, PostItem>();
    serverPosts.forEach((p) => mergedMap.set(p.id, p));
    supabaseMapped.forEach((p) => mergedMap.set(p.id, p));

    return Array.from(mergedMap.values()).sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  } catch (err) {
    console.warn('fetchFeedPosts fallback to /api/posts:', err);
    try {
      const sRes = await fetch(`/api/posts?limit=${limit}`);
      if (sRes.ok) {
        const sJson = await sRes.json();
        if (Array.isArray(sJson?.posts)) return sJson.posts;
      }
    } catch {}
    return [];
  }
}

export interface QuadFeedPageResult {
  posts: PostItem[];
  nextCursor: FeedCursor | null;
  hasMore: boolean;
  usedRpc: boolean;
}

function mapCanonicalToLegacyCategory(cat?: string): string {
  switch (cat) {
    case 'Career & Jobs':
      return 'Professional Insights';
    case 'Events & Reunion':
      return 'Reunion';
    case 'Achievement':
      return 'Achievement';
    default:
      return 'General Update';
  }
}

function formatQuadRpcRow(row: any): PostItem {
  const rawComments = Array.isArray(row.comments) ? row.comments : [];
  const flatComments: PostComment[] = rawComments.map((c: any) => ({
    id: Number(c.id),
    postId: Number(c.postId || c.post_id || row.id),
    userId: Number(c.userId || c.user_id),
    parentCommentId: c.parentCommentId || c.parent_comment_id ? Number(c.parentCommentId || c.parent_comment_id) : null,
    fullName: c.fullName || c.full_name || 'SZMC Alumnus',
    avatarUrl: c.avatarUrl || c.avatar_url || '/assets/aistudio/images__1__2778177d.png',
    content: c.content || '',
    likesCount: Number(c.likesCount || c.likes_count || 0),
    likedByMe: Boolean(c.likedByMe),
    createdAt: c.createdAt || c.created_at || new Date().toISOString(),
  }));
  const formattedComments = buildCommentTree(flatComments);

  const cleanImages = Array.isArray(row.images) ? row.images : [];
  const cleanVideos = Array.isArray(row.videos) ? row.videos : [];
  const meta = typeof row.link_metadata === 'object' && row.link_metadata ? row.link_metadata : {};

  return {
    id: Number(row.id),
    userId: Number(row.user_id || row.author_id),
    fullName: row.full_name || 'SZMC Alumnus',
    avatarUrl: row.avatar_url || '/assets/aistudio/images__1__2778177d.png',
    batchYear: row.batch_year ? Number(row.batch_year) : undefined,
    verified: Boolean(row.verified),
    profession: row.profession || 'Doctor / Medical Professional',
    institution: row.institution || undefined,
    content: row.content || '',
    category: row.community_category || row.category || 'General Discussion',
    communityCategory: row.community_category || undefined,
    audience: (row.audience as PostAudience) || 'public',
    isFeatured: Boolean(row.is_featured),
    isOfficial: Boolean(row.is_official),
    priorityLevel: Number(row.priority_level || 0),
    batchLoungeYear: row.batch_lounge_year ? Number(row.batch_lounge_year) : null,
    officialPageId: row.official_page_id ? Number(row.official_page_id) : null,
    officialPageName: row.official_page_name || null,
    officialPageSlug: row.official_page_slug || null,
    repostOfId: row.repost_of_id ? Number(row.repost_of_id) : (meta.repostOfId ? Number(meta.repostOfId) : null),
    repostCount: Number(row.repost_count || 0),
    repostedPost: meta.repostedPost || null,
    mentionedUserIds: Array.isArray(row.mentioned_user_ids) ? row.mentioned_user_ids.map(Number) : [],
    priorityTier: typeof row.priority_tier === 'number' ? Number(row.priority_tier) : undefined,
    rankScore: typeof row.rank_score === 'number' ? Number(row.rank_score) : undefined,
    images: cleanImages,
    videos: cleanVideos,
    layout_template: row.layout_template || (cleanImages.length > 1 ? 'carousel' : 'grid'),
    linked_url: row.linked_url || undefined,
    link_metadata: row.link_metadata || undefined,
    likesCount: Number(row.likes_count || 0),
    commentsCount: Number(row.comments_count || 0),
    createdAt: row.created_at || new Date().toISOString(),
    likedByMe: Boolean(row.liked_by_me),
    userReaction: row.user_reaction || (row.liked_by_me ? 'like' : null),
    reactionsSummary:
      row.reactions_summary && typeof row.reactions_summary === 'object'
        ? row.reactions_summary
        : undefined,
    isSaved: Boolean(row.saved_by_me),
    pinned: Boolean(row.is_pinned),
    isEdited: Boolean(row.is_edited),
    isBatchmate: Boolean(row.is_batchmate),
    isFriend: Boolean(row.is_friend),
    isFollowing: Boolean(row.is_following),
    comments: formattedComments,
    author: row.full_name || 'SZMC Alumnus',
    authorAvatar: row.avatar_url || '/assets/aistudio/images__1__2778177d.png',
    authorBatch: row.batch_year ? Number(row.batch_year) : undefined,
    authorRole: 'Alumnus',
    timestamp: row.created_at || 'Just now',
    likes: Number(row.likes_count || 0),
    liked: Boolean(row.liked_by_me),
    commentsList: formattedComments,
    shares: Number(row.repost_count || 0),
  };
}

/**
 * Keyset cursor-paginated feed fetcher powered by public.get_quad_feed(...) RPC.
 * Falls back cleanly to fetchFeedPosts + configurable client ranking if migration 023
 * has not yet been applied in the remote Supabase database.
 */
export async function fetchQuadFeedPage(params: {
  currentUserId?: number;
  myBatchYear?: number | null;
  isStaff?: boolean;
  feedTab?: QuadFeedFilter;
  category?: QuadPostCategory;
  limit?: number;
  cursor?: FeedCursor | null;
  fallbackOffset?: number;
}): Promise<QuadFeedPageResult> {
  const limit = Math.min(Math.max(params.limit ?? 15, 5), 50);
  const feedTab = params.feedTab || 'for_you';
  const category = params.category || 'All';

  try {
    const { data, error } = await supabase.rpc('get_quad_feed', {
      p_user_id: params.currentUserId || null,
      p_feed_tab: feedTab,
      p_category: category,
      p_limit: limit + 1,
      p_cursor_priority: params.cursor ? params.cursor.priorityTier : null,
      p_cursor_score: params.cursor ? params.cursor.rankScore : null,
      p_cursor_created_at: params.cursor ? params.cursor.createdAt : null,
      p_cursor_id: params.cursor ? params.cursor.id : null,
    });

    if (!error && Array.isArray(data)) {
      const hasMore = data.length > limit;
      const slice = hasMore ? data.slice(0, limit) : data;
      const mapped = slice.map(formatQuadRpcRow);
      const quadAuthorIds = mapped.map((p) => p.userId).filter(Boolean);
      const [pollsMap, completionMap] = await Promise.all([
        fetchPostPollsMap(mapped.map((p) => p.id), params.currentUserId),
        fetchAuthorCompletionMap(quadAuthorIds),
      ]);
      const hydrated = mapped.map((p) => ({
        ...p,
        profileCompleted: completionMap.get(p.userId) ?? false,
        poll: pollsMap.get(p.id) || p.poll || null,
      }));
      const last = hydrated[hydrated.length - 1];
      return {
        posts: hydrated,
        nextCursor: last ? buildCursorFromPost(last) : null,
        hasMore,
        usedRpc: true,
      };
    }
  } catch {
    // Fall back cleanly when get_quad_feed RPC is not deployed remotely yet
  }

  const offset = params.fallbackOffset ?? 0;
  const [weights, batch] = await Promise.all([
    fetchFeedRankingWeights(),
    fetchFeedPosts(limit + 1, offset, params.currentUserId),
  ]);

  const ranked = dedupeAndRankFeedPosts(batch, {
    feedTab,
    category,
    myUserId: params.currentUserId,
    myBatchYear: params.myBatchYear,
    isStaff: params.isStaff,
    weights,
  });

  const hasMore = batch.length > limit;
  const pagePosts = hasMore ? ranked.slice(0, limit) : ranked;
  const pollsMap = await fetchPostPollsMap(pagePosts.map((p) => p.id), params.currentUserId);
  const hydrated = pagePosts.map((p) => ({
    ...p,
    comments: buildCommentTree(p.comments || []),
    poll: pollsMap.get(p.id) || p.poll || null,
  }));
  const last = hydrated[hydrated.length - 1];

  return {
    posts: hydrated,
    nextCursor: last ? buildCursorFromPost(last, weights) : null,
    hasMore,
    usedRpc: false,
  };
}

/**
 * Create a new post directly in Supabase.
 * Constraint: Do NOT send a bell notification to everyone for new posts.
 */
export async function createPost(params: {
  authorId: number;
  content: string;
  category?: string;
  communityCategory?: string;
  audience?: PostAudience;
  isFeatured?: boolean;
  isOfficial?: boolean;
  priorityLevel?: number;
  batchLoungeYear?: number | null;
  officialPageId?: number | null;
  repostOfId?: number | null;
  repostedPost?: PostItem['repostedPost'];
  mentionedUserIds?: number[];
  poll?: { question: string; options: string[] } | null;
  images?: string[];
  videos?: string[];
  layout_template?: 'carousel' | 'grid' | 'column' | 'hero';
  linked_url?: string;
  link_metadata?: LinkMetadata;
}): Promise<{ success: boolean; post?: PostItem; error?: string }> {
  try {
    const rawContent = params.content.trim();
    const fallbackText =
      params.images && params.images.length > 0
        ? params.images.length > 1
          ? `Shared ${params.images.length} photos`
          : 'Shared a photo'
        : params.linked_url
        ? 'Shared a link'
        : 'Shared an update';

    const safeContent = rawContent || fallbackText;
    const cleanImages = (params.images || []).filter(Boolean);
    const cleanVideos = (params.videos || []).filter(Boolean);

    const metadataWithLayout = {
      ...(params.link_metadata || {}),
      layout_template: params.layout_template || (cleanImages.length > 1 ? 'carousel' : 'grid'),
    };

    // 1. Resolve author profile to satisfy posts_author_id_fkey
    let realAuthorId: number | null = null;
    let authorProfile: any = null;

    // Check active auth session
    let authUser: any = null;
    try {
      const { data: authData } = await supabase.auth.getUser();
      authUser = authData?.user;
      if (!authUser) {
        const { data: sessionData } = await supabase.auth.getSession();
        authUser = sessionData?.session?.user ?? null;
      }
    } catch {}

    if (authUser?.id) {
      // 1. Resolve caller's exact profile ID via SECURITY DEFINER RPC current_profile_id()
      try {
        const { data: rpcPid } = await supabase.rpc('current_profile_id');
        if (rpcPid && Number(rpcPid) > 0) {
          realAuthorId = Number(rpcPid);
        }
      } catch {}

      const { data: profileByAuth } = await supabase
        .from('alumni_profiles')
        .select(POST_AUTHOR_PUBLIC_COLS)
        .eq('auth_user_id', authUser.id)
        .maybeSingle();

      if (profileByAuth?.id) {
        realAuthorId = Number(profileByAuth.id);
        authorProfile = profileByAuth;
      }

      // If still missing and authUser exists, insert alumni_profiles record complying with
      // GRANT INSERT and RLS policy alumni_profiles_insert_own (role='member', verification_status='unverified')
      if (!realAuthorId) {
        try {
          const { data: createdProf } = await supabase
            .from('alumni_profiles')
            .insert({
              auth_user_id: authUser.id,
              full_name:
                (authUser.user_metadata as any)?.full_name ||
                (authUser.user_metadata as any)?.name ||
                (authUser.email ? authUser.email.split('@')[0] : 'SZMC Alumnus'),
              email: authUser.email || null,
              batch_year: 25,
              academic_stream: 'Science',
              academic_group: null,
              is_public: true,
            })
            .select(POST_AUTHOR_PUBLIC_COLS)
            .maybeSingle();

          if (createdProf?.id) {
            realAuthorId = Number(createdProf.id);
            authorProfile = createdProf;
          }
        } catch {}
      }
    }

    // Resolve profile by params.authorId only if caller matches or no auth RPC matched
    if (!realAuthorId && authUser?.id && params.authorId && params.authorId > 0) {
      const { data: profileById } = await supabase
        .from('alumni_profiles')
        .select(POST_AUTHOR_PUBLIC_COLS)
        .eq('id', params.authorId)
        .eq('auth_user_id', authUser.id)
        .maybeSingle();

      if (profileById?.id) {
        realAuthorId = Number(profileById.id);
        authorProfile = profileById;
      }
    }

    if (!realAuthorId || realAuthorId <= 0) {
      return {
        success: false,
        error: 'Please sign in with an active alumni profile before publishing a post.',
      };
    }

    const canonicalCat = params.communityCategory || params.category || 'General Discussion';
    const legacyDbCategory = mapCanonicalToLegacyCategory(canonicalCat);
    const audience: PostAudience = params.audience || 'public';

    const payload: Record<string, any> = {
      author_id: realAuthorId,
      content: safeContent,
      category: legacyDbCategory,
      community_category: canonicalCat,
      audience,
      is_featured: Boolean(params.isFeatured),
      is_official: Boolean(params.isOfficial),
      priority_level:
        typeof params.priorityLevel === 'number'
          ? params.priorityLevel
          : canonicalCat === 'Blood Request'
          ? 3
          : params.isOfficial
          ? 2
          : params.isFeatured
          ? 1
          : 0,
      images: cleanImages,
      videos: cleanVideos,
      linked_url: params.linked_url || null,
      link_metadata: {
        ...metadataWithLayout,
        communityCategory: canonicalCat,
        audience,
        isFeatured: Boolean(params.isFeatured),
        isOfficial: Boolean(params.isOfficial),
        ...(params.repostOfId ? { repostOfId: params.repostOfId } : {}),
        ...(params.repostedPost ? { repostedPost: params.repostedPost } : {}),
      },
    };
    if (params.batchLoungeYear) {
      payload.batch_lounge_year = params.batchLoungeYear;
    }
    if (params.officialPageId) {
      payload.official_page_id = params.officialPageId;
    }
    if (params.repostOfId) {
      payload.repost_of_id = params.repostOfId;
    }
    if (Array.isArray(params.mentionedUserIds) && params.mentionedUserIds.length > 0) {
      payload.mentioned_user_ids = params.mentionedUserIds;
    }

    let { data: insertedRow, error: insertErr } = await supabase
      .from('posts')
      .insert(payload)
      .select()
      .single();

    if (insertErr || !insertedRow) {
      console.warn('Supabase post insert attempt 1 error:', insertErr);
      // Retry without Phase 4 extended columns if migration 023 has not been applied remotely yet
      const basicPayload = {
        author_id: realAuthorId,
        content: safeContent,
        category: legacyDbCategory,
        images: cleanImages,
        videos: cleanVideos,
      };
      const { data: retryRow, error: retryErr } = await supabase
        .from('posts')
        .insert(basicPayload)
        .select()
        .single();

      if (!retryErr && retryRow) {
        insertedRow = retryRow;
        insertErr = null;
      }
    }

    if (insertErr || !insertedRow) {
      console.warn('Direct Supabase client insert hit error, attempting /api/posts fallback:', insertErr?.message);
      let fallbackErrorMsg = insertErr?.message || 'Could not publish post to database.';
      try {
        const authHeaders = await getClientAuthHeaders();
        const apiRes = await fetch('/api/posts', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            author_id: realAuthorId,
            content: safeContent,
            category: params.category || 'General Update',
            images: cleanImages,
            videos: cleanVideos,
            linked_url: params.linked_url,
            link_metadata: metadataWithLayout,
          }),
        });
        const apiJson = await apiRes.json().catch(() => ({}));
        const returnedPost = apiJson?.post || apiJson;
        if (apiRes.ok && (returnedPost?.id || apiJson?.id)) {
          const pId = Number(returnedPost?.id || apiJson?.id);
          return {
            success: true,
            post: {
              id: pId,
              userId: Number(returnedPost?.author_id || returnedPost?.userId || realAuthorId),
              fullName: returnedPost?.fullName || authorProfile?.full_name || 'SZMC Alumnus',
              avatarUrl: returnedPost?.avatarUrl || authorProfile?.avatar_url || '/assets/aistudio/images__1__2778177d.png',
              batchYear: Number(returnedPost?.batchYear || authorProfile?.batch_year || 25),
              verified: authorProfile?.verification_status === 'verified',
              content: returnedPost?.content || safeContent,
              category: returnedPost?.category || params.category || 'General Update',
              images: returnedPost?.images || cleanImages,
              videos: returnedPost?.videos || cleanVideos,
              likesCount: 0,
              commentsCount: 0,
              createdAt: returnedPost?.created_at || 'Just now',
              likedByMe: false,
              comments: [],
              author: returnedPost?.fullName || authorProfile?.full_name || 'SZMC Alumnus',
              authorAvatar: returnedPost?.avatarUrl || authorProfile?.avatar_url || '/assets/aistudio/images__1__2778177d.png',
              authorBatch: Number(returnedPost?.batchYear || authorProfile?.batch_year || 25),
              authorRole: 'Alumnus',
              timestamp: 'Just now',
              likes: 0,
              liked: false,
              commentsList: [],
              shares: 0,
            },
          };
        }
        if (apiJson?.error) {
          fallbackErrorMsg = String(apiJson.error);
        }
      } catch (serverErr: any) {
        console.warn('Fallback /api/posts notice:', serverErr);
        if (serverErr?.message) fallbackErrorMsg = String(serverErr.message);
      }

      return {
        success: false,
        error: fallbackErrorMsg,
      };
    }

    const createdPostId = Number(insertedRow.id);
    let attachedPoll = null;
    if (params.poll && params.poll.question.trim() && params.poll.options.length >= 2) {
      attachedPoll = await createPostPoll({
        postId: createdPostId,
        authorId: realAuthorId,
        question: params.poll.question,
        options: params.poll.options,
      });
    }

    if (Array.isArray(params.mentionedUserIds) && params.mentionedUserIds.length > 0) {
      void notifyMentionedUsers({
        mentionedUserIds: params.mentionedUserIds,
        actorId: realAuthorId,
        actorName: authorProfile?.full_name || 'An SZMC alumnus',
        postId: createdPostId,
        context: 'post',
      });
    }

    return {
      success: true,
      post: {
        id: createdPostId,
        userId: Number(insertedRow.author_id),
        fullName: authorProfile?.full_name || 'You',
        avatarUrl: authorProfile?.avatar_url || '/assets/aistudio/images__1__2778177d.png',
        batchYear: authorProfile?.batch_year ? Number(authorProfile.batch_year) : undefined,
        verified: authorProfile?.verification_status === 'verified',
        profileCompleted: isPublicRowProfileCompleted(authorProfile),
        content: insertedRow.content,
        category: insertedRow.community_category || canonicalCat,
        communityCategory: insertedRow.community_category || canonicalCat,
        audience: (insertedRow.audience as PostAudience) || audience,
        isFeatured: Boolean(insertedRow.is_featured ?? params.isFeatured),
        isOfficial: Boolean(insertedRow.is_official ?? params.isOfficial),
        priorityLevel: Number(insertedRow.priority_level ?? payload.priority_level ?? 0),
        batchLoungeYear: insertedRow.batch_lounge_year ?? params.batchLoungeYear ?? null,
        officialPageId: insertedRow.official_page_id ?? params.officialPageId ?? null,
        repostOfId: insertedRow.repost_of_id ?? params.repostOfId ?? null,
        repostCount: 0,
        repostedPost: params.repostedPost || null,
        mentionedUserIds: params.mentionedUserIds || [],
        poll: attachedPoll,
        images: insertedRow.images || [],
        videos: insertedRow.videos || [],
        layout_template: params.layout_template || (cleanImages.length > 1 ? 'carousel' : 'grid'),
        linked_url: insertedRow.linked_url,
        link_metadata: insertedRow.link_metadata,
        likesCount: 0,
        commentsCount: 0,
        createdAt: insertedRow.created_at || new Date().toISOString(),
        likedByMe: false,
        comments: [],
        author: authorProfile?.full_name || 'You',
        authorAvatar: authorProfile?.avatar_url || '/assets/aistudio/images__1__2778177d.png',
        authorBatch: authorProfile?.batch_year ? Number(authorProfile.batch_year) : 20,
        authorRole: 'Alumnus',
        timestamp: 'Just now',
        likes: 0,
        liked: false,
        commentsList: [],
        shares: 0,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to create post' };
  }
}

/**
 * Toggle post like directly in Supabase.
 * Sends a notification of type `post_like` to the post author when liked.
 */
export async function togglePostLike(postId: number, userId: number): Promise<boolean> {
  try {
    const { data: existing } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      const { error: delErr } = await supabase.from('post_likes').delete().eq('id', existing.id);
      if (!delErr) {
        void (async () => {
          const authHeaders = await getClientAuthHeaders();
          fetch('/api/feed/broadcast', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ type: 'POST_LIKED', postId, userId, liked: false }),
          }).catch(() => {});
        })();
        return false;
      }
    } else {
      const { error: insErr } = await supabase
        .from('post_likes')
        .insert({ post_id: postId, user_id: userId, reaction: 'like' });
      if (!insErr) {
        void (async () => {
          const authHeaders = await getClientAuthHeaders();
          fetch('/api/feed/broadcast', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ type: 'POST_LIKED', postId, userId, liked: true }),
          }).catch(() => {});
        })();

        const { data: postData } = await supabase
          .from('posts')
          .select('author_id')
          .eq('id', postId)
          .maybeSingle();

        if (postData && postData.author_id && Number(postData.author_id) !== userId) {
          const { data: likerData } = await supabase
            .from('alumni_profiles')
            .select('full_name')
            .eq('id', userId)
            .maybeSingle();

          const likerName = likerData?.full_name || 'An alumnus';
          await supabase.from('notifications').insert({
            recipient_id: postData.author_id,
            actor_id: userId,
            type: 'post_like',
            title: 'Liked your post',
            message: `${likerName} liked your post.`,
            post_id: postId,
            target_route: 'feed',
            unread: true,
          });
        }
        return true;
      }
    }

    // Fallback to server endpoint only if direct Supabase RLS rejected the operation
    const authHeaders = await getClientAuthHeaders();
    const apiRes = await fetch(`/api/posts/${postId}/like`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ userId }),
    });
    if (apiRes.ok) {
      const json = await apiRes.json().catch(() => ({}));
      return Boolean(json?.liked);
    }
  } catch (err) {
    console.warn('togglePostLike notice:', err);
  }
  return false;
}

/**
 * Add post comment directly in Supabase with realtime broadcast.
 * Sends a notification of type `post_comment` to the post author.
 */
export async function addComment(
  postId: number,
  userId: number,
  content: string,
  fullName?: string,
  avatarUrl?: string,
  parentCommentId?: number | null
): Promise<boolean> {
  const cleanContent = content.trim();
  if (!cleanContent) return false;

  try {
    let insertedId: number | undefined;
    let insertedCreatedAt: string | undefined;

    const basePayload: Record<string, any> = {
      post_id: postId,
      user_id: userId,
      content: cleanContent,
    };
    if (parentCommentId) {
      basePayload.parent_comment_id = parentCommentId;
    }

    let { data: commentData, error: insErr } = await supabase
      .from('post_comments')
      .insert(basePayload)
      .select('id, created_at')
      .single();

    // Retry without parent_comment_id if migration 024 isn't applied yet
    if (insErr && parentCommentId && String(insErr.message || '').includes('parent_comment_id')) {
      const retryNoParent = await supabase
        .from('post_comments')
        .insert({ post_id: postId, user_id: userId, content: cleanContent })
        .select('id, created_at')
        .single();
      if (!retryNoParent.error && retryNoParent.data) {
        commentData = retryNoParent.data;
        insErr = null;
      }
    }

    if (insErr && !commentData?.id) {
      const authHeaders = await getClientAuthHeaders();
      const endpoint = parentCommentId ? `/api/posts/${postId}/reply` : `/api/posts/${postId}/comment`;
      const apiRes = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          userId,
          content: cleanContent,
          fullName,
          avatarUrl,
          parentCommentId: parentCommentId || undefined,
          skipDbInsert: false,
        }),
      });
      if (!apiRes.ok) {
        return false;
      }
      const apiJson = await apiRes.json().catch(() => ({}));
      const serverRow = apiJson?.comment || apiJson?.reply;
      if (serverRow?.id) {
        insertedId = Number(serverRow.id);
        insertedCreatedAt = serverRow.created_at || serverRow.createdAt;
      }
    } else if (commentData?.id) {
      insertedId = Number(commentData.id);
      insertedCreatedAt = commentData.created_at;

      // Broadcast comment instantly to all online alumni (skip duplicate DB insert since already persisted)
      void (async () => {
        const authHeaders = await getClientAuthHeaders();
        const endpoint = parentCommentId ? `/api/posts/${postId}/reply` : `/api/posts/${postId}/comment`;
        fetch(endpoint, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            userId,
            content: cleanContent,
            fullName,
            avatarUrl,
            parentCommentId: parentCommentId || undefined,
            skipDbInsert: true,
            commentId: insertedId,
            createdAt: insertedCreatedAt,
          }),
        }).catch(() => {});
      })();
    }

    // Notify post author
    const { data: postData } = await supabase
      .from('posts')
      .select('author_id')
      .eq('id', postId)
      .maybeSingle();

    if (postData && postData.author_id && Number(postData.author_id) !== userId) {
      const commenterName = fullName || 'An alumnus';
      await supabase.from('notifications').insert({
        recipient_id: postData.author_id,
        actor_id: userId,
        type: 'post_comment',
        title: 'New Comment',
        message: `${commenterName} commented: "${cleanContent.slice(0, 80)}${cleanContent.length > 80 ? '...' : ''}"`,
        post_id: postId,
        target_route: 'feed',
        unread: true,
      });
    }

    return true;
  } catch (err) {
    console.warn('addComment notice:', err);
    return false;
  }
}

/**
 * Toggle post saved bookmark directly in Supabase.
 */
export async function toggleSavePost(postId: number, userId: number): Promise<boolean> {
  try {
    const { data: existing } = await supabase
      .from('saved_posts')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      await supabase.from('saved_posts').delete().eq('id', existing.id);
      return false;
    } else {
      await supabase.from('saved_posts').insert({ post_id: postId, user_id: userId });
      return true;
    }
  } catch (err) {
    console.warn('toggleSavePost notice:', err);
    return true;
  }
}
