import React, { useState, useMemo } from 'react';
import {
  MessageCircle,
  Share2,
  Bookmark,
  BookmarkCheck,
  Send,
  Pin,
  CheckCircle2,
  Check,
  X,
  Sparkles,
  GraduationCap,
  UserCheck,
  Camera,
  Eye,
  ArrowRight,
  Repeat2,
  MoreHorizontal,
  Flag,
  ShieldBan,
} from 'lucide-react';
import { PostItem, ReactionType } from '../types/post';
import { addComment, toggleSavePost } from '../services/postService';
import { upsertPostReaction } from '../services/richInteractionsService';
import { buildCommentTree } from '../services/richInteractionsUtils';
import { usePostCommentsChannel } from '../hooks/useChannel';
import { LinkPreview } from './LinkPreview';
import { PostMediaCarousel } from './PostMediaCarousel';
import { ReactionPickerButton } from './community/ReactionPickerButton';
import { RichTextWithMentions } from './community/RichTextWithMentions';
import { InlinePostPollCard } from './community/InlinePostPollCard';
import { RepostModal } from './community/RepostModal';
import { ReportContentModal } from './community/SafetyActionModal';
import { blockUser } from '../services/communitySafetyService';

interface PostCardProps {
  post: PostItem;
  currentUserId?: number;
  currentUserName?: string;
  currentUserAvatar?: string;
  onPostUpdated?: (updated: PostItem) => void;
  onRepostCreated?: (newPost: PostItem) => void;
  onAuthorBlocked?: (blockedUserId: number) => void;
  onNavigateToAlbum?: (albumId: number) => void;
  onViewProfile?: (userId: number) => void;
}

export const PostCard: React.FC<PostCardProps> = ({
  post,
  currentUserId,
  currentUserName = 'SZMC Alumnus',
  currentUserAvatar = '/assets/aistudio/images__1__2778177d.png',
  onPostUpdated,
  onRepostCreated,
  onAuthorBlocked,
  onNavigateToAlbum,
  onViewProfile,
}) => {
  const [liked, setLiked] = useState(post.likedByMe ?? false);
  const [userReaction, setUserReaction] = useState<ReactionType | null>(
    post.userReaction || (post.likedByMe ? 'love' : null)
  );
  const [likesCount, setLikesCount] = useState(post.likesCount || post.likes || 0);
  const [reactionsSummary, setReactionsSummary] = useState<Partial<Record<ReactionType, number>>>(
    post.reactionsSummary || {}
  );
  const [repostCount, setRepostCount] = useState(post.repostCount || post.shares || 0);
  const [repostModalOpen, setRepostModalOpen] = useState(false);
  const [safetyMenuOpen, setSafetyMenuOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [isAuthorBlocked, setIsAuthorBlocked] = useState(false);
  const [safetyFeedback, setSafetyFeedback] = useState<string | null>(null);
  const [saved, setSaved] = useState(post.isSaved ?? false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState(post.comments || post.commentsList || []);
  const [commentText, setCommentText] = useState('');
  const [replyingToId, setReplyingToId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const threadedComments = useMemo(() => buildCommentTree(comments), [comments]);

  usePostCommentsChannel({
    postId: post.id,
    currentUserId,
    onCommentInserted: (incomingComment) => {
      setComments((prev) => {
        if (prev.some((c: any) => Number(c.id) === Number(incomingComment.id))) {
          return prev;
        }
        const optIdx = prev.findIndex(
          (c: any) =>
            Number(c.id) > 1_700_000_000_000 &&
            String(c.content || '').trim() === incomingComment.content.trim()
        );
        const nextList =
          optIdx !== -1
            ? prev.map((c: any, idx: number) => (idx === optIdx ? { ...c, ...incomingComment } : c))
            : [...prev, incomingComment];
        if (onPostUpdated) {
          onPostUpdated({
            ...post,
            commentsCount: Math.max((post.commentsCount || 0) + 1, nextList.length),
            comments: nextList,
            commentsList: nextList,
          });
        }
        return nextList;
      });
    },
    onCommentDeleted: (deletedId) => {
      setComments((prev) => prev.filter((c: any) => Number(c.id) !== Number(deletedId)));
    },
  });

  const handleReact = async (nextReaction: ReactionType | null) => {
    if (!currentUserId) return;
    const prevReaction = userReaction;
    const nextLiked = Boolean(nextReaction);
    let nextCount = likesCount;
    if (!prevReaction && nextReaction) nextCount += 1;
    else if (prevReaction && !nextReaction) nextCount = Math.max(0, nextCount - 1);

    const nextSummary: Partial<Record<ReactionType, number>> = { ...reactionsSummary };
    if (prevReaction && nextSummary[prevReaction]) {
      nextSummary[prevReaction] = Math.max(0, Number(nextSummary[prevReaction]) - 1);
      if (nextSummary[prevReaction] === 0) delete nextSummary[prevReaction];
    }
    if (nextReaction) {
      nextSummary[nextReaction] = (Number(nextSummary[nextReaction]) || 0) + 1;
    }

    setLiked(nextLiked);
    setUserReaction(nextReaction);
    setLikesCount(nextCount);
    setReactionsSummary(nextSummary);

    onPostUpdated?.({
      ...post,
      likedByMe: nextLiked,
      userReaction: nextReaction,
      reactionsSummary: nextSummary,
      likesCount: nextCount,
      liked: nextLiked,
      likes: nextCount,
    });

    await upsertPostReaction({
      postId: post.id,
      userId: currentUserId,
      reaction: nextReaction,
      reactorName: currentUserName,
    });
  };

  const handleSave = async () => {
    if (!currentUserId) return;
    const nextSaved = !saved;
    setSaved(nextSaved);
    onPostUpdated?.({ ...post, isSaved: nextSaved });
    await toggleSavePost(post.id, currentUserId);
  };

  const handleShare = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('post', String(post.id));
      url.hash = `post-${post.id}`;
      navigator.clipboard?.writeText(url.toString());
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  };

  const handleAddComment = async (e: React.FormEvent, parentId: number | null = null) => {
    e.preventDefault();
    const raw = parentId ? replyText : commentText;
    if (!raw.trim() || !currentUserId) return;

    const cleanText = raw.trim();
    const tempId = Date.now();
    const newComment = {
      id: tempId,
      postId: post.id,
      userId: currentUserId,
      parentCommentId: parentId,
      fullName: currentUserName,
      avatarUrl: currentUserAvatar,
      content: cleanText,
      likesCount: 0,
      likedByMe: false,
      createdAt: new Date().toISOString(),
    };

    const updatedList = [...comments, newComment];
    setComments(updatedList);
    if (parentId) {
      setReplyText('');
      setReplyingToId(null);
    } else {
      setCommentText('');
    }
    onPostUpdated?.({
      ...post,
      commentsCount: Math.max((post.commentsCount || 0) + 1, updatedList.length),
      comments: updatedList,
      commentsList: updatedList,
    });

    setSubmittingComment(true);
    await addComment(post.id, currentUserId, cleanText, currentUserName, currentUserAvatar, parentId);
    setSubmittingComment(false);
  };

  const images = Array.isArray(post.images) ? post.images.filter(Boolean) : [];
  const albumRefMatch = post.content?.match(/\[szmc_album_ref:([0-9]+)\]/);
  const albumId = post.albumId ? Number(post.albumId) : (albumRefMatch ? Number(albumRefMatch[1]) : null);
  const cleanContent = post.content?.replace(/\[szmc_album_ref:[0-9]+\]/g, '').trim() || '';

  if (isAuthorBlocked) return null;

  const canShowSafetyActions = Boolean(
    currentUserId && post.userId && Number(currentUserId) !== Number(post.userId)
  );

  const handleBlockAuthor = async () => {
    if (!currentUserId || !post.userId) return;
    setSafetyMenuOpen(false);
    const res = await blockUser({
      blockerId: currentUserId,
      blockedUser: {
        id: Number(post.userId),
        fullName: post.fullName || post.author || 'SZMC Alumnus',
        avatarUrl: post.avatarUrl || post.authorAvatar,
        batchYear: post.batchYear || post.authorBatch,
        profession: post.profession,
      },
    });
    if (res.success) {
      setIsAuthorBlocked(true);
      onAuthorBlocked?.(Number(post.userId));
    }
  };

  return (
    <>
      <div
        id={`post-${post.id}`}
        className="w-full bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs mb-3.5 sm:mb-4 transition-all hover:border-slate-300 dark:hover:border-slate-700"
      >
        {safetyFeedback && (
          <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200/70 dark:border-emerald-800/60 text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center justify-between gap-2">
            <span>{safetyFeedback}</span>
            <button
              type="button"
              onClick={() => setSafetyFeedback(null)}
              className="text-emerald-600 hover:text-emerald-800 cursor-pointer"
              aria-label="Dismiss notice"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {/* Dedicated Priority Placement Headers */}
        {(post.priorityTier === 3 || post.priorityLevel === 3 || post.communityCategory === 'Blood Request') ? (
          <div className="px-3.5 sm:px-4 py-2 bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200/80 dark:border-rose-800/70 text-[11px] font-semibold text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2">
            <span className="truncate">Urgent Blood Request · Priority Lifeline Placement</span>
          </div>
        ) : (post.pinned || post.isOfficial || post.priorityTier === 2) ? (
          <div className="px-3.5 sm:px-4 py-2 bg-blue-50/80 dark:bg-blue-950/40 border-b border-blue-200/80 dark:border-blue-800/70 text-[11px] font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
            <Pin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {post.officialPageName
                ? `Official Announcement · ${post.officialPageName}`
                : 'Official Announcement'}
            </span>
          </div>
        ) : post.isFeatured ? (
          <div className="px-3.5 sm:px-4 py-2 bg-amber-50/80 dark:bg-amber-950/30 border-b border-amber-200/70 dark:border-amber-800/60 text-[11px] font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Featured Community Post</span>
          </div>
        ) : null}

        {/* Author Header */}
        <div className="p-3.5 sm:p-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => onViewProfile?.(post.userId)}
              className="shrink-0 cursor-pointer"
            >
              <img
                src={post.avatarUrl || post.authorAvatar || '/assets/aistudio/images__1__2778177d.png'}
                alt={post.fullName || post.author || 'Alumnus'}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shadow-xs"
              />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => onViewProfile?.(post.userId)}
                  className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 truncate cursor-pointer"
                >
                  {post.fullName || post.author || 'SZMC Alumnus'}
                </button>
                {post.verified && (
                  <span title="Verified Alumnus / Doctor" className="shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 fill-emerald-500/20" />
                  </span>
                )}
                {(post.batchYear || post.authorBatch) && (
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    · SZMC-{String(post.batchYear || post.authorBatch).padStart(2, '0')}
                  </span>
                )}
                {post.isBatchmate && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    · <GraduationCap className="w-3 h-3" /> Batchmate
                  </span>
                )}
                {post.isFriend && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                    · <UserCheck className="w-3 h-3" /> Connected
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {post.profession ? `${post.profession} · ` : ''}
                {post.createdAt ? (
                  new Date(post.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                ) : (
                  'Recently'
                )}
                {post.audience && post.audience !== 'public' && (
                  <span className="ml-1">
                    · {post.audience === 'my_batch' ? 'Batch Only' : post.audience === 'connections' ? 'Connections' : 'Alumni Only'}
                  </span>
                )}
                {post.batchLoungeYear && (
                  <span className="ml-1 font-medium text-blue-600 dark:text-blue-400">
                    · SZMC-{String(post.batchLoungeYear).padStart(2, '0')} Lounge
                  </span>
                )}
                {post.isEdited && <span className="ml-1 text-[10px] italic">(edited)</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 relative">
            <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
              {post.communityCategory || post.category || 'General Discussion'}
            </span>
            {canShowSafetyActions && (
              <>
                <button
                  type="button"
                  onClick={() => setSafetyMenuOpen((prev) => !prev)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  aria-label="Post safety options"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {safetyMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-44 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl py-1 z-30 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => {
                        setSafetyMenuOpen(false);
                        setReportModalOpen(true);
                      }}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer"
                    >
                      <Flag className="w-3.5 h-3.5" />
                      <span>Report Post</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleBlockAuthor}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    >
                      <ShieldBan className="w-3.5 h-3.5" />
                      <span>Block Author</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Post Text with safe @mentions and clickable URLs */}
        {cleanContent && (
          <div className="px-3.5 sm:px-4 pb-2 text-[13.5px] sm:text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed">
            <RichTextWithMentions text={cleanContent} />
          </div>
        )}

        {/* Quoted / Reposted Post Preview */}
        {post.repostedPost && (
          <div className="mx-3.5 sm:mx-4 mb-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <Repeat2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <img
                src={post.repostedPost.avatarUrl}
                alt={post.repostedPost.fullName}
                className="w-5 h-5 rounded-full object-cover shrink-0"
              />
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {post.repostedPost.fullName}
              </span>
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

        {/* Inline Post Poll */}
        {post.poll && (
          <div className="px-3.5 sm:px-4">
            <InlinePostPollCard
              poll={post.poll}
              currentUserId={currentUserId}
              onPollUpdated={(updatedPoll) => onPostUpdated?.({ ...post, poll: updatedPoll })}
            />
          </div>
        )}

        {/* Interactive Photo Album Showcase Banner */}
        {albumId && (
          <div className="mx-3.5 sm:mx-4 mb-3 p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-blue-50/90 via-indigo-50/80 to-sky-50/90 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-sky-950/40 border border-blue-200/90 dark:border-blue-800/70 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20">
                <Camera className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                    Photo Album
                  </span>
                  {images.length > 0 && (
                    <span className="text-[11px] text-slate-600 dark:text-slate-300">
                      · {images.length} {images.length === 1 ? 'Photograph' : 'Photographs'}
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate mt-0.5">
                  {post.albumTitle ||
                    (post.content.includes('Added a new photo album:')
                      ? post.content.split('Added a new photo album:')[1]?.split('\n')[0]?.replace(/["“]/g, '').trim()
                      : 'SZMC Campus & Memories Archive')}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (onNavigateToAlbum) {
                  onNavigateToAlbum(albumId);
                } else {
                  window.location.hash = `album-${albumId}`;
                  window.dispatchEvent(new HashChangeEvent('hashchange'));
                }
              }}
              className="btn-interactive inline-flex items-center justify-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs sm:text-sm font-bold shadow-md shadow-blue-500/25 cursor-pointer transition-all self-start sm:self-auto shrink-0 group"
            >
              <Eye className="w-4 h-4 text-blue-100 group-hover:scale-110 transition-transform" />
              <span>See Album</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        )}

        {/* Embedded Link Preview */}
        {post.linked_url && (
          <div className="px-4">
            <LinkPreview url={post.linked_url} data={post.link_metadata} />
          </div>
        )}

        {/* Multi-Image & Video Carousel */}
        {((images.length > 0) || (post.videos && post.videos.length > 0)) && (
          <div className="px-3.5 sm:px-4 mt-2">
            <PostMediaCarousel
              images={images}
              videos={post.videos}
              layout={post.layout_template || (images.length > 1 ? 'carousel' : 'grid')}
              onPhotoClick={(idx) => setSelectedPhoto(images[idx] || images[0])}
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="px-3.5 sm:px-4 py-2 mt-1 flex items-center justify-between sm:justify-start gap-1 sm:gap-2 border-t border-slate-100 dark:border-slate-800/80">
          <ReactionPickerButton
            likedByMe={liked}
            userReaction={userReaction}
            likesCount={likesCount}
            reactionsSummary={reactionsSummary}
            disabled={!currentUserId}
            onReact={handleReact}
          />

          <button
            type="button"
            onClick={() => setShowComments(!showComments)}
            aria-label="Comments"
            title="Comments"
            className={`flex-1 sm:flex-initial min-h-[38px] flex items-center justify-center gap-1.5 py-2 px-2.5 sm:px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              showComments
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-200 dark:ring-blue-900/50'
                : 'text-slate-600 dark:text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800/80'
            }`}
          >
            <MessageCircle className="w-4 h-4 shrink-0" />
            {comments.length > 0 && (
              <span className="text-xs font-mono tabular-nums leading-none">
                {comments.length}
              </span>
            )}
          </button>

          {currentUserId && (
            <button
              type="button"
              onClick={() => setRepostModalOpen(true)}
              aria-label="Repost"
              title="Repost to The Quad"
              className="flex-1 sm:flex-initial min-h-[38px] flex items-center justify-center gap-1.5 py-2 px-2.5 sm:px-3.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Repeat2 className="w-4 h-4 shrink-0" />
              {repostCount > 0 && (
                <span className="text-xs font-mono tabular-nums leading-none">
                  {repostCount}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            aria-label={saved ? 'Remove from saved' : 'Save post'}
            title={saved ? 'Saved' : 'Save'}
            className={`flex-1 sm:flex-initial min-h-[38px] flex items-center justify-center py-2 px-2.5 sm:px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
              saved
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-200 dark:ring-blue-900/50'
                : 'text-slate-600 dark:text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800/80'
            }`}
          >
            {saved ? (
              <BookmarkCheck className="w-4 h-4 shrink-0 fill-current text-blue-600 dark:text-blue-400" />
            ) : (
              <Bookmark className="w-4 h-4 shrink-0" />
            )}
          </button>

          <button
            type="button"
            onClick={handleShare}
            aria-label="Share post"
            title={copiedLink ? 'Copied link' : 'Share'}
            className={`flex-1 sm:flex-initial min-h-[38px] flex items-center justify-center py-2 px-2.5 sm:px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
              copiedLink
                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 ring-1 ring-emerald-200 dark:ring-emerald-900/50'
                : 'text-slate-600 dark:text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800/80'
            }`}
          >
            {copiedLink ? (
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <Share2 className="w-4 h-4 shrink-0" />
            )}
          </button>
        </div>

        {/* Nested Comments Drawer */}
        {showComments && (
          <div className="bg-slate-50/70 dark:bg-slate-900/40 p-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            {threadedComments.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-2">
                No comments yet. Start the conversation!
              </p>
            ) : (
              threadedComments.map((c) => (
                <div key={c.id} className="space-y-2">
                  <div className="flex gap-2.5 items-start text-xs">
                    <img
                      src={c.avatarUrl || '/assets/aistudio/images__1__2778177d.png'}
                      alt={c.fullName || 'Commenter'}
                      className="w-7 h-7 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="bg-white dark:bg-slate-800 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 inline-block max-w-full">
                        <span className="font-bold text-slate-900 dark:text-slate-100 mr-1.5">
                          {c.fullName || 'Alumnus'}
                        </span>
                        <span className="text-slate-700 dark:text-slate-300 break-words">
                          <RichTextWithMentions text={c.content} />
                        </span>
                      </div>
                      {currentUserId && (
                        <div className="mt-1 pl-2 flex items-center gap-3 text-[11px] text-slate-500">
                          <button
                            type="button"
                            onClick={() =>
                              setReplyingToId(replyingToId === c.id ? null : c.id)
                            }
                            className="font-semibold hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                          >
                            Reply
                          </button>
                        </div>
                      )}

                      {/* Nested Replies */}
                      {c.replies && c.replies.length > 0 && (
                        <div className="mt-2 ml-4 space-y-2 pl-3 border-l border-slate-200 dark:border-slate-700">
                          {c.replies.map((reply) => (
                            <div key={reply.id} className="flex gap-2 items-start text-xs">
                              <img
                                src={reply.avatarUrl || '/assets/aistudio/images__1__2778177d.png'}
                                alt={reply.fullName || 'Alumnus'}
                                className="w-6 h-6 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                              />
                              <div className="bg-white dark:bg-slate-800 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 inline-block max-w-full">
                                <span className="font-bold text-slate-900 dark:text-slate-100 mr-1.5">
                                  {reply.fullName || 'Alumnus'}
                                </span>
                                <span className="text-slate-700 dark:text-slate-300 break-words">
                                  <RichTextWithMentions text={reply.content} />
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Inline Reply Form */}
                      {replyingToId === c.id && (
                        <form
                          onSubmit={(e) => handleAddComment(e, c.id)}
                          className="flex gap-2 mt-2 ml-4"
                        >
                          <input
                            type="text"
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder={`Reply to ${c.fullName.split(' ')[0]}...`}
                            className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <button
                            type="submit"
                            disabled={submittingComment || !replyText.trim()}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold disabled:opacity-50 cursor-pointer"
                          >
                            <Send className="w-3 h-3" />
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}

            {/* Add top-level comment */}
            <form onSubmit={(e) => handleAddComment(e, null)} className="flex gap-2 pt-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment..."
                className="flex-1 px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={submittingComment || !commentText.trim()}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center cursor-pointer transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Repost & Report Modals */}
      {currentUserId && (
        <>
          <RepostModal
            isOpen={repostModalOpen}
            targetPost={post}
            authorId={currentUserId}
            authorName={currentUserName}
            authorAvatar={currentUserAvatar}
            onClose={() => setRepostModalOpen(false)}
            onRepostCreated={(newPost) => {
              setRepostCount((c) => c + 1);
              onRepostCreated?.(newPost);
            }}
          />
          <ReportContentModal
            isOpen={reportModalOpen}
            reporterId={currentUserId}
            targetType="post"
            targetId={post.id}
            targetAuthorId={post.userId || null}
            targetLabel={`${post.fullName || post.author || 'this alumnus'}'s post`}
            onClose={() => setReportModalOpen(false)}
            onSubmitted={(msg) => setSafetyFeedback(msg)}
          />
        </>
      )}

      {/* Full Photo Lightbox Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
          onClick={() => setSelectedPhoto(null)}
        >
          <button
            onClick={() => setSelectedPhoto(null)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full cursor-pointer transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={selectedPhoto}
            alt="Full size view"
            className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};
