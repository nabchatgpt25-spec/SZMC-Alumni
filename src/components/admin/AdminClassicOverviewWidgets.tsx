import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { ArrowUpRight, Sparkles, type LucideIcon } from 'lucide-react';
import { AnimatedCounter } from './AdminNeonAnalyticsVisuals';

/* ============================================================================
   1. CLASSIC WAVE KPI CARD (Crisp White Card + Bottom Gradient Wave Sparkline)
   ============================================================================ */

export type ClassicWaveVariant = 'amber' | 'teal' | 'coral' | 'line';

export interface ClassicWaveKpiCardProps {
  value: number;
  label: string;
  deltaText?: string;
  deltaPositive?: boolean;
  icon: LucideIcon;
  variant: ClassicWaveVariant;
  series: number[];
  onClick?: () => void;
  delay?: number;
}

const WAVE_STYLES: Record<
  ClassicWaveVariant,
  {
    gradStart: string;
    gradMid: string;
    gradEnd: string;
    stroke: string;
    iconRing: string;
    iconColor: string;
  }
> = {
  amber: {
    gradStart: '#0b2c59',
    gradMid: '#6b6f6c',
    gradEnd: '#f59e0b',
    stroke: '#d97706',
    iconRing: 'border-sky-200 bg-sky-50/70',
    iconColor: 'text-sky-600',
  },
  teal: {
    gradStart: '#38bdf8',
    gradMid: '#14b8a6',
    gradEnd: '#10b981',
    stroke: '#0d9488',
    iconRing: 'border-teal-200 bg-teal-50/70',
    iconColor: 'text-teal-600',
  },
  coral: {
    gradStart: '#fecdd3',
    gradMid: '#fb7185',
    gradEnd: '#e11d48',
    stroke: '#e11d48',
    iconRing: 'border-rose-200 bg-rose-50/70',
    iconColor: 'text-rose-500',
  },
  line: {
    gradStart: '#38bdf8',
    gradMid: '#0284c7',
    gradEnd: '#f59e0b',
    stroke: '#0ea5e9',
    iconRing: 'border-sky-200 bg-sky-50/70',
    iconColor: 'text-sky-600',
  },
};

export const ClassicWaveKpiCard: React.FC<ClassicWaveKpiCardProps> = ({
  value,
  label,
  deltaText,
  deltaPositive = true,
  icon: Icon,
  variant,
  series,
  onClick,
  delay = 0,
}) => {
  const palette = WAVE_STYLES[variant];
  const gradId = useMemo(
    () => `classic-wave-${variant}-${label.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`,
    [variant, label]
  );

  const { linePath, areaPath, points } = useMemo(() => {
    const safe = series.length >= 2 ? series : [4, 7, 5, 10, 8, 12];
    const min = Math.min(...safe);
    const max = Math.max(...safe);
    const range = Math.max(1, max - min);
    const width = 220;
    const height = 56;
    const padTop = 8;
    const padBottom = 6;
    const usableH = height - padTop - padBottom;

    const pts = safe.map((v, idx) => {
      const x = (idx / (safe.length - 1)) * width;
      const y = height - padBottom - ((v - min) / range) * usableH;
      return { x, y };
    });

    if (variant === 'line') {
      const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
      return { linePath: line, areaPath: '', points: pts };
    }

    // Smooth cubic wave curve
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cx = (p0.x + p1.x) / 2;
      d += ` C ${cx.toFixed(1)} ${p0.y.toFixed(1)}, ${cx.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
    }
    const area = `${d} L ${width} ${height} L 0 ${height} Z`;
    return { linePath: d, areaPath: area, points: pts };
  }, [series, variant]);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2 }}
      className="group relative w-full text-left rounded-xl bg-white border border-slate-200/80 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.06)] hover:shadow-[0_10px_24px_-8px_rgba(15,23,42,0.12)] transition-all overflow-hidden cursor-pointer flex flex-col justify-between"
    >
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              <AnimatedCounter value={value} />
            </span>
            {deltaText && (
              <span
                className={`text-[11px] font-bold font-mono tabular-nums ${
                  deltaPositive ? 'text-emerald-600' : 'text-rose-500'
                }`}
              >
                {deltaText}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5 truncate">{label}</p>
        </div>

        <div
          className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${palette.iconRing} ${palette.iconColor}`}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>

      {/* Bottom Wave / Sparkline */}
      <div className="w-full h-14 overflow-hidden">
        <svg viewBox="0 0 220 56" preserveAspectRatio="none" className="w-full h-full block">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={palette.gradStart} stopOpacity={variant === 'coral' ? 0.25 : 0.92} />
              <stop offset="50%" stopColor={palette.gradMid} stopOpacity={0.85} />
              <stop offset="100%" stopColor={palette.gradEnd} stopOpacity={0.95} />
            </linearGradient>
          </defs>

          {variant === 'line' ? (
            <>
              <path
                d={linePath}
                fill="none"
                stroke="#0ea5e9"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {points.map((pt, idx) => (
                <circle
                  key={idx}
                  cx={pt.x}
                  cy={pt.y}
                  r="3.2"
                  fill="#ffffff"
                  stroke={idx % 2 === 0 ? '#f59e0b' : '#0284c7'}
                  strokeWidth="2"
                />
              ))}
            </>
          ) : (
            <path d={areaPath} fill={`url(#${gradId})`} />
          )}
        </svg>
      </div>
    </motion.button>
  );
};

/* ============================================================================
   2. CLASSIC OVERVIEW SUMMARY CARD (Portfolio Balance + Distribution Bars)
   ============================================================================ */

export interface ClassicDistributionItem {
  label: string;
  value: number;
  percent: number;
  color: string;
  onClick?: () => void;
}

export interface ClassicOverviewSummaryCardProps {
  title: string;
  totalValue: number;
  subtitle: string;
  deltaText?: string;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  secondaryActionLabel: string;
  onSecondaryAction: () => void;
  tertiaryActionLabel?: string;
  onTertiaryAction?: () => void;
  distributions: ClassicDistributionItem[];
}

export const ClassicOverviewSummaryCard: React.FC<ClassicOverviewSummaryCardProps> = ({
  title,
  totalValue,
  subtitle,
  deltaText = '+100% live',
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
  tertiaryActionLabel,
  onTertiaryAction,
  distributions,
}) => {
  return (
    <div className="rounded-xl bg-white border border-slate-200/80 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.06)] p-5 flex flex-col justify-between">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
        {/* Left Metric & Action Pair */}
        <div className="md:col-span-6 space-y-3">
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          <div>
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                <AnimatedCounter value={totalValue} />
              </span>
              <span className="text-xs font-bold font-mono tabular-nums text-emerald-600">
                {deltaText}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onPrimaryAction}
              className="px-4 py-2 rounded-lg bg-[#038fde] hover:bg-[#027bc0] text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-xs"
            >
              {primaryActionLabel}
            </button>
            <button
              type="button"
              onClick={onSecondaryAction}
              className="px-4 py-2 rounded-lg bg-[#14b8a6] hover:bg-[#0d9488] text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-xs"
            >
              {secondaryActionLabel}
            </button>
          </div>

          {tertiaryActionLabel && onTertiaryAction && (
            <button
              type="button"
              onClick={onTertiaryAction}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#038fde] hover:text-[#026aa7] transition-colors cursor-pointer pt-0.5"
            >
              <span>{tertiaryActionLabel}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right Distribution Progress Bars */}
        <div className="md:col-span-6 md:pl-5 md:border-l border-slate-100 space-y-3">
          <div className="text-xs font-bold text-slate-700">Portal Record Distribution</div>
          <div className="space-y-3">
            {distributions.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className="w-full text-left group cursor-pointer"
              >
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-medium text-slate-600 group-hover:text-slate-900 transition-colors">
                    {item.label}{' '}
                    <span className="font-mono tabular-nums text-slate-400">
                      · {item.value.toLocaleString()}
                    </span>
                  </span>
                  <span className="font-mono font-semibold tabular-nums text-slate-600">
                    {Math.round(item.percent)}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(4, Math.min(100, item.percent))}%` }}
                    transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   3. CLASSIC ACTIVITY AREA CHART CARD (Balance History Sky-Blue Area Style)
   ============================================================================ */

export interface ClassicHistoryPoint {
  label: string;
  primary: number;
  secondary?: number;
}

export interface ClassicActivityAreaCardProps {
  title: string;
  dataByRange: Record<'7D' | '30D' | '90D', ClassicHistoryPoint[]>;
  seriesLabel?: string;
}

export const ClassicActivityAreaCard: React.FC<ClassicActivityAreaCardProps> = ({
  title,
  dataByRange,
  seriesLabel = 'Portal Activity',
}) => {
  const [range, setRange] = useState<'7D' | '30D' | '90D'>('30D');
  const activeData = dataByRange[range] || dataByRange['30D'] || [];

  return (
    <div className="rounded-xl bg-white border border-slate-200/80 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.06)] p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {(['7D', '30D', '90D'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold transition-colors cursor-pointer ${
                range === r
                  ? 'bg-white text-[#038fde] shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full h-[168px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={activeData} margin={{ top: 6, right: 6, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="classicSkyAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="label"
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              dy={4}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-lg bg-white border border-slate-200 px-3 py-2 shadow-md text-xs">
                    <div className="font-bold text-slate-800 mb-0.5">{label}</div>
                    <div className="text-slate-600 font-mono tabular-nums">
                      {seriesLabel}: <strong className="text-[#038fde]">{Number(payload[0].value).toLocaleString()}</strong>
                    </div>
                  </div>
                );
              }}
            />
            <Area
              type="linear"
              dataKey="primary"
              stroke="#0a2e5c"
              strokeWidth={1.75}
              fill="url(#classicSkyAreaFill)"
              activeDot={{ r: 4, fill: '#038fde', stroke: '#ffffff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

/* ============================================================================
   4. CLASSIC NAVY CALLOUT BANNER (Matches Reference Deep Navy + Amber CTA)
   ============================================================================ */

export interface ClassicNavyHighlightCardProps {
  title: string;
  description: string;
  ctaLabel: string;
  onCtaClick: () => void;
}

export const ClassicNavyHighlightCard: React.FC<ClassicNavyHighlightCardProps> = ({
  title,
  description,
  ctaLabel,
  onCtaClick,
}) => (
  <div className="rounded-xl bg-[#042343] text-white p-5 flex flex-col items-center justify-center text-center shadow-[0_4px_18px_-6px_rgba(4,35,67,0.45)]">
    <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center mb-3 text-amber-300">
      <Sparkles className="w-5 h-5" />
    </div>
    <h4 data-preserve-text-color="true" className="text-sm font-bold text-white">
      {title}
    </h4>
    <p data-preserve-text-color="true" className="text-xs text-slate-300 mt-1.5 leading-relaxed max-w-[240px]">
      {description}
    </p>
    <button
      type="button"
      onClick={onCtaClick}
      className="mt-4 px-4 py-2 rounded-lg bg-[#fa8c16] hover:bg-[#e57c0c] text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shadow-sm"
    >
      {ctaLabel}
    </button>
  </div>
);
