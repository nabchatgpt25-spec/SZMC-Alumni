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
  Flame,
  GitBranch,
  AlertTriangle,
  Globe,
  Gauge,
  ArrowRight,
  Zap,
  Route,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAdminVisualMode } from './adminVisualModes';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { UserSessionJourney } from './UserSessionJourney';

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

interface HeatmapPoint {
  route: string;
  routeLabel: string;
  xPct: number;
  yPct: number;
  isRage: boolean;
  label: string;
}

interface NavigationFlow {
  from: string;
  fromLabel: string;
  to: string;
  toLabel: string;
  count: number;
}

interface RageClickAlert {
  label: string;
  routeLabel: string;
  count: number;
  lastSeen: string;
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
  rageClicks: number;
  totalPageViews: number;
  totalDwellSec: number;
  maxScrollPct: number;
  topRoute: string;
  topRouteLabel: string;
  primaryDevice: string;
  browser: string;
  os: string;
  screenResolution: string | null;
  timezone: string | null;
  language: string | null;
  connectionType: string | null;
  utmSource: string | null;
  colorScheme: string | null;
  routesVisited: string[];
  engagementScore: number;
  lifecycleStage: 'Power User' | 'Active Regular' | 'Explorer' | 'At-Risk' | 'New Visitor';
  churnRisk: 'Low' | 'Medium' | 'High';
  peakHourLabel: string;
  recommendedActions: string[];
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
    totalRageClicks: number;
    totalPageViews: number;
    totalDwellSec: number;
    avgSessionSec: number;
    avgEngagementScore: number;
  };
  routeMetrics: RouteMetric[];
  topClickHotspots: ClickHotspot[];
  heatmapPoints: HeatmapPoint[];
  navigationFlows: NavigationFlow[];
  rageClickAlerts: RageClickAlert[];
  lifecycleDistribution: Array<{ stage: string; count: number }>;
  peakBlocks: Array<{ label: string; start: number; events: number }>;
  acquisitionSources: Array<{ source: string; sessions: number }>;
  topTimezones: Array<{ timezone: string; count: number }>;
  topLanguages: Array<{ language: string; count: number }>;
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

  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'intelligence' | 'users' | 'journey' | 'audiences'>('overview');
  const [journeyUserKey, setJourneyUserKey] = useState<string>('live_local');
  const [rangeHours, setRangeHours] = useState<number>(168);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TelemetryOverviewPayload | null>(null);

  // Filters & sorting
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [heatmapRoute, setHeatmapRoute] = useState<string>('all');
  const [userSearch, setUserSearch] = useState<string>('');
  const [lifecycleFilter, setLifecycleFilter] = useState<string>('all');
  const [userSort, setUserSort] = useState<'recent' | 'score' | 'clicks' | 'dwell' | 'views'>('recent');

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
    const byLifecycle =
      lifecycleFilter === 'all' ? list : list.filter((u) => u.lifecycleStage === lifecycleFilter);
    const matched = effectiveUserSearch
      ? byLifecycle.filter((u) => {
          const hay = [
            u.userName,
            u.userEmail || '',
            u.specialty || '',
            u.city || '',
            u.lifecycleStage,
            u.currentRouteLabel,
            u.topRouteLabel,
            u.batchYear ? `batch ${u.batchYear}` : '',
            ...u.inferredInterests.map((i) => i.label),
          ]
            .join(' ')
            .toLowerCase();
          return hay.includes(effectiveUserSearch);
        })
      : byLifecycle;

    return [...matched].sort((a, b) => {
      if (userSort === 'score') return b.engagementScore - a.engagementScore;
      if (userSort === 'clicks') return b.totalClicks - a.totalClicks;
      if (userSort === 'dwell') return b.totalDwellSec - a.totalDwellSec;
      if (userSort === 'views') return b.totalPageViews - a.totalPageViews;
      if (a.isOnlineNow !== b.isOnlineNow) return a.isOnlineNow ? -1 : 1;
      return (b.lastActiveAt || '').localeCompare(a.lastActiveAt || '');
    });
  }, [data?.users, effectiveUserSearch, lifecycleFilter, userSort]);

  const filteredEvents = useMemo(() => {
    const events = data?.recentEvents || [];
    if (eventFilter === 'all') return events;
    return events.filter((e) => e.event_type === eventFilter);
  }, [data?.recentEvents, eventFilter]);

  const filteredHeatmapPoints = useMemo(() => {
    const pts = data?.heatmapPoints || [];
    if (heatmapRoute === 'all') return pts;
    return pts.filter((p) => p.route === heatmapRoute);
  }, [data?.heatmapPoints, heatmapRoute]);

  // Build 10x6 visual density matrix from click coordinates
  const heatmapGrid = useMemo(() => {
    const cols = 10;
    const rows = 6;
    const counts = Array.from({ length: rows }, () => Array(cols).fill(0));
    let maxCount = 0;
    for (const pt of filteredHeatmapPoints) {
      const c = Math.min(cols - 1, Math.max(0, Math.floor((pt.xPct / 100) * cols)));
      const r = Math.min(rows - 1, Math.max(0, Math.floor((pt.yPct / 100) * rows)));
      counts[r][c] += 1;
      if (counts[r][c] > maxCount) maxCount = counts[r][c];
    }
    return { counts, maxCount };
  }, [filteredHeatmapPoints]);

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
      setSegmentFeedback(
        `Saved audience segment "${json.segment?.name}" (${previewSegmentMatches.length} matching users).`
      );
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
      'Lifecycle Stage',
      'Engagement Score',
      'Churn Risk',
      'Peak Active Window',
      'Device',
      'Browser',
      'OS',
      'Timezone',
      'Language',
      'UTM Source',
      'Sessions',
      'Total Clicks',
      'Rage Clicks',
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
      u.lifecycleStage,
      u.engagementScore,
      u.churnRisk,
      u.peakHourLabel,
      u.primaryDevice,
      u.browser,
      u.os,
      u.timezone || '',
      u.language || '',
      u.utmSource || '',
      u.totalSessions,
      u.totalClicks,
      u.rageClicks || 0,
      u.totalPageViews,
      u.totalDwellSec,
      u.topRouteLabel,
      u.inferredInterests.map((i) => `${i.label} (${i.score}%)`).join('; '),
      u.lastActiveAt,
    ]);
    const csv = [header, ...rows].map((r) => r.map(escapeCsvCell).join(',')).join('\n');
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'audience';
    downloadFile(`szmc-cdp-audience-${slug}.csv`, csv, 'text/csv;charset=utf-8');
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
    totalRageClicks: 0,
    totalPageViews: 0,
    totalDwellSec: 0,
    avgSessionSec: 0,
    avgEngagementScore: 0,
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
                First-Party Customer Data Platform &amp; Decision Intelligence
              </h2>
              <span className={`text-xs ${mutedTextCls}`}>·</span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                Super Admin Only
              </span>
            </div>
            <p className={`text-xs mt-1 ${mutedTextCls}`}>
              Analyze click heatmaps, page-to-page navigation funnels, idle-aware dwell time, rage-click friction, engagement &amp; churn scores, peak activity windows, and build exportable ad audiences.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
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
              <span>Export CDP CSV</span>
            </button>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div className={`mt-4 pt-3 border-t ${dividerCls} flex flex-wrap items-center justify-between gap-3`}>
          <div className={`inline-flex items-center gap-1 p-1 rounded-lg border ${subtleSurfaceCls} overflow-x-auto max-w-full`}>
            {[
              { id: 'overview', label: 'Traffic & Click Stream', icon: Activity },
              { id: 'intelligence', label: 'Heatmaps, Funnels & Decisions', icon: Flame },
              { id: 'users', label: `360° User Dossiers (${kpis.trackedUsers})`, icon: Users },
              { id: 'journey', label: 'Session Journey Log', icon: Route },
              { id: 'audiences', label: `Ad Audience Builder (${data?.segments?.length || 0})`, icon: Target },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSubTab(tab.id as any)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
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
                : 'Active on Server CDP Store (Run Migration 019 in Supabase SQL Editor for cloud Postgres persistence)'}
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
            meta: `${kpis.onlineNow} online now · ${kpis.totalSessions} sessions`,
            icon: Users,
            accent: isNeon ? 'text-cyan-300 bg-cyan-500/15' : 'text-[#038fde] bg-sky-50',
          },
          {
            label: 'Avg Engagement Score',
            value: `${kpis.avgEngagementScore}/100`,
            meta: `${kpis.totalClicks.toLocaleString()} clicks · ${kpis.totalRageClicks} rage-click alerts`,
            icon: Gauge,
            accent: isNeon ? 'text-violet-300 bg-violet-500/15' : 'text-teal-600 bg-teal-50',
          },
          {
            label: 'Active Focused Dwell',
            value: formatDuration(kpis.totalDwellSec),
            meta: `Avg ${formatDuration(kpis.avgSessionSec)}/session (idle excluded)`,
            icon: Clock,
            accent: isNeon ? 'text-amber-300 bg-amber-500/15' : 'text-amber-600 bg-amber-50',
          },
          {
            label: 'Page Views & Events',
            value: kpis.totalPageViews.toLocaleString(),
            meta: `${kpis.totalEvents.toLocaleString()} total signals across ${data?.routeMetrics?.length || 0} pages`,
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
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            <div className={`${cardCls} p-4 sm:p-5 xl:col-span-7`}>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className={`text-sm font-bold ${headingTextCls}`}>
                    Where Users Go &amp; Spend Focused Time
                  </h3>
                  <p className={`text-xs ${mutedTextCls}`}>
                    Active dwell seconds vs clicks and page views across portal sections
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

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
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
                          Click links or buttons across the portal to record live click hotspots.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className={`${cardCls} overflow-hidden`}>
            <div className={`px-4 py-3.5 border-b ${dividerCls} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
              <div>
                <h3 className={`text-sm font-bold ${headingTextCls}`}>Live Real-Time Behavioral Event Stream</h3>
                <p className={`text-xs ${mutedTextCls}`}>
                  Route views, click coordinates, rage clicks, focused dwell durations, scroll milestones, and searches
                </p>
              </div>
              <div className={`inline-flex items-center gap-1 p-1 rounded-lg border ${subtleSurfaceCls} overflow-x-auto`}>
                {[
                  { id: 'all', label: 'All' },
                  { id: 'page_view', label: 'Page Views' },
                  { id: 'click', label: 'Clicks' },
                  { id: 'rage_click', label: 'Rage Clicks' },
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
                  {filteredEvents.slice(0, 60).map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-500/5 transition-colors">
                      <td className={`py-2 px-4 font-mono tabular-nums whitespace-nowrap ${mutedTextCls}`}>
                        {formatRelativeTime(ev.created_at)}
                      </td>
                      <td className={`py-2 px-3 font-semibold whitespace-nowrap ${headingTextCls}`}>
                        {ev.user_name}
                      </td>
                      <td
                        className={`py-2 px-3 whitespace-nowrap font-medium ${
                          ev.event_type === 'rage_click'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-[#038fde] dark:text-cyan-300'
                        }`}
                      >
                        {ev.event_type.replace('_', ' ')}
                      </td>
                      <td className={`py-2 px-3 whitespace-nowrap ${mutedTextCls}`}>{ev.route_label}</td>
                      <td className={`py-2 px-4 ${mutedTextCls} max-w-[340px] truncate`}>
                        {ev.element_label && <span className={headingTextCls}>{ev.element_label}</span>}
                        {ev.duration_sec > 0 && (
                          <span className="ml-2 font-mono tabular-nums text-amber-600 dark:text-amber-300">
                            {formatDuration(ev.duration_sec)} focused
                          </span>
                        )}
                        {ev.scroll_depth_pct > 0 && (
                          <span className="ml-2 font-mono tabular-nums">{ev.scroll_depth_pct}% scroll</span>
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

      {/* TAB 2: VISUAL CLICK HEATMAPS, NAVIGATION FUNNELS, PEAK HOURS & DECISION INTELLIGENCE */}
      {activeSubTab === 'intelligence' && (
        <div className="space-y-5">
          {/* Lifecycle Distribution Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {(data?.lifecycleDistribution || []).map((item) => (
              <button
                key={item.stage}
                type="button"
                onClick={() => {
                  setLifecycleFilter(item.stage);
                  setActiveSubTab('users');
                }}
                className={`${cardCls} p-3.5 text-left hover:border-[#038fde] transition-colors cursor-pointer`}
              >
                <div className={`text-xs font-medium ${mutedTextCls}`}>{item.stage}</div>
                <div className={`text-xl font-extrabold font-mono tabular-nums mt-1 ${headingTextCls}`}>
                  {item.count}
                </div>
                <div className="text-[11px] text-[#038fde] mt-1 font-medium">Inspect cohort →</div>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* Visual 2D Viewport Click Heatmap */}
            <div className={`${cardCls} p-4 sm:p-5 xl:col-span-7 space-y-4`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className={`text-sm font-bold flex items-center gap-1.5 ${headingTextCls}`}>
                    <Flame className="w-4 h-4 text-amber-500" />
                    <span>Visual Viewport Click Heatmap</span>
                  </h3>
                  <p className={`text-xs ${mutedTextCls}`}>
                    10×6 spatial click density map across screen zones ({filteredHeatmapPoints.length} plotted clicks)
                  </p>
                </div>
                <select
                  value={heatmapRoute}
                  onChange={(e) => setHeatmapRoute(e.target.value)}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer focus:outline-none ${subtleSurfaceCls} ${headingTextCls}`}
                >
                  <option value="all">All Portal Pages</option>
                  {(data?.routeMetrics || []).map((r) => (
                    <option key={r.route} value={r.route}>
                      {r.routeLabel}
                    </option>
                  ))}
                </select>
              </div>

              {/* Simulated Viewport Canvas with Thermal Density Grid + Point Markers */}
              <div
                className={`relative rounded-xl border overflow-hidden aspect-[16/9] ${
                  isNeon ? 'bg-slate-950 border-white/10' : 'bg-slate-900 border-slate-200'
                }`}
              >
                {/* Faint wireframe hints for top bar & sidebar */}
                <div className="absolute inset-x-0 top-0 h-[10%] border-b border-white/10 pointer-events-none flex items-center px-3 text-[10px] font-mono text-slate-400">
                  Header / Top Utility Bar Zone
                </div>
                <div className="absolute inset-y-0 left-0 w-[18%] border-r border-white/10 pointer-events-none" />

                {/* 10x6 Thermal Grid */}
                <div className="grid grid-cols-10 grid-rows-6 w-full h-full">
                  {heatmapGrid.counts.map((row, rIdx) =>
                    row.map((cnt, cIdx) => {
                      const intensity = heatmapGrid.maxCount > 0 ? cnt / heatmapGrid.maxCount : 0;
                      const bgColor =
                        intensity === 0
                          ? 'transparent'
                          : intensity > 0.7
                          ? `rgba(239, 68, 68, ${0.28 + intensity * 0.48})`
                          : intensity > 0.35
                          ? `rgba(245, 158, 11, ${0.22 + intensity * 0.42})`
                          : `rgba(3, 143, 222, ${0.18 + intensity * 0.35})`;
                      return (
                        <div
                          key={`${rIdx}-${cIdx}`}
                          title={cnt > 0 ? `${cnt} clicks in zone (${cIdx * 10}%, ${Math.round((rIdx / 6) * 100)}%)` : undefined}
                          className="border border-white/[0.03] flex items-center justify-center transition-colors"
                          style={{ backgroundColor: bgColor }}
                        >
                          {cnt > 0 && (
                            <span className="text-[10px] font-mono font-bold text-white drop-shadow-xs">
                              {cnt}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Exact Click Dot Scatter */}
                {filteredHeatmapPoints.slice(0, 140).map((pt, i) => (
                  <span
                    key={i}
                    title={`${pt.label} (${pt.routeLabel})`}
                    style={{ left: `${pt.xPct}%`, top: `${pt.yPct}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none ${
                      pt.isRage
                        ? 'w-3 h-3 bg-rose-500 ring-2 ring-rose-300/70'
                        : 'w-1.5 h-1.5 bg-cyan-300/80'
                    }`}
                  />
                ))}
              </div>

              <div className={`flex flex-wrap items-center justify-between gap-2 text-[11px] ${mutedTextCls}`}>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#038fde]/60" /> Low density
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-amber-500/75" /> Medium
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-rose-500/85" /> Hotspot / Rage click
                  </span>
                </div>
                <span>Normalized viewport coordinates (0–100%)</span>
              </div>
            </div>

            {/* Navigation Funnel Transitions (Where users move from -> to) */}
            <div className={`${cardCls} p-4 sm:p-5 xl:col-span-5 space-y-4`}>
              <div>
                <h3 className={`text-sm font-bold flex items-center gap-1.5 ${headingTextCls}`}>
                  <GitBranch className="w-4 h-4 text-[#038fde]" />
                  <span>User Journey Funnel Flows</span>
                </h3>
                <p className={`text-xs ${mutedTextCls}`}>
                  Most frequent page-to-page paths users take across your platform
                </p>
              </div>

              <div className="space-y-2.5 max-h-[310px] overflow-y-auto pr-1">
                {(data?.navigationFlows || []).map((flow) => {
                  const maxFlow = Math.max(1, ...(data?.navigationFlows || []).map((f) => f.count));
                  const pct = Math.max(10, Math.round((flow.count / maxFlow) * 100));
                  return (
                    <div key={`${flow.from}-${flow.to}`} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className={`flex items-center gap-1.5 min-w-0 font-medium ${headingTextCls}`}>
                          <span className="truncate">{flow.fromLabel}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-[#038fde] shrink-0" />
                          <span className="truncate">{flow.toLabel}</span>
                        </div>
                        <span className="font-mono tabular-nums font-bold text-[#038fde] shrink-0">
                          {flow.count}×
                        </span>
                      </div>
                      <div className={`h-1.5 rounded-full overflow-hidden ${isNeon ? 'bg-slate-800' : 'bg-slate-100'}`}>
                        <div className="h-full rounded-full bg-gradient-to-r from-[#038fde] to-teal-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                {(!data?.navigationFlows || data.navigationFlows.length === 0) && (
                  <div className={`py-10 text-center text-xs ${mutedTextCls}`}>
                    Move between portal sections (e.g., Feed → Directory → Profile) to capture live journey flows.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Intelligence Row: Peak Scheduling Hours + Acquisition/Tech Signals + UX Rage-Click Friction */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* Best Time to Launch Ads / Notices */}
            <div className={`${cardCls} p-4 sm:p-5 xl:col-span-5`}>
              <h3 className={`text-sm font-bold ${headingTextCls}`}>Peak Activity Windows (Best Ad Timing)</h3>
              <p className={`text-xs mb-3 ${mutedTextCls}`}>
                Event volume by 3-hour time window so you publish ads &amp; announcements at peak attention
              </p>
              <div className="h-[190px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.peakBlocks || []} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
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
                    <Bar dataKey="events" name="Activity Events" fill="#038fde" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Acquisition Sources, Timezones & Languages */}
            <div className={`${cardCls} p-4 sm:p-5 xl:col-span-4 space-y-4`}>
              <div>
                <h3 className={`text-sm font-bold flex items-center gap-1.5 ${headingTextCls}`}>
                  <Globe className="w-4 h-4 text-teal-500" />
                  <span>Acquisition &amp; Environment Signals</span>
                </h3>
                <p className={`text-xs ${mutedTextCls}`}>UTM campaigns, referrers, timezones &amp; locales</p>
              </div>

              <div className="space-y-2">
                <div className={`text-[11px] font-semibold ${mutedTextCls}`}>Traffic Sources / UTM</div>
                {(data?.acquisitionSources || []).slice(0, 4).map((src) => (
                  <div key={src.source} className="flex items-center justify-between text-xs">
                    <span className={`truncate pr-2 font-medium ${headingTextCls}`}>{src.source}</span>
                    <span className="font-mono tabular-nums font-semibold">{src.sessions} sessions</span>
                  </div>
                ))}
              </div>

              <div className={`pt-3 border-t ${dividerCls} grid grid-cols-2 gap-3 text-xs`}>
                <div>
                  <div className={`text-[11px] font-semibold mb-1.5 ${mutedTextCls}`}>Top Timezones</div>
                  {(data?.topTimezones || []).slice(0, 3).map((tz) => (
                    <div key={tz.timezone} className="flex items-center justify-between py-0.5 gap-1">
                      <span className={`truncate ${headingTextCls}`}>{tz.timezone}</span>
                      <span className="font-mono tabular-nums">{tz.count}</span>
                    </div>
                  ))}
                  {(!data?.topTimezones || data.topTimezones.length === 0) && (
                    <div className={mutedTextCls}>—</div>
                  )}
                </div>
                <div>
                  <div className={`text-[11px] font-semibold mb-1.5 ${mutedTextCls}`}>Languages</div>
                  {(data?.topLanguages || []).slice(0, 3).map((lg) => (
                    <div key={lg.language} className="flex items-center justify-between py-0.5 gap-1">
                      <span className={`truncate ${headingTextCls}`}>{lg.language}</span>
                      <span className="font-mono tabular-nums">{lg.count}</span>
                    </div>
                  ))}
                  {(!data?.topLanguages || data.topLanguages.length === 0) && (
                    <div className={mutedTextCls}>—</div>
                  )}
                </div>
              </div>
            </div>

            {/* UX Friction / Rage Click Detector */}
            <div className={`${cardCls} p-4 sm:p-5 xl:col-span-3 space-y-3`}>
              <div>
                <h3 className={`text-sm font-bold flex items-center gap-1.5 ${headingTextCls}`}>
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                  <span>UX Friction Alerts</span>
                </h3>
                <p className={`text-xs ${mutedTextCls}`}>Rapid repeated clicks (rage clicks) signaling broken or slow UI</p>
              </div>
              <div className="space-y-2">
                {(data?.rageClickAlerts || []).map((alert, idx) => (
                  <div key={idx} className={`p-2.5 rounded-lg border ${subtleSurfaceCls} text-xs`}>
                    <div className={`font-semibold truncate ${headingTextCls}`}>{alert.label}</div>
                    <div className={`text-[11px] mt-0.5 flex items-center justify-between ${mutedTextCls}`}>
                      <span>{alert.routeLabel}</span>
                      <span className="font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">
                        {alert.count}× rage
                      </span>
                    </div>
                  </div>
                ))}
                {(!data?.rageClickAlerts || data.rageClickAlerts.length === 0) && (
                  <div className={`p-4 rounded-lg border text-center text-xs ${subtleSurfaceCls} ${mutedTextCls}`}>
                    Zero rage-click friction detected in this period.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: INDIVIDUAL 360° USER MONITOR & DEEP-DIVE DOSSIER */}
      {activeSubTab === 'users' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          <div className={`${cardCls} overflow-hidden ${selectedUserKey ? 'xl:col-span-7' : 'xl:col-span-12'}`}>
            <div className={`p-4 border-b ${dividerCls} flex flex-col lg:flex-row lg:items-center justify-between gap-3`}>
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search user name, email, batch, interest..."
                  className={`w-full pl-9 pr-3 py-1.5 rounded-lg border text-xs focus:outline-none focus:border-[#038fde] ${subtleSurfaceCls} ${headingTextCls}`}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  value={lifecycleFilter}
                  onChange={(e) => setLifecycleFilter(e.target.value)}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer focus:outline-none ${subtleSurfaceCls} ${headingTextCls}`}
                >
                  <option value="all">All Lifecycles</option>
                  <option value="Power User">Power User</option>
                  <option value="Active Regular">Active Regular</option>
                  <option value="Explorer">Explorer</option>
                  <option value="At-Risk">At-Risk</option>
                  <option value="New Visitor">New Visitor</option>
                </select>

                <div className="inline-flex items-center gap-1.5">
                  <ArrowUpDown className={`w-3.5 h-3.5 ${mutedTextCls}`} />
                  <select
                    value={userSort}
                    onChange={(e) => setUserSort(e.target.value as any)}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer focus:outline-none ${subtleSurfaceCls} ${headingTextCls}`}
                  >
                    <option value="recent">Sort: Most Recent</option>
                    <option value="score">Sort: Engagement Score</option>
                    <option value="clicks">Sort: Most Clicks</option>
                    <option value="dwell">Sort: Most Time Spent</option>
                    <option value="views">Sort: Most Page Views</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className={`border-b ${dividerCls} ${mutedTextCls}`}>
                    <th className="py-2.5 px-4 font-semibold">User &amp; Lifecycle</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Score</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Clicks</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Dwell</th>
                    <th className="py-2.5 px-3 font-semibold">Peak Window</th>
                    <th className="py-2.5 px-4 font-semibold">Top Ad Interest</th>
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
                              {u.isOnlineNow ? 'Online now' : formatRelativeTime(u.lastActiveAt)}
                            </span>
                            {' · '}
                            <span className="font-medium">{u.lifecycleStage}</span>
                            {u.batchYear ? ` · Batch ${u.batchYear}` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-bold">
                          <span
                            className={
                              u.engagementScore >= 70
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : u.engagementScore >= 40
                                ? 'text-[#038fde]'
                                : 'text-amber-600 dark:text-amber-400'
                            }
                          >
                            {u.engagementScore}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold">
                          {u.totalClicks}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-[#038fde]">
                          {formatDuration(u.totalDwellSec)}
                        </td>
                        <td className={`py-3 px-3 font-mono tabular-nums whitespace-nowrap ${mutedTextCls}`}>
                          {u.peakHourLabel}
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
                        No monitored users match the current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Panel: Selected User 360° Behavioral & Decision Dossier */}
          {selectedUserKey && (
            <div className={`${cardCls} xl:col-span-5 p-4 sm:p-5 space-y-4`}>
              <div className={`flex items-start justify-between gap-3 pb-3 border-b ${dividerCls}`}>
                <div className="min-w-0">
                  <div className={`text-xs font-medium ${mutedTextCls}`}>360° User Decision Dossier</div>
                  <h3 className={`text-base font-bold truncate mt-0.5 ${headingTextCls}`}>
                    {dossier?.summary?.userName || 'Loading dossier...'}
                  </h3>
                  {dossier?.summary && (
                    <div className={`text-xs mt-1 ${mutedTextCls}`}>
                      {dossier.summary.lifecycleStage} · Churn Risk:{' '}
                      <strong
                        className={
                          dossier.summary.churnRisk === 'High'
                            ? 'text-rose-600 dark:text-rose-400'
                            : dossier.summary.churnRisk === 'Medium'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }
                      >
                        {dossier.summary.churnRisk}
                      </strong>
                      {dossier.summary.batchYear ? ` · Batch ${dossier.summary.batchYear}` : ''}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {dossier?.summary?.userKey && (
                    <button
                      type="button"
                      onClick={() => {
                        setJourneyUserKey(dossier.summary.userKey);
                        setActiveSubTab('journey');
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer whitespace-nowrap ${subtleSurfaceCls} ${headingTextCls} hover:border-[#038fde]`}
                    >
                      <Route className="w-3.5 h-3.5 text-[#038fde]" />
                      <span>Full Journey</span>
                    </button>
                  )}
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
                  Loading complete 360° behavioral dossier...
                </div>
              ) : dossier ? (
                <>
                  {/* Quick Intelligence Scores */}
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { label: 'Score', val: `${dossier.summary.engagementScore}/100` },
                      { label: 'Clicks', val: dossier.summary.totalClicks },
                      { label: 'Dwell', val: formatDuration(dossier.summary.totalDwellSec) },
                      { label: 'Scroll', val: `${dossier.summary.maxScrollPct}%` },
                    ].map((m) => (
                      <div key={m.label} className={`p-2.5 rounded-lg border ${subtleSurfaceCls}`}>
                        <div className={`text-[11px] ${mutedTextCls}`}>{m.label}</div>
                        <div className={`text-sm font-bold font-mono tabular-nums mt-0.5 ${headingTextCls}`}>
                          {m.val}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Automated Decision Engine Recommendations */}
                  {dossier.summary.recommendedActions.length > 0 && (
                    <div className={`p-3 rounded-lg border ${subtleSurfaceCls} space-y-1.5`}>
                      <div className={`text-xs font-bold flex items-center gap-1.5 ${headingTextCls}`}>
                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                        <span>Recommended Super Admin Actions</span>
                      </div>
                      <ul className={`text-xs space-y-1 ${mutedTextCls}`}>
                        {dossier.summary.recommendedActions.map((act, idx) => (
                          <li key={idx}>• {act}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Technical & Environmental Context */}
                  <div className={`p-3 rounded-lg border ${subtleSurfaceCls} grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]`}>
                    <div>
                      <span className={mutedTextCls}>Device: </span>
                      <strong className={headingTextCls}>
                        {dossier.summary.primaryDevice} · {dossier.summary.browser}/{dossier.summary.os}
                      </strong>
                    </div>
                    <div>
                      <span className={mutedTextCls}>Peak Hour: </span>
                      <strong className={`font-mono tabular-nums ${headingTextCls}`}>
                        {dossier.summary.peakHourLabel}
                      </strong>
                    </div>
                    <div>
                      <span className={mutedTextCls}>Timezone: </span>
                      <strong className={headingTextCls}>{dossier.summary.timezone || '—'}</strong>
                    </div>
                    <div>
                      <span className={mutedTextCls}>Locale / Net: </span>
                      <strong className={headingTextCls}>
                        {dossier.summary.language || '—'}
                        {dossier.summary.connectionType ? ` · ${dossier.summary.connectionType}` : ''}
                      </strong>
                    </div>
                    <div>
                      <span className={mutedTextCls}>Screen: </span>
                      <strong className={`font-mono ${headingTextCls}`}>
                        {dossier.summary.screenResolution || '—'}
                      </strong>
                    </div>
                    <div>
                      <span className={mutedTextCls}>Source: </span>
                      <strong className={headingTextCls}>{dossier.summary.utmSource || 'Direct'}</strong>
                    </div>
                  </div>

                  {/* Per-Page Time Spent Breakdown */}
                  <div>
                    <h4 className={`text-xs font-bold mb-2 ${headingTextCls}`}>Exact Focused Time Per Page</h4>
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
                              <div className="h-full rounded-full bg-[#038fde]" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Inferred Advertising Interests */}
                  <div>
                    <h4 className={`text-xs font-bold mb-2 ${headingTextCls}`}>Inferred Ad Targeting Affinities</h4>
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

                  {/* Chronological User Journey */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className={`text-xs font-bold ${headingTextCls}`}>Chronological Click &amp; Page Journey</h4>
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
                    <div className={`max-h-[240px] overflow-y-auto divide-y ${dividerCls} border rounded-lg ${dividerCls}`}>
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

      {/* TAB 4: CHRONOLOGICAL USER SESSION JOURNEY VIEWER */}
      {activeSubTab === 'journey' && (
        <UserSessionJourney
          users={(data?.users || []).map((u) => ({
            userKey: u.userKey,
            profileId: u.profileId,
            userName: u.userName,
            userEmail: u.userEmail,
            batchYear: u.batchYear,
            isOnlineNow: u.isOnlineNow,
            totalClicks: u.totalClicks,
            totalDwellSec: u.totalDwellSec,
          }))}
          selectedUserKey={journeyUserKey}
          onSelectUserKey={setJourneyUserKey}
          onViewProfile={onViewProfile}
        />
      )}

      {/* TAB 5: AD AUDIENCE BUILDER & TARGETED COHORTS */}
      {activeSubTab === 'audiences' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          <form onSubmit={handleCreateSegment} className={`${cardCls} p-4 sm:p-5 xl:col-span-5 space-y-4`}>
            <div>
              <h3 className={`text-sm font-bold ${headingTextCls}`}>Create Behavioral Ad Audience Segment</h3>
              <p className={`text-xs mt-0.5 ${mutedTextCls}`}>
                Target users based on the pages they visit, click activity, time spent, device, and MBBS batch.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className={`block text-xs font-semibold mb-1 ${headingTextCls}`}>Segment Name</label>
                <input
                  type="text"
                  value={segName}
                  onChange={(e) => setSegName(e.target.value)}
                  placeholder="e.g., Active Senior Doctors — CME & Hospital Ads"
                  className={`w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-[#038fde] ${subtleSurfaceCls} ${headingTextCls}`}
                />
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${headingTextCls}`}>Campaign Purpose / Notes</label>
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
                  <label className={`block text-xs font-semibold mb-1 ${headingTextCls}`}>Min Clicks</label>
                  <input
                    type="number"
                    min={0}
                    value={segMinClicks}
                    onChange={(e) => setSegMinClicks(Math.max(0, Number(e.target.value) || 0))}
                    className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono tabular-nums focus:outline-none focus:border-[#038fde] ${subtleSurfaceCls} ${headingTextCls}`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${headingTextCls}`}>Min Dwell (Seconds)</label>
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
                  <label className={`block text-xs font-semibold mb-1 ${headingTextCls}`}>Batch From (Optional)</label>
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
                  <label className={`block text-xs font-semibold mb-1 ${headingTextCls}`}>Batch To (Optional)</label>
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
              <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{segmentFeedback}</div>
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

          <div className="xl:col-span-7 space-y-4">
            <div className={`${cardCls} p-4 sm:p-5`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className={`text-sm font-bold ${headingTextCls}`}>Saved Targeted Ad Audiences</h3>
                  <p className={`text-xs ${mutedTextCls}`}>
                    Export any behavioral cohort as CSV for sponsored placements or Meta Custom Audiences
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
                      {seg.description && <p className={`text-xs mt-1 ${mutedTextCls}`}>{seg.description}</p>}
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
                        <span className={`font-mono tabular-nums ${mutedTextCls}`}>{item.userCount} users</span>
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
