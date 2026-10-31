/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSiteConfig } from '../services/siteConfigService';

interface OutstandingLoadingScreenProps {
  onComplete?: () => void;
  minDuration?: number;
  message?: string;
  subtitle?: string;
}

export const OutstandingLoadingScreen: React.FC<OutstandingLoadingScreenProps> = ({
  onComplete,
  minDuration = 2000,
  message,
  subtitle: customSubtitle,
}) => {
  const { config } = useSiteConfig();
  const [progress, setProgress] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Smooth progress animation from 0% to 100%
  useEffect(() => {
    const startTime = performance.now();
    let animationFrameId: number;
    let fallbackTimeoutId: any;
    let fadeTimeoutId: any;
    let completeTimeoutId: any;

    const finish = () => {
      setProgress(100);
      setIsFadingOut(true);
      completeTimeoutId = setTimeout(() => {
        onCompleteRef.current?.();
      }, 300);
    };

    const update = (now: number) => {
      const elapsed = now - startTime;
      const pct = Math.min(100, Math.round((elapsed / minDuration) * 100));
      setProgress(pct);

      if (elapsed < minDuration) {
        animationFrameId = requestAnimationFrame(update);
      } else {
        setProgress(100);
        fadeTimeoutId = setTimeout(finish, 150);
      }
    };

    animationFrameId = requestAnimationFrame(update);
    // Hard fallback timeout ensures loading screen ALWAYS finishes even if tab/iframe throttles rAF
    fallbackTimeoutId = setTimeout(finish, minDuration + 400);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearTimeout(fallbackTimeoutId);
      clearTimeout(fadeTimeoutId);
      clearTimeout(completeTimeoutId);
    };
  }, [minDuration]);

  const handleSkip = () => {
    setIsFadingOut(true);
    setTimeout(() => {
      onCompleteRef.current?.();
    }, 150);
  };

  const motto = config.collegeMotto || 'Once a SZMCian, Always a SZMCian';
  const subtitle = customSubtitle || 'SHAHEED ZIAUR RAHMAN MEDICAL COLLEGE, BOGURA';
  const statusMessage = message || 'Connecting 35 Batches...';
  const logoSrc = '/szmc-logo.png';

  return (
    <AnimatePresence>
      {!isFadingOut && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.015 }}
          transition={{ duration: 0.45, ease: 'easeInOut' }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none overflow-hidden cursor-pointer"
          style={{
            background: 'radial-gradient(circle at 50% 48%, #0f1e42 0%, #0a142c 45%, #050b18 85%, #03060f 100%)',
          }}
          onClick={handleSkip}
          title="Click anywhere to enter"
        >
          {/* Subtle Institutional Ambient Glow in Background */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[130px] pointer-events-none" />

          {/* Central Showcase Container */}
          <div className="relative z-10 flex flex-col items-center text-center px-4 max-w-xl mx-auto">
            {/* Logo Container with Google-style Rotating Glowing Border */}
            <motion.div
              initial={{ scale: 0.84, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="relative mb-7 sm:mb-8"
            >
              {/* 1. GOOGLE MULTI-COLOR AMBIENT GLOW AURA (Deep blur layer) */}
              <div
                className="absolute -inset-2.5 rounded-[34px] sm:rounded-[38px] blur-xl opacity-80 pointer-events-none"
                style={{
                  background: 'conic-gradient(from 0deg, #4285F4, #EA4335, #FBBC05, #34A853, #8AB4F8, #C58AF9, #4285F4)',
                  animation: 'googleBorderSpin 4s linear infinite',
                }}
              />

              {/* 2. GOOGLE SHARP ROTATING GLOWING BORDER (Conic Gradient Ring) */}
              <div
                className="relative p-[2.5px] rounded-[30px] sm:rounded-[34px] overflow-hidden shadow-[0_15px_40px_rgba(0,0,0,0.7)]"
                style={{
                  boxShadow: '0 0 25px rgba(66, 133, 244, 0.35), 0 0 45px rgba(234, 67, 53, 0.2)',
                }}
              >
                {/* The Rotating Conic Beam */}
                <div
                  className="absolute -inset-[100%] pointer-events-none"
                  style={{
                    background:
                      'conic-gradient(from 0deg, #4285F4 0%, #EA4335 25%, #FBBC05 50%, #34A853 75%, #4285F4 100%)',
                    animation: 'googleBorderSpin 3s linear infinite',
                  }}
                />

                {/* 3. THE SQUIRCLE INNER TILE (Matches the dark midnight tile in user image) */}
                <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-[28px] sm:rounded-[32px] bg-[#091326] p-4 sm:p-5 flex items-center justify-center overflow-hidden">
                  {/* Subtle inner glass reflection */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.06] via-transparent to-transparent pointer-events-none" />

                  {/* Authentic SZMC Logo */}
                  <img
                    src={logoSrc}
                    alt="SZMC Official Crest"
                    className="w-full h-full object-contain filter drop-shadow-md select-none"
                    loading="eager"
                  />
                </div>
              </div>
            </motion.div>

            {/* Main Institutional Motto: “Once a SZMCian, Always a SZMCian” */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.15 }}
              className="space-y-2.5"
            >
              <h1 className="font-serif text-2xl sm:text-3xl md:text-[34px] text-white font-bold tracking-tight leading-snug drop-shadow-md px-2">
                “{motto}”
              </h1>

              {/* Subtitle (Matching the image style: uppercase tracked) */}
              <p className="text-[11px] sm:text-xs font-semibold tracking-[0.25em] text-blue-200/80 uppercase font-sans">
                {subtitle}
              </p>
            </motion.div>

            {/* Loading Bar (Matching the exact look from the image: thin bar with amber glowing line) */}
            <motion.div
              initial={{ opacity: 0, scaleX: 0.8 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.45, delay: 0.25 }}
              className="mt-6 sm:mt-7 w-52 sm:w-64"
            >
              {/* Dark base track */}
              <div className="h-1 sm:h-1.5 w-full bg-[#081226] rounded-full overflow-hidden border border-blue-900/40 relative shadow-inner">
                {/* Glowing Progress Fill with Golden Amber/Yellow Accent matching image */}
                <div
                  className="h-full rounded-full relative transition-all duration-100 ease-linear"
                  style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, #1d4ed8 0%, #3b82f6 25%, #f59e0b 60%, #fbbf24 85%, #f59e0b 100%)',
                    boxShadow: '0 0 12px rgba(251, 191, 36, 0.75), 0 0 4px rgba(59, 130, 246, 0.9)',
                  }}
                />
              </div>
            </motion.div>
          </div>

          {/* Inline CSS animation for Google-style rotating border */}
          <style>{`
            @keyframes googleBorderSpin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
