import React, { useState, useEffect } from 'react';
import { Flag, X, ShieldBan, CheckCircle2, Loader2, UserX } from 'lucide-react';
import { REPORT_REASONS, type ReportTargetType } from '../../services/communitySafetyUtils';
import {
  submitContentReport,
  fetchBlockedUsersList,
  unblockUser,
  type BlockedUserEntry,
} from '../../services/communitySafetyService';

interface ReportContentModalProps {
  isOpen: boolean;
  reporterId?: number;
  targetType: ReportTargetType;
  targetId: number;
  targetAuthorId?: number | null;
  targetLabel?: string;
  onClose: () => void;
  onSubmitted?: (message: string) => void;
}

export const ReportContentModal: React.FC<ReportContentModalProps> = ({
  isOpen,
  reporterId,
  targetType,
  targetId,
  targetAuthorId,
  targetLabel,
  onClose,
  onSubmitted,
}) => {
  const [selectedReason, setSelectedReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedReason(REPORT_REASONS[0]);
      setDetails('');
      setErrorMsg(null);
      setSubmitting(false);
    }
  }, [isOpen, targetId, targetType]);

  if (!isOpen) return null;

  const titleByType: Record<ReportTargetType, string> = {
    post: 'Report Post',
    comment: 'Report Comment',
    profile: 'Report Alumni Profile',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reporterId) {
      setErrorMsg('Please sign in to submit a community safety report.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);

    const res = await submitContentReport({
      reporterId,
      targetType,
      targetId,
      targetAuthorId,
      reason: selectedReason,
      details,
    });

    setSubmitting(false);
    if (!res.success) {
      setErrorMsg(res.error || 'Could not submit report. Please try again.');
      return;
    }

    const feedback = res.duplicate
      ? 'You already submitted an open report for this item. Our moderators are reviewing it.'
      : 'Report submitted to the SZMC moderation team for review.';
    onSubmitted?.(feedback);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-content-modal-title"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <Flag className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <h3
              id="report-content-modal-title"
              className="font-bold text-base text-slate-900 dark:text-slate-100 truncate"
            >
              {titleByType[targetType]}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
            aria-label="Close report dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          {targetLabel
            ? `Help maintain professional medical standards on The Quad. Tell us why you are reporting ${targetLabel}.`
            : 'Help maintain professional medical standards and collegiate integrity across the SZMC Alumni Network.'}
        </p>

        <div className="space-y-1.5">
          {REPORT_REASONS.map((reason) => {
            const active = selectedReason === reason;
            return (
              <label
                key={reason}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${
                  active
                    ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-500 text-blue-900 dark:text-blue-200'
                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <input
                  type="radio"
                  name="quadReportReason"
                  checked={active}
                  onChange={() => setSelectedReason(reason)}
                  className="accent-blue-600 shrink-0"
                />
                <span>{reason}</span>
              </label>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="quad-report-details"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            Additional context (optional)
          </label>
          <textarea
            id="quad-report-details"
            rows={3}
            maxLength={1000}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Share any helpful details for the moderation team..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 resize-none"
          />
        </div>

        {errorMsg && (
          <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{errorMsg}</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{submitting ? 'Submitting...' : 'Submit Report'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

interface BlockedUsersPanelProps {
  currentUserId: number;
}

export const BlockedUsersPanel: React.FC<BlockedUsersPanelProps> = ({ currentUserId }) => {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState<number | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const loadList = async () => {
    setLoading(true);
    const list = await fetchBlockedUsersList(currentUserId);
    setBlockedUsers(list);
    setLoading(false);
  };

  useEffect(() => {
    void loadList();
    const handler = () => void loadList();
    window.addEventListener('szmc_blocks_updated', handler);
    return () => window.removeEventListener('szmc_blocks_updated', handler);
  }, [currentUserId]);

  const handleUnblock = async (entry: BlockedUserEntry) => {
    setUnblockingId(entry.blockedId);
    const res = await unblockUser(currentUserId, entry.blockedId);
    setUnblockingId(null);
    if (res.success) {
      setBlockedUsers((prev) => prev.filter((u) => u.blockedId !== entry.blockedId));
      setStatusNote(`Unblocked ${entry.fullName}. Their posts can appear in your feed again.`);
      setTimeout(() => setStatusNote(null), 4000);
    }
  };

  return (
    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <ShieldBan className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            <span>Blocked Accounts</span>
            <span className="text-xs font-semibold tabular-nums text-slate-400 dark:text-slate-500">
              ({blockedUsers.length})
            </span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Blocked accounts cannot appear in your Quad feed, comments, or notifications, and existing connections are removed automatically.
          </p>
        </div>
      </div>

      {statusNote && (
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/60 rounded-xl px-3.5 py-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusNote}</span>
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading blocked accounts...</span>
        </div>
      ) : blockedUsers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center">
          <UserX className="w-6 h-6 text-slate-400 mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            No blocked accounts
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            You can block any alumnus from their profile or from the options menu on any post.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
          {blockedUsers.map((entry) => (
            <div
              key={entry.blockedId}
              className="flex items-center justify-between gap-3 p-3.5 bg-white dark:bg-slate-900/60"
            >
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={entry.avatarUrl}
                  alt={entry.fullName}
                  className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                    {entry.fullName}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {entry.batchYear ? `SZMC-${String(entry.batchYear).padStart(2, '0')}` : 'SZMC Alumni'}
                    {entry.profession ? ` · ${entry.profession}` : ''}
                  </div>
                </div>
              </div>
              <button
                type="button"
                disabled={unblockingId === entry.blockedId}
                onClick={() => handleUnblock(entry)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                {unblockingId === entry.blockedId ? 'Unblocking...' : 'Unblock'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
