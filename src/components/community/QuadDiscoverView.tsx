import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Award,
  Building2,
  Calendar,
  Compass,
  Flame,
  GraduationCap,
  MapPin,
  MessageCircle,
  RefreshCw,
  ThumbsUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { normalizeToBatchNumber } from '../../utils/verificationService';
import { fetchBlockedUserIds } from '../../services/communitySafetyService';
import { filterBlockedPosts, formatNotificationRelativeTime } from '../../services/communitySafetyUtils';
import {
  OFFICIAL_PAGES_DIRECTORY,
  matchesQuadCategory,
} from './quadConstants';

interface QuadDiscoverViewProps {
  onNavigate?: (route: string) => void;
  onViewProfile?: (userId: number) => void;
}

type DiscoverFilter =
  | 'all'
  | 'trending'
  | 'achievements'
  | 'other_batches'
  | 'announcements'
  | 'new_alumni'
  | 'events';

interface DiscoverPost {
  id: number;
  userId: number;
  authorName: string;
  authorAvatar: string;
  authorBatchYear: number | null;
  authorSpecialty: string | null;
  content: string;
  category: string;
  audience: string;
  imageUrl: string | null;
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  isPinned: boolean;
  isOfficial: boolean;
  createdAt: string;
  engagementScore: number;
}

interface DiscoverAlumnus {
  id: number;
  fullName: string;
  avatarUrl: string;
  batchYear: number | null;
  profession: string | null;
  city: string | null;
  country: string | null;
  verificationStatus: string | null;
  createdAt: string | null;
}

interface DiscoverEvent {
  id: number;
  title: string;
  eventDate: string;
  location: string;
  description: string;
  bannerUrl?: string | null;
}

const FILTER_TABS: Array<{ id: DiscoverFilter; label: string }> = [
  { id: 'all', label: 'All Highlights' },
  { id: 'trending', label: 'Trending' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'other_batches', label: 'Other Batches' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'new_alumni', label: 'New Alumni' },
  { id: 'events', label: 'Upcoming Events' },
];

const DEFAULT_AVATAR = '/assets/aistudio/images__1__2778177d.png';

function formatBatchTag(batchYear: number | null | undefined): string {
  const num = normalizeToBatchNumber(batchYear ?? undefined);
  if (!num) return 'SZMC Alumni';
  return `SZMC-${num < 10 ? `0${num}` : num}`;
}

export const QuadDiscoverView: React.FC<QuadDiscoverViewProps> = ({
  onNavigate,
  onViewProfile,
}) => {
  const { currentUser, isLoggedIn } = useAuth();
  const [activeFilter, setActiveFilter] = useState<DiscoverFilter>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [posts, setPosts] = useState<DiscoverPost[]>([]);
  const [newAlumni, setNewAlumni] = useState<DiscoverAlumnus[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<DiscoverEvent[]>([]);
  const [blockedIds, setBlockedIds] = useState<Set<number>>(new Set());

  const callerBatchNum = normalizeToBatchNumber(currentUser.batchYear);

  const loadDiscoverData = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        // 1. Load blocked account IDs so Discover strictly respects user safety boundaries
        const blockedList = currentUser.id ? await fetchBlockedUserIds(currentUser.id) : [];
        const blockedSet = new Set<number>(blockedList);
        setBlockedIds(blockedSet);

        if (!isSupabaseConfigured) {
          setPosts([]);
          setNewAlumni([]);
          setUpcomingEvents([]);
          setLoading(false);
          setRefreshing(false);
          return;
        }

        // 2. Parallel queries: public/alumni-visible posts, newest alumni, upcoming events
        const allowedAudiences = isLoggedIn
          ? ['public', 'all_alumni', 'alumni_only']
          : ['public'];

        const [postsRes, alumniRes, eventsRes] = await Promise.allSettled([
          supabase
            .from('posts')
            .select(
              'id, user_id, content, category, audience, image_url, media_urls, likes_count, comments_count, reposts_count, is_pinned, is_official, created_at, author:alumni_profiles!posts_user_id_fkey(id, full_name, avatar_url, batch_year, profession)'
            )
            .eq('is_deleted', false)
            .in('audience', allowedAudiences)
            .order('created_at', { ascending: false })
            .limit(80),
          supabase
            .from('alumni_profiles')
            .select('id, full_name, avatar_url, batch_year, profession, city, country, verification_status, created_at')
            .order('created_at', { ascending: false })
            .limit(20),
          supabase
            .from('events')
            .select('id, title, event_date, location, description, banner_url')
            .order('event_date', { ascending: true })
            .limit(6),
        ]);

        // Process posts (with fallback if audience column hasn't migrated remotely yet)
        let rawPosts: any[] = [];
        if (postsRes.status === 'fulfilled' && !postsRes.value.error && Array.isArray(postsRes.value.data)) {
          rawPosts = postsRes.value.data;
        } else {
          // Graceful fallback query for pre-Phase 4 schemas without audience/reposts_count
          const fallbackRes = await supabase
            .from('posts')
            .select(
              'id, user_id, content, category, image_url, likes_count, comments_count, created_at, author:alumni_profiles!posts_user_id_fkey(id, full_name, avatar_url, batch_year, profession)'
            )
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })
            .limit(60);
          if (!fallbackRes.error && Array.isArray(fallbackRes.data)) {
            rawPosts = fallbackRes.data;
          }
        }

        const mappedPosts: DiscoverPost[] = rawPosts
          .filter((row) => {
            const aud = String(row.audience || 'all_alumni').toLowerCase();
            // Never leak batch_only or connections_only posts in global Discover
            return aud !== 'batch_only' && aud !== 'connections_only';
          })
          .map((row) => {
            const author = Array.isArray(row.author) ? row.author[0] : row.author;
            const likes = Number(row.likes_count || 0);
            const comments = Number(row.comments_count || 0);
            const reposts = Number(row.reposts_count || 0);
            const mediaList = Array.isArray(row.media_urls) ? row.media_urls : [];
            const primaryImg =
              typeof row.image_url === 'string' && row.image_url.trim()
                ? row.image_url.trim()
                : typeof mediaList[0] === 'string'
                ? mediaList[0]
                : null;

            return {
              id: Number(row.id),
              userId: Number(row.user_id || author?.id || 0),
              authorName: author?.full_name || 'SZMC Alumnus',
              authorAvatar: author?.avatar_url || DEFAULT_AVATAR,
              authorBatchYear: author?.batch_year ? Number(author.batch_year) : null,
              authorSpecialty: author?.profession || null,
              content: String(row.content || '').trim(),
              category: String(row.category || 'General Discussion'),
              audience: String(row.audience || 'all_alumni'),
              imageUrl: primaryImg,
              likesCount: likes,
              commentsCount: comments,
              repostsCount: reposts,
              isPinned: Boolean(row.is_pinned),
              isOfficial: Boolean(row.is_official),
              createdAt: row.created_at || new Date().toISOString(),
              engagementScore: likes + comments * 2 + reposts * 2 + (row.is_pinned ? 4 : 0),
            };
          });

        setPosts(filterBlockedPosts(mappedPosts, blockedSet));

        // Process newest alumni (excluding blocked accounts and caller)
        if (alumniRes.status === 'fulfilled' && !alumniRes.value.error && Array.isArray(alumniRes.value.data)) {
          const mappedAlumni: DiscoverAlumnus[] = alumniRes.value.data
            .map((a: any) => ({
              id: Number(a.id),
              fullName: a.full_name || 'SZMC Alumnus',
              avatarUrl: a.avatar_url || DEFAULT_AVATAR,
              batchYear: a.batch_year ? Number(a.batch_year) : null,
              profession: a.profession || null,
              city: a.city || null,
              country: a.country || null,
              verificationStatus: a.verification_status || null,
              createdAt: a.created_at || null,
            }))
            .filter((a) => a.id > 0 && a.id !== currentUser.id && !blockedSet.has(a.id))
            .slice(0, 8);
          setNewAlumni(mappedAlumni);
        }

        // Process upcoming events
        if (eventsRes.status === 'fulfilled' && !eventsRes.value.error && Array.isArray(eventsRes.value.data)) {
          const mappedEvents: DiscoverEvent[] = eventsRes.value.data.map((e: any) => ({
            id: Number(e.id),
            title: String(e.title || 'SZMC Alumni Gathering'),
            eventDate: String(e.event_date || 'Upcoming'),
            location: String(e.location || 'Silimpur Campus, Bogura'),
            description: String(e.description || ''),
            bannerUrl: e.banner_url || null,
          }));
          setUpcomingEvents(mappedEvents);
        }
      } catch (err: any) {
        setError(err?.message || 'Unable to load Discover highlights right now.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentUser.id, isLoggedIn]
  );

  useEffect(() => {
    void loadDiscoverData(false);
  }, [loadDiscoverData]);

  // Listen to live block updates so blocked authors vanish immediately
  useEffect(() => {
    const handleBlocksChanged = () => {
      void loadDiscoverData(false);
    };
    window.addEventListener('szmc_blocks_updated', handleBlocksChanged);
    return () => window.removeEventListener('szmc_blocks_updated', handleBlocksChanged);
  }, [loadDiscoverData]);

  const trendingPosts = useMemo(
    () =>
      [...posts]
        .filter((p) => p.content.length > 0)
        .sort((a, b) => b.engagementScore - a.engagementScore || b.createdAt.localeCompare(a.createdAt))
        .slice(0, 6),
    [posts]
  );

  const achievementPosts = useMemo(
    () =>
      posts
        .filter((p) => matchesQuadCategory(p.category, 'Achievement'))
        .slice(0, 4),
    [posts]
  );

  const otherBatchPosts = useMemo(
    () =>
      posts
        .filter((p) => {
          const pBatch = normalizeToBatchNumber(p.authorBatchYear ?? undefined);
          if (!pBatch) return false;
          if (!callerBatchNum) return true;
          return pBatch !== callerBatchNum;
        })
        .slice(0, 6),
    [posts, callerBatchNum]
  );

  const officialAnnouncements = useMemo(
    () =>
      posts
        .filter(
          (p) =>
            p.isOfficial ||
            p.isPinned ||
            matchesQuadCategory(p.category, 'Announcement')
        )
        .slice(0, 4),
    [posts]
  );

  const showSection = (section: Exclude<DiscoverFilter, 'all'>) =>
    activeFilter === 'all' || activeFilter === section;

  const openPostInFeed = (postId: number) => {
    if (onNavigate) {
      onNavigate(`post-${postId}`);
    }
  };

  const renderPostRow = (post: DiscoverPost) => (
    <article
      key={post.id}
      className="py-4 first:pt-1 last:pb-1 flex flex-col sm:flex-row gap-4 items-start justify-between"
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => post.userId && onViewProfile?.(post.userId)}
            className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
          >
            <img
              src={post.authorAvatar}
              alt={post.authorName}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700"
            />
          </button>
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => post.userId && onViewProfile?.(post.userId)}
              className="text-sm font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate block text-left cursor-pointer"
            >
              {post.authorName}
            </button>
            <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className="font-mono tabular-nums">{formatBatchTag(post.authorBatchYear)}</span>
              <span aria-hidden="true">·</span>
              <span>{post.category}</span>
              <span aria-hidden="true">·</span>
              <span>{formatNotificationRelativeTime(post.createdAt)}</span>
            </div>
          </div>
        </div>

        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed line-clamp-3">
          {post.content || 'Shared a photo update with the SZMC alumni community.'}
        </p>

        <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1 font-mono tabular-nums">
            <ThumbsUp className="w-3.5 h-3.5" />
            {post.likesCount}
          </span>
          <span className="inline-flex items-center gap-1 font-mono tabular-nums">
            <MessageCircle className="w-3.5 h-3.5" />
            {post.commentsCount}
          </span>
          <button
            type="button"
            onClick={() => openPostInFeed(post.id)}
            className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap"
          >
            <span>Open discussion</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {post.imageUrl && (
        <button
          type="button"
          onClick={() => openPostInFeed(post.id)}
          className="w-full sm:w-28 h-40 sm:h-24 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700/70 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <img
            src={post.imageUrl}
            alt={`Attachment by ${post.authorName}`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover hover:scale-[1.03] transition-transform duration-200"
          />
        </button>
      )}
    </article>
  );

  return (
    <div className="max-w-[1360px] mx-auto w-full space-y-6">
      {/* Editorial Header */}
      <header className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <button
                type="button"
                onClick={() => onNavigate?.('feed')}
                className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>The Quad</span>
              </button>
              <span aria-hidden="true">/</span>
              <span>Discover</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              Discover Across 35 Batches
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
              Trending discussions, alumni achievements, official announcements, cross-batch stories, and newest SZMC members.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadDiscoverData(true)}
              disabled={refreshing}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('batches')}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <GraduationCap className="w-4 h-4" />
              <span>35 Batches</span>
            </button>
          </div>
        </div>

        {/* Single-line Horizontal Filter Bar */}
        <div
          role="tablist"
          aria-label="Discover sections"
          className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 -mx-1 px-1 scrollbar-none border-t border-slate-100 dark:border-slate-800"
        >
          {FILTER_TABS.map((tab) => {
            const active = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveFilter(tab.id)}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  active
                    ? 'bg-slate-900 text-white dark:bg-blue-600 dark:text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {error && (
        <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-5 py-4 flex items-center justify-between gap-3 text-sm text-rose-700 dark:text-rose-300">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadDiscoverData(true)}
            className="font-semibold underline cursor-pointer whitespace-nowrap shrink-0"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 space-y-4 animate-pulse"
              >
                <div className="h-5 w-44 rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-20 w-full rounded-xl bg-slate-100 dark:bg-slate-800/70" />
                <div className="h-20 w-full rounded-xl bg-slate-100 dark:bg-slate-800/70" />
              </div>
            ))}
          </div>
          <div className="lg:col-span-4 space-y-6">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 h-64 animate-pulse" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Primary Editorial Column */}
          <div className="lg:col-span-8 min-w-0 space-y-6">
            {/* 1. Trending Discussions & Popular Posts */}
            {showSection('trending') && (
              <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <Flame className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
                      Trending Discussions
                    </h2>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums shrink-0">
                    {trendingPosts.length} posts
                  </span>
                </div>

                {trendingPosts.length === 0 ? (
                  <p className="py-8 text-sm text-slate-500 dark:text-slate-400 text-center">
                    No public or alumni-wide discussions available yet. Start a conversation in The Quad.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {trendingPosts.map(renderPostRow)}
                  </div>
                )}
              </section>
            )}

            {/* 2. Alumni Achievements */}
            {showSection('achievements') && (
              <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <Award className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
                      Alumni Achievements
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate?.('feed')}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Share milestone
                  </button>
                </div>

                {achievementPosts.length === 0 ? (
                  <p className="py-8 text-sm text-slate-500 dark:text-slate-400 text-center">
                    FCPS, MD/MS, research publications, and clinical promotions posted under Achievement appear here.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {achievementPosts.map(renderPostRow)}
                  </div>
                )}
              </section>
            )}

            {/* 3. Posts from Other Batches */}
            {showSection('other_batches') && (
              <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <Compass className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
                      Stories from Other Batches
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate?.('batches')}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Browse 35 lounges
                  </button>
                </div>

                {otherBatchPosts.length === 0 ? (
                  <p className="py-8 text-sm text-slate-500 dark:text-slate-400 text-center">
                    Public and alumni-wide posts from other SZMC batches will surface here.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {otherBatchPosts.map(renderPostRow)}
                  </div>
                )}
              </section>
            )}

            {/* 4. Official Announcements */}
            {showSection('announcements') && (
              <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
                      Official Announcements &amp; Pages
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate?.('pages')}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap shrink-0"
                  >
                    All 6 pages
                  </button>
                </div>

                {officialAnnouncements.length > 0 && (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {officialAnnouncements.map(renderPostRow)}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {OFFICIAL_PAGES_DIRECTORY.map((page) => (
                    <button
                      key={page.slug}
                      type="button"
                      onClick={() => onNavigate?.(`page/${page.slug}`)}
                      className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-700/70 text-left transition-colors cursor-pointer flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {page.name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {page.subtitle}
                        </div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Secondary Discovery Column: New Alumni + Upcoming Events */}
          <aside className="lg:col-span-4 min-w-0 space-y-6">
            {/* 5. New Alumni */}
            {showSection('new_alumni') && (
              <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      New Alumni
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate?.('alumni')}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Directory
                  </button>
                </div>

                {newAlumni.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                    Explore verified doctors and batchmates inside the Alumni Directory.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {newAlumni.map((member) => (
                      <div
                        key={member.id}
                        className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                      >
                        <button
                          type="button"
                          onClick={() => onViewProfile?.(member.id)}
                          className="flex items-center gap-3 min-w-0 text-left group cursor-pointer"
                        >
                          <img
                            src={member.avatarUrl}
                            alt={member.fullName}
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                              {member.fullName}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              <span className="font-mono tabular-nums">{formatBatchTag(member.batchYear)}</span>
                              {member.profession ? ` · ${member.profession}` : ''}
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => onViewProfile?.(member.id)}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Profile
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* 6. Upcoming Events */}
            {showSection('events') && (
              <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <Calendar className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      Upcoming Events
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate?.('events')}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap shrink-0"
                  >
                    All events
                  </button>
                </div>

                {upcomingEvents.length === 0 ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        SZMC DAY 2026 Reunion
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-mono tabular-nums">November 4–5, 2026</span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span>Silimpur Campus, Bogura</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate?.('events')}
                      className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      View Event Schedule
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {upcomingEvents.map((ev) => (
                      <div key={ev.id} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">
                          {ev.title}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-mono tabular-nums">{ev.eventDate}</span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{ev.location}</span>
                        </div>
                        {ev.description && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                            {ev.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Privacy & Safety Footnote */}
            <div className="rounded-2xl bg-slate-100/80 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 p-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed flex items-start gap-2.5">
              <Users className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>
                Discover surfaces public and alumni-wide posts only. Batch-only discussions and posts from blocked accounts ({blockedIds.size}) are automatically excluded.
              </span>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default QuadDiscoverView;
