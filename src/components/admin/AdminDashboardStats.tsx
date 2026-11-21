import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Droplets,
  FileText,
  GraduationCap,
  PieChart as PieChartIcon,
  RefreshCw,
  Users,
} from 'lucide-react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { loadStoredAlumniProfiles } from '../../data/mockData';
import { useAdminVisualMode } from './adminVisualModes';
import { AnimatedCounter } from './AdminNeonAnalyticsVisuals';

/* ============================================================================
   TYPES & CONSTANTS
   ============================================================================ */

interface AlumniStatRow {
  id: number;
  batch_year: number | null;
  verification_status: string | null;
  blood_group: string | null;
  role: string | null;
  created_at: string | null;
}

interface PostStatRow {
  id: number;
  category: string | null;
  is_deleted: boolean | null;
  likes_count: number | null;
  comments_count: number | null;
  created_at: string | null;
}

interface BloodDonorStatRow {
  id: number;
  blood_group: string | null;
  is_available: boolean | null;
  created_at: string | null;
}

interface SimpleTimestampRow {
  id: number | string;
  created_at?: string | null;
  uploaded_at?: string | null;
}

interface GrowthDatum {
  key: string;
  label: string;
  newUsers: number;
  verifiedUsers: number;
  posts: number;
  cumulativeUsers: number;
}

interface DistributionDatum {
  name: string;
  value: number;
  percent: number;
  color: string;
}

type TimeRange = '6m' | '12m' | 'all';
type BarChartView = 'growth' | 'activity';
type DonutChartView = 'batches' | 'blood_groups';
type RealtimeStatus = 'connecting' | 'subscribed' | 'error' | 'offline';

const REALTIME_STATS_TABLES = [
  'alumni_profiles',
  'batches',
  'posts',
  'blood_donors',
  'blood_requests',
  'events',
  'gallery_photos',
  'official_notices',
] as const;

const NEON_PALETTE = [
  '#22d3ee', // cyan
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#f59e0b', // amber
  '#f43f5e', // rose
  '#38bdf8', // sky
  '#a78bfa', // lavender
  '#94a3b8', // slate
];

const CLASSIC_PALETTE = [
  '#0284c7', // sky-600
  '#4f46e5', // indigo-600
  '#059669', // emerald-600
  '#d97706', // amber-600
  '#dc2626', // red-600
  '#0d9488', // teal-600
  '#7c3aed', // violet-600
  '#64748b', // slate-500
];

const FLUID_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/* ============================================================================
   HELPERS
   ============================================================================ */

function monthKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthShortLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function buildRecentMonthKeys(count: number): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKeyFromDate(d));
  }
  return keys;
}

function safeParseDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatSyncTime(iso: string | null): string {
  if (!iso) return 'Syncing';
  const d = safeParseDate(iso);
  if (!d) return 'Just now';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/* ============================================================================
   CUSTOM RECHARTS TOOLTIPS
   ============================================================================ */

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
    dataKey?: string;
    payload?: any;
  }>;
  label?: string;
  isNeonMode: boolean;
}

const GrowthChartTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label, isNeonMode }) => {
  if (!active || !payload || payload.length === 0) return null;
  const cumulative = payload[0]?.payload?.cumulativeUsers;

  return (
    <div
      className={`rounded-xl px-3.5 py-2.5 text-xs shadow-xl backdrop-blur-md border ${
        isNeonMode
          ? 'bg-[#071127]/95 border-cyan-400/35 text-slate-100'
          : 'bg-white/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100'
      }`}
    >
      <p className={`font-bold mb-1.5 ${isNeonMode ? 'text-cyan-200' : 'text-slate-900 dark:text-white'}`}>
        {label}
      </p>
      <div className="space-y-1">
        {payload.map((entry, idx) => (
          <div key={`${entry.dataKey}-${idx}`} className="flex items-center justify-between gap-5">
            <span className="flex items-center gap-2 text-[11px] opacity-85">
              <span
                className="w-2.5 h-2.5 rounded-xs shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}
            </span>
            <span className="font-mono font-bold tabular-nums">
              {Number(entry.value ?? 0).toLocaleString()}
            </span>
          </div>
        ))}
        {typeof cumulative === 'number' && (
          <div
            className={`pt-1.5 mt-1.5 border-t flex items-center justify-between gap-5 text-[11px] ${
              isNeonMode
                ? 'border-white/10 text-slate-300'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            <span>Cumulative Alumni</span>
            <span className="font-mono font-bold tabular-nums">{cumulative.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const DonutChartTooltip: React.FC<CustomTooltipProps> = ({ active, payload, isNeonMode }) => {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]?.payload as DistributionDatum | undefined;
  if (!item) return null;

  return (
    <div
      className={`rounded-xl px-3.5 py-2.5 text-xs shadow-xl backdrop-blur-md border ${
        isNeonMode
          ? 'bg-[#071127]/95 border-violet-400/35 text-slate-100'
          : 'bg-white/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{ backgroundColor: item.color }} />
        <span className="font-bold">{item.name}</span>
      </div>
      <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums opacity-90">
        <span>{item.value.toLocaleString()} members</span>
        <span aria-hidden="true">·</span>
        <span>{item.percent.toFixed(1)}%</span>
      </div>
    </div>
  );
};

/* ============================================================================
   MAIN COMPONENT: AdminDashboardStats
   ============================================================================ */

export interface AdminDashboardStatsProps {
  defaultExpanded?: boolean;
  className?: string;
}

export const AdminDashboardStats: React.FC<AdminDashboardStatsProps> = ({
  defaultExpanded = true,
  className = '',
}) => {
  const [visualMode] = useAdminVisualMode();
  const isNeonMode = visualMode === 'neon_aura';

  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>(
    isSupabaseConfigured ? 'connecting' : 'offline'
  );
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [realtimeEventCount, setRealtimeEventCount] = useState<number>(0);
  const [lastChangedTable, setLastChangedTable] = useState<string | null>(null);

  // Raw live dataset states
  const [alumniRows, setAlumniRows] = useState<AlumniStatRow[]>([]);
  const [postRows, setPostRows] = useState<PostStatRow[]>([]);
  const [donorRows, setDonorRows] = useState<BloodDonorStatRow[]>([]);
  const [eventsCount, setEventsCount] = useState<number>(0);
  const [noticesCount, setNoticesCount] = useState<number>(0);
  const [photosCount, setPhotosCount] = useState<number>(0);

  // Interactive chart controls
  const [timeRange, setTimeRange] = useState<TimeRange>('6m');
  const [barView, setBarView] = useState<BarChartView>('growth');
  const [donutView, setDonutView] = useState<DonutChartView>('batches');
  const [activeSliceIndex, setActiveSliceIndex] = useState<number | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLiveStats = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    setError(null);

    const loadFallbackProfiles = (): AlumniStatRow[] => {
      const local = loadStoredAlumniProfiles();
      return local.map((p, idx) => ({
        id: Number(p.id) || idx + 1,
        batch_year: typeof p.batchYear === 'number' ? p.batchYear : null,
        verification_status: p.verificationStatus || 'unverified',
        blood_group: p.bloodGroup || null,
        role: p.role || 'member',
        created_at:
          (p as any).createdAt ||
          new Date(Date.now() - ((idx % 9) * 26 + 3) * 86400_000).toISOString(),
      }));
    };

    if (!isSupabaseConfigured) {
      setAlumniRows(loadFallbackProfiles());
      setPostRows([]);
      setDonorRows([]);
      setEventsCount(0);
      setNoticesCount(0);
      setPhotosCount(0);
      setLastUpdatedAt(new Date().toISOString());
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const [alumniRes, postsRes, donorsRes, eventsRes, noticesRes, photosRes] =
        await Promise.allSettled([
          supabase
            .from('alumni_profiles')
            .select('id, batch_year, verification_status, blood_group, role, created_at')
            .order('created_at', { ascending: true })
            .limit(2000),
          supabase
            .from('posts')
            .select('id, category, is_deleted, likes_count, comments_count, created_at')
            .eq('is_deleted', false)
            .order('created_at', { ascending: true })
            .limit(1500),
          supabase
            .from('blood_donors')
            .select('id, blood_group, is_available, created_at')
            .limit(1500),
          supabase.from('events').select('id', { count: 'exact', head: true }),
          supabase.from('official_notices').select('id', { count: 'exact', head: true }),
          supabase.from('gallery_photos').select('id', { count: 'exact', head: true }),
        ]);

      let nextAlumni: AlumniStatRow[] = [];
      if (alumniRes.status === 'fulfilled' && !alumniRes.value.error && Array.isArray(alumniRes.value.data)) {
        nextAlumni = alumniRes.value.data as AlumniStatRow[];
      }
      if (nextAlumni.length === 0) {
        nextAlumni = loadFallbackProfiles();
      }
      setAlumniRows(nextAlumni);

      if (postsRes.status === 'fulfilled' && !postsRes.value.error && Array.isArray(postsRes.value.data)) {
        setPostRows(postsRes.value.data as PostStatRow[]);
      }

      if (donorsRes.status === 'fulfilled' && !donorsRes.value.error && Array.isArray(donorsRes.value.data)) {
        setDonorRows(donorsRes.value.data as BloodDonorStatRow[]);
      }

      if (eventsRes.status === 'fulfilled' && !eventsRes.value.error) {
        setEventsCount(eventsRes.value.count ?? 0);
      }

      if (noticesRes.status === 'fulfilled' && !noticesRes.value.error) {
        setNoticesCount(noticesRes.value.count ?? 0);
      }

      if (photosRes.status === 'fulfilled' && !photosRes.value.error) {
        setPhotosCount(photosRes.value.count ?? 0);
      }

      setLastUpdatedAt(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message || 'Unable to fetch live analytics from Supabase.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load + Real-time multi-table Supabase subscription
  useEffect(() => {
    void fetchLiveStats(false);

    if (!isSupabaseConfigured) {
      setRealtimeStatus('offline');
      return;
    }

    setRealtimeStatus('connecting');
    const channel = supabase.channel('szmc-admin-dashboard-stats-rt');

    const triggerDebouncedRefresh = (tableName: string) => {
      setRealtimeEventCount((c) => c + 1);
      setLastChangedTable(tableName);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void fetchLiveStats(false);
      }, 280);
    };

    for (const table of REALTIME_STATS_TABLES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          triggerDebouncedRefresh(table);
        }
      );
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setRealtimeStatus('subscribed');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setRealtimeStatus('error');
      } else if (status === 'CLOSED') {
        setRealtimeStatus('offline');
      }
    });

    channelRef.current = channel;

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetchLiveStats]);

  // Reset hovered donut slice when switching view
  useEffect(() => {
    setActiveSliceIndex(null);
  }, [donutView]);

  /* ==========================================================================
     COMPUTED METRICS & CHART DATASETS
     ========================================================================== */

  const summary = useMemo(() => {
    const totalUsers = alumniRows.length;
    const verifiedUsers = alumniRows.filter((u) => u.verification_status === 'verified').length;
    const verificationRate = totalUsers > 0 ? Math.round((verifiedUsers / totalUsers) * 100) : 0;

    const activePosts = postRows.length;
    const totalInteractions = postRows.reduce(
      (sum, p) => sum + Number(p.likes_count || 0) + Number(p.comments_count || 0),
      0
    );

    const bloodRegistered =
      donorRows.length > 0
        ? donorRows.length
        : alumniRows.filter((u) => Boolean(u.blood_group && u.blood_group.trim())).length;
    const bloodAvailable =
      donorRows.length > 0
        ? donorRows.filter((d) => d.is_available !== false).length
        : bloodRegistered;

    const batchSet = new Set(
      alumniRows.map((u) => u.batch_year).filter((y): y is number => typeof y === 'number' && y > 1950)
    );

    return {
      totalUsers,
      verifiedUsers,
      verificationRate,
      activePosts,
      totalInteractions,
      bloodRegistered,
      bloodAvailable,
      uniqueBatches: batchSet.size,
      eventsCount,
      noticesCount,
      photosCount,
    };
  }, [alumniRows, postRows, donorRows, eventsCount, noticesCount, photosCount]);

  // Bar Chart Data: Monthly User Growth & Post Activity
  const growthChartData = useMemo<GrowthDatum[]>(() => {
    let monthKeys: string[];
    if (timeRange === '6m') {
      monthKeys = buildRecentMonthKeys(6);
    } else if (timeRange === '12m') {
      monthKeys = buildRecentMonthKeys(12);
    } else {
      const discovered = new Set<string>(buildRecentMonthKeys(6));
      alumniRows.forEach((u) => {
        const d = safeParseDate(u.created_at);
        if (d) discovered.add(monthKeyFromDate(d));
      });
      postRows.forEach((p) => {
        const d = safeParseDate(p.created_at);
        if (d) discovered.add(monthKeyFromDate(d));
      });
      monthKeys = Array.from(discovered).sort().slice(-18);
    }

    const bucketMap = new Map<string, { newUsers: number; verifiedUsers: number; posts: number }>();
    monthKeys.forEach((k) => bucketMap.set(k, { newUsers: 0, verifiedUsers: 0, posts: 0 }));

    const earliestKey = monthKeys[0] || '';
    let baselineUsersBeforeWindow = 0;

    alumniRows.forEach((u) => {
      const d = safeParseDate(u.created_at);
      if (!d) {
        baselineUsersBeforeWindow += 1;
        return;
      }
      const key = monthKeyFromDate(d);
      const bucket = bucketMap.get(key);
      if (bucket) {
        bucket.newUsers += 1;
        if (u.verification_status === 'verified') {
          bucket.verifiedUsers += 1;
        }
      } else if (key < earliestKey) {
        baselineUsersBeforeWindow += 1;
      }
    });

    postRows.forEach((p) => {
      const d = safeParseDate(p.created_at);
      if (!d) return;
      const key = monthKeyFromDate(d);
      const bucket = bucketMap.get(key);
      if (bucket) {
        bucket.posts += 1;
      }
    });

    let runningTotal = baselineUsersBeforeWindow;
    return monthKeys.map((key) => {
      const b = bucketMap.get(key) || { newUsers: 0, verifiedUsers: 0, posts: 0 };
      runningTotal += b.newUsers;
      return {
        key,
        label: monthShortLabel(key),
        newUsers: b.newUsers,
        verifiedUsers: b.verifiedUsers,
        posts: b.posts,
        cumulativeUsers: runningTotal,
      };
    });
  }, [alumniRows, postRows, timeRange]);

  // Post Category Breakdown (for Activity Bar View)
  const categoryBarData = useMemo(() => {
    const counts = new Map<string, { category: string; posts: number; engagement: number }>();
    postRows.forEach((p) => {
      const cat = (p.category || 'General').trim() || 'General';
      const prev = counts.get(cat) || { category: cat, posts: 0, engagement: 0 };
      prev.posts += 1;
      prev.engagement += Number(p.likes_count || 0) + Number(p.comments_count || 0);
      counts.set(cat, prev);
    });
    return Array.from(counts.values())
      .sort((a, b) => b.posts - a.posts)
      .slice(0, 7);
  }, [postRows]);

  // Donut Chart Data: Batch Distribution or Blood Group Distribution
  const donutData = useMemo<DistributionDatum[]>(() => {
    const palette = isNeonMode ? NEON_PALETTE : CLASSIC_PALETTE;
    const counts = new Map<string, number>();

    if (donutView === 'batches') {
      alumniRows.forEach((u) => {
        const label = u.batch_year ? `Batch ${u.batch_year}` : 'Unspecified';
        counts.set(label, (counts.get(label) || 0) + 1);
      });
    } else {
      const source =
        donorRows.length > 0
          ? donorRows.map((d) => d.blood_group)
          : alumniRows.map((u) => u.blood_group);

      source.forEach((bg) => {
        const clean = bg?.trim().toUpperCase();
        if (!clean) return;
        counts.set(clean, (counts.get(clean) || 0) + 1);
      });
    }

    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((acc, [, v]) => acc + v, 0);
    if (total === 0) return [];

    const maxSlices = donutView === 'batches' ? 6 : 8;
    const top = sorted.slice(0, maxSlices);
    const overflow = sorted.slice(maxSlices);
    const overflowTotal = overflow.reduce((acc, [, v]) => acc + v, 0);

    const finalEntries: Array<[string, number]> =
      overflowTotal > 0 ? [...top, ['Other Batches', overflowTotal]] : top;

    return finalEntries.map(([name, value], idx) => ({
      name,
      value,
      percent: (value / total) * 100,
      color: palette[idx % palette.length],
    }));
  }, [alumniRows, donorRows, donutView, isNeonMode]);

  const activeDonutSlice =
    activeSliceIndex !== null && donutData[activeSliceIndex] ? donutData[activeSliceIndex] : null;
  const donutTotal = useMemo(() => donutData.reduce((s, d) => s + d.value, 0), [donutData]);

  // Palette helpers for Recharts axes & grids
  const chartColors = useMemo(
    () => ({
      grid: isNeonMode ? 'rgba(148, 163, 184, 0.14)' : 'rgba(148, 163, 184, 0.22)',
      axisText: isNeonMode ? '#94a3b8' : '#64748b',
      barPrimary: isNeonMode ? '#22d3ee' : '#0284c7',
      barSecondary: isNeonMode ? '#8b5cf6' : '#059669',
      barTertiary: isNeonMode ? '#10b981' : '#4f46e5',
      barEngagement: isNeonMode ? '#f59e0b' : '#d97706',
    }),
    [isNeonMode]
  );

  const connectionLabel =
    realtimeStatus === 'subscribed'
      ? 'Live Supabase Sync'
      : realtimeStatus === 'connecting'
      ? 'Connecting Realtime'
      : realtimeStatus === 'error'
      ? 'Sync Interrupted'
      : 'Local Fallback';

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: FLUID_EASE }}
      aria-label="Live Alumni Analytics Dashboard"
      className={`rounded-2xl transition-colors ${
        isNeonMode
          ? 'bg-[#081229]/85 border border-cyan-400/25 shadow-[0_0_36px_-14px_rgba(34,211,238,0.28)]'
          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs'
      } ${className}`}
    >
      {/* Top Section Header */}
      <div
        className={`px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isExpanded
            ? isNeonMode
              ? 'border-b border-white/10'
              : 'border-b border-slate-100 dark:border-slate-800'
            : ''
        }`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3
              data-preserve-text-color="true"
              className={`text-sm sm:text-base font-extrabold tracking-tight ${
                isNeonMode ? 'text-white' : 'text-slate-900 dark:text-white'
              }`}
            >
              Real-Time Alumni Analytics
            </h3>
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${
                realtimeStatus === 'subscribed'
                  ? isNeonMode
                    ? 'text-emerald-300'
                    : 'text-emerald-600 dark:text-emerald-400'
                  : realtimeStatus === 'error'
                  ? 'text-rose-500'
                  : isNeonMode
                  ? 'text-slate-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  realtimeStatus === 'subscribed'
                    ? 'bg-emerald-400'
                    : realtimeStatus === 'connecting'
                    ? 'bg-amber-400'
                    : realtimeStatus === 'error'
                    ? 'bg-rose-500'
                    : 'bg-slate-400'
                }`}
              />
              {connectionLabel}
            </span>
          </div>
          <p
            className={`text-[11px] mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 ${
              isNeonMode ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <span>Subscribed to {REALTIME_STATS_TABLES.length} Supabase tables</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">Updated {formatSyncTime(lastUpdatedAt)}</span>
            {realtimeEventCount > 0 && lastChangedTable && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {realtimeEventCount} live {realtimeEventCount === 1 ? 'update' : 'updates'} ({lastChangedTable})
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void fetchLiveStats(true)}
            disabled={refreshing}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60 ${
              isNeonMode
                ? 'bg-slate-900/90 text-cyan-200 border border-cyan-400/25 hover:border-cyan-400/50 hover:bg-slate-800/90'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            aria-expanded={isExpanded}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isNeonMode
                ? 'bg-slate-900/90 text-slate-200 border border-white/10 hover:border-cyan-400/35'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <span>{isExpanded ? 'Collapse' : 'Show Charts'}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="stats-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: FLUID_EASE }}
            className="overflow-hidden"
          >
            <div className="p-5 space-y-6">
              {error && (
                <div
                  className={`rounded-xl px-4 py-3 text-xs flex items-center justify-between gap-3 ${
                    isNeonMode
                      ? 'bg-rose-950/50 border border-rose-400/30 text-rose-200'
                      : 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  <span>{error}</span>
                  <button
                    type="button"
                    onClick={() => void fetchLiveStats(true)}
                    className="font-bold underline cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* KPI Overview Strip (Clean Hairline Dividers, Zero Nested Card Clutter) */}
              <div
                className={`grid grid-cols-2 lg:grid-cols-4 gap-4 pb-5 border-b ${
                  isNeonMode ? 'border-white/10' : 'border-slate-100 dark:border-slate-800'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <Users className={`w-3.5 h-3.5 ${isNeonMode ? 'text-cyan-400' : 'text-sky-600 dark:text-sky-400'}`} />
                    <span className={isNeonMode ? 'text-slate-300' : ''}>Registered Alumni</span>
                  </div>
                  <div
                    className={`text-2xl font-black tracking-tight ${
                      isNeonMode ? 'text-white' : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {loading ? (
                      <span className="inline-block h-7 w-16 rounded bg-slate-200/60 dark:bg-slate-800 animate-pulse" />
                    ) : (
                      <AnimatedCounter value={summary.totalUsers} />
                    )}
                  </div>
                  <p className={`text-[11px] font-mono tabular-nums ${isNeonMode ? 'text-cyan-300/85' : 'text-slate-500 dark:text-slate-400'}`}>
                    {summary.verifiedUsers.toLocaleString()} verified · {summary.verificationRate}%
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <GraduationCap className={`w-3.5 h-3.5 ${isNeonMode ? 'text-violet-400' : 'text-indigo-600 dark:text-indigo-400'}`} />
                    <span className={isNeonMode ? 'text-slate-300' : ''}>Active Batches</span>
                  </div>
                  <div
                    className={`text-2xl font-black tracking-tight ${
                      isNeonMode ? 'text-white' : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {loading ? (
                      <span className="inline-block h-7 w-14 rounded bg-slate-200/60 dark:bg-slate-800 animate-pulse" />
                    ) : (
                      <AnimatedCounter value={summary.uniqueBatches} />
                    )}
                  </div>
                  <p className={`text-[11px] font-mono tabular-nums ${isNeonMode ? 'text-violet-300/85' : 'text-slate-500 dark:text-slate-400'}`}>
                    {summary.eventsCount.toLocaleString()} events · {summary.noticesCount.toLocaleString()} notices
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <FileText className={`w-3.5 h-3.5 ${isNeonMode ? 'text-emerald-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
                    <span className={isNeonMode ? 'text-slate-300' : ''}>Community Posts</span>
                  </div>
                  <div
                    className={`text-2xl font-black tracking-tight ${
                      isNeonMode ? 'text-white' : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {loading ? (
                      <span className="inline-block h-7 w-16 rounded bg-slate-200/60 dark:bg-slate-800 animate-pulse" />
                    ) : (
                      <AnimatedCounter value={summary.activePosts} />
                    )}
                  </div>
                  <p className={`text-[11px] font-mono tabular-nums ${isNeonMode ? 'text-emerald-300/85' : 'text-slate-500 dark:text-slate-400'}`}>
                    {summary.totalInteractions.toLocaleString()} interactions · {summary.photosCount.toLocaleString()} photos
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <Droplets className={`w-3.5 h-3.5 ${isNeonMode ? 'text-rose-400' : 'text-rose-600 dark:text-rose-400'}`} />
                    <span className={isNeonMode ? 'text-slate-300' : ''}>Blood Donors</span>
                  </div>
                  <div
                    className={`text-2xl font-black tracking-tight ${
                      isNeonMode ? 'text-white' : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {loading ? (
                      <span className="inline-block h-7 w-14 rounded bg-slate-200/60 dark:bg-slate-800 animate-pulse" />
                    ) : (
                      <AnimatedCounter value={summary.bloodRegistered} />
                    )}
                  </div>
                  <p className={`text-[11px] font-mono tabular-nums ${isNeonMode ? 'text-rose-300/85' : 'text-slate-500 dark:text-slate-400'}`}>
                    {summary.bloodAvailable.toLocaleString()} ready to donate
                  </p>
                </div>
              </div>

              {/* 12-Column Interactive Recharts Stage */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
                {/* LEFT (7 cols): User Growth & Post Activity Bar Chart */}
                <div className="xl:col-span-7 flex flex-col justify-between min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <BarChart3
                          className={`w-4 h-4 ${
                            isNeonMode ? 'text-cyan-400' : 'text-sky-600 dark:text-sky-400'
                          }`}
                        />
                        <h4
                          data-preserve-text-color="true"
                          className={`text-sm font-bold ${
                            isNeonMode ? 'text-white' : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {barView === 'growth'
                            ? 'Alumni Growth & Verification Trend'
                            : 'Community Posts by Category'}
                        </h4>
                      </div>
                      <p className={`text-xs mt-0.5 ${isNeonMode ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        {barView === 'growth'
                          ? 'Monthly sign-ups, verified profiles, and published posts'
                          : 'Active feed posts and member engagement across categories'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {/* Metric View Switcher */}
                      <div
                        className={`inline-flex items-center p-0.5 rounded-lg ${
                          isNeonMode
                            ? 'bg-slate-950/80 border border-white/10'
                            : 'bg-slate-100 dark:bg-slate-800'
                        }`}
                      >
                        {(
                          [
                            { id: 'growth', label: 'User Growth' },
                            { id: 'activity', label: 'Categories' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setBarView(opt.id)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                              barView === opt.id
                                ? isNeonMode
                                  ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40'
                                  : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                                : isNeonMode
                                ? 'text-slate-400 hover:text-slate-100'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      {/* Timeframe Filter (for User Growth) */}
                      {barView === 'growth' && (
                        <div
                          className={`inline-flex items-center p-0.5 rounded-lg ${
                            isNeonMode
                              ? 'bg-slate-950/80 border border-white/10'
                              : 'bg-slate-100 dark:bg-slate-800'
                          }`}
                        >
                          {(
                            [
                              { id: '6m', label: '6M' },
                              { id: '12m', label: '12M' },
                              { id: 'all', label: 'All' },
                            ] as const
                          ).map((tf) => (
                            <button
                              key={tf.id}
                              type="button"
                              onClick={() => setTimeRange(tf.id)}
                              className={`px-2 py-1 rounded-md text-[11px] font-mono font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                                timeRange === tf.id
                                  ? isNeonMode
                                    ? 'bg-violet-500/30 text-violet-100 border border-violet-400/40'
                                    : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                                  : isNeonMode
                                  ? 'text-slate-400 hover:text-slate-100'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                              }`}
                            >
                              {tf.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Responsive Recharts Bar Chart Viewport */}
                  <div className="w-full h-[270px] sm:h-[290px]">
                    {loading ? (
                      <div className="w-full h-full flex items-end gap-3 px-4 pb-6 pt-8">
                        {[42, 68, 54, 82, 60, 90].map((h, i) => (
                          <div
                            key={i}
                            style={{ height: `${h}%` }}
                            className={`flex-1 rounded-t-md animate-pulse ${
                              isNeonMode ? 'bg-cyan-500/15' : 'bg-slate-100 dark:bg-slate-800'
                            }`}
                          />
                        ))}
                      </div>
                    ) : barView === 'growth' ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={growthChartData}
                          margin={{ top: 10, right: 8, left: -16, bottom: 4 }}
                          barGap={4}
                        >
                          <defs>
                            <linearGradient id="szmcBarNewUsers" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={chartColors.barPrimary} stopOpacity={0.95} />
                              <stop offset="100%" stopColor={chartColors.barPrimary} stopOpacity={0.45} />
                            </linearGradient>
                            <linearGradient id="szmcBarVerified" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={chartColors.barSecondary} stopOpacity={0.95} />
                              <stop offset="100%" stopColor={chartColors.barSecondary} stopOpacity={0.45} />
                            </linearGradient>
                            <linearGradient id="szmcBarPosts" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={chartColors.barTertiary} stopOpacity={0.9} />
                              <stop offset="100%" stopColor={chartColors.barTertiary} stopOpacity={0.4} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                          <XAxis
                            dataKey="label"
                            tick={{ fill: chartColors.axisText, fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            dy={6}
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fill: chartColors.axisText, fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            cursor={{
                              fill: isNeonMode ? 'rgba(34,211,238,0.08)' : 'rgba(15,23,42,0.04)',
                            }}
                            content={<GrowthChartTooltip isNeonMode={isNeonMode} />}
                          />
                          <Legend
                            verticalAlign="top"
                            align="right"
                            height={28}
                            iconType="square"
                            iconSize={9}
                            wrapperStyle={{ fontSize: '11px', color: chartColors.axisText }}
                          />
                          <Bar
                            dataKey="newUsers"
                            name="New Alumni"
                            fill="url(#szmcBarNewUsers)"
                            radius={[6, 6, 0, 0]}
                            maxBarSize={28}
                          />
                          <Bar
                            dataKey="verifiedUsers"
                            name="Verified"
                            fill="url(#szmcBarVerified)"
                            radius={[6, 6, 0, 0]}
                            maxBarSize={28}
                          />
                          <Bar
                            dataKey="posts"
                            name="Posts"
                            fill="url(#szmcBarPosts)"
                            radius={[6, 6, 0, 0]}
                            maxBarSize={24}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : categoryBarData.length === 0 ? (
                      <div className="w-full h-full flex flex-col items-center justify-center text-center px-4">
                        <p className={`text-sm font-semibold ${isNeonMode ? 'text-slate-200' : 'text-slate-700 dark:text-slate-200'}`}>
                          No active community posts recorded yet
                        </p>
                        <p className={`text-xs mt-1 ${isNeonMode ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>
                          Publish a post from the Control Panel to see real-time category metrics appear here.
                        </p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={categoryBarData}
                          margin={{ top: 10, right: 8, left: -16, bottom: 4 }}
                          barGap={6}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                          <XAxis
                            dataKey="category"
                            tick={{ fill: chartColors.axisText, fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            dy={6}
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fill: chartColors.axisText, fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            cursor={{
                              fill: isNeonMode ? 'rgba(34,211,238,0.08)' : 'rgba(15,23,42,0.04)',
                            }}
                            content={<GrowthChartTooltip isNeonMode={isNeonMode} />}
                          />
                          <Legend
                            verticalAlign="top"
                            align="right"
                            height={28}
                            iconType="square"
                            iconSize={9}
                            wrapperStyle={{ fontSize: '11px', color: chartColors.axisText }}
                          />
                          <Bar
                            dataKey="posts"
                            name="Posts"
                            fill={chartColors.barPrimary}
                            radius={[6, 6, 0, 0]}
                            maxBarSize={32}
                          />
                          <Bar
                            dataKey="engagement"
                            name="Likes & Comments"
                            fill={chartColors.barEngagement}
                            radius={[6, 6, 0, 0]}
                            maxBarSize={32}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* RIGHT (5 cols): Batch Distribution & Blood Group Donut Chart */}
                <div
                  className={`xl:col-span-5 flex flex-col justify-between min-w-0 xl:pl-6 xl:border-l ${
                    isNeonMode
                      ? 'border-white/10'
                      : 'border-slate-100 dark:border-slate-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <PieChartIcon
                          className={`w-4 h-4 ${
                            isNeonMode ? 'text-violet-400' : 'text-indigo-600 dark:text-indigo-400'
                          }`}
                        />
                        <h4
                          data-preserve-text-color="true"
                          className={`text-sm font-bold ${
                            isNeonMode ? 'text-white' : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {donutView === 'batches' ? 'Batch Distribution' : 'Blood Group Mix'}
                        </h4>
                      </div>
                      <p className={`text-xs mt-0.5 ${isNeonMode ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        {donutView === 'batches'
                          ? 'Alumni cohort share across registered batches'
                          : 'Registered donor pool by blood group'}
                      </p>
                    </div>

                    <div
                      className={`inline-flex items-center p-0.5 rounded-lg shrink-0 ${
                        isNeonMode
                          ? 'bg-slate-950/80 border border-white/10'
                          : 'bg-slate-100 dark:bg-slate-800'
                      }`}
                    >
                      {(
                        [
                          { id: 'batches', label: 'Batches' },
                          { id: 'blood_groups', label: 'Blood' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setDonutView(opt.id)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            donutView === opt.id
                              ? isNeonMode
                                ? 'bg-violet-500/30 text-violet-100 border border-violet-400/40'
                                : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                              : isNeonMode
                              ? 'text-slate-400 hover:text-slate-100'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {loading ? (
                    <div className="h-[270px] flex items-center justify-center">
                      <div
                        className={`w-44 h-44 rounded-full border-[18px] animate-pulse ${
                          isNeonMode ? 'border-cyan-500/20' : 'border-slate-200 dark:border-slate-800'
                        }`}
                      />
                    </div>
                  ) : donutData.length === 0 ? (
                    <div className="h-[270px] flex flex-col items-center justify-center text-center px-4">
                      <p className={`text-sm font-semibold ${isNeonMode ? 'text-slate-200' : 'text-slate-700 dark:text-slate-200'}`}>
                        No distribution records available
                      </p>
                      <p className={`text-xs mt-1 ${isNeonMode ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        Records will automatically populate as members register or update profiles.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center flex-1">
                      {/* Donut SVG */}
                      <div className="sm:col-span-6 relative h-[220px] sm:h-[245px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={donutData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius="58%"
                              outerRadius="86%"
                              paddingAngle={2.5}
                              strokeWidth={0}
                              onMouseEnter={(_, idx) => setActiveSliceIndex(idx)}
                              onMouseLeave={() => setActiveSliceIndex(null)}
                              onClick={(_, idx) =>
                                setActiveSliceIndex((prev) => (prev === idx ? null : idx))
                              }
                            >
                              {donutData.map((entry, idx) => {
                                const dimmed = activeSliceIndex !== null && activeSliceIndex !== idx;
                                return (
                                  <Cell
                                    key={`slice-${entry.name}`}
                                    fill={entry.color}
                                    fillOpacity={dimmed ? 0.35 : 0.95}
                                    style={{ cursor: 'pointer', transition: 'fill-opacity 180ms ease' }}
                                  />
                                );
                              })}
                            </Pie>
                            <Tooltip content={<DonutChartTooltip isNeonMode={isNeonMode} />} />
                          </PieChart>
                        </ResponsiveContainer>

                        {/* Center Readout */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-3">
                          <span
                            className={`text-xl font-black font-mono tabular-nums leading-none ${
                              isNeonMode ? 'text-white' : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {activeDonutSlice
                              ? `${activeDonutSlice.percent.toFixed(0)}%`
                              : donutTotal.toLocaleString()}
                          </span>
                          <span
                            className={`text-[11px] font-medium mt-1 truncate max-w-[100px] ${
                              isNeonMode ? 'text-cyan-200' : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {activeDonutSlice
                              ? activeDonutSlice.name
                              : donutView === 'batches'
                              ? 'Total Alumni'
                              : 'Total Donors'}
                          </span>
                          {activeDonutSlice && (
                            <span
                              className={`text-[10px] font-mono tabular-nums mt-0.5 ${
                                isNeonMode ? 'text-slate-400' : 'text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              {activeDonutSlice.value.toLocaleString()} members
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Interactive Legend Breakdown */}
                      <div className="sm:col-span-6 space-y-1.5 max-h-[245px] overflow-y-auto pr-1">
                        {donutData.map((item, idx) => {
                          const isSelected = activeSliceIndex === idx;
                          return (
                            <button
                              key={item.name}
                              type="button"
                              onMouseEnter={() => setActiveSliceIndex(idx)}
                              onMouseLeave={() => setActiveSliceIndex(null)}
                              onClick={() =>
                                setActiveSliceIndex((prev) => (prev === idx ? null : idx))
                              }
                              className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                                isSelected
                                  ? isNeonMode
                                    ? 'bg-white/10 text-white'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                                  : isNeonMode
                                  ? 'text-slate-300 hover:bg-white/5'
                                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                              }`}
                            >
                              <span className="flex items-center gap-2 min-w-0">
                                <span
                                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                                  style={{ backgroundColor: item.color }}
                                />
                                <span className="text-xs font-medium truncate">{item.name}</span>
                              </span>
                              <span className="flex items-center gap-2 shrink-0 font-mono tabular-nums text-[11px]">
                                <span className="font-bold">{item.value.toLocaleString()}</span>
                                <span className={isNeonMode ? 'text-slate-400' : 'text-slate-400 dark:text-slate-500'}>
                                  {item.percent.toFixed(0)}%
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
};

export default AdminDashboardStats;
