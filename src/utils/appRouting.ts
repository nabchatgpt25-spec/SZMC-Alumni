export function resolveInitialAlbumIdFromLocation(): number | null {
  if (typeof window === 'undefined' || !window.location.hash) return null;
  const h = window.location.hash.replace('#', '');
  if (h.startsWith('album-')) return Number(h.replace('album-', '')) || null;
  if (h.startsWith('gallery:')) return Number(h.replace('gallery:', '')) || null;
  return null;
}

export function resolveInitialRouteFromLocation(isLoggedIn: boolean): string {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('post') || params.get('vouch_for')) {
      return 'feed';
    }
    if (window.location.hash) {
      const h = window.location.hash.replace('#', '');
      if (h.startsWith('album-') || h.startsWith('gallery:')) return 'gallery';
      if (h.startsWith('post-') || h === 'dashboard' || h === 'feed' || h === 'quad') return 'feed';
      if (h.startsWith('quad/')) return h;
      if (isLoggedIn && (h === 'profile' || h === 'alumni' || h === 'directory')) {
        return 'feed';
      }
      if (h) return h;
    }
  }
  return isLoggedIn ? 'feed' : 'landing';
}

export function resolveRouteFromPushDeepLink(targetRoute?: string | null): {
  nextRoute: string;
  albumId?: number | null;
} {
  const clean = (targetRoute || '').trim().replace(/^#/, '');
  if (!clean) return { nextRoute: 'feed' };
  if (clean.startsWith('album-')) {
    return { nextRoute: 'gallery', albumId: Number(clean.replace('album-', '')) || null };
  }
  if (clean.startsWith('gallery:')) {
    return { nextRoute: 'gallery', albumId: Number(clean.replace('gallery:', '')) || null };
  }
  return { nextRoute: clean };
}
