import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, ALUMNI_PUBLIC_COLUMNS, isSupabaseConfigured } from '../lib/supabase';
import type { ChatConversation, ChatMessage, ChatPerson, UserMessageSettings } from '../types/messaging';

const MESSAGE_COLUMNS = 'id, conversation_id, sender_id, body, created_at, edited_at, deleted_at';
const PREVIEW_LENGTH = 80;

function toChatPerson(row: any): ChatPerson {
  return {
    profileId: Number(row.id),
    fullName: row.full_name || 'SZMC Alumnus',
    avatarUrl: row.avatar_url || 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150',
    batchYear: Number(row.batch_year) || 20,
    profession: row.profession || 'Physician',
  };
}

function toChatMessage(row: any): ChatMessage {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id || row.conversationId),
    senderId: Number(row.sender_id || row.senderId),
    body: row.body,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    editedAt: row.edited_at ?? row.editedAt ?? null,
    deletedAt: row.deleted_at ?? row.deletedAt ?? null,
  };
}

function previewOf(message: ChatMessage): string {
  if (message.deletedAt) return 'Message deleted';
  return message.body.length > PREVIEW_LENGTH ? `${message.body.slice(0, PREVIEW_LENGTH)}...` : message.body;
}

// ---------------------------------------------------------------------------
// 1. LIST CONVERSATIONS (SUPABASE DIRECT -> SERVER API FALLBACK)
// ---------------------------------------------------------------------------
export async function listConversations(myProfileId: number): Promise<ChatConversation[]> {
  // Strategy 1: Attempt direct client-side Supabase query
  if (isSupabaseConfigured) {
    try {
      const { data: mine, error: mineErr } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at, is_muted')
        .eq('profile_id', myProfileId);

      if (!mineErr && mine) {
        if (mine.length === 0) return [];

        const conversationIds = mine.map((row: any) => row.conversation_id as string);

        const [{ data: convRows, error: convErr }, { data: others, error: othersErr }, { data: messageRows, error: msgErr }] =
          await Promise.all([
            supabase.from('conversations').select('id, last_message_at').in('id', conversationIds),
            supabase
              .from('conversation_participants')
              .select('conversation_id, profile_id')
              .in('conversation_id', conversationIds)
              .neq('profile_id', myProfileId),
            supabase
              .from('messages')
              .select(MESSAGE_COLUMNS)
              .in('conversation_id', conversationIds)
              .order('created_at', { ascending: false })
              .limit(1000),
          ]);

        if (!convErr && !othersErr && !msgErr) {
          const otherByConversation = new Map<string, number>();
          (others ?? []).forEach((row: any) => otherByConversation.set(row.conversation_id, row.profile_id));

          const otherIds = Array.from(new Set(otherByConversation.values()));
          const { data: profileRows } = otherIds.length
            ? await supabase.from('alumni_profiles').select(ALUMNI_PUBLIC_COLUMNS).in('id', otherIds)
            : { data: [] };

          const peopleById = new Map<number, ChatPerson>();
          (profileRows ?? []).forEach((row: any) => peopleById.set(row.id, toChatPerson(row)));

          const latestByConversation = new Map<string, ChatMessage>();
          const unreadByConversation = new Map<string, number>();
          const participantByConversation = new Map<string, { last_read_at: string; is_muted: boolean }>();
          mine.forEach((row: any) => participantByConversation.set(row.conversation_id, row));

          (messageRows ?? []).map(toChatMessage).forEach((message) => {
            if (!latestByConversation.has(message.conversationId)) {
              latestByConversation.set(message.conversationId, message);
            }
            const lastRead = participantByConversation.get(message.conversationId)?.last_read_at;
            if (message.senderId !== myProfileId && !message.deletedAt && lastRead && message.createdAt > lastRead) {
              unreadByConversation.set(message.conversationId, (unreadByConversation.get(message.conversationId) ?? 0) + 1);
            }
          });

          const conversations: ChatConversation[] = [];
          (convRows ?? []).forEach((conv: any) => {
            const otherId = otherByConversation.get(conv.id);
            const person = otherId !== undefined ? peopleById.get(otherId) : undefined;
            if (!person) return;
            const latest = latestByConversation.get(conv.id);
            conversations.push({
              id: conv.id,
              person,
              lastMessageAt: latest?.createdAt ?? conv.last_message_at,
              lastMessagePreview: latest ? previewOf(latest) : '',
              lastMessageFromMe: latest?.senderId === myProfileId,
              unreadCount: unreadByConversation.get(conv.id) ?? 0,
              isMuted: participantByConversation.get(conv.id)?.is_muted ?? false,
            });
          });

          return conversations.sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
        }
      }
    } catch {
      // Fall through to server API
    }
  }

  // Strategy 2: Call the backend server API
  const resp = await fetch(`/api/messages/conversations?profileId=${myProfileId}`);
  if (resp.ok) {
    const json = await resp.json();
    if (json.conversations) return json.conversations;
  }

  return [];
}

// ---------------------------------------------------------------------------
// 2. FIND OR CREATE CONVERSATION
// ---------------------------------------------------------------------------
export async function findOrCreateDirectConversation(myProfileId: number, otherProfileId: number): Promise<string> {
  // Strategy 1: Direct Supabase client
  if (isSupabaseConfigured) {
    try {
      const { data: mine } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('profile_id', myProfileId);

      const myIds = (mine ?? []).map((row: any) => row.conversation_id as string);
      if (myIds.length > 0) {
        const { data: shared } = await supabase
          .from('conversation_participants')
          .select('conversation_id')
          .eq('profile_id', otherProfileId)
          .in('conversation_id', myIds)
          .limit(1);

        if (shared && shared.length > 0) return shared[0].conversation_id as string;
      }

      const { data: created, error: createErr } = await supabase
        .from('conversations')
        .insert({ created_by: myProfileId })
        .select('id')
        .single();

      if (!createErr && created) {
        const conversationId = created.id as string;
        await supabase.from('conversation_participants').insert([
          { conversation_id: conversationId, profile_id: myProfileId },
          { conversation_id: conversationId, profile_id: otherProfileId },
        ]);
        return conversationId;
      }
    } catch {
      // Fall through to server API
    }
  }

  // Strategy 2: Call backend API
  const resp = await fetch('/api/messages/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ myProfileId, otherProfileId }),
  });
  if (resp.ok) {
    const json = await resp.json();
    if (json.conversationId) return json.conversationId;
  }

  throw new Error('Could not start conversation. Please try again.');
}

// ---------------------------------------------------------------------------
// 3. LIST MESSAGES
// ---------------------------------------------------------------------------
export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(MESSAGE_COLUMNS)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(500);

      if (!error && data) {
        return data.map(toChatMessage);
      }
    } catch {
      // Fall through to server API
    }
  }

  const resp = await fetch(`/api/messages/conversations/${conversationId}`);
  if (resp.ok) {
    const json = await resp.json();
    if (json.messages) return json.messages;
  }

  return [];
}

// ---------------------------------------------------------------------------
// 4. SEND MESSAGE
// ---------------------------------------------------------------------------
export async function sendMessage(conversationId: string, senderId: number, body: string): Promise<ChatMessage> {
  const cleanBody = body.trim();
  if (!cleanBody) throw new Error('Message cannot be empty.');

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, sender_id: senderId, body: cleanBody })
        .select(MESSAGE_COLUMNS)
        .single();

      if (!error && data) {
        const msg = toChatMessage(data);
        broadcastMessageEvent('new_message', msg);
        return msg;
      }
    } catch {
      // Fall through
    }
  }

  const resp = await fetch(`/api/messages/conversations/${conversationId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senderId, body: cleanBody }),
  });

  if (resp.ok) {
    const json = await resp.json();
    if (json.message) {
      broadcastMessageEvent('new_message', json.message);
      return json.message;
    }
  }

  throw new Error('Could not send message. Please try again.');
}

// ---------------------------------------------------------------------------
// 5. EDIT MESSAGE
// ---------------------------------------------------------------------------
export async function editMessage(messageId: string, body: string): Promise<ChatMessage> {
  const cleanBody = body.trim();
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .update({ body: cleanBody, edited_at: new Date().toISOString() })
        .eq('id', messageId)
        .select(MESSAGE_COLUMNS)
        .maybeSingle();

      if (!error && data) {
        const msg = toChatMessage(data);
        broadcastMessageEvent('edit_message', msg);
        return msg;
      }
    } catch {
      // Fall through
    }
  }

  const resp = await fetch(`/api/messages/${messageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: cleanBody }),
  });

  if (resp.ok) {
    const json = await resp.json();
    if (json.message) {
      broadcastMessageEvent('edit_message', json.message);
      return json.message;
    }
  }

  throw new Error('Could not edit message.');
}

// ---------------------------------------------------------------------------
// 6. DELETE MESSAGE
// ---------------------------------------------------------------------------
export async function deleteMessage(messageId: string): Promise<ChatMessage> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', messageId)
        .select(MESSAGE_COLUMNS)
        .maybeSingle();

      if (!error && data) {
        const msg = toChatMessage(data);
        broadcastMessageEvent('delete_message', msg);
        return msg;
      }
    } catch {
      // Fall through
    }
  }

  const resp = await fetch(`/api/messages/${messageId}`, {
    method: 'DELETE',
  });

  if (resp.ok) {
    const json = await resp.json();
    if (json.message) {
      broadcastMessageEvent('delete_message', json.message);
      return json.message;
    }
  }

  throw new Error('Could not delete message.');
}

// ---------------------------------------------------------------------------
// 7. READ & MUTE SETTINGS
// ---------------------------------------------------------------------------
export async function markConversationRead(conversationId: string, myProfileId: number): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      await supabase
        .from('conversation_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('profile_id', myProfileId);
    } catch {}
  }

  try {
    await fetch(`/api/messages/conversations/${conversationId}/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: myProfileId }),
    });
  } catch {}
}

export async function setConversationMuted(conversationId: string, myProfileId: number, muted: boolean): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      await supabase
        .from('conversation_participants')
        .update({ is_muted: muted })
        .eq('conversation_id', conversationId)
        .eq('profile_id', myProfileId);
    } catch {}
  }

  try {
    await fetch(`/api/messages/conversations/${conversationId}/mute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: myProfileId, isMuted: muted }),
    });
  } catch {}
}

export async function leaveConversation(conversationId: string, myProfileId: number): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      await supabase
        .from('conversation_participants')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('profile_id', myProfileId);
    } catch {}
  }

  try {
    await fetch(`/api/messages/conversations/${conversationId}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: myProfileId }),
    });
  } catch {}
}

// ---------------------------------------------------------------------------
// 8. USER-LEVEL MESSAGE SETTINGS (PERSISTED IN SUPABASE + LOCALSTORAGE)
// ---------------------------------------------------------------------------
const DEFAULT_USER_MESSAGE_SETTINGS: UserMessageSettings = {
  profileId: 1,
  whoCanMessage: 'everyone',
  readReceiptsEnabled: true,
  soundEnabled: true,
  notificationPreviewEnabled: true,
  emailNotificationDigest: false,
};

export async function getUserMessageSettings(profileId: number): Promise<UserMessageSettings> {
  // 1. Try direct Supabase query first for real-time consistency
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('user_message_settings')
        .select('*')
        .eq('profile_id', profileId)
        .maybeSingle();

      if (!error && data) {
        const s: UserMessageSettings = {
          profileId: data.profile_id,
          whoCanMessage: data.who_can_message || 'everyone',
          readReceiptsEnabled: data.read_receipts_enabled ?? true,
          soundEnabled: data.sound_enabled ?? true,
          notificationPreviewEnabled: data.notification_preview_enabled ?? true,
          emailNotificationDigest: data.email_notification_digest ?? false,
          updatedAt: data.updated_at,
        };
        try {
          localStorage.setItem(`szmc_msg_settings_${profileId}`, JSON.stringify(s));
        } catch {}
        return s;
      }
    } catch {}
  }

  // 2. Try server API
  try {
    const resp = await fetch(`/api/messages/settings?profileId=${profileId}`);
    if (resp.ok) {
      const json = await resp.json();
      if (json.settings) {
        try {
          localStorage.setItem(`szmc_msg_settings_${profileId}`, JSON.stringify(json.settings));
        } catch {}
        return json.settings;
      }
    }
  } catch {}

  // 3. Fallback to local cache if offline
  try {
    const raw = localStorage.getItem(`szmc_msg_settings_${profileId}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}

  return { ...DEFAULT_USER_MESSAGE_SETTINGS, profileId };
}

export async function updateUserMessageSettings(
  profileId: number,
  updates: Partial<UserMessageSettings>
): Promise<UserMessageSettings> {
  const current = await getUserMessageSettings(profileId);
  const next: UserMessageSettings = {
    ...current,
    ...updates,
    profileId,
    updatedAt: new Date().toISOString(),
  };

  // 1. Save in localStorage
  try {
    localStorage.setItem(`szmc_msg_settings_${profileId}`, JSON.stringify(next));
  } catch {}

  // 2. Save in Supabase
  if (isSupabaseConfigured) {
    try {
      await supabase.from('user_message_settings').upsert({
        profile_id: profileId,
        who_can_message: next.whoCanMessage,
        read_receipts_enabled: next.readReceiptsEnabled,
        sound_enabled: next.soundEnabled,
        notification_preview_enabled: next.notificationPreviewEnabled,
        email_notification_digest: next.emailNotificationDigest,
        updated_at: next.updatedAt,
      });
    } catch {}
  }

  // 3. Save via server API
  try {
    await fetch('/api/messages/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
  } catch {}

  return next;
}

// ---------------------------------------------------------------------------
// 9. MESSAGING CONNECTION STATUS
// ---------------------------------------------------------------------------
export async function getMessagingConnectionStatus(): Promise<{
  connected: boolean;
  supabaseUrl: string;
  tablesOnline: boolean;
  storageFallbackActive: boolean;
}> {
  try {
    const resp = await fetch('/api/messages/status');
    if (resp.ok) {
      const data = await resp.json();
      return {
        connected: Boolean(data.configured),
        supabaseUrl: data.supabaseUrl || 'https://hjuyiqyviohinbhzaipl.supabase.co',
        tablesOnline: Boolean(data.tablesOnline),
        storageFallbackActive: Boolean(data.storageFallbackActive),
      };
    }
  } catch {}

  return {
    connected: isSupabaseConfigured,
    supabaseUrl: 'https://hjuyiqyviohinbhzaipl.supabase.co',
    tablesOnline: false,
    storageFallbackActive: true,
  };
}

// ---------------------------------------------------------------------------
// 10. ALUMNI SEARCH & REALTIME
// ---------------------------------------------------------------------------
export async function searchAlumniForChat(query: string, myProfileId: number): Promise<ChatPerson[]> {
  const term = query.trim().replace(/[%_,()]/g, ' ').trim();
  if (term.length < 2) return [];

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('alumni_profiles')
        .select(ALUMNI_PUBLIC_COLUMNS)
        .ilike('full_name', `%${term}%`)
        .neq('id', myProfileId)
        .order('full_name', { ascending: true })
        .limit(20);

      if (!error && data) {
        return data.map(toChatPerson);
      }
    } catch {}
  }

  // Fallback to /api/alumni
  try {
    const resp = await fetch(`/api/alumni?search=${encodeURIComponent(term)}&limit=20`);
    if (resp.ok) {
      const json = await resp.json();
      if (Array.isArray(json.profiles)) {
        return json.profiles
          .filter((p: any) => p.id !== myProfileId)
          .map((p: any) => ({
            profileId: p.id,
            fullName: p.fullName || p.full_name || 'SZMC Alumnus',
            avatarUrl: p.avatarUrl || p.avatar_url || 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150',
            batchYear: p.batchYear || p.batch_year || 20,
            profession: p.profession || 'Physician',
          }));
      }
    }
  } catch {}

  return [];
}

// ---------------------------------------------------------------------------
// 11. SUPABASE REALTIME MESSAGE ENGINE (BROADCAST + POSTGRES_CHANGES + PRESENCE)
// ---------------------------------------------------------------------------

let sharedMessagesChannel: RealtimeChannel | null = null;
const messageListeners = new Set<(message: ChatMessage) => void>();
const typingListeners = new Set<(data: { conversationId: string; profileId: number; fullName: string }) => void>();
const realtimeStatusListeners = new Set<(status: 'SUBSCRIBED' | 'CONNECTING' | 'CLOSED' | 'OFFLINE') => void>();
let realtimeChannelStatus: 'SUBSCRIBED' | 'CONNECTING' | 'CLOSED' | 'OFFLINE' = isSupabaseConfigured ? 'CONNECTING' : 'OFFLINE';

export function getOrCreateMessagesChannel(): RealtimeChannel | null {
  if (!isSupabaseConfigured) {
    realtimeChannelStatus = 'OFFLINE';
    return null;
  }
  if (sharedMessagesChannel) return sharedMessagesChannel;

  try {
    sharedMessagesChannel = supabase.channel('messages-realtime-feed', {
      config: {
        broadcast: { self: false },
      },
    });

    sharedMessagesChannel
      // 1. Listen to database-level changes replicated via PostgreSQL
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload: any) => {
          if (payload.new && 'id' in payload.new) {
            const msg = toChatMessage(payload.new);
            messageListeners.forEach((fn) => {
              try { fn(msg); } catch (e) { console.warn('Message listener error:', e); }
            });
          } else if (payload.eventType === 'DELETE' && payload.old && 'id' in payload.old) {
            const msg: ChatMessage = {
              id: String(payload.old.id),
              conversationId: String(payload.old.conversation_id || ''),
              senderId: Number(payload.old.sender_id || 0),
              body: 'Message deleted',
              createdAt: new Date().toISOString(),
              editedAt: null,
              deletedAt: new Date().toISOString(),
            };
            messageListeners.forEach((fn) => {
              try { fn(msg); } catch (e) { console.warn('Message delete listener error:', e); }
            });
          }
        }
      )
      // 2. Listen to instant sub-50ms peer broadcasts
      .on('broadcast', { event: 'new_message' }, ({ payload }) => {
        if (payload && payload.id) {
          messageListeners.forEach((fn) => {
            try { fn(payload as ChatMessage); } catch (e) { console.warn('Broadcast listener error:', e); }
          });
        }
      })
      .on('broadcast', { event: 'edit_message' }, ({ payload }) => {
        if (payload && payload.id) {
          messageListeners.forEach((fn) => {
            try { fn(payload as ChatMessage); } catch (e) { console.warn('Broadcast edit error:', e); }
          });
        }
      })
      .on('broadcast', { event: 'delete_message' }, ({ payload }) => {
        if (payload && payload.id) {
          messageListeners.forEach((fn) => {
            try { fn(payload as ChatMessage); } catch (e) { console.warn('Broadcast delete error:', e); }
          });
        }
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload && payload.conversationId) {
          typingListeners.forEach((fn) => {
            try { fn(payload); } catch {}
          });
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          realtimeChannelStatus = 'SUBSCRIBED';
        } else if (status === 'TIMED_OUT' || status === 'CLOSED') {
          realtimeChannelStatus = 'CLOSED';
        } else {
          realtimeChannelStatus = 'CONNECTING';
        }
        realtimeStatusListeners.forEach((fn) => {
          try { fn(realtimeChannelStatus); } catch {}
        });
      });

    return sharedMessagesChannel;
  } catch (err) {
    console.warn('Failed to initialize Supabase Realtime channel:', err);
    return null;
  }
}

export function broadcastMessageEvent(
  event: 'new_message' | 'edit_message' | 'delete_message',
  message: ChatMessage
) {
  const channel = getOrCreateMessagesChannel();
  if (channel && isSupabaseConfigured) {
    try {
      void channel.send({
        type: 'broadcast',
        event,
        payload: message,
      });
    } catch (err) {
      console.warn('Realtime broadcast error:', err);
    }
  }
}

export function sendTypingIndicator(
  conversationId: string,
  profileId: number,
  fullName: string
) {
  const channel = getOrCreateMessagesChannel();
  if (channel && isSupabaseConfigured) {
    try {
      void channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { conversationId, profileId, fullName },
      });
    } catch {}
  }
}

export function subscribeToTypingStatus(
  onTyping: (data: { conversationId: string; profileId: number; fullName: string }) => void
): () => void {
  typingListeners.add(onTyping);
  getOrCreateMessagesChannel();
  return () => {
    typingListeners.delete(onTyping);
  };
}

export function subscribeToRealtimeConnectionStatus(
  onStatus: (status: 'SUBSCRIBED' | 'CONNECTING' | 'CLOSED' | 'OFFLINE') => void
): () => void {
  realtimeStatusListeners.add(onStatus);
  onStatus(realtimeChannelStatus);
  getOrCreateMessagesChannel();
  return () => {
    realtimeStatusListeners.delete(onStatus);
  };
}

export function getRealtimeChannelStatus(): 'SUBSCRIBED' | 'CONNECTING' | 'CLOSED' | 'OFFLINE' {
  return realtimeChannelStatus;
}

export function subscribeToMessageChanges(onChange: (message: ChatMessage) => void): () => void {
  messageListeners.add(onChange);
  getOrCreateMessagesChannel();

  return () => {
    messageListeners.delete(onChange);
  };
}
