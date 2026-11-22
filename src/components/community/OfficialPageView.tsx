import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Bell,
  BellOff,
  Building2,
  ExternalLink,
  Megaphone,
  MessageSquare,
  BarChart3,
  ShieldCheck,
  Pin,
  PinOff,
  Send,
  Heart,
  Image as ImageIcon,
  UserPlus,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  fetchOfficialPageBySlug,
  toggleOfficialPageFollow,
  fetchOfficialPageRoles,
  assignOfficialPageRole,
  removeOfficialPageRole,
  fetchSpacePosts,
  createSpacePost,
  togglePinSpacePost,
  computeOfficialPageAnalytics,
  type OfficialPageInfo,
  type OfficialPageRoleMember,
  type SpacePost,
  type SpacePostKind,
} from '../../services/communitySpacesService';
import { compressImageFileToDataUrl } from '../../utils/mediaStorage';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

interface OfficialPageViewProps {
  slug: string;
  onNavigate?: (route: string) => void;
  onViewProfile?: (profileId: number) => void;
}

type PageTab = 'feed' | 'announcements' | 'about' | 'analytics';

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

export const OfficialPageView: React.FC<OfficialPageViewProps> = ({
  slug,
  onNavigate,
  onViewProfile,
}) => {
  const { currentUser, isAdminUser } = useAuth();
  const [activeTab, setActiveTab] = useState<PageTab>('feed');
  const [page, setPage] = useState<OfficialPageInfo | null>(null);
  const [roles, setRoles] = useState<OfficialPageRoleMember[]>([]);
  const [posts, setPosts] = useState<SpacePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Official Page publisher state
  const [composerText, setComposerText] = useState('');
  const [composerKind, setComposerKind] = useState<SpacePostKind>('announcement');
  const [composerPin, setComposerPin] = useState(true);
  const [composerImages, setComposerImages] = useState<string[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);

  // Admin role assignment state
  const [candidateProfiles, setCandidateProfiles] = useState<
    { id: number; fullName: string; batchYear?: number }[]
  >([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [selectedRole, setSelectedRole] = useState<'admin' | 'editor'>('editor');

  const canPublishAsPage = useMemo(() => {
    if (isAdminUser) return true;
    return page?.myRole === 'admin' || page?.myRole === 'editor';
  }, [isAdminUser, page?.myRole]);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  }, []);

  const loadPageData = useCallback(async () => {
    setLoading(true);
    try {
      const { page: loadedPage } = await fetchOfficialPageBySlug(slug, currentUser.id);
      setPage(loadedPage);
      if (loadedPage) {
        const [roleRows, postRes] = await Promise.all([
          fetchOfficialPageRoles(loadedPage.id),
          fetchSpacePosts({
            officialPageId: loadedPage.id,
            officialPageCategory: loadedPage.category,
            limit: 40,
          }),
        ]);
        setRoles(roleRows);
        setPosts(postRes.posts);
      }
    } finally {
      setLoading(false);
    }
  }, [slug, currentUser.id]);

  useEffect(() => {
    setActiveTab('feed');
    setComposerText('');
    setComposerImages([]);
    void loadPageData();
  }, [loadPageData]);

  // Load verified alumni options for Portal Admins to assign Page Admins/Editors
  useEffect(() => {
    if (!isAdminUser || activeTab !== 'about' || !isSupabaseConfigured) return;
    let mounted = true;
    supabase
      .from('alumni_profiles')
      .select('id, full_name, batch_year')
      .order('full_name', { ascending: true })
      .limit(120)
      .then(({ data }) => {
        if (mounted && Array.isArray(data)) {
          setCandidateProfiles(
            data.map((r: any) => ({
              id: Number(r.id),
              fullName: r.full_name || 'SZMC Alumnus',
              batchYear: r.batch_year ? Number(r.batch_year) : undefined,
            }))
          );
        }
      });
    return () => {
      mounted = false;
    };
  }, [isAdminUser, activeTab]);

  const announcements = useMemo(
    () => posts.filter((p) => p.pinned || p.postKind === 'announcement'),
    [posts]
  );

  const analytics = useMemo(() => {
    if (!page) return null;
    return computeOfficialPageAnalytics(page, posts);
  }, [page, posts]);

  const handleToggleFollow = async () => {
    if (!page || followBusy) return;
    setFollowBusy(true);
    const wasFollowing = Boolean(page.isFollowing);
    const res = await toggleOfficialPageFollow(page.id, currentUser.id, wasFollowing);
    setFollowBusy(false);

    if (!res.ok) {
      showToast('error', res.error || 'Could not update follow status.');
      return;
    }

    setPage((prev) =>
      prev
        ? {
            ...prev,
            isFollowing: res.following,
            followersCount: Math.max(0, prev.followersCount + (res.following ? 1 : -1)),
          }
        : prev
    );
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 4);
    if (files.length === 0) return;
    try {
      const encoded = await Promise.all(files.map((f) => compressImageFileToDataUrl(f, 1280, 0.82)));
      setComposerImages((prev) => [...prev, ...encoded].slice(0, 4));
    } catch {
      showToast('error', 'Unable to process selected image.');
    }
    e.target.value = '';
  };

  const handlePublishOfficialPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!page || !canPublishAsPage || !composerText.trim() || isPublishing) return;
    setIsPublishing(true);
    const res = await createSpacePost({
      authorId: currentUser.id,
      content: composerText,
      images: composerImages,
      officialPageId: page.id,
      postKind: composerKind,
      isPinned: composerPin,
    });
    setIsPublishing(false);

    if (!res.ok) {
      showToast('error', res.error || 'Permission denied or publishing failed.');
      return;
    }

    if (res.post) {
      setPosts((prev) =>
        [res.post!, ...prev].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))
      );
      setPage((prev) => (prev ? { ...prev, postsCount: prev.postsCount + 1 } : prev));
    }
    setComposerText('');
    setComposerImages([]);
    showToast('success', `Published officially as ${page.name}.`);
  };

  const handleTogglePin = async (post: SpacePost) => {
    if (!canPublishAsPage) return;
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
  };

  const handleAssignRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!page || !selectedCandidateId) return;
    const res = await assignOfficialPageRole(
      page.id,
      Number(selectedCandidateId),
      selectedRole,
      currentUser.id
    );
    if (!res.ok) {
      showToast('error', res.error || 'Could not assign role.');
      return;
    }
    setSelectedCandidateId('');
    const updatedRoles = await fetchOfficialPageRoles(page.id);
    setRoles(updatedRoles);
    showToast('success', 'Official page role assigned.');
  };

  const handleRemoveRole = async (profileId: number) => {
    if (!page) return;
    const res = await removeOfficialPageRole(page.id, profileId);
    if (!res.ok) {
      showToast('error', res.error || 'Could not remove role.');
      return;
    }
    setRoles((prev) => prev.filter((r) => r.profileId !== profileId));
    showToast('success', 'Role removed from page.');
  };

  const renderOfficialPost = (post: SpacePost) => (
    <article
      key={post.id}
      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-blue-600 text-white flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {page?.name}
              </span>
              {page?.isVerified && (
                <BadgeCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
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
                    <Pin className="w-3 h-3" /> Pinned Announcement
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {canPublishAsPage && (
          <button
            type="button"
            onClick={() => handleTogglePin(post)}
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
        <div className={`grid gap-2 ${post.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {post.images.map((img, i) => (
            <div
              key={i}
              className="rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700/70 aspect-[16/10]"
            >
              <img
                src={img}
                alt="Official attachment"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      )}

      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-5 font-mono tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5" />
            <span>{post.likesCount}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{post.commentsCount}</span>
          </span>
        </div>
        <span className="text-[11px] truncate">Published by {post.fullName}</span>
      </div>
    </article>
  );

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-10 text-center text-xs text-slate-500">
        Loading Official Page...
      </div>
    );
  }

  if (!page) {
    return (
      <div className="max-w-3xl mx-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-10 text-center space-y-3">
        <Building2 className="w-8 h-8 text-slate-400 mx-auto" />
        <h1 className="text-base font-bold text-slate-900 dark:text-white">Official Page Not Found</h1>
        <button
          type="button"
          onClick={() => onNavigate?.('pages')}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold cursor-pointer"
        >
          Browse Official Pages
        </button>
      </div>
    );
  }

  const tabs: { id: PageTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'feed', label: 'Feed', icon: MessageSquare },
    { id: 'announcements', label: 'Pinned & Notices', icon: Megaphone },
    { id: 'about', label: 'About & Admins', icon: ShieldCheck },
    ...(canPublishAsPage ? [{ id: 'analytics' as PageTab, label: 'Analytics', icon: BarChart3 }] : []),
  ];

  return (
    <div className="max-w-5xl mx-auto w-full space-y-5">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate?.('pages')}
            className="min-h-[40px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Official Pages</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('feed')}
            className="min-h-[40px] px-3 py-2 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer whitespace-nowrap"
          >
            The Quad
          </button>
        </div>

        {page.portalRoute && (
          <button
            type="button"
            onClick={() => onNavigate?.(page.portalRoute!)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <span>Open Full Module</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Institutional Cover & Identity Card */}
      <header className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        <div className="h-32 sm:h-40 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 relative">
          {page.coverImageUrl && (
            <img
              src={page.coverImageUrl}
              alt={`${page.name} cover`}
              className="w-full h-full object-cover opacity-80"
            />
          )}
        </div>

        <div className="px-5 sm:px-6 pb-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-8 relative">
            <div className="flex items-end gap-4 min-w-0">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white dark:bg-slate-900 border-4 border-white dark:border-slate-900 shadow-md flex items-center justify-center shrink-0 overflow-hidden">
                {page.avatarUrl ? (
                  <img
                    src={page.avatarUrl}
                    alt={page.name}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-900 dark:bg-blue-600 text-white flex items-center justify-center">
                    <Building2 className="w-8 h-8" />
                  </div>
                )}
              </div>
              <div className="pb-0.5 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {page.name}
                  </h1>
                  {page.isVerified && (
                    <BadgeCheck
                      className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0"
                      aria-label="Verified Official Page"
                    />
                  )}
                </div>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  {page.tagline}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={followBusy}
                onClick={handleToggleFollow}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  page.isFollowing
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {page.isFollowing ? (
                  <>
                    <BellOff className="w-3.5 h-3.5" />
                    <span>Following</span>
                  </>
                ) : (
                  <>
                    <Bell className="w-3.5 h-3.5" />
                    <span>Follow Page</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
            {page.description}
          </p>

          <div className="flex items-center gap-5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums pt-1">
            <span>
              <strong className="text-slate-900 dark:text-white">{page.followersCount}</strong> followers
            </span>
            <span>
              <strong className="text-slate-900 dark:text-white">{posts.length}</strong> publications
            </span>
            <span>
              <strong className="text-slate-900 dark:text-white">{announcements.length}</strong> pinned notices
            </span>
          </div>

          <nav
            aria-label="Official Page Sections"
            className="flex items-center gap-1.5 overflow-x-auto pt-3 border-t border-slate-100 dark:border-slate-800 scrollbar-none"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-blue-600 dark:text-white'
                      : 'bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700/80'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

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
          <button type="button" onClick={() => setFeedback(null)} className="p-1 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* TAB 1: FEED */}
      {activeTab === 'feed' && (
        <div className="space-y-4">
          {canPublishAsPage && (
            <form
              onSubmit={handlePublishOfficialPost}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-blue-200/80 dark:border-blue-900/60 p-4 sm:p-5 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                  <BadgeCheck className="w-4 h-4" />
                  <span>Publishing officially as {page.name}</span>
                </div>
                <select
                  aria-label="Official post kind"
                  value={composerKind}
                  onChange={(e) => setComposerKind(e.target.value as SpacePostKind)}
                  className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg px-2.5 py-1.5 font-medium cursor-pointer"
                >
                  <option value="announcement">Official Announcement</option>
                  <option value="event">Event Notice</option>
                  <option value="discussion">Community Update</option>
                </select>
              </div>

              <textarea
                rows={3}
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                placeholder={`Draft an official bulletin or update from ${page.name}...`}
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 resize-y"
              />

              {composerImages.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {composerImages.map((src, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                      <img src={src} alt="Attachment" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setComposerImages((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-900/80 text-white flex items-center justify-center cursor-pointer"
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
                    <span>Attach Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImagePick}
                      className="hidden"
                    />
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={composerPin}
                      onChange={(e) => setComposerPin(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Pin to top</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={!composerText.trim() || isPublishing}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isPublishing ? 'Publishing...' : 'Publish Officially'}</span>
                </button>
              </div>
            </form>
          )}

          {posts.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-10 text-center space-y-2">
              <Megaphone className="w-8 h-8 text-slate-400 mx-auto" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                No publications from {page.name} yet
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Follow this page to receive official notices and announcements directly in The Quad.
              </p>
            </div>
          ) : (
            <div className="space-y-3">{posts.map(renderOfficialPost)}</div>
          )}
        </div>
      )}

      {/* TAB 2: ANNOUNCEMENTS */}
      {activeTab === 'announcements' && (
        <div className="space-y-3">
          {announcements.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-10 text-center text-xs text-slate-500 dark:text-slate-400">
              No pinned announcements on {page.name} yet.
            </div>
          ) : (
            announcements.map(renderOfficialPost)
          )}
        </div>
      )}

      {/* TAB 3: ABOUT & ADMINS */}
      {activeTab === 'about' && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-5">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              About {page.name}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {page.description}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">
              Publishing authority is strictly enforced at the database level: only designated Page Administrators, Page Editors, and Portal Administrators may publish on behalf of this verified identity.
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Authorized Page Admins & Editors ({roles.length})
            </h3>

            {isAdminUser && (
              <form
                onSubmit={handleAssignRole}
                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
              >
                <select
                  value={selectedCandidateId}
                  onChange={(e) => setSelectedCandidateId(e.target.value)}
                  aria-label="Select alumnus to authorize"
                  className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                >
                  <option value="">Select alumnus to authorize...</option>
                  {candidateProfiles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} {c.batchYear ? `(SZMC-${String(c.batchYear).padStart(2, '0')})` : ''}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as 'admin' | 'editor')}
                  aria-label="Select page role"
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                >
                  <option value="admin">Page Admin</option>
                  <option value="editor">Page Editor</option>
                </select>
                <button
                  type="submit"
                  disabled={!selectedCandidateId}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Authorize</span>
                </button>
              </form>
            )}

            {roles.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Currently managed by SZMC Portal Administrators.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {roles.map((member) => (
                  <div key={member.id} className="py-3 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onViewProfile?.(member.profileId)}
                      className="flex items-center gap-3 text-left min-w-0 cursor-pointer group"
                    >
                      <img
                        src={member.avatarUrl}
                        alt={member.fullName}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 truncate">
                          {member.fullName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {member.role === 'admin' ? 'Page Admin' : 'Page Editor'}
                          {member.batchYear ? ` · SZMC-${String(member.batchYear).padStart(2, '0')}` : ''}
                        </div>
                      </div>
                    </button>

                    {isAdminUser && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRole(member.profileId)}
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        aria-label={`Remove ${member.fullName}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: ANALYTICS (Authorized Page Admins/Editors & Portal Admins ONLY) */}
      {activeTab === 'analytics' && canPublishAsPage && analytics && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Page Analytics · {page.name}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live database counts computed from verified followers and page publications.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
            {[
              { label: 'Total Followers', value: analytics.followersCount },
              { label: 'Published Posts', value: analytics.postsCount },
              { label: 'Pinned Notices', value: analytics.pinnedCount },
              { label: 'Total Reactions', value: analytics.totalLikes },
              { label: 'Total Comments', value: analytics.totalComments },
              { label: 'Avg Engagement / Post', value: analytics.avgEngagementPerPost },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-xl p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70"
              >
                <div className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                  {kpi.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default OfficialPageView;
