import React, { useState, useEffect, useCallback } from 'react';
import {
  UserPlus,
  UserCheck,
  UserMinus,
  Clock,
  Check,
  X,
  Users,
  Rss,
  Loader2,
} from 'lucide-react';
import {
  fetchSocialGraphSnapshot,
  fetchMyNetworkSummary,
  sendConnectionRequest,
  respondToConnectionRequest,
  removeConnection,
  toggleFollowUser,
  type SocialGraphSnapshot,
  type ConnectionRecord,
  type FollowProfileSummary,
} from '../../services/socialGraphService';

interface SocialGraphActionsProps {
  myUserId?: number;
  myFullName?: string;
  targetUserId: number;
  isLoggedIn: boolean;
  onStatusChanged?: () => void;
}

export const SocialGraphActions: React.FC<SocialGraphActionsProps> = ({
  myUserId,
  myFullName,
  targetUserId,
  isLoggedIn,
  onStatusChanged,
}) => {
  const [snap, setSnap] = useState<SocialGraphSnapshot>({
    connectionStatus: 'none',
    connectionId: null,
    isFollowing: false,
    followersCount: 0,
    followingCount: 0,
    connectionsCount: 0,
  });
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    const data = await fetchSocialGraphSnapshot(isLoggedIn ? myUserId : undefined, targetUserId);
    setSnap(data);
  }, [isLoggedIn, myUserId, targetUserId]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  if (!isLoggedIn || !myUserId || myUserId === targetUserId) {
    return null;
  }

  const handleConnect = async () => {
    setBusyAction('connect');
    const res = await sendConnectionRequest(myUserId, targetUserId, myFullName);
    if (res.success) {
      setSnap((prev) => ({
        ...prev,
        connectionStatus: 'outgoing_pending',
        connectionId: res.connectionId ?? prev.connectionId,
      }));
      onStatusChanged?.();
    }
    setBusyAction(null);
  };

  const handleAccept = async () => {
    if (!snap.connectionId) return;
    setBusyAction('accept');
    const res = await respondToConnectionRequest(
      snap.connectionId,
      'accepted',
      myUserId,
      targetUserId,
      myFullName
    );
    if (res.success) {
      setSnap((prev) => ({
        ...prev,
        connectionStatus: 'connected',
        connectionsCount: prev.connectionsCount + 1,
      }));
      onStatusChanged?.();
    }
    setBusyAction(null);
  };

  const handleDecline = async () => {
    if (!snap.connectionId) return;
    setBusyAction('decline');
    const res = await respondToConnectionRequest(
      snap.connectionId,
      'rejected',
      myUserId,
      targetUserId,
      myFullName
    );
    if (res.success) {
      setSnap((prev) => ({
        ...prev,
        connectionStatus: 'none',
        connectionId: null,
      }));
      onStatusChanged?.();
    }
    setBusyAction(null);
  };

  const handleRemove = async () => {
    setBusyAction('remove');
    const wasConnected = snap.connectionStatus === 'connected';
    const res = await removeConnection(myUserId, targetUserId, snap.connectionId);
    if (res.success) {
      setSnap((prev) => ({
        ...prev,
        connectionStatus: 'none',
        connectionId: null,
        connectionsCount: wasConnected ? Math.max(0, prev.connectionsCount - 1) : prev.connectionsCount,
      }));
      onStatusChanged?.();
    }
    setBusyAction(null);
  };

  const handleToggleFollow = async () => {
    setBusyAction('follow');
    const res = await toggleFollowUser(myUserId, targetUserId, snap.isFollowing, myFullName);
    if (res.success) {
      setSnap((prev) => ({
        ...prev,
        isFollowing: res.isFollowing,
        followersCount: res.isFollowing
          ? prev.followersCount + 1
          : Math.max(0, prev.followersCount - 1),
      }));
      onStatusChanged?.();
    }
    setBusyAction(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      {/* Connection Control */}
      {snap.connectionStatus === 'none' && (
        <button
          type="button"
          disabled={busyAction !== null}
          onClick={handleConnect}
          className="inline-flex items-center gap-1.5 min-h-[36px] px-3 sm:px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          {busyAction === 'connect' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <UserPlus className="w-3.5 h-3.5" />
          )}
          <span>Connect</span>
        </button>
      )}

      {snap.connectionStatus === 'outgoing_pending' && (
        <button
          type="button"
          disabled={busyAction !== null}
          onClick={handleRemove}
          title="Click to cancel pending connection request"
          className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-rose-600 text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Requested</span>
        </button>
      )}

      {snap.connectionStatus === 'incoming_pending' && (
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleAccept}
            className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] sm:text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Accept</span>
          </button>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleDecline}
            className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] sm:text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            <span>Decline</span>
          </button>
        </div>
      )}

      {snap.connectionStatus === 'connected' && (
        <button
          type="button"
          disabled={busyAction !== null}
          onClick={handleRemove}
          title="Connected · Click to remove connection"
          className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:border-rose-300 hover:text-rose-600 text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>Connected</span>
        </button>
      )}

      {/* Asymmetric Follow Control */}
      <button
        type="button"
        disabled={busyAction !== null}
        onClick={handleToggleFollow}
        className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl border text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
          snap.isFollowing
            ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
        }`}
      >
        <Rss className="w-3.5 h-3.5" />
        <span>{snap.isFollowing ? 'Following' : 'Follow'}</span>
      </button>
    </div>
  );
};

interface MyNetworkPanelProps {
  myUserId: number;
  myFullName?: string;
  onViewProfile?: (userId: number) => void;
}

export const MyNetworkPanel: React.FC<MyNetworkPanelProps> = ({
  myUserId,
  myFullName,
  onViewProfile,
}) => {
  const [tab, setTab] = useState<'requests' | 'connections' | 'followers' | 'following'>('requests');
  const [loading, setLoading] = useState(true);
  const [network, setNetwork] = useState<{
    acceptedConnections: ConnectionRecord[];
    incomingRequests: ConnectionRecord[];
    outgoingRequests: ConnectionRecord[];
    followers: FollowProfileSummary[];
    following: FollowProfileSummary[];
  }>({
    acceptedConnections: [],
    incomingRequests: [],
    outgoingRequests: [],
    followers: [],
    following: [],
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await fetchMyNetworkSummary(myUserId);
    setNetwork(data);
    if (data.incomingRequests.length === 0 && tab === 'requests') {
      setTab('connections');
    }
    setLoading(false);
  }, [myUserId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDecision = async (req: ConnectionRecord, decision: 'accepted' | 'rejected') => {
    await respondToConnectionRequest(req.id, decision, myUserId, req.userId, myFullName);
    await refresh();
  };

  const handleRemoveConn = async (conn: ConnectionRecord) => {
    await removeConnection(myUserId, conn.peer.id, conn.id);
    await refresh();
  };

  const tabs = [
    { id: 'requests' as const, label: 'Requests', count: network.incomingRequests.length },
    { id: 'connections' as const, label: 'Connections', count: network.acceptedConnections.length },
    { id: 'followers' as const, label: 'Followers', count: network.followers.length },
    { id: 'following' as const, label: 'Following', count: network.following.length },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Alumni Network & Follows
          </h3>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                tab === t.id
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.label}{' '}
              <span className="font-mono tabular-nums text-[11px] opacity-75">
                ({t.count})
              </span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs text-slate-500">Loading network...</div>
      ) : tab === 'requests' ? (
        network.incomingRequests.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
            No pending connection requests right now.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {network.incomingRequests.map((req) => (
              <div key={req.id} className="py-2.5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onViewProfile?.(req.peer.id)}
                  className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
                >
                  <img
                    src={req.peer.avatarUrl}
                    alt={req.peer.fullName}
                    className="w-9 h-9 rounded-full object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {req.peer.fullName}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {req.peer.batchYear ? `SZMC-${String(req.peer.batchYear).padStart(2, '0')}` : 'SZMC Alumnus'}
                      {req.peer.profession ? ` · ${req.peer.profession}` : ''}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleDecision(req, 'accepted')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDecision(req, 'rejected')}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === 'connections' ? (
        network.acceptedConnections.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
            You haven&apos;t connected with any alumni yet. Visit any alumnus profile to send a connection request.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {network.acceptedConnections.map((conn) => (
              <div key={conn.id} className="py-2.5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onViewProfile?.(conn.peer.id)}
                  className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
                >
                  <img
                    src={conn.peer.avatarUrl}
                    alt={conn.peer.fullName}
                    className="w-9 h-9 rounded-full object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {conn.peer.fullName}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {conn.peer.batchYear ? `SZMC-${String(conn.peer.batchYear).padStart(2, '0')}` : 'SZMC Alumnus'}
                      {conn.peer.profession ? ` · ${conn.peer.profession}` : ''}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveConn(conn)}
                  title="Remove connection"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer shrink-0"
                >
                  <UserMinus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Remove</span>
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        (() => {
          const list = tab === 'followers' ? network.followers : network.following;
          if (list.length === 0) {
            return (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
                {tab === 'followers'
                  ? 'No alumni are following you yet.'
                  : 'You are not following any alumni yet.'}
              </p>
            );
          }
          return (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {list.map((u) => (
                <div key={u.id} className="py-2.5 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onViewProfile?.(u.id)}
                    className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
                  >
                    <img
                      src={u.avatarUrl}
                      alt={u.fullName}
                      className="w-9 h-9 rounded-full object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {u.fullName}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {u.batchYear ? `SZMC-${String(u.batchYear).padStart(2, '0')}` : 'SZMC Alumnus'}
                        {u.profession ? ` · ${u.profession}` : ''}
                      </p>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          );
        })()
      )}
    </div>
  );
};
