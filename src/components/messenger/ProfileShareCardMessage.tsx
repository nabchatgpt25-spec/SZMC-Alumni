import React, { useState } from 'react';
import { ArrowUpRight, Building2, GraduationCap, ShieldCheck, Stethoscope } from 'lucide-react';
import type { StructuredCardData } from '../../utils/structuredChat';

type ProfileCardPayload = Extract<StructuredCardData, { kind: 'profile_card' }>;

interface ProfileShareCardMessageProps {
  data: ProfileCardPayload;
  compact?: boolean;
  onViewProfile?: (profileId: number) => void;
}

function sanitizeCardUrl(rawUrl: string, profileId: number): string {
  const fallback = `?card=${profileId}`;
  const trimmed = (rawUrl || '').trim();
  if (!trimmed || /^(javascript|vbscript|data):/i.test(trimmed)) return fallback;
  return trimmed;
}

export const ProfileShareCardMessage: React.FC<ProfileShareCardMessageProps> = ({
  data,
  compact = false,
  onViewProfile,
}) => {
  const [avatarFailed, setAvatarFailed] = useState(false);

  const initials = data.fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();

  const batchLabel =
    data.batchYear > 0
      ? `SZMC BATCH ${data.batchYear < 10 ? `0${data.batchYear}` : data.batchYear}`
      : 'SZMC ALUMNI';

  const handleOpenProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onViewProfile) {
      onViewProfile(data.profileId);
      return;
    }
    if (typeof window !== 'undefined') {
      const target = sanitizeCardUrl(data.profileUrl, data.profileId);
      window.location.assign(target);
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`relative overflow-hidden rounded-[20px] bg-[#080d1b] text-white border border-white/25 shadow-[0_14px_34px_rgba(0,0,0,0.38)] select-none ${
        compact ? 'w-[248px] max-w-full' : 'w-[285px] sm:w-[310px] max-w-full'
      }`}
    >
      {/* Ambient studio bokeh orbs behind the frosted acrylic surface */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-8 -left-6 w-32 h-32 rounded-full bg-radial from-rose-400/45 via-amber-300/20 to-transparent blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-8 -right-6 w-36 h-36 rounded-full bg-radial from-indigo-500/45 via-sky-400/25 to-transparent blur-2xl"
      />

      {/* Frosted Acrylic Layer */}
      <div
        className={`relative z-10 bg-white/[0.08] backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.35)] ${
          compact ? 'p-3.5 space-y-2.5' : 'p-4 space-y-3'
        }`}
      >
        <div className="flex items-center gap-3">
          {/* Luminous Halo Avatar */}
          <div className="p-[2px] rounded-full bg-gradient-to-tr from-amber-300 via-rose-400 to-violet-500 shadow-[0_0_16px_rgba(244,114,182,0.35)] shrink-0">
            <div
              className={`${
                compact ? 'w-11 h-11' : 'w-13 h-13'
              } rounded-full overflow-hidden bg-slate-900 ring-1 ring-black/40 flex items-center justify-center`}
            >
              {!avatarFailed && data.avatarUrl ? (
                <img
                  src={data.avatarUrl}
                  alt={data.fullName}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs font-extrabold text-white">{initials || 'SZ'}</span>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-1 min-w-0">
              <p className="text-xs sm:text-[13px] font-extrabold tracking-tight text-white truncate">
                {data.fullName}
              </p>
              <ShieldCheck className="w-3.5 h-3.5 text-sky-300 shrink-0" />
            </div>
            <p className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase text-sky-200/95">
              <GraduationCap className="w-3 h-3 shrink-0" />
              <span>{batchLabel}</span>
            </p>
          </div>
        </div>

        {/* Specialty & Institution */}
        <div className="space-y-1 text-[11px] leading-snug text-white/90 border-t border-white/15 pt-2.5">
          <p className="flex items-start gap-1.5 font-semibold text-white">
            <Stethoscope className="w-3.5 h-3.5 text-rose-300 shrink-0 mt-0.5" />
            <span className="line-clamp-2">{data.specialty}</span>
          </p>
          {data.institution && (
            <p className="flex items-start gap-1.5 text-white/75">
              <Building2 className="w-3.5 h-3.5 text-indigo-300 shrink-0 mt-0.5" />
              <span className="line-clamp-1">{data.institution}</span>
            </p>
          )}
          {data.note && (
            <p className="pt-0.5 text-white/85 italic line-clamp-2">&ldquo;{data.note}&rdquo;</p>
          )}
        </div>

        {/* Interactive View Profile CTA */}
        <button
          type="button"
          onClick={handleOpenProfile}
          className="w-full min-h-[38px] px-3 rounded-xl bg-white/95 hover:bg-white text-slate-900 font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer whitespace-nowrap"
        >
          <span>View Profile</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
