import { supabase, ALUMNI_PUBLIC_COLUMNS } from '../lib/supabase';
import type { ChatConversation, ChatMessage, ChatPerson } from '../types/messaging';

const MESSAGE_COLUMNS = 'id, conversation_id, sender_id, body, created_at, edited_at, deleted_at';
const PREVIEW_LENGTH = 80;

function assertNoError(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`Could not ${action}: ${error.message}`);
}

function toChatPerson(row: any): ChatPerson {
  return {
    profileId: row.id,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    batchYear: row.batch_year,
    profession: row.profession,
  };
}

function toChatMessage(row: any): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at ?? null,
    deletedAt: row.deleted_at ?? null,
  };
}

function previewOf(message: ChatMessage): string {
  if (message.deletedAt) return 'Message deleted';
  return message.body.length > PREVIEW_LENGTH ? `${message.body.slice(0, PREVIEW_LENGTH)}...` : message.body;
}

export async function listConversations(myProfileId: number): Promise<ChatConversation[]> {
  const { data: mine, error: mineErr } = await supabase
    .from('conversation_participants')
    .select('conversation_id, last_read_at, is_muted')
    .eq('profile_id', myProfileId);
  assertNoError(mineErr, 'load your conversations');
  if (!mine || mine.length === 0) return [];

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
  assertNoError(convErr, 'load conversation details');
  assertNoError(othersErr, 'load conversation members');
  assertNoError(msgErr, 'load recent messages');

  const otherByConversation = new Map<string, number>();
  (others ?? []).forEach((row: any) => otherByConversation.set(row.conversation_id, row.profile_id));

  const otherIds = Array.from(new Set(otherByConversation.values()));
  const { data: profileRows, error: profileErr } = otherIds.length
    ? await supabase.from('alumni_profiles').select(ALUMNI_PUBLIC_COLUMNS).in('id', otherIds)
    : { data: [], error: null };
  assertNoError(profileErr, 'load alumni details');
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

export async function findOrCreateDirectConversation(myProfileId: number, otherProfileId: number): Promise<string> {
  const { data: mine, error: mineErr } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('profile_id', myProfileId);
  assertNoError(mineErr, 'check existing conversations');

  const myIds = (mine ?? []).map((row: any) => row.conversation_id as string);
  if (myIds.length > 0) {
    const { data: shared, error: sharedErr } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('profile_id', otherProfileId)
      .in('conversation_id', myIds)
      .limit(1);
    assertNoError(sharedErr, 'check existing conversations');
    if (shared && shared.length > 0) return shared[0].conversation_id as string;
  }

  const { data: created, error: createErr } = await supabase
    .from('conversations')
    .insert({ created_by: myProfileId })
    .select('id')
    .single();
  assertNoError(createErr, 'start this conversation');
  const conversationId = created.id as string;

  const { error: joinErr } = await supabase.from('conversation_participants').insert([
    { conversation_id: conversationId, profile_id: myProfileId },
    { conversation_id: conversationId, profile_id: otherProfileId },
  ]);
  assertNoError(joinErr, 'start this conversation');

  return conversationId;
}

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(500);
  assertNoError(error, 'load messages');
  return (data ?? []).map(toChatMessage);
}

export async function sendMessage(conversationId: string, senderId: number, body: string): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, body })
    .select(MESSAGE_COLUMNS)
    .single();
  assertNoError(error, 'send your message');
  return toChatMessage(data);
}

export async function editMessage(messageId: string, body: string): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from('messages')
    .update({ body, edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .select(MESSAGE_COLUMNS)
    .maybeSingle();
  assertNoError(error, 'edit your message');
  if (!data) throw new Error('Could not edit your message: it no longer exists.');
  return toChatMessage(data);
}

export async function deleteMessage(messageId: string): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)
    .select(MESSAGE_COLUMNS)
    .maybeSingle();
  assertNoError(error, 'delete your message');
  if (!data) throw new Error('Could not delete your message: it no longer exists.');
  return toChatMessage(data);
}

export async function markConversationRead(conversationId: string, myProfileId: number): Promise<void> {
  const { error } = await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('profile_id', myProfileId);
  assertNoError(error, 'update read status');
}

export async function setConversationMuted(conversationId: string, myProfileId: number, muted: boolean): Promise<void> {
  const { error } = await supabase
    .from('conversation_participants')
    .update({ is_muted: muted })
    .eq('conversation_id', conversationId)
    .eq('profile_id', myProfileId);
  assertNoError(error, 'update notification settings');
}

export async function leaveConversation(conversationId: string, myProfileId: number): Promise<void> {
  const { error } = await supabase
    .from('conversation_participants')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('profile_id', myProfileId);
  assertNoError(error, 'leave this conversation');
}

export async function searchAlumniForChat(query: string, myProfileId: number): Promise<ChatPerson[]> {
  const term = query.trim().replace(/[%_,()]/g, ' ').trim();
  if (term.length < 2) return [];
  const { data, error } = await supabase
    .from('alumni_profiles')
    .select(ALUMNI_PUBLIC_COLUMNS)
    .ilike('full_name', `%${term}%`)
    .neq('id', myProfileId)
    .order('full_name', { ascending: true })
    .limit(20);
  assertNoError(error, 'search alumni');
  return (data ?? []).map(toChatPerson);
}

export function subscribeToMessageChanges(onChange: (message: ChatMessage) => void): () => void {
  const channel = supabase
    .channel('messages-feed')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages' },
      (payload) => {
        if (payload.new && 'id' in payload.new) onChange(toChatMessage(payload.new));
      }
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
