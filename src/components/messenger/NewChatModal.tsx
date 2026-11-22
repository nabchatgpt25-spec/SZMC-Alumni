import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Search, UserPlus, Users, X } from 'lucide-react';
import {
  createGroupConversation,
  findOrCreateDirectConversation,
  listSuggestedColleaguesForChat,
  searchAlumniForChat,
} from '../../services/messagingService';
import type { ChatPerson } from '../../types/messaging';

interface NewChatModalProps {
  myId: number;
  batchYear?: number;
  onClose: () => void;
  onStarted: (conversationId: string) => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({ myId, batchYear, onClose, onStarted }) => {
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [groupTitle, setGroupTitle] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<ChatPerson[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChatPerson[]>([]);
  const [suggestedBatchmates, setSuggestedBatchmates] = useState<ChatPerson[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<number | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setLoadingSuggestions(true);
    listSuggestedColleaguesForChat(myId, batchYear)
      .then((people) => {
        if (!cancelled) setSuggestedBatchmates(people);
      })
      .catch(() => {
        if (!cancelled) setSuggestedBatchmates([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSuggestions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [myId, batchYear]);

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

  const startDirect = async (person: ChatPerson) => {
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

  const toggleGroupMember = (person: ChatPerson) => {
    setError(null);
    setSelectedMembers((prev) =>
      prev.some((m) => m.profileId === person.profileId)
        ? prev.filter((m) => m.profileId !== person.profileId)
        : [...prev, person]
    );
  };

  const handleCreateGroup = async () => {
    const cleanTitle = groupTitle.trim();
    if (cleanTitle.length < 2) {
      setError('Enter a group name (at least 2 characters).');
      return;
    }
    if (selectedMembers.length < 1) {
      setError('Select at least 1 colleague to create a group.');
      return;
    }
    setCreatingGroup(true);
    setError(null);
    try {
      const conversationId = await createGroupConversation(
        myId,
        cleanTitle,
        selectedMembers.map((m) => m.profileId)
      );
      onStarted(conversationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create group chat.');
      setCreatingGroup(false);
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
            {mode === 'group' ? (
              <Users className="w-4 h-4 text-[#0084FF]" />
            ) : (
              <UserPlus className="w-4 h-4 text-[#0084FF]" />
            )}
            <h2 id="new-chat-title" className="text-base font-black text-slate-900 dark:text-white">
              {mode === 'group' ? 'New group chat' : 'New chat'}
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

        {/* Mode Switcher: Direct vs Group */}
        <div className="px-4 pt-3">
          <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 gap-1">
            <button
              type="button"
              onClick={() => {
                setMode('direct');
                setError(null);
              }}
              className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === 'direct'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Direct Chat
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('group');
                setError(null);
              }}
              className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === 'group'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              New Group
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {mode === 'group' && (
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                Group Name
              </label>
              <input
                type="text"
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                maxLength={80}
                placeholder="e.g. SZMC Batch 22 Reunion, Cardiology Consults"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0084FF]/40 focus:border-[#0084FF]"
              />
            </div>
          )}

          {mode === 'group' && selectedMembers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedMembers.map((member) => (
                <span
                  key={member.profileId}
                  className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-xs font-semibold text-blue-800 dark:text-blue-200"
                >
                  <img
                    src={member.avatarUrl}
                    alt={member.fullName}
                    className="w-4 h-4 rounded-full object-cover"
                  />
                  <span className="max-w-[120px] truncate">{member.fullName}</span>
                  <button
                    type="button"
                    onClick={() => toggleGroupMember(member)}
                    className="text-blue-500 hover:text-blue-700 dark:hover:text-blue-100 cursor-pointer"
                    aria-label={`Remove ${member.fullName}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                autoFocus={typeof window !== 'undefined' && window.innerWidth >= 768}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={mode === 'group' ? 'Search alumni to add to group' : 'Search alumni by name or specialty'}
                aria-label="Search alumni"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
              />
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
              Type at least 2 letters to search verified & registered alumni.
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 min-h-[180px]">
          {error && (
            <p className="mx-2 mb-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}

          {(searching || (trimmed.length < 2 && loadingSuggestions)) && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            </div>
          )}

          {!searching && trimmed.length >= 2 && results.length === 0 && !error && (
            <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-8">
              No alumni found for "{trimmed}".
            </p>
          )}

          {!searching && trimmed.length < 2 && !loadingSuggestions && suggestedBatchmates.length > 0 && (
            <div className="px-3 pt-1 pb-1.5">
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {batchYear ? `MBBS Batch ${batchYear} Colleagues` : 'Suggested SZMC Colleagues'}
              </p>
            </div>
          )}

          {!searching &&
            (trimmed.length >= 2 ? results : suggestedBatchmates).map((person) => {
              const isSelected = selectedMembers.some((m) => m.profileId === person.profileId);
              return (
                <button
                  key={person.profileId}
                  type="button"
                  onClick={() => (mode === 'group' ? toggleGroupMember(person) : void startDirect(person))}
                  disabled={startingId !== null || creatingGroup}
                  className={`w-full min-h-[48px] flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors disabled:opacity-60 cursor-pointer ${
                    mode === 'group' && isSelected
                      ? 'bg-blue-50/80 dark:bg-blue-950/40'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <img
                    src={person.avatarUrl}
                    alt={person.fullName}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {person.fullName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {[person.profession, person.batchYear ? `Batch ${person.batchYear}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {mode === 'group' ? (
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center border shrink-0 ${
                        isSelected
                          ? 'bg-[#0084FF] border-[#0084FF] text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                    </span>
                  ) : (
                    startingId === person.profileId && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  )}
                </button>
              );
            })}
        </div>

        {mode === 'group' && (
          <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {selectedMembers.length} {selectedMembers.length === 1 ? 'colleague' : 'colleagues'} selected
            </span>
            <button
              type="button"
              onClick={() => void handleCreateGroup()}
              disabled={creatingGroup || groupTitle.trim().length < 2 || selectedMembers.length < 1}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0084FF] hover:bg-[#0073E6] disabled:opacity-50 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
            >
              {creatingGroup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
              <span>{creatingGroup ? 'Creating...' : 'Create Group'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
