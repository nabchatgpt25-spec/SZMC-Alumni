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
  User,
  BellOff,
  Heart,
} from 'lucide-react';
import { NotificationItem } from '../types/notification.types';
import {
  loadMergedNotifications,
  saveLocalNotifications,
} from '../utils/notificationService';
import { markNotificationReadInDb } from '../services/supabaseNotificationService';

interface NotificationDropdownProps {
  currentUserId: number;
  onNavigate?: (route: string) => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  currentUserId,
  onNavigate,
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all');
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => n.unread).length;

  const syncNotifications = () => {
    if (currentUserId) {
      loadMergedNotifications(currentUserId)
        .then((items) => {
          if (items) setNotifications(items);
        })
        .catch(console.warn);
    }
  };

  useEffect(() => {
    syncNotifications();
    window.addEventListener('ndc_notifications_updated', syncNotifications);
    window.addEventListener('storage', syncNotifications);
    return () => {
      window.removeEventListener('ndc_notifications_updated', syncNotifications);
      window.removeEventListener('storage', syncNotifications);
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

  const markAllAsRead = () => {
    const next = notifications.map((n) => {
      markNotificationReadInDb(n.id).catch(() => {});
      return { ...n, unread: false };
    });
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
    if (item.targetRoute && onNavigate) {
      onNavigate(item.targetRoute);
    }
  };

  const dismissNotificationItem = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const next = notifications.filter((n) => n.id !== id);
    setNotifications(next);
    saveLocalNotifications(next);
  };

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
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Floating Dropdown */}
      {showNotifications && (
        <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 w-auto sm:w-[420px] max-w-sm sm:max-w-none bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 py-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150 mx-auto sm:mx-0">
          {/* Header */}
          <div className="px-4 pb-2.5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  Notifications
                </h3>
                {unreadCount > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer py-1 px-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Mark all as read</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowNotifications(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* All / Unread Filter Tabs */}
            <div className="flex items-center gap-1.5 mt-2.5">
              <button
                type="button"
                onClick={() => setNotifFilter('all')}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  notifFilter === 'all'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setNotifFilter('unread')}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  notifFilter === 'unread'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>Unread</span>
                {unreadCount > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      notifFilter === 'unread' ? 'bg-white/20 text-white' : 'bg-rose-500 text-white'
                    }`}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Notifications Scroll List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100/80 dark:divide-slate-800/60">
            {notifications
              .filter((n) => notifFilter === 'all' || n.unread)
              .map((item) => {
                const isLike = item.type === 'like';
                const isComment = item.type === 'comment';
                const isBlood = item.type === 'blood';
                const isMentorship = item.type === 'mentorship';
                const isCareer = item.type === 'career';

                return (
                  <div
                    key={item.id}
                    onClick={() => markItemAsRead(item)}
                    className={`px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors relative flex items-start gap-3 group ${
                      item.unread ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
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
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 ring-2 ring-rose-200 dark:ring-rose-900'
                              : isMentorship
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 ring-2 ring-amber-200 dark:ring-amber-900'
                              : isCareer
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 ring-2 ring-emerald-200 dark:ring-emerald-900'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300'
                          }`}
                        >
                          {isBlood ? (
                            <Droplet className="w-5 h-5 fill-current" />
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
                        className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white ring-2 ring-white dark:ring-slate-900 shadow-xs ${
                          isLike
                            ? 'bg-blue-600'
                            : isComment
                            ? 'bg-emerald-600'
                            : isBlood
                            ? 'bg-rose-600'
                            : isMentorship
                            ? 'bg-amber-500'
                            : isCareer
                            ? 'bg-emerald-600'
                            : 'bg-indigo-600'
                        }`}
                      >
                        {isLike ? (
                          <ThumbsUp className="w-2.5 h-2.5 fill-current" />
                        ) : isComment ? (
                          <MessageCircle className="w-2.5 h-2.5 fill-current" />
                        ) : isBlood ? (
                          <Heart className="w-2.5 h-2.5 fill-current" />
                        ) : isMentorship ? (
                          <GraduationCap className="w-2.5 h-2.5" />
                        ) : isCareer ? (
                          <Briefcase className="w-2.5 h-2.5" />
                        ) : (
                          <ShieldCheck className="w-2.5 h-2.5" />
                        )}
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
                        <span className={item.actorName ? 'text-slate-700 dark:text-slate-300' : 'font-semibold text-slate-900 dark:text-slate-100'}>
                          {item.actorName ? item.title.replace(item.actorName, '').trim() || item.title : item.title}
                        </span>
                      </p>
                      {item.message && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                          {item.message}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <span
                          className={`text-[11px] ${
                            item.unread
                              ? 'text-blue-600 dark:text-blue-400 font-bold'
                              : 'text-slate-400 dark:text-slate-500 font-medium'
                          }`}
                        >
                          {item.timeAgo}
                        </span>
                        {item.unread && (
                          <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                        )}
                      </div>
                    </div>

                    {/* Item Dismiss Button */}
                    <button
                      type="button"
                      onClick={(e) => dismissNotificationItem(e, item.id)}
                      className="opacity-0 group-hover:opacity-100 absolute top-2.5 right-2.5 p-1 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-all cursor-pointer"
                      title="Dismiss"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

            {notifications.filter((n) => notifFilter === 'all' || n.unread).length === 0 && (
              <div className="py-12 px-4 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-2.5">
                  <BellOff className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {notifFilter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  You're all caught up!
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
