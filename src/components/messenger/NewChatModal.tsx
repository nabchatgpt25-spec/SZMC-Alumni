import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Search, UserPlus, X } from 'lucide-react';
import { findOrCreateDirectConversation, searchAlumniForChat } from '../../services/messagingService';
import type { ChatPerson } from '../../types/messaging';

interface NewChatModalProps {
  myId: number;
  onClose: () => void;
  onStarted: (conversationId: string) => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({ myId, onClose, onStarted }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChatPerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<number | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      setError(null);
      return;
    }
    const requestId = ++requestRef.current;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const people = await searchAlumniForChat(term, myId);
        if (requestId !== requestRef.current) return;
        setResults(people);
        setError(null);
      } catch (err) {
        if (requestId !== requestRef.current) return;
        setResults([]);
        setError(err instanceof Error ? err.message : 'Search failed. Please try again.');
      } finally {
        if (requestId === requestRef.current) setSearching(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, myId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const start = async (person: ChatPerson) => {
    setStartingId(person.profileId);
    setError(null);
    try {
      const conversationId = await findOrCreateDirectConversation(myId, person.profileId);
      onStarted(conversationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start this conversation.');
      setStartingId(null);
    }
  };

  const trimmed = query.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chat-title"
        className="relative w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[85vh]"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-blue-600" />
            <h2 id="new-chat-title" className="text-base font-black text-slate-900 dark:text-white">
              New chat
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search alumni by name"
              aria-label="Search alumni by name"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
            />
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">Type at least 2 letters to search.</p>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 min-h-[160px]">
          {error && (
            <p className="mx-2 mb-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300">{error}</p>
          )}

          {searching && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            </div>
          )}

          {!searching && trimmed.length >= 2 && results.length === 0 && !error && (
            <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-8">No alumni found for "{trimmed}".</p>
          )}

          {!searching &&
            results.map((person) => (
              <button
                key={person.profileId}
                type="button"
                onClick={() => void start(person)}
                disabled={startingId !== null}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors disabled:opacity-60 cursor-pointer"
              >
                <img
                  src={person.avatarUrl}
                  alt={person.fullName}
                  className="w-10 h-10 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{person.fullName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {[person.profession, person.batchYear ? `Batch ${person.batchYear}` : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {startingId === person.profileId && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
};
