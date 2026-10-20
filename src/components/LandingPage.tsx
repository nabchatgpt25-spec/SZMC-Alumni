import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  BookOpen,
  MapPin,
  Globe,
  GraduationCap,
  Users,
  ShieldCheck,
  ArrowRight,
  HeartHandshake,
  Calendar,
  Camera,
  Phone,
  Mail,
  Building2,
  FileText,
  Award,
  CreditCard,
  ChevronRight,
  MessageSquare
} from 'lucide-react';
import { NDCLogo } from './NDCLogo';
import { BATCH_LIST, ALUMNI_PROFILES, loadStoredAlumniProfiles } from '../data/mockData';
import { AlumniProfile, BatchSummary } from '../types';

import { HeroSection } from './landing/HeroSection';
import { BatchLoungesGrid } from './landing/BatchLoungesGrid';
import { FeaturedAlumniSection, FAMOUS_SZMC_ALUMNI } from './landing/FeaturedAlumniSection';
import { GalleryPreviewSection } from './landing/GalleryPreviewSection';
import { FAQSection } from './landing/FAQSection';
import { QuickProfileModal } from './landing/QuickProfileModal';
import { BatchMembersModal } from './landing/BatchMembersModal';
import { VerificationExplainerModal } from './landing/VerificationExplainerModal';
import { BloodNeededNowSection } from './landing/BloodNeededNowSection';
import { CursorSpotlight, MagneticWrap } from './motion/CinematicMotion';

interface LandingPageProps {
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  onNavigate: (route: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenLogin,
  onOpenRegister,
  onNavigate,
}) => {
  // Modal states for interactive preview
  const [previewAlumnus, setPreviewAlumnus] = useState<AlumniProfile | null>(null);
  const [previewBatch, setPreviewBatch] = useState<BatchSummary | null>(null);
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);

  // Smooth scroll helper
  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSelectBatch = (batch: BatchSummary) => {
    setPreviewBatch(batch);
  };

  // Get batch members from stored profiles and famous alumni for the selected batch
  const batchMembers = useMemo(() => {
    if (!previewBatch) return [];
    const stored = loadStoredAlumniProfiles();
    const combined = [...stored, ...FAMOUS_SZMC_ALUMNI, ...ALUMNI_PROFILES];
    const map = new Map<number, AlumniProfile>();
    combined.forEach((a) => {
      if (
        a &&
        (a.batchYear === previewBatch.batchYear ||
          a.batchYear - 1991 === previewBatch.batchYear)
      ) {
        if (!map.has(a.id)) map.set(a.id, a);
      }
    });
    return Array.from(map.values());
  }, [previewBatch]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-blue-600 selection:text-white transition-colors duration-200 relative w-full max-w-full overflow-x-hidden">
      {/* Global Cursor-Following Institutional Spotlight */}
      <CursorSpotlight />


      {/* Main Institutional Brand Header */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between gap-3 sm:gap-6">
          {/* Brand Logo & Bilingual Title */}
          <div
            className="flex items-center gap-2.5 sm:gap-3.5 cursor-pointer group min-w-0"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white dark:bg-slate-800 p-1 border border-slate-200/90 dark:border-slate-700/90 flex items-center justify-center shadow-md shadow-blue-900/5 group-hover:scale-105 transition-transform overflow-hidden shrink-0">
              <NDCLogo className="w-full h-full" />
            </div>
            <div className="min-w-0">
              <div className="font-extrabold text-xs sm:text-[15px] tracking-tight text-slate-900 dark:text-white leading-tight font-serif">
                শহীদ জিয়াউর রহমান মেডিকেল কলেজ অ্যালামনাই
              </div>
              <div className="text-[10px] sm:text-[11px] font-black tracking-wider text-blue-900 dark:text-blue-300 uppercase leading-snug">
                SZMC ALUMNI ASSOCIATION • ESTD. 1992
              </div>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-4 xl:gap-6 text-[13px] font-semibold text-slate-700 dark:text-slate-200">
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="hover:text-red-600 dark:hover:text-red-400 cursor-pointer transition-colors"
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('batches-section')}
              className="hover:text-red-600 dark:hover:text-red-400 cursor-pointer transition-colors"
            >
              Batches (01–35)
            </button>
            <button
              type="button"
              onClick={() => onNavigate('directory')}
              className="hover:text-red-600 dark:hover:text-red-400 cursor-pointer transition-colors"
            >
              Directory
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('feed-preview-section')}
              className="hover:text-red-600 dark:hover:text-red-400 cursor-pointer transition-colors"
            >
              Doctors&apos; Quad
            </button>
            <button
              type="button"
              onClick={() => onNavigate('gallery')}
              className="hover:text-red-600 dark:hover:text-red-400 cursor-pointer transition-colors"
            >
              Campus Gallery
            </button>
            <button
              type="button"
              onClick={() => onNavigate('emergency')}
              className="hover:text-red-600 dark:hover:text-red-400 cursor-pointer transition-colors flex items-center gap-1 text-red-600 dark:text-red-400 font-bold"
            >
              <span>Blood Lifeline</span>
            </button>
          </nav>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setIsVerificationModalOpen(true)}
              className="btn-interactive hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
              title="How We Verify Real Students"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Verification</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Social Network Home Content */}
      <main>
        {/* 3. Hero Section: The Digital Quad (Signature Alumni Social Network Style) */}
        <HeroSection
          alumniList={ALUMNI_PROFILES}
          onOpenLogin={onOpenLogin}
          onOpenRegister={onOpenRegister}
          onSelectAlumnus={(alumnus) => setPreviewAlumnus(alumnus)}
          onScrollToBatches={() => scrollToSection('batches-section')}
          onOpenVerificationModal={() => setIsVerificationModalOpen(true)}
        />

        {/* 4. Compact Emergency Blood Network Section: "Blood Needed Now" */}
        <BloodNeededNowSection
          variant="landing"
          onNavigateToBloodNetwork={() => onNavigate('emergency')}
        />

        {/* 5. Batch Lounges Grid (01 to 76) with Era Filters */}
        <BatchLoungesGrid
          batches={BATCH_LIST}
          onSelectBatch={handleSelectBatch}
          onOpenRegister={onOpenRegister}
        />

        {/* 6. Spotlight on Distinguished Mentors & Leaders */}
        <div id="featured-alumni-section">
          <FeaturedAlumniSection
            alumniList={ALUMNI_PROFILES}
            onSelectAlumnus={(alumnus) => setPreviewAlumnus(alumnus)}
            onExploreDirectory={() => onNavigate('directory')}
          />
        </div>

        {/* 7. Campus Nostalgia & Heritage Photo Gallery */}
        <GalleryPreviewSection onExploreGallery={() => onNavigate('gallery')} />

        {/* 8. FAQs tailored for the social network & verification */}
        <FAQSection onOpenRegister={onOpenRegister} />
      </main>

      {/* 11. Clean Institutional Footer */}
      <footer className="border-t border-slate-200/80 dark:border-slate-800 bg-[#fbfbfd] dark:bg-[#0c1017] text-slate-500 dark:text-slate-400 text-xs py-6 sm:py-8 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* Top Section */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5">
            {/* Left: Brand Identity */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 p-0.5 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                <NDCLogo className="w-full h-full" />
              </div>
              <div>
                <div className="font-bold text-sm tracking-tight text-slate-900 dark:text-white">
                  SZMC ALUMNI NETWORK
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-400">
                  Connect • Reunite • Heal Together • Silimpur, Bogura
                </div>
              </div>
            </div>

            {/* Social & Contact Links */}
            <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-5 gap-y-1.5 text-xs font-medium">
              <a
                href="https://www.facebook.com/nurulanambashir"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
              >
                Facebook
              </a>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <a
                href="https://wa.me/8801764436846"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
              >
                WhatsApp
              </a>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <button
                type="button"
                onClick={() => onNavigate('contact')}
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
              >
                Contact
              </button>
            </div>
          </div>

          {/* Divider & Bottom Section */}
          <div className="border-t border-slate-200/80 dark:border-slate-800/80 pt-4">
            {/* Motto Spotlight */}
            <div className="text-center pb-3">
              <span className="font-serif italic font-bold text-xs sm:text-sm text-blue-600 dark:text-blue-400 tracking-wide">
                &ldquo;Once a SZMCian, Always a SZMCian&rdquo;
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 text-[11px] text-slate-400 dark:text-slate-400 text-center sm:text-left pt-2 border-t border-slate-100 dark:border-slate-800/50">
              <div>
                © {new Date().getFullYear()} SZMC Alumni Network. All rights reserved.
              </div>
              <div className="flex flex-wrap items-center justify-center sm:justify-end gap-x-2 sm:gap-x-3 gap-y-1">
                <a
                  href="http://nurulanambashir.gt.tc/?i=1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-blue-600 dark:text-blue-400 hover:underline transition-colors cursor-pointer"
                >
                  Design and Developed by Bashir-34
                </a>
                <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">•</span>
                <span className="hidden sm:inline font-medium text-slate-400 dark:text-slate-400">
                  Silimpur, Bogura-5800, Bangladesh • Estd. 1992
                </span>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Interactive Modals */}
      <VerificationExplainerModal
        isOpen={isVerificationModalOpen}
        onClose={() => setIsVerificationModalOpen(false)}
        onOpenRegister={onOpenRegister}
      />

      <QuickProfileModal
        profile={previewAlumnus}
        onClose={() => setPreviewAlumnus(null)}
        onLoginPrompt={onOpenLogin}
      />

      <BatchMembersModal
        batch={previewBatch}
        members={batchMembers}
        onClose={() => setPreviewBatch(null)}
        onSelectMember={(alumnus) => {
          setPreviewAlumnus(alumnus);
        }}
        onRegisterPrompt={onOpenRegister}
      />
    </div>
  );
};
