import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowLeft,
  GraduationCap,
  Users,
  Megaphone,
  Calendar,
  Image as ImageIcon,
  BarChart3,
  ShieldCheck,
  Pin,
  PinOff,
  Search,
  Send,
  Plus,
  CheckCircle2,
  MapPin,
  Briefcase,
  MessageSquare,
  Heart,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { fetchBatchAlumniProfilesFromDb } from '../../services/supabaseService';
import { normalizeToBatchNumber } from '../../utils/verificationService';
import {
  fetchBatchLounge,
  fetchBatchLoungeModerators,
  assignBatchLoungeModerator,
  removeBatchLoungeModerator,
  fetchSpacePosts,
  createSpacePost,
  togglePinSpacePost,
  fetchCommunityPolls,
  createCommunityPoll,
  voteCommunityPoll,
  type BatchLoungeInfo,
  type BatchLoungeModerator,
  type SpacePost,
  type SpacePostKind,
  type CommunityPoll,
} from '../../services/communitySpacesService';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { compressImageFileToDataUrl } from '../../utils/mediaStorage';
import type { AlumniProfile } from '../../types';

interface BatchLoungeViewProps {
  batchYear: number;
  onNavigate?: (route: string) => void;
  onViewProfile?: (profileId: number) => void;
}

type LoungeTab = 'feed' | 'announcements' | 'members' | 'memories' | 'events' | 'polls' | 'moderators';

const LOUNGE_TABS: { id: LoungeTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'feed', label: 'Feed', icon: MessageSquare },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'memories', label: 'Memories', icon: ImageIcon },
  { id: 'events', label: 'Events', icon: Calendar },
  { id: 'polls', label: 'Polls', icon: BarChart3 },
  { id: 'moderators', label: 'Moderators', icon: ShieldCheck },
];

function formatRelativeDate(iso?: string): string {
  if (!iso) return 'Just now';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export const BatchLoungeView: React.FC<BatchLoungeViewProps> = ({
  batchYear,
  onNavigate,
  onViewProfile,
}) => {
  const { currentUser, isAdminUser } = useAuth();
  const safeBatch = Math.max(1, Math.min(35, Math.floor(batchYear || 1)));
  const paddedBatch = safeBatch < 10 ? `0${safeBatch}` : String(safeBatch);
  const myBatchNum = normalizeToBatchNumber(currentUser.batchYear);
  const isMyBatch = myBatchNum === safeBatch;

  const [activeTab, setActiveTab] = useState<LoungeTab>('feed');
  const [lounge, setLounge] = useState<BatchLoungeInfo | null>(null);
  const [members, setMembers] = useState<AlumniProfile[]>([]);
  const [moderators, setModerators] = useState<BatchLoungeModerator[]>([]);
  const [posts, setPosts] = useState<SpacePost[]>([]);
  const [polls, setPolls] = useState<CommunityPoll[]>([]);
  const [portalEvents, setPortalEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Composer state
  const [composerText, setComposerText] = useState('');
  const [composerKind, setComposerKind] = useState<SpacePostKind>('discussion');
  const [composerPin, setComposerPin] = useState(false);
  const [composerImages, setComposerImages] = useState<string[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);

  // Member search state
  const [memberSearch, setMemberSearch] = useState('');

  // Poll creator state
  const [showPollForm, setShowPollForm] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [isCreatingPoll, setIsCreatingPoll] = useState(false);

  // Moderator assignment state (Admin only)
  const [assignProfileId, setAssignProfileId] = useState<string>('');
  const [assignRole, setAssignRole] = useState<'coordinator' | 'moderator'>('moderator');

  const isBatchModerator = useMemo(() => {
    if (isAdminUser) return true;
    return moderators.some((m) => m.profileId === currentUser.id);
  }, [isAdminUser, moderators, currentUser.id]);

  const canPostInLounge = isMyBatch || isBatchModerator;

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [loungeData, memberRows, modRows, postRes, pollRes] = await Promise.all([
        fetchBatchLounge(safeBatch),
        fetchBatchAlumniProfilesFromDb(safeBatch).catch(() => []),
        fetchBatchLoungeModerators(safeBatch),
        fetchSpacePosts({ batchLoungeYear: safeBatch, limit: 40 }),
        fetchCommunityPolls({ batchYear: safeBatch, currentProfileId: currentUser.id }),
      ]);

      setLounge(loungeData);
      setMembers(memberRows || []);
      setModerators(modRows);
      setPosts(postRes.posts);
      setPolls(pollRes.polls);

      if (isSupabaseConfigured) {
        const { data: evData } = await supabase
          .from('events')
          .select('id, title, date_label, location, description, category')
          .order('created_at', { ascending: false })
          .limit(6);
        setPortalEvents(evData || []);
      }
    } finally {
      setLoading(false);
    }
  }, [safeBatch, currentUser.id]);

  useEffect(() => {
    setActiveTab('feed');
    setComposerText('');
    setComposerImages([]);
    setComposerKind('discussion');
    setComposerPin(false);
    void loadAll();
  }, [loadAll]);

  const verifiedMembersCount = useMemo(
    () => members.filter((m) => m.verificationStatus === 'verified').length,
    [members]
  );

  const bloodDonorsCount = useMemo(
    () => members.filter((m) => Boolean(m.bloodDonorProfile?.isRegisteredDonor || m.bloodGroup)).length,
    [members]
  );

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.fullName.toLowerCase().includes(q) ||
        (m.institution || '').toLowerCase().includes(q) ||
        (m.position || '').toLowerCase().includes(q) ||
        (m.city || '').toLowerCase().includes(q) ||
        (m.bloodGroup || '').toLowerCase().includes(q)
    );
  }, [members, memberSearch]);

  const announcements = useMemo(
    () => posts.filter((p) => p.pinned || p.postKind === 'announcement'),
    [posts]
  );

  const memoryPosts = useMemo(
    () => posts.filter((p) => p.postKind === 'memory' || (p.images && p.images.length > 0)),
    [posts]
  );

  const eventPosts = useMemo(
    () => posts.filter((p) => p.postKind === 'event' || p.category === 'Reunion'),
    [posts]
  );

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 4);
    if (files.length === 0) return;
    try {
      const encoded = await Promise.all(files.map((f) => compressImageFileToDataUrl(f, 1280, 0.82)));
      setComposerImages((prev) => [...prev, ...encoded].slice(0, 4));
      if (composerKind === 'discussion') setComposerKind('memory');
    } catch {
      showToast('error', 'Unable to process selected image.');
    }
    e.target.value = '';
  };

  const handlePublishPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPostInLounge || !composerText.trim() || isPublishing) return;
    setIsPublishing(true);
    const res = await createSpacePost({
      authorId: currentUser.id,
      content: composerText,
      images: composerImages,
      batchLoungeYear: safeBatch,
      postKind: composerKind,
      isPinned: isBatchModerator && composerPin,
    });
    setIsPublishing(false);

    if (!res.ok) {
      showToast('error', res.error || 'Could not publish post.');
      return;
    }

    if (res.post) {
      setPosts((prev) => [res.post!, ...prev]);
    }
    setComposerText('');
    setComposerImages([]);
    setComposerPin(false);
    setComposerKind('discussion');
    showToast('success', `Published to SZMC-${paddedBatch} Lounge.`);
  };

  const handleTogglePin = async (post: SpacePost) => {
    if (!isBatchModerator) return;
    const nextPinned = !post.pinned;
    const res = await togglePinSpacePost(post.id, nextPinned);
    if (!res.ok) {
      showToast('error', res.error || 'Could not update pin status.');
      return;
    }
    setPosts((prev) =>
      prev
        .map((p) => (p.id === post.id ? { ...p, pinned: nextPinned } : p))
        .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))
    );
    showToast('success', nextPinned ? 'Announcement pinned to top.' : 'Post unpinned.');
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPostInLounge || isCreatingPoll) return;
    setIsCreatingPoll(true);
    const res = await createCommunityPoll({
      authorId: currentUser.id,
      question: pollQuestion,
      options: pollOptions,
      batchYear: safeBatch,
    });
    setIsCreatingPoll(false);
    if (!res.ok) {
      showToast('error', res.error || 'Could not create poll.');
      return;
    }
    setPollQuestion('');
    setPollOptions(['', '']);
    setShowPollForm(false);
    const fresh = await fetchCommunityPolls({ batchYear: safeBatch, currentProfileId: currentUser.id });
    setPolls(fresh.polls);
    showToast('success', 'Batch poll published.');
  };

  const handleVote = async (pollId: number, optionId: string) => {
    const res = await voteCommunityPoll(pollId, currentUser.id, optionId);
    if (!res.ok) {
      showToast('error', res.error || 'Could not record vote.');
      return;
    }
    const fresh = await fetchCommunityPolls({ batchYear: safeBatch, currentProfileId: currentUser.id });
    setPolls(fresh.polls);
  };

  const handleAssignModerator = async (e: React.FormEvent) => {
    e.preventDefault();
    const pid = Number(assignProfileId);
    if (!pid) return;
    const res = await assignBatchLoungeModerator(safeBatch, pid, assignRole, currentUser.id);
    if (!res.ok) {
      showToast('error', res.error || 'Could not assign moderator.');
      return;
    }
    setAssignProfileId('');
    const mods = await fetchBatchLoungeModerators(safeBatch);
    setModerators(mods);
    showToast('success', 'Batch lounge moderator updated.');
  };

  const handleRemoveModerator = async (profileId: number) => {
    const res = await removeBatchLoungeModerator(safeBatch, profileId);
    if (!res.ok) {
      showToast('error', res.error || 'Could not remove moderator.');
      return;
    }
    setModerators((prev) => prev.filter((m) => m.profileId !== profileId));
    showToast('success', 'Moderator removed.');
  };

  const renderPostCard = (post: SpacePost) => (
    <article
      key={post.id}
      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onViewProfile?.(post.userId)}
          className="flex items-center gap-3 text-left min-w-0 group cursor-pointer"
        >
          <img
            src={post.avatarUrl}
            alt={post.fullName}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                {post.fullName}
              </span>
              {post.verified && (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" aria-label="Verified Alumnus" />
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
              <span>{formatRelativeDate(post.createdAt)}</span>
              <span>·</span>
              <span className="capitalize">{post.postKind}</span>
              {post.pinned && (
                <>
                  <span>·</span>
                  <span className="text-blue-600 dark:text-blue-400 font-semibold inline-flex items-center gap-1">
                    <Pin className="w-3 h-3" /> Pinned
                  </span>
                </>
              )}
            </div>
          </div>
        </button>

        {isBatchModerator && (
          <button
            type="button"
            onClick={() => handleTogglePin(post)}
            title={post.pinned ? 'Unpin announcement' : 'Pin to announcements'}
            className="min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer shrink-0"
          >
            {post.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{post.pinned ? 'Unpin' : 'Pin'}</span>
          </button>
        )}
      </div>

      <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
        {post.content}
      </p>

      {post.images && post.images.length > 0 && (
        <div
          className={`grid gap-2 ${
            post.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
          }`}
        >
          {post.images.map((img, i) => (
            <div
              key={i}
              className="rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700/70 aspect-[16/10]"
            >
              <img
                src={img}
                alt="Batch memory"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      )}

      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
        <span className="inline-flex items-center gap-1.5">
          <Heart className="w-3.5 h-3.5" />
          <span>{post.likesCount}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{post.commentsCount}</span>
        </span>
      </div>
    </article>
  );

  return (
    <div className="max-w-5xl mx-auto w-full space-y-5">
      {/* Top Breadcrumb & Batch Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate?.('batches')}
            className="min-h-[40px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All 35 Batch Lounges</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('feed')}
            className="min-h-[40px] px-3 py-2 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer whitespace-nowrap"
          >
            The Quad
          </button>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="hidden sm:inline font-medium">Switch batch</span>
          <select
            aria-label="Switch Batch Lounge"
            value={safeBatch}
            onChange={(e) => onNavigate?.(`batch-lounge/${e.target.value}`)}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            {Array.from({ length: 35 }, (_, idx) => {
              const num = idx + 1;
              const pad = num < 10 ? `0${num}` : String(num);
              const sess = `${1990 + num}-${String((1991 + num) % 100).padStart(2, '0')}`;
              return (
                <option key={num} value={num}>
                  SZMC-{pad} · Session {sess}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      {/* Lounge Editorial Header */}
      <header className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 dark:bg-blue-600 text-white font-mono font-bold text-lg flex flex-col items-center justify-center shrink-0">
              <span className="text-[10px] font-sans font-medium uppercase tracking-wider opacity-75">
                SZMC
              </span>
              <span className="leading-none">{paddedBatch}</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {lounge?.title || `SZMC Batch ${paddedBatch} Lounge`}
                </h1>
                {isMyBatch && (
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    · Your Batch
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed max-w-2xl">
                {lounge?.description}
              </p>
            </div>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums shrink-0">
            Session {lounge?.session || `${1990 + safeBatch}-${String((1991 + safeBatch) % 100).padStart(2, '0')}`}
          </div>
        </div>

        {/* Clean Tabular Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Registered Alumni</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
              {members.length}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Verified Doctors</div>
            <div className="text-lg font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
              {verifiedMembersCount}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Blood Donors</div>
            <div className="text-lg font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-0.5">
              {bloodDonorsCount}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Lounge Posts</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
              {posts.length}
            </div>
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <nav
          aria-label="Batch Lounge Sections"
          className="flex items-center gap-1.5 overflow-x-auto pt-2 -mx-1 px-1 scrollbar-none"
        >
          {LOUNGE_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const badgeCount =
              tab.id === 'announcements'
                ? announcements.length
                : tab.id === 'members'
                ? members.length
                : tab.id === 'memories'
                ? memoryPosts.length
                : tab.id === 'polls'
                ? polls.length
                : tab.id === 'moderators'
                ? moderators.length
                : null;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-blue-600 dark:text-white'
                    : 'bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700/80'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
                {badgeCount !== null && badgeCount > 0 && (
                  <span
                    className={`font-mono tabular-nums text-[11px] ${
                      isActive ? 'text-white/80' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Inline Toast Feedback */}
      {feedback && (
        <div
          role="status"
          className={`rounded-xl px-4 py-3 text-xs font-medium flex items-center justify-between gap-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800/60'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800/60'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-10 text-center text-xs text-slate-500">
          Loading SZMC-{paddedBatch} Lounge...
        </div>
      ) : (
        <>
          {/* TAB 1: FEED */}
          {activeTab === 'feed' && (
            <div className="space-y-4">
              {canPostInLounge ? (
                <form
                  onSubmit={handlePublishPost}
                  className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Share with SZMC-{paddedBatch} Batchmates
                    </span>
                    <select
                      aria-label="Post type"
                      value={composerKind}
                      onChange={(e) => setComposerKind(e.target.value as SpacePostKind)}
                      className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg px-2.5 py-1.5 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="discussion">Discussion</option>
                      <option value="announcement">Announcement</option>
                      <option value="memory">Memory / Photo</option>
                      <option value="event">Reunion / Event</option>
                    </select>
                  </div>

                  <textarea
                    rows={3}
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    placeholder={`Write an update, reunion plan, or campus memory for Batch ${paddedBatch}...`}
                    className="w-full rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 resize-y"
                  />

                  {composerImages.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {composerImages.map((src, idx) => (
                        <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                          <img src={src} alt="Attachment preview" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setComposerImages((prev) => prev.filter((_, i) => i !== idx))}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-900/80 text-white flex items-center justify-center cursor-pointer"
                            aria-label="Remove image"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-3">
                      <label className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer">
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Add Photos</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleImagePick}
                          className="hidden"
                        />
                      </label>

                      {isBatchModerator && (
                        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={composerPin}
                            onChange={(e) => setComposerPin(e.target.checked)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span>Pin announcement</span>
                        </label>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={!composerText.trim() || isPublishing}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isPublishing ? 'Publishing...' : 'Post to Lounge'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="rounded-2xl bg-slate-100/70 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 text-xs text-slate-600 dark:text-slate-400">
                  You are viewing <strong className="text-slate-900 dark:text-slate-200">SZMC-{paddedBatch} Lounge</strong> as a guest alumnus. Posting is reserved for Batch {paddedBatch} members and assigned moderators.
                </div>
              )}

              {posts.length === 0 ? (
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-10 text-center space-y-2">
                  <GraduationCap className="w-8 h-8 text-slate-400 mx-auto" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    No lounge posts in SZMC-{paddedBatch} yet
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    {canPostInLounge
                      ? 'Start the first discussion, reunion update, or campus memory for your classmates above.'
                      : 'Discussions shared by Batch ' + paddedBatch + ' alumni will appear here.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">{posts.map(renderPostCard)}</div>
              )}
            </div>
          )}

          {/* TAB 2: ANNOUNCEMENTS */}
          {activeTab === 'announcements' && (
            <div className="space-y-3">
              {announcements.length === 0 ? (
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-10 text-center space-y-2">
                  <Megaphone className="w-8 h-8 text-slate-400 mx-auto" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    No pinned batch announcements
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Important notices from SZMC-{paddedBatch} coordinators and moderators appear here.
                  </p>
                </div>
              ) : (
                announcements.map(renderPostCard)
              )}
            </div>
          )}

          {/* TAB 3: MEMBERS */}
          {activeTab === 'members' && (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Batch {paddedBatch} Alumni Roster ({filteredMembers.length})
                </h2>
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Search name, hospital, city, blood..."
                    className="w-full min-h-[40px] pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {filteredMembers.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                  No registered members found matching your filter in Batch {paddedBatch}.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredMembers.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => onViewProfile?.(member.id)}
                      className="text-left rounded-xl p-3.5 bg-slate-50/80 dark:bg-slate-800/70 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 hover:border-blue-400 transition-colors flex items-start gap-3 cursor-pointer"
                    >
                      <img
                        src={member.avatarUrl}
                        alt={member.fullName}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                      />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {member.fullName}
                          </span>
                          {member.verificationStatus === 'verified' && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                          {member.position || member.profession || 'Doctor / Alumnus'}
                        </div>
                        {member.institution && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                            <Briefcase className="w-3 h-3 shrink-0" />
                            <span className="truncate">{member.institution}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-0.5">
                          {member.city && (
                            <span className="inline-flex items-center gap-0.5 truncate">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">{member.city}</span>
                            </span>
                          )}
                          {member.bloodGroup && (
                            <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                              {member.bloodGroup}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: MEMORIES & PHOTOS */}
          {activeTab === 'memories' && (
            <div className="space-y-4">
              {memoryPosts.length === 0 ? (
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-10 text-center space-y-2">
                  <ImageIcon className="w-8 h-8 text-slate-400 mx-auto" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    No campus memories uploaded yet
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Share a photo post in the Feed tab to build the SZMC-{paddedBatch} photo archive.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {memoryPosts.map(renderPostCard)}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: EVENTS & REUNION */}
          {activeTab === 'events' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Batch {paddedBatch} Reunions & College Events
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Coordinate batch get-togethers alongside official SZMC Alumni events.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate?.('events')}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold cursor-pointer whitespace-nowrap self-start sm:self-auto"
                >
                  View All Portal Events
                </button>
              </div>

              {portalEvents.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {portalEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-1.5"
                    >
                      <div className="text-xs font-mono text-blue-600 dark:text-blue-400">
                        {ev.date_label || 'Upcoming'}
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {ev.title}
                      </h3>
                      {ev.location && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span>{ev.location}</span>
                        </div>
                      )}
                      {ev.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 pt-1">
                          {ev.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {eventPosts.length > 0 && (
                <div className="space-y-3">{eventPosts.map(renderPostCard)}</div>
              )}
            </div>
          )}

          {/* TAB 6: POLLS */}
          {activeTab === 'polls' && (
            <div className="space-y-4">
              {canPostInLounge && (
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5">
                  {!showPollForm ? (
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                          Batch Polls & Voting
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Decide reunion dates, venues, or batch initiatives together.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPollForm(true)}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>New Poll</span>
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleCreatePoll} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                          Create Batch {paddedBatch} Poll
                        </h3>
                        <button
                          type="button"
                          onClick={() => setShowPollForm(false)}
                          className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>

                      <input
                        type="text"
                        value={pollQuestion}
                        onChange={(e) => setPollQuestion(e.target.value)}
                        placeholder="Ask your batchmates a question..."
                        className="w-full min-h-[42px] px-3.5 py-2 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                      />

                      <div className="space-y-2">
                        {pollOptions.map((opt, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) =>
                                setPollOptions((prev) =>
                                  prev.map((v, i) => (i === idx ? e.target.value : v))
                                )
                              }
                              placeholder={`Option ${idx + 1}`}
                              className="flex-1 min-h-[40px] px-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                            />
                            {pollOptions.length > 2 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPollOptions((prev) => prev.filter((_, i) => i !== idx))
                                }
                                className="p-2 text-slate-400 hover:text-rose-500 cursor-pointer"
                                aria-label="Remove option"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        {pollOptions.length < 6 ? (
                          <button
                            type="button"
                            onClick={() => setPollOptions((prev) => [...prev, ''])}
                            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                          >
                            + Add option
                          </button>
                        ) : (
                          <span />
                        )}
                        <button
                          type="submit"
                          disabled={isCreatingPoll}
                          className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                        >
                          {isCreatingPoll ? 'Creating...' : 'Publish Poll'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {polls.length === 0 ? (
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-10 text-center space-y-2">
                  <BarChart3 className="w-8 h-8 text-slate-400 mx-auto" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    No active polls in Batch {paddedBatch}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Create a poll to vote on reunion venues, schedules, or batch initiatives.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {polls.map((poll) => (
                    <div
                      key={poll.id}
                      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-3.5"
                    >
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                          {poll.question}
                        </h3>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                          <span>By {poll.authorName}</span>
                          <span>·</span>
                          <span>{formatRelativeDate(poll.createdAt)}</span>
                          <span>·</span>
                          <span className="font-mono tabular-nums">{poll.totalVotes} votes</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {poll.options.map((opt) => {
                          const count = poll.voteCounts[opt.id] || 0;
                          const pct = poll.totalVotes > 0 ? Math.round((count / poll.totalVotes) * 100) : 0;
                          const isMine = poll.myVoteOptionId === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              disabled={poll.isClosed}
                              onClick={() => handleVote(poll.id, opt.id)}
                              className={`relative w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border text-left overflow-hidden transition-colors cursor-pointer ${
                                isMine
                                  ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/30'
                                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                              }`}
                            >
                              <div
                                className={`absolute inset-y-0 left-0 transition-all ${
                                  isMine
                                    ? 'bg-blue-500/15 dark:bg-blue-500/25'
                                    : 'bg-slate-200/50 dark:bg-slate-800/80'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                              <div className="relative flex items-center justify-between gap-2 text-xs">
                                <span className="font-medium text-slate-900 dark:text-slate-100">
                                  {opt.text}
                                </span>
                                <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
                                  {pct}% ({count})
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 7: MODERATORS */}
          {activeTab === 'moderators' && (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Batch {paddedBatch} Community Moderators
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Coordinators and moderators can pin batch announcements and keep lounge discussions constructive.
                </p>
              </div>

              {isAdminUser && members.length > 0 && (
                <form
                  onSubmit={handleAssignModerator}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
                >
                  <select
                    value={assignProfileId}
                    onChange={(e) => setAssignProfileId(e.target.value)}
                    aria-label="Select alumnus to assign as moderator"
                    className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="">Select Batch {paddedBatch} member...</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fullName} {m.institution ? `(${m.institution})` : ''}
                      </option>
                    ))}
                  </select>
                  <select
                    value={assignRole}
                    onChange={(e) => setAssignRole(e.target.value as 'coordinator' | 'moderator')}
                    aria-label="Select moderator role"
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="coordinator">Batch Coordinator</option>
                    <option value="moderator">Community Moderator</option>
                  </select>
                  <button
                    type="submit"
                    disabled={!assignProfileId}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Assign</span>
                  </button>
                </form>
              )}

              {moderators.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  No dedicated moderators assigned to SZMC-{paddedBatch} yet. Portal Admins manage this lounge until a coordinator is designated.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {moderators.map((mod) => (
                    <div key={mod.id} className="py-3 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => onViewProfile?.(mod.profileId)}
                        className="flex items-center gap-3 text-left min-w-0 cursor-pointer group"
                      >
                        <img
                          src={mod.avatarUrl}
                          alt={mod.fullName}
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 truncate">
                            {mod.fullName}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {mod.role === 'coordinator' ? 'Batch Coordinator' : 'Community Moderator'} · {mod.institution}
                          </div>
                        </div>
                      </button>

                      {isAdminUser && (
                        <button
                          type="button"
                          onClick={() => handleRemoveModerator(mod.profileId)}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                          aria-label={`Remove ${mod.fullName}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BatchLoungeView;
