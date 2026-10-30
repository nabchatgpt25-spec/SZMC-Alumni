import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  deleteMessage,
  editMessage,
  listConversations,
  listMessages,
  markConversationRead,
  sendMessage,
  subscribeToMessageChanges,
} from '../../services/messagingService';
import type { ChatConversation, ChatMessage } from '../../types/messaging';
import { ConversationList } from './ConversationList';
import { ChatThread } from './ChatThread';
import { NewChatModal } from './NewChatModal';
import { ConversationSettingsPanel } from './ConversationSettingsPanel';

export const MessengerView: React.FC = () => {
  const { currentUser } = useAuth();
  const myId = currentUser.id;

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  const [showNewChat, setShowNewChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const refreshConversations = useCallback(async () => {
    try {
      setListError(null);
      setConversations(await listConversations(myId));
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not load your conversations.');
    } finally {
      setListLoading(false);
    }
  }, [myId]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(Boolean(data.session));
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (hasSession) void refreshConversations();
  }, [hasSession, refreshConversations]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setThreadLoading(true);
    setThreadError(null);
    (async () => {
      try {
        const rows = await listMessages(activeId);
        if (cancelled) return;
        setMessages(rows);
        await markConversationRead(activeId, myId);
        if (!cancelled) void refreshConversations();
      } catch (err) {
        if (!cancelled) setThreadError(err instanceof Error ? err.message : 'Could not load this conversation.');
      } finally {
        if (!cancelled) setThreadLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, myId, refreshConversations]);

  useEffect(() => {
    if (!hasSession) return;
    return subscribeToMessageChanges((message) => {
      void refreshConversations();
      if (message.conversationId !== activeIdRef.current) return;
      setMessages((prev) => {
        const index = prev.findIndex((m) => m.id === message.id);
        if (index === -1) return [...prev, message];
        const next = prev.slice();
        next[index] = message;
        return next;
      });
      if (message.senderId !== myId) {
        void markConversationRead(message.conversationId, myId);
      }
    });
  }, [hasSession, myId, refreshConversations]);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;

  const handleSend = async (body: string): Promise<boolean> => {
    if (!activeId) return false;
    setSending(true);
    setThreadError(null);
    try {
      const sent = await sendMessage(activeId, myId, body);
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      void refreshConversations();
      return true;
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : 'Your message could not be sent.');
      return false;
    } finally {
      setSending(false);
    }
  };

  const handleEdit = async (messageId: string, body: string): Promise<boolean> => {
    try {
      const updated = await editMessage(messageId, body);
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      return true;
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : 'Your message could not be edited.');
      return false;
    }
  };

  const handleDelete = async (messageId: string) => {
    try {
      const updated = await deleteMessage(messageId);
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      void refreshConversations();
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : 'Your message could not be deleted.');
    }
  };

  const handleStartChat = (conversationId: string) => {
    setShowNewChat(false);
    setShowSettings(false);
    setActiveId(conversationId);
    void refreshConversations();
  };

  const handleLeft = () => {
    setShowSettings(false);
    setActiveId(null);
    void refreshConversations();
  };

  if (hasSession === false) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/25 shrink-0">
            <MessageCircle className="w-5 h-5" />
          </div>
          <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">Messages</h1>
        </div>
        <div className="p-8 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60">
          <p className="text-sm font-bold text-slate-900 dark:text-white">Create an account to use Messages</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Private messages need a registered account on the alumni network. Sign up or sign in with your email and password to start chatting.
          </p>
        </div>
      </div>
    );
  }

  const showThreadOnMobile = Boolean(activeId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/25 shrink-0">
          <MessageCircle className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">Messages</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Private conversations with fellow SZMCians</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[520px]">
        <div className={`${showThreadOnMobile ? 'hidden lg:flex' : 'flex'} min-h-0`}>
          <ConversationList
            conversations={conversations}
            loading={listLoading}
            error={listError}
            activeId={activeId}
            onSelect={(id) => {
              setShowSettings(false);
              setActiveId(id);
            }}
            onNewChat={() => setShowNewChat(true)}
            onRetry={() => void refreshConversations()}
          />
        </div>

        <div className={`${showThreadOnMobile ? 'flex' : 'hidden lg:flex'} min-h-0 min-w-0`}>
          {activeConversation ? (
            showSettings ? (
              <ConversationSettingsPanel
                conversation={activeConversation}
                myId={myId}
                onBack={() => setShowSettings(false)}
                onLeft={handleLeft}
                onMutedChange={(muted) =>
                  setConversations((prev) =>
                    prev.map((c) => (c.id === activeConversation.id ? { ...c, isMuted: muted } : c))
                  )
                }
              />
            ) : (
              <ChatThread
                conversation={activeConversation}
                messages={messages}
                myId={myId}
                loading={threadLoading}
                error={threadError}
                sending={sending}
                onBack={() => setActiveId(null)}
                onOpenSettings={() => setShowSettings(true)}
                onSend={handleSend}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            )
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60">
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
                <MessageCircle className="w-7 h-7" />
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">Select a conversation</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                Choose a conversation on the left or start a new one with an alumni.
              </p>
            </div>
          )}
        </div>
      </div>

      {showNewChat && (
        <NewChatModal myId={myId} onClose={() => setShowNewChat(false)} onStarted={handleStartChat} />
      )}
    </div>
  );
};
