import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Info,
  Loader2,
  Pencil,
  Send,
  Trash2,
  Phone,
  Video,
  Smile,
  ThumbsUp,
  Image as ImageIcon,
  Plus,
  ShieldCheck,
  Check,
  CheckCheck,
} from 'lucide-react';
import type { ChatConversation, ChatMessage } from '../../types/messaging';
import { playSound } from '../../utils/audio';

interface ChatThreadProps {
  conversation: ChatConversation;
  messages: ChatMessage[];
  myId: number;
  loading: boolean;
  error: string | null;
  sending: boolean;
  typingText?: string | null;
  isPeerOnline?: boolean;
  onTyping?: () => void;
  onBack: () => void;
  onOpenSettings: () => void;
  onSend: (body: string) => Promise<boolean>;
  onEdit: (messageId: string, body: string) => Promise<boolean>;
  onDelete: (messageId: string) => Promise<void>;
}

function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export const ChatThread: React.FC<ChatThreadProps> = ({
  conversation,
  messages,
  myId,
  loading,
  error,
  sending,
  typingText,
  isPeerOnline = true,
  onTyping,
  onBack,
  onOpenSettings,
  onSend,
  onEdit,
  onDelete,
}) => {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [callToast, setCallToast] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft('');
    setEditingId(null);
  }, [conversation.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, conversation.id, typingText]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    const ok = await onSend(body);
    if (ok) {
      setDraft('');
      playSound('pop');
    }
  };

  const sendThumbsUp = async () => {
    if (sending) return;
    await onSend('👍');
    playSound('like');
  };

  const handleAddEmoji = (emoji: string) => {
    setDraft((prev) => prev + emoji);
    setShowEmojiPicker(false);
    onTyping?.();
  };

  const saveEdit = async () => {
    const body = editDraft.trim();
    if (!editingId || !body) return;
    setSavingEdit(true);
    const ok = await onEdit(editingId, body);
    setSavingEdit(false);
    if (ok) setEditingId(null);
  };

  const handleDelete = (messageId: string) => {
    if (!window.confirm('Delete this message for everyone?')) return;
    void onDelete(messageId);
  };

  const triggerCall = (type: 'audio' | 'video') => {
    const msg = type === 'audio' 
      ? `Calling ${conversation.person.fullName}...` 
      : `Starting video call with ${conversation.person.fullName}...`;
    setCallToast(msg);
    playSound('notification');
    setTimeout(() => {
      setCallToast(null);
    }, 3500);
  };

  const { person } = conversation;
  const quickEmojis = ['❤️', '😂', '🔥', '👏', '🙏', '😍', '🎉', '💯'];

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden relative">
      {/* Call toast notification */}
      {callToast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full bg-slate-900/90 text-white text-xs font-semibold shadow-xl border border-white/10 animate-fadeIn flex items-center gap-2">
          <Phone className="w-3.5 h-3.5 text-[#0084FF] animate-bounce" />
          <span>{callToast}</span>
        </div>
      )}

      {/* Meta Messenger Conversation Header */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to conversations"
            className="lg:hidden p-2 -ml-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="relative shrink-0">
            <img
              src={person.avatarUrl}
              alt={person.fullName}
              className="w-10 h-10 rounded-full object-cover ring-1 ring-slate-200/80 dark:ring-slate-700"
            />
            {isPeerOnline && (
              <span
                className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900"
                title="Active now"
              />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {person.fullName}
              </h3>
              <ShieldCheck className="w-4 h-4 text-[#0084FF] shrink-0" />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
              {isPeerOnline ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">Active now</span>
                </>
              ) : (
                <span>Batch {person.batchYear || 'Alumnus'} · {person.profession || 'Doctor'}</span>
              )}
            </p>
          </div>
        </div>

        {/* Header Actions (Call & Info) */}
        <div className="flex items-center gap-1 text-[#0084FF]">
          <button
            type="button"
            onClick={() => triggerCall('audio')}
            title="Start voice call"
            className="w-9 h-9 rounded-full hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Phone className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => triggerCall('video')}
            title="Start video call"
            className="w-9 h-9 rounded-full hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Video className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            title="Conversation details"
            className="w-9 h-9 rounded-full hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Canvas */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#F0F2F5]/40 dark:bg-slate-950/40">
        {loading && messages.length === 0 && (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-[#0084FF]" />
          </div>
        )}

        {error && (
          <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!loading && messages.length === 0 && !error && (
          <div className="text-center py-14 flex flex-col items-center">
            <img
              src={person.avatarUrl}
              alt={person.fullName}
              className="w-20 h-20 rounded-full object-cover ring-4 ring-[#0084FF]/20 shadow-md mb-3"
            />
            <h4 className="text-base font-bold text-slate-900 dark:text-white">{person.fullName}</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
              SZMC Alumni Network · MBBS Batch {person.batchYear || 'Colleague'}
            </p>
            <button
              type="button"
              onClick={sendThumbsUp}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0084FF] text-white text-xs font-bold hover:bg-[#0073E6] shadow-sm transition-transform active:scale-95 cursor-pointer"
            >
              <ThumbsUp className="w-3.5 h-3.5" />
              Say Wave 👋
            </button>
          </div>
        )}

        {messages.map((message, index) => {
          const mine = message.senderId === myId;
          const previous = messages[index - 1];
          const showDay = !previous || formatDayLabel(previous.createdAt) !== formatDayLabel(message.createdAt);
          const deleted = Boolean(message.deletedAt);
          const editing = editingId === message.id;

          return (
            <React.Fragment key={message.id}>
              {showDay && (
                <div className="flex justify-center py-2">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-slate-800/80 px-3 py-0.5 rounded-full shadow-2xs border border-slate-200/50 dark:border-slate-700/50">
                    {formatDayLabel(message.createdAt)}
                  </span>
                </div>
              )}

              <div className={`group flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                {/* Colleague avatar on incoming messages */}
                {!mine && (
                  <img
                    src={person.avatarUrl}
                    alt={person.fullName}
                    className="w-7 h-7 rounded-full object-cover shrink-0 mb-1"
                  />
                )}

                <div className={`max-w-[75%] sm:max-w-[65%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  {editing ? (
                    <div className="w-full min-w-[240px] p-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-[#0084FF] shadow-lg">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={2}
                        maxLength={2000}
                        className="w-full resize-none bg-transparent text-sm text-slate-900 dark:text-white outline-none"
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1 rounded-full text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveEdit()}
                          disabled={savingEdit || !editDraft.trim()}
                          className="px-3 py-1 rounded-full text-xs font-bold text-white bg-[#0084FF] hover:bg-[#0073E6] disabled:opacity-50 cursor-pointer"
                        >
                          {savingEdit ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative group/msg">
                      {/* Meta Messenger Chat Bubble */}
                      {!deleted && (message.mediaUrl || message.type === 'image') && (
                        <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm mb-1">
                          <img
                            src={message.mediaUrl || message.body}
                            alt="Attachment"
                            loading="lazy"
                            className="w-full max-h-64 object-cover cursor-pointer hover:opacity-95"
                            onClick={() => window.open(message.mediaUrl || message.body, '_blank')}
                          />
                        </div>
                      )}

                      <div
                        className={`text-[14px] leading-relaxed whitespace-pre-wrap break-words transition-all ${
                          deleted
                            ? 'italic text-slate-500 dark:text-slate-400 bg-slate-200/60 dark:bg-slate-800 px-4 py-2.5 rounded-2xl'
                            : message.type === 'like' || message.body === '👍'
                            ? 'text-4xl py-1'
                            : mine
                            ? 'bg-gradient-to-r from-[#0084FF] to-[#0099FF] text-white rounded-[20px] rounded-br-[4px] px-4 py-2.5 shadow-sm shadow-[#0084FF]/25'
                            : 'bg-[#F0F2F5] dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-[20px] rounded-bl-[4px] px-4 py-2.5'
                        }`}
                      >
                        {deleted
                          ? 'This message was deleted'
                          : message.type === 'image' && message.mediaUrl
                          ? message.body && message.body !== 'Photo'
                            ? message.body
                            : null
                          : message.type === 'like'
                          ? '👍'
                          : message.body}
                      </div>

                      {/* Message Actions (Edit / Delete) */}
                      {mine && !deleted && !editing && (
                        <div className="absolute top-1/2 -translate-y-1/2 -left-16 hidden group-hover/msg:flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-full shadow-md border border-slate-200 dark:border-slate-700">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(message.id);
                              setEditDraft(message.body);
                            }}
                            title="Edit"
                            className="p-1 rounded-full text-slate-500 hover:text-[#0084FF] hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(message.id)}
                            title="Delete"
                            className="p-1 rounded-full text-slate-500 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Message timestamp and status */}
                  <div className={`flex items-center gap-1.5 mt-0.5 px-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      {formatTime(message.createdAt)}
                      {message.editedAt && !deleted ? ' · edited' : ''}
                    </span>
                    {mine && !deleted && (
                      <CheckCheck className="w-3 h-3 text-[#0084FF]" />
                    )}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}

        {/* Meta Messenger 3-Dot Typing Bubble */}
        {typingText && (
          <div className="flex items-end gap-2 animate-fadeIn">
            <img
              src={person.avatarUrl}
              alt={person.fullName}
              className="w-7 h-7 rounded-full object-cover shrink-0 mb-1"
            />
            <div className="bg-[#F0F2F5] dark:bg-slate-800 px-4 py-3 rounded-[20px] rounded-bl-[4px] flex items-center gap-1.5 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce" />
              <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
      </div>

      {/* Quick Emoji Bar */}
      {showEmojiPicker && (
        <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2 overflow-x-auto">
          {quickEmojis.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => handleAddEmoji(em)}
              className="text-xl p-1.5 hover:scale-125 transition-transform cursor-pointer"
            >
              {em}
            </button>
          ))}
        </div>
      )}

      {/* Meta Messenger Rounded Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="p-2.5 sm:p-3 border-t border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 flex items-center gap-1.5 sm:gap-2"
      >
        {/* Left Actions: Plus, Photo */}
        <button
          type="button"
          onClick={() => setShowEmojiPicker((prev) => !prev)}
          title="More actions"
          className="p-2 rounded-full text-[#0084FF] hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
        >
          <Plus className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() => {
            setCallToast('Attach photo feature ready');
            setTimeout(() => setCallToast(null), 2500);
          }}
          title="Attach photo"
          className="p-2 rounded-full text-[#0084FF] hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0 hidden sm:flex"
        >
          <ImageIcon className="w-5 h-5" />
        </button>

        {/* Rounded Input Pill */}
        <div className="flex-1 flex items-center bg-[#F0F2F5] dark:bg-slate-800 rounded-full px-4 py-1.5 min-w-0">
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              onTyping?.();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Aa"
            aria-label="Message"
            className="w-full resize-none bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none leading-relaxed max-h-24 py-1"
          />
          <button
            type="button"
            onClick={() => setShowEmojiPicker((prev) => !prev)}
            title="Choose emoji"
            className="p-1 text-[#0084FF] hover:opacity-80 transition-opacity cursor-pointer shrink-0"
          >
            <Smile className="w-5 h-5" />
          </button>
        </div>

        {/* Iconic Meta Messenger Right Action: Thumbs Up or Send Button */}
        {draft.trim() ? (
          <button
            type="submit"
            disabled={sending}
            aria-label="Send message"
            className="w-10 h-10 rounded-full bg-[#0084FF] hover:bg-[#0073E6] text-white flex items-center justify-center shadow-sm shadow-[#0084FF]/30 transition-transform active:scale-95 cursor-pointer shrink-0"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        ) : (
          <button
            type="button"
            onClick={sendThumbsUp}
            disabled={sending}
            title="Send Like"
            className="p-2 rounded-full text-[#0084FF] hover:scale-125 transition-transform active:scale-95 cursor-pointer shrink-0"
          >
            <ThumbsUp className="w-6 h-6 fill-[#0084FF]" />
          </button>
        )}
      </form>
    </div>
  );
};
