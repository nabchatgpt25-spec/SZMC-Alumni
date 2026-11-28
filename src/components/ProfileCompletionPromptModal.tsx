import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  BadgeCheck,
  HeartHandshake,
  MessageCircle,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import type { AlumniProfile } from '../types';
import { calculateProfileCompletion } from '../utils/profileCompletion';

export interface ProfileCompletionPromptModalProps {
  isOpen: boolean;
  profile: Partial<AlumniProfile> | null;
  onClose: () => void;
  onCompleteProfile: () => void;
  onOpenVerificationCenter?: () => void;
}

const PREMIUM_PERKS = [
  {
    icon: BadgeCheck,
    title: 'Verified Premium Seal & Ring',
    desc: 'Earn your golden verified frame across posts, profile & Alumni ID Card.',
    accent: 'text-amber-300',
  },
  {
    icon: Users,
    title: 'Full Doctor Directory & Contacts',
    desc: 'Unlock direct phone, WhatsApp & specialty lookup across all 35 batches.',
    accent: 'text-sky-300',
  },
  {
    icon: MessageCircle,
    title: 'Batch Lounges & Direct Messenger',
    desc: 'Join private batch rooms, direct alumni chats & senior mentorship.',
    accent: 'text-emerald-300',
  },
  {
    icon: HeartHandshake,
    title: 'Priority Blood Network & Careers',
    desc: 'Access rapid emergency blood coordination, fellowships & global jobs.',
    accent: 'text-rose-300',
  },
] as const;

export const ProfileCompletionPromptModal: React.FC<ProfileCompletionPromptModalProps> = ({
  isOpen,
  profile,
  onClose,
  onCompleteProfile,
  onOpenVerificationCenter,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [avatarFailed, setAvatarFailed] = useState(false);

  const completion = useMemo(
    () => calculateProfileCompletion(profile || {}),
    [profile]
  );

  const missingFields = useMemo(
    () => completion.fields.filter((f) => !f.filled),
    [completion.fields]
  );

  const isVerified = profile?.verificationStatus === 'verified';
  const isComplete = completion.percentage >= 100;
  const firstName = useMemo(() => {
    const raw = (profile?.fullName || '').trim();
    if (!raw) return 'Doctor';
    const parts = raw.split(/\s+/);
    if (/^dr\.?$/i.test(parts[0]) && parts[1]) {
      return `${parts[0]} ${parts[1]}`;
    }
    return parts[0];
  }, [profile?.fullName]);

  // Escape key dismissal & background scroll lock
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // SVG progress ring geometry (radius 38 => circumference ~238.76)
  const ringRadius = 38;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - Math.min(100, Math.max(0, completion.percentage)) / 100);

  const previewMissing = missingFields.slice(0, 3);
  const extraMissingCount = Math.max(0, missingFields.length - previewMissing.length);

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="szmc-complete-profile-popup-title"
      className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
    >
      {/* Keyframes for rotating luminous full-card border */}
      <style>{`
        @keyframes szmcPremiumBorderSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* Soft Blurred Backdrop */}
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="absolute inset-0 bg-[#020612]/78 backdrop-blur-md"
      />

      {/* Floating Luminous Card Container */}
      <motion.div
        initial={
          prefersReducedMotion
            ? { opacity: 0 }
            : { opacity: 0, y: 28, scale: 0.94 }
        }
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          type: 'spring',
          stiffness: 340,
          damping: 28,
        }}
        className="relative z-10 w-full max-w-[440px] my-auto"
      >
        {/* 1. Ambient Full-Card Outer Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-3 rounded-[40px] blur-2xl opacity-65 overflow-hidden"
        >
          <div
            className="absolute -inset-[90%]"
            style={{
              background:
                'conic-gradient(from 0deg, #2563EB 0%, #38BDF8 24%, #F59E0B 50%, #10B981 75%, #818CF8 90%, #2563EB 100%)',
              animation: prefersReducedMotion
                ? 'none'
                : 'szmcPremiumBorderSpin 7s linear infinite',
            }}
          />
        </div>

        {/* 2. Precision Rotating Glowing Card Frame */}
        <div className="relative p-[2.5px] rounded-[34px] overflow-hidden shadow-[0_28px_80px_-14px_rgba(2,6,23,0.92)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-[100%]"
            style={{
              background:
                'conic-gradient(from 0deg, #3B82F6 0%, #F59E0B 26%, #FDE68A 45%, #10B981 68%, #60A5FA 88%, #3B82F6 100%)',
              animation: prefersReducedMotion
                ? 'none'
                : 'szmcPremiumBorderSpin 6s linear infinite',
            }}
          />

          {/* 3. Inner Deep Lapis-Slate Surface */}
          <div
            className="relative rounded-[31.5px] overflow-hidden text-white max-h-[88vh] overflow-y-auto no-scrollbar pb-safe"
            style={{
              background:
                'radial-gradient(circle at 50% 0%, #162c5e 0%, #0b1630 48%, #070e1f 100%)',
            }}
          >
            {/* Top Specular Hairline */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent"
            />

            {/* Mobile Grab Indicator */}
            <div className="sm:hidden pt-3 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Close Button (44x44px hit target) */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close profile completion popup"
              className="absolute top-3 right-3 z-20 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="px-6 pt-7 pb-6 sm:px-7 sm:pt-8 sm:pb-7">
              {/* Top Focal Anchor: Avatar inside Live Circular Completion Ring */}
              <div className="flex flex-col items-center text-center">
                <div className="relative w-[88px] h-[88px] flex items-center justify-center mb-4">
                  <svg
                    className="absolute inset-0 w-full h-full -rotate-90"
                    viewBox="0 0 88 88"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient id="szmcProfileRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#38BDF8" />
                        <stop offset="50%" stopColor="#FBBF24" />
                        <stop offset="100%" stopColor="#34D399" />
                      </linearGradient>
                    </defs>
                    <circle
                      cx="44"
                      cy="44"
                      r={ringRadius}
                      fill="none"
                      stroke="rgba(255,255,255,0.12)"
                      strokeWidth="4.5"
                    />
                    <motion.circle
                      cx="44"
                      cy="44"
                      r={ringRadius}
                      fill="none"
                      stroke="url(#szmcProfileRingGrad)"
                      strokeWidth="4.5"
                      strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      initial={
                        prefersReducedMotion
                          ? { strokeDashoffset: ringOffset }
                          : { strokeDashoffset: ringCircumference }
                      }
                      animate={{ strokeDashoffset: ringOffset }}
                      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
                    />
                  </svg>

                  {/* Avatar or Crest Inside Ring */}
                  <div className="w-[66px] h-[66px] rounded-full overflow-hidden bg-[#0a152e] border border-white/15 flex items-center justify-center shadow-lg">
                    {profile?.avatarUrl && !avatarFailed ? (
                      <img
                        src={profile.avatarUrl}
                        alt={profile.fullName || 'SZMC Alumnus'}
                        referrerPolicy="no-referrer"
                        onError={() => setAvatarFailed(true)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src="/szmc-logo.png"
                        alt="SZMC Crest"
                        referrerPolicy="no-referrer"
                        className="w-11 h-11 object-contain"
                      />
                    )}
                  </div>

                  {/* Golden Verified Premium Seal */}
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-0.5 right-0.5 w-7 h-7 rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-yellow-500 text-slate-950 border-2 border-[#0b1630] flex items-center justify-center shadow-md"
                  >
                    <BadgeCheck className="w-4 h-4 stroke-[2.5]" />
                  </span>
                </div>

                {/* Unboxed Editorial Kicker */}
                <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-amber-300">
                  Verified Premium Profile
                </p>

                {/* Headline */}
                <h2
                  id="szmc-complete-profile-popup-title"
                  className="mt-1.5 text-2xl sm:text-[26px] font-serif font-bold text-white leading-snug text-balance"
                >
                  {isComplete ? (
                    <>
                      Verify &amp; Unlock{' '}
                      <span className="italic font-semibold bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text text-transparent">
                        Full Access
                      </span>
                    </>
                  ) : (
                    <>
                      Complete Your Profile,{' '}
                      <span className="italic font-semibold bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text text-transparent">
                        {firstName}
                      </span>
                    </>
                  )}
                </h2>

                <p className="mt-2 text-[13.5px] text-slate-300 leading-relaxed max-w-sm text-balance">
                  Get your verified, premium SZMC profile to unlock full access to every feature across the alumni network.
                </p>
              </div>

              {/* Completion Progress Strip */}
              <div className="mt-5 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-slate-300 font-medium">
                    Profile Strength
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-amber-300">
                    {completion.percentage}% · {completion.completedCount}/{completion.totalCount} filled
                  </span>
                </div>

                <div className="h-2 w-full rounded-full bg-[#060d1c] overflow-hidden border border-white/10">
                  <motion.div
                    className="h-full rounded-full"
                    initial={prefersReducedMotion ? { width: `${completion.percentage}%` } : { width: '0%' }}
                    animate={{ width: `${completion.percentage}%` }}
                    transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                    style={{
                      background:
                        'linear-gradient(90deg, #38BDF8 0%, #FBBF24 55%, #34D399 100%)',
                      boxShadow: '0 0 12px rgba(251, 191, 36, 0.55)',
                    }}
                  />
                </div>

                {previewMissing.length > 0 && (
                  <p className="mt-2 text-[11.5px] text-slate-400 leading-snug">
                    <span className="text-slate-300 font-medium">Remaining: </span>
                    {previewMissing.map((item, idx) => (
                      <React.Fragment key={item.key}>
                        {idx > 0 && (
                          <span aria-hidden="true" className="mx-1.5 text-slate-600">
                            ·
                          </span>
                        )}
                        <span>{item.label}</span>
                      </React.Fragment>
                    ))}
                    {extraMissingCount > 0 && (
                      <span className="text-amber-300/90 font-medium">
                        {' '}
                        +{extraMissingCount} more
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Clean Hairline-Separated Premium Perks List */}
              <ul className="mt-4 divide-y divide-white/[0.08] border-y border-white/[0.08]">
                {PREMIUM_PERKS.map((perk) => {
                  const Icon = perk.icon;
                  return (
                    <li key={perk.title} className="py-2.5 flex items-start gap-3">
                      <div className={`mt-0.5 shrink-0 ${perk.accent}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-white leading-snug">
                          {perk.title}
                        </div>
                        <p className="text-[11.5px] text-slate-400 leading-snug mt-0.5">
                          {perk.desc}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Thumb-Friendly Action Buttons */}
              <div className="mt-5 space-y-2.5">
                <button
                  type="button"
                  onClick={onCompleteProfile}
                  className="w-full min-h-[50px] px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:brightness-105 active:scale-[0.98] text-slate-950 font-bold text-sm transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1630]"
                >
                  <span>{isComplete ? 'Review My Profile' : 'Complete My Profile Now'}</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </button>

                <div className="flex items-center gap-2">
                  {!isVerified && onOpenVerificationCenter && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenVerificationCenter();
                      }}
                      className="flex-1 min-h-[44px] px-3 py-2 rounded-xl border border-white/15 bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-amber-200 transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>Verify Now</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    Remind Me Later
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

export default ProfileCompletionPromptModal;
