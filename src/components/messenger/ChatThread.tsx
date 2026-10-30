import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Info, Loader2, Pencil, Send, Trash2 } from 'lucide-react';
import type { ChatConversation, ChatMessage } from '../../types/messaging';

interface ChatThreadProps {
  conversation: ChatConversation;
  messages: ChatMessage[];
  myId: number;
  loading: boolean;
  error: string | null;
  sending: boolean;
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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft('');
    setEditingId(null);
  }, [conversation.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, conversation.id]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    const ok = await onSend(body);
    if (ok) setDraft('');
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

  const { person } = conversation;

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <img
          src={person.avatarUrl}
          alt={person.fullName}
          className="w-9 h-9 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{person.fullName}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {[person.profession, person.batchYear ? `Batch ${person.batchYear}` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Conversation settings"
          className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-slate-50/60 dark:bg-slate-950/40">
        {loading && messages.length === 0 && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!loading && messages.length === 0 && !error && (
          <div className="text-center py-10">
            <p className="text-sm font-bold text-slate-900 dark:text-white">Say hello to {person.fullName}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Messages you send here are private to the two of you.</p>
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
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-800">
                    {formatDayLabel(message.createdAt)}
                  </span>
                </div>
              )}
              <div className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%] sm:max-w-[70%] flex flex-col">
                  {editing ? (
                    <div className="w-full min-w-[220px] p-2 rounded-2xl bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={2}
                        maxLength={2000}
                        className="w-full resize-none bg-transparent text-sm text-slate-900 dark:text-white outline-none"
                      />
                      <div className="flex justify-end gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveEdit()}
                          disabled={savingEdit || !editDraft.trim()}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {savingEdit ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`px-3.5 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                        deleted
                          ? 'italic text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700'
                          : mine
                            ? 'bg-blue-600 text-white rounded-br-md'
                            : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-md'
                      }`}
                    >
                      {deleted ? 'This message was deleted' : message.body}
                    </div>
                  )}

                  <div className={`flex items-center gap-2 mt-1 px-1 ${mine ? 'justify-end' : ''}`}>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      {formatTime(message.createdAt)}
                      {message.editedAt && !deleted ? ' · edited' : ''}
                    </span>
                    {mine && !deleted && !editing && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(message.id);
                            setEditDraft(message.body);
                          }}
                          aria-label="Edit message"
                          className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(message.id)}
                          aria-label="Delete message"
                          className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-end gap-2"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Write a message..."
          aria-label="Message"
          className="flex-1 max-h-32 resize-none rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="Send message"
          className="p-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
};
