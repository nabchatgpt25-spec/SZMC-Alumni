import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Bell,
  BellOff,
  Image as ImageIcon,
  LogOut,
  Loader2,
  Megaphone,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  addGroupMember,
  leaveConversation,
  searchAlumniForChat,
  setConversationMuted,
} from '../../services/messagingService';
import { blockUser, unblockUser } from '../../services/communitySafetyService';
import type { ChatConversation, ChatPerson } from '../../types/messaging';

interface SharedPhotoItem {
  id: string;
  url: string;
  createdAt: string;
}

interface ConversationSettingsPanelProps {
  conversation: ChatConversation;
  myId: number;
  participants?: ChatPerson[];
  onlineProfileIds?: Set<number>;
  sharedPhotos?: SharedPhotoItem[];
  onBack: () => void;
  onLeft: () => void;
  onMutedChange: (muted: boolean) => void;
  onBlockStatusChange?: () => void;
  onParticipantsChanged?: () => void;
}

export const ConversationSettingsPanel: React.FC<ConversationSettingsPanelProps> = ({
  conversation,
  myId,
  participants = [],
  onlineProfileIds = new Set(),
  sharedPhotos = [],
  onBack,
  onLeft,
  onMutedChange,
  onBlockStatusChange,
  onParticipantsChanged,
}) => {
  const { person } = conversation;
  const [muting, setMuting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [togglingBlock, setTogglingBlock] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group member invite state
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState<ChatPerson[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [addingMemberId, setAddingMemberId] = useState<number | null>(null);

  // In-app lightbox for shared photos
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const isDirectChat = !conversation.type || conversation.type === 'direct';
  const isGroupChat = conversation.type === 'group';
  const isAnnouncement = conversation.type === 'announcement';
  const isBlockedByMe = Boolean(conversation.isBlockedByMe);

  useEffect(() => {
    if (!showAddMember) return;
    const term = memberQuery.trim();
    if (term.length < 2) {
      setMemberResults([]);
      setSearchingMembers(false);
      return;
    }
    let cancelled = false;
    setSearchingMembers(true);
    const timer = window.setTimeout(async () => {
      try {
        const found = await searchAlumniForChat(term, myId);
        if (cancelled) return;
        const existingIds = new Set(participants.map((p) => p.profileId));
        setMemberResults(found.filter((p) => !existingIds.has(p.profileId)));
      } catch {
        if (!cancelled) setMemberResults([]);
      } finally {
        if (!cancelled) setSearchingMembers(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [showAddMember, memberQuery, myId, participants]);

  const handleAddMember = async (candidate: ChatPerson) => {
    setAddingMemberId(candidate.profileId);
    setError(null);
    try {
      await addGroupMember(conversation.id, candidate.profileId);
      setMemberQuery('');
      setMemberResults([]);
      setShowAddMember(false);
      onParticipantsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add colleague to this group.');
    } finally {
      setAddingMemberId(null);
    }
  };

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

  const toggleBlock = async () => {
    if (!isDirectChat || !person.profileId || person.profileId === myId) return;
    setTogglingBlock(true);
    setError(null);
    try {
      if (isBlockedByMe) {
        const res = await unblockUser(myId, person.profileId);
        if (!res.success && res.error) setError(res.error);
      } else {
        const res = await blockUser({
          blockerId: myId,
          blockedUser: {
            id: person.profileId,
            fullName: person.fullName,
            avatarUrl: person.avatarUrl,
            batchYear: person.batchYear,
            profession: person.profession,
          },
          reason: 'Blocked from Messenger',
        });
        if (!res.success && res.error) setError(res.error);
      }
      onBlockStatusChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update block status.');
    } finally {
      setTogglingBlock(false);
    }
  };

  const confirmLeave = async () => {
    setLeaving(true);
    setError(null);
    try {
      await leaveConversation(conversation.id, myId);
      onLeft();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not leave this conversation.');
      setLeaving(false);
      setConfirmingLeave(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden relative">
      <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversation"
          className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
          {isGroupChat ? 'Group details' : isAnnouncement ? 'Channel details' : 'Conversation details'}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 flex flex-col items-center text-center border-b border-slate-100 dark:border-slate-800">
          {isGroupChat ? (
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#0084FF] to-indigo-500 text-white flex items-center justify-center shadow-md">
              <Users className="w-9 h-9" />
            </div>
          ) : isAnnouncement ? (
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-purple-600 to-[#0084FF] text-white flex items-center justify-center shadow-md">
              <Megaphone className="w-9 h-9" />
            </div>
          ) : (
            <img
              src={person.avatarUrl}
              alt={person.fullName}
              className="w-20 h-20 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-700"
            />
          )}
          <p className="mt-3 text-base font-black text-slate-900 dark:text-white">{person.fullName}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isGroupChat
              ? `${participants.length || conversation.participantCount || 2} group members`
              : isAnnouncement
              ? 'Official SZMC Alumni Announcements'
              : [person.profession, person.batchYear ? `Batch ${person.batchYear}` : null].filter(Boolean).join(' · ')}
          </p>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Group Members List + Add Member */}
          {isGroupChat && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#0084FF]" />
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Members ({participants.length})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddMember((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#0084FF] hover:underline cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{showAddMember ? 'Close' : 'Add member'}</span>
                </button>
              </div>

              {showAddMember && (
                <div className="space-y-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={memberQuery}
                      onChange={(e) => setMemberQuery(e.target.value)}
                      placeholder="Search alumni to invite..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[#0084FF]/30"
                    />
                  </div>
                  {searchingMembers && (
                    <div className="flex justify-center py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[#0084FF]" />
                    </div>
                  )}
                  {!searchingMembers && memberResults.length > 0 && (
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {memberResults.map((candidate) => (
                        <button
                          key={candidate.profileId}
                          type="button"
                          onClick={() => void handleAddMember(candidate)}
                          disabled={addingMemberId !== null}
                          className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-900 text-left cursor-pointer disabled:opacity-50"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <img
                              src={candidate.avatarUrl}
                              alt={candidate.fullName}
                              className="w-7 h-7 rounded-full object-cover shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                {candidate.fullName}
                              </p>
                              <p className="text-[10px] text-slate-500 truncate">
                                Batch {candidate.batchYear}
                              </p>
                            </div>
                          </div>
                          {addingMemberId === candidate.profileId ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0084FF] shrink-0" />
                          ) : (
                            <span className="text-[11px] font-bold text-[#0084FF] shrink-0">Add</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {participants.map((member) => {
                  const isOnline = onlineProfileIds.has(member.profileId);
                  return (
                    <div key={member.profileId} className="flex items-center gap-2.5">
                      <div className="relative shrink-0">
                        <img
                          src={member.avatarUrl}
                          alt={member.fullName}
                          className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700"
                        />
                        {isOnline && (
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {member.fullName} {member.profileId === myId ? '(You)' : ''}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          {isOnline ? 'Active now' : `Batch ${member.batchYear} · ${member.profession}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Shared Photos Gallery */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#0084FF]" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Shared Photos ({sharedPhotos.length})
                </h3>
              </div>
            </div>
            {sharedPhotos.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Photos shared in this conversation will appear here.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {sharedPhotos.slice(0, 9).map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setLightboxUrl(photo.url)}
                    className="aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    <img
                      src={photo.url}
                      alt="Shared photo"
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notification Mute Toggle */}
          <button
            type="button"
            onClick={() => void toggleMute()}
            disabled={muting || leaving || togglingBlock}
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
                {conversation.isMuted ? 'Notifications are silenced for this chat.' : 'Silence alerts for this chat.'}
              </p>
            </div>
          </button>

          {/* Block / Unblock (Direct chats only) */}
          {isDirectChat && person.profileId !== myId && (
            <button
              type="button"
              onClick={() => void toggleBlock()}
              disabled={togglingBlock || muting || leaving}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors disabled:opacity-60 cursor-pointer text-left ${
                isBlockedByMe
                  ? 'border-emerald-200 dark:border-emerald-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                  : 'border-amber-200 dark:border-amber-900 hover:bg-amber-50 dark:hover:bg-amber-950/30'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  isBlockedByMe
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                }`}
              >
                {togglingBlock ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isBlockedByMe ? (
                  <ShieldCheck className="w-4 h-4" />
                ) : (
                  <Ban className="w-4 h-4" />
                )}
              </div>
              <div className="flex-1">
                <p
                  className={`text-sm font-semibold ${
                    isBlockedByMe
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {isBlockedByMe ? `Unblock ${person.fullName}` : `Block ${person.fullName}`}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isBlockedByMe
                    ? 'Allow this user to message you again.'
                    : 'Prevent this user from messaging you or finding you in chat search.'}
                </p>
              </div>
            </button>
          )}

          {/* Leave Conversation (inline 2-step confirmation) */}
          {confirmingLeave ? (
            <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30 space-y-2.5">
              <p className="text-xs font-semibold text-rose-800 dark:text-rose-200">
                Leave {isGroupChat ? `group "${person.fullName}"` : `conversation with ${person.fullName}`}? It will be removed from your inbox.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void confirmLeave()}
                  disabled={leaving}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-60 cursor-pointer"
                >
                  {leaving ? 'Leaving...' : 'Yes, leave chat'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingLeave(false)}
                  disabled={leaving}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingLeave(true)}
              disabled={leaving || muting || togglingBlock}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors disabled:opacity-60 cursor-pointer text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                {leaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                  {isGroupChat ? 'Leave group' : 'Leave conversation'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Remove this chat from your list.</p>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Shared Photo Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            aria-label="Close photo"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/15 hover:bg-white/25 text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="Full-size shared photo"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
};
