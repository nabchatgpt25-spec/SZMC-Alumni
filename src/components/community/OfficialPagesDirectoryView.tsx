import React, { useState, useEffect } from 'react';
import { BadgeCheck, Bell, BellOff, Building2, ChevronRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  fetchOfficialPages,
  toggleOfficialPageFollow,
  type OfficialPageInfo,
} from '../../services/communitySpacesService';

interface OfficialPagesDirectoryViewProps {
  onNavigate?: (route: string) => void;
}

export const OfficialPagesDirectoryView: React.FC<OfficialPagesDirectoryViewProps> = ({
  onNavigate,
}) => {
  const { currentUser } = useAuth();
  const [pages, setPages] = useState<OfficialPageInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPageId, setBusyPageId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchOfficialPages(currentUser.id)
      .then((res) => {
        if (mounted) {
          setPages(res.pages);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [currentUser.id]);

  const handleToggleFollow = async (e: React.MouseEvent, page: OfficialPageInfo) => {
    e.stopPropagation();
    if (busyPageId !== null) return;
    setBusyPageId(page.id);
    setErrorMsg(null);
    const wasFollowing = Boolean(page.isFollowing);
    const res = await toggleOfficialPageFollow(page.id, currentUser.id, wasFollowing);
    setBusyPageId(null);

    if (!res.ok) {
      setErrorMsg(res.error || 'Could not update follow status.');
      return;
    }

    setPages((prev) =>
      prev.map((p) =>
        p.id === page.id
          ? {
              ...p,
              isFollowing: res.following,
              followersCount: Math.max(0, p.followersCount + (res.following ? 1 : -1)),
            }
          : p
      )
    );
  };

  return (
    <div className="max-w-5xl mx-auto w-full space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onNavigate?.('feed')}
          className="min-h-[40px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to The Quad</span>
        </button>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Official SZMC Pages
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
          Verified institutional channels managed by authorized administrators and committees of Shaheed Ziaur Rahman Medical College Alumni Network.
        </p>
      </header>

      {errorMsg && (
        <div className="rounded-xl px-4 py-3 text-xs font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800/60">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-10 text-center text-xs text-slate-500">
          Loading Official Pages...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pages.map((page) => (
            <div
              key={page.slug}
              onClick={() => onNavigate?.(`page/${page.slug}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onNavigate?.(`page/${page.slug}`);
                }
              }}
              className="group rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 p-5 flex flex-col justify-between gap-4 transition-colors cursor-pointer"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-slate-900 dark:bg-blue-600 text-white flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                          {page.name}
                        </h2>
                        {page.isVerified && (
                          <BadgeCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {page.tagline}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={busyPageId === page.id}
                    onClick={(e) => handleToggleFollow(e, page)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      page.isFollowing
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
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
                        <span>Follow</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                  {page.description}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-3 font-mono tabular-nums">
                  <span>{page.followersCount} followers</span>
                  <span>·</span>
                  <span>{page.postsCount} posts</span>
                </div>
                <span className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400">
                  <span>Open Page</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OfficialPagesDirectoryView;
