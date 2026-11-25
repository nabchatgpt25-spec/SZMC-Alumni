import React, { useRef, useState } from 'react';
import { ArrowRight, LogIn, Sparkles } from 'lucide-react';

interface LiquidGlassLoginBarProps {
  onLogin: () => void;
  variant?: 'floating' | 'inline';
  className?: string;
}

export const LiquidGlassLoginBar: React.FC<LiquidGlassLoginBarProps> = ({
  onLogin,
  variant = 'floating',
  className = '',
}) => {
  const barRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [tilt, setTilt] = useState<{ rx: number; ry: number }>({ rx: 0, ry: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const isFloating = variant === 'floating';

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });

    if (isFloating) {
      const normX = (x / rect.width - 0.5) * 2; // -1 to 1
      const normY = (y / rect.height - 0.5) * 2; // -1 to 1
      setTilt({
        rx: Number((-normY * 9).toFixed(2)),
        ry: Number((normX * 11).toFixed(2)),
      });
    }
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    setTilt({ rx: 0, ry: 0 });
    setIsHovered(false);
  };

  return (
    <div
      ref={barRef}
      role="button"
      tabIndex={0}
      onClick={onLogin}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onLogin();
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      aria-label="Member quick login: Already a member? Login to SZMC Alumni Network"
      style={
        isFloating
          ? {
              transform: isHovered
                ? `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateY(-3px) scale(1.015)`
                : 'perspective(900px) rotateX(4deg) rotateY(0deg) translateY(0px)',
            }
          : undefined
      }
      className={`group relative overflow-hidden select-none cursor-pointer rounded-full transition-all duration-200 ease-out active:translate-y-0.5 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        isFloating
          ? 'liquid-glass-dock-3d w-full max-w-sm sm:max-w-md p-2 pl-4 pr-2.5'
          : 'liquid-glass-dock border p-2 pl-4 pr-2.5 max-w-lg'
      } ${className}`}
    >
      {/* 1. Dynamic Liquid Specular Light Sheen (Follows Cursor) */}
      {mousePos && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-px rounded-full opacity-100 transition-opacity duration-200"
          style={{
            background: isFloating
              ? `radial-gradient(170px circle at ${mousePos.x}px ${mousePos.y}px, rgba(255, 255, 255, 0.26), rgba(125, 211, 252, 0.12) 45%, transparent 75%)`
              : `radial-gradient(180px circle at ${mousePos.x}px ${mousePos.y}px, rgba(56, 189, 248, 0.45), rgba(99, 102, 241, 0.25) 40%, transparent 80%)`,
          }}
        />
      )}

      {/* 2. Subtle Bottom Caustic Glass Refraction Edge */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-5 bottom-0 h-[1.5px] rounded-full bg-gradient-to-r from-transparent via-sky-300/70 dark:via-sky-300/45 to-transparent"
      />

      {/* 3. Refractive Top Glass Bevel Rim Light */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-4 top-0 h-[1.5px] rounded-full bg-gradient-to-r from-transparent via-white/95 dark:via-white/60 to-transparent"
      />

      {/* 4. Interactive Bar Content (lifted in Z-depth for true 3D glass layering) */}
      <div
        className="relative z-10 flex items-center justify-between gap-3"
        style={isFloating ? { transform: 'translateZ(18px)' } : undefined}
      >
        {/* Left: Sculpted Glass Status Sphere & Prompt */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div
            className={`relative flex items-center justify-center w-7 h-7 rounded-full shrink-0 border border-white/75 dark:border-white/30 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.85),0_3px_8px_rgba(15,23,42,0.14)] ${
              isFloating ? 'bg-transparent' : 'bg-white/40 dark:bg-white/10 backdrop-blur-md'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9),inset_0_1px_1px_rgba(255,255,255,0.85)]" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs sm:text-sm font-extrabold tracking-tight text-slate-900 dark:text-white drop-shadow-[0_1px_1px_rgba(255,255,255,0.65)] dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] truncate">
                Already a member?
              </span>
              <Sparkles className="w-3.5 h-3.5 text-sky-600 dark:text-sky-300 opacity-85 group-hover:opacity-100 group-hover:rotate-12 transition-all duration-300 shrink-0" />
            </div>
          </div>
        </div>

        {/* Right: 3D Translucent Crystal Glass Action Capsule */}
        <div
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-xs font-black transition-all duration-200 shrink-0 ${
            isFloating
              ? 'bg-gradient-to-b from-blue-500/85 via-blue-600/80 to-indigo-600/85 backdrop-blur-md border border-white/55 shadow-[0_3px_0_rgba(29,78,216,0.55),0_10px_22px_-4px_rgba(37,99,235,0.48),inset_0_1.5px_1.5px_rgba(255,255,255,0.75)] group-hover:brightness-110 group-hover:scale-[1.03]'
              : 'bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-md shadow-blue-500/30 group-hover:shadow-blue-500/50 group-hover:scale-[1.03] border border-white/20'
          }`}
        >
          <LogIn className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>Login</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform duration-200" />
        </div>
      </div>
    </div>
  );
};
