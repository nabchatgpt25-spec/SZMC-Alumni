import React, { useState } from 'react';
import { X, Repeat2, Loader2 } from 'lucide-react';
import type { PostAudience, PostItem } from '../../types/post';
import { POST_AUDIENCE_OPTIONS } from '../../services/feedRankingService';
import { createPost } from '../../services/postService';
import { createNotificationInDb } from '../../services/supabaseNotificationService';

interface RepostModalProps {
  isOpen: boolean;
  targetPost: PostItem | null;
  authorId: number;
  authorName: string;
  authorAvatar: string;
  onClose: () => void;
  onRepostCreated: (newPost: PostItem, originalPostId: number) => void;
}

export const RepostModal: React.FC<RepostModalProps> = ({
  isOpen,
  targetPost,
  authorId,
  authorName,
  authorAvatar,
  onClose,
  onRepostCreated,
}) => {
  const [commentary, setCommentary] = useState('');
  const [audience, setAudience] = useState<PostAudience>('public');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !targetPost) return null;

  const original = targetPost.repostedPost || {
    id: targetPost.id,
    userId: targetPost.userId,
    fullName: targetPost.fullName || targetPost.author || 'SZMC Alumnus',
    avatarUrl: targetPost.avatarUrl || targetPost.authorAvatar || '/assets/aistudio/images__1__2778177d.png',
    batchYear: targetPost.batchYear || targetPost.authorBatch,
    content: targetPost.content || '',
    createdAt: targetPost.createdAt || new Date().toISOString(),
    images: targetPost.images || [],
    category: targetPost.communityCategory || targetPost.category,
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    const res = await createPost({
      authorId,
      content: commentary.trim() || `Reposted from ${original.fullName}`,
      category: original.category || 'General Discussion',
      communityCategory: original.category || 'General Discussion',
      audience,
      repostOfId: original.id,
      repostedPost: original,
    });

    setSubmitting(false);
    if (res.success && res.post) {
      if (original.userId && Number(original.userId) !== Number(authorId)) {
        void createNotificationInDb({
          recipientId: Number(original.userId),
          actorId: authorId,
          type: 'repost',
          title: 'Reposted your update',
          message: `${authorName} reposted your post on The Quad.`,
          targetRoute: 'feed',
          postId: res.post.id,
        });
      }

      onRepostCreated(
        {
          ...res.post,
          fullName: authorName,
          avatarUrl: authorAvatar,
          repostOfId: original.id,
          repostedPost: original,
        },
        targetPost.id
      );
      setCommentary('');
      onClose();
    } else {
      setErrorMsg(res.error || 'Could not publish repost. Please try again.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Repeat2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Repost to The Quad
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close repost modal"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={authorAvatar}
                alt={authorName}
                className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
              />
              <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                {authorName}
              </span>
            </div>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as PostAudience)}
              aria-label="Repost audience"
              className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {POST_AUDIENCE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <textarea
            rows={3}
            value={commentary}
            onChange={(e) => setCommentary(e.target.value)}
            placeholder="Add your thoughts or context (optional)..."
            className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />

          {/* Original Post Preview */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <img
                src={original.avatarUrl}
                alt={original.fullName}
                className="w-6 h-6 rounded-full object-cover"
              />
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {original.fullName}
              </span>
              {original.batchYear && (
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  · SZMC-{String(original.batchYear).padStart(2, '0')}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-4 whitespace-pre-line">
              {original.content}
            </p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50/70 dark:bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Repeat2 className="w-3.5 h-3.5" />
            )}
            <span>{submitting ? 'Reposting...' : 'Repost Now'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
