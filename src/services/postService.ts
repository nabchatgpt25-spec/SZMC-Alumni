import { supabase } from '../lib/supabase';
import { PostItem, PostComment, LinkMetadata } from '../types/post';

/**
 * Fetch feed posts via Supabase get_feed RPC.
 * Ranking in get_feed:
 * 1. Pinned posts
 * 2. Batchmates first (author batch_year === current user batch_year)
 * 3. Accepted connections (friends)
 * 4. Likes / reactions / comments count + recency
 *
 * NOTE: The client MUST preserve this exact ordering without re-sorting.
 */
export async function fetchFeedPosts(limit = 25, offset = 0, currentUserId?: number): Promise<PostItem[]> {
  try {
    // 1. Primary: Only supabase.rpc('get_feed')
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_feed', {
      p_user_id: currentUserId || null,
      p_limit: limit,
      p_offset: offset,
    });

    if (!rpcErr && Array.isArray(rpcData)) {
      return rpcData.map((row: any) => {
        const rawComments = Array.isArray(row.comments) ? row.comments : [];
        const formattedComments: PostComment[] = rawComments.map((c: any) => ({
          id: Number(c.id),
          postId: Number(c.postId || c.post_id || row.id),
          userId: Number(c.userId || c.user_id),
          fullName: c.fullName || c.full_name || 'SZMC Alumnus',
          avatarUrl: c.avatarUrl || c.avatar_url || '/assets/aistudio/images__1__2778177d.png',
          content: c.content || '',
          likesCount: Number(c.likesCount || c.likes_count || 0),
          likedByMe: Boolean(c.likedByMe),
          createdAt: c.createdAt || c.created_at || new Date().toISOString(),
        }));

        const cleanImages = Array.isArray(row.images)
          ? row.images
          : typeof row.images === 'string'
          ? (() => { try { return JSON.parse(row.images); } catch { return []; } })()
          : [];
        const cleanVideos = Array.isArray(row.videos)
          ? row.videos
          : typeof row.videos === 'string'
          ? (() => { try { return JSON.parse(row.videos); } catch { return []; } })()
          : [];

        return {
          id: Number(row.id),
          userId: Number(row.user_id || row.author_id),
          fullName: row.full_name || 'SZMC Alumnus',
          avatarUrl: row.avatar_url || '/assets/aistudio/images__1__2778177d.png',
          batchYear: row.batch_year ? Number(row.batch_year) : undefined,
          verified: Boolean(row.verified),
          profession: row.profession || 'Doctor / Medical Professional',
          institution: row.institution || undefined,
          content: row.content || '',
          category: row.category || 'General Update',
          images: cleanImages,
          videos: cleanVideos,
          layout_template: row.layout_template || (cleanImages.length > 1 ? 'carousel' : 'grid'),
          linked_url: row.linked_url || undefined,
          link_metadata: row.link_metadata || undefined,
          likesCount: Number(row.likes_count || 0),
          commentsCount: Number(row.comments_count || 0),
          createdAt: row.created_at || new Date().toISOString(),
          likedByMe: Boolean(row.liked_by_me),
          isSaved: Boolean(row.saved_by_me),
          pinned: Boolean(row.is_pinned),
          isEdited: Boolean(row.is_edited),
          isBatchmate: Boolean(row.is_batchmate),
          isFriend: Boolean(row.is_friend),
          comments: formattedComments,
          // Legacy aliases
          author: row.full_name || 'SZMC Alumnus',
          authorAvatar: row.avatar_url || '/assets/aistudio/images__1__2778177d.png',
          authorBatch: row.batch_year ? Number(row.batch_year) : undefined,
          authorRole: 'Alumnus',
          timestamp: row.created_at || 'Just now',
          likes: Number(row.likes_count || 0),
          liked: Boolean(row.liked_by_me),
          commentsList: formattedComments,
          shares: 0,
        };
      });
    }

    // 2. Direct Supabase Query Fallback replicating the exact get_feed ranking
    // (Active if remote database schema cache has not yet refreshed for the RPC)
    const { data: postsData, error: postsErr } = await supabase
      .from('posts')
      .select(`
        id,
        author_id,
        content,
        category,
        images,
        videos,
        layout_template,
        linked_url,
        link_metadata,
        likes_count,
        comments_count,
        is_pinned,
        is_edited,
        created_at
      `)
      .eq('is_deleted', false)
      .range(offset, offset + limit * 2);

    if (postsErr || !postsData || postsData.length === 0) {
      return [];
    }

    const postIds = postsData.map((p) => p.id);
    const authorIds = Array.from(new Set(postsData.map((p) => p.author_id))).filter(Boolean);

    // Fetch author profiles, my connections, my batch, comments, likes and saves
    const [profilesRes, myProfileRes, connectionsRes, commentsRes, likesRes, savedRes] = await Promise.all([
      authorIds.length > 0
        ? supabase
            .from('alumni_profiles')
            .select('id, full_name, avatar_url, batch_year, verification_status, profession, institution')
            .in('id', authorIds)
        : Promise.resolve({ data: [] }),
      currentUserId
        ? supabase.from('alumni_profiles').select('batch_year').eq('id', currentUserId).maybeSingle()
        : Promise.resolve({ data: null }),
      currentUserId
        ? supabase
            .from('connections')
            .select('user_id, friend_id')
            .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`)
            .eq('status', 'accepted')
        : Promise.resolve({ data: [] }),
      postIds.length > 0
        ? supabase
            .from('post_comments')
            .select('id, post_id, user_id, author_id, content, likes_count, created_at')
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

    const myBatchYear = myProfileRes?.data?.batch_year || null;
    const myFriendIds = new Set<number>();
    ((connectionsRes as any)?.data || []).forEach((c: any) => {
      if (Number(c.user_id) === currentUserId) myFriendIds.add(Number(c.friend_id));
      else if (Number(c.friend_id) === currentUserId) myFriendIds.add(Number(c.user_id));
    });

    const authorMap = new Map((profilesRes.data || []).map((a: any) => [Number(a.id), a]));
    const myLikedPostIds = new Set((likesRes.data || []).map((l: any) => Number(l.post_id)));
    const mySavedPostIds = new Set((savedRes.data || []).map((s: any) => Number(s.post_id)));

    const commentsByPost = new Map<number, PostComment[]>();
    ((commentsRes as any)?.data || []).forEach((c: any) => {
      const pId = Number(c.post_id);
      const list = commentsByPost.get(pId) || [];
      const cUserId = Number(c.user_id || c.author_id);
      const author = authorMap.get(cUserId) || {};
      list.push({
        id: Number(c.id),
        postId: pId,
        userId: cUserId,
        fullName: author.full_name || 'SZMC Alumnus',
        avatarUrl: author.avatar_url || '/assets/aistudio/images__1__2778177d.png',
        content: c.content || '',
        likesCount: Number(c.likes_count || 0),
        likedByMe: false,
        createdAt: c.created_at || new Date().toISOString(),
      });
      commentsByPost.set(pId, list);
    });

    // Rank exactly as specified in get_feed:
    // 1. Pinned
    // 2. Batchmates first
    // 3. Accepted connections
    // 4. Likes/reactions/comments + recency
    const rankedPosts = [...postsData].sort((a: any, b: any) => {
      const aPinned = a.is_pinned ? 1 : 0;
      const bPinned = b.is_pinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;

      const aAuthor = authorMap.get(Number(a.author_id));
      const bAuthor = authorMap.get(Number(b.author_id));

      const aIsBatchmate =
        myBatchYear && aAuthor?.batch_year === myBatchYear && Number(a.author_id) !== currentUserId ? 1 : 0;
      const bIsBatchmate =
        myBatchYear && bAuthor?.batch_year === myBatchYear && Number(b.author_id) !== currentUserId ? 1 : 0;
      if (aIsBatchmate !== bIsBatchmate) return bIsBatchmate - aIsBatchmate;

      const aIsFriend = myFriendIds.has(Number(a.author_id)) ? 1 : 0;
      const bIsFriend = myFriendIds.has(Number(b.author_id)) ? 1 : 0;
      if (aIsFriend !== bIsFriend) return bIsFriend - aIsFriend;

      const aEngagement = (Number(a.likes_count) || 0) * 2 + (Number(a.comments_count) || 0) * 3;
      const bEngagement = (Number(b.likes_count) || 0) * 2 + (Number(b.comments_count) || 0) * 3;
      if (aEngagement !== bEngagement) return bEngagement - aEngagement;

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }).slice(0, limit);

    return rankedPosts.map((row: any) => {
      const author = authorMap.get(Number(row.author_id)) || {};
      const isBatchmate = Boolean(
        myBatchYear && author.batch_year === myBatchYear && Number(row.author_id) !== currentUserId
      );
      const isFriend = myFriendIds.has(Number(row.author_id));
      const cleanImages = Array.isArray(row.images) ? row.images : [];
      const cleanVideos = Array.isArray(row.videos) ? row.videos : [];

      return {
        id: Number(row.id),
        userId: Number(row.author_id),
        fullName: author.full_name || 'SZMC Alumnus',
        avatarUrl: author.avatar_url || '/assets/aistudio/images__1__2778177d.png',
        batchYear: author.batch_year ? Number(author.batch_year) : undefined,
        verified: author.verification_status === 'verified',
        profession: author.profession || 'Doctor / Medical Professional',
        institution: author.institution || undefined,
        content: row.content || '',
        category: row.category || 'General Update',
        images: cleanImages,
        videos: cleanVideos,
        layout_template: row.layout_template || (cleanImages.length > 1 ? 'carousel' : 'grid'),
        linked_url: row.linked_url || undefined,
        link_metadata: row.link_metadata || undefined,
        likesCount: Number(row.likes_count || 0),
        commentsCount: Number(row.comments_count || 0),
        createdAt: row.created_at || new Date().toISOString(),
        likedByMe: myLikedPostIds.has(Number(row.id)),
        isSaved: mySavedPostIds.has(Number(row.id)),
        pinned: Boolean(row.is_pinned),
        isEdited: Boolean(row.is_edited),
        isBatchmate,
        isFriend,
        comments: commentsByPost.get(Number(row.id)) || [],
        // Legacy compatibility
        author: author.full_name || 'SZMC Alumnus',
        authorAvatar: author.avatar_url || '/assets/aistudio/images__1__2778177d.png',
        authorBatch: author.batch_year ? Number(author.batch_year) : undefined,
        authorRole: 'Alumnus',
        timestamp: row.created_at || 'Just now',
        likes: Number(row.likes_count || 0),
        liked: myLikedPostIds.has(Number(row.id)),
        commentsList: commentsByPost.get(Number(row.id)) || [],
        shares: 0,
      };
    });
  } catch (err) {
    console.warn('fetchFeedPosts failed:', err);
    return [];
  }
}

/**
 * Create a new post directly in Supabase.
 * Constraint: Do NOT send a bell notification to everyone for new posts.
 */
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
    const fallbackText =
      params.images && params.images.length > 0
        ? params.images.length > 1
          ? `Shared ${params.images.length} photos`
          : 'Shared a photo'
        : params.linked_url
        ? 'Shared a link'
        : 'Shared an update';

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

    const { data: insertedRow, error: insertErr } = await supabase
      .from('posts')
      .insert(payload)
      .select()
      .single();

    if (insertErr || !insertedRow) {
      return {
        success: false,
        error: insertErr?.message || 'Failed to persist post to Supabase.',
      };
    }

    return {
      success: true,
      post: {
        id: Number(insertedRow.id),
        userId: Number(insertedRow.author_id),
        fullName: 'You',
        avatarUrl: '/assets/aistudio/images__1__2778177d.png',
        content: insertedRow.content,
        category: insertedRow.category,
        images: insertedRow.images || [],
        videos: insertedRow.videos || [],
        layout_template: params.layout_template || (cleanImages.length > 1 ? 'carousel' : 'grid'),
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

/**
 * Toggle post like directly in Supabase.
 * Sends a notification of type `post_like` to the post author when liked.
 */
export async function togglePostLike(postId: number, userId: number): Promise<boolean> {
  try {
    const { data: existing } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      // Unliking
      await supabase.from('post_likes').delete().eq('id', existing.id);
      return false;
    } else {
      // Liking
      const { error: insErr } = await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
      if (!insErr) {
        // Find post author to notify them directly via Supabase
        const { data: postData } = await supabase
          .from('posts')
          .select('author_id')
          .eq('id', postId)
          .maybeSingle();

        if (postData && postData.author_id && Number(postData.author_id) !== userId) {
          // Get liking user name
          const { data: likerData } = await supabase
            .from('alumni_profiles')
            .select('full_name')
            .eq('id', userId)
            .maybeSingle();

          const likerName = likerData?.full_name || 'An alumnus';
          await supabase.from('notifications').insert({
            recipient_id: postData.author_id,
            actor_id: userId,
            type: 'post_like',
            title: 'Liked your post',
            message: `${likerName} liked your post.`,
            post_id: postId,
            target_route: 'feed',
            unread: true,
          });
        }
        return true;
      }
    }
  } catch (err) {
    console.warn('togglePostLike notice:', err);
  }
  return true;
}

/**
 * Add post comment directly in Supabase.
 * Sends a notification of type `post_comment` to the post author.
 */
export async function addComment(postId: number, userId: number, content: string): Promise<boolean> {
  const cleanContent = content.trim();
  if (!cleanContent) return false;

  try {
    const { data: commentData, error: insErr } = await supabase
      .from('post_comments')
      .insert({
        post_id: postId,
        user_id: userId,
        content: cleanContent,
      })
      .select('id')
      .single();

    if (insErr) {
      // Fallback with dual columns if schema requires author_id
      await supabase.from('post_comments').insert({
        post_id: postId,
        user_id: userId,
        author_id: userId,
        content: cleanContent,
      });
    }

    // Notify post author
    const { data: postData } = await supabase
      .from('posts')
      .select('author_id')
      .eq('id', postId)
      .maybeSingle();

    if (postData && postData.author_id && Number(postData.author_id) !== userId) {
      const { data: commenterData } = await supabase
        .from('alumni_profiles')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle();

      const commenterName = commenterData?.full_name || 'An alumnus';
      await supabase.from('notifications').insert({
        recipient_id: postData.author_id,
        actor_id: userId,
        type: 'post_comment',
        title: 'New Comment',
        message: `${commenterName} commented: "${cleanContent.slice(0, 80)}${cleanContent.length > 80 ? '...' : ''}"`,
        post_id: postId,
        target_route: 'feed',
        unread: true,
      });
    }

    return true;
  } catch (err) {
    console.warn('addComment notice:', err);
    return false;
  }
}

/**
 * Toggle post saved bookmark directly in Supabase.
 */
export async function toggleSavePost(postId: number, userId: number): Promise<boolean> {
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
  } catch (err) {
    console.warn('toggleSavePost notice:', err);
    return true;
  }
}
