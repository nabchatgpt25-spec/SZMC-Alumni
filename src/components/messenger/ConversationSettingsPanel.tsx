import React, { useState } from 'react';
import { AlertTriangle, ArrowLeft, Bell, BellOff, LogOut, Loader2 } from 'lucide-react';
import { leaveConversation, setConversationMuted } from '../../services/messagingService';
import type { ChatConversation } from '../../types/messaging';

interface ConversationSettingsPanelProps {
  conversation: ChatConversation;
  myId: number;
  onBack: () => void;
  onLeft: () => void;
  onMutedChange: (muted: boolean) => void;
}

export const ConversationSettingsPanel: React.FC<ConversationSettingsPanelProps> = ({
  conversation,
  myId,
  onBack,
  onLeft,
  onMutedChange,
}) => {
  const { person } = conversation;
  const [muting, setMuting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleMute = async () => {
    const next = !conversation.isMuted;
    setMuting(true);
    setError(null);
    try {
      await setConversationMuted(conversation.id, myId, next);
      onMutedChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update notifications.');
    } finally {
      setMuting(false);
    }
  };

  const leave = async () => {
    if (!window.confirm(`Leave this conversation with ${person.fullName}? It will be removed from your list.`)) return;
    setLeaving(true);
    setError(null);
    try {
      await leaveConversation(conversation.id, myId);
      onLeft();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not leave this conversation.');
      setLeaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversation"
          className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Conversation settings</h2>
      </div>

      <div className="p-6 flex flex-col items-center text-center border-b border-slate-100 dark:border-slate-800">
        <img
          src={person.avatarUrl}
          alt={person.fullName}
          className="w-20 h-20 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-700"
        />
        <p className="mt-3 text-base font-black text-slate-900 dark:text-white">{person.fullName}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {[person.profession, person.batchYear ? `Batch ${person.batchYear}` : null].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="p-4 space-y-3">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => void toggleMute()}
          disabled={muting || leaving}
          className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors disabled:opacity-60 cursor-pointer text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
            {muting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : conversation.isMuted ? (
              <Bell className="w-4 h-4" />
            ) : (
              <BellOff className="w-4 h-4" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {conversation.isMuted ? 'Unmute notifications' : 'Mute notifications'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {conversation.isMuted ? 'You are notified about new messages.' : 'Silence alerts for this chat.'}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => void leave()}
          disabled={leaving || muting}
          className="w-full flex items-center gap-3 p-3 rounded-xl border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors disabled:opacity-60 cursor-pointer text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            {leaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">Leave conversation</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Remove this chat from your list.</p>
          </div>
        </button>
      </div>
    </div>
  );
};
