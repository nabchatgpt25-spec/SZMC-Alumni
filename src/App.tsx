/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, lazy, Suspense, startTransition, useCallback } from 'react';
import { Home, Users, HeartHandshake, User as UserIcon, MessageCircle } from 'lucide-react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import type { AlumniProfile } from './types';
import { OfflineIndicator } from './components/OfflineIndicator';
import { MobileNotificationToastHost } from './components/MobileNotificationToastHost';
import { ensureVouchRequestFromUrlParams } from './utils/verificationService';
import { SZMCLogo } from './components/SZMCLogo';
import { AdminSettingsProvider } from './components/admin/AdminSettingsProvider';
import { activityTracker } from './services/activityTracker';
import { loadFeatureFlags } from './services/featureFlagsService';
import {
  getTotalUnreadCount,
  subscribeToConversationChanges,
  subscribeToMessageChanges,
  subscribeToOnlinePresence,
  subscribeToReadReceipts,
  subscribeToRealtimeReconnect,
} from './services/messagingService';
import { useMessagingProfileId } from './hooks/useMessagingProfileId';
import { loadSavedClinicalStatus } from './utils/clinicalStatus';
import type { QuadFeedFilter } from './components/community/quadConstants';
import {
  routeLoaders,
  prefetchRoute,
  prefetchCoreRoutesOnIdle,
} from './utils/routePrefetch';
import {
  resolveInitialAlbumIdFromLocation,
  resolveInitialRouteFromLocation,
} from './utils/appRouting';

// Code-split dynamic views backed by centralized prefetchable loaders
const LandingPage = lazy(() => routeLoaders.landing().then(m => ({ default: m.LandingPage })));
const FeedView = lazy(() => routeLoaders.feed().then(m => ({ default: m.FeedView })));
const QuadCommunityShell = lazy(() => routeLoaders.quad().then(m => ({ default: m.QuadCommunityShell })));
const QuadDiscoverView = lazy(() => routeLoaders.discover().then(m => ({ default: m.QuadDiscoverView })));
const BatchLoungeView = lazy(() => routeLoaders.batchLounge().then(m => ({ default: m.BatchLoungeView })));
const OfficialPageView = lazy(() => routeLoaders.officialPage().then(m => ({ default: m.OfficialPageView })));
const OfficialPagesDirectoryView = lazy(() => routeLoaders.officialPages().then(m => ({ default: m.OfficialPagesDirectoryView })));
const DirectoryView = lazy(() => routeLoaders.directory().then(m => ({ default: m.DirectoryView })));
const AlumniDirectoryView = lazy(() => routeLoaders.alumni().then(m => ({ default: m.AlumniDirectoryView })));
const BatchesView = lazy(() => routeLoaders.batches().then(m => ({ default: m.BatchesView })));
const MapView = lazy(() => routeLoaders.map().then(m => ({ default: m.MapView })));
const ProfileView = lazy(() => routeLoaders.profile().then(m => ({ default: m.ProfileView })));
const GalleryView = lazy(() => routeLoaders.gallery().then(m => ({ default: m.GalleryView })));
const MessengerView = lazy(() => routeLoaders.messages().then(m => ({ default: m.MessengerView })));
const NotificationsPageView = lazy(() => routeLoaders.notifications().then(m => ({ default: m.NotificationsPageView })));
const FacebookMessengerDock = lazy(() => routeLoaders.messengerDock().then(m => ({ default: m.FacebookMessengerDock })));
const AuthModal = lazy(() => routeLoaders.auth().then(m => ({ default: m.AuthModal })));
const UpcomingFeatureView = lazy(() => routeLoaders.upcoming().then(m => ({ default: m.UpcomingFeatureView })));
const EventsView = lazy(() => routeLoaders.events().then(m => ({ default: m.EventsView })));
const CareerView = lazy(() => routeLoaders.careers().then(m => ({ default: m.CareerView })));
const MentorshipView = lazy(() => routeLoaders.mentorship().then(m => ({ default: m.MentorshipView })));
const ContactUsView = lazy(() => routeLoaders.contact().then(m => ({ default: m.ContactUsView })));
const SavedPostsView = lazy(() => routeLoaders.saved().then(m => ({ default: m.SavedPostsView })));
const VerificationCenterModal = lazy(() => routeLoaders.verification().then(m => ({ default: m.VerificationCenterModal })));
const BloodNetworkView = lazy(() => routeLoaders.emergency().then(m => ({ default: m.BloodNetworkView })));
const AdminPage = lazy(() => routeLoaders.admin().then(m => ({ default: m.AdminPage })));
const SettingsView = lazy(() => routeLoaders.settings().then(m => ({ default: m.SettingsView })));
const FrostedProfileCardModal = lazy(() => routeLoaders.profileCard().then(m => ({ default: m.FrostedProfileCardModal })));
const OutstandingLoadingScreen = lazy(() => routeLoaders.splash().then(m => ({ default: m.OutstandingLoadingScreen })));

const ViewSkeletonFallback: React.FC = () => (
  <div className="w-full max-w-3xl mx-auto space-y-4 py-2" aria-hidden="true">
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full fb-shimmer shrink-0" />
        <div className="space-y-2 flex-1">
          <div className="h-3.5 w-36 rounded-md fb-shimmer" />
          <div className="h-2.5 w-24 rounded-md fb-shimmer" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full rounded-md fb-shimmer" />
        <div className="h-3 w-5/6 rounded-md fb-shimmer" />
      </div>
      <div className="h-44 w-full rounded-xl fb-shimmer" />
    </div>
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full fb-shimmer shrink-0" />
        <div className="space-y-2 flex-1">
          <div className="h-3.5 w-44 rounded-md fb-shimmer" />
          <div className="h-2.5 w-28 rounded-md fb-shimmer" />
        </div>
      </div>
      <div className="h-3 w-4/5 rounded-md fb-shimmer" />
    </div>
  </div>
);

function AlumniAppContent() {
  const { isLoggedIn, currentUser } = useAuth();

  // Outstanding Institutional Splash / Loading Screen state (default off for instant preview; enabled with ?splash=1)
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('splash') === '1') return true;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).szmcReplaySplash = () => setShowSplash(true);
    }
  }, []);

  // Target Album ID for direct deep-linking from Feed ("See Album") into Gallery
  const [targetAlbumIdForGallery, setTargetAlbumIdForGallery] = useState<number | null>(
    () => resolveInitialAlbumIdFromLocation()
  );

  // Route state: 'landing' | 'feed' | 'alumni' | 'directory' | 'find' | 'batches' | 'map' | 'gallery' | 'profile' | `batch:${number}` | `post-${number}`
  const [route, setRoute] = useState<string>(() => resolveInitialRouteFromLocation(isLoggedIn));

  const [theQuadEnabled, setTheQuadEnabled] = useState<boolean>(true);
  const [batchLoungesEnabled, setBatchLoungesEnabled] = useState<boolean>(true);
  const [officialPagesEnabled, setOfficialPagesEnabled] = useState<boolean>(true);
  useEffect(() => {
    let mounted = true;
    void loadFeatureFlags().then((flags) => {
      if (!mounted) return;
      if (flags.the_quad_enabled) setTheQuadEnabled(flags.the_quad_enabled.enabled);
      if (flags.batch_lounges_enabled) setBatchLoungesEnabled(flags.batch_lounges_enabled.enabled);
      if (flags.official_pages_enabled) setOfficialPagesEnabled(flags.official_pages_enabled.enabled);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Warm-prefetch top portal routes during browser idle time for 0ms tab switches
  useEffect(() => {
    prefetchCoreRoutesOnIdle(isLoggedIn);
  }, [isLoggedIn]);

  // Whenever user logs in, take them straight to The Quad immediately (no artificial 2.4s splash delay)
  const wasLoggedInRef = useRef(isLoggedIn);
  useEffect(() => {
    if (!wasLoggedInRef.current && isLoggedIn) {
      try {
        sessionStorage.setItem('szmc_login_timestamp', Date.now().toString());
      } catch {}
      setRoute('feed');
      window.location.hash = 'feed';
      window.scrollTo(0, 0);
    }
    wasLoggedInRef.current = isLoggedIn;
  }, [isLoggedIn]);

  // Keep route synced with auth state: logged-in users enter the portal, logged-out users return to landing
  useEffect(() => {
    if (isLoggedIn && route === 'landing') {
      const h = window.location.hash.replace('#', '');
      const validHash = h && h !== 'landing' ? h : 'feed';
      setRoute(validHash);
    } else if (!isLoggedIn && route !== 'landing') {
      setRoute('landing');
    }
  }, [isLoggedIn, route]);

  // Privacy-safe Behavioral Telemetry Tracker (page views, dwell time, clicks, scroll, searches)
  const searchTrackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    activityTracker.init(route, {
      profileId: isLoggedIn ? currentUser.id : null,
      userName: isLoggedIn ? currentUser.fullName : 'Guest Visitor',
      userEmail: isLoggedIn ? currentUser.email || null : null,
      batchYear: isLoggedIn ? currentUser.batchYear || null : null,
      specialty:
        isLoggedIn && Array.isArray(currentUser.specialty) && currentUser.specialty.length > 0
          ? currentUser.specialty[0]
          : null,
      city: isLoggedIn ? currentUser.city || null : null,
      country: isLoggedIn ? currentUser.country || null : null,
    });
  }, []);

  useEffect(() => {
    activityTracker.updateIdentity({
      profileId: isLoggedIn ? currentUser.id : null,
      userName: isLoggedIn ? currentUser.fullName : 'Guest Visitor',
      userEmail: isLoggedIn ? currentUser.email || null : null,
      batchYear: isLoggedIn ? currentUser.batchYear || null : null,
      specialty:
        isLoggedIn && Array.isArray(currentUser.specialty) && currentUser.specialty.length > 0
          ? currentUser.specialty[0]
          : null,
      city: isLoggedIn ? currentUser.city || null : null,
      country: isLoggedIn ? currentUser.country || null : null,
    });
  }, [
    isLoggedIn,
    currentUser.id,
    currentUser.fullName,
    currentUser.email,
    currentUser.batchYear,
    currentUser.city,
    currentUser.country,
  ]);

  useEffect(() => {
    activityTracker.setRoute(route);
  }, [route]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<number>(currentUser.id);
  const [previousRoute, setPreviousRoute] = useState<string>('alumni');
  const [globalSearch, setGlobalSearch] = useState('');
  const [selectedBatchFilter, setSelectedBatchFilter] = useState<number | null>(null);

  // Auth modal state
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | 'forgot' | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('recovery') === '1' ? 'forgot' : null;
  });

  // Verification Center Modal state
  const [verificationModalState, setVerificationModalState] = useState<{
    isOpen: boolean;
    initialTab: 'status' | 'vouch_classmates' | 'vouch_others' | 'upload_id' | 'policy';
  }>({
    isOpen: false,
    initialTab: 'status',
  });

  const openVerificationCenter = (
    initialTab: 'status' | 'vouch_classmates' | 'vouch_others' | 'upload_id' | 'policy' = 'status'
  ) => {
    setVerificationModalState({ isOpen: true, initialTab });
  };

  // Facebook Messenger Floating Dock, Direct Message & Live Unread Badge state
  const [dockChatPeer, setDockChatPeer] = useState<AlumniProfile | null>(null);
  const [messengerInitialProfileId, setMessengerInitialProfileId] = useState<number | null>(null);
  const [messengerInitialConversationId, setMessengerInitialConversationId] = useState<string | null>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  // Shareable Frosted Profile Card Modal state (?card=<id> deep-link or Header "Share Profile Card")
  const [sharedCardProfile, setSharedCardProfile] = useState<AlumniProfile | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const rawCard = new URLSearchParams(window.location.search).get('card');
    const cardId = rawCard ? Number(rawCard) : 0;
    if (!cardId || !Number.isFinite(cardId) || cardId <= 0) return;

    let cancelled = false;
    if (isLoggedIn && (currentUser.id === cardId || currentUser.userId === cardId)) {
      setSharedCardProfile(currentUser);
    } else {
      void Promise.all([
        import('./data/mockData'),
        import('./utils/offlineStorage'),
      ])
        .then(([{ ALUMNI_PROFILES, loadStoredAlumniProfiles }, { INITIAL_OFFLINE_DIRECTORY }]) => {
          if (cancelled) return;
          const localPool = [
            ...loadStoredAlumniProfiles(),
            ...ALUMNI_PROFILES,
            ...INITIAL_OFFLINE_DIRECTORY,
          ];
          const matched = localPool.find((p) => p.id === cardId || p.userId === cardId);
          if (matched) {
            setSharedCardProfile(matched);
          } else {
            void import('./components/landing/FeaturedAlumniSection')
              .then(({ FAMOUS_SZMC_ALUMNI }) => {
                if (cancelled) return;
                const famousMatch = FAMOUS_SZMC_ALUMNI.find((p) => p.id === cardId || p.userId === cardId);
                if (famousMatch) setSharedCardProfile(famousMatch);
              })
              .catch(() => {});
          }
        })
        .catch(() => {});
    }

    void import('./services/supabaseService')
      .then(({ fetchAlumniProfileByIdFromDb }) => fetchAlumniProfileByIdFromDb(cardId))
      .then((live) => {
        if (!cancelled && live) setSharedCardProfile(live);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, currentUser.id]);

  const closeSharedCardModal = () => {
    setSharedCardProfile(null);
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href);
      if (u.searchParams.has('card')) {
        u.searchParams.delete('card');
        window.history.replaceState({}, '', u.toString());
      }
    }
  };

  // Global Supabase Realtime Presence tracking (keeps live online & clinical status synced app-wide)
  const { effectiveProfileId } = useMessagingProfileId(isLoggedIn ? currentUser.id : undefined);
  useEffect(() => {
    if (!isLoggedIn || !currentUser.id) return;
    const trackedId = effectiveProfileId ?? currentUser.id;
    const savedStatus =
      loadSavedClinicalStatus(trackedId) ?? loadSavedClinicalStatus(currentUser.id);
    return subscribeToOnlinePresence(
      {
        profileId: trackedId,
        appProfileId: currentUser.id,
        fullName: currentUser.fullName || 'SZMC Alumnus',
        avatarUrl: currentUser.avatarUrl || '/szmc-logo.png',
        batchYear: currentUser.batchYear || 20,
        clinicalStatus: savedStatus,
      },
      () => {
        /* individual views listen via subscribeToOnlinePresence(null, ...) */
      }
    );
  }, [
    isLoggedIn,
    effectiveProfileId,
    currentUser.id,
    currentUser.fullName,
    currentUser.avatarUrl,
    currentUser.batchYear,
  ]);

  useEffect(() => {
    if (!isLoggedIn || !currentUser.id) {
      setUnreadMessagesCount(0);
      return;
    }
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const refreshUnread = async () => {
      try {
        const count = await getTotalUnreadCount(currentUser.id);
        if (!cancelled) setUnreadMessagesCount(count);
      } catch {
        /* non-critical badge sync */
      }
    };

    const scheduleUnreadSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void refreshUnread();
      }, 350);
    };

    void refreshUnread();
    const unsubMessages = subscribeToMessageChanges(() => scheduleUnreadSync());
    const unsubConvs = subscribeToConversationChanges(() => scheduleUnreadSync());
    const unsubReceipts = subscribeToReadReceipts(() => scheduleUnreadSync());
    const unsubReconnect = subscribeToRealtimeReconnect(() => void refreshUnread());

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubMessages();
      unsubConvs();
      unsubReceipts();
      unsubReconnect();
    };
  }, [isLoggedIn, currentUser.id]);

  const handleStartDirectMessage = (peer: AlumniProfile) => {
    if (!isLoggedIn) {
      setAuthModalMode('login');
      return;
    }
    if (route === 'messages') {
      setMessengerInitialProfileId(peer.id);
    } else {
      setDockChatPeer(peer);
    }
  };

  const handleOpenFullMessenger = (peerId: number) => {
    setDockChatPeer(null);
    setMessengerInitialProfileId(peerId);
    navigateTo('messages');
  };

  const handleOpenConversation = (conversationId: string) => {
    setDockChatPeer(null);
    if (conversationId) {
      setMessengerInitialConversationId(conversationId);
    }
    navigateTo('messages');
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).szmcStartDirectMessage = handleStartDirectMessage;
    }
  }, [isLoggedIn, route]);

  // Handle ?vouch_for=... shared peer vouch link
  useEffect(() => {
    const req = ensureVouchRequestFromUrlParams();
    if (req) {
      if (isLoggedIn) {
        setVerificationModalState({ isOpen: true, initialTab: 'vouch_others' });
      } else {
        setAuthModalMode('login');
      }
    }
  }, [isLoggedIn]);

  // Sync route with window location hash
  useEffect(() => {
    const handleHashChange = () => {
      const h = window.location.hash.replace('#', '');
      if (h.startsWith('album-')) {
        const aId = Number(h.replace('album-', '')) || null;
        setTargetAlbumIdForGallery(aId);
        setRoute('gallery');
      } else if (h.startsWith('gallery:')) {
        const aId = Number(h.replace('gallery:', '')) || null;
        setTargetAlbumIdForGallery(aId);
        setRoute('gallery');
      } else if (h.startsWith('post-')) {
        setRoute('feed');
      } else if (h) {
        setRoute(h);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const isFeedRouteValue = (r: string) =>
    r === 'feed' ||
    r === 'dashboard' ||
    r === 'quad' ||
    (r.startsWith('quad/') && r !== 'quad/discover');

  const isFeedRouteActive = isFeedRouteValue(route);
  const [hasMountedFeed, setHasMountedFeed] = useState<boolean>(() => isFeedRouteValue(route));
  const feedScrollYRef = useRef<number>(0);

  useEffect(() => {
    if (isFeedRouteActive && !hasMountedFeed) {
      setHasMountedFeed(true);
    }
  }, [isFeedRouteActive, hasMountedFeed]);

  const navigateTo = useCallback((newRoute: string, keepSelectedProfile = false) => {
    // Save Feed scroll position before leaving The Quad so returning restores instantly like Facebook
    if (isFeedRouteValue(route) && !isFeedRouteValue(newRoute) && typeof window !== 'undefined') {
      feedScrollYRef.current = window.scrollY;
    }

    if (newRoute.startsWith('post-')) {
      startTransition(() => setRoute('feed'));
      window.location.hash = newRoute;
      return;
    }
    if (newRoute.startsWith('album-')) {
      const aId = Number(newRoute.replace('album-', '')) || null;
      startTransition(() => {
        setTargetAlbumIdForGallery(aId);
        setRoute('gallery');
      });
      window.location.hash = newRoute;
      window.scrollTo(0, 0);
      return;
    }
    if (newRoute === 'gallery' && !newRoute.startsWith('album-')) {
      setTargetAlbumIdForGallery(null);
    }
    if (newRoute === 'profile' && !keepSelectedProfile) {
      setSelectedProfileId(currentUser.id);
    }
    const returningToFeed = !isFeedRouteValue(route) && isFeedRouteValue(newRoute);
    startTransition(() => {
      setRoute(newRoute);
    });
    window.location.hash = newRoute;
    if (returningToFeed && feedScrollYRef.current > 0) {
      requestAnimationFrame(() => window.scrollTo(0, feedScrollYRef.current));
    } else if (!isFeedRouteValue(newRoute) || !isFeedRouteValue(route)) {
      window.scrollTo(0, 0);
    }
  }, [route, currentUser.id]);

  const handleViewProfile = useCallback((profileId: number) => {
    setPreviousRoute((prev) => (route === 'profile' ? prev : route));
    setSelectedProfileId(profileId);
    activityTracker.trackProfileView(profileId);
    navigateTo('profile', true);
  }, [route, navigateTo]);

  const getBackLabel = () => {
    if (previousRoute === 'map' || previousRoute === 'map-directory') return 'Back to Map';
    if (previousRoute === 'batches') return 'Back to Batch Lounges';
    if (previousRoute.startsWith('batch-lounge/')) return 'Back to Batch Lounge';
    if (previousRoute === 'pages') return 'Back to Official Pages';
    if (previousRoute.startsWith('page/')) return 'Back to Official Page';
    if (previousRoute === 'discover' || previousRoute === 'quad/discover') return 'Back to Discover';
    if (previousRoute === 'feed' || previousRoute === 'dashboard' || previousRoute.startsWith('quad')) return 'Back to The Quad';
    if (previousRoute === 'find') return 'Back to Search Results';
    if (previousRoute === 'emergency' || previousRoute === 'blood' || previousRoute === 'blood-network') return 'Back to Blood Network';
    return 'Back to Directory';
  };

  const handleGlobalSearchChange = (query: string) => {
    setGlobalSearch(query);
    if (searchTrackTimerRef.current) clearTimeout(searchTrackTimerRef.current);
    if (query.trim().length >= 2) {
      searchTrackTimerRef.current = setTimeout(() => {
        activityTracker.trackSearch(query.trim(), 'directory');
      }, 900);
    }
    if (query.trim() && route !== 'directory' && route !== 'find') {
      navigateTo('directory');
    }
  };

  // If user is logged out or on the landing page, display the full Public Landing Page immediately
  if (!isLoggedIn || route === 'landing') {
    return (
      <>
        {showSplash && (
          <Suspense fallback={null}>
            <OutstandingLoadingScreen
              onComplete={() => setShowSplash(false)}
              minDuration={1200}
            />
          </Suspense>
        )}

        <Suspense fallback={<ViewSkeletonFallback />}>
          <LandingPage
            onOpenLogin={() => setAuthModalMode('login')}
            onOpenRegister={() => setAuthModalMode('register')}
            isAuthModalOpen={authModalMode !== null}
            onReplaySplash={() => setShowSplash(true)}
            onNavigate={(target) => {
              if (target === 'landing') {
                navigateTo(target);
              } else if (!isLoggedIn) {
                setAuthModalMode('login');
              } else {
                navigateTo(target);
              }
            }}
          />
        </Suspense>

        {authModalMode && (
          <Suspense fallback={null}>
            <AuthModal
              initialMode={authModalMode}
              onClose={() => setAuthModalMode(null)}
              onSuccess={() => {
                setAuthModalMode(null);
                navigateTo('feed');
              }}
            />
          </Suspense>
        )}

        {sharedCardProfile && (
          <Suspense fallback={null}>
            <FrostedProfileCardModal
              profile={sharedCardProfile}
              isOpen={Boolean(sharedCardProfile)}
              onClose={closeSharedCardModal}
              onRequireLogin={() => {
                closeSharedCardModal();
                setAuthModalMode('login');
              }}
            />
          </Suspense>
        )}
      </>
    );
  }

  // Logged-in application shell (SZMC Alumni Network portal)
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex transition-colors duration-150 font-sans antialiased selection:bg-blue-500 selection:text-white relative overflow-x-hidden w-full max-w-full">
      {/* Lightweight Static Ambient Canvas (zero continuous GPU animation cost) */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none bg-[radial-gradient(ellipse_80%_60%_at_50%_-15%,rgba(59,130,246,0.08),transparent_70%)] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_-15%,rgba(59,130,246,0.14),transparent_70%)]"
      />

      {/* Optional Splash Screen (only on ?splash=1 or explicit replay) */}
      {showSplash && (
        <Suspense fallback={null}>
          <OutstandingLoadingScreen
            onComplete={() => setShowSplash(false)}
            minDuration={1200}
          />
        </Suspense>
      )}

      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={route.startsWith('batch:') ? 'batches' : route}
        onSelectTab={navigateTo}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        unreadMessagesCount={unreadMessagesCount}
        onOpenVerificationCenter={openVerificationCenter}
      />

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-72 flex flex-col min-w-0 w-full max-w-full overflow-x-hidden">
        {/* Header with Theme Toggle */}
        <Header
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onNavigate={(r) => {
            if (r === 'profile') {
              setSelectedProfileId(currentUser.id);
            }
            navigateTo(r);
          }}
          searchQuery={globalSearch}
          onSearchChange={handleGlobalSearchChange}
          unreadMessagesCount={unreadMessagesCount}
          onOpenVerificationCenter={openVerificationCenter}
          onShareMyCard={() => setSharedCardProfile(currentUser)}
        />

        {/* View Router (Keep-Alive Feed for 0ms return + Instant Switch) */}
        <main
          className={`flex-1 max-w-[1500px] w-full mx-auto min-w-0 ${
            route === 'messages'
              ? 'px-0 py-0 sm:px-5 lg:px-8 sm:py-5 lg:py-6 pb-16 lg:pb-6'
              : 'px-2.5 sm:px-5 lg:px-8 py-3 sm:py-6 lg:py-8 pb-24 lg:pb-8'
          }`}
        >
          {/* Keep The Quad Feed warm in memory once mounted so switching back is 0ms with scroll preserved */}
          {hasMountedFeed && (
            <div className={isFeedRouteActive ? '' : 'hidden'} aria-hidden={!isFeedRouteActive}>
              <Suspense fallback={<ViewSkeletonFallback />}>
                {theQuadEnabled ? (
                  <QuadCommunityShell
                    initialFeedTab={
                      route === 'quad/my-batch'
                        ? 'my_batch'
                        : route === 'quad/following'
                        ? 'following'
                        : route === 'quad/latest'
                        ? 'latest'
                        : ('for_you' as QuadFeedFilter)
                    }
                    onViewProfile={handleViewProfile}
                    onOpenVerificationCenter={openVerificationCenter}
                    onNavigate={navigateTo}
                  />
                ) : (
                  <FeedView
                    onViewProfile={handleViewProfile}
                    onOpenVerificationCenter={openVerificationCenter}
                    onNavigate={navigateTo}
                  />
                )}
              </Suspense>
            </div>
          )}

          {!isFeedRouteActive && (
            <div>
              <Suspense fallback={<ViewSkeletonFallback />}>
                {(route === 'discover' || route === 'quad/discover') && (
                  <QuadDiscoverView
                    onNavigate={navigateTo}
                    onViewProfile={handleViewProfile}
                  />
                )}

                {(route === 'alumni' || (route === 'directory' && !globalSearch)) && (
                  <AlumniDirectoryView
                    onViewProfile={handleViewProfile}
                    onNavigateToFind={() => navigateTo('find')}
                    onOpenVerificationCenter={openVerificationCenter}
                  />
                )}

                {(route === 'find' || (route === 'directory' && !!globalSearch)) && (
                  <DirectoryView
                    onViewProfile={handleViewProfile}
                    initialSearch={globalSearch}
                    initialBatch={selectedBatchFilter}
                    onOpenVerificationCenter={openVerificationCenter}
                  />
                )}

                {route === 'batches' && (
                  <BatchesView
                    onSelectBatch={(batchYear) => {
                      setSelectedBatchFilter(batchYear);
                      setGlobalSearch('');
                      navigateTo('find');
                    }}
                    onOpenBatchLounge={
                      batchLoungesEnabled
                        ? (batchYear) => navigateTo(`batch-lounge/${batchYear}`)
                        : undefined
                    }
                    onViewProfile={handleViewProfile}
                  />
                )}

                {route.startsWith('batch-lounge/') && (
                  batchLoungesEnabled ? (
                    <BatchLoungeView
                      batchYear={Number(route.replace('batch-lounge/', '')) || 1}
                      onNavigate={navigateTo}
                      onViewProfile={handleViewProfile}
                    />
                  ) : (
                    <BatchesView
                      onSelectBatch={(batchYear) => {
                        setSelectedBatchFilter(batchYear);
                        setGlobalSearch('');
                        navigateTo('find');
                      }}
                      onViewProfile={handleViewProfile}
                    />
                  )
                )}

                {route === 'pages' && (
                  officialPagesEnabled ? (
                    <OfficialPagesDirectoryView onNavigate={navigateTo} />
                  ) : (
                    <QuadCommunityShell
                      onViewProfile={handleViewProfile}
                      onOpenVerificationCenter={openVerificationCenter}
                      onNavigate={navigateTo}
                    />
                  )
                )}

                {route.startsWith('page/') && (
                  officialPagesEnabled ? (
                    <OfficialPageView
                      slug={route.replace('page/', '')}
                      onNavigate={navigateTo}
                      onViewProfile={handleViewProfile}
                    />
                  ) : (
                    <QuadCommunityShell
                      onViewProfile={handleViewProfile}
                      onOpenVerificationCenter={openVerificationCenter}
                      onNavigate={navigateTo}
                    />
                  )
                )}

                {(route === 'map' || route === 'map-directory') && (
                  <MapView onViewProfile={handleViewProfile} />
                )}

                {route === 'institutions' && (
                  <UpcomingFeatureView type="institutions" onNavigate={navigateTo} />
                )}

                {route === 'mentorship' && (
                  <MentorshipView
                    currentUser={currentUser}
                    isLoggedIn={isLoggedIn}
                    onViewProfile={handleViewProfile}
                    onNavigate={navigateTo}
                  />
                )}

                {route === 'news' && (
                  <UpcomingFeatureView type="news" onNavigate={navigateTo} />
                )}

                {route === 'events' && (
                  <EventsView onNavigate={navigateTo} />
                )}

                {route === 'gallery' && (
                  <GalleryView
                    initialAlbumId={targetAlbumIdForGallery}
                    onBackToFeed={() => {
                      setTargetAlbumIdForGallery(null);
                      navigateTo('feed');
                    }}
                  />
                )}

                {route === 'messages' && (
                  <MessengerView
                    initialTargetProfileId={messengerInitialProfileId}
                    onClearInitialTarget={() => setMessengerInitialProfileId(null)}
                    initialConversationId={messengerInitialConversationId}
                    onClearInitialConversation={() => setMessengerInitialConversationId(null)}
                    onViewProfile={handleViewProfile}
                  />
                )}

                {route === 'notifications' && (
                  <NotificationsPageView onNavigate={navigateTo} />
                )}

                {route === 'careers' && (
                  <CareerView
                    currentUser={currentUser}
                    isLoggedIn={isLoggedIn}
                    onViewProfile={handleViewProfile}
                    onNavigate={navigateTo}
                  />
                )}

                {(route === 'emergency' || route === 'blood' || route === 'blood-network') && (
                  <BloodNetworkView
                    onViewProfile={handleViewProfile}
                    onNavigate={navigateTo}
                  />
                )}

                {route === 'contact' && (
                  <ContactUsView />
                )}

                {(route === 'saved' || route === 'saved-posts') && (
                  <SavedPostsView onNavigate={navigateTo} />
                )}

                {(route === 'settings' || route === 'profile-settings') && (
                  <SettingsView
                    onNavigate={navigateTo}
                    onOpenVerificationCenter={openVerificationCenter}
                    onBack={() => navigateTo('profile')}
                  />
                )}

                {route === 'profile' && (
                  <ProfileView
                    key={selectedProfileId || currentUser.id}
                    profileId={selectedProfileId || currentUser.id}
                    onBack={() => navigateTo(previousRoute || 'alumni')}
                    backLabel={getBackLabel()}
                    onOpenVerificationCenter={openVerificationCenter}
                    onNavigate={navigateTo}
                    onStartMessage={handleStartDirectMessage}
                    onOpenConversation={handleOpenConversation}
                  />
                )}

                {(route === 'admin' || route === 'admin-center' || route === 'admin-hub' || route === 'admin-command-center') && (
                  <AdminPage
                    onNavigate={navigateTo}
                    onViewProfile={handleViewProfile}
                  />
                )}
              </Suspense>
            </div>
          )}
        </main>

        {/* Heritage Monument Portal Footer (hidden on mobile chats to keep Messenger full-screen) */}
        <footer
          className={`${
            route === 'messages' ? 'hidden lg:block' : ''
          } border-t border-slate-200/80 dark:border-slate-800/80 pt-6 lg:pt-8 pb-24 lg:pb-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-white/70 via-white/90 to-slate-100/90 dark:from-slate-900/70 dark:via-slate-900/90 dark:to-slate-950`}
        >
          <div className="max-w-[1500px] mx-auto">
            {/* Centerpiece Emotional Tribute */}
            <div className="flex flex-col items-center justify-center text-center mb-6">
              {/* Dual engraved hairline divider with emblem */}
              <div className="w-full flex items-center justify-center gap-3 sm:gap-4 max-w-xl mb-3">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-300/40 dark:via-amber-400/30 to-amber-400/70" />
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-400/15 border border-amber-400/30 p-1 flex items-center justify-center shadow-xs">
                  <SZMCLogo className="w-full h-full" />
                </div>
                <div className="h-px flex-1 bg-gradient-to-l from-transparent via-amber-300/40 dark:via-amber-400/30 to-amber-400/70" />
              </div>

              {/* Outstanding Emotional Motto */}
              <blockquote className="font-serif italic text-base sm:text-lg md:text-xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-800 dark:from-blue-200 dark:via-blue-300 dark:to-indigo-200 drop-shadow-xs">
                &ldquo;Once a SZMCian, Always a SZMCian.&rdquo;
              </blockquote>

              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 tracking-wider uppercase mt-1">
                35 MBBS Batches • One Lifelong Medical Fraternity • Silimpur, Bogura
              </p>
            </div>

            {/* Bottom Row: Centered Copyright, Motto & Developer Credit */}
            <div className="pt-4 border-t border-slate-200/60 dark:border-slate-800/60 flex flex-col items-center justify-center text-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span>© {new Date().getFullYear()} Shaheed Ziaur Rahman Medical College Alumni Network. All rights reserved.</span>
                <span className="inline text-slate-300 dark:text-slate-700">•</span>
                <span className="font-serif italic font-semibold text-blue-700 dark:text-blue-300/90">
                  SZMC Bogura • Est. 1992
                </span>
                <span className="hidden sm:inline text-slate-300 dark:text-slate-700">•</span>
                <a
                  href="https://nurulanambashir.gt.tc/?i=1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-blue-600 dark:text-blue-400 hover:underline transition-colors"
                >
                  Designed &amp; Developed by Bashir
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* Mobile Bottom Navigation Bar (Thumb-Zone 5-Tab Anchor on screens < 1024px) */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/85 dark:border-slate-800 shadow-[0_-4px_18px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_22px_rgba(0,0,0,0.35)] pb-safe transition-colors duration-150 touch-manipulation"
      >
        <div className="grid grid-cols-5 h-14 px-1 max-w-lg mx-auto">
          {/* 1. Feed / Quad */}
          <button
            type="button"
            onMouseEnter={() => prefetchRoute('feed')}
            onTouchStart={() => prefetchRoute('feed')}
            onClick={() => navigateTo('feed')}
            className={`relative min-h-[44px] flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-colors active:scale-95 cursor-pointer ${
              route === 'feed' || route === 'dashboard' || route === 'quad' || route === 'discover' || route.startsWith('quad/')
                ? 'text-blue-600 dark:text-blue-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {(route === 'feed' || route === 'dashboard' || route === 'quad' || route === 'discover' || route.startsWith('quad/')) && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" />
            )}
            <Home className="w-5 h-5" />
            <span className="text-[10px] font-medium tracking-tight mt-0.5 truncate max-w-full">The Quad</span>
          </button>

          {/* 2. Directory */}
          <button
            type="button"
            onMouseEnter={() => prefetchRoute('alumni')}
            onTouchStart={() => prefetchRoute('alumni')}
            onClick={() => navigateTo('alumni')}
            className={`relative min-h-[44px] flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-colors active:scale-95 cursor-pointer ${
              route === 'alumni' || route === 'directory' || route === 'find'
                ? 'text-blue-600 dark:text-blue-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {(route === 'alumni' || route === 'directory' || route === 'find') && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" />
            )}
            <Users className="w-5 h-5" />
            <span className="text-[10px] font-medium tracking-tight mt-0.5 truncate max-w-full">Directory</span>
          </button>

          {/* 3. Messages (Meta Messenger) */}
          <button
            type="button"
            onMouseEnter={() => prefetchRoute('messages')}
            onTouchStart={() => prefetchRoute('messages')}
            onClick={() => navigateTo('messages')}
            className={`relative min-h-[44px] flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-colors active:scale-95 cursor-pointer ${
              route === 'messages'
                ? 'text-[#0084FF] dark:text-[#0084FF] font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-[#0084FF] dark:hover:text-[#0084FF]'
            }`}
          >
            {route === 'messages' && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-[#0084FF]" />
            )}
            <div className="relative">
              <MessageCircle className={`w-5 h-5 ${route === 'messages' ? 'text-[#0084FF]' : ''}`} />
              {unreadMessagesCount > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#0084FF] text-white text-[9px] font-black tabular-nums flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
                  {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium tracking-tight mt-0.5 truncate max-w-full">Chats</span>
          </button>

          {/* 4. Blood Lifeline */}
          <button
            type="button"
            onMouseEnter={() => prefetchRoute('emergency')}
            onTouchStart={() => prefetchRoute('emergency')}
            onClick={() => navigateTo('emergency')}
            className={`relative min-h-[44px] flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-colors active:scale-95 cursor-pointer ${
              route === 'emergency' || route === 'blood' || route === 'blood-network'
                ? 'text-rose-600 dark:text-rose-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400'
            }`}
          >
            {(route === 'emergency' || route === 'blood' || route === 'blood-network') && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-rose-600 dark:bg-rose-400" />
            )}
            <HeartHandshake className={`w-5 h-5 ${route === 'emergency' || route === 'blood' || route === 'blood-network' ? 'text-rose-600' : ''}`} />
            <span className="text-[10px] font-medium tracking-tight mt-0.5 truncate max-w-full">Blood</span>
          </button>

          {/* 5. Profile */}
          <button
            type="button"
            onMouseEnter={() => prefetchRoute('profile')}
            onTouchStart={() => prefetchRoute('profile')}
            onClick={() => {
              setSelectedProfileId(currentUser.id);
              navigateTo('profile');
            }}
            className={`relative min-h-[44px] flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-colors active:scale-95 cursor-pointer ${
              route === 'profile' || route === 'profile-settings' || route === 'settings'
                ? 'text-blue-600 dark:text-blue-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {(route === 'profile' || route === 'profile-settings' || route === 'settings') && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" />
            )}
            <div className="relative">
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.fullName}
                  className={`w-5 h-5 rounded-full object-cover ring-1 ${
                    route === 'profile' || route === 'profile-settings' || route === 'settings'
                      ? 'ring-blue-600 dark:ring-blue-400'
                      : 'ring-slate-300 dark:ring-slate-700'
                  }`}
                />
              ) : (
                <UserIcon className="w-5 h-5" />
              )}
            </div>
            <span className="text-[10px] font-medium tracking-tight mt-0.5 truncate max-w-full">Profile</span>
          </button>
        </div>
      </nav>

      {/* Persistent Mobile-Style Top Slide-Down Notification Toast Host */}
      <MobileNotificationToastHost
        currentUserId={currentUser.id}
        messagingProfileId={effectiveProfileId}
        onNavigate={navigateTo}
        onOpenConversation={handleOpenConversation}
      />

      {/* Global Offline Mode Status Indicator */}
      <OfflineIndicator onNavigate={navigateTo} />

      {/* Active SZMC Doctor Verification & Peer Vouch Center Modal (lazy-loaded only when opened) */}
      {verificationModalState.isOpen && (
        <Suspense fallback={null}>
          <VerificationCenterModal
            isOpen={verificationModalState.isOpen}
            onClose={() => setVerificationModalState((prev) => ({ ...prev, isOpen: false }))}
            initialTab={verificationModalState.initialTab}
          />
        </Suspense>
      )}

      {authModalMode && (
        <Suspense fallback={null}>
          <AuthModal
            initialMode={authModalMode}
            onClose={() => setAuthModalMode(null)}
            onSuccess={() => {
              setAuthModalMode(null);
              navigateTo('feed');
            }}
          />
        </Suspense>
      )}

      {/* Facebook Messenger Floating Chat Dock */}
      {dockChatPeer && (
        <Suspense fallback={null}>
          <FacebookMessengerDock
            peer={dockChatPeer}
            onClose={() => setDockChatPeer(null)}
            onOpenFullMessenger={handleOpenFullMessenger}
            onViewProfile={handleViewProfile}
          />
        </Suspense>
      )}

      {/* Shareable Frosted Profile Card Modal */}
      {sharedCardProfile && (
        <Suspense fallback={null}>
          <FrostedProfileCardModal
            profile={sharedCardProfile}
            isOpen={Boolean(sharedCardProfile)}
            onClose={closeSharedCardModal}
            onStartMessage={
              sharedCardProfile.id === currentUser.id
                ? undefined
                : (peer) => {
                    closeSharedCardModal();
                    handleStartDirectMessage(peer);
                  }
            }
            onOpenFullProfile={(pid) => {
              closeSharedCardModal();
              handleViewProfile(pid);
            }}
            onOpenConversation={(convId) => {
              closeSharedCardModal();
              handleOpenConversation(convId);
            }}
            onEditOwnProfile={
              sharedCardProfile.id === currentUser.id
                ? () => {
                    closeSharedCardModal();
                    setSelectedProfileId(currentUser.id);
                    navigateTo('profile');
                  }
                : undefined
            }
            onRequireLogin={() => {
              closeSharedCardModal();
              setAuthModalMode('login');
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AdminSettingsProvider>
        <AuthProvider>
          <AlumniAppContent />
        </AuthProvider>
      </AdminSettingsProvider>
    </ThemeProvider>
  );
}
