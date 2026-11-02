import { useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { realtimeManager, RealtimeFeedEvent } from '../services/supabaseRealtimeService';
import { PostComment } from '../types';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export interface UseChannelPostgresConfig {
  event: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  schema?: string;
  table: string;
  filter?: string;
}

export interface UseChannelOptions<T = any> {
  channelName: string;
  postgresChanges?: UseChannelPostgresConfig | UseChannelPostgresConfig[];
  broadcastEvent?: string | string[];
  onPostgresChange?: (payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) => void;
  onBroadcast?: (event: string, payload: T) => void;
  enabled?: boolean;
}

/**
 * Reusable `useChannel` hook for subscribing to Supabase Realtime (`postgres_changes` & `broadcast`).
 * Automatically manages channel lifecycle and cleans up subscriptions on unmount.
 */
export function useChannel<T = any>({
  channelName,
  postgresChanges,
  broadcastEvent,
  onPostgresChange,
  onBroadcast,
  enabled = true,
}: UseChannelOptions<T>) {
  const onPostgresRef = useRef(onPostgresChange);
  const onBroadcastRef = useRef(onBroadcast);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    onPostgresRef.current = onPostgresChange;
    onBroadcastRef.current = onBroadcast;
  }, [onPostgresChange, onBroadcast]);

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured || !channelName) return;

    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    if (postgresChanges) {
      const configs = Array.isArray(postgresChanges) ? postgresChanges : [postgresChanges];
      configs.forEach((cfg) => {
        channel.on(
          'postgres_changes' as any,
          {
            event: cfg.event,
            schema: cfg.schema || 'public',
            table: cfg.table,
            ...(cfg.filter ? { filter: cfg.filter } : {}),
          },
          (payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) => {
            onPostgresRef.current?.(payload);
          }
        );
      });
    }

    if (broadcastEvent) {
      const events = Array.isArray(broadcastEvent) ? broadcastEvent : [broadcastEvent];
      events.forEach((evtName) => {
        channel.on('broadcast', { event: evtName }, (msg: any) => {
          const data = msg?.payload !== undefined ? msg.payload : msg;
          onBroadcastRef.current?.(evtName, data);
        });
      });
    }

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [channelName, enabled, JSON.stringify(postgresChanges), JSON.stringify(broadcastEvent)]);

  return channelRef;
}

// In-memory author profile cache for fast 0ms comment author enrichment
const authorProfileCache = new Map<number, { fullName: string; avatarUrl: string }>();

async function resolveCommentAuthor(
  userId: number,
  fallbackName?: string,
  fallbackAvatar?: string
): Promise<{ fullName: string; avatarUrl: string }> {
  if (fallbackName && fallbackName !== 'Alumnus' && fallbackName !== 'SZMC Colleague') {
    const entry = {
      fullName: fallbackName,
      avatarUrl: fallbackAvatar || '/assets/aistudio/images__1__2778177d.png',
    };
    if (userId > 0) authorProfileCache.set(userId, entry);
    return entry;
  }

  if (userId > 0 && authorProfileCache.has(userId)) {
    return authorProfileCache.get(userId)!;
  }

  if (isSupabaseConfigured && userId > 0) {
    try {
      const { data } = await supabase
        .from('alumni_profiles')
        .select('id, full_name, avatar_url')
        .eq('id', userId)
        .maybeSingle();

      if (data?.full_name) {
        const resolved = {
          fullName: data.full_name,
          avatarUrl: data.avatar_url || fallbackAvatar || '/assets/aistudio/images__1__2778177d.png',
        };
        authorProfileCache.set(userId, resolved);
        return resolved;
      }
    } catch {
      // ignore and fall back
    }
  }

  return {
    fullName: fallbackName || (userId === 1 || userId === 10002 ? 'Dr. Nurul Anam Bashir' : 'SZMC Alumnus'),
    avatarUrl: fallbackAvatar || '/assets/aistudio/images__1__2778177d.png',
  };
}

export interface UsePostCommentsChannelHandlers {
  postId?: number;
  currentUserId?: number;
  onCommentInserted: (comment: PostComment, postId: number) => void;
  onReplyInserted?: (reply: PostComment, postId: number, parentCommentId: number) => void;
  onCommentDeleted?: (commentId: number, postId: number) => void;
}

/**
 * Specialized hook built on `useChannel` that subscribes to real-time `post_comments`
 * database inserts, updates, deletes, and broadcast events across all clients.
 */
export function usePostCommentsChannel({
  postId,
  onCommentInserted,
  onReplyInserted,
  onCommentDeleted,
}: UsePostCommentsChannelHandlers) {
  const onCommentInsertedRef = useRef(onCommentInserted);
  const onReplyInsertedRef = useRef(onReplyInserted);
  const onCommentDeletedRef = useRef(onCommentDeleted);
  // Deduplication set to prevent applying the same comment event twice (e.g., from both postgres_changes and SSE/broadcast)
  const processedCommentKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    onCommentInsertedRef.current = onCommentInserted;
    onReplyInsertedRef.current = onReplyInserted;
    onCommentDeletedRef.current = onCommentDeleted;
  }, [onCommentInserted, onReplyInserted, onCommentDeleted]);

  const markProcessed = (key: string): boolean => {
    if (processedCommentKeysRef.current.has(key)) return false;
    processedCommentKeysRef.current.add(key);
    if (processedCommentKeysRef.current.size > 500) {
      const firstKey = processedCommentKeysRef.current.values().next().value;
      if (firstKey) processedCommentKeysRef.current.delete(firstKey);
    }
    return true;
  };

  const handleRawCommentRow = async (raw: any) => {
    if (!raw) return;
    const targetPostId = Number(raw.postId ?? raw.post_id);
    if (!targetPostId || Number.isNaN(targetPostId)) return;
    if (postId && targetPostId !== postId) return;

    const rawContent = String(raw.content || '').trim();
    if (!rawContent) return;

    const commentId = Number(raw.id) || Date.now();
    const authorId = Number(raw.userId ?? raw.user_id ?? raw.author_id ?? 1);
    const parentCommentId = Number(raw.parentCommentId ?? raw.parent_comment_id ?? 0);

    // Check if content encodes a reply marker or explicit parentCommentId
    if (parentCommentId > 0) {
      const dedupKey = `reply:${targetPostId}:${parentCommentId}:${commentId}:${rawContent.slice(0, 40)}`;
      if (!markProcessed(dedupKey)) return;

      const author = await resolveCommentAuthor(
        authorId,
        raw.fullName || raw.full_name || raw.author?.full_name,
        raw.avatarUrl || raw.avatar_url || raw.author?.avatar_url
      );

      const formattedReply: PostComment = {
        id: commentId,
        postId: targetPostId,
        userId: authorId,
        fullName: author.fullName,
        avatarUrl: author.avatarUrl,
        content: rawContent,
        likesCount: Number(raw.likesCount ?? raw.likes_count ?? 0),
        likedByMe: false,
        createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
      };

      onReplyInsertedRef.current?.(formattedReply, targetPostId, parentCommentId);
      return;
    }

    const dedupKey = `comment:${targetPostId}:${authorId}:${rawContent.slice(0, 60)}:${Math.floor(Date.now() / 5000)}`;
    const idKey = commentId > 0 && commentId < 1_700_000_000_000 ? `comment-db-id:${commentId}` : null;
    if (idKey && !markProcessed(idKey)) return;
    if (!idKey && !markProcessed(dedupKey)) return;

    const author = await resolveCommentAuthor(
      authorId,
      raw.fullName || raw.full_name || raw.author?.full_name,
      raw.avatarUrl || raw.avatar_url || raw.author?.avatar_url
    );

    const formattedComment: PostComment = {
      id: commentId,
      postId: targetPostId,
      userId: authorId,
      fullName: author.fullName,
      avatarUrl: author.avatarUrl,
      content: rawContent,
      likesCount: Number(raw.likesCount ?? raw.likes_count ?? 0),
      likedByMe: false,
      createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
      replies: Array.isArray(raw.replies) ? raw.replies : [],
    };

    onCommentInsertedRef.current(formattedComment, targetPostId);
  };

  // 1. Direct Supabase Realtime Channel (`postgres_changes` + `broadcast`) via `useChannel`
  useChannel({
    channelName: postId ? `realtime:post_comments:${postId}` : 'realtime:post_comments:global',
    postgresChanges: {
      event: '*',
      schema: 'public',
      table: 'post_comments',
      ...(postId ? { filter: `post_id=eq.${postId}` } : {}),
    },
    broadcastEvent: ['comment:inserted', 'comment:replied', 'comment:deleted'],
    onPostgresChange: (payload) => {
      if (payload.eventType === 'INSERT' && payload.new) {
        void handleRawCommentRow(payload.new);
      } else if (payload.eventType === 'DELETE' && payload.old) {
        const deletedId = Number((payload.old as any).id);
        const targetPostId = Number((payload.old as any).post_id || postId);
        if (deletedId && targetPostId) {
          onCommentDeletedRef.current?.(deletedId, targetPostId);
        }
      }
    },
    onBroadcast: (event, data) => {
      if (event === 'comment:inserted' && data) {
        void handleRawCommentRow(data.comment || data);
      } else if (event === 'comment:replied' && data) {
        void handleRawCommentRow({
          ...(data.reply || data),
          postId: data.postId || data.reply?.postId,
          parentCommentId: data.parentCommentId,
        });
      } else if (event === 'comment:deleted' && data) {
        const deletedId = Number(data.commentId || data.id);
        const targetPostId = Number(data.postId || postId);
        if (deletedId && targetPostId) {
          onCommentDeletedRef.current?.(deletedId, targetPostId);
        }
      }
    },
  });

  // 2. Also listen to the unified SSE + shared feed channel in `realtimeManager`
  useEffect(() => {
    const unsubscribe = realtimeManager.subscribeToFeed((event: RealtimeFeedEvent) => {
      if (event.table !== 'post_comments') return;

      if (event.eventType === 'INSERT' && event.newRecord) {
        void handleRawCommentRow(event.newRecord);
      } else if (event.eventType === 'UPDATE' && event.newRecord?.reply) {
        void handleRawCommentRow({
          ...event.newRecord.reply,
          postId: event.newRecord.postId || event.newRecord.post_id,
          parentCommentId: event.newRecord.parentCommentId,
        });
      } else if (event.eventType === 'DELETE' && event.oldRecord) {
        const deletedId = Number(event.oldRecord.id);
        const targetPostId = Number(event.oldRecord.post_id || event.oldRecord.postId || postId);
        if (deletedId && targetPostId) {
          onCommentDeletedRef.current?.(deletedId, targetPostId);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [postId]);
}
