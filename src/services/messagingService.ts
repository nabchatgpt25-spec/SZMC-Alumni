import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, ALUMNI_PUBLIC_COLUMNS, isSupabaseConfigured, SUPABASE_API_URL } from '../lib/supabase';
import { fetchBlockedUserIds } from './communitySafetyService';
import { compressImageFileToDataUrl } from '../utils/mediaStorage';
import {
  buildProfileShareCardMessageText,
  formatStructuredPreview,
  parseStructuredChatMessage,
} from '../utils/structuredChat';
import {
  decodeSilentMessageBody,
  encodeSilentMessageBody,
  isValidClinicalStatus,
  loadSavedClinicalStatus,
  saveClinicalStatus,
  type ClinicalStatusKey,
} from '../utils/clinicalStatus';
import type {
  ChatConversation,
  ChatMessage,
  ChatPerson,
  MessageChangeMeta,
  MessageReaction,
  OnlinePresenceUser,
  ReactionChangeEvent,
  ReadReceiptEvent,
  UserMessageSettings,
} from '../types/messaging';
import type {
  ActiveDmAnnotationSession,
  AnnotationCollaborator,
  AnnotationCursor,
  AnnotationObject,
  AnnotationStrokePreview,
} from '../types/annotation';

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
 *   public.user_blocks               (bidirectional block enforcement)
 *
 * SECURITY & REALTIME ISOLATION
 * -----------------------------
 * - Database messages/conversations/participants arrive strictly over RLS-filtered
 *   Supabase Realtime `postgres_changes` (`messages-db-sync`). Raw message payloads
 *   are NEVER broadcast on a shared global channel.
 * - Typing indicators run exclusively on per-conversation scoped room channels
 *   (`conversation-room:<conversationId>`), joined only while a thread is open.
 * =============================================================================
 */

const MESSAGE_COLUMNS = 'id, conversation_id, sender_id, type, body, media_url, created_at, edited_at, deleted_at';
const MESSAGE_COLUMNS_WITH_REPLY = `${MESSAGE_COLUMNS}, reply_to_message_id`;
const CONVERSATION_COLUMNS = 'id, type, title, last_message, last_message_at, created_by, updated_at';
const PARTICIPANT_COLUMNS = 'conversation_id, profile_id, joined_at, last_read_at, is_muted';
const PROFILE_COLUMNS = 'id, user_id, full_name, avatar_url, batch, is_verified, last_seen_at';
const PREVIEW_LENGTH = 120;
const FALLBACK_AVATAR = '/szmc-logo.png';
const OFFICIAL_ANNOUNCEMENT_CHANNEL_ID = 'szmc-official-announcements';
const MAX_CHAT_IMAGE_BYTES = 8 * 1024 * 1024;
let replyColumnSupported: boolean | null = null;

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
    lastSeenAt: profile.last_seen_at ?? null,
  };
}

function toChatMessage(row: any): ChatMessage {
  const rawBody = typeof row.body === 'string' ? row.body : '';
  const { isSilent, body } = decodeSilentMessageBody(rawBody);
  const isProfileCard =
    row.type === 'ProfileShareCard' || parseStructuredChatMessage(body)?.kind === 'profile_card';
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id ?? row.conversationId ?? ''),
    senderId: Number(row.sender_id ?? row.senderId ?? 0),
    body,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    editedAt: row.edited_at ?? row.editedAt ?? null,
    deletedAt: row.deleted_at ?? row.deletedAt ?? null,
    type: isProfileCard ? 'ProfileShareCard' : (row.type || 'text'),
    mediaUrl: row.media_url ?? row.mediaUrl ?? null,
    replyToMessageId: row.reply_to_message_id ?? row.replyToMessageId ?? null,
    isSilent,
  };
}

function previewOf(message: ChatMessage | undefined, fallbackText?: string | null): string {
  if (!message) {
    const raw = (fallbackText || '').trim();
    if (!raw) return '';
    const decoded = decodeSilentMessageBody(raw);
    const structured = formatStructuredPreview(decoded.body);
    const base = structured || decoded.body || (decoded.isSilent ? 'Silent message' : '');
    const display = decoded.isSilent ? `🔇 ${base}` : base;
    return display.length > PREVIEW_LENGTH ? `${display.slice(0, PREVIEW_LENGTH)}…` : display;
  }
  if (message.deletedAt) return 'Message deleted';
  const silentPrefix = message.isSilent ? '🔇 ' : '';
  if (message.type === 'image' || message.mediaUrl) {
    const base = message.body && message.body !== 'Photo' ? `📷 ${message.body}` : '📷 Photo';
    return `${silentPrefix}${base}`;
  }
  if (message.body === '👍' || message.type === 'like') return `${silentPrefix}👍`;
  const structured = formatStructuredPreview(message.body);
  const display = `${silentPrefix}${structured || message.body}`;
  return display.length > PREVIEW_LENGTH ? `${display.slice(0, PREVIEW_LENGTH)}…` : display;
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
  closeMessagingRealtime();
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
// 0B. BLOCKED ACCOUNTS STATE (public.user_blocks + RPC get_messenger_blocked_profile_ids)
// ---------------------------------------------------------------------------
export interface MessengerBlockState {
  blockedByMe: Set<number>;
  blockedEitherWay: Set<number>;
}

export async function getMessengerBlockState(myProfileId?: number | null): Promise<MessengerBlockState> {
  const blockedByMe = new Set<number>();
  const blockedEitherWay = new Set<number>();

  const resolvedId = (await getMessagingProfileId()) ?? myProfileId ?? null;

  // 1. Local + Supabase user_blocks created by me (works immediately even before migration 026)
  if (resolvedId) {
    try {
      const myBlockedIds = await fetchBlockedUserIds(resolvedId);
      myBlockedIds.forEach((id) => {
        if (Number.isFinite(id) && id > 0) {
          blockedByMe.add(Number(id));
          blockedEitherWay.add(Number(id));
        }
      });
    } catch {
      /* best-effort fallback */
    }
  }

  // 2. Authoritative bidirectional block RPC (includes accounts who blocked me)
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('get_messenger_blocked_profile_ids');
      if (!error && Array.isArray(data)) {
        data.forEach((row: any) => {
          const pid = Number(row.blocked_profile_id);
          if (Number.isFinite(pid) && pid > 0) {
            blockedEitherWay.add(pid);
            if (row.blocked_by_me) {
              blockedByMe.add(pid);
            }
          }
        });
      }
    } catch {
      /* graceful fallback before migration 026 is applied */
    }
  }

  return { blockedByMe, blockedEitherWay };
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

  // 1c. Other participants (direct chats), member counts, peer read timestamps, and unread counters
  const otherByConversation = new Map<string, number>();
  const peerLastReadAtByConversation = new Map<string, string | null>();
  const participantCountByConversation = new Map<string, number>();
  participantRows.forEach((row: any) => {
    const convId = String(row.conversation_id);
    participantCountByConversation.set(convId, (participantCountByConversation.get(convId) ?? 0) + 1);
    if (Number(row.profile_id) !== myId) {
      otherByConversation.set(convId, Number(row.profile_id));
      peerLastReadAtByConversation.set(convId, row.last_read_at ?? null);
    }
  });

  const latestByConversation = new Map<string, ChatMessage>();
  (latestMsgRes.data ?? []).forEach((row: any) => {
    const message = toChatMessage(row);
    if (!latestByConversation.has(message.conversationId)) {
      latestByConversation.set(message.conversationId, message);
    }
  });

  // Unread messages: prefer authoritative server-side RPC (no 1,000-row cap),
  // with safe client-side fallback if migration 027 is not yet applied.
  const unreadByConversation = new Map<string, number>();
  let usedUnreadRpc = false;
  try {
    const { data: rpcUnreads, error: rpcErr } = await supabase.rpc('get_unread_counts_by_conversation');
    if (!rpcErr && Array.isArray(rpcUnreads)) {
      usedUnreadRpc = true;
      rpcUnreads.forEach((row: any) => {
        if (row?.conversation_id) {
          unreadByConversation.set(String(row.conversation_id), Math.max(0, Number(row.unread_count || 0)));
        }
      });
    }
  } catch {
    /* fallback below */
  }

  if (!usedUnreadRpc) {
    const readMarkers = mine
      .map((row: any) => row.last_read_at)
      .filter(Boolean)
      .sort();
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
  }

  // 1d. Display data for the counterpart participants + bidirectional block state
  const others = Array.from(new Set(Array.from(otherByConversation.values())));
  const [people, blockState] = await Promise.all([
    loadPeople(others),
    getMessengerBlockState(myId),
  ]);

  const conversations: ChatConversation[] = [];
  conversationRows.forEach((conv: any) => {
    const convId = String(conv.id);
    const participant = myParticipantByConv.get(convId);
    const otherId = otherByConversation.get(convId);
    const latest = latestByConversation.get(convId);
    const isGroup = conv.type === 'group' || conv.type === 'announcement';
    const memberCount = participantCountByConversation.get(convId) ?? 2;

    if (isGroup) {
      conversations.push({
        id: convId,
        person: {
          profileId: Number(otherId ?? myId),
          fullName: conv.title || (conv.type === 'announcement' ? 'SZMC Official Announcements' : 'Group chat'),
          avatarUrl: FALLBACK_AVATAR,
          batchYear: 20,
          profession:
            conv.type === 'announcement'
              ? 'SZMC Alumni Network'
              : `${memberCount} ${memberCount === 1 ? 'member' : 'members'}`,
        },
        lastMessageAt: latest?.createdAt ?? conv.last_message_at,
        lastMessagePreview: previewOf(latest, conv.last_message),
        lastMessageFromMe: latest?.senderId === myId,
        unreadCount: unreadByConversation.get(convId) ?? 0,
        isMuted: Boolean(participant?.is_muted),
        type: conv.type,
        title: conv.title ?? null,
        participantCount: memberCount,
        peerLastReadAt: null,
        isBlockedByMe: false,
        isBlockedEitherWay: false,
      });
      return;
    }

    const person = toChatPerson(otherId !== undefined ? people.get(otherId) : undefined, otherId ?? 0);
    const isBlockedByMe = otherId !== undefined && blockState.blockedByMe.has(otherId);
    const isBlockedEitherWay = otherId !== undefined && blockState.blockedEitherWay.has(otherId);
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
      participantCount: memberCount,
      peerLastReadAt: peerLastReadAtByConversation.get(convId) ?? null,
      isBlockedByMe,
      isBlockedEitherWay,
    });
  });

  return conversations.sort((a, b) =>
    a.lastMessageAt < b.lastMessageAt ? 1 : a.lastMessageAt > b.lastMessageAt ? -1 : 0
  );
}

/**
 * Returns total unread message count across all conversations for the signed-in user.
 * Prefers the authoritative server RPC (`get_unread_counts_by_conversation`) and falls
 * back gracefully if the RPC has not been applied yet.
 */
export async function getTotalUnreadCount(myProfileId?: number | null): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  try {
    const { data: rpcUnreads, error: rpcErr } = await supabase.rpc('get_unread_counts_by_conversation');
    if (!rpcErr && Array.isArray(rpcUnreads)) {
      return rpcUnreads.reduce(
        (sum, row: any) => sum + Math.max(0, Number(row?.unread_count || 0)),
        0
      );
    }
  } catch {
    /* fallback below */
  }

  try {
    const convs = await listConversations(myProfileId);
    return convs.reduce((sum, c) => sum + Math.max(0, c.unreadCount || 0), 0);
  } catch {
    return 0;
  }
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

  // Enforce bidirectional user_blocks before opening or creating a direct chat
  const blockState = await getMessengerBlockState(myId);
  if (blockState.blockedEitherWay.has(targetId) || blockState.blockedEitherWay.has(Number(otherProfileId))) {
    throw new MessagingError(
      blockState.blockedByMe.has(targetId) || blockState.blockedByMe.has(Number(otherProfileId))
        ? 'You have blocked this user. Unblock them in Message Settings to start a conversation.'
        : 'Messaging is unavailable because this account cannot be messaged.'
    );
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

  // 2b. Postgres RPC (privacy + block-aware, SECURITY DEFINER, atomic).
  //     Only fall back to direct inserts when the function itself is unavailable
  //     (missing / not granted). A business-rule rejection must be surfaced, never
  //     bypassed — otherwise a privacy- or block-restricted chat would be created anyway.
  const { data: rpcId, error: rpcErr } = await supabase.rpc('start_direct_conversation', {
    target_profile_id: targetId,
  });

  if (!rpcErr && rpcId) return String(rpcId);

  if (rpcErr) {
    const msg = rpcErr.message || '';
    const code = String((rpcErr as any).code || '');
    const isBusinessRule = /Blocked:|Privacy Restriction|Cannot start|not found|does not exist in public\.profiles/i.test(msg);
    const functionUnavailable =
      !isBusinessRule &&
      (code === 'PGRST202' || // function missing from the schema cache
        code === '42883' || // undefined_function
        code === '42501' || // permission denied for function
        /could not find the function|permission denied/i.test(msg));

    if (!functionUnavailable) {
      // Block restriction, privacy restriction, self-chat, unknown target → report it to the user.
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
// 2B. GROUP CONVERSATIONS — create, list participants, add members
// ---------------------------------------------------------------------------
export async function createGroupConversation(
  myProfileId: number,
  title: string,
  memberProfileIds: number[]
): Promise<string> {
  if (!isSupabaseConfigured) {
    throw new MessagingError('Supabase is not configured. Messenger requires a live Supabase project.');
  }
  const cleanTitle = (title || '').trim();
  if (cleanTitle.length < 2 || cleanTitle.length > 80) {
    throw new MessagingError('Group name must be between 2 and 80 characters.');
  }

  const myId = await resolveSelfProfileId(myProfileId);
  const blockState = await getMessengerBlockState(myId);

  const resolvedTargets: number[] = [];
  for (const rawId of memberProfileIds) {
    const resolved = await resolveTargetProfileId(rawId);
    if (
      resolved !== myId &&
      !resolvedTargets.includes(resolved) &&
      !blockState.blockedEitherWay.has(resolved) &&
      !blockState.blockedEitherWay.has(Number(rawId))
    ) {
      resolvedTargets.push(resolved);
    }
  }

  if (resolvedTargets.length < 1) {
    throw new MessagingError('Select at least 1 colleague to create a group chat.');
  }

  // Primary atomic path: SECURITY DEFINER RPC (migration 028)
  const { data: rpcConvId, error: rpcErr } = await supabase.rpc('create_group_conversation', {
    p_title: cleanTitle,
    p_member_ids: resolvedTargets,
  });

  if (!rpcErr && rpcConvId) return String(rpcConvId);

  if (rpcErr) {
    const code = String((rpcErr as any).code || '');
    const msg = rpcErr.message || '';
    const fnUnavailable =
      code === 'PGRST202' || code === '42883' || /could not find the function/i.test(msg);
    if (!fnUnavailable) {
      throw new MessagingError(msg || 'Could not create group chat.', code);
    }
  }

  // Graceful direct-insert fallback if migration 028 hasn't been applied yet
  const now = new Date().toISOString();
  const { data: created, error: createErr } = await supabase
    .from('conversations')
    .insert({
      created_by: myId,
      type: 'group',
      title: cleanTitle,
      last_message: 'Group created',
      last_message_at: now,
    })
    .select('id')
    .single();

  if (createErr || !created?.id) {
    throwMessagingError(createErr, 'Could not create group conversation.');
  }

  const conversationId = String(created.id);
  const rows = [
    { conversation_id: conversationId, profile_id: myId, last_read_at: now, is_muted: false },
    ...resolvedTargets.map((pid) => ({
      conversation_id: conversationId,
      profile_id: pid,
      last_read_at: now,
      is_muted: false,
    })),
  ];

  const { error: partErr } = await supabase.from('conversation_participants').insert(rows);
  if (partErr) {
    throwMessagingError(partErr, 'Group created, but members could not be added.');
  }

  return conversationId;
}

export async function listConversationParticipants(conversationId: string): Promise<ChatPerson[]> {
  if (!conversationId || !isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('conversation_participants')
    .select('profile_id')
    .eq('conversation_id', conversationId);
  if (error || !data || data.length === 0) return [];

  const ids = Array.from(new Set(data.map((r: any) => Number(r.profile_id)).filter((n) => n > 0)));
  const people = await loadPeople(ids);
  return ids.map((id) => toChatPerson(people.get(id), id));
}

export async function addGroupMember(conversationId: string, memberProfileId: number): Promise<void> {
  if (!conversationId || !isSupabaseConfigured) return;
  const targetId = await resolveTargetProfileId(memberProfileId);

  const { error: rpcErr } = await supabase.rpc('add_group_member', {
    p_conversation_id: conversationId,
    p_profile_id: targetId,
  });

  if (!rpcErr) return;

  const code = String((rpcErr as any).code || '');
  const msg = rpcErr.message || '';
  const fnUnavailable =
    code === 'PGRST202' || code === '42883' || /could not find the function/i.test(msg);
  if (!fnUnavailable) {
    throw new MessagingError(msg || 'Could not add member to this group.', code);
  }

  const { error: insertErr } = await supabase.from('conversation_participants').upsert(
    {
      conversation_id: conversationId,
      profile_id: targetId,
      last_read_at: new Date().toISOString(),
      is_muted: false,
    },
    { onConflict: 'conversation_id,profile_id' }
  );
  if (insertErr) throwMessagingError(insertErr, 'Could not add member to this group.');
}

// ---------------------------------------------------------------------------
// 2C. CHAT PHOTO UPLOAD (Supabase Storage 'chat-media' with compressed fallback)
// ---------------------------------------------------------------------------
export async function uploadChatImage(file: File, conversationId: string): Promise<string> {
  if (!file.type || !file.type.startsWith('image/')) {
    throw new MessagingError('Please select a valid image file (JPG, PNG, WebP, or GIF).');
  }
  if (file.size > MAX_CHAT_IMAGE_BYTES) {
    throw new MessagingError('Image must be smaller than 8 MB.');
  }

  // Try Supabase Storage first for lightweight DB rows & CDN delivery
  if (isSupabaseConfigured && conversationId) {
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('chat-media')
        .upload(path, file, { contentType: file.type, upsert: false });

      if (!uploadErr) {
        const { data: pub } = supabase.storage.from('chat-media').getPublicUrl(path);
        if (pub?.publicUrl) return pub.publicUrl;
      }
    } catch {
      /* gracefully fall back to compressed Data URL when Storage bucket is not provisioned */
    }
  }

  return compressImageFileToDataUrl(file, 1080, 0.8);
}

// ---------------------------------------------------------------------------
// 3. LIST MESSAGES — cursor-paginated public.messages, oldest → newest
// ---------------------------------------------------------------------------
export interface MessagePage {
  messages: ChatMessage[];
  hasMore: boolean;
}

export async function listMessagesPage(
  conversationId: string,
  options: { limit?: number; beforeCreatedAt?: string | null } = {}
): Promise<MessagePage> {
  if (!conversationId) return { messages: [], hasMore: false };
  if (!isSupabaseConfigured) {
    throw new MessagingError('Supabase is not configured. Messenger requires a live Supabase project.');
  }

  const pageSize = Math.max(10, Math.min(200, options.limit ?? 50));
  const selectCols = replyColumnSupported === false ? MESSAGE_COLUMNS : MESSAGE_COLUMNS_WITH_REPLY;

  const runQuery = (columns: string) => {
    let q = supabase
      .from('messages')
      .select(columns)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(pageSize + 1);
    if (options.beforeCreatedAt) {
      q = q.lt('created_at', options.beforeCreatedAt);
    }
    return q;
  };

  let { data, error } = await runQuery(selectCols);

  if (error && selectCols !== MESSAGE_COLUMNS && /reply_to_message_id|column .* does not exist/i.test(error.message || '')) {
    replyColumnSupported = false;
    ({ data, error } = await runQuery(MESSAGE_COLUMNS));
  } else if (!error && selectCols === MESSAGE_COLUMNS_WITH_REPLY) {
    replyColumnSupported = true;
  }

  if (error) throwMessagingError(error, 'Could not load this conversation.');

  const rows = data ?? [];
  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    messages: pageRows.map(toChatMessage).reverse(),
    hasMore,
  };
}

export async function listMessages(conversationId: string, limit = 50): Promise<ChatMessage[]> {
  const { messages } = await listMessagesPage(conversationId, { limit });
  return messages;
}

// ---------------------------------------------------------------------------
// 4. SEND MESSAGE — inserts into public.messages (supports media & replies)
// ---------------------------------------------------------------------------
export interface SendMessageOptions {
  /** 'text' | 'like' | 'image' | 'system' | 'ProfileShareCard' */
  type?: 'text' | 'like' | 'image' | 'system' | 'ProfileShareCard';
  /** Public URL (or compressed data URL fallback) for image messages → messages.media_url */
  mediaUrl?: string | null;
  /** Optional replied-to message ID → messages.reply_to_message_id */
  replyToMessageId?: string | null;
  /** When true, marks the message as quiet so recipients do not receive an audio/toast alert */
  isSilent?: boolean;
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

  // Enforce bidirectional block state for direct conversations client-side as well
  // (DB RLS also enforces this authoritatively once migration 026 is applied)
  try {
    const [convMeta, participantsRes, blockState] = await Promise.all([
      supabase.from('conversations').select('type').eq('id', conversationId).maybeSingle(),
      supabase.from('conversation_participants').select('profile_id').eq('conversation_id', conversationId),
      getMessengerBlockState(authorId),
    ]);
    if (convMeta.data?.type === 'direct' && Array.isArray(participantsRes.data)) {
      const peerRow = participantsRes.data.find((p: any) => Number(p.profile_id) !== authorId);
      if (peerRow && blockState.blockedEitherWay.has(Number(peerRow.profile_id))) {
        throw new MessagingError(
          blockState.blockedByMe.has(Number(peerRow.profile_id))
            ? 'You blocked this user. Unblock them to send messages again.'
            : 'You can no longer send messages to this conversation.'
        );
      }
    }
  } catch (checkErr) {
    if (checkErr instanceof MessagingError) throw checkErr;
  }

  const resolvedType = options.type ?? (cleanBody === '👍' && !options.mediaUrl ? 'like' : options.mediaUrl ? 'image' : 'text');
  // Database check constraint restricts messages.type to ('text', 'like', 'system', 'image');
  // ProfileShareCard payloads are stored as 'text' with structured markers and normalized to 'ProfileShareCard' in toChatMessage().
  const dbType = resolvedType === 'ProfileShareCard' ? 'text' : resolvedType;
  const visibleBody = cleanBody || (resolvedType === 'image' ? (options.isSilent ? '' : 'Photo') : '');
  const storedBody = options.isSilent ? encodeSilentMessageBody(visibleBody) : visibleBody;

  const payload: Record<string, any> = {
    conversation_id: conversationId,
    sender_id: authorId,
    type: dbType,
    body: storedBody,
  };
  if (options.mediaUrl) payload.media_url = options.mediaUrl;
  if (options.replyToMessageId && replyColumnSupported !== false) {
    payload.reply_to_message_id = options.replyToMessageId;
  }

  const selectCols = replyColumnSupported === false ? MESSAGE_COLUMNS : MESSAGE_COLUMNS_WITH_REPLY;
  const { data, error } = await supabase.from('messages').insert(payload).select(selectCols).single();

  if (error) {
    // Retry without reply_to_message_id if migration 028 isn't applied yet
    if (/reply_to_message_id/i.test(error.message || '')) {
      replyColumnSupported = false;
      const fallbackPayload = { ...payload };
      delete fallbackPayload.reply_to_message_id;
      const { data: retryReply, error: retryReplyErr } = await supabase
        .from('messages')
        .insert(fallbackPayload)
        .select(MESSAGE_COLUMNS)
        .single();
      if (!retryReplyErr && retryReply) return toChatMessage(retryReply);
    }

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

  // Real-time delivery happens strictly through RLS-filtered postgres_changes (never global broadcast)
  return toChatMessage(data);
}

export interface ProfileCardShareInput {
  id: number;
  fullName: string;
  batchYear: number;
  specialty?: string[];
  position?: string;
  profession?: string;
  institution?: string;
  avatarUrl?: string;
}

export async function sendProfileShareCard(
  conversationId: string,
  senderId: number,
  profile: ProfileCardShareInput,
  options?: {
    note?: string;
    profileUrl?: string;
    mediaUrl?: string | null;
    replyToMessageId?: string | null;
  }
): Promise<ChatMessage> {
  const specialtyText =
    (profile.specialty && profile.specialty.length > 0
      ? profile.specialty.slice(0, 3).join(' · ')
      : profile.position || profile.profession || 'SZMC Physician');

  const defaultUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?card=${profile.id}`
      : `?card=${profile.id}`;

  const body = buildProfileShareCardMessageText({
    profileId: profile.id,
    fullName: profile.fullName,
    batchYear: profile.batchYear || 20,
    specialty: specialtyText,
    institution: profile.institution,
    avatarUrl: profile.avatarUrl,
    profileUrl: options?.profileUrl || defaultUrl,
    note: options?.note,
  });

  return sendMessage(conversationId, senderId, body, {
    type: 'ProfileShareCard',
    mediaUrl: options?.mediaUrl ?? null,
    replyToMessageId: options?.replyToMessageId ?? null,
  });
}

// ---------------------------------------------------------------------------
// 4B. MESSAGE REACTIONS — public.message_reactions (toggle + list)
// ---------------------------------------------------------------------------
export async function listMessageReactions(messageIds: string[]): Promise<Record<string, MessageReaction[]>> {
  const grouped: Record<string, MessageReaction[]> = {};
  const cleanIds = messageIds.filter((id) => id && !id.startsWith('temp-'));
  if (cleanIds.length === 0 || !isSupabaseConfigured) return grouped;

  try {
    const { data, error } = await supabase
      .from('message_reactions')
      .select('message_id, profile_id, emoji, created_at')
      .in('message_id', cleanIds);

    if (error || !Array.isArray(data)) return grouped;

    data.forEach((row: any) => {
      const msgId = String(row.message_id);
      if (!grouped[msgId]) grouped[msgId] = [];
      grouped[msgId].push({
        messageId: msgId,
        profileId: Number(row.profile_id),
        emoji: String(row.emoji),
        createdAt: row.created_at ?? undefined,
      });
    });
  } catch {
    /* graceful no-op before migration 028 is applied */
  }
  return grouped;
}

export async function toggleMessageReaction(
  messageId: string,
  myProfileId: number,
  emoji: string,
  currentlyReacted: boolean
): Promise<boolean> {
  if (!messageId || messageId.startsWith('temp-') || !isSupabaseConfigured) return false;
  const myId = await resolveSelfProfileId(myProfileId);
  const cleanEmoji = (emoji || '').trim();
  if (!cleanEmoji) return false;

  if (currentlyReacted) {
    const { error } = await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('profile_id', myId)
      .eq('emoji', cleanEmoji);
    if (error) {
      if (error.code === '42P01' || /does not exist/i.test(error.message || '')) return false;
      throwMessagingError(error, 'Could not remove reaction.');
    }
    return false;
  } else {
    const { error } = await supabase.from('message_reactions').upsert(
      {
        message_id: messageId,
        profile_id: myId,
        emoji: cleanEmoji,
      },
      { onConflict: 'message_id,profile_id,emoji' }
    );
    if (error) {
      if (error.code === '42P01' || /does not exist/i.test(error.message || '')) {
        throw new MessagingError(
          'Live message reactions require applying migration 028_phase9c_messenger_groups_replies_reactions.sql in Supabase.'
        );
      }
      throwMessagingError(error, 'Could not add reaction.');
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// 5. EDIT MESSAGE — strictly original sender only (columns body + edited_at)
// ---------------------------------------------------------------------------
export async function editMessage(
  messageId: string,
  body: string,
  options?: { preserveSilent?: boolean }
): Promise<ChatMessage> {
  const cleanBody = (body ?? '').trim();
  if (!cleanBody) throw new MessagingError('Message cannot be empty.');
  const storedBody = options?.preserveSilent ? encodeSilentMessageBody(cleanBody) : cleanBody;

  const { data, error } = await supabase
    .from('messages')
    .update({ body: storedBody, edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .select(MESSAGE_COLUMNS)
    .maybeSingle();

  if (error || !data) throwMessagingError(error, 'Only the message author can edit this message.');

  return toChatMessage(data);
}

// ---------------------------------------------------------------------------
// 6. DELETE MESSAGE — sender soft delete or admin moderation soft delete
// ---------------------------------------------------------------------------
export async function deleteMessage(
  messageId: string,
  options?: { asModerator?: boolean }
): Promise<ChatMessage> {
  if (options?.asModerator) {
    const { data: rpcRow, error: rpcErr } = await supabase.rpc('moderate_delete_message', {
      p_message_id: messageId,
    });
    if (!rpcErr && rpcRow) {
      return toChatMessage(rpcRow);
    }
    if (rpcErr) {
      const code = String((rpcErr as any).code || '');
      const msg = rpcErr.message || '';
      const fnMissing =
        code === 'PGRST202' ||
        code === '42883' ||
        /could not find the function/i.test(msg);
      if (!fnMissing) {
        throwMessagingError(rpcErr, 'Could not moderate-delete this message.');
      }
      throw new MessagingError(
        'Admin message moderation requires applying migration 026_phase9a_messenger_security_privacy.sql in Supabase.'
      );
    }
  }

  const { data, error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)
    .select(MESSAGE_COLUMNS)
    .maybeSingle();

  if (!error && data) {
    return toChatMessage(data);
  }

  // Fallback for admins moderating another user's message if caller did not pass asModerator
  const { data: modRow, error: modErr } = await supabase.rpc('moderate_delete_message', {
    p_message_id: messageId,
  });
  if (!modErr && modRow) {
    return toChatMessage(modRow);
  }

  throwMessagingError(error || modErr, 'Could not delete this message.');
}

// ---------------------------------------------------------------------------
// 6B. PERSISTENT OFFICIAL ANNOUNCEMENT BROADCAST (ADMIN / SUPER ADMIN ONLY)
// ---------------------------------------------------------------------------
export async function publishOfficialAnnouncement(
  announcementText: string,
  fallbackConversationId?: string | null
): Promise<{ conversationId: string; persisted: boolean }> {
  const cleanText = (announcementText ?? '').trim();
  if (!cleanText) {
    throw new MessagingError('Announcement message cannot be empty.');
  }
  if (!isSupabaseConfigured) {
    throw new MessagingError('Supabase is not configured. Official announcements require a live database.');
  }

  // 1. Primary path: SECURITY DEFINER RPC persists into canonical 'szmc-official-announcements'
  //    channel, enrolls all active profiles, and streams via RLS-protected postgres_changes.
  const { data: rpcConvId, error: rpcErr } = await supabase.rpc('broadcast_announcement', {
    announcement_text: cleanText,
  });

  if (!rpcErr && rpcConvId) {
    return { conversationId: String(rpcConvId), persisted: true };
  }

  const msg = rpcErr?.message || '';
  const code = String((rpcErr as any)?.code || '');
  const isAccessDenied = /Access Denied|Authentication required|cannot be empty/i.test(msg);
  if (isAccessDenied) {
    throw new MessagingError(msg, code);
  }

  // 2. Graceful fallback if migration 026 RPC is not yet applied remotely:
  //    persist directly into the canonical announcement conversation (or active thread),
  //    NEVER firing an unpersisted fake global broadcast.
  const myId = await resolveSelfProfileId();
  let targetConvId = fallbackConversationId || OFFICIAL_ANNOUNCEMENT_CHANNEL_ID;

  if (!fallbackConversationId) {
    const { data: existingChannel } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', OFFICIAL_ANNOUNCEMENT_CHANNEL_ID)
      .maybeSingle();

    if (!existingChannel?.id) {
      const nowIso = new Date().toISOString();
      const { error: createErr } = await supabase.from('conversations').insert({
        id: OFFICIAL_ANNOUNCEMENT_CHANNEL_ID,
        created_by: myId,
        type: 'announcement',
        title: 'SZMC Official Announcements',
        last_message: cleanText.slice(0, 200),
        last_message_at: nowIso,
      });
      if (createErr) {
        throwMessagingError(
          createErr,
          'Could not create the Official Announcements channel. Apply migration 026_phase9a_messenger_security_privacy.sql.'
        );
      }
      await supabase.from('conversation_participants').upsert(
        {
          conversation_id: OFFICIAL_ANNOUNCEMENT_CHANNEL_ID,
          profile_id: myId,
          last_read_at: nowIso,
          is_muted: false,
        },
        { onConflict: 'conversation_id,profile_id' }
      );
    }
    targetConvId = OFFICIAL_ANNOUNCEMENT_CHANNEL_ID;
  }

  await sendMessage(targetConvId, myId, cleanText, { type: 'system' });
  return { conversationId: targetConvId, persisted: true };
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

export async function getPeerLastReadAt(conversationId: string, myProfileId?: number | null): Promise<string | null> {
  if (!conversationId || !isSupabaseConfigured) return null;
  try {
    const myId = await resolveSelfProfileId(myProfileId);
    const { data } = await supabase
      .from('conversation_participants')
      .select('profile_id, last_read_at')
      .eq('conversation_id', conversationId)
      .neq('profile_id', myId)
      .limit(1)
      .maybeSingle();
    return data?.last_read_at ?? null;
  } catch {
    return null;
  }
}

export async function touchMyLastSeen(): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    await supabase.rpc('touch_my_last_seen');
  } catch {
    /* best-effort heartbeat */
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
// 10. ALUMNI SEARCH — direct public.alumni_profiles query (excludes blocked accounts)
// ---------------------------------------------------------------------------
export async function searchAlumniForChat(query: string, myProfileId?: number | null): Promise<ChatPerson[]> {
  const term = (query || '').trim().replace(/[%_,()]/g, ' ').trim();
  if (term.length < 2) return [];

  const myId = (await getMessagingProfileId()) ?? myProfileId ?? null;

  const [{ data, error }, blockState] = await Promise.all([
    supabase
      .from('alumni_profiles')
      .select(ALUMNI_PUBLIC_COLUMNS)
      .or(`full_name.ilike.%${term}%,profession.ilike.%${term}%,institution.ilike.%${term}%`)
      .order('full_name', { ascending: true })
      .limit(25),
    getMessengerBlockState(myId),
  ]);

  if (error) throwMessagingError(error, 'Search is temporarily unavailable.');

  return (data ?? [])
    .filter((row: any) => {
      const rowId = Number(row.id);
      return rowId !== Number(myId) && !blockState.blockedEitherWay.has(rowId);
    })
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

/**
 * Loads fellow MBBS batchmates (or recent alumni if batchYear is unavailable) for
 * one-tap New Chat / Group Chat creation before typing a search query.
 */
export async function listSuggestedColleaguesForChat(
  myProfileId?: number | null,
  batchYear?: number | null
): Promise<ChatPerson[]> {
  if (!isSupabaseConfigured) return [];
  const myId = (await getMessagingProfileId()) ?? myProfileId ?? null;

  let query = supabase
    .from('alumni_profiles')
    .select(ALUMNI_PUBLIC_COLUMNS)
    .order('full_name', { ascending: true })
    .limit(25);

  if (batchYear && Number.isFinite(Number(batchYear)) && Number(batchYear) > 0) {
    query = query.eq('batch_year', Number(batchYear));
  }

  const [{ data, error }, blockState] = await Promise.all([
    query,
    getMessengerBlockState(myId),
  ]);

  if (error) return [];

  return (data ?? [])
    .filter((row: any) => {
      const rowId = Number(row.id);
      return rowId !== Number(myId) && !blockState.blockedEitherWay.has(rowId);
    })
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
// 11. SUPABASE REALTIME — STRICTLY SCOPED ISOLATION + AUTO-RECONNECT + PRESENCE
//     • 'messages-db-sync': RLS-protected postgres_changes ONLY (zero global broadcast!)
//     • 'conversation-room:<conversationId>': per-thread ephemeral typing channel ONLY
//     • 'messenger-presence': real Supabase Realtime Presence for online alumni
// ---------------------------------------------------------------------------
export type MessagingRealtimeStatus = 'SUBSCRIBED' | 'CONNECTING' | 'CLOSED' | 'OFFLINE';

interface ScopedRoomEntry {
  channel: RealtimeChannel;
  listeners: Set<(data: { conversationId: string; profileId: number; fullName: string }) => void>;
  annotationSessionListeners: Set<(session: ActiveDmAnnotationSession) => void>;
}

let sharedDbSyncChannel: RealtimeChannel | null = null;
const scopedRoomChannels = new Map<string, ScopedRoomEntry>();

const messageListeners = new Set<(message: ChatMessage, meta: MessageChangeMeta) => void>();
const conversationListeners = new Set<() => void>();
const readReceiptListeners = new Set<(receipt: ReadReceiptEvent) => void>();
const reactionListeners = new Set<(event: ReactionChangeEvent) => void>();
const realtimeStatusListeners = new Set<(status: MessagingRealtimeStatus) => void>();
const realtimeReconnectListeners = new Set<() => void>();

let realtimeChannelStatus: MessagingRealtimeStatus = isSupabaseConfigured ? 'CONNECTING' : 'OFFLINE';
let hasSubscribedOnce = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let networkHooksRegistered = false;
const seenMessageSignatures = new Map<string, number>();

function hasActiveRealtimeListeners(): boolean {
  return (
    messageListeners.size > 0 ||
    conversationListeners.size > 0 ||
    readReceiptListeners.size > 0 ||
    reactionListeners.size > 0 ||
    realtimeStatusListeners.size > 0
  );
}

function setRealtimeStatus(status: MessagingRealtimeStatus) {
  const prevStatus = realtimeChannelStatus;
  realtimeChannelStatus = status;
  realtimeStatusListeners.forEach((fn) => {
    try {
      fn(status);
    } catch {}
  });

  if (status === 'SUBSCRIBED') {
    const wasDisconnected = hasSubscribedOnce && prevStatus !== 'SUBSCRIBED';
    hasSubscribedOnce = true;
    reconnectAttempt = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (wasDisconnected) {
      emitReconnect();
    }
  }
}

function emitReconnect() {
  realtimeReconnectListeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

function scheduleDbSyncReconnect() {
  if (!isSupabaseConfigured || !hasActiveRealtimeListeners()) return;
  if (reconnectTimer) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setRealtimeStatus('OFFLINE');
    return;
  }

  const delayMs = Math.min(30000, 1500 * Math.pow(2, reconnectAttempt));
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!hasActiveRealtimeListeners()) return;
    if (sharedDbSyncChannel) {
      try {
        void supabase.removeChannel(sharedDbSyncChannel);
      } catch {}
      sharedDbSyncChannel = null;
    }
    getOrCreateMessagesChannel();
  }, delayMs);
}

function ensureNetworkAndVisibilityHooks() {
  if (networkHooksRegistered || typeof window === 'undefined') return;
  networkHooksRegistered = true;

  window.addEventListener('online', () => {
    if (!hasActiveRealtimeListeners()) return;
    reconnectAttempt = 0;
    if (realtimeChannelStatus !== 'SUBSCRIBED') {
      forceReconnectMessagingRealtime();
    } else {
      emitReconnect();
    }
  });

  window.addEventListener('offline', () => {
    if (hasActiveRealtimeListeners()) {
      setRealtimeStatus('OFFLINE');
    }
  });

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !hasActiveRealtimeListeners()) return;
      if (realtimeChannelStatus !== 'SUBSCRIBED') {
        forceReconnectMessagingRealtime();
      } else {
        // Reconcile any events missed while the browser tab was throttled/sleeping
        emitReconnect();
      }
    });
  }
}

function emitMessage(message: ChatMessage, meta: MessageChangeMeta) {
  const signature = `${meta.eventType}:${message.id}:${message.body.length}:${message.editedAt ?? ''}:${message.deletedAt ?? ''}`;
  const now = Date.now();
  const previous = seenMessageSignatures.get(signature);
  if (previous && now - previous < 2500) return;
  seenMessageSignatures.set(signature, now);
  if (seenMessageSignatures.size > 500) {
    for (const [key, ts] of seenMessageSignatures) {
      if (now - ts > 30000) seenMessageSignatures.delete(key);
    }
  }

  messageListeners.forEach((fn) => {
    try {
      fn(message, meta);
    } catch (err) {
      console.warn('Message listener error (postgres_changes):', err);
    }
  });
}

/**
 * RLS-enforced database sync channel (`messages-db-sync`).
 * Only listens to `postgres_changes` on `messages`, `conversation_participants`, and
 * `conversations`. Supabase applies Postgres RLS server-side before dispatching each
 * row, guaranteeing users only ever receive events for their own conversations.
 *
 * Includes automatic exponential-backoff reconnection and visibility/online resync.
 */
export function getOrCreateMessagesChannel(): RealtimeChannel | null {
  if (!isSupabaseConfigured) {
    setRealtimeStatus('OFFLINE');
    return null;
  }
  ensureNetworkAndVisibilityHooks();

  if (sharedDbSyncChannel && realtimeChannelStatus !== 'CLOSED' && realtimeChannelStatus !== 'OFFLINE') {
    return sharedDbSyncChannel;
  }

  if (sharedDbSyncChannel) {
    try {
      void supabase.removeChannel(sharedDbSyncChannel);
    } catch {}
    sharedDbSyncChannel = null;
  }

  try {
    setRealtimeStatus('CONNECTING');

    const channel = supabase.channel('messages-db-sync');
    sharedDbSyncChannel = channel;

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload: any) => {
          const eventType = (payload.eventType || 'INSERT') as MessageChangeMeta['eventType'];
          if (eventType === 'DELETE') {
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
              { eventType: 'DELETE' }
            );
            return;
          }
          if (!payload.new?.id) return;
          emitMessage(toChatMessage(payload.new), { eventType });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_participants' },
        (payload: any) => {
          const row = payload.new || {};
          if (payload.eventType === 'UPDATE' && row.conversation_id && row.profile_id && row.last_read_at) {
            const receipt: ReadReceiptEvent = {
              conversationId: String(row.conversation_id),
              profileId: Number(row.profile_id),
              lastReadAt: String(row.last_read_at),
            };
            readReceiptListeners.forEach((fn) => {
              try {
                fn(receipt);
              } catch {}
            });
          }
          // Only refresh full conversation list on membership insert/delete or mute toggle
          if (payload.eventType !== 'UPDATE' || row.is_muted !== payload.old?.is_muted) {
            conversationListeners.forEach((fn) => {
              try {
                fn();
              } catch (err) {
                console.warn('Conversation listener error:', err);
              }
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        () => {
          conversationListeners.forEach((fn) => {
            try {
              fn();
            } catch {}
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        (payload: any) => {
          const eventType = payload.eventType === 'DELETE' ? 'DELETE' : 'INSERT';
          const row = eventType === 'DELETE' ? payload.old : payload.new;
          if (!row?.message_id || !row?.profile_id || !row?.emoji) return;
          const event: ReactionChangeEvent = {
            eventType,
            reaction: {
              messageId: String(row.message_id),
              profileId: Number(row.profile_id),
              emoji: String(row.emoji),
              createdAt: row.created_at ?? undefined,
            },
          };
          reactionListeners.forEach((fn) => {
            try {
              fn(event);
            } catch {}
          });
        }
      )
      .subscribe((status) => {
        if (sharedDbSyncChannel !== channel) return;
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('SUBSCRIBED');
        } else if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setRealtimeStatus(
            typeof navigator !== 'undefined' && navigator.onLine === false ? 'OFFLINE' : 'CLOSED'
          );
          scheduleDbSyncReconnect();
        } else {
          setRealtimeStatus('CONNECTING');
        }
      });

    return channel;
  } catch (err) {
    console.warn('Failed to initialize Supabase Realtime DB sync channel:', err);
    setRealtimeStatus('CLOSED');
    sharedDbSyncChannel = null;
    scheduleDbSyncReconnect();
    return null;
  }
}

/** Forces an immediate teardown & reconnection of the Realtime sync channel. */
export function forceReconnectMessagingRealtime(): void {
  if (!isSupabaseConfigured) return;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempt = 0;
  if (sharedDbSyncChannel) {
    try {
      void supabase.removeChannel(sharedDbSyncChannel);
    } catch {}
    sharedDbSyncChannel = null;
  }
  getOrCreateMessagesChannel();
}

/**
 * Joins or reuses a per-conversation scoped Realtime channel (`conversation-room:<id>`)
 * exclusively for ephemeral typing indicators inside that specific thread.
 */
function acquireConversationRoom(conversationId: string): ScopedRoomEntry | null {
  if (!isSupabaseConfigured || !conversationId) return null;

  const existing = scopedRoomChannels.get(conversationId);
  if (existing) return existing;

  const listeners = new Set<(data: { conversationId: string; profileId: number; fullName: string }) => void>();
  const annotationSessionListeners = new Set<(session: ActiveDmAnnotationSession) => void>();
  const channel = supabase.channel(`conversation-room:${conversationId}`, {
    config: {
      broadcast: { self: false },
    },
  });

  channel
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (!payload || String(payload.conversationId) !== conversationId) return;
      listeners.forEach((fn) => {
        try {
          fn({
            conversationId,
            profileId: Number(payload.profileId || 0),
            fullName: String(payload.fullName || 'Colleague'),
          });
        } catch {}
      });
    })
    .on('broadcast', { event: 'annotation_session' }, ({ payload }) => {
      if (!payload || String(payload.conversationId) !== conversationId) return;
      const session: ActiveDmAnnotationSession = {
        conversationId,
        sessionKey: String(payload.sessionKey || ''),
        imageUrl: String(payload.imageUrl || ''),
        sourceMessageId: payload.sourceMessageId ? String(payload.sourceMessageId) : null,
        hostProfileId: Number(payload.hostProfileId || 0),
        hostName: String(payload.hostName || 'SZMC Colleague'),
        startedAt: Number(payload.startedAt || Date.now()),
        active: Boolean(payload.active),
      };
      if (!session.sessionKey || !session.imageUrl) return;
      annotationSessionListeners.forEach((fn) => {
        try {
          fn(session);
        } catch {}
      });
    })
    .subscribe();

  const entry: ScopedRoomEntry = { channel, listeners, annotationSessionListeners };
  scopedRoomChannels.set(conversationId, entry);
  return entry;
}

function releaseConversationRoomIfUnused(conversationId: string) {
  const entry = scopedRoomChannels.get(conversationId);
  if (!entry || entry.listeners.size > 0 || entry.annotationSessionListeners.size > 0) return;
  try {
    void supabase.removeChannel(entry.channel);
  } catch {}
  scopedRoomChannels.delete(conversationId);
}

/**
 * Sends a typing indicator strictly to the active conversation's scoped room channel.
 * Unrelated users never subscribe to this room and never receive the event.
 */
export function sendTypingIndicator(conversationId: string, profileId: number, fullName: string) {
  if (!isSupabaseConfigured || !conversationId) return;
  const room = scopedRoomChannels.get(conversationId);
  if (!room) return;
  try {
    void room.channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { conversationId, profileId, fullName },
    });
  } catch {}
}

/**
 * Subscribes to typing indicators strictly inside `conversationId`'s isolated room.
 * Automatically leaves and cleans up the room channel when unsubscribed.
 */
export function subscribeToTypingStatus(
  conversationId: string | null | undefined,
  onTyping: (data: { conversationId: string; profileId: number; fullName: string }) => void
): () => void {
  if (!conversationId || !isSupabaseConfigured) {
    return () => {};
  }
  const room = acquireConversationRoom(conversationId);
  if (!room) return () => {};
  room.listeners.add(onTyping);
  return () => {
    room.listeners.delete(onTyping);
    releaseConversationRoomIfUnused(conversationId);
  };
}

// ---------------------------------------------------------------------------
// 11C. SHARED CANVAS ANNOTATION REALTIME (DM-SCOPED COLLABORATION ROOMS)
// ---------------------------------------------------------------------------
export function createAnnotationSessionKey(sourceMessageId?: string | null, imageUrl?: string): string {
  const input = (imageUrl || '').trim();
  if (input) {
    let hash1 = 2166136261;
    let hash2 = 5381;
    for (let i = 0; i < input.length; i += 1) {
      const ch = input.charCodeAt(i);
      hash1 ^= ch;
      hash1 = Math.imul(hash1, 16777619);
      hash2 = Math.imul(hash2, 33) ^ ch;
    }
    return `img-${(hash1 >>> 0).toString(36)}${(hash2 >>> 0).toString(36)}`;
  }
  if (sourceMessageId && !sourceMessageId.startsWith('temp-')) {
    return `msg-${sourceMessageId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  }
  return 'img-shared';
}

export function subscribeToDmAnnotationSession(
  conversationId: string | null | undefined,
  onSessionChange: (session: ActiveDmAnnotationSession) => void
): () => void {
  if (!conversationId || !isSupabaseConfigured) {
    return () => {};
  }
  const room = acquireConversationRoom(conversationId);
  if (!room) return () => {};
  room.annotationSessionListeners.add(onSessionChange);
  return () => {
    room.annotationSessionListeners.delete(onSessionChange);
    releaseConversationRoomIfUnused(conversationId);
  };
}

export function broadcastDmAnnotationSession(
  conversationId: string,
  payload: Omit<ActiveDmAnnotationSession, 'conversationId'>
) {
  if (!isSupabaseConfigured || !conversationId) return;
  const room = scopedRoomChannels.get(conversationId) ?? acquireConversationRoom(conversationId);
  if (!room) return;
  try {
    void room.channel.send({
      type: 'broadcast',
      event: 'annotation_session',
      payload: {
        conversationId,
        ...payload,
      },
    });
  } catch {}
}

export interface AnnotationRoomHandlers {
  onStatusChange?: (status: 'CONNECTING' | 'SUBSCRIBED' | 'CLOSED') => void;
  onCollaboratorsChange?: (collaborators: AnnotationCollaborator[]) => void;
  onStrokePreview?: (preview: AnnotationStrokePreview) => void;
  onObjectUpsert?: (object: AnnotationObject) => void;
  onObjectDelete?: (objectId: string) => void;
  onClear?: (payload: { scope: 'all' | 'author'; authorId: number; clearedAt: number }) => void;
  onCursorMove?: (cursor: AnnotationCursor) => void;
  onSyncRequested?: (requesterId: number) => void;
  onSyncState?: (payload: { objects: AnnotationObject[]; responderId: number }) => void;
  onSavedToThread?: (payload: { saverId: number; saverName: string; savedAt: number }) => void;
}

export interface AnnotationRoomConnection {
  sendStrokePreview: (preview: AnnotationStrokePreview) => void;
  upsertObject: (object: AnnotationObject) => void;
  deleteObject: (objectId: string) => void;
  clearObjects: (scope: 'all' | 'author', authorId: number) => void;
  sendCursor: (cursor: AnnotationCursor) => void;
  requestSync: (requesterId: number) => void;
  sendSyncState: (objects: AnnotationObject[], responderId: number) => void;
  notifySaved: (saverId: number, saverName: string) => void;
  disconnect: () => void;
}

export function connectAnnotationRoom(params: {
  conversationId: string;
  sessionKey: string;
  me: AnnotationCollaborator;
  handlers: AnnotationRoomHandlers;
}): AnnotationRoomConnection {
  const { conversationId, sessionKey, me, handlers } = params;

  if (!isSupabaseConfigured || !conversationId || !sessionKey) {
    handlers.onStatusChange?.('CLOSED');
    handlers.onCollaboratorsChange?.([me]);
    return {
      sendStrokePreview: () => {},
      upsertObject: () => {},
      deleteObject: () => {},
      clearObjects: () => {},
      sendCursor: () => {},
      requestSync: () => {},
      sendSyncState: () => {},
      notifySaved: () => {},
      disconnect: () => {},
    };
  }

  handlers.onStatusChange?.('CONNECTING');
  const roomName = `annotation-room:${conversationId}:${sessionKey}`;
  const channel = supabase.channel(roomName, {
    config: {
      broadcast: { self: false },
      presence: { key: String(me.profileId) },
    },
  });

  const emitPresence = () => {
    const state = channel.presenceState<any>();
    const byId = new Map<number, AnnotationCollaborator>();
    byId.set(me.profileId, me);
    Object.values(state).forEach((entries) => {
      if (!Array.isArray(entries)) return;
      entries.forEach((entry: any) => {
        const pid = Number(entry?.profileId);
        if (!Number.isFinite(pid) || pid <= 0) return;
        byId.set(pid, {
          profileId: pid,
          fullName: String(entry.fullName || 'SZMC Doctor'),
          avatarUrl: String(entry.avatarUrl || FALLBACK_AVATAR),
          color: String(entry.color || '#0084FF'),
          joinedAt: String(entry.joinedAt || new Date().toISOString()),
        });
      });
    });
    handlers.onCollaboratorsChange?.(Array.from(byId.values()));
  };

  let closed = false;

  channel
    .on('presence', { event: 'sync' }, emitPresence)
    .on('presence', { event: 'join' }, emitPresence)
    .on('presence', { event: 'leave' }, emitPresence)
    .on('broadcast', { event: 'stroke_preview' }, ({ payload }) => {
      if (!payload || Number(payload.authorId) === me.profileId) return;
      handlers.onStrokePreview?.(payload as AnnotationStrokePreview);
    })
    .on('broadcast', { event: 'object_upsert' }, ({ payload }) => {
      if (!payload?.object || Number(payload.senderId) === me.profileId) return;
      handlers.onObjectUpsert?.(payload.object as AnnotationObject);
    })
    .on('broadcast', { event: 'object_delete' }, ({ payload }) => {
      if (!payload?.objectId || Number(payload.senderId) === me.profileId) return;
      handlers.onObjectDelete?.(String(payload.objectId));
    })
    .on('broadcast', { event: 'clear' }, ({ payload }) => {
      if (!payload || Number(payload.senderId) === me.profileId) return;
      handlers.onClear?.({
        scope: payload.scope === 'author' ? 'author' : 'all',
        authorId: Number(payload.authorId || 0),
        clearedAt: Number(payload.clearedAt || Date.now()),
      });
    })
    .on('broadcast', { event: 'cursor' }, ({ payload }) => {
      if (!payload || Number(payload.profileId) === me.profileId) return;
      handlers.onCursorMove?.(payload as AnnotationCursor);
    })
    .on('broadcast', { event: 'sync_request' }, ({ payload }) => {
      const requesterId = Number(payload?.requesterId || 0);
      if (!requesterId || requesterId === me.profileId) return;
      handlers.onSyncRequested?.(requesterId);
    })
    .on('broadcast', { event: 'sync_state' }, ({ payload }) => {
      if (!payload || Number(payload.responderId) === me.profileId) return;
      if (Array.isArray(payload.objects)) {
        handlers.onSyncState?.({
          objects: payload.objects as AnnotationObject[],
          responderId: Number(payload.responderId || 0),
        });
      }
    })
    .on('broadcast', { event: 'saved' }, ({ payload }) => {
      if (!payload || Number(payload.saverId) === me.profileId) return;
      handlers.onSavedToThread?.({
        saverId: Number(payload.saverId || 0),
        saverName: String(payload.saverName || 'Colleague'),
        savedAt: Number(payload.savedAt || Date.now()),
      });
    })
    .subscribe((status) => {
      if (closed) return;
      if (status === 'SUBSCRIBED') {
        handlers.onStatusChange?.('SUBSCRIBED');
        void channel.track(me);
        emitPresence();
        void channel.send({
          type: 'broadcast',
          event: 'sync_request',
          payload: { requesterId: me.profileId },
        });
      } else if (status === 'CLOSED' || status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
        handlers.onStatusChange?.('CLOSED');
      } else {
        handlers.onStatusChange?.('CONNECTING');
      }
    });

  const safeSend = (event: string, payload: Record<string, any>) => {
    if (closed) return;
    try {
      void channel.send({
        type: 'broadcast',
        event,
        payload,
      });
    } catch {}
  };

  return {
    sendStrokePreview: (preview) => safeSend('stroke_preview', preview),
    upsertObject: (object) => safeSend('object_upsert', { object, senderId: me.profileId }),
    deleteObject: (objectId) => safeSend('object_delete', { objectId, senderId: me.profileId }),
    clearObjects: (scope, authorId) =>
      safeSend('clear', { scope, authorId, clearedAt: Date.now(), senderId: me.profileId }),
    sendCursor: (cursor) => safeSend('cursor', cursor),
    requestSync: (requesterId) => safeSend('sync_request', { requesterId }),
    sendSyncState: (objects, responderId) => safeSend('sync_state', { objects, responderId }),
    notifySaved: (saverId, saverName) =>
      safeSend('saved', { saverId, saverName, savedAt: Date.now() }),
    disconnect: () => {
      closed = true;
      try {
        void channel.untrack();
        void supabase.removeChannel(channel);
      } catch {}
    },
  };
}

// ---------------------------------------------------------------------------
// 11B. REAL SUPABASE REALTIME PRESENCE ('messenger-presence')
//      Replaces hardcoded green dots and mock Active Now trays with live state
//      and broadcasts real-time doctor clinical status ('On Duty', 'In OT', etc.).
// ---------------------------------------------------------------------------
interface SelfPresencePayload {
  profileId: number;
  appProfileId?: number;
  fullName: string;
  avatarUrl: string;
  batchYear: number;
  clinicalStatus: ClinicalStatusKey | null;
  onlineAt: string;
  statusUpdatedAt: string | null;
}

let presenceChannel: RealtimeChannel | null = null;
let presenceTrackedProfileId: number | null = null;
let lastSelfPresencePayload: SelfPresencePayload | null = null;
const onlineUsersMap = new Map<number, OnlinePresenceUser>();
const presenceListeners = new Set<(users: OnlinePresenceUser[]) => void>();

function emitPresenceSnapshot() {
  const snapshot = Array.from(onlineUsersMap.values()).sort((a, b) =>
    a.fullName.localeCompare(b.fullName)
  );
  presenceListeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch {}
  });
}

function rebuildPresenceMapFromChannel(channel: RealtimeChannel) {
  onlineUsersMap.clear();
  const state = channel.presenceState<any>();
  Object.values(state).forEach((presences) => {
    if (!Array.isArray(presences)) return;
    presences.forEach((entry: any) => {
      const pid = Number(entry?.profileId);
      if (!Number.isFinite(pid) || pid <= 0) return;
      const appPid = Number(entry?.appProfileId);
      const rawStatus = entry?.clinicalStatus;
      onlineUsersMap.set(pid, {
        profileId: pid,
        appProfileId: Number.isFinite(appPid) && appPid > 0 ? appPid : undefined,
        fullName: String(entry.fullName || 'SZMC Alumnus'),
        avatarUrl: String(entry.avatarUrl || FALLBACK_AVATAR),
        batchYear: Number(entry.batchYear) || 20,
        onlineAt: String(entry.onlineAt || new Date().toISOString()),
        clinicalStatus: isValidClinicalStatus(rawStatus) ? rawStatus : null,
        statusUpdatedAt: typeof entry?.statusUpdatedAt === 'string' ? entry.statusUpdatedAt : null,
      });
    });
  });
  emitPresenceSnapshot();
}

export function getOnlineUsers(): OnlinePresenceUser[] {
  return Array.from(onlineUsersMap.values());
}

export function getOnlineProfileIds(): Set<number> {
  return new Set(onlineUsersMap.keys());
}

export function findOnlinePresenceUser(
  users: OnlinePresenceUser[],
  targetProfileId?: number | null
): OnlinePresenceUser | undefined {
  if (!targetProfileId || !Number.isFinite(targetProfileId)) return undefined;
  return users.find(
    (u) => u.profileId === targetProfileId || (u.appProfileId !== undefined && u.appProfileId === targetProfileId)
  );
}

export function getUserClinicalStatus(profileId?: number | null): {
  online: boolean;
  clinicalStatus: ClinicalStatusKey | null;
} {
  if (!profileId || !Number.isFinite(profileId)) {
    return { online: false, clinicalStatus: null };
  }
  const direct = onlineUsersMap.get(profileId);
  if (direct) {
    return { online: true, clinicalStatus: direct.clinicalStatus ?? null };
  }
  for (const user of onlineUsersMap.values()) {
    if (user.appProfileId === profileId) {
      return { online: true, clinicalStatus: user.clinicalStatus ?? null };
    }
  }
  return { online: false, clinicalStatus: null };
}

export function updateMyClinicalStatus(
  status: ClinicalStatusKey | null,
  profileHint?: number | null
): void {
  if (presenceTrackedProfileId) {
    saveClinicalStatus(presenceTrackedProfileId, status);
  }
  if (profileHint) {
    saveClinicalStatus(profileHint, status);
  }
  if (lastSelfPresencePayload?.appProfileId) {
    saveClinicalStatus(lastSelfPresencePayload.appProfileId, status);
  }

  const nowIso = new Date().toISOString();
  if (lastSelfPresencePayload) {
    lastSelfPresencePayload = {
      ...lastSelfPresencePayload,
      clinicalStatus: status,
      statusUpdatedAt: status ? nowIso : null,
    };
  }

  const targetId = presenceTrackedProfileId ?? profileHint ?? null;
  if (targetId) {
    const existing = onlineUsersMap.get(targetId);
    if (existing || lastSelfPresencePayload) {
      onlineUsersMap.set(targetId, {
        profileId: targetId,
        appProfileId: lastSelfPresencePayload?.appProfileId ?? existing?.appProfileId,
        fullName: lastSelfPresencePayload?.fullName ?? existing?.fullName ?? 'SZMC Alumnus',
        avatarUrl: lastSelfPresencePayload?.avatarUrl ?? existing?.avatarUrl ?? FALLBACK_AVATAR,
        batchYear: lastSelfPresencePayload?.batchYear ?? existing?.batchYear ?? 20,
        onlineAt: lastSelfPresencePayload?.onlineAt ?? existing?.onlineAt ?? nowIso,
        clinicalStatus: status,
        statusUpdatedAt: status ? nowIso : null,
      });
      emitPresenceSnapshot();
    }
  }

  if (presenceChannel && lastSelfPresencePayload) {
    try {
      void presenceChannel.track(lastSelfPresencePayload);
    } catch {
      /* ignore transient track error when reconnecting */
    }
  }
}

export function subscribeToOnlinePresence(
  selfProfile: {
    profileId: number;
    appProfileId?: number;
    fullName: string;
    avatarUrl: string;
    batchYear: number;
    clinicalStatus?: ClinicalStatusKey | null;
  } | null,
  onOnlineUsersChange: (users: OnlinePresenceUser[]) => void
): () => void {
  presenceListeners.add(onOnlineUsersChange);
  onOnlineUsersChange(getOnlineUsers());

  if (!isSupabaseConfigured || !selfProfile || !selfProfile.profileId) {
    return () => {
      presenceListeners.delete(onOnlineUsersChange);
    };
  }

  // If the tracked profile changed (e.g. resolved from alumni_profiles.id -> profiles.id), recreate presence channel
  if (presenceChannel && presenceTrackedProfileId !== selfProfile.profileId) {
    try {
      void supabase.removeChannel(presenceChannel);
    } catch {}
    presenceChannel = null;
    presenceTrackedProfileId = null;
  }

  const resolvedInitialStatus =
    selfProfile.clinicalStatus !== undefined
      ? selfProfile.clinicalStatus
      : lastSelfPresencePayload?.profileId === selfProfile.profileId
      ? lastSelfPresencePayload.clinicalStatus
      : loadSavedClinicalStatus(selfProfile.profileId) ??
        loadSavedClinicalStatus(selfProfile.appProfileId);

  const nextPayload: SelfPresencePayload = {
    profileId: selfProfile.profileId,
    appProfileId: selfProfile.appProfileId,
    fullName: selfProfile.fullName || 'SZMC Alumnus',
    avatarUrl: selfProfile.avatarUrl || FALLBACK_AVATAR,
    batchYear: selfProfile.batchYear || 20,
    clinicalStatus: resolvedInitialStatus ?? null,
    onlineAt: lastSelfPresencePayload?.onlineAt || new Date().toISOString(),
    statusUpdatedAt:
      lastSelfPresencePayload?.clinicalStatus === (resolvedInitialStatus ?? null)
        ? lastSelfPresencePayload?.statusUpdatedAt ?? null
        : resolvedInitialStatus
        ? new Date().toISOString()
        : null,
  };
  lastSelfPresencePayload = nextPayload;

  if (!presenceChannel) {
    presenceTrackedProfileId = selfProfile.profileId;
    const channel = supabase.channel('messenger-presence', {
      config: {
        presence: { key: String(selfProfile.profileId) },
      },
    });
    presenceChannel = channel;

    channel
      .on('presence', { event: 'sync' }, () => rebuildPresenceMapFromChannel(channel))
      .on('presence', { event: 'join' }, () => rebuildPresenceMapFromChannel(channel))
      .on('presence', { event: 'leave' }, () => rebuildPresenceMapFromChannel(channel))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          const payloadToTrack = lastSelfPresencePayload ?? nextPayload;
          void channel.track(payloadToTrack);
          void touchMyLastSeen();
        }
      });
  } else {
    // Re-track only if metadata changed on an already-subscribed channel
    try {
      void presenceChannel.track(nextPayload);
    } catch {}
  }

  return () => {
    presenceListeners.delete(onOnlineUsersChange);
    if (presenceListeners.size === 0 && presenceChannel) {
      const ch = presenceChannel;
      presenceChannel = null;
      presenceTrackedProfileId = null;
      lastSelfPresencePayload = null;
      onlineUsersMap.clear();
      void touchMyLastSeen();
      try {
        void ch.untrack();
        void supabase.removeChannel(ch);
      } catch {}
    }
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

export function subscribeToRealtimeReconnect(onReconnect: () => void): () => void {
  realtimeReconnectListeners.add(onReconnect);
  return () => {
    realtimeReconnectListeners.delete(onReconnect);
  };
}

export function subscribeToReadReceipts(onReceipt: (receipt: ReadReceiptEvent) => void): () => void {
  readReceiptListeners.add(onReceipt);
  getOrCreateMessagesChannel();
  return () => {
    readReceiptListeners.delete(onReceipt);
  };
}

export function subscribeToReactionChanges(onChange: (event: ReactionChangeEvent) => void): () => void {
  reactionListeners.add(onChange);
  getOrCreateMessagesChannel();
  return () => {
    reactionListeners.delete(onChange);
  };
}

export function getRealtimeChannelStatus(): MessagingRealtimeStatus {
  return realtimeChannelStatus;
}

export function subscribeToMessageChanges(
  onChange: (message: ChatMessage, meta: MessageChangeMeta) => void
): () => void {
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

/** Tears down the DB sync channel, presence channel, and all scoped rooms (sign-out / account switch). */
export function closeMessagingRealtime() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempt = 0;
  hasSubscribedOnce = false;
  if (sharedDbSyncChannel) {
    try {
      void supabase.removeChannel(sharedDbSyncChannel);
    } catch {}
    sharedDbSyncChannel = null;
  }
  if (presenceChannel) {
    try {
      void presenceChannel.untrack();
      void supabase.removeChannel(presenceChannel);
    } catch {}
    presenceChannel = null;
    presenceTrackedProfileId = null;
    onlineUsersMap.clear();
  }
  for (const [, entry] of scopedRoomChannels) {
    try {
      void supabase.removeChannel(entry.channel);
    } catch {}
  }
  scopedRoomChannels.clear();
  setRealtimeStatus(isSupabaseConfigured ? 'CONNECTING' : 'OFFLINE');
}
