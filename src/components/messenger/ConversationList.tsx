import React from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import type { ChatConversation } from '../../types/messaging';

interface ConversationListProps {
  conversations: ChatConversation[];
  loading: boolean;
  error: string | null;
  activeId: string | null;
  onSelect: (conversationId: string) => void;
  onNewChat: () => void;
  onRetry: () => void;
}

function formatListTime(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (date.toDateString() === new Date().toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  loading,
  error,
  activeId,
  onSelect,
  onNewChat,
  onRetry,
}) => {
  return (
    <div className="flex-1 flex flex-col min-h-0 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-slate-900 dark:text-white">Chats</span>
        <button
          type="button"
          onClick={onNewChat}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-4 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-2.5 w-1/2 rounded bg-slate-100 dark:bg-slate-800/70" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="m-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p>{error}</p>
              <button type="button" onClick={onRetry} className="mt-1 font-bold underline cursor-pointer">
                Try again
              </button>
            </div>
          </div>
        )}

        {!loading && !error && conversations.length === 0 && (
          <div className="p-6 text-center">
            <p className="text-sm font-bold text-slate-900 dark:text-white">No conversations yet</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Start a chat with any alumni from the directory.</p>
          </div>
        )}

        {!loading &&
          conversations.map((conversation) => {
            const active = conversation.id === activeId;
            const hasUnread = conversation.unreadCount > 0;
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors cursor-pointer ${
                  active ? 'bg-blue-50 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <img
                  src={conversation.person.avatarUrl}
                  alt={conversation.person.fullName}
                  className="w-10 h-10 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm truncate ${
                        hasUnread ? 'font-black text-slate-900 dark:text-white' : 'font-semibold text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {conversation.person.fullName}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                      {formatListTime(conversation.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span
                      className={`text-xs truncate ${
                        hasUnread ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {conversation.lastMessagePreview
                        ? `${conversation.lastMessageFromMe ? 'You: ' : ''}${conversation.lastMessagePreview}`
                        : 'Say hello'}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {conversation.isMuted && <span className="text-[10px] text-slate-400">Muted</span>}
                      {hasUnread && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
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
