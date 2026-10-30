import { LinkMetadata } from '../types/post';

const previewMemoryCache = new Map<string, LinkMetadata>();

export function extractFirstUrl(text: string): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s<>"'{}|\\^`]+[^\s<>"'{}|\\^`.,;:?!]/i);
  return match ? match[0] : null;
}

export function generateClientFallbackMetadata(url: string): LinkMetadata {
  try {
    const raw = url.trim();

    // 1. Direct Video files
    if (
      raw.startsWith('data:video/') ||
      raw.startsWith('blob:') ||
      /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(raw)
    ) {
      return {
        ok: true,
        type: 'direct_video',
        canonical_url: raw,
        video_url: raw,
        title: 'Video Player',
        description: 'Direct video stream',
        site_name: 'Video',
      };
    }

    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = parsed.pathname;

    // 2. YouTube & Shorts
    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtu.be' ||
      host === 'youtube-nocookie.com'
    ) {
      let videoId = '';
      let isShorts = false;
      if (host === 'youtu.be') {
        videoId = pathname.slice(1).split('/')[0]?.split('?')[0] || '';
      } else if (pathname.startsWith('/shorts/')) {
        videoId = pathname.replace(/^\/shorts\//, '').split('/')[0]?.split('?')[0] || '';
        isShorts = true;
      } else if (pathname.startsWith('/embed/')) {
        videoId = pathname.replace(/^\/embed\//, '').split('/')[0]?.split('?')[0] || '';
      } else if (parsed.searchParams.has('v')) {
        videoId = parsed.searchParams.get('v') || '';
      }
      return {
        ok: true,
        type: 'youtube',
        canonical_url: url,
        title: videoId ? (isShorts ? 'YouTube Shorts' : 'YouTube Video') : 'YouTube',
        description: 'Watch on YouTube',
        site_name: 'YouTube',
        image: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : undefined,
        video_id: videoId || undefined,
        is_reel: isShorts,
      };
    }

    // 3. Facebook Video, Reels, and Posts
    if (
      host === 'facebook.com' ||
      host === 'm.facebook.com' ||
      host === 'web.facebook.com' ||
      host === 'fb.watch' ||
      host === 'fb.com'
    ) {
      const isVideo =
        pathname.includes('/videos/') ||
        pathname.includes('/watch') ||
        pathname.includes('/reel/') ||
        pathname.includes('/reels/') ||
        pathname.includes('/share/v/') ||
        pathname.includes('/share/r/') ||
        host === 'fb.watch';
      const isReel =
        pathname.includes('/reel/') ||
        pathname.includes('/reels/') ||
        pathname.includes('/share/r/');

      const videoMatch = pathname.match(/\/(?:videos|reel|reels|share\/[vr])\/(?:[^/]+\/)?(\d+)/i);
      const vParam = parsed.searchParams.get('v');
      const numericId = vParam || (videoMatch ? videoMatch[1] : undefined);

      return {
        ok: true,
        type: isVideo ? 'facebook_video' : 'facebook_post',
        canonical_url: url,
        title: isVideo ? (isReel ? 'Facebook Reel' : 'Facebook Video') : 'Facebook Post',
        description: 'View on Facebook',
        site_name: 'Facebook',
        image: 'https://www.google.com/s2/favicons?domain=facebook.com&sz=128',
        video_id: numericId,
        is_reel: isReel,
      };
    }

    // 4. Instagram
    if (host === 'instagram.com' || host === 'instagr.am') {
      const isReel = pathname.includes('/reel/') || pathname.includes('/reels/');
      return {
        ok: true,
        type: 'instagram',
        canonical_url: url,
        title: isReel ? 'Instagram Reel' : 'Instagram Post',
        description: 'View on Instagram',
        site_name: 'Instagram',
        image: 'https://www.google.com/s2/favicons?domain=instagram.com&sz=128',
        is_reel: isReel,
      };
    }

    // 5. Generic Website Link Card
    return {
      ok: true,
      type: 'generic',
      canonical_url: url,
      title: host,
      description: url,
      site_name: host,
      image: `https://www.google.com/s2/favicons?domain=${host}&sz=128`,
    };
  } catch {
    return {
      ok: false,
      type: 'generic',
      canonical_url: url,
      title: 'Shared Link',
      description: url,
    };
  }
}

export async function fetchLinkPreview(rawUrl: string): Promise<LinkMetadata> {
  const normalized = rawUrl.trim();
  if (previewMemoryCache.has(normalized)) {
    return previewMemoryCache.get(normalized)!;
  }

  const fallback = generateClientFallbackMetadata(normalized);
  previewMemoryCache.set(normalized, fallback);
  return fallback;
}
