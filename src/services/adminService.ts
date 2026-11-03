import { supabase, isSupabaseConfigured, ALUMNI_PUBLIC_COLUMNS } from '../lib/supabase';
import {
  AdminOverviewStats,
  AdminDocSubmission,
  AlumniAdminListItem,
  ModerationPostItem,
  SystemAuditLogItem,
  UserRole,
} from '../components/admin/adminTypes';
import { loadStoredAlumniProfiles, saveStoredAlumniProfiles } from '../data/mockData';
import { ADMIN_DOCS_STORAGE_KEY } from '../utils/verificationService';

const AUDIT_LOGS_STORAGE_KEY = 'szmc_audit_logs_list';
const GOVERNANCE_SETTINGS_KEY = 'admin_governance_state';
const GALLERY_SETTINGS_KEY = 'gallery_albums_override';

interface AdminGovernanceState {
  profileOverrides: Record<
    number,
    {
      role?: UserRole;
      verificationStatus?: 'verified' | 'pending_vouch' | 'unverified' | 'rejected';
      verificationMethod?: string;
      verifiedAt?: string;
      verifiedByProfileId?: number;
      accountStatus?: 'active' | 'suspended';
      isPublic?: boolean;
      phoneOwnershipVerified?: boolean;
      phoneVerifiedAt?: string;
      phoneVerificationNotes?: string;
      fullName?: string;
      batchYear?: number;
      collegeRoll?: string;
      academicStream?: string;
      academicGroup?: string;
      section?: string;
      profession?: string;
      position?: string;
      institution?: string;
      city?: string;
      country?: string;
      phone?: string;
      whatsapp?: string;
      email?: string;
      bio?: string;
    }
  >;
  docOverrides: Record<
    string,
    {
      status: 'approved' | 'rejected' | 'pending';
      reviewedBy?: number;
      reviewedAt?: string;
      adminNote?: string;
    }
  >;
  postOverrides: Record<
    number,
    {
      isPinned?: boolean;
      isDeleted?: boolean;
      hardDeleted?: boolean;
    }
  >;
  bloodOverrides: Record<
    number,
    {
      status?: string;
      unitsFulfilled?: number;
      moderationNote?: string;
    }
  >;
  inquiryOverrides: Record<
    number,
    {
      status?: string;
      adminNote?: string;
    }
  >;
  auditLogs: SystemAuditLogItem[];
  updatedAt?: string;
}

let cachedGovernanceState: AdminGovernanceState | null = null;

function createEmptyGovernanceState(): AdminGovernanceState {
  return {
    profileOverrides: {},
    docOverrides: {},
    postOverrides: {},
    bloodOverrides: {},
    inquiryOverrides: {},
    auditLogs: [],
  };
}

export async function loadSupabaseGovernanceState(forceRefresh = false): Promise<AdminGovernanceState> {
  if (cachedGovernanceState && !forceRefresh) {
    return cachedGovernanceState;
  }
  if (!isSupabaseConfigured) {
    cachedGovernanceState = createEmptyGovernanceState();
    return cachedGovernanceState;
  }
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', GOVERNANCE_SETTINGS_KEY)
      .maybeSingle();

    if (!error && data?.value && typeof data.value === 'object') {
      const val = data.value as Partial<AdminGovernanceState>;
      cachedGovernanceState = {
        profileOverrides: val.profileOverrides || {},
        docOverrides: val.docOverrides || {},
        postOverrides: val.postOverrides || {},
        bloodOverrides: val.bloodOverrides || {},
        inquiryOverrides: val.inquiryOverrides || {},
        auditLogs: Array.isArray(val.auditLogs) ? val.auditLogs : [],
        updatedAt: val.updatedAt,
      };
      return cachedGovernanceState;
    }
  } catch (err) {
    console.warn('Failed to load admin_governance_state from Supabase:', err);
  }
  cachedGovernanceState = createEmptyGovernanceState();
  return cachedGovernanceState;
}

export async function saveSupabaseGovernanceState(
  updater: (prev: AdminGovernanceState) => AdminGovernanceState
): Promise<AdminGovernanceState> {
  const current = await loadSupabaseGovernanceState();
  const next = updater({
    profileOverrides: { ...current.profileOverrides },
    docOverrides: { ...current.docOverrides },
    postOverrides: { ...current.postOverrides },
    bloodOverrides: { ...current.bloodOverrides },
    inquiryOverrides: { ...current.inquiryOverrides },
    auditLogs: [...current.auditLogs],
  });
  next.updatedAt = new Date().toISOString();
  cachedGovernanceState = next;

  if (isSupabaseConfigured) {
    try {
      await supabase.from('site_settings').upsert(
        {
          key: GOVERNANCE_SETTINGS_KEY,
          value: next,
          updated_at: next.updatedAt,
        },
        { onConflict: 'key' }
      );
    } catch (err) {
      console.warn('Failed to save admin_governance_state to Supabase site_settings:', err);
    }
  }
  return next;
}

function normalizeAcademicStreamForDb(stream?: string): 'Science' | 'Humanities' | 'Business Studies' {
  if (stream === 'Humanities' || stream === 'Business Studies') {
    return stream;
  }
  return 'Science';
}

async function tryInvokeAdminHubEdgeFunction(action: string, method: string, body?: any): Promise<any | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData?.session?.access_token;
    if (!jwt || !jwt.startsWith('eyJ')) return null;

    const { data, error } = await supabase.functions.invoke('admin-hub', {
      method: method as any,
      body: { action, ...body },
    });
    if (!error && data && !data.error) {
      return data;
    }
  } catch {}
  return null;
}

function getLocalAuditLogs(): SystemAuditLogItem[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(AUDIT_LOGS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveLocalAuditLog(log: Omit<SystemAuditLogItem, 'id' | 'createdAt'>): SystemAuditLogItem {
  const newLog: SystemAuditLogItem = {
    ...log,
    id: Date.now() + Math.floor(Math.random() * 1000),
    createdAt: new Date().toISOString(),
  };
  try {
    if (typeof window !== 'undefined') {
      const current = getLocalAuditLogs();
      localStorage.setItem(AUDIT_LOGS_STORAGE_KEY, JSON.stringify([newLog, ...current.slice(0, 199)]));
    }
  } catch (e) {
    console.warn('Failed to save audit log locally', e);
  }
  void saveSupabaseGovernanceState((prev) => ({
    ...prev,
    auditLogs: [newLog, ...prev.auditLogs.slice(0, 199)],
  }));
  return newLog;
}

/**
 * Fetch real aggregate platform metrics
 */
export async function fetchAdminOverviewStats(): Promise<AdminOverviewStats> {
  if (!isSupabaseConfigured) {
    const localProfiles = loadStoredAlumniProfiles();
    let localDocs: any[] = [];
    try {
      const raw = localStorage.getItem(ADMIN_DOCS_STORAGE_KEY);
      if (raw) localDocs = JSON.parse(raw);
    } catch {}

    let localPosts: any[] = [];
    try {
      const rawPosts = localStorage.getItem('szmc_alumni_posts');
      if (rawPosts) localPosts = JSON.parse(rawPosts);
    } catch {}

    const totalUsers = localProfiles.length;
    const verifiedUsers = localProfiles.filter((p) => p.verificationStatus === 'verified').length;
    const unverifiedUsers = totalUsers - verifiedUsers;
    const pendingDocReviews = localDocs.filter((d) => d.status === 'pending').length;
    const approvedDocReviews = localDocs.filter((d) => d.status === 'approved').length;
    const rejectedDocReviews = localDocs.filter((d) => d.status === 'rejected').length;
    const totalPosts = localPosts.filter((p) => !p.isDeleted).length;
    const adminCount = localProfiles.filter((p) => p.role === 'admin').length || 1;
    const modCount = localProfiles.filter((p) => p.role === 'moderator').length;

    return {
      totalUsers,
      verifiedUsers,
      unverifiedUsers,
      pendingDocReviews,
      approvedDocReviews,
      rejectedDocReviews,
      totalPosts,
      adminCount,
      modCount,
    };
  }

  try {
    const [
      govState,
      totalUsersRes,
      verifiedUsersRes,
      unverifiedUsersRes,
      pendingDocsRes,
      approvedDocsRes,
      rejectedDocsRes,
      totalPostsRes,
      adminCountRes,
      modCountRes,
    ] = await Promise.all([
      loadSupabaseGovernanceState(true),
      supabase.from('alumni_profiles').select('id', { count: 'exact', head: true }),
      supabase.from('alumni_profiles').select('id', { count: 'exact', head: true }).eq('verification_status', 'verified'),
      supabase.from('alumni_profiles').select('id', { count: 'exact', head: true }).neq('verification_status', 'verified'),
      supabase.from('admin_doc_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('admin_doc_submissions').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('admin_doc_submissions').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('is_deleted', false),
      supabase.from('alumni_profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
      supabase.from('alumni_profiles').select('id', { count: 'exact', head: true }).eq('role', 'moderator'),
    ]);

    let totalUsers = totalUsersRes.count ?? 0;
    let verifiedUsers = verifiedUsersRes.count ?? 0;
    let unverifiedUsers = unverifiedUsersRes.count ?? 0;
    let adminCount = adminCountRes.count ?? 0;
    let modCount = modCountRes.count ?? 0;

    if (totalUsers === 0) {
      const localProfiles = loadStoredAlumniProfiles();
      totalUsers = localProfiles.length;
      verifiedUsers = localProfiles.filter((p) => {
        const ov = govState.profileOverrides[p.id];
        return (ov?.verificationStatus || p.verificationStatus) === 'verified';
      }).length;
      unverifiedUsers = Math.max(0, totalUsers - verifiedUsers);
      adminCount =
        localProfiles.filter((p) => (govState.profileOverrides[p.id]?.role || p.role) === 'admin').length || 1;
      modCount = localProfiles.filter(
        (p) => (govState.profileOverrides[p.id]?.role || p.role) === 'moderator'
      ).length;
    }

    return {
      totalUsers,
      verifiedUsers,
      unverifiedUsers,
      pendingDocReviews: pendingDocsRes.count ?? 0,
      approvedDocReviews: approvedDocsRes.count ?? 0,
      rejectedDocReviews: rejectedDocsRes.count ?? 0,
      totalPosts: totalPostsRes.count ?? 0,
      adminCount: Math.max(1, adminCount),
      modCount,
    };
  } catch (err) {
    console.warn('fetchAdminOverviewStats error:', err);
    return {
      totalUsers: 0,
      verifiedUsers: 0,
      unverifiedUsers: 0,
      pendingDocReviews: 0,
      approvedDocReviews: 0,
      rejectedDocReviews: 0,
      totalPosts: 0,
      adminCount: 1,
      modCount: 0,
    };
  }
}

/**
 * Fetch verification document submissions with signed storage preview URLs
 */
export async function fetchAdminDocSubmissions(
  statusFilter: 'pending' | 'approved' | 'rejected' | 'all' = 'pending'
): Promise<AdminDocSubmission[]> {
  const govState = await loadSupabaseGovernanceState();

  if (!isSupabaseConfigured) {
    try {
      const raw = localStorage.getItem(ADMIN_DOCS_STORAGE_KEY);
      if (!raw) return [];
      const parsed: any[] = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const merged = parsed.map((row: any) => {
        const ov = govState.docOverrides[String(row.id)];
        return ov ? { ...row, ...ov } : row;
      });
      const filtered = statusFilter === 'all' ? merged : merged.filter((s) => s.status === statusFilter);
      return filtered.map((row: any) => ({
        id: String(row.id),
        userId: Number(row.userId || row.user_id),
        fullName: row.fullName || 'Alumnus',
        avatarUrl: row.avatarUrl || '/placeholder-avatar.png',
        batchYear: Number(row.batchYear || row.batch_year) || 0,
        collegeRoll: String(row.collegeRoll || row.college_roll || '').trim(),
        group: row.group || row.academic_stream || 'MBBS',
        docType: row.docType || row.doc_type || 'id_card',
        docTypeLabel: row.docTypeLabel || row.doc_type_label || 'SZMC Student Card / BMDC Certificate',
        documentUrl: row.documentUrl || row.storage_object_path || '',
        submittedAt: row.submittedAt || row.submitted_at || new Date().toISOString(),
        status: row.status || 'pending',
        reviewedBy: row.reviewedBy || row.reviewed_by,
        reviewedAt: row.reviewedAt || row.reviewed_at,
        adminNote: row.adminNote || row.admin_note,
      }));
    } catch {
      return [];
    }
  }

  try {
    let query = supabase
      .from('admin_doc_submissions')
      .select('*')
      .order('submitted_at', { ascending: false });

    const { data: submissions, error: subError } = await query;
    if (subError || !submissions || submissions.length === 0) {
      const raw = localStorage.getItem(ADMIN_DOCS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const merged = parsed.map((row: any) => {
        const ov = govState.docOverrides[String(row.id)];
        return ov ? { ...row, ...ov } : row;
      });
      return (statusFilter === 'all' ? merged : merged.filter((s: any) => s.status === statusFilter)).map((row: any) => ({
        id: String(row.id),
        userId: Number(row.userId || row.user_id),
        fullName: row.fullName || 'Alumnus',
        avatarUrl: row.avatarUrl || '/placeholder-avatar.png',
        batchYear: Number(row.batchYear || row.batch_year) || 0,
        collegeRoll: String(row.collegeRoll || row.college_roll || '').trim(),
        group: row.group || row.academic_stream || 'MBBS',
        docType: row.docType || row.doc_type || 'id_card',
        docTypeLabel: row.docTypeLabel || row.doc_type_label || 'Student Card',
        documentUrl: row.documentUrl || '',
        submittedAt: row.submittedAt || new Date().toISOString(),
        status: row.status || 'pending',
        reviewedBy: row.reviewedBy ? String(row.reviewedBy) : undefined,
        reviewedAt: row.reviewedAt,
        adminNote: row.adminNote,
      }));
    }

    const userIds = Array.from(new Set(submissions.map((s: any) => Number(s.user_id)).filter(Boolean)));
    const profilesMap = new Map<number, { fullName: string; avatarUrl: string; verificationStatus?: string }>();

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('alumni_profiles')
        .select('id, full_name, avatar_url, verification_status')
        .in('id', userIds);

      if (profiles) {
        profiles.forEach((p: any) => {
          profilesMap.set(Number(p.id), {
            fullName: p.full_name || 'Alumnus',
            avatarUrl: p.avatar_url || '/placeholder-avatar.png',
            verificationStatus: p.verification_status,
          });
        });
      }
    }

    const result: AdminDocSubmission[] = await Promise.all(
      submissions.map(async (row: any) => {
        const userId = Number(row.user_id);
        const ov = govState.docOverrides[String(row.id)];
        const effectiveStatus = ov?.status || row.status || 'pending';
        const profile = profilesMap.get(userId) || {
          fullName: 'Alumnus',
          avatarUrl: '/placeholder-avatar.png',
        };

        let resolvedDocUrl = '';
        const path = row.storage_object_path || '';
        if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
          resolvedDocUrl = path;
        } else if (path) {
          try {
            const { data: signedData } = await supabase.storage
              .from('verification-documents')
              .createSignedUrl(path, 3600);
            resolvedDocUrl = signedData?.signedUrl || '';
          } catch {
            const { data: pubData } = supabase.storage
              .from('verification-documents')
              .getPublicUrl(path);
            resolvedDocUrl = pubData?.publicUrl || '';
          }
        }

        const groupLabel = row.academic_group
          ? `${row.academic_stream || 'MBBS'} - Group ${row.academic_group}`
          : row.academic_stream || 'MBBS';

        return {
          id: String(row.id),
          userId,
          fullName: profile.fullName,
          avatarUrl: profile.avatarUrl,
          batchYear: Number(row.batch_year) || 0,
          collegeRoll: String(row.college_roll || '').trim(),
          group: groupLabel,
          docType: row.doc_type || 'id_card',
          docTypeLabel: row.doc_type_label || 'SZMC Student Card',
          documentUrl: resolvedDocUrl,
          submittedAt: row.submitted_at || new Date().toISOString(),
          status: effectiveStatus,
          reviewedBy: ov?.reviewedBy ? String(ov.reviewedBy) : row.reviewed_by ? String(row.reviewed_by) : undefined,
          reviewedAt: ov?.reviewedAt || row.reviewed_at || undefined,
          adminNote: ov?.adminNote || row.admin_note || undefined,
        };
      })
    );

    return statusFilter === 'all' ? result : result.filter((r) => r.status === statusFilter);
  } catch (err) {
    console.warn('fetchAdminDocSubmissions exception:', err);
    return [];
  }
}

/**
 * Review an ID document submission (Approve or Reject)
 */
export async function reviewAdminDocSubmission(params: {
  submissionId: string;
  status: 'approved' | 'rejected';
  adminNote?: string;
  reviewerProfileId: number;
}): Promise<{ success: boolean; error?: string }> {
  const { submissionId, status, adminNote, reviewerProfileId } = params;
  const nowIso = new Date().toISOString();
  const cleanNote =
    adminNote?.trim() ||
    (status === 'rejected' ? 'Document image unclear or incomplete.' : 'Approved by administrator review');

  try {
    // 1. Check self-approval if row exists in Supabase
    let targetUserId = 0;
    if (isSupabaseConfigured) {
      const { data: subRow } = await supabase
        .from('admin_doc_submissions')
        .select('user_id')
        .eq('id', submissionId)
        .maybeSingle();

      if (subRow?.user_id) {
        targetUserId = Number(subRow.user_id);
      }
    }

    if (!targetUserId && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(ADMIN_DOCS_STORAGE_KEY);
        if (raw) {
          const docs: any[] = JSON.parse(raw);
          const found = docs.find((d) => String(d.id) === String(submissionId));
          if (found) targetUserId = Number(found.userId || found.user_id || 0);
        }
      } catch {}
    }

    if (targetUserId && targetUserId === Number(reviewerProfileId) && Number(reviewerProfileId) !== 0) {
      return {
        success: false,
        error: 'Self-approval protection: You cannot approve your own verification document.',
      };
    }

    // 2. Try Edge Function first
    await tryInvokeAdminHubEdgeFunction(`verifications/${submissionId}/review`, 'POST', {
      decision: status,
      adminNote: cleanNote,
    });

    // 3. Direct Supabase update using ONLY granted columns on admin_doc_submissions (status, reviewed_by, reviewed_at, admin_note)
    if (isSupabaseConfigured) {
      await supabase
        .from('admin_doc_submissions')
        .update({
          status,
          reviewed_by: reviewerProfileId || null,
          reviewed_at: nowIso,
          admin_note: cleanNote,
        })
        .eq('id', submissionId);

      if (status === 'approved' && targetUserId) {
        await supabase
          .from('alumni_profiles')
          .update({
            verification_status: 'verified',
            verification_method: 'id_card_upload',
            verified_by_profile_id: reviewerProfileId || null,
            verified_at: nowIso,
          })
          .eq('id', targetUserId);
      }
    }

    // 4. Persist to Supabase site_settings governance state & local storage so changes always persist
    await saveSupabaseGovernanceState((prev) => {
      const next = { ...prev };
      next.docOverrides[String(submissionId)] = {
        status,
        reviewedBy: reviewerProfileId,
        reviewedAt: nowIso,
        adminNote: cleanNote,
      };
      if (status === 'approved' && targetUserId) {
        next.profileOverrides[targetUserId] = {
          ...(next.profileOverrides[targetUserId] || {}),
          verificationStatus: 'verified',
          verificationMethod: 'id_card_upload',
          verifiedAt: nowIso,
          verifiedByProfileId: reviewerProfileId,
        };
      }
      return next;
    });

    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(ADMIN_DOCS_STORAGE_KEY);
        if (raw) {
          const docs: any[] = JSON.parse(raw);
          const idx = docs.findIndex((d) => String(d.id) === String(submissionId));
          if (idx !== -1) {
            docs[idx] = {
              ...docs[idx],
              status,
              reviewedBy: String(reviewerProfileId),
              reviewedAt: nowIso,
              adminNote: cleanNote,
            };
            localStorage.setItem(ADMIN_DOCS_STORAGE_KEY, JSON.stringify(docs));
          }
        }
      } catch {}
    }

    saveLocalAuditLog({
      actorProfileId: reviewerProfileId,
      actorRole: 'admin',
      action: status === 'approved' ? 'APPROVE_VERIFICATION_DOC' : 'REJECT_VERIFICATION_DOC',
      entityTable: 'admin_doc_submissions',
      entityId: String(submissionId),
      newValues: { status, admin_note: cleanNote },
      reason: cleanNote,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update submission status.' };
  }
}

/**
 * Search alumni profiles with role and status filtering
 * Uses ALUMNI_PUBLIC_COLUMNS (never selects revoked sensitive columns directly) + Supabase governance state
 */
export async function searchAlumniForAdmin(params: {
  query?: string;
  roleFilter?: 'all' | 'admin' | 'moderator' | 'member';
  statusFilter?: 'all' | 'verified' | 'unverified';
  page?: number;
  limit?: number;
}): Promise<{ alumni: AlumniAdminListItem[]; totalCount: number }> {
  const { query = '', roleFilter = 'all', statusFilter = 'all', page = 1, limit = 25 } = params;
  const govState = await loadSupabaseGovernanceState();

  const applyOverridesToList = (list: AlumniAdminListItem[]) => {
    let result = list.map((item) => {
      const ov = govState.profileOverrides[item.id];
      if (!ov) return item;
      return {
        ...item,
        fullName: ov.fullName ?? item.fullName,
        batchYear: ov.batchYear ?? item.batchYear,
        collegeRoll: ov.collegeRoll ?? item.collegeRoll,
        academicStream: ov.academicStream ?? item.academicStream,
        academicGroup: ov.academicGroup ?? item.academicGroup,
        role: (ov.role ?? item.role) as UserRole,
        verificationStatus: (ov.verificationStatus ?? item.verificationStatus) as any,
        profession: ov.profession ?? item.profession,
        institution: ov.institution ?? item.institution,
        city: ov.city ?? item.city,
        country: ov.country ?? item.country,
        accountStatus: ov.accountStatus ?? (item as any).accountStatus ?? 'active',
        phoneOwnershipVerified:
          ov.phoneOwnershipVerified ?? (item as any).phoneOwnershipVerified ?? false,
      };
    });

    if (roleFilter !== 'all') {
      result = result.filter((p) => p.role === roleFilter);
    }
    if (statusFilter !== 'all') {
      result = result.filter((p) =>
        statusFilter === 'verified' ? p.verificationStatus === 'verified' : p.verificationStatus !== 'verified'
      );
    }
    const trimmed = query.trim().toLowerCase();
    if (trimmed) {
      result = result.filter(
        (p) =>
          p.fullName.toLowerCase().includes(trimmed) ||
          String(p.batchYear).includes(trimmed) ||
          (p.collegeRoll && p.collegeRoll.toLowerCase().includes(trimmed)) ||
          (p.institution && p.institution.toLowerCase().includes(trimmed)) ||
          (p.profession && p.profession.toLowerCase().includes(trimmed))
      );
    }
    return result;
  };

  if (isSupabaseConfigured) {
    try {
      const fromIndex = (page - 1) * limit;
      const toIndex = fromIndex + limit - 1;

      // IMPORTANT: Only select ALUMNI_PUBLIC_COLUMNS granted by 003_rls_policies.sql
      let dbQuery = supabase
        .from('alumni_profiles')
        .select(ALUMNI_PUBLIC_COLUMNS, { count: 'exact' });

      if (roleFilter !== 'all') dbQuery = dbQuery.eq('role', roleFilter);
      if (statusFilter !== 'all') {
        if (statusFilter === 'verified') {
          dbQuery = dbQuery.eq('verification_status', 'verified');
        } else {
          dbQuery = dbQuery.neq('verification_status', 'verified');
        }
      }

      const trimmed = query.trim();
      if (trimmed) {
        const num = Number(trimmed);
        if (!isNaN(num) && num >= 1 && num <= 60) {
          dbQuery = dbQuery.eq('batch_year', num);
        } else {
          dbQuery = dbQuery.ilike('full_name', `%${trimmed}%`);
        }
      }

      dbQuery = dbQuery.order('id', { ascending: false }).range(fromIndex, toIndex);

      const { data, count, error } = await dbQuery;
      if (!error && data && data.length > 0) {
        const items: AlumniAdminListItem[] = data.map((row: any) => {
          const id = Number(row.id);
          const ov = govState.profileOverrides[id];
          return {
            id,
            userId: id,
            fullName: ov?.fullName || row.full_name || 'Alumnus',
            avatarUrl: row.avatar_url || '/placeholder-avatar.png',
            batchYear: ov?.batchYear ?? (Number(row.batch_year) || 0),
            collegeRoll: ov?.collegeRoll || undefined,
            academicStream: ov?.academicStream || row.academic_stream || 'MBBS',
            academicGroup: ov?.academicGroup || row.academic_group || undefined,
            role: (ov?.role || row.role || 'member') as UserRole,
            verificationStatus: (ov?.verificationStatus || row.verification_status || 'unverified') as any,
            profession: ov?.profession || row.profession || undefined,
            institution: ov?.institution || row.institution || undefined,
            city: ov?.city || row.city || 'Bogura',
            country: ov?.country || row.country || 'Bangladesh',
            createdAt: row.created_at || undefined,
            accountStatus: ov?.accountStatus || (row.is_public === false ? 'suspended' : 'active'),
            phoneOwnershipVerified: ov?.phoneOwnershipVerified ?? false,
          } as AlumniAdminListItem;
        });

        return { alumni: items, totalCount: count ?? items.length };
      }
    } catch (err) {
      console.warn('searchAlumniForAdmin DB query warning:', err);
    }
  }

  // Fallback to stored alumni profiles with Supabase governance overrides applied
  const profiles = loadStoredAlumniProfiles().map((p) => ({
    id: p.id,
    userId: p.userId || p.id,
    fullName: p.fullName,
    avatarUrl: p.avatarUrl || '/placeholder-avatar.png',
    batchYear: p.batchYear,
    collegeRoll: p.collegeRoll,
    academicStream: p.academicStream || 'MBBS',
    academicGroup: p.academicGroup || undefined,
    role: (p.role || 'member') as UserRole,
    verificationStatus: (p.verificationStatus || 'unverified') as any,
    profession: p.profession,
    institution: p.institution,
    city: p.city || 'Bogura',
    country: p.country || 'Bangladesh',
  }));

  const filtered = applyOverridesToList(profiles);
  const totalCount = filtered.length;
  const fromIndex = (page - 1) * limit;
  return {
    alumni: filtered.slice(fromIndex, fromIndex + limit),
    totalCount,
  };
}

/**
 * Update user role (Member <-> Moderator <-> Admin)
 */
export async function updateUserRole(params: {
  targetUserId: number;
  newRole: UserRole;
}): Promise<{ success: boolean; error?: string }> {
  const { targetUserId, newRole } = params;
  const dbRole = newRole === 'admin' || newRole === 'moderator' ? newRole : 'member';

  try {
    // 1. Try Edge Function
    await tryInvokeAdminHubEdgeFunction(`alumni/${targetUserId}`, 'PATCH', {
      role: dbRole,
      adminReviewNote: `Role updated to ${newRole}`,
    });

    // 2. Direct Supabase update (do NOT pass updated_at — trigger handles it and column is not in GRANT UPDATE)
    if (isSupabaseConfigured) {
      await supabase
        .from('alumni_profiles')
        .update({ role: dbRole })
        .eq('id', targetUserId);
    }

    // 3. Persist in Supabase site_settings governance state & local cache
    await saveSupabaseGovernanceState((prev) => ({
      ...prev,
      profileOverrides: {
        ...prev.profileOverrides,
        [targetUserId]: {
          ...(prev.profileOverrides[targetUserId] || {}),
          role: newRole,
        },
      },
    }));

    const profiles = loadStoredAlumniProfiles();
    const pIdx = profiles.findIndex((p) => p.id === targetUserId);
    if (pIdx !== -1) {
      profiles[pIdx] = { ...profiles[pIdx], role: newRole as any };
      saveStoredAlumniProfiles(profiles);
    }

    saveLocalAuditLog({
      actorRole: 'admin',
      action: 'UPDATE_USER_ROLE',
      entityTable: 'alumni_profiles',
      entityId: String(targetUserId),
      newValues: { role: newRole },
      reason: `User role modified to ${newRole}`,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update user role.' };
  }
}

/**
 * Fetch feed posts for moderation
 */
export async function fetchFeedPostsForModeration(params: {
  query?: string;
  filter?: 'all' | 'pinned' | 'deleted' | 'active';
  limit?: number;
} = {}): Promise<ModerationPostItem[]> {
  const { query = '', filter = 'all', limit = 50 } = params;
  const govState = await loadSupabaseGovernanceState();

  if (isSupabaseConfigured) {
    try {
      let dbQuery = supabase
        .from('posts')
        .select('id, author_id, content, category, images, videos, likes_count, comments_count, is_pinned, is_deleted, is_edited, created_at')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);

      const { data: rawPosts, error: postErr } = await dbQuery;
      if (!postErr && rawPosts && rawPosts.length > 0) {
        const authorIds = Array.from(new Set(rawPosts.map((p: any) => Number(p.author_id)).filter(Boolean)));
        const authorMap = new Map<number, { fullName: string; avatarUrl: string; batchYear: number }>();

        if (authorIds.length > 0) {
          const { data: authors } = await supabase
            .from('alumni_profiles')
            .select('id, full_name, avatar_url, batch_year')
            .in('id', authorIds);

          if (authors) {
            authors.forEach((a: any) => {
              authorMap.set(Number(a.id), {
                fullName: a.full_name || 'Alumnus',
                avatarUrl: a.avatar_url || '/placeholder-avatar.png',
                batchYear: Number(a.batch_year) || 0,
              });
            });
          }
        }

        let mapped: ModerationPostItem[] = rawPosts
          .filter((p: any) => !govState.postOverrides[Number(p.id)]?.hardDeleted)
          .map((p: any) => {
            const postId = Number(p.id);
            const ov = govState.postOverrides[postId];
            const author = authorMap.get(Number(p.author_id)) || {
              fullName: 'Alumnus',
              avatarUrl: '/placeholder-avatar.png',
              batchYear: 0,
            };
            return {
              id: postId,
              authorId: Number(p.author_id),
              authorName: author.fullName,
              authorAvatar: author.avatarUrl,
              authorBatch: author.batchYear,
              content: p.content || '',
              category: p.category || 'General',
              images: Array.isArray(p.images) ? p.images : [],
              videos: Array.isArray(p.videos) ? p.videos : [],
              likesCount: Number(p.likes_count) || 0,
              commentsCount: Number(p.comments_count) || 0,
              isPinned: ov?.isPinned ?? Boolean(p.is_pinned),
              isDeleted: ov?.isDeleted ?? Boolean(p.is_deleted),
              isEdited: Boolean(p.is_edited),
              createdAt: p.created_at || new Date().toISOString(),
            };
          });

        if (filter === 'pinned') mapped = mapped.filter((p) => p.isPinned && !p.isDeleted);
        if (filter === 'deleted') mapped = mapped.filter((p) => p.isDeleted);
        if (filter === 'active') mapped = mapped.filter((p) => !p.isDeleted);

        const trimmed = query.trim().toLowerCase();
        if (trimmed) {
          mapped = mapped.filter(
            (post) =>
              post.content.toLowerCase().includes(trimmed) ||
              post.authorName.toLowerCase().includes(trimmed)
          );
        }
        return mapped;
      }
    } catch {}
  }

  try {
    const rawPosts = localStorage.getItem('szmc_alumni_posts');
    if (!rawPosts) return [];
    let posts: any[] = JSON.parse(rawPosts);
    if (!Array.isArray(posts)) return [];

    if (filter === 'pinned') posts = posts.filter((p) => Boolean(p.isPinned) && !p.isDeleted);
    if (filter === 'deleted') posts = posts.filter((p) => Boolean(p.isDeleted));
    if (filter === 'active') posts = posts.filter((p) => !p.isDeleted);

    const trimmed = query.trim().toLowerCase();
    if (trimmed) {
      posts = posts.filter(
        (p) =>
          (p.content || '').toLowerCase().includes(trimmed) ||
          (p.authorName || '').toLowerCase().includes(trimmed)
      );
    }

    return posts.slice(0, limit).map((p) => ({
      id: Number(p.id),
      authorId: Number(p.authorId || 1),
      authorName: p.authorName || 'Alumnus',
      authorAvatar: p.authorAvatar || '/placeholder-avatar.png',
      authorBatch: Number(p.authorBatch) || 25,
      content: p.content || '',
      category: p.category || 'General',
      images: Array.isArray(p.images) ? p.images : [],
      videos: Array.isArray(p.videos) ? p.videos : [],
      likesCount: Number(p.likes) || 0,
      commentsCount: Number(p.commentsCount) || 0,
      isPinned: Boolean(p.isPinned),
      isDeleted: Boolean(p.isDeleted),
      isEdited: Boolean(p.isEdited),
      createdAt: p.createdAt || p.timestamp || new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

/**
 * Toggle Pin status on post
 */
export async function togglePostPinnedStatus(postId: number, isPinned: boolean) {
  try {
    if (isSupabaseConfigured) {
      await supabase
        .from('posts')
        .update({ is_pinned: isPinned })
        .eq('id', postId);
    }

    await saveSupabaseGovernanceState((prev) => ({
      ...prev,
      postOverrides: {
        ...prev.postOverrides,
        [postId]: {
          ...(prev.postOverrides[postId] || {}),
          isPinned,
        },
      },
    }));

    try {
      const rawPosts = localStorage.getItem('szmc_alumni_posts');
      if (rawPosts) {
        const posts: any[] = JSON.parse(rawPosts);
        const pIdx = posts.findIndex((p) => Number(p.id) === Number(postId));
        if (pIdx !== -1) {
          posts[pIdx].isPinned = isPinned;
          localStorage.setItem('szmc_alumni_posts', JSON.stringify(posts));
        }
      }
    } catch {}

    saveLocalAuditLog({
      action: isPinned ? 'PIN_POST' : 'UNPIN_POST',
      entityTable: 'posts',
      entityId: String(postId),
      newValues: { is_pinned: isPinned },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Pin update failed' };
  }
}

/**
 * Toggle Soft Delete / Hide status on post
 */
export async function togglePostDeletedStatus(postId: number, isDeleted: boolean) {
  try {
    if (isSupabaseConfigured) {
      await supabase
        .from('posts')
        .update({ is_deleted: isDeleted })
        .eq('id', postId);
    }

    await saveSupabaseGovernanceState((prev) => ({
      ...prev,
      postOverrides: {
        ...prev.postOverrides,
        [postId]: {
          ...(prev.postOverrides[postId] || {}),
          isDeleted,
        },
      },
    }));

    try {
      const rawPosts = localStorage.getItem('szmc_alumni_posts');
      if (rawPosts) {
        const posts: any[] = JSON.parse(rawPosts);
        const pIdx = posts.findIndex((p) => Number(p.id) === Number(postId));
        if (pIdx !== -1) {
          posts[pIdx].isDeleted = isDeleted;
          localStorage.setItem('szmc_alumni_posts', JSON.stringify(posts));
        }
      }
    } catch {}

    saveLocalAuditLog({
      action: isDeleted ? 'SOFT_DELETE_POST' : 'RESTORE_POST',
      entityTable: 'posts',
      entityId: String(postId),
      newValues: { is_deleted: isDeleted },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Soft delete update failed' };
  }
}

/**
 * Hard delete post (Super Admin only)
 */
export async function hardDeletePost(postId: number) {
  try {
    if (isSupabaseConfigured) {
      await supabase.from('posts').delete().eq('id', postId);
    }

    await saveSupabaseGovernanceState((prev) => ({
      ...prev,
      postOverrides: {
        ...prev.postOverrides,
        [postId]: {
          ...(prev.postOverrides[postId] || {}),
          isDeleted: true,
          hardDeleted: true,
        },
      },
    }));

    try {
      const rawPosts = localStorage.getItem('szmc_alumni_posts');
      if (rawPosts) {
        const posts: any[] = JSON.parse(rawPosts);
        const filtered = posts.filter((p) => Number(p.id) !== Number(postId));
        localStorage.setItem('szmc_alumni_posts', JSON.stringify(filtered));
      }
    } catch {}

    saveLocalAuditLog({
      action: 'HARD_DELETE_POST',
      entityTable: 'posts',
      entityId: String(postId),
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Delete failed' };
  }
}

/**
 * Fetch System Audit Logs
 */
export async function fetchSystemAuditLogs(params: {
  categoryFilter?: string;
  limit?: number;
} = {}): Promise<{ logs: SystemAuditLogItem[]; error?: string }> {
  const { categoryFilter = 'all', limit = 50 } = params;
  const govState = await loadSupabaseGovernanceState();

  const filterLogs = (items: SystemAuditLogItem[]) => {
    if (categoryFilter === 'all') return items.slice(0, limit);
    return items
      .filter((l) => l.action.toLowerCase().includes(categoryFilter.toLowerCase()))
      .slice(0, limit);
  };

  if (!isSupabaseConfigured) {
    return { logs: filterLogs([...govState.auditLogs, ...getLocalAuditLogs()]) };
  }

  try {
    let query = supabase
      .from('audit_logs')
      .select('id, actor_auth_id, actor_profile_id, action, entity_table, entity_id, old_data, new_data, reason, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (categoryFilter !== 'all') {
      query = query.ilike('action', `%${categoryFilter}%`);
    }

    const { data: rawLogs, error: logErr } = await query;
    if (logErr || !rawLogs || rawLogs.length === 0) {
      const combined = [...govState.auditLogs, ...getLocalAuditLogs()];
      const seen = new Set<string>();
      const deduped = combined.filter((item) => {
        const key = `${item.action}-${item.entityId}-${item.createdAt}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { logs: filterLogs(deduped) };
    }

    const actorIds = Array.from(new Set(rawLogs.map((l: any) => Number(l.actor_profile_id)).filter(Boolean)));
    const actorMap = new Map<number, string>();

    if (actorIds.length > 0) {
      const { data: actors } = await supabase
        .from('alumni_profiles')
        .select('id, full_name')
        .in('id', actorIds);
      if (actors) {
        actors.forEach((a: any) => actorMap.set(Number(a.id), a.full_name));
      }
    }

    const dbLogs: SystemAuditLogItem[] = rawLogs.map((row: any) => ({
      id: Number(row.id),
      actorProfileId: row.actor_profile_id ? Number(row.actor_profile_id) : null,
      actorAuthId: row.actor_auth_id || null,
      actorRole: 'admin',
      actorName: row.actor_profile_id
        ? actorMap.get(Number(row.actor_profile_id)) || `User #${row.actor_profile_id}`
        : 'System Engine',
      action: row.action || 'AUDIT_ACTION',
      entityTable: row.entity_table || 'unknown',
      entityId: String(row.entity_id || ''),
      oldValues: row.old_data || null,
      newValues: row.new_data || null,
      reason: row.reason || null,
      createdAt: row.created_at || new Date().toISOString(),
    }));

    return { logs: filterLogs([...govState.auditLogs, ...dbLogs]) };
  } catch {
    return { logs: filterLogs([...govState.auditLogs, ...getLocalAuditLogs()]) };
  }
}

/**
 * 1-Click Instant Manual Verification (bypasses 2 peer vouches)
 */
export async function instantVerifyAlumnus(params: {
  targetUserId: number;
  reviewerId: number;
  reviewerName?: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { targetUserId, reviewerId, reviewerName = 'Super Administrator', notes } = params;
  const nowIso = new Date().toISOString();

  try {
    // 1. Try Edge Function
    await tryInvokeAdminHubEdgeFunction(`alumni/${targetUserId}`, 'PATCH', {
      verificationStatus: 'verified',
      adminReviewNote: notes || '1-Click Instant Verification by Super Admin',
    });

    // 2. Direct Supabase update (use valid verification_method_enum 'admin_manual', omit vouches_count & updated_at)
    if (isSupabaseConfigured) {
      await supabase
        .from('alumni_profiles')
        .update({
          verification_status: 'verified',
          verification_method: 'admin_manual',
          verified_by_profile_id: reviewerId || null,
          verified_at: nowIso,
        })
        .eq('id', targetUserId);

      await supabase
        .from('admin_doc_submissions')
        .update({
          status: 'approved',
          reviewed_by: reviewerId || null,
          reviewed_at: nowIso,
          admin_note: notes || 'Approved via 1-Click Instant Verification',
        })
        .eq('user_id', targetUserId)
        .eq('status', 'pending');
    }

    // 3. Persist in Supabase site_settings governance state & local storage
    await saveSupabaseGovernanceState((prev) => ({
      ...prev,
      profileOverrides: {
        ...prev.profileOverrides,
        [targetUserId]: {
          ...(prev.profileOverrides[targetUserId] || {}),
          verificationStatus: 'verified',
          verificationMethod: 'admin_manual',
          verifiedAt: nowIso,
          verifiedByProfileId: reviewerId,
        },
      },
    }));

    const profiles = loadStoredAlumniProfiles();
    const pIdx = profiles.findIndex((p) => p.id === targetUserId);
    if (pIdx !== -1) {
      profiles[pIdx] = {
        ...profiles[pIdx],
        verificationStatus: 'verified',
        verificationMethod: 'admin_verified',
        verifiedBy: [reviewerName],
        vouchesCount: 2,
        verificationDate: nowIso,
      };
      saveStoredAlumniProfiles(profiles);
    }

    saveLocalAuditLog({
      actorProfileId: reviewerId,
      actorRole: 'admin',
      action: 'INSTANT_VERIFY_ALUMNUS',
      entityTable: 'alumni_profiles',
      entityId: String(targetUserId),
      newValues: { verification_status: 'verified', verification_method: 'admin_manual' },
      reason: notes || '1-Click Instant Verification by Administrator',
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Verification update failed' };
  }
}

/**
 * Account Suspension / Reactivation
 */
export async function toggleAccountSuspension(params: {
  targetUserId: number;
  suspend: boolean;
  reviewerId?: number;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { targetUserId, suspend, reviewerId, reason } = params;
  const status = suspend ? 'suspended' : 'active';

  try {
    // 1. Try Edge Function
    await tryInvokeAdminHubEdgeFunction(`alumni/${targetUserId}`, 'PATCH', {
      accountStatus: status,
      adminReviewNote: reason || `Account ${status}`,
    });

    // 2. Direct Supabase update (actual column is is_public: !suspend, omit updated_at)
    if (isSupabaseConfigured) {
      await supabase
        .from('alumni_profiles')
        .update({
          is_public: !suspend,
        })
        .eq('id', targetUserId);
    }

    // 3. Persist in Supabase site_settings governance state & local storage
    await saveSupabaseGovernanceState((prev) => ({
      ...prev,
      profileOverrides: {
        ...prev.profileOverrides,
        [targetUserId]: {
          ...(prev.profileOverrides[targetUserId] || {}),
          accountStatus: status,
          isPublic: !suspend,
        },
      },
    }));

    const profiles = loadStoredAlumniProfiles();
    const pIdx = profiles.findIndex((p) => p.id === targetUserId);
    if (pIdx !== -1) {
      (profiles[pIdx] as any).accountStatus = status;
      profiles[pIdx].isPublic = !suspend;
      saveStoredAlumniProfiles(profiles);
    }

    saveLocalAuditLog({
      actorProfileId: reviewerId,
      actorRole: 'admin',
      action: suspend ? 'SUSPEND_ACCOUNT' : 'REACTIVATE_ACCOUNT',
      entityTable: 'alumni_profiles',
      entityId: String(targetUserId),
      newValues: { is_public: !suspend, account_status: status },
      reason: reason || `Account status changed to ${status}`,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Admin Update Alumnus Profile Details
 */
export async function adminUpdateAlumnusProfile(params: {
  targetUserId: number;
  patch: Record<string, any>;
  reviewerId?: number;
}): Promise<{ success: boolean; error?: string }> {
  const { targetUserId, patch, reviewerId } = params;

  try {
    // 1. Build valid column payload for alumni_profiles (only columns in 001_core_schema.sql & 003_rls_policies.sql GRANT UPDATE)
    const dbPayload: Record<string, any> = {};
    if (patch.fullName !== undefined) dbPayload.full_name = patch.fullName;
    if (patch.batchYear !== undefined) dbPayload.batch_year = Number(patch.batchYear);
    if (patch.collegeRoll !== undefined) dbPayload.college_roll = patch.collegeRoll;
    if (patch.academicStream !== undefined) {
      dbPayload.academic_stream = normalizeAcademicStreamForDb(patch.academicStream);
    }
    if (patch.academicGroup !== undefined) dbPayload.academic_group = patch.academicGroup;
    if (patch.section !== undefined) dbPayload.section = patch.section;
    if (patch.profession !== undefined) dbPayload.profession = patch.profession;
    if (patch.position !== undefined) dbPayload.position = patch.position;
    if (patch.institution !== undefined) dbPayload.institution = patch.institution;
    if (patch.city !== undefined) dbPayload.city = patch.city;
    if (patch.country !== undefined) dbPayload.country = patch.country;
    if (patch.phone !== undefined) dbPayload.phone = patch.phone;
    if (patch.whatsapp !== undefined) dbPayload.whatsapp = patch.whatsapp;
    if (patch.email !== undefined) dbPayload.email = patch.email;
    if (patch.bio !== undefined) dbPayload.bio = patch.bio;

    if (isSupabaseConfigured && Object.keys(dbPayload).length > 0) {
      await supabase
        .from('alumni_profiles')
        .update(dbPayload)
        .eq('id', targetUserId);
    }

    // 2. Persist in Supabase site_settings governance state & local storage
    await saveSupabaseGovernanceState((prev) => ({
      ...prev,
      profileOverrides: {
        ...prev.profileOverrides,
        [targetUserId]: {
          ...(prev.profileOverrides[targetUserId] || {}),
          ...patch,
        },
      },
    }));

    const profiles = loadStoredAlumniProfiles();
    const pIdx = profiles.findIndex((p) => p.id === targetUserId);
    if (pIdx !== -1) {
      profiles[pIdx] = { ...profiles[pIdx], ...patch };
      saveStoredAlumniProfiles(profiles);
    }

    saveLocalAuditLog({
      actorProfileId: reviewerId,
      actorRole: 'admin',
      action: 'ADMIN_UPDATE_PROFILE',
      entityTable: 'alumni_profiles',
      entityId: String(targetUserId),
      newValues: patch,
      reason: 'Administrator updated alumnus profile information',
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Manually Certify Alumnus Phone Ownership
 */
export async function adminVerifyPhoneOwnership(params: {
  targetUserId: number;
  notes?: string;
  reviewerId?: number;
}): Promise<{ success: boolean; error?: string }> {
  const { targetUserId, notes, reviewerId } = params;
  const nowIso = new Date().toISOString();

  try {
    // 1. Invoke deployed admin-hub Edge Function (uses service_role to update phone_ownership_verified & auth.users)
    await tryInvokeAdminHubEdgeFunction('verify-phone', 'POST', {
      profileId: targetUserId,
      notes: notes || 'Certified by administrator',
    });

    // 2. Persist in Supabase site_settings governance state & local storage
    await saveSupabaseGovernanceState((prev) => ({
      ...prev,
      profileOverrides: {
        ...prev.profileOverrides,
        [targetUserId]: {
          ...(prev.profileOverrides[targetUserId] || {}),
          phoneOwnershipVerified: true,
          phoneVerifiedAt: nowIso,
          phoneVerificationNotes: notes || 'Certified by administrator',
        },
      },
    }));

    const profiles = loadStoredAlumniProfiles();
    const pIdx = profiles.findIndex((p) => p.id === targetUserId);
    if (pIdx !== -1) {
      profiles[pIdx].phoneOwnershipVerified = true;
      (profiles[pIdx] as any).phoneVerifiedAt = nowIso;
      (profiles[pIdx] as any).phoneVerificationNotes = notes;
      saveStoredAlumniProfiles(profiles);
    }

    saveLocalAuditLog({
      actorProfileId: reviewerId,
      actorRole: 'admin',
      action: 'CERTIFY_PHONE_OWNERSHIP',
      entityTable: 'alumni_profiles',
      entityId: String(targetUserId),
      newValues: { phone_ownership_verified: true, notes },
      reason: notes || 'Administrative certification of phone ownership',
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Export complete Alumni Directory Database as JSON or CSV
 */
export async function exportAlumniData(format: 'json' | 'csv'): Promise<void> {
  let alumniData: any[] = [];
  const govState = await loadSupabaseGovernanceState();

  if (isSupabaseConfigured) {
    try {
      const { data } = await supabase
        .from('alumni_profiles')
        .select(ALUMNI_PUBLIC_COLUMNS)
        .order('id', { ascending: true });
      if (data && data.length > 0) {
        alumniData = data.map((row: any) => {
          const ov = govState.profileOverrides[Number(row.id)];
          return ov ? { ...row, ...ov } : row;
        });
      }
    } catch {}
  }

  if (alumniData.length === 0) {
    alumniData = loadStoredAlumniProfiles().map((p) => {
      const ov = govState.profileOverrides[p.id];
      return ov ? { ...p, ...ov } : p;
    });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `SZMC_Alumni_Directory_Export_${timestamp}.${format}`;

  if (format === 'json') {
    const jsonStr = JSON.stringify(alumniData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } else {
    const headers = [
      'ID',
      'Full Name',
      'Batch',
      'Roll',
      'Stream',
      'Group',
      'Section',
      'Role',
      'Verification Status',
      'Profession',
      'Position',
      'Institution',
      'City',
      'Country',
      'Phone',
      'Email',
      'Blood Group',
    ];
    const rows = alumniData.map((a) => [
      a.id,
      `"${(a.fullName || a.full_name || '').replace(/"/g, '""')}"`,
      a.batchYear || a.batch_year || '',
      a.collegeRoll || a.college_roll || '',
      a.academicStream || a.academic_stream || '',
      a.academicGroup || a.academic_group || '',
      a.section || '',
      a.role || 'member',
      a.verificationStatus || a.verification_status || 'unverified',
      `"${(a.profession || '').replace(/"/g, '""')}"`,
      `"${(a.position || '').replace(/"/g, '""')}"`,
      `"${(a.institution || '').replace(/"/g, '""')}"`,
      a.city || '',
      a.country || '',
      a.phone || '',
      a.email || '',
      a.bloodGroup || a.blood_group || '',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

/**
 * Fetch and manage contact inquiries
 */
export async function fetchContactInquiries(): Promise<any[]> {
  const localKey = 'szmc_contact_inquiries_list';
  const govState = await loadSupabaseGovernanceState();

  const defaultInquiries = [
    {
      id: 1,
      senderName: 'Dr. Shahriar Rahman',
      email: 'shahriar.szmc@gmail.com',
      phone: '+880 1712-334455',
      subject: 'Batch 28 Reunion Contribution Query',
      message:
        'Could you please confirm the official bKash merchant transaction verification method for our batch alumni contribution?',
      status: 'new',
      createdAt: new Date().toISOString(),
    },
    {
      id: 2,
      senderName: 'Dr. Nusrat Jahan',
      email: 'nusrat.szmc@yahoo.com',
      phone: '+880 1819-887766',
      subject: 'BMDC Certificate Verification Help',
      message:
        'I have submitted my BMDC registration copy. Kindly expedite review so I can access the emergency blood coordination circle.',
      status: 'in_progress',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ];

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('contact_inquiries')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data && data.length > 0) {
        return data.map((row: any) => {
          const ov = govState.inquiryOverrides[Number(row.id)];
          return ov ? { ...row, ...ov } : row;
        });
      }
    } catch {}
  }

  let baseList = defaultInquiries;
  try {
    const raw = localStorage.getItem(localKey);
    if (raw) baseList = JSON.parse(raw);
  } catch {}

  return baseList.map((item: any) => {
    const ov = govState.inquiryOverrides[Number(item.id)];
    return ov ? { ...item, ...ov } : item;
  });
}

export async function updateContactInquiryStatus(params: {
  id: number;
  status: 'new' | 'in_progress' | 'resolved' | 'archived';
  adminNote?: string;
}): Promise<boolean> {
  const { id, status, adminNote } = params;
  const localKey = 'szmc_contact_inquiries_list';

  try {
    if (isSupabaseConfigured) {
      await supabase
        .from('contact_inquiries')
        .update({ status })
        .eq('id', id);
    }

    await saveSupabaseGovernanceState((prev) => ({
      ...prev,
      inquiryOverrides: {
        ...prev.inquiryOverrides,
        [id]: { status, adminNote },
      },
    }));

    try {
      const raw = localStorage.getItem(localKey);
      const list = raw ? JSON.parse(raw) : [];
      const idx = list.findIndex((x: any) => x.id === id);
      if (idx !== -1) {
        list[idx].status = status;
        list[idx].adminNote = adminNote;
        localStorage.setItem(localKey, JSON.stringify(list));
      }
    } catch {}

    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch and moderate blood emergencies
 */
export async function fetchBloodRequestsForModeration(): Promise<any[]> {
  const localKey = 'szmc_blood_emergencies_list';
  const govState = await loadSupabaseGovernanceState();

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('blood_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data && data.length > 0) {
        return data.map((r: any) => {
          const ov = govState.bloodOverrides[Number(r.id)];
          return {
            id: Number(r.id),
            patientName: r.patient_relation || r.patientName || 'SZMC Patient',
            bloodGroup: r.blood_group || r.bloodGroup || 'O+',
            unitsRequired: r.units_required ?? r.unitsRequired ?? 1,
            unitsFulfilled: ov?.unitsFulfilled ?? r.units_fulfilled ?? 0,
            hospital: r.hospital_name || r.hospital || 'SZMC Hospital, Bogura',
            contactPhone: r.coordination_ref || r.contactPhone || 'Through Portal',
            urgency: (r.emergency_level || r.urgency || 'high').toLowerCase(),
            status: ov?.status || r.status || 'open',
            moderationNote: ov?.moderationNote || r.moderation_note,
            createdAt: r.created_at || new Date().toISOString(),
          };
        });
      }
    } catch {}
  }

  let list = [
    {
      id: 1,
      patientName: 'ICU Critical Patient (Bed 12)',
      bloodGroup: 'O-',
      unitsRequired: 2,
      unitsFulfilled: 1,
      hospital: 'SZMC Hospital ICU, Bogura',
      contactPhone: '+880 1711-998877',
      urgency: 'critical',
      status: 'open',
      createdAt: new Date().toISOString(),
    },
    {
      id: 2,
      patientName: 'Post-Op Surgical Case',
      bloodGroup: 'B+',
      unitsRequired: 3,
      unitsFulfilled: 3,
      hospital: 'Mohammad Ali Hospital, Bogura',
      contactPhone: '+880 1912-332211',
      urgency: 'high',
      status: 'fulfilled',
      createdAt: new Date(Date.now() - 172800000).toISOString(),
    },
  ];

  try {
    const raw = localStorage.getItem(localKey);
    if (raw) list = JSON.parse(raw);
  } catch {}

  return list.map((item: any) => {
    const ov = govState.bloodOverrides[Number(item.id)];
    return ov ? { ...item, ...ov } : item;
  });
}

export async function updateBloodRequestModeration(params: {
  id: number;
  status: 'open' | 'fulfilled' | 'cancelled';
  unitsFulfilled?: number;
  moderationNote?: string;
}): Promise<boolean> {
  const { id, status, unitsFulfilled, moderationNote } = params;
  const localKey = 'szmc_blood_emergencies_list';
  const dbStatus = status === 'fulfilled' ? 'Fulfilled' : status === 'cancelled' ? 'Cancelled' : 'Active';

  try {
    await tryInvokeAdminHubEdgeFunction(`blood-requests/${id}`, 'PATCH', {
      status: dbStatus,
      unitsFulfilled,
      moderationNote,
    });

    if (isSupabaseConfigured) {
      const payload: any = { status: dbStatus };
      if (unitsFulfilled !== undefined) payload.units_fulfilled = unitsFulfilled;
      if (moderationNote !== undefined) payload.moderation_note = moderationNote;
      await supabase.from('blood_requests').update(payload).eq('id', id);
    }

    await saveSupabaseGovernanceState((prev) => ({
      ...prev,
      bloodOverrides: {
        ...prev.bloodOverrides,
        [id]: {
          status,
          unitsFulfilled,
          moderationNote,
        },
      },
    }));

    try {
      const raw = localStorage.getItem(localKey);
      const list = raw ? JSON.parse(raw) : [];
      const idx = list.findIndex((x: any) => x.id === id);
      if (idx !== -1) {
        list[idx].status = status;
        if (unitsFulfilled !== undefined) list[idx].unitsFulfilled = unitsFulfilled;
        list[idx].moderationNote = moderationNote;
        localStorage.setItem(localKey, JSON.stringify(list));
      }
    } catch {}

    return true;
  } catch {
    return false;
  }
}

/**
 * Gallery Albums Administration (Synced with Supabase gallery_albums & site_settings)
 */
export async function fetchGalleryAlbumsForAdmin(): Promise<any[]> {
  const localKey = 'szmc_gallery_albums_list';

  if (isSupabaseConfigured) {
    try {
      // 1. Check site_settings override first
      const { data: settingRow } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', GALLERY_SETTINGS_KEY)
        .maybeSingle();

      if (settingRow?.value && Array.isArray((settingRow.value as any).albums) && (settingRow.value as any).albums.length > 0) {
        const remoteAlbums = (settingRow.value as any).albums;
        if (typeof window !== 'undefined') {
          localStorage.setItem(localKey, JSON.stringify(remoteAlbums));
        }
        return remoteAlbums;
      }

      // 2. Otherwise read from gallery_albums table
      const { data: dbAlbums } = await supabase
        .from('gallery_albums')
        .select('*')
        .order('created_at', { ascending: false });

      if (dbAlbums && dbAlbums.length > 0) {
        const mapped = dbAlbums.map((a: any) => ({
          id: String(a.id),
          title: a.title || 'SZMC Album',
          description: a.description || '',
          category: a.category || 'Campus',
          coverUrl: a.cover_url || '/assets/szmc/szmc_day_1.jpg',
          photosCount: Number(a.photos_count) || 0,
          isPublished: a.is_published !== false,
          batchYear: Number(a.batch_year) || 25,
          createdAt: a.event_date || (a.created_at ? String(a.created_at).slice(0, 10) : '2026-08-14'),
        }));
        if (typeof window !== 'undefined') {
          localStorage.setItem(localKey, JSON.stringify(mapped));
        }
        return mapped;
      }
    } catch (err) {
      console.warn('fetchGalleryAlbumsForAdmin Supabase warning:', err);
    }
  }

  try {
    const raw = localStorage.getItem(localKey);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [
    {
      id: 'album-1',
      title: 'SZMC Campus Greens & Silver Jubilee Conclave',
      description: 'Historical archives and milestone moments from the 25th batch celebrations.',
      category: 'Reunion',
      coverUrl: '/assets/szmc/szmc_day_1.jpg',
      photosCount: 24,
      isPublished: true,
      batchYear: 25,
      createdAt: '2026-08-14',
    },
    {
      id: 'album-2',
      title: 'Clinical Ward Rounds & Academic Conferences',
      description: 'Specialists and alumni doctors sharing clinical insights at SZMCH auditorium.',
      category: 'Academic',
      coverUrl: '/assets/szmc/conference.jpg',
      photosCount: 18,
      isPublished: true,
      batchYear: 20,
      createdAt: '2026-09-02',
    },
    {
      id: 'album-3',
      title: 'Beauty of SZMC & Cultural Festivities',
      description: 'Decorated campus walkways, red carpet festival pavilions, and community celebrations.',
      category: 'Campus',
      coverUrl: '/assets/szmc/beauty_of_szmc.jpg',
      photosCount: 31,
      isPublished: true,
      batchYear: 32,
      createdAt: '2026-10-10',
    },
  ];
}

export function saveGalleryAlbums(albums: any[]): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem('szmc_gallery_albums_list', JSON.stringify(albums));
    }
  } catch {}

  if (isSupabaseConfigured) {
    void supabase
      .from('site_settings')
      .upsert(
        {
          key: GALLERY_SETTINGS_KEY,
          value: {
            albums,
            updated_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      )
      .then(() => {});
  }
}

