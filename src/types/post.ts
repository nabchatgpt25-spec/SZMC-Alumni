export interface PostAuthor {
  id: number;
  fullName: string;
  avatarUrl: string;
  batchYear?: number;
  verified?: boolean;
  profession?: string;
  institution?: string;
}

export interface PostComment {
  id: number;
  postId: number;
  userId: number;
  parentCommentId?: number | null;
  fullName: string;
  avatarUrl: string;
  content: string;
  likesCount: number;
  likedByMe: boolean;
  createdAt: string;
  mentionedUserIds?: number[];
  replies?: PostComment[];
}

export interface LinkMetadata {
  ok: boolean;
  type:
    | 'youtube'
    | 'facebook_video'
    | 'facebook_post'
    | 'instagram'
    | 'direct_video'
    | 'generic';
  canonical_url: string;
  title: string;
  description: string;
  image?: string;
  video_url?: string;
  site_name?: string;
  video_id?: string;
  is_reel?: boolean;
}

export type ReactionType = 'like' | 'love' | 'care' | 'haha' | 'wow' | 'sad' | 'angry';

export type PostAudience = 'public' | 'alumni_only' | 'my_batch' | 'connections';

export interface PostPollOption {
  id: number;
  label: string;
}

export interface PostPoll {
  id: number;
  postId?: number | null;
  question: string;
  options: PostPollOption[];
  voteCounts: Record<number, number>;
  totalVotes: number;
  myVoteOptionIndex: number | null;
  isClosed: boolean;
  closesAt?: string | null;
}

export interface PostItem {
  id: number;
  userId: number;
  fullName: string;
  avatarUrl: string;
  batchYear?: number;
  verified?: boolean;
  profession?: string;
  institution?: string;
  content: string;
  category?: string;
  communityCategory?: string;
  audience?: PostAudience;
  isFeatured?: boolean;
  isOfficial?: boolean;
  priorityLevel?: number;
  batchLoungeYear?: number | null;
  officialPageId?: number | null;
  officialPageName?: string | null;
  officialPageSlug?: string | null;
  repostOfId?: number | null;
  repostCount?: number;
  repostedPost?: {
    id: number;
    userId: number;
    fullName: string;
    avatarUrl: string;
    batchYear?: number;
    content: string;
    createdAt: string;
    images?: string[];
    category?: string;
  } | null;
  mentionedUserIds?: number[];
  poll?: PostPoll | null;
  priorityTier?: number;
  rankScore?: number;
  images: string[];
  videos?: string[];
  layout_template?: 'carousel' | 'grid' | 'column' | 'hero';
  linked_url?: string;
  link_metadata?: LinkMetadata;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  likedByMe?: boolean;
  userReaction?: ReactionType | null;
  reactionsSummary?: Partial<Record<ReactionType, number>>;
  isSaved?: boolean;
  pinned?: boolean;
  isEdited?: boolean;
  comments?: PostComment[];
  isBatchmate?: boolean;
  isFriend?: boolean;
  isFollowing?: boolean;
  albumId?: number | string;
  albumTitle?: string;
  albumCoverUrl?: string;
  albumCategory?: string;
  albumPhotosCount?: number;
  // Legacy compatibility fields
  author?: string;
  authorAvatar?: string;
  authorBatch?: number;
  authorRole?: string;
  timestamp?: string;
  likes?: number;
  liked?: boolean;
  commentsList?: any[];
  shares?: number;
}
