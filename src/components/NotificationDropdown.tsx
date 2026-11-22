import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  CheckCheck,
  X,
  ThumbsUp,
  MessageCircle,
  Droplet,
  GraduationCap,
  Briefcase,
  ShieldCheck,
  ShieldAlert,
  User,
  BellOff,
  Heart,
  UserPlus,
  UserCheck,
  MessageSquare,
  AtSign,
  Repeat2,
  Megaphone,
  BadgeCheck,
} from 'lucide-react';
import { NotificationItem, NotificationType } from '../types/notification.types';
import {
  loadMergedNotifications,
  saveLocalNotifications,
} from '../utils/notificationService';
import {
  markNotificationReadInDb,
  markAllNotificationsReadInDb,
  isSoundEnabledForUser,
  fetchUnreadNotificationsFromDb,
} from '../services/supabaseNotificationService';
import {
  categorizeNotification,
  formatNotificationRelativeTime,
  type NotificationFilterCategory,
} from '../services/communitySafetyUtils';
import { fetchBlockedUserIds } from '../services/communitySafetyService';
import { realtimeManager } from '../services/supabaseRealtimeService';
import { playSound } from '../utils/audio';

interface NotificationDropdownProps {
  currentUserId: number;
  onNavigate?: (route: string) => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  currentUserId,
  onNavigate,
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [blockedIds, setBlockedIds] = useState<Set<number>>(new Set());
  const [notifFilter, setNotifFilter] = useState<NotificationFilterCategory>('all');
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const visibleNotifications = notifications.filter(
    (n) => !(n.actorId && blockedIds.has(n.actorId))
  );
  const unreadCount = visibleNotifications.filter((n) => n.unread).length;

  const filteredNotifications = visibleNotifications.filter((n) => {
    if (notifFilter === 'unread') return n.unread;
    if (notifFilter === 'social') return categorizeNotification(n.type) === 'social';
    if (notifFilter === 'announcements') return categorizeNotification(n.type) === 'announcements';
    return true;
  });

  const syncNotifications = () => {
    if (!currentUserId) return;

    fetchBlockedUserIds(currentUserId)
      .then((ids) => setBlockedIds(new Set(ids)))
      .catch(() => {});

    fetchUnreadNotificationsFromDb(currentUserId)
      .then(() => loadMergedNotifications(currentUserId))
      .then((items) => {
        if (items) setNotifications(items);
      })
      .catch(() => {
        loadMergedNotifications(currentUserId)
          .then((items) => {
            if (items) setNotifications(items);
          })
          .catch(console.warn);
      });
  };

  useEffect(() => {
    syncNotifications();
    window.addEventListener('szmc_notifications_updated', syncNotifications);
    window.addEventListener('szmc_blocks_updated', syncNotifications);
    window.addEventListener('storage', syncNotifications);

    const unsubscribeRealtime = realtimeManager.subscribeToUserNotifications(
      currentUserId,
      async (newNotif: any) => {
        const currentBlocked = await fetchBlockedUserIds(currentUserId).catch(() => []);
        if (newNotif?.actor_id && currentBlocked.includes(Number(newNotif.actor_id))) {
          return;
        }
        const soundEnabled = await isSoundEnabledForUser(currentUserId);
        if (soundEnabled) {
          try {
            playSound('notification');
          } catch {}
        }
        syncNotifications();
      }
    );

    return () => {
      window.removeEventListener('szmc_notifications_updated', syncNotifications);
      window.removeEventListener('szmc_blocks_updated', syncNotifications);
      window.removeEventListener('storage', syncNotifications);
      unsubscribeRealtime();
    };
  }, [currentUserId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAllAsRead = async () => {
    await markAllNotificationsReadInDb(currentUserId);
    const next = notifications.map((n) => ({ ...n, unread: false }));
    setNotifications(next);
    saveLocalNotifications(next);
  };

  const markItemAsRead = (item: NotificationItem) => {
    markNotificationReadInDb(item.id).catch(() => {});
    const next = notifications.map((n) => (n.id === item.id ? { ...n, unread: false } : n));
    setNotifications(next);
    saveLocalNotifications(next);
    setShowNotifications(false);

    if (item.postId) {
      window.location.hash = `post-${item.postId}`;
      if (onNavigate) onNavigate('feed');
      return;
    }
    if (item.bloodRequestId) {
      if (onNavigate) onNavigate('blood-network');
      return;
    }
    if (item.type === 'new_message') {
      if (onNavigate) onNavigate('messages');
      return;
    }
    if (
      item.type === 'connection_request' ||
      item.type === 'connection_accepted' ||
      item.type === 'new_follower'
    ) {
      if (onNavigate) onNavigate(item.targetRoute || 'profile');
      return;
    }
    if (item.type === 'batch_announcement') {
      if (onNavigate) onNavigate(item.targetRoute || 'quad-batches');
      return;
    }
    if (item.type === 'official_announcement') {
      if (onNavigate) onNavigate(item.targetRoute || 'quad-pages');
      return;
    }
    if (item.targetRoute) {
      if (onNavigate) onNavigate(item.targetRoute);
      return;
    }
  };

  const dismissNotificationItem = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    markNotificationReadInDb(id).catch(() => {});
    const next = notifications.filter((n) => n.id !== id);
    setNotifications(next);
    saveLocalNotifications(next);
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
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
      case 'new_message':
        return <MessageSquare className="w-2.5 h-2.5" />;
      case 'blood_request':
      case 'blood':
        return <Droplet className="w-2.5 h-2.5 fill-current" />;
      case 'batch_announcement':
        return <Megaphone className="w-2.5 h-2.5" />;
      case 'official_announcement':
        return <BadgeCheck className="w-2.5 h-2.5" />;
      case 'moderation_action':
        return <ShieldAlert className="w-2.5 h-2.5" />;
      case 'mentorship':
        return <GraduationCap className="w-2.5 h-2.5" />;
      case 'career':
        return <Briefcase className="w-2.5 h-2.5" />;
      case 'system':
      default:
        return <ShieldCheck className="w-2.5 h-2.5" />;
    }
  };

  const getBadgeBg = (type: NotificationType) => {
    switch (type) {
      case 'post_like':
      case 'like':
        return 'bg-blue-600';
      case 'post_comment':
      case 'comment':
        return 'bg-emerald-600';
      case 'post_reaction':
        return 'bg-amber-500';
      case 'mention':
        return 'bg-blue-700';
      case 'repost':
        return 'bg-teal-600';
      case 'new_follower':
        return 'bg-sky-600';
      case 'connection_request':
        return 'bg-indigo-600';
      case 'connection_accepted':
        return 'bg-emerald-600';
      case 'new_message':
        return 'bg-sky-600';
      case 'blood_request':
      case 'blood':
        return 'bg-rose-600';
      case 'batch_announcement':
        return 'bg-amber-600';
      case 'official_announcement':
        return 'bg-blue-700';
      case 'moderation_action':
        return 'bg-slate-700';
      case 'mentorship':
        return 'bg-amber-500';
      case 'career':
        return 'bg-emerald-600';
      case 'system':
      default:
        return 'bg-slate-700';
    }
  };

  const filterTabs: { id: NotificationFilterCategory; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    { id: 'social', label: 'Social' },
    { id: 'announcements', label: 'Updates' },
  ];

  return (
    <div className="relative" ref={notifRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setShowNotifications(!showNotifications)}
        className="relative p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-rose-600 text-white text-[10px] font-bold tabular-nums rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Floating Dropdown */}
      {showNotifications && (
        <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 w-auto sm:w-[430px] max-w-sm sm:max-w-none bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 py-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150 mx-auto sm:mx-0">
          {/* Header */}
          <div className="px-4 pb-2.5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  Notifications
                </h3>
                {unreadCount > 0 && (
                  <span className="text-[11px] font-semibold tabular-nums text-rose-700 dark:text-rose-300">
                    · {unreadCount} unread
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer py-1 px-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors whitespace-nowrap"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Mark all read</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowNotifications(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  aria-label="Close notifications"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 mt-2.5 overflow-x-auto">
              {filterTabs.map((tab) => {
                const active = notifFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setNotifFilter(tab.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                      active
                        ? 'bg-slate-900 text-white dark:bg-blue-600 dark:text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{tab.label}</span>
                    {tab.id === 'unread' && unreadCount > 0 && (
                      <span className="text-[10px] tabular-nums opacity-85">({unreadCount})</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notifications Scroll List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100/80 dark:divide-slate-800/60">
            {filteredNotifications.map((item) => {
              const isBlood = item.type === 'blood_request' || item.type === 'blood';
              const isMentorship = item.type === 'mentorship';
              const isCareer = item.type === 'career';
              const isOfficial =
                item.type === 'official_announcement' || item.type === 'batch_announcement';
              const displayTime = formatNotificationRelativeTime(item.createdAt || item.timeAgo);

              return (
                <div
                  key={item.id}
                  onClick={() => markItemAsRead(item)}
                  className={`px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors relative flex items-start gap-3 group ${
                    item.unread ? 'bg-blue-50/45 dark:bg-blue-950/20' : ''
                  }`}
                >
                  {/* Actor Avatar with Corner Action Badge */}
                  <div className="relative shrink-0 mt-0.5">
                    {item.actorAvatar ? (
                      <img
                        src={item.actorAvatar}
                        alt={item.actorName || 'User'}
                        className="w-10 h-10 rounded-full object-cover ring-2 ring-slate-100 dark:ring-slate-800"
                      />
                    ) : (
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ${
                          isBlood
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300'
                            : isOfficial
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300'
                            : isMentorship
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300'
                            : isCareer
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {isBlood ? (
                          <Droplet className="w-5 h-5 fill-current" />
                        ) : isOfficial ? (
                          <Megaphone className="w-5 h-5" />
                        ) : isMentorship ? (
                          <GraduationCap className="w-5 h-5" />
                        ) : isCareer ? (
                          <Briefcase className="w-5 h-5" />
                        ) : (
                          <User className="w-5 h-5" />
                        )}
                      </div>
                    )}

                    {/* Mini Corner Badge */}
                    <div
                      className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white ring-2 ring-white dark:ring-slate-900 shadow-xs ${getBadgeBg(
                        item.type
                      )}`}
                    >
                      {getNotificationIcon(item.type)}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pr-6">
                    <p className="text-xs text-slate-800 dark:text-slate-200 leading-snug">
                      {item.actorName && (
                        <span className="font-bold text-slate-900 dark:text-slate-100 mr-1">
                          {item.actorName}
                        </span>
                      )}
                      <span
                        className={
                          item.actorName
                            ? 'text-slate-700 dark:text-slate-300'
                            : 'font-semibold text-slate-900 dark:text-slate-100'
                        }
                      >
                        {item.actorName
                          ? item.title.replace(item.actorName, '').trim() || item.title
                          : item.title}
                      </span>
                    </p>
                    {item.message && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {item.message}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span
                        className={`text-[11px] tabular-nums ${
                          item.unread
                            ? 'text-blue-600 dark:text-blue-400 font-semibold'
                            : 'text-slate-400 dark:text-slate-500 font-medium'
                        }`}
                      >
                        {displayTime}
                      </span>
                      {item.unread && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                      )}
                    </div>
                  </div>

                  {/* Item Dismiss Button */}
                  <button
                    type="button"
                    onClick={(e) => dismissNotificationItem(e, item.id)}
                    className="opacity-0 group-hover:opacity-100 absolute top-2.5 right-2.5 p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-all cursor-pointer"
                    title="Dismiss"
                    aria-label="Dismiss notification"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}

            {filteredNotifications.length === 0 && (
              <div className="py-12 px-4 text-center flex flex-col items-center justify-center">
                <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-2.5">
                  <BellOff className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {notifFilter === 'unread'
                    ? 'No unread notifications'
                    : notifFilter === 'social'
                    ? 'No social notifications yet'
                    : notifFilter === 'announcements'
                    ? 'No announcements or alerts'
                    : 'No notifications yet'}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  You are all caught up.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
