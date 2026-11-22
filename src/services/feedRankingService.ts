import type { PostItem, PostAudience } from '../types/post';
import {
  matchesQuadCategory,
  type QuadFeedFilter,
  type QuadPostCategory,
} from '../components/community/quadConstants';

export interface FeedRankingWeights {
  batchRelevanceWeight: number;
  followedAlumniWeight: number;
  followedPageWeight: number;
  engagementLikeWeight: number;
  engagementCommentWeight: number;
  engagementCap: number;
  recencyMaxBoost: number;
  recencyDecayPerHour: number;
  featuredBoost: number;
  updatedAt?: string;
}

export const DEFAULT_FEED_RANKING_WEIGHTS: FeedRankingWeights = {
  batchRelevanceWeight: 28,
  followedAlumniWeight: 20,
  followedPageWeight: 22,
  engagementLikeWeight: 1.5,
  engagementCommentWeight: 3.0,
  engagementCap: 42,
  recencyMaxBoost: 48,
  recencyDecayPerHour: 0.5,
  featuredBoost: 18,
};

export interface FeedCursor {
  priorityTier: number;
  rankScore: number;
  createdAt: string;
  id: number;
}

export const POST_AUDIENCE_OPTIONS: {
  id: PostAudience;
  label: string;
  description: string;
}[] = [
  {
    id: 'public',
    label: 'Public (The Quad)',
    description: 'Visible across the SZMC Alumni community',
  },
  {
    id: 'alumni_only',
    label: 'Verified Alumni',
    description: 'Visible to signed-in SZMC Alumni portal members',
  },
  {
    id: 'my_batch',
    label: 'My Batch Only',
    description: 'Visible only to classmates in your MBBS batch',
  },
  {
    id: 'connections',
    label: 'Connections Only',
    description: 'Visible only to your accepted alumni connections',
  },
];

let cachedWeights: FeedRankingWeights | null = null;
let cachedWeightsAt = 0;
const CACHE_TTL_MS = 60_000;

export async function fetchFeedRankingWeights(forceRefresh = false): Promise<FeedRankingWeights> {
  if (!forceRefresh && cachedWeights && Date.now() - cachedWeightsAt < CACHE_TTL_MS) {
    return cachedWeights;
  }

  try {
    const res = await fetch('/api/feed/ranking-weights');
    if (res.ok) {
      const json = await res.json();
      if (json?.weights) {
        cachedWeights = {
          ...DEFAULT_FEED_RANKING_WEIGHTS,
          ...json.weights,
        };
        cachedWeightsAt = Date.now();
        return cachedWeights!;
      }
    }
  } catch {
    // Use canonical defaults when server route is unreachable
  }
  return DEFAULT_FEED_RANKING_WEIGHTS;
}

export function getPostPriorityTier(post: PostItem, nowMs = Date.now()): number {
  const createdMs = new Date(post.createdAt || 0).getTime() || 0;
  const ageHours = createdMs > 0 ? Math.max(0, (nowMs - createdMs) / 3_600_000) : 999;

  const isBlood =
    post.communityCategory === 'Blood Request' ||
    matchesQuadCategory(post.category, 'Blood Request') ||
    post.priorityLevel === 3;

  if (isBlood && ageHours <= 72) return 3;
  if (post.pinned || post.isOfficial || post.priorityLevel === 2) return 2;
  if (post.isFeatured || post.priorityLevel === 1) return 1;
  return 0;
}

export function computeForYouScore(
  post: PostItem,
  context: {
    myBatchYear?: number | null;
    followedUserIds?: Set<number>;
    followedPageIds?: Set<number>;
    weights?: FeedRankingWeights;
    nowMs?: number;
  }
): number {
  const w = context.weights || DEFAULT_FEED_RANKING_WEIGHTS;
  const nowMs = context.nowMs ?? Date.now();
  const postBatch = Number(post.batchLoungeYear ?? post.batchYear ?? post.authorBatch ?? 0) || null;

  const batchBoost =
    post.isBatchmate || (context.myBatchYear && postBatch === context.myBatchYear)
      ? w.batchRelevanceWeight
      : 0;
  const isFollowedAuthor =
    Boolean(post.isFriend) ||
    Boolean(post.isFollowing) ||
    Boolean(context.followedUserIds?.has(post.userId));
  const friendBoost = isFollowedAuthor ? w.followedAlumniWeight : 0;
  const pageBoost =
    post.officialPageId && context.followedPageIds?.has(post.officialPageId)
      ? w.followedPageWeight
      : 0;
  const featuredBoost = post.isFeatured ? w.featuredBoost : 0;
  const engagement = Math.min(
    w.engagementCap,
    (Number(post.likesCount) || 0) * w.engagementLikeWeight +
      (Number(post.commentsCount) || 0) * w.engagementCommentWeight
  );

  const createdMs = new Date(post.createdAt || 0).getTime() || nowMs;
  const ageHours = Math.max(0, (nowMs - createdMs) / 3_600_000);
  const recency = Math.max(0, w.recencyMaxBoost - ageHours * w.recencyDecayPerHour);

  return Math.round((batchBoost + friendBoost + pageBoost + featuredBoost + engagement + recency) * 10000) / 10000;
}

export function dedupeAndRankFeedPosts(
  rawPosts: PostItem[],
  options: {
    feedTab: QuadFeedFilter;
    category: QuadPostCategory;
    myUserId?: number;
    myBatchYear?: number | null;
    isStaff?: boolean;
    followedUserIds?: Set<number>;
    followedPageIds?: Set<number>;
    weights?: FeedRankingWeights;
  }
): PostItem[] {
  // 1. Strict deduplication by post ID
  const uniqueMap = new Map<number, PostItem>();
  for (const p of rawPosts) {
    if (!p || !p.id) continue;
    if (!uniqueMap.has(p.id)) {
      uniqueMap.set(p.id, p);
    }
  }

  let list = Array.from(uniqueMap.values());

  // 2. Client-side audience enforcement mirror (DB RPC enforces authoritatively)
  list = list.filter((p) => {
    if (options.isStaff || (options.myUserId && (p.userId === options.myUserId || (p as any).authorId === options.myUserId))) {
      return true;
    }
    const aud = p.audience || 'public';
    if (aud === 'public' || aud === 'alumni_only') return true;
    if (aud === 'my_batch') {
      const pBatch = Number(p.batchLoungeYear ?? p.batchYear ?? p.authorBatch ?? 0) || null;
      return Boolean(p.isBatchmate) || (Boolean(options.myBatchYear) && pBatch === options.myBatchYear);
    }
    if (aud === 'connections') {
      return Boolean(p.isFriend);
    }
    return true;
  });

  // 3. Category filter (canonical + legacy compatible)
  if (options.category !== 'All') {
    list = list.filter(
      (p) =>
        p.communityCategory === options.category ||
        matchesQuadCategory(p.category, options.category)
    );
  }

  // 4. Feed filter
  if (options.feedTab === 'my_batch') {
    list = list.filter((p) => {
      const pBatch = Number(p.batchLoungeYear ?? p.batchYear ?? p.authorBatch ?? 0) || null;
      return Boolean(p.isBatchmate) || (Boolean(options.myBatchYear) && pBatch === options.myBatchYear);
    });
  } else if (options.feedTab === 'following') {
    list = list.filter(
      (p) =>
        Boolean(p.isFriend) ||
        Boolean(p.isFollowing) ||
        Boolean(options.followedUserIds?.has(p.userId)) ||
        (options.myUserId && (p.userId === options.myUserId || (p as any).authorId === options.myUserId)) ||
        Boolean(p.officialPageId && options.followedPageIds?.has(p.officialPageId))
    );
  }

  // 5. Ranking & dedicated priority placement
  const nowMs = Date.now();
  if (options.feedTab === 'latest') {
    list.sort((a, b) => {
      const tDiff = (new Date(b.createdAt || 0).getTime() || 0) - (new Date(a.createdAt || 0).getTime() || 0);
      if (tDiff !== 0) return tDiff;
      return b.id - a.id;
    });
  } else {
    list.sort((a, b) => {
      const tierA = typeof a.priorityTier === 'number' ? a.priorityTier : getPostPriorityTier(a, nowMs);
      const tierB = typeof b.priorityTier === 'number' ? b.priorityTier : getPostPriorityTier(b, nowMs);
      if (tierA !== tierB) return tierB - tierA;

      const scoreA =
        typeof a.rankScore === 'number'
          ? a.rankScore
          : computeForYouScore(a, {
              myBatchYear: options.myBatchYear,
              followedUserIds: options.followedUserIds,
              followedPageIds: options.followedPageIds,
              weights: options.weights,
              nowMs,
            });
      const scoreB =
        typeof b.rankScore === 'number'
          ? b.rankScore
          : computeForYouScore(b, {
              myBatchYear: options.myBatchYear,
              followedUserIds: options.followedUserIds,
              followedPageIds: options.followedPageIds,
              weights: options.weights,
              nowMs,
            });
      if (scoreA !== scoreB) return scoreB - scoreA;

      const tDiff = (new Date(b.createdAt || 0).getTime() || 0) - (new Date(a.createdAt || 0).getTime() || 0);
      if (tDiff !== 0) return tDiff;
      return b.id - a.id;
    });
  }

  return list;
}

export function buildCursorFromPost(post: PostItem, weights?: FeedRankingWeights): FeedCursor {
  return {
    priorityTier: typeof post.priorityTier === 'number' ? post.priorityTier : getPostPriorityTier(post),
    rankScore:
      typeof post.rankScore === 'number'
        ? post.rankScore
        : computeForYouScore(post, { weights }),
    createdAt: post.createdAt || new Date().toISOString(),
    id: post.id,
  };
}
