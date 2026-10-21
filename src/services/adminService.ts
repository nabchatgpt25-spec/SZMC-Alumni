import { supabase, isSupabaseConfigured } from '../lib/supabase';
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

function saveLocalAuditLog(log: Omit<SystemAuditLogItem, 'id' | 'createdAt'>): void {
  try {
    if (typeof window === 'undefined') return;
    const current = getLocalAuditLogs();
    const newLog: SystemAuditLogItem = {
      ...log,
      id: Date.now(),
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(AUDIT_LOGS_STORAGE_KEY, JSON.stringify([newLog, ...current.slice(0, 199)]));
  } catch (e) {
    console.warn('Failed to save audit log locally', e);
  }
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
      const rawPosts = localStorage.getItem('ndc_alumni_posts');
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
      supabase.from('alumni_profiles').select('id', { count: 'exact', head: true }),
      supabase.from('alumni_profiles').select('id', { count: 'exact', head: true }).eq('verification_status', 'verified'),
      supabase.from('alumni_profiles').select('id', { count: 'exact', head: true }).eq('verification_status', 'unverified'),
      supabase.from('admin_doc_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('admin_doc_submissions').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('admin_doc_submissions').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('is_deleted', false),
      supabase.from('alumni_profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
      supabase.from('alumni_profiles').select('id', { count: 'exact', head: true }).eq('role', 'moderator'),
    ]);

    return {
      totalUsers: totalUsersRes.count ?? 0,
      verifiedUsers: verifiedUsersRes.count ?? 0,
      unverifiedUsers: unverifiedUsersRes.count ?? 0,
      pendingDocReviews: pendingDocsRes.count ?? 0,
      approvedDocReviews: approvedDocsRes.count ?? 0,
      rejectedDocReviews: rejectedDocsRes.count ?? 0,
      totalPosts: totalPostsRes.count ?? 0,
      adminCount: adminCountRes.count ?? 0,
      modCount: modCountRes.count ?? 0,
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
      adminCount: 0,
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
  if (!isSupabaseConfigured) {
    try {
      const raw = localStorage.getItem(ADMIN_DOCS_STORAGE_KEY);
      if (!raw) return [];
      const parsed: any[] = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const filtered = statusFilter === 'all' ? parsed : parsed.filter((s) => s.status === statusFilter);
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

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data: submissions, error: subError } = await query;
    if (subError || !submissions || submissions.length === 0) {
      // Fallback to local storage if DB query yielded no rows
      const raw = localStorage.getItem(ADMIN_DOCS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return (statusFilter === 'all' ? parsed : parsed.filter((s: any) => s.status === statusFilter)).map((row: any) => ({
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
        reviewedBy: row.reviewedBy,
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
              .createSignedUrl(path, 3600); // 1-hour secure URL
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
          status: row.status || 'pending',
          reviewedBy: row.reviewed_by ? String(row.reviewed_by) : undefined,
          reviewedAt: row.reviewed_at || undefined,
          adminNote: row.admin_note || undefined,
        };
      })
    );

    return result;
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

  if (!isSupabaseConfigured) {
    try {
      const raw = localStorage.getItem(ADMIN_DOCS_STORAGE_KEY);
      if (!raw) return { success: false, error: 'Submission not found' };
      const docs: any[] = JSON.parse(raw);
      const targetIndex = docs.findIndex((d) => String(d.id) === String(submissionId));
      if (targetIndex === -1) return { success: false, error: 'Submission not found' };

      const sub = docs[targetIndex];
      const targetUserId = Number(sub.userId || sub.user_id);

      // Strict Zero Self-Approval Protection
      if (targetUserId === Number(reviewerProfileId) && Number(reviewerProfileId) !== 0) {
        return {
          success: false,
          error: 'Self-approval protection: You cannot approve your own verification document.',
        };
      }

      const nowIso = new Date().toISOString();
      docs[targetIndex] = {
        ...sub,
        status,
        reviewedBy: String(reviewerProfileId),
        reviewedAt: nowIso,
        adminNote: adminNote?.trim() || (status === 'rejected' ? 'Document image unclear or incomplete.' : 'Approved by admin review'),
      };
      localStorage.setItem(ADMIN_DOCS_STORAGE_KEY, JSON.stringify(docs));

      // Auto-verify alumnus profile if approved
      if (status === 'approved' && targetUserId) {
        const profiles = loadStoredAlumniProfiles();
        const pIdx = profiles.findIndex((p) => p.id === targetUserId);
        if (pIdx !== -1) {
          profiles[pIdx] = {
            ...profiles[pIdx],
            verificationStatus: 'verified',
            verificationMethod: 'admin_verified',
            verificationDate: nowIso,
          };
          saveStoredAlumniProfiles(profiles);
        }
      }

      // Record audit log
      saveLocalAuditLog({
        actorProfileId: reviewerProfileId,
        actorRole: 'admin',
        action: status === 'approved' ? 'APPROVE_VERIFICATION_DOC' : 'REJECT_VERIFICATION_DOC',
        entityTable: 'admin_doc_submissions',
        entityId: submissionId,
        newValues: { status, adminNote, reviewedAt: nowIso },
        reason: adminNote || (status === 'approved' ? 'Identity verified by Administrator review' : 'Rejected document submission'),
      });

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Local review failed' };
    }
  }

  try {
    // 1. Strict Self-Approval Protection
    const { data: subRow } = await supabase
      .from('admin_doc_submissions')
      .select('user_id')
      .eq('id', submissionId)
      .maybeSingle();

    if (subRow && Number(subRow.user_id) === Number(reviewerProfileId) && Number(reviewerProfileId) !== 0) {
      return {
        success: false,
        error: 'Self-approval protection: You cannot approve your own verification document.',
      };
    }

    // 2. Perform Review Update
    const updatePayload: Record<string, any> = {
      status,
      reviewed_by: reviewerProfileId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      admin_note: adminNote?.trim() || (status === 'rejected' ? 'Document image unclear or incomplete.' : null),
    };

    const { error: updateError } = await supabase
      .from('admin_doc_submissions')
      .update(updatePayload)
      .eq('id', submissionId);

    if (updateError) return { success: false, error: updateError.message };

    // 3. Auto-reconcile redundant pending queues for this user on approval
    if (status === 'approved' && subRow?.user_id) {
      await supabase
        .from('admin_doc_submissions')
        .update({
          status: 'approved',
          reviewed_by: reviewerProfileId,
          reviewed_at: new Date().toISOString(),
          admin_note: adminNote || 'Auto-resolved: User identity verified',
        })
        .eq('user_id', subRow.user_id)
        .eq('status', 'pending');
    }

    // Record system audit log
    await supabase.from('audit_logs').insert({
      actor_profile_id: reviewerProfileId,
      action: status === 'approved' ? 'APPROVE_VERIFICATION_DOC' : 'REJECT_VERIFICATION_DOC',
      entity_table: 'admin_doc_submissions',
      entity_id: String(submissionId),
      new_values: { status, admin_note: adminNote },
      reason: adminNote || `Admin review ${status}`,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update submission status.' };
  }
}

/**
 * Search alumni profiles with role and status filtering
 */
export async function searchAlumniForAdmin(params: {
  query?: string;
  roleFilter?: 'all' | 'admin' | 'moderator' | 'member';
  statusFilter?: 'all' | 'verified' | 'unverified';
  page?: number;
  limit?: number;
}): Promise<{ alumni: AlumniAdminListItem[]; totalCount: number }> {
  const { query = '', roleFilter = 'all', statusFilter = 'all', page = 1, limit = 25 } = params;

  if (!isSupabaseConfigured) {
    let profiles = loadStoredAlumniProfiles();
    if (roleFilter !== 'all') profiles = profiles.filter((p) => p.role === roleFilter);
    if (statusFilter !== 'all') {
      profiles = profiles.filter((p) =>
        statusFilter === 'verified' ? p.verificationStatus === 'verified' : p.verificationStatus !== 'verified'
      );
    }
    const trimmed = query.trim().toLowerCase();
    if (trimmed) {
      profiles = profiles.filter(
        (p) =>
          p.fullName.toLowerCase().includes(trimmed) ||
          String(p.batchYear).includes(trimmed) ||
          (p.collegeRoll && p.collegeRoll.toLowerCase().includes(trimmed))
      );
    }

    const totalCount = profiles.length;
    const fromIndex = (page - 1) * limit;
    const pageItems = profiles.slice(fromIndex, fromIndex + limit).map((p) => ({
      id: p.id,
      userId: p.userId || p.id,
      fullName: p.fullName,
      avatarUrl: p.avatarUrl || '/placeholder-avatar.png',
      batchYear: p.batchYear,
      collegeRoll: p.collegeRoll,
      academicStream: p.academicStream || 'MBBS',
      academicGroup: p.academicGroup || undefined,
      role: (p.role || 'member') as UserRole,
      verificationStatus: p.verificationStatus || 'unverified',
      profession: p.profession,
      institution: p.institution,
      city: p.city || 'Bogura',
      country: p.country || 'Bangladesh',
    }));

    return { alumni: pageItems, totalCount };
  }

  try {
    const fromIndex = (page - 1) * limit;
    const toIndex = fromIndex + limit - 1;

    let dbQuery = supabase
      .from('alumni_profiles')
      .select('id, full_name, avatar_url, batch_year, college_roll, academic_stream, academic_group, role, verification_status, profession, institution, city, country, created_at', { count: 'exact' });

    if (roleFilter !== 'all') dbQuery = dbQuery.eq('role', roleFilter);
    if (statusFilter !== 'all') dbQuery = dbQuery.eq('verification_status', statusFilter);

    const trimmed = query.trim();
    if (trimmed) {
      const num = Number(trimmed);
      if (!isNaN(num) && num >= 1 && num <= 60) {
        dbQuery = dbQuery.eq('batch_year', num);
      } else {
        dbQuery = dbQuery.ilike('full_name', `%${trimmed}%`);
      }
    }

    dbQuery = dbQuery
      .order('id', { ascending: false })
      .range(fromIndex, toIndex);

    const { data, count, error } = await dbQuery;
    if (error || !data) return { alumni: [], totalCount: 0 };

    const items: AlumniAdminListItem[] = data.map((row: any) => ({
      id: Number(row.id),
      userId: Number(row.id),
      fullName: row.full_name || 'Alumnus',
      avatarUrl: row.avatar_url || '/placeholder-avatar.png',
      batchYear: Number(row.batch_year) || 0,
      collegeRoll: row.college_roll || undefined,
      academicStream: row.academic_stream || 'MBBS',
      academicGroup: row.academic_group || undefined,
      role: (row.role || 'member') as UserRole,
      verificationStatus: row.verification_status || 'unverified',
      profession: row.profession || undefined,
      institution: row.institution || undefined,
      city: row.city || 'Bogura',
      country: row.country || 'Bangladesh',
      createdAt: row.created_at || undefined,
    }));

    return { alumni: items, totalCount: count ?? items.length };
  } catch (err) {
    return { alumni: [], totalCount: 0 };
  }
}

/**
 * Update user role (Member <-> Moderator <-> Admin <-> Batch Representative)
 */
export async function updateUserRole(params: {
  targetUserId: number;
  newRole: UserRole;
}): Promise<{ success: boolean; error?: string }> {
  const { targetUserId, newRole } = params;

  if (!isSupabaseConfigured) {
    try {
      const profiles = loadStoredAlumniProfiles();
      const pIdx = profiles.findIndex((p) => p.id === targetUserId);
      if (pIdx !== -1) {
        const oldRole = profiles[pIdx].role;
        profiles[pIdx] = {
          ...profiles[pIdx],
          role: newRole,
        };
        saveStoredAlumniProfiles(profiles);

        saveLocalAuditLog({
          actorRole: 'admin',
          action: 'UPDATE_USER_ROLE',
          entityTable: 'alumni_profiles',
          entityId: String(targetUserId),
          oldValues: { role: oldRole },
          newValues: { role: newRole },
          reason: `Elevated user ${targetUserId} to ${newRole}`,
        });
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Role change failed' };
    }
  }

  try {
    const { error } = await supabase
      .from('alumni_profiles')
      .update({
        role: newRole,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetUserId);

    if (error) return { success: false, error: error.message };

    // Record audit log
    await supabase.from('audit_logs').insert({
      action: 'UPDATE_USER_ROLE',
      entity_table: 'alumni_profiles',
      entity_id: String(targetUserId),
      new_values: { role: newRole },
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

  if (!isSupabaseConfigured) {
    try {
      const rawPosts = localStorage.getItem('ndc_alumni_posts');
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

  try {
    let dbQuery = supabase
      .from('posts')
      .select('id, author_id, content, category, images, videos, likes_count, comments_count, is_pinned, is_deleted, is_edited, created_at')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (filter === 'pinned') dbQuery = dbQuery.eq('is_pinned', true).eq('is_deleted', false);
    if (filter === 'deleted') dbQuery = dbQuery.eq('is_deleted', true);
    if (filter === 'active') dbQuery = dbQuery.eq('is_deleted', false);

    const { data: rawPosts, error: postErr } = await dbQuery;
    if (postErr || !rawPosts) return [];

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

    const mapped: ModerationPostItem[] = rawPosts.map((p: any) => {
      const author = authorMap.get(Number(p.author_id)) || {
        fullName: 'Alumnus',
        avatarUrl: '/placeholder-avatar.png',
        batchYear: 0,
      };
      return {
        id: Number(p.id),
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
        isPinned: Boolean(p.is_pinned),
        isDeleted: Boolean(p.is_deleted),
        isEdited: Boolean(p.is_edited),
        createdAt: p.created_at || new Date().toISOString(),
      };
    });

    const trimmed = query.trim().toLowerCase();
    if (trimmed) {
      return mapped.filter(
        (post) =>
          post.content.toLowerCase().includes(trimmed) ||
          post.authorName.toLowerCase().includes(trimmed)
      );
    }
    return mapped;
  } catch (err) {
    return [];
  }
}

/**
 * Toggle Pin status on post
 */
export async function togglePostPinnedStatus(postId: number, isPinned: boolean) {
  if (!isSupabaseConfigured) {
    try {
      const rawPosts = localStorage.getItem('ndc_alumni_posts');
      if (rawPosts) {
        const posts: any[] = JSON.parse(rawPosts);
        const pIdx = posts.findIndex((p) => Number(p.id) === Number(postId));
        if (pIdx !== -1) {
          posts[pIdx].isPinned = isPinned;
          localStorage.setItem('ndc_alumni_posts', JSON.stringify(posts));
        }
      }
      saveLocalAuditLog({
        action: isPinned ? 'PIN_POST' : 'UNPIN_POST',
        entityTable: 'posts',
        entityId: String(postId),
        newValues: { is_pinned: isPinned },
      });
      return { success: true };
    } catch {
      return { success: false, error: 'Local pin update failed' };
    }
  }

  const { error } = await supabase
    .from('posts')
    .update({ is_pinned: isPinned, updated_at: new Date().toISOString() })
    .eq('id', postId);
  return { success: !error, error: error?.message };
}

/**
 * Toggle Soft Delete / Hide status on post
 */
export async function togglePostDeletedStatus(postId: number, isDeleted: boolean) {
  if (!isSupabaseConfigured) {
    try {
      const rawPosts = localStorage.getItem('ndc_alumni_posts');
      if (rawPosts) {
        const posts: any[] = JSON.parse(rawPosts);
        const pIdx = posts.findIndex((p) => Number(p.id) === Number(postId));
        if (pIdx !== -1) {
          posts[pIdx].isDeleted = isDeleted;
          localStorage.setItem('ndc_alumni_posts', JSON.stringify(posts));
        }
      }
      saveLocalAuditLog({
        action: isDeleted ? 'SOFT_DELETE_POST' : 'RESTORE_POST',
        entityTable: 'posts',
        entityId: String(postId),
        newValues: { is_deleted: isDeleted },
      });
      return { success: true };
    } catch {
      return { success: false, error: 'Local soft delete update failed' };
    }
  }

  const { error } = await supabase
    .from('posts')
    .update({ is_deleted: isDeleted, updated_at: new Date().toISOString() })
    .eq('id', postId);
  return { success: !error, error: error?.message };
}

/**
 * Hard delete post (Super Admin only)
 */
export async function hardDeletePost(postId: number) {
  if (!isSupabaseConfigured) {
    try {
      const rawPosts = localStorage.getItem('ndc_alumni_posts');
      if (rawPosts) {
        const posts: any[] = JSON.parse(rawPosts);
        const filtered = posts.filter((p) => Number(p.id) !== Number(postId));
        localStorage.setItem('ndc_alumni_posts', JSON.stringify(filtered));
      }
      saveLocalAuditLog({
        action: 'HARD_DELETE_POST',
        entityTable: 'posts',
        entityId: String(postId),
      });
      return { success: true };
    } catch {
      return { success: false, error: 'Local delete failed' };
    }
  }

  const { error } = await supabase.from('posts').delete().eq('id', postId);
  return { success: !error, error: error?.message };
}

/**
 * Fetch System Audit Logs
 */
export async function fetchSystemAuditLogs(params: {
  categoryFilter?: string;
  limit?: number;
} = {}): Promise<{ logs: SystemAuditLogItem[]; error?: string }> {
  const { categoryFilter = 'all', limit = 50 } = params;

  if (!isSupabaseConfigured) {
    let logs = getLocalAuditLogs();
    if (categoryFilter !== 'all') {
      logs = logs.filter((l) => l.action.toLowerCase().includes(categoryFilter.toLowerCase()));
    }
    return { logs: logs.slice(0, limit) };
  }

  try {
    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (categoryFilter !== 'all') {
      query = query.ilike('action', `%${categoryFilter}%`);
    }

    const { data: rawLogs, error: logErr } = await query;
    if (logErr) {
      // Fallback to local logs
      let logs = getLocalAuditLogs();
      if (categoryFilter !== 'all') {
        logs = logs.filter((l) => l.action.toLowerCase().includes(categoryFilter.toLowerCase()));
      }
      return { logs: logs.slice(0, limit) };
    }
    if (!rawLogs || rawLogs.length === 0) {
      return { logs: getLocalAuditLogs().slice(0, limit) };
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

    const logs: SystemAuditLogItem[] = rawLogs.map((row: any) => ({
      id: Number(row.id),
      actorProfileId: row.actor_profile_id ? Number(row.actor_profile_id) : null,
      actorAuthId: row.actor_auth_id || null,
      actorRole: row.actor_role || null,
      actorName: row.actor_profile_id
        ? actorMap.get(Number(row.actor_profile_id)) || `User #${row.actor_profile_id}`
        : 'System Engine',
      action: row.action || 'AUDIT_ACTION',
      entityTable: row.entity_table || 'unknown',
      entityId: String(row.entity_id || ''),
      oldValues: row.old_values || null,
      newValues: row.new_values || null,
      reason: row.reason || null,
      createdAt: row.created_at || new Date().toISOString(),
    }));

    return { logs };
  } catch (err: any) {
    return { logs: getLocalAuditLogs().slice(0, limit) };
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

  if (!isSupabaseConfigured) {
    try {
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

        saveLocalAuditLog({
          actorProfileId: reviewerId,
          actorRole: 'admin',
          action: 'INSTANT_VERIFY_ALUMNUS',
          entityTable: 'alumni_profiles',
          entityId: String(targetUserId),
          newValues: { verification_status: 'verified', method: 'admin_verified' },
          reason: notes || '1-Click Instant Verification by Super Admin',
        });
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message };
    }
  }

  try {
    const { error } = await supabase
      .from('alumni_profiles')
      .update({
        verification_status: 'verified',
        verification_method: 'admin_verified',
        verified_by_profile_id: reviewerId,
        verified_at: nowIso,
        vouches_count: 2,
        updated_at: nowIso,
      })
      .eq('id', targetUserId);

    if (error) return { success: false, error: error.message };

    // Also update any pending doc submissions
    await supabase
      .from('admin_doc_submissions')
      .update({
        status: 'approved',
        reviewed_by: reviewerId,
        reviewed_at: nowIso,
        admin_note: notes || 'Approved via 1-Click Instant Verification',
      })
      .eq('user_id', targetUserId)
      .eq('status', 'pending');

    await supabase.from('audit_logs').insert({
      actor_profile_id: reviewerId,
      action: 'INSTANT_VERIFY_ALUMNUS',
      entity_table: 'alumni_profiles',
      entity_id: String(targetUserId),
      new_values: { verification_status: 'verified' },
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

  if (!isSupabaseConfigured) {
    try {
      const profiles = loadStoredAlumniProfiles();
      const pIdx = profiles.findIndex((p) => p.id === targetUserId);
      if (pIdx !== -1) {
        (profiles[pIdx] as any).accountStatus = status;
        saveStoredAlumniProfiles(profiles);

        saveLocalAuditLog({
          actorProfileId: reviewerId,
          actorRole: 'admin',
          action: suspend ? 'SUSPEND_ACCOUNT' : 'REACTIVATE_ACCOUNT',
          entityTable: 'alumni_profiles',
          entityId: String(targetUserId),
          newValues: { account_status: status },
          reason: reason || (suspend ? 'Account suspended by admin' : 'Account reactivated by admin'),
        });
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message };
    }
  }

  try {
    const { error } = await supabase
      .from('alumni_profiles')
      .update({
        account_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetUserId);

    if (error) return { success: false, error: error.message };

    await supabase.from('audit_logs').insert({
      actor_profile_id: reviewerId,
      action: suspend ? 'SUSPEND_ACCOUNT' : 'REACTIVATE_ACCOUNT',
      entity_table: 'alumni_profiles',
      entity_id: String(targetUserId),
      new_values: { account_status: status },
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

  if (!isSupabaseConfigured) {
    try {
      const profiles = loadStoredAlumniProfiles();
      const pIdx = profiles.findIndex((p) => p.id === targetUserId);
      if (pIdx !== -1) {
        profiles[pIdx] = { ...profiles[pIdx], ...patch };
        saveStoredAlumniProfiles(profiles);

        saveLocalAuditLog({
          actorProfileId: reviewerId,
          actorRole: 'admin',
          action: 'ADMIN_UPDATE_PROFILE',
          entityTable: 'alumni_profiles',
          entityId: String(targetUserId),
          newValues: patch,
          reason: 'Administrator profile edit',
        });
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message };
    }
  }

  try {
    const dbPayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (patch.fullName !== undefined) dbPayload.full_name = patch.fullName;
    if (patch.batchYear !== undefined) dbPayload.batch_year = Number(patch.batchYear);
    if (patch.collegeRoll !== undefined) dbPayload.college_roll = patch.collegeRoll;
    if (patch.academicStream !== undefined) dbPayload.academic_stream = patch.academicStream;
    if (patch.academicGroup !== undefined) dbPayload.academic_group = patch.academicGroup;
    if (patch.section !== undefined) dbPayload.section = patch.section;
    if (patch.profession !== undefined) dbPayload.profession = patch.profession;
    if (patch.position !== undefined) dbPayload.position = patch.position;
    if (patch.institution !== undefined) dbPayload.institution = patch.institution;
    if (patch.specialty !== undefined) dbPayload.specialty = Array.isArray(patch.specialty) ? patch.specialty : [];
    if (patch.degree !== undefined) dbPayload.degree = Array.isArray(patch.degree) ? patch.degree : [];
    if (patch.city !== undefined) dbPayload.city = patch.city;
    if (patch.country !== undefined) dbPayload.country = patch.country;
    if (patch.phone !== undefined) dbPayload.phone = patch.phone;
    if (patch.whatsapp !== undefined) dbPayload.whatsapp = patch.whatsapp;
    if (patch.email !== undefined) dbPayload.email = patch.email;
    if (patch.bio !== undefined) dbPayload.bio = patch.bio;
    if (patch.badges !== undefined) dbPayload.badges = patch.badges;

    const { error } = await supabase
      .from('alumni_profiles')
      .update(dbPayload)
      .eq('id', targetUserId);

    if (error) return { success: false, error: error.message };

    await supabase.from('audit_logs').insert({
      actor_profile_id: reviewerId,
      action: 'ADMIN_UPDATE_PROFILE',
      entity_table: 'alumni_profiles',
      entity_id: String(targetUserId),
      new_values: patch,
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

  if (!isSupabaseConfigured) {
    try {
      const profiles = loadStoredAlumniProfiles();
      const pIdx = profiles.findIndex((p) => p.id === targetUserId);
      if (pIdx !== -1) {
        profiles[pIdx].phoneOwnershipVerified = true;
        (profiles[pIdx] as any).phoneVerifiedAt = nowIso;
        (profiles[pIdx] as any).phoneVerificationNotes = notes;
        saveStoredAlumniProfiles(profiles);

        saveLocalAuditLog({
          actorProfileId: reviewerId,
          actorRole: 'admin',
          action: 'CERTIFY_PHONE_OWNERSHIP',
          entityTable: 'alumni_profiles',
          entityId: String(targetUserId),
          newValues: { phone_ownership_verified: true, notes },
          reason: notes || 'Administrative phone certification',
        });
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message };
    }
  }

  try {
    const { error } = await supabase
      .from('alumni_profiles')
      .update({
        phone_ownership_verified: true,
        phone_verified_at: nowIso,
        phone_verified_by_profile_id: reviewerId,
        phone_verification_notes: notes || 'Certified by administrator',
        updated_at: nowIso,
      })
      .eq('id', targetUserId);

    if (error) return { success: false, error: error.message };

    await supabase.from('audit_logs').insert({
      actor_profile_id: reviewerId,
      action: 'CERTIFY_PHONE_OWNERSHIP',
      entity_table: 'alumni_profiles',
      entity_id: String(targetUserId),
      new_values: { phone_ownership_verified: true },
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

  if (isSupabaseConfigured) {
    try {
      const { data } = await supabase
        .from('alumni_profiles')
        .select('*')
        .order('id', { ascending: true });
      if (data && data.length > 0) {
        alumniData = data;
      }
    } catch {}
  }

  if (alumniData.length === 0) {
    alumniData = loadStoredAlumniProfiles();
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
    // Generate clean CSV
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
  if (!isSupabaseConfigured) {
    try {
      const raw = localStorage.getItem(localKey);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [
      {
        id: 1,
        senderName: 'Dr. Shahriar Rahman',
        email: 'shahriar.szmc@gmail.com',
        phone: '+880 1712-334455',
        subject: 'Batch 28 Reunion Contribution Query',
        message: 'Could you please confirm the official bKash merchant transaction verification method for our batch alumni contribution?',
        status: 'new',
        createdAt: new Date().toISOString(),
      },
      {
        id: 2,
        senderName: 'Dr. Nusrat Jahan',
        email: 'nusrat.szmc@yahoo.com',
        phone: '+880 1819-887766',
        subject: 'BMDC Certificate Verification Help',
        message: 'I have submitted my BMDC registration copy. Kindly expedite review so I can access the emergency blood coordination circle.',
        status: 'in_progress',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ];
  }

  try {
    const { data, error } = await supabase
      .from('contact_inquiries')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data && data.length > 0) return data;
  } catch {}
  return [];
}

export async function updateContactInquiryStatus(params: {
  id: number;
  status: 'new' | 'in_progress' | 'resolved' | 'archived';
  adminNote?: string;
}): Promise<boolean> {
  const { id, status, adminNote } = params;
  if (!isSupabaseConfigured) {
    const localKey = 'szmc_contact_inquiries_list';
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
  }
  try {
    const { error } = await supabase
      .from('contact_inquiries')
      .update({ status, admin_note: adminNote, updated_at: new Date().toISOString() })
      .eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Fetch and moderate blood emergencies
 */
export async function fetchBloodRequestsForModeration(): Promise<any[]> {
  const localKey = 'szmc_blood_emergencies_list';
  if (!isSupabaseConfigured) {
    try {
      const raw = localStorage.getItem(localKey);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [
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
  }

  try {
    const { data, error } = await supabase
      .from('blood_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data && data.length > 0) return data;
  } catch {}
  return [];
}

export async function updateBloodRequestModeration(params: {
  id: number;
  status: 'open' | 'fulfilled' | 'cancelled';
  unitsFulfilled?: number;
  moderationNote?: string;
}): Promise<boolean> {
  const { id, status, unitsFulfilled, moderationNote } = params;
  if (!isSupabaseConfigured) {
    const localKey = 'szmc_blood_emergencies_list';
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
  }
  try {
    const payload: any = { status, updated_at: new Date().toISOString() };
    if (unitsFulfilled !== undefined) payload.units_fulfilled = unitsFulfilled;
    if (moderationNote !== undefined) payload.moderation_note = moderationNote;
    const { error } = await supabase.from('blood_requests').update(payload).eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Gallery Albums Administration
 */
export async function fetchGalleryAlbumsForAdmin(): Promise<any[]> {
  const localKey = 'szmc_gallery_albums_list';
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
      coverUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&auto=format&fit=crop&q=80',
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
      coverUrl: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600&auto=format&fit=crop&q=80',
      photosCount: 18,
      isPublished: true,
      batchYear: 20,
      createdAt: '2026-09-02',
    },
    {
      id: 'album-3',
      title: 'Emergency Blood Donation Camp & Health Day',
      description: 'Mobilization of voluntary blood donors across Northern Bangladesh medical units.',
      category: 'Welfare',
      coverUrl: 'https://images.unsplash.com/photo-1615461066841-6116e61058f4?w=600&auto=format&fit=crop&q=80',
      photosCount: 31,
      isPublished: true,
      batchYear: 32,
      createdAt: '2026-10-10',
    },
  ];
}

export function saveGalleryAlbums(albums: any[]): void {
  try {
    localStorage.setItem('szmc_gallery_albums_list', JSON.stringify(albums));
  } catch {}
}
