import { supabase } from '../lib/supabase';
import { PostItem, PostComment, LinkMetadata } from '../types/post';

export async function fetchFeedPosts(limit = 25, offset = 0, currentUserId?: number): Promise<PostItem[]> {
  try {
    const { data: postsData, error } = await supabase
      .from('posts')
      .select(`
        id,
        author_id,
        content,
        category,
        images,
        videos,
        linked_url,
        link_metadata,
        likes_count,
        comments_count,
        is_pinned,
        is_edited,
        created_at
      `)
      .eq('is_deleted', false)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error || !postsData) {
      // Fallback to server endpoint if direct client query fails
      try {
        const res = await fetch(`/api/posts?limit=${limit}&offset=${offset}&currentUserId=${currentUserId || ''}`);
        if (res.ok) {
          const body = await res.json();
          if (Array.isArray(body.posts)) {
            return body.posts;
          }
        }
      } catch {}
      return [];
    }

    const postIds = postsData.map((p) => p.id);
    const authorIds = Array.from(new Set(postsData.map((p) => p.author_id))).filter(Boolean);

    const [profilesRes, commentsRes, likesRes, savedRes] = await Promise.all([
      authorIds.length > 0
        ? supabase
            .from('alumni_profiles')
            .select('id, full_name, avatar_url, batch_year, verification_status, profession, institution')
            .in('id', authorIds)
        : Promise.resolve({ data: [] }),
      postIds.length > 0
        ? supabase
            .from('post_comments')
            .select('id, post_id, user_id, content, likes_count, created_at')
            .in('post_id', postIds)
            .eq('is_deleted', false)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [] }),
      currentUserId && postIds.length > 0
        ? supabase.from('post_likes').select('post_id').eq('user_id', currentUserId).in('post_id', postIds)
        : Promise.resolve({ data: [] }),
      currentUserId && postIds.length > 0
        ? supabase.from('saved_posts').select('post_id').eq('user_id', currentUserId).in('post_id', postIds)
        : Promise.resolve({ data: [] }),
    ]);

    const authorMap = new Map((profilesRes.data || []).map((a: any) => [a.id, a]));
    const myLikedPostIds = new Set((likesRes.data || []).map((l: any) => l.post_id));
    const mySavedPostIds = new Set((savedRes.data || []).map((s: any) => s.post_id));

    const commentsByPost = new Map<number, PostComment[]>();
    (commentsRes.data || []).forEach((c: any) => {
      const list = commentsByPost.get(c.post_id) || [];
      const author = authorMap.get(c.user_id) || {};
      list.push({
        id: c.id,
        postId: c.post_id,
        userId: c.user_id,
        fullName: author.full_name || 'SZMC Alumnus',
        avatarUrl: author.avatar_url || '/assets/aistudio/images__1__2778177d.png',
        content: c.content,
        likesCount: c.likes_count || 0,
        likedByMe: false,
        createdAt: c.created_at,
      });
      commentsByPost.set(c.post_id, list);
    });

    return postsData.map((row: any) => {
      const author = authorMap.get(row.author_id) || {};
      return {
        id: row.id,
        userId: row.author_id,
        fullName: author.full_name || 'SZMC Alumnus',
        avatarUrl: author.avatar_url || '/assets/aistudio/images__1__2778177d.png',
        batchYear: author.batch_year || 20,
        verified: author.verification_status === 'verified',
        profession: author.profession || 'Doctor / Medical Professional',
        institution: author.institution,
        content: row.content,
        category: row.category || 'General Update',
        images: Array.isArray(row.images) ? row.images : [],
        videos: Array.isArray(row.videos) ? row.videos : [],
        layout_template: row.layout_template || row.link_metadata?.layout_template || (Array.isArray(row.images) && row.images.length > 1 ? 'carousel' : 'grid'),
        linked_url: row.linked_url,
        link_metadata: row.link_metadata,
        likesCount: row.likes_count || 0,
        commentsCount: row.comments_count || 0,
        createdAt: row.created_at,
        pinned: Boolean(row.is_pinned),
        isEdited: Boolean(row.is_edited),
        likedByMe: myLikedPostIds.has(row.id),
        isSaved: mySavedPostIds.has(row.id),
        comments: commentsByPost.get(row.id) || [],
        // Legacy compat fields
        author: author.full_name || 'SZMC Alumnus',
        authorAvatar: author.avatar_url || '/assets/aistudio/images__1__2778177d.png',
        authorBatch: author.batch_year || 20,
        authorRole: 'Alumnus',
        timestamp: row.created_at,
        likes: row.likes_count || 0,
        liked: myLikedPostIds.has(row.id),
        commentsList: commentsByPost.get(row.id) || [],
        shares: 0,
      };
    });
  } catch (err) {
    console.warn('fetchFeedPosts failed:', err);
    return [];
  }
}

export async function createPost(params: {
  authorId: number;
  content: string;
  category?: string;
  images?: string[];
  videos?: string[];
  layout_template?: 'carousel' | 'grid' | 'column' | 'hero';
  linked_url?: string;
  link_metadata?: LinkMetadata;
}): Promise<{ success: boolean; post?: PostItem; error?: string }> {
  try {
    const rawContent = params.content.trim();
    const fallbackText = params.images && params.images.length > 0
      ? (params.images.length > 1 ? `Shared ${params.images.length} photos` : 'Shared a photo')
      : (params.linked_url ? 'Shared a link' : 'Shared an update');

    const safeContent = rawContent || fallbackText;
    const cleanImages = (params.images || []).filter(Boolean);
    const cleanVideos = (params.videos || []).filter(Boolean);

    const metadataWithLayout = {
      ...(params.link_metadata || {}),
      layout_template: params.layout_template || (cleanImages.length > 1 ? 'carousel' : 'grid'),
    };

    const payload = {
      author_id: params.authorId,
      content: safeContent,
      category: params.category || 'General Update',
      images: cleanImages,
      videos: cleanVideos,
      linked_url: params.linked_url || null,
      link_metadata: metadataWithLayout,
    };

    // First attempt: direct Supabase insert
    let insertedRow: any = null;
    let insertErr: any = null;

    try {
      const { data, error } = await supabase
        .from('posts')
        .insert(payload)
        .select()
        .single();
      if (!error && data) {
        insertedRow = data;
      } else {
        insertErr = error;
      }
    } catch (e: any) {
      insertErr = e;
    }

    // Second attempt: Fallback to server endpoint proxy with service role if client RLS prevented direct insert
    if (!insertedRow) {
      try {
        const response = await fetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (response.ok) {
          const resJson = await response.json();
          if (resJson.post) {
            insertedRow = resJson.post;
          }
        }
      } catch (proxyErr) {
        console.warn('Server proxy /api/posts failed:', proxyErr);
      }
    }

    if (!insertedRow) {
      return {
        success: false,
        error: insertErr?.message || 'Failed to persist post to Supabase database.',
      };
    }

    return {
      success: true,
      post: {
        id: insertedRow.id,
        userId: insertedRow.author_id,
        fullName: 'You',
        avatarUrl: '/assets/aistudio/images__1__2778177d.png',
        content: insertedRow.content,
        category: insertedRow.category,
        images: insertedRow.images || [],
        videos: insertedRow.videos || [],
        layout_template: insertedRow.layout_template || insertedRow.link_metadata?.layout_template || params.layout_template || (cleanImages.length > 1 ? 'carousel' : 'grid'),
        linked_url: insertedRow.linked_url,
        link_metadata: insertedRow.link_metadata,
        likesCount: 0,
        commentsCount: 0,
        createdAt: insertedRow.created_at || new Date().toISOString(),
        likedByMe: false,
        comments: [],
        author: 'You',
        authorAvatar: '/assets/aistudio/images__1__2778177d.png',
        authorBatch: 20,
        authorRole: 'Alumnus',
        timestamp: 'Just now',
        likes: 0,
        liked: false,
        commentsList: [],
        shares: 0,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to create post' };
  }
}

export async function togglePostLike(postId: number, userId: number): Promise<boolean> {
  try {
    const { data: existing, error: selectErr } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!selectErr) {
      if (existing) {
        const { error: delErr } = await supabase.from('post_likes').delete().eq('id', existing.id);
        if (!delErr) return false;
      } else {
        const { error: insErr } = await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
        if (!insErr) return true;
      }
    }
  } catch (err) {
    console.warn('Direct client togglePostLike failed, using backend proxy:', err);
  }

  // Resilient backend fallback
  try {
    const resp = await fetch(`/api/posts/${postId}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (resp.ok) {
      const data = await resp.json();
      return Boolean(data.liked);
    }
  } catch (proxyErr) {
    console.warn('Backend proxy togglePostLike failed:', proxyErr);
  }

  return true;
}

export async function addComment(postId: number, userId: number, content: string): Promise<boolean> {
  const cleanContent = content.trim();
  if (!cleanContent) return false;

  try {
    // Try dual column insertion to support both core and full schemas
    const { error: insErr1 } = await supabase.from('post_comments').insert({
      post_id: postId,
      user_id: userId,
      author_id: userId,
      content: cleanContent,
    });
    if (!insErr1) return true;

    // Try user_id alone
    const { error: insErr2 } = await supabase.from('post_comments').insert({
      post_id: postId,
      user_id: userId,
      content: cleanContent,
    });
    if (!insErr2) return true;

    // Try author_id alone
    const { error: insErr3 } = await supabase.from('post_comments').insert({
      post_id: postId,
      author_id: userId,
      content: cleanContent,
    });
    if (!insErr3) return true;
  } catch (err) {
    console.warn('Direct client addComment notice, using server proxy:', err);
  }

  // Resilient backend proxy fallback
  try {
    const resp = await fetch(`/api/posts/${postId}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, content: cleanContent }),
    });
    if (resp.ok) {
      return true;
    }
  } catch (proxyErr) {
    console.warn('Backend proxy addComment failed:', proxyErr);
  }

  return false;
}

export async function toggleSavePost(postId: number, userId: number): Promise<boolean> {
  try {
    const { data: existing, error: selectErr } = await supabase
      .from('saved_posts')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!selectErr) {
      if (existing) {
        await supabase.from('saved_posts').delete().eq('id', existing.id);
        return false;
      } else {
        await supabase.from('saved_posts').insert({ post_id: postId, user_id: userId });
        return true;
      }
    }
  } catch (err) {
    console.warn('toggleSavePost notice:', err);
  }
  return true;
}

