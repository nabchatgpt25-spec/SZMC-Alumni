import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Volume2, VolumeX, ExternalLink } from 'lucide-react';

export interface AutoPlayYouTubeEmbedProps {
  embedUrl: string;
  originalUrl: string;
  titleHint?: string;
  autoPlayOnScroll?: boolean;
}

export const AutoPlayYouTubeEmbed: React.FC<AutoPlayYouTubeEmbedProps> = ({
  embedUrl,
  originalUrl,
  titleHint = 'YouTube Video',
  autoPlayOnScroll = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const wasPlayingRef = useRef<boolean>(false);
  const [isInView, setIsInView] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Normalize embed URL with enablejsapi=1 & playsinline=1
  const normalizedEmbedUrl = useMemo(() => {
    try {
      const u = new URL(embedUrl);
      u.searchParams.set('enablejsapi', '1');
      u.searchParams.set('playsinline', '1');
      u.searchParams.set('rel', '0');
      if (typeof window !== 'undefined') {
        u.searchParams.set('origin', window.location.origin);
      }
      return u.toString();
    } catch {
      const sep = embedUrl.includes('?') ? '&' : '?';
      return `${embedUrl}${sep}enablejsapi=1&playsinline=1&rel=0`;
    }
  }, [embedUrl]);

  const sendYouTubeCommand = (func: 'playVideo' | 'pauseVideo' | 'stopVideo' | 'mute' | 'unMute') => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(
        JSON.stringify({ event: 'command', func, args: [] }),
        '*'
      );
    } catch {
      // Cross-origin fallback
    }
  };

  // Load YouTube IFrame API script tag once
  useEffect(() => {
    let isCancelled = false;

    if (typeof window !== 'undefined' && !(window as any).YT) {
      const existing = document.getElementById('youtube-iframe-api');
      if (!existing) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(tag);
      }
    }

    const initPlayer = () => {
      if (isCancelled || !iframeRef.current || !(window as any).YT?.Player) return;
      try {
        ytPlayerRef.current = new (window as any).YT.Player(iframeRef.current, {
          events: {
            onStateChange: (event: any) => {
              if (event.data === 1) wasPlayingRef.current = true;
              else if (event.data === 2) wasPlayingRef.current = false;
            },
          },
        });
      } catch {}
    };

    if ((window as any).YT?.Player) {
      initPlayer();
    } else {
      const timer = setInterval(() => {
        if ((window as any).YT?.Player) {
          clearInterval(timer);
          initPlayer();
        }
      }, 150);
      setTimeout(() => clearInterval(timer), 4000);
    }

    return () => {
      isCancelled = true;
      if (ytPlayerRef.current?.destroy) {
        try {
          ytPlayerRef.current.destroy();
        } catch {}
      }
    };
  }, []);

  // Viewport intersection monitoring
  useEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl) return;

    const pause = () => {
      setIsInView(false);
      ytPlayerRef.current?.pauseVideo?.();
      sendYouTubeCommand('pauseVideo');
    };

    const resume = () => {
      setIsInView(true);
      if (wasPlayingRef.current || autoPlayOnScroll) {
        ytPlayerRef.current?.playVideo?.();
        sendYouTubeCommand('playVideo');
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            resume();
          } else if (!entry.isIntersecting || entry.intersectionRatio < 0.35) {
            pause();
          }
        });
      },
      { threshold: [0, 0.15, 0.35, 0.5, 0.75, 1.0] }
    );

    observer.observe(containerEl);

    const handleGlobalPause = () => {
      pause();
    };
    window.addEventListener('szmc-pause-all-media', handleGlobalPause);

    return () => {
      observer.disconnect();
      window.removeEventListener('szmc-pause-all-media', handleGlobalPause);
    };
  }, [autoPlayOnScroll]);

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (nextMuted) {
      ytPlayerRef.current?.mute?.();
      sendYouTubeCommand('mute');
    } else {
      ytPlayerRef.current?.unMute?.();
      sendYouTubeCommand('unMute');
    }
  };

  return (
    <div
      ref={containerRef}
      className="rounded-2xl overflow-hidden border border-slate-200/80 dark:border-slate-800 bg-slate-950 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-900 text-white text-xs">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md bg-red-600 text-white font-bold text-[10px] uppercase">
            YouTube
          </span>
          <span className="font-semibold text-slate-200 truncate max-w-[200px] sm:max-w-xs">
            {titleHint}
          </span>
          {autoPlayOnScroll && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                isInView
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {isInView ? '● Active' : '○ Paused'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleMute}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold cursor-pointer transition-colors"
          >
            {isMuted ? (
              <>
                <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                <span>Unmute</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sound On</span>
              </>
            )}
          </button>
          <a
            href={originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-400 hover:underline px-2 py-1"
          >
            <span>Open</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      <div className="aspect-video w-full bg-black">
        <iframe
          ref={iframeRef}
          src={normalizedEmbedUrl}
          title={titleHint}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    </div>
  );
};
