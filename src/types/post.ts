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
  fullName: string;
  avatarUrl: string;
  content: string;
  likesCount: number;
  likedByMe: boolean;
  createdAt: string;
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
  category: string;
  images: string[];
  videos?: string[];
  linked_url?: string;
  link_metadata?: LinkMetadata;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  likedByMe?: boolean;
  isSaved?: boolean;
  pinned?: boolean;
  isEdited?: boolean;
  comments?: PostComment[];
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
