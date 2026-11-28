/**
 * Zero-latency route chunk loader & prefetcher (Facebook-style instant tab switching).
 * Maps every application route to its dynamic import() factory so components are both
 * lazy-loaded cleanly AND pre-warmed on hover/focus/touch/idle before the user clicks.
 */

type ModuleLoader = () => Promise<unknown>;

export const routeLoaders = {
  landing: () => import('../components/LandingPage'),
  feed: () => import('../components/FeedView'),
  quad: () => import('../components/community/QuadCommunityShell'),
  discover: () => import('../components/community/QuadDiscoverView'),
  batchLounge: () => import('../components/community/BatchLoungeView'),
  officialPage: () => import('../components/community/OfficialPageView'),
  officialPages: () => import('../components/community/OfficialPagesDirectoryView'),
  directory: () => import('../components/DirectoryView'),
  alumni: () => import('../components/AlumniDirectoryView'),
  batches: () => import('../components/BatchesView'),
  map: () => import('../components/MapView'),
  profile: () => import('../components/ProfileView'),
  gallery: () => import('../components/GalleryView'),
  messages: () => import('../components/messenger/MessengerView'),
  notifications: () => import('../components/notifications/NotificationsPageView'),
  messengerDock: () => import('../components/messenger/FacebookMessengerDock'),
  auth: () => import('../components/AuthModal'),
  upcoming: () => import('../components/UpcomingFeatureView'),
  events: () => import('../components/EventsView'),
  careers: () => import('../components/CareerView'),
  mentorship: () => import('../components/MentorshipView'),
  contact: () => import('../components/ContactUsView'),
  saved: () => import('../components/SavedPostsView'),
  verification: () => import('../components/verification/VerificationCenterModal'),
  emergency: () => import('../components/BloodNetworkView'),
  admin: () => import('../components/admin/AdminPage'),
  settings: () => import('../components/SettingsView'),
  profileCard: () => import('../components/FrostedProfileCardModal'),
  splash: () => import('../components/OutstandingLoadingScreen'),
  congratulations: () => import('../components/RegistrationCongratulationsFlow'),
  profileCompletionPrompt: () => import('../components/ProfileCompletionPromptModal'),
} as const;

type LoaderKey = keyof typeof routeLoaders;

const prefetchedKeys = new Set<LoaderKey>();

function resolveLoaderKeys(route: string): LoaderKey[] {
  if (!route) return [];
  if (route === 'feed' || route === 'dashboard' || route === 'quad' || (route.startsWith('quad/') && route !== 'quad/discover')) {
    return ['quad', 'feed'];
  }
  if (route === 'discover' || route === 'quad/discover') return ['discover'];
  if (route === 'alumni' || route === 'directory') return ['alumni', 'directory'];
  if (route === 'find') return ['directory'];
  if (route === 'batches' || route.startsWith('batch:')) return ['batches'];
  if (route.startsWith('batch-lounge/')) return ['batchLounge'];
  if (route === 'pages') return ['officialPages'];
  if (route.startsWith('page/')) return ['officialPage'];
  if (route === 'map' || route === 'map-directory') return ['map'];
  if (route === 'profile') return ['profile'];
  if (route === 'gallery' || route.startsWith('album-')) return ['gallery'];
  if (route === 'messages') return ['messages'];
  if (route === 'notifications') return ['notifications'];
  if (route === 'events') return ['events'];
  if (route === 'careers') return ['careers'];
  if (route === 'mentorship') return ['mentorship'];
  if (route === 'contact') return ['contact'];
  if (route === 'saved' || route === 'saved-posts') return ['saved'];
  if (route === 'emergency' || route === 'blood' || route === 'blood-network') return ['emergency'];
  if (route === 'settings' || route === 'profile-settings') return ['settings'];
  if (route === 'admin' || route === 'admin-center' || route === 'admin-hub' || route === 'admin-command-center') return ['admin'];
  if (route === 'institutions' || route === 'news') return ['upcoming'];
  if (route === 'landing') return ['landing'];
  if (route === 'auth') return ['auth'];
  return [];
}

/**
 * Prefetch the JS chunk(s) for a route idempotently. Safe to call on hover/focus/touchStart.
 */
export function prefetchRoute(route: string): void {
  const keys = resolveLoaderKeys(route);
  for (const key of keys) {
    if (prefetchedKeys.has(key)) continue;
    prefetchedKeys.add(key);
    const loader: ModuleLoader = routeLoaders[key];
    void loader().catch(() => {
      prefetchedKeys.delete(key);
    });
  }
}

let idlePrefetchScheduled = false;

/**
 * After initial render settles, quietly pre-warm the highest-traffic portal routes
 * during browser idle time so navigation feels instant (0ms chunk wait).
 */
export function prefetchCoreRoutesOnIdle(isLoggedIn: boolean): void {
  if (idlePrefetchScheduled || typeof window === 'undefined') return;
  // Respect Save-Data / very slow connections
  const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } };
  if (nav.connection?.saveData || nav.connection?.effectiveType === '2g' || nav.connection?.effectiveType === 'slow-2g') {
    return;
  }

  idlePrefetchScheduled = true;
  const targets: string[] = isLoggedIn
    ? ['feed', 'alumni', 'messages', 'profile', 'emergency']
    : ['auth', 'feed'];

  const runQueue = () => {
    targets.forEach((route, idx) => {
      window.setTimeout(() => prefetchRoute(route), idx * 220);
    });
  };

  if (typeof (window as any).requestIdleCallback === 'function') {
    (window as any).requestIdleCallback(runQueue, { timeout: 2200 });
  } else {
    window.setTimeout(runQueue, 900);
  }
}
