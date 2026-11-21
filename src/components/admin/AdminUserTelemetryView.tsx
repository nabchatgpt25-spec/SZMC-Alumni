import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Activity,
  MousePointerClick,
  Clock,
  Users,
  Search,
  RefreshCw,
  Download,
  Target,
  Eye,
  Compass,
  Monitor,
  Smartphone,
  Tablet,
  Plus,
  Trash2,
  ExternalLink,
  X,
  ArrowUpDown,
  Radio,
  Database,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAdminVisualMode } from './adminVisualModes';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

interface RouteMetric {
  route: string;
  routeLabel: string;
  views: number;
  clicks: number;
  dwellSec: number;
  uniqueUsers: number;
  avgDwellSec: number;
}

interface ClickHotspot {
  label: string;
  tag: string;
  route: string;
  routeLabel: string;
  section: string;
  clicks: number;
  sharePct: number;
  lastClickedAt: string;
}

interface TimelineBucket {
  label: string;
  clicks: number;
  pageViews: number;
  dwellMin: number;
}

interface DeviceStat {
  name: string;
  key: string;
  value: number;
}

interface MonitoredUser {
  userKey: string;
  profileId: number | null;
  userName: string;
  userEmail: string | null;
  batchYear: number | null;
  specialty: string | null;
  city: string | null;
  country: string | null;
  isOnlineNow: boolean;
  lastActiveAt: string;
  currentRoute: string;
  currentRouteLabel: string;
  totalSessions: number;
  totalClicks: number;
  totalPageViews: number;
  totalDwellSec: number;
  maxScrollPct: number;
  topRoute: string;
  topRouteLabel: string;
  primaryDevice: string;
  browser: string;
  os: string;
  routesVisited: string[];
  inferredInterests: Array<{ label: string; score: number }>;
  routeDwellBreakdown: Array<{
    route: string;
    routeLabel: string;
    dwellSec: number;
    views: number;
    clicks: number;
  }>;
}

interface TelemetryEventRow {
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

interface AudienceSegment {
  id: string;
  name: string;
  description: string;
  target_routes: string[];
  target_interests: string[];
  target_devices: string[];
  min_clicks: number;
  min_dwell_sec: number;
  min_batch: number | null;
  max_batch: number | null;
  created_by: string;
  created_at: string;
  matchedUsersCount: number;
  matchedUserPreview: Array<{
    userKey: string;
    profileId: number | null;
    userName: string;
    batchYear: number | null;
    totalClicks: number;
    totalDwellSec: number;
  }>;
}

interface TelemetryOverviewPayload {
  supabaseConnected: boolean;
  kpis: {
    trackedUsers: number;
    onlineNow: number;
    totalSessions: number;
    totalEvents: number;
    totalClicks: number;
    totalPageViews: number;
    totalDwellSec: number;
    avgSessionSec: number;
  };
  routeMetrics: RouteMetric[];
  topClickHotspots: ClickHotspot[];
  activityTimeline: TimelineBucket[];
  deviceBreakdown: DeviceStat[];
  audienceInterests: Array<{ interest: string; userCount: number }>;
  users: MonitoredUser[];
  recentEvents: TelemetryEventRow[];
  segments: AudienceSegment[];
}

interface UserDossierPayload {
  summary: MonitoredUser;
  sessions: Array<{
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
  }>;
  timeline: TelemetryEventRow[];
  searchTerms: Array<{ query: string; route: string; createdAt: string }>;
  topClicks: Array<{ label: string; routeLabel: string; count: number }>;
}

interface AdminUserTelemetryViewProps {
  onViewProfile?: (userId: number) => void;
  externalSearch?: string;
}

const TARGETABLE_ROUTES = [
  { id: 'feed', label: 'The Quad (Feed)' },
  { id: 'alumni', label: 'Alumni Directory' },
  { id: 'batches', label: 'MBBS Batches' },
  { id: 'careers', label: 'Medical Careers' },
  { id: 'mentorship', label: 'Mentorship Hub' },
  { id: 'events', label: 'Events & Reunions' },
  { id: 'gallery', label: 'Heritage Gallery' },
  { id: 'emergency', label: 'Blood Lifeline' },
  { id: 'messages', label: 'Messenger' },
  { id: 'map', label: 'Global Map' },
];

const DEVICE_COLORS = ['#038fde', '#14b8a6', '#faad14'];

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

function formatRelativeTime(iso: string): string {
  const ms = Date.parse(iso || '');
  if (!Number.isFinite(ms)) return '—';
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 15) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function escapeCsvCell(val: unknown): string {
  const raw = String(val ?? '');
  // Prevent CSV formula injection in spreadsheet apps
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

export const AdminUserTelemetryView: React.FC<AdminUserTelemetryViewProps> = ({
  onViewProfile,
  externalSearch,
}) => {
  const { getAuthHeaders } = useAuth();
  const [visualMode] = useAdminVisualMode();
  const isNeon = visualMode === 'neon_aura';

  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'users' | 'audiences'>('overview');
  const [rangeHours, setRangeHours] = useState<number>(168);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TelemetryOverviewPayload | null>(null);

  // Filters & sorting
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [userSearch, setUserSearch] = useState<string>('');
  const [userSort, setUserSort] = useState<'recent' | 'clicks' | 'dwell' | 'views'>('recent');

  // Selected user deep-dive dossier
  const [selectedUserKey, setSelectedUserKey] = useState<string | null>(null);
  const [dossier, setDossier] = useState<UserDossierPayload | null>(null);
  const [dossierLoading, setDossierLoading] = useState<boolean>(false);

  // Audience segment builder form
  const [segName, setSegName] = useState('');
  const [segDescription, setSegDescription] = useState('');
  const [segRoutes, setSegRoutes] = useState<string[]>(['feed']);
  const [segMinClicks, setSegMinClicks] = useState<number>(3);
  const [segMinDwell, setSegMinDwell] = useState<number>(30);
  const [segMinBatch, setSegMinBatch] = useState<string>('');
  const [segMaxBatch, setSegMaxBatch] = useState<string>('');
  const [segDevices, setSegDevices] = useState<string[]>([]);
  const [savingSegment, setSavingSegment] = useState<boolean>(false);
  const [segmentFeedback, setSegmentFeedback] = useState<string | null>(null);

  const effectiveUserSearch = (externalSearch !== undefined && externalSearch.trim() ? externalSearch : userSearch)
    .trim()
    .toLowerCase();

  const fetchOverview = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/admin/telemetry/overview?rangeHours=${rangeHours}`, {
          method: 'GET',
          headers,
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody?.error || `Telemetry API returned ${res.status}`);
        }
        const json: TelemetryOverviewPayload = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err?.message || 'Unable to load behavioral telemetry data.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [getAuthHeaders, rangeHours]
  );

  const fetchDossier = useCallback(
    async (userKey: string) => {
      setSelectedUserKey(userKey);
      setDossierLoading(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/admin/telemetry/user/${encodeURIComponent(userKey)}`, {
          method: 'GET',
          headers,
        });
        if (!res.ok) throw new Error('Could not load user activity dossier.');
        const json: UserDossierPayload = await res.json();
        setDossier(json);
      } catch {
        setDossier(null);
      } finally {
        setDossierLoading(false);
      }
    },
    [getAuthHeaders]
  );

  useEffect(() => {
    void fetchOverview(false);
  }, [fetchOverview]);

  // Live auto-refresh polling + Supabase Realtime listener on user_activity_events
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void fetchOverview(true);
    }, 6000);

    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (isSupabaseConfigured) {
      try {
        channel = supabase
          .channel('szmc-super-admin-telemetry-stream')
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'user_activity_events' },
            () => {
              void fetchOverview(true);
            }
          )
          .subscribe();
      } catch {
        // Polling remains active
      }
    }

    return () => {
      clearInterval(interval);
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [autoRefresh, fetchOverview]);

  const filteredUsers = useMemo(() => {
    const list = data?.users || [];
    const matched = effectiveUserSearch
      ? list.filter((u) => {
          const hay = [
            u.userName,
            u.userEmail || '',
            u.specialty || '',
            u.city || '',
            u.currentRouteLabel,
            u.topRouteLabel,
            u.batchYear ? `batch ${u.batchYear}` : '',
            ...u.inferredInterests.map((i) => i.label),
          ]
            .join(' ')
            .toLowerCase();
          return hay.includes(effectiveUserSearch);
        })
      : list;

    return [...matched].sort((a, b) => {
      if (userSort === 'clicks') return b.totalClicks - a.totalClicks;
      if (userSort === 'dwell') return b.totalDwellSec - a.totalDwellSec;
      if (userSort === 'views') return b.totalPageViews - a.totalPageViews;
      if (a.isOnlineNow !== b.isOnlineNow) return a.isOnlineNow ? -1 : 1;
      return (b.lastActiveAt || '').localeCompare(a.lastActiveAt || '');
    });
  }, [data?.users, effectiveUserSearch, userSort]);

  const filteredEvents = useMemo(() => {
    const events = data?.recentEvents || [];
    if (eventFilter === 'all') return events;
    return events.filter((e) => e.event_type === eventFilter);
  }, [data?.recentEvents, eventFilter]);

  const previewSegmentMatches = useMemo(() => {
    const list = data?.users || [];
    const minB = segMinBatch.trim() ? Number(segMinBatch) : null;
    const maxB = segMaxBatch.trim() ? Number(segMaxBatch) : null;
    return list.filter((u) => {
      if (segMinClicks > 0 && u.totalClicks < segMinClicks) return false;
      if (segMinDwell > 0 && u.totalDwellSec < segMinDwell) return false;
      if (minB !== null && (!u.batchYear || u.batchYear < minB)) return false;
      if (maxB !== null && (!u.batchYear || u.batchYear > maxB)) return false;
      if (segDevices.length > 0 && !segDevices.includes(u.primaryDevice)) return false;
      if (segRoutes.length > 0) {
        const visited = new Set(u.routesVisited);
        if (!segRoutes.some((r) => visited.has(r))) return false;
      }
      return true;
    });
  }, [data?.users, segRoutes, segMinClicks, segMinDwell, segMinBatch, segMaxBatch, segDevices]);

  const handleCreateSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!segName.trim()) {
      setSegmentFeedback('Please enter an audience segment name.');
      return;
    }
    setSavingSegment(true);
    setSegmentFeedback(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/telemetry/segments', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: segName.trim(),
          description: segDescription.trim(),
          target_routes: segRoutes,
          target_devices: segDevices,
          min_clicks: segMinClicks,
          min_dwell_sec: segMinDwell,
          min_batch: segMinBatch.trim() ? Number(segMinBatch) : null,
          max_batch: segMaxBatch.trim() ? Number(segMaxBatch) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to save audience segment.');
      setSegName('');
      setSegDescription('');
      setSegmentFeedback(`Saved audience segment "${json.segment?.name}" (${previewSegmentMatches.length} matching users).`);
      await fetchOverview(true);
    } catch (err: any) {
      setSegmentFeedback(err?.message || 'Unable to save segment.');
    } finally {
      setSavingSegment(false);
    }
  };

  const handleDeleteSegment = async (id: string) => {
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/admin/telemetry/segments/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      await fetchOverview(true);
    } catch {
      // ignore
    }
  };

  const handleExportUsersCsv = (usersToExport: MonitoredUser[], label: string) => {
    const header = [
      'Full Name',
      'Email',
      'Profile ID',
      'Batch Year',
      'Specialty',
      'City',
      'Country',
      'Device',
      'Browser',
      'Sessions',
      'Total Clicks',
      'Page Views',
      'Total Dwell Seconds',
      'Top Visited Section',
      'Inferred Ad Interests',
      'Last Active',
    ];
    const rows = usersToExport.map((u) => [
      u.userName,
      u.userEmail || '',
      u.profileId ?? '',
      u.batchYear ?? '',
      u.specialty || '',
      u.city || '',
      u.country || '',
      u.primaryDevice,
      u.browser,
      u.totalSessions,
      u.totalClicks,
      u.totalPageViews,
      u.totalDwellSec,
      u.topRouteLabel,
      u.inferredInterests.map((i) => `${i.label} (${i.score}%)`).join('; '),
      u.lastActiveAt,
    ]);
    const csv = [header, ...rows].map((r) => r.map(escapeCsvCell).join(',')).join('\n');
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'audience';
    downloadFile(`szmc-ad-audience-${slug}.csv`, csv, 'text/csv;charset=utf-8');
  };

  const handleExportSegmentCsv = (seg: AudienceSegment) => {
    const allUsers = data?.users || [];
    const matched = allUsers.filter((u) => {
      if (seg.min_clicks > 0 && u.totalClicks < seg.min_clicks) return false;
      if (seg.min_dwell_sec > 0 && u.totalDwellSec < seg.min_dwell_sec) return false;
      if (seg.min_batch !== null && (!u.batchYear || u.batchYear < seg.min_batch)) return false;
      if (seg.max_batch !== null && (!u.batchYear || u.batchYear > seg.max_batch)) return false;
      if (seg.target_devices.length > 0 && !seg.target_devices.includes(u.primaryDevice)) return false;
      if (seg.target_routes.length > 0) {
        const visited = new Set(u.routesVisited);
        if (!seg.target_routes.some((r) => visited.has(r))) return false;
      }
      return true;
    });
    handleExportUsersCsv(matched, seg.name);
  };

  // Visual theme tokens (Classic crisp white vs Neon Mode 1 cosmic glass)
  const cardCls = isNeon
    ? 'bg-[#081229]/85 border border-cyan-400/20 rounded-2xl text-slate-100 shadow-[0_0_24px_-12px_rgba(34,211,238,0.22)]'
    : 'bg-white border border-slate-200/80 rounded-xl text-slate-900 shadow-xs';
  const mutedTextCls = isNeon ? 'text-slate-400' : 'text-slate-500';
  const headingTextCls = isNeon ? 'text-white' : 'text-slate-900';
  const subtleSurfaceCls = isNeon ? 'bg-slate-950/65 border-white/10' : 'bg-slate-50 border-slate-200/75';
  const dividerCls = isNeon ? 'border-white/10' : 'border-slate-200/75';

  const kpis = data?.kpis || {
    trackedUsers: 0,
    onlineNow: 0,
    totalSessions: 0,
    totalEvents: 0,
    totalClicks: 0,
    totalPageViews: 0,
    totalDwellSec: 0,
    avgSessionSec: 0,
  };

  const renderDeviceIcon = (device: string) => {
    if (device === 'mobile') return <Smartphone className="w-3.5 h-3.5 shrink-0" />;
    if (device === 'tablet') return <Tablet className="w-3.5 h-3.5 shrink-0" />;
    return <Monitor className="w-3.5 h-3.5 shrink-0" />;
  };

  return (
    <div className="space-y-5">
      {/* Header & Controls Row */}
      <div className={`${cardCls} p-4 sm:p-5`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={`text-base sm:text-lg font-bold tracking-tight ${headingTextCls}`}>
                User Activity Intelligence &amp; Ad Audience Data Center
              </h2>
              <span className={`text-xs ${mutedTextCls}`}>·</span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                Super Admin Only
              </span>
            </div>
            <p className={`text-xs mt-1 ${mutedTextCls}`}>
              Monitor every user&apos;s page journey, click hotspots, exact time spent per section, scroll depth, and export behavioral cohorts for targeted advertising.
            </p>
          </div>

          {/* Right Toolbar */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Time Range Filter */}
            <div className={`inline-flex items-center p-1 rounded-lg border ${subtleSurfaceCls}`}>
              {[
                { label: '24h', hours: 24 },
                { label: '7d', hours: 168 },
                { label: '30d', hours: 720 },
                { label: 'All', hours: 0 },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setRangeHours(opt.hours)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    rangeHours === opt.hours
                      ? isNeon
                        ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40'
                        : 'bg-[#038fde] text-white'
                      : `${mutedTextCls} hover:text-slate-900 dark:hover:text-white`
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setAutoRefresh((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                autoRefresh
                  ? isNeon
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/35'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : `${subtleSurfaceCls} ${mutedTextCls}`
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>{autoRefresh ? 'Live Stream On' : 'Live Paused'}</span>
            </button>

            <button
              type="button"
              onClick={() => void fetchOverview(false)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${subtleSurfaceCls} ${headingTextCls} hover:opacity-85`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={() => handleExportUsersCsv(data?.users || [], 'all-monitored-users')}
              disabled={!data?.users?.length}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#038fde] hover:bg-[#027bc0] disabled:opacity-50 text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div className={`mt-4 pt-3 border-t ${dividerCls} flex flex-wrap items-center justify-between gap-3`}>
          <div className={`inline-flex items-center gap-1 p-1 rounded-lg border ${subtleSurfaceCls}`}>
            {[
              { id: 'overview', label: 'Traffic & Click Hotspots', icon: Activity },
              { id: 'users', label: `User Monitor (${kpis.trackedUsers})`, icon: Users },
              { id: 'audiences', label: `Ad Audience Builder (${data?.segments?.length || 0})`, icon: Target },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSubTab(tab.id as any)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? isNeon
                        ? 'bg-gradient-to-r from-cyan-500/30 to-violet-500/30 text-white border border-cyan-400/40'
                        : 'bg-white text-[#003366] shadow-xs'
                      : `${mutedTextCls} hover:text-slate-900 dark:hover:text-white`
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className={`flex items-center gap-2 text-xs ${mutedTextCls}`}>
            <Database className="w-3.5 h-3.5 shrink-0" />
            <span>
              {data?.supabaseConnected
                ? 'Synced with Supabase Postgres + Realtime'
                : 'Active on Server Telemetry Store (Run Migration 019 in Supabase SQL Editor for cloud Postgres persistence)'}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* 4 Primary KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            label: 'Monitored Users',
            value: kpis.trackedUsers.toLocaleString(),
            meta: `${kpis.onlineNow} active now · ${kpis.totalSessions} sessions`,
            icon: Users,
            accent: isNeon ? 'text-cyan-300 bg-cyan-500/15' : 'text-[#038fde] bg-sky-50',
          },
          {
            label: 'Total Clicks Tracked',
            value: kpis.totalClicks.toLocaleString(),
            meta: `${kpis.totalEvents.toLocaleString()} total behavioral events`,
            icon: MousePointerClick,
            accent: isNeon ? 'text-violet-300 bg-violet-500/15' : 'text-teal-600 bg-teal-50',
          },
          {
            label: 'Total Active Dwell Time',
            value: formatDuration(kpis.totalDwellSec),
            meta: `Avg ${formatDuration(kpis.avgSessionSec)} per session`,
            icon: Clock,
            accent: isNeon ? 'text-amber-300 bg-amber-500/15' : 'text-amber-600 bg-amber-50',
          },
          {
            label: 'Page Views Captured',
            value: kpis.totalPageViews.toLocaleString(),
            meta: `${data?.routeMetrics?.length || 0} portal sections visited`,
            icon: Eye,
            accent: isNeon ? 'text-emerald-300 bg-emerald-500/15' : 'text-indigo-600 bg-indigo-50',
          },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className={`${cardCls} p-4 flex items-start justify-between gap-3`}>
              <div className="min-w-0">
                <div className={`text-xs font-medium ${mutedTextCls}`}>{kpi.label}</div>
                <div className={`text-2xl font-extrabold mt-1 font-mono tabular-nums ${headingTextCls}`}>
                  {kpi.value}
                </div>
                <div className={`text-[11px] mt-1.5 ${mutedTextCls} truncate`}>{kpi.meta}</div>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${kpi.accent}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* TAB 1: TRAFFIC, DWELL TIME, CLICK HOTSPOTS & LIVE STREAM */}
      {activeSubTab === 'overview' && (
        <div className="space-y-5">
          {/* Charts Row */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* Where Users Spend Time & Click (Bar Chart) */}
            <div className={`${cardCls} p-4 sm:p-5 xl:col-span-7`}>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className={`text-sm font-bold ${headingTextCls}`}>
                    Where Users Go &amp; Spend Time
                  </h3>
                  <p className={`text-xs ${mutedTextCls}`}>
                    Dwell seconds vs click interactions across portal sections
                  </p>
                </div>
                <span className={`text-xs font-mono tabular-nums ${mutedTextCls}`}>
                  Top {Math.min(8, data?.routeMetrics?.length || 0)} routes
                </span>
              </div>
              <div className="h-[270px] w-full">
                {data?.routeMetrics && data.routeMetrics.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.routeMetrics.slice(0, 8)}
                      margin={{ top: 8, right: 12, left: -12, bottom: 24 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={isNeon ? 'rgba(148,163,184,0.12)' : '#e2e8f0'}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="routeLabel"
                        tick={{ fontSize: 11, fill: isNeon ? '#cbd5e1' : '#475569' }}
                        angle={-18}
                        textAnchor="end"
                        interval={0}
                      />
                      <YAxis tick={{ fontSize: 11, fill: isNeon ? '#94a3b8' : '#64748b' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isNeon ? '#0f172a' : '#ffffff',
                          borderColor: isNeon ? '#334155' : '#e2e8f0',
                          borderRadius: '10px',
                          fontSize: '12px',
                          color: isNeon ? '#f8fafc' : '#0f172a',
                        }}
                      />
                      <Bar dataKey="dwellSec" name="Dwell (sec)" fill="#038fde" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="clicks" name="Clicks" fill="#14b8a6" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="views" name="Page Views" fill="#faad14" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className={`h-full flex flex-col items-center justify-center text-xs ${mutedTextCls}`}>
                    <Compass className="w-7 h-7 mb-2 opacity-50" />
                    Navigate around the portal to populate section dwell &amp; click metrics.
                  </div>
                )}
              </div>
            </div>

            {/* Hourly Engagement Pulse + Device Mix */}
            <div className={`${cardCls} p-4 sm:p-5 xl:col-span-5 flex flex-col justify-between gap-4`}>
              <div>
                <h3 className={`text-sm font-bold ${headingTextCls}`}>24-Hour Activity Pulse</h3>
                <p className={`text-xs ${mutedTextCls}`}>Clicks and page views captured in 2-hour windows</p>
              </div>
              <div className="h-[165px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.activityTimeline || []} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="telemetryClicksFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#038fde" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#038fde" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={isNeon ? 'rgba(148,163,184,0.12)' : '#e2e8f0'}
                      vertical={false}
                    />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: isNeon ? '#94a3b8' : '#64748b' }} />
                    <YAxis tick={{ fontSize: 10, fill: isNeon ? '#94a3b8' : '#64748b' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isNeon ? '#0f172a' : '#ffffff',
                        borderColor: isNeon ? '#334155' : '#e2e8f0',
                        borderRadius: '10px',
                        fontSize: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="clicks"
                      name="Clicks"
                      stroke="#038fde"
                      strokeWidth={2}
                      fill="url(#telemetryClicksFill)"
                    />
                    <Area
                      type="monotone"
                      dataKey="pageViews"
                      name="Page Views"
                      stroke="#14b8a6"
                      strokeWidth={2}
                      fillOpacity={0}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Device Distribution Strip */}
              <div className={`pt-3 border-t ${dividerCls} flex items-center justify-between gap-4`}>
                <div className="w-20 h-20 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={(data?.deviceBreakdown || []).filter((d) => d.value > 0)}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={20}
                        outerRadius={34}
                        paddingAngle={3}
                      >
                        {(data?.deviceBreakdown || []).map((entry, idx) => (
                          <Cell key={entry.key} fill={DEVICE_COLORS[idx % DEVICE_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 grid grid-cols-3 gap-2 text-xs">
                  {(data?.deviceBreakdown || []).map((d, idx) => (
                    <div key={d.key} className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: DEVICE_COLORS[idx % DEVICE_COLORS.length] }}
                        />
                        <span className={`font-medium truncate ${mutedTextCls}`}>{d.name}</span>
                      </div>
                      <div className={`text-sm font-bold font-mono tabular-nums mt-0.5 ${headingTextCls}`}>
                        {d.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Two-Column Breakdown: Route Dwell Table + Top Clicked UI Hotspots */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {/* Section Dwell Breakdown */}
            <div className={`${cardCls} overflow-hidden`}>
              <div className={`px-4 py-3.5 border-b ${dividerCls} flex items-center justify-between`}>
                <h3 className={`text-sm font-bold ${headingTextCls}`}>Section Time-Spent &amp; Visit Breakdown</h3>
                <span className={`text-xs ${mutedTextCls}`}>Sorted by engagement</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className={`border-b ${dividerCls} ${mutedTextCls}`}>
                      <th className="py-2.5 px-4 font-semibold">Portal Section</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Users</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Views</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Clicks</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Total Time</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${dividerCls}`}>
                    {(data?.routeMetrics || []).slice(0, 10).map((row) => (
                      <tr key={row.route} className="hover:bg-slate-500/5 transition-colors">
                        <td className={`py-2.5 px-4 font-semibold ${headingTextCls}`}>
                          {row.routeLabel}
                          <span className={`ml-1.5 font-mono text-[11px] font-normal ${mutedTextCls}`}>
                            /{row.route}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{row.uniqueUsers}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{row.views}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{row.clicks}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-[#038fde]">
                          {formatDuration(row.dwellSec)}
                        </td>
                      </tr>
                    ))}
                    {(!data?.routeMetrics || data.routeMetrics.length === 0) && (
                      <tr>
                        <td colSpan={5} className={`py-8 text-center ${mutedTextCls}`}>
                          No route telemetry captured yet in this time window.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top Clicked UI Hotspots */}
            <div className={`${cardCls} overflow-hidden`}>
              <div className={`px-4 py-3.5 border-b ${dividerCls} flex items-center justify-between`}>
                <h3 className={`text-sm font-bold ${headingTextCls}`}>Most Clicked Buttons &amp; UI Hotspots</h3>
                <span className={`text-xs ${mutedTextCls}`}>Click share %</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className={`border-b ${dividerCls} ${mutedTextCls}`}>
                      <th className="py-2.5 px-4 font-semibold">Clicked Control</th>
                      <th className="py-2.5 px-3 font-semibold">Page</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Clicks</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${dividerCls}`}>
                    {(data?.topClickHotspots || []).slice(0, 10).map((item, idx) => (
                      <tr key={`${item.route}-${item.label}-${idx}`} className="hover:bg-slate-500/5 transition-colors">
                        <td className="py-2.5 px-4 max-w-[220px]">
                          <div className={`font-semibold truncate ${headingTextCls}`}>{item.label}</div>
                          <div className={`text-[11px] truncate ${mutedTextCls}`}>
                            {item.tag} · {item.section}
                          </div>
                        </td>
                        <td className={`py-2.5 px-3 ${mutedTextCls} whitespace-nowrap`}>{item.routeLabel}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                          {item.clicks}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-teal-600 dark:text-teal-400">
                          {item.sharePct}%
                        </td>
                      </tr>
                    ))}
                    {(!data?.topClickHotspots || data.topClickHotspots.length === 0) && (
                      <tr>
                        <td colSpan={4} className={`py-8 text-center ${mutedTextCls}`}>
                          Click any links or buttons across the app to record live click hotspots.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Live Chronological Behavioral Event Stream */}
          <div className={`${cardCls} overflow-hidden`}>
            <div className={`px-4 py-3.5 border-b ${dividerCls} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
              <div>
                <h3 className={`text-sm font-bold ${headingTextCls}`}>Live Real-Time Behavioral Event Stream</h3>
                <p className={`text-xs ${mutedTextCls}`}>
                  Every route view, click coordinate, dwell duration, scroll milestone, and search query as it happens
                </p>
              </div>
              <div className={`inline-flex items-center gap-1 p-1 rounded-lg border ${subtleSurfaceCls} overflow-x-auto`}>
                {[
                  { id: 'all', label: 'All' },
                  { id: 'page_view', label: 'Page Views' },
                  { id: 'click', label: 'Clicks' },
                  { id: 'page_leave', label: 'Dwell' },
                  { id: 'scroll_milestone', label: 'Scroll' },
                  { id: 'search', label: 'Searches' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setEventFilter(f.id)}
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
            </div>
            <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className={`border-b ${dividerCls} ${mutedTextCls}`}>
                    <th className="py-2 px-4 font-semibold">Time</th>
                    <th className="py-2 px-3 font-semibold">User</th>
                    <th className="py-2 px-3 font-semibold">Action</th>
                    <th className="py-2 px-3 font-semibold">Page / Route</th>
                    <th className="py-2 px-4 font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${dividerCls}`}>
                  {filteredEvents.slice(0, 50).map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-500/5 transition-colors">
                      <td className={`py-2 px-4 font-mono tabular-nums whitespace-nowrap ${mutedTextCls}`}>
                        {formatRelativeTime(ev.created_at)}
                      </td>
                      <td className={`py-2 px-3 font-semibold whitespace-nowrap ${headingTextCls}`}>
                        {ev.user_name}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap font-medium text-[#038fde] dark:text-cyan-300">
                        {ev.event_type.replace('_', ' ')}
                      </td>
                      <td className={`py-2 px-3 whitespace-nowrap ${mutedTextCls}`}>{ev.route_label}</td>
                      <td className={`py-2 px-4 ${mutedTextCls} max-w-[340px] truncate`}>
                        {ev.element_label && <span className={headingTextCls}>{ev.element_label}</span>}
                        {ev.duration_sec > 0 && (
                          <span className="ml-2 font-mono tabular-nums text-amber-600 dark:text-amber-300">
                            {formatDuration(ev.duration_sec)} spent
                          </span>
                        )}
                        {ev.scroll_depth_pct > 0 && (
                          <span className="ml-2 font-mono tabular-nums">
                            {ev.scroll_depth_pct}% scroll
                          </span>
                        )}
                        {ev.click_x_pct !== null && ev.click_y_pct !== null && (
                          <span className="ml-2 font-mono tabular-nums text-[11px]">
                            ({ev.click_x_pct}%, {ev.click_y_pct}%)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredEvents.length === 0 && (
                    <tr>
                      <td colSpan={5} className={`py-8 text-center ${mutedTextCls}`}>
                        No matching events recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INDIVIDUAL USER MONITOR & DEEP-DIVE DOSSIER */}
      {activeSubTab === 'users' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* User List Table */}
          <div className={`${cardCls} overflow-hidden ${selectedUserKey ? 'xl:col-span-7' : 'xl:col-span-12'}`}>
            <div className={`p-4 border-b ${dividerCls} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Filter by user name, email, batch, interest..."
                  className={`w-full pl-9 pr-3 py-1.5 rounded-lg border text-xs focus:outline-none focus:border-[#038fde] ${subtleSurfaceCls} ${headingTextCls}`}
                />
              </div>

              <div className="flex items-center gap-2 text-xs">
                <ArrowUpDown className={`w-3.5 h-3.5 ${mutedTextCls}`} />
                <select
                  value={userSort}
                  onChange={(e) => setUserSort(e.target.value as any)}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer focus:outline-none ${subtleSurfaceCls} ${headingTextCls}`}
                >
                  <option value="recent">Sort: Most Recent</option>
                  <option value="clicks">Sort: Most Clicks</option>
                  <option value="dwell">Sort: Most Time Spent</option>
                  <option value="views">Sort: Most Page Views</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className={`border-b ${dividerCls} ${mutedTextCls}`}>
                    <th className="py-2.5 px-4 font-semibold">User &amp; Status</th>
                    <th className="py-2.5 px-3 font-semibold">Current / Top Page</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Clicks</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Time Spent</th>
                    <th className="py-2.5 px-3 font-semibold">Device</th>
                    <th className="py-2.5 px-4 font-semibold">Primary Ad Interest</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${dividerCls}`}>
                  {filteredUsers.map((u) => {
                    const isSelected = selectedUserKey === u.userKey;
                    return (
                      <tr
                        key={u.userKey}
                        onClick={() => void fetchDossier(u.userKey)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? isNeon
                              ? 'bg-cyan-500/15'
                              : 'bg-sky-50'
                            : 'hover:bg-slate-500/5'
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className={`font-semibold ${headingTextCls}`}>{u.userName}</div>
                          <div className={`text-[11px] mt-0.5 ${mutedTextCls}`}>
                            <span className={u.isOnlineNow ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}>
                              {u.isOnlineNow ? 'Online now' : `Seen ${formatRelativeTime(u.lastActiveAt)}`}
                            </span>
                            {u.batchYear ? ` · Batch ${u.batchYear}` : ''}
                            {u.city ? ` · ${u.city}` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className={`font-medium ${headingTextCls}`}>{u.currentRouteLabel}</div>
                          <div className={`text-[11px] ${mutedTextCls}`}>Top: {u.topRouteLabel}</div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-bold">
                          {u.totalClicks}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-[#038fde]">
                          {formatDuration(u.totalDwellSec)}
                        </td>
                        <td className={`py-3 px-3 ${mutedTextCls}`}>
                          <div className="inline-flex items-center gap-1.5">
                            {renderDeviceIcon(u.primaryDevice)}
                            <span className="capitalize">{u.primaryDevice}</span>
                          </div>
                          <div className="text-[11px]">{u.browser}</div>
                        </td>
                        <td className="py-3 px-4">
                          {u.inferredInterests[0] ? (
                            <div className="text-xs font-medium text-teal-700 dark:text-teal-300">
                              {u.inferredInterests[0].label}
                              <span className={`ml-1 font-mono tabular-nums ${mutedTextCls}`}>
                                ({u.inferredInterests[0].score}%)
                              </span>
                            </div>
                          ) : (
                            <span className={mutedTextCls}>General</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} className={`py-10 text-center ${mutedTextCls}`}>
                        No monitored user activity matches your search yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Panel: Selected User Deep-Dive Dossier */}
          {selectedUserKey && (
            <div className={`${cardCls} xl:col-span-5 p-4 sm:p-5 space-y-4`}>
              <div className={`flex items-start justify-between gap-3 pb-3 border-b ${dividerCls}`}>
                <div className="min-w-0">
                  <div className={`text-xs font-medium ${mutedTextCls}`}>Individual User Intelligence Dossier</div>
                  <h3 className={`text-base font-bold truncate mt-0.5 ${headingTextCls}`}>
                    {dossier?.summary?.userName || 'Loading dossier...'}
                  </h3>
                  {dossier?.summary && (
                    <div className={`text-xs mt-1 ${mutedTextCls}`}>
                      {dossier.summary.userEmail || 'Guest session'}
                      {dossier.summary.batchYear ? ` · Batch ${dossier.summary.batchYear}` : ''}
                      {dossier.summary.specialty ? ` · ${dossier.summary.specialty}` : ''}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {dossier?.summary?.profileId && onViewProfile && (
                    <button
                      type="button"
                      onClick={() => onViewProfile(dossier.summary.profileId!)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#038fde] text-white hover:bg-[#027bc0] cursor-pointer whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Profile</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUserKey(null);
                      setDossier(null);
                    }}
                    className={`p-1.5 rounded-lg border cursor-pointer ${subtleSurfaceCls} ${mutedTextCls}`}
                    aria-label="Close dossier"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {dossierLoading ? (
                <div className={`py-12 text-center text-xs ${mutedTextCls}`}>
                  Loading complete behavioral timeline...
                </div>
              ) : dossier ? (
                <>
                  {/* Quick User Metrics */}
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { label: 'Sessions', val: dossier.summary.totalSessions },
                      { label: 'Clicks', val: dossier.summary.totalClicks },
                      { label: 'Views', val: dossier.summary.totalPageViews },
                      { label: 'Dwell', val: formatDuration(dossier.summary.totalDwellSec) },
                    ].map((m) => (
                      <div key={m.label} className={`p-2.5 rounded-lg border ${subtleSurfaceCls}`}>
                        <div className={`text-[11px] ${mutedTextCls}`}>{m.label}</div>
                        <div className={`text-sm font-bold font-mono tabular-nums mt-0.5 ${headingTextCls}`}>
                          {m.val}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Per-Page Time Spent Breakdown */}
                  <div>
                    <h4 className={`text-xs font-bold mb-2 ${headingTextCls}`}>
                      Exact Time Spent Per Page
                    </h4>
                    <div className="space-y-2">
                      {dossier.summary.routeDwellBreakdown.slice(0, 6).map((r) => {
                        const maxDwell = Math.max(
                          1,
                          ...dossier.summary.routeDwellBreakdown.map((x) => x.dwellSec)
                        );
                        const pct = Math.max(8, Math.round((r.dwellSec / maxDwell) * 100));
                        return (
                          <div key={r.route} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className={`font-medium ${headingTextCls}`}>{r.routeLabel}</span>
                              <span className={`font-mono tabular-nums ${mutedTextCls}`}>
                                {formatDuration(r.dwellSec)} · {r.clicks} clicks · {r.views} views
                              </span>
                            </div>
                            <div className={`h-1.5 w-full rounded-full overflow-hidden ${isNeon ? 'bg-slate-800' : 'bg-slate-100'}`}>
                              <div
                                className="h-full rounded-full bg-[#038fde]"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                      {dossier.summary.routeDwellBreakdown.length === 0 && (
                        <div className={`text-xs ${mutedTextCls}`}>No route dwell recorded yet.</div>
                      )}
                    </div>
                  </div>

                  {/* Inferred Advertising Interests */}
                  <div>
                    <h4 className={`text-xs font-bold mb-2 ${headingTextCls}`}>
                      Inferred Ad Targeting Affinities
                    </h4>
                    <div className="space-y-1.5">
                      {dossier.summary.inferredInterests.map((intr) => (
                        <div
                          key={intr.label}
                          className={`flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg border ${subtleSurfaceCls}`}
                        >
                          <span className={`font-medium ${headingTextCls}`}>{intr.label}</span>
                          <span className="font-mono tabular-nums font-bold text-teal-600 dark:text-teal-400">
                            {intr.score}% match
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Top Clicks by This User */}
                  {dossier.topClicks.length > 0 && (
                    <div>
                      <h4 className={`text-xs font-bold mb-2 ${headingTextCls}`}>Most Clicked by User</h4>
                      <div className="space-y-1">
                        {dossier.topClicks.slice(0, 6).map((c, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs py-1">
                            <span className={`truncate pr-2 ${headingTextCls}`}>
                              {c.label} <span className={mutedTextCls}>({c.routeLabel})</span>
                            </span>
                            <span className="font-mono tabular-nums font-semibold shrink-0">{c.count}×</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chronological User Journey */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className={`text-xs font-bold ${headingTextCls}`}>
                        Chronological Click &amp; Page Journey
                      </h4>
                      <button
                        type="button"
                        onClick={() =>
                          downloadFile(
                            `user-dossier-${dossier.summary.userName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`,
                            JSON.stringify(dossier, null, 2),
                            'application/json'
                          )
                        }
                        className="text-[11px] font-semibold text-[#038fde] hover:underline cursor-pointer"
                      >
                        Download JSON
                      </button>
                    </div>
                    <div className={`max-h-[260px] overflow-y-auto divide-y ${dividerCls} border rounded-lg ${dividerCls}`}>
                      {dossier.timeline.slice(0, 40).map((ev) => (
                        <div key={ev.id} className="p-2.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[#038fde] dark:text-cyan-300">
                              {ev.event_type.replace('_', ' ')} · {ev.route_label}
                            </span>
                            <span className={`font-mono tabular-nums text-[11px] ${mutedTextCls}`}>
                              {formatRelativeTime(ev.created_at)}
                            </span>
                          </div>
                          {(ev.element_label || ev.duration_sec > 0 || ev.scroll_depth_pct > 0) && (
                            <div className={`text-[11px] mt-0.5 ${mutedTextCls}`}>
                              {ev.element_label ? `Target: ${ev.element_label}` : ''}
                              {ev.duration_sec > 0 ? ` · Spent ${formatDuration(ev.duration_sec)}` : ''}
                              {ev.scroll_depth_pct > 0 ? ` · Scroll ${ev.scroll_depth_pct}%` : ''}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className={`py-8 text-center text-xs ${mutedTextCls}`}>
                  Could not load dossier details.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AD AUDIENCE BUILDER & TARGETED COHORTS */}
      {activeSubTab === 'audiences' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Create Segment Form */}
          <form onSubmit={handleCreateSegment} className={`${cardCls} p-4 sm:p-5 xl:col-span-5 space-y-4`}>
            <div>
              <h3 className={`text-sm font-bold ${headingTextCls}`}>
                Create Behavioral Ad Audience Segment
              </h3>
              <p className={`text-xs mt-0.5 ${mutedTextCls}`}>
                Target users based on the pages they visit, click activity, time spent, device, and MBBS batch.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className={`block text-xs font-semibold mb-1 ${headingTextCls}`}>
                  Segment Name
                </label>
                <input
                  type="text"
                  value={segName}
                  onChange={(e) => setSegName(e.target.value)}
                  placeholder="e.g., Active Senior Doctors — CME & Hospital Ads"
                  className={`w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-[#038fde] ${subtleSurfaceCls} ${headingTextCls}`}
                />
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${headingTextCls}`}>
                  Campaign Purpose / Notes
                </label>
                <input
                  type="text"
                  value={segDescription}
                  onChange={(e) => setSegDescription(e.target.value)}
                  placeholder="e.g., Retarget for 75th Reunion sponsorship or fellowship ads"
                  className={`w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-[#038fde] ${subtleSurfaceCls} ${headingTextCls}`}
                />
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${headingTextCls}`}>
                  Visited Any of These Sections
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {TARGETABLE_ROUTES.map((r) => {
                    const checked = segRoutes.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() =>
                          setSegRoutes((prev) =>
                            checked ? prev.filter((x) => x !== r.id) : [...prev, r.id]
                          )
                        }
                        className={`text-left px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer truncate ${
                          checked
                            ? isNeon
                              ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                              : 'bg-sky-50 border-[#038fde] text-[#003366]'
                            : `${subtleSurfaceCls} ${mutedTextCls}`
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${headingTextCls}`}>
                    Min Clicks
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={segMinClicks}
                    onChange={(e) => setSegMinClicks(Math.max(0, Number(e.target.value) || 0))}
                    className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono tabular-nums focus:outline-none focus:border-[#038fde] ${subtleSurfaceCls} ${headingTextCls}`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${headingTextCls}`}>
                    Min Dwell (Seconds)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={segMinDwell}
                    onChange={(e) => setSegMinDwell(Math.max(0, Number(e.target.value) || 0))}
                    className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono tabular-nums focus:outline-none focus:border-[#038fde] ${subtleSurfaceCls} ${headingTextCls}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${headingTextCls}`}>
                    Batch From (Optional)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={segMinBatch}
                    onChange={(e) => setSegMinBatch(e.target.value)}
                    placeholder="e.g. 1"
                    className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono tabular-nums focus:outline-none focus:border-[#038fde] ${subtleSurfaceCls} ${headingTextCls}`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${headingTextCls}`}>
                    Batch To (Optional)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={segMaxBatch}
                    onChange={(e) => setSegMaxBatch(e.target.value)}
                    placeholder="e.g. 35"
                    className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono tabular-nums focus:outline-none focus:border-[#038fde] ${subtleSurfaceCls} ${headingTextCls}`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${headingTextCls}`}>
                  Device Filter (Optional)
                </label>
                <div className="flex items-center gap-2">
                  {(['desktop', 'mobile', 'tablet'] as const).map((dev) => {
                    const active = segDevices.includes(dev);
                    return (
                      <button
                        key={dev}
                        type="button"
                        onClick={() =>
                          setSegDevices((prev) =>
                            active ? prev.filter((x) => x !== dev) : [...prev, dev]
                          )
                        }
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-xs font-medium capitalize cursor-pointer ${
                          active
                            ? isNeon
                              ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                              : 'bg-sky-50 border-[#038fde] text-[#003366]'
                            : `${subtleSurfaceCls} ${mutedTextCls}`
                        }`}
                      >
                        {renderDeviceIcon(dev)}
                        <span>{dev}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Live Match Counter */}
            <div className={`p-3 rounded-lg border flex items-center justify-between ${subtleSurfaceCls}`}>
              <div>
                <div className={`text-xs font-semibold ${headingTextCls}`}>Live Matching Audience</div>
                <div className={`text-[11px] ${mutedTextCls}`}>Based on current tracked user behavior</div>
              </div>
              <div className="text-xl font-extrabold font-mono tabular-nums text-[#038fde]">
                {previewSegmentMatches.length}
              </div>
            </div>

            {segmentFeedback && (
              <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {segmentFeedback}
              </div>
            )}

            <button
              type="submit"
              disabled={savingSegment}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#038fde] hover:bg-[#027bc0] disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{savingSegment ? 'Saving Segment...' : 'Save Ad Audience Segment'}</span>
            </button>
          </form>

          {/* Saved Audience Segments List */}
          <div className="xl:col-span-7 space-y-4">
            <div className={`${cardCls} p-4 sm:p-5`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className={`text-sm font-bold ${headingTextCls}`}>
                    Saved Targeted Ad Audiences
                  </h3>
                  <p className={`text-xs ${mutedTextCls}`}>
                    Export any behavioral cohort as CSV for sponsored feed placements or Meta Custom Audiences
                  </p>
                </div>
                <Sparkles className="w-4 h-4 text-[#038fde] shrink-0" />
              </div>

              <div className="space-y-3">
                {(data?.segments || []).map((seg) => (
                  <div
                    key={seg.id}
                    className={`p-3.5 rounded-xl border ${subtleSurfaceCls} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-bold ${headingTextCls}`}>{seg.name}</span>
                        <span className={`text-xs ${mutedTextCls}`}>·</span>
                        <span className="text-xs font-mono tabular-nums font-bold text-[#038fde]">
                          {seg.matchedUsersCount} matching users
                        </span>
                      </div>
                      {seg.description && (
                        <p className={`text-xs mt-1 ${mutedTextCls}`}>{seg.description}</p>
                      )}
                      <div className={`text-[11px] mt-1.5 ${mutedTextCls}`}>
                        Min {seg.min_clicks} clicks · Min {formatDuration(seg.min_dwell_sec)} dwell
                        {seg.target_routes.length > 0 ? ` · Routes: ${seg.target_routes.join(', ')}` : ''}
                        {seg.min_batch || seg.max_batch
                          ? ` · Batch ${seg.min_batch || 1}–${seg.max_batch || 35}`
                          : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleExportSegmentCsv(seg)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#038fde] hover:bg-[#027bc0] text-white cursor-pointer whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export CSV</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteSegment(seg.id)}
                        className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        aria-label={`Delete ${seg.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Audience Interest Breakdown Card */}
            <div className={`${cardCls} p-4 sm:p-5`}>
              <h3 className={`text-sm font-bold mb-1 ${headingTextCls}`}>
                Portal-Wide Interest Clusters (Ad Demand Signal)
              </h3>
              <p className={`text-xs mb-3 ${mutedTextCls}`}>
                Automatically derived from where alumni spend the most active time and clicks
              </p>
              <div className="space-y-2">
                {(data?.audienceInterests || []).slice(0, 7).map((item) => {
                  const maxCount = Math.max(1, ...(data?.audienceInterests || []).map((x) => x.userCount));
                  const pct = Math.max(10, Math.round((item.userCount / maxCount) * 100));
                  return (
                    <div key={item.interest} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className={`font-medium ${headingTextCls}`}>{item.interest}</span>
                        <span className={`font-mono tabular-nums ${mutedTextCls}`}>
                          {item.userCount} users
                        </span>
                      </div>
                      <div className={`h-2 w-full rounded-full overflow-hidden ${isNeon ? 'bg-slate-800' : 'bg-slate-100'}`}>
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#038fde] to-teal-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {(!data?.audienceInterests || data.audienceInterests.length === 0) && (
                  <div className={`text-xs py-4 text-center ${mutedTextCls}`}>
                    Interest clusters appear automatically as users browse portal sections.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUserTelemetryView;
