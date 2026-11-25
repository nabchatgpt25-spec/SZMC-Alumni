import React, { useState, useEffect, useCallback } from 'react';
import {
  Compass,
  GraduationCap,
  Users,
  Clock,
  Bookmark,
  Building2,
  HeartHandshake,
  Briefcase,
  Calendar,
  MapPin,
  ChevronRight,
  SlidersHorizontal,
  X,
  BookOpen,
  ShieldCheck,
} from 'lucide-react';
import { FeedView } from '../FeedView';
import { useAuth } from '../../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { normalizeToBatchNumber } from '../../utils/verificationService';
import {
  QUAD_FEED_FILTERS,
  QUAD_POST_CATEGORIES,
  OFFICIAL_PAGES_DIRECTORY,
  type QuadFeedFilter,
  type QuadPostCategory,
  type QuadPostsSummary,
  type OfficialPageSummary,
} from './quadConstants';

interface QuadCommunityShellProps {
  initialFeedTab?: QuadFeedFilter;
  onViewProfile?: (userId: number) => void;
  onOpenVerificationCenter?: (initialTab?: 'status' | 'vouch_others') => void;
  onNavigate?: (route: string) => void;
}

const FEED_ICONS: Record<QuadFeedFilter, React.ComponentType<{ className?: string }>> = {
  for_you: Compass,
  my_batch: GraduationCap,
  following: Users,
  latest: Clock,
};

export const QuadCommunityShell: React.FC<QuadCommunityShellProps> = ({
  initialFeedTab = 'for_you',
  onViewProfile,
  onOpenVerificationCenter,
  onNavigate,
}) => {
  const { currentUser } = useAuth();
  const [activeFeed, setActiveFeed] = useState<QuadFeedFilter>(initialFeedTab);
  const [activeCategory, setActiveCategory] = useState<QuadPostCategory>('All');
  const [activeOfficialPage, setActiveOfficialPage] = useState<OfficialPageSummary | null>(null);
  const [mobileSpacesOpen, setMobileSpacesOpen] = useState(false);
  const [eventImgFailed, setEventImgFailed] = useState(false);

  const [postsSummary, setPostsSummary] = useState<QuadPostsSummary>({
    total: 0,
    myBatchCount: 0,
    followingCount: 0,
    categoryCounts: {},
  });
  const [activeBloodRequestsCount, setActiveBloodRequestsCount] = useState<number | null>(null);

  useEffect(() => {
    setActiveFeed(initialFeedTab);
  }, [initialFeedTab]);

  // Fetch live active blood requests count for Right Discovery Rail (real DB data only)
  useEffect(() => {
    let mounted = true;
    if (!isSupabaseConfigured) return;

    const loadBloodCount = async () => {
      try {
        const { count, error } = await supabase
          .from('blood_requests')
          .select('id', { count: 'exact', head: true })
          .in('status', ['Active', 'Pending Verification', 'Donor Found']);
        if (mounted && !error && typeof count === 'number') {
          setActiveBloodRequestsCount(count);
        }
      } catch {
        // Keep null so we never fabricate a count
      }
    };
    void loadBloodCount();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSelectFeed = useCallback((feedId: QuadFeedFilter) => {
    setActiveFeed(feedId);
    setActiveOfficialPage(null);
    setMobileSpacesOpen(false);
  }, []);

  const handleSelectCategory = useCallback((cat: QuadPostCategory) => {
    setActiveCategory(cat);
    if (cat === 'All') {
      setActiveOfficialPage(null);
    }
  }, []);

  const handleSelectOfficialPage = useCallback(
    (page: OfficialPageSummary) => {
      setMobileSpacesOpen(false);
      if (onNavigate) {
        onNavigate(`page/${page.slug}`);
        return;
      }
      setActiveOfficialPage(page);
      setActiveFeed('for_you');
      setActiveCategory(page.category);
    },
    [onNavigate]
  );

  const handleClearFilters = useCallback(() => {
    setActiveFeed('for_you');
    setActiveCategory('All');
    setActiveOfficialPage(null);
  }, []);

  const userBatchNum = normalizeToBatchNumber(currentUser.batchYear);
  const userBatchLabel = userBatchNum
    ? `SZMC-${userBatchNum < 10 ? `0${userBatchNum}` : userBatchNum}`
    : 'My Batch';

  const getFeedCount = (id: QuadFeedFilter): number | null => {
    if (postsSummary.total === 0) return null;
    if (id === 'my_batch') return postsSummary.myBatchCount;
    if (id === 'following') return postsSummary.followingCount;
    return postsSummary.total;
  };

  const renderSpacesContent = () => (
    <div className="space-y-5">
      {/* Primary Feeds */}
      <div>
        <h2 className="px-3 mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          Community Feeds
        </h2>
        <nav aria-label="The Quad Feeds" className="space-y-1">
          {QUAD_FEED_FILTERS.map((item) => {
            const Icon = FEED_ICONS[item.id];
            const isActive = activeFeed === item.id && !activeOfficialPage;
            const count = getFeedCount(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectFeed(item.id)}
                className={`w-full min-h-[42px] flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-blue-600 dark:text-white font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-white' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  />
                  <span className="truncate">
                    {item.id === 'my_batch' ? `${item.label} (${userBatchLabel})` : item.label}
                  </span>
                </span>
                {count !== null && (
                  <span
                    className={`text-xs font-mono tabular-nums shrink-0 ${
                      isActive ? 'text-white/80' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Community Spaces */}
      <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800">
        <h2 className="px-3 mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          Spaces
        </h2>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => {
              setMobileSpacesOpen(false);
              if (userBatchNum && onNavigate) {
                onNavigate(`batch-lounge/${userBatchNum}`);
              } else {
                handleSelectFeed('my_batch');
              }
            }}
            className="w-full min-h-[42px] flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <GraduationCap className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="truncate">My Batch Lounge</span>
            </span>
            <span className="text-xs text-slate-400 font-mono tabular-nums shrink-0">
              {userBatchLabel}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMobileSpacesOpen(false);
              onNavigate?.('discover');
            }}
            className="w-full min-h-[42px] flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Compass className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="truncate">Discover Highlights</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => {
              setMobileSpacesOpen(false);
              onNavigate?.('batches');
            }}
            className="w-full min-h-[42px] flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <BookOpen className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="truncate">All Batch Lounges</span>
            </span>
            <span className="text-xs text-slate-400 font-mono tabular-nums shrink-0">35</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMobileSpacesOpen(false);
              onNavigate?.('saved');
            }}
            className="w-full min-h-[42px] flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Bookmark className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="truncate">Saved Posts</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>
        </div>
      </div>

      {/* Institutional Shortcuts */}
      <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800">
        <h2 className="px-3 mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          Quick Modules
        </h2>
        <div className="space-y-1">
          {[
            { id: 'emergency', label: 'Blood Network', icon: HeartHandshake },
            { id: 'careers', label: 'Career & Jobs', icon: Briefcase },
            { id: 'mentorship', label: 'Mentorship Desk', icon: ShieldCheck },
            { id: 'events', label: 'Events & Reunion', icon: Calendar },
          ].map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => {
                  setMobileSpacesOpen(false);
                  onNavigate?.(mod.id);
                }}
                className="w-full min-h-[42px] flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="truncate">{mod.label}</span>
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-[1440px] mx-auto w-full">
      {/* 3-Column Desktop Grid: Left Rail (3) · Center Stream (6) · Right Discovery (3) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COMMUNITY NAVIGATION RAIL (Desktop xl+) */}
        <aside
          aria-label="The Quad Community Navigation"
          className="hidden xl:block xl:col-span-3 sticky top-20 self-start"
        >
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-5">
            {/* Editorial Community Masthead */}
            <div className="px-2 pb-4 border-b border-slate-200/80 dark:border-slate-800">
              <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white leading-snug">
                The Quad
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                SZMC Alumni Community · Est. 1992
              </p>
            </div>

            {renderSpacesContent()}
          </div>
        </aside>

        {/* CENTER COMMUNITY FEED STREAM */}
        <section
          aria-label="Community Feed Stream"
          className="xl:col-span-6 min-w-0 space-y-4"
        >
          {/* Mobile & Tablet Minimal Feed Tabs + Spaces Trigger */}
          <div className="xl:hidden flex items-center justify-between gap-2 pb-1">
            <div
              role="tablist"
              aria-label="Feed View Filter"
              className="flex items-center gap-1 overflow-x-auto no-scrollbar snap-x"
            >
              {QUAD_FEED_FILTERS.map((tab) => {
                const isActive = activeFeed === tab.id && !activeOfficialPage;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => handleSelectFeed(tab.id)}
                    className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 snap-start active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      isActive
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    {tab.shortLabel}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setMobileSpacesOpen(true)}
              aria-label="Open spaces"
              className="min-h-[42px] px-3 py-2 rounded-xl text-slate-700 dark:text-slate-200 bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Spaces</span>
            </button>
          </div>

          {/* Clean Single-Row Category Filter Strip */}
          <div className="space-y-2 border-b border-slate-200/70 dark:border-slate-800/80 pb-2.5">
            <div className="flex items-center justify-between gap-2">
              <div
                role="group"
                aria-label="Filter posts by category"
                className="flex items-center gap-1 overflow-x-auto no-scrollbar snap-x"
              >
                {QUAD_POST_CATEGORIES.map((category) => {
                  const isSelected = activeCategory === category;
                  const count = postsSummary.categoryCounts[category];
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => handleSelectCategory(category)}
                      aria-pressed={isSelected}
                      className={`min-h-[40px] sm:min-h-[34px] px-3 sm:px-2.5 py-1.5 sm:py-1 rounded-xl sm:rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 snap-start inline-flex items-center gap-1 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        isSelected
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70 font-medium'
                      }`}
                    >
                      <span>{category}</span>
                      {typeof count === 'number' && count > 0 && (
                        <span
                          className={`text-[11px] font-mono tabular-nums ${
                            isSelected ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {(activeCategory !== 'All' || activeFeed !== 'for_you' || activeOfficialPage) && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="min-h-[40px] sm:min-h-[34px] text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 px-2 py-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                >
                  Reset
                </button>
              )}
            </div>

            {activeOfficialPage?.portalRoute && (
              <div className="flex items-center justify-between gap-2 text-xs pt-0.5">
                <span className="text-slate-500 dark:text-slate-400 truncate">
                  {activeOfficialPage.name}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate?.(activeOfficialPage.portalRoute!)}
                  className="font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Open module →
                </button>
              </div>
            )}
          </div>

          {/* Preserved Core FeedView Stream */}
          <FeedView
            embeddedInQuad
            quadFeedTab={activeFeed}
            quadCategoryFilter={activeCategory}
            onClearQuadFilters={handleClearFilters}
            onPostsSummaryChange={setPostsSummary}
            onViewProfile={onViewProfile}
            onOpenVerificationCenter={onOpenVerificationCenter}
            onNavigate={onNavigate}
          />
        </section>

        {/* RIGHT DISCOVERY & ACTION RAIL (Desktop xl+) */}
        <aside
          aria-label="Community Discovery and Highlights"
          className="hidden xl:block xl:col-span-3 sticky top-20 self-start space-y-5"
        >
          {/* 1. Blood Network Lifeline Card */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Blood Network
              </h2>
              {activeBloodRequestsCount !== null && (
                <span className="text-xs font-mono tabular-nums text-rose-600 dark:text-rose-400 font-semibold">
                  {activeBloodRequestsCount} active
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Coordinate verified SZMC donors or respond to urgent hospital blood requests across Bogura and nationwide.
            </p>
            <button
              type="button"
              onClick={() => onNavigate?.('emergency')}
              className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            >
              Open Blood Network
            </button>
          </div>

          {/* 2. Featured Institutional Event: SZMC DAY 2026 */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-900 dark:text-white text-sm">
                SZMC DAY 2026
              </span>
              <span className="font-mono tabular-nums">Nov 4–5</span>
            </div>

            <button
              type="button"
              onClick={() => onNavigate?.('events')}
              className="block w-full text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl"
            >
              <div className="aspect-[16/10] rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                {!eventImgFailed ? (
                  <img
                    src="/assets/aistudio/844630102_122141641941179457_1692878458464947990_n_99cb78bb.jpg"
                    alt="SZMC DAY 2026 Reunion Banner"
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={() => setEventImgFailed(true)}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-slate-900 text-white">
                    <Calendar className="w-6 h-6 text-blue-400 mb-1.5" />
                    <span className="text-xs font-semibold">SZMC DAY 2026</span>
                  </div>
                )}
              </div>

              <div className="mt-3 space-y-1">
                <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">Silimpur Campus, Bogura</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Campus Rally · CME · Grand Gala
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate?.('events')}
              className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              View Event Schedule
            </button>
          </div>

          {/* 3. Official Institutional Pages (6 Spaces) */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Official Pages
              </h2>
              <button
                type="button"
                onClick={() => onNavigate?.('pages')}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap"
              >
                View all ({OFFICIAL_PAGES_DIRECTORY.length})
              </button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {OFFICIAL_PAGES_DIRECTORY.map((page) => {
                const isSelected = activeOfficialPage?.slug === page.slug;
                return (
                  <button
                    key={page.slug}
                    type="button"
                    onClick={() => handleSelectOfficialPage(page)}
                    className={`w-full py-2.5 px-2 -mx-2 rounded-lg flex items-center justify-between gap-2 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="min-w-0">
                      <div
                        className={`text-xs font-semibold truncate ${
                          isSelected
                            ? 'text-blue-700 dark:text-blue-300'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {page.name}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {page.subtitle}
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      {/* MOBILE SPACES BOTTOM SHEET DRAWER (< xl) */}
      {mobileSpacesOpen && (
        <div
          className="fixed inset-0 z-50 xl:hidden flex items-end justify-center bg-slate-950/50 backdrop-blur-xs"
          onClick={() => setMobileSpacesOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="The Quad Spaces Navigation"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[85dvh] bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Grab Handle */}
            <div className="pt-3 pb-1 flex justify-center shrink-0">
              <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>

            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  The Quad Spaces
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Feeds · Batch Lounges · Official Pages
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileSpacesOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Close spaces sheet"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 pb-safe overflow-y-auto space-y-5">
              {renderSpacesContent()}

              {/* Official Pages inside Mobile Sheet */}
              <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800">
                <h3 className="px-3 mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Official Pages ({OFFICIAL_PAGES_DIRECTORY.length})</span>
                </h3>
                <div className="space-y-1">
                  {OFFICIAL_PAGES_DIRECTORY.map((page) => (
                    <button
                      key={page.slug}
                      type="button"
                      onClick={() => handleSelectOfficialPage(page)}
                      className="w-full min-h-[48px] px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {page.name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {page.subtitle}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuadCommunityShell;
