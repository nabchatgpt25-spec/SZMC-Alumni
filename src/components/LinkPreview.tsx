import React, { useState } from 'react';
import { ExternalLink, Play, Globe } from 'lucide-react';
import { LinkMetadata } from '../types/post';

interface LinkPreviewProps {
  url?: string;
  data?: LinkMetadata;
}

export const LinkPreview: React.FC<LinkPreviewProps> = ({ url: directUrl, data }) => {
  const [showEmbedPlayer, setShowEmbedPlayer] = useState(false);
  const [embedError, setEmbedError] = useState(false);
  const effectiveUrl = data?.canonical_url || directUrl || '';

  if (!effectiveUrl) return null;

  const type = data?.type || 'generic';

  // 1. YouTube & YouTube Shorts Embed
  if (type === 'youtube' && data?.video_id) {
    const ytEmbedUrl = `https://www.youtube-nocookie.com/embed/${data.video_id}?enablejsapi=1&rel=0&playsinline=1`;
    return (
      <div className="w-full my-3">
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-md border border-slate-200 dark:border-slate-800">
          <iframe
            src={ytEmbedUrl}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={data.title || 'YouTube video'}
          />
        </div>
        <div className="mt-1.5 text-right">
          <a
            href={effectiveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            <span>{data.is_reel ? 'Watch on YouTube Shorts' : 'Watch on YouTube'}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    );
  }

  // 2. Facebook Video / Reel with Fallback
  if (type === 'facebook_video') {
    const encodedUrl = encodeURIComponent(effectiveUrl);
    const videoEmbedSrc = `https://www.facebook.com/plugins/video.php?href=${encodedUrl}&show_text=false&autoplay=1`;

    return (
      <div className="w-full my-3 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900 text-white text-xs">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-[#1877F2] text-white font-black text-[10px] uppercase">
              Facebook
            </span>
            <span className="font-semibold truncate max-w-xs">{data?.title || 'Facebook Video'}</span>
          </div>
          <a
            href={effectiveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-bold text-blue-400 hover:underline inline-flex items-center gap-1"
          >
            <span>Open</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {showEmbedPlayer ? (
          embedError ? (
            <div className="p-6 bg-slate-950 text-center text-white space-y-2">
              <p className="text-xs text-slate-300">Facebook requires viewing this video directly on their platform.</p>
              <a
                href={effectiveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-4 py-1.5 bg-[#1877F2] text-white rounded-xl text-xs font-bold"
              >
                <span>Watch on Facebook</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ) : (
            <div className="relative aspect-video bg-black">
              <iframe
                src={videoEmbedSrc}
                className="w-full h-full border-0"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                onError={() => setEmbedError(true)}
                title="Facebook Video"
              />
            </div>
          )
        ) : (
          <div
            onClick={() => setShowEmbedPlayer(true)}
            className="relative cursor-pointer aspect-video bg-slate-950 flex items-center justify-center group overflow-hidden"
          >
            {data?.image && (
              <img
                src={data.image}
                alt="thumbnail"
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            )}
            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
            <div className="relative z-10 w-16 h-16 rounded-full bg-[#1877F2] group-hover:scale-110 active:scale-95 transition-transform flex items-center justify-center text-white shadow-xl">
              <Play className="w-8 h-8 fill-white ml-1" />
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. Direct HTML5 Video Player
  if (type === 'direct_video' || data?.video_url) {
    return (
      <div className="w-full my-3 rounded-2xl overflow-hidden bg-black border border-slate-800">
        <video src={data?.video_url || effectiveUrl} controls className="w-full max-h-[500px]" />
      </div>
    );
  }

  // 4. Generic Link Preview Card (OpenGraph Style)
  return (
    <a
      href={effectiveUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block my-3 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 hover:border-blue-400 dark:hover:border-blue-500 transition-all shadow-sm"
    >
      <div className="flex flex-col sm:flex-row">
        {data?.image ? (
          <div className="sm:w-48 h-36 sm:h-auto bg-slate-950 shrink-0 overflow-hidden">
            <img
              src={data.image}
              alt={data.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          </div>
        ) : (
          <div className="hidden sm:flex w-24 bg-slate-200 dark:bg-slate-800 items-center justify-center text-slate-400 shrink-0">
            <Globe className="w-8 h-8" />
          </div>
        )}
        <div className="p-3.5 flex flex-col justify-between flex-1 min-w-0">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
              {data?.site_name || 'Link'}
            </span>
            <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 line-clamp-1 mt-1">
              {data?.title || effectiveUrl}
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mt-1">
              {data?.description || effectiveUrl}
            </p>
          </div>
          <div className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 inline-flex items-center gap-1">
            <span>Visit site</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    </a>
  );
};
