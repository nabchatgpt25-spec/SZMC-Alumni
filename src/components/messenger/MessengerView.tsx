import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MessageCircle,
  Sliders,
  X,
  ArrowRight,
  Shield,
  RefreshCw,
  Send,
  CheckCircle2,
  AlertTriangle,
  Database,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useMessagingProfileId } from '../../hooks/useMessagingProfileId';
import { SUPABASE_API_URL } from '../../lib/supabase';
import {
  checkMessagingHealth,
  type MessagingHealth,
  deleteMessage,
  editMessage,
  findOrCreateDirectConversation,
  listConversations,
  listMessagesPage,
  markConversationRead,
  sendMessage,
  subscribeToMessageChanges,
  subscribeToTypingStatus,
  sendTypingIndicator,
  subscribeToRealtimeConnectionStatus,
  subscribeToRealtimeReconnect,
  subscribeToConversationChanges,
  subscribeToReadReceipts,
  subscribeToOnlinePresence,
  forceReconnectMessagingRealtime,
  getRealtimeChannelStatus,
  getUserMessageSettings,
  publishOfficialAnnouncement,
} from '../../services/messagingService';
import type {
  ChatConversation,
  ChatMessage,
  OnlinePresenceUser,
  UserMessageSettings,
} from '../../types/messaging';
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
  // public.messages.sender_id → public.profiles(id); resolve it from Supabase.
  const { effectiveProfileId } = useMessagingProfileId(currentUser.id);
  const myId = effectiveProfileId ?? currentUser.id;
  const isSuperAdmin = currentUser.role === 'admin' || isAdminUser;

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [health, setHealth] = useState<MessagingHealth | null>(null);
  const [healthChecking, setHealthChecking] = useState(false);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [realtimeStatus, setRealtimeStatus] = useState<'SUBSCRIBED' | 'CONNECTING' | 'CLOSED' | 'OFFLINE'>(
    getRealtimeChannelStatus()
  );
  const [onlineUsers, setOnlineUsers] = useState<OnlinePresenceUser[]>([]);
  const onlineProfileIds = useMemo(
    () => new Set(onlineUsers.map((u) => u.profileId)),
    [onlineUsers]
  );
  const [userSettings, setUserSettings] = useState<UserMessageSettings | null>(null);
  const userSettingsRef = useRef<UserMessageSettings | null>(null);
  userSettingsRef.current = userSettings;

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
  const [adminBroadcastError, setAdminBroadcastError] = useState<string | null>(null);

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const conversationsRef = useRef<ChatConversation[]>([]);
  conversationsRef.current = conversations;
  const lastTypingSentRef = useRef<number>(0);
  const refreshDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshConversations = useCallback(async () => {
    try {
      setListError(null);
      const data = await listConversations(myId);
      setConversations(data);
      setHealth(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not load your conversations.');
      // Diagnose the real cause (missing tables, recursive RLS, unlinked profile…)
      // so the user is told exactly what to fix instead of a generic failure.
      try {
        setHealth(await checkMessagingHealth());
      } catch {
        /* diagnostics are best-effort */
      }
    } finally {
      setListLoading(false);
    }
  }, [myId]);

  const runHealthCheck = useCallback(async () => {
    setHealthChecking(true);
    try {
      const result = await checkMessagingHealth();
      setHealth(result);
      if (result.healthy) {
        await refreshConversations();
      }
    } finally {
      setHealthChecking(false);
    }
  }, [refreshConversations]);

  const scheduleRefreshConversations = useCallback(() => {
    if (refreshDebounceTimerRef.current) {
      clearTimeout(refreshDebounceTimerRef.current);
    }
    refreshDebounceTimerRef.current = setTimeout(() => {
      refreshDebounceTimerRef.current = null;
      void refreshConversations();
    }, 250);
  }, [refreshConversations]);

  useEffect(() => {
    return () => {
      if (refreshDebounceTimerRef.current) {
        clearTimeout(refreshDebounceTimerRef.current);
      }
    };
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const settings = await getUserMessageSettings(myId);
      setUserSettings(settings);
    } catch {
      /* fallback defaults */
    }
  }, [myId]);

  // Load conversations and user settings on mount
  useEffect(() => {
    void refreshConversations();
    void loadSettings();
  }, [refreshConversations, loadSettings]);

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

  // 1a. Subscribe to real Supabase Realtime Presence (live online colleagues)
  useEffect(() => {
    if (!myId) return;
    return subscribeToOnlinePresence(
      {
        profileId: myId,
        fullName: currentUser.fullName || 'SZMC Alumnus',
        avatarUrl: currentUser.avatarUrl || '/szmc-logo.png',
        batchYear: currentUser.batchYear || 20,
      },
      (users) => {
        setOnlineUsers(users);
      }
    );
  }, [myId, currentUser.fullName, currentUser.avatarUrl, currentUser.batchYear]);

  // 1b. Refresh the inbox (debounced) whenever chat memberships/metadata change in Postgres
  useEffect(() => {
    return subscribeToConversationChanges(() => {
      scheduleRefreshConversations();
    });
  }, [scheduleRefreshConversations]);

  // 1c. Live read receipts: update peerLastReadAt directly in conversations without full refetch
  useEffect(() => {
    return subscribeToReadReceipts((receipt) => {
      if (receipt.profileId === myId) return;
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== receipt.conversationId) return c;
          if (c.peerLastReadAt && c.peerLastReadAt >= receipt.lastReadAt) return c;
          return { ...c, peerLastReadAt: receipt.lastReadAt };
        })
      );
    });
  }, [myId]);

  // 1d. Reconcile missed conversations & active thread messages on Realtime reconnect or tab wake
  useEffect(() => {
    return subscribeToRealtimeReconnect(() => {
      void refreshConversations();
      const currentActiveId = activeIdRef.current;
      if (!currentActiveId) return;
      void listMessagesPage(currentActiveId, { limit: 50 }).then(({ messages: latestPage }) => {
        if (activeIdRef.current !== currentActiveId) return;
        setMessages((prev) => {
          const map = new Map<string, ChatMessage>();
          prev.forEach((m) => {
            if (!m.clientTempId || m.status === 'failed' || m.status === 'sending') {
              map.set(m.id, m);
            }
          });
          latestPage.forEach((m) => map.set(m.id, m));
          return Array.from(map.values()).sort((a, b) =>
            a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
          );
        });
      }).catch(() => {});
    });
  }, [refreshConversations]);

  // 1e. Refresh conversations whenever blocked accounts change anywhere in the app
  useEffect(() => {
    const onBlocksUpdated = () => {
      void refreshConversations();
    };
    window.addEventListener('szmc_blocks_updated', onBlocksUpdated);
    return () => window.removeEventListener('szmc_blocks_updated', onBlocksUpdated);
  }, [refreshConversations]);

  // 2. Subscribe to per-conversation scoped Supabase Realtime typing events ONLY for activeId
  useEffect(() => {
    if (!activeId) {
      setActiveTypingText(null);
      return;
    }
    let clearTimer: any = null;
    const unsub = subscribeToTypingStatus(activeId, (data) => {
      if (data.conversationId === activeId && data.profileId !== myId) {
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
  }, [activeId, myId]);

  // 3. Load active conversation messages (cursor-paginated first page) when selection changes
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setHasMoreMessages(false);
      setActiveTypingText(null);
      return;
    }
    let cancelled = false;
    setThreadLoading(true);
    setThreadError(null);
    setHasMoreMessages(false);
    (async () => {
      try {
        const { messages: rows, hasMore } = await listMessagesPage(activeId, { limit: 50 });
        if (cancelled) return;
        setMessages(rows);
        setHasMoreMessages(hasMore);
        await markConversationRead(activeId, myId);
        if (!cancelled) {
          setConversations((prev) =>
            prev.map((c) => (c.id === activeId ? { ...c, unreadCount: 0 } : c))
          );
        }
      } catch (err) {
        if (!cancelled) setThreadError(err instanceof Error ? err.message : 'Could not load this conversation.');
      } finally {
        if (!cancelled) setThreadLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, myId]);

  const handleLoadOlder = useCallback(async () => {
    if (!activeId || loadingOlder || !hasMoreMessages) return;
    const oldestConfirmed = messages.find((m) => !m.clientTempId);
    if (!oldestConfirmed) return;
    setLoadingOlder(true);
    try {
      const { messages: older, hasMore } = await listMessagesPage(activeId, {
        limit: 50,
        beforeCreatedAt: oldestConfirmed.createdAt,
      });
      setHasMoreMessages(hasMore);
      if (older.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const uniqueOlder = older.filter((m) => !existingIds.has(m.id));
          return [...uniqueOlder, ...prev];
        });
      }
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : 'Could not load older messages.');
    } finally {
      setLoadingOlder(false);
    }
  }, [activeId, loadingOlder, hasMoreMessages, messages]);

  // 4. Primary Supabase Real-Time incoming message subscription (INSERT vs UPDATE/DELETE aware)
  useEffect(() => {
    return subscribeToMessageChanges((message, meta) => {
      const isNewInsert = meta.eventType === 'INSERT';
      const isCurrentActive = message.conversationId === activeIdRef.current;
      const isFromMe = message.senderId === myId;
      const settings = userSettingsRef.current;
      const soundAllowed = settings?.soundEnabled ?? true;
      const previewAllowed = settings?.notificationPreviewEnabled ?? true;
      const existingConv = conversationsRef.current.find((c) => c.id === message.conversationId);
      const isMuted = Boolean(existingConv?.isMuted);

      // Clear peer typing indicator once a new message arrives
      if (isNewInsert && isCurrentActive && !isFromMe) {
        setActiveTypingText(null);
      }

      // Case A: The message belongs to current open thread
      if (isCurrentActive) {
        setMessages((prev) => {
          const index = prev.findIndex((m) => m.id === message.id);
          if (index !== -1) {
            const next = [...prev];
            next[index] = { ...message, status: 'sent' };
            return next;
          }
          // Reconcile optimistic sending bubble if postgres_changes arrives before sendMessage resolves
          if (isNewInsert && isFromMe) {
            const optimisticIdx = prev.findIndex(
              (m) => m.status === 'sending' && m.senderId === myId && m.body === message.body
            );
            if (optimisticIdx !== -1) {
              const next = [...prev];
              next[optimisticIdx] = { ...message, status: 'sent' };
              return next;
            }
          }
          return [...prev, { ...message, status: 'sent' }];
        });

        if (isNewInsert && !isFromMe) {
          void markConversationRead(message.conversationId, myId);
          if (soundAllowed && !isMuted) {
            playSound('notification');
          }
        }
      }

      // Case B: Update conversation list cleanly
      if (!isNewInsert) {
        // Edits/deletes must NEVER increment unread counts, play sounds, fire toasts,
        // or bump old threads to the top — simply schedule a debounced sync for preview accuracy.
        scheduleRefreshConversations();
        return;
      }

      setConversations((prev) => {
        const targetIdx = prev.findIndex((c) => c.id === message.conversationId);

        if (targetIdx !== -1) {
          const target = prev[targetIdx];
          const updatedTarget: ChatConversation = {
            ...target,
            lastMessagePreview: message.deletedAt
              ? 'Message deleted'
              : message.type === 'image' || message.mediaUrl
              ? message.body && message.body !== 'Photo'
                ? `📷 ${message.body}`
                : '📷 Photo'
              : message.body,
            lastMessageAt: message.createdAt,
            lastMessageFromMe: isFromMe,
            unreadCount: isCurrentActive || isFromMe ? 0 : target.unreadCount + 1,
          };

          if (!isCurrentActive && !isFromMe && !target.isMuted) {
            setIncomingToast({
              conversationId: message.conversationId,
              senderName: target.person.fullName || 'SZMC Colleague',
              body: previewAllowed ? updatedTarget.lastMessagePreview : 'Sent you a new message',
            });
            if (soundAllowed) {
              playSound('notification');
            }
          }

          const nextList = prev.filter((_, i) => i !== targetIdx);
          return [updatedTarget, ...nextList];
        } else {
          scheduleRefreshConversations();
          return prev;
        }
      });
    });
  }, [myId, scheduleRefreshConversations]);

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

  // Optimistic message send with server reconciliation and inline retry support
  const dispatchSend = async (targetConversationId: string, body: string, existingTempId?: string): Promise<boolean> => {
    const tempId = existingTempId ?? `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      clientTempId: tempId,
      conversationId: targetConversationId,
      senderId: myId,
      body,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      type: body === '👍' ? 'like' : 'text',
      mediaUrl: null,
      status: 'sending',
    };

    setSending(true);
    setThreadError(null);
    setMessages((prev) => {
      if (existingTempId) {
        return prev.map((m) => (m.id === existingTempId ? { ...m, status: 'sending' } : m));
      }
      return [...prev, optimisticMsg];
    });

    try {
      const sent = await sendMessage(targetConversationId, myId, body);
      setMessages((prev) => {
        const alreadyHasServerRow = prev.some((m) => m.id === sent.id);
        if (alreadyHasServerRow) {
          return prev.filter((m) => m.id !== tempId);
        }
        return prev.map((m) => (m.id === tempId ? { ...sent, status: 'sent' } : m));
      });
      scheduleRefreshConversations();
      return true;
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
      );
      setThreadError(err instanceof Error ? err.message : 'Your message could not be sent.');
      return false;
    } finally {
      setSending(false);
    }
  };

  const handleSend = async (body: string): Promise<boolean> => {
    if (!activeId) return false;
    return dispatchSend(activeId, body);
  };

  const handleRetrySend = (failedMessage: ChatMessage) => {
    if (!activeId) return;
    void dispatchSend(activeId, failedMessage.body, failedMessage.id);
  };

  const handleDismissFailed = (tempId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== tempId));
  };

  const handleStartDirectFromPresence = async (peerProfileId: number) => {
    try {
      const convId = await findOrCreateDirectConversation(myId, peerProfileId);
      await refreshConversations();
      setShowSettings(false);
      setActiveId(convId);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unable to start conversation.');
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
      const targetMsg = messages.find((m) => m.id === messageId);
      const isModeratingOther = Boolean(targetMsg && targetMsg.senderId !== myId && isSuperAdmin);
      const updated = await deleteMessage(messageId, { asModerator: isModeratingOther });
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

  // Super Admin: Persist & broadcast an official institutional announcement in Supabase
  const handleSendAdminBroadcast = async () => {
    if (!adminBroadcastText.trim() || adminBroadcastSending) return;
    setAdminBroadcastSending(true);
    setAdminBroadcastSuccess(false);
    setAdminBroadcastError(null);
    try {
      const result = await publishOfficialAnnouncement(adminBroadcastText.trim(), activeId);
      setAdminBroadcastSuccess(true);
      setAdminBroadcastText('');
      playSound('like');
      await refreshConversations();
      if (result.conversationId) {
        setActiveId(result.conversationId);
      }
      setTimeout(() => setAdminBroadcastSuccess(false), 3500);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to publish official announcement.';
      setAdminBroadcastError(errMsg);
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

          {/* Privacy & Message Settings — available to ALL authenticated alumni */}
          <button
            type="button"
            onClick={() => setShowMessageSettingsModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors shadow-2xs cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5 text-[#0084FF]" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* Supabase diagnostics — shown when Messenger cannot reach the database */}
      {health && !health.healthy && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3.5 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Database className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                Messenger cannot reach Supabase
              </p>
            </div>
            <button
              type="button"
              onClick={() => void runHealthCheck()}
              disabled={healthChecking}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 dark:text-amber-300 hover:underline disabled:opacity-50 shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${healthChecking ? 'animate-spin' : ''}`} />
              Recheck
            </button>
          </div>

          <ul className="space-y-2">
            {health.issues.map((issue, index) => (
              <li key={`${issue.code}-${index}`} className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-amber-900 dark:text-amber-200">{issue.title}</p>
                  <p className="text-[11px] text-amber-800/90 dark:text-amber-300/80 break-words">
                    {issue.detail}
                  </p>
                  {issue.fix && (
                    <p className="text-[10px] font-mono mt-0.5 text-amber-700 dark:text-amber-400/80 break-all">
                      Apply: {issue.fix}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <p className="text-[10px] font-mono text-amber-700/80 dark:text-amber-400/70 truncate">
            {health.supabaseUrl}
          </p>
        </div>
      )}

      {/* Disconnected / Reconnecting Strip — shown ONLY when live sync is actually interrupted */}
      {(realtimeStatus === 'CLOSED' || realtimeStatus === 'OFFLINE') && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/90 dark:bg-amber-950/40 px-3.5 py-2 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-medium min-w-0">
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {realtimeStatus === 'OFFLINE'
                ? 'You are offline. Messages will sync when your connection returns.'
                : 'Live message sync paused — reconnecting automatically…'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              forceReconnectMessagingRealtime();
              void refreshConversations();
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-200/80 dark:bg-amber-900/60 hover:bg-amber-300/80 dark:hover:bg-amber-900 text-amber-950 dark:text-amber-200 text-[11px] font-bold shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            Reconnect
          </button>
        </div>
      )}

      {/* Main Two-Column Meta Messenger Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 h-[calc(100vh-210px)] min-h-[540px]">
        {/* Left Column: Conversation List */}
        <div className={`${showThreadOnMobile ? 'hidden lg:flex' : 'flex'} min-h-0`}>
          <ConversationList
            conversations={conversations}
            myId={myId}
            onlineProfileIds={onlineProfileIds}
            onlineUsers={onlineUsers}
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
            onStartDirectChat={(pid) => void handleStartDirectFromPresence(pid)}
            onNewChat={() => setShowNewChat(true)}
            onOpenSettings={() => setShowMessageSettingsModal(true)}
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
                onBlockStatusChange={() => void refreshConversations()}
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
                isSuperAdmin={isSuperAdmin}
                readReceiptsEnabled={userSettings?.readReceiptsEnabled ?? true}
                loading={threadLoading}
                hasMoreMessages={hasMoreMessages}
                loadingOlder={loadingOlder}
                error={threadError}
                sending={sending}
                typingText={activeTypingText}
                isPeerOnline={onlineProfileIds.has(activeConversation.person.profileId)}
                onTyping={handleTyping}
                onBack={() => setActiveId(null)}
                onOpenSettings={() => setShowSettings(true)}
                onLoadOlder={handleLoadOlder}
                onSend={handleSend}
                onRetrySend={handleRetrySend}
                onDismissFailed={handleDismissFailed}
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

      {/* Message & Privacy Settings Modal (Accessible to all alumni; admin diagnostics gated inside) */}
      <MessageSettingsModal
        isOpen={showMessageSettingsModal}
        onClose={() => {
          setShowMessageSettingsModal(false);
          void loadSettings();
        }}
        profileId={myId}
        batchYear={currentUser.batchYear}
      />

      {/* SUPER ADMIN CONSOLE MODAL */}
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
                <span>Realtime Sync Mode:</span>
                <span className="font-mono text-purple-700 dark:text-purple-300">
                  messages-db-sync (RLS · {realtimeStatus})
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Total Active Conversations:</span>
                <span className="font-bold text-slate-900 dark:text-white">{conversations.length}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-slate-600 dark:text-slate-400">
                <span className="shrink-0">Supabase Endpoint:</span>
                <span className="font-mono text-[10px] truncate">{SUPABASE_API_URL}</span>
              </div>
            </div>

            {/* Persisted Official Announcement Tool */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Publish Official Alumni Announcement
              </label>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Saved permanently in the SZMC Official Announcements channel and delivered via RLS-protected realtime sync.
              </p>
              <textarea
                value={adminBroadcastText}
                onChange={(e) => setAdminBroadcastText(e.target.value)}
                placeholder="Type an official institutional announcement to publish to all alumni..."
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
                  <span>Publish Announcement</span>
                </button>
              </div>
              {adminBroadcastSuccess && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Official announcement saved and published to SZMC Official Announcements!
                </p>
              )}
              {adminBroadcastError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{adminBroadcastError}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
