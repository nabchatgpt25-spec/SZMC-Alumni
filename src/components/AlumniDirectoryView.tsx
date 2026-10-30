import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Users,
  ShieldCheck,
  MapPin,
  Briefcase,
  Eye,
  Search,
  Filter,
  X,
  SlidersHorizontal,
  WifiOff,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  Stethoscope,
  MessageCircle,
  Check
} from 'lucide-react';

export const MEDICAL_SUBJECT_TAGS = [
  { label: 'Cardiology', icon: '❤️', desc: 'Heart & Vascular' },
  { label: 'Surgery', icon: '🩺', desc: 'General & Laparoscopic' },
  { label: 'Medicine', icon: '💊', desc: 'Internal Medicine' },
  { label: 'Pediatrics', icon: '👶', desc: 'Child Healthcare' },
  { label: 'Gynecology', icon: '🌸', desc: 'Obs & Gynecology' },
  { label: 'Orthopedics', icon: '🦴', desc: 'Bone & Joints' },
  { label: 'Nephrology', icon: '🫘', desc: 'Kidney & Urology' },
  { label: 'Neurology', icon: '🧠', desc: 'Neuro Medicine' },
  { label: 'Ophthalmology', icon: '👁️', desc: 'Eye Specialist' },
  { label: 'Dermatology', icon: '✨', desc: 'Skin & VD' },
  { label: 'ENT', icon: '👂', desc: 'Ear, Nose & Throat' },
  { label: 'Anesthesia', icon: '💉', desc: 'ICU & Critical Care' },
  { label: 'Radiology', icon: '🩻', desc: 'Ultrasonography & CT' },
  { label: 'FCPS', icon: '🎓', desc: 'Post-Graduate Fellow' },
  { label: 'SZMCH', icon: '🏥', desc: 'SZMC Hospital' },
  { label: 'BCS Health', icon: '🏛️', desc: 'Health Cadre' },
];
import { BATCH_LIST, loadStoredAlumniProfiles } from '../data/mockData';
import { AchievementBadgeChip } from './AchievementBadge';
import { WhatsAppIcon, FacebookIcon } from './SocialIcons';
import { getCachedDirectory } from '../utils/offlineStorage';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useAuth } from '../context/AuthContext';
import { AlumniProfile } from '../types';
import { matchesUniversalSearch, UNIVERSAL_DIRECTORY_PROFILES } from './DirectoryView';
import { VerificationStatusBadge } from './verification/VerificationStatusBadge';
import { vouchForAlumniProfile } from '../utils/verificationService';
import { Tilt3DCard } from './motion/CinematicMotion';
import { fetchAlumniProfilesFromDb } from '../services/supabaseService';
import { realtimeManager } from '../services/supabaseRealtimeService';

interface AlumniDirectoryViewProps {
  onViewProfile: (profileId: number) => void;
  onNavigateToFind?: () => void;
  onOpenVerificationCenter?: (initialTab?: 'status' | 'vouch_others') => void;
}

export const AlumniDirectoryView: React.FC<AlumniDirectoryViewProps> = ({
  onViewProfile,
  onNavigateToFind,
  onOpenVerificationCenter,
}) => {
  const isOnline = useOnlineStatus();
  const { currentUser, updateProfile } = useAuth();
  const [vouchNotice, setVouchNotice] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<AlumniProfile[]>(() => {
    const cached = getCachedDirectory();
    const stored = loadStoredAlumniProfiles();
    return [...stored, ...cached, ...UNIVERSAL_DIRECTORY_PROFILES].filter(
      (v, i, a) => a.findIndex((t) => t.id === v.id) === i
    );
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBatch, setSelectedBatch] = useState<string>('');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(12);
  const [isMobileMedicalDropdownOpen, setIsMobileMedicalDropdownOpen] = useState(false);
  const mobileMedicalDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        mobileMedicalDropdownRef.current &&
        !mobileMedicalDropdownRef.current.contains(e.target as Node)
      ) {
        setIsMobileMedicalDropdownOpen(false);
      }
    };
    if (isMobileMedicalDropdownOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isMobileMedicalDropdownOpen]);

  useEffect(() => {
    let isMounted = true;
    const cached = getCachedDirectory();
    const stored = loadStoredAlumniProfiles();
    const initialCombined = [...stored, ...cached, ...UNIVERSAL_DIRECTORY_PROFILES].filter(
      (v, i, a) => a.findIndex((t) => t.id === v.id) === i
    );
    setProfiles(initialCombined);

    const syncFromSupabase = () => {
      fetchAlumniProfilesFromDb()
        .then((dbProfiles) => {
          if (isMounted && dbProfiles && dbProfiles.length > 0) {
            setProfiles((prev) => {
              const map = new Map<number, AlumniProfile>();
              dbProfiles.forEach((p) => map.set(p.id, p));
              prev.forEach((p) => {
                if (!map.has(p.id)) map.set(p.id, p);
              });
              return Array.from(map.values());
            });
          }
        })
        .catch((err) => {
          console.warn('Could not load live profiles from Supabase, keeping cached fallback:', err);
        });
    };

    // Initial fetch
    syncFromSupabase();

    // Subscribe to live WebSocket realtime updates on alumni_profiles
    const unsubscribeAlumni = realtimeManager.subscribeToAlumni(() => {
      syncFromSupabase();
    });

    return () => {
      isMounted = false;
      unsubscribeAlumni();
    };
  }, []);

  const filteredProfiles = useMemo(() => {
    return profiles.filter((profile) => {
      if (searchTerm.trim() && !matchesUniversalSearch(profile, searchTerm)) {
        return false;
      }
      if (selectedBatch && profile.batchYear !== parseInt(selectedBatch, 10)) {
        return false;
      }
      if (onlineOnly && !profile.online) {
        return false;
      }
      return true;
    });
  }, [profiles, searchTerm, selectedBatch, onlineOnly]);

  const displayed = filteredProfiles.slice(0, visibleCount);

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedBatch('');
    setOnlineOnly(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {!isOnline ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-bold border border-amber-200 dark:border-amber-800">
                <WifiOff className="w-3.5 h-3.5" />
                <span>Offline Mode (Cached Directory)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Offline Ready ({profiles.length} Alumni Cached)</span>
              </span>
            )}
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-50 tracking-tight">
            All Alumni Directory
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Browse verified SZMC doctors and alumni of Shaheed Ziaur Rahman Medical College Bogura.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {onOpenVerificationCenter && (
            <button
              type="button"
              onClick={() => onOpenVerificationCenter('vouch_others')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-2xs cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Peer Vouch Center</span>
            </button>
          )}
          {onNavigateToFind && (
            <button
              type="button"
              onClick={onNavigateToFind}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Advanced Search</span>
            </button>
          )}
          <div className="text-xs font-bold px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800">
            {filteredProfiles.length} Members
          </div>
        </div>
      </div>

      {vouchNotice && (
        <div className="p-3.5 rounded-2xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{vouchNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setVouchNotice(null)}
            className="text-white/80 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Universal Search and Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="relative sm:col-span-6 lg:col-span-7">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600 dark:text-blue-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Universal Search: Cardiology, Surgery, Medicine, Pediatrics, Gynecology, Nephrology, FCPS, Batch 25, Name, Hospital..."
              className="w-full pl-10 pr-8 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="sm:col-span-4 lg:col-span-3">
            <select
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
              aria-label="Filter by Batch"
              className="w-full px-3 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="">All Batches (SZMC 01 - 35)</option>
              {BATCH_LIST.map((b) => (
                <option key={b.batchYear} value={b.batchYear}>
                  Batch {b.batchYear < 10 ? `0${b.batchYear}` : b.batchYear} ({b.session})
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 lg:col-span-2 flex items-center">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={onlineOnly}
                onChange={(e) => setOnlineOnly(e.target.checked)}
                className="rounded-sm border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                Online
              </span>
            </label>
          </div>
        </div>

        {/* Quick Medical Search Tags: Cute Dropdown on Mobile, Sleek Pill Bar on Laptop */}
        <div className="pt-0.5">
          {/* 1. Cute Interactive Dropdown for Mobile View (sm:hidden) */}
          <div className="sm:hidden relative" ref={mobileMedicalDropdownRef}>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                id="mobile-medical-specialty-dropdown-btn"
                onClick={() => setIsMobileMedicalDropdownOpen((prev) => !prev)}
                aria-expanded={isMobileMedicalDropdownOpen}
                aria-haspopup="listbox"
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-xs border cursor-pointer ${
                  searchTerm && MEDICAL_SUBJECT_TAGS.some((t) => t.label.toLowerCase() === searchTerm.toLowerCase())
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-500 shadow-blue-500/20'
                    : 'bg-gradient-to-r from-blue-50/80 via-white to-indigo-50/60 dark:from-slate-800/90 dark:via-slate-800 dark:to-blue-950/40 text-slate-700 dark:text-slate-200 border-blue-200/80 dark:border-blue-900/60'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-xl bg-blue-100 dark:bg-blue-900/70 text-blue-600 dark:text-blue-300 flex items-center justify-center shrink-0 text-xs shadow-2xs">
                    🩺
                  </span>
                  <div className="text-left truncate">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-70 block -mb-0.5">
                      Medical Specialty / Subject
                    </span>
                    <span className="text-xs font-black truncate block">
                      {searchTerm && MEDICAL_SUBJECT_TAGS.some((t) => t.label.toLowerCase() === searchTerm.toLowerCase())
                        ? searchTerm
                        : 'Choose Specialty / Topic...'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-500/15 dark:bg-blue-400/20 text-blue-700 dark:text-blue-300">
                    {MEDICAL_SUBJECT_TAGS.length}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${
                      isMobileMedicalDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </button>

              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  title="Clear medical search filter"
                  className="p-2.5 rounded-xl bg-slate-100 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-950/60 text-slate-500 hover:text-rose-600 transition-colors shrink-0 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Cute Mobile Dropdown Menu Popover */}
            {isMobileMedicalDropdownOpen && (
              <div
                role="listbox"
                className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-slate-900 rounded-3xl p-2.5 border border-blue-200/90 dark:border-slate-800 shadow-2xl z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 max-h-[340px] overflow-y-auto"
              >
                <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 mb-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    <span>🩺</span>
                    <span>Medical Specialties</span>
                  </span>
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm('');
                        setIsMobileMedicalDropdownOpen(false);
                      }}
                      className="text-[10px] font-bold text-rose-500 hover:underline cursor-pointer"
                    >
                      Clear Filter
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {MEDICAL_SUBJECT_TAGS.map((tag) => {
                    const active = searchTerm.toLowerCase() === tag.label.toLowerCase();
                    return (
                      <button
                        key={tag.label}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          setSearchTerm(active ? '' : tag.label);
                          setIsMobileMedicalDropdownOpen(false);
                        }}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-2xl text-left transition-all cursor-pointer border ${
                          active
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm font-bold'
                            : 'bg-slate-50/90 hover:bg-blue-50 dark:bg-slate-800/80 dark:hover:bg-slate-800 border-slate-200/70 dark:border-slate-700/70 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <span className="text-sm shrink-0">{tag.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold truncate leading-tight">
                            {tag.label}
                          </div>
                          <div
                            className={`text-[9px] truncate leading-none mt-0.5 ${
                              active ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {tag.desc}
                          </div>
                        </div>
                        {active && (
                          <Check className="w-3.5 h-3.5 text-white shrink-0 ml-auto" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 2. Laptop / Desktop View (hidden on mobile, flex on sm and up) */}
          <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0 mr-1 flex items-center gap-1">
              <span>🩺</span>
              <span>Quick Medical:</span>
            </span>
            {MEDICAL_SUBJECT_TAGS.map((tag) => {
              const active = searchTerm.toLowerCase() === tag.label.toLowerCase();
              return (
                <button
                  key={tag.label}
                  type="button"
                  onClick={() => setSearchTerm(active ? '' : tag.label)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer border ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                  }`}
                >
                  <span className="text-[10px]">{tag.icon}</span>
                  <span>{tag.label}</span>
                </button>
              );
            })}
          </div>
        </div>


        {(searchTerm || selectedBatch || onlineOnly) && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-500">
              Showing <b className="text-slate-800 dark:text-slate-200">{filteredProfiles.length}</b> results
            </span>
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-rose-600 dark:text-rose-400 font-semibold hover:underline flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              Reset filters
            </button>
          </div>
        )}
      </div>

      {filteredProfiles.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <Users className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {profiles.length === 0
              ? 'No alumni profiles registered yet'
              : 'No alumni match your search'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            {profiles.length === 0
              ? 'As graduates and doctors of Shaheed Ziaur Rahman Medical College register their verified profiles, they will be listed here in the directory.'
              : 'Try adjusting your search terms or clearing the batch filter.'}
          </p>
          {(searchTerm || selectedBatch || onlineOnly) && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="mt-3 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayed.map((profile) => (
            <Tilt3DCard
              key={profile.id}
              maxTilt={3}
              className="group bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 hover:border-blue-400/60 dark:hover:border-blue-500/40 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start gap-3.5">
                  <div className="relative">
                    <img
                      src={profile.avatarUrl}
                      alt={profile.fullName}
                      className="w-13 h-13 rounded-full object-cover ring-2 ring-slate-100 dark:ring-slate-800"
                    />
                    <span
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                        profile.online ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3
                        onClick={() => onViewProfile(profile.id)}
                        className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                      >
                        {profile.fullName}
                      </h3>
                      <VerificationStatusBadge
                        status={profile.verificationStatus || 'verified'}
                        vouchesCount={profile.vouchesCount ?? 2}
                        size="sm"
                        showLabel={false}
                        onClick={() => onViewProfile(profile.id)}
                      />
                    </div>

                    <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mt-0.5">
                      Batch {profile.batchYear} · {profile.profession}
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-300 font-medium truncate mt-1">
                      {profile.position}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {profile.institution}
                    </div>

                    {/* Achievement Badges on Card */}
                    {profile.badges && profile.badges.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2.5">
                        {profile.badges.map((b) => (
                          <AchievementBadgeChip key={b} badgeName={b} size="sm" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {profile.specialty && profile.specialty.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3.5">
                    {profile.specialty.slice(0, 3).map((spec, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                      >
                        {spec}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mt-3">
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  <span>
                    {profile.city}, {profile.country}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800">
                {profile.whatsapp && (
                  <a
                    href={`https://wa.me/${profile.whatsapp.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 transition-colors shrink-0"
                    title="WhatsApp"
                    aria-label="WhatsApp"
                  >
                    <WhatsAppIcon className="w-4 h-4" />
                  </a>
                )}

                {profile.fbLink && (
                  <a
                    href={
                      /^https?:\/\//i.test(profile.fbLink.trim())
                        ? profile.fbLink.trim()
                        : `https://${profile.fbLink.trim().replace(/^(javascript|vbscript|data):/i, '')}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition-colors shrink-0"
                    title="Facebook"
                    aria-label="Facebook"
                  >
                    <FacebookIcon className="w-4 h-4" />
                  </a>
                )}

                {(profile.verificationStatus || 'verified') !== 'verified' &&
                  profile.id !== currentUser.id && (
                    <button
                      type="button"
                      onClick={() => {
                        const res = vouchForAlumniProfile(profile, currentUser);
                        if (res.success && res.updatedTarget) {
                          setProfiles((prev) =>
                            prev.map((p) => (p.id === profile.id ? res.updatedTarget! : p))
                          );
                          updateProfile({
                            vouchedForIds: [
                              ...(currentUser.vouchedForIds || []),
                              profile.id,
                            ],
                          });
                        }
                        setVouchNotice(res.message);
                      }}
                      className="inline-flex items-center justify-center gap-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Vouch</span>
                    </button>
                  )}

                <button
                  type="button"
                  onClick={() => onViewProfile(profile.id)}
                  className="flex-1 min-w-[100px] inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View</span>
                </button>

                {profile.id !== currentUser.id && (
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof (window as any).szmcStartDirectMessage === 'function') {
                        (window as any).szmcStartDirectMessage(profile);
                      } else {
                        onViewProfile(profile.id);
                      }
                    }}
                    className="inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-[#0084FF]/10 dark:bg-[#0084FF]/20 hover:bg-[#0084FF] text-[#0084FF] hover:text-white text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0"
                    title={`Direct Message ${profile.fullName}`}
                  >
                    <MessageCircle className="w-3.5 h-3.5 fill-[#0084FF]/20" />
                    <span>Message</span>
                  </button>
                )}
              </div>
            </Tilt3DCard>
          ))}
        </div>
      )}

      {visibleCount < filteredProfiles.length && (
        <div className="text-center pt-4">
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => prev + 12)}
            className="px-6 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold rounded-xl transition-colors shadow-2xs"
          >
            Load More Alumni ({filteredProfiles.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
};
