import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ShieldCheck,
  Building2,
  MapPin,
  GraduationCap,
  Award,
  ArrowRight,
  Users,
  Sparkles,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Star,
  ExternalLink
} from 'lucide-react';
import { AlumniProfile } from '../../types';
import {
  MagneticWrap,
  ScrollReveal,
  Tilt3DCard,
} from '../motion/CinematicMotion';
import campusHeroImg from '../../assets/images/ndc_campus_hero_1790233370828.jpg';

interface FeaturedAlumniSectionProps {
  alumniList: AlumniProfile[];
  onSelectAlumnus: (alumnus: AlumniProfile) => void;
  onExploreDirectory: () => void;
}

type EliteCategory = 'all' | 'surgery' | 'medicine' | 'pediatrics' | 'academia' | 'global';

// Prominent Shaheed Ziaur Rahman Medical College (SZMC Bogura) Alumni Doctors
export const FAMOUS_SZMC_ALUMNI: AlumniProfile[] = [];

export const FeaturedAlumniSection: React.FC<FeaturedAlumniSectionProps> = ({
  alumniList,
  onSelectAlumnus,
  onExploreDirectory,
}) => {
  const [activeCategory, setActiveCategory] = useState<EliteCategory>('all');
  const [isAutoScrolling, setIsAutoScrolling] = useState<boolean>(true);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  // Combine prominent SZMC doctors with any registered profiles
  const allProminentAlumni = useMemo(() => {
    const combined = [...FAMOUS_SZMC_ALUMNI];
    if (alumniList && alumniList.length > 0) {
      alumniList.forEach((userAlumnus, idx) => {
        const sameName = combined.some(
          (p) => p.fullName.toLowerCase() === userAlumnus.fullName.toLowerCase()
        );
        if (!sameName) {
          const hasSameId = combined.some((p) => p.id === userAlumnus.id);
          combined.push(
            hasSameId
              ? { ...userAlumnus, id: 700000 + userAlumnus.id + idx }
              : userAlumnus
          );
        }
      });
    }
    return combined;
  }, [alumniList]);

  // Filter based on active career category
  const filteredAlumni = useMemo(() => {
    switch (activeCategory) {
      case 'surgery':
        return allProminentAlumni.filter(
          (a) =>
            a.profession?.toLowerCase().includes('surgeon') ||
            a.profession?.toLowerCase().includes('surgery') ||
            a.profession?.toLowerCase().includes('ortho') ||
            a.position?.toLowerCase().includes('surgery') ||
            a.position?.toLowerCase().includes('ortho') ||
            a.group?.toLowerCase().includes('surgery') ||
            a.specialty?.some((s) => s.toLowerCase().includes('surg') || s.toLowerCase().includes('ortho') || s.toLowerCase().includes('trauma'))
        );
      case 'medicine':
        return allProminentAlumni.filter(
          (a) =>
            a.profession?.toLowerCase().includes('cardio') ||
            a.profession?.toLowerCase().includes('medicine') ||
            a.profession?.toLowerCase().includes('neuro') ||
            a.position?.toLowerCase().includes('cardio') ||
            a.position?.toLowerCase().includes('medicine') ||
            a.specialty?.some((s) => s.toLowerCase().includes('cardio') || s.toLowerCase().includes('heart') || s.toLowerCase().includes('stroke') || s.toLowerCase().includes('medicine'))
        );
      case 'pediatrics':
        return allProminentAlumni.filter(
          (a) =>
            a.profession?.toLowerCase().includes('pediatric') ||
            a.profession?.toLowerCase().includes('gynae') ||
            a.profession?.toLowerCase().includes('obstetric') ||
            a.group?.toLowerCase().includes('pediatric') ||
            a.group?.toLowerCase().includes('gynaecology') ||
            a.specialty?.some((s) => s.toLowerCase().includes('pediatric') || s.toLowerCase().includes('maternal') || s.toLowerCase().includes('fetal'))
        );
      case 'academia':
        return allProminentAlumni.filter(
          (a) =>
            a.profession?.toLowerCase().includes('professor') ||
            a.position?.toLowerCase().includes('professor') ||
            a.position?.toLowerCase().includes('dean') ||
            a.position?.toLowerCase().includes('head') ||
            a.badges?.some((b) => b.toLowerCase().includes('faculty'))
        );
      case 'global':
        return allProminentAlumni.filter(
          (a) =>
            a.country && a.country.toLowerCase() !== 'bangladesh'
        );
      case 'all':
      default:
        return allProminentAlumni;
    }
  }, [activeCategory, allProminentAlumni]);

  // Smooth continuous auto-scrolling effect
  useEffect(() => {
    const container = carouselRef.current;
    if (!container) return;

    let animationFrameId: number;
    const speed = 0.8; // px per tick

    const step = () => {
      if (isAutoScrolling && !isHovered && container) {
        // If reached end, smoothly loop back to start
        if (container.scrollLeft >= container.scrollWidth - container.clientWidth - 1) {
          container.scrollLeft = 0;
        } else {
          container.scrollLeft += speed;
        }
      }
      animationFrameId = requestAnimationFrame(step);
    };

    animationFrameId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isAutoScrolling, isHovered, filteredAlumni]);

  const handleManualScroll = (direction: 'left' | 'right') => {
    const container = carouselRef.current;
    if (!container) return;
    const scrollAmount = 360; // Card width approx
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <section className="py-5 sm:py-8 lg:py-12 max-w-7xl mx-auto px-4 sm:px-6">
      {/* Section Header */}
      <ScrollReveal>
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-3.5 sm:mb-6 gap-3 sm:gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1.5">
              <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-600 dark:text-blue-400" />
              <span>DISTINGUISHED DOCTORS • SZMC LEADERS</span>
            </div>
            <h2 className="text-xl sm:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
              Meet the proud members of the SZMC family.
            </h2>
          </div>

          {/* Filter Pills with mobile horizontal scroll */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto max-w-full no-scrollbar pb-1.5 sm:pb-1.5 md:flex-wrap self-start md:self-auto -mx-4 px-4 sm:mx-0 sm:px-1.5">
            {[
              { id: 'all', label: 'All Doctors' },
              { id: 'surgery', label: 'Surgery & Orthopedics' },
              { id: 'medicine', label: 'Medicine & Cardiology' },
              { id: 'pediatrics', label: 'Pediatrics & Gynae' },
              { id: 'academia', label: 'Professors & Faculty' },
              { id: 'global', label: 'Global Diaspora (UK/USA)' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategory(tab.id as EliteCategory)}
                className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  activeCategory === tab.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </ScrollReveal>

      {/* Interactive Auto-Scroll Controls & Status Bar */}
      <div className="flex items-center justify-between mb-3 sm:mb-4 px-1 text-xs">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setIsAutoScrolling(!isAutoScrolling)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer ${
              isAutoScrolling
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
            title={isAutoScrolling ? 'Click to pause auto-scrolling' : 'Click to resume auto-scrolling'}
          >
            {isAutoScrolling ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isAutoScrolling ? 'Auto-Scrolling Active' : 'Auto-Scroll Paused'}</span>
          </button>
          <span className="text-slate-400 text-[11px]">
            {filteredAlumni.length} Leaders
          </span>
        </div>

        {/* Manual Left / Right Navigation Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleManualScroll('left')}
            className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer shadow-xs"
            aria-label="Scroll left"
            title="Scroll Left"
          >
            <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleManualScroll('right')}
            className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer shadow-xs"
            aria-label="Scroll right"
            title="Scroll Right"
          >
            <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>

      {/* Auto-scrolling Interactive Carousel Container */}
      <div
        ref={carouselRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="flex gap-3 sm:gap-5 overflow-x-auto pb-3 sm:pb-4 pt-1 sm:pt-2 no-scrollbar scroll-smooth cursor-grab active:cursor-grabbing select-none"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {filteredAlumni.map((alumnus, idx) => (
          <Tilt3DCard
            key={`${alumnus.id}-${idx}`}
            onClick={() => onSelectAlumnus(alumnus)}
            className="w-[82vw] min-[360px]:w-[280px] sm:w-[320px] lg:w-[350px] max-w-[340px] shrink-0 group glass-card rounded-2xl sm:rounded-3xl p-4 sm:p-5 cursor-pointer flex flex-col justify-between"
          >
            <div>
              {/* Profile Picture Header & Badges */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="relative">
                  <img
                    src={alumnus.avatarUrl}
                    alt={alumnus.fullName}
                    className="avatar-interactive w-18 h-18 rounded-2xl object-cover border-2 border-slate-100 dark:border-slate-800 shadow-md bg-slate-100 dark:bg-slate-800"
                  />
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
                </div>

                <div className="flex flex-col items-end gap-1.5">
                  <span className="px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 text-[11px] font-black tracking-tight">
                    Batch {alumnus.batchYear < 10 ? `0${alumnus.batchYear}` : alumnus.batchYear}
                  </span>
                  {alumnus.country && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold">
                      {alumnus.country}
                    </span>
                  )}
                </div>
              </div>

              {/* Identity & Career Position */}
              <div className="space-y-1.5 mb-3">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-base font-black text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                    {alumnus.fullName}
                  </h3>
                  <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                </div>

                {/* Top Carrier Position Badge */}
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 text-xs font-bold leading-tight">
                  <Briefcase className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="line-clamp-1">{alumnus.position}</span>
                </div>

                {/* Institution & Location */}
                <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5 line-clamp-1 font-medium mt-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{alumnus.institution}</span>
                </p>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{[alumnus.city, alumnus.country].filter(Boolean).join(', ')}</span>
                </p>
              </div>

              {/* Career Highlights / Specialties */}
              <div className="flex flex-wrap gap-1 mb-4">
                {alumnus.badges?.slice(0, 2).map((b) => (
                  <span
                    key={b}
                    className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[10px] font-bold border border-blue-200/60 dark:border-blue-900/40"
                  >
                    {b}
                  </span>
                ))}
                {alumnus.specialty?.slice(0, 1).map((s) => (
                  <span
                    key={s}
                    className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-medium truncate max-w-[200px]"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Quick Profile View Action */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300">
              <span className="flex items-center gap-1">
                <span>View Full Career Bio</span>
              </span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Tilt3DCard>
        ))}
      </div>

      {/* Directory CTA */}
      <div className="text-center mt-10">
        <MagneticWrap>
          <button
            type="button"
            onClick={onExploreDirectory}
            className="btn-interactive inline-flex items-center gap-2 px-6 py-3 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm font-bold rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-all cursor-pointer"
          >
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Search All 35,000+ Alumni in Directory</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </MagneticWrap>
      </div>
    </section>
  );
};

