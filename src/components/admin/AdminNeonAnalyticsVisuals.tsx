import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Calendar,
  RefreshCw,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { SZMCLogo } from '../SZMCLogo';

/* ============================================================================
   1. ANIMATED NUMERIC COUNTER (Smooth spring count-up with tabular-nums)
   ============================================================================ */
export const AnimatedCounter: React.FC<{ value: number; suffix?: string; className?: string }> = ({
  value,
  suffix = '',
  className = '',
}) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let rafId = 0;
    const startVal = display;
    const targetVal = Number.isFinite(value) ? value : 0;
    const duration = 650;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(startVal + (targetVal - startVal) * eased);
      setDisplay(next);
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {display.toLocaleString()}
      {suffix}
    </span>
  );
};

/* ============================================================================
   2. NEON CAMPUS HERO WELCOME BANNER
   ============================================================================ */
interface NeonHeroBannerProps {
  adminName: string;
  subtitle: string;
  motto?: string;
  campusImageUrl?: string;
  logoUrl?: string;
  statLabel: string;
  statValue: string | number;
  connectionText?: string;
  connectionOk?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export const NeonHeroBanner: React.FC<NeonHeroBannerProps> = ({
  adminName,
  subtitle,
  motto = 'Once a SZMCian, Always a SZMCian',
  campusImageUrl = '/assets/szmc/szmc_day_1.jpg',
  statLabel,
  statValue,
  connectionText,
  connectionOk = true,
  onRefresh,
  refreshing = false,
}) => {
  const firstName = useMemo(() => {
    const cleaned = (adminName || 'Admin').replace(/^Dr\.?\s*/i, '').trim();
    const parts = cleaned.split(/\s+/);
    return parts[parts.length - 1] || cleaned || 'Admin';
  }, [adminName]);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl border border-cyan-400/25 bg-[#081226] shadow-[0_0_45px_-12px_rgba(34,211,238,0.28)]"
    >
      {/* Campus Background Photo with Cinematic Neon Gradient Mask */}
      <div className="absolute inset-0 pointer-events-none">
        <img
          src={campusImageUrl || '/assets/szmc/szmc_day_1.jpg'}
          alt="SZMC Campus"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-center opacity-55 scale-[1.02]"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(95deg, rgba(6,11,25,0.96) 0%, rgba(9,19,42,0.88) 44%, rgba(11,22,48,0.45) 75%, rgba(6,11,25,0.82) 100%)',
          }}
        />
        {/* Ambient Neon Sweeps */}
        <div className="absolute -left-20 -top-24 w-72 h-72 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute right-10 -bottom-24 w-80 h-80 rounded-full bg-violet-500/20 blur-3xl" />
        {/* Subtle Luminous Top Border Line */}
        <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400/80 to-violet-400/60" />
      </div>

      <div className="relative z-10 px-5 py-5 sm:px-7 sm:py-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex items-start sm:items-center gap-4 min-w-0">
          <motion.div
            whileHover={{ rotate: [0, -4, 4, 0], scale: 1.05 }}
            transition={{ duration: 0.4 }}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-950/75 backdrop-blur-md border border-cyan-400/35 p-1.5 shadow-[0_0_24px_rgba(34,211,238,0.3)] shrink-0 flex items-center justify-center"
          >
            <SZMCLogo className="w-full h-full" />
          </motion.div>

          <div className="min-w-0">
            <h1
              data-preserve-text-color="true"
              className="text-xl sm:text-2xl font-extrabold tracking-tight text-white leading-tight"
            >
              Welcome back,{' '}
              <span className="bg-gradient-to-r from-cyan-300 via-teal-200 to-emerald-300 bg-clip-text text-transparent">
                {firstName}!
              </span>
            </h1>
            <p data-preserve-text-color="true" className="text-xs sm:text-sm text-slate-300/90 mt-1 max-w-xl">
              {subtitle}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2.5 text-[11px] text-slate-200">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-950/70 backdrop-blur-md border border-white/10">
                <Calendar className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                <span className="font-mono tabular-nums">Today: {todayLabel}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-950/70 backdrop-blur-md border border-white/10">
                <span className="text-slate-400">{statLabel}:</span>
                <span className="font-mono font-bold tabular-nums text-cyan-300">
                  {typeof statValue === 'number' ? statValue.toLocaleString() : statValue}
                </span>
              </div>
              {connectionText && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-950/70 backdrop-blur-md border border-white/10">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      connectionOk ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400'
                    }`}
                  />
                  <span className={connectionOk ? 'text-emerald-300 font-medium' : 'text-amber-300 font-medium'}>
                    {connectionText}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between gap-3 shrink-0">
          <div
            data-preserve-text-color="true"
            className="hidden sm:block text-right italic font-serif text-sm sm:text-base text-amber-200/95 drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] max-w-[240px]"
          >
            &ldquo;{motto}&rdquo;
          </div>
          {onRefresh && (
            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500/20 to-violet-500/25 hover:from-cyan-500/30 hover:to-violet-500/35 border border-cyan-400/40 text-xs font-semibold text-white shadow-[0_0_20px_-4px_rgba(34,211,238,0.45)] transition-all cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-300 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Syncing Live...' : 'Sync Live Data'}</span>
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

/* ============================================================================
   3. NEON LUMINOUS KPI SPARKLINE CARD (Cyan / Violet / Emerald / Rose-Amber)
   ============================================================================ */
export type NeonCardTone = 'cyan' | 'violet' | 'emerald' | 'rose';

const TONE_MAP: Record<
  NeonCardTone,
  {
    border: string;
    glow: string;
    bgGrad: string;
    iconBg: string;
    iconColor: string;
    stroke: string;
    fillId: string;
    deltaText: string;
  }
> = {
  cyan: {
    border: 'border-cyan-400/40 hover:border-cyan-300/75',
    glow: 'shadow-[0_0_28px_-10px_rgba(34,211,238,0.48)] hover:shadow-[0_0_36px_-8px_rgba(34,211,238,0.72)]',
    bgGrad: 'from-cyan-500/15 via-[#0b1730]/90 to-[#091225]/95',
    iconBg: 'bg-cyan-500/20 border-cyan-400/40',
    iconColor: 'text-cyan-300',
    stroke: '#22d3ee',
    fillId: 'sparkCyan',
    deltaText: 'text-cyan-300',
  },
  violet: {
    border: 'border-fuchsia-400/40 hover:border-fuchsia-300/75',
    glow: 'shadow-[0_0_28px_-10px_rgba(192,132,252,0.48)] hover:shadow-[0_0_36px_-8px_rgba(192,132,252,0.72)]',
    bgGrad: 'from-violet-500/18 via-[#101432]/90 to-[#0a1026]/95',
    iconBg: 'bg-violet-500/20 border-violet-400/40',
    iconColor: 'text-violet-300',
    stroke: '#c084fc',
    fillId: 'sparkViolet',
    deltaText: 'text-fuchsia-300',
  },
  emerald: {
    border: 'border-emerald-400/40 hover:border-emerald-300/75',
    glow: 'shadow-[0_0_28px_-10px_rgba(52,211,153,0.45)] hover:shadow-[0_0_36px_-8px_rgba(52,211,153,0.7)]',
    bgGrad: 'from-emerald-500/15 via-[#091c2a]/90 to-[#081523]/95',
    iconBg: 'bg-emerald-500/20 border-emerald-400/40',
    iconColor: 'text-emerald-300',
    stroke: '#34d399',
    fillId: 'sparkEmerald',
    deltaText: 'text-emerald-300',
  },
  rose: {
    border: 'border-rose-400/40 hover:border-amber-300/70',
    glow: 'shadow-[0_0_28px_-10px_rgba(251,113,133,0.45)] hover:shadow-[0_0_36px_-8px_rgba(251,113,133,0.7)]',
    bgGrad: 'from-rose-500/16 via-[#1a1328]/90 to-[#0d1224]/95',
    iconBg: 'bg-rose-500/20 border-rose-400/40',
    iconColor: 'text-rose-300',
    stroke: '#fb7185',
    fillId: 'sparkRose',
    deltaText: 'text-amber-300',
  },
};

interface NeonSparklineCardProps {
  label: string;
  value: number;
  suffix?: string;
  sublabel: string;
  tone: NeonCardTone;
  icon: React.ComponentType<{ className?: string }>;
  series?: number[];
  onClick?: () => void;
  delay?: number;
}

export const NeonSparklineCard: React.FC<NeonSparklineCardProps> = ({
  label,
  value,
  suffix = '',
  sublabel,
  tone,
  icon: Icon,
  series = [18, 28, 24, 42, 37, 56, 52, 74],
  onClick,
  delay = 0,
}) => {
  const styles = TONE_MAP[tone];
  const [hovered, setHovered] = useState(false);

  const { linePath, areaPath, lastPoint } = useMemo(() => {
    const pts = series.length >= 2 ? series : [10, 20, 18, 30];
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = Math.max(1, max - min);
    const w = 132;
    const h = 54;
    const padY = 6;

    const coords = pts.map((v, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - padY - ((v - min) / span) * (h - padY * 2);
      return { x, y };
    });

    // Smooth cubic bezier curve through points
    let d = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i];
      const p1 = coords[i + 1];
      const cx = (p0.x + p1.x) / 2;
      d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
    }

    const area = `${d} L ${w} ${h} L 0 ${h} Z`;
    return { linePath: d, areaPath: area, lastPoint: coords[coords.length - 1] };
  }, [series]);

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, scale: 1.012 }}
      whileTap={{ scale: 0.99 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 text-left transition-all cursor-pointer w-full ${styles.border} ${styles.glow} ${styles.bgGrad}`}
    >
      {/* Top Edge Highlight */}
      <div
        className="absolute inset-x-4 top-0 h-[1.5px] opacity-80 pointer-events-none"
        style={{
          background: `linear-gradient(90deg, transparent, ${styles.stroke}, transparent)`,
        }}
      />

      <div className="relative z-10 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className={`w-9 h-9 rounded-xl border flex items-center justify-center mb-3 transition-transform duration-300 group-hover:scale-110 ${styles.iconBg}`}
          >
            <Icon className={`w-4 h-4 ${styles.iconColor}`} />
          </div>

          <div
            data-preserve-text-color="true"
            className="text-2xl sm:text-[28px] font-extrabold text-white tracking-tight leading-none"
          >
            <AnimatedCounter value={value} suffix={suffix} />
          </div>
          <div data-preserve-text-color="true" className="text-xs font-medium text-slate-300 mt-1.5 truncate">
            {label}
          </div>
          <div className={`text-[11px] font-semibold mt-1 flex items-center gap-1 ${styles.deltaText}`}>
            <TrendingUp className="w-3 h-3 shrink-0" />
            <span className="truncate">{sublabel}</span>
          </div>
        </div>

        {/* Animated Neon Sparkline SVG */}
        <div className="w-28 sm:w-32 h-16 shrink-0 self-end">
          <svg viewBox="0 0 132 54" className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id={`${styles.fillId}-${label.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={styles.stroke} stopOpacity="0.38" />
                <stop offset="100%" stopColor={styles.stroke} stopOpacity="0" />
              </linearGradient>
            </defs>
            <motion.path
              d={areaPath}
              fill={`url(#${styles.fillId}-${label.replace(/\s+/g, '')})`}
              initial={{ opacity: 0 }}
              animate={{ opacity: hovered ? 1 : 0.72 }}
              transition={{ duration: 0.4 }}
            />
            <motion.path
              d={linePath}
              fill="none"
              stroke={styles.stroke}
              strokeWidth="2.5"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, delay: delay + 0.1, ease: 'easeOut' }}
              style={{ filter: `drop-shadow(0 0 6px ${styles.stroke})` }}
            />
            <motion.circle
              cx={lastPoint.x}
              cy={lastPoint.y}
              r={hovered ? 4.5 : 3.2}
              fill="#ffffff"
              stroke={styles.stroke}
              strokeWidth="2"
              animate={{ scale: hovered ? 1.25 : 1 }}
              style={{ filter: `drop-shadow(0 0 8px ${styles.stroke})` }}
            />
          </svg>
        </div>
      </div>
    </motion.button>
  );
};

/* ============================================================================
   4. NEON CIRCULAR RADIAL RING GAUGE (Interactive Animated Donut Circle)
   ============================================================================ */
interface NeonCircularGaugeProps {
  percentage: number;
  label: string;
  sublabel?: string;
  size?: number;
  idSuffix?: string;
}

export const NeonCircularGauge: React.FC<NeonCircularGaugeProps> = ({
  percentage,
  label,
  sublabel,
  size = 158,
  idSuffix = 'main',
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(percentage)));
  const strokeWidth = 12;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const targetOffset = circumference - (clamped / 100) * circumference;

  return (
    <motion.div
      whileHover={{ scale: 1.04 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      className="relative inline-flex flex-col items-center justify-center select-none"
    >
      <div className="relative" style={{ width: size, height: size }}>
        {/* Soft Neon Halo Behind Circle */}
        <div
          className="absolute inset-3 rounded-full blur-xl opacity-35 pointer-events-none"
          style={{
            background: 'conic-gradient(from 0deg, #22d3ee, #818cf8, #34d399, #22d3ee)',
          }}
        />
        <svg width={size} height={size} className="-rotate-90 relative z-10">
          <defs>
            <linearGradient id={`neonRingGrad-${idSuffix}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="50%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="rgba(7, 14, 30, 0.7)"
            stroke="rgba(148, 163, 184, 0.16)"
            strokeWidth={strokeWidth}
          />
          {/* Animated Progress Ring */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#neonRingGrad-${idSuffix})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: targetOffset }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            style={{ filter: 'drop-shadow(0 0 8px rgba(34,211,238,0.6))' }}
          />
        </svg>

        {/* Center Readout */}
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center px-3">
          <div data-preserve-text-color="true" className="text-3xl font-extrabold text-white leading-none">
            <AnimatedCounter value={clamped} suffix="%" />
          </div>
          <div data-preserve-text-color="true" className="text-[11px] font-medium text-cyan-200/90 mt-1.5 leading-tight">
            {label}
          </div>
        </div>
      </div>

      {sublabel && (
        <div className="mt-2 text-xs font-semibold text-emerald-300 flex items-center gap-1">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>{sublabel}</span>
        </div>
      )}
    </motion.div>
  );
};

/* ============================================================================
   5. INTERACTIVE PLATFORM ANALYTICS STAGE (Wave Lines + Interactive Bars + Ring)
   ============================================================================ */
export interface AnalyticsDataPoint {
  label: string;
  primary: number;
  secondary: number;
}

export interface HorizontalMetricBar {
  label: string;
  value: number;
  max: number;
  tone: NeonCardTone;
  onClick?: () => void;
}

interface InteractivePlatformAnalyticsProps {
  title: string;
  primaryLabel: string;
  secondaryLabel: string;
  dataByRange: Record<'7D' | '30D' | '90D' | '1Y', AnalyticsDataPoint[]>;
  ringPercentage: number;
  ringLabel: string;
  ringSublabel: string;
  distributionBars: HorizontalMetricBar[];
}

export const InteractivePlatformAnalytics: React.FC<InteractivePlatformAnalyticsProps> = ({
  title,
  primaryLabel,
  secondaryLabel,
  dataByRange,
  ringPercentage,
  ringLabel,
  ringSublabel,
  distributionBars,
}) => {
  const [range, setRange] = useState<'7D' | '30D' | '90D' | '1Y'>('30D');
  const [chartType, setChartType] = useState<'wave' | 'bars'>('wave');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const points = dataByRange[range] || dataByRange['30D'];

  const maxVal = useMemo(() => {
    const vals = points.flatMap((p) => [p.primary, p.secondary]);
    return Math.max(5, ...vals);
  }, [points]);

  // Precompute smooth SVG curves for wave chart
  const waveGeom = useMemo(() => {
    const w = 520;
    const h = 190;
    const padX = 24;
    const padTop = 18;
    const padBottom = 28;
    const usableW = w - padX * 2;
    const usableH = h - padTop - padBottom;

    const mapCoords = (key: 'primary' | 'secondary') =>
      points.map((p, idx) => {
        const x = padX + (idx / Math.max(1, points.length - 1)) * usableW;
        const y = padTop + usableH - (p[key] / maxVal) * usableH;
        return { x, y, val: p[key], label: p.label };
      });

    const buildCurve = (coords: { x: number; y: number }[]) => {
      if (coords.length === 0) return '';
      let d = `M ${coords[0].x} ${coords[0].y}`;
      for (let i = 0; i < coords.length - 1; i++) {
        const p0 = coords[i];
        const p1 = coords[i + 1];
        const cx = (p0.x + p1.x) / 2;
        d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
      }
      return d;
    };

    const primaryCoords = mapCoords('primary');
    const secondaryCoords = mapCoords('secondary');
    const primaryLine = buildCurve(primaryCoords);
    const secondaryLine = buildCurve(secondaryCoords);
    const baseY = padTop + usableH;
    const primaryArea =
      primaryCoords.length > 0
        ? `${primaryLine} L ${primaryCoords[primaryCoords.length - 1].x} ${baseY} L ${primaryCoords[0].x} ${baseY} Z`
        : '';
    const secondaryArea =
      secondaryCoords.length > 0
        ? `${secondaryLine} L ${secondaryCoords[secondaryCoords.length - 1].x} ${baseY} L ${secondaryCoords[0].x} ${baseY} Z`
        : '';

    return { w, h, padTop, baseY, primaryCoords, secondaryCoords, primaryLine, secondaryLine, primaryArea, secondaryArea };
  }, [points, maxVal]);

  const activeHoverPoint = hoveredIdx !== null ? points[hoveredIdx] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.12 }}
      className="relative overflow-hidden rounded-2xl border border-cyan-400/30 bg-[#081329]/90 backdrop-blur-xl p-5 shadow-[0_0_40px_-14px_rgba(56,189,248,0.32)]"
    >
      {/* Top Neon Accent Line */}
      <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-cyan-400/70 via-violet-400/60 to-emerald-400/60 pointer-events-none" />

      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-400/35 flex items-center justify-center text-cyan-300">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h2 data-preserve-text-color="true" className="text-sm sm:text-base font-bold text-white leading-tight">
              {title}
            </h2>
            <div className="flex items-center gap-3 text-[11px] text-slate-300 mt-0.5">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
                {primaryLabel}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-fuchsia-400 shadow-[0_0_6px_#e879f9]" />
                {secondaryLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Chart Mode Switcher: Waves vs Interactive Bars */}
          <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-950/80 border border-white/10">
            {(
              [
                { id: 'wave', label: 'Waves' },
                { id: 'bars', label: 'Bars' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setChartType(opt.id)}
                className={`relative px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  chartType === opt.id ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {chartType === opt.id && (
                  <motion.span
                    layoutId="analyticsChartTypePill"
                    className="absolute inset-0 rounded-lg bg-gradient-to-r from-cyan-500/80 to-blue-600/80 shadow-[0_0_12px_rgba(34,211,238,0.45)]"
                    transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                  />
                )}
                <span className="relative z-10">{opt.label}</span>
              </button>
            ))}
          </div>

          {/* Timeframe Selector */}
          <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-950/80 border border-white/10">
            {(['7D', '30D', '90D', '1Y'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`relative px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  range === r ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {range === r && (
                  <motion.span
                    layoutId="analyticsRangePill"
                    className="absolute inset-0 rounded-lg bg-cyan-500/30 border border-cyan-400/50"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{r}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Analytics Stage: Interactive Chart + Circular Neon Ring */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_195px] gap-6 items-center">
        <div className="relative min-h-[210px]">
          {/* Floating Interactive Hover Tooltip */}
          <AnimatePresence>
            {activeHoverPoint && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute right-2 top-0 z-20 rounded-xl border border-cyan-400/35 bg-slate-950/90 backdrop-blur-md px-3 py-2 text-[11px] shadow-[0_8px_24px_rgba(0,0,0,0.6)] pointer-events-none"
              >
                <div className="font-semibold text-white mb-1">{activeHoverPoint.label}</div>
                <div className="flex items-center justify-between gap-4 text-cyan-300 font-mono tabular-nums">
                  <span>{primaryLabel}</span>
                  <strong>{activeHoverPoint.primary.toLocaleString()}</strong>
                </div>
                <div className="flex items-center justify-between gap-4 text-fuchsia-300 font-mono tabular-nums mt-0.5">
                  <span>{secondaryLabel}</span>
                  <strong>{activeHoverPoint.secondary.toLocaleString()}</strong>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {chartType === 'wave' ? (
            <svg
              viewBox={`0 0 ${waveGeom.w} ${waveGeom.h}`}
              className="w-full h-[210px] overflow-visible"
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <defs>
                <linearGradient id="neonWavePrimaryFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.34" />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="neonWaveSecondaryFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c084fc" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#c084fc" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Subtle Horizontal Grid Lines */}
              {[0, 0.33, 0.66, 1].map((frac, i) => {
                const y = waveGeom.padTop + frac * (waveGeom.baseY - waveGeom.padTop);
                return (
                  <line
                    key={i}
                    x1={20}
                    x2={waveGeom.w - 16}
                    y1={y}
                    y2={y}
                    stroke="rgba(148, 163, 184, 0.14)"
                    strokeDasharray="3 4"
                  />
                );
              })}

              {/* Vertical Hover Crosshair */}
              {hoveredIdx !== null && waveGeom.primaryCoords[hoveredIdx] && (
                <line
                  x1={waveGeom.primaryCoords[hoveredIdx].x}
                  x2={waveGeom.primaryCoords[hoveredIdx].x}
                  y1={waveGeom.padTop}
                  y2={waveGeom.baseY}
                  stroke="rgba(34,211,238,0.4)"
                  strokeDasharray="3 3"
                />
              )}

              {/* Area Fills */}
              <motion.path
                key={`area1-${range}`}
                d={waveGeom.primaryArea}
                fill="url(#neonWavePrimaryFill)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              />
              <motion.path
                key={`area2-${range}`}
                d={waveGeom.secondaryArea}
                fill="url(#neonWaveSecondaryFill)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              />

              {/* Luminous Curves */}
              <motion.path
                key={`line1-${range}`}
                d={waveGeom.primaryLine}
                fill="none"
                stroke="#22d3ee"
                strokeWidth="3"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.85, ease: 'easeOut' }}
                style={{ filter: 'drop-shadow(0 0 8px rgba(34,211,238,0.75))' }}
              />
              <motion.path
                key={`line2-${range}`}
                d={waveGeom.secondaryLine}
                fill="none"
                stroke="#c084fc"
                strokeWidth="2.5"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.95, ease: 'easeOut' }}
                style={{ filter: 'drop-shadow(0 0 7px rgba(192,132,252,0.7))' }}
              />

              {/* Interactive Data Nodes & X-Axis Labels */}
              {waveGeom.primaryCoords.map((pt, idx) => {
                const sec = waveGeom.secondaryCoords[idx];
                const isHover = hoveredIdx === idx;
                return (
                  <g
                    key={pt.label}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredIdx(idx)}
                  >
                    {/* Invisible wider hover target */}
                    <rect
                      x={pt.x - 24}
                      y={waveGeom.padTop}
                      width={48}
                      height={waveGeom.baseY - waveGeom.padTop + 22}
                      fill="transparent"
                    />
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isHover ? 6 : 3.5}
                      fill="#ffffff"
                      stroke="#22d3ee"
                      strokeWidth="2.5"
                      style={{ filter: 'drop-shadow(0 0 8px #22d3ee)' }}
                    />
                    {sec && (
                      <circle
                        cx={sec.x}
                        cy={sec.y}
                        r={isHover ? 5.5 : 3}
                        fill="#ffffff"
                        stroke="#c084fc"
                        strokeWidth="2"
                        style={{ filter: 'drop-shadow(0 0 8px #c084fc)' }}
                      />
                    )}
                    <text
                      x={pt.x}
                      y={waveGeom.h - 4}
                      textAnchor="middle"
                      fill={isHover ? '#67e8f9' : '#94a3b8'}
                      fontSize="10"
                      fontFamily="ui-monospace, monospace"
                    >
                      {pt.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          ) : (
            /* Interactive Animated Neon Bar Chart */
            <div
              className="h-[210px] pt-6 pb-2 flex items-end justify-between gap-2 sm:gap-3 px-2"
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {points.map((pt, idx) => {
                const h1 = Math.max(8, Math.round((pt.primary / maxVal) * 145));
                const h2 = Math.max(6, Math.round((pt.secondary / maxVal) * 145));
                const isHover = hoveredIdx === idx;
                return (
                  <div
                    key={`${range}-${pt.label}`}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    className="flex-1 flex flex-col items-center gap-2 cursor-pointer group"
                  >
                    <div className="w-full flex items-end justify-center gap-1.5 h-[155px]">
                      <motion.div
                        initial={{ height: 0, opacity: 0.4 }}
                        animate={{ height: h1, opacity: 1 }}
                        transition={{ duration: 0.55, delay: idx * 0.04, ease: [0.22, 1, 0.36, 1] }}
                        className={`w-3.5 sm:w-5 rounded-t-lg bg-gradient-to-t from-blue-600 via-cyan-400 to-teal-300 transition-all ${
                          isHover
                            ? 'shadow-[0_0_18px_rgba(34,211,238,0.85)] brightness-110'
                            : 'shadow-[0_0_10px_rgba(34,211,238,0.35)]'
                        }`}
                      />
                      <motion.div
                        initial={{ height: 0, opacity: 0.4 }}
                        animate={{ height: h2, opacity: 1 }}
                        transition={{ duration: 0.55, delay: idx * 0.04 + 0.08, ease: [0.22, 1, 0.36, 1] }}
                        className={`w-3.5 sm:w-5 rounded-t-lg bg-gradient-to-t from-violet-700 via-fuchsia-500 to-pink-300 transition-all ${
                          isHover
                            ? 'shadow-[0_0_18px_rgba(232,121,249,0.85)] brightness-110'
                            : 'shadow-[0_0_10px_rgba(192,132,252,0.35)]'
                        }`}
                      />
                    </div>
                    <span
                      className={`text-[10px] font-mono transition-colors ${
                        isHover ? 'text-cyan-300 font-bold' : 'text-slate-400'
                      }`}
                    >
                      {pt.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Side Circular Progress Ring */}
        <div className="flex flex-col items-center justify-center xl:border-l border-white/10 xl:pl-5">
          <NeonCircularGauge
            percentage={ringPercentage}
            label={ringLabel}
            sublabel={ringSublabel}
            idSuffix={title.replace(/\s+/g, '')}
          />
        </div>
      </div>

      {/* Interactive Animated Horizontal Distribution Bars */}
      {distributionBars.length > 0 && (
        <div className="mt-5 pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {distributionBars.map((bar, i) => {
            const pct = Math.min(100, Math.max(4, Math.round((bar.value / Math.max(1, bar.max)) * 100)));
            const grad =
              bar.tone === 'cyan'
                ? 'from-cyan-400 to-blue-500'
                : bar.tone === 'violet'
                ? 'from-fuchsia-400 to-violet-500'
                : bar.tone === 'emerald'
                ? 'from-emerald-400 to-teal-500'
                : 'from-rose-400 to-amber-400';
            return (
              <button
                key={bar.label}
                type="button"
                onClick={bar.onClick}
                className="text-left rounded-xl border border-white/10 bg-slate-950/55 hover:bg-slate-900/75 hover:border-cyan-400/35 px-3 py-2.5 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <span className="text-slate-300 font-medium truncate">{bar.label}</span>
                  <span className="font-mono font-bold tabular-nums text-white ml-2">
                    {bar.value.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-800/90 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.75, delay: 0.15 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                    className={`h-full rounded-full bg-gradient-to-r ${grad} group-hover:brightness-110`}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};

/* ============================================================================
   6. NEON QUICK ACTIONS + LIVE ACTIVITY TIMELINE SIDEBAR
   ============================================================================ */
export interface NeonQuickActionItem {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  primary?: boolean;
  onClick: () => void;
}

export const NeonQuickActionsCard: React.FC<{ actions: NeonQuickActionItem[] }> = ({ actions }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.18 }}
      className="rounded-2xl border border-violet-400/30 bg-[#081329]/90 backdrop-blur-xl p-5 shadow-[0_0_36px_-14px_rgba(168,85,247,0.35)] flex flex-col justify-between gap-3"
    >
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-amber-300" />
        <h3 data-preserve-text-color="true" className="text-sm font-bold text-white">
          Quick Actions
        </h3>
      </div>

      <div className="space-y-2.5 flex-1 flex flex-col justify-center">
        {actions.map((act) => {
          const Icon = act.icon;
          if (act.primary) {
            return (
              <motion.button
                key={act.id}
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={act.onClick}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-500 text-white text-xs font-bold flex items-center justify-between gap-2 shadow-[0_0_24px_-4px_rgba(139,92,246,0.75)] hover:brightness-110 transition-all cursor-pointer"
              >
                <span className="inline-flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  <span>{act.label}</span>
                </span>
                <ArrowUpRight className="w-4 h-4" />
              </motion.button>
            );
          }
          return (
            <motion.button
              key={act.id}
              type="button"
              whileHover={{ x: 3 }}
              whileTap={{ scale: 0.98 }}
              onClick={act.onClick}
              className="w-full py-2.5 px-3.5 rounded-xl border border-white/10 bg-slate-950/60 hover:bg-slate-900/90 hover:border-cyan-400/40 text-left flex items-center justify-between gap-2 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-400/25 flex items-center justify-center text-cyan-300 shrink-0">
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-100 truncate">{act.label}</div>
                  {act.sublabel && (
                    <div className="text-[10px] text-slate-400 truncate">{act.sublabel}</div>
                  )}
                </div>
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
};

export interface NeonActivityItem {
  id: string;
  title: string;
  detail: string;
  time: string;
  tone: NeonCardTone;
}

export const NeonLiveActivityCard: React.FC<{
  title?: string;
  items: NeonActivityItem[];
  emptyText?: string;
}> = ({ title = 'Live Activity Stream', items, emptyText = 'Listening for real-time Supabase events...' }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.22 }}
      className="rounded-2xl border border-cyan-400/25 bg-[#081329]/90 backdrop-blur-xl p-5 shadow-[0_0_36px_-14px_rgba(34,211,238,0.28)]"
    >
      <div className="flex items-center justify-between gap-2 mb-3.5">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-300" />
          <h3 data-preserve-text-color="true" className="text-sm font-bold text-white">
            {title}
          </h3>
        </div>
        <span className="text-[11px] font-mono tabular-nums text-emerald-300 font-semibold">
          {items.length} events
        </span>
      </div>

      {items.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400">{emptyText}</div>
      ) : (
        <div className="relative pl-4 space-y-3 max-h-56 overflow-y-auto pr-1">
          {/* Luminous vertical timeline spine */}
          <div className="absolute left-1.5 top-2 bottom-2 w-px bg-gradient-to-b from-cyan-400/70 via-violet-400/50 to-transparent" />
          {items.slice(0, 6).map((item, idx) => {
            const dotClass =
              item.tone === 'emerald'
                ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                : item.tone === 'violet'
                ? 'bg-fuchsia-400 shadow-[0_0_8px_#e879f9]'
                : item.tone === 'rose'
                ? 'bg-rose-400 shadow-[0_0_8px_#fb7185]'
                : 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]';
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.04 }}
                className="relative rounded-xl border border-white/10 bg-slate-950/55 px-3 py-2 hover:border-cyan-400/35 transition-colors"
              >
                <span className={`absolute -left-[13px] top-3.5 w-2 h-2 rounded-full ${dotClass}`} />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white truncate">{item.title}</span>
                  <span className="text-[10px] font-mono tabular-nums text-slate-400 shrink-0">
                    {item.time}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 truncate mt-0.5">{item.detail}</div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};
