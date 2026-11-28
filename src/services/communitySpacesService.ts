import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { OFFICIAL_PAGES_DIRECTORY } from '../components/community/quadConstants';
import { BATCH_LIST } from '../data/mockData';
import type { PostItem } from '../types';
import { isPublicRowProfileCompleted } from '../utils/profileCompletion';

export type SpacePostKind = 'discussion' | 'announcement' | 'event' | 'memory' | 'poll';

export interface BatchLoungeInfo {
  batchYear: number;
  slug: string;
  title: string;
  session: string;
  description: string;
  coverImageUrl?: string | null;
  welcomeNote?: string | null;
  isActive: boolean;
  postsCount: number;
}

export interface BatchLoungeModerator {
  id: number;
  batchYear: number;
  profileId: number;
  role: 'coordinator' | 'moderator';
  fullName: string;
  avatarUrl: string;
  position: string;
  institution: string;
  verified: boolean;
}

export interface OfficialPageInfo {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  avatarUrl?: string | null;
  coverImageUrl?: string | null;
  portalRoute?: string | null;
  isVerified: boolean;
  isActive: boolean;
  followersCount: number;
  postsCount: number;
  isFollowing?: boolean;
  myRole?: 'admin' | 'editor' | null;
}

export interface OfficialPageRoleMember {
  id: number;
  pageId: number;
  profileId: number;
  role: 'admin' | 'editor';
  fullName: string;
  avatarUrl: string;
  batchYear?: number;
  position: string;
  institution: string;
  verified: boolean;
}

export interface PollOption {
  id: string;
  text: string;
}

export interface CommunityPoll {
  id: number;
  batchYear?: number | null;
  officialPageId?: number | null;
  authorId: number;
  authorName: string;
  authorAvatar: string;
  question: string;
  options: PollOption[];
  isClosed: boolean;
  closesAt?: string | null;
  createdAt: string;
  voteCounts: Record<string, number>;
  totalVotes: number;
  myVoteOptionId: string | null;
}

export interface SpacePost extends PostItem {
  batchLoungeYear?: number | null;
  officialPageId?: number | null;
  postKind: SpacePostKind;
}

export interface OfficialPageAnalytics {
  followersCount: number;
  postsCount: number;
  pinnedCount: number;
  totalLikes: number;
  totalComments: number;
  avgEngagementPerPost: number;
}

function isMissingTableError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === '42703' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('schema cache')
  );
}

function buildFallbackBatchLounge(batchYear: number): BatchLoungeInfo {
  const padded = batchYear < 10 ? `0${batchYear}` : String(batchYear);
  const found = BATCH_LIST.find((b) => b.batchYear === batchYear);
  const session = found?.session || `${1990 + batchYear}-${String((1991 + batchYear) % 100).padStart(2, '0')}`;
  return {
    batchYear,
    slug: `batch-${padded}`,
    title: `SZMC Batch ${padded} Lounge`,
    session,
    description: `Dedicated community space for MBBS Batch SZMC-${padded} (Session ${session}) — announcements, reunions, campus memories, polls, and classmate discussions.`,
    welcomeNote: `Welcome to the official SZMC-${padded} Batch Lounge. Share updates, coordinate reunions, and reconnect with your batchmates.`,
    isActive: true,
    postsCount: 0,
  };
}

function buildFallbackOfficialPages(): OfficialPageInfo[] {
  return OFFICIAL_PAGES_DIRECTORY.map((item, idx) => ({
    id: idx + 1,
    slug: item.slug,
    name: item.name,
    tagline: item.subtitle,
    description: `Official verified institutional page for ${item.name} under the Shaheed Ziaur Rahman Medical College (SZMC Bogura) Alumni Network.`,
    category: item.category,
    avatarUrl: null,
    coverImageUrl: null,
    portalRoute: item.portalRoute || null,
    isVerified: true,
    isActive: true,
    followersCount: 0,
    postsCount: 0,
    isFollowing: false,
    myRole: null,
  }));
}

export async function fetchBatchLounge(batchYear: number): Promise<BatchLoungeInfo> {
  const clamped = Math.max(1, Math.min(35, Math.floor(batchYear)));
  if (!isSupabaseConfigured) return buildFallbackBatchLounge(clamped);

  try {
    const { data, error } = await supabase
      .from('batch_lounges')
      .select('batch_year, slug, title, session, description, cover_image_url, welcome_note, is_active, posts_count')
      .eq('batch_year', clamped)
      .maybeSingle();

    if (error || !data) {
      return buildFallbackBatchLounge(clamped);
    }

    return {
      batchYear: Number(data.batch_year),
      slug: data.slug,
      title: data.title,
      session: data.session,
      description: data.description || '',
      coverImageUrl: data.cover_image_url,
      welcomeNote: data.welcome_note,
      isActive: Boolean(data.is_active),
      postsCount: Number(data.posts_count || 0),
    };
  } catch {
    return buildFallbackBatchLounge(clamped);
  }
}

export async function fetchBatchLoungeModerators(batchYear: number): Promise<BatchLoungeModerator[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('batch_lounge_moderators')
      .select('id, batch_year, profile_id, role')
      .eq('batch_year', batchYear);

    if (error || !data || data.length === 0) return [];

    const profileIds = data.map((r: any) => Number(r.profile_id));
    const { data: profiles } = await supabase
      .from('alumni_profiles')
      .select('id, full_name, avatar_url, position, institution, verification_status')
      .in('id', profileIds);

    const profileMap = new Map<number, any>((profiles || []).map((p: any) => [Number(p.id), p]));

    return data.map((row: any) => {
      const p = profileMap.get(Number(row.profile_id)) || {};
      return {
        id: Number(row.id),
        batchYear: Number(row.batch_year),
        profileId: Number(row.profile_id),
        role: row.role === 'coordinator' ? 'coordinator' : 'moderator',
        fullName: p.full_name || 'SZMC Alumnus',
        avatarUrl: p.avatar_url || '/assets/aistudio/images__1__2778177d.png',
        position: p.position || 'Alumni Physician',
        institution: p.institution || 'SZMC Alumni Network',
        verified: p.verification_status === 'verified',
      };
    });
  } catch {
    return [];
  }
}

export async function assignBatchLoungeModerator(
  batchYear: number,
  profileId: number,
  role: 'coordinator' | 'moderator',
  assignedBy: number
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Database connection unavailable.' };
  const { error } = await supabase
    .from('batch_lounge_moderators')
    .upsert(
      { batch_year: batchYear, profile_id: profileId, role, assigned_by: assignedBy },
      { onConflict: 'batch_year,profile_id' }
    );
  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: 'Run Phase 3 SQL migration (022) in Supabase to enable moderator assignments.' };
    }
    return { ok: false, error: error.message || 'Permission denied.' };
  }
  return { ok: true };
}

export async function removeBatchLoungeModerator(
  batchYear: number,
  profileId: number
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Database connection unavailable.' };
  const { error } = await supabase
    .from('batch_lounge_moderators')
    .delete()
    .eq('batch_year', batchYear)
    .eq('profile_id', profileId);
  if (error) return { ok: false, error: error.message || 'Could not remove moderator.' };
  return { ok: true };
}

export async function fetchOfficialPages(currentProfileId?: number): Promise<{
  pages: OfficialPageInfo[];
  migrationReady: boolean;
}> {
  if (!isSupabaseConfigured) {
    return { pages: buildFallbackOfficialPages(), migrationReady: false };
  }

  try {
    const { data, error } = await supabase
      .from('official_pages')
      .select('id, slug, name, tagline, description, category, avatar_url, cover_image_url, portal_route, is_verified, is_active, followers_count, posts_count')
      .eq('is_active', true)
      .order('id', { ascending: true });

    if (error) {
      if (isMissingTableError(error)) {
        return { pages: buildFallbackOfficialPages(), migrationReady: false };
      }
      return { pages: buildFallbackOfficialPages(), migrationReady: false };
    }

    if (!data || data.length === 0) {
      return { pages: buildFallbackOfficialPages(), migrationReady: true };
    }

    let followedIds = new Set<number>();
    const roleMap = new Map<number, 'admin' | 'editor'>();

    if (currentProfileId) {
      const [followsRes, rolesRes] = await Promise.all([
        supabase.from('official_page_followers').select('page_id').eq('profile_id', currentProfileId),
        supabase.from('official_page_roles').select('page_id, role').eq('profile_id', currentProfileId),
      ]);
      if (!followsRes.error && Array.isArray(followsRes.data)) {
        followedIds = new Set(followsRes.data.map((r: any) => Number(r.page_id)));
      }
      if (!rolesRes.error && Array.isArray(rolesRes.data)) {
        rolesRes.data.forEach((r: any) => {
          if (r.role === 'admin' || r.role === 'editor') {
            roleMap.set(Number(r.page_id), r.role);
          }
        });
      }
    }

    const pages: OfficialPageInfo[] = data.map((row: any) => ({
      id: Number(row.id),
      slug: row.slug,
      name: row.name,
      tagline: row.tagline || '',
      description: row.description || '',
      category: row.category || 'Announcement',
      avatarUrl: row.avatar_url,
      coverImageUrl: row.cover_image_url,
      portalRoute: row.portal_route,
      isVerified: Boolean(row.is_verified),
      isActive: Boolean(row.is_active),
      followersCount: Number(row.followers_count || 0),
      postsCount: Number(row.posts_count || 0),
      isFollowing: followedIds.has(Number(row.id)),
      myRole: roleMap.get(Number(row.id)) || null,
    }));

    return { pages, migrationReady: true };
  } catch {
    return { pages: buildFallbackOfficialPages(), migrationReady: false };
  }
}

export async function fetchOfficialPageBySlug(
  slug: string,
  currentProfileId?: number
): Promise<{ page: OfficialPageInfo | null; migrationReady: boolean }> {
  const { pages, migrationReady } = await fetchOfficialPages(currentProfileId);
  const page = pages.find((p) => p.slug === slug) || null;
  return { page, migrationReady };
}

export async function toggleOfficialPageFollow(
  pageId: number,
  profileId: number,
  currentlyFollowing: boolean
): Promise<{ ok: boolean; following: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, following: currentlyFollowing, error: 'Database connection unavailable.' };
  }

  if (currentlyFollowing) {
    const { error } = await supabase
      .from('official_page_followers')
      .delete()
      .eq('page_id', pageId)
      .eq('profile_id', profileId);
    if (error) {
      if (isMissingTableError(error)) {
        return {
          ok: false,
          following: currentlyFollowing,
          error: 'Run Phase 3 SQL migration (022) in Supabase to persist page follows.',
        };
      }
      return { ok: false, following: currentlyFollowing, error: error.message };
    }
    return { ok: true, following: false };
  } else {
    const { error } = await supabase
      .from('official_page_followers')
      .insert({ page_id: pageId, profile_id: profileId });
    if (error) {
      if (isMissingTableError(error)) {
        return {
          ok: false,
          following: currentlyFollowing,
          error: 'Run Phase 3 SQL migration (022) in Supabase to persist page follows.',
        };
      }
      return { ok: false, following: currentlyFollowing, error: error.message };
    }
    return { ok: true, following: true };
  }
}

export async function fetchOfficialPageRoles(pageId: number): Promise<OfficialPageRoleMember[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('official_page_roles')
      .select('id, page_id, profile_id, role')
      .eq('page_id', pageId);

    if (error || !data || data.length === 0) return [];

    const profileIds = data.map((r: any) => Number(r.profile_id));
    const { data: profiles } = await supabase
      .from('alumni_profiles')
      .select('id, full_name, avatar_url, batch_year, position, institution, verification_status')
      .in('id', profileIds);

    const map = new Map<number, any>((profiles || []).map((p: any) => [Number(p.id), p]));
    return data.map((row: any) => {
      const p = map.get(Number(row.profile_id)) || {};
      return {
        id: Number(row.id),
        pageId: Number(row.page_id),
        profileId: Number(row.profile_id),
        role: row.role === 'admin' ? 'admin' : 'editor',
        fullName: p.full_name || 'SZMC Alumnus',
        avatarUrl: p.avatar_url || '/assets/aistudio/images__1__2778177d.png',
        batchYear: p.batch_year ? Number(p.batch_year) : undefined,
        position: p.position || 'Alumni Physician',
        institution: p.institution || 'SZMC Alumni Network',
        verified: p.verification_status === 'verified',
      };
    });
  } catch {
    return [];
  }
}

export async function assignOfficialPageRole(
  pageId: number,
  profileId: number,
  role: 'admin' | 'editor',
  assignedBy: number
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Database connection unavailable.' };
  const { error } = await supabase
    .from('official_page_roles')
    .upsert(
      { page_id: pageId, profile_id: profileId, role, assigned_by: assignedBy },
      { onConflict: 'page_id,profile_id' }
    );
  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: 'Run Phase 3 SQL migration (022) in Supabase to manage page roles.' };
    }
    return { ok: false, error: error.message || 'Permission denied.' };
  }
  return { ok: true };
}

export async function removeOfficialPageRole(
  pageId: number,
  profileId: number
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Database connection unavailable.' };
  const { error } = await supabase
    .from('official_page_roles')
    .delete()
    .eq('page_id', pageId)
    .eq('profile_id', profileId);
  if (error) return { ok: false, error: error.message || 'Could not remove page role.' };
  return { ok: true };
}

export async function fetchSpacePosts(options: {
  batchLoungeYear?: number;
  officialPageId?: number;
  officialPageCategory?: string;
  limit?: number;
}): Promise<{ posts: SpacePost[]; migrationReady: boolean }> {
  if (!isSupabaseConfigured) return { posts: [], migrationReady: false };

  const limit = options.limit || 40;
  try {
    let query = supabase
      .from('posts')
      .select(
        'id, author_id, content, category, images, videos, likes_count, comments_count, is_pinned, is_edited, created_at, batch_lounge_year, official_page_id, post_kind'
      )
      .eq('is_deleted', false)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (options.batchLoungeYear) {
      query = query.eq('batch_lounge_year', options.batchLoungeYear);
    } else if (options.officialPageId) {
      query = query.eq('official_page_id', options.officialPageId);
    }

    const { data, error } = await query;

    if (error && isMissingTableError(error)) {
      // Graceful pre-migration fallback: query existing posts by author batch or category
      const fallbackPosts = await fetchFallbackSpacePosts(options);
      return { posts: fallbackPosts, migrationReady: false };
    }

    if (error || !data) {
      return { posts: [], migrationReady: true };
    }

    let rows = data;
    // For batch lounges, if no lounge-scoped posts exist yet, also include recent posts by batchmates
    if (options.batchLoungeYear && rows.length === 0) {
      const fallbackPosts = await fetchFallbackSpacePosts(options);
      return { posts: fallbackPosts, migrationReady: true };
    }

    const mapped = await hydrateSpacePosts(rows);
    return { posts: mapped, migrationReady: true };
  } catch {
    return { posts: [], migrationReady: false };
  }
}

async function fetchFallbackSpacePosts(options: {
  batchLoungeYear?: number;
  officialPageCategory?: string;
  limit?: number;
}): Promise<SpacePost[]> {
  try {
    if (options.batchLoungeYear) {
      const { data: members } = await supabase
        .from('alumni_profiles')
        .select('id')
        .eq('batch_year', options.batchLoungeYear)
        .limit(200);
      const memberIds = (members || []).map((m: any) => Number(m.id));
      if (memberIds.length === 0) return [];

      const { data: postsData } = await supabase
        .from('posts')
        .select('id, author_id, content, category, images, videos, likes_count, comments_count, is_pinned, is_edited, created_at')
        .eq('is_deleted', false)
        .in('author_id', memberIds)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(options.limit || 25);

      return hydrateSpacePosts(postsData || []);
    }

    const { data: postsData } = await supabase
      .from('posts')
      .select('id, author_id, content, category, images, videos, likes_count, comments_count, is_pinned, is_edited, created_at')
      .eq('is_deleted', false)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(options.limit || 20);

    return hydrateSpacePosts(postsData || []);
  } catch {
    return [];
  }
}

async function hydrateSpacePosts(rows: any[]): Promise<SpacePost[]> {
  if (!rows || rows.length === 0) return [];
  const authorIds = Array.from(new Set(rows.map((r) => Number(r.author_id)).filter(Boolean)));
  const { data: authors } =
    authorIds.length > 0
      ? await supabase
          .from('alumni_profiles')
          .select('id, full_name, avatar_url, batch_year, verification_status, position, institution, cadre, specialty, degree, city, country, bio, career_history')
          .in('id', authorIds)
      : { data: [] };

  const authorMap = new Map<number, any>((authors || []).map((a: any) => [Number(a.id), a]));

  return rows.map((row: any) => {
    const a = authorMap.get(Number(row.author_id)) || {};
    const images = Array.isArray(row.images) ? row.images : [];
    const videos = Array.isArray(row.videos) ? row.videos : [];
    const kind: SpacePostKind =
      row.post_kind && ['discussion', 'announcement', 'event', 'memory', 'poll'].includes(row.post_kind)
        ? row.post_kind
        : row.is_pinned
        ? 'announcement'
        : images.length > 0
        ? 'memory'
        : 'discussion';

    return {
      id: Number(row.id),
      userId: Number(row.author_id),
      authorId: Number(row.author_id),
      fullName: a.full_name || 'SZMC Alumnus',
      author: a.full_name || 'SZMC Alumnus',
      avatarUrl: a.avatar_url || '/assets/aistudio/images__1__2778177d.png',
      authorAvatar: a.avatar_url || '/assets/aistudio/images__1__2778177d.png',
      batchYear: a.batch_year ? Number(a.batch_year) : undefined,
      authorBatch: a.batch_year ? Number(a.batch_year) : undefined,
      verified: a.verification_status === 'verified',
      profileCompleted: isPublicRowProfileCompleted(a),
      profession: a.position || 'Doctor / Medical Professional',
      institution: a.institution || undefined,
      content: row.content || '',
      category: row.category || 'General Update',
      images,
      videos,
      likesCount: Number(row.likes_count || 0),
      likes: Number(row.likes_count || 0),
      commentsCount: Number(row.comments_count || 0),
      createdAt: row.created_at || new Date().toISOString(),
      timestamp: row.created_at || new Date().toISOString(),
      likedByMe: false,
      liked: false,
      pinned: Boolean(row.is_pinned),
      isEdited: Boolean(row.is_edited),
      comments: [],
      commentsList: [],
      shares: 0,
      batchLoungeYear: row.batch_lounge_year ? Number(row.batch_lounge_year) : null,
      officialPageId: row.official_page_id ? Number(row.official_page_id) : null,
      postKind: kind,
    };
  });
}

export async function createSpacePost(payload: {
  authorId: number;
  content: string;
  category?: string;
  images?: string[];
  batchLoungeYear?: number;
  officialPageId?: number;
  postKind?: SpacePostKind;
  isPinned?: boolean;
}): Promise<{ ok: boolean; post?: SpacePost; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Database connection unavailable.' };
  const trimmed = payload.content.trim();
  if (!trimmed) return { ok: false, error: 'Post content cannot be empty.' };

  // Map to legacy post_category_type enum values accepted by 001_core_schema.sql
  const allowedDbCategories = new Set([
    'General Update',
    'Tech & Innovation',
    'Professional Insights',
    'Reunion',
    'Achievement',
  ]);
  const dbCategory =
    payload.category && allowedDbCategories.has(payload.category)
      ? payload.category
      : payload.postKind === 'event'
      ? 'Reunion'
      : 'General Update';

  const insertRow: Record<string, any> = {
    author_id: payload.authorId,
    content: trimmed,
    category: dbCategory,
    images: payload.images || [],
    is_pinned: Boolean(payload.isPinned),
    post_kind: payload.postKind || 'discussion',
  };

  if (payload.batchLoungeYear) {
    insertRow.batch_lounge_year = payload.batchLoungeYear;
  }
  if (payload.officialPageId) {
    insertRow.official_page_id = payload.officialPageId;
  }

  const { data, error } = await supabase
    .from('posts')
    .insert(insertRow)
    .select(
      'id, author_id, content, category, images, videos, likes_count, comments_count, is_pinned, is_edited, created_at, batch_lounge_year, official_page_id, post_kind'
    )
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return {
        ok: false,
        error: 'Run Phase 3 SQL migration (022) in Supabase SQL Editor to enable space-scoped posts.',
      };
    }
    return { ok: false, error: error.message || 'Unable to publish post.' };
  }

  const hydrated = await hydrateSpacePosts([data]);
  return { ok: true, post: hydrated[0] };
}

export async function togglePinSpacePost(
  postId: number,
  nextPinned: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Database connection unavailable.' };
  const { error } = await supabase
    .from('posts')
    .update({ is_pinned: nextPinned })
    .eq('id', postId);
  if (error) return { ok: false, error: error.message || 'Could not update pin status.' };
  return { ok: true };
}

export async function fetchCommunityPolls(options: {
  batchYear?: number;
  officialPageId?: number;
  currentProfileId?: number;
}): Promise<{ polls: CommunityPoll[]; migrationReady: boolean }> {
  if (!isSupabaseConfigured) return { polls: [], migrationReady: false };

  try {
    let query = supabase
      .from('community_polls')
      .select('id, batch_year, official_page_id, author_id, question, options, is_closed, closes_at, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    if (options.batchYear) {
      query = query.eq('batch_year', options.batchYear);
    } else if (options.officialPageId) {
      query = query.eq('official_page_id', options.officialPageId);
    }

    const { data, error } = await query;
    if (error) {
      return { polls: [], migrationReady: !isMissingTableError(error) };
    }
    if (!data || data.length === 0) {
      return { polls: [], migrationReady: true };
    }

    const pollIds = data.map((p: any) => Number(p.id));
    const authorIds = Array.from(new Set(data.map((p: any) => Number(p.author_id)).filter(Boolean)));

    const [votesRes, authorsRes] = await Promise.all([
      supabase.from('community_poll_votes').select('poll_id, profile_id, option_id').in('poll_id', pollIds),
      authorIds.length > 0
        ? supabase.from('alumni_profiles').select('id, full_name, avatar_url').in('id', authorIds)
        : Promise.resolve({ data: [] }),
    ]);

    const authorMap = new Map<number, any>(((authorsRes as any)?.data || []).map((a: any) => [Number(a.id), a]));
    const votes = (votesRes as any)?.data || [];

    const polls: CommunityPoll[] = data.map((row: any) => {
      const pId = Number(row.id);
      const author = authorMap.get(Number(row.author_id)) || {};
      const parsedOptions: PollOption[] = Array.isArray(row.options)
        ? row.options.map((o: any, i: number) => ({
            id: String(o?.id || `opt-${i + 1}`),
            text: String(o?.text || `Option ${i + 1}`),
          }))
        : [];

      const voteCounts: Record<string, number> = {};
      parsedOptions.forEach((o) => {
        voteCounts[o.id] = 0;
      });
      let totalVotes = 0;
      let myVoteOptionId: string | null = null;

      votes
        .filter((v: any) => Number(v.poll_id) === pId)
        .forEach((v: any) => {
          const optId = String(v.option_id);
          voteCounts[optId] = (voteCounts[optId] || 0) + 1;
          totalVotes += 1;
          if (options.currentProfileId && Number(v.profile_id) === options.currentProfileId) {
            myVoteOptionId = optId;
          }
        });

      return {
        id: pId,
        batchYear: row.batch_year ? Number(row.batch_year) : null,
        officialPageId: row.official_page_id ? Number(row.official_page_id) : null,
        authorId: Number(row.author_id),
        authorName: author.full_name || 'SZMC Alumnus',
        authorAvatar: author.avatar_url || '/assets/aistudio/images__1__2778177d.png',
        question: row.question,
        options: parsedOptions,
        isClosed: Boolean(row.is_closed),
        closesAt: row.closes_at,
        createdAt: row.created_at,
        voteCounts,
        totalVotes,
        myVoteOptionId,
      };
    });

    return { polls, migrationReady: true };
  } catch {
    return { polls: [], migrationReady: false };
  }
}

export async function createCommunityPoll(payload: {
  authorId: number;
  question: string;
  options: string[];
  batchYear?: number;
  officialPageId?: number;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Database connection unavailable.' };
  const cleanQuestion = payload.question.trim();
  const cleanOptions = payload.options
    .map((o) => o.trim())
    .filter(Boolean)
    .slice(0, 6);

  if (cleanQuestion.length < 4) {
    return { ok: false, error: 'Poll question must be at least 4 characters.' };
  }
  if (cleanOptions.length < 2) {
    return { ok: false, error: 'Provide at least 2 poll options.' };
  }

  const formattedOptions = cleanOptions.map((text, idx) => ({
    id: `opt_${idx + 1}`,
    text,
  }));

  const { error } = await supabase.from('community_polls').insert({
    author_id: payload.authorId,
    batch_year: payload.batchYear ?? null,
    official_page_id: payload.officialPageId ?? null,
    question: cleanQuestion,
    options: formattedOptions,
  });

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: 'Run Phase 3 SQL migration (022) in Supabase to create community polls.' };
    }
    return { ok: false, error: error.message || 'Unable to create poll.' };
  }

  return { ok: true };
}

export async function voteCommunityPoll(
  pollId: number,
  profileId: number,
  optionId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Database connection unavailable.' };
  const { error } = await supabase
    .from('community_poll_votes')
    .upsert({ poll_id: pollId, profile_id: profileId, option_id: optionId }, { onConflict: 'poll_id,profile_id' });

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: 'Run Phase 3 SQL migration (022) in Supabase to record votes.' };
    }
    return { ok: false, error: error.message || 'Unable to submit vote.' };
  }
  return { ok: true };
}

export function computeOfficialPageAnalytics(
  page: OfficialPageInfo,
  posts: SpacePost[]
): OfficialPageAnalytics {
  const postsCount = Math.max(page.postsCount, posts.length);
  const pinnedCount = posts.filter((p) => p.pinned).length;
  const totalLikes = posts.reduce((acc, p) => acc + (Number(p.likesCount) || 0), 0);
  const totalComments = posts.reduce((acc, p) => acc + (Number(p.commentsCount) || 0), 0);
  const avgEngagementPerPost =
    posts.length > 0 ? Math.round(((totalLikes + totalComments) / posts.length) * 10) / 10 : 0;

  return {
    followersCount: page.followersCount,
    postsCount,
    pinnedCount,
    totalLikes,
    totalComments,
    avgEngagementPerPost,
  };
}
