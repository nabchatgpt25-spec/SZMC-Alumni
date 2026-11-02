import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { Volume2, VolumeX, Play, Pause, Maximize, Loader2 } from 'lucide-react';
import { VideoLightboxModal } from './VideoLightboxModal';

export interface VideoProps {
  src: string;
  poster?: string;
  className?: string;
  autoPlayOnScroll?: boolean;
  loop?: boolean;
  controls?: boolean;
  mutedDefault?: boolean;
  onOpenFullscreenModal?: () => void;
  author?: {
    fullName: string;
    avatarUrl: string;
    batchYear?: number;
  };
  caption?: string;
}

/**
 * High-performance Video Player with IntersectionObserver:
 * - Automatically pauses when scrolled out of view (<40% visible)
 * - Automatically resumes when back in viewport (>=50% visible)
 * - Restores sound automatically upon scroll-in and user interaction
 * - Ensures only one video plays at a time across the entire page
 */
export const Video: React.FC<VideoProps> = ({
  src,
  poster,
  className = '',
  autoPlayOnScroll = true,
  loop = true,
  controls = true,
  mutedDefault = false,
  onOpenFullscreenModal,
  author,
  caption,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [isMuted, setIsMuted] = useState<boolean>(mutedDefault);
  const userExplicitlyMutedRef = useRef<boolean>(mutedDefault);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isInView, setIsInView] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isInternalTheaterOpen, setIsInternalTheaterOpen] = useState<boolean>(false);

  const isHls = Boolean(
    src &&
      (src.split('?')[0].split('#')[0].toLowerCase().endsWith('.m3u8') ||
        src.toLowerCase().includes('application/vnd.apple.mpegurl') ||
        src.toLowerCase().includes('.m3u8?'))
  );

  // Attach HLS.js if stream is .m3u8
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !src) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (isHls) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 30,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          startFragPrefetch: true,
        });
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(videoEl);
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = src;
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, isHls]);

  // Resume or start playback WITH SOUND
  const startPlayback = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    // Pause all other video elements in the document to prevent audio clash
    document.querySelectorAll('video').forEach((other) => {
      if (other !== videoEl && !other.paused) {
        other.pause();
      }
    });

    // Broadcast event to notify YouTube/Facebook embeds to pause
    window.dispatchEvent(
      new CustomEvent('ndc-pause-all-media', { detail: { except: videoEl } })
    );

    const shouldMute = userExplicitlyMutedRef.current;
    videoEl.muted = shouldMute;
    setIsMuted(shouldMute);

    videoEl
      .play()
      .then(() => {
        setIsPlaying(true);
        if (!shouldMute && videoEl.muted) {
          videoEl.muted = false;
          setIsMuted(false);
        }
      })
      .catch(() => {
        // If initial autoplay is constrained by browser gesture policies,
        // start muted temporarily and unmute on the very next user interaction
        videoEl.muted = true;
        setIsMuted(true);
        videoEl
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => setIsPlaying(false));
      });
  }, []);

  // Pause playback helper
  const pausePlayback = useCallback(() => {
    const videoEl = videoRef.current;
    if (videoEl && !videoEl.paused) {
      videoEl.pause();
      setIsPlaying(false);
    }
  }, []);

  useEffect(() => {
    const videoEl = videoRef.current;
    const containerEl = containerRef.current;
    if (!videoEl || !containerEl) return;

    // Listen for any user gesture to safely activate sound if not explicitly muted
    const handleUserGesture = () => {
      if (!userExplicitlyMutedRef.current && videoEl && videoEl.muted) {
        videoEl.muted = false;
        setIsMuted(false);
      }
    };

    window.addEventListener('click', handleUserGesture, { passive: true });
    window.addEventListener('touchstart', handleUserGesture, { passive: true });
    window.addEventListener('keydown', handleUserGesture, { passive: true });

    const evaluateVisibility = () => {
      if (!containerEl || !videoEl) return;
      const rect = containerEl.getBoundingClientRect();
      const windowHeight = window.innerHeight || document.documentElement.clientHeight;
      const windowWidth = window.innerWidth || document.documentElement.clientWidth;

      // Off-screen check
      const isOffScreen =
        rect.bottom <= 20 ||
        rect.top >= windowHeight - 20 ||
        rect.right <= 0 ||
        rect.left >= windowWidth;

      if (isOffScreen) {
        setIsInView(false);
        if (!videoEl.paused) {
          videoEl.pause();
          setIsPlaying(false);
        }
        return;
      }

      const visibleHeight = Math.min(rect.bottom, windowHeight) - Math.max(rect.top, 0);
      const ratio = rect.height > 0 ? visibleHeight / rect.height : 0;

      if (ratio < 0.4) {
        // Less than 40% visible: PAUSE
        setIsInView(false);
        if (!videoEl.paused) {
          videoEl.pause();
          setIsPlaying(false);
        }
      } else if (ratio >= 0.5) {
        // 50% or more visible: RESUME WITH SOUND
        setIsInView(true);
        if (autoPlayOnScroll) {
          if (videoEl.paused) {
            startPlayback();
          }
          if (!userExplicitlyMutedRef.current && videoEl.muted) {
            videoEl.muted = false;
            setIsMuted(false);
          }
        }
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.4) {
            setIsInView(false);
            if (!videoEl.paused) {
              videoEl.pause();
              setIsPlaying(false);
            }
          } else if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            setIsInView(true);
            if (autoPlayOnScroll) {
              if (videoEl.paused) {
                startPlayback();
              }
              if (!userExplicitlyMutedRef.current && videoEl.muted) {
                videoEl.muted = false;
                setIsMuted(false);
              }
            }
          }
        });
      },
      { threshold: [0, 0.15, 0.35, 0.5, 0.75, 1.0] }
    );

    observer.observe(containerEl);

    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        evaluateVisibility();
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden && !videoEl.paused) {
        videoEl.pause();
        setIsPlaying(false);
      }
    };

    const handleGlobalPause = (e: Event) => {
      const custom = e as CustomEvent;
      if (custom.detail?.except !== videoEl && !videoEl.paused) {
        videoEl.pause();
        setIsPlaying(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    document.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('ndc-pause-all-media', handleGlobalPause);

    evaluateVisibility();

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScroll, { capture: true });
      document.removeEventListener('scroll', handleScroll, { capture: true });
      window.removeEventListener('resize', handleScroll);
      window.removeEventListener('click', handleUserGesture);
      window.removeEventListener('touchstart', handleUserGesture);
      window.removeEventListener('keydown', handleUserGesture);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('ndc-pause-all-media', handleGlobalPause);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [autoPlayOnScroll, startPlayback]);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const nextMuted = !isMuted;
    videoEl.muted = nextMuted;
    setIsMuted(nextMuted);
    userExplicitlyMutedRef.current = nextMuted;
  };

  const handleVideoPlayPause = () => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (videoEl.paused) {
      startPlayback();
    } else {
      pausePlayback();
    }
  };

  const handleExpandTheater = (e: React.MouseEvent) => {
    e.stopPropagation();
    pausePlayback();
    if (onOpenFullscreenModal) {
      onOpenFullscreenModal();
    } else {
      setIsInternalTheaterOpen(true);
    }
  };

  return (
    <>
      <div
        ref={containerRef}
        className={`relative rounded-2xl overflow-hidden border border-slate-200/80 dark:border-slate-800 bg-black group shadow-sm ${className}`}
      >
        {/* Subtle Glassmorphism Activity Indicator (Buffering / Loading Spinner) */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/25 backdrop-blur-[2px] z-10 pointer-events-none transition-opacity duration-300">
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-black/65 dark:bg-slate-900/75 backdrop-blur-md border border-white/15 shadow-lg">
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin shrink-0" />
              <span className="text-[11px] font-semibold text-white/90 tracking-wide">
                Buffering...
              </span>
            </div>
          </div>
        )}

        <video
          ref={videoRef}
          src={isHls ? undefined : src}
          poster={poster}
          controls={controls}
          playsInline
          webkit-playsinline="true"
          muted={isMuted}
          loop={loop}
          preload="metadata"
          onLoadStart={() => setIsLoading(true)}
          onLoadedMetadata={() => setIsLoading(false)}
          onLoadedData={() => setIsLoading(false)}
          onCanPlay={() => setIsLoading(false)}
          onWaiting={() => setIsLoading(true)}
          onStalled={() => setIsLoading(true)}
          onPlaying={() => {
            setIsLoading(false);
            setIsPlaying(true);
          }}
          onError={() => setIsLoading(false)}
          onPause={() => setIsPlaying(false)}
          onClick={handleVideoPlayPause}
          className="w-full min-h-[220px] max-h-[540px] object-contain bg-black cursor-pointer"
        />

        {/* Floating Quick Action Overlay */}
        <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-none z-20">
          {!controls && (
            <button
              type="button"
              onClick={handleVideoPlayPause}
              className="pointer-events-auto p-2 rounded-full bg-black/75 hover:bg-black text-white transition-all shadow-md backdrop-blur-sm cursor-pointer"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
          )}

          {/* Theater / Fullscreen Modal Launcher */}
          <button
            type="button"
            onClick={handleExpandTheater}
            className="pointer-events-auto p-2 rounded-full bg-black/75 hover:bg-black text-white transition-all shadow-md backdrop-blur-sm cursor-pointer"
            title="Expand to Fullscreen Theater"
          >
            <Maximize className="w-3.5 h-3.5 text-slate-200 hover:text-white" />
          </button>
        </div>

        {/* Viewport Status Indicator */}
        {autoPlayOnScroll && (
          <div className="absolute bottom-3 left-3 pointer-events-none z-20 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-sm text-[10px] font-semibold text-white/90 border border-white/10">
              {isInView
                ? isMuted
                  ? '● In View (Muted)'
                  : '● Playing with Sound'
                : '○ Paused on Scroll'}
            </span>
          </div>
        )}
      </div>

      <VideoLightboxModal
        isOpen={isInternalTheaterOpen}
        videoSrc={src}
        posterSrc={poster}
        onClose={() => setIsInternalTheaterOpen(false)}
        author={author}
        caption={caption}
      />
    </>
  );
};

export default Video;
