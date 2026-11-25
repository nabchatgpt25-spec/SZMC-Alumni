import React from 'react';
import { AlumniProfile, VerificationStatus } from '../../types';
import { isProfileFullyCompleted } from '../../utils/profileCompletion';

export type VerifiedAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface VerifiedAvatarProps {
  src: string;
  alt: string;
  /** Shows ONLY the round scalloped blue verified tick badge when true */
  verified?: boolean;
  /** Alternative to `verified` — shows the blue tick mark strictly when `'verified'` */
  verificationStatus?: VerificationStatus | string | null;
  /** Shows the continuous glowing multicolor circular border when all profile info is completed */
  profileCompleted?: boolean;
  /** Optional profile object used as fallback for `verificationStatus` and `profileCompleted` */
  profile?: Partial<AlumniProfile> | null;
  size?: VerifiedAvatarSize;
  /** Tailwind size classes applied to the inner <img>, e.g. "w-10 h-10" or "w-28 h-28 sm:w-36 sm:h-36" */
  imgClassName?: string;
  /** Additional classes applied to the <img> when NOT inside the glowing circle */
  unverifiedClassName?: string;
  /** Show the round scalloped blue verified checkmark badge at bottom-right (defaults to true for sm..2xl, false for xs) */
  showBadge?: boolean;
  /** Optional wrapper classes */
  className?: string;
  /** Optional online/clinical status dot overlay */
  statusDot?: React.ReactNode;
  /** Optional interactive overlays (e.g. ProfileView camera hover overlay) */
  children?: React.ReactNode;
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'sync' | 'auto';
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  onError?: React.ReactEventHandler<HTMLImageElement>;
}

/**
 * Computes a clean 10-scallop rosette badge path centered at (16, 16) in a 32x32 viewBox.
 */
const SCALLOP_PATH = (() => {
  const cx = 16;
  const cy = 16;
  const lobes = 10;
  const r = 11.2;
  const rArc = 3.55;
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < lobes; i++) {
    const angle = (i * 2 * Math.PI) / lobes - Math.PI / 2;
    pts.push({
      x: Number((cx + r * Math.cos(angle)).toFixed(3)),
      y: Number((cy + r * Math.sin(angle)).toFixed(3)),
    });
  }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < lobes; i++) {
    const next = pts[(i + 1) % lobes];
    d += ` A ${rArc} ${rArc} 0 0 1 ${next.x} ${next.y}`;
  }
  return `${d} Z`;
})();

export function isMemberVerified(
  verified?: boolean,
  verificationStatus?: VerificationStatus | string | null
): boolean {
  if (typeof verificationStatus === 'string') {
    return verificationStatus === 'verified';
  }
  return verified === true;
}

export const VerifiedRoundBadge: React.FC<{
  className?: string;
  title?: string;
}> = ({ className = 'w-4 h-4', title = 'Verified SZMC Member' }) => {
  const uid = React.useId().replace(/:/g, '');
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 pointer-events-none select-none drop-shadow-[0_1.5px_3px_rgba(0,0,0,0.28)] ${className}`}
      title={title}
      aria-label={title}
    >
      <svg viewBox="0 0 32 32" className="w-full h-full overflow-visible" fill="none">
        <defs>
          <linearGradient id={`vb-grad-${uid}`} x1="4" y1="3" x2="28" y2="29" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1DA1F2" />
            <stop offset="55%" stopColor="#0095F6" />
            <stop offset="100%" stopColor="#0277D4" />
          </linearGradient>
        </defs>
        {/* Crisp white outer seal border */}
        <path
          d={SCALLOP_PATH}
          fill={`url(#vb-grad-${uid})`}
          stroke="#FFFFFF"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        {/* Crisp white checkmark */}
        <path
          d="M11.2 16.3L14.4 19.5L21.1 12.6"
          stroke="#FFFFFF"
          strokeWidth="2.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
};

const SIZE_STYLES: Record<
  VerifiedAvatarSize,
  {
    ringPad: string;
    innerPad: string;
    badgeClass: string;
    badgePos: string;
    defaultImgSize: string;
    isLarge: boolean;
  }
> = {
  xs: {
    ringPad: 'p-[1.5px]',
    innerPad: 'p-[1px]',
    badgeClass: 'w-3 h-3',
    badgePos: '-bottom-0.5 -right-0.5',
    defaultImgSize: 'w-6 h-6',
    isLarge: false,
  },
  sm: {
    ringPad: 'p-[2px]',
    innerPad: 'p-[1.5px]',
    badgeClass: 'w-3.5 h-3.5',
    badgePos: '-bottom-0.5 -right-0.5',
    defaultImgSize: 'w-9 h-9',
    isLarge: false,
  },
  md: {
    ringPad: 'p-[2.5px]',
    innerPad: 'p-[1.5px]',
    badgeClass: 'w-4 h-4',
    badgePos: '-bottom-0.5 -right-0.5',
    defaultImgSize: 'w-10 h-10',
    isLarge: false,
  },
  lg: {
    ringPad: 'p-[2.5px]',
    innerPad: 'p-[2px]',
    badgeClass: 'w-[18px] h-[18px]',
    badgePos: '-bottom-0.5 -right-0.5',
    defaultImgSize: 'w-13 h-13',
    isLarge: false,
  },
  xl: {
    ringPad: 'p-[3px]',
    innerPad: 'p-[2px]',
    badgeClass: 'w-5 h-5',
    badgePos: '-bottom-0.5 -right-0.5',
    defaultImgSize: 'w-16 h-16',
    isLarge: true,
  },
  '2xl': {
    ringPad: 'p-[3.5px] sm:p-[4px]',
    innerPad: 'p-[2px] sm:p-[2.5px]',
    badgeClass: 'w-7 h-7 sm:w-8 sm:h-8',
    badgePos: 'bottom-0.5 right-0.5 sm:bottom-1 sm:right-1',
    defaultImgSize: 'w-28 h-28 sm:w-36 sm:h-36',
    isLarge: true,
  },
};

export const VerifiedAvatar: React.FC<VerifiedAvatarProps> = ({
  src,
  alt,
  verified,
  verificationStatus,
  profileCompleted,
  profile,
  size = 'md',
  imgClassName,
  unverifiedClassName = 'rounded-full ring-2 ring-slate-100 dark:ring-slate-800',
  showBadge,
  className = '',
  statusDot,
  children,
  loading,
  decoding,
  referrerPolicy = 'no-referrer',
  onError,
}) => {
  const isVerified = isMemberVerified(
    verified,
    verificationStatus ?? profile?.verificationStatus
  );
  const hasCompletedProfileGlow =
    profileCompleted !== undefined
      ? Boolean(profileCompleted)
      : profile
      ? isProfileFullyCompleted(profile)
      : false;

  const spec = SIZE_STYLES[size];
  const finalImgSize = imgClassName || spec.defaultImgSize;
  const shouldShowTick = isVerified && (showBadge !== undefined ? showBadge : size !== 'xs');

  // Case 1: Member completed all profile info -> show continuous glowing circular border
  // (plus blue tick badge ONLY if verified)
  if (hasCompletedProfileGlow) {
    return (
      <div className={`verified-avatar-shell shrink-0 ${className}`}>
        <span
          aria-hidden="true"
          className={`verified-avatar-halo ${spec.isLarge ? 'verified-avatar-halo-lg' : ''}`}
        />
        <div className={`verified-avatar-ring ${spec.ringPad}`}>
          <div className={`verified-avatar-inner relative ${spec.innerPad}`}>
            <img
              src={src}
              alt={alt}
              loading={loading}
              decoding={decoding}
              referrerPolicy={referrerPolicy}
              onError={onError}
              className={`${finalImgSize} rounded-full object-cover block`}
            />
            {children}
          </div>
        </div>
        {shouldShowTick && (
          <VerifiedRoundBadge
            className={`absolute z-20 ${spec.badgePos} ${spec.badgeClass}`}
            title="Verified SZMC Member"
          />
        )}
        {statusDot}
      </div>
    );
  }

  // Case 2: Profile NOT yet 100% completed, but member IS verified ->
  // ONLY blue tick mark on a clean circular avatar (NO glowing border)
  if (isVerified) {
    const cleanRoundClass = unverifiedClassName
      .replace(/\brounded-(?!full\b)\S+/g, '')
      .trim();
    return (
      <div className={`relative inline-flex shrink-0 ${className}`}>
        <img
          src={src}
          alt={alt}
          loading={loading}
          decoding={decoding}
          referrerPolicy={referrerPolicy}
          onError={onError}
          className={`${finalImgSize} object-cover rounded-full ${cleanRoundClass}`}
        />
        {children}
        {shouldShowTick && (
          <VerifiedRoundBadge
            className={`absolute z-20 ${spec.badgePos} ${spec.badgeClass}`}
            title="Verified SZMC Member"
          />
        )}
        {statusDot}
      </div>
    );
  }

  // Case 3: Unverified and profile not yet completed -> standard avatar only
  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      <img
        src={src}
        alt={alt}
        loading={loading}
        decoding={decoding}
        referrerPolicy={referrerPolicy}
        onError={onError}
        className={`${finalImgSize} object-cover ${unverifiedClassName}`}
      />
      {statusDot}
      {children}
    </div>
  );
};
