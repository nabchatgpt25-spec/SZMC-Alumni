import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useMessagingProfileId } from '../../hooks/useMessagingProfileId';
import {
  findOrCreateDirectConversation,
  listMessages,
  sendMessage,
  markConversationRead,
  subscribeToMessageChanges,
  subscribeToTypingStatus,
  sendTypingIndicator,
} from '../../services/messagingService';
import type { ChatMessage } from '../../types/messaging';
import type { AlumniProfile } from '../../types';
import { playSound } from '../../utils/audio';
import { compressImageFileToDataUrl } from '../../utils/mediaStorage';

interface FacebookMessengerDockProps {
  peer: AlumniProfile;
  onClose: () => void;
  onOpenFullMessenger: (peerProfileId: number) => void;
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
}) => {
  const { currentUser } = useAuth();
  // public.profiles.id is the FK target for messages.sender_id / participants.profile_id
  const { effectiveProfileId } = useMessagingProfileId(currentUser.id);
  const myId = effectiveProfileId ?? currentUser.id;

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [peerTyping, setPeerTyping] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [callToast, setCallToast] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const conversationIdRef = useRef<string | null>(null);
  conversationIdRef.current = conversationId;
  const lastTypingSentRef = useRef<number>(0);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // 1. Initialize or find direct conversation with peer
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const convId = await findOrCreateDirectConversation(myId, peer.id);
        if (cancelled) return;
        setConversationId(convId);
        const initialMessages = await listMessages(convId);
        if (cancelled) return;
        setMessages(initialMessages);
        await markConversationRead(convId, myId);
        setTimeout(() => scrollToBottom(false), 80);
      } catch (err) {
        console.warn('Failed to initialize Facebook dock chat:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [myId, peer.id, scrollToBottom]);

  // 2. Real-Time incoming message listener
  useEffect(() => {
    const unsub = subscribeToMessageChanges((incoming) => {
      if (incoming.conversationId === conversationIdRef.current) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === incoming.id)) return prev;
          return [...prev, incoming];
        });

        if (incoming.senderId !== myId) {
          if (isMinimized) {
            setUnreadCount((c) => c + 1);
          } else {
            void markConversationRead(incoming.conversationId, myId);
          }
          if (soundEnabled) {
            playSound('receive');
          }
        }

        setTimeout(() => scrollToBottom(true), 60);
      }
    });

    return () => unsub();
  }, [myId, isMinimized, soundEnabled, scrollToBottom]);

  // 3. Real-Time typing indicators
  useEffect(() => {
    let timer: any = null;
    const unsub = subscribeToTypingStatus((data) => {
      if (data.conversationId === conversationIdRef.current && data.profileId === peer.id) {
        setPeerTyping(`${peer.fullName.split(' ')[0]} is typing...`);
        clearTimeout(timer);
        timer = setTimeout(() => setPeerTyping(null), 3000);
      }
    });

    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [peer.id, peer.fullName]);

  // Auto focus input when restored
  useEffect(() => {
    if (!isMinimized && !loading) {
      inputRef.current?.focus();
      setUnreadCount(0);
      if (conversationId) {
        void markConversationRead(conversationId, myId);
      }
    }
  }, [isMinimized, loading, conversationId, myId]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? inputText).trim();
    const hasImage = Boolean(pendingImage);

    if ((!text && !hasImage) || !conversationId || sending) return;

    if (!textToSend) setInputText('');
    const imageToSend = pendingImage;
    setPendingImage(null);
    setShowEmojiPicker(false);
    setSending(true);

    try {
      if (soundEnabled) {
        playSound('send');
      }

      // Attachments go to public.messages.media_url with type='image' (no body hacks)
      const sent = await sendMessage(conversationId, myId, text, {
        type: imageToSend ? 'image' : text === '👍' ? 'like' : 'text',
        mediaUrl: imageToSend,
      });
      setMessages((prev) => {
        if (prev.some((m) => m.id === sent.id)) return prev;
        return [...prev, sent];
      });
      setTimeout(() => scrollToBottom(true), 40);
    } catch (err) {
      console.warn('Failed to send dock message:', err);
      if (!textToSend) setInputText(text);
      if (imageToSend) setPendingImage(imageToSend);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImageFileToDataUrl(file);
      setPendingImage(compressed);
    } catch {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (typeof event.target?.result === 'string') {
          setPendingImage(event.target.result);
        }
      };
      reader.readAsDataURL(file);
    } finally {
      if (e.target) e.target.value = '';
    }
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

  const triggerCallSimulation = (type: 'audio' | 'video') => {
    const text =
      type === 'audio'
        ? `Calling Dr. ${peer.fullName}...`
        : `Starting video call with Dr. ${peer.fullName}...`;
    setCallToast(text);
    if (soundEnabled) playSound('notification');
    setTimeout(() => setCallToast(null), 3500);
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
            className="w-13 h-13 rounded-full object-cover"
          />
          <span className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
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
              className="w-9 h-9 rounded-full object-cover ring-2 ring-white/30"
            />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 id="dock-chat-title" className="text-sm font-black truncate leading-tight">
                {peer.fullName}
              </h3>
              {peer.verificationStatus === 'verified' && (
                <ShieldCheck className="w-3.5 h-3.5 text-sky-200 shrink-0" />
              )}
            </div>
            <p className="text-[11px] text-white/80 truncate">
              {peerTyping ? (
                <span className="text-amber-200 font-semibold animate-pulse">{peerTyping}</span>
              ) : (
                `MBBS Batch ${peer.batchYear} • Active now`
              )}
            </p>
          </div>
        </div>

        {/* Window Controls & Calls */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => triggerCallSimulation('audio')}
            title="Audio Call"
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
          >
            <Phone className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => triggerCallSimulation('video')}
            title="Video Call"
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
          >
            <Video className="w-3.5 h-3.5" />
          </button>
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

      {/* Simulated Call Banner */}
      {callToast && (
        <div className="px-3 py-2 bg-blue-50 dark:bg-blue-950/60 border-b border-blue-200 dark:border-blue-800 text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
            <span>{callToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setCallToast(null)}
            className="text-slate-400 hover:text-slate-600 text-[10px]"
          >
            Dismiss
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

              // Image attachments live in public.messages.media_url
              let textContent = m.body;
              let imagePayload: string | null = m.mediaUrl ?? null;
              if (!imagePayload && m.body.includes('[image]:')) {
                // Legacy rows written before the media_url migration
                const parts = m.body.split('[image]:');
                textContent = parts[0]?.trim() || '';
                imagePayload = parts[1]?.trim() || null;
              } else if (!imagePayload && (m.body.startsWith('data:image/') || m.type === 'image')) {
                imagePayload = m.body;
                textContent = '';
              }

              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${fromMe ? 'items-end' : 'items-start'} space-y-0.5`}
                >
                  {imagePayload && (
                    <div className="max-w-[78%] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm my-0.5">
                      <img
                        src={imagePayload}
                        alt="Attachment"
                        className="w-full max-h-48 object-cover cursor-pointer hover:opacity-95"
                        onClick={() => window.open(imagePayload, '_blank')}
                      />
                    </div>
                  )}

                  {textContent && (
                    <div
                      className={`max-w-[78%] px-3.5 py-2 rounded-2xl leading-relaxed break-words shadow-2xs ${
                        isLike
                          ? 'bg-transparent text-3xl shadow-none p-0'
                          : fromMe
                          ? 'bg-[#0084FF] text-white rounded-br-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/70 dark:border-slate-700/60 rounded-bl-xs'
                      }`}
                    >
                      {textContent}
                    </div>
                  )}

                  <div className="flex items-center gap-1 text-[9px] text-slate-400 px-1">
                    <span>{formatMessageTime(m.createdAt)}</span>
                    {fromMe && (
                      <span title="Delivered">
                        <CheckCheck className="w-3 h-3 text-[#0084FF]" />
                      </span>
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
      {pendingImage && (
        <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src={pendingImage}
              alt="Preview"
              className="w-10 h-10 rounded-lg object-cover border border-slate-300 dark:border-slate-600"
            />
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              Image attached
            </span>
          </div>
          <button
            type="button"
            onClick={() => setPendingImage(null)}
            className="p-1 rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
            title="Remove attachment"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input Composer Footer */}
      <div className="p-2.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-1.5">
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
          title="Attach photo or report"
          aria-label="Attach photo or report"
          className="w-8 h-8 rounded-full text-slate-500 hover:text-[#0084FF] hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
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
          placeholder="Aa"
          disabled={loading || sending}
          className="flex-1 px-3.5 py-2 rounded-full bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#0084FF]/40 border-none transition-all"
        />

        {inputText.trim() || pendingImage ? (
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={sending}
            aria-label="Send message"
            className="w-8 h-8 rounded-full bg-[#0084FF] hover:bg-[#0073E6] text-white flex items-center justify-center transition-transform active:scale-90 cursor-pointer shadow-xs disabled:opacity-50 shrink-0"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleSend('👍')}
            aria-label="Send Thumbs Up Like"
            title="Send Like"
            className="w-8 h-8 rounded-full text-[#0084FF] hover:bg-blue-50 dark:hover:bg-slate-800 flex items-center justify-center transition-transform active:scale-125 cursor-pointer shrink-0"
          >
            <ThumbsUp className="w-4 h-4 fill-[#0084FF]" />
          </button>
        )}
      </div>
    </div>
  );
};
