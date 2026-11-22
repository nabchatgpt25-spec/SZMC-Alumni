import React, { useMemo, useState } from 'react';
import { AlertTriangle, Megaphone, Plus, Sliders, Search, SquarePen, ShieldCheck, Users, X } from 'lucide-react';
import type { ChatConversation, OnlinePresenceUser } from '../../types/messaging';

interface ConversationListProps {
  conversations: ChatConversation[];
  myId: number;
  onlineProfileIds: Set<number>;
  onlineUsers: OnlinePresenceUser[];
  loading: boolean;
  error: string | null;
  activeId: string | null;
  onSelect: (conversationId: string) => void;
  onStartDirectChat?: (profileId: number) => void;
  onNewChat: () => void;
  onOpenSettings?: () => void;
  onRetry: () => void;
}

function formatListTime(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  if (diffMinutes < 1) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24 && date.toDateString() === now.toDateString()) return `${diffHours}h`;
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  myId,
  onlineProfileIds,
  onlineUsers,
  loading,
  error,
  activeId,
  onSelect,
  onStartDirectChat,
  onNewChat,
  onOpenSettings,
  onRetry,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Live online colleagues from Supabase Realtime Presence (never mock data),
  // excluding myself and any accounts blocked in either direction.
  const activeColleagues = useMemo(() => {
    const blockedIds = new Set<number>();
    conversations.forEach((c) => {
      if (c.isBlockedEitherWay && c.person.profileId) {
        blockedIds.add(c.person.profileId);
      }
    });
    return onlineUsers.filter(
      (user) => user.profileId !== myId && !blockedIds.has(user.profileId)
    );
  }, [onlineUsers, myId, conversations]);

  const filteredConversations = conversations.filter((c) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const nameMatch = c.person.fullName.toLowerCase().includes(term);
    const bodyMatch = c.lastMessagePreview?.toLowerCase().includes(term);
    return nameMatch || bodyMatch;
  });

  return (
    <div className="flex-1 flex flex-col min-h-0 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      {/* Meta Messenger Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-2">
        <h2 className="text-2xl font-black text-slate-950 dark:text-white tracking-tight">
          Chats
        </h2>
        <div className="flex items-center gap-1.5">
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              title="Message Settings"
              className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
            >
              <Sliders className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onNewChat}
            title="New Message"
            className="w-9 h-9 rounded-full bg-[#0084FF] hover:bg-[#0073E6] text-white flex items-center justify-center shadow-sm shadow-[#0084FF]/30 transition-transform active:scale-95 cursor-pointer"
          >
            <SquarePen className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Meta Messenger Search Bar */}
      <div className="px-3 pb-2">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Messenger"
            className="w-full pl-9 pr-8 py-2 rounded-full bg-[#F0F2F5] dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:ring-2 focus:ring-[#0084FF]/30 transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Live Online Colleagues Tray (Real Supabase Realtime Presence) */}
      {activeColleagues.length > 0 ? (
        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800/80 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-3 min-w-max">
            {activeColleagues.map((alumnus) => {
              const existingConv = conversations.find(
                (c) => c.type !== 'group' && c.type !== 'announcement' && c.person.profileId === alumnus.profileId
              );
              return (
                <button
                  key={alumnus.profileId}
                  type="button"
                  onClick={() => {
                    if (existingConv) {
                      onSelect(existingConv.id);
                    } else if (onStartDirectChat) {
                      onStartDirectChat(alumnus.profileId);
                    } else {
                      onNewChat();
                    }
                  }}
                  className="flex flex-col items-center gap-1 group cursor-pointer"
                  title={`Chat with ${alumnus.fullName} (Online now)`}
                >
                  <div className="relative">
                    <img
                      src={alumnus.avatarUrl}
                      alt={alumnus.fullName}
                      className="w-12 h-12 rounded-full object-cover ring-2 ring-transparent group-hover:ring-[#0084FF] transition-all"
                    />
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900 shadow-xs" />
                  </div>
                  <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate max-w-[54px] text-center">
                    {alumnus.fullName.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800/80 flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
          <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />
          <span className="truncate">Active colleagues appear here when online</span>
        </div>
      )}

      {/* Conversation Thread List */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {loading && (
          <div className="p-4 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-2.5 w-1/2 rounded bg-slate-100 dark:bg-slate-800/70" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="m-3 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p>{error}</p>
              <button type="button" onClick={onRetry} className="mt-1 font-bold underline cursor-pointer">
                Try again
              </button>
            </div>
          </div>
        )}

        {!loading && !error && filteredConversations.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              {searchTerm ? 'No conversations match' : 'No chats yet'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {searchTerm ? 'Try searching another colleague name' : 'Say hello to any doctor or alumnus.'}
            </p>
            {!searchTerm && (
              <button
                type="button"
                onClick={onNewChat}
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0084FF] text-white text-xs font-bold hover:bg-[#0073E6] transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Start a Chat
              </button>
            )}
          </div>
        )}

        {!loading &&
          filteredConversations.map((conversation) => {
            const active = conversation.id === activeId;
            const hasUnread = conversation.unreadCount > 0;
            const isDirect = conversation.type !== 'group' && conversation.type !== 'announcement';
            const isOnline =
              isDirect &&
              !conversation.isBlockedEitherWay &&
              onlineProfileIds.has(conversation.person.profileId);

            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-all cursor-pointer ${
                  active
                    ? 'bg-[#EBF5FF] dark:bg-blue-950/50'
                    : 'hover:bg-[#F0F2F5] dark:hover:bg-slate-800/70'
                }`}
              >
                <div className="relative shrink-0">
                  {conversation.type === 'group' ? (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#0084FF] to-indigo-500 text-white flex items-center justify-center shadow-xs">
                      <Users className="w-5 h-5" />
                    </div>
                  ) : conversation.type === 'announcement' ? (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-600 to-[#0084FF] text-white flex items-center justify-center shadow-xs">
                      <Megaphone className="w-5 h-5" />
                    </div>
                  ) : (
                    <img
                      src={conversation.person.avatarUrl}
                      alt={conversation.person.fullName}
                      className="w-12 h-12 rounded-full object-cover ring-1 ring-slate-200/80 dark:ring-slate-700"
                    />
                  )}
                  {isOnline && (
                    <span
                      title="Active now"
                      className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`text-sm truncate flex items-center gap-1 ${
                        hasUnread
                          ? 'font-black text-slate-950 dark:text-white'
                          : 'font-semibold text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <span className="truncate">{conversation.person.fullName}</span>
                      {(conversation.person.verificationStatus === 'verified' ||
                        conversation.type === 'announcement') && (
                        <ShieldCheck className="w-3.5 h-3.5 text-[#0084FF] shrink-0" />
                      )}
                    </span>
                    <span
                      className={`text-[11px] shrink-0 ${
                        hasUnread
                          ? 'text-[#0084FF] font-bold'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {formatListTime(conversation.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span
                      className={`text-xs truncate ${
                        hasUnread
                          ? 'font-bold text-slate-900 dark:text-slate-100'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {conversation.lastMessagePreview
                        ? `${conversation.lastMessageFromMe ? 'You: ' : ''}${conversation.lastMessagePreview}`
                        : 'Say hello 👋'}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {conversation.isMuted && <span className="text-[10px] text-slate-400">Muted</span>}
                      {hasUnread && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#0084FF] text-white text-[10px] font-bold flex items-center justify-center shadow-xs shadow-[#0084FF]/40">
                          {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
      </div>
    </div>
  );
};
