import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Play,
  Film,
  Image as ImageIcon,
} from 'lucide-react';
import { Video } from './feed/Video';
import { AutoPlayYouTubeEmbed } from './feed/AutoPlayYouTubeEmbed';

export type CarouselTemplate = 'carousel' | 'grid' | 'column' | 'hero';

export interface MediaItem {
  type: 'image' | 'video';
  url: string;
}

interface PostMediaCarouselProps {
  images?: string[];
  videos?: string[];
  layout?: CarouselTemplate;
  onPhotoClick?: (index: number) => void;
  className?: string;
  autoPlayVideo?: boolean;
}

export function isHlsStreamUrl(url: string): boolean {
  if (!url) return false;
  const clean = url.split('?')[0].split('#')[0].toLowerCase();
  return clean.endsWith('.m3u8') || url.toLowerCase().includes('application/vnd.apple.mpegurl') || url.toLowerCase().includes('.m3u8?');
}

function getEmbeddedVideoInfo(rawUrl: string): { type: 'youtube' | 'facebook' | 'vimeo'; embedUrl: string } | null {
  if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) return null;
  try {
    const u = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
      let videoId: string | null = null;
      if (host === 'youtu.be') {
        videoId = u.pathname.split('/').filter(Boolean)[0] || null;
      } else if (u.pathname === '/watch') {
        videoId = u.searchParams.get('v');
      } else if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/') || u.pathname.startsWith('/live/')) {
        videoId = u.pathname.split('/')[2] || null;
      }
      if (videoId) {
        return {
          type: 'youtube',
          embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&playsinline=1`,
        };
      }
    }

    if (
      host === 'facebook.com' ||
      host === 'm.facebook.com' ||
      host === 'web.facebook.com' ||
      host === 'fb.watch'
    ) {
      return {
        type: 'facebook',
        embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u.toString())}&show_text=false`,
      };
    }

    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const segments = u.pathname.split('/').filter(Boolean);
      const vimeoId = segments[segments.length - 1];
      if (vimeoId && /^\d+$/.test(vimeoId)) {
        return {
          type: 'vimeo',
          embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

const SmoothCarouselVideo: React.FC<{
  src: string;
  autoPlay?: boolean;
  className?: string;
  showControls?: boolean;
}> = ({ src, autoPlay = true, className = 'w-full max-h-[460px] object-contain mx-auto', showControls = true }) => {
  const embedInfo = getEmbeddedVideoInfo(src);

  if (embedInfo?.type === 'youtube') {
    return (
      <AutoPlayYouTubeEmbed
        embedUrl={embedInfo.embedUrl}
        originalUrl={src}
        autoPlayOnScroll={autoPlay}
      />
    );
  }

  if (embedInfo) {
    return (
      <div className="relative w-full aspect-video max-h-[460px] flex items-center justify-center bg-black">
        <iframe
          src={embedInfo.embedUrl}
          title="Embedded Video Player"
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <Video
      src={src}
      autoPlayOnScroll={autoPlay}
      controls={showControls}
      className={className}
    />
  );
};

export const PostMediaCarousel: React.FC<PostMediaCarouselProps> = ({
  images,
  videos,
  layout = 'carousel',
  onPhotoClick,
  className = '',
  autoPlayVideo = true,
}) => {
  // Normalize images and videos defensively against null or non-array values
  const safeImages: string[] = Array.isArray(images)
    ? images
    : typeof images === 'string'
    ? (() => { try { const p = JSON.parse(images); return Array.isArray(p) ? p : [images]; } catch { return [images]; } })()
    : [];

  const safeVideos: string[] = Array.isArray(videos)
    ? videos
    : typeof videos === 'string'
    ? (() => { try { const p = JSON.parse(videos); return Array.isArray(p) ? p : [videos]; } catch { return [videos]; } })()
    : [];

  // Combine all media into unified items array
  const mediaItems: MediaItem[] = [
    ...safeImages.filter(Boolean).map((img) => ({ type: 'image' as const, url: String(img) })),
    ...safeVideos.filter(Boolean).map((vid) => ({ type: 'video' as const, url: String(vid) })),
  ];

  const [currentIndex, setCurrentIndex] = useState(0);

  if (mediaItems.length === 0) return null;

  // Single item layout fallback
  if (mediaItems.length === 1) {
    const item = mediaItems[0];
    if (item.type === 'video') {
      return (
        <div className={`rounded-2xl overflow-hidden bg-black ${className}`}>
          <SmoothCarouselVideo
            src={item.url}
            autoPlay={autoPlayVideo}
            className="w-full max-h-[480px] object-contain mx-auto"
          />
        </div>
      );
    }
    return (
      <div
        onClick={() => onPhotoClick && onPhotoClick(0)}
        className={`relative group cursor-pointer overflow-hidden rounded-2xl bg-slate-950 ${className}`}
      >
        <img
          src={item.url}
          alt="Post media"
          className="w-full max-h-[480px] object-cover group-hover:scale-[1.01] transition-transform duration-300"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
          <span className="p-2.5 rounded-full bg-black/60 backdrop-blur-xs flex items-center gap-1.5 text-xs font-bold">
            <Maximize2 className="w-4 h-4" />
            <span>Full view</span>
          </span>
        </div>
      </div>
    );
  }

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : mediaItems.length - 1));
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev < mediaItems.length - 1 ? prev + 1 : 0));
  };

  // -------------------------------------------------------------
  // TEMPLATE 1: CAROUSEL SLIDER (Facebook-style swipeable carousel)
  // -------------------------------------------------------------
  if (layout === 'carousel') {
    const currentItem = mediaItems[currentIndex];

    return (
      <div className={`relative rounded-2xl overflow-hidden bg-slate-950 select-none group ${className}`}>
        {/* Media Canvas */}
        <div className="relative w-full h-72 sm:h-96 flex items-center justify-center bg-black overflow-hidden">
          {currentItem.type === 'video' ? (
            <SmoothCarouselVideo
              key={`video-${currentIndex}-${currentItem.url}`}
              src={currentItem.url}
              autoPlay={autoPlayVideo}
              className="w-full h-full object-contain"
            />
          ) : (
            <div
              className="w-full h-full cursor-pointer flex items-center justify-center"
              onClick={() => onPhotoClick && onPhotoClick(currentIndex)}
            >
              <img
                src={currentItem.url}
                alt={`Media ${currentIndex + 1}`}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.01]"
              />
            </div>
          )}

          {/* Top-Right Item Counter Badge */}
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md text-white text-[11px] font-extrabold tracking-wide flex items-center gap-1.5 z-10 shadow-sm">
            {currentItem.type === 'video' ? (
              <Film className="w-3 h-3 text-rose-400" />
            ) : (
              <ImageIcon className="w-3 h-3 text-emerald-400" />
            )}
            <span>
              {currentIndex + 1} / {mediaItems.length}
            </span>
          </div>

          {/* Prev Arrow */}
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous slide"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/90 text-white backdrop-blur-md transition-all active:scale-90 cursor-pointer shadow-lg z-10"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Next Arrow */}
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next slide"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/90 text-white backdrop-blur-md transition-all active:scale-90 cursor-pointer shadow-lg z-10"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Bottom Pagination Dots */}
        <div className="py-2.5 bg-slate-900/90 flex items-center justify-center gap-1.5">
          {mediaItems.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              aria-label={`Go to slide ${idx + 1}`}
              className={`transition-all rounded-full cursor-pointer ${
                currentIndex === idx
                  ? 'w-5 h-2 bg-blue-500 shadow-xs'
                  : 'w-2 h-2 bg-white/40 hover:bg-white/70'
              }`}
            />
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // TEMPLATE 2: HERO SPOTLIGHT (Prominent Feature + Thumbnails)
  // -------------------------------------------------------------
  if (layout === 'hero') {
    const featured = mediaItems[currentIndex];
    return (
      <div className={`space-y-2 rounded-2xl overflow-hidden ${className}`}>
        {/* Main Stage */}
        <div className="relative rounded-2xl overflow-hidden bg-black h-72 sm:h-96 flex items-center justify-center">
          {featured.type === 'video' ? (
            <SmoothCarouselVideo
              key={`hero-vid-${currentIndex}`}
              src={featured.url}
              autoPlay={autoPlayVideo}
              className="w-full h-full object-contain"
            />
          ) : (
            <img
              src={featured.url}
              alt="Featured"
              onClick={() => onPhotoClick && onPhotoClick(currentIndex)}
              className="w-full h-full object-cover cursor-pointer hover:scale-[1.01] transition-transform duration-300"
            />
          )}
          <span className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-xs text-white text-[11px] font-bold z-10">
            {currentIndex + 1} of {mediaItems.length}
          </span>
        </div>

        {/* Thumbnail Strip */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {mediaItems.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={`relative shrink-0 w-20 h-16 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                currentIndex === idx
                  ? 'border-blue-500 ring-2 ring-blue-500/30 scale-102'
                  : 'border-transparent opacity-65 hover:opacity-100'
              }`}
            >
              {item.type === 'video' ? (
                <div className="w-full h-full bg-slate-900 flex items-center justify-center text-white">
                  <Play className="w-4 h-4 fill-white" />
                </div>
              ) : (
                <img
                  src={item.url}
                  alt={`Thumb ${idx}`}
                  className="w-full h-full object-cover"
                />
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // TEMPLATE 3: COLUMN STACK (Clean Facebook vertical stack)
  // -------------------------------------------------------------
  if (layout === 'column') {
    return (
      <div className={`space-y-2.5 ${className}`}>
        {mediaItems.map((item, idx) => (
          <div
            key={idx}
            className="rounded-2xl overflow-hidden bg-slate-950 border border-slate-200/80 dark:border-slate-800"
          >
            {item.type === 'video' ? (
              <SmoothCarouselVideo
                src={item.url}
                autoPlay={autoPlayVideo}
                className="w-full max-h-[440px] object-contain bg-black"
              />
            ) : (
              <img
                src={item.url}
                alt={`Media ${idx + 1}`}
                onClick={() => onPhotoClick && onPhotoClick(idx)}
                className="w-full max-h-[460px] object-cover cursor-pointer hover:scale-[1.01] transition-transform duration-300"
                loading="lazy"
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  // -------------------------------------------------------------
  // TEMPLATE 4: CLASSIC GRID COLLAGE (Facebook Mosaic)
  // -------------------------------------------------------------
  const count = mediaItems.length;

  if (count === 2) {
    return (
      <div className={`grid grid-cols-2 gap-1.5 sm:gap-2 rounded-2xl overflow-hidden ${className}`}>
        {mediaItems.map((item, idx) => (
          <div
            key={idx}
            className="relative h-48 sm:h-64 bg-slate-950 overflow-hidden cursor-pointer"
            onClick={() => item.type !== 'video' && onPhotoClick && onPhotoClick(idx)}
          >
            {item.type === 'video' ? (
              <SmoothCarouselVideo src={item.url} autoPlay={autoPlayVideo} className="w-full h-full object-cover" />
            ) : (
              <img
                src={item.url}
                alt={`Grid ${idx}`}
                className="w-full h-full object-cover hover:scale-103 transition-transform duration-300"
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className={`grid grid-cols-3 gap-1.5 sm:gap-2 rounded-2xl overflow-hidden ${className}`}>
        {mediaItems.map((item, idx) => (
          <div
            key={idx}
            className="relative h-36 sm:h-52 bg-slate-950 overflow-hidden cursor-pointer"
            onClick={() => item.type !== 'video' && onPhotoClick && onPhotoClick(idx)}
          >
            {item.type === 'video' ? (
              <SmoothCarouselVideo src={item.url} autoPlay={autoPlayVideo} className="w-full h-full object-cover" />
            ) : (
              <img
                src={item.url}
                alt={`Grid ${idx}`}
                className="w-full h-full object-cover hover:scale-103 transition-transform duration-300"
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  // 4+ Items: 1 large on top, 3 below with +N more overlay
  const displayItems = mediaItems.slice(0, 4);
  const remaining = mediaItems.length - 4;

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2 rounded-2xl overflow-hidden ${className}`}>
      {displayItems.map((item, idx) => {
        const isLastWithMore = idx === 3 && remaining > 0;
        return (
          <div
            key={idx}
            onClick={() => item.type !== 'video' && onPhotoClick && onPhotoClick(idx)}
            className="relative h-36 sm:h-48 bg-slate-950 overflow-hidden cursor-pointer group"
          >
            {item.type === 'video' ? (
              <SmoothCarouselVideo src={item.url} autoPlay={autoPlayVideo} className="w-full h-full object-cover" />
            ) : (
              <img
                src={item.url}
                alt={`Grid ${idx}`}
                className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
              />
            )}

            {isLastWithMore && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center text-white text-lg font-black tracking-tight">
                +{remaining + 1}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

