import React, { useState, useRef, useEffect } from 'react';
import { Heart } from 'lucide-react';
import type { ReactionType } from '../../types/post';
import {
  REACTIONS,
  getReactionMeta,
  getTopReactions,
} from '../../services/richInteractionsUtils';

interface ReactionPickerButtonProps {
  likedByMe?: boolean;
  userReaction?: ReactionType | null;
  likesCount: number;
  reactionsSummary?: Partial<Record<ReactionType, number>>;
  disabled?: boolean;
  onReact: (reaction: ReactionType | null) => void;
}

export const ReactionPickerButton: React.FC<ReactionPickerButtonProps> = ({
  likedByMe = false,
  userReaction = null,
  likesCount,
  reactionsSummary,
  disabled = false,
  onReact,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const hoverCloseTimer = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const effectiveReaction: ReactionType | null = userReaction || (likedByMe ? 'love' : null);
  const activeMeta = effectiveReaction ? getReactionMeta(effectiveReaction) : null;
  const topReactions = getTopReactions(reactionsSummary, effectiveReaction, likesCount);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    if (pickerOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [pickerOpen]);

  const openWithDelayCancel = () => {
    if (disabled) return;
    if (hoverCloseTimer.current) {
      window.clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
    setPickerOpen(true);
  };

  const closeWithGrace = () => {
    hoverCloseTimer.current = window.setTimeout(() => {
      setPickerOpen(false);
    }, 180);
  };

  const handlePrimaryClick = () => {
    if (disabled) return;
    if (effectiveReaction) {
      onReact(null);
    } else {
      onReact('love');
    }
    setPickerOpen(false);
  };

  const handlePick = (type: ReactionType) => {
    if (disabled) return;
    onReact(effectiveReaction === type ? null : type);
    setPickerOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className="relative flex-1 sm:flex-initial flex items-center"
      onMouseEnter={openWithDelayCancel}
      onMouseLeave={closeWithGrace}
    >
      {/* Floating Reaction Tray */}
      {pickerOpen && (
        <div
          role="toolbar"
          aria-label="Choose a reaction"
          className="absolute bottom-full left-0 mb-2 z-30 flex items-center gap-0.5 px-2 py-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg transition-opacity duration-150"
          onMouseEnter={openWithDelayCancel}
          onMouseLeave={closeWithGrace}
        >
          {REACTIONS.map((item) => {
            const isSelected = effectiveReaction === item.type;
            return (
              <button
                key={item.type}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePick(item.type);
                }}
                title={item.label}
                aria-label={item.label}
                aria-pressed={isSelected}
                className={`w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl text-lg transition-transform duration-150 hover:scale-125 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer ${
                  isSelected
                    ? 'bg-slate-100 dark:bg-slate-800 ring-1 ring-blue-400/60 scale-110'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span aria-hidden="true">{item.emoji}</span>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={handlePrimaryClick}
        onContextMenu={(e) => {
          e.preventDefault();
          setPickerOpen((prev) => !prev);
        }}
        aria-label={activeMeta ? `Remove ${activeMeta.label} reaction` : 'React to post'}
        title={activeMeta ? `${activeMeta.label} (hover for more reactions)` : 'React (hover for options)'}
        className={`w-full sm:w-auto min-h-[44px] sm:min-h-[38px] flex items-center justify-center gap-1.5 py-2 px-2.5 sm:px-3.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          activeMeta
            ? `${activeMeta.activeClass} ring-1`
            : 'text-slate-600 dark:text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800/80'
        }`}
      >
        {activeMeta ? (
          <span className="text-sm leading-none" aria-hidden="true">
            {activeMeta.emoji}
          </span>
        ) : (
          <Heart className="w-4 h-4 shrink-0" />
        )}

        <span className="hidden sm:inline">
          {activeMeta ? activeMeta.label : 'React'}
        </span>

        {likesCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-mono tabular-nums leading-none">
            {topReactions.length > 1 && (
              <span className="hidden md:inline text-[11px]" aria-hidden="true">
                {topReactions.map((r) => r.emoji).join('')}
              </span>
            )}
            <span>{likesCount}</span>
          </span>
        )}
      </button>
    </div>
  );
};
