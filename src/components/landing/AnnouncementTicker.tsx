import React, { useState } from 'react';
import { Megaphone, ChevronRight, Pause, Play, Bell, AlertTriangle } from 'lucide-react';
import { OFFICIAL_NOTICES, OfficialNotice } from '../../data/noticesData';
import { useSiteConfig } from '../../services/siteConfigService';

interface AnnouncementTickerProps {
  onSelectNotice: (notice: OfficialNotice) => void;
  onOpenNoticeBoard: () => void;
}

export const AnnouncementTicker: React.FC<AnnouncementTickerProps> = ({
  onSelectNotice,
  onOpenNoticeBoard,
}) => {
  const { config } = useSiteConfig();
  const [isPaused, setIsPaused] = useState(false);
  const urgentNotices = config.notices && config.notices.length > 0 ? (config.notices as any) : OFFICIAL_NOTICES;

  const isEmergencyTicker = config.liveTickerEnabled && config.liveTickerMessage;

  return (
    <div className="bg-blue-900 dark:bg-slate-900 border-y border-blue-800 dark:border-slate-800 text-white shadow-xs overflow-hidden relative z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center h-11 text-xs">
        {/* Ticker Label Badge */}
        {/* Ticker Label Badge */}
        <div className={`flex items-center gap-1.5 px-3 py-1 font-black rounded-lg uppercase tracking-wider text-[11px] shrink-0 shadow-xs mr-3 ${
          isEmergencyTicker && config.liveTickerUrgency === 'emergency'
            ? 'bg-rose-600 text-white animate-pulse'
            : isEmergencyTicker && config.liveTickerUrgency === 'urgent'
            ? 'bg-amber-500 text-slate-950'
            : 'bg-amber-500 text-slate-950'
        }`}>
          {isEmergencyTicker ? <AlertTriangle className="w-3.5 h-3.5" /> : <Megaphone className="w-3.5 h-3.5 animate-bounce" />}
          <span className="hidden sm:inline">{isEmergencyTicker ? (config.liveTickerUrgency === 'emergency' ? 'EMERGENCY BROADCAST' : 'LIVE ANNOUNCEMENT') : 'OFFICIAL NOTICE'}</span>
          <span className="sm:hidden">{isEmergencyTicker ? 'ALERT' : 'NOTICE'}</span>
        </div>

        {/* Scrolling News Strip */}
        <div
          className="flex-1 overflow-hidden relative cursor-pointer"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div
            className={`flex items-center gap-8 whitespace-nowrap ${
              isPaused ? '' : 'animate-marquee'
            }`}
            style={{
              animationDuration: '30s',
              animationTimingFunction: 'linear',
              animationIterationCount: 'infinite',
            }}
          >
            {isEmergencyTicker && (
              <div className="inline-flex items-center gap-2 font-bold text-amber-200">
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping shrink-0" />
                <span>{config.liveTickerMessage}</span>
                {config.liveTickerActionText && (
                  <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-900 text-[10px] font-black uppercase tracking-wider ml-1">
                    {config.liveTickerActionText}
                  </span>
                )}
              </div>
            )}
            {urgentNotices.concat(urgentNotices).map((item: any, idx: number) => (
              <button
                key={`${item.id}-${idx}`}
                type="button"
                onClick={() => onSelectNotice(item)}
                className="inline-flex items-center gap-2 text-blue-100 hover:text-amber-300 transition-colors cursor-pointer text-left"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                <span className="font-semibold text-xs tracking-tight truncate max-w-md sm:max-w-xl">
                  [{item.refNo}] {item.title}
                </span>
                <span className="text-[10px] text-blue-300 font-mono">
                  ({item.publishedDate})
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Controls and "All Notices" link */}
        <div className="flex items-center gap-2 pl-3 border-l border-blue-800/80 shrink-0 ml-2">
          <button
            type="button"
            onClick={() => setIsPaused(!isPaused)}
            className="p-1 text-blue-300 hover:text-white transition-colors cursor-pointer"
            title={isPaused ? 'Resume scrolling' : 'Pause scrolling'}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={onOpenNoticeBoard}
            className="hidden sm:flex items-center gap-1 font-bold text-amber-300 hover:text-white transition-colors cursor-pointer text-[11px]"
          >
            <span>Notice Board</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
