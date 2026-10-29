import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Unlock,
  Download,
  Upload,
  Palette,
  Image as ImageIcon,
  HeartHandshake,
  Phone,
  Mail,
  Award,
  BookOpen,
  Layers,
  Edit,
  Save,
  Globe,
  MessageSquare,
  AlertTriangle,
  FileText,
  Check,
  Music,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
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
  instantVerifyAlumnus,
  toggleAccountSuspension,
  adminUpdateAlumnusProfile,
  adminVerifyPhoneOwnership,
  exportAlumniData,
  fetchContactInquiries,
  updateContactInquiryStatus,
  fetchBloodRequestsForModeration,
  updateBloodRequestModeration,
  fetchGalleryAlbumsForAdmin,
  saveGalleryAlbums,
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
import {
  useSiteConfig,
  SiteConfig,
  SiteNotice,
  FeaturedAlumnus,
  BatchMetadata,
} from '../../services/siteConfigService';
import { useVerificationVisibility } from '../../hooks/useVerificationVisibility';
import { NDCLogo } from '../NDCLogo';
import { compressImageFileToDataUrl } from '../../utils/mediaStorage';
import { loadStoredAlumniProfiles } from '../../data/mockData';
import { AlumniProfile, isUserSuperAdmin, isUserGeneralAdmin, isUserSubAdmin } from '../../types';

interface AdminHubViewProps {
  currentUser: {
    id: number;
    fullName: string;
    role: UserRole;
    email?: string;
  };
  onNavigate?: (route: string) => void;
  onViewProfile?: (userId: number) => void;
}

export type AdminTab =
  | 'overview'
  | 'users'
  | 'small_admins'
  | 'verifications'
  | 'moderation'
  | 'customizer'
  | 'gallery'
  | 'blood'
  | 'batches_streams'
  | 'controls_audit'
  | 'audit';

export const AdminHubView: React.FC<AdminHubViewProps> = ({
  currentUser,
  onNavigate,
  onViewProfile,
}) => {
  const isSuperAdmin = isUserSuperAdmin(currentUser);
  const isGeneralAdmin = isUserGeneralAdmin(currentUser);
  const isSubAdmin = !isSuperAdmin && !isGeneralAdmin;

  const { config, updateConfig, resetConfig, exportJson, importJson } = useSiteConfig();
  // Server-backed flag (app_feature_flags) — controls the member verification UI for everyone.
  const {
    rawMemberPortalVisible,
    setMemberPortalVisible,
  } = useVerificationVisibility();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [stats, setStats] = useState<AdminOverviewStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3800);
  };

  // 1. Verifications & Document Inspection Queue
  const [submissions, setSubmissions] = useState<AdminDocSubmission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [docFilter, setDocFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [submissionSearch, setSubmissionSearch] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<AdminDocSubmission | null>(null);
  const [documentLightboxUrl, setDocumentLightboxUrl] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [processingSubmissions, setProcessingSubmissions] = useState<Record<string, boolean>>({});

  // 2. Users Management
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

  // User Profile Inspection / Edit Modal
  const [inspectingUser, setInspectingUser] = useState<AlumniAdminListItem | null>(null);
  const [editingProfile, setEditingProfile] = useState<AlumniAdminListItem | null>(null);
  const [profileEditForm, setProfileEditForm] = useState({
    fullName: '',
    batchYear: 25,
    collegeRoll: '',
    academicStream: 'Medicine',
    academicGroup: '',
    section: 'MBBS',
    profession: '',
    position: '',
    institution: '',
    city: '',
    country: 'Bangladesh',
    phone: '',
    email: '',
  });

  // 3. Small Admins / Delegated Sub-Admins
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

  // 4. Content Moderation
  const [posts, setPosts] = useState<ModerationPostItem[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [postSearchQuery, setPostSearchQuery] = useState('');
  const [postFilter, setPostFilter] = useState<'all' | 'pinned' | 'deleted' | 'active'>('all');

  // 5. Gallery Administration
  const [galleryAlbums, setGalleryAlbums] = useState<any[]>([]);
  const [showNewAlbumModal, setShowNewAlbumModal] = useState(false);
  const [newAlbumForm, setNewAlbumForm] = useState({
    title: '',
    description: '',
    category: 'Reunion',
    coverUrl: '',
    batchYear: 25,
  });

  // 6. Blood Requests Moderation
  const [bloodRequests, setBloodRequests] = useState<any[]>([]);
  const [loadingBlood, setLoadingBlood] = useState(false);

  // 7. Audit Logs & Inquiries
  const [auditLogs, setAuditLogs] = useState<SystemAuditLogItem[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditCategoryFilter, setAuditCategoryFilter] = useState('all');
  const [selectedLogPayload, setSelectedLogPayload] = useState<SystemAuditLogItem | null>(null);
  const [contactInquiries, setContactInquiries] = useState<any[]>([]);

  // 8. Customizer Active Subtab
  const [customizerSubtab, setCustomizerSubtab] = useState<
    'branding' | 'hero' | 'ticker' | 'notices' | 'reunion' | 'banking' | 'audio' | 'backup'
  >('branding');

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
  const loadSubmissions = async (status: 'pending' | 'approved' | 'rejected' | 'all' = docFilter) => {
    setLoadingSubmissions(true);
    try {
      const list = await fetchAdminDocSubmissions(status);
      setSubmissions(list);
    } finally {
      setLoadingSubmissions(false);
    }
  };

  // Load Alumni
  const loadAlumni = async () => {
    setLoadingAlumni(true);
    try {
      const result = await searchAlumniForAdmin({
        query: alumniSearchQuery,
        roleFilter,
        statusFilter,
        page: currentPage,
        limit: 20,
      });
      setAlumniList(result.alumni);
      setTotalAlumniCount(result.totalCount);
    } finally {
      setLoadingAlumni(false);
    }
  };

  // Load Posts
  const loadModerationPosts = async () => {
    setLoadingPosts(true);
    try {
      const list = await fetchFeedPostsForModeration({
        query: postSearchQuery,
        filter: postFilter,
        limit: 50,
      });
      setPosts(list);
    } finally {
      setLoadingPosts(false);
    }
  };

  // Load Audit
  const loadAuditLogs = async () => {
    setLoadingAudit(true);
    try {
      const res = await fetchSystemAuditLogs({ categoryFilter: auditCategoryFilter, limit: 60 });
      setAuditLogs(res.logs);
    } finally {
      setLoadingAudit(false);
    }
  };

  // Load Small Admins
  const loadSmallAdmins = () => {
    setSmallAdmins(getSmallAdminsList());
  };

  // Load Gallery Albums
  const loadGallery = async () => {
    const albums = await fetchGalleryAlbumsForAdmin();
    setGalleryAlbums(albums);
  };

  // Load Blood
  const loadBlood = async () => {
    setLoadingBlood(true);
    try {
      const data = await fetchBloodRequestsForModeration();
      setBloodRequests(data);
    } finally {
      setLoadingBlood(false);
    }
  };

  // Load Inquiries
  const loadInquiries = async () => {
    const list = await fetchContactInquiries();
    setContactInquiries(list);
  };

  useEffect(() => {
    loadStats();
    loadSubmissions('pending');
    loadSmallAdmins();
    loadGallery();
    loadBlood();
    loadInquiries();
  }, []);

  // Guard: Auto-redirect sub-admin away from super-admin tabs
  useEffect(() => {
    if (isSubAdmin && ['controls_audit', 'small_admins', 'users', 'customizer'].includes(activeTab)) {
      setActiveTab('overview');
    }
    if (isGeneralAdmin && ['controls_audit', 'small_admins'].includes(activeTab)) {
      setActiveTab('overview');
    }
  }, [isSubAdmin, isGeneralAdmin, activeTab]);

  useEffect(() => {
    if (activeTab === 'verifications') loadSubmissions();
    if (activeTab === 'users' && (isSuperAdmin || isGeneralAdmin)) loadAlumni();
    if (activeTab === 'moderation') loadModerationPosts();
    if ((activeTab === 'audit' || activeTab === 'controls_audit') && isSuperAdmin) {
      loadAuditLogs();
      loadInquiries();
    }
    if (activeTab === 'small_admins' && isSuperAdmin) loadSmallAdmins();
    if (activeTab === 'gallery') loadGallery();
    if (activeTab === 'blood') loadBlood();
  }, [activeTab, isSuperAdmin, isGeneralAdmin]);

  // Handle Document Review
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
      setSubmissions((prev) => prev.filter((s) => s.id !== id));
      loadStats();
    } catch {
      showToast('An unexpected error occurred.', 'error');
    } finally {
      setProcessingSubmissions((prev) => ({ ...prev, [id]: false }));
    }
  };

  // 1-Click Instant Verification
  const handleInstantVerify = async (userId: number, name: string) => {
    const res = await instantVerifyAlumnus({
      targetUserId: userId,
      reviewerId: currentUser.id,
      reviewerName: currentUser.fullName,
    });
    if (res.success) {
      showToast(`Alumnus ${name} instantly verified!`, 'success');
      loadAlumni();
      loadStats();
    } else {
      showToast(res.error || 'Failed to verify', 'error');
    }
  };

  // Toggle Account Suspension
  const handleToggleSuspend = async (userId: number, currentStatus: string, name: string) => {
    const shouldSuspend = currentStatus !== 'suspended';
    const res = await toggleAccountSuspension({
      targetUserId: userId,
      suspend: shouldSuspend,
      reviewerId: currentUser.id,
      reason: shouldSuspend ? 'Administrative temporary suspension' : 'Reactivated by Super Admin',
    });
    if (res.success) {
      showToast(
        shouldSuspend ? `Account for ${name} suspended.` : `Account for ${name} reactivated.`,
        shouldSuspend ? 'info' : 'success'
      );
      loadAlumni();
      loadStats();
    } else {
      showToast(res.error || 'Failed to change account status', 'error');
    }
  };

  // Certify Phone Ownership
  const handleCertifyPhone = async (userId: number, name: string) => {
    const notes = prompt(`Enter administrative certification audit note for ${name}'s mobile number:`, 'Official batch coordinator verified');
    if (notes === null) return;
    const res = await adminVerifyPhoneOwnership({
      targetUserId: userId,
      notes: notes.trim(),
      reviewerId: currentUser.id,
    });
    if (res.success) {
      showToast(`Phone ownership certified for ${name}!`, 'success');
      loadAlumni();
    } else {
      showToast(res.error || 'Failed to certify phone', 'error');
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
    showToast(`${newAdminForm.fullName} appointed as Sub-Admin!`, 'success');
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

  // Handle Profile Edit Submit
  const handleSaveProfileEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;
    const res = await adminUpdateAlumnusProfile({
      targetUserId: editingProfile.userId,
      patch: profileEditForm,
      reviewerId: currentUser.id,
    });
    if (res.success) {
      showToast(`Profile for ${profileEditForm.fullName} updated!`, 'success');
      setEditingProfile(null);
      loadAlumni();
    } else {
      showToast(res.error || 'Failed to update profile', 'error');
    }
  };

  // Logo file upload handler
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 400, 0.9);
      updateConfig({ logoUrl: dataUrl });
      showToast('Site emblem logo updated across the whole website!', 'success');
    } catch {
      showToast('Failed to process image file.', 'error');
    }
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

      {/* Main Command Header Banner */}
      <div className="max-w-7xl mx-auto mb-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col xl:flex-row items-start xl:items-center justify-between gap-5 relative overflow-hidden">
        {/* Glow ambient accent */}
        <div className="absolute -top-16 -right-16 w-64 h-64 bg-indigo-500/10 dark:bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 min-w-0">
          <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
            <div className={`w-10 h-10 rounded-2xl ${isSuperAdmin ? 'bg-indigo-600 shadow-indigo-600/30' : 'bg-teal-600 shadow-teal-600/30'} text-white flex items-center justify-center shadow-md p-1.5`}>
              <NDCLogo className="w-full h-full object-contain brightness-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  {isSuperAdmin
                    ? 'Super Admin Command Center'
                    : isGeneralAdmin
                    ? 'SZMC Admin Management Portal'
                    : 'Sub-Admin Moderation Desk'}
                </h1>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                  isSuperAdmin
                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                    : isGeneralAdmin
                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
                    : 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30'
                }`}>
                  {isSuperAdmin ? 'SUPER ADMIN (ROOT)' : isGeneralAdmin ? 'ADMIN' : 'SUB-ADMIN DELEGATE'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Logged in as <strong className="text-slate-800 dark:text-slate-200">{currentUser.fullName}</strong> ({isSuperAdmin ? (currentUser.email || 'nurulanambashir20@gmail.com') : isGeneralAdmin ? (currentUser.email || 'firstaidnetworkbd@gmail.com') : 'Sub-Admin / Moderator'})
              </p>
            </div>
          </div>
        </div>

        {/* Global Verification Master Switch - Strictly visible ONLY to Super Admin */}
        {isSuperAdmin && (
          <div className="relative z-10 flex flex-wrap items-center gap-3">
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">
                Whole Site Auth Gate
              </span>
              <button
                type="button"
                onClick={() => {
                  const nextState = !config.globalVerificationEnabled;
                  updateConfig({ globalVerificationEnabled: nextState });
                  showToast(
                    nextState
                      ? 'Global Verification System is now ACTIVE across the website.'
                      : 'Global Verification System is now BYPASSED across the website.',
                    nextState ? 'info' : 'success'
                  );
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-black tracking-wide transition-all shadow-md cursor-pointer border ${
                  config.globalVerificationEnabled
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500/30 shadow-emerald-600/25'
                    : 'bg-amber-500 hover:bg-amber-600 text-slate-950 border-amber-400/40 shadow-amber-500/25'
                }`}
                title="Click to toggle the verification gate requirement for the whole website"
              >
                <span className={`w-2.5 h-2.5 rounded-full ${config.globalVerificationEnabled ? 'bg-white animate-pulse' : 'bg-slate-950'}`} />
                <span>Verification System: {config.globalVerificationEnabled ? 'ON (Enforced)' : 'OFF (Bypassed)'}</span>
              </button>
            </div>

            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">
                Member Verification UI
              </span>
              <button
                type="button"
                onClick={async () => {
                  const next = !rawMemberPortalVisible;
                  const res = await setMemberPortalVisible(next);
                  showToast(
                    res.success
                      ? (next
                          ? 'Member verification portal is now VISIBLE to all alumni.'
                          : 'Member verification portal is now HIDDEN — verification is admin-panel only.')
                      : (res.error || 'Could not save the verification switch.'),
                    res.success ? (next ? 'info' : 'success') : 'error'
                  );
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-black tracking-wide transition-all shadow-md cursor-pointer border ${
                  rawMemberPortalVisible
                    ? 'bg-slate-900 text-white border-slate-700'
                    : 'bg-sky-600 hover:bg-sky-700 text-white border-sky-500/30 shadow-sky-600/25'
                }`}
                title="Show or hide the entire member-facing verification system (saved to the database)"
              >
                <span className={`w-2.5 h-2.5 rounded-full ${rawMemberPortalVisible ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <span>Member Portal: {rawMemberPortalVisible ? 'VISIBLE' : 'HIDDEN'}</span>
              </button>
            </div>

            {/* Quick Refresh */}
            <button
              type="button"
              onClick={() => {
                loadStats();
                loadAlumni();
                loadSubmissions();
                showToast('Data refreshed.', 'info');
              }}
              className="p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              title="Refresh All Records"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Sub-Admin Quick Refresh */}
        {isSubAdmin && (
          <div className="relative z-10 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                loadStats();
                loadSubmissions();
                loadModerationPosts();
                showToast('Queue refreshed.', 'info');
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
              title="Refresh Queue"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Desk</span>
            </button>
          </div>
        )}
      </div>

      {/* Global Module Navigation Tabs - Filtered strictly by role */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none bg-slate-200/60 dark:bg-slate-900/60 p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800">
          {(isSubAdmin
            ? [
                { id: 'overview', label: 'Moderator Desk', icon: Sliders },
                { id: 'verifications', label: 'ID Verification Queue', icon: FileCheck, badge: stats?.pendingDocReviews },
                { id: 'moderation', label: 'Feed Moderation', icon: ShieldAlert, badge: posts.length },
                { id: 'blood', label: 'Blood Coordination', icon: HeartHandshake, badge: bloodRequests.length },
                { id: 'gallery', label: 'Photo Gallery', icon: ImageIcon, badge: galleryAlbums.length },
                { id: 'batches_streams', label: 'Batches Directory', icon: BookOpen },
              ]
            : isGeneralAdmin
            ? [
                { id: 'overview', label: 'Overview', icon: Sliders },
                { id: 'users', label: 'Alumni & Roles', icon: Users, badge: totalAlumniCount || stats?.totalUsers },
                { id: 'verifications', label: 'ID Verification Queue', icon: FileCheck, badge: stats?.pendingDocReviews },
                { id: 'moderation', label: 'Feed Moderation', icon: ShieldAlert, badge: posts.length },
                { id: 'customizer', label: 'Site Customizer', icon: Palette },
                { id: 'gallery', label: 'Photo Gallery', icon: ImageIcon, badge: galleryAlbums.length },
                { id: 'blood', label: 'Blood Coordination', icon: HeartHandshake, badge: bloodRequests.length },
                { id: 'batches_streams', label: 'Batches & Hall of Fame', icon: BookOpen },
              ]
            : [
                { id: 'overview', label: 'Overview', icon: Sliders },
                { id: 'users', label: 'Alumni & Roles', icon: Users, badge: totalAlumniCount || stats?.totalUsers },
                { id: 'small_admins', label: 'Sub-Admins', icon: UserCog, badge: smallAdmins.length },
                { id: 'verifications', label: 'ID Verification Queue', icon: FileCheck, badge: stats?.pendingDocReviews },
                { id: 'moderation', label: 'Feed Moderation', icon: ShieldAlert, badge: posts.length },
                { id: 'customizer', label: 'Site Customizer (No-Code)', icon: Palette },
                { id: 'gallery', label: 'Photo Gallery', icon: ImageIcon, badge: galleryAlbums.length },
                { id: 'blood', label: 'Blood Coordination', icon: HeartHandshake, badge: bloodRequests.length },
                { id: 'batches_streams', label: 'Batches & Hall of Fame', icon: BookOpen },
                { id: 'controls_audit', label: 'Controls & Audit', icon: History, badge: contactInquiries.length },
              ]
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as AdminTab)}
                className={`flex items-center gap-1.5 sm:gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                  isActive
                    ? (isSubAdmin ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30' : 'bg-blue-600 text-white shadow-md shadow-blue-600/30')
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && Number(tab.badge) > 0 && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 text-[9px] font-black rounded-full ${
                      isActive ? 'bg-white/20 text-white' : (isSubAdmin ? 'bg-teal-600/15 text-teal-700 dark:text-teal-300' : 'bg-blue-600/15 text-blue-700 dark:text-blue-300')
                    }`}
                  >
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
        {/* TAB 1: EXECUTIVE OVERVIEW */}
        {/* ================================================================= */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Registered Alumni', value: stats?.totalUsers ?? 0, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                { label: 'Verified SZMC Alumni', value: stats?.verifiedUsers ?? 0, icon: ShieldCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                { label: 'Pending ID Reviews', value: stats?.pendingDocReviews ?? 0, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10', highlight: true },
                { label: 'Active Community Posts', value: stats?.totalPosts ?? 0, icon: MessageSquare, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
              ].map((card, idx) => {
                const Icon = card.icon;
                return (
                  <div
                    key={idx}
                    className={`p-5 rounded-2xl bg-white dark:bg-slate-900 border transition-all ${
                      card.highlight && card.value > 0
                        ? 'border-amber-400/80 shadow-md shadow-amber-500/10 dark:border-amber-500/40'
                        : 'border-slate-200 dark:border-slate-800 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                        {card.label}
                      </span>
                      <div className={`p-2 rounded-xl ${card.bg} ${card.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                      {card.value.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Action Control Strip & Master Switches - STRICTLY SUPER ADMIN ONLY */}
            {isSuperAdmin && (
              <>
                <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
                  <div className="relative z-10 max-w-xl">
                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/20 text-white border border-white/20 mb-3 inline-block">
                      Universal No-Code Control
                    </span>
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-snug">
                      Edit homepage, change logos, verify alumni, and customize any portal element without coding.
                    </h2>
                    <p className="text-xs sm:text-sm text-blue-200 mt-2 leading-relaxed">
                      Every change saved here is immediately synchronized to the public landing page, alumni directory, and doctor dashboards.
                    </p>
                  </div>

                  <div className="relative z-10 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab('customizer')}
                      className="px-4 py-2.5 rounded-xl bg-white text-blue-900 hover:bg-blue-50 font-black text-xs transition-all shadow-md cursor-pointer flex items-center gap-2"
                    >
                      <Palette className="w-4 h-4 text-blue-600" />
                      <span>Launch Site Customizer</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('users')}
                      className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/30 font-bold text-xs transition-all cursor-pointer flex items-center gap-2"
                    >
                      <Users className="w-4 h-4" />
                      <span>Manage Users &amp; Roles</span>
                    </button>
                  </div>
                </div>

                {/* System Master Toggles Grid */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                  <h3 className="font-black text-sm uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-blue-600" />
                    <span>Executive Quick Master Switches</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* 1. Global Verification Gate */}
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-900 dark:text-white">Global Verification Gate</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${config.globalVerificationEnabled ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'}`}>
                            {config.globalVerificationEnabled ? 'ACTIVE' : 'BYPASSED'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                          When OFF, verification is bypassed for the whole portal auth and all features are unlocked.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          updateConfig({ globalVerificationEnabled: !config.globalVerificationEnabled });
                          showToast(`Verification gate set to ${!config.globalVerificationEnabled ? 'ON' : 'OFF'}`, 'success');
                        }}
                        className={`w-full py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          config.globalVerificationEnabled ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {config.globalVerificationEnabled ? 'Turn OFF Gate' : 'Turn ON Gate'}
                      </button>
                    </div>

                    {/* 2. Public Self-Registration Lock */}
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-900 dark:text-white">Public Registration</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${config.publicRegistrationOpen ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/20 text-rose-600 dark:text-rose-400'}`}>
                            {config.publicRegistrationOpen ? 'OPEN' : 'LOCKED'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Allow or restrict new doctor accounts from registering on the public portal.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          updateConfig({ publicRegistrationOpen: !config.publicRegistrationOpen });
                          showToast(`Public registration set to ${!config.publicRegistrationOpen ? 'OPEN' : 'LOCKED'}`, 'success');
                        }}
                        className={`w-full py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          config.publicRegistrationOpen ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {config.publicRegistrationOpen ? 'Lock Registration' : 'Open Registration'}
                      </button>
                    </div>

                    {/* 3. Member-Facing Verification Portal (hide/show the whole member verification UI) */}
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-900 dark:text-white">Member Verification Portal</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${rawMemberPortalVisible ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-500/20 text-slate-600 dark:text-slate-400'}`}>
                            {rawMemberPortalVisible ? 'VISIBLE' : 'HIDDEN'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                          When HIDDEN, alumni never see any verification UI (Verification Center, peer vouches, verification badges and settings). Only this Admin Panel can verify alumni.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const next = !rawMemberPortalVisible;
                          const res = await setMemberPortalVisible(next);
                          showToast(
                            res.success
                              ? (next
                                  ? 'Member verification portal is now VISIBLE to all alumni.'
                                  : 'Member verification portal is now HIDDEN. Admin-only verification is active.')
                              : (res.error || 'Could not save the verification switch.'),
                            res.success ? 'success' : 'error'
                          );
                        }}
                        className={`w-full py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          rawMemberPortalVisible ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-blue-600 text-white'
                        }`}
                      >
                        {rawMemberPortalVisible ? 'Hide from Members' : 'Show to Members'}
                      </button>
                    </div>

                    {/* 4. Maintenance Mode */}
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-900 dark:text-white">Maintenance Mode</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${config.maintenanceMode ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400' : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'}`}>
                            {config.maintenanceMode ? 'ACTIVE' : 'OFF'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Temporarily lock public access with a maintenance notification banner.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          updateConfig({ maintenanceMode: !config.maintenanceMode });
                          showToast(`Maintenance mode set to ${!config.maintenanceMode ? 'ON' : 'OFF'}`, 'success');
                        }}
                        className={`w-full py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          config.maintenanceMode ? 'bg-rose-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {config.maintenanceMode ? 'Disable Maintenance' : 'Enable Maintenance'}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Sub-Admin Operational Task Desk - Strictly for Sub-Admins */}
            {isSubAdmin && (
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-teal-900 to-cyan-900 text-white rounded-3xl p-6 sm:p-7 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
                  <div className="relative z-10 max-w-xl">
                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-500/30 text-teal-200 border border-teal-400/30 mb-3 inline-block">
                      Sub-Admin Moderation Authority
                    </span>
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-snug">
                      Delegated Cohort ID Verifications &amp; Feed Moderation Desk
                    </h2>
                    <p className="text-xs sm:text-sm text-teal-100 mt-2 leading-relaxed">
                      You are authorized to review batch member identification proofs, approve or reject document verification requests, and moderate inappropriate feed posts and blood coordination.
                    </p>
                  </div>

                  <div className="relative z-10 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab('verifications')}
                      className="px-4 py-2.5 rounded-xl bg-white text-teal-900 hover:bg-teal-50 font-black text-xs transition-all shadow-md cursor-pointer flex items-center gap-2"
                    >
                      <FileCheck className="w-4 h-4 text-teal-600" />
                      <span>Review ID Proofs ({stats?.pendingDocReviews || 0})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('moderation')}
                      className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/30 font-bold text-xs transition-all cursor-pointer flex items-center gap-2"
                    >
                      <ShieldAlert className="w-4 h-4" />
                      <span>Feed Moderation ({posts.length})</span>
                    </button>
                  </div>
                </div>

                {/* Sub-Admin Responsibility Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div
                    onClick={() => setActiveTab('verifications')}
                    className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-teal-500/50 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600">
                        <FileCheck className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        {stats?.pendingDocReviews || 0} Pending
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-teal-600 transition-colors">
                      ID Document Approvals
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Verify college roll, batch year, and student identification documents.
                    </p>
                  </div>

                  <div
                    onClick={() => setActiveTab('moderation')}
                    className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-teal-500/50 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600">
                        <ShieldAlert className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                        Feed Safety
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-teal-600 transition-colors">
                      Post &amp; Content Moderation
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Pin important announcements or remove inappropriate alumni posts.
                    </p>
                  </div>

                  <div
                    onClick={() => setActiveTab('blood')}
                    className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-teal-500/50 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600">
                        <HeartHandshake className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300">
                        {bloodRequests.length} Active
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-teal-600 transition-colors">
                      Emergency Blood Coordination
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Verify hospital emergency blood requests and track donor fulfillments.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2.5">
                  <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>
                    <strong>Isolation Guard Active:</strong> System audit logs, root database schemas, data backups, and Super Admin activities are restricted to root administrators and hidden from sub-admin views.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: USER & ACCOUNT GOVERNANCE - STRICTLY SUPER ADMIN */}
        {/* ================================================================= */}
        {activeTab === 'users' && isSuperAdmin && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-600" />
                    <span>User &amp; Account Governance</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    View anyone's full profile, 1-click verify, suspend accounts, edit details, certify phones, or export data.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportAlumniData('csv')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => exportAlumniData('json')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export JSON</span>
                  </button>
                </div>
              </div>

              {/* Search & Filter Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={alumniSearchQuery}
                    onChange={(e) => setAlumniSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadAlumni()}
                    placeholder="Search name, roll, batch..."
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <select
                  value={roleFilter}
                  onChange={(e) => {
                    setRoleFilter(e.target.value as any);
                    setTimeout(loadAlumni, 50);
                  }}
                  className="px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                >
                  <option value="all">All Roles</option>
                  <option value="admin">Admins</option>
                  <option value="moderator">Moderators</option>
                  <option value="member">Members</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as any);
                    setTimeout(loadAlumni, 50);
                  }}
                  className="px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                >
                  <option value="all">All Verification Statuses</option>
                  <option value="verified">Verified</option>
                  <option value="unverified">Unverified / Pending</option>
                </select>

                <button
                  type="button"
                  onClick={loadAlumni}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Filter Directory</span>
                </button>
              </div>

              {/* Alumni Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Alumnus</th>
                      <th className="py-3 px-3">Batch &amp; Roll</th>
                      <th className="py-3 px-3">Role</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3">Phone Audit</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {loadingAlumni ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                          <span>Loading alumni directory...</span>
                        </td>
                      </tr>
                    ) : alumniList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          No alumni records found matching criteria.
                        </td>
                      </tr>
                    ) : (
                      alumniList.map((user) => {
                        const isVerified = user.verificationStatus === 'verified';
                        return (
                          <tr key={user.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                            {/* User details */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <img
                                  src={user.avatarUrl}
                                  alt={user.fullName}
                                  className="w-9 h-9 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                                />
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => setInspectingUser(user)}
                                    className="font-bold text-slate-900 dark:text-white hover:text-blue-600 transition-colors text-left truncate block cursor-pointer"
                                  >
                                    {user.fullName}
                                  </button>
                                  <div className="text-[11px] text-slate-500 truncate">
                                    {user.profession || 'Doctor / Physician'}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Batch & Roll */}
                            <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">
                              <div>Batch {user.batchYear}</div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                Roll: {user.collegeRoll || 'N/A'}
                              </div>
                            </td>

                            {/* Role */}
                            <td className="py-3 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                  user.role === 'admin'
                                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                                    : user.role === 'moderator'
                                    ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                {user.role}
                              </span>
                            </td>

                            {/* Verification Status */}
                            <td className="py-3 px-3">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  isVerified
                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                }`}
                              >
                                {isVerified ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                <span>{isVerified ? 'Verified' : 'Pending'}</span>
                              </span>
                            </td>

                            {/* Phone Audit */}
                            <td className="py-3 px-3">
                              <button
                                type="button"
                                onClick={() => handleCertifyPhone(user.userId, user.fullName)}
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer border ${
                                  (user as any).phoneOwnershipVerified
                                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                                }`}
                                title="Click to audit/certify phone ownership"
                              >
                                <Phone className="w-3 h-3" />
                                <span>{(user as any).phoneOwnershipVerified ? 'Certified' : 'Verify Phone'}</span>
                              </button>
                            </td>

                            {/* Actions Toolbar */}
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Inspect Full Profile */}
                                <button
                                  type="button"
                                  onClick={() => setInspectingUser(user)}
                                  className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                  title="Inspect Full Profile"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>

                                {/* 1-Click Instant Verify */}
                                {!isVerified && (
                                  <button
                                    type="button"
                                    onClick={() => handleInstantVerify(user.userId, user.fullName)}
                                    className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 transition-colors cursor-pointer"
                                    title="1-Click Instant Verification"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                  </button>
                                )}

                                {/* Edit Profile Details */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingProfile(user);
                                    setProfileEditForm({
                                      fullName: user.fullName,
                                      batchYear: user.batchYear,
                                      collegeRoll: user.collegeRoll || '',
                                      academicStream: user.academicStream || 'Medicine',
                                      academicGroup: user.academicGroup || '',
                                      section: 'MBBS',
                                      profession: user.profession || '',
                                      position: '',
                                      institution: user.institution || '',
                                      city: user.city || 'Bogura',
                                      country: user.country || 'Bangladesh',
                                      phone: (user as any).phone || '',
                                      email: (user as any).email || '',
                                    });
                                  }}
                                  className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                  title="Edit Alumnus Details"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>

                                {/* Change Role */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRoleModalUser(user);
                                    setSelectedNewRole(user.role);
                                  }}
                                  className="p-1.5 rounded-lg text-slate-600 hover:text-purple-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                  title="Change Role"
                                >
                                  <UserCog className="w-4 h-4" />
                                </button>

                                {/* Suspend / Reactivate */}
                                <button
                                  type="button"
                                  onClick={() => handleToggleSuspend(user.userId, (user as any).accountStatus, user.fullName)}
                                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                    (user as any).accountStatus === 'suspended'
                                      ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                                      : 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                  }`}
                                  title={(user as any).accountStatus === 'suspended' ? 'Reactivate Account' : 'Suspend Account'}
                                >
                                  {(user as any).accountStatus === 'suspended' ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: SUB-ADMINS & DELEGATED PERMISSIONS - STRICTLY SUPER ADMIN */}
        {/* ================================================================= */}
        {activeTab === 'small_admins' && isSuperAdmin && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <UserCog className="w-5 h-5 text-indigo-600" />
                    <span>Sub-Admin &amp; Small Admin Management</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Appoint batch moderators and assign granular permissions for ID document reviews and post moderation.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddSmallAdminModal(true)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
                >
                  <Plus className="w-4 h-4" />
                  <span>Appoint Sub-Admin</span>
                </button>
              </div>

              {/* Sub-Admins Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                {smallAdmins.map((admin) => (
                  <div
                    key={admin.id}
                    className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {admin.fullName}
                      </div>
                      <span
                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                          admin.isActive
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {admin.isActive ? 'Active' : 'Suspended'}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 truncate flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>{admin.email}</span>
                    </div>

                    {/* Permissions Badges */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {admin.permissions.canVerifyAlumni && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          ID Verification
                        </span>
                      )}
                      {admin.permissions.canDeletePosts && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                          Post Moderation
                        </span>
                      )}
                      {admin.permissions.canViewDirectory && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          Directory Access
                        </span>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          toggleSmallAdminStatus(admin.id);
                          loadSmallAdmins();
                        }}
                        className="text-slate-600 dark:text-slate-300 hover:underline font-semibold cursor-pointer"
                      >
                        {admin.isActive ? 'Suspend' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Remove sub-admin privileges from ${admin.fullName}?`)) {
                            removeSmallAdmin(admin.id);
                            loadSmallAdmins();
                            showToast('Sub-admin removed.', 'info');
                          }
                        }}
                        className="text-rose-600 dark:text-rose-400 hover:underline font-semibold cursor-pointer"
                      >
                        Revoke Access
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: DOCUMENT INSPECTION & VERIFICATION QUEUE */}
        {/* ================================================================= */}
        {activeTab === 'verifications' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <FileCheck className="w-5 h-5 text-emerald-600" />
                    <span>Official ID &amp; Document Verification Queue</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Inspect high-resolution SZMC College ID cards, BMDC registration certificates, and souvenir photos.
                  </p>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  {(['pending', 'approved', 'rejected', 'all'] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => {
                        setDocFilter(filter);
                        loadSubmissions(filter);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors cursor-pointer ${
                        docFilter === filter
                          ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              {/* Submissions Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                {loadingSubmissions ? (
                  <div className="col-span-full py-16 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    <span>Loading document verification queue...</span>
                  </div>
                ) : filteredSubmissions.length === 0 ? (
                  <div className="col-span-full py-16 text-center text-slate-400">
                    No verification document submissions in this view.
                  </div>
                ) : (
                  filteredSubmissions.map((sub) => (
                    <div
                      key={sub.id}
                      className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex flex-col justify-between gap-4 hover:border-blue-400/50 transition-colors"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={sub.avatarUrl}
                            alt={sub.fullName}
                            className="w-10 h-10 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                              {sub.fullName}
                            </div>
                            <div className="text-xs text-slate-500">
                              Batch {sub.batchYear} • Roll: {sub.collegeRoll || 'N/A'}
                            </div>
                          </div>
                        </div>

                        {/* Document Preview Box */}
                        <div className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950 aspect-video flex items-center justify-center">
                          {sub.documentUrl ? (
                            <>
                              <img
                                src={sub.documentUrl}
                                alt={sub.docTypeLabel}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                              <div
                                onClick={() => setDocumentLightboxUrl(sub.documentUrl)}
                                className="absolute inset-0 bg-slate-950/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white font-bold text-xs cursor-pointer"
                              >
                                <ZoomIn className="w-5 h-5" />
                                <span>Inspect Full Document</span>
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-slate-500">No document image attached</span>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                          Doc Type: <strong>{sub.docTypeLabel}</strong>
                        </div>

                        {/* Reviewer Note Input */}
                        {sub.status === 'pending' && (
                          <input
                            type="text"
                            value={adminNotes[sub.id] || ''}
                            onChange={(e) =>
                              setAdminNotes((prev) => ({ ...prev, [sub.id]: e.target.value }))
                            }
                            placeholder="Optional review feedback/rejection note..."
                            className="w-full px-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                          />
                        )}
                      </div>

                      {/* Action buttons */}
                      {sub.status === 'pending' ? (
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <button
                            type="button"
                            disabled={processingSubmissions[sub.id]}
                            onClick={() => handleReviewSubmission(sub, 'approved')}
                            className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve &amp; Verify</span>
                          </button>
                          <button
                            type="button"
                            disabled={processingSubmissions[sub.id]}
                            onClick={() => handleReviewSubmission(sub, 'rejected')}
                            className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-300 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      ) : (
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center py-1">
                          Status: {sub.status}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 5: CONTENT & COMMUNITY FEED MODERATION */}
        {/* ================================================================= */}
        {activeTab === 'moderation' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-rose-600" />
                    <span>Community Feed &amp; Content Moderation</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Delete any post, photo, video or comment across the entire portal, or pin announcements globally.
                  </p>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  {(['all', 'pinned', 'active', 'deleted'] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => {
                        setPostFilter(filter);
                        setTimeout(loadModerationPosts, 50);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors cursor-pointer ${
                        postFilter === filter
                          ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              {/* Posts Moderation List */}
              <div className="space-y-3 pt-2">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-xs text-slate-900 dark:text-white">
                          {post.authorName} (Batch {post.authorBatch})
                        </span>
                        {post.isPinned && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            <Pin className="w-3 h-3" /> PINNED
                          </span>
                        )}
                        {post.isDeleted && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/20 text-rose-600 dark:text-rose-400">
                            DELETED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                        {post.content}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Pin Toggle */}
                      <button
                        type="button"
                        onClick={async () => {
                          await togglePostPinnedStatus(post.id, !post.isPinned);
                          showToast(post.isPinned ? 'Post unpinned' : 'Post pinned to top of feed', 'success');
                          loadModerationPosts();
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        {post.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                        <span>{post.isPinned ? 'Unpin' : 'Pin to Top'}</span>
                      </button>

                      {/* Soft Delete / Restore */}
                      <button
                        type="button"
                        onClick={async () => {
                          await togglePostDeletedStatus(post.id, !post.isDeleted);
                          showToast(post.isDeleted ? 'Post restored' : 'Post removed from feed', 'info');
                          loadModerationPosts();
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                          post.isDeleted
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-rose-600 text-white hover:bg-rose-700'
                        }`}
                      >
                        {post.isDeleted ? <RotateCcw className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                        <span>{post.isDeleted ? 'Restore' : 'Delete'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 6: INSTITUTIONAL SITE CUSTOMIZER & BRANDING (NO-CODE ENGINE) - STRICTLY SUPER ADMIN */}
        {/* ================================================================= */}
        {activeTab === 'customizer' && isSuperAdmin && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Palette className="w-5 h-5 text-indigo-600" />
                  <span>Institutional Site Customizer &amp; Branding (No-Code Engine)</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Change site title, emblem logos, hero headlines, motto, emergency ticker, reunion events, banking info, and ceremonial anthem without touching any code.
                </p>
              </div>

              {/* Subtab Bar */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none border-b border-slate-100 dark:border-slate-800">
                {[
                  { id: 'branding', label: '1. Logos & Identity', icon: Globe },
                  { id: 'hero', label: '2. Homepage & Hero', icon: Sparkles },
                  { id: 'ticker', label: '3. Emergency Ticker', icon: AlertTriangle },
                  { id: 'notices', label: '4. Official Notices', icon: FileText },
                  { id: 'reunion', label: '5. Reunion Event', icon: Award },
                  { id: 'banking', label: '6. Bank & Payments', icon: Lock },
                  { id: 'audio', label: '7. Ceremonial Anthem', icon: Music },
                  { id: 'backup', label: '8. Schema Backup & Reset', icon: Download },
                ].map((st) => {
                  const Icon = st.icon;
                  const isActive = customizerSubtab === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setCustomizerSubtab(st.id as any)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{st.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* SUBTAB 1: BRANDING & LOGOS */}
              {customizerSubtab === 'branding' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      Emblem Logo &amp; Identity Configuration
                    </h3>

                    {/* Logo Image URL + Upload */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Logo Image URL / Data
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={config.logoUrl}
                          onChange={(e) => updateConfig({ logoUrl: e.target.value })}
                          className="flex-1 px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                        />
                        <label className="px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-xs font-bold border border-indigo-200 dark:border-indigo-800 cursor-pointer flex items-center gap-1 shrink-0">
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload File</span>
                          <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                        </label>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Instantly replaces the emblem logo on the landing page, navigation header, and official document watermarks.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Site Title
                      </label>
                      <input
                        type="text"
                        value={config.siteTitle}
                        onChange={(e) => updateConfig({ siteTitle: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Site Tagline
                      </label>
                      <input
                        type="text"
                        value={config.siteTagline}
                        onChange={(e) => updateConfig({ siteTagline: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Established Year
                        </label>
                        <input
                          type="number"
                          value={config.establishedYear}
                          onChange={(e) => updateConfig({ establishedYear: Number(e.target.value) })}
                          className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Helpline Phone
                        </label>
                        <input
                          type="text"
                          value={config.helplinePhone}
                          onChange={(e) => updateConfig({ helplinePhone: e.target.value })}
                          className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        College Motto
                      </label>
                      <input
                        type="text"
                        value={config.collegeMotto}
                        onChange={(e) => updateConfig({ collegeMotto: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  {/* Live Visual Preview of Logo & Branding */}
                  <div className="p-6 rounded-3xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-center space-y-4">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Live Emblem Logo &amp; Seal Preview
                    </span>

                    <div className="w-24 h-24 rounded-2xl bg-white dark:bg-slate-800 p-2 border border-slate-200 dark:border-slate-700 shadow-xl flex items-center justify-center overflow-hidden">
                      <NDCLogo className="w-full h-full object-contain" />
                    </div>

                    <div>
                      <h4 className="font-extrabold text-base text-slate-900 dark:text-white">
                        {config.siteTitle}
                      </h4>
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-0.5">
                        {config.siteTagline} • Estd. {config.establishedYear}
                      </p>
                    </div>

                    <blockquote className="font-serif italic text-sm text-slate-600 dark:text-slate-300 max-w-sm">
                      &ldquo;{config.collegeMotto}&rdquo;
                    </blockquote>

                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                      Changes propagate immediately across the full site
                    </span>
                  </div>
                </div>
              )}

              {/* SUBTAB 2: HOMEPAGE & HERO STYLING */}
              {customizerSubtab === 'hero' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-4">
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                        Homepage Hero Headline &amp; Subtitle Editor
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Prefix (Line 1)
                          </label>
                          <input
                            type="text"
                            value={config.heroPrefix}
                            onChange={(e) => updateConfig({ heroPrefix: e.target.value })}
                            className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Highlight (Green / Bold)
                          </label>
                          <input
                            type="text"
                            value={config.heroHighlight}
                            onChange={(e) => updateConfig({ heroHighlight: e.target.value })}
                            className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Suffix
                          </label>
                          <input
                            type="text"
                            value={config.heroSuffix}
                            onChange={(e) => updateConfig({ heroSuffix: e.target.value })}
                            className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Hero Subtitle &amp; Medical Network Description
                        </label>
                        <textarea
                          rows={3}
                          value={config.heroSubtitle}
                          onChange={(e) => updateConfig({ heroSubtitle: e.target.value })}
                          className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Background Texture
                          </label>
                          <select
                            value={config.heroBackgroundTexture}
                            onChange={(e) => updateConfig({ heroBackgroundTexture: e.target.value as any })}
                            className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                          >
                            <option value="Mesh">Liquid Mesh Glow</option>
                            <option value="Aurora">Aurora Borealis</option>
                            <option value="Vignette">Institutional Vignette</option>
                            <option value="Campus Photo">Campus Monument Photo</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Darkness Overlay Opacity ({config.heroOverlayOpacity}%)
                          </label>
                          <input
                            type="range"
                            min="10"
                            max="90"
                            value={config.heroOverlayOpacity}
                            onChange={(e) => updateConfig({ heroOverlayOpacity: Number(e.target.value) })}
                            className="w-full"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Interactive Real-Time Hero Preview */}
                    <div className="p-6 rounded-3xl bg-slate-900 text-white flex flex-col justify-center text-center space-y-3 relative overflow-hidden">
                      <div className="w-12 h-12 mx-auto rounded-xl bg-white/10 p-1 border border-white/20">
                        <NDCLogo className="w-full h-full object-contain" />
                      </div>
                      <div className="text-sm font-black tracking-tight leading-snug">
                        <span>{config.heroPrefix} </span>
                        <span className="text-emerald-400">{config.heroHighlight} </span>
                        <span className="text-amber-400">{config.heroSuffix}</span>
                      </div>
                      <p className="font-serif italic text-xs text-amber-300">
                        &ldquo;{config.collegeMotto}&rdquo;
                      </p>
                      <p className="text-[10px] text-slate-300 line-clamp-2">
                        {config.heroSubtitle}
                      </p>
                      <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full inline-block">
                        Active on Homepage
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* SUBTAB 3: EMERGENCY TICKER */}
              {customizerSubtab === 'ticker' && (
                <div className="space-y-4 max-w-2xl">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Live Broadcast Announcement Ticker
                  </h3>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="tickerEnabled"
                      checked={config.liveTickerEnabled}
                      onChange={(e) => updateConfig({ liveTickerEnabled: e.target.checked })}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                    <label htmlFor="tickerEnabled" className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Enable Top Live Announcement Ticker
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Urgency Level
                    </label>
                    <select
                      value={config.liveTickerUrgency}
                      onChange={(e) => updateConfig({ liveTickerUrgency: e.target.value as any })}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                    >
                      <option value="standard">Standard Announcement (Blue / Amber)</option>
                      <option value="urgent">Urgent Notice (Amber / Yellow)</option>
                      <option value="emergency">Critical Emergency Broadcast (Rose / Red Pulsing)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Ticker Announcement Message
                    </label>
                    <textarea
                      rows={2}
                      value={config.liveTickerMessage}
                      onChange={(e) => updateConfig({ liveTickerMessage: e.target.value })}
                      placeholder="e.g. 🚨 Emergency O-Negative Blood needed urgently at SZMCH ICU. Contact Blood Desk immediately!"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Action Button Label
                      </label>
                      <input
                        type="text"
                        value={config.liveTickerActionText}
                        onChange={(e) => updateConfig({ liveTickerActionText: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Action URL / Route Target
                      </label>
                      <input
                        type="text"
                        value={config.liveTickerActionUrl}
                        onChange={(e) => updateConfig({ liveTickerActionUrl: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SUBTAB 4: OFFICIAL NOTICES */}
              {customizerSubtab === 'notices' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      Official Institutional Notices ({config.notices.length})
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        const newNotice: SiteNotice = {
                          id: `notice-${Date.now()}`,
                          refNo: `SZMC-AA/2026/0${config.notices.length + 10}`,
                          title: 'New Official Announcement',
                          category: 'General',
                          publishedDate: new Date().toISOString().split('T')[0],
                          isUrgent: false,
                          isPinned: false,
                          isPublished: true,
                          summary: 'Executive council update regarding upcoming initiatives.',
                          fullContent: 'Official content for alumni awareness and participation.',
                          signatoryName: 'Super Administrator',
                          signatoryDesignation: 'Executive Council',
                          signatoryOrganization: 'SZMC Alumni Association',
                        };
                        updateConfig({ notices: [newNotice, ...config.notices] });
                        showToast('Draft notice added.', 'success');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Draft New Notice</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    {config.notices.map((notice, idx) => (
                      <div
                        key={notice.id}
                        className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-slate-400">Title</label>
                            <input
                              type="text"
                              value={notice.title}
                              onChange={(e) => {
                                const next = [...config.notices];
                                next[idx] = { ...notice, title: e.target.value };
                                updateConfig({ notices: next });
                              }}
                              className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-400">Ref No</label>
                            <input
                              type="text"
                              value={notice.refNo}
                              onChange={(e) => {
                                const next = [...config.notices];
                                next[idx] = { ...notice, refNo: e.target.value };
                                updateConfig({ notices: next });
                              }}
                              className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-400">Category</label>
                            <select
                              value={notice.category}
                              onChange={(e) => {
                                const next = [...config.notices];
                                next[idx] = { ...notice, category: e.target.value as any };
                                updateConfig({ notices: next });
                              }}
                              className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                            >
                              <option value="General">General</option>
                              <option value="Reunion">Reunion</option>
                              <option value="Membership">Membership</option>
                              <option value="Emergency">Emergency</option>
                              <option value="Scholarship">Scholarship</option>
                              <option value="AGM">AGM</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-400">Summary</label>
                          <input
                            type="text"
                            value={notice.summary}
                            onChange={(e) => {
                              const next = [...config.notices];
                              next[idx] = { ...notice, summary: e.target.value };
                              updateConfig({ notices: next });
                            }}
                            className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                          />
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-200/50 dark:border-slate-700/50 text-xs">
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1.5 font-bold cursor-pointer">
                              <input
                                type="checkbox"
                                checked={notice.isPinned}
                                onChange={(e) => {
                                  const next = [...config.notices];
                                  next[idx] = { ...notice, isPinned: e.target.checked };
                                  updateConfig({ notices: next });
                                }}
                                className="w-3.5 h-3.5 rounded"
                              />
                              <span>Pinned</span>
                            </label>
                            <label className="flex items-center gap-1.5 font-bold cursor-pointer">
                              <input
                                type="checkbox"
                                checked={notice.isPublished}
                                onChange={(e) => {
                                  const next = [...config.notices];
                                  next[idx] = { ...notice, isPublished: e.target.checked };
                                  updateConfig({ notices: next });
                                }}
                                className="w-3.5 h-3.5 rounded"
                              />
                              <span>Published</span>
                            </label>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const next = config.notices.filter((_, i) => i !== idx);
                              updateConfig({ notices: next });
                              showToast('Notice deleted.', 'info');
                            }}
                            className="text-rose-600 hover:underline font-bold cursor-pointer flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SUBTAB 5: REUNION EVENT CONFIGURATION */}
              {customizerSubtab === 'reunion' && (
                <div className="space-y-4 max-w-2xl">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Grand Reunion Event &amp; Registration Setup
                  </h3>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Event Title
                    </label>
                    <input
                      type="text"
                      value={config.reunionTitle}
                      onChange={(e) => updateConfig({ reunionTitle: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Target Date (Countdown)
                      </label>
                      <input
                        type="date"
                        value={config.reunionDate}
                        onChange={(e) => updateConfig({ reunionDate: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Registration Status
                      </label>
                      <select
                        value={config.reunionStatus}
                        onChange={(e) => updateConfig({ reunionStatus: e.target.value as any })}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                      >
                        <option value="open">Open for Registration</option>
                        <option value="closing_soon">Closing Soon</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Event Venue
                    </label>
                    <input
                      type="text"
                      value={config.reunionVenue}
                      onChange={(e) => updateConfig({ reunionVenue: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        General Ticket (BDT)
                      </label>
                      <input
                        type="number"
                        value={config.ticketPrices?.general || 3500}
                        onChange={(e) =>
                          updateConfig({
                            ticketPrices: { ...config.ticketPrices, general: Number(e.target.value) },
                          })
                        }
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Early Bird (BDT)
                      </label>
                      <input
                        type="number"
                        value={config.ticketPrices?.earlyBird || 2500}
                        onChange={(e) =>
                          updateConfig({
                            ticketPrices: { ...config.ticketPrices, earlyBird: Number(e.target.value) },
                          })
                        }
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Student/Intern (BDT)
                      </label>
                      <input
                        type="number"
                        value={config.ticketPrices?.student || 1500}
                        onChange={(e) =>
                          updateConfig({
                            ticketPrices: { ...config.ticketPrices, student: Number(e.target.value) },
                          })
                        }
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SUBTAB 6: BANKING & PAYMENTS */}
              {customizerSubtab === 'banking' && (
                <div className="space-y-4 max-w-2xl">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Official Banking &amp; Mobile Payment Merchant Numbers
                  </h3>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Bank Name
                      </label>
                      <input
                        type="text"
                        value={config.bankName}
                        onChange={(e) => updateConfig({ bankName: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Account Name
                      </label>
                      <input
                        type="text"
                        value={config.bankAccountName}
                        onChange={(e) => updateConfig({ bankAccountName: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Account Number
                      </label>
                      <input
                        type="text"
                        value={config.bankAccountNumber}
                        onChange={(e) => updateConfig({ bankAccountNumber: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Routing Number
                      </label>
                      <input
                        type="text"
                        value={config.bankRoutingNumber}
                        onChange={(e) => updateConfig({ bankRoutingNumber: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        bKash Merchant
                      </label>
                      <input
                        type="text"
                        value={config.bKashMerchantNumber}
                        onChange={(e) => updateConfig({ bKashMerchantNumber: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Nagad Merchant
                      </label>
                      <input
                        type="text"
                        value={config.nagadMerchantNumber}
                        onChange={(e) => updateConfig({ nagadMerchantNumber: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Rocket Number
                      </label>
                      <input
                        type="text"
                        value={config.rocketNumber}
                        onChange={(e) => updateConfig({ rocketNumber: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SUBTAB 7: CEREMONIAL ANTHEM */}
              {customizerSubtab === 'audio' && (
                <div className="space-y-4 max-w-2xl">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Ceremonial Anthem &amp; Background Audio Soundtrack
                  </h3>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Soundtrack Title
                    </label>
                    <input
                      type="text"
                      value={config.anthemTitle}
                      onChange={(e) => updateConfig({ anthemTitle: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Audio Stream URL (.mp3 / stream)
                    </label>
                    <input
                      type="text"
                      value={config.anthemAudioUrl}
                      onChange={(e) => updateConfig({ anthemAudioUrl: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="anthemAutoplay"
                      checked={config.anthemAutoPlay}
                      onChange={(e) => updateConfig({ anthemAutoPlay: e.target.checked })}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                    <label htmlFor="anthemAutoplay" className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Enable ceremonial anthem background auto-play (when user interacts)
                    </label>
                  </div>
                </div>
              )}

              {/* SUBTAB 8: BACKUP & FACTORY RESET */}
              {customizerSubtab === 'backup' && (
                <div className="space-y-4 max-w-xl">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Configuration Backup, Schema Export &amp; Reset
                  </h3>
                  <p className="text-xs text-slate-500">
                    Export your custom portal schema to JSON, or import a previously exported configuration file.
                  </p>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const json = exportJson();
                        const blob = new Blob([json], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `SZMC_Site_Configuration_${new Date().toISOString().split('T')[0]}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        showToast('Configuration exported.', 'success');
                      }}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Config JSON</span>
                    </button>

                    <label className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-colors cursor-pointer flex items-center gap-2">
                      <Upload className="w-4 h-4" />
                      <span>Import JSON Schema</span>
                      <input
                        type="file"
                        accept=".json"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (evt) => {
                            const res = importJson(evt.target?.result as string);
                            if (res.success) {
                              showToast('Configuration imported successfully!', 'success');
                            } else {
                              showToast(res.error || 'Failed to import', 'error');
                            }
                          };
                          reader.readAsText(file);
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('Reset all branding, headlines, and settings back to factory college defaults?')) {
                          resetConfig();
                          showToast('Site configuration reset to factory defaults.', 'info');
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 font-bold text-xs transition-colors cursor-pointer border border-rose-200 dark:border-rose-800"
                    >
                      1-Click Reset to College Defaults
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 7: PHOTO GALLERY ADMINISTRATION */}
        {/* ================================================================= */}
        {activeTab === 'gallery' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-indigo-600" />
                    <span>Photo Gallery Administration</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Create albums, publish/unpublish photo collections, approve submissions, and delete photos.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowNewAlbumModal(true)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create New Album</span>
                </button>
              </div>

              {/* Albums Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                {galleryAlbums.map((album, idx) => (
                  <div
                    key={album.id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3"
                  >
                    <div className="relative rounded-xl overflow-hidden aspect-video bg-slate-950">
                      <img src={album.coverUrl} alt={album.title} className="w-full h-full object-cover" />
                      <span className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-black/60 text-white backdrop-blur-xs">
                        {album.photosCount} Photos
                      </span>
                    </div>

                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1">
                        {album.title}
                      </h4>
                      <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                        {album.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...galleryAlbums];
                          updated[idx].isPublished = !updated[idx].isPublished;
                          setGalleryAlbums(updated);
                          saveGalleryAlbums(updated);
                          showToast(updated[idx].isPublished ? 'Album published.' : 'Album unpublished.', 'info');
                        }}
                        className={`font-bold cursor-pointer ${
                          album.isPublished ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'
                        }`}
                      >
                        {album.isPublished ? 'Published' : 'Draft / Hidden'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete album "${album.title}"?`)) {
                            const updated = galleryAlbums.filter((_, i) => i !== idx);
                            setGalleryAlbums(updated);
                            saveGalleryAlbums(updated);
                            showToast('Album deleted.', 'info');
                          }
                        }}
                        className="text-rose-600 hover:underline font-bold cursor-pointer flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 8: BLOOD DONATION COORDINATION */}
        {/* ================================================================= */}
        {activeTab === 'blood' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <HeartHandshake className="w-5 h-5 text-rose-600" />
                    <span>Emergency Blood Donation Coordination</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Verify emergency blood requests, manage fulfillment, and update hospital dispatch notices.
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                {bloodRequests.map((req, idx) => (
                  <div
                    key={req.id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-xs font-black bg-rose-600 text-white">
                          {req.bloodGroup}
                        </span>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                          {req.patientName}
                        </h4>
                        <span className="text-xs text-slate-400">• {req.hospital}</span>
                      </div>
                      <p className="text-xs text-slate-500">
                        Units: <strong>{req.unitsFulfilled || 0} / {req.unitsRequired} fulfilled</strong> • Contact: {req.contactPhone}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          await updateBloodRequestModeration({
                            id: req.id,
                            status: req.status === 'fulfilled' ? 'open' : 'fulfilled',
                            unitsFulfilled: req.status === 'fulfilled' ? 0 : req.unitsRequired,
                          });
                          showToast(req.status === 'fulfilled' ? 'Reopened' : 'Marked as fulfilled!', 'success');
                          loadBlood();
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                          req.status === 'fulfilled' ? 'bg-slate-200 dark:bg-slate-700' : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {req.status === 'fulfilled' ? 'Reopen Request' : 'Mark Fulfilled'}
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          if (confirm('Cancel this emergency broadcast?')) {
                            await updateBloodRequestModeration({ id: req.id, status: 'cancelled' });
                            showToast('Broadcast cancelled', 'info');
                            loadBlood();
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300 hover:bg-rose-100 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 9: BATCHES, ACADEMIC STREAMS & FEATURED ALUMNI / HALL OF FAME */}
        {/* ================================================================= */}
        {activeTab === 'batches_streams' && (
          <div className="space-y-6">
            {/* Batch Governance */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-600" />
                <span>35 MBBS Batches Governance &amp; Representative Metadata</span>
              </h2>
              <p className="text-xs text-slate-500">
                Configure coordinator names, session years, and batch special notes across all 35 MBBS batches.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[460px] overflow-y-auto pr-2">
                {config.batchMetadataList.map((batch, idx) => (
                  <div
                    key={batch.batchNumber}
                    className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-blue-600 dark:text-blue-400">Batch {batch.batchNumber}</span>
                      <span className="text-slate-400 font-mono">{batch.session}</span>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400">Coordinator / Representative</label>
                      <input
                        type="text"
                        value={batch.representativeName}
                        onChange={(e) => {
                          const updated = [...config.batchMetadataList];
                          updated[idx] = { ...batch, representativeName: e.target.value };
                          updateConfig({ batchMetadataList: updated });
                        }}
                        className="w-full px-2.5 py-1 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-semibold"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400">Special Batch Milestone / Note</label>
                      <input
                        type="text"
                        value={batch.specialNote || ''}
                        onChange={(e) => {
                          const updated = [...config.batchMetadataList];
                          updated[idx] = { ...batch, specialNote: e.target.value };
                          updateConfig({ batchMetadataList: updated });
                        }}
                        className="w-full px-2.5 py-1 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Featured Alumni / Hall of Fame */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Award className="w-5 h-5 text-amber-500" />
                    <span>Featured Alumni / Hall of Fame</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Showcase prominent physicians, professors, researchers, and public service leaders on the homepage.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const newFa: FeaturedAlumnus = {
                      id: `fa-${Date.now()}`,
                      name: 'Dr. Prominent Alumnus',
                      batch: 25,
                      category: 'Medicine',
                      designation: 'Professor & Specialist',
                      institution: 'Shaheed Ziaur Rahman Medical College Hospital',
                      avatarUrl: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=300&auto=format&fit=crop&q=80',
                      achievementSummary: 'Exceptional clinical contribution in national healthcare and medical pedagogy.',
                      order: config.featuredAlumni.length + 1,
                    };
                    updateConfig({ featuredAlumni: [...config.featuredAlumni, newFa] });
                    showToast('Featured alumnus added.', 'success');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Hall of Fame Profile</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                {config.featuredAlumni.map((fa, idx) => (
                  <div
                    key={fa.id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      <img src={fa.avatarUrl} alt={fa.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                      <div className="min-w-0 flex-1">
                        <input
                          type="text"
                          value={fa.name}
                          onChange={(e) => {
                            const updated = [...config.featuredAlumni];
                            updated[idx] = { ...fa, name: e.target.value };
                            updateConfig({ featuredAlumni: updated });
                          }}
                          className="w-full px-2 py-1 text-xs rounded-lg font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                        />
                        <div className="text-[11px] text-slate-400 mt-1">Batch {fa.batch} • {fa.category}</div>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400">Designation &amp; Institution</label>
                      <input
                        type="text"
                        value={fa.designation}
                        onChange={(e) => {
                          const updated = [...config.featuredAlumni];
                          updated[idx] = { ...fa, designation: e.target.value };
                          updateConfig({ featuredAlumni: updated });
                        }}
                        className="w-full px-2 py-1 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 mb-1"
                      />
                      <input
                        type="text"
                        value={fa.institution}
                        onChange={(e) => {
                          const updated = [...config.featuredAlumni];
                          updated[idx] = { ...fa, institution: e.target.value };
                          updateConfig({ featuredAlumni: updated });
                        }}
                        className="w-full px-2 py-1 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400">Achievement Summary</label>
                      <textarea
                        rows={2}
                        value={fa.achievementSummary}
                        onChange={(e) => {
                          const updated = [...config.featuredAlumni];
                          updated[idx] = { ...fa, achievementSummary: e.target.value };
                          updateConfig({ featuredAlumni: updated });
                        }}
                        className="w-full px-2 py-1 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/50 dark:border-slate-700/50 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = config.featuredAlumni.filter((_, i) => i !== idx);
                          updateConfig({ featuredAlumni: updated });
                          showToast('Removed from Hall of Fame.', 'info');
                        }}
                        className="text-rose-600 hover:underline font-bold cursor-pointer flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 10: CONTROLS, INQUIRIES & IMMUTABLE AUDIT TRAIL - STRICTLY SUPER ADMIN */}
        {/* ================================================================= */}
        {activeTab === 'controls_audit' && isSuperAdmin && (
          <div className="space-y-6">
            {/* Inquiry Desk */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-600" />
                <span>Alumni &amp; Visitor Inquiry Desk ({contactInquiries.length})</span>
              </h2>

              <div className="space-y-3 pt-1">
                {contactInquiries.map((inq) => (
                  <div
                    key={inq.id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {inq.senderName}
                        </span>
                        <span className="text-xs text-slate-400">({inq.email} • {inq.phone})</span>
                      </div>
                      <div className="font-semibold text-xs text-blue-600 dark:text-blue-400">
                        {inq.subject}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                        {inq.message}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={inq.status}
                        onChange={async (e) => {
                          await updateContactInquiryStatus({ id: inq.id, status: e.target.value as any });
                          showToast('Inquiry status updated', 'success');
                          loadInquiries();
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold"
                      >
                        <option value="new">New</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Immutable Audit Trail */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <History className="w-5 h-5 text-indigo-600" />
                    <span>Immutable System Audit Trail</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Security log recording administrative actions, role modifications, and verifications.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={loadAuditLogs}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                </button>
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-black uppercase px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                          {log.action}
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {log.actorName}
                        </span>
                      </div>
                      <p className="text-slate-500 mt-1">
                        {log.reason || `Modified table: ${log.entityTable} (Record #${log.entityId})`}
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* MODAL 1: VIEW ANYONE'S FULL PROFILE INSPECTION MODAL (Requirement #3) */}
      {/* =================================================================== */}
      {inspectingUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                <span>Administrative Profile Inspection</span>
              </h3>
              <button
                type="button"
                onClick={() => setInspectingUser(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-4">
              <img
                src={inspectingUser.avatarUrl}
                alt={inspectingUser.fullName}
                className="w-16 h-16 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
              />
              <div>
                <h4 className="text-lg font-black text-slate-900 dark:text-white">
                  {inspectingUser.fullName}
                </h4>
                <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold">
                  Batch {inspectingUser.batchYear} • Roll: {inspectingUser.collegeRoll || 'N/A'}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {inspectingUser.profession || 'Doctor / Physician'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div>
                <span className="text-slate-400 font-bold block">Stream &amp; Section</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {inspectingUser.academicStream || 'MBBS'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-bold block">Institution</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {inspectingUser.institution || 'SZMCH'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-bold block">Location</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {inspectingUser.city || 'Bogura'}, {inspectingUser.country || 'Bangladesh'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-bold block">System Role</span>
                <span className="font-black uppercase text-indigo-600 dark:text-indigo-400">
                  {inspectingUser.role}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (onViewProfile) onViewProfile(inspectingUser.userId);
                  setInspectingUser(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open Full Public Profile Page</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: EDIT ALUMNUS DETAILS MODAL */}
      {/* =================================================================== */}
      {editingProfile && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Edit className="w-5 h-5 text-indigo-600" />
                <span>Edit Alumnus Details</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingProfile(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProfileEdit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  value={profileEditForm.fullName}
                  onChange={(e) => setProfileEditForm((prev) => ({ ...prev, fullName: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Batch Year (1-35)</label>
                  <input
                    type="number"
                    value={profileEditForm.batchYear}
                    onChange={(e) => setProfileEditForm((prev) => ({ ...prev, batchYear: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">College Roll</label>
                  <input
                    type="text"
                    value={profileEditForm.collegeRoll}
                    onChange={(e) => setProfileEditForm((prev) => ({ ...prev, collegeRoll: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Profession</label>
                  <input
                    type="text"
                    value={profileEditForm.profession}
                    onChange={(e) => setProfileEditForm((prev) => ({ ...prev, profession: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Institution</label>
                  <input
                    type="text"
                    value={profileEditForm.institution}
                    onChange={(e) => setProfileEditForm((prev) => ({ ...prev, institution: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setEditingProfile(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 3: ROLE CHANGE MODAL */}
      {/* =================================================================== */}
      {roleModalUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="font-black text-base text-slate-900 dark:text-white">
              Assign Role for {roleModalUser.fullName}
            </h3>
            <p className="text-xs text-slate-500">
              Select the administrative level to assign to this alumnus account.
            </p>

            <div className="space-y-2 pt-2">
              {(['member', 'moderator', 'admin'] as const).map((r) => (
                <label
                  key={r}
                  className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${
                    selectedNewRole === r
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <span className="font-bold text-xs uppercase">{r}</span>
                  <input
                    type="radio"
                    name="newRole"
                    checked={selectedNewRole === r}
                    onChange={() => setSelectedNewRole(r)}
                    className="w-4 h-4 text-indigo-600"
                  />
                </label>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isUpdatingRole}
                onClick={handleConfirmRoleChange}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isUpdatingRole ? 'Updating...' : 'Confirm Role Change'}
              </button>
              <button
                type="button"
                onClick={() => setRoleModalUser(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 4: APPOINT SUB-ADMIN MODAL */}
      {/* =================================================================== */}
      {showAddSmallAdminModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
              <UserCog className="w-5 h-5 text-indigo-600" />
              <span>Appoint Sub-Admin</span>
            </h3>

            <form onSubmit={handleCreateSmallAdmin} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  value={newAdminForm.fullName}
                  onChange={(e) => setNewAdminForm((prev) => ({ ...prev, fullName: e.target.value }))}
                  placeholder="Dr. Tanvir Ahmed"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  value={newAdminForm.email}
                  onChange={(e) => setNewAdminForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="tanvir.szmc@gmail.com"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Delegated Responsibilities &amp; Notes</label>
                <input
                  type="text"
                  value={newAdminForm.notes}
                  onChange={(e) => setNewAdminForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Batch 20 coordinator &amp; ID review team"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                <span className="font-bold text-slate-700 dark:text-slate-300 block">Granular Permissions</span>
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={newAdminForm.canVerifyAlumni}
                    onChange={(e) => setNewAdminForm((prev) => ({ ...prev, canVerifyAlumni: e.target.checked }))}
                    className="w-3.5 h-3.5 rounded text-blue-600"
                  />
                  <span>Can inspect and approve ID verification documents</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={newAdminForm.canDeletePosts}
                    onChange={(e) => setNewAdminForm((prev) => ({ ...prev, canDeletePosts: e.target.checked }))}
                    className="w-3.5 h-3.5 rounded text-blue-600"
                  />
                  <span>Can moderate/delete community posts</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={newAdminForm.canViewDirectory}
                    onChange={(e) => setNewAdminForm((prev) => ({ ...prev, canViewDirectory: e.target.checked }))}
                    className="w-3.5 h-3.5 rounded text-blue-600"
                  />
                  <span>Can view complete unredacted alumni directory</span>
                </label>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Appoint Sub-Admin
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddSmallAdminModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 5: DOCUMENT LIGHTBOX */}
      {/* =================================================================== */}
      {documentLightboxUrl && (
        <div
          onClick={() => setDocumentLightboxUrl(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <img
              src={documentLightboxUrl}
              alt="Verification Document"
              className="max-w-full max-h-[82vh] object-contain rounded-2xl shadow-2xl border border-white/20"
            />
            <button
              type="button"
              onClick={() => setDocumentLightboxUrl(null)}
              className="mt-3 px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs backdrop-blur-md"
            >
              Close Inspection Lightbox
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminHubView;
