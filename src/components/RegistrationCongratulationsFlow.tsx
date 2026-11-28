/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ArrowRight, Check, X } from 'lucide-react';
import type { AlumniProfile } from '../types';
import { useSiteConfig } from '../services/siteConfigService';

export interface RegistrationCongratulationsFlowProps {
  profile?: Partial<AlumniProfile> | null;
  onComplete: (targetRoute?: string) => void;
  onOpenVerificationCenter?: () => void;
  autoEnterFeed?: boolean;
  autoEnterSeconds?: number;
}

interface ConfettiPiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  wobble: number;
  wobbleSpeed: number;
  opacity: number;
  shape: 'ribbon' | 'circle' | 'diamond';
}

const CONFETTI_COLORS = [
  '#fbbf24', // Warm Gold
  '#f59e0b', // Amber
  '#3b82f6', // Sapphire Blue
  '#60a5fa', // Sky Blue
  '#34d399', // Emerald
  '#f43f5e', // Rose Crimson
  '#a78bfa', // Soft Violet
  '#fef08a', // Pale Champagne Gold
];

function formatWelcomeName(fullName?: string): string {
  const cleaned = (fullName || '').trim();
  if (!cleaned) return 'SZMCian';
  return cleaned;
}

export const RegistrationCongratulationsFlow: React.FC<RegistrationCongratulationsFlowProps> = ({
  profile,
  onComplete,
  autoEnterFeed = true,
  autoEnterSeconds = 5,
}) => {
  const { config } = useSiteConfig();
  const prefersReducedMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<ConfettiPiece[]>([]);
  const [isExiting, setIsExiting] = useState(false);
  const [logoImgFailed, setLogoImgFailed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(autoEnterSeconds);
  const [autoProgress, setAutoProgress] = useState(0);

  const displayName = formatWelcomeName(profile?.fullName);
  const batchNumber =
    profile?.batchYear && Number(profile.batchYear) > 0 ? Number(profile.batchYear) : null;
  const batchText = batchNumber ? `SZMC Batch ${batchNumber}` : 'SZMC MBBS Alumni';
  const locationText =
    [profile?.city?.trim(), profile?.country?.trim()].filter(Boolean).join(', ') ||
    'Bogura, Bangladesh';
  const motto = config.collegeMotto || 'Once a SZMCian, Always a SZMCian';

  const finishFlow = useCallback(
    (targetRoute?: string) => {
      if (isExiting) return;
      setIsExiting(true);
      window.setTimeout(
        () => {
          onComplete(targetRoute);
        },
        prefersReducedMotion ? 50 : 240
      );
    },
    [isExiting, onComplete, prefersReducedMotion]
  );

  // Spawn a celebratory burst of physics-driven confetti pieces
  const spawnConfettiBurst = useCallback(
    (origin: 'cannons' | 'top' | 'center') => {
      if (prefersReducedMotion || typeof window === 'undefined') return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const shapes: ConfettiPiece['shape'][] = ['ribbon', 'ribbon', 'circle', 'diamond'];
      const count = origin === 'cannons' ? (w < 640 ? 64 : 96) : origin === 'top' ? 38 : 44;

      const batch: ConfettiPiece[] = [];
      for (let i = 0; i < count; i += 1) {
        let x = w * 0.5;
        let y = h * 0.45;
        let vx = (Math.random() - 0.5) * 14;
        let vy = -(Math.random() * 11 + 5);

        if (origin === 'cannons') {
          const fromLeft = i % 2 === 0;
          x = fromLeft ? -10 : w + 10;
          y = h * (0.58 + Math.random() * 0.24);
          const angle = fromLeft
            ? -Math.PI * (0.18 + Math.random() * 0.24)
            : -Math.PI * (0.58 + Math.random() * 0.24);
          const speed = (w < 640 ? 9 : 13) + Math.random() * 10;
          vx = Math.cos(angle) * speed;
          vy = Math.sin(angle) * speed - 2.5;
        } else if (origin === 'top') {
          x = Math.random() * w;
          y = -12 - Math.random() * 60;
          vx = (Math.random() - 0.5) * 3.5;
          vy = Math.random() * 3.5 + 2.2;
        }

        const shape = shapes[i % shapes.length];
        batch.push({
          x,
          y,
          vx,
          vy,
          width: shape === 'ribbon' ? 6 + Math.random() * 6 : 6 + Math.random() * 4,
          height: shape === 'ribbon' ? 10 + Math.random() * 8 : 6 + Math.random() * 4,
          color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.22,
          wobble: Math.random() * Math.PI * 2,
          wobbleSpeed: 0.06 + Math.random() * 0.08,
          opacity: 1,
          shape,
        });
      }

      particlesRef.current = [...particlesRef.current.slice(-180), ...batch];
    },
    [prefersReducedMotion]
  );

  // Run 60fps Confetti Canvas Loop
  useEffect(() => {
    if (prefersReducedMotion || typeof window === 'undefined') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    // Opening double celebration burst
    spawnConfettiBurst('cannons');
    const secondBurstTimer = window.setTimeout(() => spawnConfettiBurst('top'), 550);
    const thirdBurstTimer = window.setTimeout(() => spawnConfettiBurst('cannons'), 1450);

    let rafId = 0;
    const render = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      const list = particlesRef.current;
      const nextList: ConfettiPiece[] = [];

      for (let i = 0; i < list.length; i += 1) {
        const p = list[i];
        p.vx *= 0.985;
        p.vy = p.vy * 0.992 + 0.24; // smooth gravity
        p.wobble += p.wobbleSpeed;
        p.x += p.vx + Math.sin(p.wobble) * 0.9;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        if (p.y > h * 0.78) {
          p.opacity -= 0.022;
        }

        if (p.opacity > 0.02 && p.y < h + 40 && p.x > -60 && p.x < w + 60) {
          nextList.push(p);

          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, p.opacity));
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          // 3D paper-flutter illusion on Y-scale
          const flutter = Math.cos(p.wobble * 1.4);
          ctx.scale(1, Math.max(0.25, Math.abs(flutter)));
          ctx.fillStyle = p.color;

          if (p.shape === 'circle') {
            ctx.beginPath();
            ctx.arc(0, 0, p.width * 0.45, 0, Math.PI * 2);
            ctx.fill();
          } else if (p.shape === 'diamond') {
            ctx.beginPath();
            ctx.moveTo(0, -p.height * 0.6);
            ctx.lineTo(p.width * 0.55, 0);
            ctx.lineTo(0, p.height * 0.6);
            ctx.lineTo(-p.width * 0.55, 0);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
          }
          ctx.restore();
        }
      }

      particlesRef.current = nextList;
      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(secondBurstTimer);
      window.clearTimeout(thirdBurstTimer);
      window.removeEventListener('resize', resize);
    };
  }, [prefersReducedMotion, spawnConfettiBurst]);

  // Smooth auto-enter into feed after showing the welcome note on first-time registration
  useEffect(() => {
    if (!autoEnterFeed || isExiting) return;
    const totalMs = Math.max(2500, autoEnterSeconds * 1000);
    const startTime = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const pct = Math.min(100, (elapsed / totalMs) * 100);
      setAutoProgress(pct);
      setSecondsLeft(Math.max(1, Math.ceil((totalMs - elapsed) / 1000)));
      if (elapsed < totalMs) {
        rafId = requestAnimationFrame(tick);
      } else {
        finishFlow('feed');
      }
    };

    rafId = requestAnimationFrame(tick);
    const fallbackTimer = window.setTimeout(() => finishFlow('feed'), totalMs + 250);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(fallbackTimer);
    };
  }, [autoEnterFeed, autoEnterSeconds, isExiting, finishFlow]);

  // Keyboard Escape + lock body scroll while pop-up is open
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finishFlow('feed');
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [finishFlow]);

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="szmc-welcome-popup-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.1 : 0.25 }}
          onClick={() => finishFlow('feed')}
          className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-md overflow-hidden"
        >
          {/* Full-Viewport 60fps Confetti Canvas */}
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="fixed inset-0 pointer-events-none z-20"
          />

          {/* Pop-Up Celebration Card with Full-Card Rotating Glowing Border */}
          <motion.div
            initial={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.88, y: 36 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.94, y: 20 }
            }
            transition={{
              type: 'spring',
              stiffness: 340,
              damping: 26,
              mass: 0.85,
            }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full max-w-[434px]"
          >
            {/* 1. Full-Card Soft Multi-Color Ambient Glow Aura */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-3 rounded-[40px] blur-2xl opacity-65"
              style={{
                background:
                  'conic-gradient(from 0deg, #4285F4, #EA4335, #FBBC05, #34A853, #8AB4F8, #C58AF9, #4285F4)',
                animation: prefersReducedMotion
                  ? 'none'
                  : 'szmcPopupBorderSpin 7s linear infinite',
              }}
            />

            {/* 2. Full-Card Sharp Rotating Conic Border Ring */}
            <div
              className="relative p-[2.5px] rounded-[34px] overflow-hidden"
              style={{
                boxShadow:
                  '0 28px 80px -14px rgba(2, 6, 23, 0.9), 0 0 36px rgba(66, 133, 244, 0.32), 0 0 56px rgba(251, 188, 5, 0.2)',
              }}
            >
              {/* Rotating Conic Beam */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-[100%]"
                style={{
                  background:
                    'conic-gradient(from 0deg, #4285F4 0%, #EA4335 24%, #FBBC05 50%, #34A853 75%, #8AB4F8 90%, #4285F4 100%)',
                  animation: prefersReducedMotion
                    ? 'none'
                    : 'szmcPopupBorderSpin 5s linear infinite',
                }}
              />

              {/* 3. Inner Rounded Card Surface */}
              <div
                className="relative rounded-[31.5px] overflow-hidden text-center text-white pb-safe"
                style={{
                  background:
                    'radial-gradient(circle at 50% 0%, #152b59 0%, #0b1630 52%, #070e1f 100%)',
                }}
              >
                {/* Subtle Specular Top Edge Highlight */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/60 to-transparent"
                />

            {/* Mobile Sheet Grab Indicator */}
            <div className="sm:hidden pt-3 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Close Button (44x44px touch target) */}
            <button
              type="button"
              onClick={() => finishFlow('feed')}
              aria-label="Close welcome message"
              className="absolute top-3 right-3 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Card Content */}
            <div className="px-6 pt-8 pb-7 sm:px-8 sm:pt-9 sm:pb-8 flex flex-col items-center">
              {/* Signature Glowing Rotating SZMC Crest (Interactive: tap to pop extra confetti!) */}
              <motion.button
                type="button"
                onClick={() => spawnConfettiBurst('center')}
                title="Tap to celebrate"
                initial={prefersReducedMotion ? false : { scale: 0.72, rotate: -6 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 320,
                  damping: 20,
                  delay: 0.08,
                }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
                className="relative mb-6 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-[26px]"
              >
                {/* Soft Multi-Color Ambient Glow Aura */}
                <div
                  aria-hidden="true"
                  className="absolute -inset-2.5 rounded-[28px] blur-xl opacity-75 pointer-events-none"
                  style={{
                    background:
                      'conic-gradient(from 0deg, #4285F4, #EA4335, #FBBC05, #34A853, #8AB4F8, #4285F4)',
                    animation: prefersReducedMotion
                      ? 'none'
                      : 'szmcPopupBorderSpin 4.5s linear infinite',
                  }}
                />

                {/* Sharp Rotating Conic Ring */}
                <div className="relative p-[2.5px] rounded-[24px] overflow-hidden shadow-xl">
                  <div
                    aria-hidden="true"
                    className="absolute -inset-[100%] pointer-events-none"
                    style={{
                      background:
                        'conic-gradient(from 0deg, #4285F4 0%, #EA4335 25%, #FBBC05 50%, #34A853 75%, #4285F4 100%)',
                      animation: prefersReducedMotion
                        ? 'none'
                        : 'szmcPopupBorderSpin 3.2s linear infinite',
                    }}
                  />
                  <div className="relative w-20 h-20 sm:w-22 sm:h-22 rounded-[22px] bg-[#081226] p-3 flex items-center justify-center">
                    {!logoImgFailed ? (
                      <img
                        src="/szmc-logo.png"
                        alt="SZMC Official Crest"
                        referrerPolicy="no-referrer"
                        onError={() => setLogoImgFailed(true)}
                        className="w-full h-full object-contain drop-shadow-sm select-none"
                      />
                    ) : (
                      <span className="font-serif text-xl font-bold text-amber-300">SZMC</span>
                    )}
                  </div>
                </div>

                {/* Animated Verification Check Seal */}
                <motion.span
                  initial={prefersReducedMotion ? false : { scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: 'spring',
                    stiffness: 420,
                    damping: 18,
                    delay: 0.24,
                  }}
                  aria-hidden="true"
                  className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-emerald-500 text-slate-950 border-2 border-[#0b1630] flex items-center justify-center shadow-md"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                </motion.span>
              </motion.button>

              {/* Clean Unboxed Kicker */}
              <motion.p
                initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.12 }}
                className="text-[11px] font-semibold tracking-[0.22em] uppercase text-amber-300"
              >
                Welcome to SZMC Alumni
              </motion.p>

              {/* Celebratory Headline: Welcome, <Stylish Italic Name> */}
              <motion.h2
                id="szmc-welcome-popup-title"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.16 }}
                className="mt-2 text-2xl sm:text-3xl font-semibold text-white tracking-tight leading-snug text-balance"
              >
                <span className="font-serif font-bold text-white">Welcome, </span>
                <span className="font-serif italic font-semibold tracking-normal bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text text-transparent">
                  {displayName}
                </span>
              </motion.h2>

              {/* Heartfelt Description */}
              <motion.p
                initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.22 }}
                className="mt-3 text-sm sm:text-[15px] text-slate-300 leading-relaxed max-w-sm text-balance"
              >
                Your roots. Your people. Your community. Your family waiting for you.
              </motion.p>

              {/* Institutional Motto & Unboxed Member Meta */}
              <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.35, delay: 0.28 }}
                className="mt-5 pt-4 border-t border-white/10 w-full space-y-1.5"
              >
                <p className="font-serif italic text-sm text-amber-200/95">
                  &ldquo;{motto}&rdquo;
                </p>
                <p className="text-xs text-slate-400">
                  <span>{batchText}</span>
                  <span aria-hidden="true" className="mx-2 text-slate-600">
                    ·
                  </span>
                  <span>{locationText}</span>
                </p>
              </motion.div>

              {/* Auto-Enter Glowing Progress Bar (Matches SZMC Signature Bar) */}
              {autoEnterFeed && (
                <div className="mt-5 w-full space-y-1.5">
                  <div className="h-1.5 w-full bg-[#060d1c] rounded-full overflow-hidden border border-blue-900/50">
                    <div
                      className="h-full rounded-full transition-transform duration-100 ease-linear origin-left"
                      style={{
                        transform: `scaleX(${autoProgress / 100})`,
                        background:
                          'linear-gradient(90deg, #1d4ed8 0%, #3b82f6 30%, #f59e0b 70%, #fbbf24 100%)',
                        boxShadow: '0 0 10px rgba(251, 191, 36, 0.7)',
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 tabular-nums">
                    Entering your alumni feed in {secondsLeft}s…
                  </p>
                </div>
              )}

              {/* Mobile Thumb-Friendly Primary CTA */}
              <div className="mt-6 w-full space-y-2.5">
                <button
                  type="button"
                  onClick={() => finishFlow('feed')}
                  className="w-full min-h-[50px] px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:brightness-105 active:scale-[0.98] text-slate-950 font-bold text-sm sm:text-base transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1630]"
                >
                  <span>Enter Alumni Feed</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </button>

                {profile?.id ? (
                  <button
                    type="button"
                    onClick={() => finishFlow('profile')}
                    className="w-full min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    Complete My Profile First
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => spawnConfettiBurst('cannons')}
                    className="w-full min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-300 hover:text-amber-200 hover:bg-white/[0.06] transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    Pop Confetti Again
                  </button>
                )}
              </div>
            </div>

              </div>
            </div>

            <style>{`
              @keyframes szmcPopupBorderSpin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
