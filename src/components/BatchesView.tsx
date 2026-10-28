import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
  ChevronRight,
  Search,
  Sparkles,
  ArrowRight,
  X,
  ArrowLeft,
  MapPin,
  Briefcase,
  GraduationCap,
  ShieldCheck,
  Stethoscope,
  HeartHandshake,
  Calendar,
  Building2,
} from 'lucide-react';
import { BATCH_LIST, loadStoredAlumniProfiles } from '../data/mockData';
import { BatchSummary, AlumniProfile, SPECIALTIES_LIST } from '../types';
import { NDCLogo } from './NDCLogo';
import { fetchBatchesFromDb, fetchBatchAlumniProfilesFromDb } from '../services/supabaseService';
import { realtimeManager } from '../services/supabaseRealtimeService';
import { FAMOUS_SZMC_ALUMNI } from './landing/FeaturedAlumniSection';

interface BatchesViewProps {
  onSelectBatch: (batchYear: number) => void;
  onViewProfile?: (profileId: number) => void;
}

export const BatchesView: React.FC<BatchesViewProps> = ({ onSelectBatch, onViewProfile }) => {
  const [batchesList, setBatchesList] = useState<BatchSummary[]>(BATCH_LIST);
  const [batchAlumniProfiles, setBatchAlumniProfiles] = useState<AlumniProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [rangeFilter, setRangeFilter] = useState<'all' | '1-10' | '11-20' | '21-30' | '31-35'>('all');
  const [activeBatchYear, setActiveBatchYear] = useState<number | null>(null);
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('');
  const [memberSearch, setMemberSearch] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    const syncBatches = () => {
      fetchBatchesFromDb()
        .then((dbBatches) => {
          if (isMounted && dbBatches && dbBatches.length > 0) {
            const szmcDbBatches = dbBatches.filter(
              (b) => b && b.batchYear >= 1 && b.batchYear <= 35
            );
            setBatchesList((prev) => {
              const map = new Map<number, BatchSummary>();
              szmcDbBatches.forEach((b) => map.set(b.batchYear, b));
              prev.forEach((b) => {
                if (b.batchYear >= 1 && b.batchYear <= 35 && !map.has(b.batchYear)) {
                  map.set(b.batchYear, b);
                }
              });
              return Array.from(map.values()).sort((a, b) => a.batchYear - b.batchYear);
            });
          }
        })
        .catch((err) => {
          console.warn('BatchesView: could not load batches from Supabase:', err);
        });
    };

    syncBatches();

    const unsubscribeAlumni = realtimeManager.subscribeToAlumni(() => {
      syncBatches();
    });

    return () => {
      isMounted = false;
      unsubscribeAlumni();
    };
  }, []);

  const activeBatch = useMemo(() => {
    if (!activeBatchYear) return null;
    return batchesList.find((b) => b.batchYear === activeBatchYear) || null;
  }, [activeBatchYear, batchesList]);

  // Load batch members when a batch is selected
  useEffect(() => {
    if (!activeBatchYear) {
      setBatchAlumniProfiles([]);
      return;
    }
    let isMounted = true;

    // Pre-populate with local stored & prominent alumni belonging to this batch
    const stored = loadStoredAlumniProfiles();
    const localMatches = [...stored, ...FAMOUS_SZMC_ALUMNI].filter(
      (p) => p && (p.batchYear === activeBatchYear || p.batchYear - 1991 === activeBatchYear)
    );
    const initialMap = new Map<number, AlumniProfile>();
    localMatches.forEach((p) => initialMap.set(p.id, p));
    setBatchAlumniProfiles(Array.from(initialMap.values()));

    fetchBatchAlumniProfilesFromDb(activeBatchYear)
      .then((profiles) => {
        if (isMounted && profiles && profiles.length > 0) {
          setBatchAlumniProfiles((prev) => {
            const map = new Map<number, AlumniProfile>();
            profiles.forEach((p) => map.set(p.id, p));
            prev.forEach((p) => {
              if (!map.has(p.id)) map.set(p.id, p);
            });
            return Array.from(map.values());
          });
        }
      })
      .catch((err) => {
        console.warn('Failed to load batch profiles for batch', activeBatchYear, err);
      });

    return () => {
      isMounted = false;
    };
  }, [activeBatchYear]);

  // Calculate batch metrics
  const activeBatchMetrics = useMemo(() => {
    if (!activeBatch) return { total: 0, verified: 0, bloodDonors: 0, profiles: [] };
    const realBatchProfiles = batchAlumniProfiles.filter(
      (p) => p.batchYear === activeBatch.batchYear || p.batchYear - 1991 === activeBatch.batchYear
    );
    const verified = realBatchProfiles.filter((p) => p.verificationStatus === 'verified').length;
    const bloodDonors = realBatchProfiles.filter((p) => Boolean(p.bloodDonorProfile?.isRegisteredDonor || p.bloodGroup)).length;
    return {
      total: realBatchProfiles.length,
      verified,
      bloodDonors,
      profiles: realBatchProfiles,
    };
  }, [activeBatch, batchAlumniProfiles]);

  // Filtered members in the active batch
  const filteredBatchMembers = useMemo(() => {
    if (!activeBatch) return [];
    let list = activeBatchMetrics.profiles;
    if (selectedSpecialty) {
      list = list.filter((p) => p.specialty?.includes(selectedSpecialty) || p.position?.includes(selectedSpecialty));
    }
    if (memberSearch.trim()) {
      const q = memberSearch.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.fullName.toLowerCase().includes(q) ||
          (p.collegeRoll && p.collegeRoll.toLowerCase().includes(q)) ||
          p.institution.toLowerCase().includes(q) ||
          p.position.toLowerCase().includes(q) ||
          p.city.toLowerCase().includes(q) ||
          (p.bloodGroup && p.bloodGroup.toLowerCase().includes(q))
      );
    }
    return list;
  }, [activeBatch, activeBatchMetrics, selectedSpecialty, memberSearch]);

  // Resolve direct quick-jump target batch when user types a batch number (1-35) or 4-digit admission year (1991-2026)
  const quickJumpBatch = useMemo(() => {
    const q = searchTerm.trim().toLowerCase().replace(/^batch\s*/i, '').replace(/^szmc\s*/i, '').replace(/^szmc-/i, '');
    if (!q) return null;
    const num = Number(q);
    if (!Number.isNaN(num)) {
      if (num >= 1 && num <= 35) {
        return batchesList.find((b) => b.batchYear === num) || null;
      }
      if (num >= 1991 && num <= 2026) {
        const targetBatchNum = num - 1990;
        return batchesList.find((b) => b.batchYear === targetBatchNum) || null;
      }
    }
    return null;
  }, [searchTerm, batchesList]);

  // Filter batches
  const filteredBatches = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();

    const list = batchesList.filter((b) => {
      // SZMC has strictly 35 MBBS batches (SZMC-01 to SZMC-35, Session 1991-92 onwards)
      if (b.batchYear < 1 || b.batchYear > 35) return false;

      if (!q) {
        if (rangeFilter === '1-10' && (b.batchYear < 1 || b.batchYear > 10)) return false;
        if (rangeFilter === '11-20' && (b.batchYear < 11 || b.batchYear > 20)) return false;
        if (rangeFilter === '21-30' && (b.batchYear < 21 || b.batchYear > 30)) return false;
        if (rangeFilter === '31-35' && (b.batchYear < 31 || b.batchYear > 35)) return false;
        return true;
      }

      const batchNumStr = b.batchYear.toString();
      const batchPadded = b.batchYear < 10 ? `0${b.batchYear}` : `${b.batchYear}`;
      const startYear = String(1990 + b.batchYear);
      const sessionEndYear = String(1991 + b.batchYear);

      const cleanQ = q.replace(/^batch\s*/i, '').replace(/^szmc\s*/i, '').replace(/^szmc-/i, '');

      const matchesNum =
        batchNumStr === cleanQ ||
        batchPadded === cleanQ ||
        `batch ${batchNumStr}`.includes(q) ||
        `batch ${batchPadded}`.includes(q) ||
        `szmc-${batchPadded}`.includes(q);

      const matchesYear =
        startYear === cleanQ ||
        sessionEndYear === cleanQ ||
        startYear.includes(cleanQ);

      const matchesSession = b.session.toLowerCase().includes(q);
      const matchesRep = b.representative?.toLowerCase().includes(q);

      return matchesNum || matchesYear || matchesSession || matchesRep;
    });

    if (q && quickJumpBatch) {
      return [...list].sort((a, b) => {
        if (a.batchYear === quickJumpBatch.batchYear) return -1;
        if (b.batchYear === quickJumpBatch.batchYear) return 1;
        return a.batchYear - b.batchYear;
      });
    }

    return list;
  }, [searchTerm, rangeFilter, quickJumpBatch, batchesList]);

  return (
    <div className="space-y-6">
      {/* Header & Overview */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <NDCLogo className="w-5 h-5" />
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
              SZMC Bogura • 35 MBBS Batches
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              MBBS Sessions 1991 – 2026
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-50 tracking-tight">
            Generational MBBS Batch Directory (SZMC-01 to SZMC-35)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Explore all 35 medical batches of Shaheed Ziaur Rahman Medical College (SZMC Bogura) — from Pioneer Batch 01 (Session 1991-92) to the 35th Batch (Session 2025-26). Reconnect with classmates, consultants, and medical interns.
          </p>
        </div>

        {/* Quick Highlights */}
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-2 rounded-2xl shadow-2xs self-start md:self-auto">
          <div className="px-3 py-1 text-center border-r border-slate-200 dark:border-slate-800">
            <div className="text-lg font-black text-blue-600 dark:text-blue-400">35</div>
            <div className="text-[10px] uppercase font-bold text-slate-400">MBBS Batches</div>
          </div>
          <div className="px-3 py-1 text-center border-r border-slate-200 dark:border-slate-800">
            <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">1991-92</div>
            <div className="text-[10px] uppercase font-bold text-slate-400">1st Session</div>
          </div>
          <div className="px-3 py-1 text-center">
            <div className="text-lg font-black text-slate-900 dark:text-slate-100">Silimpur</div>
            <div className="text-[10px] uppercase font-bold text-slate-400">Bogura Campus</div>
          </div>
        </div>
      </div>

      {/* Search & Quick Jump Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 max-w-xl">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by batch (1–35), session (e.g. 1992, 2016), or coordinator..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && quickJumpBatch) {
                  setActiveBatchYear(quickJumpBatch.batchYear);
                }
              }}
              className="w-full pl-9.5 pr-4 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {quickJumpBatch && (
            <button
              type="button"
              onClick={() => setActiveBatchYear(quickJumpBatch.batchYear)}
              className="px-3 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Jump to SZMC-{quickJumpBatch.batchYear < 10 ? '0' + quickJumpBatch.batchYear : quickJumpBatch.batchYear}</span>
            </button>
          )}
        </div>

        {/* Range Filter Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {[
            { id: 'all', label: 'All 35 Batches' },
            { id: '1-10', label: 'Pioneers (01–10)' },
            { id: '11-20', label: 'Batches (11–20)' },
            { id: '21-30', label: 'Batches (21–30)' },
            { id: '31-35', label: 'Recent (31–35)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setRangeFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                rangeFilter === tab.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* SELECTED BATCH DETAIL VIEW */}
      <AnimatePresence>
        {activeBatch && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            transition={{ duration: 0.25 }}
            className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-blue-500/50 dark:border-blue-500/40 p-5 sm:p-6 shadow-xl space-y-5"
          >
            {/* Top Bar of Active Batch */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white font-black text-base flex items-center justify-center shrink-0 shadow-md shadow-blue-600/30">
                  {activeBatch.batchYear < 10 ? `0${activeBatch.batchYear}` : activeBatch.batchYear}
                </div>
                <div>
                  <div className="flex items-center flex-wrap gap-2">
                    <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-50">
                      SZMC Batch {activeBatch.batchYear < 10 ? `0${activeBatch.batchYear}` : activeBatch.batchYear} • Session {activeBatch.session}
                    </h2>
                    {activeBatch.specialNote && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300">
                        {activeBatch.specialNote}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Shaheed Ziaur Rahman Medical College • MBBS Session {activeBatch.session} (Admitted {1990 + activeBatch.batchYear})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => onSelectBatch(activeBatch.batchYear)}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <span>Open Full Batch Directory</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveBatchYear(null);
                    setSelectedSpecialty('');
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Close</span>
                </button>
              </div>
            </div>

            {/* Batch Metrics Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl p-3.5 border border-blue-200/70 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20">
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Batch Census</div>
                <div className="text-xl font-black text-blue-600 dark:text-blue-400 mt-0.5">
                  {activeBatchMetrics.total} Alumni
                </div>
              </div>
              <div className="rounded-2xl p-3.5 border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20">
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Verified Doctors</div>
                <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {activeBatchMetrics.verified} Verified
                </div>
              </div>
              <div className="rounded-2xl p-3.5 border border-rose-200/70 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20">
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Blood Donors</div>
                <div className="text-xl font-black text-rose-600 dark:text-rose-400 mt-0.5">
                  {activeBatchMetrics.bloodDonors} Ready
                </div>
              </div>
              <div className="rounded-2xl p-3.5 border border-amber-200/70 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20">
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Batch Coordinator</div>
                <div className="text-xs font-black text-slate-900 dark:text-slate-100 truncate mt-1">
                  {activeBatch.representative || `SZMC-${activeBatch.batchYear < 10 ? '0' + activeBatch.batchYear : activeBatch.batchYear}`}
                </div>
              </div>
            </div>

            {/* Specialty Pill Quick Filters */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                <span>Filter by Clinical Specialty / Discipline:</span>
                {selectedSpecialty && (
                  <button
                    type="button"
                    onClick={() => setSelectedSpecialty('')}
                    className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                  >
                    Clear Filter
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto scrollbar-thin">
                <button
                  type="button"
                  onClick={() => setSelectedSpecialty('')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !selectedSpecialty
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  All ({activeBatchMetrics.total})
                </button>
                {SPECIALTIES_LIST.slice(0, 14).map((spec) => {
                  const isSel = selectedSpecialty === spec;
                  return (
                    <button
                      key={spec}
                      type="button"
                      onClick={() => setSelectedSpecialty(isSel ? '' : spec)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        isSel
                          ? 'bg-blue-600 text-white font-bold'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/40'
                      }`}
                    >
                      {spec}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Member Search & Member Cards Grid */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    Registered Batch Doctors & Students ({filteredBatchMembers.length})
                  </h4>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search in batch (name, roll, hospital)..."
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                  {memberSearch && (
                    <button
                      type="button"
                      onClick={() => setMemberSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {filteredBatchMembers.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
                  <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    No registered alumni in this batch yet
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    SZMC alumni from Batch {activeBatch.batchYear} will appear here when registered.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto pr-1">
                  {filteredBatchMembers.map((alumnus) => (
                    <div
                      key={alumnus.id}
                      onClick={() => onViewProfile && onViewProfile(alumnus.id)}
                      className="group bg-slate-50/70 hover:bg-white dark:bg-slate-800/80 dark:hover:bg-slate-800 rounded-2xl p-3.5 border border-slate-200/80 dark:border-slate-700/80 hover:border-blue-400 dark:hover:border-blue-500 shadow-2xs hover:shadow-xs transition-all cursor-pointer flex items-start gap-3"
                    >
                      <div className="relative shrink-0">
                        <img
                          src={alumnus.avatarUrl}
                          alt={alumnus.fullName}
                          className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                        />
                        {alumnus.online && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-800" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <h5 className="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                            {alumnus.fullName}
                          </h5>
                          {alumnus.verificationStatus === 'verified' && (
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" aria-label="Verified SZMC Alumnus" />
                          )}
                        </div>

                        {alumnus.collegeRoll && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                            Roll/BMDC: {alumnus.collegeRoll}
                          </div>
                        )}

                        <div className="text-[11px] text-slate-600 dark:text-slate-300 font-medium truncate mt-0.5">
                          {alumnus.position || alumnus.profession || 'Doctor / Alumnus'}
                        </div>

                        {alumnus.institution && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1 mt-0.5">
                            <Briefcase className="w-3 h-3 shrink-0" />
                            <span className="truncate">{alumnus.institution}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400">
                          {alumnus.city && (
                            <span className="flex items-center gap-0.5 truncate">
                              <MapPin className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">{alumnus.city}</span>
                            </span>
                          )}
                          {alumnus.bloodGroup && (
                            <span className="font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.2 rounded">
                              {alumnus.bloodGroup}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 35 BATCHES TILES GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-3">
        {filteredBatches.map((batch) => {
          const isSelected = activeBatchYear === batch.batchYear;
          return (
            <motion.div
              key={batch.batchYear}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setActiveBatchYear(isSelected ? null : batch.batchYear);
                setSelectedSpecialty('');
              }}
              className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/30 ring-2 ring-blue-600/50'
                  : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 text-slate-900 dark:text-slate-100 shadow-2xs hover:shadow-xs'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border transition-all duration-300 ease-out transform group-hover:scale-105 ${
                      isSelected
                        ? 'text-white bg-blue-700/80 border-blue-300/40 shadow-[0_0_12px_rgba(255,255,255,0.4)]'
                        : 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border-blue-200/80 dark:border-blue-800/80 group-hover:border-blue-400 dark:group-hover:border-blue-400 group-hover:shadow-[0_0_12px_rgba(59,130,246,0.35)] dark:group-hover:shadow-[0_0_14px_rgba(96,165,250,0.4)] hover:scale-105 hover:border-blue-400 hover:shadow-[0_0_12px_rgba(59,130,246,0.35)]'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400 animate-pulse" />
                    <span>SZMC-{batch.batchYear < 10 ? `0${batch.batchYear}` : batch.batchYear}</span>
                  </span>
                </div>

                <div className="font-extrabold text-sm leading-tight">
                  Batch {batch.batchYear < 10 ? `0${batch.batchYear}` : batch.batchYear}
                </div>
                <div
                  className={`text-[11px] font-semibold mt-0.5 ${
                    isSelected ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Session {batch.session}
                </div>
              </div>

              <div
                className={`mt-3 pt-2 border-t text-[10px] font-bold flex items-center justify-end ${
                  isSelected
                    ? 'border-white/20 text-white'
                    : 'border-slate-100 dark:border-slate-800 text-blue-600 dark:text-blue-400'
                }`}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
