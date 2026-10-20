import React from 'react';
import { Sparkles, X, ChevronRight } from 'lucide-react';

interface MentorshipCelebrationBannerProps {
  type: 'request' | 'offer';
  title: string;
  message: string;
  snippet?: string;
  onDismiss: () => void;
  onActionClick?: () => void;
  actionText?: string;
}

export const MentorshipCelebrationBanner: React.FC<MentorshipCelebrationBannerProps> = ({
  type,
  title,
  message,
  snippet,
  onDismiss,
  onActionClick,
  actionText,
}) => {
  const isRequest = type === 'request';

  return (
    <div
      role="alert"
      className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 shadow-lg transition-all animate-in fade-in duration-300 ${
        isRequest
          ? 'bg-gradient-to-r from-amber-50 via-amber-100/50 to-orange-50 dark:from-amber-950/40 dark:via-slate-900 dark:to-amber-900/20 border-amber-300 dark:border-amber-700/60 shadow-amber-500/10'
          : 'bg-gradient-to-r from-emerald-50 via-emerald-100/50 to-teal-50 dark:from-emerald-950/40 dark:via-slate-900 dark:to-emerald-900/20 border-emerald-300 dark:border-emerald-700/60 shadow-emerald-500/10'
      }`}
    >
      <div className="relative z-10 flex items-start gap-3 sm:gap-4">
        {/* Animated Badge */}
        <div className="relative shrink-0 mt-0.5">
          <div
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shadow-md ${
              isRequest
                ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-amber-500/30'
                : 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-500/30'
            }`}
          >
            <Sparkles className="w-6 h-6 text-white" />
          </div>
        </div>

        {/* Content & Snippet */}
        <div className="flex-1 min-w-0 pr-6">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className={`text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isRequest
                  ? 'bg-amber-200/80 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200'
                  : 'bg-emerald-200/80 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200'
              }`}
            >
              {isRequest ? '🎉 অনুরোধ সফল' : '🌟 মেন্টর রেজিস্ট্রেশন সফল'}
            </span>
          </div>

          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug">
            {title}
          </h3>

          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
            {message}
          </p>

          {snippet && (
            <div className="mt-2.5 p-2.5 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 text-xs text-slate-800 dark:text-slate-200 italic line-clamp-2">
              "{snippet}"
            </div>
          )}

          {onActionClick && actionText && (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={onActionClick}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-all cursor-pointer ${
                  isRequest
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <span>{actionText}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Dismiss Button */}
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          title="বন্ধ করুন"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
