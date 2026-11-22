import React from 'react';
import { BarChart2, Check, Droplet, MessageSquarePlus, Stethoscope } from 'lucide-react';
import type { MessageReaction } from '../../types/messaging';
import {
  POLL_OPTION_EMOJIS,
  tokenizeLinks,
  type StructuredCardData,
} from '../../utils/structuredChat';
import { ProfileShareCardMessage } from './ProfileShareCardMessage';

interface RichMessageTextProps {
  text: string;
  mine: boolean;
}

export const RichMessageText: React.FC<RichMessageTextProps> = ({ text, mine }) => {
  const segments = tokenizeLinks(text);
  return (
    <>
      {segments.map((seg, idx) =>
        seg.type === 'link' ? (
          <a
            key={`${idx}-${seg.value}`}
            href={seg.value}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`underline underline-offset-2 break-all transition-opacity hover:opacity-85 ${
              mine ? 'text-white font-medium' : 'text-[#0084FF] dark:text-sky-400 font-medium'
            }`}
          >
            {seg.value}
          </a>
        ) : (
          <React.Fragment key={idx}>{seg.value}</React.Fragment>
        )
      )}
    </>
  );
};

interface StructuredChatCardProps {
  data: StructuredCardData;
  mine: boolean;
  compact?: boolean;
  myId: number;
  reactions?: MessageReaction[];
  onToggleReaction?: (emoji: string) => void;
  onQuickReply?: (prefillText?: string) => void;
  onViewProfile?: (profileId: number) => void;
}

export const StructuredChatCard: React.FC<StructuredChatCardProps> = ({
  data,
  mine,
  compact = false,
  myId,
  reactions = [],
  onToggleReaction,
  onQuickReply,
  onViewProfile,
}) => {
  if (data.kind === 'profile_card') {
    return (
      <ProfileShareCardMessage
        data={data}
        compact={compact}
        onViewProfile={onViewProfile}
      />
    );
  }

  if (data.kind === 'consult') {
    const isUrgent = data.urgency === 'Urgent';
    return (
      <div className={`space-y-2 ${compact ? 'min-w-[200px]' : 'min-w-[240px]'}`}>
        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-current/15">
          <div className="flex items-center gap-1.5 min-w-0">
            <Stethoscope className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs font-bold truncate">
              Clinical Consult · {data.specialty}
            </span>
          </div>
          {isUrgent && (
            <span
              className={`text-[10px] font-bold uppercase tracking-wide shrink-0 ${
                mine ? 'text-amber-200' : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              Urgent
            </span>
          )}
        </div>

        <p className={`${compact ? 'text-xs' : 'text-[13px]'} leading-relaxed whitespace-pre-wrap break-words`}>
          {data.summary}
        </p>

        {data.question && (
          <p
            className={`${compact ? 'text-[11px]' : 'text-xs'} whitespace-pre-wrap break-words ${
              mine ? 'text-white/90' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <span className="font-semibold">Question:</span> {data.question}
          </p>
        )}

        {onQuickReply && (
          <div className="pt-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickReply(`Re: ${data.specialty} consult — `);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
                mine
                  ? 'bg-white text-[#0084FF] hover:bg-blue-50'
                  : 'bg-[#0084FF] text-white hover:bg-[#0073E6]'
              }`}
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span>Discuss Case</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  if (data.kind === 'lifeline') {
    return (
      <div className={`space-y-2 ${compact ? 'min-w-[200px]' : 'min-w-[240px]'}`}>
        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-current/15">
          <div className="flex items-center gap-1.5 min-w-0">
            <Droplet
              className={`w-3.5 h-3.5 shrink-0 ${
                mine ? 'text-rose-200 fill-rose-200' : 'text-rose-600 fill-rose-600 dark:text-rose-400 dark:fill-rose-400'
              }`}
            />
            <span className="text-xs font-bold truncate">
              Blood &amp; Referral · {data.bloodGroup}
            </span>
          </div>
        </div>

        <p
          className={`${compact ? 'text-[11px]' : 'text-xs'} font-semibold ${
            mine ? 'text-white/95' : 'text-slate-800 dark:text-slate-100'
          }`}
        >
          {data.hospital}
        </p>

        {data.note && (
          <p className={`${compact ? 'text-xs' : 'text-[13px]'} leading-relaxed whitespace-pre-wrap break-words`}>
            {data.note}
          </p>
        )}

        {onQuickReply && (
          <div className="pt-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickReply(`I can assist with ${data.bloodGroup} at ${data.hospital}. `);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
                mine
                  ? 'bg-white text-rose-600 hover:bg-rose-50'
                  : 'bg-rose-600 text-white hover:bg-rose-700'
              }`}
            >
              <Droplet className="w-3 h-3" />
              <span>I Can Assist</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // Interactive Poll Card (persisted via real Supabase message_reactions)
  const optionCounts = data.options.map((_, idx) => {
    const emoji = POLL_OPTION_EMOJIS[idx];
    const voters = reactions.filter((r) => r.emoji === emoji);
    return {
      emoji,
      count: voters.length,
      votedByMe: voters.some((r) => r.profileId === myId),
    };
  });
  const totalVotes = optionCounts.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className={`space-y-2.5 ${compact ? 'min-w-[210px]' : 'min-w-[250px]'}`}>
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-current/15">
        <div className="flex items-center gap-1.5 min-w-0">
          <BarChart2 className="w-3.5 h-3.5 shrink-0" />
          <span className="text-xs font-bold truncate">Quick Poll</span>
        </div>
        <span className="text-[10px] font-semibold tabular-nums opacity-80 shrink-0">
          {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
        </span>
      </div>

      <p className={`${compact ? 'text-xs' : 'text-[13px]'} font-semibold leading-snug break-words`}>
        {data.question}
      </p>

      <div className="space-y-1.5">
        {data.options.map((option, idx) => {
          const stat = optionCounts[idx];
          const pct = totalVotes > 0 ? Math.round((stat.count / totalVotes) * 100) : 0;

          return (
            <button
              key={`${idx}-${option}`}
              type="button"
              disabled={!onToggleReaction}
              onClick={(e) => {
                e.stopPropagation();
                onToggleReaction?.(stat.emoji);
              }}
              className={`w-full relative overflow-hidden rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer disabled:cursor-default ${
                mine
                  ? stat.votedByMe
                    ? 'border-white bg-white/20 text-white'
                    : 'border-white/30 bg-white/10 hover:bg-white/15 text-white'
                  : stat.votedByMe
                  ? 'border-[#0084FF] bg-blue-50/90 dark:bg-blue-950/50 text-slate-900 dark:text-white'
                  : 'border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 hover:border-[#0084FF]/60 text-slate-800 dark:text-slate-100'
              }`}
            >
              {totalVotes > 0 && (
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 transition-all duration-300 ${
                    mine ? 'bg-white/15' : 'bg-[#0084FF]/10 dark:bg-[#0084FF]/20'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 min-w-0 font-medium">
                  {stat.votedByMe && <Check className="w-3.5 h-3.5 shrink-0" />}
                  <span className="truncate">{option}</span>
                </span>
                <span className="text-[11px] font-bold tabular-nums shrink-0 opacity-85">
                  {totalVotes > 0 ? `${pct}% (${stat.count})` : 'Vote'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
