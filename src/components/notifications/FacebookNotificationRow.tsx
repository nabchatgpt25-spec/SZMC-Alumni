import React, { useEffect, useRef, useState } from 'react';
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
  MoreHorizontal,
  Repeat2,
  ShieldAlert,
  ShieldCheck,
  ThumbsUp,
  Trash2,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import type { NotificationType } from '../../types/notification.types';
import {
  buildFacebookNotificationCopy,
  formatFacebookNotifTime,
  GroupedNotification,
} from '../../utils/facebookNotifications';

interface FacebookNotificationRowProps {
  group: GroupedNotification;
  compact?: boolean;
  /** If this is a pending incoming connection request, pass its DB connectionId to show Confirm / Delete buttons */
  pendingConnectionId?: number | null;
  /** Result state after user clicked Confirm or Delete inline */
  connectionDecision?: 'accepted' | 'rejected' | null;
  connectionBusy?: boolean;
  onRespondConnection?: (
    group: GroupedNotification,
    connectionId: number,
    decision: 'accepted' | 'rejected'
  ) => void;
  onClick: (group: GroupedNotification) => void;
  onToggleRead: (group: GroupedNotification, nextUnread: boolean) => void;
  onRemove: (group: GroupedNotification) => void;
}

function getInitials(name?: string): string {
  const clean = (name || '').trim();
  if (!clean) return 'SZ';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getBadgeVisual(type: NotificationType): { bg: string; icon: React.ReactNode } {
  switch (type) {
    case 'post_like':
    case 'like':
      return {
        bg: 'bg-gradient-to-b from-[#3B9BFF] to-[#1877F2]',
        icon: <ThumbsUp className="w-3 h-3 fill-white text-white" />,
      };
    case 'post_reaction':
      return {
        bg: 'bg-gradient-to-b from-[#FF6B81] to-[#E11D48]',
        icon: <Heart className="w-3 h-3 fill-white text-white" />,
      };
    case 'post_comment':
    case 'comment':
      return {
        bg: 'bg-gradient-to-b from-[#45D17A] to-[#16A34A]',
        icon: <MessageCircle className="w-3 h-3 fill-white text-white" />,
      };
    case 'mention':
      return {
        bg: 'bg-gradient-to-b from-[#3B82F6] to-[#1D4ED8]',
        icon: <AtSign className="w-3 h-3 text-white" />,
      };
    case 'repost':
      return {
        bg: 'bg-gradient-to-b from-[#2DD4BF] to-[#0D9488]',
        icon: <Repeat2 className="w-3 h-3 text-white" />,
      };
    case 'new_follower':
    case 'connection_request':
      return {
        bg: 'bg-gradient-to-b from-[#3B9BFF] to-[#1877F2]',
        icon: <UserPlus className="w-3 h-3 text-white" />,
      };
    case 'connection_accepted':
      return {
        bg: 'bg-gradient-to-b from-[#34D399] to-[#059669]',
        icon: <UserCheck className="w-3 h-3 text-white" />,
      };
    case 'new_message':
      return {
        bg: 'bg-gradient-to-b from-[#00A3FF] to-[#0084FF]',
        icon: <MessageSquare className="w-3 h-3 fill-white text-white" />,
      };
    case 'blood_request':
    case 'blood':
      return {
        bg: 'bg-gradient-to-b from-[#FB7185] to-[#E11D48]',
        icon: <Droplet className="w-3 h-3 fill-white text-white" />,
      };
    case 'batch_announcement':
      return {
        bg: 'bg-gradient-to-b from-[#FBBF24] to-[#D97706]',
        icon: <Megaphone className="w-3 h-3 text-white" />,
      };
    case 'official_announcement':
      return {
        bg: 'bg-gradient-to-b from-[#3B9BFF] to-[#1877F2]',
        icon: <BadgeCheck className="w-3 h-3 text-white" />,
      };
    case 'mentorship':
      return {
        bg: 'bg-gradient-to-b from-[#F59E0B] to-[#D97706]',
        icon: <GraduationCap className="w-3 h-3 text-white" />,
      };
    case 'career':
      return {
        bg: 'bg-gradient-to-b from-[#34D399] to-[#059669]',
        icon: <Briefcase className="w-3 h-3 text-white" />,
      };
    case 'moderation_action':
      return {
        bg: 'bg-gradient-to-b from-[#64748B] to-[#334155]',
        icon: <ShieldAlert className="w-3 h-3 text-white" />,
      };
    case 'verification':
      return {
        bg: 'bg-gradient-to-b from-[#3B9BFF] to-[#1877F2]',
        icon: <ShieldCheck className="w-3 h-3 text-white" />,
      };
    default:
      return {
        bg: 'bg-gradient-to-b from-[#64748B] to-[#334155]',
        icon: <Bell className="w-3 h-3 text-white" />,
      };
  }
}

export const FacebookNotificationRow: React.FC<FacebookNotificationRowProps> = ({
  group,
  compact = false,
  pendingConnectionId,
  connectionDecision,
  connectionBusy = false,
  onRespondConnection,
  onClick,
  onToggleRead,
  onRemove,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [thumbBroken, setThumbBroken] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  const { primary, unread } = group;
  const { actorLead, actionBody, quoteSnippet } = buildFacebookNotificationCopy(group);
  const badge = getBadgeVisual(primary.type);
  const timeLabel = formatFacebookNotifTime(primary.createdAt, primary.timeAgo);
  const isConnectionReq = primary.type === 'connection_request';
  const showConnectionButtons =
    isConnectionReq && Boolean(pendingConnectionId) && !connectionDecision && Boolean(onRespondConnection);

  const avatarSizeClass = compact ? 'w-12 h-12' : 'w-14 h-14';
  const badgeSizeClass = compact ? 'w-6 h-6' : 'w-7 h-7';

  return (
    <div
      className={`group relative mx-1.5 rounded-xl transition-colors ${
        menuOpen ? 'z-30 bg-slate-100/90 dark:bg-slate-800/80' : 'hover:bg-slate-100/90 dark:hover:bg-slate-800/70'
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onClick(group)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(group);
          }
        }}
        className={`w-full text-left flex items-start gap-3 ${
          compact ? 'px-2.5 py-2.5' : 'px-3 py-3'
        } cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1877F2]/60`}
      >
        {/* Facebook Circular Avatar + Bottom-Right Reaction/Action Badge */}
        <div className="relative shrink-0 mt-0.5">
          {primary.actorAvatar && !avatarBroken ? (
            <img
              src={primary.actorAvatar}
              alt={primary.actorName || 'SZMC Alumnus'}
              referrerPolicy="no-referrer"
              onError={() => setAvatarBroken(true)}
              className={`${avatarSizeClass} rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10`}
            />
          ) : (
            <div
              className={`${avatarSizeClass} rounded-full flex items-center justify-center font-bold text-sm ${
                primary.type === 'blood_request' || primary.type === 'blood'
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-200'
                  : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100'
              }`}
            >
              {getInitials(primary.actorName || primary.title)}
            </div>
          )}

          {/* Bottom-Right Reaction/Type Circle */}
          <span
            aria-hidden="true"
            className={`absolute -bottom-0.5 -right-0.5 ${badgeSizeClass} rounded-full flex items-center justify-center ring-2 ring-white dark:ring-slate-900 shadow-xs ${badge.bg}`}
          >
            {badge.icon}
          </span>
        </div>

        {/* Center Notification Copy */}
        <div className="flex-1 min-w-0 pr-5">
          <p
            className={`${
              compact ? 'text-[13.5px]' : 'text-[14.5px]'
            } leading-[1.35] text-slate-900 dark:text-slate-100 ${
              unread ? 'font-normal' : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {actorLead && (
              <span className="font-semibold text-slate-950 dark:text-white mr-1">
                {actorLead}
              </span>
            )}
            <span className={!actorLead && unread ? 'font-semibold text-slate-950 dark:text-white' : ''}>
              {actionBody}
            </span>
          </p>

          {quoteSnippet && (
            <p
              className={`${
                compact ? 'text-xs' : 'text-[13px]'
              } text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-snug`}
            >
              {quoteSnippet}
            </p>
          )}

          <p
            className={`mt-1 text-xs tabular-nums ${
              unread
                ? 'font-semibold text-[#1877F2] dark:text-[#4599FF]'
                : 'font-normal text-slate-500 dark:text-slate-400'
            }`}
          >
            {timeLabel}
          </p>

          {/* Facebook Inline Confirm / Delete Actions for Pending Connection Requests */}
          {showConnectionButtons && pendingConnectionId && onRespondConnection && (
            <div
              className="mt-2.5 flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                disabled={connectionBusy}
                onClick={() => onRespondConnection(group, pendingConnectionId, 'accepted')}
                className="min-h-[36px] px-4 py-1.5 rounded-lg bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-55 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                {connectionBusy ? 'Saving...' : 'Confirm'}
              </button>
              <button
                type="button"
                disabled={connectionBusy}
                onClick={() => onRespondConnection(group, pendingConnectionId, 'rejected')}
                className="min-h-[36px] px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-55 text-slate-900 dark:text-slate-100 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                Delete
              </button>
            </div>
          )}

          {connectionDecision && (
            <p className="mt-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              {connectionDecision === 'accepted' ? 'Request accepted' : 'Request removed'}
            </p>
          )}
        </div>

        {/* Optional Post Thumbnail + Signature Facebook Blue Unread Dot */}
        <div className="flex items-center gap-2.5 shrink-0 self-center">
          {primary.photoUrl && !thumbBroken && (
            <img
              src={primary.photoUrl}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setThumbBroken(true)}
              className="w-11 h-11 rounded-lg object-cover border border-slate-200/80 dark:border-slate-700/80 shrink-0"
            />
          )}
          <div className="w-3.5 flex items-center justify-center shrink-0">
            {unread && (
              <span
                aria-label="Unread"
                className="w-3 h-3 rounded-full bg-[#1877F2] dark:bg-[#4599FF] shrink-0"
              />
            )}
          </div>
        </div>
      </div>

      {/* Facebook Floating Circular Three-Dot Action Trigger */}
      <div
        ref={menuRef}
        className={`absolute top-1/2 -translate-y-1/2 right-7 transition-opacity ${
          menuOpen
            ? 'opacity-100'
            : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label="Notification options"
          aria-expanded={menuOpen}
          className="w-9 h-9 rounded-full bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/90 dark:border-slate-700 shadow-md flex items-center justify-center text-slate-600 dark:text-slate-200 transition-colors cursor-pointer"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 mt-1.5 w-60 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700/90 shadow-2xl py-1.5 z-50"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onToggleRead(group, !unread);
              }}
              className="w-full px-3 py-2.5 text-left text-[13px] font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
              <span>{unread ? 'Mark as read' : 'Mark as unread'}</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onRemove(group);
              }}
              className="w-full px-3 py-2.5 text-left text-[13px] font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
              <span>Remove this notification</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
