import React, { useState } from 'react';
import {
  Heart,
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
} from 'lucide-react';
import { PostItem } from '../types/post';
import { togglePostLike, addComment, toggleSavePost } from '../services/postService';
import { LinkPreview } from './LinkPreview';
import { PostMediaCarousel } from './PostMediaCarousel';

interface PostCardProps {
  post: PostItem;
  currentUserId?: number;
  currentUserName?: string;
  currentUserAvatar?: string;
  onPostUpdated?: (updated: PostItem) => void;
}

export const PostCard: React.FC<PostCardProps> = ({
  post,
  currentUserId,
  currentUserName = 'SZMC Alumnus',
  currentUserAvatar = '/assets/aistudio/images__1__2778177d.png',
  onPostUpdated,
}) => {
  const [liked, setLiked] = useState(post.likedByMe ?? false);
  const [likesCount, setLikesCount] = useState(post.likesCount || post.likes || 0);
  const [saved, setSaved] = useState(post.isSaved ?? false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState(post.comments || post.commentsList || []);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const handleLike = async () => {
    if (!currentUserId) return;
    const nextState = !liked;
    const nextCount = nextState ? likesCount + 1 : Math.max(0, likesCount - 1);
    setLiked(nextState);
    setLikesCount(nextCount);

    if (onPostUpdated) {
      onPostUpdated({
        ...post,
        likedByMe: nextState,
        likesCount: nextCount,
        liked: nextState,
        likes: nextCount,
      });
    }

    await togglePostLike(post.id, currentUserId);
  };

  const handleSave = async () => {
    if (!currentUserId) return;
    const nextSaved = !saved;
    setSaved(nextSaved);
    if (onPostUpdated) {
      onPostUpdated({ ...post, isSaved: nextSaved });
    }
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
    } catch {
      // fallback
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !currentUserId) return;

    setSubmittingComment(true);
    const ok = await addComment(post.id, currentUserId, commentText.trim());
    if (ok) {
      const newComment = {
        id: Date.now(),
        postId: post.id,
        userId: currentUserId,
        fullName: currentUserName,
        avatarUrl: currentUserAvatar,
        content: commentText.trim(),
        likesCount: 0,
        likedByMe: false,
        createdAt: 'Just now',
      };
      const updatedList = [...comments, newComment];
      setComments(updatedList);
      setCommentText('');
      if (onPostUpdated) {
        onPostUpdated({
          ...post,
          commentsCount: (post.commentsCount || 0) + 1,
          comments: updatedList,
          commentsList: updatedList,
        });
      }
    }
    setSubmittingComment(false);
  };

  const images = Array.isArray(post.images) ? post.images.filter(Boolean) : [];

  return (
    <>
      <div
        id={`post-${post.id}`}
        className="w-full bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs mb-3.5 sm:mb-4 transition-all hover:border-slate-300 dark:hover:border-slate-700"
      >
        {/* Pinned Announcement Badge */}
        {post.pinned && (
          <div className="px-3.5 sm:px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-[11px] font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
            <Pin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Pinned Official Announcement</span>
          </div>
        )}

        {/* Author Header */}
        <div className="p-3.5 sm:p-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <img
              src={post.avatarUrl || post.authorAvatar || '/assets/aistudio/images__1__2778177d.png'}
              alt={post.fullName || post.author || 'Alumnus'}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shadow-xs shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                  {post.fullName || post.author || 'SZMC Alumnus'}
                </span>
                {post.verified && (
                  <span title="Verified Alumnus / Doctor" className="shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 fill-emerald-500/20" />
                  </span>
                )}
                {(post.batchYear || post.authorBatch) && (
                  <span className="px-2 py-0.5 rounded-full text-[9.5px] sm:text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    Batch {post.batchYear || post.authorBatch}
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
              <div className="text-[11px] text-slate-400 truncate">
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
                {post.isEdited && <span className="ml-1 text-[10px] italic">(edited)</span>}
              </div>
            </div>
          </div>

          <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 shrink-0">
            {post.category || 'General'}
          </span>
        </div>

        {/* Post Text */}
        <div className="px-3.5 sm:px-4 pb-2 text-[13.5px] sm:text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed">
          {post.content}
        </div>

        {/* Embedded Link / YouTube / Facebook Preview */}
        {post.linked_url && (
          <div className="px-4">
            <LinkPreview url={post.linked_url} data={post.link_metadata} />
          </div>
        )}

        {/* Multi-Image & Video Carousel with Layout Templates */}
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

        {/* Action Buttons: Clean Facebook-style Icon-Only Bar */}
        <div className="px-3.5 sm:px-4 py-2 mt-1 flex items-center justify-between sm:justify-start gap-1 sm:gap-2 border-t border-slate-100 dark:border-slate-800/80">
          {/* Like Button */}
          <button
            type="button"
            onClick={handleLike}
            aria-label={liked ? 'Unlike' : 'Like'}
            title={liked ? 'Liked' : 'Like'}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2 px-2.5 sm:px-3.5 rounded-xl sm:rounded-full text-xs font-bold transition-all active:scale-90 cursor-pointer ${
              liked
                ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900/50 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800/80'
            }`}
          >
            <Heart
              className={`w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0 transition-transform ${
                liked ? 'fill-rose-500 text-rose-500 scale-110' : ''
              }`}
            />
            {likesCount > 0 && (
              <span className="text-xs font-bold leading-none">
                {likesCount}
              </span>
            )}
          </button>

          {/* Comment Toggle */}
          <button
            type="button"
            onClick={() => setShowComments(!showComments)}
            aria-label="Comments"
            title="Comments"
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2 px-2.5 sm:px-3.5 rounded-xl sm:rounded-full text-xs font-bold transition-all active:scale-90 cursor-pointer ${
              showComments
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-200 dark:ring-blue-900/50 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800/80'
            }`}
          >
            <MessageCircle className="w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0" />
            {comments.length > 0 && (
              <span className="text-xs font-bold leading-none">
                {comments.length}
              </span>
            )}
          </button>

          {/* Save Button */}
          <button
            type="button"
            onClick={handleSave}
            aria-label={saved ? 'Remove from saved' : 'Save post'}
            title={saved ? 'Saved' : 'Save'}
            className={`flex-1 sm:flex-initial flex items-center justify-center py-2 px-2.5 sm:px-3.5 rounded-xl sm:rounded-full text-xs font-bold transition-all active:scale-90 cursor-pointer ${
              saved
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-200 dark:ring-blue-900/50 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800/80'
            }`}
          >
            {saved ? (
              <BookmarkCheck className="w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0 fill-current text-blue-600 dark:text-blue-400" />
            ) : (
              <Bookmark className="w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0" />
            )}
          </button>

          {/* Share Button */}
          <button
            type="button"
            onClick={handleShare}
            aria-label="Share post"
            title={copiedLink ? 'Copied link' : 'Share'}
            className={`flex-1 sm:flex-initial flex items-center justify-center py-2 px-2.5 sm:px-3.5 rounded-xl sm:rounded-full text-xs font-bold transition-all active:scale-90 cursor-pointer ${
              copiedLink
                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 ring-1 ring-emerald-200 dark:ring-emerald-900/50 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800/80'
            }`}
          >
            {copiedLink ? (
              <Check className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <Share2 className="w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0" />
            )}
          </button>
        </div>

        {/* Comment Drawer */}
        {showComments && (
          <div className="bg-slate-50/70 dark:bg-slate-900/40 p-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            {comments.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-2">No comments yet. Start the conversation!</p>
            ) : (
              comments.map((c: any) => (
                <div key={c.id} className="flex gap-2.5 items-start text-xs">
                  <img
                    src={c.avatarUrl || '/assets/aistudio/images__1__2778177d.png'}
                    alt={c.fullName || 'Commenter'}
                    className="w-7 h-7 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                  />
                  <div className="bg-white dark:bg-slate-800 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-sm flex-1">
                    <span className="font-bold text-slate-900 dark:text-slate-100 mr-1.5">
                      {c.fullName || 'Alumnus'}
                    </span>
                    <span className="text-slate-700 dark:text-slate-300 break-words">{c.content}</span>
                  </div>
                </div>
              ))
            )}

            {/* Add comment input */}
            <form onSubmit={handleAddComment} className="flex gap-2 pt-2">
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
