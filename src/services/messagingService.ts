import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, ALUMNI_PUBLIC_COLUMNS, isSupabaseConfigured, SUPABASE_API_URL } from '../lib/supabase';
import type { ChatConversation, ChatMessage, ChatPerson, UserMessageSettings } from '../types/messaging';

/**
 * =============================================================================
 * SZMC ALUMNI — MESSAGING SERVICE (100% SUPABASE, NO EXPRESS BACKEND)
 * =============================================================================
 * Every read/write below goes straight to Postgres through the Supabase client:
 *
 *   public.conversations             (id, created_by, type, title, last_message,
 *                                     last_message_at, created_at, updated_at)
 *   public.conversation_participants (conversation_id, profile_id, joined_at,
 *                                     last_read_at, is_muted)
 *   public.messages                  (id, conversation_id, sender_id, type, body,
 *                                     media_url, edited_at, deleted_at, created_at)
 *   public.user_message_settings     (profile_id, who_can_message, …)
 *   public.profiles                  (id, user_id, full_name, avatar_url, batch …)
 *   public.alumni_profiles           (directory: full_name, batch_year, profession …)
 *
 * IMPORTANT IDENTITY RULE
 * -----------------------
 * `messages.sender_id` and `conversation_participants.profile_id` are FOREIGN KEYS
 * to `public.profiles(id)` — not to `public.alumni_profiles(id)`. The RLS policies
 * compare those columns against `public.get_current_profile_id()`, which returns the
 * `public.profiles.id` of `auth.uid()`. We therefore resolve the signed-in user's
 * messaging profile id at runtime (`getMessagingProfileId`) and always write with it.
 * Migration 013/014 bridges profiles ↔ alumni_profiles on matching ids, so they are
 * normally identical, but resolving avoids FK / RLS failures on legacy rows.
 *
 * No `/api/messages`, `/api/conversations` or any Express endpoint is called here.
 * Live updates come from Supabase Realtime `postgres_changes` (publication
 * `supabase_realtime`, enabled for these tables in migration 012/014) plus
 * low-latency `broadcast` events for typing indicators.
 * =============================================================================
 */

const MESSAGE_COLUMNS = 'id, conversation_id, sender_id, type, body, media_url, created_at, edited_at, deleted_at';
const CONVERSATION_COLUMNS = 'id, type, title, last_message, last_message_at, created_by, updated_at';
const PARTICIPANT_COLUMNS = 'conversation_id, profile_id, joined_at, last_read_at, is_muted';
const PROFILE_COLUMNS = 'id, user_id, full_name, avatar_url, batch, is_verified, last_seen_at';
const PREVIEW_LENGTH = 120;
const FALLBACK_AVATAR = '/ndc-logo.png';

// ---------------------------------------------------------------------------
// ERROR HANDLING
// ---------------------------------------------------------------------------
function describeError(error: any, fallback: string): string {
  if (!error) return fallback;
  const code = String(error.code || '');
  const message = String(error.message || error.error_description || '');

  if (code === '42P01' || /relation .* does not exist/i.test(message)) {
    return 'Messaging tables are missing in Supabase. Apply supabase/migrations/013_meta_messenger_production.sql then 016_messenger_client_direct.sql.';
  }
  if (code === '42P17' || /infinite recursion/i.test(message)) {
    return 'Supabase row-level security is misconfigured (recursive conversation_participants policy). Apply supabase/migrations/016_messenger_client_direct.sql.';
  }
  if (code === '42501' || /permission denied|row-level security/i.test(message)) {
    return 'Your account is not allowed to access this chat. Sign in again or verify your alumni profile.';
  }
  if (code === '23503' || /foreign key/i.test(message)) {
    return 'Your alumni profile is not linked to the messaging profiles table yet. Refresh and try again.';
  }
  if (code === 'PGRST301' || /jwt/i.test(message)) {
    return 'Your session expired. Please sign in again to continue messaging.';
  }
  return message || fallback;
}

export class MessagingError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'MessagingError';
    this.code = code;
  }
}

function throwMessagingError(error: any, fallback: string): never {
  throw new MessagingError(describeError(error, fallback), error?.code);
}

// ---------------------------------------------------------------------------
// MAPPERS
// ---------------------------------------------------------------------------
interface ProfileLite {
  id: number;
  user_id: string | null;
  full_name: string;
  avatar_url: string;
  batch: number | null;
  is_verified: boolean;
  last_seen_at?: string | null;
  profession?: string;
  batch_year?: number | null;
  verification_status?: string | null;
}

function toChatPerson(profile: ProfileLite | undefined, fallbackId: number): ChatPerson {
  if (!profile) {
    return {
      profileId: fallbackId,
      fullName: 'SZMC Alumnus',
      avatarUrl: FALLBACK_AVATAR,
      batchYear: 20,
      profession: 'Physician',
    };
  }
  return {
    profileId: Number(profile.id),
    fullName: profile.full_name || 'SZMC Alumnus',
    avatarUrl: profile.avatar_url || FALLBACK_AVATAR,
    batchYear: Number(profile.batch_year ?? profile.batch) || 20,
    profession: profile.profession || 'Physician',
    verificationStatus: profile.verification_status ?? (profile.is_verified ? 'verified' : 'unverified'),
  };
}

function toChatMessage(row: any): ChatMessage {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id ?? row.conversationId ?? ''),
    senderId: Number(row.sender_id ?? row.senderId ?? 0),
    body: typeof row.body === 'string' ? row.body : '',
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    editedAt: row.edited_at ?? row.editedAt ?? null,
    deletedAt: row.deleted_at ?? row.deletedAt ?? null,
    type: row.type || 'text',
    mediaUrl: row.media_url ?? row.mediaUrl ?? null,
  };
}

function previewOf(message: ChatMessage | undefined, fallbackText?: string | null): string {
  if (!message) {
    const text = (fallbackText || '').trim();
    if (!text) return '';
    return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text;
  }
  if (message.deletedAt) return 'Message deleted';
  if (message.type === 'image' || message.mediaUrl) {
    return message.body ? `📷 ${message.body}` : '📷 Photo';
  }
  if (message.body === '👍' || message.type === 'like') return '👍';
  return message.body.length > PREVIEW_LENGTH ? `${message.body.slice(0, PREVIEW_LENGTH)}…` : message.body;
}

// ---------------------------------------------------------------------------
// 0. MESSAGING IDENTITY (public.profiles.id of auth.uid())
// ---------------------------------------------------------------------------
let cachedMessagingProfileId: number | null = null;
let cachedAuthUserId: string | null = null;
let identityPromise: Promise<number | null> | null = null;
const identityListeners = new Set<(id: number | null) => void>();

function emitIdentity(id: number | null) {
  cachedMessagingProfileId = id;
  identityListeners.forEach((fn) => {
    try {
      fn(id);
    } catch {
      /* ignore listener errors */
    }
  });
}

export function subscribeToMessagingIdentityChanges(onChange: (id: number | null) => void): () => void {
  identityListeners.add(onChange);
  if (cachedMessagingProfileId !== null) onChange(cachedMessagingProfileId);
  return () => identityListeners.delete(onChange);
}

export function getCachedMessagingProfileId(): number | null {
  return cachedMessagingProfileId;
}

/**
 * Drops the memoised identity. Call on sign-out / sign-in / account switch so the
 * next query re-resolves public.profiles.id for the new Supabase session instead of
 * writing with the previous user's id.
 */
export function invalidateMessagingIdentity(): void {
  cachedAuthUserId = null;
  identityPromise = null;
  if (cachedMessagingProfileId !== null) emitIdentity(null);
}

/**
 * Ensures a public.profiles row exists for the signed-in user.
 *
 * `messages.sender_id` and `conversation_participants.profile_id` are FOREIGN KEYS to
 * public.profiles(id). Migration 013/014 only back-filled profiles once, so an alumnus
 * who registers afterwards has an alumni_profiles row but no profiles row — inserts
 * would fail with error 23503. The `profiles_insert_own` RLS policy allows the user to
 * create their own row, so we self-heal here (the SQL migration 016 also adds a trigger).
 */
async function ensureMessagingProfileRow(authUser: { id: string; email?: string }, alumniRow: any): Promise<number | null> {
  const base = {
    user_id: authUser.id,
    role: 'alumni',
    is_verified: false,
    batch: null as number | null,
    avatar_url: null as string | null,
    full_name: null as string | null,
  };

  if (alumniRow) {
    base.is_verified = alumniRow.verification_status === 'verified';
    base.batch = alumniRow.batch_year ?? null;
    base.avatar_url = alumniRow.avatar_url ?? null;
    base.full_name = alumniRow.full_name ?? null;
  }

  // Prefer mirroring the alumni id so profiles.id === alumni_profiles.id
  if (alumniRow?.id != null) {
    const { data: mirrored, error: mirrorErr } = await supabase
      .from('profiles')
      .insert({ ...base, id: Number(alumniRow.id) })
      .select('id')
      .single();
    const mirroredId = mirrorErr ? null : toProfileId(mirrored?.id);
    if (mirroredId != null) return mirroredId;
  }

  const { data: created, error: createErr } = await supabase
    .from('profiles')
    .insert(base)
    .select('id')
    .single();

  if (createErr || created?.id == null) return null;

  // profiles.id is BIGINT; guard against non-numeric ids so we never emit NaN as an
  // identity (which would become sender_id: NaN and fail every insert).
  const numericId = Number(created.id);
  return Number.isFinite(numericId) && numericId > 0 ? numericId : null;
}

/** Coerces a resolved id to a positive integer, or null when unusable. */
function toProfileId(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

/**
 * Resolves public.profiles.id for the currently authenticated user.
 * Falls back to public.alumni_profiles.id when the bridge row is absent.
 */
export async function getMessagingProfileId(): Promise<number | null> {
  if (!isSupabaseConfigured) return null;

  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData?.user ?? null;

  if (!authUser) {
    cachedAuthUserId = null;
    if (cachedMessagingProfileId !== null) emitIdentity(null);
    return null;
  }

  if (cachedAuthUserId === authUser.id && cachedMessagingProfileId !== null) {
    return cachedMessagingProfileId;
  }
  if (identityPromise && cachedAuthUserId === authUser.id) return identityPromise;

  cachedAuthUserId = authUser.id;
  identityPromise = (async () => {
    try {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', authUser.id)
        .maybeSingle();

      const directId = toProfileId(profileRow?.id);
      if (directId != null) {
        emitIdentity(directId);
        return directId;
      }

      const { data: alumniRow } = await supabase
        .from('alumni_profiles')
        .select('id, full_name, avatar_url, batch_year, verification_status')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();

      // Self-heal the profiles bridge row so foreign keys resolve.
      const healedId = await ensureMessagingProfileRow(authUser, alumniRow);
      if (healedId != null) {
        emitIdentity(healedId);
        return healedId;
      }

      const alumniId = toProfileId(alumniRow?.id);
      if (alumniId != null) {
        emitIdentity(alumniId);
        return alumniId;
      }

      emitIdentity(null);
      return null;
    } catch {
      emitIdentity(null);
      return null;
    } finally {
      identityPromise = null;
    }
  })();

  return identityPromise;
}

/** Prefers the signed-in user's authoritative messaging id; falls back to the supplied id. */
async function resolveSelfProfileId(fallbackId?: number | null): Promise<number> {
  const resolved = await getMessagingProfileId();
  const id = toProfileId(resolved) ?? toProfileId(fallbackId);
  if (id == null) throw new MessagingError('You must be signed in to use Messenger.');
  return id;
}

/**
 * Resolves an app-level profile id (alumni_profiles.id) into the messaging id
 * (public.profiles.id) by walking the auth_user_id bridge when ids differ.
 */
async function resolveTargetProfileId(inputId: number): Promise<number> {
  const id = Number(inputId);
  if (!id) throw new MessagingError('A valid recipient is required.');

  const { data: direct } = await supabase.from('profiles').select('id').eq('id', id).maybeSingle();
  const directId = toProfileId(direct?.id);
  if (directId != null) return directId;

  const { data: alumni } = await supabase
    .from('alumni_profiles')
    .select('id, auth_user_id')
    .eq('id', id)
    .maybeSingle();

  if (alumni?.auth_user_id) {
    const { data: bridged } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', alumni.auth_user_id)
      .maybeSingle();
    const bridgedId = toProfileId(bridged?.id);
    if (bridgedId != null) return bridgedId;
  }

  // Let Postgres validate (FK/RLS will surface a precise error if truly missing).
  return id;
}

/** Batch-loads display data for messaging profile ids (profiles + alumni_profiles). */
async function loadPeople(profileIds: number[]): Promise<Map<number, ProfileLite>> {
  const people = new Map<number, ProfileLite>();
  const unique = Array.from(new Set(profileIds.filter((id) => Number.isFinite(id) && id > 0)));
  if (unique.length === 0) return people;

  const { data: profileRows, error: profileErr } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .in('id', unique);

  const authIds: string[] = [];
  (profileRows ?? []).forEach((row: any) => {
    if (row.user_id) authIds.push(String(row.user_id));
    people.set(Number(row.id), {
      id: Number(row.id),
      user_id: row.user_id ?? null,
      full_name: row.full_name || '',
      avatar_url: row.avatar_url || '',
      batch: row.batch ?? null,
      is_verified: Boolean(row.is_verified),
      last_seen_at: row.last_seen_at ?? null,
    });
  });

  // Enrich with the alumni directory (profession, batch_year, verification_status).
  // Sensitive columns are never requested — ALUMNI_PUBLIC_COLUMNS only.
  try {
    const query = supabase.from('alumni_profiles').select(ALUMNI_PUBLIC_COLUMNS).in('id', unique);
    const { data: alumniRows } = unique.length ? await query : { data: [] as any[] };
    (alumniRows ?? []).forEach((row: any) => {
      const existing = people.get(Number(row.id));
      people.set(Number(row.id), {
        id: Number(row.id),
        user_id: existing?.user_id ?? row.auth_user_id ?? null,
        full_name: existing?.full_name || row.full_name || '',
        avatar_url: existing?.avatar_url || row.avatar_url || '',
        batch: existing?.batch ?? row.batch_year ?? null,
        is_verified: existing?.is_verified ?? row.verification_status === 'verified',
        last_seen_at: existing?.last_seen_at ?? row.last_seen_at ?? null,
        profession: row.profession || existing?.profession,
        batch_year: row.batch_year ?? existing?.batch_year ?? null,
        verification_status: row.verification_status ?? existing?.verification_status ?? null,
      });
    });

    // Second pass for rows whose ids differ but auth_user_id matches.
    if (authIds.length && !profileErr) {
      const { data: alumniByAuth } = await supabase
        .from('alumni_profiles')
        .select(ALUMNI_PUBLIC_COLUMNS)
        .in('auth_user_id', authIds);
      (alumniByAuth ?? []).forEach((row: any) => {
        people.forEach((person, key) => {
          if (person.user_id && person.user_id === row.auth_user_id) {
            people.set(key, {
              ...person,
              full_name: person.full_name || row.full_name || '',
              avatar_url: person.avatar_url || row.avatar_url || '',
              batch: person.batch ?? row.batch_year ?? null,
              is_verified: person.is_verified || row.verification_status === 'verified',
              profession: person.profession || row.profession,
              batch_year: person.batch_year ?? row.batch_year ?? null,
              verification_status: person.verification_status ?? row.verification_status ?? null,
            });
          }
        });
      });
    }
  } catch {
    /* directory enrichment is best-effort */
  }

  return people;
}

// ---------------------------------------------------------------------------
// 1. LIST CONVERSATIONS — public.conversations ⋈ conversation_participants ⋈ messages
// ---------------------------------------------------------------------------
export async function listConversations(myProfileId?: number | null): Promise<ChatConversation[]> {
  if (!isSupabaseConfigured) {
    throw new MessagingError('Supabase is not configured. Messenger requires a live Supabase project.');
  }

  const myId = await resolveSelfProfileId(myProfileId);

  // 1a. My memberships
  const { data: mine, error: mineErr } = await supabase
    .from('conversation_participants')
    .select(PARTICIPANT_COLUMNS)
    .eq('profile_id', myId);

  if (mineErr) throwMessagingError(mineErr, 'Could not load your conversations.');
  if (!mine || mine.length === 0) return [];

  const myParticipantByConv = new Map<string, any>();
  mine.forEach((row: any) => myParticipantByConv.set(String(row.conversation_id), row));
  const conversationIds = Array.from(myParticipantByConv.keys());

  // 1b. Conversations + all participants + recent messages in parallel
  const [convRes, participantRes, latestMsgRes] = await Promise.all([
    supabase.from('conversations').select(CONVERSATION_COLUMNS).in('id', conversationIds),
    supabase
      .from('conversation_participants')
      .select(PARTICIPANT_COLUMNS)
      .in('conversation_id', conversationIds),
    supabase
      .from('messages')
      .select(MESSAGE_COLUMNS)
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })
      .limit(400),
  ]);

  if (convRes.error) throwMessagingError(convRes.error, 'Could not load your conversations.');
  if (participantRes.error) {
    throwMessagingError(participantRes.error, 'Could not load conversation participants.');
  }

  const conversationRows = convRes.data ?? [];
  const participantRows = participantRes.data ?? [];

  // 1c. Other participants (direct chats) and unread counters
  const otherByConversation = new Map<string, number>();
  participantRows.forEach((row: any) => {
    if (Number(row.profile_id) !== myId) {
      otherByConversation.set(String(row.conversation_id), Number(row.profile_id));
    }
  });

  const latestByConversation = new Map<string, ChatMessage>();
  (latestMsgRes.data ?? []).forEach((row: any) => {
    const message = toChatMessage(row);
    if (!latestByConversation.has(message.conversationId)) {
      latestByConversation.set(message.conversationId, message);
    }
  });

  // Unread messages: sent by others, not deleted, newer than my last_read_at
  const readMarkers = mine
    .map((row: any) => row.last_read_at)
    .filter(Boolean)
    .sort();
  const unreadByConversation = new Map<string, number>();
  if (readMarkers.length > 0) {
    const { data: unreadRows } = await supabase
      .from('messages')
      .select('id, conversation_id, created_at, sender_id, deleted_at')
      .in('conversation_id', conversationIds)
      .neq('sender_id', myId)
      .is('deleted_at', null)
      .gte('created_at', readMarkers[0])
      .order('created_at', { ascending: true })
      .limit(1000);

    (unreadRows ?? []).forEach((row: any) => {
      const lastRead = myParticipantByConv.get(String(row.conversation_id))?.last_read_at;
      if (lastRead && row.created_at > lastRead) {
        const key = String(row.conversation_id);
        unreadByConversation.set(key, (unreadByConversation.get(key) ?? 0) + 1);
      }
    });
  }

  // 1d. Display data for the counterpart participants
  const others = Array.from(new Set(Array.from(otherByConversation.values())));
  const people = await loadPeople(others);

  const conversations: ChatConversation[] = [];
  conversationRows.forEach((conv: any) => {
    const convId = String(conv.id);
    const participant = myParticipantByConv.get(convId);
    const otherId = otherByConversation.get(convId);
    const latest = latestByConversation.get(convId);
    const isGroup = conv.type === 'group' || conv.type === 'announcement';

    if (isGroup) {
      conversations.push({
        id: convId,
        person: {
          profileId: Number(otherId ?? myId),
          fullName: conv.title || (conv.type === 'announcement' ? 'Official Announcements' : 'Group chat'),
          avatarUrl: FALLBACK_AVATAR,
          batchYear: 20,
          profession: conv.type === 'announcement' ? 'SZMC Alumni Network' : 'Group conversation',
        },
        lastMessageAt: latest?.createdAt ?? conv.last_message_at,
        lastMessagePreview: previewOf(latest, conv.last_message),
        lastMessageFromMe: latest?.senderId === myId,
        unreadCount: unreadByConversation.get(convId) ?? 0,
        isMuted: Boolean(participant?.is_muted),
        type: conv.type,
        title: conv.title ?? null,
      });
      return;
    }

    const person = toChatPerson(otherId !== undefined ? people.get(otherId) : undefined, otherId ?? 0);
    conversations.push({
      id: convId,
      person,
      lastMessageAt: latest?.createdAt ?? conv.last_message_at ?? conv.updated_at ?? new Date().toISOString(),
      lastMessagePreview: previewOf(latest, conv.last_message),
      lastMessageFromMe: latest?.senderId === myId,
      unreadCount: unreadByConversation.get(convId) ?? 0,
      isMuted: Boolean(participant?.is_muted),
      type: conv.type || 'direct',
      title: conv.title ?? null,
    });
  });

  return conversations.sort((a, b) =>
    a.lastMessageAt < b.lastMessageAt ? 1 : a.lastMessageAt > b.lastMessageAt ? -1 : 0
  );
}

// ---------------------------------------------------------------------------
// 2. FIND OR CREATE DIRECT CONVERSATION
//    Preferred path: RPC public.start_direct_conversation(target_profile_id)
//    (idempotent + enforces who_can_message privacy). Falls back to direct
//    inserts allowed by the RLS policies in migration 014.
// ---------------------------------------------------------------------------
export async function findOrCreateDirectConversation(
  myProfileId: number,
  otherProfileId: number
): Promise<string> {
  if (!isSupabaseConfigured) {
    throw new MessagingError('Supabase is not configured. Messenger requires a live Supabase project.');
  }

  const myId = await resolveSelfProfileId(myProfileId);
  const targetId = await resolveTargetProfileId(otherProfileId);

  if (myId === targetId) {
    throw new MessagingError('You cannot start a direct conversation with yourself.');
  }

  // 2a. Idempotent lookup first — never create a duplicate thread.
  const { data: myRows } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('profile_id', myId);

  const myConversationIds = (myRows ?? []).map((row: any) => String(row.conversation_id));
  if (myConversationIds.length > 0) {
    const { data: shared } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('profile_id', targetId)
      .in('conversation_id', myConversationIds);

    if (shared && shared.length > 0) {
      const candidateIds = shared.map((row: any) => String(row.conversation_id));
      const { data: directConvs } = await supabase
        .from('conversations')
        .select('id, type')
        .in('id', candidateIds)
        .eq('type', 'direct')
        .limit(1);
      if (directConvs && directConvs.length > 0) return String(directConvs[0].id);
    }
  }

  // 2b. Postgres RPC (privacy-aware, SECURITY DEFINER, atomic).
  //     Only fall back to direct inserts when the function itself is unavailable
  //     (missing / not granted). A business-rule rejection must be surfaced, never
  //     bypassed — otherwise a privacy-blocked chat would be created anyway.
  const { data: rpcId, error: rpcErr } = await supabase.rpc('start_direct_conversation', {
    target_profile_id: targetId,
  });

  if (!rpcErr && rpcId) return String(rpcId);

  if (rpcErr) {
    const msg = rpcErr.message || '';
    const code = String((rpcErr as any).code || '');
    const isBusinessRule = /Privacy Restriction|Cannot start|not found|does not exist in public\.profiles/i.test(msg);
    const functionUnavailable =
      !isBusinessRule &&
      (code === 'PGRST202' || // function missing from the schema cache
        code === '42883' || // undefined_function
        code === '42501' || // permission denied for function
        /could not find the function|permission denied/i.test(msg));

    if (!functionUnavailable) {
      // Privacy restriction, self-chat, unknown target → report it to the user.
      throw new MessagingError(msg || 'Could not start this conversation.', code);
    }
  }

  // 2c. Direct inserts (RLS: created_by must equal my profile id)
  const { data: created, error: createErr } = await supabase
    .from('conversations')
    .insert({ created_by: myId, type: 'direct', last_message_at: new Date().toISOString() })
    .select('id')
    .single();

  if (createErr || !created?.id) {
    throwMessagingError(createErr, 'Could not start this conversation. Please try again.');
  }

  const conversationId = String(created.id);
  const now = new Date().toISOString();
  const { error: participantErr } = await supabase.from('conversation_participants').insert([
    { conversation_id: conversationId, profile_id: myId, last_read_at: now, is_muted: false },
    { conversation_id: conversationId, profile_id: targetId, last_read_at: now, is_muted: false },
  ]);

  if (participantErr) {
    throwMessagingError(participantErr, 'Conversation created, but participants could not be added.');
  }

  return conversationId;
}

// ---------------------------------------------------------------------------
// 3. LIST MESSAGES — public.messages by conversation_id, oldest → newest
// ---------------------------------------------------------------------------
export async function listMessages(conversationId: string, limit = 300): Promise<ChatMessage[]> {
  if (!conversationId) return [];
  if (!isSupabaseConfigured) {
    throw new MessagingError('Supabase is not configured. Messenger requires a live Supabase project.');
  }

  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throwMessagingError(error, 'Could not load this conversation.');
  return (data ?? []).map(toChatMessage).reverse();
}

// ---------------------------------------------------------------------------
// 4. SEND MESSAGE — inserts into public.messages
// ---------------------------------------------------------------------------
export interface SendMessageOptions {
  /** 'text' | 'like' | 'image' | 'system' */
  type?: 'text' | 'like' | 'image' | 'system';
  /** Public URL (or data URL fallback) for image messages → messages.media_url */
  mediaUrl?: string | null;
}

export async function sendMessage(
  conversationId: string,
  senderId: number,
  body: string,
  options: SendMessageOptions = {}
): Promise<ChatMessage> {
  const cleanBody = (body ?? '').trim();
  if (!conversationId) throw new MessagingError('Select a conversation before sending.');
  if (!cleanBody && !options.mediaUrl) throw new MessagingError('Message cannot be empty.');
  if (!isSupabaseConfigured) {
    throw new MessagingError('Supabase is not configured. Messenger requires a live Supabase project.');
  }

  const authorId = await resolveSelfProfileId(senderId);
  const resolvedType = options.type ?? (cleanBody === '👍' && !options.mediaUrl ? 'like' : options.mediaUrl ? 'image' : 'text');

  const payload: Record<string, any> = {
    conversation_id: conversationId,
    sender_id: authorId,
    type: resolvedType,
    body: cleanBody || (resolvedType === 'image' ? 'Photo' : ''),
  };
  if (options.mediaUrl) payload.media_url = options.mediaUrl;

  const { data, error } = await supabase.from('messages').insert(payload).select(MESSAGE_COLUMNS).single();

  if (error) {
    // If the optional media/type columns are unavailable, retry with the core payload.
    if (/column .* does not exist/i.test(error.message || '')) {
      const { data: retry, error: retryErr } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, sender_id: authorId, body: payload.body })
        .select('id, conversation_id, sender_id, body, created_at, edited_at, deleted_at')
        .single();
      if (retryErr || !retry) throwMessagingError(retryErr, 'Could not send message. Please try again.');
      return toChatMessage(retry);
    }
    throwMessagingError(error, 'Could not send message. Please try again.');
  }

  const message = toChatMessage(data);
  broadcastMessageEvent('new_message', message);
  return message;
}

// ---------------------------------------------------------------------------
// 5. EDIT MESSAGE — columns body + edited_at (only granted columns)
// ---------------------------------------------------------------------------
export async function editMessage(messageId: string, body: string): Promise<ChatMessage> {
  const cleanBody = (body ?? '').trim();
  if (!cleanBody) throw new MessagingError('Message cannot be empty.');

  const { data, error } = await supabase
    .from('messages')
    .update({ body: cleanBody, edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .select(MESSAGE_COLUMNS)
    .maybeSingle();

  if (error || !data) throwMessagingError(error, 'Could not edit this message.');

  const message = toChatMessage(data);
  broadcastMessageEvent('edit_message', message);
  return message;
}

// ---------------------------------------------------------------------------
// 6. DELETE MESSAGE — soft delete via deleted_at
// ---------------------------------------------------------------------------
export async function deleteMessage(messageId: string): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)
    .select(MESSAGE_COLUMNS)
    .maybeSingle();

  if (error || !data) throwMessagingError(error, 'Could not delete this message.');

  const message = toChatMessage(data);
  broadcastMessageEvent('delete_message', message);
  return message;
}

// ---------------------------------------------------------------------------
// 7. READ / MUTE / LEAVE — conversation_participants
// ---------------------------------------------------------------------------
export async function markConversationRead(conversationId: string, myProfileId?: number | null): Promise<void> {
  try {
    const myId = await resolveSelfProfileId(myProfileId);
    await supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('profile_id', myId);
  } catch {
    /* read markers are non-critical */
  }
}

export async function setConversationMuted(
  conversationId: string,
  myProfileId: number,
  muted: boolean
): Promise<void> {
  const myId = await resolveSelfProfileId(myProfileId);
  const { error } = await supabase
    .from('conversation_participants')
    .update({ is_muted: muted })
    .eq('conversation_id', conversationId)
    .eq('profile_id', myId);
  if (error) throwMessagingError(error, 'Could not update notifications for this chat.');
}

export async function leaveConversation(conversationId: string, myProfileId: number): Promise<void> {
  const myId = await resolveSelfProfileId(myProfileId);
  const { error } = await supabase
    .from('conversation_participants')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('profile_id', myId);
  if (error) throwMessagingError(error, 'Could not leave this conversation.');
}

// ---------------------------------------------------------------------------
// 8. USER MESSAGE SETTINGS — public.user_message_settings (localStorage cache)
// ---------------------------------------------------------------------------
const DEFAULT_USER_MESSAGE_SETTINGS: UserMessageSettings = {
  profileId: 1,
  whoCanMessage: 'everyone',
  readReceiptsEnabled: true,
  soundEnabled: true,
  notificationPreviewEnabled: true,
  emailNotificationDigest: false,
};

function settingsFromRow(row: any): UserMessageSettings {
  return {
    profileId: Number(row.profile_id),
    whoCanMessage: (row.who_can_message || 'everyone') as UserMessageSettings['whoCanMessage'],
    readReceiptsEnabled: row.read_receipts_enabled ?? true,
    soundEnabled: row.sound_enabled ?? true,
    notificationPreviewEnabled: row.notification_preview_enabled ?? true,
    emailNotificationDigest: row.email_notification_digest ?? false,
    updatedAt: row.updated_at,
  };
}

export async function getUserMessageSettings(profileId: number): Promise<UserMessageSettings> {
  const myId = await resolveSelfProfileId(profileId).catch(() => Number(profileId));
  const cacheKey = `szmc_msg_settings_${myId}`;

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('user_message_settings')
        .select(
          'profile_id, who_can_message, read_receipts_enabled, sound_enabled, notification_preview_enabled, email_notification_digest, updated_at'
        )
        .eq('profile_id', myId)
        .maybeSingle();

      if (!error && data) {
        const settings = settingsFromRow(data);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(settings));
        } catch {}
        return settings;
      }
    } catch {}
  }

  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) return JSON.parse(raw) as UserMessageSettings;
  } catch {}

  return { ...DEFAULT_USER_MESSAGE_SETTINGS, profileId: myId };
}

export async function updateUserMessageSettings(
  profileId: number,
  updates: Partial<UserMessageSettings>
): Promise<UserMessageSettings> {
  const myId = await resolveSelfProfileId(profileId).catch(() => Number(profileId));
  const current = await getUserMessageSettings(myId);
  const next: UserMessageSettings = {
    ...current,
    ...updates,
    profileId: myId,
    updatedAt: new Date().toISOString(),
  };

  if (!isSupabaseConfigured) {
    try {
      localStorage.setItem(`szmc_msg_settings_${myId}`, JSON.stringify(next));
    } catch {}
    return next;
  }

  const { error } = await supabase.from('user_message_settings').upsert(
    {
      profile_id: myId,
      who_can_message: next.whoCanMessage,
      read_receipts_enabled: next.readReceiptsEnabled,
      sound_enabled: next.soundEnabled,
      notification_preview_enabled: next.notificationPreviewEnabled,
      email_notification_digest: next.emailNotificationDigest,
      updated_at: next.updatedAt,
    },
    { onConflict: 'profile_id' }
  );

  if (error) throwMessagingError(error, 'Could not save your message settings.');

  try {
    localStorage.setItem(`szmc_msg_settings_${myId}`, JSON.stringify(next));
  } catch {}

  return next;
}

// ---------------------------------------------------------------------------
// 9. CONNECTION STATUS — probed directly against Supabase (no /api/messages/status)
// ---------------------------------------------------------------------------
export interface MessagingHealthIssue {
  code:
    | 'not_configured'
    | 'no_session'
    | 'missing_tables'
    | 'rls_recursion'
    | 'permission_denied'
    | 'no_profile_row'
    | 'realtime_not_published'
    | 'ok';
  severity: 'ok' | 'warning' | 'error';
  title: string;
  detail: string;
  /** SQL migration that fixes this, when there is one. */
  fix?: string;
}

export interface MessagingHealth {
  connected: boolean;
  supabaseUrl: string;
  tablesOnline: boolean;
  storageFallbackActive: boolean;
  realtimeEnabled: boolean;
  profileId: number | null;
  issues: MessagingHealthIssue[];
  /** Ready to read/write messages. */
  healthy: boolean;
}

/**
 * Diagnoses the exact reason Messenger cannot talk to Supabase.
 *
 * Every probe is a single cheap round-trip, and each failure is mapped to the known
 * root cause (missing tables, recursive RLS policy, missing profiles bridge row,
 * realtime publication) so the UI can tell the user precisely what to fix instead of
 * showing an opaque "could not load conversations".
 */
export async function checkMessagingHealth(): Promise<MessagingHealth> {
  const supabaseUrl = SUPABASE_API_URL || 'https://hjuyiqyviohinbhzaipl.supabase.co';
  const issues: MessagingHealthIssue[] = [];

  if (!isSupabaseConfigured) {
    return {
      connected: false,
      supabaseUrl,
      tablesOnline: false,
      storageFallbackActive: true,
      realtimeEnabled: false,
      profileId: null,
      healthy: false,
      issues: [
        {
          code: 'not_configured',
          severity: 'error',
          title: 'Supabase is not configured',
          detail: 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for this build.',
        },
      ],
    };
  }

  // 1. Session
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    issues.push({
      code: 'no_session',
      severity: 'error',
      title: 'Not signed in',
      detail: 'Messenger needs an authenticated Supabase session. Sign in and reopen Messenger.',
    });
  }

  // 2. Tables reachable? Probe each one so we can report the real culprit.
  const probes = await Promise.all([
    supabase.from('conversations').select('id').limit(1),
    supabase.from('conversation_participants').select('conversation_id').limit(1),
    supabase.from('messages').select('id').limit(1),
    supabase.from('profiles').select('id').limit(1),
    supabase.from('user_message_settings').select('profile_id').limit(1),
  ]);
  const [convProbe, partProbe, msgProbe, profileProbe, settingsProbe] = probes;

  const messagesTableOnline = !msgProbe.error && !convProbe.error;

  const missing = [
    ['conversations', convProbe.error],
    ['conversation_participants', partProbe.error],
    ['messages', msgProbe.error],
    ['profiles', profileProbe.error],
    ['user_message_settings', settingsProbe.error],
  ].filter(([, err]: any) => err && (err.code === '42P01' || /does not exist/i.test(err.message || '')));

  if (missing.length > 0) {
    issues.push({
      code: 'missing_tables',
      severity: 'error',
      title: 'Messaging tables are missing',
      detail: `Supabase reports these tables do not exist: ${missing.map(([t]) => t).join(', ')}.`,
      fix: 'supabase/migrations/013_meta_messenger_production.sql then 016_messenger_client_direct.sql',
    });
  }

  // 3. RLS recursion — the classic 42P17 on conversation_participants.
  const rlsError = [partProbe.error, msgProbe.error, convProbe.error].find(
    (err: any) => err && (err.code === '42P17' || /infinite recursion/i.test(err.message || ''))
  );
  if (rlsError) {
    issues.push({
      code: 'rls_recursion',
      severity: 'error',
      title: 'Row-level security recursion',
      detail: `Postgres rejected the query: "${rlsError.message}". The conversation_participants policy queries its own table.`,
      fix: 'supabase/migrations/016_messenger_client_direct.sql',
    });
  } else {
    const denied = [partProbe.error, msgProbe.error, convProbe.error].find(
      (err: any) => err && (err.code === '42501' || /permission denied/i.test(err.message || ''))
    );
    if (denied) {
      issues.push({
        code: 'permission_denied',
        severity: 'error',
        title: 'Permission denied',
        detail: `Postgres refused the request: "${denied.message}". The authenticated role is missing a GRANT.`,
        fix: 'supabase/migrations/016_messenger_client_direct.sql',
      });
    }
  }

  // 4. profiles bridge row (needed as the FK target for sender_id)
  let profileId: number | null = null;
  if (authData?.user) {
    profileId = await getMessagingProfileId();
    if (profileId == null && !missing.some(([t]) => t === 'profiles')) {
      issues.push({
        code: 'no_profile_row',
        severity: 'error',
        title: 'Alumni profile is not linked',
        detail:
          'No public.profiles row could be found or created for your account, so messages cannot be attributed to you.',
        fix: 'supabase/migrations/016_messenger_client_direct.sql',
      });
    }
  }

  // 5. Realtime — cannot be probed with a read; report the channel state.
  const realtimeEnabled = getRealtimeChannelStatus() !== 'OFFLINE';
  if (realtimeEnabled && getRealtimeChannelStatus() === 'CLOSED') {
    issues.push({
      code: 'realtime_not_published',
      severity: 'warning',
      title: 'Realtime channel closed',
      detail:
        'Live updates are unavailable. Ensure the messaging tables are in the supabase_realtime publication.',
      fix: 'supabase/migrations/016_messenger_client_direct.sql',
    });
  }

  const tablesOnline = messagesTableOnline && missing.length === 0 && !rlsError;
  const healthy =
    Boolean(authData?.user) &&
    tablesOnline &&
    issues.every((issue) => issue.code === 'realtime_not_published');

  if (healthy) {
    issues.unshift({
      code: 'ok',
      severity: 'ok',
      title: 'Connected',
      detail: 'Messaging tables, identity and realtime are all reachable.',
    });
  }

  return {
    connected: true,
    supabaseUrl,
    tablesOnline,
    storageFallbackActive: !tablesOnline,
    realtimeEnabled,
    profileId,
    issues,
    healthy,
  };
}

/** @deprecated Use checkMessagingHealth() — kept for the settings modal. */
export async function getMessagingConnectionStatus() {
  const health = await checkMessagingHealth();
  return {
    connected: health.connected,
    supabaseUrl: health.supabaseUrl,
    tablesOnline: health.tablesOnline,
    storageFallbackActive: health.storageFallbackActive,
    realtimeEnabled: health.realtimeEnabled,
  };
}

// ---------------------------------------------------------------------------
// 10. ALUMNI SEARCH — direct public.alumni_profiles query
// ---------------------------------------------------------------------------
export async function searchAlumniForChat(query: string, myProfileId?: number | null): Promise<ChatPerson[]> {
  const term = (query || '').trim().replace(/[%_,()]/g, ' ').trim();
  if (term.length < 2) return [];

  const myId = (await getMessagingProfileId()) ?? myProfileId ?? null;

  const { data, error } = await supabase
    .from('alumni_profiles')
    .select(ALUMNI_PUBLIC_COLUMNS)
    .or(`full_name.ilike.%${term}%,profession.ilike.%${term}%,institution.ilike.%${term}%`)
    .order('full_name', { ascending: true })
    .limit(25);

  if (error) throwMessagingError(error, 'Search is temporarily unavailable.');

  return (data ?? [])
    .filter((row: any) => Number(row.id) !== Number(myId))
    .map((row: any) =>
      toChatPerson(
        {
          id: Number(row.id),
          user_id: row.auth_user_id ?? null,
          full_name: row.full_name || '',
          avatar_url: row.avatar_url || '',
          batch: row.batch_year ?? null,
          is_verified: row.verification_status === 'verified',
          profession: row.profession,
          batch_year: row.batch_year,
          verification_status: row.verification_status,
        },
        Number(row.id)
      )
    );
}

// ---------------------------------------------------------------------------
// 11. SUPABASE REALTIME — postgres_changes (database) + broadcast (typing)
// ---------------------------------------------------------------------------
export type MessagingRealtimeStatus = 'SUBSCRIBED' | 'CONNECTING' | 'CLOSED' | 'OFFLINE';

let sharedMessagesChannel: RealtimeChannel | null = null;
const messageListeners = new Set<(message: ChatMessage) => void>();
const conversationListeners = new Set<() => void>();
const typingListeners = new Set<(data: { conversationId: string; profileId: number; fullName: string }) => void>();
const realtimeStatusListeners = new Set<(status: MessagingRealtimeStatus) => void>();
let realtimeChannelStatus: MessagingRealtimeStatus = isSupabaseConfigured ? 'CONNECTING' : 'OFFLINE';
const seenMessageSignatures = new Map<string, number>();

function setRealtimeStatus(status: MessagingRealtimeStatus) {
  realtimeChannelStatus = status;
  realtimeStatusListeners.forEach((fn) => {
    try {
      fn(status);
    } catch {}
  });
}

function emitMessage(message: ChatMessage, source: 'postgres' | 'broadcast') {
  // postgres_changes and the peer broadcast can deliver the same row → dedupe briefly.
  const signature = `${message.id}:${message.editedAt ?? ''}:${message.deletedAt ?? ''}`;
  const now = Date.now();
  const previous = seenMessageSignatures.get(signature);
  if (previous && now - previous < 4000) return;
  seenMessageSignatures.set(signature, now);
  if (seenMessageSignatures.size > 500) {
    for (const [key, ts] of seenMessageSignatures) {
      if (now - ts > 30000) seenMessageSignatures.delete(key);
    }
  }

  messageListeners.forEach((fn) => {
    try {
      fn(message);
    } catch (err) {
      console.warn(`Message listener error (${source}):`, err);
    }
  });
}

/**
 * Shared Realtime channel.
 *  • postgres_changes on public.messages                → inserts, edits, soft deletes
 *  • postgres_changes on public.conversation_participants → new chats / read markers
 *  • broadcast 'typing'                                  → typing indicators
 * Supabase applies RLS to postgres_changes, so only rows the signed-in user may
 * read are delivered.
 */
export function getOrCreateMessagesChannel(): RealtimeChannel | null {
  if (!isSupabaseConfigured) {
    setRealtimeStatus('OFFLINE');
    return null;
  }
  if (sharedMessagesChannel) return sharedMessagesChannel;

  try {
    setRealtimeStatus('CONNECTING');

    sharedMessagesChannel = supabase.channel('messages-realtime-feed', {
      config: {
        // self: false → the sender's own broadcast is ignored; their row arrives
        // through postgres_changes so the UI never double-renders a message.
        broadcast: { self: false },
      },
    });

    sharedMessagesChannel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload: any) => {
          if (payload.eventType === 'DELETE') {
            const old = payload.old || {};
            if (!old.id) return;
            emitMessage(
              {
                id: String(old.id),
                conversationId: String(old.conversation_id || ''),
                senderId: Number(old.sender_id || 0),
                body: 'Message deleted',
                createdAt: old.created_at || new Date().toISOString(),
                editedAt: null,
                deletedAt: new Date().toISOString(),
                type: 'text',
                mediaUrl: null,
              },
              'postgres'
            );
            return;
          }
          if (!payload.new?.id) return;
          emitMessage(toChatMessage(payload.new), 'postgres');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_participants' },
        () => {
          // Membership changes (someone starts a chat, joins or leaves) → refresh the
          // inbox. This is NOT a message event: emitting one would blank previews and
          // inflate unread badges, so it goes through its own listener set.
          conversationListeners.forEach((fn) => {
            try {
              fn();
            } catch (err) {
              console.warn('Conversation listener error:', err);
            }
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        () => {
          // last_message / last_message_at changed (set by the messages trigger).
          conversationListeners.forEach((fn) => {
            try {
              fn();
            } catch {}
          });
        }
      )
      .on('broadcast', { event: 'new_message' }, ({ payload }) => {
        if (payload?.id) emitMessage(payload as ChatMessage, 'broadcast');
      })
      .on('broadcast', { event: 'edit_message' }, ({ payload }) => {
        if (payload?.id) emitMessage(payload as ChatMessage, 'broadcast');
      })
      .on('broadcast', { event: 'delete_message' }, ({ payload }) => {
        if (payload?.id) emitMessage(payload as ChatMessage, 'broadcast');
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload?.conversationId) return;
        typingListeners.forEach((fn) => {
          try {
            fn(payload);
          } catch {}
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('SUBSCRIBED');
        } else if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setRealtimeStatus('CLOSED');
        } else {
          setRealtimeStatus('CONNECTING');
        }
      });

    return sharedMessagesChannel;
  } catch (err) {
    console.warn('Failed to initialize Supabase Realtime channel:', err);
    setRealtimeStatus('CLOSED');
    sharedMessagesChannel = null;
    return null;
  }
}

export function broadcastMessageEvent(
  event: 'new_message' | 'edit_message' | 'delete_message',
  message: ChatMessage
) {
  const channel = getOrCreateMessagesChannel();
  if (!channel || !isSupabaseConfigured) return;
  try {
    void channel.send({ type: 'broadcast', event, payload: message });
  } catch (err) {
    console.warn('Realtime broadcast error:', err);
  }
}

export function sendTypingIndicator(conversationId: string, profileId: number, fullName: string) {
  const channel = getOrCreateMessagesChannel();
  if (!channel || !isSupabaseConfigured) return;
  try {
    void channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { conversationId, profileId, fullName },
    });
  } catch {}
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
  onStatus: (status: MessagingRealtimeStatus) => void
): () => void {
  realtimeStatusListeners.add(onStatus);
  onStatus(realtimeChannelStatus);
  getOrCreateMessagesChannel();
  return () => {
    realtimeStatusListeners.delete(onStatus);
  };
}

export function getRealtimeChannelStatus(): MessagingRealtimeStatus {
  return realtimeChannelStatus;
}

export function subscribeToMessageChanges(onChange: (message: ChatMessage) => void): () => void {
  messageListeners.add(onChange);
  getOrCreateMessagesChannel();
  return () => {
    messageListeners.delete(onChange);
  };
}

/**
 * Fires when the inbox structure changes (a chat was started, joined, left, or a
 * conversation's last_message was updated). Use it to re-run listConversations().
 */
export function subscribeToConversationChanges(onRefresh: () => void): () => void {
  conversationListeners.add(onRefresh);
  getOrCreateMessagesChannel();
  return () => {
    conversationListeners.delete(onRefresh);
  };
}

/** Tears down the shared channel (used on sign-out / hot reload). */
export function closeMessagingRealtime() {
  if (!sharedMessagesChannel) return;
  try {
    void supabase.removeChannel(sharedMessagesChannel);
  } catch {}
  sharedMessagesChannel = null;
  setRealtimeStatus(isSupabaseConfigured ? 'CONNECTING' : 'OFFLINE');
}
