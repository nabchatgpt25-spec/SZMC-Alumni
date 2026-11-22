import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clock,
  MousePointerClick,
  Compass,
  Search,
  Download,
  RefreshCw,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Layers,
  AlertTriangle,
  Radio,
  Code2,
  User as UserIcon,
  ArrowRight,
  ScrollText,
  ExternalLink,
} from 'lucide-react';
import {
  activityTracker,
  type RawActivityEvent,
} from '../../services/activityTracker';
import { useAuth } from '../../context/AuthContext';
import { useAdminVisualMode } from './adminVisualModes';

const LOCAL_ROUTE_LABELS: Record<string, string> = {
  feed: 'The Quad (Feed)',
  dashboard: 'The Quad (Feed)',
  alumni: 'Alumni Directory',
  directory: 'Alumni Directory',
  find: 'Find Alumni',
  batches: 'MBBS Batches',
  map: 'Global Alumni Map',
  'map-directory': 'Global Alumni Map',
  careers: 'Medical Careers',
  mentorship: 'Mentorship Hub',
  events: 'Events & Reunions',
  gallery: 'Heritage Gallery',
  messages: 'Messenger',
  emergency: 'Blood Lifeline',
  blood: 'Blood Lifeline',
  'blood-network': 'Blood Lifeline',
  profile: 'Doctor Profile',
  saved: 'Saved Posts',
  settings: 'Profile Settings',
  'profile-settings': 'Profile Settings',
  contact: 'Contact Secretariat',
  admin: 'Admin Console',
  landing: 'Landing Page',
  entry: 'Direct Entry',
  exit: 'Session Exit',
};

function resolveClientRouteLabel(route: string): string {
  const clean = (route || 'landing').split(':')[0].split('?')[0].toLowerCase().trim();
  return LOCAL_ROUTE_LABELS[clean] || clean.charAt(0).toUpperCase() + clean.slice(1);
}

export interface JourneyUserOption {
  userKey: string;
  profileId: number | null;
  userName: string;
  userEmail?: string | null;
  batchYear?: number | null;
  isOnlineNow?: boolean;
  totalClicks?: number;
  totalDwellSec?: number;
}

interface ServerSessionSummary {
  session_id: string;
  started_at: string;
  last_active_at: string;
  total_duration_sec: number;
  total_clicks: number;
  total_page_views: number;
  max_scroll_pct: number;
  device_type: string;
  browser: string;
  os: string;
  screen_resolution: string | null;
  current_route: string;
}

interface ServerTimelineEvent {
  id: string;
  session_id: string;
  profile_id: number | null;
  user_name: string;
  event_type: string;
  route: string;
  route_label: string;
  element_tag: string | null;
  element_label: string | null;
  element_section: string | null;
  click_x_pct: number | null;
  click_y_pct: number | null;
  duration_sec: number;
  scroll_depth_pct: number;
  metadata: Record<string, any>;
  created_at: string;
}

interface NormalizedJourneyEvent {
  id: string;
  sessionId: string;
  eventType: string;
  route: string;
  routeLabel: string;
  componentName: string;
  elementTag: string | null;
  elementLabel: string | null;
  clickXPct: number | null;
  clickYPct: number | null;
  durationSec: number;
  scrollDepthPct: number;
  metadata: Record<string, any>;
  createdAt: string;
  source: 'live_tracker' | 'server_db';
}

export interface UserSessionJourneyProps {
  /** Available monitored users for selection in Super Admin */
  users: JourneyUserOption[];
  /** Controlled selected userKey (or 'live_local' for direct live activityTracker stream) */
  selectedUserKey?: string | null;
  /** Callback when user changes selection inside the viewer */
  onSelectUserKey?: (userKey: string) => void;
  /** Optional callback to open an alumni profile */
  onViewProfile?: (profileId: number) => void;
}

function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec || 0));
  if (sec < 60) return `${sec}s`;
  const mins = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (mins < 60) return `${mins}m ${remSec}s`;
  const hrs = Math.floor(mins / 60);
  const remMin = mins % 60;
  return `${hrs}h ${remMin}m`;
}

function formatClockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeCsvCell(val: unknown): string {
  const raw = String(val ?? '');
  const neutralized = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function normalizeRawEvent(ev: RawActivityEvent): NormalizedJourneyEvent {
  const componentName =
    ev.elementSection ||
    (ev.metadata?.component ? String(ev.metadata.component) : null) ||
    ev.routeLabel ||
    resolveClientRouteLabel(ev.route);
  return {
    id: ev.id,
    sessionId: ev.sessionId,
    eventType: ev.eventType,
    route: ev.route,
    routeLabel: ev.routeLabel || resolveClientRouteLabel(ev.route),
    componentName,
    elementTag: ev.elementTag,
    elementLabel: ev.elementLabel,
    clickXPct: ev.clickXPct,
    clickYPct: ev.clickYPct,
    durationSec: ev.durationSec || 0,
    scrollDepthPct: ev.scrollDepthPct || 0,
    metadata: ev.metadata || {},
    createdAt: ev.createdAt,
    source: 'live_tracker',
  };
}

function normalizeServerEvent(ev: ServerTimelineEvent): NormalizedJourneyEvent {
  const componentName =
    ev.element_section ||
    (ev.metadata?.component ? String(ev.metadata.component) : null) ||
    ev.route_label ||
    resolveClientRouteLabel(ev.route);
  return {
    id: ev.id,
    sessionId: ev.session_id,
    eventType: ev.event_type,
    route: ev.route,
    routeLabel: ev.route_label || resolveClientRouteLabel(ev.route),
    componentName,
    elementTag: ev.element_tag,
    elementLabel: ev.element_label,
    clickXPct: ev.click_x_pct,
    clickYPct: ev.click_y_pct,
    durationSec: ev.duration_sec || 0,
    scrollDepthPct: ev.scroll_depth_pct || 0,
    metadata: ev.metadata || {},
    createdAt: ev.created_at,
    source: 'server_db',
  };
}

export const UserSessionJourney: React.FC<UserSessionJourneyProps> = ({
  users,
  selectedUserKey: controlledUserKey,
  onSelectUserKey,
  onViewProfile,
}) => {
  const { getAuthHeaders, currentUser } = useAuth();
  const [visualMode] = useAdminVisualMode();
  const isNeon = visualMode === 'neon_aura';

  const [internalUserKey, setInternalUserKey] = useState<string>('live_local');
  const activeUserKey = controlledUserKey || internalUserKey;

  const setActiveUserKey = (nextKey: string) => {
    setInternalUserKey(nextKey);
    onSelectUserKey?.(nextKey);
  };

  // Live raw events directly from activityTracker
  const [liveRawEvents, setLiveRawEvents] = useState<RawActivityEvent[]>(() =>
    typeof (activityTracker as any)?.getRawSessionEvents === 'function'
      ? activityTracker.getRawSessionEvents()
      : []
  );

  // Server-persisted raw session events for selected remote/historical user
  const [serverEvents, setServerEvents] = useState<ServerTimelineEvent[]>([]);
  const [serverSessions, setServerSessions] = useState<ServerSessionSummary[]>([]);
  const [serverUserMeta, setServerUserMeta] = useState<{
    profileId: number | null;
    userName: string;
    userEmail: string | null;
    batchYear: number | null;
    device: string;
    browser: string;
    os: string;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & view options
  const [selectedSessionId, setSelectedSessionId] = useState<string>('all');
  const [eventFilter, setEventFilter] = useState<'all' | 'page_visit' | 'click' | 'dwell' | 'scroll_search'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [chronologicalAsc, setChronologicalAsc] = useState<boolean>(true);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Subscribe to real-time raw events directly from activityTracker
  useEffect(() => {
    if (typeof (activityTracker as any)?.subscribe !== 'function') return;
    return activityTracker.subscribe((events) => {
      setLiveRawEvents(events);
    });
  }, []);

  // Fetch server raw journey for a selected monitored user
  const fetchSelectedUserJourney = useCallback(
    async (userKey: string) => {
      if (!userKey || userKey === 'live_local') {
        setServerEvents([]);
        setServerSessions([]);
        setServerUserMeta(null);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/admin/telemetry/user/${encodeURIComponent(userKey)}`, {
          method: 'GET',
          headers,
        });
        if (!res.ok) {
          throw new Error('Could not load session journey for selected user.');
        }
        const json = await res.json();
        setServerEvents(Array.isArray(json.timeline) ? json.timeline : []);
        setServerSessions(Array.isArray(json.sessions) ? json.sessions : []);
        if (json.summary) {
          setServerUserMeta({
            profileId: json.summary.profileId ?? null,
            userName: json.summary.userName || 'Monitored User',
            userEmail: json.summary.userEmail || null,
            batchYear: json.summary.batchYear ?? null,
            device: json.summary.primaryDevice || 'desktop',
            browser: json.summary.browser || 'Unknown',
            os: json.summary.os || 'Unknown',
          });
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load user session journey.');
      } finally {
        setLoading(false);
      }
    },
    [getAuthHeaders]
  );

  useEffect(() => {
    setSelectedSessionId('all');
    setExpandedEventId(null);
    void fetchSelectedUserJourney(activeUserKey);
  }, [activeUserKey, fetchSelectedUserJourney]);

  // Merge live activityTracker raw stream when inspecting live_local or the current signed-in user
  const allNormalizedEvents = useMemo<NormalizedJourneyEvent[]>(() => {
    if (activeUserKey === 'live_local') {
      return liveRawEvents.map(normalizeRawEvent);
    }

    const fromServer = serverEvents.map(normalizeServerEvent);
    const isViewingSelf =
      (serverUserMeta?.profileId && serverUserMeta.profileId === currentUser.id) ||
      activeUserKey === `profile:${currentUser.id}`;

    if (!isViewingSelf) {
      return fromServer;
    }

    // Merge live unsynced activityTracker raw events cleanly by timestamp/type deduplication
    const seenKeys = new Set(
      fromServer.map((e) => `${e.sessionId}|${e.eventType}|${e.route}|${e.createdAt.slice(0, 19)}`)
    );
    const merged = [...fromServer];
    for (const raw of liveRawEvents) {
      const k = `${raw.sessionId}|${raw.eventType}|${raw.route}|${raw.createdAt.slice(0, 19)}`;
      if (!seenKeys.has(k)) {
        seenKeys.add(k);
        merged.push(normalizeRawEvent(raw));
      }
    }
    return merged;
  }, [activeUserKey, liveRawEvents, serverEvents, serverUserMeta?.profileId, currentUser.id]);

  // Extract available sessions from the events / serverSessions
  const sessionOptions = useMemo(() => {
    const map = new Map<
      string,
      { sessionId: string; startedAt: string; eventCount: number; totalDwellSec: number; device: string }
    >();

    for (const s of serverSessions) {
      map.set(s.session_id, {
        sessionId: s.session_id,
        startedAt: s.started_at,
        eventCount: s.total_clicks + s.total_page_views,
        totalDwellSec: s.total_duration_sec,
        device: `${s.device_type} · ${s.browser}`,
      });
    }

    const liveInfo =
      typeof (activityTracker as any)?.getCurrentSessionInfo === 'function'
        ? activityTracker.getCurrentSessionInfo()
        : { sessionId: '', deviceType: 'desktop', browser: 'Browser', user: {} as any };
    for (const ev of allNormalizedEvents) {
      const existing = map.get(ev.sessionId);
      if (!existing) {
        map.set(ev.sessionId, {
          sessionId: ev.sessionId,
          startedAt: ev.createdAt,
          eventCount: 1,
          totalDwellSec: ev.durationSec,
          device:
            ev.sessionId === liveInfo.sessionId
              ? `${liveInfo.deviceType} · ${liveInfo.browser}`
              : 'Session',
        });
      } else {
        if (ev.createdAt < existing.startedAt) existing.startedAt = ev.createdAt;
        if (ev.source === 'live_tracker') {
          existing.eventCount += 1;
          existing.totalDwellSec += ev.durationSec;
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [allNormalizedEvents, serverSessions]);

  // Events scoped to the selected session, sorted chronologically ascending for dwell & delta computation
  const sessionScopedChronological = useMemo(() => {
    const scoped =
      selectedSessionId === 'all'
        ? allNormalizedEvents
        : allNormalizedEvents.filter((e) => e.sessionId === selectedSessionId);
    return [...scoped].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [allNormalizedEvents, selectedSessionId]);

  // Compute exact time spent on each Component / UI Section & each Page Visit
  const componentTimeBreakdown = useMemo(() => {
    const compMap = new Map<
      string,
      { component: string; routeLabel: string; dwellSec: number; clicks: number; visits: number }
    >();

    for (let i = 0; i < sessionScopedChronological.length; i++) {
      const ev = sessionScopedChronological[i];
      const next = sessionScopedChronological[i + 1];
      const compName = ev.componentName || ev.routeLabel;
      const existing = compMap.get(compName) || {
        component: compName,
        routeLabel: ev.routeLabel,
        dwellSec: 0,
        clicks: 0,
        visits: 0,
      };

      if (ev.eventType === 'page_view') existing.visits += 1;
      if (ev.eventType === 'click' || ev.eventType === 'rage_click' || ev.eventType === 'post_interaction') {
        existing.clicks += 1;
      }

      // Use explicit active dwell duration if logged, or bounded inter-event delta within same session
      if (ev.durationSec > 0) {
        existing.dwellSec += ev.durationSec;
      } else if (next && next.sessionId === ev.sessionId && ev.eventType === 'page_view') {
        const deltaSec = Math.round((Date.parse(next.createdAt) - Date.parse(ev.createdAt)) / 1000);
        if (deltaSec > 0 && deltaSec <= 180) {
          existing.dwellSec += deltaSec;
        }
      }

      compMap.set(compName, existing);
    }

    return Array.from(compMap.values()).sort(
      (a, b) => b.dwellSec * 2 + b.clicks * 4 + b.visits * 2 - (a.dwellSec * 2 + a.clicks * 4 + a.visits * 2)
    );
  }, [sessionScopedChronological]);

  // Compute page visit sequence summary
  const pageVisitSequence = useMemo(() => {
    return sessionScopedChronological.filter((ev) => ev.eventType === 'page_view');
  }, [sessionScopedChronological]);

  // Attach inter-step delta seconds (+Xs since previous action)
  const enrichedTimeline = useMemo(() => {
    const withDeltas = sessionScopedChronological.map((ev, idx) => {
      const prev = idx > 0 ? sessionScopedChronological[idx - 1] : null;
      let deltaFromPrevSec: number | null = null;
      if (prev && prev.sessionId === ev.sessionId) {
        const diff = Math.round((Date.parse(ev.createdAt) - Date.parse(prev.createdAt)) / 1000);
        if (Number.isFinite(diff) && diff >= 0 && diff <= 3600) {
          deltaFromPrevSec = diff;
        }
      }
      return { ...ev, deltaFromPrevSec, stepIndex: idx + 1 };
    });

    const filtered = withDeltas.filter((ev) => {
      if (eventFilter === 'page_visit' && ev.eventType !== 'page_view' && ev.eventType !== 'profile_view') {
        return false;
      }
      if (
        eventFilter === 'click' &&
        ev.eventType !== 'click' &&
        ev.eventType !== 'rage_click' &&
        ev.eventType !== 'post_interaction' &&
        ev.eventType !== 'ad_click'
      ) {
        return false;
      }
      if (eventFilter === 'dwell' && ev.eventType !== 'page_leave' && ev.eventType !== 'session_heartbeat') {
        return false;
      }
      if (eventFilter === 'scroll_search' && ev.eventType !== 'scroll_milestone' && ev.eventType !== 'search') {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hay = [
          ev.eventType,
          ev.route,
          ev.routeLabel,
          ev.componentName,
          ev.elementLabel || '',
          ev.elementTag || '',
          JSON.stringify(ev.metadata || {}),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return chronologicalAsc ? filtered : [...filtered].reverse();
  }, [sessionScopedChronological, eventFilter, searchQuery, chronologicalAsc]);

  const journeyTotals = useMemo(() => {
    const totalClicks = sessionScopedChronological.filter(
      (e) => e.eventType === 'click' || e.eventType === 'rage_click' || e.eventType === 'post_interaction'
    ).length;
    const totalPageVisits = pageVisitSequence.length;
    const totalDwellSec = componentTimeBreakdown.reduce((sum, c) => sum + c.dwellSec, 0);
    const totalComponents = componentTimeBreakdown.length;
    return { totalClicks, totalPageVisits, totalDwellSec, totalComponents };
  }, [sessionScopedChronological, pageVisitSequence.length, componentTimeBreakdown]);

  const activeUserDisplayName = useMemo(() => {
    if (activeUserKey === 'live_local') {
      const info =
        typeof (activityTracker as any)?.getCurrentSessionInfo === 'function'
          ? activityTracker.getCurrentSessionInfo()
          : { user: {} as any };
      return `${info.user?.userName || currentUser.fullName || 'Current Admin'} (Live Stream)`;
    }
    if (serverUserMeta?.userName) return serverUserMeta.userName;
    const match = users.find((u) => u.userKey === activeUserKey);
    return match?.userName || 'Selected User';
  }, [activeUserKey, currentUser.fullName, serverUserMeta?.userName, users]);

  const handleExportJourneyCsv = () => {
    const header = [
      'Step',
      'Timestamp',
      'Session ID',
      'Event Type',
      'Page Route',
      'Page Label',
      'Component / Section',
      'Element Tag',
      'Clicked Label',
      'Duration (sec)',
      'Scroll Depth (%)',
      'Click X (%)',
      'Click Y (%)',
      'Delta From Prev (sec)',
    ];
    const rows = enrichedTimeline.map((ev) => [
      ev.stepIndex,
      ev.createdAt,
      ev.sessionId,
      ev.eventType,
      ev.route,
      ev.routeLabel,
      ev.componentName,
      ev.elementTag || '',
      ev.elementLabel || '',
      ev.durationSec,
      ev.scrollDepthPct,
      ev.clickXPct ?? '',
      ev.clickYPct ?? '',
      ev.deltaFromPrevSec ?? '',
    ]);
    const csv = [header, ...rows].map((r) => r.map(escapeCsvCell).join(',')).join('\n');
    const slug = activeUserDisplayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 36);
    downloadFile(`session-journey-${slug}.csv`, csv, 'text/csv;charset=utf-8');
  };

  const handleExportJourneyJson = () => {
    const slug = activeUserDisplayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 36);
    downloadFile(
      `session-journey-${slug}.json`,
      JSON.stringify(
        {
          user: activeUserDisplayName,
          sessionId: selectedSessionId,
          totals: journeyTotals,
          componentTimeBreakdown,
          events: enrichedTimeline,
        },
        null,
        2
      ),
      'application/json'
    );
  };

  const cardCls = isNeon
    ? 'bg-[#081229]/85 border border-cyan-400/20 rounded-2xl text-slate-100 shadow-[0_0_24px_-12px_rgba(34,211,238,0.22)]'
    : 'bg-white border border-slate-200/80 rounded-xl text-slate-900 shadow-xs';
  const mutedTextCls = isNeon ? 'text-slate-400' : 'text-slate-500';
  const headingTextCls = isNeon ? 'text-white' : 'text-slate-900';
  const subtleSurfaceCls = isNeon ? 'bg-slate-950/65 border-white/10' : 'bg-slate-50 border-slate-200/75';
  const dividerCls = isNeon ? 'border-white/10' : 'border-slate-200/75';

  const getEventDescriptor = (eventType: string) => {
    switch (eventType) {
      case 'page_view':
        return { label: 'Page Visit', color: 'text-[#038fde] dark:text-cyan-300', Icon: Compass };
      case 'page_leave':
      case 'session_heartbeat':
        return { label: 'Component Dwell', color: 'text-amber-600 dark:text-amber-300', Icon: Clock };
      case 'click':
      case 'post_interaction':
      case 'ad_click':
        return { label: 'Navigation Click', color: 'text-teal-600 dark:text-teal-300', Icon: MousePointerClick };
      case 'rage_click':
        return { label: 'Rage Click', color: 'text-rose-600 dark:text-rose-400', Icon: AlertTriangle };
      case 'scroll_milestone':
        return { label: 'Scroll Depth', color: 'text-indigo-600 dark:text-indigo-300', Icon: ScrollText };
      case 'search':
        return { label: 'Search Query', color: 'text-violet-600 dark:text-violet-300', Icon: Search };
      case 'profile_view':
        return { label: 'Profile Visit', color: 'text-emerald-600 dark:text-emerald-300', Icon: UserIcon };
      default:
        return { label: eventType.replace('_', ' '), color: mutedTextCls, Icon: Layers };
    }
  };

  return (
    <div className="space-y-5">
      {/* Control Header: Select User, Select Session & Export */}
      <div className={`${cardCls} p-4 sm:p-5 space-y-4`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={`text-sm sm:text-base font-bold tracking-tight ${headingTextCls}`}>
                User Session Journey Viewer
              </h3>
              <span className={`text-xs ${mutedTextCls}`}>·</span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[#038fde] dark:text-cyan-300">
                <Radio className="w-3.5 h-3.5" />
                Raw activityTracker Telemetry
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${mutedTextCls}`}>
              Step-by-step chronological replay of navigation clicks, exact time spent per UI component, and page visits.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {serverUserMeta?.profileId && onViewProfile && (
              <button
                type="button"
                onClick={() => onViewProfile(serverUserMeta.profileId!)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer whitespace-nowrap ${subtleSurfaceCls} ${headingTextCls}`}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>View Profile</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void fetchSelectedUserJourney(activeUserKey)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer whitespace-nowrap ${subtleSurfaceCls} ${headingTextCls}`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Sync</span>
            </button>

            <button
              type="button"
              onClick={handleExportJourneyCsv}
              disabled={enrichedTimeline.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#038fde] hover:bg-[#027bc0] disabled:opacity-50 text-white cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={handleExportJourneyJson}
              disabled={enrichedTimeline.length === 0}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer whitespace-nowrap ${subtleSurfaceCls} ${headingTextCls}`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>JSON</span>
            </button>
          </div>
        </div>

        {/* User Selector + Session Picker Row */}
        <div className={`pt-3 border-t ${dividerCls} grid grid-cols-1 md:grid-cols-2 gap-3`}>
          <div>
            <label className={`block text-[11px] font-semibold mb-1 ${mutedTextCls}`}>
              Selected User Stream
            </label>
            <select
              value={activeUserKey}
              onChange={(e) => setActiveUserKey(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border text-xs font-medium cursor-pointer focus:outline-none focus:border-[#038fde] ${subtleSurfaceCls} ${headingTextCls}`}
            >
              <option value="live_local">
                Live Current Browser Session ({liveRawEvents.length} raw activityTracker events)
              </option>
              {users.map((u) => (
                <option key={u.userKey} value={u.userKey}>
                  {u.userName}
                  {u.batchYear ? ` · Batch ${u.batchYear}` : ''}
                  {u.isOnlineNow ? ' (Online)' : ''}
                  {typeof u.totalClicks === 'number' ? ` — ${u.totalClicks} clicks` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={`block text-[11px] font-semibold mb-1 ${mutedTextCls}`}>
              Session Scope ({sessionOptions.length} recorded)
            </label>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border text-xs font-medium cursor-pointer focus:outline-none focus:border-[#038fde] ${subtleSurfaceCls} ${headingTextCls}`}
            >
              <option value="all">All Recorded Sessions ({allNormalizedEvents.length} events)</option>
              {sessionOptions.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>
                  {formatShortDate(s.startedAt)} · {s.device} · {formatDuration(s.totalDwellSec)} ({s.sessionId.slice(0, 14)})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Compact Journey Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Page Visits', value: journeyTotals.totalPageVisits.toLocaleString() },
            { label: 'Navigation Clicks', value: journeyTotals.totalClicks.toLocaleString() },
            { label: 'Components Interacted', value: journeyTotals.totalComponents.toLocaleString() },
            { label: 'Total Tracked Dwell', value: formatDuration(journeyTotals.totalDwellSec) },
          ].map((stat) => (
            <div key={stat.label} className={`p-3 rounded-lg border ${subtleSurfaceCls}`}>
              <div className={`text-[11px] font-medium ${mutedTextCls}`}>{stat.label}</div>
              <div className={`text-lg font-extrabold font-mono tabular-nums mt-0.5 ${headingTextCls}`}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Main Split: Component Dwell Breakdown (Left) + Chronological Journey Log (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left Column: Time Spent on Each Component + Page Visit Breadcrumb Trail */}
        <div className="xl:col-span-4 space-y-5">
          {/* Time Spent on Each Component */}
          <div className={`${cardCls} p-4 sm:p-5 space-y-3`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className={`text-sm font-bold ${headingTextCls}`}>Time Spent per Component</h4>
                <p className={`text-xs ${mutedTextCls}`}>
                  Active dwell and click depth per UI module
                </p>
              </div>
              <Layers className="w-4 h-4 text-[#038fde] shrink-0" />
            </div>

            <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
              {componentTimeBreakdown.map((comp) => {
                const maxDwell = Math.max(1, ...componentTimeBreakdown.map((c) => c.dwellSec));
                const pct = comp.dwellSec > 0 ? Math.max(10, Math.round((comp.dwellSec / maxDwell) * 100)) : 6;
                return (
                  <div key={comp.component} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className={`font-semibold truncate ${headingTextCls}`} title={comp.component}>
                        {comp.component}
                      </span>
                      <span className="font-mono tabular-nums font-bold text-[#038fde] shrink-0">
                        {formatDuration(comp.dwellSec)}
                      </span>
                    </div>
                    <div className={`h-1.5 w-full rounded-full overflow-hidden ${isNeon ? 'bg-slate-800' : 'bg-slate-100'}`}>
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#038fde] to-teal-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className={`text-[11px] flex items-center justify-between ${mutedTextCls}`}>
                      <span className="truncate">{comp.routeLabel}</span>
                      <span className="font-mono tabular-nums shrink-0">
                        {comp.clicks} clicks · {comp.visits} visits
                      </span>
                    </div>
                  </div>
                );
              })}
              {componentTimeBreakdown.length === 0 && (
                <div className={`py-8 text-center text-xs ${mutedTextCls}`}>
                  No component dwell recorded for this selection yet.
                </div>
              )}
            </div>
          </div>

          {/* Page Visit Breadcrumb Trail */}
          <div className={`${cardCls} p-4 sm:p-5 space-y-3`}>
            <div>
              <h4 className={`text-sm font-bold ${headingTextCls}`}>Page Visit Sequence</h4>
              <p className={`text-xs ${mutedTextCls}`}>
                Ordered navigation trail ({pageVisitSequence.length} visits)
              </p>
            </div>
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {pageVisitSequence.slice(-20).map((pv, idx) => (
                <div
                  key={pv.id}
                  className={`flex items-center justify-between gap-2 text-xs py-1.5 px-2.5 rounded-lg border ${subtleSurfaceCls}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`font-mono tabular-nums text-[11px] ${mutedTextCls}`}>
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 truncate">
                      {pv.metadata?.fromRoute && pv.metadata.fromRoute !== 'entry' && (
                        <span className={`text-[11px] ${mutedTextCls}`}>
                          {resolveClientRouteLabel(String(pv.metadata.fromRoute))}
                          <ArrowRight className="w-3 h-3 inline mx-1 opacity-70" />
                        </span>
                      )}
                      <span className={`font-semibold ${headingTextCls}`}>{pv.routeLabel}</span>
                    </div>
                  </div>
                  <span className={`font-mono tabular-nums text-[11px] shrink-0 ${mutedTextCls}`}>
                    {formatClockTime(pv.createdAt)}
                  </span>
                </div>
              ))}
              {pageVisitSequence.length === 0 && (
                <div className={`py-6 text-center text-xs ${mutedTextCls}`}>
                  Navigate to another page to see the route sequence appear live.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Full Chronological Log of Navigation Clicks, Dwell & Page Visits */}
        <div className={`${cardCls} xl:col-span-8 overflow-hidden`}>
          {/* Log Filter Toolbar */}
          <div className={`p-4 border-b ${dividerCls} space-y-3`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className={`text-sm font-bold ${headingTextCls}`}>
                  Chronological Session Log — {activeUserDisplayName}
                </h4>
                <p className={`text-xs ${mutedTextCls}`}>
                  Showing {enrichedTimeline.length} of {sessionScopedChronological.length} raw events
                </p>
              </div>

              <button
                type="button"
                onClick={() => setChronologicalAsc((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer whitespace-nowrap self-start sm:self-auto ${subtleSurfaceCls} ${headingTextCls}`}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span>{chronologicalAsc ? 'Order: Start → Latest' : 'Order: Latest → Start'}</span>
              </button>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
              {/* Segmented Event Type Filter */}
              <div className={`inline-flex items-center gap-1 p-1 rounded-lg border overflow-x-auto ${subtleSurfaceCls}`}>
                {[
                  { id: 'all', label: 'All Steps' },
                  { id: 'page_visit', label: 'Page Visits' },
                  { id: 'click', label: 'Navigation Clicks' },
                  { id: 'dwell', label: 'Component Dwell' },
                  { id: 'scroll_search', label: 'Scroll & Search' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setEventFilter(f.id as any)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      eventFilter === f.id
                        ? isNeon
                          ? 'bg-cyan-500/25 text-cyan-200'
                          : 'bg-white text-[#003366] shadow-xs'
                        : `${mutedTextCls} hover:text-slate-900 dark:hover:text-white`
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Search within journey */}
              <div className="relative md:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by component, route, button..."
                  className={`w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs focus:outline-none focus:border-[#038fde] ${subtleSurfaceCls} ${headingTextCls}`}
                />
              </div>
            </div>
          </div>

          {/* Chronological Timeline List */}
          <div className={`max-h-[620px] overflow-y-auto divide-y ${dividerCls}`}>
            {loading ? (
              <div className={`py-14 text-center text-xs ${mutedTextCls}`}>
                Loading raw session telemetry...
              </div>
            ) : enrichedTimeline.length === 0 ? (
              <div className={`py-14 text-center text-xs ${mutedTextCls}`}>
                No matching session journey events yet. Click around the portal or switch users above to inspect live logs.
              </div>
            ) : (
              enrichedTimeline.map((ev) => {
                const { label, color, Icon } = getEventDescriptor(ev.eventType);
                const isExpanded = expandedEventId === ev.id;
                return (
                  <div key={ev.id} className="px-4 py-3 hover:bg-slate-500/5 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Step Index & Clock */}
                        <div className="w-20 shrink-0 pt-0.5">
                          <div className={`text-xs font-mono tabular-nums font-semibold ${headingTextCls}`}>
                            {formatClockTime(ev.createdAt)}
                          </div>
                          <div className={`text-[11px] font-mono tabular-nums ${mutedTextCls}`}>
                            #{ev.stepIndex}
                            {ev.deltaFromPrevSec !== null ? ` · +${ev.deltaFromPrevSec}s` : ''}
                          </div>
                        </div>

                        {/* Action Details */}
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
                            <span className={`font-bold ${color}`}>{label}</span>
                            <span className={mutedTextCls}>·</span>
                            <span className={`font-semibold ${headingTextCls}`}>{ev.routeLabel}</span>
                            {ev.componentName && ev.componentName !== ev.routeLabel && (
                              <>
                                <span className={mutedTextCls}>/</span>
                                <span className={mutedTextCls}>{ev.componentName}</span>
                              </>
                            )}
                          </div>

                          <div className={`text-xs ${mutedTextCls} flex flex-wrap items-center gap-x-2.5 gap-y-0.5`}>
                            {ev.elementLabel && (
                              <span>
                                Target:{' '}
                                <strong className={headingTextCls}>
                                  {ev.elementTag ? `<${ev.elementTag}> ` : ''}
                                  {ev.elementLabel}
                                </strong>
                              </span>
                            )}
                            {ev.metadata?.fromRoute && ev.eventType === 'page_view' && (
                              <span>
                                From: <strong className={headingTextCls}>{resolveClientRouteLabel(String(ev.metadata.fromRoute))}</strong>
                              </span>
                            )}
                            {ev.durationSec > 0 && (
                              <span className="font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-300">
                                {formatDuration(ev.durationSec)} spent
                              </span>
                            )}
                            {ev.scrollDepthPct > 0 && (
                              <span className="font-mono tabular-nums">
                                Scroll {ev.scrollDepthPct}%
                              </span>
                            )}
                            {ev.clickXPct !== null && ev.clickYPct !== null && (
                              <span className="font-mono tabular-nums text-[11px]">
                                Coords ({ev.clickXPct}%, {ev.clickYPct}%)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Raw Payload Inspector Toggle */}
                      <button
                        type="button"
                        onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border cursor-pointer shrink-0 ${subtleSurfaceCls} ${mutedTextCls} hover:text-slate-900 dark:hover:text-white`}
                      >
                        <span>Raw</span>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>

                    {isExpanded && (
                      <pre
                        className={`mt-2.5 ml-0 sm:ml-23 p-3 rounded-lg border text-[11px] font-mono overflow-x-auto ${subtleSurfaceCls} ${mutedTextCls}`}
                      >
                        {JSON.stringify(
                          {
                            id: ev.id,
                            source: ev.source,
                            sessionId: ev.sessionId,
                            eventType: ev.eventType,
                            route: ev.route,
                            componentName: ev.componentName,
                            elementTag: ev.elementTag,
                            elementLabel: ev.elementLabel,
                            durationSec: ev.durationSec,
                            scrollDepthPct: ev.scrollDepthPct,
                            clickCoordsPct:
                              ev.clickXPct !== null ? { x: ev.clickXPct, y: ev.clickYPct } : null,
                            metadata: ev.metadata,
                            createdAt: ev.createdAt,
                          },
                          null,
                          2
                        )}
                      </pre>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserSessionJourney;
