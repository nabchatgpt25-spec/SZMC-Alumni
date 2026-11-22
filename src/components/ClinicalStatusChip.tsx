import React from 'react';
import {
  Stethoscope,
  Activity,
  Building2,
  BookOpen,
  PhoneCall,
  X,
} from 'lucide-react';
import {
  CLINICAL_STATUS_META,
  CLINICAL_STATUS_OPTIONS,
  type ClinicalStatusKey,
} from '../utils/clinicalStatus';

function StatusIcon({ status, className }: { status: ClinicalStatusKey; className?: string }) {
  switch (status) {
    case 'on_duty':
      return <Stethoscope className={className} />;
    case 'in_ot':
      return <Activity className={className} />;
    case 'in_clinic':
      return <Building2 className={className} />;
    case 'studying':
      return <BookOpen className={className} />;
    case 'on_call':
      return <PhoneCall className={className} />;
  }
}

interface ClinicalStatusChipProps {
  status?: ClinicalStatusKey | null;
  size?: 'xs' | 'sm' | 'md';
  onDarkHeader?: boolean;
  className?: string;
}

export const ClinicalStatusChip: React.FC<ClinicalStatusChipProps> = ({
  status,
  size = 'sm',
  onDarkHeader = false,
  className = '',
}) => {
  if (!status) return null;
  const meta = CLINICAL_STATUS_META[status];
  if (!meta) return null;

  const sizeClass =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[10px] gap-1'
      : size === 'md'
      ? 'px-3 py-1 text-xs gap-1.5'
      : 'px-2 py-0.5 text-[11px] gap-1';

  const colorClass = onDarkHeader
    ? 'bg-white/20 border-white/30 text-white'
    : meta.badgeClass;

  return (
    <span
      title={meta.description}
      className={`inline-flex items-center rounded-full border font-bold whitespace-nowrap backdrop-blur-sm ${sizeClass} ${colorClass} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full animate-pulse shrink-0 ${onDarkHeader ? 'bg-white' : meta.dotClass}`} />
      <StatusIcon status={status} className={size === 'xs' ? 'w-2.5 h-2.5 shrink-0' : 'w-3 h-3 shrink-0'} />
      <span>{meta.label}</span>
    </span>
  );
};

interface ClinicalStatusSelectorProps {
  currentStatus: ClinicalStatusKey | null;
  onSelect: (next: ClinicalStatusKey | null) => void;
  compact?: boolean;
  className?: string;
}

export const ClinicalStatusSelector: React.FC<ClinicalStatusSelectorProps> = ({
  currentStatus,
  onSelect,
  compact = false,
  className = '',
}) => {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`} role="group" aria-label="Set live clinical status">
      {CLINICAL_STATUS_OPTIONS.map((option) => {
        const active = currentStatus === option.key;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onSelect(active ? null : option.key)}
            aria-pressed={active}
            title={option.description}
            className={`inline-flex items-center gap-1.5 rounded-full border font-bold transition-all cursor-pointer active:scale-95 whitespace-nowrap ${
              compact ? 'min-h-[32px] px-2.5 py-1 text-[11px]' : 'min-h-[40px] px-3 py-1.5 text-xs'
            } ${
              active
                ? option.activeButtonClass
                : 'bg-white/90 dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                active ? 'bg-white animate-pulse' : option.dotClass
              }`}
            />
            <StatusIcon status={option.key} className="w-3.5 h-3.5 shrink-0" />
            <span>{option.label}</span>
          </button>
        );
      })}
      {currentStatus && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          title="Clear clinical status"
          aria-label="Clear clinical status"
          className={`inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 font-semibold transition-colors cursor-pointer ${
            compact ? 'min-h-[32px] px-2 py-1 text-[11px]' : 'min-h-[40px] px-3 py-1.5 text-xs'
          }`}
        >
          <X className="w-3 h-3" />
          <span>Clear</span>
        </button>
      )}
    </div>
  );
};
