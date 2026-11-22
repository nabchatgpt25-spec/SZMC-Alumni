import React, { useState } from 'react';
import { BarChart3, Check } from 'lucide-react';
import type { PostPoll } from '../../types/post';
import { computePollOptionPercent } from '../../services/richInteractionsUtils';
import { voteOnPostPoll } from '../../services/richInteractionsService';

interface InlinePostPollCardProps {
  poll: PostPoll;
  currentUserId?: number;
  onPollUpdated?: (updated: PostPoll) => void;
}

export const InlinePostPollCard: React.FC<InlinePostPollCardProps> = ({
  poll,
  currentUserId,
  onPollUpdated,
}) => {
  const [localPoll, setLocalPoll] = useState<PostPoll>(poll);
  const [submittingIndex, setSubmittingIndex] = useState<number | null>(null);

  const hasVoted = localPoll.myVoteOptionIndex !== null && localPoll.myVoteOptionIndex !== undefined;
  const showResults = hasVoted || localPoll.isClosed;

  const handleVote = async (optionIdx: number) => {
    if (!currentUserId || localPoll.isClosed || submittingIndex !== null) return;
    if (localPoll.myVoteOptionIndex === optionIdx) return;

    const prevIdx = localPoll.myVoteOptionIndex;
    const nextCounts = { ...localPoll.voteCounts };
    if (prevIdx !== null && prevIdx !== undefined && nextCounts[prevIdx] > 0) {
      nextCounts[prevIdx] = Math.max(0, nextCounts[prevIdx] - 1);
    }
    nextCounts[optionIdx] = (nextCounts[optionIdx] || 0) + 1;
    const nextTotal = prevIdx !== null && prevIdx !== undefined
      ? localPoll.totalVotes
      : localPoll.totalVotes + 1;

    const updated: PostPoll = {
      ...localPoll,
      voteCounts: nextCounts,
      totalVotes: nextTotal,
      myVoteOptionIndex: optionIdx,
    };

    setLocalPoll(updated);
    onPollUpdated?.(updated);

    setSubmittingIndex(optionIdx);
    await voteOnPostPoll(localPoll.id, currentUserId, optionIdx);
    setSubmittingIndex(null);
  };

  return (
    <div className="my-2.5 p-3.5 sm:p-4 rounded-xl bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
            {localPoll.question}
          </h4>
        </div>
        <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
          {localPoll.totalVotes} {localPoll.totalVotes === 1 ? 'vote' : 'votes'}
        </span>
      </div>

      <div className="space-y-2">
        {localPoll.options.map((opt, idx) => {
          const pct = computePollOptionPercent(localPoll, idx);
          const isMine = localPoll.myVoteOptionIndex === idx;
          return (
            <button
              key={opt.id ?? idx}
              type="button"
              disabled={!currentUserId || localPoll.isClosed || submittingIndex !== null}
              onClick={() => handleVote(idx)}
              className={`relative w-full min-h-[40px] text-left rounded-lg border px-3 py-2 overflow-hidden transition-colors cursor-pointer disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isMine
                  ? 'border-blue-500 dark:border-blue-500 bg-white dark:bg-slate-900'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-blue-300 dark:hover:border-blue-700'
              }`}
            >
              {showResults && (
                <div
                  className={`absolute inset-y-0 left-0 transition-opacity duration-200 ${
                    isMine
                      ? 'bg-blue-500/15 dark:bg-blue-500/25'
                      : 'bg-slate-200/70 dark:bg-slate-700/50'
                  }`}
                  style={{ width: `${pct}%` }}
                  aria-hidden="true"
                />
              )}
              <div className="relative flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-100 min-w-0">
                  {isMine && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
                  <span className="truncate">{opt.label}</span>
                </span>
                {showResults && (
                  <span className="font-mono tabular-nums font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                    {pct}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <span>
          {localPoll.isClosed
            ? 'Poll closed'
            : hasVoted
            ? 'Vote recorded · Click another option to change'
            : currentUserId
            ? 'Select an option to vote'
            : 'Sign in to vote'}
        </span>
      </div>
    </div>
  );
};
