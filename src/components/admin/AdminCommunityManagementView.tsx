import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  GraduationCap,
  BadgeCheck,
  SlidersHorizontal,
  Flag,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  UserPlus,
  Search,
  Save,
  RotateCcw,
  Eye,
  Check,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { AdminVisualModeId } from './adminVisualModes';
import {
  DEFAULT_FEED_RANKING_WEIGHTS,
  type FeedRankingWeights,
} from '../../services/feedRankingService';
import type { ContentReportRecord } from '../../services/communitySafetyService';
import {
  formatNotificationRelativeTime,
  type ReportStatus,
} from '../../services/communitySafetyUtils';
import {
  getAdminCommunityPermissions,
  getReportStatusMeta,
  RANKING_WEIGHT_FIELDS,
  clampRankingWeight,
  type AdminGovernanceRole,
} from '../../services/adminCommunityUtils';
import {
  fetchAdminCommunityOverview,
  fetchAdminModerationQueue,
  updateAdminModerationReport,
  searchAdminAlumniCandidates,
  assignBatchModerator,
  removeBatchModerator,
  assignOfficialPageRole,
  removeOfficialPageRole,
  updateOfficialPageSettings,
  saveAdminFeedRankingWeights,
  toggleAdminFeatureFlag,
  type AdminAlumniCandidate,
  type AdminCommunityOverviewPayload,
  type AdminFeatureFlagRecord,
  type AdminOfficialPageSummary,
  type BatchModeratorAssignment,
} from '../../services/adminCommunityService';

type CommunityAdminSubTab = 'moderation' | 'batches' | 'pages' | 'ranking' | 'flags';

interface AdminCommunityManagementViewProps {
  verifiedRole: AdminGovernanceRole;
  visualMode: AdminVisualModeId;
  externalSearch?: string;
  onViewProfile?: (userId: number) => void;
}

const ALL_BATCH_NUMBERS = Array.from({ length: 35 }, (_, idx) => idx + 1);

export const AdminCommunityManagementView: React.FC<AdminCommunityManagementViewProps> = ({
  verifiedRole,
  visualMode,
  externalSearch = '',
  onViewProfile,
}) => {
  const { getAuthHeaders } = useAuth();
  const isNeon = visualMode === 'neon_aura';
  const perms = getAdminCommunityPermissions(verifiedRole);

  const [subTab, setSubTab] = useState<CommunityAdminSubTab>('moderation');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusToast, setStatusToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(
    null
  );

  // Overview state
  const [overview, setOverview] = useState<AdminCommunityOverviewPayload | null>(null);
  const [reports, setReports] = useState<ContentReportRecord[]>([]);
  const [reportFilter, setReportFilter] = useState<'all' | ReportStatus>('open');
  const [reportActionId, setReportActionId] = useState<number | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState<Record<number, string>>({});

  // Batch moderators state
  const [selectedBatch, setSelectedBatch] = useState<number>(1);
  const [batchRole, setBatchRole] = useState<'moderator' | 'coordinator'>('moderator');
  const [batchSearchQuery, setBatchSearchQuery] = useState('');
  const [batchSearchResults, setBatchSearchResults] = useState<AdminAlumniCandidate[]>([]);
  const [batchAssignBusy, setBatchAssignBusy] = useState(false);

  // Official page role state
  const [selectedPageId, setSelectedPageId] = useState<number>(1);
  const [pageRoleType, setPageRoleType] = useState<'admin' | 'editor'>('editor');
  const [pageSearchQuery, setPageSearchQuery] = useState('');
  const [pageSearchResults, setPageSearchResults] = useState<AdminAlumniCandidate[]>([]);
  const [pageActionBusy, setPageActionBusy] = useState(false);

  // Feed ranking weights editor state
  const [weightsDraft, setWeightsDraft] = useState<FeedRankingWeights>(DEFAULT_FEED_RANKING_WEIGHTS);
  const [savingWeights, setSavingWeights] = useState(false);

  // Feature flags busy key
  const [togglingFlagKey, setTogglingFlagKey] = useState<string | null>(null);

  const showNotice = useCallback((kind: 'success' | 'error', text: string) => {
    setStatusToast({ kind, text });
    window.setTimeout(() => {
      setStatusToast((curr) => (curr?.text === text ? null : curr));
    }, 4500);
  }, []);

  // Keep moderators strictly locked to permitted sub-tabs
  useEffect(() => {
    if (!perms.canManageBatchModerators && subTab !== 'moderation') {
      setSubTab('moderation');
    }
  }, [perms.canManageBatchModerators, subTab]);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [ov, repList] = await Promise.all([
        fetchAdminCommunityOverview(getAuthHeaders),
        fetchAdminModerationQueue(getAuthHeaders, reportFilter),
      ]);
      setOverview(ov);
      setReports(repList);
      if (ov.rankingWeights) {
        setWeightsDraft({ ...DEFAULT_FEED_RANKING_WEIGHTS, ...ov.rankingWeights });
      }
      if (ov.officialPages.length > 0 && !ov.officialPages.some((p) => p.id === selectedPageId)) {
        setSelectedPageId(ov.officialPages[0].id);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to load Quad community management data.');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, reportFilter, selectedPageId]);

  useEffect(() => {
    void loadAllData();
  }, [loadAllData]);

  // Alumni search for Batch Moderators
  useEffect(() => {
    if (!perms.canManageBatchModerators || batchSearchQuery.trim().length < 2) {
      setBatchSearchResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchAdminAlumniCandidates(getAuthHeaders, batchSearchQuery).then(setBatchSearchResults);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [batchSearchQuery, getAuthHeaders, perms.canManageBatchModerators]);

  // Alumni search for Official Page Roles
  useEffect(() => {
    if (!perms.canManageOfficialPages || pageSearchQuery.trim().length < 2) {
      setPageSearchResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchAdminAlumniCandidates(getAuthHeaders, pageSearchQuery).then(setPageSearchResults);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [pageSearchQuery, getAuthHeaders, perms.canManageOfficialPages]);

  const handleResolveReport = async (
    report: ContentReportRecord,
    status: Exclude<ReportStatus, 'open'>,
    removeContent: boolean
  ) => {
    setReportActionId(report.id);
    const res = await updateAdminModerationReport(getAuthHeaders, {
      reportId: report.id,
      status,
      resolutionNote: resolutionNotes[report.id] || '',
      removeContent,
    });
    setReportActionId(null);
    if (!res.success) {
      showNotice('error', res.error || 'Could not update report status.');
      return;
    }
    showNotice(
      'success',
      status === 'resolved_removed'
        ? `Report #${report.id} resolved and flagged ${report.target_type} removed.`
        : status === 'resolved_dismissed'
        ? `Report #${report.id} dismissed.`
        : `Report #${report.id} moved to In Review.`
    );
    void loadAllData();
  };

  const handleAssignBatchMod = async (candidate: AdminAlumniCandidate) => {
    setBatchAssignBusy(true);
    const res = await assignBatchModerator(getAuthHeaders, {
      batchYear: selectedBatch,
      profileId: candidate.id,
      role: batchRole,
    });
    setBatchAssignBusy(false);
    if (!res.success) {
      showNotice('error', res.error || 'Failed to assign batch moderator.');
      return;
    }
    setBatchSearchQuery('');
    setBatchSearchResults([]);
    showNotice(
      'success',
      `Assigned ${candidate.full_name} as ${batchRole} for SZMC-${String(selectedBatch).padStart(2, '0')}.`
    );
    void loadAllData();
  };

  const handleRemoveBatchMod = async (assignment: BatchModeratorAssignment) => {
    const res = await removeBatchModerator(
      getAuthHeaders,
      assignment.batch_year,
      assignment.profile_id
    );
    if (!res.success) {
      showNotice('error', res.error || 'Failed to remove batch moderator.');
      return;
    }
    showNotice('success', `Removed moderator from SZMC-${String(assignment.batch_year).padStart(2, '0')}.`);
    void loadAllData();
  };

  const handleAssignPageRole = async (candidate: AdminAlumniCandidate) => {
    setPageActionBusy(true);
    const res = await assignOfficialPageRole(getAuthHeaders, {
      pageId: selectedPageId,
      profileId: candidate.id,
      role: pageRoleType,
    });
    setPageActionBusy(false);
    if (!res.success) {
      showNotice('error', res.error || 'Failed to assign page role.');
      return;
    }
    setPageSearchQuery('');
    setPageSearchResults([]);
    showNotice('success', `Assigned ${candidate.full_name} as page ${pageRoleType}.`);
    void loadAllData();
  };

  const handleRemovePageRole = async (pageId: number, profileId: number) => {
    const res = await removeOfficialPageRole(getAuthHeaders, pageId, profileId);
    if (!res.success) {
      showNotice('error', res.error || 'Failed to remove page role.');
      return;
    }
    showNotice('success', 'Official page role removed.');
    void loadAllData();
  };

  const handleTogglePageProp = async (
    page: AdminOfficialPageSummary,
    field: 'isVerified' | 'isActive'
  ) => {
    const patch =
      field === 'isVerified'
        ? { isVerified: !page.is_verified }
        : { isActive: !page.is_active };
    const res = await updateOfficialPageSettings(getAuthHeaders, page.id, patch);
    if (!res.success) {
      showNotice('error', res.error || 'Could not update page settings.');
      return;
    }
    showNotice('success', `Updated ${page.name} settings.`);
    void loadAllData();
  };

  const handleSaveRankingWeights = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingWeights(true);
    const res = await saveAdminFeedRankingWeights(getAuthHeaders, weightsDraft);
    setSavingWeights(false);
    if (!res.success) {
      showNotice('error', res.error || 'Could not save ranking weights.');
      return;
    }
    if (res.weights) setWeightsDraft(res.weights);
    showNotice('success', 'For You feed ranking weights saved and active across The Quad.');
  };

  const handleToggleFlag = async (flag: AdminFeatureFlagRecord) => {
    setTogglingFlagKey(flag.key);
    const res = await toggleAdminFeatureFlag(
      getAuthHeaders,
      flag.key,
      !flag.enabled,
      flag.description
    );
    setTogglingFlagKey(null);
    if (!res.success) {
      showNotice('error', res.error || `Could not update flag ${flag.key}.`);
      return;
    }
    showNotice(
      'success',
      `Feature flag "${flag.key}" ${!flag.enabled ? 'enabled' : 'disabled'}.`
    );
    void loadAllData();
  };

  // Visual theme tokens matching both Classic Clean & Neon Aura Mode 1
  const cardCls = isNeon
    ? 'bg-[#081229]/85 border border-cyan-400/20 text-slate-100 shadow-[0_0_24px_-12px_rgba(34,211,238,0.28)]'
    : 'bg-white border border-slate-200/80 text-slate-900 shadow-xs';
  const subCardCls = isNeon
    ? 'bg-slate-950/60 border border-white/10 text-slate-100'
    : 'bg-slate-50/80 border border-slate-200/80 text-slate-900';
  const mutedTextCls = isNeon ? 'text-slate-400' : 'text-slate-500';
  const inputCls = isNeon
    ? 'bg-slate-950/80 border border-cyan-400/25 text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none'
    : 'bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-[#038fde] focus:outline-none';

  const allSubTabs: Array<{
    id: CommunityAdminSubTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    visible: boolean;
    count?: number;
  }> = [
    {
      id: 'moderation',
      label: 'Moderation Queue',
      icon: ShieldAlert,
      visible: perms.canModerateReports,
      count: overview?.metrics.openReportsCount,
    },
    {
      id: 'batches',
      label: 'Batch Lounges',
      icon: GraduationCap,
      visible: perms.canManageBatchModerators,
      count: overview?.metrics.batchModeratorsCount,
    },
    {
      id: 'pages',
      label: 'Official Pages',
      icon: BadgeCheck,
      visible: perms.canManageOfficialPages,
      count: overview?.metrics.officialPagesCount,
    },
    {
      id: 'ranking',
      label: 'Feed Ranking',
      icon: SlidersHorizontal,
      visible: perms.canEditRankingWeights,
    },
    {
      id: 'flags',
      label: 'Feature Flags',
      icon: Flag,
      visible: perms.canToggleFeatureFlags,
      count: overview?.metrics.activeFlagsCount,
    },
  ];
  const subTabs = allSubTabs.filter((t) => t.visible);

  const normalizedSearch = externalSearch.trim().toLowerCase();
  const visibleReports = reports.filter((r) => {
    if (!normalizedSearch) return true;
    return (
      r.reason.toLowerCase().includes(normalizedSearch) ||
      String(r.details || '').toLowerCase().includes(normalizedSearch) ||
      String(r.reporter?.full_name || '').toLowerCase().includes(normalizedSearch) ||
      String(r.target_author?.full_name || '').toLowerCase().includes(normalizedSearch) ||
      r.target_type.toLowerCase().includes(normalizedSearch)
    );
  });

  const selectedPage =
    overview?.officialPages.find((p) => p.id === selectedPageId) || overview?.officialPages[0] || null;

  return (
    <div className="space-y-5">
      {/* Top Header & KPI Summary Strip */}
      <div className={`rounded-2xl p-5 space-y-4 ${cardCls}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">
              The Quad — Community Governance
            </h2>
            <p className={`text-xs mt-0.5 ${mutedTextCls}`}>
              {perms.canManageBatchModerators
                ? 'Manage content moderation, 35 MBBS Batch Lounges, 6 Official Pages, feed ranking weights, and rollout flags.'
                : 'Moderator workspace for reviewing flagged posts, comments, and alumni profile reports.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadAllData()}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 self-start sm:self-auto whitespace-nowrap ${
              isNeon
                ? 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/30'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Data</span>
          </button>
        </div>

        {/* 4 Tabular-Nums Governance Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className={`rounded-xl p-3.5 ${subCardCls}`}>
            <div className={`text-[11px] font-medium ${mutedTextCls}`}>Open Reports</div>
            <div className="text-2xl font-black tabular-nums mt-1">
              {overview?.metrics.openReportsCount ?? 0}
            </div>
            <div className={`text-[11px] mt-0.5 ${mutedTextCls}`}>
              {overview?.metrics.totalReportsCount ?? 0} total logged
            </div>
          </div>
          <div className={`rounded-xl p-3.5 ${subCardCls}`}>
            <div className={`text-[11px] font-medium ${mutedTextCls}`}>Batch Lounges</div>
            <div className="text-2xl font-black tabular-nums mt-1">
              {overview?.metrics.batchLoungesCount ?? 35}
            </div>
            <div className={`text-[11px] mt-0.5 ${mutedTextCls}`}>
              {overview?.metrics.batchModeratorsCount ?? 0} assigned moderators
            </div>
          </div>
          <div className={`rounded-xl p-3.5 ${subCardCls}`}>
            <div className={`text-[11px] font-medium ${mutedTextCls}`}>Official Pages</div>
            <div className="text-2xl font-black tabular-nums mt-1">
              {overview?.metrics.officialPagesCount ?? 6}
            </div>
            <div className={`text-[11px] mt-0.5 ${mutedTextCls}`}>
              Verified institutional hubs
            </div>
          </div>
          <div className={`rounded-xl p-3.5 ${subCardCls}`}>
            <div className={`text-[11px] font-medium ${mutedTextCls}`}>Active Feature Flags</div>
            <div className="text-2xl font-black tabular-nums mt-1">
              {overview?.metrics.activeFlagsCount ?? 0}
              <span className={`text-sm font-semibold ${mutedTextCls}`}>
                /{overview?.metrics.totalFlagsCount ?? 0}
              </span>
            </div>
            <div className={`text-[11px] mt-0.5 ${mutedTextCls}`}>
              Live community controls
            </div>
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <div
          className={`flex items-center gap-1.5 pt-2 border-t overflow-x-auto ${
            isNeon ? 'border-white/10' : 'border-slate-100'
          }`}
        >
          {subTabs.map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  active
                    ? isNeon
                      ? 'bg-gradient-to-r from-cyan-500/30 to-violet-500/35 text-white border border-cyan-400/45'
                      : 'bg-[#003366] text-white'
                    : isNeon
                    ? 'text-slate-300 hover:text-white hover:bg-white/5'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span
                    className={`text-[11px] tabular-nums ${
                      active ? 'opacity-90' : mutedTextCls
                    }`}
                  >
                    ({tab.count})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Inline Status Feedback */}
      {statusToast && (
        <div
          className={`rounded-xl px-4 py-3 text-xs font-medium flex items-center justify-between gap-2 border ${
            statusToast.kind === 'success'
              ? isNeon
                ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-200'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : isNeon
              ? 'bg-rose-500/15 border-rose-400/35 text-rose-200'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusToast.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusToast.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusToast(null)}
            className="opacity-70 hover:opacity-100 cursor-pointer"
            aria-label="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div
          className={`rounded-xl px-4 py-3 text-xs font-medium border ${
            isNeon
              ? 'bg-rose-500/15 border-rose-400/35 text-rose-200'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {errorMsg}
        </div>
      )}

      {loading && !overview ? (
        <div className={`rounded-2xl p-10 text-center ${cardCls}`}>
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-cyan-500 mb-2" />
          <p className={`text-xs ${mutedTextCls}`}>Loading community governance data...</p>
        </div>
      ) : (
        <>
          {/* TAB 1: MODERATION QUEUE (Moderator, Admin, Super Admin) */}
          {subTab === 'moderation' && (
            <div className={`rounded-2xl p-5 space-y-4 ${cardCls}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold">Content Moderation Queue</h3>
                  <p className={`text-xs mt-0.5 ${mutedTextCls}`}>
                    Review flagged posts, comments, and alumni profiles submitted from The Quad.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(['open', 'in_review', 'resolved_removed', 'resolved_dismissed', 'all'] as const).map(
                    (st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setReportFilter(st)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                          reportFilter === st
                            ? isNeon
                              ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40'
                              : 'bg-[#003366] text-white'
                            : isNeon
                            ? 'bg-white/5 text-slate-300 hover:bg-white/10'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {st === 'all'
                          ? 'All'
                          : st === 'in_review'
                          ? 'In Review'
                          : st === 'resolved_removed'
                          ? 'Removed'
                          : st === 'resolved_dismissed'
                          ? 'Dismissed'
                          : 'Open'}
                      </button>
                    )
                  )}
                </div>
              </div>

              {visibleReports.length === 0 ? (
                <div className={`rounded-xl p-8 text-center ${subCardCls}`}>
                  <CheckCircle2 className="w-7 h-7 mx-auto text-emerald-500 mb-2" />
                  <p className="text-xs font-bold">Moderation queue is clear</p>
                  <p className={`text-[11px] mt-1 ${mutedTextCls}`}>
                    No {reportFilter === 'all' ? '' : reportFilter.replace('_', ' ')} reports match the current view.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleReports.map((rep) => {
                    const meta = getReportStatusMeta(rep.status);
                    const busy = reportActionId === rep.id;
                    const isClosed = rep.status.startsWith('resolved_');
                    return (
                      <div key={rep.id} className={`rounded-xl p-4 space-y-3 ${subCardCls}`}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold uppercase tracking-wide">
                                {rep.target_type} #{rep.target_id}
                              </span>
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                                  isNeon ? meta.neonTone : meta.classicTone
                                }`}
                              >
                                {meta.label}
                              </span>
                              <span className={`text-[11px] tabular-nums ${mutedTextCls}`}>
                                {formatNotificationRelativeTime(rep.created_at)}
                              </span>
                            </div>
                            <p className="text-xs font-semibold">{rep.reason}</p>
                            {rep.details && (
                              <p className={`text-xs leading-relaxed ${mutedTextCls}`}>
                                {rep.details}
                              </p>
                            )}
                            <div className={`flex flex-wrap items-center gap-3 text-[11px] ${mutedTextCls}`}>
                              <span>
                                Reporter:{' '}
                                <strong className={isNeon ? 'text-slate-200' : 'text-slate-800'}>
                                  {rep.reporter?.full_name || `User #${rep.reporter_id}`}
                                </strong>
                              </span>
                              {rep.target_author_id && (
                                <span className="inline-flex items-center gap-1">
                                  Author:{' '}
                                  <strong className={isNeon ? 'text-slate-200' : 'text-slate-800'}>
                                    {rep.target_author?.full_name || `User #${rep.target_author_id}`}
                                  </strong>
                                  {onViewProfile && (
                                    <button
                                      type="button"
                                      onClick={() => onViewProfile(Number(rep.target_author_id))}
                                      className="inline-flex items-center gap-0.5 text-cyan-500 hover:underline cursor-pointer ml-1"
                                    >
                                      <Eye className="w-3 h-3" />
                                      <span>View</span>
                                    </button>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {!isClosed ? (
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-500/15">
                            <input
                              type="text"
                              value={resolutionNotes[rep.id] || ''}
                              onChange={(e) =>
                                setResolutionNotes((prev) => ({ ...prev, [rep.id]: e.target.value }))
                              }
                              placeholder="Optional moderator note..."
                              className={`flex-1 px-3 py-1.5 rounded-lg text-xs ${inputCls}`}
                            />
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {rep.status !== 'in_review' && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void handleResolveReport(rep, 'in_review', false)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                                    isNeon
                                      ? 'bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30'
                                      : 'bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-200'
                                  }`}
                                >
                                  In Review
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleResolveReport(rep, 'resolved_dismissed', false)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                                  isNeon
                                    ? 'bg-white/10 text-slate-200 hover:bg-white/15'
                                    : 'bg-slate-200/80 text-slate-800 hover:bg-slate-200'
                                }`}
                              >
                                Dismiss
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleResolveReport(rep, 'resolved_removed', true)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer whitespace-nowrap"
                              >
                                {busy ? 'Saving...' : 'Remove & Resolve'}
                              </button>
                            </div>
                          </div>
                        ) : rep.resolution_note ? (
                          <div className={`text-[11px] pt-1 border-t border-slate-500/15 ${mutedTextCls}`}>
                            Resolution note: {rep.resolution_note}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: BATCH LOUNGE MODERATORS (Admin & Super Admin) */}
          {subTab === 'batches' && perms.canManageBatchModerators && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Assign Moderator Panel */}
              <div className={`lg:col-span-5 rounded-2xl p-5 space-y-4 ${cardCls}`}>
                <div>
                  <h3 className="text-sm font-bold">Appoint Batch Lounge Moderator</h3>
                  <p className={`text-xs mt-0.5 ${mutedTextCls}`}>
                    Assign coordinators or community moderators for any MBBS batch (SZMC-01 to SZMC-35).
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-[11px] font-semibold mb-1 ${mutedTextCls}`}>
                      MBBS Batch
                    </label>
                    <select
                      value={selectedBatch}
                      onChange={(e) => setSelectedBatch(Number(e.target.value))}
                      className={`w-full px-3 py-2 rounded-xl text-xs font-medium ${inputCls}`}
                    >
                      {ALL_BATCH_NUMBERS.map((num) => (
                        <option key={num} value={num}>
                          SZMC-{String(num).padStart(2, '0')} ({1990 + num})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={`block text-[11px] font-semibold mb-1 ${mutedTextCls}`}>
                      Lounge Role
                    </label>
                    <select
                      value={batchRole}
                      onChange={(e) =>
                        setBatchRole(e.target.value as 'moderator' | 'coordinator')
                      }
                      className={`w-full px-3 py-2 rounded-xl text-xs font-medium ${inputCls}`}
                    >
                      <option value="moderator">Batch Moderator</option>
                      <option value="coordinator">Batch Coordinator</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className={`block text-[11px] font-semibold mb-1 ${mutedTextCls}`}>
                    Search Alumnus by Name or Email
                  </label>
                  <div className="relative">
                    <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${mutedTextCls}`} />
                    <input
                      type="text"
                      value={batchSearchQuery}
                      onChange={(e) => setBatchSearchQuery(e.target.value)}
                      placeholder="Type at least 2 characters..."
                      className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs ${inputCls}`}
                    />
                  </div>
                </div>

                {batchSearchResults.length > 0 && (
                  <div className={`rounded-xl divide-y overflow-hidden ${subCardCls}`}>
                    {batchSearchResults.map((cand) => (
                      <div
                        key={cand.id}
                        className="p-2.5 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{cand.full_name}</div>
                          <div className={`text-[11px] truncate ${mutedTextCls}`}>
                            {cand.batch_year ? `SZMC-${String(cand.batch_year).padStart(2, '0')} · ` : ''}
                            {cand.email || `ID #${cand.id}`}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={batchAssignBusy}
                          onClick={() => void handleAssignBatchMod(cand)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold cursor-pointer shrink-0 whitespace-nowrap"
                        >
                          <UserPlus className="w-3 h-3" />
                          <span>Assign</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Current Assignments Table */}
              <div className={`lg:col-span-7 rounded-2xl p-5 space-y-4 ${cardCls}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold">Assigned Batch Moderators</h3>
                    <p className={`text-xs mt-0.5 ${mutedTextCls}`}>
                      Active community stewards across all 35 SZMC MBBS Batch Lounges.
                    </p>
                  </div>
                  <span className={`text-xs font-semibold tabular-nums ${mutedTextCls}`}>
                    {overview?.batchModerators.length ?? 0} assigned
                  </span>
                </div>

                {!overview || overview.batchModerators.length === 0 ? (
                  <div className={`rounded-xl p-8 text-center ${subCardCls}`}>
                    <GraduationCap className={`w-6 h-6 mx-auto mb-2 ${mutedTextCls}`} />
                    <p className="text-xs font-semibold">No batch moderators assigned yet</p>
                    <p className={`text-[11px] mt-1 ${mutedTextCls}`}>
                      Search for an alumnus on the left to appoint a Batch Coordinator or Moderator.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {overview.batchModerators.map((m) => (
                      <div
                        key={`${m.batch_year}-${m.profile_id}`}
                        className={`rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 ${subCardCls}`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-blue-500">
                              SZMC-{String(m.batch_year).padStart(2, '0')}
                            </span>
                            <span className="text-xs font-bold truncate">
                              {m.profile?.full_name || `Alumnus #${m.profile_id}`}
                            </span>
                            <span className={`text-[11px] capitalize ${mutedTextCls}`}>
                              · {m.role}
                            </span>
                          </div>
                          {m.profile?.email && (
                            <div className={`text-[11px] truncate ${mutedTextCls}`}>
                              {m.profile.email}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRemoveBatchMod(m)}
                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/15 transition-colors cursor-pointer shrink-0"
                          title="Remove moderator"
                          aria-label="Remove moderator"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: OFFICIAL PAGES & PUBLISHING ROLES (Admin & Super Admin) */}
          {subTab === 'pages' && perms.canManageOfficialPages && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Page Directory */}
              <div className={`lg:col-span-5 rounded-2xl p-5 space-y-3 ${cardCls}`}>
                <div>
                  <h3 className="text-sm font-bold">Institutional Official Pages</h3>
                  <p className={`text-xs mt-0.5 ${mutedTextCls}`}>
                    Select a page to manage verification status and authorized publishers.
                  </p>
                </div>
                <div className="space-y-2">
                  {(overview?.officialPages || []).map((page) => {
                    const active = selectedPage?.id === page.id;
                    return (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => setSelectedPageId(page.id)}
                        className={`w-full text-left rounded-xl p-3 border transition-colors cursor-pointer ${
                          active
                            ? isNeon
                              ? 'bg-cyan-500/15 border-cyan-400/45'
                              : 'bg-blue-50 border-blue-400'
                            : subCardCls
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold truncate flex items-center gap-1.5">
                            <span>{page.name}</span>
                            {page.is_verified && (
                              <BadgeCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            )}
                          </span>
                          <span className={`text-[11px] tabular-nums shrink-0 ${mutedTextCls}`}>
                            {page.roles.length} roles
                          </span>
                        </div>
                        <div className={`text-[11px] mt-0.5 flex items-center gap-3 tabular-nums ${mutedTextCls}`}>
                          <span>{page.followers_count} followers</span>
                          <span>· {page.posts_count} posts</span>
                          <span>· {page.is_active ? 'Active' : 'Paused'}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected Page Authority & Roles */}
              <div className={`lg:col-span-7 rounded-2xl p-5 space-y-4 ${cardCls}`}>
                {selectedPage ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-500/15">
                      <div className="min-w-0">
                        <h3 className="text-base font-bold flex items-center gap-1.5">
                          <span>{selectedPage.name}</span>
                          {selectedPage.is_verified && (
                            <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" />
                          )}
                        </h3>
                        <p className={`text-xs mt-0.5 ${mutedTextCls}`}>
                          {selectedPage.description || selectedPage.tagline}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleTogglePageProp(selectedPage, 'isVerified')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer whitespace-nowrap ${
                            selectedPage.is_verified
                              ? 'bg-emerald-600/15 text-emerald-500 border-emerald-500/30'
                              : subCardCls
                          }`}
                        >
                          {selectedPage.is_verified ? 'Verified' : 'Unverified'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleTogglePageProp(selectedPage, 'isActive')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer whitespace-nowrap ${
                            selectedPage.is_active
                              ? 'bg-blue-600/15 text-blue-500 border-blue-500/30'
                              : 'bg-amber-600/15 text-amber-500 border-amber-500/30'
                          }`}
                        >
                          {selectedPage.is_active ? 'Active' : 'Paused'}
                        </button>
                      </div>
                    </div>

                    {/* Add Page Admin/Editor */}
                    <div className="space-y-2.5">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                          <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${mutedTextCls}`} />
                          <input
                            type="text"
                            value={pageSearchQuery}
                            onChange={(e) => setPageSearchQuery(e.target.value)}
                            placeholder="Search alumni to grant publishing rights..."
                            className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs ${inputCls}`}
                          />
                        </div>
                        <select
                          value={pageRoleType}
                          onChange={(e) => setPageRoleType(e.target.value as 'admin' | 'editor')}
                          className={`px-3 py-2 rounded-xl text-xs font-medium ${inputCls}`}
                        >
                          <option value="editor">Page Editor</option>
                          <option value="admin">Page Admin</option>
                        </select>
                      </div>

                      {pageSearchResults.length > 0 && (
                        <div className={`rounded-xl divide-y overflow-hidden ${subCardCls}`}>
                          {pageSearchResults.map((cand) => (
                            <div
                              key={cand.id}
                              className="p-2.5 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="font-semibold truncate">{cand.full_name}</div>
                                <div className={`text-[11px] truncate ${mutedTextCls}`}>
                                  {cand.email || `ID #${cand.id}`}
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={pageActionBusy}
                                onClick={() => void handleAssignPageRole(cand)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold cursor-pointer shrink-0 whitespace-nowrap"
                              >
                                <UserPlus className="w-3 h-3" />
                                <span>Grant {pageRoleType}</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Authorized Publishers List */}
                    <div className="space-y-2">
                      <div className="text-xs font-bold">
                        Authorized Page Admins &amp; Editors ({selectedPage.roles.length})
                      </div>
                      {selectedPage.roles.length === 0 ? (
                        <div className={`rounded-xl p-5 text-center text-xs ${subCardCls} ${mutedTextCls}`}>
                          Only global Portal Admins &amp; Super Admins can publish to this page until page editors are assigned.
                        </div>
                      ) : (
                        selectedPage.roles.map((r) => (
                          <div
                            key={`${r.page_id}-${r.profile_id}`}
                            className={`rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 ${subCardCls}`}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate">
                                {r.profile?.full_name || `Alumnus #${r.profile_id}`}
                                <span className={`font-semibold capitalize ml-1.5 ${mutedTextCls}`}>
                                  · {r.role}
                                </span>
                              </div>
                              {r.profile?.email && (
                                <div className={`text-[11px] truncate ${mutedTextCls}`}>
                                  {r.profile.email}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleRemovePageRole(r.page_id, r.profile_id)}
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/15 transition-colors cursor-pointer shrink-0"
                              title="Revoke page role"
                              aria-label="Revoke page role"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          )}

          {/* TAB 4: FEED RANKING WEIGHTS EDITOR (Admin & Super Admin) */}
          {subTab === 'ranking' && perms.canEditRankingWeights && (
            <form onSubmit={handleSaveRankingWeights} className={`rounded-2xl p-5 space-y-5 ${cardCls}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold">For You Feed Ranking Weights</h3>
                  <p className={`text-xs mt-0.5 ${mutedTextCls}`}>
                    Tune personalization weights across The Quad. Urgent Blood Requests and Official Announcements always retain priority placement independent of engagement scores.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setWeightsDraft({ ...DEFAULT_FEED_RANKING_WEIGHTS })}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      isNeon
                        ? 'bg-white/10 hover:bg-white/15 text-slate-200'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Defaults</span>
                  </button>
                  <button
                    type="submit"
                    disabled={savingWeights}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    {savingWeights ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>{savingWeights ? 'Saving...' : 'Save Weights'}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {RANKING_WEIGHT_FIELDS.map((field) => {
                  const val = weightsDraft[field.key];
                  return (
                    <div key={field.key} className={`rounded-xl p-3.5 space-y-2 ${subCardCls}`}>
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor={`weight-${field.key}`}
                          className="text-xs font-bold leading-snug"
                        >
                          {field.label}
                        </label>
                        <span className="text-xs font-mono font-bold tabular-nums text-blue-500">
                          {val}
                        </span>
                      </div>
                      <input
                        id={`weight-${field.key}`}
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        value={val}
                        onChange={(e) => {
                          const clamped = clampRankingWeight(
                            Number(e.target.value),
                            field.min,
                            field.max,
                            DEFAULT_FEED_RANKING_WEIGHTS[field.key]
                          );
                          setWeightsDraft((prev) => ({ ...prev, [field.key]: clamped }));
                        }}
                        className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono tabular-nums ${inputCls}`}
                      />
                      <p className={`text-[11px] leading-relaxed ${mutedTextCls}`}>{field.helper}</p>
                    </div>
                  );
                })}
              </div>
            </form>
          )}

          {/* TAB 5: COMMUNITY FEATURE FLAGS (Admin & Super Admin) */}
          {subTab === 'flags' && perms.canToggleFeatureFlags && (
            <div className={`rounded-2xl p-5 space-y-4 ${cardCls}`}>
              <div>
                <h3 className="text-sm font-bold">Quad Feature Flags</h3>
                <p className={`text-xs mt-0.5 ${mutedTextCls}`}>
                  Enable or pause community modules across the portal with zero downtime.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(overview?.featureFlags || []).map((flag) => {
                  const busy = togglingFlagKey === flag.key;
                  return (
                    <div
                      key={flag.key}
                      className={`rounded-xl p-4 flex items-center justify-between gap-3 ${subCardCls}`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold font-mono truncate">{flag.key}</div>
                        <p className={`text-[11px] mt-0.5 leading-relaxed ${mutedTextCls}`}>
                          {flag.description || 'Community capability rollout toggle'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleToggleFlag(flag)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
                          flag.enabled
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : isNeon
                            ? 'bg-white/10 hover:bg-white/15 text-slate-300'
                            : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                        }`}
                      >
                        {busy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : flag.enabled ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : null}
                        <span>{flag.enabled ? 'Enabled' : 'Disabled'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
