import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Download,
  RotateCcw,
  PictureInPicture2,
  ShieldCheck,
} from 'lucide-react';

export interface VideoLightboxProps {
  isOpen: boolean;
  videoSrc: string;
  posterSrc?: string;
  onClose: () => void;
  author?: {
    fullName: string;
    avatarUrl: string;
    batchYear?: number;
  };
  caption?: string;
}

export const VideoLightboxModal: React.FC<VideoLightboxProps> = ({
  isOpen,
  videoSrc,
  posterSrc,
  onClose,
  author,
  caption,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);

  const controlsTimeoutRef = useRef<number | null>(null);

  const formatSeconds = (sec: number) => {
    if (isNaN(sec)) return '0:00';
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch {}
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const nextTime = parseFloat(e.target.value);
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  // Keyboard controls: Space (Play/Pause), M (Mute), F (Fullscreen), Esc (Close)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMute();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose, togglePlay, toggleMute, toggleFullscreen]);

  // Auto-hide controls after inactivity
  const showControls = () => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) window.clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = window.setTimeout(() => {
      if (isPlaying) setControlsVisible(false);
    }, 3000);
  };

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      onMouseMove={showControls}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md select-none transition-opacity duration-300"
    >
      {/* Top Header */}
      <div
        className={`absolute top-0 inset-x-0 p-4 flex items-center justify-between z-30 bg-gradient-to-b from-black/80 to-transparent text-white transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3">
          {author && (
            <div className="flex items-center gap-2.5">
              <img
                src={author.avatarUrl}
                alt={author.fullName}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-blue-500/40"
              />
              <div>
                <div className="flex items-center gap-1 font-bold text-sm text-white">
                  <span>{author.fullName}</span>
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                </div>
                {author.batchYear && (
                  <span className="text-[11px] text-blue-300">Batch {author.batchYear}</span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <a
            href={videoSrc}
            download={`video-${Date.now()}.mp4`}
            className="p-2 text-slate-200 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-colors cursor-pointer"
            title="Download Video"
          >
            <Download className="w-4 h-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-white bg-white/15 hover:bg-rose-600 rounded-xl transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Video Element */}
      <video
        ref={videoRef}
        src={videoSrc}
        poster={posterSrc}
        playsInline
        autoPlay
        muted={isMuted}
        onClick={togglePlay}
        onTimeUpdate={() => {
          if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
        }}
        onLoadedMetadata={() => {
          if (videoRef.current) setDuration(videoRef.current.duration);
        }}
        onEnded={() => setIsPlaying(false)}
        className="max-w-[94vw] max-h-[82vh] object-contain cursor-pointer rounded-xl shadow-2xl"
      />

      {/* Bottom Controls Bar */}
      <div
        className={`absolute bottom-0 inset-x-0 p-4 sm:p-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex flex-col gap-2 z-30 transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {caption && (
          <p className="text-xs sm:text-sm text-slate-200 text-center line-clamp-1 mb-1">
            "{caption}"
          </p>
        )}

        {/* Progress Bar / Scrubber */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-300 font-mono w-10 text-right">
            {formatSeconds(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
          />
          <span className="text-xs text-slate-300 font-mono w-10">
            {formatSeconds(duration)}
          </span>
        </div>

        {/* Action Buttons Row */}
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                if (videoRef.current) videoRef.current.currentTime = 0;
              }}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
              title="Restart"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={toggleMute}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-emerald-400" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePiP}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
              title="Picture-in-Picture"
            >
              <PictureInPicture2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
