import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { PostItem, PostPoll, ReactionType } from '../types/post';
import { normalizePollOptions, type MentionCandidate } from './richInteractionsUtils';
import { getSavedPosts, setSavedPosts, toggleSavePost as toggleLocalSavePost } from '../utils/offlineStorage';

/**
 * Fetches a user's saved posts directly from Supabase `saved_posts` joined with `posts`,
 * and syncs them into the offline cache so SavedPostsView works both online and offline.
 */
export async function fetchSavedPostsFromDb(userId?: number): Promise<{
  posts: PostItem[];
  source: 'supabase' | 'offline_cache';
}> {
  const localCached = getSavedPosts();
  if (!userId || !isSupabaseConfigured) {
    return { posts: localCached, source: 'offline_cache' };
  }

  try {
    const { data: savedRows, error: savedErr } = await supabase
      .from('saved_posts')
      .select('post_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (savedErr || !Array.isArray(savedRows)) {
      return { posts: localCached, source: 'offline_cache' };
    }

    if (savedRows.length === 0) {
      // Preserve offline-only bookmarks if DB has none yet, or reflect empty cleanly
      return { posts: localCached, source: 'supabase' };
    }

    const postIds = savedRows.map((r: any) => Number(r.post_id)).filter(Boolean);
    const { data: postsRows, error: postsErr } = await supabase
      .from('posts')
      .select(`
        id, author_id, content, category, images, videos, linked_url, link_metadata,
        likes_count, comments_count, is_pinned, is_edited, created_at
      `)
      .in('id', postIds)
      .eq('is_deleted', false);

    if (postsErr || !Array.isArray(postsRows)) {
      return { posts: localCached, source: 'offline_cache' };
    }

    const authorIds = Array.from(new Set(postsRows.map((p: any) => Number(p.author_id)).filter(Boolean)));
    const authorMap = new Map<number, any>();
    if (authorIds.length > 0) {
      const { data: authors } = await supabase
        .from('alumni_profiles')
        .select('id, full_name, avatar_url, batch_year, profession, institution, verification_status')
        .in('id', authorIds);
      (authors || []).forEach((a: any) => authorMap.set(Number(a.id), a));
    }

    const postById = new Map<number, PostItem>();
    for (const row of postsRows as any[]) {
      const author = authorMap.get(Number(row.author_id)) || {};
      postById.set(Number(row.id), {
        id: Number(row.id),
        userId: Number(row.author_id),
        fullName: author.full_name || 'SZMC Alumnus',
        avatarUrl: author.avatar_url || '/assets/aistudio/images__1__2778177d.png',
        batchYear: author.batch_year ? Number(author.batch_year) : undefined,
        verified: author.verification_status === 'verified',
        profession: author.profession || undefined,
        institution: author.institution || undefined,
        content: row.content || '',
        category: row.category || 'General Discussion',
        images: Array.isArray(row.images) ? row.images : [],
        videos: Array.isArray(row.videos) ? row.videos : [],
        linked_url: row.linked_url || undefined,
        link_metadata: row.link_metadata || undefined,
        likesCount: Number(row.likes_count || 0),
        commentsCount: Number(row.comments_count || 0),
        createdAt: row.created_at || new Date().toISOString(),
        isSaved: true,
        pinned: Boolean(row.is_pinned),
        isEdited: Boolean(row.is_edited),
        comments: [],
      });
    }

    // Order by saved_at descending
    const ordered: PostItem[] = [];
    for (const r of savedRows as any[]) {
      const item = postById.get(Number(r.post_id));
      if (item) ordered.push(item);
    }

    // Keep offline cache synced
    setSavedPosts(ordered);
    return { posts: ordered, source: 'supabase' };
  } catch {
    return { posts: localCached, source: 'offline_cache' };
  }
}

export async function removeSavedPostFromDbAndCache(post: PostItem, userId?: number): Promise<void> {
  // Always update local cache
  toggleLocalSavePost(post);
  if (!userId || !isSupabaseConfigured) return;
  try {
    await supabase
      .from('saved_posts')
      .delete()
      .eq('post_id', post.id)
      .eq('user_id', userId);
  } catch {}
}

export async function clearAllSavedPostsFromDbAndCache(userId?: number): Promise<void> {
  setSavedPosts([]);
  if (!userId || !isSupabaseConfigured) return;
  try {
    await supabase.from('saved_posts').delete().eq('user_id', userId);
  } catch {}
}

/**
 * Fetches inline polls attached to a list of post IDs from `community_polls` + `community_poll_votes`.
 */
export async function fetchPostPollsMap(
  postIds: number[],
  currentUserId?: number
): Promise<Map<number, PostPoll>> {
  const result = new Map<number, PostPoll>();
  if (!isSupabaseConfigured || postIds.length === 0) return result;

  try {
    const { data: polls, error } = await supabase
      .from('community_polls')
      .select('id, post_id, question, options, is_closed, closes_at')
      .in('post_id', postIds);

    if (error || !Array.isArray(polls) || polls.length === 0) return result;

    const pollIds = polls.map((p: any) => Number(p.id));
    const { data: votes } = await supabase
      .from('community_poll_votes')
      .select('poll_id, voter_id, option_index')
      .in('poll_id', pollIds);

    const voteRows = Array.isArray(votes) ? votes : [];

    for (const p of polls as any[]) {
      const pVotes = voteRows.filter((v: any) => Number(v.poll_id) === Number(p.id));
      const voteCounts: Record<number, number> = {};
      let myVoteOptionIndex: number | null = null;
      for (const v of pVotes as any[]) {
        const idx = Number(v.option_index);
        voteCounts[idx] = (voteCounts[idx] || 0) + 1;
        if (currentUserId && Number(v.voter_id) === currentUserId) {
          myVoteOptionIndex = idx;
        }
      }
      const rawOpts = Array.isArray(p.options) ? p.options : [];
      const options = rawOpts.map((o: any, idx: number) => ({
        id: typeof o?.id === 'number' ? o.id : idx,
        label: typeof o === 'string' ? o : String(o?.label || `Option ${idx + 1}`),
      }));

      if (p.post_id) {
        result.set(Number(p.post_id), {
          id: Number(p.id),
          postId: Number(p.post_id),
          question: String(p.question || ''),
          options,
          voteCounts,
          totalVotes: pVotes.length,
          myVoteOptionIndex,
          isClosed: Boolean(p.is_closed),
          closesAt: p.closes_at || null,
        });
      }
    }
  } catch {
    // Gracefully skip if post_id column is not yet migrated remotely
  }

  return result;
}

export async function createPostPoll(params: {
  postId: number;
  authorId: number;
  question: string;
  options: string[];
}): Promise<PostPoll | null> {
  const cleanQuestion = params.question.trim();
  const cleanOptions = normalizePollOptions(params.options);
  if (!cleanQuestion || cleanOptions.length < 2) return null;

  const formattedOptions = cleanOptions.map((label, idx) => ({ id: idx, label }));

  if (!isSupabaseConfigured) {
    return {
      id: Date.now(),
      postId: params.postId,
      question: cleanQuestion,
      options: formattedOptions,
      voteCounts: {},
      totalVotes: 0,
      myVoteOptionIndex: null,
      isClosed: false,
    };
  }

  try {
    const { data, error } = await supabase
      .from('community_polls')
      .insert({
        post_id: params.postId,
        author_id: params.authorId,
        question: cleanQuestion,
        options: formattedOptions,
      })
      .select('id, post_id, question, options, is_closed, closes_at')
      .single();

    if (!error && data) {
      return {
        id: Number(data.id),
        postId: Number(data.post_id),
        question: String(data.question),
        options: formattedOptions,
        voteCounts: {},
        totalVotes: 0,
        myVoteOptionIndex: null,
        isClosed: Boolean(data.is_closed),
        closesAt: data.closes_at || null,
      };
    }
  } catch {}

  // Return optimistic local poll so UX stays functional before migration 024 runs
  return {
    id: Date.now(),
    postId: params.postId,
    question: cleanQuestion,
    options: formattedOptions,
    voteCounts: {},
    totalVotes: 0,
    myVoteOptionIndex: null,
    isClosed: false,
  };
}

export async function voteOnPostPoll(
  pollId: number,
  voterId: number,
  optionIndex: number
): Promise<{ success: boolean }> {
  if (!isSupabaseConfigured || pollId > 1_000_000_000_000) {
    return { success: true };
  }

  try {
    const { error } = await supabase
      .from('community_poll_votes')
      .upsert(
        {
          poll_id: pollId,
          voter_id: voterId,
          option_index: optionIndex,
        },
        { onConflict: 'poll_id,voter_id' }
      );
    return { success: !error };
  } catch {
    return { success: false };
  }
}

/**
 * Persists a multi-reaction (like/love/care/haha/wow/sad/angry) or clears it when null.
 */
export async function upsertPostReaction(params: {
  postId: number;
  userId: number;
  reaction: ReactionType | null;
  reactorName?: string;
}): Promise<{ success: boolean }> {
  if (!isSupabaseConfigured) return { success: true };
  try {
    if (!params.reaction) {
      await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', params.postId)
        .eq('user_id', params.userId);
      return { success: true };
    }

    const { error } = await supabase
      .from('post_likes')
      .upsert(
        {
          post_id: params.postId,
          user_id: params.userId,
          reaction: params.reaction,
        },
        { onConflict: 'post_id,user_id' }
      );

    if (error) {
      // Fallback if unique index isn't present yet
      const { data: existing } = await supabase
        .from('post_likes')
        .select('id')
        .eq('post_id', params.postId)
        .eq('user_id', params.userId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('post_likes')
          .update({ reaction: params.reaction })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('post_likes')
          .insert({
            post_id: params.postId,
            user_id: params.userId,
            reaction: params.reaction,
          });
      }
    }

    // Notify post author on reaction
    try {
      const { data: postData } = await supabase
        .from('posts')
        .select('author_id')
        .eq('id', params.postId)
        .maybeSingle();

      if (postData?.author_id && Number(postData.author_id) !== params.userId) {
        await supabase.from('notifications').insert({
          recipient_id: postData.author_id,
          actor_id: params.userId,
          type: 'post_reaction',
          title: 'New Reaction',
          message: `${params.reactorName || 'An SZMC alumnus'} reacted to your post.`,
          post_id: params.postId,
          target_route: 'feed',
          unread: true,
        });
      }
    } catch {}

    return { success: true };
  } catch {
    return { success: false };
  }
}

/**
 * Searches alumni profiles for the @mention autocomplete dropdown.
 */
export async function searchAlumniForMention(query: string): Promise<MentionCandidate[]> {
  const clean = query.trim();
  if (!clean || clean.length < 1 || !isSupabaseConfigured) return [];

  try {
    const safe = clean.replace(/[%_,]/g, '');
    const { data, error } = await supabase
      .from('alumni_profiles')
      .select('id, full_name, batch_year, avatar_url')
      .ilike('full_name', `%${safe}%`)
      .limit(6);

    if (!error && Array.isArray(data)) {
      return data.map((row: any) => ({
        id: Number(row.id),
        fullName: row.full_name || 'SZMC Alumnus',
        batchYear: row.batch_year ? Number(row.batch_year) : undefined,
        avatarUrl: row.avatar_url || '/assets/aistudio/images__1__2778177d.png',
      }));
    }
  } catch {}
  return [];
}

/**
 * Dispatches mention notifications to mentioned alumni (excluding self).
 */
export async function notifyMentionedUsers(params: {
  mentionedUserIds: number[];
  actorId: number;
  actorName: string;
  postId: number;
  context: 'post' | 'comment';
}): Promise<void> {
  if (!isSupabaseConfigured || params.mentionedUserIds.length === 0) return;
  const recipients = Array.from(new Set(params.mentionedUserIds)).filter(
    (id) => id > 0 && id !== params.actorId
  );
  if (recipients.length === 0) return;

  try {
    await supabase.from('notifications').insert(
      recipients.map((recipientId) => ({
        recipient_id: recipientId,
        actor_id: params.actorId,
        type: 'mention',
        title: 'You were mentioned',
        message: `${params.actorName} mentioned you in a ${params.context} on The Quad.`,
        post_id: params.postId,
        target_route: 'feed',
        unread: true,
      }))
    );
  } catch {}
}
