import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Play,
  Film,
  Image as ImageIcon,
  Layers,
} from 'lucide-react';

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

export const PostMediaCarousel: React.FC<PostMediaCarouselProps> = ({
  images = [],
  videos = [],
  layout = 'carousel',
  onPhotoClick,
  className = '',
  autoPlayVideo = false,
}) => {
  // Combine all media into unified items array
  const mediaItems: MediaItem[] = [
    ...images.map((img) => ({ type: 'image' as const, url: img })),
    ...videos.map((vid) => ({ type: 'video' as const, url: vid })),
  ];

  const [currentIndex, setCurrentIndex] = useState(0);

  if (mediaItems.length === 0) return null;

  // Single item layout fallback
  if (mediaItems.length === 1) {
    const item = mediaItems[0];
    if (item.type === 'video') {
      return (
        <div className={`rounded-2xl overflow-hidden bg-black ${className}`}>
          <video
            src={item.url}
            controls
            autoPlay={autoPlayVideo}
            className="w-full max-h-[460px] object-contain mx-auto"
            preload="metadata"
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
            <video
              key={`video-${currentIndex}-${currentItem.url}`}
              src={currentItem.url}
              controls
              className="w-full h-full object-contain"
              preload="metadata"
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
            <video
              key={`hero-vid-${currentIndex}`}
              src={featured.url}
              controls
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
          <span className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-xs text-white text-[11px] font-bold">
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
              <video
                src={item.url}
                controls
                className="w-full max-h-[440px] object-contain bg-black"
                preload="metadata"
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
            onClick={() => onPhotoClick && onPhotoClick(idx)}
          >
            {item.type === 'video' ? (
              <video src={item.url} className="w-full h-full object-cover" />
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
            onClick={() => onPhotoClick && onPhotoClick(idx)}
          >
            {item.type === 'video' ? (
              <video src={item.url} className="w-full h-full object-cover" />
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
            onClick={() => onPhotoClick && onPhotoClick(idx)}
            className="relative h-36 sm:h-48 bg-slate-950 overflow-hidden cursor-pointer group"
          >
            {item.type === 'video' ? (
              <video src={item.url} className="w-full h-full object-cover" />
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
