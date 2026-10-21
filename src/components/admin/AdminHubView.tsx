import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Users,
  FileCheck,
  Clock,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  ZoomIn,
  ArrowRight,
  Eye,
  BadgeCheck,
  X,
  Pin,
  PinOff,
  Trash2,
  RotateCcw,
  UserCog,
  History,
  Sliders,
  UserCheck,
  UserX,
  Plus,
  Lock,
} from 'lucide-react';
import {
  fetchAdminOverviewStats,
  fetchAdminDocSubmissions,
  reviewAdminDocSubmission,
  searchAlumniForAdmin,
  updateUserRole,
  fetchFeedPostsForModeration,
  togglePostPinnedStatus,
  togglePostDeletedStatus,
  hardDeletePost,
  fetchSystemAuditLogs,
} from './adminService';
import {
  AdminOverviewStats,
  AdminDocSubmission,
  AlumniAdminListItem,
  ModerationPostItem,
  SystemAuditLogItem,
  UserRole,
} from './adminTypes';
import {
  SmallAdminUser,
  getSmallAdminsList,
  appointSmallAdmin,
  toggleSmallAdminStatus,
  removeSmallAdmin,
} from '../../services/smallAdminService';

interface AdminHubViewProps {
  currentUser: {
    id: number;
    fullName: string;
    role: UserRole;
  };
  onNavigate?: (route: string) => void;
  onViewProfile?: (userId: number) => void;
}

type AdminTab = 'overview' | 'verifications' | 'users' | 'moderation' | 'audit' | 'small_admins';

export const AdminHubView: React.FC<AdminHubViewProps> = ({
  currentUser,
  onNavigate,
  onViewProfile,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [stats, setStats] = useState<AdminOverviewStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Verifications
  const [submissions, setSubmissions] = useState<AdminDocSubmission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [docFilter, setDocFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [submissionSearch, setSubmissionSearch] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<AdminDocSubmission | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [processingSubmissions, setProcessingSubmissions] = useState<Record<string, boolean>>({});

  // Users Management
  const [alumniList, setAlumniList] = useState<AlumniAdminListItem[]>([]);
  const [totalAlumniCount, setTotalAlumniCount] = useState(0);
  const [loadingAlumni, setLoadingAlumni] = useState(false);
  const [alumniSearchQuery, setAlumniSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'moderator' | 'member'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'unverified'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [roleModalUser, setRoleModalUser] = useState<AlumniAdminListItem | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<UserRole>('member');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  // Content Moderation
  const [posts, setPosts] = useState<ModerationPostItem[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [postSearchQuery, setPostSearchQuery] = useState('');
  const [postFilter, setPostFilter] = useState<'all' | 'pinned' | 'deleted' | 'active'>('all');

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<SystemAuditLogItem[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditCategoryFilter, setAuditCategoryFilter] = useState('all');
  const [selectedLogPayload, setSelectedLogPayload] = useState<SystemAuditLogItem | null>(null);

  // Small Admins / Delegated Sub-Admins
  const [smallAdmins, setSmallAdmins] = useState<SmallAdminUser[]>([]);
  const [showAddSmallAdminModal, setShowAddSmallAdminModal] = useState(false);
  const [newAdminForm, setNewAdminForm] = useState({
    fullName: '',
    email: '',
    notes: '',
    canVerifyAlumni: true,
    canDeletePosts: false,
    canViewDirectory: true,
  });

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Load Overview Data
  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const data = await fetchAdminOverviewStats();
      setStats(data);
    } finally {
      setLoadingStats(false);
    }
  };

  // Load Submissions
  const loadSubmissions = async (filter = docFilter) => {
    setLoadingSubmissions(true);
    try {
      const data = await fetchAdminDocSubmissions(filter);
      setSubmissions(data);
    } finally {
      setLoadingSubmissions(false);
    }
  };

  // Load Alumni Directory
  const loadAlumni = async (query = alumniSearchQuery, rFilter = roleFilter, sFilter = statusFilter, page = currentPage) => {
    setLoadingAlumni(true);
    try {
      const result = await searchAlumniForAdmin({
        query,
        roleFilter: rFilter,
        statusFilter: sFilter,
        page,
        limit: 20,
      });
      setAlumniList(result.alumni);
      setTotalAlumniCount(result.totalCount);
    } finally {
      setLoadingAlumni(false);
    }
  };

  // Load Posts
  const loadModerationPosts = async (query = postSearchQuery, filter = postFilter) => {
    setLoadingPosts(true);
    try {
      const p = await fetchFeedPostsForModeration({ query, filter, limit: 50 });
      setPosts(p);
    } finally {
      setLoadingPosts(false);
    }
  };

  // Load Audit Logs
  const loadAuditLogs = async (category = auditCategoryFilter) => {
    setLoadingAudit(true);
    try {
      const res = await fetchSystemAuditLogs({ categoryFilter: category, limit: 50 });
      setAuditLogs(res.logs);
    } finally {
      setLoadingAudit(false);
    }
  };

  // Load Small Admins
  const loadSmallAdmins = () => {
    setSmallAdmins(getSmallAdminsList());
  };

  useEffect(() => {
    loadStats();
    loadSubmissions('pending');
    loadSmallAdmins();
  }, []);

  useEffect(() => {
    if (activeTab === 'verifications') loadSubmissions();
    if (activeTab === 'users') loadAlumni();
    if (activeTab === 'moderation') loadModerationPosts();
    if (activeTab === 'audit') loadAuditLogs();
    if (activeTab === 'small_admins') loadSmallAdmins();
  }, [activeTab]);

  // Handle Review
  const handleReviewSubmission = async (submission: AdminDocSubmission, action: 'approved' | 'rejected') => {
    const id = submission.id;
    const note = adminNotes[id] || '';
    setProcessingSubmissions((prev) => ({ ...prev, [id]: true }));

    try {
      const res = await reviewAdminDocSubmission({
        submissionId: id,
        status: action,
        adminNote: note,
        reviewerProfileId: currentUser.id,
      });

      if (!res.success) {
        showToast(res.error || 'Review failed', 'error');
        return;
      }

      showToast(
        action === 'approved'
          ? `Alumnus ${submission.fullName} verified successfully!`
          : `Submission marked as rejected.`,
        'success'
      );

      // Remove from current list view
      setSubmissions((prev) => prev.filter((s) => s.id !== id));
      loadStats();
    } catch {
      showToast('An unexpected error occurred.', 'error');
    } finally {
      setProcessingSubmissions((prev) => ({ ...prev, [id]: false }));
    }
  };

  // Handle Role Change
  const handleConfirmRoleChange = async () => {
    if (!roleModalUser) return;
    setIsUpdatingRole(true);
    try {
      const res = await updateUserRole({
        targetUserId: roleModalUser.userId,
        newRole: selectedNewRole,
      });

      if (!res.success) {
        showToast(res.error || 'Failed to update user role', 'error');
        return;
      }

      showToast(`User role updated to ${selectedNewRole}!`, 'success');
      setAlumniList((prev) =>
        prev.map((item) => (item.userId === roleModalUser.userId ? { ...item, role: selectedNewRole } : item))
      );
      setRoleModalUser(null);
      loadStats();
    } finally {
      setIsUpdatingRole(false);
    }
  };

  // Appoint Small Admin
  const handleCreateSmallAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminForm.fullName || !newAdminForm.email) {
      showToast('Name and email are required.', 'error');
      return;
    }
    appointSmallAdmin({
      fullName: newAdminForm.fullName,
      email: newAdminForm.email,
      notes: newAdminForm.notes,
      role: 'moderator',
      appointedBy: currentUser.fullName || 'Super Admin',
      permissions: {
        canVerifyAlumni: newAdminForm.canVerifyAlumni,
        canDeletePosts: newAdminForm.canDeletePosts,
        canViewDirectory: newAdminForm.canViewDirectory,
      },
    });
    showToast(`${newAdminForm.fullName} appointed as Sub-Admin / Small Admin!`, 'success');
    setShowAddSmallAdminModal(false);
    setNewAdminForm({
      fullName: '',
      email: '',
      notes: '',
      canVerifyAlumni: true,
      canDeletePosts: false,
      canViewDirectory: true,
    });
    loadSmallAdmins();
    loadStats();
  };

  // Filter Submissions
  const filteredSubmissions = useMemo(() => {
    const q = submissionSearch.toLowerCase().trim();
    if (!q) return submissions;
    return submissions.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        String(s.batchYear).includes(q) ||
        s.collegeRoll.toLowerCase().includes(q)
    );
  }, [submissions, submissionSearch]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-3 sm:p-6 lg:p-8">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-xs sm:text-sm font-semibold border transition-all animate-in fade-in slide-in-from-top-4 duration-200 ${
            toast.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700'
              : toast.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/90 text-rose-800 dark:text-rose-200 border-rose-300 dark:border-rose-700'
              : 'bg-indigo-50 dark:bg-indigo-950/90 text-indigo-800 dark:text-indigo-200 border-indigo-300 dark:border-indigo-700'
          }`}
        >
          {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
          {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />}
          {toast.type === 'info' && <Shield className="w-5 h-5 text-indigo-600 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="max-w-7xl mx-auto mb-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
            <span className="p-2 bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <ShieldCheck className="w-6 h-6" />
            </span>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Central Administration Hub
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700 uppercase">
              {currentUser.role || 'admin'}
            </span>
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">
              • Shaheed Ziaur Rahman Medical College
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Multi-Tier RBAC, document verification queue, user role delegation, feed moderation, and audit surveillance.
          </p>
        </div>

        {/* Global Tab Switcher */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 w-full xl:w-auto">
          {[
            { id: 'overview', label: 'Overview', icon: Sliders },
            { id: 'verifications', label: 'ID Reviews', icon: FileCheck, badge: stats?.pendingDocReviews },
            { id: 'users', label: 'Directory & Roles', icon: Users },
            { id: 'moderation', label: 'Post Moderation', icon: ShieldAlert },
            { id: 'audit', label: 'Audit Trail', icon: History },
            { id: 'small_admins', label: 'Sub-Admins', icon: UserCog, badge: smallAdmins.length },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as AdminTab)}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 text-[10px] font-black rounded-full bg-rose-500 text-white">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">
        {/* ================================================================= */}
        {/* TAB 1: OVERVIEW METRICS */}
        {/* ================================================================= */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Registered Alumni', value: stats?.totalUsers ?? 0, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                { label: 'Verified SZMC Alumni', value: stats?.verifiedUsers ?? 0, icon: ShieldCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                { label: 'Pending ID Reviews', value: stats?.pendingDocReviews ?? 0, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10', highlight: true },
                { label: 'Active Feed Posts', value: stats?.totalPosts ?? 0, icon: ShieldAlert, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
              ].map((card, i) => {
                const Icon = card.icon;
                return (
                  <div
                    key={i}
                    className={`bg-white dark:bg-slate-900 border ${
                      card.highlight && (stats?.pendingDocReviews ?? 0) > 0
                        ? 'border-amber-400 dark:border-amber-600 shadow-md ring-2 ring-amber-400/20'
                        : 'border-slate-200 dark:border-slate-800'
                    } rounded-2xl p-5 transition-all`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className={`p-2.5 rounded-xl ${card.bg} ${card.color}`}>
                        <Icon className="w-5 h-5" />
                      </span>
                      {card.highlight && (
                        <button
                          onClick={() => setActiveTab('verifications')}
                          className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          Review Now <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-3xl font-black text-slate-900 dark:text-white">
                      {loadingStats ? '...' : card.value}
                    </p>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
                      {card.label}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Quick Actions Panel */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
                Administrative Quick Actions
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => setActiveTab('verifications')}
                  className="flex items-start gap-3.5 p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left transition-all cursor-pointer group"
                >
                  <span className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 shrink-0 group-hover:scale-105 transition-transform">
                    <FileCheck className="w-5 h-5" />
                  </span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Review Pending IDs</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Validate student cards, BMDC credentials & HSC slips.</p>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('users')}
                  className="flex items-start gap-3.5 p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left transition-all cursor-pointer group"
                >
                  <span className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 shrink-0 group-hover:scale-105 transition-transform">
                    <UserCog className="w-5 h-5" />
                  </span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Elevate User Roles</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Appoint batch coordinators or platform moderators.</p>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('moderation')}
                  className="flex items-start gap-3.5 p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left transition-all cursor-pointer group"
                >
                  <span className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 shrink-0 group-hover:scale-105 transition-transform">
                    <Pin className="w-5 h-5" />
                  </span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Moderate Posts</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Pin official announcements or hide inappropriate content.</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Architecture Highlights & System Integrity */}
            <div className="bg-gradient-to-br from-indigo-50/50 to-blue-50/30 dark:from-indigo-950/20 dark:to-blue-950/10 border border-indigo-200/60 dark:border-indigo-800/40 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Platform Security & Architecture Guarantees
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-slate-600 dark:text-slate-300">
                <div className="p-3 bg-white/70 dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-slate-800">
                  <p className="font-bold text-slate-800 dark:text-slate-100 mb-1">Zero Self-Approval</p>
                  <p className="text-[11px] text-slate-500">Admins strictly blocked from approving their own ID credentials.</p>
                </div>
                <div className="p-3 bg-white/70 dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-slate-800">
                  <p className="font-bold text-slate-800 dark:text-slate-100 mb-1">Auto-Reconciliation</p>
                  <p className="text-[11px] text-slate-500">Approval instantly marks profile verified and reconciles pending queues.</p>
                </div>
                <div className="p-3 bg-white/70 dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-slate-800">
                  <p className="font-bold text-slate-800 dark:text-slate-100 mb-1">Signed Storage Tokens</p>
                  <p className="text-[11px] text-slate-500">Sensitive documents inspected using temporary 1-hour secure tokens.</p>
                </div>
                <div className="p-3 bg-white/70 dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-slate-800">
                  <p className="font-bold text-slate-800 dark:text-slate-100 mb-1">Append-Only Audit</p>
                  <p className="text-[11px] text-slate-500">Every moderation and role elevation is recorded immutably.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: VERIFICATION REVIEWS */}
        {/* ================================================================= */}
        {activeTab === 'verifications' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-indigo-500" />
                  Document Verification Submissions
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Inspect uploaded SZMC student badges, BMDC certificates, HSC registration slips, and graduation souvenirs.
                </p>
              </div>

              {/* Status Filter & Search */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search applicant or roll..."
                    value={submissionSearch}
                    onChange={(e) => setSubmissionSearch(e.target.value)}
                    className="pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  {(['pending', 'approved', 'rejected', 'all'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => {
                        setDocFilter(status);
                        loadSubmissions(status);
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                        docFilter === status
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => loadSubmissions()}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                  title="Refresh list"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {loadingSubmissions ? (
              <div className="py-16 text-center text-slate-400 text-sm">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                Loading identity submissions...
              </div>
            ) : filteredSubmissions.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-50" />
                <p className="font-semibold text-slate-700 dark:text-slate-300">Queue is clear!</p>
                <p className="text-xs mt-1">No submissions found matching this filter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSubmissions.map((sub) => {
                  const isProcessing = processingSubmissions[sub.id] || false;
                  return (
                    <div
                      key={sub.id}
                      className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                    >
                      <div>
                        {/* Header: User Info */}
                        <div className="flex items-center gap-3 mb-3">
                          <img
                            src={sub.avatarUrl}
                            alt=""
                            className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {sub.fullName}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              Batch {sub.batchYear} • Roll #{sub.collegeRoll || 'N/A'}
                            </p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 ${
                              sub.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : sub.status === 'rejected'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            {sub.status}
                          </span>
                        </div>

                        {/* Document Preview Thumbnail */}
                        <div
                          onClick={() => setSelectedSubmission(sub)}
                          className="relative h-40 bg-slate-200 dark:bg-slate-800 rounded-xl overflow-hidden cursor-pointer group mb-3 border border-slate-200 dark:border-slate-700"
                        >
                          {sub.documentUrl ? (
                            <img
                              src={sub.documentUrl}
                              alt="Verification document"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                              No document preview
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5">
                            <ZoomIn className="w-4 h-4" /> Click to Inspect Document
                          </div>
                        </div>

                        <div className="text-xs text-slate-500 space-y-1 mb-3">
                          <p><strong className="text-slate-700 dark:text-slate-300">Type:</strong> {sub.docTypeLabel}</p>
                          <p><strong className="text-slate-700 dark:text-slate-300">Stream:</strong> {sub.group}</p>
                        </div>

                        {/* Note Input for Reject / Feedback */}
                        {sub.status === 'pending' && (
                          <input
                            type="text"
                            placeholder="Optional admin note / reason..."
                            value={adminNotes[sub.id] || ''}
                            onChange={(e) =>
                              setAdminNotes((prev) => ({ ...prev, [sub.id]: e.target.value }))
                            }
                            className="w-full px-3 py-1.5 mb-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                          />
                        )}
                      </div>

                      {/* Action Buttons */}
                      {sub.status === 'pending' ? (
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                          <button
                            disabled={isProcessing}
                            onClick={() => handleReviewSubmission(sub, 'approved')}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            disabled={isProcessing}
                            onClick={() => handleReviewSubmission(sub, 'rejected')}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Decline
                          </button>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 text-center pt-2 border-t border-slate-200 dark:border-slate-800">
                          Reviewed {sub.reviewedAt ? new Date(sub.reviewedAt).toLocaleDateString() : ''}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: USER DIRECTORY & ROLE MANAGEMENT */}
        {/* ================================================================= */}
        {activeTab === 'users' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-500" />
                  Alumni Directory & Role Permissions
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Total {totalAlumniCount} registered alumni profiles.
                </p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Search name or batch year..."
                  value={alumniSearchQuery}
                  onChange={(e) => {
                    setAlumniSearchQuery(e.target.value);
                    loadAlumni(e.target.value, roleFilter, statusFilter, 1);
                  }}
                  className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                />

                <select
                  value={roleFilter}
                  onChange={(e: any) => {
                    setRoleFilter(e.target.value);
                    loadAlumni(alumniSearchQuery, e.target.value, statusFilter, 1);
                  }}
                  className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                >
                  <option value="all">All Roles</option>
                  <option value="admin">Admins</option>
                  <option value="moderator">Moderators</option>
                  <option value="member">Members</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e: any) => {
                    setStatusFilter(e.target.value);
                    loadAlumni(alumniSearchQuery, roleFilter, e.target.value, 1);
                  }}
                  className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                >
                  <option value="all">All Status</option>
                  <option value="verified">Verified Only</option>
                  <option value="unverified">Unverified Only</option>
                </select>

                <button
                  onClick={() => loadAlumni()}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                  title="Refresh"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Alumnus</th>
                    <th className="py-3 px-4">Batch & Roll</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {loadingAlumni ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                        Loading alumni database...
                      </td>
                    </tr>
                  ) : alumniList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        No alumni found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    alumniList.map((alumnus) => (
                      <tr key={alumnus.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 flex items-center gap-3">
                          <img
                            src={alumnus.avatarUrl}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                          />
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">{alumnus.fullName}</p>
                            <p className="text-[11px] text-slate-400">{alumnus.city || 'Bogura'} • {alumnus.profession || 'Doctor'}</p>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-bold">Batch {alumnus.batchYear}</span>
                          {alumnus.collegeRoll && (
                            <span className="text-slate-400 block text-[11px]">Roll: {alumnus.collegeRoll}</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              alumnus.verificationStatus === 'verified'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {alumnus.verificationStatus === 'verified' ? (
                              <BadgeCheck className="w-3 h-3 text-emerald-600" />
                            ) : null}
                            {alumnus.verificationStatus}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              alumnus.role === 'admin'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                : alumnus.role === 'moderator'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                : alumnus.role === 'batch_representative'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {alumnus.role}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right space-x-2">
                          {onViewProfile && (
                            <button
                              onClick={() => onViewProfile(alumnus.userId)}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 inline mr-1" /> Profile
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setRoleModalUser(alumnus);
                              setSelectedNewRole(alumnus.role);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/60 cursor-pointer"
                          >
                            Change Role
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: POST CONTENT MODERATION */}
        {/* ================================================================= */}
        {activeTab === 'moderation' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-indigo-500" />
                  Feed Posts Moderation
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pin official notices to the top, soft-delete spam, or permanently remove harmful content.
                </p>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Filter posts content..."
                  value={postSearchQuery}
                  onChange={(e) => {
                    setPostSearchQuery(e.target.value);
                    loadModerationPosts(e.target.value, postFilter);
                  }}
                  className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                />

                <select
                  value={postFilter}
                  onChange={(e: any) => {
                    setPostFilter(e.target.value);
                    loadModerationPosts(postSearchQuery, e.target.value);
                  }}
                  className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                >
                  <option value="all">All Posts</option>
                  <option value="active">Active Only</option>
                  <option value="pinned">Pinned Only</option>
                  <option value="deleted">Soft-Deleted Only</option>
                </select>
              </div>
            </div>

            {loadingPosts ? (
              <div className="py-12 text-center text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                Loading post queue...
              </div>
            ) : posts.length === 0 ? (
              <div className="py-12 text-center text-slate-400">No posts found matching criteria.</div>
            ) : (
              <div className="space-y-3">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    className={`p-4 rounded-xl border transition-all ${
                      post.isDeleted
                        ? 'border-rose-200 bg-rose-50/30 dark:border-rose-900/40 dark:bg-rose-950/20'
                        : post.isPinned
                        ? 'border-indigo-300 bg-indigo-50/30 dark:border-indigo-800 dark:bg-indigo-950/20'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={post.authorAvatar}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover shrink-0"
                        />
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">
                            {post.authorName} <span className="font-normal text-slate-400">Batch {post.authorBatch}</span>
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {new Date(post.createdAt).toLocaleString()} • {post.category}
                          </p>
                        </div>
                      </div>

                      {/* Status Badges */}
                      <div className="flex items-center gap-1.5">
                        {post.isPinned && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                            <Pin className="w-3 h-3" /> Pinned
                          </span>
                        )}
                        {post.isDeleted && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            Hidden / Deleted
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-slate-700 dark:text-slate-200 my-2.5 whitespace-pre-wrap">
                      {post.content}
                    </p>

                    {/* Action Bar */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                      {/* Pin Button */}
                      <button
                        onClick={async () => {
                          const res = await togglePostPinnedStatus(post.id, !post.isPinned);
                          if (res.success) {
                            setPosts((prev) =>
                              prev.map((p) => (p.id === post.id ? { ...p, isPinned: !p.isPinned } : p))
                            );
                            showToast(post.isPinned ? 'Post unpinned' : 'Post pinned to top!', 'success');
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer text-slate-700 dark:text-slate-200"
                      >
                        {post.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                        {post.isPinned ? 'Unpin' : 'Pin to Top'}
                      </button>

                      {/* Soft Delete / Restore */}
                      <button
                        onClick={async () => {
                          const res = await togglePostDeletedStatus(post.id, !post.isDeleted);
                          if (res.success) {
                            setPosts((prev) =>
                              prev.map((p) => (p.id === post.id ? { ...p, isDeleted: !p.isDeleted } : p))
                            );
                            showToast(post.isDeleted ? 'Post restored to feed' : 'Post hidden from feed', 'success');
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer text-slate-700 dark:text-slate-200"
                      >
                        {post.isDeleted ? <RotateCcw className="w-3.5 h-3.5 text-emerald-500" /> : <Trash2 className="w-3.5 h-3.5 text-amber-500" />}
                        {post.isDeleted ? 'Restore Post' : 'Soft Delete'}
                      </button>

                      {/* Hard Delete */}
                      <button
                        onClick={async () => {
                          if (confirm('Permanently delete this post from database? This cannot be undone.')) {
                            const res = await hardDeletePost(post.id);
                            if (res.success) {
                              setPosts((prev) => prev.filter((p) => p.id !== post.id));
                              showToast('Post permanently deleted', 'success');
                            }
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-900/40 flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Purge
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 5: SYSTEM AUDIT TRAIL */}
        {/* ================================================================= */}
        {activeTab === 'audit' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-500" />
                  System Security & Audit Trail
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Append-only immutable record of administrative actions, identity verification, and permissions changes.
                </p>
              </div>

              <button
                onClick={() => loadAuditLogs()}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {loadingAudit ? (
              <div className="py-12 text-center text-slate-400">Loading audit records...</div>
            ) : auditLogs.length === 0 ? (
              <div className="py-12 text-center text-slate-400">No audit logs recorded yet.</div>
            ) : (
              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    onClick={() => setSelectedLogPayload(log)}
                    className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/20 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-between text-xs transition-colors"
                  >
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-100">
                        {log.action} <span className="font-normal text-slate-400">on {log.entityTable}</span>
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Actor: <strong className="text-slate-700 dark:text-slate-300">{log.actorName}</strong> • {new Date(log.createdAt).toLocaleString()}
                        {log.reason && <span> — &quot;{log.reason}&quot;</span>}
                      </p>
                    </div>

                    <span className="text-[11px] font-mono text-indigo-500 hover:underline shrink-0">
                      Inspect Diff →
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 6: DELEGATED SUB-ADMINS & SMALL ADMINS */}
        {/* ================================================================= */}
        {activeTab === 'small_admins' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <UserCog className="w-5 h-5 text-indigo-500" />
                  Delegated Sub-Admins & Batch Coordinators
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Grant granular capabilities (ID review, post moderation, directory inspection) to batch coordinators without full super-admin access.
                </p>
              </div>

              <button
                onClick={() => setShowAddSmallAdminModal(true)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all cursor-pointer shrink-0 shadow-sm"
              >
                <Plus className="w-4 h-4" /> Appoint Sub-Admin
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {smallAdmins.map((admin) => (
                <div
                  key={admin.id}
                  className={`p-4 rounded-xl border transition-all ${
                    admin.isActive
                      ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                      : 'border-slate-200/50 dark:border-slate-800/40 bg-slate-50/50 dark:bg-slate-900/30 opacity-70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={admin.avatarUrl || 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80'}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                      />
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">{admin.fullName}</h4>
                        <p className="text-xs text-slate-400">{admin.email}</p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        admin.isActive
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {admin.isActive ? 'Active' : 'Suspended'}
                    </span>
                  </div>

                  {admin.notes && (
                    <p className="text-xs text-slate-500 italic mb-3">
                      &quot;{admin.notes}&quot;
                    </p>
                  )}

                  <div className="space-y-1 mb-4">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Assigned Capabilities</p>
                    <div className="flex flex-wrap gap-1.5">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                        admin.permissions.canVerifyAlumni
                          ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
                          : 'bg-slate-100 text-slate-400 border-slate-200 line-through dark:bg-slate-800 dark:border-slate-700'
                      }`}>
                        ID Verification
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                        admin.permissions.canDeletePosts
                          ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                          : 'bg-slate-100 text-slate-400 border-slate-200 line-through dark:bg-slate-800 dark:border-slate-700'
                      }`}>
                        Delete Posts
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                        admin.permissions.canViewDirectory
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                          : 'bg-slate-100 text-slate-400 border-slate-200 line-through dark:bg-slate-800 dark:border-slate-700'
                      }`}>
                        Alumni Directory
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <span className="text-[10px] text-slate-400">
                      Appointed by {admin.appointedBy}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          toggleSmallAdminStatus(admin.id);
                          loadSmallAdmins();
                          showToast(`Status updated for ${admin.fullName}`, 'info');
                        }}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold cursor-pointer"
                      >
                        {admin.isActive ? 'Suspend' : 'Activate'}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${admin.fullName} from Sub-Admin list?`)) {
                            removeSmallAdmin(admin.id);
                            loadSmallAdmins();
                            showToast('Sub-admin removed', 'info');
                          }
                        }}
                        className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        title="Remove Sub-Admin"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* MODAL 1: DOCUMENT ZOOM PREVIEW */}
      {/* ================================================================= */}
      {selectedSubmission && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-5 sm:p-6 relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setSelectedSubmission(null)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
              Verification Document — {selectedSubmission.fullName}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Batch {selectedSubmission.batchYear} • Roll #{selectedSubmission.collegeRoll || 'N/A'} • {selectedSubmission.docTypeLabel}
            </p>

            <div className="flex-1 bg-black rounded-xl overflow-hidden flex items-center justify-center min-h-[350px]">
              {selectedSubmission.documentUrl ? (
                <img
                  src={selectedSubmission.documentUrl}
                  alt="Full verification doc"
                  className="max-h-[60vh] max-w-full object-contain"
                />
              ) : (
                <p className="text-slate-500 text-xs">No image URL found.</p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between">
              {selectedSubmission.documentUrl && (
                <a
                  href={selectedSubmission.documentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-indigo-500 dark:text-indigo-400 hover:underline flex items-center gap-1"
                >
                  Open Full Resolution <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <button
                onClick={() => setSelectedSubmission(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl cursor-pointer ml-auto"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 2: USER ROLE ELEVATION */}
      {/* ================================================================= */}
      {roleModalUser && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
              Change User Role
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Updating role permissions for <strong className="text-slate-800 dark:text-slate-200">{roleModalUser.fullName}</strong>.
            </p>

            <div className="space-y-2 mb-6">
              {[
                { role: 'member', label: 'Member', desc: 'Standard verified/unverified alumnus access.' },
                { role: 'batch_representative', label: 'Batch Representative', desc: 'Can verify peer batch mates and represent batch.' },
                { role: 'moderator', label: 'Moderator / Small Admin', desc: 'Can review IDs and moderate feed posts.' },
                { role: 'admin', label: 'Super Administrator', desc: 'Complete access to command center, audit, and site settings.' },
              ].map((item) => (
                <div
                  key={item.role}
                  onClick={() => setSelectedNewRole(item.role as UserRole)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedNewRole === item.role
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-500'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{item.label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                disabled={isUpdatingRole}
                onClick={() => setRoleModalUser(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={isUpdatingRole}
                onClick={handleConfirmRoleChange}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
              >
                {isUpdatingRole ? 'Saving...' : 'Apply Role Change'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 3: AUDIT DIFF VIEWER */}
      {/* ================================================================= */}
      {selectedLogPayload && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
              Audit Event Payload: {selectedLogPayload.action}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Table: <span className="font-mono text-indigo-400">{selectedLogPayload.entityTable}</span> • ID: <span className="font-mono text-indigo-400">{selectedLogPayload.entityId}</span>
            </p>

            <pre className="p-4 bg-slate-950 text-emerald-400 rounded-xl text-[11px] font-mono overflow-auto max-h-60 border border-slate-800 mb-4">
              {JSON.stringify(
                {
                  oldValues: selectedLogPayload.oldValues,
                  newValues: selectedLogPayload.newValues,
                  reason: selectedLogPayload.reason,
                },
                null,
                2
              )}
            </pre>

            <div className="text-right">
              <button
                onClick={() => setSelectedLogPayload(null)}
                className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 4: APPOINT SUB-ADMIN */}
      {/* ================================================================= */}
      {showAddSmallAdminModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
              Appoint New Sub-Admin / Small Admin
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Select permissions to delegate to this alumnus or batch coordinator.
            </p>

            <form onSubmit={handleCreateSmallAdmin} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Full Name & Batch
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Rayhan Kabir (Batch 27)"
                  value={newAdminForm.fullName}
                  onChange={(e) => setNewAdminForm({ ...newAdminForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Official Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. rayhan.szmc27@gmail.com"
                  value={newAdminForm.email}
                  onChange={(e) => setNewAdminForm({ ...newAdminForm, email: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Role Notes / Area of Responsibility
                </label>
                <input
                  type="text"
                  placeholder="e.g. Batch 27 Lead, Reviewing ID cards"
                  value={newAdminForm.notes}
                  onChange={(e) => setNewAdminForm({ ...newAdminForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Delegated Permissions</p>
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAdminForm.canVerifyAlumni}
                    onChange={(e) => setNewAdminForm({ ...newAdminForm, canVerifyAlumni: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                  <span>Can verify alumni and review ID documents</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAdminForm.canDeletePosts}
                    onChange={(e) => setNewAdminForm({ ...newAdminForm, canDeletePosts: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                  <span>Can hide / delete reported posts</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAdminForm.canViewDirectory}
                    onChange={(e) => setNewAdminForm({ ...newAdminForm, canViewDirectory: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                  <span>Can inspect confidential directory contacts</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddSmallAdminModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                >
                  Appoint
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
