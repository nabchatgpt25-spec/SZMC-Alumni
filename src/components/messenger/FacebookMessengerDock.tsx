import React, { Suspense, lazy, useEffect, useRef, useState, useCallback } from 'react';
import {
  MessageCircle,
  Send,
  X,
  Minus,
  Maximize2,
  ThumbsUp,
  Smile,
  ShieldCheck,
  Loader2,
  Image as ImageIcon,
  Phone,
  Video,
  Volume2,
  VolumeX,
  Check,
  CheckCheck,
  Ban,
  AlertCircle,
  AlertTriangle,
  PenTool,
  BellOff,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useMessagingProfileId } from '../../hooks/useMessagingProfileId';
import {
  findOrCreateDirectConversation,
  findOnlinePresenceUser,
  listMessages,
  listMessageReactions,
  toggleMessageReaction,
  subscribeToReactionChanges,
  sendMessage,
  uploadChatImage,
  markConversationRead,
  getPeerLastReadAt,
  getUserMessageSettings,
  subscribeToMessageChanges,
  subscribeToTypingStatus,
  subscribeToReadReceipts,
  subscribeToOnlinePresence,
  subscribeToRealtimeReconnect,
  subscribeToDmAnnotationSession,
  createAnnotationSessionKey,
  sendTypingIndicator,
  getMessengerBlockState,
} from '../../services/messagingService';
import type { ChatMessage, MessageReaction } from '../../types/messaging';
import type { ActiveDmAnnotationSession, AnnotationTarget } from '../../types/annotation';
import { setActiveChatView } from '../../utils/mobileToastBus';
import type { AlumniProfile } from '../../types';
import { playSound } from '../../utils/audio';
import {
  CLINICAL_STATUS_META,
  isQuietRecommendedStatus,
  type ClinicalStatusKey,
} from '../../utils/clinicalStatus';
import { parseStructuredChatMessage } from '../../utils/structuredChat';
import { ClinicalStatusChip } from '../ClinicalStatusChip';
import { HuddleModal, extractHuddleRoomFromText } from './HuddleModal';
import { RichMessageText, StructuredChatCard } from './StructuredChatCard';

const SharedImageAnnotatorModal = lazy(() =>
  import('./SharedImageAnnotatorModal').then((m) => ({ default: m.SharedImageAnnotatorModal }))
);

interface FacebookMessengerDockProps {
  peer: AlumniProfile;
  onClose: () => void;
  onOpenFullMessenger: (peerProfileId: number) => void;
  onViewProfile?: (profileId: number) => void;
}

const PRESET_QUICK_REPLIES = [
  '👋 Assalamu Alaikum Doctor!',
  'Looking forward to connecting!',
  'Are you attending the upcoming reunion?',
  'Could I consult you regarding a clinical case?',
];

const QUICK_EMOJIS = ['❤️', '😂', '👍', '🔥', '👏', '🙏', '😍', '🎉', '🩺'];

export const FacebookMessengerDock: React.FC<FacebookMessengerDockProps> = ({
  peer,
  onClose,
  onOpenFullMessenger,
  onViewProfile,
}) => {
  const { currentUser } = useAuth();
  // public.profiles.id is the FK target for messages.sender_id / participants.profile_id
  const { effectiveProfileId } = useMessagingProfileId(currentUser.id);
  const myId = effectiveProfileId ?? currentUser.id;

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactionsByMessageId, setReactionsByMessageId] = useState<Record<string, MessageReaction[]>>({});
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreviewUrl, setPendingImagePreviewUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [peerTyping, setPeerTyping] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [huddleMode, setHuddleMode] = useState<'audio' | 'video' | null>(null);
  const [annotationTarget, setAnnotationTarget] = useState<AnnotationTarget | null>(null);
  const [liveDmSession, setLiveDmSession] = useState<ActiveDmAnnotationSession | null>(null);
  const [dockError, setDockError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isPeerOnline, setIsPeerOnline] = useState(false);
  const [peerClinicalStatus, setPeerClinicalStatus] = useState<ClinicalStatusKey | null>(null);
  const [sendQuietly, setSendQuietly] = useState(false);
  const [peerLastReadAt, setPeerLastReadAt] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const conversationIdRef = useRef<string | null>(null);
  conversationIdRef.current = conversationId;
  const isMinimizedRef = useRef(isMinimized);
  isMinimizedRef.current = isMinimized;
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const lastTypingSentRef = useRef<number>(0);

  const clearPendingImage = useCallback(() => {
    setPendingImagePreviewUrl((prevUrl) => {
      if (prevUrl) URL.revokeObjectURL(prevUrl);
      return null;
    });
    setPendingImageFile(null);
  }, []);

  useEffect(() => {
    return () => {
      if (pendingImagePreviewUrl) URL.revokeObjectURL(pendingImagePreviewUrl);
    };
  }, [pendingImagePreviewUrl]);

  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxUrl(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxUrl]);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // 1. Initialize or find direct conversation with peer (and enforce block status)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDockError(null);
    setIsBlocked(false);

    (async () => {
      try {
        const blockState = await getMessengerBlockState(myId);
        if (cancelled) return;
        if (blockState.blockedEitherWay.has(peer.id)) {
          setIsBlocked(true);
          setDockError(
            blockState.blockedByMe.has(peer.id)
              ? 'You blocked this account. Unblock them in Messenger Settings to resume messaging.'
              : 'Messaging is unavailable with this account.'
          );
          return;
        }

        const convId = await findOrCreateDirectConversation(myId, peer.id);
        if (cancelled) return;
        setConversationId(convId);
        const [initialMessages, lastRead, msgSettings] = await Promise.all([
          listMessages(convId, 50),
          getPeerLastReadAt(convId, myId),
          getUserMessageSettings(myId).catch(() => null),
        ]);
        if (cancelled) return;
        setMessages(initialMessages);
        setPeerLastReadAt(lastRead);
        if (msgSettings) {
          setSoundEnabled(msgSettings.soundEnabled);
          setReadReceiptsEnabled(msgSettings.readReceiptsEnabled);
        }
        const initialReactions = await listMessageReactions(initialMessages.map((m) => m.id));
        if (cancelled) return;
        setReactionsByMessageId(initialReactions);
        await markConversationRead(convId, myId);
        setTimeout(() => scrollToBottom(false), 80);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unable to open this conversation.';
          if (/blocked|unavailable/i.test(message)) {
            setIsBlocked(true);
          }
          setDockError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [myId, peer.id, scrollToBottom]);

  // 1b. Sync block status live when the user blocks/unblocks accounts anywhere in the app
  useEffect(() => {
    const syncBlockState = async () => {
      try {
        const blockState = await getMessengerBlockState(myId);
        const blocked = blockState.blockedEitherWay.has(peer.id);
        setIsBlocked(blocked);
        if (blocked) {
          setDockError(
            blockState.blockedByMe.has(peer.id)
              ? 'You blocked this account. Unblock them in Messenger Settings to resume messaging.'
              : 'Messaging is unavailable with this account.'
          );
        } else {
          setDockError((prev) => (prev && /blocked|unavailable/i.test(prev) ? null : prev));
        }
      } catch {
        /* ignore transient errors */
      }
    };
    window.addEventListener('szmc_blocks_updated', syncBlockState);
    return () => window.removeEventListener('szmc_blocks_updated', syncBlockState);
  }, [myId, peer.id]);

  // 1c. Subscribe to real online presence & clinical status for the peer
  useEffect(() => {
    setSendQuietly(false);
    if (!myId) return;
    return subscribeToOnlinePresence(
      {
        profileId: myId,
        appProfileId: currentUser.id,
        fullName: currentUser.fullName || 'SZMC Alumnus',
        avatarUrl: currentUser.avatarUrl || '/szmc-logo.png',
        batchYear: currentUser.batchYear || 20,
      },
      (users) => {
        const matched =
          findOnlinePresenceUser(users, peer.id) ??
          (peer.userId ? findOnlinePresenceUser(users, peer.userId) : undefined);
        setIsPeerOnline(Boolean(matched));
        setPeerClinicalStatus(matched?.clinicalStatus ?? null);
      }
    );
  }, [myId, peer.id, peer.userId, currentUser.id, currentUser.fullName, currentUser.avatarUrl, currentUser.batchYear]);

  // 1d. Live read receipts for this dock conversation
  useEffect(() => {
    return subscribeToReadReceipts((receipt) => {
      if (receipt.conversationId === conversationIdRef.current && receipt.profileId !== myId) {
        setPeerLastReadAt((prev) => (!prev || receipt.lastReadAt > prev ? receipt.lastReadAt : prev));
      }
    });
  }, [myId]);

  // 1e. Resync dock messages when Realtime reconnects or tab returns from background
  useEffect(() => {
    return subscribeToRealtimeReconnect(() => {
      const convId = conversationIdRef.current;
      if (!convId) return;
      void listMessages(convId, 50)
        .then(async (latest) => {
          if (conversationIdRef.current !== convId) return;
          setMessages(latest);
          const reactions = await listMessageReactions(latest.map((m) => m.id));
          if (conversationIdRef.current === convId) {
            setReactionsByMessageId((prev) => ({ ...prev, ...reactions }));
          }
        })
        .catch(() => {});
    });
  }, []);

  // 1f. Subscribe to live message reactions (for interactive polls & reactions)
  useEffect(() => {
    return subscribeToReactionChanges((event) => {
      const { reaction, eventType } = event;
      setReactionsByMessageId((prev) => {
        const current = prev[reaction.messageId] ?? [];
        if (eventType === 'DELETE') {
          return {
            ...prev,
            [reaction.messageId]: current.filter(
              (r) => !(r.profileId === reaction.profileId && r.emoji === reaction.emoji)
            ),
          };
        }
        if (current.some((r) => r.profileId === reaction.profileId && r.emoji === reaction.emoji)) {
          return prev;
        }
        return {
          ...prev,
          [reaction.messageId]: [...current, reaction],
        };
      });
    });
  }, []);

  // 2. Real-Time incoming message listener (handles INSERT, UPDATE edits, and DELETE)
  //    Reads isMinimized/soundEnabled from refs so toggling sound or minimizing never resubscribes.
  useEffect(() => {
    const unsub = subscribeToMessageChanges((incoming, meta) => {
      if (incoming.conversationId === conversationIdRef.current) {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === incoming.id);
          if (idx !== -1) {
            const next = [...prev];
            next[idx] = incoming;
            return next;
          }
          return [...prev, incoming];
        });

        if (meta.eventType === 'INSERT' && incoming.senderId !== myId) {
          setPeerTyping(null);
          if (isMinimizedRef.current) {
            setUnreadCount((c) => c + 1);
          } else {
            void markConversationRead(incoming.conversationId, myId);
          }
          if (soundEnabledRef.current && !incoming.isSilent) {
            playSound('receive');
          }
        }

        if (meta.eventType === 'INSERT') {
          setTimeout(() => scrollToBottom(true), 60);
        }
      }
    });

    return () => unsub();
  }, [myId, scrollToBottom]);

  // 3. Per-conversation scoped real-time typing indicators (never global)
  useEffect(() => {
    if (!conversationId) return;
    let timer: any = null;
    const unsub = subscribeToTypingStatus(conversationId, (data) => {
      if (data.conversationId === conversationId && data.profileId !== myId) {
        setPeerTyping(`${(data.fullName || peer.fullName).split(' ')[0]} is typing...`);
        clearTimeout(timer);
        timer = setTimeout(() => setPeerTyping(null), 3000);
      }
    });

    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [conversationId, myId, peer.fullName]);

  // 3b. Listen for live shared-canvas annotation invites in this DM
  useEffect(() => {
    if (!conversationId || isBlocked) {
      setLiveDmSession(null);
      return;
    }
    const unsub = subscribeToDmAnnotationSession(conversationId, (session) => {
      if (session.hostProfileId === myId) return;
      if (!session.active) {
        setLiveDmSession((prev) => (prev && prev.sessionKey === session.sessionKey ? null : prev));
        return;
      }
      setLiveDmSession(session);
    });
    return () => unsub();
  }, [conversationId, isBlocked, myId]);

  // Auto focus input when restored & sync active chat view with mobile notification toast host
  useEffect(() => {
    setActiveChatView('dock', !isMinimized && conversationId ? conversationId : null);
    if (!isMinimized && !loading) {
      inputRef.current?.focus();
      setUnreadCount(0);
      if (conversationId) {
        void markConversationRead(conversationId, myId);
      }
    }
    return () => {
      setActiveChatView('dock', null);
    };
  }, [isMinimized, loading, conversationId, myId]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? inputText).trim();
    const fileToUpload = pendingImageFile;

    if ((!text && !fileToUpload) || !conversationId || sending || uploadingImage || isBlocked) return;

    if (!textToSend) setInputText('');
    setShowEmojiPicker(false);
    setSending(true);
    if (fileToUpload) setUploadingImage(true);

    try {
      let mediaUrl: string | null = null;
      if (fileToUpload) {
        mediaUrl = await uploadChatImage(fileToUpload, conversationId);
        clearPendingImage();
      }

      if (soundEnabled && !sendQuietly) {
        playSound('send');
      }

      const sent = await sendMessage(conversationId, myId, text, {
        type: mediaUrl ? 'image' : text === '👍' ? 'like' : 'text',
        mediaUrl,
        isSilent: sendQuietly,
      });
      setMessages((prev) => {
        if (prev.some((m) => m.id === sent.id)) return prev;
        return [...prev, sent];
      });
      setDockError(null);
      setTimeout(() => scrollToBottom(true), 40);
    } catch (err) {
      setDockError(err instanceof Error ? err.message : 'Message could not be sent.');
      if (!textToSend && text) setInputText(text);
    } finally {
      setUploadingImage(false);
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleToggleDockReaction = async (messageId: string, emoji: string) => {
    const existing = reactionsByMessageId[messageId] ?? [];
    const currentlyReacted = existing.some((r) => r.profileId === myId && r.emoji === emoji);
    setReactionsByMessageId((prev) => {
      const curr = prev[messageId] ?? [];
      if (currentlyReacted) {
        return {
          ...prev,
          [messageId]: curr.filter((r) => !(r.profileId === myId && r.emoji === emoji)),
        };
      }
      return {
        ...prev,
        [messageId]: [...curr, { messageId, profileId: myId, emoji }],
      };
    });
    try {
      await toggleMessageReaction(messageId, myId, emoji, currentlyReacted);
    } catch {
      setReactionsByMessageId((prev) => ({ ...prev, [messageId]: existing }));
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;

    if (!file.type || !file.type.startsWith('image/')) {
      setDockError('Please select a valid image file (JPG, PNG, WebP, or GIF).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setDockError('Image must be smaller than 8 MB.');
      return;
    }

    setPendingImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setPendingImageFile(file);
    setDockError(null);
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    if (!conversationId) return;

    const now = Date.now();
    if (now - lastTypingSentRef.current > 2000) {
      lastTypingSentRef.current = now;
      sendTypingIndicator(conversationId, myId, currentUser.fullName);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const formatMessageTime = (isoString?: string) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // If Minimized: Show floating circular avatar head like Facebook Messenger
  if (isMinimized) {
    return (
      <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 animate-scaleUp">
        <button
          type="button"
          onClick={() => {
            setIsMinimized(false);
            setUnreadCount(0);
          }}
          className="relative group p-1 rounded-full bg-white dark:bg-slate-900 border-2 border-[#0084FF] shadow-2xl hover:scale-105 transition-all cursor-pointer flex items-center justify-center active:scale-95"
          title={`Open chat with Dr. ${peer.fullName}`}
          aria-label={`Open chat with Dr. ${peer.fullName}`}
        >
          <img
            src={peer.avatarUrl || '/assets/aistudio/images__1__2778177d.png'}
            alt={peer.fullName}
            referrerPolicy="no-referrer"
            className="w-13 h-13 rounded-full object-cover"
          />
          {isPeerOnline && !isBlocked && (
            <span className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
          )}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black animate-pulse shadow-xs">
              {unreadCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-16 sm:bottom-0 right-2 sm:right-6 z-50 w-[95vw] max-w-[350px] sm:max-w-[380px] h-[520px] max-h-[80vh] bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-t-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-scaleUp"
      role="dialog"
      aria-labelledby="dock-chat-title"
    >
      {/* Facebook Messenger Header */}
      <div className="px-3.5 py-2.5 bg-gradient-to-r from-[#0084FF] to-[#0073E6] text-white flex items-center justify-between shadow-xs select-none">
        <div
          className="flex items-center gap-2.5 min-w-0 cursor-pointer"
          onClick={() => onOpenFullMessenger(peer.id)}
          title="Click to view full conversation in Messenger"
        >
          <div className="relative shrink-0">
            <img
              src={peer.avatarUrl || '/assets/aistudio/images__1__2778177d.png'}
              alt={peer.fullName}
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full object-cover ring-2 ring-white/30"
            />
            {(isPeerOnline || peerClinicalStatus) && !isBlocked && (
              <span
                className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${
                  peerClinicalStatus
                    ? CLINICAL_STATUS_META[peerClinicalStatus].dotClass
                    : 'bg-emerald-400'
                }`}
              />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 id="dock-chat-title" className="text-sm font-black truncate leading-tight">
                {peer.fullName}
              </h3>
              {peer.verificationStatus === 'verified' && (
                <ShieldCheck className="w-3.5 h-3.5 text-sky-200 shrink-0" />
              )}
              {!isBlocked && peerClinicalStatus && (
                <ClinicalStatusChip status={peerClinicalStatus} size="xs" onDarkHeader />
              )}
            </div>
            <p className="text-[11px] text-white/80 truncate">
              {peerTyping ? (
                <span className="text-amber-200 font-semibold animate-pulse">{peerTyping}</span>
              ) : (isPeerOnline || peerClinicalStatus) && !isBlocked ? (
                `MBBS Batch ${peer.batchYear} • Active now`
              ) : (
                `MBBS Batch ${peer.batchYear} • ${peer.profession || 'SZMC Doctor'}`
              )}
            </p>
          </div>
        </div>

        {/* Window Controls & Huddle Calls */}
        <div className="flex items-center gap-0.5 shrink-0">
          {!isBlocked && conversationId && (
            <>
              <button
                type="button"
                onClick={() => setHuddleMode('audio')}
                title="Voice Huddle"
                aria-label="Start Voice Huddle"
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
              >
                <Phone className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setHuddleMode('video')}
                title="Video Huddle"
                aria-label="Start Video Huddle"
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
              >
                <Video className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'Mute sound' : 'Unmute sound'}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-white/60" />}
          </button>
          <button
            type="button"
            onClick={() => onOpenFullMessenger(peer.id)}
            title="Open full Messenger window"
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            title="Minimize chat"
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close chat"
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Live Shared Annotation Invite Banner */}
      {liveDmSession && !isBlocked && (
        <div className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/60 border-b border-blue-200 dark:border-blue-900 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 truncate">
              {liveDmSession.hostName.split(' ')[0]} is annotating a scan
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              setAnnotationTarget({
                sessionKey: liveDmSession.sessionKey,
                imageUrl: liveDmSession.imageUrl,
                sourceMessageId: liveDmSession.sourceMessageId ?? null,
              })
            }
            className="px-2.5 py-1 rounded-full bg-[#0084FF] hover:bg-[#0073E6] text-white text-[10px] font-bold whitespace-nowrap cursor-pointer shrink-0"
          >
            Join Live
          </button>
        </div>
      )}

      {/* Messages Thread Body */}
      <div className="flex-1 p-3 overflow-y-auto space-y-2.5 bg-slate-50 dark:bg-slate-950/40 text-xs">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-[#0084FF]" />
            <p className="text-[11px] font-semibold">Connecting to Messenger...</p>
          </div>
        ) : !conversationId && dockError ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-5 space-y-3">
            <div className="w-14 h-14 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center ring-4 ring-rose-100 dark:ring-rose-900/40">
              {isBlocked ? <Ban className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
            </div>
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                {isBlocked ? 'Messaging Blocked' : 'Conversation Unavailable'}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                {dockError}
              </p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4 space-y-3">
            <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950/40 text-[#0084FF] flex items-center justify-center ring-4 ring-blue-100 dark:ring-blue-900/40">
              <MessageCircle className="w-8 h-8" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                Say hello to Dr. {peer.fullName.split(' ')[0]}!
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                SZMC MBBS Batch {peer.batchYear} • {peer.institution || 'Medical Doctor'}
              </p>
            </div>

            {/* Quick Greeting Starters */}
            <div className="flex flex-col w-full gap-1.5 pt-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left">
                Suggested Greetings:
              </span>
              {PRESET_QUICK_REPLIES.map((reply, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSend(reply)}
                  className="text-left px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-[#0084FF] hover:text-[#0084FF] transition-all cursor-pointer shadow-2xs"
                >
                  {reply}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Header info badge inside conversation */}
            <div className="text-center py-2">
              <img
                src={peer.avatarUrl || '/assets/aistudio/images__1__2778177d.png'}
                alt={peer.fullName}
                className="w-14 h-14 rounded-full mx-auto object-cover ring-2 ring-slate-200 dark:ring-slate-700 shadow-sm"
              />
              <h4 className="font-extrabold text-slate-900 dark:text-white text-sm mt-1.5">
                {peer.fullName}
              </h4>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                SZMC Doctor • MBBS Batch {peer.batchYear} • Bogura
              </p>
            </div>

            {messages.map((m) => {
              const fromMe = m.senderId === myId;
              const isLike = m.body === '👍' || m.type === 'like';

              let textContent = m.body;
              let imagePayload: string | null = m.mediaUrl ?? null;
              if (!imagePayload && m.body.includes('[image]:')) {
                const parts = m.body.split('[image]:');
                textContent = parts[0]?.trim() || '';
                imagePayload = parts[1]?.trim() || null;
              } else if (!imagePayload && (m.body.startsWith('data:image/') || m.type === 'image')) {
                imagePayload = m.body;
                textContent = '';
              }
              if (m.type === 'image' && m.mediaUrl && m.body === 'Photo') {
                textContent = '';
              }
              const huddleInfo = !m.deletedAt && textContent ? extractHuddleRoomFromText(textContent) : null;
              const structuredCard = !m.deletedAt && textContent ? parseStructuredChatMessage(textContent) : null;
              const msgReactions = reactionsByMessageId[m.id] ?? [];

              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${fromMe ? 'items-end' : 'items-start'} space-y-0.5`}
                >
                  {m.deletedAt ? (
                    <div className="max-w-[78%] px-3.5 py-2 rounded-2xl italic text-slate-500 dark:text-slate-400 bg-slate-200/60 dark:bg-slate-800">
                      This message was deleted
                    </div>
                  ) : (
                    <>
                      {imagePayload && (
                        <div className={`flex flex-col gap-1 max-w-[78%] ${fromMe ? 'items-end' : 'items-start'}`}>
                          <button
                            type="button"
                            onClick={() => setLightboxUrl(imagePayload)}
                            className="w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm my-0.5 cursor-pointer block"
                            aria-label="Open full-size photo"
                          >
                            <img
                              src={imagePayload}
                              alt="Attachment"
                              className="w-full max-h-48 object-cover hover:opacity-95"
                            />
                          </button>
                          {!isBlocked && (
                            <button
                              type="button"
                              onClick={() =>
                                setAnnotationTarget({
                                  sessionKey: createAnnotationSessionKey(m.id, imagePayload),
                                  imageUrl: imagePayload,
                                  sourceMessageId: m.id,
                                })
                              }
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-[#0084FF] text-[10px] font-semibold text-slate-700 dark:text-slate-200 hover:text-[#0084FF] cursor-pointer"
                            >
                              <PenTool className="w-2.5 h-2.5 text-[#0084FF]" />
                              <span>
                                {liveDmSession &&
                                (liveDmSession.sourceMessageId === m.id ||
                                  liveDmSession.imageUrl === imagePayload)
                                  ? 'Join Live'
                                  : 'Annotate'}
                              </span>
                            </button>
                          )}
                        </div>
                      )}

                      {textContent && (
                        <div
                          className={`max-w-[88%] leading-relaxed break-words ${
                            isLike
                              ? 'bg-transparent text-3xl shadow-none p-0'
                              : structuredCard?.kind === 'profile_card' || m.type === 'ProfileShareCard'
                              ? 'bg-transparent p-0 shadow-none'
                              : fromMe
                              ? 'px-3.5 py-2 rounded-2xl shadow-2xs bg-[#0084FF] text-white rounded-br-xs'
                              : 'px-3.5 py-2 rounded-2xl shadow-2xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/70 dark:border-slate-700/60 rounded-bl-xs'
                          }`}
                        >
                          {structuredCard ? (
                            <StructuredChatCard
                              data={structuredCard}
                              mine={fromMe}
                              compact
                              myId={myId}
                              reactions={msgReactions}
                              onViewProfile={onViewProfile}
                              onToggleReaction={(em) => void handleToggleDockReaction(m.id, em)}
                              onQuickReply={(prefill) => {
                                if (prefill && !inputText.trim()) setInputText(prefill);
                                inputRef.current?.focus();
                              }}
                            />
                          ) : (
                            <RichMessageText text={textContent} mine={fromMe} />
                          )}
                          {huddleInfo && (
                            <div className="mt-1.5 pt-1.5 border-t border-current/15">
                              <button
                                type="button"
                                onClick={() => setHuddleMode(huddleInfo.mode)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer ${
                                  fromMe
                                    ? 'bg-white text-[#0084FF] hover:bg-blue-50'
                                    : 'bg-[#0084FF] text-white hover:bg-[#0073E6]'
                                }`}
                              >
                                {huddleInfo.mode === 'audio' ? (
                                  <Phone className="w-3 h-3" />
                                ) : (
                                  <Video className="w-3 h-3" />
                                )}
                                <span>Join Huddle</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  <div className="flex items-center gap-1 text-[9px] text-slate-400 px-1">
                    {m.isSilent && !m.deletedAt && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[9px] font-bold text-slate-500 dark:text-slate-300"
                        title="Delivered quietly without alert sound"
                      >
                        <BellOff className="w-2.5 h-2.5" />
                        <span>Silent</span>
                      </span>
                    )}
                    <span>
                      {formatMessageTime(m.createdAt)}
                      {m.editedAt && !m.deletedAt ? ' · edited' : ''}
                    </span>
                    {fromMe && !m.deletedAt && (
                      readReceiptsEnabled && peerLastReadAt && m.createdAt <= peerLastReadAt ? (
                        <span title="Seen">
                          <CheckCheck className="w-3 h-3 text-[#0084FF]" />
                        </span>
                      ) : (
                        <span title="Delivered">
                          <Check className="w-3 h-3 text-slate-400" />
                        </span>
                      )
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Peer Typing Indicator */}
      {peerTyping && (
        <div className="px-3 py-1 bg-slate-50 dark:bg-slate-900 text-[10px] text-slate-500 font-semibold italic flex items-center gap-1.5 border-t border-slate-100 dark:border-slate-800">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0084FF] animate-ping" />
          <span>{peerTyping}</span>
        </div>
      )}

      {/* Emoji Picker Tray */}
      {showEmojiPicker && (
        <div className="p-2 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-1 shadow-sm animate-fadeIn">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                setInputText((prev) => prev + emoji);
                setShowEmojiPicker(false);
                inputRef.current?.focus();
              }}
              className="text-lg p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-transform hover:scale-125 cursor-pointer"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Image Preview Thumbnail before sending */}
      {pendingImagePreviewUrl && (
        <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={pendingImagePreviewUrl}
              alt="Preview"
              className="w-10 h-10 rounded-lg object-cover border border-slate-300 dark:border-slate-600 shrink-0"
            />
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 truncate">
              {uploadingImage ? 'Uploading photo...' : pendingImageFile?.name || 'Image attached'}
            </span>
          </div>
          <button
            type="button"
            onClick={clearPendingImage}
            disabled={uploadingImage}
            className="p-1 rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50 cursor-pointer shrink-0"
            title="Remove attachment"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Inline Error Banner (non-blocking errors inside an active thread) */}
      {dockError && conversationId && !isBlocked && (
        <div className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/60 border-t border-rose-200 dark:border-rose-800 text-[11px] font-semibold text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2">
          <span className="truncate">{dockError}</span>
          <button
            type="button"
            onClick={() => setDockError(null)}
            className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-200 shrink-0 cursor-pointer"
            aria-label="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Warning Banner when peer is In OT or On Call */}
      {!isBlocked && conversationId && isQuietRecommendedStatus(peerClinicalStatus) && (
        <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/60 border-t border-amber-200 dark:border-amber-800/80 flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 min-w-0 text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="truncate font-medium">
              Dr. {peer.fullName.split(' ')[0]} is{' '}
              <strong>{CLINICAL_STATUS_META[peerClinicalStatus].label}</strong>
            </span>
          </div>
          {!sendQuietly ? (
            <button
              type="button"
              onClick={() => setSendQuietly(true)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold whitespace-nowrap cursor-pointer shrink-0"
            >
              <BellOff className="w-2.5 h-2.5" />
              <span>Send Quietly</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
              <BellOff className="w-2.5 h-2.5" />
              <span>Quiet on</span>
            </span>
          )}
        </div>
      )}

      {/* Input Composer Footer */}
      {isBlocked || (!loading && !conversationId) ? (
        <div className="px-3 py-2.5 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <Ban className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <span className="truncate">
            {isBlocked
              ? 'You cannot message this account.'
              : 'Conversation unavailable.'}
          </span>
        </div>
      ) : (
        <div className="p-2.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage || sending}
            title="Attach photo or report"
            aria-label="Attach photo or report"
            className="w-8 h-8 rounded-full text-slate-500 hover:text-[#0084FF] hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer shrink-0"
          >
            <ImageIcon className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            title="Pick emoji"
            aria-label="Pick emoji"
            className="w-8 h-8 rounded-full text-slate-500 hover:text-[#0084FF] hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <Smile className="w-4 h-4" />
          </button>

          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              pendingImageFile
                ? 'Add a caption...'
                : sendQuietly
                ? 'Send quietly...'
                : 'Aa'
            }
            disabled={loading || sending || uploadingImage}
            className="flex-1 min-w-0 px-3 py-2 rounded-full bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#0084FF]/40 border-none transition-all"
          />

          <button
            type="button"
            onClick={() => setSendQuietly((prev) => !prev)}
            aria-pressed={sendQuietly}
            title={sendQuietly ? 'Send Quietly enabled' : 'Send Quietly (no alert sound)'}
            aria-label="Toggle Send Quietly"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
              sendQuietly
                ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <BellOff className="w-3.5 h-3.5" />
          </button>

          {inputText.trim() || pendingImageFile ? (
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={sending || uploadingImage}
              aria-label={sendQuietly ? 'Send quietly' : 'Send message'}
              className="w-8 h-8 rounded-full bg-[#0084FF] hover:bg-[#0073E6] text-white flex items-center justify-center transition-transform active:scale-90 cursor-pointer shadow-xs disabled:opacity-50 shrink-0"
            >
              {sending || uploadingImage ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSend('👍')}
              aria-label="Send Thumbs Up Like"
              title={sendQuietly ? 'Send Like quietly' : 'Send Like'}
              className="w-8 h-8 rounded-full text-[#0084FF] hover:bg-blue-50 dark:hover:bg-slate-800 flex items-center justify-center transition-transform active:scale-125 cursor-pointer shrink-0"
            >
              <ThumbsUp className="w-4 h-4 fill-[#0084FF]" />
            </button>
          )}
        </div>
      )}

      {/* In-App Photo Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Photo preview"
        >
          <div
            className="absolute top-4 right-4 flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {!isBlocked && conversationId && (
              <button
                type="button"
                onClick={() => {
                  const url = lightboxUrl;
                  setLightboxUrl(null);
                  setAnnotationTarget({
                    sessionKey: createAnnotationSessionKey(null, url),
                    imageUrl: url,
                  });
                }}
                className="min-h-[44px] px-4 rounded-full bg-[#0084FF] hover:bg-[#0073E6] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-lg cursor-pointer"
              >
                <PenTool className="w-4 h-4" />
                <span>Annotate Live</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              aria-label="Close photo"
              className="min-w-[44px] min-h-[44px] rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <img
            src={lightboxUrl}
            alt="Full-size attachment"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[86vh] rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}

      {/* Shared Clinical Image Annotation Canvas */}
      {annotationTarget && conversationId && !isBlocked && (
        <Suspense fallback={null}>
          <SharedImageAnnotatorModal
            isOpen={true}
            conversationId={conversationId}
            myId={myId}
            myDisplayName={currentUser.fullName || 'SZMC Doctor'}
            myAvatarUrl={currentUser.avatarUrl || '/szmc-logo.png'}
            peerName={peer.fullName}
            target={annotationTarget}
            onClose={() => setAnnotationTarget(null)}
            onSaveToThread={async ({ mediaUrl, caption: annotatedCaption, replyToMessageId }) => {
              const sent = await sendMessage(conversationId, myId, annotatedCaption, {
                type: 'image',
                mediaUrl,
                replyToMessageId: replyToMessageId ?? null,
              });
              setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
              setTimeout(() => scrollToBottom(true), 60);
              return true;
            }}
          />
        </Suspense>
      )}

      {/* In-App Audio / Video Huddle Modal */}
      {huddleMode && conversationId && (
        <HuddleModal
          isOpen={true}
          mode={huddleMode}
          conversationId={conversationId}
          peerName={peer.fullName}
          myDisplayName={currentUser.fullName}
          onClose={() => setHuddleMode(null)}
          onPostInvite={
            !isBlocked
              ? async (inviteText) => {
                  const sent = await sendMessage(conversationId, myId, inviteText, { type: 'text' });
                  setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
                }
              : undefined
          }
        />
      )}
    </div>
  );
};
