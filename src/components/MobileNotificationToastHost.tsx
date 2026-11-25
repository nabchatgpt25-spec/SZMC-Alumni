import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AtSign,
  BadgeCheck,
  Bell,
  Briefcase,
  Check,
  Droplet,
  GraduationCap,
  Heart,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Pin,
  PinOff,
  Repeat2,
  Send,
  ShieldAlert,
  ShieldCheck,
  ThumbsUp,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import type { ChatConversation, UserMessageSettings } from '../types/messaging';
import type { NotificationType } from '../types/notification.types';
import {
  getUserMessageSettings,
  listConversations,
  markConversationRead,
  sendMessage,
  subscribeToConversationChanges,
  subscribeToMessageChanges,
} from '../services/messagingService';
import { realtimeManager } from '../services/supabaseRealtimeService';
import {
  isSoundEnabledForUser,
  markNotificationReadInDb,
  normalizeNotificationType,
} from '../services/supabaseNotificationService';
import { fetchBlockedUserIds } from '../services/communitySafetyService';
import { fetchAlumniProfileByIdFromDb } from '../services/supabaseService';
import { formatStructuredPreview } from '../utils/structuredChat';
import {
  isConversationActivelyViewed,
  MobileToastPayload,
  playNotificationChimeOnce,
  subscribeDismissConversationToasts,
  subscribeMobileToast,
} from '../utils/mobileToastBus';

interface ActiveMobileToast extends MobileToastPayload {
  id: string;
  receivedAt: number;
  durationMs: number;
  exiting?: boolean;
  pinned?: boolean;
}

interface MobileNotificationToastHostProps {
  currentUserId: number;
  messagingProfileId?: number | null;
  onNavigate: (route: string) => void;
  onOpenConversation: (conversationId: string) => void;
}

const MAX_VISIBLE_TOASTS = 3;
const STANDARD_DURATION_MS = 6500;
const URGENT_DURATION_MS = 11000;
const EXIT_ANIMATION_MS = 240;

function getInAppNotificationPreference(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = localStorage.getItem('szmc_user_prefs');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.in_app_notifications === false) return false;
    }
  } catch {
    /* ignore */
  }
  return true;
}

function getInitials(name?: string): string {
  const clean = (name || '').trim();
  if (!clean) return 'SZ';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getCategoryLabel(type: NotificationType): string {
  switch (type) {
    case 'new_message':
      return 'Message';
    case 'post_like':
    case 'like':
      return 'Liked your post';
    case 'post_comment':
    case 'comment':
      return 'New comment';
    case 'post_reaction':
      return 'Reacted to your post';
    case 'mention':
      return 'Mentioned you';
    case 'repost':
      return 'Shared your post';
    case 'new_follower':
      return 'New follower';
    case 'connection_request':
      return 'Connection request';
    case 'connection_accepted':
      return 'Connection accepted';
    case 'blood_request':
    case 'blood':
      return 'Urgent blood alert';
    case 'batch_announcement':
      return 'Batch announcement';
    case 'official_announcement':
      return 'Official update';
    case 'mentorship':
      return 'Mentorship';
    case 'career':
      return 'Career update';
    case 'verification':
      return 'Verification';
    case 'moderation_action':
      return 'Account notice';
    default:
      return 'Notification';
  }
}

function getAccentBadgeClass(type: NotificationType): string {
  switch (type) {
    case 'new_message':
      return 'bg-gradient-to-b from-[#00A3FF] to-[#0084FF] text-white';
    case 'post_like':
    case 'like':
      return 'bg-gradient-to-b from-[#3B9BFF] to-[#1877F2] text-white';
    case 'post_comment':
    case 'comment':
      return 'bg-gradient-to-b from-[#45D17A] to-[#16A34A] text-white';
    case 'post_reaction':
      return 'bg-gradient-to-b from-[#FF6B81] to-[#E11D48] text-white';
    case 'mention':
      return 'bg-gradient-to-b from-[#3B82F6] to-[#1D4ED8] text-white';
    case 'repost':
      return 'bg-gradient-to-b from-[#2DD4BF] to-[#0D9488] text-white';
    case 'new_follower':
    case 'connection_request':
      return 'bg-gradient-to-b from-[#3B9BFF] to-[#1877F2] text-white';
    case 'connection_accepted':
      return 'bg-gradient-to-b from-[#34D399] to-[#059669] text-white';
    case 'blood_request':
    case 'blood':
      return 'bg-gradient-to-b from-[#FB7185] to-[#E11D48] text-white';
    case 'batch_announcement':
      return 'bg-gradient-to-b from-[#FBBF24] to-[#D97706] text-white';
    case 'official_announcement':
      return 'bg-gradient-to-b from-[#3B9BFF] to-[#1877F2] text-white';
    case 'mentorship':
      return 'bg-gradient-to-b from-[#F59E0B] to-[#D97706] text-white';
    case 'career':
      return 'bg-gradient-to-b from-[#34D399] to-[#059669] text-white';
    case 'moderation_action':
      return 'bg-gradient-to-b from-[#64748B] to-[#334155] text-white';
    default:
      return 'bg-gradient-to-b from-[#3B9BFF] to-[#1877F2] text-white';
  }
}

function getProgressBarClass(type: NotificationType): string {
  switch (type) {
    case 'new_message':
      return 'bg-[#0084FF]';
    case 'blood_request':
    case 'blood':
      return 'bg-[#E41E3F]';
    case 'post_comment':
    case 'comment':
    case 'connection_accepted':
    case 'career':
      return 'bg-emerald-600';
    case 'post_reaction':
      return 'bg-rose-500';
    case 'mentorship':
    case 'batch_announcement':
      return 'bg-amber-500';
    default:
      return 'bg-[#1877F2]';
  }
}

function renderToastIcon(type: NotificationType) {
  switch (type) {
    case 'new_message':
      return <MessageSquare className="w-2.5 h-2.5 fill-current" />;
    case 'post_like':
    case 'like':
      return <ThumbsUp className="w-2.5 h-2.5 fill-current" />;
    case 'post_comment':
    case 'comment':
      return <MessageCircle className="w-2.5 h-2.5 fill-current" />;
    case 'post_reaction':
      return <Heart className="w-2.5 h-2.5 fill-current" />;
    case 'mention':
      return <AtSign className="w-2.5 h-2.5" />;
    case 'repost':
      return <Repeat2 className="w-2.5 h-2.5" />;
    case 'new_follower':
    case 'connection_request':
      return <UserPlus className="w-2.5 h-2.5" />;
    case 'connection_accepted':
      return <UserCheck className="w-2.5 h-2.5" />;
    case 'blood_request':
    case 'blood':
      return <Droplet className="w-2.5 h-2.5 fill-current" />;
    case 'batch_announcement':
      return <Megaphone className="w-2.5 h-2.5" />;
    case 'official_announcement':
      return <BadgeCheck className="w-2.5 h-2.5" />;
    case 'mentorship':
      return <GraduationCap className="w-2.5 h-2.5" />;
    case 'career':
      return <Briefcase className="w-2.5 h-2.5" />;
    case 'moderation_action':
      return <ShieldAlert className="w-2.5 h-2.5" />;
    case 'verification':
      return <ShieldCheck className="w-2.5 h-2.5" />;
    default:
      return <Bell className="w-2.5 h-2.5" />;
  }
}

interface ToastBannerCardProps {
  toast: ActiveMobileToast;
  stackIndex: number;
  messagingSenderId: number;
  onDismiss: (id: string) => void;
  onTogglePin: (id: string) => void;
  onOpen: (toast: ActiveMobileToast) => void;
}

const ToastBannerCard: React.FC<ToastBannerCardProps> = ({
  toast,
  stackIndex,
  messagingSenderId,
  onDismiss,
  onTogglePin,
  onOpen,
}) => {
  const [isPaused, setIsPaused] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [avatarBroken, setAvatarBroken] = useState(false);

  // Swipe-up-to-dismiss gesture state (mimics iOS / Android banner flick)
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartYRef = useRef<number | null>(null);
  const didSwipeRef = useRef(false);

  // Pause-aware auto-dismiss timer
  const remainingRef = useRef<number>(toast.durationMs);
  const timerStartRef = useRef<number>(Date.now());
  const replyInputRef = useRef<HTMLInputElement>(null);

  const effectivelyPaused =
    isPaused || isReplying || isDragging || Boolean(toast.pinned) || Boolean(toast.exiting);

  useEffect(() => {
    if (effectivelyPaused) return;
    timerStartRef.current = Date.now();
    const timeoutId = window.setTimeout(() => {
      onDismiss(toast.id);
    }, Math.max(150, remainingRef.current));

    return () => {
      window.clearTimeout(timeoutId);
      const elapsed = Date.now() - timerStartRef.current;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    };
  }, [effectivelyPaused, toast.id, onDismiss]);

  useEffect(() => {
    if (isReplying) {
      requestAnimationFrame(() => replyInputRef.current?.focus());
    }
  }, [isReplying]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isReplying) return;
    touchStartYRef.current = e.touches[0]?.clientY ?? null;
    didSwipeRef.current = false;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartYRef.current === null) return;
    const currentY = e.touches[0]?.clientY ?? touchStartYRef.current;
    const deltaY = currentY - touchStartYRef.current;
    if (Math.abs(deltaY) > 6) {
      didSwipeRef.current = true;
    }
    if (deltaY < 0) {
      setDragOffsetY(deltaY);
    } else {
      // Gentle downward rubber-band resistance
      setDragOffsetY(Math.min(18, deltaY * 0.22));
    }
  };

  const handleTouchEnd = () => {
    if (touchStartYRef.current === null) return;
    touchStartYRef.current = null;
    setIsDragging(false);
    if (dragOffsetY <= -34) {
      onDismiss(toast.id);
    } else {
      setDragOffsetY(0);
    }
  };

  const handleQuickReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const clean = replyText.trim();
    if (!clean || !toast.conversationId || replySending) return;

    setReplySending(true);
    setReplyError(null);
    try {
      await sendMessage(toast.conversationId, messagingSenderId, clean);
      void markConversationRead(toast.conversationId, messagingSenderId);
      setReplySent(true);
      setReplyText('');
      window.setTimeout(() => {
        onDismiss(toast.id);
      }, 950);
    } catch (err: any) {
      setReplyError(err?.message || 'Could not send reply.');
    } finally {
      setReplySending(false);
    }
  };

  const handleCardActivate = () => {
    if (didSwipeRef.current || isReplying) return;
    onOpen(toast);
  };

  const canQuickReply = toast.type === 'new_message' && Boolean(toast.conversationId);
  const categoryText = toast.subtitle || getCategoryLabel(toast.type);
  const isUrgent = Boolean(toast.urgent || toast.type === 'blood_request' || toast.type === 'blood');

  // Subtle depth cue for stacked banners beneath the top card
  const stackScale = stackIndex === 0 ? 1 : stackIndex === 1 ? 0.975 : 0.95;
  const stackOpacity = stackIndex === 0 ? 1 : stackIndex === 1 ? 0.94 : 0.86;

  return (
    <div
      role={isUrgent ? 'alert' : 'status'}
      aria-live={isUrgent ? 'assertive' : 'polite'}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: isDragging
          ? `translate3d(0, ${dragOffsetY}px, 0) scale(${stackScale})`
          : stackScale < 1
          ? `scale(${stackScale})`
          : undefined,
        opacity: isDragging ? Math.max(0.35, 1 + dragOffsetY / 110) : stackOpacity,
      }}
      className={`mobile-toast-card pointer-events-auto relative w-full overflow-hidden rounded-2xl border backdrop-blur-xl transition-[transform,opacity] ${
        isDragging ? 'duration-0' : 'duration-200 ease-out'
      } ${
        toast.exiting ? 'mobile-toast-exit' : 'mobile-toast-enter'
      } ${
        isUrgent
          ? 'bg-white/95 dark:bg-slate-900/95 border-rose-300/80 dark:border-rose-500/40 shadow-[0_14px_38px_-10px_rgba(225,29,72,0.28)]'
          : 'bg-white/93 dark:bg-slate-900/93 border-slate-200/85 dark:border-slate-700/75 shadow-[0_14px_38px_-10px_rgba(15,23,42,0.24)] dark:shadow-[0_16px_40px_-10px_rgba(0,0,0,0.65)]'
      }`}
    >
      {/* Main Interactive Banner Body */}
      <div
        onClick={handleCardActivate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleCardActivate();
          }
        }}
        role="button"
        tabIndex={0}
        className="w-full text-left px-3.5 pt-3 pb-2.5 flex items-start gap-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/70"
      >
        {/* Left: Facebook-Style Circular Avatar + Corner Reaction/Action Circle */}
        <div className="relative shrink-0 mt-0.5">
          {toast.avatarUrl && !avatarBroken ? (
            <img
              src={toast.avatarUrl}
              alt={toast.actorName || toast.title}
              referrerPolicy="no-referrer"
              onError={() => setAvatarBroken(true)}
              className="w-11 h-11 rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10"
            />
          ) : (
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold ${
                isUrgent
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/90 dark:text-rose-200'
                  : toast.type === 'new_message'
                  ? 'bg-[#E7F3FF] text-[#1877F2] dark:bg-[#1877F2]/25 dark:text-[#4599FF]'
                  : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100'
              }`}
            >
              {getInitials(toast.actorName || toast.title)}
            </div>
          )}
          <span
            aria-hidden="true"
            className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-slate-900 shadow-xs ${getAccentBadgeClass(
              toast.type
            )}`}
          >
            {renderToastIcon(toast.type)}
          </span>
        </div>

        {/* Center: Facebook-Style Inline Bold Actor + Action & Unread Blue Timestamp */}
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] leading-snug text-slate-900 dark:text-slate-100 line-clamp-2">
            <span className="font-semibold text-slate-950 dark:text-white mr-1">
              {toast.title}
            </span>
            {toast.type !== 'new_message' && (
              <span className="text-slate-700 dark:text-slate-200">{categoryText}</span>
            )}
          </p>

          {toast.body && (
            <p className="text-[12.5px] text-slate-600 dark:text-slate-300 line-clamp-2 leading-snug mt-0.5">
              {toast.body}
            </p>
          )}

          <p className="text-[11px] font-semibold text-[#1877F2] dark:text-[#4599FF] mt-1 tabular-nums">
            Just now{toast.type === 'new_message' ? ` · ${categoryText}` : ''}{toast.pinned ? ' · Pinned' : ''}
          </p>
        </div>

        {/* Right: Pin & Dismiss Controls (accessible touch targets) */}
        <div
          className="flex items-center -mr-1.5 -mt-1 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => onTogglePin(toast.id)}
            aria-label={toast.pinned ? 'Unpin notification' : 'Keep notification visible'}
            title={toast.pinned ? 'Unpin' : 'Keep visible'}
            className={`min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center rounded-xl transition-colors cursor-pointer ${
              toast.pinned
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/80'
            }`}
          >
            {toast.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            title="Dismiss"
            className="min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Action Strip (Quick Reply for messages / Open link) */}
      {!isReplying && (
        <div className="px-3.5 pb-2 pt-0.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {canQuickReply && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsReplying(true);
                }}
                className="min-h-[32px] px-2.5 -ml-1 rounded-lg text-xs font-semibold text-[#0084FF] hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors cursor-pointer whitespace-nowrap"
              >
                Reply
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(toast);
              }}
              className={`min-h-[32px] px-2.5 ${
                canQuickReply ? '' : '-ml-1'
              } rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                isUrgent
                  ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/80'
              }`}
            >
              {canQuickReply ? 'Open chat' : 'View'}
            </button>
          </div>

          {/* Mobile swipe-up grab indicator */}
          <span
            aria-hidden="true"
            className="w-8 h-1 rounded-full bg-slate-300/80 dark:bg-slate-600/80 shrink-0"
          />
        </div>
      )}

      {/* Inline Mobile-Style Quick Reply Composer */}
      {isReplying && canQuickReply && (
        <form
          onSubmit={handleQuickReplySubmit}
          onClick={(e) => e.stopPropagation()}
          className="px-3.5 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800/80"
        >
          {replySent ? (
            <div className="flex items-center gap-2 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <Check className="w-4 h-4" />
              <span>Reply sent</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <input
                  ref={replyInputRef}
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setIsReplying(false);
                    }
                  }}
                  placeholder={`Reply to ${toast.actorName || toast.title}...`}
                  disabled={replySending}
                  className="flex-1 min-w-0 h-9 px-3 rounded-xl bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0084FF]/35 focus:border-[#0084FF]"
                />
                <button
                  type="submit"
                  disabled={!replyText.trim() || replySending}
                  aria-label="Send reply"
                  className="min-w-[36px] min-h-[36px] px-3 rounded-xl bg-[#0084FF] hover:bg-[#0073E6] disabled:opacity-45 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsReplying(false)}
                  className="min-h-[36px] px-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer shrink-0"
                >
                  Cancel
                </button>
              </div>
              {replyError && (
                <p className="mt-1.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                  {replyError}
                </p>
              )}
            </>
          )}
        </form>
      )}

      {/* Subtle Bottom Auto-Dismiss Progress Hairline */}
      {!toast.pinned && !toast.exiting && (
        <div
          aria-hidden="true"
          className="h-[2px] w-full bg-slate-200/50 dark:bg-slate-800/70 overflow-hidden"
        >
          <div
            className={`h-full origin-left ${getProgressBarClass(toast.type)} opacity-75 mobile-toast-progress`}
            style={{
              animationDuration: `${toast.durationMs}ms`,
              animationPlayState: effectivelyPaused ? 'paused' : 'running',
            }}
          />
        </div>
      )}
    </div>
  );
};

export const MobileNotificationToastHost: React.FC<MobileNotificationToastHostProps> = ({
  currentUserId,
  messagingProfileId,
  onNavigate,
  onOpenConversation,
}) => {
  const [toasts, setToasts] = useState<ActiveMobileToast[]>([]);
  const recentDedupeRef = useRef<Map<string, number>>(new Map());
  const conversationsCacheRef = useRef<Map<string, ChatConversation>>(new Map());
  const messageSettingsRef = useRef<UserMessageSettings | null>(null);
  const blockedIdsRef = useRef<Set<number>>(new Set());

  const myMessagingId = messagingProfileId || currentUserId;

  const enqueueToast = useCallback((payload: MobileToastPayload) => {
    if (!getInAppNotificationPreference()) return;

    const now = Date.now();
    // Prune stale dedupe entries older than 12s
    for (const [k, ts] of recentDedupeRef.current.entries()) {
      if (now - ts > 12000) recentDedupeRef.current.delete(k);
    }

    const dedupeKey =
      payload.dedupeKey ||
      `${payload.type}:${payload.conversationId || payload.postId || payload.notificationId || ''}:${payload.title}:${payload.body.slice(0, 40)}`;

    if (recentDedupeRef.current.has(dedupeKey)) {
      return;
    }
    recentDedupeRef.current.set(dedupeKey, now);

    const isUrgent = Boolean(
      payload.urgent || payload.type === 'blood_request' || payload.type === 'blood'
    );

    const newToast: ActiveMobileToast = {
      ...payload,
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      receivedAt: now,
      durationMs: isUrgent ? URGENT_DURATION_MS : STANDARD_DURATION_MS,
      exiting: false,
      pinned: false,
    };

    if (payload.playChime !== false) {
      playNotificationChimeOnce();
    }

    setToasts((prev) => {
      // Collapse multiple rapid messages from the same conversation into the newest banner
      const filtered = payload.conversationId
        ? prev.filter((t) => t.conversationId !== payload.conversationId)
        : prev;
      return [newToast, ...filtered].slice(0, MAX_VISIBLE_TOASTS + 2);
    });
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_ANIMATION_MS);
  }, []);

  const dismissAll = useCallback(() => {
    setToasts((prev) => prev.map((t) => ({ ...t, exiting: true })));
    window.setTimeout(() => {
      setToasts([]);
    }, EXIT_ANIMATION_MS);
  }, []);

  const togglePinToast = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t))
    );
  }, []);

  const handleOpenToast = useCallback(
    (toast: ActiveMobileToast) => {
      dismissToast(toast.id);

      if (toast.notificationId) {
        void markNotificationReadInDb(toast.notificationId).catch(() => {});
      }

      if (toast.conversationId) {
        onOpenConversation(toast.conversationId);
        return;
      }

      if (toast.postId) {
        window.location.hash = `post-${toast.postId}`;
        onNavigate('feed');
        return;
      }

      if (toast.bloodRequestId || toast.type === 'blood_request' || toast.type === 'blood') {
        onNavigate('blood-network');
        return;
      }

      if (toast.type === 'new_message') {
        onNavigate('messages');
        return;
      }

      if (
        toast.type === 'connection_request' ||
        toast.type === 'connection_accepted' ||
        toast.type === 'new_follower'
      ) {
        onNavigate(toast.targetRoute || 'profile');
        return;
      }

      if (toast.type === 'batch_announcement') {
        onNavigate(toast.targetRoute || 'batches');
        return;
      }

      if (toast.type === 'official_announcement') {
        onNavigate(toast.targetRoute || 'pages');
        return;
      }

      if (toast.type === 'mentorship') {
        onNavigate(toast.targetRoute || 'mentorship');
        return;
      }

      if (toast.type === 'career') {
        onNavigate(toast.targetRoute || 'careers');
        return;
      }

      if (toast.targetRoute) {
        onNavigate(toast.targetRoute);
      }
    },
    [dismissToast, onNavigate, onOpenConversation]
  );

  // 1. Keep blocked users, message settings, and user's conversations cached for fast real-time enrichment
  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;

    const refreshMeta = async () => {
      try {
        const [blocked, settings, convs] = await Promise.all([
          fetchBlockedUserIds(currentUserId).catch(() => [] as number[]),
          getUserMessageSettings(myMessagingId).catch(() => null),
          listConversations(myMessagingId).catch(() => [] as ChatConversation[]),
        ]);
        if (cancelled) return;
        blockedIdsRef.current = new Set(blocked);
        if (settings) messageSettingsRef.current = settings;
        const map = new Map<string, ChatConversation>();
        for (const c of convs) {
          map.set(c.id, c);
        }
        conversationsCacheRef.current = map;
      } catch {
        /* non-critical */
      }
    };

    void refreshMeta();

    const unsubConvs = subscribeToConversationChanges(() => {
      void listConversations(myMessagingId)
        .then((convs) => {
          if (cancelled) return;
          const map = new Map<string, ChatConversation>();
          for (const c of convs) map.set(c.id, c);
          conversationsCacheRef.current = map;
        })
        .catch(() => {});
    });

    const handleBlocksUpdated = () => {
      void fetchBlockedUserIds(currentUserId)
        .then((ids) => {
          if (!cancelled) blockedIdsRef.current = new Set(ids);
        })
        .catch(() => {});
    };

    window.addEventListener('szmc_blocks_updated', handleBlocksUpdated);
    return () => {
      cancelled = true;
      unsubConvs();
      window.removeEventListener('szmc_blocks_updated', handleBlocksUpdated);
    };
  }, [currentUserId, myMessagingId]);

  // 2. Listen to custom in-app toast bus & conversation-open dismissals
  useEffect(() => {
    const unsubToast = subscribeMobileToast((payload) => {
      if (payload.actorId && blockedIdsRef.current.has(payload.actorId)) return;
      enqueueToast(payload);
    });

    const unsubDismissConv = subscribeDismissConversationToasts((conversationId) => {
      setToasts((prev) => prev.filter((t) => t.conversationId !== conversationId));
    });

    return () => {
      unsubToast();
      unsubDismissConv();
    };
  }, [enqueueToast]);

  // 3. Real-time incoming chat messages (works across ALL routes while user is active in app)
  useEffect(() => {
    if (!currentUserId) return;

    return subscribeToMessageChanges(async (message, meta) => {
      if (meta.eventType !== 'INSERT') return;
      if (message.deletedAt || message.isSilent) return;

      // Ignore own messages (check both alumni_profiles.id and resolved messaging profile id)
      if (message.senderId === currentUserId || message.senderId === myMessagingId) return;

      // Ignore if the user is actively viewing this exact conversation right now
      if (isConversationActivelyViewed(message.conversationId)) return;

      // Resolve conversation to confirm the current user is a participant & check mute status
      let conv = conversationsCacheRef.current.get(message.conversationId);
      if (!conv) {
        try {
          const fresh = await listConversations(myMessagingId);
          const nextMap = new Map<string, ChatConversation>();
          for (const c of fresh) nextMap.set(c.id, c);
          conversationsCacheRef.current = nextMap;
          conv = nextMap.get(message.conversationId);
        } catch {
          conv = undefined;
        }
      }

      // Not a conversation this user belongs to, or muted thread
      if (!conv || conv.isMuted) return;

      // Ignore blocked senders
      const peerProfileId = conv.person?.profileId || message.senderId;
      if (blockedIdsRef.current.has(message.senderId) || blockedIdsRef.current.has(peerProfileId)) {
        return;
      }

      const settings = messageSettingsRef.current;
      const previewAllowed = settings?.notificationPreviewEnabled ?? true;
      const soundAllowed = settings?.soundEnabled ?? true;

      const rawBody =
        message.type === 'image' || message.mediaUrl
          ? message.body && message.body !== 'Photo'
            ? `Photo: ${message.body}`
            : 'Sent a photo'
          : message.type === 'like'
          ? 'Sent a thumbs up'
          : formatStructuredPreview(message.body) || message.body || 'Sent a new message';

      const senderName =
        conv.type === 'group' || conv.type === 'announcement'
          ? conv.title || conv.person?.fullName || 'Group Chat'
          : conv.person?.fullName || 'SZMC Colleague';

      enqueueToast({
        dedupeKey: `msg:${message.id}`,
        type: 'new_message',
        title: senderName,
        subtitle:
          conv.type === 'group'
            ? 'Group message'
            : conv.type === 'announcement'
            ? 'Announcement'
            : 'New message',
        body: previewAllowed ? rawBody : 'Sent you a new message',
        avatarUrl: conv.person?.avatarUrl || undefined,
        actorName: senderName,
        actorId: message.senderId,
        conversationId: message.conversationId,
        createdAt: message.createdAt,
        playChime: soundAllowed,
      });
    });
  }, [currentUserId, myMessagingId, enqueueToast]);

  // 4. Real-time Supabase user interactions & alerts (likes, comments, mentions, follows, blood, notices, etc.)
  useEffect(() => {
    if (!currentUserId) return;

    return realtimeManager.subscribeToUserNotifications(currentUserId, async (rawNotif: any) => {
      if (!rawNotif) return;

      const actorId = rawNotif.actor_id ? Number(rawNotif.actor_id) : undefined;
      if (actorId && actorId === currentUserId) return;
      if (actorId && blockedIdsRef.current.has(actorId)) return;

      const type = normalizeNotificationType(rawNotif.type || 'system', rawNotif.target_route);

      // Avoid duplicate toast if a message notification row also fires alongside subscribeToMessageChanges
      if (type === 'new_message' && rawNotif.conversation_id && isConversationActivelyViewed(String(rawNotif.conversation_id))) {
        return;
      }

      let actorName: string | undefined = rawNotif.actor_name || undefined;
      let actorAvatar: string | undefined = rawNotif.actor_avatar || undefined;

      // Enrich actor info from Supabase if postgres_changes payload only includes actor_id
      if (actorId && (!actorName || !actorAvatar)) {
        try {
          const profile = await fetchAlumniProfileByIdFromDb(actorId);
          if (profile) {
            if (!actorName) actorName = profile.fullName;
            if (!actorAvatar) actorAvatar = profile.avatarUrl;
          }
        } catch {
          /* fallback gracefully to title/initials */
        }
      }

      const soundEnabled = await isSoundEnabledForUser(currentUserId).catch(() => true);
      const rawTitle = String(rawNotif.title || 'New notification').trim();
      const rawMessage = String(rawNotif.message || '').trim();

      const headerTitle = actorName || rawTitle;
      const actionSubtitle = actorName
        ? rawTitle.replace(actorName, '').replace(/^[\s.,:-]+/, '').trim() || getCategoryLabel(type)
        : getCategoryLabel(type);

      enqueueToast({
        dedupeKey: rawNotif.id
          ? `notif:${rawNotif.id}`
          : `notif:${type}:${actorId || 0}:${rawNotif.post_id || rawNotif.blood_request_id || ''}:${rawTitle}`,
        type,
        title: headerTitle,
        subtitle: actionSubtitle,
        body: rawMessage || rawTitle,
        avatarUrl: actorAvatar,
        actorName,
        actorId,
        notificationId: rawNotif.id ? Number(rawNotif.id) : undefined,
        conversationId: rawNotif.conversation_id ? String(rawNotif.conversation_id) : undefined,
        postId: rawNotif.post_id ? Number(rawNotif.post_id) : undefined,
        bloodRequestId: rawNotif.blood_request_id ? String(rawNotif.blood_request_id) : undefined,
        targetRoute: rawNotif.target_route || undefined,
        createdAt: rawNotif.created_at || new Date().toISOString(),
        urgent: type === 'blood_request' || type === 'blood',
        playChime: soundEnabled,
      });
    });
  }, [currentUserId, enqueueToast]);

  if (toasts.length === 0) return null;

  const visibleToasts = toasts.slice(0, MAX_VISIBLE_TOASTS);
  const hiddenCount = Math.max(0, toasts.length - MAX_VISIBLE_TOASTS);

  return (
    <div
      aria-label="Live notifications"
      className="fixed top-0 inset-x-0 z-[75] pointer-events-none flex flex-col items-center px-2.5 sm:px-4 pt-[max(0.625rem,env(safe-area-inset-top))]"
    >
      <div className="w-full max-w-[432px] flex flex-col gap-2">
        {visibleToasts.map((toast, idx) => (
          <ToastBannerCard
            key={toast.id}
            toast={toast}
            stackIndex={idx}
            messagingSenderId={myMessagingId}
            onDismiss={dismissToast}
            onTogglePin={togglePinToast}
            onOpen={handleOpenToast}
          />
        ))}

        {toasts.length > 1 && (
          <div className="pointer-events-auto flex items-center justify-center pt-0.5">
            <button
              type="button"
              onClick={dismissAll}
              className="min-h-[36px] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white bg-white/92 dark:bg-slate-900/92 backdrop-blur-xl px-3.5 py-1.5 rounded-xl border border-slate-200/85 dark:border-slate-700/80 shadow-md transition-colors cursor-pointer whitespace-nowrap tabular-nums"
            >
              {hiddenCount > 0 ? `Clear all (${toasts.length})` : 'Clear all'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
