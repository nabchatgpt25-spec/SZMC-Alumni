import React, { useState } from 'react';
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Send,
  Pin,
  CheckCircle2,
  Check,
  X,
} from 'lucide-react';
import { PostItem } from '../types/post';
import { togglePostLike, addComment, toggleSavePost } from '../services/postService';
import { LinkPreview } from './LinkPreview';

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
        className="w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs mb-4 transition-all hover:border-slate-300 dark:hover:border-slate-700"
      >
        {/* Pinned Announcement Badge */}
        {post.pinned && (
          <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-[11px] font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
            <Pin className="w-3.5 h-3.5" />
            <span>Pinned Official Announcement</span>
          </div>
        )}

        {/* Author Header */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={post.avatarUrl || post.authorAvatar || '/assets/aistudio/images__1__2778177d.png'}
              alt={post.fullName || post.author || 'Alumnus'}
              className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shadow-xs"
            />
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-sm text-slate-900 dark:text-white">
                  {post.fullName || post.author || 'SZMC Alumnus'}
                </span>
                {post.verified && (
                  <span title="Verified Alumnus / Doctor">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 fill-emerald-500/20" />
                  </span>
                )}
                {(post.batchYear || post.authorBatch) && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    Batch {post.batchYear || post.authorBatch}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400">
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
                {post.isEdited && <span className="ml-1 text-[11px] italic">(edited)</span>}
              </div>
            </div>
          </div>

          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 shrink-0">
            {post.category || 'General Update'}
          </span>
        </div>

        {/* Post Text */}
        <div className="px-4 pb-2 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed">
          {post.content}
        </div>

        {/* Embedded Link / YouTube / Facebook Preview */}
        {post.linked_url && (
          <div className="px-4">
            <LinkPreview url={post.linked_url} data={post.link_metadata} />
          </div>
        )}

        {/* Multi-Image Gallery */}
        {images.length > 0 && (
          <div className="px-4 mt-2">
            {images.length === 1 && (
              <div
                onClick={() => setSelectedPhoto(images[0])}
                className="cursor-pointer overflow-hidden rounded-2xl max-h-[480px] bg-slate-950 flex items-center justify-center group"
              >
                <img
                  src={images[0]}
                  alt="post-media"
                  className="w-full h-full max-h-[480px] object-cover group-hover:scale-[1.01] transition-transform duration-300"
                />
              </div>
            )}

            {images.length === 2 && (
              <div className="grid grid-cols-2 gap-2">
                {images.map((img, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedPhoto(img)}
                    className="cursor-pointer aspect-square rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 group"
                  >
                    <img
                      src={img}
                      alt={`post-media-${i}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                ))}
              </div>
            )}

            {images.length === 3 && (
              <div className="grid grid-cols-3 gap-2">
                <div
                  onClick={() => setSelectedPhoto(images[0])}
                  className="col-span-2 cursor-pointer aspect-4/3 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 group"
                >
                  <img
                    src={images[0]}
                    alt="post-media-0"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  {images.slice(1, 3).map((img, i) => (
                    <div
                      key={i}
                      onClick={() => setSelectedPhoto(img)}
                      className="cursor-pointer flex-1 aspect-square rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 group"
                    >
                      <img
                        src={img}
                        alt={`post-media-${i + 1}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {images.length >= 4 && (
              <div className="grid grid-cols-2 gap-2">
                {images.slice(0, 4).map((img, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedPhoto(img)}
                    className="relative cursor-pointer aspect-square rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 group"
                  >
                    <img
                      src={img}
                      alt={`post-media-${i}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {i === 3 && images.length > 4 && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-black text-xl backdrop-blur-2xs">
                        +{images.length - 3} more
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Bar (Like, Comment, Save, Share) */}
        <div className="px-4 py-3 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-4">
            {/* Like Button */}
            <button
              onClick={handleLike}
              className={`flex items-center gap-1.5 transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 ${
                liked ? 'text-rose-500 font-bold' : 'hover:text-rose-500'
              }`}
            >
              <Heart className={`w-4 h-4 ${liked ? 'fill-rose-500 text-rose-500' : ''}`} />
              <span>{likesCount}</span>
            </button>

            {/* Comment Toggle */}
            <button
              onClick={() => setShowComments(!showComments)}
              className="flex items-center gap-1.5 hover:text-blue-500 transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{comments.length}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className={`cursor-pointer p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-500 transition-colors ${
                saved ? 'text-blue-600 dark:text-blue-400 font-bold' : ''
              }`}
              title={saved ? 'Remove Bookmark' : 'Save Post'}
            >
              <Bookmark className={`w-4 h-4 ${saved ? 'fill-current' : ''}`} />
            </button>

            <button
              onClick={handleShare}
              className="cursor-pointer p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-500 transition-colors flex items-center gap-1"
              title="Copy direct post link"
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 text-emerald-500" />
                  <span className="text-[11px] text-emerald-600 font-bold">Copied</span>
                </>
              ) : (
                <Share2 className="w-4 h-4" />
              )}
            </button>
          </div>
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
