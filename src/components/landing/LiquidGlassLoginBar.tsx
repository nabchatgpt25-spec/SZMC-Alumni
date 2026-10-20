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
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    setIsHovered(false);
  };

  const isFloating = variant === 'floating';

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
      className={`group relative overflow-hidden select-none cursor-pointer rounded-full liquid-glass-dock border transition-all duration-300 ease-out active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        isFloating
          ? 'w-full max-w-sm sm:max-w-md p-1.5 pl-3.5 pr-2'
          : 'p-2 pl-4 pr-2.5 max-w-lg'
      } ${className}`}
    >
      {/* 1. Dynamic Liquid Specular Light Sheen (Follows Cursor) */}
      {mousePos && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-px rounded-full opacity-100 transition-opacity duration-300"
          style={{
            background: `radial-gradient(180px circle at ${mousePos.x}px ${mousePos.y}px, rgba(56, 189, 248, 0.45), rgba(99, 102, 241, 0.25) 40%, transparent 80%)`,
          }}
        />
      )}

      {/* 2. Fluid Wave Shimmer Backdrop Animation */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full opacity-60 dark:opacity-40 bg-gradient-to-r from-blue-400/10 via-cyan-300/20 to-indigo-400/10 bg-[length:200%_200%] animate-liquid-sheen"
      />

      {/* 3. Refractive Top Glass Bevel Rim Light */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-4 top-0 h-[1.5px] rounded-full bg-gradient-to-r from-transparent via-white/80 dark:via-blue-300/50 to-transparent opacity-80"
      />

      {/* 4. Interactive Bar Content */}
      <div className="relative z-10 flex items-center justify-between gap-3">
        {/* Left: Glowing Status & Prompt */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Animated Liquid Droplet Ring */}
          <div className="relative flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/15 dark:bg-blue-400/20 shrink-0 border border-blue-400/40">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
            <span className="absolute inset-0 rounded-full border border-blue-400/30 animate-ping opacity-30" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs sm:text-sm font-extrabold tracking-tight text-slate-800 dark:text-white truncate">
                Already a member?
              </span>
              <Sparkles className="w-3 h-3 text-amber-500 dark:text-amber-300 opacity-70 group-hover:opacity-100 group-hover:rotate-12 transition-all duration-300 shrink-0" />
            </div>
          </div>
        </div>

        {/* Right: Liquid Glass Action Capsule */}
        <div className="flex items-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-black shadow-md shadow-blue-500/30 group-hover:shadow-blue-500/50 group-hover:scale-[1.03] transition-all duration-200 shrink-0 border border-white/20">
          <LogIn className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>Login</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform duration-200" />
        </div>
      </div>
    </div>
  );
};
