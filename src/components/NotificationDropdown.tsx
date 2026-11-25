import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BellOff,
  Check,
  ExternalLink,
  MoreHorizontal,
  Settings,
} from 'lucide-react';
import { NotificationItem } from '../types/notification.types';
import {
  loadMergedNotifications,
  removeLocalNotificationsByIds,
  saveLocalNotifications,
  setLocalNotificationsReadState,
} from '../utils/notificationService';
import {
  deleteNotificationInDb,
  isSoundEnabledForUser,
  markAllNotificationsReadInDb,
  markNotificationReadInDb,
  markNotificationUnreadInDb,
} from '../services/supabaseNotificationService';
import { fetchBlockedUserIds } from '../services/communitySafetyService';
import {
  fetchMyNetworkSummary,
  respondToConnectionRequest,
} from '../services/socialGraphService';
import { realtimeManager } from '../services/supabaseRealtimeService';
import { playNotificationChimeOnce } from '../utils/mobileToastBus';
import {
  GroupedNotification,
  groupFacebookNotifications,
  resolveNotificationDestination,
} from '../utils/facebookNotifications';
import { FacebookNotificationRow } from './notifications/FacebookNotificationRow';
import { useAuth } from '../context/AuthContext';

interface NotificationDropdownProps {
  currentUserId: number;
  onNavigate?: (route: string) => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  currentUserId,
  onNavigate,
}) => {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [blockedIds, setBlockedIds] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(12);
  const [pendingConnByRequester, setPendingConnByRequester] = useState<Record<number, number>>({});
  const [connDecisionByKey, setConnDecisionByKey] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [connBusyKey, setConnBusyKey] = useState<string | null>(null);

  const notifRef = useRef<HTMLDivElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);

  const visibleNotifications = useMemo(
    () => notifications.filter((n) => !(n.actorId && blockedIds.has(n.actorId))),
    [notifications, blockedIds]
  );

  const unreadCount = useMemo(
    () => visibleNotifications.filter((n) => n.unread).length,
    [visibleNotifications]
  );

  const groupedNotifications = useMemo(() => {
    const base =
      activeTab === 'unread'
        ? visibleNotifications.filter((n) => n.unread)
        : visibleNotifications;
    return groupFacebookNotifications(base);
  }, [visibleNotifications, activeTab]);

  const limitedGroups = useMemo(
    () => groupedNotifications.slice(0, visibleLimit),
    [groupedNotifications, visibleLimit]
  );

  const newGroups = useMemo(
    () => limitedGroups.filter((g) => g.bucket === 'new'),
    [limitedGroups]
  );

  const earlierGroups = useMemo(
    () => limitedGroups.filter((g) => g.bucket !== 'new'),
    [limitedGroups]
  );

  const syncNotifications = useCallback(() => {
    if (!currentUserId) return;

    fetchBlockedUserIds(currentUserId)
      .then((ids) => setBlockedIds(new Set(ids)))
      .catch(() => {});

    loadMergedNotifications(currentUserId)
      .then((items) => {
        if (items) setNotifications(items);
      })
      .catch(console.warn);

    fetchMyNetworkSummary(currentUserId)
      .then((summary) => {
        const map: Record<number, number> = {};
        summary.incomingRequests.forEach((req) => {
          if (req.peer?.id && req.id) {
            map[Number(req.peer.id)] = Number(req.id);
          }
        });
        setPendingConnByRequester(map);
      })
      .catch(() => {});
  }, [currentUserId]);

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
          playNotificationChimeOnce();
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
  }, [currentUserId, syncNotifications]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
        setShowHeaderMenu(false);
      } else if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setShowHeaderMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAllAsRead = async () => {
    setShowHeaderMenu(false);
    await markAllNotificationsReadInDb(currentUserId);
    const next = notifications.map((n) => ({ ...n, unread: false }));
    setNotifications(next);
    saveLocalNotifications(next);
  };

  const handleToggleGroupRead = (group: GroupedNotification, nextUnread: boolean) => {
    const idSet = new Set(group.itemIds);
    group.itemIds.forEach((id) => {
      if (nextUnread) {
        void markNotificationUnreadInDb(id);
      } else {
        void markNotificationReadInDb(id);
      }
    });
    setNotifications((prev) =>
      prev.map((n) => (idSet.has(n.id) ? { ...n, unread: nextUnread } : n))
    );
    setLocalNotificationsReadState(group.itemIds, nextUnread);
  };

  const handleRemoveGroup = (group: GroupedNotification) => {
    const idSet = new Set(group.itemIds);
    group.itemIds.forEach((id) => {
      void deleteNotificationInDb(id);
    });
    setNotifications((prev) => prev.filter((n) => !idSet.has(n.id)));
    removeLocalNotificationsByIds(group.itemIds);
  };

  const handleOpenGroup = (group: GroupedNotification) => {
    if (group.unread) {
      handleToggleGroupRead(group, false);
    }
    setShowNotifications(false);
    setShowHeaderMenu(false);
    resolveNotificationDestination(group.primary, onNavigate);
  };

  const handleRespondConnection = async (
    group: GroupedNotification,
    connectionId: number,
    decision: 'accepted' | 'rejected'
  ) => {
    setConnBusyKey(group.key);
    try {
      const res = await respondToConnectionRequest(
        connectionId,
        decision,
        currentUserId,
        group.primary.actorId,
        currentUser.fullName
      );
      if (res.success) {
        setConnDecisionByKey((prev) => ({ ...prev, [group.key]: decision }));
        if (group.unread) {
          handleToggleGroupRead(group, false);
        }
        if (group.primary.actorId) {
          setPendingConnByRequester((prev) => {
            const copy = { ...prev };
            delete copy[group.primary.actorId!];
            return copy;
          });
        }
      }
    } finally {
      setConnBusyKey(null);
    }
  };

  const openFullNotificationsPage = () => {
    setShowNotifications(false);
    setShowHeaderMenu(false);
    onNavigate?.('notifications');
  };

  const hasMore = groupedNotifications.length > visibleLimit;

  return (
    <div className="relative" ref={notifRef}>
      {/* Facebook-Style Circular Header Bell Trigger */}
      <button
        type="button"
        onClick={() => {
          setShowNotifications((prev) => !prev);
          setShowHeaderMenu(false);
        }}
        className={`relative min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] w-10 h-10 flex items-center justify-center rounded-full transition-colors cursor-pointer active:scale-95 ${
          showNotifications
            ? 'bg-[#E7F3FF] text-[#1877F2] dark:bg-[#1877F2]/25 dark:text-[#4599FF]'
            : 'bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-700/80'
        }`}
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        aria-expanded={showNotifications}
      >
        <Bell className={`w-5 h-5 ${showNotifications ? 'fill-current' : ''}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[19px] h-[19px] px-1 bg-[#E41E3F] text-white text-[11px] font-bold tabular-nums rounded-full flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Facebook-Style Notifications Popover Panel */}
      {showNotifications && (
        <div className="fixed inset-x-2 top-15 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 w-auto sm:w-[390px] max-w-[410px] sm:max-w-none bg-white dark:bg-slate-900 rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.18)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.65)] border border-slate-200/85 dark:border-slate-800 z-50 mx-auto sm:mx-0 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Top Header Row: Title + Three-Dot Overflow Menu */}
          <div className="px-4 pt-3.5 pb-2 flex items-center justify-between gap-2">
            <h3 className="text-[22px] font-bold tracking-tight text-slate-950 dark:text-white leading-none">
              Notifications
            </h3>

            <div className="relative" ref={headerMenuRef}>
              <button
                type="button"
                onClick={() => setShowHeaderMenu((prev) => !prev)}
                aria-label="Notification settings and actions"
                aria-expanded={showHeaderMenu}
                className="w-9 h-9 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>

              {showHeaderMenu && (
                <div
                  role="menu"
                  className="absolute right-0 mt-1.5 w-60 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700/90 shadow-2xl py-1.5 z-50"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={markAllAsRead}
                    className="w-full px-3.5 py-2.5 text-left text-[13.5px] font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <Check className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                    <span>Mark all as read</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowHeaderMenu(false);
                      setShowNotifications(false);
                      onNavigate?.('settings');
                    }}
                    className="w-full px-3.5 py-2.5 text-left text-[13.5px] font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                    <span>Notification settings</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={openFullNotificationsPage}
                    className="w-full px-3.5 py-2.5 text-left text-[13.5px] font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                    <span>Open Notifications</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Facebook All / Unread Toggle Tabs */}
          <div className="px-4 pb-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab('all');
                setVisibleLimit(12);
              }}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-full text-[13.5px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-[#E7F3FF] text-[#1877F2] dark:bg-[#1877F2]/25 dark:text-[#4599FF]'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('unread');
                setVisibleLimit(12);
              }}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-full text-[13.5px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'unread'
                  ? 'bg-[#E7F3FF] text-[#1877F2] dark:bg-[#1877F2]/25 dark:text-[#4599FF]'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Unread
            </button>
          </div>

          {/* Sectioned Facebook Scroll List ("New" / "Earlier") */}
          <div className="max-h-[70dvh] sm:max-h-[460px] overflow-y-auto pb-2">
            {newGroups.length > 0 && (
              <div>
                <div className="px-4 pt-2 pb-1 flex items-center justify-between">
                  <span className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                    New
                  </span>
                  <button
                    type="button"
                    onClick={openFullNotificationsPage}
                    className="text-[13.5px] font-medium text-[#1877F2] dark:text-[#4599FF] hover:bg-slate-100 dark:hover:bg-slate-800 px-2 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    See all
                  </button>
                </div>
                <div className="space-y-0.5">
                  {newGroups.map((group) => (
                    <FacebookNotificationRow
                      key={group.key}
                      group={group}
                      compact
                      pendingConnectionId={
                        group.primary.actorId ? pendingConnByRequester[group.primary.actorId] : null
                      }
                      connectionDecision={connDecisionByKey[group.key] || null}
                      connectionBusy={connBusyKey === group.key}
                      onRespondConnection={handleRespondConnection}
                      onClick={handleOpenGroup}
                      onToggleRead={handleToggleGroupRead}
                      onRemove={handleRemoveGroup}
                    />
                  ))}
                </div>
              </div>
            )}

            {earlierGroups.length > 0 && (
              <div className={newGroups.length > 0 ? 'mt-2' : ''}>
                <div className="px-4 pt-2 pb-1 flex items-center justify-between">
                  <span className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                    Earlier
                  </span>
                  {newGroups.length === 0 && (
                    <button
                      type="button"
                      onClick={openFullNotificationsPage}
                      className="text-[13.5px] font-medium text-[#1877F2] dark:text-[#4599FF] hover:bg-slate-100 dark:hover:bg-slate-800 px-2 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      See all
                    </button>
                  )}
                </div>
                <div className="space-y-0.5">
                  {earlierGroups.map((group) => (
                    <FacebookNotificationRow
                      key={group.key}
                      group={group}
                      compact
                      pendingConnectionId={
                        group.primary.actorId ? pendingConnByRequester[group.primary.actorId] : null
                      }
                      connectionDecision={connDecisionByKey[group.key] || null}
                      connectionBusy={connBusyKey === group.key}
                      onRespondConnection={handleRespondConnection}
                      onClick={handleOpenGroup}
                      onToggleRead={handleToggleGroupRead}
                      onRemove={handleRemoveGroup}
                    />
                  ))}
                </div>
              </div>
            )}

            {limitedGroups.length === 0 && (
              <div className="py-14 px-6 text-center flex flex-col items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-3">
                  <BellOff className="w-6 h-6" />
                </div>
                <p className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">
                  {activeTab === 'unread' ? 'No unread notifications' : 'You have no notifications'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {activeTab === 'unread'
                    ? 'You are all caught up on recent activity.'
                    : 'Likes, comments, messages, and alumni alerts will appear here.'}
                </p>
              </div>
            )}

            {/* Facebook Bottom Action: See previous notifications / See all */}
            {limitedGroups.length > 0 && (
              <div className="px-3 pt-2.5 pb-1">
                {hasMore ? (
                  <button
                    type="button"
                    onClick={() => setVisibleLimit((prev) => prev + 12)}
                    className="w-full min-h-[38px] rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-[13.5px] font-semibold text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
                  >
                    See previous notifications
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={openFullNotificationsPage}
                    className="w-full min-h-[38px] rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-[13.5px] font-semibold text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
                  >
                    See all in Notifications
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
