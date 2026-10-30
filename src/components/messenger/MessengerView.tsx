import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Sliders, X, ArrowRight, Shield, RefreshCw, Send, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { isUserSuperAdmin } from '../../types';
import {
  deleteMessage,
  editMessage,
  findOrCreateDirectConversation,
  listConversations,
  listMessages,
  markConversationRead,
  sendMessage,
  subscribeToMessageChanges,
  subscribeToTypingStatus,
  sendTypingIndicator,
  subscribeToRealtimeConnectionStatus,
  getRealtimeChannelStatus,
  getUserMessageSettings,
  broadcastMessageEvent,
} from '../../services/messagingService';
import type { ChatConversation, ChatMessage } from '../../types/messaging';
import { playSound } from '../../utils/audio';
import { ConversationList } from './ConversationList';
import { ChatThread } from './ChatThread';
import { NewChatModal } from './NewChatModal';
import { ConversationSettingsPanel } from './ConversationSettingsPanel';
import { MessageSettingsModal } from './MessageSettingsModal';

interface MessengerViewProps {
  initialTargetProfileId?: number | null;
  onClearInitialTarget?: () => void;
}

export const MessengerView: React.FC<MessengerViewProps> = ({
  initialTargetProfileId,
  onClearInitialTarget,
}) => {
  const { currentUser, isAdminUser } = useAuth();
  const myId = currentUser.id;
  const isSuperAdmin = currentUser.role === 'admin' || isAdminUser;

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [realtimeStatus, setRealtimeStatus] = useState<'SUBSCRIBED' | 'CONNECTING' | 'CLOSED' | 'OFFLINE'>(
    getRealtimeChannelStatus()
  );
  const [activeTypingText, setActiveTypingText] = useState<string | null>(null);
  const [incomingToast, setIncomingToast] = useState<{
    conversationId: string;
    senderName: string;
    body: string;
  } | null>(null);

  const [showNewChat, setShowNewChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMessageSettingsModal, setShowMessageSettingsModal] = useState(false);
  const [showSuperAdminModal, setShowSuperAdminModal] = useState(false);
  const [adminBroadcastText, setAdminBroadcastText] = useState('');
  const [adminBroadcastSending, setAdminBroadcastSending] = useState(false);
  const [adminBroadcastSuccess, setAdminBroadcastSuccess] = useState(false);

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const lastTypingSentRef = useRef<number>(0);

  const refreshConversations = useCallback(async () => {
    try {
      setListError(null);
      const data = await listConversations(myId);
      setConversations(data);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not load your conversations.');
    } finally {
      setListLoading(false);
    }
  }, [myId]);

  // Load conversations on mount
  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  // Auto-open direct conversation when targeted from a profile
  useEffect(() => {
    if (!initialTargetProfileId || initialTargetProfileId === myId) return;
    let cancelled = false;

    (async () => {
      try {
        const convId = await findOrCreateDirectConversation(myId, initialTargetProfileId);
        if (cancelled) return;
        await refreshConversations();
        setActiveId(convId);
        onClearInitialTarget?.();
      } catch (err) {
        console.warn('Failed to auto-open direct conversation from profile:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialTargetProfileId, myId, refreshConversations, onClearInitialTarget]);

  // 1. Subscribe to Supabase Realtime channel status
  useEffect(() => {
    return subscribeToRealtimeConnectionStatus((status) => {
      setRealtimeStatus(status);
    });
  }, []);

  // 2. Subscribe to Supabase Realtime typing events
  useEffect(() => {
    let clearTimer: any = null;
    const unsub = subscribeToTypingStatus((data) => {
      if (data.conversationId === activeIdRef.current && data.profileId !== myId) {
        setActiveTypingText(`${data.fullName || 'Colleague'} is typing...`);
        clearTimeout(clearTimer);
        clearTimer = setTimeout(() => {
          setActiveTypingText(null);
        }, 3200);
      }
    });

    return () => {
      unsub();
      clearTimeout(clearTimer);
    };
  }, [myId]);

  // 3. Load active conversation messages when selection changes
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setActiveTypingText(null);
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

  // 4. Primary Supabase Real-Time incoming message subscription
  useEffect(() => {
    return subscribeToMessageChanges((message) => {
      // Clear peer typing indicator once message arrives
      if (message.conversationId === activeIdRef.current && message.senderId !== myId) {
        setActiveTypingText(null);
      }

      // Case A: The message belongs to current open thread
      if (message.conversationId === activeIdRef.current) {
        setMessages((prev) => {
          const index = prev.findIndex((m) => m.id === message.id);
          if (index !== -1) {
            const next = [...prev];
            next[index] = message;
            return next;
          }
          return [...prev, message];
        });

        if (message.senderId !== myId) {
          void markConversationRead(message.conversationId, myId);
          void getUserMessageSettings(myId).then((settings) => {
            if (settings.soundEnabled) {
              playSound('notification');
            }
          });
        }
      }

      // Case B: Update conversation list in real-time
      setConversations((prev) => {
        const targetIdx = prev.findIndex((c) => c.id === message.conversationId);
        const isCurrentActive = message.conversationId === activeIdRef.current;
        const isFromMe = message.senderId === myId;

        if (targetIdx !== -1) {
          const target = prev[targetIdx];
          const updatedTarget: ChatConversation = {
            ...target,
            lastMessagePreview: message.deletedAt ? 'Message deleted' : message.body,
            lastMessageAt: message.createdAt,
            lastMessageFromMe: isFromMe,
            unreadCount: isCurrentActive || isFromMe ? 0 : target.unreadCount + 1,
          };

          if (!isCurrentActive && !isFromMe) {
            setIncomingToast({
              conversationId: message.conversationId,
              senderName: target.person.fullName || 'SZMC Colleague',
              body: message.body,
            });
            void getUserMessageSettings(myId).then((settings) => {
              if (settings.soundEnabled) {
                playSound('notification');
              }
            });
          }

          const nextList = prev.filter((_, i) => i !== targetIdx);
          return [updatedTarget, ...nextList];
        } else {
          void refreshConversations();
          return prev;
        }
      });
    });
  }, [myId, refreshConversations]);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;

  // Handle outgoing typing indicator broadcast
  const handleTyping = useCallback(() => {
    if (!activeId) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 2000) {
      lastTypingSentRef.current = now;
      sendTypingIndicator(activeId, myId, currentUser.fullName || 'SZMC Doctor');
    }
  }, [activeId, myId, currentUser.fullName]);

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

  // Super Admin: Broadcast official announcement across alumni threads
  const handleSendAdminBroadcast = async () => {
    if (!adminBroadcastText.trim() || adminBroadcastSending) return;
    setAdminBroadcastSending(true);
    setAdminBroadcastSuccess(false);
    try {
      // Send to active conversation or broadcast channel event
      if (activeId) {
        await sendMessage(activeId, myId, `📢 [OFFICIAL ANNOUNCEMENT]: ${adminBroadcastText.trim()}`);
      }
      broadcastMessageEvent('new_message', {
        id: `adm-${Date.now()}`,
        conversationId: activeId || 'global-announcement',
        senderId: myId,
        body: `📢 [OFFICIAL ANNOUNCEMENT]: ${adminBroadcastText.trim()}`,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
      });
      setAdminBroadcastSuccess(true);
      setAdminBroadcastText('');
      playSound('like');
      setTimeout(() => setAdminBroadcastSuccess(false), 3000);
    } catch (err) {
      console.warn('Admin broadcast error:', err);
    } finally {
      setAdminBroadcastSending(false);
    }
  };

  const showThreadOnMobile = Boolean(activeId);

  return (
    <div className="space-y-3 relative">
      {/* Top Messenger Bar (Meta Messenger inspired, zero developer clutter for regular members) */}
      <div className="flex flex-wrap items-center justify-between gap-3 min-w-0 pb-1">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#0084FF] via-[#00A3FF] to-[#00C6FF] text-white flex items-center justify-center shadow-md shadow-[#0084FF]/25 shrink-0">
            <MessageCircle className="w-5 h-5 fill-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
              Messenger
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Connect instantly with fellow SZMC doctors & batchmates
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2">
          {/* SUPER ADMIN ONLY: Full System Console Button */}
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setShowSuperAdminModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all shadow-sm shadow-purple-500/25 cursor-pointer"
              title="Super Admin Messenger System Controls"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Super Admin Console</span>
            </button>
          )}

          {/* Settings button - ONLY visible for admin / super-admin, hidden from normal alumni */}
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setShowMessageSettingsModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors shadow-2xs cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-[#0084FF]" />
              <span>Settings</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Two-Column Meta Messenger Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 h-[calc(100vh-210px)] min-h-[540px]">
        {/* Left Column: Conversation List */}
        <div className={`${showThreadOnMobile ? 'hidden lg:flex' : 'flex'} min-h-0`}>
          <ConversationList
            conversations={conversations}
            loading={listLoading}
            error={listError}
            activeId={activeId}
            onSelect={(id) => {
              setShowSettings(false);
              setActiveId(id);
              if (incomingToast && incomingToast.conversationId === id) {
                setIncomingToast(null);
              }
            }}
            onNewChat={() => setShowNewChat(true)}
            onOpenSettings={isSuperAdmin ? () => setShowMessageSettingsModal(true) : undefined}
            onRetry={() => void refreshConversations()}
          />
        </div>

        {/* Right Column: Chat Thread or Empty Placeholder */}
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
                typingText={activeTypingText}
                isPeerOnline={true}
                onTyping={handleTyping}
                onBack={() => setActiveId(null)}
                onOpenSettings={() => setShowSettings(true)}
                onSend={handleSend}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            )
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 shadow-sm">
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#0084FF] to-[#00C6FF] text-white flex items-center justify-center mb-4 shadow-md shadow-[#0084FF]/25">
                <MessageCircle className="w-8 h-8 fill-white" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Select a chat or start a new conversation
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                Search for any SZMC doctor or batchmate from the left column to exchange clinical updates, reunion plans, and batch news.
              </p>
              <button
                type="button"
                onClick={() => setShowNewChat(true)}
                className="mt-4 px-4 py-2 rounded-full bg-[#0084FF] hover:bg-[#0073E6] text-white text-xs font-bold transition-all shadow-sm shadow-[#0084FF]/30 cursor-pointer"
              >
                Start New Chat
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Realtime Floating Incoming Message Banner */}
      {incomingToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full rounded-2xl bg-white dark:bg-slate-900 border border-[#0084FF]/30 shadow-2xl p-4 flex items-start gap-3 animate-fadeIn">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#0084FF] to-[#00A3FF] text-white flex items-center justify-center shrink-0 shadow-sm shadow-[#0084FF]/30">
            <MessageCircle className="w-5 h-5 fill-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {incomingToast.senderName}
              </p>
              <span className="text-[10px] text-[#0084FF] font-bold uppercase">
                New Message
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 truncate mt-1">
              {incomingToast.body}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveId(incomingToast.conversationId);
                  setIncomingToast(null);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0084FF] hover:underline cursor-pointer"
              >
                <span>Open chat</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIncomingToast(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showNewChat && (
        <NewChatModal myId={myId} onClose={() => setShowNewChat(false)} onStarted={handleStartChat} />
      )}

      {/* Admin Message Settings & Schema Tools (Hidden from normal alumni) */}
      {isSuperAdmin && (
        <MessageSettingsModal
          isOpen={showMessageSettingsModal}
          onClose={() => setShowMessageSettingsModal(false)}
          profileId={myId}
          batchYear={currentUser.batchYear}
        />
      )}

      {/* SUPER ADMIN CONSOLE MODAL (Dr. Nurul Anam Bashir Only) */}
      {showSuperAdminModal && isSuperAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-800 shadow-2xl p-6 space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Super Admin Messenger Console
                  </h3>
                  <p className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">
                    Authorized: {currentUser.fullName} ({currentUser.email})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSuperAdminModal(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Pipeline Diagnostics */}
            <div className="p-3.5 rounded-2xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
                <span>Supabase Realtime Channel:</span>
                <span className="font-mono text-purple-700 dark:text-purple-300">
                  messages-realtime-feed ({realtimeStatus})
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Total Active Conversations:</span>
                <span className="font-bold text-slate-900 dark:text-white">{conversations.length}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Supabase Project URL:</span>
                <span className="font-mono text-[10px]">hjuyiqyviohinbhzaipl.supabase.co</span>
              </div>
            </div>

            {/* Admin Broadcast Announcement Tool */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Broadcast System Announcement
              </label>
              <textarea
                value={adminBroadcastText}
                onChange={(e) => setAdminBroadcastText(e.target.value)}
                placeholder="Type an urgent institutional message to broadcast to all alumni..."
                rows={3}
                className="w-full p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500/30"
              />
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setShowSuperAdminModal(false);
                    setShowMessageSettingsModal(true);
                  }}
                  className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
                >
                  Open Message Settings
                </button>
                <button
                  type="button"
                  onClick={handleSendAdminBroadcast}
                  disabled={!adminBroadcastText.trim() || adminBroadcastSending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm cursor-pointer"
                >
                  {adminBroadcastSending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Broadcast Now</span>
                </button>
              </div>
              {adminBroadcastSuccess && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Announcement dispatched via Supabase Realtime channel!
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
