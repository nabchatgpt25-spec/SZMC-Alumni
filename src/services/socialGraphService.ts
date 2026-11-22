import { supabase, isSupabaseConfigured } from '../lib/supabase';

export type ConnectionRelationshipStatus =
  | 'none'
  | 'connected'
  | 'outgoing_pending'
  | 'incoming_pending';

export interface ConnectionRecord {
  id: number;
  userId: number;
  friendId: number;
  status: 'pending' | 'accepted' | 'rejected' | 'blocked';
  createdAt: string;
  peer: {
    id: number;
    fullName: string;
    avatarUrl: string;
    batchYear?: number;
    profession?: string;
    institution?: string;
  };
}

export interface FollowProfileSummary {
  id: number;
  fullName: string;
  avatarUrl: string;
  batchYear?: number;
  profession?: string;
  followedAt: string;
}

export interface SocialGraphSnapshot {
  connectionStatus: ConnectionRelationshipStatus;
  connectionId: number | null;
  isFollowing: boolean;
  followersCount: number;
  followingCount: number;
  connectionsCount: number;
}

const LOCAL_FOLLOWS_KEY = 'szmc_quad_local_follows_v1';
const LOCAL_CONNECTIONS_KEY = 'szmc_quad_local_connections_v1';

function readLocalSet(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalSet(key: string, items: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(new Set(items))));
  } catch {}
}

/**
 * Fetches all profile IDs that `userId` follows via public.user_follows.
 * Used by Following and For You feed ranking alongside accepted connections.
 */
export async function fetchFollowedUserIds(userId?: number): Promise<number[]> {
  if (!userId) return [];
  const localKey = `${userId}:`;
  const localFollowed = readLocalSet(LOCAL_FOLLOWS_KEY)
    .filter((entry) => entry.startsWith(localKey))
    .map((entry) => Number(entry.slice(localKey.length)))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!isSupabaseConfigured) return localFollowed;

  try {
    const { data, error } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', userId);

    if (!error && Array.isArray(data)) {
      const dbIds = data.map((r: any) => Number(r.following_id)).filter(Boolean);
      return Array.from(new Set([...dbIds, ...localFollowed]));
    }
  } catch {
    // Graceful fallback before migration 024 is applied
  }
  return localFollowed;
}

/**
 * Fetches relationship state between `myUserId` and `targetUserId` plus social counts for `targetUserId`.
 */
export async function fetchSocialGraphSnapshot(
  myUserId: number | undefined,
  targetUserId: number
): Promise<SocialGraphSnapshot> {
  const defaultSnap: SocialGraphSnapshot = {
    connectionStatus: 'none',
    connectionId: null,
    isFollowing: false,
    followersCount: 0,
    followingCount: 0,
    connectionsCount: 0,
  };

  if (!targetUserId) return defaultSnap;

  const localFollowKey = myUserId ? `${myUserId}:${targetUserId}` : '';
  const localFollows = readLocalSet(LOCAL_FOLLOWS_KEY);
  const localIsFollowing = Boolean(localFollowKey && localFollows.includes(localFollowKey));

  if (!isSupabaseConfigured) {
    return {
      ...defaultSnap,
      isFollowing: localIsFollowing,
      followersCount: localIsFollowing ? 1 : 0,
    };
  }

  try {
    const [connBetweenRes, connCountRes, followersRes, followingRes, myFollowRes] = await Promise.all([
      myUserId && myUserId !== targetUserId
        ? supabase
            .from('connections')
            .select('id, user_id, friend_id, status')
            .or(
              `and(user_id.eq.${myUserId},friend_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},friend_id.eq.${myUserId})`
            )
            .in('status', ['pending', 'accepted'])
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from('connections')
        .select('id', { count: 'exact', head: true })
        .or(`user_id.eq.${targetUserId},friend_id.eq.${targetUserId}`)
        .eq('status', 'accepted'),
      supabase
        .from('user_follows')
        .select('id', { count: 'exact', head: true })
        .eq('following_id', targetUserId),
      supabase
        .from('user_follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', targetUserId),
      myUserId && myUserId !== targetUserId
        ? supabase
            .from('user_follows')
            .select('id')
            .eq('follower_id', myUserId)
            .eq('following_id', targetUserId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    let connectionStatus: ConnectionRelationshipStatus = 'none';
    let connectionId: number | null = null;
    const row = (connBetweenRes as any)?.data;
    if (row) {
      connectionId = Number(row.id);
      if (row.status === 'accepted') {
        connectionStatus = 'connected';
      } else if (row.status === 'pending') {
        connectionStatus =
          Number(row.user_id) === myUserId ? 'outgoing_pending' : 'incoming_pending';
      }
    }

    const followRow = (myFollowRes as any)?.data;
    const isFollowing = Boolean(followRow?.id) || localIsFollowing;

    return {
      connectionStatus,
      connectionId,
      isFollowing,
      followersCount: typeof (followersRes as any)?.count === 'number' ? (followersRes as any).count : (isFollowing ? 1 : 0),
      followingCount: typeof (followingRes as any)?.count === 'number' ? (followingRes as any).count : 0,
      connectionsCount: typeof (connCountRes as any)?.count === 'number' ? (connCountRes as any).count : 0,
    };
  } catch {
    return {
      ...defaultSnap,
      isFollowing: localIsFollowing,
    };
  }
}

export async function sendConnectionRequest(
  myUserId: number,
  targetUserId: number,
  myFullName?: string
): Promise<{ success: boolean; connectionId?: number; error?: string }> {
  if (!myUserId || !targetUserId || myUserId === targetUserId) {
    return { success: false, error: 'Invalid connection target.' };
  }

  if (!isSupabaseConfigured) {
    const entries = readLocalSet(LOCAL_CONNECTIONS_KEY);
    writeLocalSet(LOCAL_CONNECTIONS_KEY, [...entries, `${myUserId}->${targetUserId}:pending`]);
    return { success: true };
  }

  try {
    // Check if an existing row exists (e.g., previously rejected)
    const { data: existing } = await supabase
      .from('connections')
      .select('id, user_id, friend_id, status')
      .or(
        `and(user_id.eq.${myUserId},friend_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},friend_id.eq.${myUserId})`
      )
      .maybeSingle();

    if (existing) {
      if (existing.status === 'accepted') {
        return { success: true, connectionId: Number(existing.id) };
      }
      if (existing.status === 'pending') {
        return { success: true, connectionId: Number(existing.id) };
      }
      // Remove stale rejected row before re-requesting
      await supabase.from('connections').delete().eq('id', existing.id);
    }

    const { data, error } = await supabase
      .from('connections')
      .insert({
        user_id: myUserId,
        friend_id: targetUserId,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    // Notify target user
    try {
      await supabase.from('notifications').insert({
        recipient_id: targetUserId,
        actor_id: myUserId,
        type: 'connection_request',
        title: 'New Connection Request',
        message: `${myFullName || 'An SZMC alumnus'} sent you a connection request.`,
        target_route: 'profile',
        unread: true,
      });
    } catch {}

    return { success: true, connectionId: Number(data.id) };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to send request.' };
  }
}

export async function respondToConnectionRequest(
  connectionId: number,
  decision: 'accepted' | 'rejected',
  myUserId: number,
  requesterUserId?: number,
  myFullName?: string
): Promise<{ success: boolean; error?: string }> {
  if (!connectionId) return { success: false, error: 'Missing connection ID.' };
  if (!isSupabaseConfigured) return { success: true };

  try {
    if (decision === 'rejected') {
      const { error } = await supabase
        .from('connections')
        .delete()
        .eq('id', connectionId);
      if (error) return { success: false, error: error.message };
      return { success: true };
    }

    const { error } = await supabase
      .from('connections')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', connectionId);

    if (error) return { success: false, error: error.message };

    if (requesterUserId && requesterUserId !== myUserId) {
      try {
        await supabase.from('notifications').insert({
          recipient_id: requesterUserId,
          actor_id: myUserId,
          type: 'connection_accepted',
          title: 'Connection Accepted',
          message: `${myFullName || 'An SZMC alumnus'} accepted your connection request.`,
          target_route: 'profile',
          unread: true,
        });
      } catch {}
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to respond to request.' };
  }
}

export async function removeConnection(
  myUserId: number,
  targetUserId: number,
  connectionId?: number | null
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { success: true };

  try {
    if (connectionId) {
      const { error } = await supabase.from('connections').delete().eq('id', connectionId);
      if (!error) return { success: true };
    }
    const { error } = await supabase
      .from('connections')
      .delete()
      .or(
        `and(user_id.eq.${myUserId},friend_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},friend_id.eq.${myUserId})`
      );
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to remove connection.' };
  }
}

export async function toggleFollowUser(
  myUserId: number,
  targetUserId: number,
  currentlyFollowing: boolean,
  myFullName?: string
): Promise<{ success: boolean; isFollowing: boolean; error?: string }> {
  if (!myUserId || !targetUserId || myUserId === targetUserId) {
    return { success: false, isFollowing: currentlyFollowing, error: 'Cannot follow yourself.' };
  }

  const pairKey = `${myUserId}:${targetUserId}`;
  const currentLocal = readLocalSet(LOCAL_FOLLOWS_KEY);

  if (currentlyFollowing) {
    writeLocalSet(LOCAL_FOLLOWS_KEY, currentLocal.filter((k) => k !== pairKey));
    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('user_follows')
          .delete()
          .eq('follower_id', myUserId)
          .eq('following_id', targetUserId);
      } catch {}
    }
    return { success: true, isFollowing: false };
  } else {
    writeLocalSet(LOCAL_FOLLOWS_KEY, [...currentLocal, pairKey]);
    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from('user_follows')
          .insert({ follower_id: myUserId, following_id: targetUserId });
        if (!error) {
          try {
            await supabase.from('notifications').insert({
              recipient_id: targetUserId,
              actor_id: myUserId,
              type: 'new_follower',
              title: 'New Follower',
              message: `${myFullName || 'An SZMC alumnus'} started following your updates on The Quad.`,
              target_route: 'profile',
              unread: true,
            });
          } catch {}
        }
      } catch {}
    }
    return { success: true, isFollowing: true };
  }
}

export async function fetchMyNetworkSummary(myUserId: number): Promise<{
  acceptedConnections: ConnectionRecord[];
  incomingRequests: ConnectionRecord[];
  outgoingRequests: ConnectionRecord[];
  followers: FollowProfileSummary[];
  following: FollowProfileSummary[];
}> {
  const empty = {
    acceptedConnections: [],
    incomingRequests: [],
    outgoingRequests: [],
    followers: [],
    following: [],
  };
  if (!myUserId || !isSupabaseConfigured) return empty;

  try {
    const [connsRes, followersRes, followingRes] = await Promise.all([
      supabase
        .from('connections')
        .select('id, user_id, friend_id, status, created_at')
        .or(`user_id.eq.${myUserId},friend_id.eq.${myUserId}`)
        .in('status', ['pending', 'accepted'])
        .order('created_at', { ascending: false }),
      supabase
        .from('user_follows')
        .select('follower_id, created_at')
        .eq('following_id', myUserId)
        .order('created_at', { ascending: false }),
      supabase
        .from('user_follows')
        .select('following_id, created_at')
        .eq('follower_id', myUserId)
        .order('created_at', { ascending: false }),
    ]);

    const rawConns = Array.isArray(connsRes.data) ? connsRes.data : [];
    const rawFollowers = Array.isArray(followersRes.data) ? followersRes.data : [];
    const rawFollowing = Array.isArray(followingRes.data) ? followingRes.data : [];

    const peerIds = new Set<number>();
    rawConns.forEach((c: any) => {
      const peerId = Number(c.user_id) === myUserId ? Number(c.friend_id) : Number(c.user_id);
      if (peerId) peerIds.add(peerId);
    });
    rawFollowers.forEach((f: any) => { if (f.follower_id) peerIds.add(Number(f.follower_id)); });
    rawFollowing.forEach((f: any) => { if (f.following_id) peerIds.add(Number(f.following_id)); });

    const profileMap = new Map<number, any>();
    if (peerIds.size > 0) {
      const { data: profiles } = await supabase
        .from('alumni_profiles')
        .select('id, full_name, avatar_url, batch_year, profession, institution')
        .in('id', Array.from(peerIds));
      (profiles || []).forEach((p: any) => profileMap.set(Number(p.id), p));
    }

    const toPeer = (id: number) => {
      const p = profileMap.get(id);
      return {
        id,
        fullName: p?.full_name || 'SZMC Alumnus',
        avatarUrl: p?.avatar_url || '/assets/aistudio/images__1__2778177d.png',
        batchYear: p?.batch_year ? Number(p.batch_year) : undefined,
        profession: p?.profession || undefined,
        institution: p?.institution || undefined,
      };
    };

    const acceptedConnections: ConnectionRecord[] = [];
    const incomingRequests: ConnectionRecord[] = [];
    const outgoingRequests: ConnectionRecord[] = [];

    for (const c of rawConns as any[]) {
      const peerId = Number(c.user_id) === myUserId ? Number(c.friend_id) : Number(c.user_id);
      const record: ConnectionRecord = {
        id: Number(c.id),
        userId: Number(c.user_id),
        friendId: Number(c.friend_id),
        status: c.status,
        createdAt: c.created_at,
        peer: toPeer(peerId),
      };
      if (c.status === 'accepted') {
        acceptedConnections.push(record);
      } else if (c.status === 'pending') {
        if (Number(c.friend_id) === myUserId) incomingRequests.push(record);
        else outgoingRequests.push(record);
      }
    }

    const followers: FollowProfileSummary[] = (rawFollowers as any[]).map((f) => ({
      ...toPeer(Number(f.follower_id)),
      followedAt: f.created_at,
    }));

    const following: FollowProfileSummary[] = (rawFollowing as any[]).map((f) => ({
      ...toPeer(Number(f.following_id)),
      followedAt: f.created_at,
    }));

    return { acceptedConnections, incomingRequests, outgoingRequests, followers, following };
  } catch {
    return empty;
  }
}
