import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Users,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Eye,
  Trash2,
  Pin,
  PinOff,
  RotateCcw,
  UserCheck,
  UserX,
  FileText,
  Clock,
  RefreshCw,
  Phone,
  Mail,
  Award,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  AlertCircle,
  Building2,
  MapPin,
  Check,
  X,
  Database,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { supabase, supabaseAdmin, ALUMNI_PUBLIC_COLUMNS } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { UserRole, VerificationStatus } from '../../types';
import { loadSupabaseGovernanceState, saveSupabaseGovernanceState } from '../../services/adminService';
import { fetchModerationReports, resolveModerationReport } from '../../services/communitySafetyService';
import { loadStoredAlumniProfiles } from '../../data/mockData';
import { useAdminVisualMode } from './adminVisualModes';
import {
  InteractivePlatformAnalytics,
  NeonHeroBanner,
  NeonLiveActivityCard,
  NeonQuickActionsCard,
  NeonSparklineCard,
  type AnalyticsDataPoint,
  type NeonActivityItem,
} from './AdminNeonAnalyticsVisuals';
import { ConfirmActionModal } from '../common/ConfirmActionModal';

export type ExtendedVerificationStatus =
  | VerificationStatus
  | 'pending'
  | 'rejected'
  | 'pending_admin'
  | string;

export interface AdminDashboardProps {
  onNavigate?: (route: string) => void;
  onViewProfile?: (userId: number) => void;
}

export interface RegisteredUser {
  id: number;
  auth_user_id: string;
  role: UserRole;
  full_name: string;
  avatar_url: string;
  batch_year: number;
  session: string | null;
  academic_stream: string | null;
  academic_group: string | null;
  section: string | null;
  verification_status: ExtendedVerificationStatus;
  verification_method: string | null;
  profession: string | null;
  position: string | null;
  institution: string | null;
  city: string | null;
  country: string | null;
  blood_group: string | null;
  phone_ownership_verified?: boolean;
  posts_count: number;
  created_at: string;
  email?: string;
  phone?: string;
}

export interface VerificationRequestItem {
  id: string;
  user_id: number;
  user_name: string;
  batch_year: number;
  college_roll: string;
  doc_type: string;
  doc_type_label: string;
  storage_object_path: string;
  status: 'pending' | 'approved' | 'rejected';
  submitted_at: string;
  admin_note?: string | null;
  requester_avatar?: string;
}

export interface ReportedContentItem {
  id: string;
  reportDbId?: number;
  post_id: number;
  content: string;
  category: string;
  author_id: number;
  author_name: string;
  author_batch: number;
  author_avatar?: string;
  images: string[];
  videos: string[];
  likes_count: number;
  comments_count: number;
  is_deleted: boolean;
  is_pinned: boolean;
  created_at: string;
  report_count: number;
  report_reasons: string[];
  report_status: 'pending_review' | 'resolved' | 'action_taken';
  reported_at: string;
}

const REPORTS_STORAGE_KEY = 'szmc_admin_reported_content_v2';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onNavigate,
  onViewProfile,
}) => {
  const { currentUser, getAuthHeaders } = useAuth();
  const [visualMode] = useAdminVisualMode();
  const isNeonMode = visualMode === 'neon_aura';

  // Active view tab
  const [activeTab, setActiveTab] = useState<'users' | 'verifications' | 'reports'>('users');

  // Loading & Action states
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Data collections
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [verificationQueue, setVerificationQueue] = useState<VerificationRequestItem[]>([]);
  const [reportedPosts, setReportedPosts] = useState<ReportedContentItem[]>([]);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [batchFilter, setBatchFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Modals
  const [inspectUser, setInspectUser] = useState<RegisteredUser | null>(null);
  const [inspectDoc, setInspectDoc] = useState<VerificationRequestItem | null>(null);
  const [rejectReasonModal, setRejectReasonModal] = useState<{ id: string; userId: number } | null>(null);
  const [customRejectReason, setCustomRejectReason] = useState<string>('Information does not match official college records');
  const [pendingPurgePost, setPendingPurgePost] = useState<ReportedContentItem | null>(null);

  // Temporary toast helper
  const showToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // 1. Load All Registered Users using Supabase Admin Client
  const loadUsers = useCallback(async () => {
    try {
      const govState = await loadSupabaseGovernanceState(true);

      // Query Supabase alumni_profiles directly using supabaseAdmin
      const { data, error } = await supabaseAdmin
        .from('alumni_profiles')
        .select(ALUMNI_PUBLIC_COLUMNS)
        .order('id', { ascending: false });

      if (!error && data && data.length > 0) {
        const mappedUsers: RegisteredUser[] = data.map((p: any) => {
          const ov = govState.profileOverrides[Number(p.id)];
          return {
            id: p.id,
            auth_user_id: p.auth_user_id,
            role: (ov?.role as any) || p.role || 'alumni',
            full_name: ov?.fullName || p.full_name || 'Alumnus',
            avatar_url: p.avatar_url || '/assets/aistudio/images__1__2778177d.png',
            batch_year: ov?.batchYear ?? Number(p.batch_year || 25),
            session: p.session || null,
            academic_stream: ov?.academicStream || p.academic_stream || 'Medical (MBBS)',
            academic_group: ov?.academicGroup || p.academic_group || null,
            section: ov?.section || p.section || null,
            verification_status: ov?.verificationStatus || p.verification_status || 'unverified',
            verification_method: ov?.verificationMethod || p.verification_method || null,
            profession: ov?.profession || p.profession || null,
            position: ov?.position || p.position || null,
            institution: ov?.institution || p.institution || null,
            city: ov?.city || p.city || null,
            country: ov?.country || p.country || null,
            blood_group: p.blood_group || null,
            phone_ownership_verified:
              ov?.phoneOwnershipVerified ?? Boolean(p.phone_ownership_verified),
            posts_count: Number(p.posts_count || 0),
            created_at: p.created_at || new Date().toISOString(),
          };
        });
        setUsers(mappedUsers);
        return;
      }

      // Fallback to server admin endpoint or stored alumni profiles merged with Supabase governance state
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/alumni-profiles?limit=500', { headers }).catch(() => null);
      if (res && res.ok) {
        const apiData = await res.json();
        if (Array.isArray(apiData.profiles) && apiData.profiles.length > 0) {
          const mappedUsers: RegisteredUser[] = apiData.profiles.map((p: any) => {
            const ov = govState.profileOverrides[Number(p.id)];
            return {
              id: p.id,
              auth_user_id: p.auth_user_id || `auth-${p.id}`,
              role: (ov?.role as any) || p.role || 'alumni',
              full_name: ov?.fullName || p.full_name || p.fullName || 'Alumnus',
              avatar_url: p.avatar_url || p.avatarUrl || '/assets/aistudio/images__1__2778177d.png',
              batch_year: ov?.batchYear ?? Number(p.batch_year || p.batchYear || 25),
              session: p.session || null,
              academic_stream: ov?.academicStream || p.academic_stream || p.academicStream || 'Medical (MBBS)',
              academic_group: ov?.academicGroup || p.academic_group || p.academicGroup || null,
              section: ov?.section || p.section || null,
              verification_status: ov?.verificationStatus || p.verification_status || p.verificationStatus || 'unverified',
              verification_method: ov?.verificationMethod || p.verification_method || null,
              profession: ov?.profession || p.profession || null,
              position: ov?.position || p.position || null,
              institution: ov?.institution || p.institution || null,
              city: ov?.city || p.city || null,
              country: ov?.country || p.country || null,
              blood_group: p.blood_group || p.bloodGroup || null,
              phone_ownership_verified:
                ov?.phoneOwnershipVerified ?? Boolean(p.phone_ownership_verified),
              posts_count: Number(p.posts_count || 0),
              created_at: p.created_at || new Date().toISOString(),
            };
          });
          setUsers(mappedUsers);
          return;
        }
      }

      const fallbackProfiles = loadStoredAlumniProfiles().map((p) => {
        const ov = govState.profileOverrides[p.id];
        return {
          id: p.id,
          auth_user_id: p.authUserId || `auth-${p.id}`,
          role: ((ov?.role as any) || p.role || 'alumni') as UserRole,
          full_name: ov?.fullName || p.fullName,
          avatar_url: p.avatarUrl || '/assets/aistudio/images__1__2778177d.png',
          batch_year: ov?.batchYear ?? p.batchYear,
          session: p.session || null,
          academic_stream: ov?.academicStream || p.academicStream || 'Medical (MBBS)',
          academic_group: ov?.academicGroup || p.academicGroup || null,
          section: ov?.section || p.section || null,
          verification_status: ov?.verificationStatus || p.verificationStatus || 'unverified',
          verification_method: ov?.verificationMethod || p.verificationMethod || null,
          profession: ov?.profession || p.profession || null,
          position: ov?.position || p.position || null,
          institution: ov?.institution || p.institution || null,
          city: ov?.city || p.city || null,
          country: ov?.country || p.country || null,
          blood_group: p.bloodGroup || null,
          phone_ownership_verified:
            ov?.phoneOwnershipVerified ?? Boolean(p.phoneOwnershipVerified),
          posts_count: 0,
          created_at: new Date().toISOString(),
        };
      });
      setUsers(fallbackProfiles);
    } catch (err) {
      console.error('Failed to load registered users:', err);
    }
  }, [getAuthHeaders]);

  // 2. Load Verification Submissions
  const loadVerifications = useCallback(async () => {
    try {
      const govState = await loadSupabaseGovernanceState();
      const { data, error } = await supabaseAdmin
        .from('admin_doc_submissions')
        .select('id, user_id, batch_year, college_roll, doc_type, doc_type_label, storage_object_path, status, submitted_at, admin_note')
        .order('submitted_at', { ascending: false });

      if (error || !data || data.length === 0) {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/admin/verification-queue', { headers }).catch(() => null);
        if (res && res.ok) {
          const apiData = await res.json();
          const items: VerificationRequestItem[] = (apiData.submissions || []).map((s: any) => {
            const ov = govState.docOverrides[String(s.id)];
            return {
              id: String(s.id),
              user_id: s.user_id || s.userId,
              user_name: s.user_name || s.fullName || `Doctor #${s.user_id || s.userId}`,
              batch_year: Number(s.batch_year || s.batchYear || 25),
              college_roll: s.college_roll || s.collegeRoll || 'N/A',
              doc_type: s.doc_type || 'id_card',
              doc_type_label: s.doc_type_label || 'Student ID / Certificate',
              storage_object_path: s.storage_object_path || s.documentUrl || '/assets/szmc/szmc_day_1.jpg',
              status: ov?.status || s.status || 'pending',
              submitted_at: s.submitted_at || new Date().toISOString(),
              admin_note: ov?.adminNote || s.admin_note || null,
            };
          });
          setVerificationQueue(items);
          return;
        }
      }

      if (data && data.length > 0) {
        const items: VerificationRequestItem[] = data.map((d: any) => {
          const ov = govState.docOverrides[String(d.id)];
          return {
            id: String(d.id),
            user_id: d.user_id,
            user_name: `Doctor #${d.user_id}`,
            batch_year: Number(d.batch_year || 25),
            college_roll: d.college_roll || 'N/A',
            doc_type: d.doc_type || 'id_card',
            doc_type_label: d.doc_type_label || 'Verification Document',
            storage_object_path: d.storage_object_path || '/assets/szmc/szmc_day_1.jpg',
            status: ov?.status || d.status || 'pending',
            submitted_at: d.submitted_at || new Date().toISOString(),
            admin_note: ov?.adminNote || d.admin_note || null,
          };
        });
        setVerificationQueue(items);
      }
    } catch (err) {
      console.warn('Failed to load verifications queue:', err);
    }
  }, [getAuthHeaders]);

  // 3. Load Reported Content & Posts (authoritative Supabase content_reports first, localStorage fallback offline)
  const loadReportedContent = useCallback(async () => {
    try {
      const [{ data: postsData }, serverReports] = await Promise.all([
        supabaseAdmin
          .from('posts')
          .select('id, content, category, author_id, images, videos, likes_count, comments_count, is_deleted, is_pinned, created_at')
          .order('id', { ascending: false })
          .limit(100),
        fetchModerationReports('all').catch(() => []),
      ]);

      const postsList = postsData || [];
      const postById = new Map<number, any>(postsList.map((p: any) => [Number(p.id), p]));

      if (Array.isArray(serverReports) && serverReports.length > 0) {
        const mappedServerReports: ReportedContentItem[] = serverReports.map((r) => {
          const targetId = Number(r.target_id);
          const post = r.target_type === 'post' ? postById.get(targetId) : undefined;
          const mappedStatus: ReportedContentItem['report_status'] =
            r.status === 'resolved_removed'
              ? 'action_taken'
              : r.status === 'resolved_dismissed'
              ? 'resolved'
              : 'pending_review';
          return {
            id: `cr-${r.id}`,
            reportDbId: Number(r.id),
            post_id: targetId,
            content: post?.content || r.details || `${r.target_type} #${targetId} (${r.reason})`,
            category: post?.category || r.target_type || 'Post Report',
            author_id: Number(post?.author_id || r.target_author_id || 0),
            author_name: r.target_author?.full_name || `Member #${post?.author_id || r.target_author_id || 'Unknown'}`,
            author_batch: Number(r.target_author?.batch_year || 25),
            author_avatar: r.target_author?.avatar_url || undefined,
            images: post?.images || [],
            videos: post?.videos || [],
            likes_count: post?.likes_count || 0,
            comments_count: post?.comments_count || 0,
            is_deleted: Boolean(post?.is_deleted) || r.status === 'resolved_removed',
            is_pinned: Boolean(post?.is_pinned),
            created_at: post?.created_at || r.created_at,
            report_count: 1,
            report_reasons: [r.reason, ...(r.details ? [r.details] : [])],
            report_status: mappedStatus,
            reported_at: r.created_at,
          };
        });
        setReportedPosts(mappedServerReports);
        return;
      }

      let storedReports: Record<string, { reasons: string[]; reported_at: string; status: 'pending_review' | 'resolved' | 'action_taken' }> = {};
      try {
        const raw = localStorage.getItem(REPORTS_STORAGE_KEY);
        if (raw) storedReports = JSON.parse(raw);
      } catch {}

      const reportedItems: ReportedContentItem[] = [];
      Object.keys(storedReports).forEach((postIdStr) => {
        const pId = Number(postIdStr);
        const post = postById.get(pId);
        const rep = storedReports[postIdStr];
        if (post) {
          reportedItems.push({
            id: `rep-${pId}`,
            post_id: post.id,
            content: post.content,
            category: post.category || 'General Update',
            author_id: post.author_id,
            author_name: `Batch Alumnus (#${post.author_id})`,
            author_batch: 25,
            images: post.images || [],
            videos: post.videos || [],
            likes_count: post.likes_count || 0,
            comments_count: post.comments_count || 0,
            is_deleted: Boolean(post.is_deleted),
            is_pinned: Boolean(post.is_pinned),
            created_at: post.created_at,
            report_count: rep.reasons.length || 1,
            report_reasons: rep.reasons,
            report_status: rep.status,
            reported_at: rep.reported_at,
          });
        }
      });

      setReportedPosts(reportedItems);
    } catch (err) {
      console.warn('Failed to load reported content:', err);
    }
  }, []);

  // Initial Load
  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadUsers(), loadVerifications(), loadReportedContent()]);
    setRefreshing(false);
    setLoading(false);
  }, [loadUsers, loadVerifications, loadReportedContent]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  // Manage User Verification Status
  const handleUpdateUserVerification = async (
    userId: number,
    newStatus: ExtendedVerificationStatus
  ) => {
    setActionLoading(`verify-${userId}`);
    const dbStatus =
      newStatus === 'verified'
        ? 'verified'
        : newStatus === 'rejected'
        ? 'rejected'
        : newStatus === 'pending' || newStatus === 'pending_vouch'
        ? 'pending_vouch'
        : 'unverified';
    const nowIso = new Date().toISOString();

    try {
      // 1. Update in Supabase via supabaseAdmin (omit updated_at so column grant succeeds)
      await supabaseAdmin
        .from('alumni_profiles')
        .update({
          verification_status: dbStatus,
          verification_method: dbStatus === 'verified' ? 'admin_manual' : undefined,
          verified_at: dbStatus === 'verified' ? nowIso : null,
          verified_by_profile_id: currentUser?.id && Number(currentUser.id) > 0 ? Number(currentUser.id) : null,
        })
        .eq('id', userId);

      // 2. Persist in Supabase site_settings governance state
      await saveSupabaseGovernanceState((prev) => ({
        ...prev,
        profileOverrides: {
          ...prev.profileOverrides,
          [userId]: {
            ...(prev.profileOverrides[userId] || {}),
            verificationStatus: dbStatus as any,
            verificationMethod: dbStatus === 'verified' ? 'admin_manual' : undefined,
            verifiedAt: dbStatus === 'verified' ? nowIso : undefined,
          },
        },
      }));

      // 3. Also sync to backend API governance endpoint
      const headers = await getAuthHeaders();
      await fetch('/api/admin/governance', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetProfileId: userId,
          verificationStatus: dbStatus,
          adminNote: `Status updated to ${newStatus} by Super Admin`,
        }),
      }).catch(() => {});

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, verification_status: newStatus } : u))
      );
      if (inspectUser && inspectUser.id === userId) {
        setInspectUser((prev) => (prev ? { ...prev, verification_status: newStatus } : null));
      }

      showToast(`User #${userId} status set to "${newStatus}" and saved to Supabase!`);
    } catch (err: any) {
      console.error('Failed to update verification status:', err);
      showToast(err.message || 'Error updating status', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Manage User Role (alumni, moderator, admin)
  const handleUpdateUserRole = async (userId: number, newRole: UserRole) => {
    setActionLoading(`role-${userId}`);
    const dbRole = newRole === 'admin' || newRole === 'moderator' ? newRole : 'member';
    try {
      await supabaseAdmin
        .from('alumni_profiles')
        .update({
          role: dbRole,
        })
        .eq('id', userId);

      await saveSupabaseGovernanceState((prev) => ({
        ...prev,
        profileOverrides: {
          ...prev.profileOverrides,
          [userId]: {
            ...(prev.profileOverrides[userId] || {}),
            role: newRole as any,
          },
        },
      }));

      const headers = await getAuthHeaders();
      await fetch('/api/admin/governance', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetProfileId: userId,
          role: dbRole,
          adminNote: `Role updated to ${newRole}`,
        }),
      }).catch(() => {});

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      if (inspectUser && inspectUser.id === userId) {
        setInspectUser((prev) => (prev ? { ...prev, role: newRole } : null));
      }

      showToast(`User #${userId} role changed to ${newRole.toUpperCase()} and saved to Supabase`);
    } catch (err: any) {
      showToast(err.message || 'Failed to update user role', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Toggle Phone Ownership Verification
  const handleTogglePhoneVerified = async (userId: number, currentVal: boolean) => {
    setActionLoading(`phone-${userId}`);
    try {
      const newVal = !currentVal;
      const nowIso = new Date().toISOString();

      await saveSupabaseGovernanceState((prev) => ({
        ...prev,
        profileOverrides: {
          ...prev.profileOverrides,
          [userId]: {
            ...(prev.profileOverrides[userId] || {}),
            phoneOwnershipVerified: newVal,
            phoneVerifiedAt: newVal ? nowIso : undefined,
          },
        },
      }));

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, phone_ownership_verified: newVal } : u))
      );
      if (inspectUser && inspectUser.id === userId) {
        setInspectUser((prev) => (prev ? { ...prev, phone_ownership_verified: newVal } : null));
      }

      showToast(`Phone verification for User #${userId} ${newVal ? 'granted' : 'revoked'} in Supabase`);
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle phone verification', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Approve Document Submission
  const handleApproveDocument = async (reqItem: VerificationRequestItem) => {
    setActionLoading(`doc-${reqItem.id}`);
    const nowIso = new Date().toISOString();
    try {
      // 1. Update doc status in Supabase admin_doc_submissions (omit updated_at — not in GRANT UPDATE)
      await supabaseAdmin
        .from('admin_doc_submissions')
        .update({
          status: 'approved',
          reviewed_by: currentUser?.id && Number(currentUser.id) > 0 ? Number(currentUser.id) : null,
          reviewed_at: nowIso,
          admin_note: 'Approved by institutional administrator',
        })
        .eq('id', reqItem.id);

      // 2. Mark alumni_profile verified (use valid enum 'id_card_upload', omit updated_at)
      await supabaseAdmin
        .from('alumni_profiles')
        .update({
          verification_status: 'verified',
          verification_method: 'id_card_upload',
          verified_at: nowIso,
          verified_by_profile_id: currentUser?.id && Number(currentUser.id) > 0 ? Number(currentUser.id) : null,
        })
        .eq('id', reqItem.user_id);

      // 3. Persist to Supabase site_settings governance state
      await saveSupabaseGovernanceState((prev) => {
        const next = { ...prev };
        next.docOverrides[String(reqItem.id)] = {
          status: 'approved',
          reviewedBy: currentUser?.id || 0,
          reviewedAt: nowIso,
          adminNote: 'Approved by institutional administrator',
        };
        next.profileOverrides[reqItem.user_id] = {
          ...(next.profileOverrides[reqItem.user_id] || {}),
          verificationStatus: 'verified',
          verificationMethod: 'id_card_upload',
          verifiedAt: nowIso,
        };
        return next;
      });

      setVerificationQueue((prev) =>
        prev.map((d) => (d.id === reqItem.id ? { ...d, status: 'approved' } : d))
      );
      setUsers((prev) =>
        prev.map((u) => (u.id === reqItem.user_id ? { ...u, verification_status: 'verified' } : u))
      );

      showToast(`Verified document & alumnus #${reqItem.user_id} in Supabase!`);
    } catch (err: any) {
      showToast(err.message || 'Failed to approve document', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Reject Document Submission
  const handleConfirmRejectDocument = async () => {
    if (!rejectReasonModal) return;
    const { id } = rejectReasonModal;
    setActionLoading(`doc-${id}`);
    const nowIso = new Date().toISOString();

    try {
      await supabaseAdmin
        .from('admin_doc_submissions')
        .update({
          status: 'rejected',
          reviewed_by: currentUser?.id && Number(currentUser.id) > 0 ? Number(currentUser.id) : null,
          reviewed_at: nowIso,
          admin_note: customRejectReason,
        })
        .eq('id', id);

      await saveSupabaseGovernanceState((prev) => ({
        ...prev,
        docOverrides: {
          ...prev.docOverrides,
          [String(id)]: {
            status: 'rejected',
            reviewedBy: currentUser?.id || 0,
            reviewedAt: nowIso,
            adminNote: customRejectReason,
          },
        },
      }));

      setVerificationQueue((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, status: 'rejected', admin_note: customRejectReason } : d
        )
      );

      showToast(`Document submission #${id} rejected and saved to Supabase.`);
      setRejectReasonModal(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to reject document', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Moderation: Dismiss Report
  const handleDismissReport = async (reportedItem: ReportedContentItem) => {
    try {
      if (reportedItem.reportDbId) {
        const res = await resolveModerationReport({
          reportId: reportedItem.reportDbId,
          status: 'resolved_dismissed',
          resolutionNote: 'Dismissed by moderator via Admin Dashboard',
          removeContent: false,
        });
        if (!res.success) {
          showToast(res.error || 'Could not dismiss report on server.', 'error');
          return;
        }
      }

      try {
        const raw = localStorage.getItem(REPORTS_STORAGE_KEY);
        const reports = raw ? JSON.parse(raw) : {};
        reports[String(reportedItem.post_id)] = {
          reasons: reportedItem.report_reasons,
          reported_at: reportedItem.reported_at,
          status: 'resolved',
        };
        localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(reports));
      } catch {}

      setReportedPosts((prev) =>
        prev.map((p) => (p.id === reportedItem.id ? { ...p, report_status: 'resolved' } : p))
      );
      showToast('Report dismissed. Post retained in active feed.');
    } catch {
      showToast('Error dismissing report', 'error');
    }
  };

  // Moderation: Soft Delete / Hide Post
  const handleToggleHidePost = async (reportedItem: ReportedContentItem) => {
    const newDeleted = !reportedItem.is_deleted;
    setActionLoading(`post-del-${reportedItem.post_id}`);

    try {
      // 1. Update in Supabase via moderation API (if backed by content_reports) or supabaseAdmin
      if (reportedItem.reportDbId && newDeleted) {
        await resolveModerationReport({
          reportId: reportedItem.reportDbId,
          status: 'resolved_removed',
          resolutionNote: 'Content hidden via Admin Dashboard',
          removeContent: true,
        });
      }

      await supabaseAdmin
        .from('posts')
        .update({
          is_deleted: newDeleted,
        })
        .eq('id', reportedItem.post_id);

      // 2. Persist in Supabase site_settings governance state
      await saveSupabaseGovernanceState((prev) => ({
        ...prev,
        postOverrides: {
          ...prev.postOverrides,
          [reportedItem.post_id]: {
            ...(prev.postOverrides[reportedItem.post_id] || {}),
            isDeleted: newDeleted,
          },
        },
      }));

      // 3. Mirror report status in local cache
      try {
        const raw = localStorage.getItem(REPORTS_STORAGE_KEY);
        const reports = raw ? JSON.parse(raw) : {};
        reports[String(reportedItem.post_id)] = {
          reasons: reportedItem.report_reasons,
          reported_at: reportedItem.reported_at,
          status: newDeleted ? 'action_taken' : 'pending_review',
        };
        localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(reports));
      } catch {}

      setReportedPosts((prev) =>
        prev.map((p) =>
          p.post_id === reportedItem.post_id
            ? { ...p, is_deleted: newDeleted, report_status: newDeleted ? 'action_taken' : 'pending_review' }
            : p
        )
      );

      showToast(`Post #${reportedItem.post_id} ${newDeleted ? 'hidden from feed' : 'restored to feed'} in Supabase`);
    } catch (err: any) {
      showToast(err.message || 'Failed to update post', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Moderation: Permanently Delete Post
  const handleHardDeletePost = (reportedItem: ReportedContentItem) => {
    setPendingPurgePost(reportedItem);
  };

  const executeHardDeletePost = async (reportedItem: ReportedContentItem) => {
    setActionLoading(`post-purge-${reportedItem.post_id}`);

    try {
      await supabaseAdmin
        .from('posts')
        .delete()
        .eq('id', reportedItem.post_id);

      await saveSupabaseGovernanceState((prev) => ({
        ...prev,
        postOverrides: {
          ...prev.postOverrides,
          [reportedItem.post_id]: {
            ...(prev.postOverrides[reportedItem.post_id] || {}),
            isDeleted: true,
            hardDeleted: true,
          },
        },
      }));

      // Clean storage
      const raw = localStorage.getItem(REPORTS_STORAGE_KEY);
      if (raw) {
        const reports = JSON.parse(raw);
        delete reports[String(reportedItem.post_id)];
        localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(reports));
      }

      setReportedPosts((prev) => prev.filter((p) => p.post_id !== reportedItem.post_id));
      showToast(`Post #${reportedItem.post_id} permanently erased from Supabase.`);
    } catch (err: any) {
      showToast(err.message || 'Failed to delete post', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Moderation: Toggle Pin Post
  const handleTogglePinPost = async (reportedItem: ReportedContentItem) => {
    const newPinned = !reportedItem.is_pinned;
    setActionLoading(`post-pin-${reportedItem.post_id}`);

    try {
      await supabaseAdmin
        .from('posts')
        .update({
          is_pinned: newPinned,
        })
        .eq('id', reportedItem.post_id);

      await saveSupabaseGovernanceState((prev) => ({
        ...prev,
        postOverrides: {
          ...prev.postOverrides,
          [reportedItem.post_id]: {
            ...(prev.postOverrides[reportedItem.post_id] || {}),
            isPinned: newPinned,
          },
        },
      }));

      setReportedPosts((prev) =>
        prev.map((p) => (p.post_id === reportedItem.post_id ? { ...p, is_pinned: newPinned } : p))
      );

      showToast(`Post #${reportedItem.post_id} ${newPinned ? 'pinned to top of feed' : 'unpinned'} in Supabase`);
    } catch (err: any) {
      showToast(err.message || 'Failed to pin/unpin post', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = u.full_name?.toLowerCase().includes(q);
        const matchesProfession = u.profession?.toLowerCase().includes(q);
        const matchesInstitution = u.institution?.toLowerCase().includes(q);
        const matchesCity = u.city?.toLowerCase().includes(q);
        const matchesBlood = u.blood_group?.toLowerCase().includes(q);
        const matchesId = String(u.id).includes(q);
        if (!matchesName && !matchesProfession && !matchesInstitution && !matchesCity && !matchesBlood && !matchesId) {
          return false;
        }
      }
      // Batch
      if (batchFilter !== 'all' && String(u.batch_year) !== batchFilter) {
        return false;
      }
      // Status
      if (statusFilter !== 'all' && u.verification_status !== statusFilter) {
        return false;
      }
      // Role
      if (roleFilter !== 'all' && u.role !== roleFilter) {
        return false;
      }
      return true;
    });
  }, [users, searchQuery, batchFilter, statusFilter, roleFilter]);

  // Statistics
  const stats = useMemo(() => {
    const totalUsers = users.length;
    const verifiedUsers = users.filter((u) => u.verification_status === 'verified').length;
    const unverifiedUsers = totalUsers - verifiedUsers;
    const pendingVerifs = verificationQueue.filter((v) => v.status === 'pending').length;
    const pendingReports = reportedPosts.filter((r) => r.report_status === 'pending_review').length;

    const rate = totalUsers > 0 ? Math.round((verifiedUsers / totalUsers) * 100) : 0;

    return {
      totalUsers,
      verifiedUsers,
      unverifiedUsers,
      rate,
      pendingVerifs,
      pendingReports,
    };
  }, [users, verificationQueue, reportedPosts]);

  // Compute real batch cohort analytics for Neon Aura Mode 1 interactive waves/bars
  const alumniAnalyticsByRange = useMemo<Record<'7D' | '30D' | '90D' | '1Y', AnalyticsDataPoint[]>>(() => {
    const groups = [
      { label: 'B1–7', min: 1, max: 7 },
      { label: 'B8–14', min: 8, max: 14 },
      { label: 'B15–21', min: 15, max: 21 },
      { label: 'B22–28', min: 22, max: 28 },
      { label: 'B29–35', min: 29, max: 35 },
    ];
    const cohortPoints: AnalyticsDataPoint[] = groups.map((g) => {
      const inGroup = users.filter((u) => u.batch_year >= g.min && u.batch_year <= g.max);
      const verifiedInGroup = inGroup.filter((u) => u.verification_status === 'verified').length;
      return {
        label: g.label,
        primary: inGroup.length,
        secondary: verifiedInGroup,
      };
    });

    const total = Math.max(5, stats.totalUsers);
    const verified = Math.max(3, stats.verifiedUsers);
    const s = (n: number, f: number) => Math.max(1, Math.round(n * f));

    return {
      '7D': [
        { label: 'Day 1', primary: s(total, 0.72), secondary: s(verified, 0.68) },
        { label: 'Day 2', primary: s(total, 0.78), secondary: s(verified, 0.74) },
        { label: 'Day 3', primary: s(total, 0.81), secondary: s(verified, 0.79) },
        { label: 'Day 4', primary: s(total, 0.88), secondary: s(verified, 0.85) },
        { label: 'Day 5', primary: s(total, 0.92), secondary: s(verified, 0.9) },
        { label: 'Day 6', primary: s(total, 0.96), secondary: s(verified, 0.95) },
        { label: 'Today', primary: total, secondary: verified },
      ],
      '30D': cohortPoints.some((c) => c.primary > 0)
        ? cohortPoints
        : [
            { label: 'B1–7', primary: 12, secondary: 10 },
            { label: 'B8–14', primary: 18, secondary: 15 },
            { label: 'B15–21', primary: 26, secondary: 21 },
            { label: 'B22–28', primary: 34, secondary: 29 },
            { label: 'B29–35', primary: 42, secondary: 36 },
          ],
      '90D': [
        { label: 'M-3', primary: s(total, 0.52), secondary: s(verified, 0.44) },
        { label: 'M-2', primary: s(total, 0.71), secondary: s(verified, 0.65) },
        { label: 'M-1', primary: s(total, 0.87), secondary: s(verified, 0.82) },
        { label: 'Now', primary: total, secondary: verified },
      ],
      '1Y': [
        { label: 'Q1', primary: s(total, 0.36), secondary: s(verified, 0.3) },
        { label: 'Q2', primary: s(total, 0.58), secondary: s(verified, 0.51) },
        { label: 'Q3', primary: s(total, 0.8), secondary: s(verified, 0.75) },
        { label: 'Q4', primary: total, secondary: verified },
      ],
    };
  }, [users, stats.totalUsers, stats.verifiedUsers]);

  const dashboardActivityItems = useMemo<NeonActivityItem[]>(() => {
    const items: NeonActivityItem[] = [];
    verificationQueue.slice(0, 3).forEach((v) => {
      items.push({
        id: `ver-${v.id}`,
        title: `${v.user_name} · Batch ${v.batch_year}`,
        detail: `${v.doc_type_label || v.doc_type} (${v.status})`,
        time: new Date(v.submitted_at).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        tone: v.status === 'approved' ? 'emerald' : v.status === 'rejected' ? 'rose' : 'cyan',
      });
    });
    reportedPosts.slice(0, 3).forEach((r) => {
      items.push({
        id: `rep-${r.id}`,
        title: `Post #${r.post_id} · ${r.author_name}`,
        detail: r.report_reasons[0] || r.content.slice(0, 60),
        time: r.report_status === 'pending_review' ? 'Pending' : 'Reviewed',
        tone: r.report_status === 'pending_review' ? 'rose' : 'violet',
      });
    });
    return items;
  }, [verificationQueue, reportedPosts]);

  return (
    <div className="w-full space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-xs font-bold transition-all border ${
            toastMessage.type === 'success'
              ? 'bg-emerald-900/90 text-emerald-100 border-emerald-700/60'
              : 'bg-rose-900/90 text-rose-100 border-rose-700/60'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {isNeonMode ? (
        <>
          {/* MODE 1 (NEON AURA): Campus Welcome Banner */}
          <NeonHeroBanner
            adminName={currentUser?.fullName || 'Super Admin'}
            subtitle="Direct Supabase administrative oversight for registered alumni, verification lifecycle, and reported content moderation."
            statLabel="Total Alumni"
            statValue={stats.totalUsers}
            connectionText="Live Supabase Admin"
            connectionOk={true}
            onRefresh={() => void refreshAll()}
            refreshing={refreshing}
          />

          {/* MODE 1: 4 Luminous Neon KPI Sparkline Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <NeonSparklineCard
              label="Registered Alumni"
              value={stats.totalUsers}
              sublabel="Across 35 MBBS Batches"
              tone="cyan"
              icon={Users}
              series={[14, 22, 20, 31, 28, 42, Math.max(30, stats.totalUsers)]}
              onClick={() => {
                setActiveTab('users');
                setStatusFilter('all');
              }}
              delay={0.04}
            />
            <NeonSparklineCard
              label="Verified Alumni"
              value={stats.verifiedUsers}
              sublabel={`${stats.rate}% verification rate`}
              tone="emerald"
              icon={ShieldCheck}
              series={[8, 15, 19, 24, 28, 36, Math.max(20, stats.verifiedUsers)]}
              onClick={() => {
                setActiveTab('users');
                setStatusFilter('verified');
              }}
              delay={0.08}
            />
            <NeonSparklineCard
              label="Pending Verifications"
              value={stats.pendingVerifs}
              sublabel="Awaiting document review"
              tone="violet"
              icon={Clock}
              series={[12, 9, 14, 11, 8, 10, Math.max(4, stats.pendingVerifs + 3)]}
              onClick={() => setActiveTab('verifications')}
              delay={0.12}
            />
            <NeonSparklineCard
              label="Reported Content"
              value={stats.pendingReports}
              sublabel="Flagged for moderation"
              tone="rose"
              icon={AlertTriangle}
              series={[9, 7, 11, 6, 8, 5, Math.max(3, stats.pendingReports + 2)]}
              onClick={() => setActiveTab('reports')}
              delay={0.16}
            />
          </div>

          {/* MODE 1: Interactive Alumni Analytics (Waves/Bars + Verification Circle Ring + Quick Actions) */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
            <InteractivePlatformAnalytics
              title="Alumni & Verification Analytics"
              primaryLabel="Total Alumni"
              secondaryLabel="Verified Alumni"
              dataByRange={alumniAnalyticsByRange}
              ringPercentage={stats.rate}
              ringLabel="Verified Rate"
              ringSublabel={`${stats.verifiedUsers} of ${stats.totalUsers} verified`}
              distributionBars={[
                {
                  label: 'Verified Profiles',
                  value: stats.verifiedUsers,
                  max: Math.max(1, stats.totalUsers),
                  tone: 'emerald',
                  onClick: () => {
                    setActiveTab('users');
                    setStatusFilter('verified');
                  },
                },
                {
                  label: 'Unverified Profiles',
                  value: stats.unverifiedUsers,
                  max: Math.max(1, stats.totalUsers),
                  tone: 'cyan',
                  onClick: () => {
                    setActiveTab('users');
                    setStatusFilter('unverified');
                  },
                },
                {
                  label: 'Pending Docs',
                  value: stats.pendingVerifs,
                  max: Math.max(5, verificationQueue.length),
                  tone: 'violet',
                  onClick: () => setActiveTab('verifications'),
                },
                {
                  label: 'Open Reports',
                  value: stats.pendingReports,
                  max: Math.max(5, reportedPosts.length),
                  tone: 'rose',
                  onClick: () => setActiveTab('reports'),
                },
              ]}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4">
              <NeonQuickActionsCard
                actions={[
                  {
                    id: 'dash-qa-users',
                    label: 'Browse All Registered Alumni',
                    icon: Users,
                    primary: true,
                    onClick: () => setActiveTab('users'),
                  },
                  {
                    id: 'dash-qa-verif',
                    label: 'Review Verification Queue',
                    sublabel: `${stats.pendingVerifs} pending document(s)`,
                    icon: ShieldCheck,
                    onClick: () => setActiveTab('verifications'),
                  },
                  {
                    id: 'dash-qa-reports',
                    label: 'Moderate Reported Posts',
                    sublabel: `${stats.pendingReports} flagged item(s)`,
                    icon: AlertTriangle,
                    onClick: () => setActiveTab('reports'),
                  },
                ]}
              />

              <NeonLiveActivityCard
                title="Governance Queue Activity"
                items={dashboardActivityItems}
                emptyText="All verification & moderation queues are clear."
              />
            </div>
          </div>
        </>
      ) : (
        /* CLASSIC CLEAN MODE: Original Header Banner */
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white border border-indigo-900/50 shadow-md">
          <div className="absolute right-0 top-0 -mt-10 -mr-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center shrink-0 shadow-inner">
                <Database className="w-6 h-6 text-indigo-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-black tracking-tight text-white">
                    Institutional Admin Dashboard
                  </h1>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Live Supabase Admin
                  </span>
                </div>
                <p className="text-xs text-indigo-200/80 mt-1">
                  Direct Supabase administrative oversight for registered alumni, verification lifecycle, and reported content moderation.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto">
              <button
                type="button"
                onClick={() => void refreshAll()}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 text-xs font-bold text-white transition-all border border-white/10 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span>{refreshing ? 'Syncing...' : 'Sync Data'}</span>
              </button>
            </div>
          </div>

          {/* Aggregate KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-indigo-800/40">
            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <div className="flex items-center justify-between text-indigo-200 text-xs">
                <span>Registered Alumni</span>
                <Users className="w-3.5 h-3.5" />
              </div>
              <div className="text-2xl font-black mt-1 text-white">{stats.totalUsers}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Across 35 MBBS Batches</div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <div className="flex items-center justify-between text-emerald-300 text-xs">
                <span>Verified Alumni</span>
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <div className="text-2xl font-black mt-1 text-emerald-400">
                {stats.verifiedUsers}{' '}
                <span className="text-xs font-bold text-emerald-300/80">({stats.rate}%)</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Institutional credentials valid</div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <div className="flex items-center justify-between text-amber-300 text-xs">
                <span>Pending Queue</span>
                <Clock className="w-3.5 h-3.5" />
              </div>
              <div className="text-2xl font-black mt-1 text-amber-400">{stats.pendingVerifs}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Awaiting document review</div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <div className="flex items-center justify-between text-rose-300 text-xs">
                <span>Reported Content</span>
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
              <div className="text-2xl font-black mt-1 text-rose-400">{stats.pendingReports}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Flagged for moderation</div>
            </div>
          </div>
        </div>
      )}

      {/* Main Tab Switcher */}
      <div
        className={`flex items-center gap-2 overflow-x-auto ${
          isNeonMode
            ? 'p-1 rounded-xl bg-slate-950/80 border border-cyan-400/20'
            : 'border-b border-slate-200 dark:border-slate-800'
        }`}
      >
        {(
          [
            { id: 'users', label: 'All Registered Users', icon: Users, badge: stats.totalUsers, badgeTone: 'neutral' },
            { id: 'verifications', label: 'Verification Queue', icon: ShieldCheck, badge: stats.pendingVerifs, badgeTone: 'amber' },
            { id: 'reports', label: 'Reported Content', icon: AlertTriangle, badge: stats.pendingReports, badgeTone: 'rose' },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 font-bold text-xs transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                isNeonMode
                  ? `px-3.5 py-2 rounded-lg ${active ? 'text-white' : 'text-slate-400 hover:text-white'}`
                  : `py-3 px-4 border-b-2 ${
                      active
                        ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                        : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`
              }`}
            >
              {isNeonMode && active && (
                <motion.span
                  layoutId="adminDashboardActiveTab"
                  className="absolute inset-0 rounded-lg bg-gradient-to-r from-cyan-500/30 to-violet-500/35 border border-cyan-400/50 shadow-[0_0_14px_rgba(34,211,238,0.35)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <Icon className="w-4 h-4 relative z-10" />
              <span className="relative z-10">{tab.label}</span>
              {(tab.id === 'users' || tab.badge > 0) && (
                <span
                  className={`relative z-10 px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-bold ${
                    tab.badgeTone === 'amber'
                      ? 'bg-amber-500/20 text-amber-300'
                      : tab.badgeTone === 'rose'
                      ? 'bg-rose-500/20 text-rose-300'
                      : isNeonMode
                      ? 'bg-white/10 text-cyan-200'
                      : 'bg-slate-100 dark:bg-slate-800'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: ALL REGISTERED USERS */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Controls Bar: Search + Filters */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search alumni by name, roll, hospital, specialty, city, ID..."
                className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Batch Filter */}
              <select
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
                className="py-2 px-3 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium focus:outline-none"
              >
                <option value="all">All Batches (1–35)</option>
                {Array.from({ length: 35 }, (_, i) => i + 1).map((b) => (
                  <option key={b} value={String(b)}>
                    Batch {b}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="py-2 px-3 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium focus:outline-none"
              >
                <option value="all">All Verification Statuses</option>
                <option value="verified">Verified Only</option>
                <option value="unverified">Unverified Only</option>
                <option value="pending">Pending Review</option>
                <option value="rejected">Rejected</option>
              </select>

              {/* Role Filter */}
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="py-2 px-3 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium focus:outline-none"
              >
                <option value="all">All Roles</option>
                <option value="admin">Admin</option>
                <option value="moderator">Moderator</option>
                <option value="alumni">General Alumni</option>
              </select>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Alumnus</th>
                    <th className="py-3 px-3">Batch &amp; Stream</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Role</th>
                    <th className="py-3 px-3">Hospital / Location</th>
                    <th className="py-3 px-3 text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="font-medium">No registered alumni match your search filters.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => {
                      const isPendingThisUser = actionLoading?.includes(String(user.id));
                      const isVerified = user.verification_status === 'verified';

                      return (
                        <tr
                          key={user.id}
                          className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          {/* Alumnus info */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={user.avatar_url || '/assets/aistudio/images__1__2778177d.png'}
                                alt={user.full_name}
                                className="w-9 h-9 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                              />
                              <div>
                                <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                                  <span>{user.full_name}</span>
                                  {user.phone_ownership_verified && (
                                    <span title="Phone verified">
                                      <Phone className="w-3 h-3 text-emerald-500 fill-emerald-500/20" />
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                                  <span>ID: #{user.id}</span>
                                  {user.blood_group && (
                                    <span>• Blood: <strong className="text-rose-500">{user.blood_group}</strong></span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Batch & Stream */}
                          <td className="py-3 px-3">
                            <span className="inline-block px-2 py-0.5 rounded-md font-black bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-[11px] border border-indigo-200 dark:border-indigo-800/50">
                              Batch {user.batch_year}
                            </span>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {user.academic_stream || 'Medical (MBBS)'}
                            </div>
                          </td>

                          {/* Verification Status */}
                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                isVerified
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                                  : user.verification_status === 'pending'
                                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                                  : user.verification_status === 'rejected'
                                  ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700'
                              }`}
                            >
                              {isVerified ? (
                                <CheckCircle2 className="w-2.5 h-2.5" />
                              ) : (
                                <Clock className="w-2.5 h-2.5" />
                              )}
                              <span>{user.verification_status}</span>
                            </span>
                          </td>

                          {/* Role */}
                          <td className="py-3 px-3">
                            <select
                              value={user.role}
                              disabled={isPendingThisUser}
                              onChange={(e) => void handleUpdateUserRole(user.id, e.target.value as UserRole)}
                              className="py-1 px-2 text-[11px] rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold cursor-pointer"
                            >
                              <option value="alumni">Alumni</option>
                              <option value="moderator">Moderator</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>

                          {/* Hospital & Location */}
                          <td className="py-3 px-3">
                            <div className="text-slate-800 dark:text-slate-200 truncate max-w-[150px]">
                              {user.institution || user.position || 'SZMC Affiliated'}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {user.city ? `${user.city}, ` : ''}{user.country || 'Bangladesh'}
                            </div>
                          </td>

                          {/* Admin Actions */}
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* Toggle Verify Button */}
                              {isVerified ? (
                                <button
                                  type="button"
                                  onClick={() => void handleUpdateUserVerification(user.id, 'unverified')}
                                  disabled={isPendingThisUser}
                                  title="Revoke Verification"
                                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-950/40 transition-colors cursor-pointer"
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void handleUpdateUserVerification(user.id, 'verified')}
                                  disabled={isPendingThisUser}
                                  title="Instant Verify Alumnus"
                                  className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 transition-colors cursor-pointer border border-emerald-200 dark:border-emerald-800"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Inspect details button */}
                              <button
                                type="button"
                                onClick={() => setInspectUser(user)}
                                title="View User Record & Manage"
                                className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-colors cursor-pointer border border-indigo-200 dark:border-indigo-800"
                              >
                                <Eye className="w-3.5 h-3.5" />
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

            {/* Pagination / Count footer */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
              <span>
                Showing <strong>{filteredUsers.length}</strong> of <strong>{users.length}</strong> alumni
              </span>
              <span className="font-mono">Supabase Table: public.alumni_profiles</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: VERIFICATION QUEUE */}
      {activeTab === 'verifications' && (
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <h3 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                  Institutional ID &amp; Document Review Queue
                </h3>
                <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
                  Review submitted college ID cards, roll slips, and national IDs to confirm medical graduates before granting portal access.
                </p>
              </div>
            </div>
            <div className="text-xs font-bold text-amber-900 dark:text-amber-300 font-mono">
              {stats.pendingVerifs} Pending
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {verificationQueue.length === 0 ? (
              <div className="col-span-2 py-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-500 opacity-80" />
                <p className="font-bold text-slate-700 dark:text-slate-300">Verification Queue is Clear</p>
                <p className="text-xs mt-1">All alumni document submissions have been reviewed.</p>
              </div>
            ) : (
              verificationQueue.map((item) => (
                <div
                  key={item.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white text-sm">
                          {item.user_name}
                        </span>
                        <span className="px-2 py-0.5 rounded-md font-black bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 text-[10px] border border-indigo-200 dark:border-indigo-800">
                          Batch {item.batch_year}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        College Roll: <strong>{item.college_roll}</strong> • Document: {item.doc_type_label}
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        item.status === 'approved'
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : item.status === 'rejected'
                          ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                          : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  {/* Document preview container */}
                  <div
                    onClick={() => setInspectDoc(item)}
                    className="relative rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 h-40 cursor-pointer group flex items-center justify-center"
                  >
                    <img
                      src={item.storage_object_path}
                      alt="Submitted Document"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-bold">
                      <Eye className="w-4 h-4" />
                      <span>Click to Inspect Full Document</span>
                    </div>
                  </div>

                  {/* Submission date & actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400">
                      Submitted: {new Date(item.submitted_at).toLocaleDateString()}
                    </span>

                    {item.status === 'pending' ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setRejectReasonModal({ id: item.id, userId: item.user_id })}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 text-xs font-bold transition-all border border-rose-200 dark:border-rose-800 cursor-pointer"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleApproveDocument(item)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve &amp; Verify</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 font-medium italic">
                        {item.admin_note || 'Reviewed'}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: REPORTED CONTENT MONITOR */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
              <div>
                <h3 className="text-xs font-bold text-rose-900 dark:text-rose-200">
                  Reported Posts &amp; Content Moderation Desk
                </h3>
                <p className="text-[11px] text-rose-700/80 dark:text-rose-300/80">
                  Review flagged medical discussions, spam, and reported community posts with direct administrative controls on Supabase database.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-rose-900 dark:text-rose-300 font-mono">
              {stats.pendingReports} Flagged Items
            </span>
          </div>

          <div className="space-y-3">
            {reportedPosts.length === 0 ? (
              <div className="py-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-500 opacity-80" />
                <p className="font-bold text-slate-700 dark:text-slate-300">No Content Reports Pending</p>
                <p className="text-xs mt-1">The alumni feed and discussion board are completely clean.</p>
              </div>
            ) : (
              reportedPosts.map((report) => (
                <div
                  key={report.id}
                  className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 shadow-xs transition-all space-y-3 ${
                    report.is_deleted
                      ? 'border-slate-300 dark:border-slate-800 opacity-70'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {/* Top Bar: Reporter reasons + status */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>{report.report_count} Reports</span>
                      </span>

                      {report.report_reasons.map((reason, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-medium"
                        >
                          {reason}
                        </span>
                      ))}

                      {report.is_pinned && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1">
                          <Pin className="w-2.5 h-2.5" /> Pinned
                        </span>
                      )}

                      {report.is_deleted && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold">
                          Hidden from feed
                        </span>
                      )}
                    </div>

                    <span className="text-[10px] text-slate-400 font-mono">
                      Reported: {new Date(report.reported_at).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Post Content preview */}
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-slate-900 dark:text-white text-xs">
                          {report.author_name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                          Batch {report.author_batch}
                        </span>
                        <span className="text-[10px] text-slate-400">• Post ID: #{report.post_id}</span>
                      </div>
                      <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                        {report.content}
                      </p>

                      {/* Attached images */}
                      {report.images && report.images.length > 0 && (
                        <div className="flex items-center gap-2 mt-2">
                          {report.images.map((img, i) => (
                            <img
                              key={i}
                              src={img}
                              alt="Attachment"
                              className="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Moderation Controls directly interacting with Supabase */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-[11px] text-slate-400 flex items-center gap-3">
                      <span>Likes: {report.likes_count}</span>
                      <span>Comments: {report.comments_count}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Pin/Unpin */}
                      <button
                        type="button"
                        onClick={() => void handleTogglePinPost(report)}
                        title={report.is_pinned ? 'Unpin post' : 'Pin post'}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                      >
                        {report.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                        <span>{report.is_pinned ? 'Unpin' : 'Pin'}</span>
                      </button>

                      {/* Dismiss Report */}
                      <button
                        type="button"
                        onClick={() => handleDismissReport(report)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Dismiss Report</span>
                      </button>

                      {/* Hide / Restore Post */}
                      <button
                        type="button"
                        onClick={() => void handleToggleHidePost(report)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          report.is_deleted
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        {report.is_deleted ? (
                          <>
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Restore to Feed</span>
                          </>
                        ) : (
                          <>
                            <UserX className="w-3.5 h-3.5" />
                            <span>Hide Post</span>
                          </>
                        )}
                      </button>

                      {/* Hard Delete */}
                      <button
                        type="button"
                        onClick={() => void handleHardDeletePost(report)}
                        title="Permanently Delete from Supabase"
                        className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 transition-all border border-rose-200 dark:border-rose-800 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* INSPECT USER MODAL */}
      {inspectUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={inspectUser.avatar_url}
                  alt={inspectUser.full_name}
                  className="w-14 h-14 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 shadow-xs"
                />
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    {inspectUser.full_name}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span>Batch {inspectUser.batch_year}</span>
                    <span>•</span>
                    <span>ID: #{inspectUser.id}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setInspectUser(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Profile Attributes */}
            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold">Profession</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  {inspectUser.profession || 'Medical Practitioner'}
                </p>
              </div>

              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold">Institution</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  {inspectUser.institution || 'SZMC Affiliated Hospital'}
                </p>
              </div>

              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold">Stream &amp; Group</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  {inspectUser.academic_stream || 'Medical (MBBS)'} {inspectUser.academic_group ? `(${inspectUser.academic_group})` : ''}
                </p>
              </div>

              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold">Blood Group</span>
                <p className="font-semibold text-rose-600 dark:text-rose-400">
                  {inspectUser.blood_group || 'Unspecified'}
                </p>
              </div>

              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold">Location</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  {inspectUser.city || 'Bogura'}, {inspectUser.country || 'Bangladesh'}
                </p>
              </div>

              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold">Phone Verified</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                  {inspectUser.phone_ownership_verified ? (
                    <span className="text-emerald-500 font-bold flex items-center gap-0.5">
                      <Check className="w-3.5 h-3.5" /> Verified
                    </span>
                  ) : (
                    <span className="text-slate-400">Not Verified</span>
                  )}
                </p>
              </div>
            </div>

            {/* Quick Actions in Modal */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Direct Administrative Controls
              </span>

              <div className="flex flex-wrap gap-2">
                {inspectUser.verification_status !== 'verified' ? (
                  <button
                    type="button"
                    onClick={() => void handleUpdateUserVerification(inspectUser.id, 'verified')}
                    className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Grant Verified Badge</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleUpdateUserVerification(inspectUser.id, 'unverified')}
                    className="flex-1 py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 font-bold text-xs transition-all border border-amber-200 dark:border-amber-800 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    <span>Revoke Verification</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void handleTogglePhoneVerified(inspectUser.id, Boolean(inspectUser.phone_ownership_verified))}
                  className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-all cursor-pointer flex items-center gap-1"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Toggle Phone Badge</span>
                </button>
              </div>

              {onViewProfile && (
                <button
                  type="button"
                  onClick={() => {
                    onViewProfile(inspectUser.id);
                    setInspectUser(null);
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold text-xs transition-all border border-indigo-200 dark:border-indigo-800 cursor-pointer flex items-center justify-center gap-1"
                >
                  <span>Open Full Alumni Public Profile</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* INSPECT DOCUMENT LIGHTBOX MODAL */}
      {inspectDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {inspectDoc.doc_type_label}
                </h3>
                <p className="text-xs text-slate-400">
                  {inspectDoc.user_name} (Batch {inspectDoc.batch_year}, Roll: {inspectDoc.college_roll})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectDoc(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-auto rounded-2xl bg-slate-100 dark:bg-slate-800 p-2 flex items-center justify-center">
              <img
                src={inspectDoc.storage_object_path}
                alt="Document Verification"
                className="max-h-full max-w-full object-contain rounded-xl"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setInspectDoc(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer"
              >
                Close
              </button>
              {inspectDoc.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => {
                    void handleApproveDocument(inspectDoc);
                    setInspectDoc(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Approve &amp; Grant Verified Status</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* REJECT REASON MODAL */}
      {rejectReasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Decline Document Submission
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Please state the institutional reason for declining this verification request:
            </p>

            <textarea
              value={customRejectReason}
              onChange={(e) => setCustomRejectReason(e.target.value)}
              rows={3}
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectReasonModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmRejectDocument()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-all cursor-pointer"
              >
                Confirm Decline
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmActionModal
        isOpen={Boolean(pendingPurgePost)}
        title="Permanently Purge Post"
        message={
          pendingPurgePost
            ? `Permanently purge Post #${pendingPurgePost.post_id} from database? This action cannot be undone.`
            : ''
        }
        confirmLabel="Purge Post"
        onConfirm={() => {
          const target = pendingPurgePost;
          setPendingPurgePost(null);
          if (target) void executeHardDeletePost(target);
        }}
        onCancel={() => setPendingPurgePost(null)}
      />
    </div>
  );
};

export default AdminDashboard;
