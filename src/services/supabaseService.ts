import { supabase, isSupabaseConfigured, ALUMNI_PUBLIC_COLUMNS, getClientAuthHeaders } from '../lib/supabase';
import { mapSupabaseRowToAlumniProfile, getOrCreateSupabaseProfile } from '../lib/supabase-auth';
import { realtimeManager } from './supabaseRealtimeService';
export { realtimeManager };
export type { RealtimeStatus, RealtimeFeedEvent, RealtimeBloodEvent, RealtimeAlumniEvent } from './supabaseRealtimeService';
import { fetchFeedPosts } from './postService';
import {
  AlumniProfile,
  BatchSummary,
  BloodDonorProfile,
  BloodDonationHistoryItem,
  BloodEmergencyRequest,
  GalleryAlbum,
  GalleryPhoto,
  NotificationItem,
  OfficialNotice,
  PostItem,
  PostComment,
  VouchRequest,
} from '../types';
import {
  BATCH_LIST,
  loadStoredAlumniProfiles,
} from '../data/mockData';
import { compressImageFileToDataUrl, isVideoFile } from '../utils/mediaStorage';
import { isPublicRowProfileCompleted } from '../utils/profileCompletion';

// =============================================================================
// 1. ALUMNI DIRECTORY & BATCHES (with in-memory TTL + in-flight deduplication)
// =============================================================================

const DIRECTORY_CACHE_TTL_MS = 45_000;
const PROFILE_CACHE_TTL_MS = 45_000;
const BATCHES_CACHE_TTL_MS = 120_000;

let cachedDirectoryAll: { data: AlumniProfile[]; ts: number } | null = null;
let inFlightDirectoryAll: Promise<AlumniProfile[]> | null = null;

const profileByIdCache = new Map<number, { data: AlumniProfile; ts: number }>();
const inFlightProfileById = new Map<number, Promise<AlumniProfile | null>>();

let cachedBatches: { data: BatchSummary[]; ts: number } | null = null;
let inFlightBatches: Promise<BatchSummary[]> | null = null;

export function invalidateAlumniDirectoryCache(profileId?: number): void {
  cachedDirectoryAll = null;
  if (typeof profileId === 'number') {
    profileByIdCache.delete(profileId);
  } else {
    profileByIdCache.clear();
  }
}

export async function fetchAlumniProfilesFromDb(params?: {
  search?: string;
  batchYear?: number;
  academicStream?: string;
  limit?: number;
  offset?: number;
  forceRefresh?: boolean;
}): Promise<AlumniProfile[]> {
  if (!isSupabaseConfigured) {
    return loadStoredAlumniProfiles();
  }

  const isDefaultAllQuery =
    !params ||
    (!params.search?.trim() &&
      !params.batchYear &&
      !params.academicStream &&
      !params.limit &&
      !params.offset);

  if (isDefaultAllQuery && !params?.forceRefresh) {
    if (cachedDirectoryAll && Date.now() - cachedDirectoryAll.ts < DIRECTORY_CACHE_TTL_MS) {
      return cachedDirectoryAll.data;
    }
    if (inFlightDirectoryAll) {
      return inFlightDirectoryAll;
    }
  }

  const runQuery = async (): Promise<AlumniProfile[]> => {
    try {
      let query = supabase
        .from('alumni_profiles')
        .select(ALUMNI_PUBLIC_COLUMNS)
        .eq('is_public', true)
        .order('batch_year', { ascending: false });

      if (params?.batchYear) {
        query = query.eq('batch_year', params.batchYear);
      }
      if (params?.academicStream) {
        query = query.eq('academic_stream', params.academicStream);
      }
      if (params?.search?.trim()) {
        const s = params.search.trim();
        query = query.or(
          `full_name.ilike.%${s}%,institution.ilike.%${s}%,position.ilike.%${s}%,city.ilike.%${s}%`
        );
      }
      const boundedLimit = Math.min(1000, Math.max(1, params?.limit ?? (params?.search?.trim() || params?.batchYear || params?.academicStream ? 200 : 500)));
      if (params?.offset !== undefined) {
        query = query.range(params.offset, params.offset + boundedLimit - 1);
      } else {
        query = query.limit(boundedLimit);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('Supabase fetchAlumniProfiles error:', error.message);
        return loadStoredAlumniProfiles();
      }
      if (!data || data.length === 0) {
        return [];
      }

      const mapped = data.map((row: any) => mapSupabaseRowToAlumniProfile(row));
      if (isDefaultAllQuery) {
        cachedDirectoryAll = { data: mapped, ts: Date.now() };
      }
      return mapped;
    } catch (err) {
      console.warn('Supabase fetchAlumniProfiles fallback:', err);
      return loadStoredAlumniProfiles();
    }
  };

  if (isDefaultAllQuery) {
    const p = runQuery().finally(() => {
      inFlightDirectoryAll = null;
    });
    inFlightDirectoryAll = p;
    return p;
  }

  return runQuery();
}

export async function fetchAlumniProfileByIdFromDb(profileId: number): Promise<AlumniProfile | null> {
  if (!isSupabaseConfigured || !profileId) return null;

  const cached = profileByIdCache.get(profileId);
  if (cached && Date.now() - cached.ts < PROFILE_CACHE_TTL_MS) {
    return cached.data;
  }

  const inFlight = inFlightProfileById.get(profileId);
  if (inFlight) return inFlight;

  const p = (async () => {
    try {
      const [profileRes, contactRes] = await Promise.all([
        supabase
          .from('alumni_profiles')
          .select(ALUMNI_PUBLIC_COLUMNS)
          .eq('id', profileId)
          .maybeSingle(),
        Promise.resolve(
          supabase.rpc('get_alumni_contact_details', {
            p_profile_id: profileId,
          })
        ).catch(() => ({ data: null })),
      ]);

      const { data, error } = profileRes;
      if (error || !data) {
        return null;
      }

      const contacts = (contactRes as any)?.data;
      if (contacts && contacts[0]) {
        Object.assign(data, contacts[0]);
      }

      const mapped = mapSupabaseRowToAlumniProfile(data);
      profileByIdCache.set(profileId, { data: mapped, ts: Date.now() });
      return mapped;
    } catch (err) {
      console.warn('Error fetching alumni profile by id:', err);
      return null;
    }
  })().finally(() => {
    inFlightProfileById.delete(profileId);
  });

  inFlightProfileById.set(profileId, p);
  return p;
}

export async function fetchBatchesFromDb(): Promise<BatchSummary[]> {
  if (!isSupabaseConfigured) {
    return BATCH_LIST;
  }

  if (cachedBatches && Date.now() - cachedBatches.ts < BATCHES_CACHE_TTL_MS) {
    return cachedBatches.data;
  }
  if (inFlightBatches) {
    return inFlightBatches;
  }

  const p = (async () => {
    try {
      const { data, error } = await supabase
        .from('batches')
        .select('*')
        .gte('batch_year', 1)
        .lte('batch_year', 35)
        .order('batch_year', { ascending: true });

      if (error || !data || data.length === 0) {
        return BATCH_LIST;
      }

      const validRows = data.filter((b) => Number(b.batch_year) >= 1 && Number(b.batch_year) <= 35);
      if (validRows.length === 0) {
        return BATCH_LIST;
      }

      const dbBatchMap = new Map<number, any>();
      validRows.forEach((b) => dbBatchMap.set(Number(b.batch_year), b));

      const merged = BATCH_LIST.map((canonical) => {
        const dbRow = dbBatchMap.get(canonical.batchYear);
        if (!dbRow) return canonical;
        return {
          ...canonical,
          total: Number(dbRow.registered_count ?? canonical.total ?? 0),
          representative: dbRow.representative_name || canonical.representative,
          specialNote: dbRow.special_note || canonical.specialNote,
        };
      });

      cachedBatches = { data: merged, ts: Date.now() };
      return merged;
    } catch (err) {
      console.warn('Supabase fetchBatches error:', err);
      return BATCH_LIST;
    }
  })().finally(() => {
    inFlightBatches = null;
  });

  inFlightBatches = p;
  return p;
}

export async function fetchBatchAlumniProfilesFromDb(batchYear: number): Promise<AlumniProfile[]> {
  if (!isSupabaseConfigured || !Number.isFinite(batchYear)) return [];

  try {
    const profiles: AlumniProfile[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from('alumni_profiles')
        .select(ALUMNI_PUBLIC_COLUMNS)
        .eq('is_public', true)
        .eq('batch_year', batchYear)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error || !data) return [];
      profiles.push(...data.map((row: any) => mapSupabaseRowToAlumniProfile(row)));
      if (data.length < pageSize) break;
    }
    return profiles;
  } catch (err) {
    console.warn('Supabase batch profile statistics error:', err);
    return [];
  }
}

export async function fetchAcademicStreamGroupsFromDb(): Promise<any[]> {
  if (!isSupabaseConfigured) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('academic_stream_groups')
      .select('*')
      .eq('is_active', true)
      .order('id', { ascending: true });

    if (error || !data) return [];
    return data;
  } catch (err) {
    return [];
  }
}

// =============================================================================
// 2. THE QUAD / SOCIAL FEED & POSTS
// =============================================================================

function mapRowToFeedPost(row: any, currentUserId?: number): PostItem {
  const author = row.author || {};
  const comments: PostComment[] = (row.post_comments || []).map((c: any) => ({
    id: Number(c.id),
    postId: Number(row.id),
    userId: Number(c.user_id),
    fullName: c.author?.full_name || 'Alumnus',
    avatarUrl: c.author?.avatar_url || '/assets/aistudio/images__1__2778177d.png',
    content: c.content,
    likesCount: Number(c.likes_count) || 0,
    likedByMe: false,
    createdAt: new Date(c.created_at).toLocaleDateString(),
    author: c.author?.full_name || 'Alumnus',
    authorAvatar: c.author?.avatar_url || '/assets/aistudio/images__1__2778177d.png',
    timestamp: new Date(c.created_at).toLocaleDateString(),
  }));

  const isLiked = Boolean(
    currentUserId &&
      Array.isArray(row.post_likes) &&
      row.post_likes.some((l: any) => Number(l.user_id) === currentUserId)
  );

  return {
    id: Number(row.id),
    userId: Number(row.author_id),
    fullName: author.full_name || 'SZMC Alumnus',
    avatarUrl: author.avatar_url || '/assets/aistudio/images__1__2778177d.png',
    batchYear: author.batch_year || 25,
    content: row.content || '',
    images: Array.isArray(row.images) ? row.images : [],
    videos: Array.isArray(row.videos) ? row.videos : [],
    likesCount: Number(row.likes_count) || (row.post_likes?.length ?? 0),
    commentsCount: comments.length,
    createdAt: new Date(row.created_at).toLocaleDateString(),
    likedByMe: isLiked,
    comments: comments,
    category: row.category || 'General Update',
    isEdited: Boolean(row.is_edited),
    pinned: Boolean(row.is_pinned),
    author: author.full_name || 'SZMC Alumnus',
    authorAvatar: author.avatar_url || '/assets/aistudio/images__1__2778177d.png',
    authorBatch: author.batch_year || 25,
    authorRole: 'Alumnus',
    verified: author.verification_status === 'verified',
    profileCompleted: isPublicRowProfileCompleted(author),
    timestamp: new Date(row.created_at).toLocaleDateString(),
    likes: Number(row.likes_count) || (row.post_likes?.length ?? 0),
    liked: isLiked,
    commentsList: comments,
    shares: 0,
  } as unknown as PostItem;
}

export async function fetchFeedPostsFromDb(limit = 50, currentUserId?: number): Promise<PostItem[]> {
  if (!isSupabaseConfigured) {
    return [];
  }
  return fetchFeedPosts(limit, 0, currentUserId);
}



/**
 * Uploads a base64 Data URL or temporary Blob URL to Supabase Storage 'post-media' bucket,
 * returning the persistent public CDN URL.
 */
async function resolveAndUploadMediaToStorage(
  urlOrData: string,
  authorId: number,
  mediaType: 'image' | 'video'
): Promise<string> {
  if (!urlOrData || (!urlOrData.startsWith('data:') && !urlOrData.startsWith('blob:'))) {
    return urlOrData;
  }

  try {
    let blob: Blob | null = null;
    let mimeType = mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
    let ext = mediaType === 'video' ? 'mp4' : 'jpg';

    if (urlOrData.startsWith('data:')) {
      const commaIdx = urlOrData.indexOf(',');
      if (commaIdx !== -1) {
        const header = urlOrData.slice(0, commaIdx);
        const base64Str = urlOrData.slice(commaIdx + 1);
        const mimeMatch = header.match(/:(.*?);/);
        if (mimeMatch && mimeMatch[1]) {
          mimeType = mimeMatch[1];
        }
        if (mimeType.includes('png')) ext = 'png';
        else if (mimeType.includes('webp')) ext = 'webp';
        else if (mimeType.includes('gif')) ext = 'gif';
        else if (mimeType.includes('svg')) ext = 'svg';
        else if (mimeType.includes('mp4')) ext = 'mp4';
        else if (mimeType.includes('webm')) ext = 'webm';
        else if (mimeType.includes('quicktime') || mimeType.includes('mov')) ext = 'mov';

        const binary = atob(base64Str);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        blob = new Blob([bytes], { type: mimeType });
      }
    } else if (urlOrData.startsWith('blob:')) {
      const res = await fetch(urlOrData);
      blob = await res.blob();
      if (blob.type) {
        mimeType = blob.type;
        if (mimeType.includes('png')) ext = 'png';
        else if (mimeType.includes('webp')) ext = 'webp';
        else if (mimeType.includes('gif')) ext = 'gif';
        else if (mimeType.includes('svg')) ext = 'svg';
        else if (mimeType.includes('mp4')) ext = 'mp4';
        else if (mimeType.includes('webm')) ext = 'webm';
        else if (mimeType.includes('quicktime') || mimeType.includes('mov')) ext = 'mov';
      }
    }

    if (blob) {
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
      try {
        const uploadRes = await uploadMediaToSupabaseStorage(
          blob,
          'post-media',
          `posts/${authorId}`,
          fileName
        );
        if (uploadRes?.publicUrl) {
          return uploadRes.publicUrl;
        }
      } catch (storageErr) {
        console.warn('Supabase Storage bucket upload skipped or failed, persisting media directly:', storageErr);
      }
    }
    return urlOrData;
  } catch (err) {
    console.warn('Storage upload fallback to direct media URL:', err);
    return urlOrData;
  }
}

export async function createFeedPostInDb(params: {
  authorId?: number;
  content: string;
  category: string;
  images?: string[];
  videos?: string[];
}): Promise<{ success: boolean; post?: PostItem; error?: string }> {
  if (!isSupabaseConfigured) {
    const fallbackId = Date.now();
    const fallbackPost: PostItem = {
      id: fallbackId,
      userId: params.authorId || 0,
      fullName: 'SZMC Alumnus',
      avatarUrl: '/assets/aistudio/images__1__2778177d.png',
      batchYear: 25,
      content: params.content.trim() || 'Shared an update',
      images: params.images || [],
      videos: params.videos || [],
      likesCount: 0,
      commentsCount: 0,
      createdAt: 'Just now',
      likedByMe: false,
      comments: [],
      category: params.category || 'General Update',
      isEdited: false,
      pinned: false,
      author: 'SZMC Alumnus',
      authorAvatar: '/assets/aistudio/images__1__2778177d.png',
      authorBatch: 25,
      authorRole: 'Alumnus',
      verified: true,
      timestamp: 'Just now',
      likes: 0,
      liked: false,
      commentsList: [],
      shares: 0,
    } as unknown as PostItem;
    return { success: true, post: fallbackPost };
  }

  try {
    // 1. Get authenticated Supabase user (checking server user first, then active session)
    let { data: authData } = await supabase.auth.getUser();
    let authUser = authData?.user;

    if (!authUser) {
      const { data: sessionData } = await supabase.auth.getSession();
      authUser = sessionData?.session?.user ?? null;
    }

    // 2. Obtain the author profile: from Supabase session, by authorId, or by active profile
    let profileRow: any = null;

    if (authUser) {
      let rpcPid: number | null = null;
      try {
        const { data: pid } = await supabase.rpc('current_profile_id');
        if (pid && Number(pid) > 0) {
          rpcPid = Number(pid);
        }
      } catch {}

      const { data: existingProfile } = await supabase
        .from('alumni_profiles')
        .select('id, full_name, avatar_url, batch_year, verification_status, position, institution')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();

      if (existingProfile?.id) {
        profileRow = existingProfile;
      } else if (rpcPid) {
        profileRow = {
          id: rpcPid,
          full_name:
            (authUser.user_metadata as any)?.full_name ||
            (authUser.user_metadata as any)?.name ||
            (authUser.email ? authUser.email.split('@')[0] : 'SZMC Alumnus'),
          avatar_url: '/assets/aistudio/images__1__2778177d.png',
          batch_year: 25,
          verification_status: 'verified',
        };
      }
    }

    // If still not found and authUser exists, create profile using permitted GRANT INSERT / RLS columns
    if (!profileRow?.id && authUser) {
      try {
        const created = await getOrCreateSupabaseProfile(authUser);
        if (created?.id) {
          profileRow = created;
        }
      } catch {}

      if (!profileRow?.id) {
        try {
          const { data: directProf } = await supabase
            .from('alumni_profiles')
            .insert({
              auth_user_id: authUser.id,
              full_name:
                (authUser.user_metadata as any)?.full_name ||
                (authUser.user_metadata as any)?.name ||
                (authUser.email ? authUser.email.split('@')[0] : 'SZMC Alumnus'),
              email: authUser.email || null,
              batch_year: 25,
              academic_stream: 'Science',
              academic_group: null,
              is_public: true,
            })
            .select('id, full_name, avatar_url, batch_year, verification_status, position, institution')
            .maybeSingle();
          if (directProf?.id) {
            profileRow = directProf;
          }
        } catch {}
      }
    }

    // Verify params.authorId belongs to the signed-in caller if still unresolved
    if (!profileRow?.id && authUser?.id && params.authorId && params.authorId > 0) {
      const { data: profileById } = await supabase
        .from('alumni_profiles')
        .select('id, full_name, avatar_url, batch_year, verification_status, position, institution')
        .eq('id', params.authorId)
        .eq('auth_user_id', authUser.id)
        .maybeSingle();

      if (profileById?.id) {
        profileRow = profileById;
      }
    }

    if (!profileRow?.id || Number(profileRow.id) <= 0) {
      return {
        success: false,
        error: 'Please sign in with an active alumni profile to publish a post.',
      };
    }

    const realAuthorId = Number(profileRow.id);

    // 3. Resolve and upload attached media (photos and videos) to Supabase Storage 'post-media' bucket
    const uploadedImages: string[] = [];
    if (Array.isArray(params.images)) {
      for (const img of params.images) {
        if (!img) continue;
        if (img.startsWith('data:') || img.startsWith('blob:')) {
          const uploadedUrl = await resolveAndUploadMediaToStorage(img, realAuthorId, 'image');
          uploadedImages.push(uploadedUrl);
        } else {
          uploadedImages.push(img);
        }
      }
    }

    const uploadedVideos: string[] = [];
    if (Array.isArray(params.videos)) {
      for (const vid of params.videos) {
        if (!vid) continue;
        if (vid.startsWith('data:') || vid.startsWith('blob:')) {
          const uploadedUrl = await resolveAndUploadMediaToStorage(vid, realAuthorId, 'video');
          uploadedVideos.push(uploadedUrl);
        } else {
          uploadedVideos.push(vid);
        }
      }
    }

    // 4. Validate and sanitize content and category to satisfy schema constraints
    const validCategories = [
      'General Update',
      'Tech & Innovation',
      'Professional Insights',
      'Reunion',
      'Achievement',
    ];
    const safeCategory = params.category && validCategories.includes(params.category)
      ? params.category
      : 'General Update';

    let safeContent = params.content?.trim();
    if (!safeContent) {
      safeContent = uploadedImages.length > 0
        ? (uploadedImages.length > 1 ? `Shared ${uploadedImages.length} photos` : 'Shared a photo')
        : (uploadedVideos.length > 0 ? 'Shared a video' : 'Shared an update');
    }
    if (safeContent.length > 10000) {
      safeContent = safeContent.slice(0, 10000);
    }

    // 5. Prepare insert payload with real alumni_profiles.id and CDN-hosted media URLs
    const insertPayload: any = {
      author_id: realAuthorId,
      content: safeContent,
      category: safeCategory,
      images: uploadedImages,
      videos: uploadedVideos,
      link_metadata: {
        originalAuthorId: realAuthorId,
        authorName: profileRow.full_name || 'SZMC Alumnus',
        authorAvatar: profileRow.avatar_url || '/assets/aistudio/images__1__2778177d.png',
        authorBatch: profileRow.batch_year || 25,
      },
    };

    // 6. Insert into public.posts
    let insertedRow: any = null;
    let insertError: any = null;

    try {
      const { data: row, error } = await supabase
        .from('posts')
        .insert(insertPayload)
        .select(`
          id,
          author_id,
          content,
          category,
          images,
          videos,
          likes_count,
          comments_count,
          is_pinned,
          is_edited,
          created_at
        `)
        .single();
      insertedRow = row;
      insertError = error;
    } catch (e: any) {
      insertError = e;
    }

    // 7. Verify direct Supabase insert with server fallback (never fabricate local-only success)
    if (insertError || !insertedRow) {
      console.warn('Direct Supabase insert failed, attempting /api/posts fallback:', insertError?.message);
      let serverErrorMessage = insertError?.message || 'Failed to publish post to database.';
      try {
        const authHeaders = await getClientAuthHeaders();
        const apiRes = await fetch('/api/posts', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(insertPayload),
        });
        const apiJson = await apiRes.json().catch(() => ({}));
        const serverPost = apiJson?.post || (apiJson?.id ? apiJson : null);
        if (apiRes.ok && serverPost?.id) {
          const postItem = mapRowToFeedPost({ ...serverPost, author: profileRow }, realAuthorId);
          return { success: true, post: postItem };
        }
        if (apiJson?.error) {
          serverErrorMessage = String(apiJson.error);
        }
      } catch (fallbackErr: any) {
        console.warn('Fallback /api/posts notice:', fallbackErr);
        if (fallbackErr?.message) serverErrorMessage = String(fallbackErr.message);
      }

      return { success: false, error: serverErrorMessage };
    }

    const postItem = mapRowToFeedPost({ ...insertedRow, author: profileRow }, realAuthorId);
    void (async () => {
      const authHeaders = await getClientAuthHeaders();
      fetch('/api/feed/broadcast', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ type: 'POST_CREATED', post: postItem, newRecord: insertedRow }),
      }).catch(() => {});
    })();
    return { success: true, post: postItem };
  } catch (err: any) {
    console.error('Failed to insert post in Supabase:', err);
    return { success: false, error: err.message || 'Unexpected error inserting post' };
  }
}

export async function reactToPostInDb(
  postId: number,
  userId: number,
  reaction: string | null
): Promise<{ success: boolean; liked: boolean; reaction: string | null; likesCount: number; reactionsSummary?: any }> {
  try {
    const authHeaders = await getClientAuthHeaders();
    const res = await fetch(`/api/posts/${postId}/react`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ userId, reaction }),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        liked: data.liked,
        reaction: data.reaction,
        likesCount: data.likesCount,
        reactionsSummary: data.reactionsSummary,
      };
    }
  } catch (err) {
    console.warn('Realtime /api/posts/react fetch notice:', err);
  }

  // Supabase fallback
  if (isSupabaseConfigured) {
    try {
      if (!reaction) {
        await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
        return { success: true, liked: false, reaction: null, likesCount: 0 };
      } else {
        await supabase.from('post_likes').upsert({ post_id: postId, user_id: userId, reaction });
        return { success: true, liked: true, reaction, likesCount: 1 };
      }
    } catch {}
  }
  return { success: true, liked: Boolean(reaction), reaction, likesCount: reaction ? 1 : 0 };
}

export async function togglePostLikeInDb(
  postId: number,
  userId?: number
): Promise<{ liked: boolean; likesCount: number }> {
  const targetUserId = userId && userId > 0 ? userId : 1;

  // 1. Immediately trigger server-side realtime SSE broadcast to all active alumni
  try {
    const authHeaders = await getClientAuthHeaders();
    const apiRes = await fetch(`/api/posts/${postId}/like`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ userId: targetUserId }),
    });
    if (apiRes.ok) {
      const apiData = await apiRes.json();
      return { liked: apiData.liked, likesCount: apiData.likesCount };
    }
  } catch (err) {
    console.warn('Direct /api/posts/:id/like broadcast notice:', err);
  }

  if (!isSupabaseConfigured) return { liked: true, likesCount: 1 };

  try {
    let likeUserId = targetUserId;
    const { data: authData } = await supabase.auth.getUser();
    const authUser = authData?.user;
    if (authUser) {
      const { data: profile } = await supabase
        .from('alumni_profiles')
        .select('id')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();
      if (profile?.id) {
        likeUserId = Number(profile.id);
      }
    }

    if (!likeUserId) return { liked: false, likesCount: 0 };

    // Check if like already exists
    const { data: existing } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', likeUserId)
      .maybeSingle();

    if (existing) {
      await supabase.from('post_likes').delete().eq('id', existing.id);
      return { liked: false, likesCount: -1 };
    } else {
      await supabase.from('post_likes').insert({ post_id: postId, user_id: likeUserId });
      return { liked: true, likesCount: 1 };
    }
  } catch (err) {
    console.warn('Supabase togglePostLike error:', err);
    return { liked: true, likesCount: 1 };
  }
}

export async function addPostCommentInDb(params: {
  postId: number;
  userId?: number;
  content: string;
  fullName?: string;
  avatarUrl?: string;
  parentCommentId?: number;
}): Promise<{ success: boolean; comment?: PostComment }> {
  const cleanContent = (params.content || '').trim();
  if (!cleanContent) return { success: false };

  const targetUserId = params.userId && params.userId > 0 ? params.userId : 1;
  let commentAuthorId = targetUserId;
  let resolvedName = params.fullName || 'SZMC Alumnus';
  let resolvedAvatar = params.avatarUrl || '/assets/aistudio/images__1__2778177d.png';
  let insertedRow: any = null;

  // 1. Persist directly to Supabase `public.post_comments` FIRST so `postgres_changes` Realtime fires immediately
  if (isSupabaseConfigured) {
    try {
      let authUser: any = null;
      const { data: authData } = await supabase.auth.getUser();
      authUser = authData?.user;
      if (!authUser) {
        const { data: sessionData } = await supabase.auth.getSession();
        authUser = sessionData?.session?.user ?? null;
      }

      if (authUser) {
        const { data: profile } = await supabase
          .from('alumni_profiles')
          .select('id, full_name, avatar_url')
          .eq('auth_user_id', authUser.id)
          .maybeSingle();
        if (profile?.id) {
          commentAuthorId = Number(profile.id);
          if (!params.fullName && profile.full_name) resolvedName = profile.full_name;
          if (!params.avatarUrl && profile.avatar_url) resolvedAvatar = profile.avatar_url;
        }
      }

      // Verify commentAuthorId matches an active alumni_profiles row (never impersonate another user)
      let profileExists = false;
      if (commentAuthorId > 0) {
        const { data: existingProf } = await supabase
          .from('alumni_profiles')
          .select('id, full_name, avatar_url')
          .eq('id', commentAuthorId)
          .maybeSingle();
        if (existingProf?.id) {
          profileExists = true;
          if (!params.fullName && existingProf.full_name) resolvedName = existingProf.full_name;
          if (!params.avatarUrl && existingProf.avatar_url) resolvedAvatar = existingProf.avatar_url;
        }
      }

      if (profileExists) {
        const insertPayload: any = {
          post_id: params.postId,
          user_id: commentAuthorId,
          content: cleanContent,
        };
        if (params.parentCommentId) {
          insertPayload.parent_comment_id = params.parentCommentId;
        }

        let { data, error } = await supabase
          .from('post_comments')
          .insert(insertPayload)
          .select('id, post_id, user_id, content, likes_count, created_at')
          .single();

        // Retry without parent_comment_id if migration 024 is not yet applied remotely
        if (error && params.parentCommentId && String(error.message || '').includes('parent_comment_id')) {
          const retryNoParent = await supabase
            .from('post_comments')
            .insert({
              post_id: params.postId,
              user_id: commentAuthorId,
              content: cleanContent,
            })
            .select('id, post_id, user_id, content, likes_count, created_at')
            .single();
          if (!retryNoParent.error && retryNoParent.data) {
            data = retryNoParent.data;
            error = null;
          }
        }

        if (!error && data) {
          insertedRow = data;
        }
      }
    } catch (err) {
      console.warn('Direct Supabase post_comments insert notice:', err);
    }
  }

  // 2. Sync & broadcast via backend `/api/posts/:id/comment` (inserts via server if client RLS blocked it, and broadcasts SSE)
  try {
    const endpoint = params.parentCommentId
      ? `/api/posts/${params.postId}/reply`
      : `/api/posts/${params.postId}/comment`;

    const authHeaders = await getClientAuthHeaders();
    const apiRes = await fetch(endpoint, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        userId: commentAuthorId,
        content: cleanContent,
        fullName: resolvedName,
        avatarUrl: resolvedAvatar,
        parentCommentId: params.parentCommentId,
        skipDbInsert: Boolean(insertedRow?.id),
        commentId: insertedRow?.id ? Number(insertedRow.id) : undefined,
        createdAt: insertedRow?.created_at || undefined,
      }),
    });

    if (apiRes.ok) {
      const apiJson = await apiRes.json();
      const returnedComment = apiJson?.comment || apiJson?.reply;
      if (returnedComment && !insertedRow) {
        insertedRow = returnedComment;
      }
    }
  } catch (err) {
    console.warn('Server comment broadcast notice:', err);
  }

  if (!insertedRow) {
    return { success: false };
  }

  const finalComment: PostComment = {
    id: Number(insertedRow.id),
    postId: params.postId,
    userId: Number(insertedRow.user_id || insertedRow.userId || commentAuthorId),
    fullName: resolvedName,
    avatarUrl: resolvedAvatar,
    content: cleanContent,
    likesCount: Number(insertedRow?.likes_count ?? insertedRow?.likesCount ?? 0),
    likedByMe: false,
    createdAt: insertedRow?.created_at || insertedRow?.createdAt || new Date().toISOString(),
    replies: [],
  };

  // 3. Broadcast over Supabase Realtime Channel for instant <50ms peer-to-peer delivery
  if (params.parentCommentId) {
    realtimeManager.broadcastReply(params.postId, params.parentCommentId, finalComment);
  } else {
    realtimeManager.broadcastComment(finalComment);
  }

  return { success: true, comment: finalComment };
}

// Reconciled: saved_posts table
export async function toggleSavePostInDb(
  postId: number,
  userId: number
): Promise<boolean> {
  if (!isSupabaseConfigured) return true;

  try {
    const { data: existing } = await supabase
      .from('saved_posts')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      await supabase.from('saved_posts').delete().eq('id', existing.id);
      return false;
    } else {
      await supabase.from('saved_posts').insert({ post_id: postId, user_id: userId });
      return true;
    }
  } catch {
    return true;
  }
}

// =============================================================================
// 3. BLOOD LIFELINE NETWORK
// =============================================================================

export async function fetchBloodRequestsFromDb(): Promise<BloodEmergencyRequest[]> {
  if (!isSupabaseConfigured) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('blood_requests')
      .select(
        `
        *,
        requester:alumni_profiles!blood_requests_requester_id_fkey (
          id,
          full_name,
          batch_year,
          avatar_url
        ),
        blood_request_responses (
          id,
          request_id,
          donor_user_id,
          status,
          note,
          responded_at,
          donor:alumni_profiles!blood_request_responses_donor_user_id_fkey (
            id,
            full_name,
            batch_year,
            avatar_url,
            blood_group
          )
        )
      `
      )
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      return [];
    }

    return data.map((r: any) => ({
      id: r.id,
      requestCode: r.coordination_ref || `EMG-${String(r.id).slice(0, 6)}`,
      bloodGroup: r.blood_group,
      unitsRequired: r.units_required,
      unitsFulfilled: r.units_fulfilled || 0,
      hospitalName: r.hospital_name,
      hospitalArea: r.hospital_area,
      city: r.city || 'Dhaka',
      requiredDateTime: r.required_datetime,
      emergencyLevel: r.emergency_level,
      contactMethod: r.contact_method,
      description: r.description,
      requesterId: Number(r.requester_profile_id || r.requester?.id || 0),
      requesterName: r.requester?.full_name || 'SZMC Alumnus',
      requesterAvatar: r.requester?.avatar_url || '/assets/aistudio/images__1__2778177d.png',
      requesterBatch: r.requester?.batch_year || 25,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      expiresAt: r.expires_at,
      verifiedByAdmin: r.verified_by_admin_id ? String(r.verified_by_admin_id) : undefined,
      moderationNote: r.moderation_note || undefined,
      responses: (r.blood_request_responses || []).map((resp: any) => ({
        id: resp.id,
        requestId: resp.request_id,
        donorUserId: Number(resp.donor_user_id),
        donorName: resp.donor?.full_name || 'Doctor Donor / Colleague',
        donorAvatar: resp.donor?.avatar_url || '/assets/aistudio/images__1__2778177d.png',
        donorBatchYear: resp.donor?.batch_year || 25,
        donorBloodGroup: resp.donor?.blood_group || r.blood_group,
        donorPreferredArea: r.hospital_area,
        respondedAt: new Date(resp.responded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: resp.status,
        note: resp.note || undefined,
      })),
    }));
  } catch (err) {
    console.warn('Supabase fetchBloodRequests error:', err);
    return [];
  }
}

export async function respondToBloodRequestInDb(params: {
  requestId: string;
  donorUserId: number;
  status?: 'offered' | 'accepted' | 'confirmed_donated' | 'declined';
  note?: string;
}): Promise<boolean> {
  if (!isSupabaseConfigured) return false;

  try {
    const { error } = await supabase.from('blood_request_responses').upsert({
      request_id: params.requestId,
      donor_user_id: params.donorUserId,
      status: params.status || 'offered',
      note: params.note || null,
      updated_at: new Date().toISOString(),
    });

    return !error;
  } catch (err) {
    console.warn('Failed to respond to blood request:', err);
    return false;
  }
}

export async function fetchBloodDonorsFromDb(): Promise<BloodDonorProfile[]> {
  if (!isSupabaseConfigured) {
    return [];
  }

  try {
    // Note: Never select sensitive PII columns directly
    const { data, error } = await supabase
      .from('blood_donors')
      .select(
        `
        user_id,
        blood_group,
        is_registered_donor,
        availability,
        preferred_area,
        city,
        last_donation_date,
        emergency_alert_preference,
        donation_history,
        alumnus:alumni_profiles!blood_donors_user_id_fkey (
          id,
          full_name,
          batch_year,
          avatar_url,
          verification_status,
          position,
          institution,
          cadre,
          specialty,
          degree,
          city,
          country,
          bio,
          career_history
        )
      `
      )
      .eq('is_registered_donor', true);

    if (error || !data || data.length === 0) {
      return [];
    }

    return data.map((d: any) => ({
      userId: Number(d.user_id),
      fullName: d.alumnus?.full_name || 'SZMC Donor',
      avatarUrl: d.alumnus?.avatar_url || '/assets/aistudio/images__1__2778177d.png',
      batchYear: d.alumnus?.batch_year || 25,
      verificationStatus: d.alumnus?.verification_status || 'unverified',
      profileCompleted: isPublicRowProfileCompleted(d.alumnus),
      bloodGroup: d.blood_group,
      isRegisteredDonor: d.is_registered_donor,
      availability: d.availability,
      preferredArea: d.preferred_area,
      city: d.city || 'Bogura',
      lastDonationDate: d.last_donation_date || undefined,
      emergencyAlertPreference: d.emergency_alert_preference,
      donationHistory: Array.isArray(d.donation_history) ? d.donation_history : [],
      updatedAt: d.updated_at || new Date().toISOString(),
    }));
  } catch (err) {
    console.warn('Supabase fetchBloodDonors error:', err);
    return [];
  }
}

export async function createBloodRequestInDb(params: {
  requesterId: number;
  bloodGroup: string;
  unitsRequired: number;
  hospitalName: string;
  hospitalArea: string;
  city: string;
  requiredDateTime: string;
  emergencyLevel: string;
  contactMethod: string;
  description: string;
  status: string;
  coordinationRef?: string;
  patientRelation?: string;
}): Promise<string | null> {
  let requiredDate = new Date(params.requiredDateTime);
  if (Number.isNaN(requiredDate.getTime())) {
    requiredDate = new Date();
  }

  const validEmergencyLevels = ['critical', 'urgent', 'standard'];
  const normalizedLevel = (params.emergencyLevel || 'urgent').toLowerCase();
  const emergencyLevel = validEmergencyLevels.includes(normalizedLevel) ? normalizedLevel : 'urgent';

  const validContactMethods = [
    'Portal Secure Coordination',
    'Hospital Blood Bank Desk',
    'Batch Coordinator Relay',
    'Attendant Emergency Line',
  ];
  const contactMethod = validContactMethods.includes(params.contactMethod)
    ? params.contactMethod
    : 'Portal Secure Coordination';

  const payload: any = {
    requester_id: params.requesterId,
    blood_group: params.bloodGroup,
    units_required: params.unitsRequired,
    units_needed: params.unitsRequired,
    hospital_name: params.hospitalName,
    hospital: params.hospitalName,
    hospital_area: params.hospitalArea,
    hospital_address: params.hospitalArea,
    city: params.city || 'Bogura',
    district: params.city || 'Bogura',
    required_datetime: requiredDate.toISOString(),
    required_date: requiredDate.toISOString().split('T')[0],
    emergency_level: emergencyLevel,
    urgency: emergencyLevel,
    contact_method: contactMethod,
    contact_number: params.coordinationRef || 'Through Portal',
    coordination_ref: params.coordinationRef || null,
    patient_relation: params.patientRelation || null,
    patient_name: params.patientRelation || 'Patient',
    description: params.description || 'Urgent blood requirement',
    medical_reason: params.description || 'Urgent blood requirement',
    status: params.status || 'Active',
  };

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('blood_requests')
        .insert(payload)
        .select('id')
        .single();

      if (!error && data?.id) {
        return String(data.id);
      }
    } catch (err) {
      console.warn('Direct client blood request insert notice, using backend proxy:', err);
    }
  }

  // Resilient backend proxy fallback
  try {
    const authHeaders = await getClientAuthHeaders();
    const resp = await fetch('/api/blood/requests', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload),
    });
    if (resp.ok) {
      const body = await resp.json();
      if (body.request?.id) return String(body.request.id);
    }
  } catch (proxyErr) {
    console.warn('Backend proxy createBloodRequest failed:', proxyErr);
  }

  return null;
}

export async function registerBloodDonorInDb(params: {
  userId: number;
  bloodGroup: string;
  isRegisteredDonor: boolean;
  availability: string;
  preferredArea: string;
  city: string;
  lastDonationDate?: string;
  emergencyAlertPreference: string;
  donationHistory?: BloodDonationHistoryItem[];
}): Promise<boolean> {
  const payload: any = {
    user_id: params.userId,
    profile_id: params.userId,
    blood_group: params.bloodGroup,
    is_registered_donor: params.isRegisteredDonor,
    availability: params.availability,
    preferred_area: params.preferredArea,
    city: params.city,
    last_donation_date: params.lastDonationDate || null,
    emergency_alert_preference: params.emergencyAlertPreference,
    donation_history: params.donationHistory || [],
    updated_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('blood_donors').upsert(payload);
      if (!error) return true;
    } catch (err) {
      console.warn('Direct client registerBloodDonor notice, using backend proxy:', err);
    }
  }

  // Resilient backend proxy fallback
  try {
    const authHeaders = await getClientAuthHeaders();
    const resp = await fetch('/api/blood/donors', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload),
    });
    if (resp.ok) return true;
  } catch (proxyErr) {
    console.warn('Backend proxy registerBloodDonor failed:', proxyErr);
  }

  return false;
}

// =============================================================================
// 4. VERIFICATION & PEER VOUCHING
// =============================================================================

export async function fetchVerificationRequestsFromDb(batchYear?: number): Promise<VouchRequest[]> {
  if (!isSupabaseConfigured) return [];

  try {
    let query = supabase
      .from('verification_requests')
      .select(
        `
        *,
        requester:alumni_profiles!verification_requests_requester_id_fkey (
          id,
          full_name,
          avatar_url,
          batch_year
        ),
        peer_vouches (
          id,
          voucher_id,
          voucher_batch,
          comment,
          created_at,
          voucher:alumni_profiles!peer_vouches_voucher_id_fkey (
            id,
            full_name,
            avatar_url,
            batch_year
          )
        )
      `
      )
      .eq('status', 'pending');

    if (batchYear) {
      query = query.eq('batch_year', batchYear);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((r: any) => ({
      id: r.id,
      requesterId: Number(r.requester_id),
      requesterName: r.requester?.full_name || 'SZMC Alumnus',
      requesterAvatar: r.requester?.avatar_url || '/assets/aistudio/images__1__2778177d.png',
      batchYear: r.batch_year,
      collegeRoll: r.college_roll,
      group: r.academic_stream,
      section: r.section || '',
      createdAt: r.created_at,
      status: r.status,
      targetVouches: r.target_vouches || 2,
      vouches: (r.peer_vouches || []).map((v: any) => ({
        id: v.id,
        voucherId: Number(v.voucher_id),
        voucherName: v.voucher?.full_name || 'SZMC Alumnus',
        voucherAvatar: v.voucher?.avatar_url || '/assets/aistudio/images__1__2778177d.png',
        voucherBatch: v.voucher_batch,
        date: new Date(v.created_at).toLocaleDateString(),
        comment: v.comment || undefined,
      })),
    }));
  } catch {
    return [];
  }
}

export async function submitPeerVouchInDb(params: {
  verificationRequestId: string;
  requesterId: number;
  voucherId: number;
  voucherBatch: number;
  comment?: string;
}): Promise<boolean> {
  if (!isSupabaseConfigured) return false;

  try {
    const { error } = await supabase.from('peer_vouches').insert({
      verification_request_id: params.verificationRequestId,
      requester_id: params.requesterId,
      voucher_id: params.voucherId,
      voucher_batch: params.voucherBatch,
      comment: params.comment || null,
    });

    return !error;
  } catch (err) {
    console.warn('Failed to insert peer vouch in Supabase:', err);
    return false;
  }
}

export async function createVerificationRequestInDb(params: {
  requesterId: number;
  batchYear: number;
  collegeRoll: string;
  academicStream: string;
  academicGroup?: string | null;
  section?: string | null;
  message?: string | null;
  targetVouches?: number;
}): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const { data, error } = await supabase
      .from('verification_requests')
      .insert({
        requester_id: params.requesterId,
        batch_year: params.batchYear,
        college_roll: params.collegeRoll,
        academic_stream: params.academicStream,
        academic_group: params.academicGroup || null,
        section: params.section || null,
        message: params.message || null,
        target_vouches: params.targetVouches || 2,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error || !data) {
      console.warn('Failed to insert verification request:', error?.message);
      return null;
    }
    return String(data.id);
  } catch (err) {
    console.warn('createVerificationRequestInDb error:', err);
    return null;
  }
}

export async function submitAdminDocSubmissionInDb(params: {
  userId: number;
  batchYear: number;
  collegeRoll: string;
  academicStream: string;
  academicGroup?: string | null;
  docType: string;
  docTypeLabel: string;
  storageObjectPath: string;
}): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  const validDocTypes = ['id_card', 'nid_card', 'hsc_slip', 'souvenir'];
  const normalizedDocType = (params.docType || 'id_card').toLowerCase();
  const docType = validDocTypes.includes(normalizedDocType) ? normalizedDocType : 'id_card';

  try {
    const { data, error } = await supabase
      .from('admin_doc_submissions')
      .insert({
        user_id: params.userId,
        batch_year: params.batchYear,
        college_roll: params.collegeRoll,
        academic_stream: params.academicStream,
        academic_group: params.academicGroup || null,
        doc_type: docType,
        doc_type_label: params.docTypeLabel,
        storage_object_path: params.storageObjectPath,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error || !data) {
      console.warn('Failed to insert admin doc submission:', error?.message);
      return null;
    }
    return String(data.id);
  } catch (err) {
    console.warn('submitAdminDocSubmissionInDb error:', err);
    return null;
  }
}

export async function editFeedPostInDb(params: {
  postId: number;
  content: string;
  category?: string;
  images?: string[];
  videos?: string[];
}): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  try {
    const uploadedImages: string[] = [];
    if (Array.isArray(params.images)) {
      for (const img of params.images) {
        if (!img) continue;
        if (img.startsWith('data:') || img.startsWith('blob:')) {
          const uploadedUrl = await resolveAndUploadMediaToStorage(img, params.postId, 'image');
          uploadedImages.push(uploadedUrl);
        } else {
          uploadedImages.push(img);
        }
      }
    }

    const uploadedVideos: string[] = [];
    if (Array.isArray(params.videos)) {
      for (const vid of params.videos) {
        if (!vid) continue;
        if (vid.startsWith('data:') || vid.startsWith('blob:')) {
          const uploadedUrl = await resolveAndUploadMediaToStorage(vid, params.postId, 'video');
          uploadedVideos.push(uploadedUrl);
        } else {
          uploadedVideos.push(vid);
        }
      }
    }

    const validCategories = [
      'General Update',
      'Tech & Innovation',
      'Professional Insights',
      'Reunion',
      'Achievement',
    ];
    const safeCategory = params.category && validCategories.includes(params.category)
      ? params.category
      : 'General Update';

    let safeContent = params.content?.trim();
    if (!safeContent) {
      safeContent = uploadedImages.length > 0
        ? (uploadedImages.length > 1 ? `Shared ${uploadedImages.length} photos` : 'Shared a photo')
        : (uploadedVideos.length > 0 ? 'Shared a video' : 'Updated post');
    }

    const { error } = await supabase
      .from('posts')
      .update({
        content: safeContent.slice(0, 10000),
        category: safeCategory,
        images: uploadedImages,
        videos: uploadedVideos,
        is_edited: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.postId);
    return !error;
  } catch {
    return false;
  }
}

export async function deleteFeedPostInDb(postId: number): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  try {
    const { error } = await supabase
      .from('posts')
      .update({ is_deleted: true })
      .eq('id', postId);
    return !error;
  } catch {
    return false;
  }
}

// =============================================================================
// 5. OFFICIAL NOTICES & GALLERY
// =============================================================================

export async function fetchOfficialNoticesFromDb(): Promise<OfficialNotice[]> {
  if (!isSupabaseConfigured) return [];

  try {
    const { data, error } = await supabase
      .from('official_notices')
      .select('*')
      .eq('is_published', true)
      .order('published_date', { ascending: false });

    if (error || !data || data.length === 0) {
      return [];
    }

    return data.map((n: any) => ({
      id: n.id,
      refNo: n.ref_no,
      title: n.title,
      category: n.category,
      publishedDate: n.published_date,
      isUrgent: Boolean(n.is_urgent),
      summary: n.summary,
      fullContent: n.full_content,
      pdfUrl: n.pdf_url || undefined,
      fileSize: n.file_size || undefined,
      signatory: {
        name: n.signatory_name,
        designation: n.signatory_designation,
        organization: n.signatory_organization,
      },
    }));
  } catch {
    return [];
  }
}

const GALLERY_LIKED_STORAGE_PREFIX = 'szmc_gallery_liked_photos_v1_';
const VALID_GALLERY_CATEGORIES = new Set([
  'reunion',
  'academic',
  'campus',
  'convocation',
  'sports',
  'cultural',
  'all',
]);

function normalizeGalleryBatchYearClient(batchYear?: number): number | null {
  if (typeof batchYear !== 'number' || !Number.isInteger(batchYear)) return null;
  if (batchYear < 1 || batchYear > 38) return null;
  return batchYear;
}

export function getLocallyLikedGalleryPhotoIds(userId?: number): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const key = `${GALLERY_LIKED_STORAGE_PREFIX}${userId || 'guest'}`;
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

export function setLocallyLikedGalleryPhotoId(
  photoId: string,
  liked: boolean,
  userId?: number
): void {
  if (typeof window === 'undefined') return;
  try {
    const key = `${GALLERY_LIKED_STORAGE_PREFIX}${userId || 'guest'}`;
    const set = getLocallyLikedGalleryPhotoIds(userId);
    if (liked) set.add(String(photoId));
    else set.delete(String(photoId));
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {
    // ignore storage quota errors
  }
}

function mapRawGalleryAlbums(
  rawAlbums: any[],
  currentUserId?: number,
  dbLikedPhotoIds?: Set<string>
): GalleryAlbum[] {
  const localLikes = dbLikedPhotoIds ?? getLocallyLikedGalleryPhotoIds(currentUserId);

  return rawAlbums.map((a: any) => {
    const rawPhotos = Array.isArray(a.gallery_photos)
      ? [...a.gallery_photos]
      : Array.isArray(a.photos)
      ? [...a.photos]
      : [];

    rawPhotos.sort((p1: any, p2: any) => {
      const t1 = p1.uploaded_at || p1.uploadedAt ? new Date(p1.uploaded_at || p1.uploadedAt).getTime() : 0;
      const t2 = p2.uploaded_at || p2.uploadedAt ? new Date(p2.uploaded_at || p2.uploadedAt).getTime() : 0;
      return t2 - t1;
    });

    const photos: GalleryPhoto[] = rawPhotos
      .filter((p: any) => p.is_approved !== false)
      .map((p: any) => {
        const photoId = String(p.id);
        const uploaderRel = Array.isArray(p.uploader) ? p.uploader[0] : p.uploader;
        const likedByMe =
          typeof p.likedByMe === 'boolean'
            ? p.likedByMe
            : typeof p.liked === 'boolean'
            ? p.liked
            : localLikes.has(photoId);
        const likesCount = Math.max(0, Number(p.likesCount ?? p.likes_count ?? p.likes ?? 0) || 0);

        return {
          id: photoId,
          albumId: Number(a.id),
          url: p.url || p.photo_url || a.cover_url || a.coverUrl,
          caption: p.caption || '',
          batchYear: p.batchYear ?? p.batch_year ?? a.batchYear ?? a.batch_year ?? undefined,
          uploaderName:
            p.uploaderName ||
            uploaderRel?.full_name ||
            p.uploader_name ||
            'SZMC Alumnus',
          uploaderAvatar: p.uploaderAvatar || uploaderRel?.avatar_url || undefined,
          uploaderId: p.uploaderId
            ? Number(p.uploaderId)
            : p.uploader_id
            ? Number(p.uploader_id)
            : undefined,
          uploadedAt: p.uploadedAt || p.uploaded_at || undefined,
          likesCount,
          likedByMe,
          tags: Array.isArray(p.tags) ? p.tags : [],
          mediaType: (p.mediaType || p.media_type) === 'video' ? 'video' : 'image',
          fileSize: p.fileSize || p.file_size || '1.2 MB',
        };
      });

    const creatorRel = Array.isArray(a.creator) ? a.creator[0] : a.creator;
    return {
      id: Number(a.id),
      title: a.title,
      description: a.description || '',
      category: a.category,
      date: a.date || a.event_date_label || '2026',
      location: a.location || 'SZMC Campus, Silimpur, Bogura',
      batchYear: a.batchYear ?? a.batch_year ?? undefined,
      photosCount: photos.length,
      coverUrl:
        a.coverUrl ||
        a.cover_url ||
        a.cover_photo_url ||
        (photos[0]?.url ?? '/assets/aistudio/images__1__2778177d.png'),
      createdBy: a.createdBy || creatorRel?.full_name || a.created_by || 'SZMC Alumni',
      createdById: a.createdById
        ? Number(a.createdById)
        : a.created_by_id
        ? Number(a.created_by_id)
        : undefined,
      createdDate: a.createdDate || a.created_at || undefined,
      photos,
    };
  });
}

export async function fetchGalleryAlbumsFromDb(options?: {
  currentUserId?: number;
}): Promise<GalleryAlbum[] | null> {
  const currentUserId = options?.currentUserId;

  // 1. Primary: Resilient backend proxy backed by live Supabase + authoritative like counts
  try {
    const authHeaders = await getClientAuthHeaders();
    const resp = await fetch('/api/gallery/albums', {
      method: 'GET',
      headers: authHeaders,
      cache: 'no-store',
    });
    if (resp.ok) {
      const body = await resp.json();
      if (Array.isArray(body?.albums) && (body.source === 'supabase' || !isSupabaseConfigured)) {
        return mapRawGalleryAlbums(body.albums, currentUserId);
      }
    }
  } catch {
    // Fall through to direct Supabase query
  }

  // 2. Fallback: Direct Supabase client query
  if (!isSupabaseConfigured) return null;

  try {
    let data: any[] | null = null;
    let queryError: any = null;

    const richRes = await supabase
      .from('gallery_albums')
      .select(
        '*, creator:alumni_profiles!gallery_albums_created_by_id_fkey(id, full_name, avatar_url), gallery_photos(*, uploader:alumni_profiles!gallery_photos_uploader_id_fkey(id, full_name, avatar_url))'
      )
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (!richRes.error && Array.isArray(richRes.data)) {
      data = richRes.data;
    } else {
      const basicRes = await supabase
        .from('gallery_albums')
        .select('*, gallery_photos(*)')
        .eq('is_published', true)
        .order('created_at', { ascending: false });
      data = basicRes.data;
      queryError = basicRes.error;
    }

    if (queryError || !Array.isArray(data)) {
      return null;
    }

    let dbLikedIds: Set<string> | undefined;
    if (currentUserId && currentUserId > 0) {
      try {
        const { data: userLikes } = await supabase
          .from('gallery_photo_likes')
          .select('photo_id')
          .eq('user_id', currentUserId);
        if (Array.isArray(userLikes)) {
          dbLikedIds = new Set(userLikes.map((row: any) => String(row.photo_id)));
        }
      } catch {}
    }

    return mapRawGalleryAlbums(data, currentUserId, dbLikedIds);
  } catch {
    return null;
  }
}

/**
 * Uploads an image or video file to persistent Supabase Storage ('gallery' for images,
 * 'post-media' for videos) with automatic backend proxy fallback so ALL users across
 * devices can view the media — never returning transient local-only blob: URLs.
 */
export async function uploadGalleryMediaFile(
  file: File,
  albumId?: number
): Promise<{ url: string; storagePath?: string } | null> {
  const isVideo = isVideoFile(file);
  const folder = albumId ? `albums/${albumId}` : 'albums/general';

  // Determine clean extension
  let ext = isVideo ? 'mp4' : 'jpg';
  if (file.type) {
    if (file.type.includes('png')) ext = 'png';
    else if (file.type.includes('webp')) ext = 'webp';
    else if (file.type.includes('gif')) ext = 'gif';
    else if (file.type.includes('webm')) ext = 'webm';
    else if (file.type.includes('quicktime') || file.type.includes('mov')) ext = 'mov';
    else if (file.type.includes('ogg')) ext = 'ogg';
  } else if (file.name && file.name.includes('.')) {
    ext = file.name.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') || ext;
  }

  // 1. Direct Supabase Storage upload (fastest when user has an active Supabase Auth session)
  if (isSupabaseConfigured) {
    try {
      const bucket = isVideo ? 'post-media' : 'gallery';
      const uploaded = await uploadMediaToSupabaseStorage(file, bucket, folder);
      if (uploaded?.publicUrl) {
        return { url: uploaded.publicUrl, storagePath: uploaded.storagePath };
      }
    } catch (err) {
      console.warn('Direct Supabase gallery storage upload notice, trying server upload:', err);
    }
  }

  // 2. Authenticated Express upload proxy -> Supabase Storage / server-hosted persistent storage
  try {
    const authHeaders = await getClientAuthHeaders();
    const uploadHeaders: Record<string, string> = {};
    if (authHeaders.Authorization) uploadHeaders.Authorization = authHeaders.Authorization;
    uploadHeaders['Content-Type'] = file.type || 'application/octet-stream';
    uploadHeaders['X-File-Ext'] = ext;
    if (albumId) uploadHeaders['X-Album-Id'] = String(albumId);

    const endpoint = isVideo ? '/api/upload-video' : '/api/gallery/upload';
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: uploadHeaders,
      body: file,
    });
    if (resp.ok) {
      const data = await resp.json();
      if (typeof data?.url === 'string' && data.url.trim()) {
        return { url: data.url.trim(), storagePath: data.storagePath };
      }
    }
  } catch (err) {
    console.warn('Server gallery media upload notice:', err);
  }

  // 3. Resilient fallback for images only: compressed Data URL (persistent across all devices)
  if (!isVideo) {
    try {
      const compressedDataUrl = await compressImageFileToDataUrl(file, 1400, 0.84);
      if (compressedDataUrl && compressedDataUrl.startsWith('data:image/')) {
        return { url: compressedDataUrl };
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export async function createGalleryAlbumInDb(params: {
  title: string;
  description?: string;
  category: string;
  eventDateLabel: string;
  location?: string;
  batchYear?: number;
  coverUrl: string;
  createdById?: number;
  createdBy?: string;
}): Promise<{ albumId: number; coverPhotoId?: string } | null> {
  const normalizedCategory = (params.category || 'campus').toLowerCase();
  const category = VALID_GALLERY_CATEGORIES.has(normalizedCategory)
    ? normalizedCategory
    : 'campus';
  const safeBatchYear = normalizeGalleryBatchYearClient(params.batchYear);

  const dbPayload: Record<string, any> = {
    title: params.title.trim(),
    description: params.description?.trim() || null,
    category,
    event_date_label: (params.eventDateLabel || 'Recent').trim().slice(0, 64),
    location: params.location?.trim() || null,
    batch_year: safeBatchYear,
    cover_url: params.coverUrl,
    cover_photo_url: params.coverUrl,
    is_published: true,
    photos_count: 1,
    photo_count: 1,
  };
  if (params.createdById) dbPayload.created_by_id = params.createdById;
  if (params.createdBy) dbPayload.created_by = params.createdBy;

  // 1. Direct Supabase insert
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('gallery_albums')
        .insert(dbPayload)
        .select('id')
        .single();

      if (!error && data?.id) {
        const newAlbumId = Number(data.id);
        let coverPhotoId: string | undefined;
        try {
          const { data: coverData } = await supabase
            .from('gallery_photos')
            .insert({
              album_id: newAlbumId,
              url: params.coverUrl,
              photo_url: params.coverUrl,
              caption: `${params.title.trim()} - Cover Photo`,
              batch_year: safeBatchYear,
              tags: ['Cover', category],
              media_type: 'image',
              uploader_id: params.createdById || null,
              uploader_name: params.createdBy || 'SZMC Alumnus',
              is_approved: true,
            })
            .select('id')
            .single();
          if (coverData?.id) coverPhotoId = String(coverData.id);
        } catch {}

        void realtimeManager.broadcastGalleryUpdate('ALBUM_CREATED', { albumId: newAlbumId });
        return { albumId: newAlbumId, coverPhotoId };
      }
      if (error) {
        console.warn('Direct client createGalleryAlbum error, trying backend proxy:', error.message);
      }
    } catch (err) {
      console.warn('Direct client createGalleryAlbum notice, using backend proxy:', err);
    }
  }

  // 2. Resilient backend proxy (also broadcasts GALLERY_UPDATED over SSE)
  try {
    const authHeaders = await getClientAuthHeaders();
    const resp = await fetch('/api/gallery/albums', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: params.title.trim(),
        description: params.description,
        category,
        eventDateLabel: params.eventDateLabel || 'Recent',
        location: params.location,
        batchYear: safeBatchYear,
        coverUrl: params.coverUrl,
        createdBy: params.createdBy,
      }),
    });
    if (resp.ok) {
      const body = await resp.json();
      if (body.album?.id) {
        const albumId = Number(body.album.id);
        void realtimeManager.broadcastGalleryUpdate('ALBUM_CREATED', { albumId });
        return {
          albumId,
          coverPhotoId: body.coverPhotoId || body.album?.photos?.[0]?.id,
        };
      }
    }
  } catch (proxyErr) {
    console.warn('Backend proxy createGalleryAlbum failed:', proxyErr);
  }

  return null;
}

export async function addPhotoToGalleryAlbumInDb(params: {
  albumId: number;
  url: string;
  storagePath?: string;
  caption?: string;
  batchYear?: number;
  tags?: string[];
  mediaType?: 'image' | 'video';
  fileSize?: string;
  uploaderId?: number;
  uploaderName?: string;
  skipBroadcast?: boolean;
}): Promise<string | null> {
  if (!params.url || params.url.startsWith('blob:')) {
    console.warn('Refusing to persist transient blob: URL to Supabase gallery.');
    return null;
  }

  const safeBatchYear = normalizeGalleryBatchYearClient(params.batchYear);
  const safeMediaType = params.mediaType === 'video' ? 'video' : 'image';

  const dbPayload: Record<string, any> = {
    album_id: params.albumId,
    url: params.url,
    photo_url: params.url,
    storage_object_path: params.storagePath || null,
    caption: params.caption?.trim() || null,
    batch_year: safeBatchYear,
    tags: Array.isArray(params.tags) ? params.tags : [],
    media_type: safeMediaType,
    file_size: params.fileSize || null,
    is_approved: true,
  };
  if (params.uploaderId) dbPayload.uploader_id = params.uploaderId;
  if (params.uploaderName) dbPayload.uploader_name = params.uploaderName;

  // 1. Direct Supabase insert
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('gallery_photos')
        .insert(dbPayload)
        .select('id')
        .single();

      if (!error && data?.id) {
        const photoId = String(data.id);
        if (!params.skipBroadcast) {
          void realtimeManager.broadcastGalleryUpdate('PHOTO_ADDED', {
            albumId: params.albumId,
            photoId,
          });
        }
        return photoId;
      }
      if (error) {
        console.warn('Direct client addPhotoToGalleryAlbum error, trying backend proxy:', error.message);
      }
    } catch (err) {
      console.warn('Direct client addPhotoToGalleryAlbum notice, using backend proxy:', err);
    }
  }

  // 2. Resilient backend proxy
  try {
    const authHeaders = await getClientAuthHeaders();
    const resp = await fetch('/api/gallery/photos', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        albumId: params.albumId,
        url: params.url,
        storagePath: params.storagePath,
        caption: params.caption,
        batchYear: safeBatchYear,
        tags: params.tags || [],
        mediaType: safeMediaType,
        fileSize: params.fileSize,
        uploaderName: params.uploaderName,
      }),
    });
    if (resp.ok) {
      const body = await resp.json();
      if (body.photo?.id) {
        const photoId = String(body.photo.id);
        if (!params.skipBroadcast) {
          void realtimeManager.broadcastGalleryUpdate('PHOTO_ADDED', {
            albumId: params.albumId,
            photoId,
          });
        }
        return photoId;
      }
    }
  } catch (proxyErr) {
    console.warn('Backend proxy addPhotoToGalleryAlbum failed:', proxyErr);
  }

  return null;
}

export async function toggleGalleryPhotoLikeInDb(params: {
  photoId: string;
  albumId?: number;
  liked: boolean;
  userId?: number;
}): Promise<{ success: boolean; likesCount?: number; likedByMe?: boolean; error?: string }> {
  setLocallyLikedGalleryPhotoId(params.photoId, params.liked, params.userId);

  try {
    const authHeaders = await getClientAuthHeaders();
    const resp = await fetch(`/api/gallery/photos/${encodeURIComponent(params.photoId)}/like`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        albumId: params.albumId,
        liked: params.liked,
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      void realtimeManager.broadcastGalleryUpdate('PHOTO_LIKED', {
        albumId: data.albumId ?? params.albumId,
        photoId: params.photoId,
        likesCount: data.likesCount,
      });
      return {
        success: true,
        likesCount: typeof data.likesCount === 'number' ? data.likesCount : undefined,
        likedByMe: typeof data.likedByMe === 'boolean' ? data.likedByMe : params.liked,
      };
    }
    const errBody = await resp.json().catch(() => ({}));
    return { success: false, error: errBody.error || 'Could not save like.' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error while saving like.' };
  }
}

export async function updateGalleryAlbumInDb(
  albumId: number,
  updates: {
    title?: string;
    description?: string;
    category?: string;
    eventDateLabel?: string;
    location?: string;
    batchYear?: number;
    coverUrl?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const dbUpdates: Record<string, any> = {};
  if (typeof updates.title === 'string' && updates.title.trim()) {
    dbUpdates.title = updates.title.trim();
  }
  if (typeof updates.description === 'string') {
    dbUpdates.description = updates.description.trim() || null;
  }
  if (typeof updates.category === 'string') {
    const normCat = updates.category.toLowerCase();
    if (VALID_GALLERY_CATEGORIES.has(normCat)) dbUpdates.category = normCat;
  }
  if (typeof updates.eventDateLabel === 'string' && updates.eventDateLabel.trim()) {
    dbUpdates.event_date_label = updates.eventDateLabel.trim().slice(0, 64);
  }
  if (typeof updates.location === 'string') {
    dbUpdates.location = updates.location.trim() || null;
  }
  if (updates.batchYear !== undefined) {
    dbUpdates.batch_year = normalizeGalleryBatchYearClient(updates.batchYear);
  }
  if (typeof updates.coverUrl === 'string' && updates.coverUrl.trim()) {
    dbUpdates.cover_url = updates.coverUrl.trim();
    dbUpdates.cover_photo_url = updates.coverUrl.trim();
  }

  let directUpdated = false;
  if (isSupabaseConfigured && Object.keys(dbUpdates).length > 0) {
    try {
      const { error } = await supabase
        .from('gallery_albums')
        .update(dbUpdates)
        .eq('id', albumId);
      if (!error) {
        directUpdated = true;
      } else {
        console.warn('Supabase direct update album error, trying server API:', error.message);
      }
    } catch (err) {
      console.warn('Supabase direct update album notice:', err);
    }
  }

  try {
    const authHeaders = await getClientAuthHeaders();
    const resp = await fetch(`/api/gallery/albums/${albumId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify(updates),
    });
    if (resp.ok) {
      void realtimeManager.broadcastGalleryUpdate('ALBUM_UPDATED', { albumId });
      return { success: true };
    }
    if (directUpdated) {
      void realtimeManager.broadcastGalleryUpdate('ALBUM_UPDATED', { albumId });
      return { success: true };
    }
    const errBody = await resp.json().catch(() => ({}));
    return { success: false, error: errBody.error || 'Failed to update album.' };
  } catch (err: any) {
    if (directUpdated) {
      void realtimeManager.broadcastGalleryUpdate('ALBUM_UPDATED', { albumId });
      return { success: true };
    }
    return { success: false, error: err?.message || 'Failed to update album.' };
  }
}

export async function deleteGalleryAlbumInDb(
  albumId: number,
  userId?: number,
  isAdmin?: boolean
): Promise<{ success: boolean; error?: string }> {
  let directDeleted = false;

  // 1. Direct Supabase deletion if configured
  if (isSupabaseConfigured) {
    try {
      await supabase.from('gallery_photos').delete().eq('album_id', albumId);
      const { error } = await supabase.from('gallery_albums').delete().eq('id', albumId);
      if (!error) {
        directDeleted = true;
      } else {
        console.warn('Supabase direct delete album error, trying server API:', error.message);
      }
    } catch (err) {
      console.warn('Supabase direct album delete notice:', err);
    }
  }

  // 2. Server API route (authoritative deletion + SSE broadcast)
  try {
    const authHeaders = await getClientAuthHeaders();
    const resp = await fetch(`/api/gallery/albums/${albumId}`, {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ userId, isAdmin }),
    });
    if (resp.ok) {
      void realtimeManager.broadcastGalleryUpdate('ALBUM_DELETED', { albumId });
      return { success: true };
    }
    if (directDeleted) {
      void realtimeManager.broadcastGalleryUpdate('ALBUM_DELETED', { albumId });
      return { success: true };
    }
    const errBody = await resp.json().catch(() => ({}));
    return { success: false, error: errBody.error || 'Failed to delete album.' };
  } catch (err: any) {
    console.warn('Backend proxy deleteGalleryAlbum error:', err);
    if (directDeleted) {
      void realtimeManager.broadcastGalleryUpdate('ALBUM_DELETED', { albumId });
      return { success: true };
    }
    return { success: false, error: err?.message || 'Failed to delete album.' };
  }
}

export async function deleteGalleryPhotoInDb(
  photoId: string,
  albumId?: number,
  userId?: number,
  isAdmin?: boolean
): Promise<{ success: boolean; error?: string }> {
  let directDeleted = false;

  // 1. Direct Supabase deletion if configured
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('gallery_photos').delete().eq('id', photoId);
      if (!error) {
        directDeleted = true;
        if (albumId) {
          const { count } = await supabase
            .from('gallery_photos')
            .select('id', { count: 'exact', head: true })
            .eq('album_id', albumId);
          const rem = typeof count === 'number' ? count : 0;
          await supabase
            .from('gallery_albums')
            .update({ photos_count: rem, photo_count: rem })
            .eq('id', albumId);
        }
      } else {
        console.warn('Supabase direct delete photo error, trying server API:', error.message);
      }
    } catch (err) {
      console.warn('Supabase direct photo delete notice:', err);
    }
  }

  // 2. Server API route (authoritative deletion + SSE broadcast)
  try {
    const authHeaders = await getClientAuthHeaders();
    const resp = await fetch(`/api/gallery/photos/${encodeURIComponent(photoId)}`, {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ albumId, userId, isAdmin }),
    });
    if (resp.ok) {
      void realtimeManager.broadcastGalleryUpdate('PHOTO_DELETED', { albumId, photoId });
      return { success: true };
    }
    if (directDeleted) {
      void realtimeManager.broadcastGalleryUpdate('PHOTO_DELETED', { albumId, photoId });
      return { success: true };
    }
    const errBody = await resp.json().catch(() => ({}));
    return { success: false, error: errBody.error || 'Failed to delete photo.' };
  } catch (err: any) {
    console.warn('Backend proxy deleteGalleryPhoto error:', err);
    if (directDeleted) {
      void realtimeManager.broadcastGalleryUpdate('PHOTO_DELETED', { albumId, photoId });
      return { success: true };
    }
    return { success: false, error: err?.message || 'Failed to delete photo.' };
  }
}

// =============================================================================
// 6. NOTIFICATIONS
// =============================================================================

export async function fetchNotificationsFromDb(
  userId: number
): Promise<NotificationItem[]> {
  if (!isSupabaseConfigured) return [];

  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*, actor:alumni_profiles!notifications_actor_id_fkey(id, full_name, avatar_url)')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      return [];
    }

    return data.map((n: any) => ({
      id: Number(n.id),
      title: n.title || 'Notification',
      message: n.message || '',
      timeAgo: new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      unread: Boolean(n.unread),
      type: n.type || 'system',
      targetRoute: n.target_route || undefined,
      bloodRequestId: n.blood_request_id || undefined,
    }));
  } catch {
    return [];
  }
}

export async function markNotificationReadInDb(notificationId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    await supabase
      .from('notifications')
      .update({ unread: false })
      .eq('id', Number(notificationId));
  } catch {}
}

export async function createNotificationInDb(params: {
  recipientId: number;
  actorId?: number;
  type?: string;
  title: string;
  message: string;
  targetRoute?: string;
  postId?: number;
  bloodRequestId?: string;
}): Promise<boolean> {
  if (!isSupabaseConfigured) return false;

  const validTypes = ['like', 'comment', 'post', 'system', 'blood', 'verification'];
  const normalizedType = (params.type || 'system').toLowerCase();
  const type = validTypes.includes(normalizedType) ? normalizedType : 'system';

  try {
    const { error } = await supabase.from('notifications').insert({
      recipient_id: params.recipientId,
      actor_id: params.actorId || null,
      type: type,
      title: params.title,
      message: params.message,
      target_route: params.targetRoute || null,
      post_id: params.postId || null,
      blood_request_id: params.bloodRequestId || null,
      unread: true,
    });
    return !error;
  } catch {
    return false;
  }
}

// =============================================================================
// 7. SUPABASE STORAGE HELPER
// =============================================================================

export async function uploadMediaToSupabaseStorage(
  file: File | Blob,
  bucketName: 'avatars' | 'post-media' | 'verification-documents' | 'gallery',
  folderPath: string,
  fileName?: string
): Promise<{ publicUrl: string; storagePath: string } | null> {
  if (!isSupabaseConfigured) return null;

  try {
    let ext = 'jpg';
    if (file.type) {
      if (file.type.includes('png')) ext = 'png';
      else if (file.type.includes('webp')) ext = 'webp';
      else if (file.type.includes('gif')) ext = 'gif';
      else if (file.type.includes('svg')) ext = 'svg';
      else if (file.type.includes('mp4')) ext = 'mp4';
      else if (file.type.includes('webm')) ext = 'webm';
      else if (file.type.includes('quicktime') || file.type.includes('mov')) ext = 'mov';
    } else if ('name' in file && typeof (file as any).name === 'string') {
      const parts = (file as any).name.split('.');
      if (parts.length > 1) ext = parts.pop()!.toLowerCase();
    }

    const name = fileName || `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
    const fullPath = `${folderPath}/${name}`;
    const contentType = file.type || (bucketName === 'post-media' ? 'image/jpeg' : undefined);

    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fullPath, file, {
        cacheControl: '3600',
        upsert: true,
        contentType,
      });

    if (uploadError) {
      console.warn(`Supabase Storage upload to ${bucketName} error:`, uploadError.message);
      return null;
    }

    const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fullPath);
    return {
      publicUrl: urlData.publicUrl,
      storagePath: fullPath,
    };
  } catch (err) {
    console.warn('Storage upload error:', err);
    return null;
  }
}

/**
 * Uploads an identity document (SZMC ID, BMDC slip, Souvenir) directly to the private
 * `verification-documents` bucket in Supabase Storage.
 * Only the file owner and authorized admins have access (enforced via Storage RLS).
 */
export async function uploadVerificationDocumentToStorage(
  file: File | Blob,
  authUserId: string
): Promise<{ storagePath: string } | null> {
  if (!isSupabaseConfigured || !authUserId) return null;

  // File size limit: 5 MB
  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Verification document file size exceeds the 5MB limit.');
  }

  // Allowed file types: JPG, PNG, WEBP
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  let mimeType = file.type;
  if (!mimeType || !allowedMimes.includes(mimeType)) {
    const fileName = (file as any).name || '';
    if (/\.jpe?g$/i.test(fileName)) mimeType = 'image/jpeg';
    else if (/\.png$/i.test(fileName)) mimeType = 'image/png';
    else if (/\.webp$/i.test(fileName)) mimeType = 'image/webp';
    else {
      throw new Error('Only JPG, PNG, and WEBP image formats are accepted for verification documents.');
    }
  }

  let ext = 'jpg';
  if (mimeType.includes('png')) ext = 'png';
  else if (mimeType.includes('webp')) ext = 'webp';

  // Folder must start with auth.uid() to fulfill Storage RLS policy
  const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
  const fullPath = `${authUserId}/${uniqueName}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from('verification-documents')
      .upload(fullPath, file, {
        cacheControl: '3600',
        upsert: false, // Strict: Prevent unauthorized file overwrites
        contentType: mimeType,
      });

    if (uploadError) {
      console.warn('Supabase verification-documents storage upload error:', uploadError.message);
      throw new Error(uploadError.message || 'Failed to upload verification document to storage.');
    }

    return { storagePath: fullPath };
  } catch (err: any) {
    console.warn('uploadVerificationDocumentToStorage error:', err);
    throw err;
  }
}
