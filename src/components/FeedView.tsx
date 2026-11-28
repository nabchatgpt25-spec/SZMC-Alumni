import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Heart,
  MessageCircle,
  Share2,
  Image as ImageIcon,
  Send,
  ShieldCheck,
  MoreHorizontal,
  Sparkles,
  Edit3,
  Trash2,
  Flag,
  X,
  Plus,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Briefcase,
  Award,
  Users,
  MessageSquare,
  ZoomIn,
  Bookmark,
  BookmarkCheck,
  WifiOff,
  Globe,
  Camera,
  Smile,
  MapPin,
  Settings,
  ChevronDown,
  Lock,
  UploadCloud,
  ArrowUpLeft,
  Video,
  Link2,
  Filter,
  Check,
  GraduationCap,
  UserCheck,
  Calendar,
  ChevronRight,
  Eye,
  ArrowRight,
  Repeat2,
  ShieldBan,
} from 'lucide-react';
import { PostItem, PostComment, ReactionType } from '../types';
import { CreatePostModal } from './CreatePostModal';
import { LinkPreview } from './LinkPreview';
import { PostMediaCarousel } from './PostMediaCarousel';
import { useAuth } from '../context/AuthContext';
import { playSound } from '../utils/audio';
import { PostLightboxModal } from './PostLightboxModal';
import { VerifiedAvatar } from './verification/VerifiedAvatar';
import { isProfileFullyCompleted } from '../utils/profileCompletion';
import { compressImageFileToDataUrl } from '../utils/mediaStorage';
import { uploadVideoToStorage, validateVideoFile } from '../services/videoUploadService';
import {
  extractUrlsFromText,
  renderTextWithClickableLinks,
  SharedEmbedCard
} from './SmartPostMediaAndEmbeds';
import {
  isPostSaved,
  toggleSavePost
} from '../utils/offlineStorage';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { VerificationStatusBadge } from './verification/VerificationStatusBadge';
import {
  loadVouchRequests,
  normalizeToBatchNumber
} from '../utils/verificationService';
import { BloodNeededNowSection } from './landing/BloodNeededNowSection';
import {
  fetchFeedPostsFromDb,
  addPostCommentInDb,
  toggleSavePostInDb,
  editFeedPostInDb,
  deleteFeedPostInDb,
} from '../services/supabaseService';
import { supabase } from '../lib/supabase';
import { realtimeManager } from '../services/supabaseRealtimeService';
import { usePostCommentsChannel } from '../hooks/useChannel';
import { notifyPostLike, notifyPostComment } from '../utils/notificationService';
import { fetchQuadFeedPage } from '../services/postService';
import {
  DEFAULT_FEED_RANKING_WEIGHTS,
  dedupeAndRankFeedPosts,
  fetchFeedRankingWeights,
  getPostPriorityTier,
  type FeedCursor,
  type FeedRankingWeights,
} from '../services/feedRankingService';
import {
  QUAD_POST_CATEGORIES,
  matchesQuadCategory,
  type QuadFeedFilter,
  type QuadPostCategory,
  type QuadPostsSummary,
} from './community/quadConstants';
import { fetchFollowedUserIds, subscribeSocialGraphChanges } from '../services/socialGraphService';
import { upsertPostReaction } from '../services/richInteractionsService';
import { buildCommentTree } from '../services/richInteractionsUtils';
import { ReactionPickerButton } from './community/ReactionPickerButton';
import { RichTextWithMentions } from './community/RichTextWithMentions';
import { InlinePostPollCard } from './community/InlinePostPollCard';
import { ReportContentModal } from './community/SafetyActionModal';
import { blockUser, fetchBlockedUserIds } from '../services/communitySafetyService';
import { filterBlockedPosts } from '../services/communitySafetyUtils';
import { formatFacebookTime as formatFacebookRelativeTime } from '../utils/facebookTime';

interface FeedViewProps {
  onViewProfile?: (userId: number) => void;
  onOpenVerificationCenter?: (initialTab?: 'status' | 'vouch_others') => void;
  onNavigate?: (route: string) => void;
  embeddedInQuad?: boolean;
  quadFeedTab?: QuadFeedFilter;
  quadCategoryFilter?: QuadPostCategory;
  onClearQuadFilters?: () => void;
  onPostsSummaryChange?: (summary: QuadPostsSummary) => void;
}

type PostCategory = 'General Update' | 'Tech & Innovation' | 'Professional Insights' | 'Reunion' | 'Achievement';

const FEED_SESSION_CACHE_KEY = 'szmc_quad_feed_cache_v1';
let memoryFeedCache: PostItem[] | null = null;

function readCachedFeedPosts(): PostItem[] {
  if (memoryFeedCache && memoryFeedCache.length > 0) return memoryFeedCache;
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(FEED_SESSION_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      memoryFeedCache = parsed;
      return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

function writeCachedFeedPosts(items: PostItem[]): void {
  const snapshot = items.slice(0, 20);
  memoryFeedCache = snapshot;
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(FEED_SESSION_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore quota errors
  }
}

const CATEGORIES: { label: PostCategory; icon: typeof MessageSquare; color: string; bg: string }[] = [
  { label: 'General Update', icon: MessageSquare, color: 'text-slate-600 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800' },
  { label: 'Tech & Innovation', icon: Sparkles, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40' },
  { label: 'Professional Insights', icon: Briefcase, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
  { label: 'Reunion', icon: Users, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/40' },
  { label: 'Achievement', icon: Award, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40' },
];

export const FeedView: React.FC<FeedViewProps> = ({
  onViewProfile,
  onOpenVerificationCenter,
  onNavigate,
  embeddedInQuad = false,
  quadFeedTab = 'for_you',
  quadCategoryFilter = 'All',
  onClearQuadFilters,
  onPostsSummaryChange,
}) => {
  const isOnline = useOnlineStatus();
  const { currentUser, isLoggedIn, updateProfile, isAdminUser } = useAuth();
  const [pendingVouchesCount, setPendingVouchesCount] = useState<number>(() => {
    try {
      return loadVouchRequests().filter((r) => r.status === 'pending').length;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    const syncVouches = () => {
      try {
        setPendingVouchesCount(loadVouchRequests().filter((r) => r.status === 'pending').length);
      } catch {
        // ignore
      }
    };
    window.addEventListener('storage', syncVouches);
    return () => window.removeEventListener('storage', syncVouches);
  }, [currentUser]);

  const [posts, setPosts] = useState<PostItem[]>(() => readCachedFeedPosts());
  const [isLoadingPosts, setIsLoadingPosts] = useState<boolean>(() => readCachedFeedPosts().length === 0);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [hasMorePosts, setHasMorePosts] = useState<boolean>(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const [feedCursor, setFeedCursor] = useState<FeedCursor | null>(null);
  const [fallbackOffset, setFallbackOffset] = useState<number>(0);
  const [rankingWeights, setRankingWeights] = useState<FeedRankingWeights>(
    DEFAULT_FEED_RANKING_WEIGHTS
  );
  const [followedPageIds, setFollowedPageIds] = useState<Set<number>>(new Set());
  const [followedUserIds, setFollowedUserIds] = useState<Set<number>>(new Set());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<number>>(new Set());
  const [userToBlock, setUserToBlock] = useState<{
    id: number;
    fullName: string;
    avatarUrl?: string;
    batchYear?: number;
    profession?: string;
  } | null>(null);

  // Load configurable For You ranking weights, followed Official Pages, followed alumni & blocked accounts
  useEffect(() => {
    let mounted = true;
    void fetchFeedRankingWeights().then((w) => {
      if (mounted) setRankingWeights(w);
    });
    const loadBlocks = () => {
      if (!currentUser.id) return;
      void fetchBlockedUserIds(currentUser.id).then((ids) => {
        if (mounted) setBlockedUserIds(new Set(ids));
      });
    };
    const loadFollows = () => {
      if (!currentUser.id) return;
      void fetchFollowedUserIds(currentUser.id).then((ids) => {
        if (mounted) setFollowedUserIds(new Set(ids));
      });
    };
    if (currentUser.id) {
      loadBlocks();
      loadFollows();
      supabase
        .from('official_page_followers')
        .select('page_id')
        .eq('profile_id', currentUser.id)
        .then(({ data, error }) => {
          if (mounted && !error && Array.isArray(data)) {
            setFollowedPageIds(new Set(data.map((r: any) => Number(r.page_id))));
          }
        });
    }
    window.addEventListener('szmc_blocks_updated', loadBlocks);
    const unsubscribeSocialGraph = subscribeSocialGraphChanges((detail) => {
      if (detail.type === 'follow' && detail.actorUserId === currentUser.id) {
        loadFollows();
      }
    });
    return () => {
      mounted = false;
      window.removeEventListener('szmc_blocks_updated', loadBlocks);
      unsubscribeSocialGraph();
    };
  }, [currentUser.id]);

  // Report live post counts to QuadCommunityShell (real DB posts only)
  useEffect(() => {
    if (!onPostsSummaryChange) return;
    const myBatchNum = normalizeToBatchNumber(currentUser.batchYear);
    let myBatchCount = 0;
    let followingCount = 0;
    const categoryCounts: Record<string, number> = { All: posts.length };

    for (const cat of QUAD_POST_CATEGORIES) {
      if (cat !== 'All') categoryCounts[cat] = 0;
    }

    for (const p of posts) {
      const pBatch = normalizeToBatchNumber((p as any).batchLoungeYear ?? (p as any).authorBatch ?? p.batchYear);
      const isBatchmate = Boolean((p as any).isBatchmate) || (myBatchNum !== null && pBatch === myBatchNum);
      const isFriend =
        Boolean((p as any).isFriend) ||
        Boolean(p.isFollowing) ||
        followedUserIds.has(p.userId) ||
        (p as any).authorId === currentUser.id ||
        p.userId === currentUser.userId ||
        Boolean(p.officialPageId && followedPageIds.has(p.officialPageId));
      if (isBatchmate) myBatchCount += 1;
      if (isFriend) followingCount += 1;
      for (const cat of QUAD_POST_CATEGORIES) {
        if (
          cat !== 'All' &&
          (p.communityCategory === cat || matchesQuadCategory(p.category, cat))
        ) {
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        }
      }
    }

    onPostsSummaryChange({
      total: posts.length,
      myBatchCount,
      followingCount,
      categoryCounts,
    });
  }, [posts, currentUser.batchYear, currentUser.id, currentUser.userId, followedPageIds, followedUserIds, onPostsSummaryChange]);

  const PAGE_SIZE = 20;

  const handleLoadMorePosts = async () => {
    if (isLoadingMore || !hasMorePosts) return;
    setIsLoadingMore(true);
    try {
      const myBatchNum = normalizeToBatchNumber(currentUser.batchYear);
      const isStaff = Boolean(
        isAdminUser ||
          currentUser.role === 'admin' ||
          currentUser.role === 'moderator' ||
          (currentUser as any).role === 'super_admin'
      );
      const page = await fetchQuadFeedPage({
        currentUserId: currentUser.id,
        myBatchYear: myBatchNum,
        isStaff,
        feedTab: embeddedInQuad ? quadFeedTab : 'for_you',
        category: embeddedInQuad ? quadCategoryFilter : 'All',
        limit: PAGE_SIZE,
        cursor: feedCursor,
        fallbackOffset,
      });

      setPosts((prev) => {
        const map = new Map<number, PostItem>();
        prev.forEach((p) => map.set(p.id, p));
        page.posts.forEach((p) => {
          if (!map.has(p.id)) map.set(p.id, p);
        });
        return Array.from(map.values());
      });
      setFeedCursor(page.nextCursor);
      setHasMorePosts(page.hasMore);
      setFallbackOffset((prev) => prev + PAGE_SIZE);
    } catch (err) {
      console.warn('FeedView load more notice:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleLoadMoreRef = useRef(handleLoadMorePosts);
  handleLoadMoreRef.current = handleLoadMorePosts;

  // Facebook-style automatic infinite scroll: pre-load next page 600px before reaching bottom
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !hasMorePosts || isLoadingPosts || isLoadingMore) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void handleLoadMoreRef.current();
        }
      },
      { rootMargin: '600px 0px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMorePosts, isLoadingPosts, isLoadingMore]);

  // Stale-While-Revalidate: show cached posts on frame 1 (0ms) and refresh live from Supabase
  useEffect(() => {
    let isMounted = true;
    if (readCachedFeedPosts().length === 0) {
      setIsLoadingPosts(true);
    }
    const myBatchNum = normalizeToBatchNumber(currentUser.batchYear);
    const isStaff = Boolean(
      isAdminUser ||
        currentUser.role === 'admin' ||
        currentUser.role === 'moderator' ||
        (currentUser as any).role === 'super_admin'
    );

    fetchQuadFeedPage({
      currentUserId: currentUser.id,
      myBatchYear: myBatchNum,
      isStaff,
      feedTab: 'for_you',
      category: 'All',
      limit: PAGE_SIZE,
      cursor: null,
      fallbackOffset: 0,
    })
      .then((page) => {
        if (isMounted) {
          const nextPosts = page.posts || [];
          setPosts(nextPosts);
          if (nextPosts.length > 0) writeCachedFeedPosts(nextPosts);
          setFeedCursor(page.nextCursor);
          setHasMorePosts(page.hasMore);
          setFallbackOffset(PAGE_SIZE);
          setIsLoadingPosts(false);
        }
      })
      .catch((err) => {
        console.warn('FeedView: failed to fetch Supabase posts, rendering current feed:', err?.message || err);
        if (isMounted) {
          setIsLoadingPosts(false);
        }
      });

    // Live Supabase Realtime channel subscription
    const unsubscribeFeed = realtimeManager.subscribeToFeed((event) => {
      if (!isMounted) return;

      if (event.table === 'posts') {
        if (event.eventType === 'INSERT') {
          const newPostRow = event.newRecord;
          if (newPostRow && Number(newPostRow.author_id) !== currentUser.id) {
            // Buffer remote post notifications instead of wiping scroll/pagination with a background re-fetch
            setPendingNewPostsCount((prev) => prev + 1);
            setHasNewPosts(true);
          }
        } else if (event.eventType === 'DELETE') {
          const deletedId = Number(event.oldRecord?.id);
          if (deletedId) {
            setPosts((prev) => prev.filter((p) => p.id !== deletedId));
          }
        } else if (event.eventType === 'UPDATE') {
          const updatedRow = event.newRecord;
          if (updatedRow) {
            const uId = Number(updatedRow.id);
            setPosts((prev) =>
              prev.map((p) =>
                p.id === uId
                  ? {
                      ...p,
                      content: updatedRow.content ?? p.content,
                      isEdited: Boolean(updatedRow.is_edited),
                      pinned: Boolean(updatedRow.is_pinned),
                      likesCount: updatedRow.likes_count ?? p.likesCount,
                      commentsCount: updatedRow.comments_count ?? p.commentsCount,
                    }
                  : p
              )
            );
          }
        }
      } else if (event.table === 'post_likes') {
        const pId = Number(event.newRecord?.post_id || event.newRecord?.postId || event.oldRecord?.post_id);
        const lUserId = Number(event.newRecord?.user_id || event.newRecord?.userId || event.oldRecord?.user_id);
        if (pId && lUserId !== currentUser.id) {
          const explicitCount = event.newRecord?.likesCount ?? event.newRecord?.likes_count;
          const delta = event.eventType === 'INSERT' ? 1 : -1;
          setPosts((prev) =>
            prev.map((p) =>
              p.id === pId
                ? {
                    ...p,
                    likesCount:
                      typeof explicitCount === 'number'
                        ? explicitCount
                        : Math.max(0, p.likesCount + delta),
                  }
                : p
            )
          );
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribeFeed();
    };
  }, [currentUser.id]);

  // Real-time Supabase `useChannel` listener for `post_comments` (INSERT, REPLY, DELETE)
  usePostCommentsChannel({
    currentUserId: currentUser.id,
    onCommentInserted: (incomingComment, targetPostId) => {
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== targetPostId) return p;
          const existingComments = Array.isArray(p.comments) ? p.comments : [];

          // 1. Guard against duplicate ID
          if (existingComments.some((c) => Number(c.id) === Number(incomingComment.id))) {
            return p;
          }

          // 2. Reconcile optimistic comment (temporary Date.now() ID > 1.7e12 with identical content)
          const optimisticIndex = existingComments.findIndex(
            (c) =>
              Number(c.id) > 1_700_000_000_000 &&
              c.content.trim() === incomingComment.content.trim()
          );

          if (optimisticIndex !== -1) {
            const reconciled = [...existingComments];
            reconciled[optimisticIndex] = {
              ...reconciled[optimisticIndex],
              ...incomingComment,
              replies: reconciled[optimisticIndex].replies || [],
            };
            return {
              ...p,
              comments: reconciled,
              commentsList: reconciled,
              commentsCount: Math.max(p.commentsCount || 0, reconciled.length),
            };
          }

          // 3. Append brand-new real-time comment from another user/tab immediately
          const nextComments = [...existingComments, incomingComment];
          return {
            ...p,
            comments: nextComments,
            commentsList: nextComments,
            commentsCount: Math.max((p.commentsCount || 0) + 1, nextComments.length),
          };
        })
      );
    },
    onReplyInserted: (incomingReply, targetPostId, parentCommentId) => {
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== targetPostId) return p;
          const existingComments = Array.isArray(p.comments) ? p.comments : [];
          let addedNew = false;

          const updatedComments = existingComments.map((c) => {
            if (Number(c.id) !== Number(parentCommentId)) return c;
            const existingReplies = Array.isArray(c.replies) ? c.replies : [];

            if (existingReplies.some((r) => Number(r.id) === Number(incomingReply.id))) {
              return c;
            }

            const optIdx = existingReplies.findIndex(
              (r) =>
                Number(r.id) > 1_700_000_000_000 &&
                r.content.trim() === incomingReply.content.trim()
            );

            if (optIdx !== -1) {
              const reconciledReplies = [...existingReplies];
              reconciledReplies[optIdx] = { ...reconciledReplies[optIdx], ...incomingReply };
              return { ...c, replies: reconciledReplies };
            }

            addedNew = true;
            return { ...c, replies: [...existingReplies, incomingReply] };
          });

          return {
            ...p,
            comments: updatedComments,
            commentsList: updatedComments,
            commentsCount: addedNew ? (p.commentsCount || 0) + 1 : p.commentsCount,
          };
        })
      );
    },
    onCommentDeleted: (deletedCommentId, targetPostId) => {
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== targetPostId) return p;
          const existingComments = Array.isArray(p.comments) ? p.comments : [];
          const filtered = existingComments.filter((c) => Number(c.id) !== Number(deletedCommentId));
          if (filtered.length === existingComments.length) return p;
          return {
            ...p,
            comments: filtered,
            commentsList: filtered,
            commentsCount: Math.max(0, (p.commentsCount || 1) - 1),
          };
        })
      );
    },
  });

  // Handle saving / bookmarking a post to offline cache & Supabase
  const handleToggleSave = (post: PostItem) => {
    const isNowSaved = toggleSavePost(post);
    toggleSavePostInDb(post.id, currentUser.id).catch(() => {});
    setPosts((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, isSaved: isNowSaved } : p))
    );
    if (isNowSaved) {
      playSound('post');
      showToast('Post saved to offline cache!');
    } else {
      showToast('Post removed from saved offline cache.');
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [activeFilterCategory, setActiveFilterCategory] = useState<string>('All');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState<boolean>(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [autoPlayOnScroll, setAutoPlayOnScroll] = useState<boolean>(true);

  // Facebook-style "New Post" Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [composerInitialTab, setComposerInitialTab] = useState<'text' | 'photo' | 'video' | 'link'>('text');
  const [composerInitialImages, setComposerInitialImages] = useState<string[]>([]);
  const [composerInitialVideos, setComposerInitialVideos] = useState<string[]>([]);

  // New Posts indicator state
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [pendingNewPostsCount, setPendingNewPostsCount] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Comments state
  const [activeCommentPostId, setActiveCommentPostId] = useState<number | null>(null);
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [replyInputs, setReplyInputs] = useState<Record<number, string>>({});
  const [activeReplyId, setActiveReplyId] = useState<number | null>(null);

  // Read More / Truncation state: set of expanded post IDs
  const [expandedPostIds, setExpandedPostIds] = useState<Set<number>>(new Set());

  // Post dropdown menu state
  const [activeMenuPostId, setActiveMenuPostId] = useState<number | null>(null);
  const [copiedPostId, setCopiedPostId] = useState<number | null>(null);
  const [highlightedPostId, setHighlightedPostId] = useState<number | null>(null);

  // Post Editing state
  const [editingPost, setEditingPost] = useState<PostItem | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editImages, setEditImages] = useState<string[]>([]);
  const [editVideos, setEditVideos] = useState<string[]>([]);
  const [editCategory, setEditCategory] = useState<PostCategory>('General Update');
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const editVideoInputRef = useRef<HTMLInputElement>(null);

  // Delete Post Confirmation Dialog state
  const [postToDelete, setPostToDelete] = useState<PostItem | null>(null);
  const [isVerificationBannerClosed, setIsVerificationBannerClosed] = useState(false);

  // 5-minute login duration timer: notification banners appear after 5 minutes of login
  const FIVE_MINUTES_MS = 5 * 60 * 1000; // 300,000 ms (5 minutes)
  const [showLoginNotification, setShowLoginNotification] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = sessionStorage.getItem('szmc_login_timestamp') || localStorage.getItem('szmc_login_timestamp');
      if (!stored) {
        sessionStorage.setItem('szmc_login_timestamp', Date.now().toString());
        return false;
      }
      return Date.now() - Number(stored) >= FIVE_MINUTES_MS;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (showLoginNotification) return;

    let loginTime = Date.now();
    try {
      const stored = sessionStorage.getItem('szmc_login_timestamp') || localStorage.getItem('szmc_login_timestamp');
      if (stored) {
        loginTime = Number(stored);
      } else {
        sessionStorage.setItem('szmc_login_timestamp', loginTime.toString());
      }
    } catch {}

    const elapsed = Date.now() - loginTime;
    const remaining = Math.max(0, FIVE_MINUTES_MS - elapsed);

    if (remaining <= 0) {
      setShowLoginNotification(true);
      return;
    }

    const timer = setTimeout(() => {
      setShowLoginNotification(true);
    }, remaining);

    return () => clearTimeout(timer);
  }, [showLoginNotification]);

  // Report Post Modal state
  const [postToReport, setPostToReport] = useState<PostItem | null>(null);

  // Lightbox Modal state
  const [lightboxState, setLightboxState] = useState<{
    isOpen: boolean;
    images: string[];
    initialIndex: number;
    postAuthor?: {
      fullName: string;
      avatarUrl: string;
      batchYear?: number;
      createdAt?: string;
      verified?: boolean;
      profileCompleted?: boolean;
    };
    postCaption?: string;
  }>({
    isOpen: false,
    images: [],
    initialIndex: 0,
  });

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.post-menu-container')) {
        setActiveMenuPostId(null);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        filterDropdownRef.current &&
        !filterDropdownRef.current.contains(e.target as Node)
      ) {
        setIsFilterDropdownOpen(false);
      }
    };
    if (isFilterDropdownOpen) {
      window.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isFilterDropdownOpen]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Build direct link to a specific post
  const getDirectPostUrl = (postId: number): string => {
    if (typeof window === 'undefined') return `#post-${postId}`;
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('post', String(postId));
    url.hash = `post-${postId}`;
    return url.toString();
  };

  // Copy direct link to a post to clipboard with fallback
  const handleSharePost = async (postId: number) => {
    const directUrl = getDirectPostUrl(postId);
    let copied = false;

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(directUrl);
        copied = true;
      } catch {
        copied = false;
      }
    }

    if (!copied && typeof document !== 'undefined') {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = directUrl;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        copied = true;
      } catch {
        copied = false;
      }
    }

    setCopiedPostId(postId);
    setTimeout(() => {
      setCopiedPostId((prev) => (prev === postId ? null : prev));
    }, 2500);

    playSound('post');
    showToast('Direct post link copied to clipboard!');
  };

  // Detect shared post ID from URL (?post=123 or #post-123) and scroll to it
  useEffect(() => {
    const checkSharedPostFromUrl = () => {
      if (typeof window === 'undefined') return;
      let targetPostId: number | null = null;
      const params = new URLSearchParams(window.location.search);
      const queryPost = params.get('post');
      if (queryPost && !Number.isNaN(Number(queryPost))) {
        targetPostId = Number(queryPost);
      } else if (window.location.hash.startsWith('#post-')) {
        const hashId = Number(window.location.hash.replace('#post-', ''));
        if (!Number.isNaN(hashId)) {
          targetPostId = hashId;
        }
      }

      if (targetPostId !== null) {
        setActiveFilterCategory('All');
        setHighlightedPostId(targetPostId);
        setTimeout(() => {
          const el = document.getElementById(`post-${targetPostId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 180);
      }
    };

    checkSharedPostFromUrl();
    window.addEventListener('hashchange', checkSharedPostFromUrl);
    window.addEventListener('popstate', checkSharedPostFromUrl);
    return () => {
      window.removeEventListener('hashchange', checkSharedPostFromUrl);
      window.removeEventListener('popstate', checkSharedPostFromUrl);
    };
  }, []);

  // Truncate toggle helper
  const toggleExpandPost = (postId: number) => {
    setExpandedPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  };



  // Edit image upload
  const handleEditImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    (Array.from(files) as File[]).forEach((file: File) => {
      const isImage =
        file.type.startsWith('image/') ||
        ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
        /\.(jpe?g|png|webp|gif|svg|avif|heic)$/i.test(file.name);
      if (!isImage) {
        showToast('Only JPG, PNG, WEBP, and GIF images are supported.');
        return;
      }
      compressImageFileToDataUrl(file)
        .then((result) => {
          if (result) {
            setEditImages((prev) => [...prev, result]);
          }
        })
        .catch(() => {
          const reader = new FileReader();
          reader.onload = (uploadEvent) => {
            const result = uploadEvent.target?.result as string;
            if (result) {
              setEditImages((prev) => [...prev, result]);
            }
          };
          reader.readAsDataURL(file);
        });
    });

    e.target.value = '';
  };

  const handleRemoveEditImage = (indexToRemove: number) => {
    setEditImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleEditVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    (Array.from(files) as File[]).forEach((file: File) => {
      const validation = validateVideoFile(file);
      if (!validation.isValid) {
        showToast(validation.error || 'Only video files (MP4, WEBM, MOV) up to 100 MB are supported.');
        return;
      }
      uploadVideoToStorage(file, String(currentUser.id))
        .then((uploaded) => {
          setEditVideos((prev) => [...prev, uploaded.videoUrl]);
        })
        .catch(() => {
          const objectUrl = URL.createObjectURL(file);
          setEditVideos((prev) => [...prev, objectUrl]);
        });
    });

    e.target.value = '';
  };

  const handleRemoveEditVideo = (indexToRemove: number) => {
    setEditVideos((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Multi-Reaction Handler (Phase 5)
  const handleReactToPost = (postId: number, nextReaction: ReactionType | null) => {
    const targetPost = posts.find((p) => p.id === postId);
    if (targetPost && nextReaction && !targetPost.likedByMe && targetPost.userId !== currentUser.id) {
      notifyPostLike(targetPost, {
        id: currentUser.id,
        fullName: currentUser.fullName,
        avatarUrl: currentUser.avatarUrl,
      });
    }
    if (nextReaction) playSound('like');

    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const prevReaction = p.userReaction || (p.likedByMe ? 'love' : null);
        let nextCount = p.likesCount || 0;
        if (!prevReaction && nextReaction) nextCount += 1;
        else if (prevReaction && !nextReaction) nextCount = Math.max(0, nextCount - 1);

        const nextSummary: Partial<Record<ReactionType, number>> = { ...(p.reactionsSummary || {}) };
        if (prevReaction && nextSummary[prevReaction]) {
          nextSummary[prevReaction] = Math.max(0, Number(nextSummary[prevReaction]) - 1);
          if (nextSummary[prevReaction] === 0) delete nextSummary[prevReaction];
        }
        if (nextReaction) {
          nextSummary[nextReaction] = (Number(nextSummary[nextReaction]) || 0) + 1;
        }

        return {
          ...p,
          likedByMe: Boolean(nextReaction),
          userReaction: nextReaction,
          reactionsSummary: nextSummary,
          likesCount: nextCount,
        };
      })
    );

    void upsertPostReaction({
      postId,
      userId: currentUser.id,
      reaction: nextReaction,
      reactorName: currentUser.fullName,
    });
  };



  // Open Edit Post
  const handleStartEdit = (post: PostItem) => {
    setActiveMenuPostId(null);
    setEditingPost(post);
    setEditContent(post.content);
    setEditImages([...(post.images || [])]);
    setEditVideos([...(post.videos || [])]);
    setEditCategory((post.category as PostCategory) || 'General Update');
  };

  // Save Post Changes
  const handleSaveEdit = async () => {
    if (!editingPost) return;
    if (!editContent.trim() && editImages.length === 0 && editVideos.length === 0) {
      showToast('Post content, an image, or a video is required.');
      return;
    }

    const targetPost = editingPost;
    const nextContent = editContent.trim();
    const nextImages = [...editImages];
    const nextVideos = [...editVideos];
    const nextCategory = editCategory;

    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === targetPost.id) {
          return {
            ...p,
            content: nextContent,
            images: nextImages,
            videos: nextVideos,
            category: nextCategory,
            isEdited: true,
          };
        }
        return p;
      })
    );
    setEditingPost(null);

    const saved = await editFeedPostInDb({
      postId: targetPost.id,
      content: nextContent,
      category: nextCategory,
      images: nextImages,
      videos: nextVideos,
    }).catch(() => false);

    if (saved) {
      showToast('Post updated and synced to Supabase in real time!');
    } else {
      showToast('Warning: Post edit could not be saved to Supabase. Please check your permissions.');
    }
  };

  // Confirm and Execute Delete Post
  const handleConfirmDelete = async () => {
    if (!postToDelete) return;
    const target = postToDelete;
    setPosts((prev) => prev.filter((p) => p.id !== target.id));
    setPostToDelete(null);

    const deleted = await deleteFeedPostInDb(target.id).catch(() => false);
    if (deleted) {
      showToast('Post deleted permanently from Supabase.');
    } else {
      setPosts((prev) => [target, ...prev]);
      showToast('Could not delete post in Supabase. Please check your permissions.');
    }
  };

  // Confirm Block Author (hides their posts, comments & notifications immediately)
  const handleConfirmBlockUser = async () => {
    if (!userToBlock || !currentUser.id) return;
    const target = userToBlock;
    setUserToBlock(null);
    const res = await blockUser({
      blockerId: currentUser.id,
      blockedUser: target,
    });
    if (res.success) {
      setBlockedUserIds((prev) => new Set([...Array.from(prev), target.id]));
      setPosts((prev) => prev.filter((p) => Number(p.userId) !== Number(target.id)));
      showToast(`Blocked ${target.fullName}. Their posts and notifications are now hidden.`);
    } else {
      showToast(res.error || 'Could not block this account.');
    }
  };

  // Open Lightbox
  const handleOpenLightbox = (post: PostItem, imageIndex: number) => {
    setLightboxState({
      isOpen: true,
      images: post.images,
      initialIndex: imageIndex,
      postAuthor: {
        fullName: post.fullName,
        avatarUrl: post.avatarUrl,
        batchYear: post.batchYear,
        createdAt: post.createdAt,
        verified: Boolean(post.verified),
        profileCompleted:
          post.userId === currentUser.id
            ? isProfileFullyCompleted(currentUser)
            : Boolean(post.profileCompleted),
      },
      postCaption: post.content,
    });
  };

  // Refresh Feed directly from Supabase
  const handleRefreshFeed = async () => {
    setHasNewPosts(false);
    setPendingNewPostsCount(0);
    setIsLoadingPosts(true);
    try {
      const dbPosts = await fetchFeedPostsFromDb(50, currentUser.id);
      setPosts(dbPosts || []);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      showToast('Feed refreshed from Supabase!');
    } catch {
      showToast('Failed to refresh feed from database.');
    } finally {
      setIsLoadingPosts(false);
    }
  };

  // Add Comment
  const handleAddComment = (postId: number) => {
    const text = (commentInputs[postId] || '').trim();
    if (!text) return;

    const tempCommentId = Date.now();
    const newComment: PostComment = {
      id: tempCommentId,
      postId,
      userId: currentUser.userId || currentUser.id,
      fullName: currentUser.fullName,
      avatarUrl: currentUser.avatarUrl,
      content: text,
      likesCount: 0,
      likedByMe: false,
      createdAt: 'Just now',
      replies: [],
    };

    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          const updated = [...(p.comments || []), newComment];
          return {
            ...p,
            commentsCount: Math.max((p.commentsCount || 0) + 1, updated.length),
            comments: updated,
            commentsList: updated,
          };
        }
        return p;
      })
    );

    setCommentInputs({ ...commentInputs, [postId]: '' });
    playSound('comment');

    const targetPost = posts.find((p) => p.id === postId);
    if (targetPost && targetPost.userId !== currentUser.id) {
      notifyPostComment(targetPost, text, {
        id: currentUser.id,
        fullName: currentUser.fullName,
        avatarUrl: currentUser.avatarUrl,
      });
    }

    addPostCommentInDb({
      postId,
      userId: currentUser.id,
      content: text,
      fullName: currentUser.fullName,
      avatarUrl: currentUser.avatarUrl,
    })
      .then((res) => {
        if (res?.success && res.comment) {
          setPosts((prev) =>
            prev.map((p) => {
              if (p.id !== postId) return p;
              const reconciled = (p.comments || []).map((c) =>
                c.id === tempCommentId
                  ? { ...c, id: res.comment!.id, createdAt: res.comment!.createdAt }
                  : c
              );
              // Deduplicate in case Realtime event arrived before promise resolved
              const seenIds = new Set<number>();
              const deduped = reconciled.filter((c) => {
                const cid = Number(c.id);
                if (seenIds.has(cid)) return false;
                seenIds.add(cid);
                return true;
              });
              return {
                ...p,
                comments: deduped,
                commentsList: deduped,
                commentsCount: Math.max(p.commentsCount || 0, deduped.length),
              };
            })
          );
        } else {
          setPosts((prev) =>
            prev.map((p) => {
              if (p.id !== postId) return p;
              const rolledBack = (p.comments || []).filter((c) => c.id !== tempCommentId);
              return {
                ...p,
                comments: rolledBack,
                commentsList: rolledBack,
                commentsCount: Math.max(0, rolledBack.length),
              };
            })
          );
          setCommentInputs((prev) => ({ ...prev, [postId]: prev[postId] || text }));
          showToast('Could not save your comment right now. Please try again.');
        }
      })
      .catch((err) => {
        console.warn('addPostCommentInDb error:', err);
        setPosts((prev) =>
          prev.map((p) => {
            if (p.id !== postId) return p;
            const rolledBack = (p.comments || []).filter((c) => c.id !== tempCommentId);
            return {
              ...p,
              comments: rolledBack,
              commentsList: rolledBack,
              commentsCount: Math.max(0, rolledBack.length),
            };
          })
        );
        setCommentInputs((prev) => ({ ...prev, [postId]: prev[postId] || text }));
        showToast('Could not save your comment right now. Please try again.');
      });
  };

  // Add Reply
  const handleAddReply = (postId: number, parentCommentId: number) => {
    const text = (replyInputs[parentCommentId] || '').trim();
    if (!text) return;

    const tempReplyId = Date.now();
    const newReply: PostComment = {
      id: tempReplyId,
      postId,
      userId: currentUser.userId || currentUser.id,
      fullName: currentUser.fullName,
      avatarUrl: currentUser.avatarUrl,
      content: text,
      likesCount: 0,
      likedByMe: false,
      createdAt: 'Just now',
    };

    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          const updatedComments = p.comments.map((c) => {
            if (c.id === parentCommentId) {
              return {
                ...c,
                replies: [...(c.replies || []), newReply],
              };
            }
            return c;
          });
          return {
            ...p,
            commentsCount: p.commentsCount + 1,
            comments: updatedComments,
          };
        }
        return p;
      })
    );

    setReplyInputs({ ...replyInputs, [parentCommentId]: '' });
    setActiveReplyId(null);

    addPostCommentInDb({
      postId,
      userId: currentUser.id,
      content: text,
      fullName: currentUser.fullName,
      avatarUrl: currentUser.avatarUrl,
      parentCommentId,
    })
      .then((res) => {
        if (res?.success && res.comment) {
          setPosts((prev) =>
            prev.map((p) => {
              if (p.id !== postId) return p;
              const updatedComments = (p.comments || []).map((c) => {
                if (c.id !== parentCommentId) return c;
                const reconciledReplies = (c.replies || []).map((r) =>
                  r.id === tempReplyId
                    ? { ...r, id: res.comment!.id, createdAt: res.comment!.createdAt }
                    : r
                );
                const seen = new Set<number>();
                const dedupedReplies = reconciledReplies.filter((r) => {
                  const rid = Number(r.id);
                  if (seen.has(rid)) return false;
                  seen.add(rid);
                  return true;
                });
                return { ...c, replies: dedupedReplies };
              });
              return { ...p, comments: updatedComments };
            })
          );
        } else {
          setPosts((prev) =>
            prev.map((p) => {
              if (p.id !== postId) return p;
              const updatedComments = (p.comments || []).map((c) => {
                if (c.id !== parentCommentId) return c;
                return {
                  ...c,
                  replies: (c.replies || []).filter((r) => r.id !== tempReplyId),
                };
              });
              return {
                ...p,
                commentsCount: Math.max(0, (p.commentsCount || 1) - 1),
                comments: updatedComments,
              };
            })
          );
          setReplyInputs((prev) => ({ ...prev, [parentCommentId]: prev[parentCommentId] || text }));
          showToast('Could not save your reply right now. Please try again.');
        }
      })
      .catch(() => {
        setPosts((prev) =>
          prev.map((p) => {
            if (p.id !== postId) return p;
            const updatedComments = (p.comments || []).map((c) => {
              if (c.id !== parentCommentId) return c;
              return {
                ...c,
                replies: (c.replies || []).filter((r) => r.id !== tempReplyId),
              };
            });
            return {
              ...p,
              commentsCount: Math.max(0, (p.commentsCount || 1) - 1),
              comments: updatedComments,
            };
          })
        );
        setReplyInputs((prev) => ({ ...prev, [parentCommentId]: prev[parentCommentId] || text }));
        showToast('Could not save your reply right now. Please try again.');
      });
  };

  const displayedPosts = useMemo(() => {
    const myBatchNum = normalizeToBatchNumber(currentUser.batchYear);
    const isStaffUser = Boolean(
      isAdminUser ||
        currentUser.role === 'admin' ||
        currentUser.role === 'moderator' ||
        (currentUser as any).role === 'super_admin'
    );
    const safetyFilteredPosts = filterBlockedPosts(posts, blockedUserIds);

    return embeddedInQuad
      ? dedupeAndRankFeedPosts(safetyFilteredPosts, {
          feedTab: quadFeedTab,
          category: quadCategoryFilter,
          myUserId: currentUser.id,
          myBatchYear: myBatchNum,
          isStaff: isStaffUser,
          followedUserIds,
          followedPageIds,
          weights: rankingWeights,
        })
      : activeFilterCategory !== 'All'
      ? safetyFilteredPosts.filter((p) => p.category === activeFilterCategory)
      : safetyFilteredPosts;
  }, [
    posts,
    blockedUserIds,
    embeddedInQuad,
    quadFeedTab,
    quadCategoryFilter,
    currentUser.id,
    currentUser.batchYear,
    currentUser.role,
    isAdminUser,
    followedUserIds,
    followedPageIds,
    rankingWeights,
    activeFilterCategory,
  ]);

  return (
    <div className={embeddedInQuad ? 'w-full space-y-5' : 'max-w-6xl mx-auto space-y-6'}>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 sm:top-20 right-3 sm:right-5 max-w-[calc(100vw-1.5rem)] sm:max-w-md z-50 flex items-center gap-2.5 px-3.5 sm:px-4 py-2.5 sm:py-3 bg-slate-900/95 text-white dark:bg-white/95 dark:text-slate-900 rounded-2xl shadow-xl border border-slate-700/50 dark:border-slate-200 text-xs font-semibold animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span className="truncate">{toastMessage}</span>
        </div>
      )}

      {/* New Posts Floating Indicator */}
      {hasNewPosts && (
        <div className="sticky top-20 z-30 flex justify-center animate-bounce">
          <button
            type="button"
            onClick={handleRefreshFeed}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-full shadow-lg shadow-blue-600/30 border border-blue-400/40 transition-all cursor-pointer hover:scale-105"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>
              {pendingNewPostsCount > 1
                ? `${pendingNewPostsCount} new posts available · Click to refresh`
                : 'New post available · Click to refresh view'}
            </span>
          </button>
        </div>
      )}

      {/* Mobile/Tablet Compact Event Alert Banner (Standalone mode only) */}
      {!embeddedInQuad && (
        <div className="xl:hidden">
          <button
            type="button"
            onClick={() => onNavigate && onNavigate('events')}
            className="w-full text-left p-3 sm:p-3.5 rounded-2xl bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-700 text-white shadow-md shadow-blue-900/20 border border-blue-400/40 flex items-center justify-between gap-3 cursor-pointer group transition-all hover:scale-[1.01]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-white/25 shadow-xs bg-slate-900">
                <img
                  src="/assets/aistudio/844630102_122141641941179457_1692878458464947990_n_99cb78bb.jpg"
                  alt="SZMC DAY 2026 is on 4, 5th November"
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 font-black text-[9px] uppercase tracking-wider">
                    Event
                  </span>
                  <span className="text-[10px] text-amber-200 font-bold">4, 5th November, 2026</span>
                </div>
                <h4 className="font-black text-xs sm:text-sm text-white truncate">
                  SZMC DAY 2026 is on 4, 5th November
                </h4>
              </div>
            </div>
            <span className="shrink-0 px-2.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-[11px] font-bold transition-colors whitespace-nowrap">
              View Event →
            </span>
          </button>
        </div>
      )}

      <div className={embeddedInQuad ? 'w-full' : 'xl:grid xl:grid-cols-12 xl:gap-6 items-start'}>
        {/* Main Feed Column */}
        <div className={embeddedInQuad ? 'space-y-5' : 'xl:col-span-8 space-y-6'}>

      {/* Offline Notice Banner */}
      {!isOnline && (
        <div className="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-2.5">
            <WifiOff className="w-4 h-4 text-amber-500 shrink-0" />
            <span>
              <strong>Offline Mode Active:</strong> You are browsing cached feed posts.
            </span>
          </div>
        </div>
      )}

      {/* Notification Banners (Displayed after 5 minutes of login) */}
      {showLoginNotification && (
        <>
          {/* Emergency Blood Alert Banner (Dismissible with Cross button) */}
          <BloodNeededNowSection
            variant="feed"
            onNavigateToBloodNetwork={() => onNavigate && onNavigate('emergency')}
          />

          {/* Active Verification & Peer Vouch Banner (Dismissible with simple Cross button) */}
          {!isVerificationBannerClosed && (
            <div
              className={`relative rounded-2xl p-4 pr-11 border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                (currentUser.verificationStatus || 'verified') === 'verified'
                  ? 'bg-gradient-to-r from-emerald-50/90 via-teal-50/70 to-blue-50/80 dark:from-emerald-950/30 dark:via-slate-900 dark:to-blue-950/30 border-emerald-200/80 dark:border-emerald-800/60'
                  : 'bg-gradient-to-r from-amber-50/95 via-orange-50/80 to-amber-50/90 dark:from-amber-950/35 dark:via-slate-900 dark:to-orange-950/30 border-amber-300/80 dark:border-amber-800/60'
              }`}
            >
              <div className="flex items-start sm:items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    (currentUser.verificationStatus || 'verified') === 'verified'
                      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                      : 'bg-amber-500 text-white shadow-sm shadow-amber-500/20'
                  }`}
                >
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                      {(currentUser.verificationStatus || 'verified') === 'verified'
                        ? 'SZMCian Verification Active'
                        : `Verification Pending (${currentUser.vouchesCount || 0}/2 Peer Vouches)`}
                    </span>
                    <VerificationStatusBadge
                      status={currentUser.verificationStatus || 'verified'}
                      vouchesCount={currentUser.vouchesCount ?? 2}
                      size="sm"
                      onClick={() => onOpenVerificationCenter && onOpenVerificationCenter('status')}
                    />
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                    {(currentUser.verificationStatus || 'verified') === 'verified'
                      ? `${pendingVouchesCount} SZMC colleague${pendingVouchesCount === 1 ? ' is' : 's are'} awaiting peer verification. Vouch for your batchmates to keep the directory authentic.`
                      : 'Complete your verification via 2 batchmate vouches or upload your BMDC Certificate / College ID for instant verification.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    onOpenVerificationCenter &&
                    onOpenVerificationCenter(
                      (currentUser.verificationStatus || 'verified') === 'verified'
                        ? 'vouch_others'
                        : 'status'
                    )
                  }
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                    (currentUser.verificationStatus || 'verified') === 'verified'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>
                    {(currentUser.verificationStatus || 'verified') === 'verified'
                      ? `Vouch for Classmates (${pendingVouchesCount})`
                      : 'Open Verification Center'}
                  </span>
                </button>
              </div>

              {/* Simple Cross (X) Button to Close Verification Notification */}
              <button
                type="button"
                onClick={() => setIsVerificationBannerClosed(true)}
                aria-label="Close verification notification"
                title="Close verification notification"
                className="absolute top-3 right-3 p-1.5 rounded-full bg-white/80 hover:bg-rose-600 dark:bg-slate-800/90 dark:hover:bg-rose-600 text-slate-500 hover:text-white dark:text-slate-300 dark:hover:text-white border border-slate-200/80 dark:border-slate-700 transition-all cursor-pointer shadow-xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Facebook-Style Create Post Box */}
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-slate-200/80 dark:border-slate-800/80 shadow-xs transition-all hover:border-slate-300 dark:hover:border-slate-700"
      >
        {/* Selector 3: div:nth-of-type(1) -> Avatar + Rounded Input Trigger */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <VerifiedAvatar
            src={currentUser.avatarUrl || '/assets/aistudio/images__1__2778177d.png'}
            alt={currentUser.fullName}
            verificationStatus={currentUser.verificationStatus}
            profile={currentUser}
            size="md"
            imgClassName="w-10 h-10 sm:w-11 sm:h-11"
            unverifiedClassName="rounded-full ring-2 ring-blue-500/20"
          />

          <button
            type="button"
            id="open-create-post-modal-btn"
            onClick={() => {
              setComposerInitialTab('text');
              setIsCreateModalOpen(true);
            }}
            className="flex-1 text-left px-4 py-2.5 sm:py-3 rounded-full bg-slate-100 hover:bg-slate-200/75 dark:bg-slate-800/80 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-700/70 text-xs sm:text-sm text-slate-500 dark:text-slate-400 transition-all cursor-pointer truncate"
          >
            What's on your mind, {currentUser.fullName || 'Alumnus'}?
          </button>
        </div>

        {/* Selector 2: div:nth-of-type(2) -> Divider */}
        <div className="border-t border-slate-100 dark:border-slate-800/80 my-3" />

        {/* Selector 1: div:nth-of-type(3) -> Facebook Style Action Buttons (Photo, Video, Link) */}
        <div className="flex items-center justify-between sm:justify-around gap-1 text-xs font-bold">
          {/* Photo Button - Opens Computer Storage */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 py-2 px-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300 transition-all cursor-pointer active:scale-95"
            title="Upload photo from computer storage"
          >
            <ImageIcon className="w-5 h-5 text-emerald-500 shrink-0" />
            <span className="truncate">Photo</span>
          </button>

          {/* Video Button - Opens Computer Storage directly to upload downloaded video like photo button */}
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 py-2 px-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300 transition-all cursor-pointer active:scale-95"
            title="Upload downloaded video from computer storage"
          >
            <Video className="w-5 h-5 text-rose-500 shrink-0" />
            <span className="truncate">Video</span>
          </button>

          {/* Link Button */}
          <button
            type="button"
            onClick={() => {
              setComposerInitialTab('link');
              setIsCreateModalOpen(true);
            }}
            className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 py-2 px-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300 transition-all cursor-pointer active:scale-95"
            title="Share web link"
          >
            <Link2 className="w-5 h-5 text-blue-500 shrink-0" />
            <span className="truncate">Link</span>
          </button>
        </div>

        {/* Direct Computer Storage File Pickers */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              const files = Array.from(e.target.files);
              const loadedUrls: string[] = [];
              files.forEach((f) => {
                const reader = new FileReader();
                reader.onload = (ev) => {
                  if (ev.target?.result) {
                    loadedUrls.push(ev.target.result as string);
                    if (loadedUrls.length >= files.length) {
                      setComposerInitialImages(loadedUrls);
                      setComposerInitialTab('photo');
                      setIsCreateModalOpen(true);
                    }
                  }
                };
                reader.readAsDataURL(f);
              });
            }
            e.target.value = '';
          }}
          className="hidden"
        />

        <input
          ref={videoInputRef}
          type="file"
          multiple
          accept="video/*,video/mp4,video/webm,video/quicktime,video/x-matroska"
          onChange={async (e) => {
            if (e.target.files && e.target.files.length > 0) {
              const files = Array.from(e.target.files);
              e.target.value = '';
              setComposerInitialTab('video');
              setIsCreateModalOpen(true);
              const uploadedUrls: string[] = [];
              let failedCount = 0;
              for (const f of files) {
                try {
                  const res = await uploadVideoToStorage(f, String(currentUser.id || currentUser.userId || 'alumni'));
                  if (res.videoUrl) {
                    uploadedUrls.push(res.videoUrl);
                  } else {
                    failedCount += 1;
                  }
                } catch {
                  failedCount += 1;
                }
              }
              if (uploadedUrls.length > 0) {
                setComposerInitialVideos(uploadedUrls);
              }
              if (failedCount > 0) {
                showToast('Could not upload selected video. Please check file size/format and try again.');
              }
            }
          }}
          className="hidden"
        />
      </div>

      {/* Uploaded Clean CreatePostModal Component */}
      <CreatePostModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setComposerInitialImages([]);
          setComposerInitialVideos([]);
        }}
        authorId={currentUser.id}
        authorName={currentUser.fullName}
        authorAvatar={currentUser.avatarUrl}
        authorVerified={currentUser.verificationStatus === 'verified'}
        authorProfileCompleted={isProfileFullyCompleted(currentUser)}
        authorBatchYear={normalizeToBatchNumber(currentUser.batchYear) || undefined}
        canMarkEditorial={Boolean(
          isAdminUser ||
            currentUser.role === 'admin' ||
            currentUser.role === 'moderator' ||
            (currentUser as any).role === 'super_admin'
        )}
        initialTab={composerInitialTab}
        initialImages={composerInitialImages}
        initialVideos={composerInitialVideos}
        onPostCreated={(newPost) => {
          setPosts((prev) => [newPost as any, ...prev.filter((p) => p.id !== newPost.id)]);
          playSound('post');
          showToast('Post published to The Quad.');
        }}
      />


      {/* Category Filter Interactive Dropdown Menu (Standalone mode only; QuadShell provides 8-category filter bar) */}
      {!embeddedInQuad && (
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-2.5">
        <div className="relative inline-block" ref={filterDropdownRef}>
          <button
            type="button"
            id="feed-category-filter-dropdown-btn"
            onClick={() => setIsFilterDropdownOpen((prev) => !prev)}
            aria-expanded={isFilterDropdownOpen}
            aria-haspopup="listbox"
            className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer shadow-xs border ${
              activeFilterCategory !== 'All'
                ? 'bg-blue-600 text-white border-blue-500 shadow-blue-600/20'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <Filter className={`w-3.5 h-3.5 ${activeFilterCategory !== 'All' ? 'text-white' : 'text-blue-500'}`} />
            <span>
              Category: <span className="font-extrabold">{activeFilterCategory === 'All' ? 'All Posts' : activeFilterCategory}</span>
            </span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                activeFilterCategory !== 'All'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {activeFilterCategory === 'All'
                ? posts.length
                : posts.filter((p) => p.category === activeFilterCategory).length}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                isFilterDropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Interactive Dropdown Menu Popover */}
          {isFilterDropdownOpen && (
            <div
              role="listbox"
              className="absolute left-0 top-full mt-1.5 w-64 sm:w-72 bg-white dark:bg-slate-900 rounded-2xl p-1.5 border border-slate-200 dark:border-slate-800 shadow-xl z-50 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800/80 mb-1 flex items-center justify-between">
                <span>Filter Feed Categories</span>
                <span>{posts.length} Total</span>
              </div>

              {/* All Posts Option */}
              <button
                type="button"
                role="option"
                aria-selected={activeFilterCategory === 'All'}
                onClick={() => {
                  setActiveFilterCategory('All');
                  setIsFilterDropdownOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeFilterCategory === 'All'
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Filter className="w-3 h-3" />
                  </div>
                  <span>All Posts</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-medium">
                    {posts.length}
                  </span>
                  {activeFilterCategory === 'All' && (
                    <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  )}
                </div>
              </button>

              {/* Individual Categories */}
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = activeFilterCategory === cat.label;
                const count = posts.filter((p) => p.category === cat.label).length;
                return (
                  <button
                    key={cat.label}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      setActiveFilterCategory(cat.label);
                      setIsFilterDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${cat.bg} ${cat.color}`}>
                        <Icon className="w-3 h-3" />
                      </div>
                      <span>{cat.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 font-medium">{count}</span>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      )}
                    </div>
                  </button>
                );
              })}

              {activeFilterCategory !== 'All' && (
                <div className="pt-1 mt-1 border-t border-slate-100 dark:border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFilterCategory('All');
                      setIsFilterDropdownOpen(false);
                    }}
                    className="w-full text-center py-1.5 text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                  >
                    Clear Filter
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Clear Filter Quick Tag if a category is selected */}
        {activeFilterCategory !== 'All' && (
          <button
            type="button"
            onClick={() => setActiveFilterCategory('All')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            title="Reset filter to all posts"
          >
            <span>Showing: {activeFilterCategory}</span>
            <X className="w-3 h-3 text-slate-400 hover:text-rose-500" />
          </button>
        )}
      </div>
      )}

      {/* Posts Stream */}
      <div className="space-y-5">
        {(() => {
          if (isLoadingPosts) {
            return (
              <div className="space-y-4" aria-label="Loading posts">
                {[0, 1, 2].map((idx) => (
                  <div
                    key={idx}
                    className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200/80 dark:border-slate-800 space-y-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full fb-shimmer shrink-0" />
                      <div className="space-y-2 flex-1">
                        <div className="h-3.5 w-40 rounded-md fb-shimmer" />
                        <div className="h-2.5 w-28 rounded-md fb-shimmer" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 w-full rounded-md fb-shimmer" />
                      <div className="h-3 w-11/12 rounded-md fb-shimmer" />
                      <div className="h-3 w-2/3 rounded-md fb-shimmer" />
                    </div>
                    {idx === 0 && <div className="h-52 w-full rounded-2xl fb-shimmer" />}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
                      <div className="h-7 flex-1 rounded-xl fb-shimmer" />
                      <div className="h-7 flex-1 rounded-xl fb-shimmer" />
                      <div className="h-7 flex-1 rounded-xl fb-shimmer" />
                    </div>
                  </div>
                ))}
              </div>
            );
          }

          if (displayedPosts.length === 0) {
            const hasActiveQuadFilter =
              embeddedInQuad && (quadCategoryFilter !== 'All' || quadFeedTab !== 'for_you');
            return (
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 border border-slate-200/80 dark:border-slate-800 text-center">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                  {hasActiveQuadFilter ? 'No matching posts in this view' : 'Welcome to The Quad'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                  {hasActiveQuadFilter
                    ? 'There are no posts matching your current feed filter yet. Reset filters to view all community updates or start a new discussion above.'
                    : 'No posts have been published yet. Share a professional milestone, career update, or reunion announcement using the box above!'}
                </p>
                {hasActiveQuadFilter && onClearQuadFilters && (
                  <button
                    type="button"
                    onClick={onClearQuadFilters}
                    className="mt-4 px-4 py-2 rounded-xl bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    Show All Posts
                  </button>
                )}
              </div>
            );
          }

          return displayedPosts.filter(Boolean).map((post) => {
            const isSuperAdmin =
              isAdminUser ||
              currentUser.role === 'admin' ||
              (currentUser as any).role === 'super_admin';
            const isOwner =
              isSuperAdmin ||
              post.userId === currentUser.userId ||
              (post as any).authorId === currentUser.id;
            const postContent = typeof post.content === 'string' ? post.content : '';
            const extractedUrls = extractUrlsFromText(postContent);
            const rawVideos = Array.isArray(post.videos) ? post.videos.filter(Boolean) : [];
            const isDirectVideoFile = (v: string) =>
              v.startsWith('data:video/') ||
              v.startsWith('blob:') ||
              /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(v) ||
              v.includes('/storage/v1/object/');
            const carouselDirectVideos = rawVideos.filter(isDirectVideoFile);
            const externalVideoLinks = rawVideos.filter((v) => !isDirectVideoFile(v));
            const allSharedMediaAndLinks = Array.from(
              new Set([...externalVideoLinks, ...extractedUrls])
            );
            const hasSharedLinks = extractedUrls.length > 0;
            const isLongContent = postContent.length > 360 && !hasSharedLinks;
            const isExpanded = expandedPostIds.has(post.id);
            const displayedText =
              isLongContent && !isExpanded
                ? `${postContent.slice(0, 360)}...`
                : postContent;

            return (
              <article
                key={post.id}
                id={`post-${post.id}`}
                className={`feed-card-cv bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 border shadow-xs transition-shadow hover:shadow-sm ${
                  highlightedPostId === post.id
                    ? 'border-blue-500 ring-2 ring-blue-500/30 dark:border-blue-400'
                    : 'border-slate-200/80 dark:border-slate-800/80'
                }`}
              >
                {highlightedPostId === post.id && (
                  <div className="mb-3 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200/70 dark:border-blue-800/70 flex items-center justify-between text-xs text-blue-700 dark:text-blue-300 font-bold">
                    <span className="flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Viewing shared post</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setHighlightedPostId(null)}
                      className="text-[11px] underline hover:no-underline cursor-pointer shrink-0 ml-2"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Phase 4 Dedicated Priority Placement Strip (Independent of engagement ranking) */}
                {(() => {
                  const pTier =
                    typeof post.priorityTier === 'number'
                      ? post.priorityTier
                      : getPostPriorityTier(post);
                  if (pTier === 3) {
                    return (
                      <div className="mb-3 pb-2 border-b border-rose-200/80 dark:border-rose-900/60 flex items-center justify-between gap-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
                        <span>Urgent Blood Request · Priority Lifeline Placement</span>
                        {onNavigate && (
                          <button
                            type="button"
                            onClick={() => onNavigate('emergency')}
                            className="underline hover:no-underline whitespace-nowrap cursor-pointer"
                          >
                            Blood Network →
                          </button>
                        )}
                      </div>
                    );
                  }
                  if (pTier === 2) {
                    return (
                      <div className="mb-3 pb-2 border-b border-blue-200/80 dark:border-blue-900/60 flex items-center justify-between gap-2 text-xs font-semibold text-blue-700 dark:text-blue-300">
                        <span>
                          {post.officialPageName
                            ? `Official Announcement · ${post.officialPageName}`
                            : 'Official Announcement'}
                        </span>
                        {post.officialPageSlug && onNavigate && (
                          <button
                            type="button"
                            onClick={() => onNavigate(`page/${post.officialPageSlug}`)}
                            className="underline hover:no-underline whitespace-nowrap cursor-pointer"
                          >
                            View Page →
                          </button>
                        )}
                      </div>
                    );
                  }
                  if (pTier === 1) {
                    return (
                      <div className="mb-3 pb-2 border-b border-amber-200/80 dark:border-amber-900/60 text-xs font-semibold text-amber-700 dark:text-amber-300">
                        Featured Community Post
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Post Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div
                    className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group min-w-0"
                    onClick={() => onViewProfile && onViewProfile(post.userId)}
                  >
                    <VerifiedAvatar
                      src={post.avatarUrl}
                      alt={post.fullName}
                      verified={Boolean(post.verified)}
                      profileCompleted={
                        post.userId === currentUser.id
                          ? isProfileFullyCompleted(currentUser)
                          : Boolean(post.profileCompleted)
                      }
                      size="md"
                      imgClassName="w-9 h-9 sm:w-10 sm:h-10"
                      unverifiedClassName="rounded-full ring-2 ring-slate-100 dark:ring-slate-800 group-hover:ring-blue-500 transition-all"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                          {post.fullName}
                        </span>
                        {post.verified && (
                          <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        )}
                        {post.isEdited && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                            (edited)
                          </span>
                        )}
                        {post.isBatchmate && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] sm:text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <GraduationCap className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            Batchmate
                          </span>
                        )}
                        {post.isFriend && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] sm:text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            <UserCheck className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                            Friend
                          </span>
                        )}
                      </div>
                      <div className="text-[10.5px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1 sm:gap-1.5 flex-wrap">
                        <span>Batch {post.batchYear}</span>
                        <span>·</span>
                        <span
                          title={
                            post.createdAt && post.createdAt !== 'Just now' && !Number.isNaN(new Date(post.createdAt).getTime())
                              ? new Date(post.createdAt).toLocaleString('en-US', {
                                  weekday: 'long',
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })
                              : 'Just now'
                          }
                          className="hover:underline"
                        >
                          {(() => {
                            const raw = post.createdAt;
                            if (!raw || raw === 'Just now') return 'Just now';
                            const parsed = new Date(raw);
                            if (Number.isNaN(parsed.getTime())) return raw;
                            const diffSec = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 1000));
                            if (diffSec < 60) return 'Just now';
                            const diffMin = Math.floor(diffSec / 60);
                            if (diffMin < 60) return `${diffMin}m`;
                            const diffHr = Math.floor(diffMin / 60);
                            if (diffHr < 24) return `${diffHr}h`;
                            const diffDays = Math.floor(diffHr / 24);
                            if (diffDays === 1) {
                              return `Yesterday at ${parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
                            }
                            if (diffDays < 7) return `${diffDays}d`;
                            const nowYear = new Date().getFullYear();
                            if (parsed.getFullYear() === nowYear) {
                              return `${parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
                            }
                            return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Post Options Dropdown Menu (Three-dot) */}
                  <div className="relative post-menu-container shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuPostId(activeMenuPostId === post.id ? null : post.id);
                      }}
                      className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      aria-label="Post Options"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>

                    {/* Dropdown Menu Popup */}
                    {activeMenuPostId === post.id && (
                      <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 z-20 animate-fade-in text-xs font-semibold">
                        {isOwner ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleStartEdit(post)}
                              className="w-full px-3.5 py-2 text-left flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-blue-500" />
                              <span>Edit Post</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuPostId(null);
                                handleSharePost(post.id);
                              }}
                              className="w-full px-3.5 py-2 text-left flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
                            >
                              <Share2 className="w-3.5 h-3.5 text-blue-500" />
                              <span>Copy Post Link</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuPostId(null);
                                setPostToDelete(post);
                              }}
                              className="w-full px-3.5 py-2 text-left flex items-center gap-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete Post</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuPostId(null);
                                setPostToReport(post);
                              }}
                              className="w-full px-3.5 py-2 text-left flex items-center gap-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer"
                            >
                              <Flag className="w-3.5 h-3.5" />
                              <span>Report Post</span>
                            </button>
                            {isLoggedIn && post.userId && Number(post.userId) !== Number(currentUser.id) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuPostId(null);
                                  setUserToBlock({
                                    id: Number(post.userId),
                                    fullName: post.fullName || 'SZMC Alumnus',
                                    avatarUrl: post.avatarUrl,
                                    batchYear: post.batchYear,
                                    profession: post.profession,
                                  });
                                }}
                                className="w-full px-3.5 py-2 text-left flex items-center gap-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                              >
                                <ShieldBan className="w-3.5 h-3.5" />
                                <span>Block Author</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuPostId(null);
                                handleToggleSave(post);
                              }}
                              className="w-full px-3.5 py-2 text-left flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
                            >
                              <Bookmark className="w-3.5 h-3.5 text-blue-500" />
                              <span>{isPostSaved(post.id) || post.isSaved ? 'Remove from Saved' : 'Save for Offline'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuPostId(null);
                                handleSharePost(post.id);
                              }}
                              className="w-full px-3.5 py-2 text-left flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
                            >
                              <Share2 className="w-3.5 h-3.5 text-blue-500" />
                              <span>Copy Post Link</span>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Post Body with Safe Clickable Links & Interactive @Mentions */}
                {post.content && (
                  <div className="mb-3.5">
                    <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line break-words">
                      <RichTextWithMentions text={displayedText} />
                    </p>
                    {isLongContent && (
                      <button
                        type="button"
                        onClick={() => toggleExpandPost(post.id)}
                        className="mt-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        {isExpanded ? 'Show less' : 'Read more'}
                      </button>
                    )}
                  </div>
                )}

                {/* Quoted / Reposted Original Post Preview */}
                {post.repostedPost && (
                  <div className="mb-3.5 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <Repeat2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <img
                        src={post.repostedPost.avatarUrl}
                        alt={post.repostedPost.fullName}
                        className="w-5 h-5 rounded-full object-cover shrink-0"
                      />
                      <button
                        type="button"
                        onClick={() => onViewProfile && onViewProfile(post.repostedPost!.userId)}
                        className="font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 truncate cursor-pointer"
                      >
                        {post.repostedPost.fullName}
                      </button>
                      {post.repostedPost.batchYear && (
                        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                          · SZMC-{String(post.repostedPost.batchYear).padStart(2, '0')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed line-clamp-5">
                      {post.repostedPost.content}
                    </p>
                  </div>
                )}

                {/* Inline Community Poll */}
                {post.poll && (
                  <div className="mb-3">
                    <InlinePostPollCard
                      poll={post.poll}
                      currentUserId={currentUser.id}
                      onPollUpdated={(updatedPoll) =>
                        setPosts((prev) =>
                          prev.map((item) =>
                            item.id === post.id ? { ...item, poll: updatedPoll } : item
                          )
                        )
                      }
                    />
                  </div>
                )}

                {/* Post Images & Direct Videos Media with Carousel & Layout Templates */}
                {((post.images && post.images.length > 0) || carouselDirectVideos.length > 0) && (
                  <div className="mb-3.5 sm:mb-4">
                    <PostMediaCarousel
                      images={post.images}
                      videos={carouselDirectVideos}
                      autoPlayVideo={autoPlayOnScroll}
                      layout={post.layout_template || (post.images?.length > 1 ? 'carousel' : 'grid')}
                      onPhotoClick={(idx) => handleOpenLightbox(post, idx)}
                    />
                  </div>
                )}

                {/* Uploaded LinkPreview for Rich Social/Video Embeds */}
                {post.linked_url && (
                  <div className="mb-4">
                    <LinkPreview url={post.linked_url} data={post.link_metadata} />
                  </div>
                )}

                {/* Post Videos & Shared Social/Web Links (YouTube, Facebook, Instagram, LinkedIn, Direct Videos, etc.) */}
                {allSharedMediaAndLinks.length > 0 && (
                  <div className="space-y-3.5 mb-4">
                    {allSharedMediaAndLinks
                      .filter((mediaUrl) => !post.linked_url || mediaUrl !== post.linked_url)
                      .map((mediaUrl, idx) => (
                        <SharedEmbedCard
                          key={`${post.id}-media-${idx}`}
                          url={mediaUrl}
                          autoPlayOnScroll={autoPlayOnScroll}
                        />
                      ))}
                  </div>
                )}

                {/* Action Buttons: Compact Facebook-Style Bar */}
                <div className="flex items-center justify-between gap-0.5 py-0.5 mt-0.5">
                  {/* Multi-Reaction Picker */}
                  <ReactionPickerButton
                    compact
                    likedByMe={post.likedByMe}
                    userReaction={post.userReaction}
                    likesCount={post.likesCount}
                    reactionsSummary={post.reactionsSummary}
                    onReact={(reaction) => handleReactToPost(post.id, reaction)}
                  />

                  {/* Comment */}
                  <button
                    type="button"
                    onClick={() =>
                      setActiveCommentPostId(
                        activeCommentPostId === post.id ? null : post.id
                      )
                    }
                    aria-label="Comments"
                    title="Comments"
                    className={`flex-1 h-8 flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 active:scale-95 ${
                      activeCommentPostId === post.id
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
                        : 'text-slate-600 dark:text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                    }`}
                  >
                    <MessageCircle className="w-4 h-4 shrink-0" />
                    <span className="hidden sm:inline">Comment</span>
                    {Math.max(post.commentsCount || 0, post.comments?.length || 0) > 0 && (
                      <span className="text-xs font-mono tabular-nums leading-none">
                        {Math.max(post.commentsCount || 0, post.comments?.length || 0)}
                      </span>
                    )}
                  </button>

                  {/* Save */}
                  <button
                    type="button"
                    onClick={() => handleToggleSave(post)}
                    aria-label={isPostSaved(post.id) || post.isSaved ? 'Remove from saved' : 'Save post'}
                    title={isPostSaved(post.id) || post.isSaved ? 'Saved' : 'Save'}
                    className={`flex-1 h-8 flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg text-xs font-semibold transition-colors active:scale-95 cursor-pointer whitespace-nowrap shrink-0 ${
                      isPostSaved(post.id) || post.isSaved
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
                        : 'text-slate-600 dark:text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                    }`}
                  >
                    {isPostSaved(post.id) || post.isSaved ? (
                      <BookmarkCheck className="w-4 h-4 shrink-0 fill-current text-blue-600 dark:text-blue-400" />
                    ) : (
                      <Bookmark className="w-4 h-4 shrink-0" />
                    )}
                    <span className="hidden sm:inline">
                      {isPostSaved(post.id) || post.isSaved ? 'Saved' : 'Save'}
                    </span>
                  </button>

                  {/* Share */}
                  <button
                    type="button"
                    onClick={() => handleSharePost(post.id)}
                    aria-label="Share post"
                    title={copiedPostId === post.id ? 'Copied link' : 'Share'}
                    className={`flex-1 h-8 flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg text-xs font-semibold transition-colors active:scale-95 cursor-pointer whitespace-nowrap shrink-0 ${
                      copiedPostId === post.id
                        ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
                        : 'text-slate-600 dark:text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                    }`}
                  >
                    {copiedPostId === post.id ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Share2 className="w-4 h-4 shrink-0" />
                    )}
                    <span className="hidden sm:inline">
                      {copiedPostId === post.id ? 'Copied' : 'Share'}
                    </span>
                  </button>
                </div>

                {/* Comments Thread */}
                <div className="mt-1.5 space-y-2">
                  {Array.isArray(post.comments) && buildCommentTree(post.comments).map((comment) => (
                    <div key={comment.id} className="space-y-2">
                      <div className="flex items-start gap-2.5">
                        <img
                          src={comment.avatarUrl || '/assets/aistudio/images__1__2778177d.png'}
                          alt={comment.fullName || 'Alumnus'}
                          className="w-7 h-7 rounded-full object-cover mt-0.5"
                        />
                        <div className="flex-1">
                          <div className="bg-slate-100 dark:bg-slate-800/80 rounded-2xl px-3.5 py-2 inline-block max-w-full">
                            <span className="font-bold text-xs text-slate-900 dark:text-slate-100 block">
                              {comment.fullName || 'Alumnus'}
                            </span>
                            <p className="text-xs text-slate-700 dark:text-slate-300 break-words mt-0.5">
                              <RichTextWithMentions text={comment.content} />
                            </p>
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500 mt-1 pl-2">
                            <span>{formatFacebookRelativeTime(comment.createdAt)}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setActiveReplyId(
                                  activeReplyId === comment.id ? null : comment.id
                                )
                              }
                              className="font-bold hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                            >
                              Reply
                            </button>
                          </div>

                          {comment.replies && Array.isArray(comment.replies) && comment.replies.length > 0 && (
                            <div className="ml-5 mt-2 space-y-2 border-l-2 border-slate-200 dark:border-slate-700/80 pl-3">
                              {comment.replies.map((reply) => (
                                <div key={reply.id} className="flex items-start gap-2">
                                  <img
                                    src={reply.avatarUrl}
                                    alt={reply.fullName}
                                    className="w-6 h-6 rounded-full object-cover mt-0.5"
                                  />
                                  <div className="bg-slate-100 dark:bg-slate-800/80 rounded-xl px-3 py-1.5 inline-block">
                                    <span className="font-bold text-[11px] text-slate-900 dark:text-slate-100 block">
                                      {reply.fullName}
                                    </span>
                                    <p className="text-xs text-slate-700 dark:text-slate-300">
                                      {reply.content}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {activeReplyId === comment.id && (
                            <div className="flex items-center gap-2 mt-2 ml-5">
                              <input
                                type="text"
                                placeholder={`Reply to ${comment.fullName.split(' ')[0]}...`}
                                value={replyInputs[comment.id] || ''}
                                onChange={(e) =>
                                  setReplyInputs({
                                    ...replyInputs,
                                    [comment.id]: e.target.value,
                                  })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleAddReply(post.id, comment.id);
                                  }
                                }}
                                className="flex-1 min-h-[40px] px-3.5 py-2 text-xs sm:text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              <button
                                type="button"
                                onClick={() => handleAddReply(post.id, comment.id)}
                                aria-label="Send reply"
                                className="w-9 h-9 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-bold cursor-pointer shrink-0 active:scale-95 transition-transform"
                              >
                                <Send className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Add Comment Input */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <VerifiedAvatar
                      src={currentUser.avatarUrl}
                      alt={currentUser.fullName}
                      verificationStatus={currentUser.verificationStatus}
                      profile={currentUser}
                      size="sm"
                      showBadge={false}
                      imgClassName="w-8 h-8"
                      unverifiedClassName="rounded-full ring-1 ring-slate-200 dark:ring-slate-700"
                    />
                    <div className="relative flex-1">
                      <input
                        type="text"
                        enterKeyHint="send"
                        value={commentInputs[post.id] || ''}
                        onChange={(e) =>
                          setCommentInputs({
                            ...commentInputs,
                            [post.id]: e.target.value,
                          })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddComment(post.id);
                        }}
                        placeholder="Write a comment..."
                        className="w-full min-h-[44px] sm:min-h-[38px] pl-4 pr-12 py-2.5 sm:py-2 text-sm sm:text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-full text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddComment(post.id)}
                        aria-label="Send comment"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-all cursor-pointer active:scale-95"
                      >
                        <Send className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          });
        })()}

        {/* Facebook-style Automatic Infinite Scroll Sentinel + Manual Fallback */}
        {!isLoadingPosts && hasMorePosts && (
          <div ref={loadMoreSentinelRef} className="pt-2 flex justify-center">
            <button
              type="button"
              disabled={isLoadingMore}
              onClick={handleLoadMorePosts}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
            >
              {isLoadingMore ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  <span>Loading older posts...</span>
                </>
              ) : (
                <span>Load More Posts</span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>

        {/* Right Events Sidebar (Standalone mode only; QuadCommunityShell renders right discovery rail) */}
        {!embeddedInQuad && (
        <aside className="hidden xl:block xl:col-span-4 space-y-4 sticky top-20 self-start">
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  Events Sidebar
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                Upcoming
              </span>
            </div>

            {/* Featured Event Card: SZMC DAY 2026 is on 4, 5th November */}
            <div
              onClick={() => onNavigate && onNavigate('events')}
              className="group cursor-pointer rounded-2xl overflow-hidden border border-blue-200/80 dark:border-blue-800/60 bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/60 dark:from-slate-800/80 dark:via-slate-900 dark:to-blue-950/40 shadow-xs hover:shadow-md transition-all p-3 space-y-3"
            >
              <div className="relative aspect-[16/10] rounded-xl overflow-hidden shadow-inner bg-slate-900">
                <img
                  src="/assets/aistudio/844630102_122141641941179457_1692878458464947990_n_99cb78bb.jpg"
                  alt="SZMC DAY 2026 is on 4, 5th November"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute top-2 left-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 font-black text-[9px] uppercase tracking-wider shadow-sm animate-pulse">
                    <Calendar className="w-2.5 h-2.5" />
                    Nov 4 & 5, 2026
                  </span>
                </div>
                <div className="absolute bottom-2 right-2">
                  <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[9px] font-bold shadow-xs">
                    Registration Open
                  </span>
                </div>
              </div>

              <div>
                <h4 className="font-black text-sm text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  SZMC DAY 2026
                </h4>
                <p className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                  is on 4, 5th November, 2026
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 italic font-serif mt-1 line-clamp-1">
                  &ldquo;এসো স্মৃতির প্রাঙ্গণে মিলি প্রীতির বন্ধনে&rdquo;
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span>Silimpur Campus, Bogura</span>
                </p>
              </div>

              <button
                type="button"
                className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>View Event Details & Schedule</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick mini-cards */}
            <div className="space-y-2 pt-1 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900 dark:text-white text-[11px]">Nov 4: Campus Rally</div>
                  <div className="text-[10px] text-slate-500">Flag Hoist & Batch Lounges</div>
                </div>
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">Day 1</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900 dark:text-white text-[11px]">Nov 5: CME & Grand Gala</div>
                  <div className="text-[10px] text-slate-500">Royal Feast & Concert</div>
                </div>
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">Day 2</span>
              </div>
            </div>

            {/* Quick Link to full events portal */}
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('events')}
              className="w-full py-2 text-center text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Explore Full 2-Day Schedule →
            </button>
          </div>
        </aside>
        )}
      </div>

      {/* EDIT POST MODAL */}
      {editingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                  Edit Alumni Post
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingPost(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                Category
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.label}
                    type="button"
                    onClick={() => setEditCategory(cat.label)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                      editCategory === cat.label
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                Content
              </label>
              <textarea
                rows={4}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="Update your post message..."
                className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Attached Media ({editImages.length} photos, {editVideos.length} videos)
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => editFileInputRef.current?.click()}
                    className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Photos</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => editVideoInputRef.current?.click()}
                    className="text-xs text-purple-600 dark:text-purple-400 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Video</span>
                  </button>
                </div>
              </div>

              <input
                type="file"
                ref={editFileInputRef}
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                onChange={handleEditImageUpload}
                className="hidden"
              />

              <input
                type="file"
                ref={editVideoInputRef}
                accept="video/mp4,video/webm,video/ogg,video/quicktime"
                multiple
                onChange={handleEditVideoUpload}
                className="hidden"
              />

              {editImages.length > 0 || editVideos.length > 0 ? (
                <div className="space-y-3">
                  {editImages.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {editImages.map((img, idx) => (
                        <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                          <img src={img} alt="Post media preview" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => handleRemoveEditImage(idx)}
                            className="absolute top-1 right-1 p-1 bg-black/70 hover:bg-rose-600 text-white rounded-full transition-colors cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {editVideos.length > 0 && (
                    <div className="space-y-2">
                      {editVideos.map((vid, idx) => (
                        <div key={idx} className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black">
                          <video src={vid} controls className="w-full max-h-40 object-contain" />
                          <button
                            type="button"
                            onClick={() => handleRemoveEditVideo(idx)}
                            className="absolute top-2 right-2 p-1 bg-black/75 hover:bg-rose-600 text-white rounded-full transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No photos or videos currently attached.</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingPost(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition-colors cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {postToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="p-3 bg-rose-50 dark:bg-rose-950/50 rounded-2xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                  Delete Post?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Are you sure you want to delete this post?
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800">
              This action cannot be undone. It will permanently remove this post and all associated comments from the SZMC alumni community feed.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPostToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-md transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Post</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 6: REAL DB-BACKED REPORT CONTENT MODAL */}
      <ReportContentModal
        isOpen={Boolean(postToReport)}
        reporterId={currentUser.id}
        targetType="post"
        targetId={postToReport?.id || 0}
        targetAuthorId={postToReport?.userId || null}
        targetLabel={postToReport ? `${postToReport.fullName}'s post` : undefined}
        onClose={() => setPostToReport(null)}
        onSubmitted={(msg) => showToast(msg)}
      />

      {/* PHASE 6: CONFIRM BLOCK AUTHOR MODAL */}
      {userToBlock && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <ShieldBan className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Block {userToBlock.fullName}?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Their posts, comments, and notifications will be hidden from your Quad experience, and any existing connection or follow will be removed. You can unblock them anytime in Profile Settings.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setUserToBlock(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBlockUser}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer"
              >
                Block Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL-SCREEN LIGHTBOX MODAL FOR ATTACHED MEDIA */}
      <PostLightboxModal
        isOpen={lightboxState.isOpen}
        images={lightboxState.images}
        initialIndex={lightboxState.initialIndex}
        onClose={() => setLightboxState({ ...lightboxState, isOpen: false })}
        postAuthor={lightboxState.postAuthor}
        postCaption={lightboxState.postCaption}
      />
    </div>
  );
};
