import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BellOff, Check, MoreHorizontal, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { NotificationItem } from '../../types/notification.types';
import {
  loadMergedNotifications,
  removeLocalNotificationsByIds,
  saveLocalNotifications,
  setLocalNotificationsReadState,
} from '../../utils/notificationService';
import {
  deleteNotificationInDb,
  markAllNotificationsReadInDb,
  markNotificationReadInDb,
  markNotificationUnreadInDb,
} from '../../services/supabaseNotificationService';
import { fetchBlockedUserIds } from '../../services/communitySafetyService';
import { categorizeNotification } from '../../services/communitySafetyUtils';
import {
  fetchMyNetworkSummary,
  respondToConnectionRequest,
} from '../../services/socialGraphService';
import { realtimeManager } from '../../services/supabaseRealtimeService';
import {
  GroupedNotification,
  groupFacebookNotifications,
  resolveNotificationDestination,
} from '../../utils/facebookNotifications';
import { FacebookNotificationRow } from './FacebookNotificationRow';

interface NotificationsPageViewProps {
  onNavigate: (route: string) => void;
}

type PageFilter = 'all' | 'unread' | 'requests' | 'social' | 'announcements';

export const NotificationsPageView: React.FC<NotificationsPageViewProps> = ({
  onNavigate,
}) => {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [blockedIds, setBlockedIds] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<PageFilter>('all');
  const [visibleLimit, setVisibleLimit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingConnByRequester, setPendingConnByRequester] = useState<Record<number, number>>({});
  const [connDecisionByKey, setConnDecisionByKey] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [connBusyKey, setConnBusyKey] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const syncAll = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const [blocked, items, summary] = await Promise.all([
        fetchBlockedUserIds(currentUser.id).catch(() => [] as number[]),
        loadMergedNotifications(currentUser.id).catch(() => [] as NotificationItem[]),
        fetchMyNetworkSummary(currentUser.id).catch(() => null),
      ]);
      setBlockedIds(new Set(blocked));
      setNotifications(items || []);
      if (summary) {
        const map: Record<number, number> = {};
        summary.incomingRequests.forEach((req) => {
          if (req.peer?.id && req.id) {
            map[Number(req.peer.id)] = Number(req.id);
          }
        });
        setPendingConnByRequester(map);
      }
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    void syncAll();
    const handleSync = () => void syncAll();
    window.addEventListener('szmc_notifications_updated', handleSync);
    window.addEventListener('szmc_blocks_updated', handleSync);

    const unsubRealtime = realtimeManager.subscribeToUserNotifications(currentUser.id, () => {
      void syncAll();
    });

    return () => {
      window.removeEventListener('szmc_notifications_updated', handleSync);
      window.removeEventListener('szmc_blocks_updated', handleSync);
      unsubRealtime();
    };
  }, [currentUser.id, syncAll]);

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

  const visibleNotifications = useMemo(
    () => notifications.filter((n) => !(n.actorId && blockedIds.has(n.actorId))),
    [notifications, blockedIds]
  );

  const unreadCount = useMemo(
    () => visibleNotifications.filter((n) => n.unread).length,
    [visibleNotifications]
  );

  const filteredItems = useMemo(() => {
    return visibleNotifications.filter((n) => {
      if (filter === 'unread') return n.unread;
      if (filter === 'requests') {
        return n.type === 'connection_request' || n.type === 'connection_accepted' || n.type === 'new_follower';
      }
      if (filter === 'social') return categorizeNotification(n.type) === 'social';
      if (filter === 'announcements') return categorizeNotification(n.type) === 'announcements';
      return true;
    });
  }, [visibleNotifications, filter]);

  const grouped = useMemo(() => groupFacebookNotifications(filteredItems), [filteredItems]);
  const limitedGroups = useMemo(() => grouped.slice(0, visibleLimit), [grouped, visibleLimit]);

  const newGroups = useMemo(() => limitedGroups.filter((g) => g.bucket === 'new'), [limitedGroups]);
  const todayGroups = useMemo(() => limitedGroups.filter((g) => g.bucket === 'today'), [limitedGroups]);
  const earlierGroups = useMemo(() => limitedGroups.filter((g) => g.bucket === 'earlier'), [limitedGroups]);

  const handleMarkAllRead = async () => {
    setMenuOpen(false);
    await markAllNotificationsReadInDb(currentUser.id);
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
        currentUser.id,
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

  const filterTabs: { id: PageFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: unreadCount > 0 ? `Unread (${unreadCount})` : 'Unread' },
    { id: 'requests', label: 'Requests' },
    { id: 'social', label: 'Social' },
    { id: 'announcements', label: 'Alerts' },
  ];

  const renderSection = (title: string, items: GroupedNotification[]) => {
    if (items.length === 0) return null;
    return (
      <section className="pt-3 first:pt-1">
        <h2 className="px-4 pb-1.5 text-[16px] font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h2>
        <div className="space-y-0.5">
          {items.map((group) => (
            <FacebookNotificationRow
              key={group.key}
              group={group}
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
      </section>
    );
  };

  return (
    <div className="w-full max-w-[680px] mx-auto pb-8">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/85 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Top Header */}
        <div className="px-4 sm:px-5 pt-4 pb-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              Notifications
            </h1>
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Notification actions"
              aria-expanded={menuOpen}
              className="w-10 h-10 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-1.5 w-60 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700/90 shadow-2xl py-1.5 z-50"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleMarkAllRead}
                  className="w-full px-3.5 py-2.5 text-left text-[13.5px] font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Check className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                  <span>Mark all as read</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onNavigate('settings');
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-[13.5px] font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                  <span>Notification settings</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Facebook Filter Bar */}
        <div className="px-4 sm:px-5 pb-3 flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-100 dark:border-slate-800/80">
          {filterTabs.map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setFilter(tab.id);
                  setVisibleLimit(25);
                }}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-[13.5px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
                  active
                    ? 'bg-[#E7F3FF] text-[#1877F2] dark:bg-[#1877F2]/25 dark:text-[#4599FF]'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="py-2">
          {loading ? (
            <div className="px-4 py-3 space-y-3" aria-hidden="true">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="flex items-center gap-3 py-1">
                  <div className="w-14 h-14 rounded-full fb-shimmer shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-3/4 rounded-md fb-shimmer" />
                    <div className="h-3 w-1/3 rounded-md fb-shimmer" />
                  </div>
                </div>
              ))}
            </div>
          ) : limitedGroups.length === 0 ? (
            <div className="py-16 px-6 text-center flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-3.5">
                <BellOff className="w-7 h-7" />
              </div>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {filter === 'unread'
                  ? 'No unread notifications'
                  : filter === 'requests'
                  ? 'No connection requests yet'
                  : 'You have no notifications'}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                When alumni like or comment on your posts, send connection requests, or post urgent alerts, they will show up right here.
              </p>
            </div>
          ) : (
            <>
              {renderSection('New', newGroups)}
              {renderSection('Today', todayGroups)}
              {renderSection('Earlier', earlierGroups)}

              {grouped.length > visibleLimit && (
                <div className="px-4 pt-4 pb-2">
                  <button
                    type="button"
                    onClick={() => setVisibleLimit((prev) => prev + 25)}
                    className="w-full min-h-[42px] rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
                  >
                    See previous notifications
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
