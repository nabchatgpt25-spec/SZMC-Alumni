import React, { useState, useEffect, useMemo } from 'react';
import {
  Heart,
  Plus,
  Search,
  Phone,
  MessageSquare,
  Hospital,
  MapPin,
  CheckCircle2,
  Users,
  Sparkles,
  Droplets,
} from 'lucide-react';
import {
  BloodEmergencyRequest,
  BloodDonorProfile,
  BloodGroup,
  BLOOD_GROUPS_LIST,
} from '../types/blood';
import {
  loadBloodDonors,
  loadBloodRequests,
  respondToBloodRequest,
  getDonorProfileByUserId,
  syncBloodDataFromSupabase,
} from '../utils/bloodDonationService';
import { realtimeManager } from '../services/supabaseRealtimeService';
import { BloodRequestModal } from './BloodRequestModal';
import { BloodDonorRegistration } from './BloodDonorRegistration';
import { useAuth } from '../context/AuthContext';

interface BloodNetworkViewProps {
  currentUser?: {
    id: number;
    fullName: string;
    avatarUrl: string;
    batchYear: number;
    phone?: string;
    city?: string;
  };
  onViewProfile?: (profileId: number) => void;
  onNavigate?: (route: string) => void;
}

export const BloodNetworkView: React.FC<BloodNetworkViewProps> = ({
  currentUser: propUser,
  onViewProfile,
}) => {
  const { currentUser: authUser } = useAuth();
  const currentUser = propUser || authUser;

  // Liquid Glass Mood vs Normal Theme setting
  const [glassMode, setGlassMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('blood_view_glass_mode');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const [requests, setRequests] = useState<BloodEmergencyRequest[]>(() => loadBloodRequests());
  const [donors, setDonors] = useState<BloodDonorProfile[]>(() => loadBloodDonors());

  const [activeTab, setActiveTab] = useState<'requests' | 'donors'>('requests');
  const [selectedGroup, setSelectedGroup] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    // Initial fetch from Supabase to ensure fresh data
    syncBloodDataFromSupabase();

    const handleReqChange = (e: any) => setRequests(e.detail || loadBloodRequests());
    const handleDonorChange = (e: any) => setDonors(e.detail || loadBloodDonors());

    window.addEventListener('blood_requests_changed', handleReqChange);
    window.addEventListener('blood_donors_changed', handleDonorChange);

    // Subscribe to live Supabase WebSocket realtime changes
    const unsubscribeRealtime = realtimeManager.subscribeToBloodNetwork(() => {
      syncBloodDataFromSupabase();
    });

    return () => {
      window.removeEventListener('blood_requests_changed', handleReqChange);
      window.removeEventListener('blood_donors_changed', handleDonorChange);
      unsubscribeRealtime();
    };
  }, []);

  const toggleGlassMode = () => {
    setGlassMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('blood_view_glass_mode', String(next));
      } catch {}
      return next;
    });
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleRespondAsDonor = (req: BloodEmergencyRequest) => {
    const myProfile = getDonorProfileByUserId(currentUser.id);
    if (!myProfile) {
      setIsRegisterModalOpen(true);
      return;
    }

    const success = respondToBloodRequest({
      requestId: req.id,
      donorUserId: currentUser.id,
      donorName: currentUser.fullName,
      donorAvatar: currentUser.avatarUrl,
      donorBatchYear: currentUser.batchYear,
      donorBloodGroup: myProfile.bloodGroup,
      donorPreferredArea: myProfile.preferredArea,
      donorPhone: myProfile.phone,
    });

    if (success) {
      showToast('Thank you! Your donation offer has been registered.');
    } else {
      showToast('You have already offered to donate for this request.');
    }
  };

  // Filtered requests
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (selectedGroup !== 'All' && r.bloodGroup !== selectedGroup) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchHospital = r.hospitalName.toLowerCase().includes(q);
        const matchCity = r.city.toLowerCase().includes(q) || r.hospitalArea.toLowerCase().includes(q);
        const matchRequester = r.requesterName.toLowerCase().includes(q);
        if (!matchHospital && !matchCity && !matchRequester) return false;
      }
      return true;
    });
  }, [requests, selectedGroup, searchQuery]);

  // Filtered donors
  const filteredDonors = useMemo(() => {
    return donors.filter((d) => {
      if (selectedGroup !== 'All' && d.bloodGroup !== selectedGroup) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = d.fullName.toLowerCase().includes(q);
        const matchCity = d.city.toLowerCase().includes(q) || d.preferredArea.toLowerCase().includes(q);
        if (!matchName && !matchCity) return false;
      }
      return true;
    });
  }, [donors, selectedGroup, searchQuery]);

  // Card styling classes dependent on Glass Mood vs Normal Theme
  const cardClass = glassMode
    ? 'liquid-blood-glass-card rounded-2xl p-4.5 border border-rose-300/70 dark:border-rose-500/40 shadow-xl backdrop-blur-2xl transition-all duration-300 hover:shadow-2xl group relative'
    : 'bg-white dark:bg-slate-900 rounded-2xl p-4.5 border border-slate-200 dark:border-slate-800 shadow-xs transition-all duration-200 hover:shadow-md';

  const subcardClass = glassMode
    ? 'liquid-blood-subcard p-2.5 rounded-xl border border-rose-200/60 dark:border-rose-500/30 text-xs backdrop-blur-md'
    : 'bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 text-xs';

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6 animate-fade-in text-slate-900 dark:text-slate-100 relative isolate">
      {/* Ambient HD blood plasma glow in glass mode */}
      {glassMode && (
        <>
          <div className="absolute top-10 left-10 w-80 h-80 rounded-full bg-rose-500/15 dark:bg-rose-600/20 blur-3xl pointer-events-none -z-10 animate-liquid-blob-1" />
          <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-red-600/12 dark:bg-red-500/18 blur-3xl pointer-events-none -z-10 animate-liquid-blob-2" />
        </>
      )}

      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/95 text-white px-4 py-2.5 rounded-xl shadow-xl text-xs font-bold flex items-center gap-2 border border-rose-500/50 animate-fade-in backdrop-blur-md shadow-rose-950/40">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Banner Card (HD Liquid Blood Glass or Normal Theme) */}
      <div
        className={`rounded-3xl p-5 sm:p-7 transition-all duration-300 flex flex-col sm:flex-row sm:items-center justify-between gap-5 relative overflow-hidden ${
          glassMode
            ? 'liquid-blood-hero text-white border-2 border-white/40 shadow-2xl shadow-rose-950/40'
            : 'bg-gradient-to-r from-rose-600 to-red-700 text-white shadow-lg border border-rose-500'
        }`}
      >
        {/* Animated plasma lights in glass mode */}
        {glassMode && (
          <>
            <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/20 blur-3xl pointer-events-none animate-pulse" />
            <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-rose-400/25 blur-3xl pointer-events-none animate-liquid-blob-1" />
          </>
        )}

        <div className="relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-xs font-bold mb-2.5 backdrop-blur-md border border-white/30 shadow-inner">
            <Heart className="w-3.5 h-3.5 fill-rose-200 text-rose-200 animate-blood-pulse" />
            <span>SZMC Blood Lifeline</span>
          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight leading-tight drop-shadow-sm">
            Emergency Blood Network
          </h1>
          <p className="text-rose-100 text-xs sm:text-sm mt-1 max-w-xl leading-relaxed">
            Quick peer-to-peer blood discovery across batches and hospitals. Mobilize verified SZMC doctors and alumni donors.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0 relative z-10">
          {/* Button 1: I Need Blood */}
          <button
            onClick={() => setIsRequestModalOpen(true)}
            className={`px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-2 cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 group ${
              glassMode
                ? 'bg-white text-rose-700 hover:bg-rose-50 shadow-lg shadow-rose-950/30 border-2 border-white/90 hover:shadow-rose-500/25'
                : 'bg-white text-rose-600 hover:bg-rose-50 shadow-md'
            }`}
          >
            <Plus className="w-4 h-4 text-rose-600 stroke-[3] group-hover:rotate-90 transition-transform duration-300" />
            <span>I Need Blood</span>
          </button>

          {/* Button 2: I Want to Donate */}
          <button
            onClick={() => setIsRegisterModalOpen(true)}
            className={`px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-2 cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 group ${
              glassMode
                ? 'bg-rose-950/50 hover:bg-rose-950/70 text-white border-2 border-rose-300/70 hover:border-white/90 backdrop-blur-xl shadow-lg shadow-rose-950/40 hover:shadow-[0_0_20px_rgba(244,63,94,0.4)]'
                : 'bg-rose-900/60 hover:bg-rose-900 text-white border border-white/25 shadow-sm'
            }`}
          >
            <Heart className="w-4 h-4 fill-rose-300 text-rose-300 animate-blood-pulse" />
            <span>I Want to Donate</span>
          </button>
        </div>
      </div>

      {/* Tabs, Search & Theme Setting Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Tab Switcher */}
        <div
          className={`flex p-1 rounded-xl transition-all ${
            glassMode
              ? 'liquid-blood-subcard border border-rose-300/60 dark:border-rose-500/30 backdrop-blur-md'
              : 'bg-slate-100 dark:bg-slate-800'
          }`}
        >
          <button
            onClick={() => setActiveTab('requests')}
            className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all ${
              activeTab === 'requests'
                ? glassMode
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-300'
            }`}
          >
            Blood Needed Now ({requests.length})
          </button>
          <button
            onClick={() => setActiveTab('donors')}
            className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all ${
              activeTab === 'donors'
                ? glassMode
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-300'
            }`}
          >
            Registered Donors ({donors.length})
          </button>
        </div>

        {/* Right Controls: Search & Theme Mood Switcher */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1 sm:w-60">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search hospital, city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-9 pr-3 py-1.5 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 transition-all ${
                glassMode
                  ? 'bg-white/70 dark:bg-slate-900/70 border border-rose-300/60 dark:border-rose-900/60 backdrop-blur-md'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
              }`}
            />
          </div>

          {/* Liquid Glass vs Normal Theme Setting Switch */}
          <button
            type="button"
            onClick={toggleGlassMode}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-all select-none shrink-0 ${
              glassMode
                ? 'bg-gradient-to-r from-rose-500/20 via-red-500/25 to-rose-600/20 border-1.5 border-rose-400 text-rose-700 dark:text-rose-300 shadow-[0_0_18px_rgba(225,29,72,0.3)] backdrop-blur-xl animate-blood-glow'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
            }`}
            title="Toggle between HD Blood Liquid Glass and Normal Theme"
          >
            <Droplets className={`w-3.5 h-3.5 ${glassMode ? 'text-rose-600 fill-rose-500 animate-blood-pulse' : 'text-slate-400'}`} />
            <span>{glassMode ? 'Glass Mood' : 'Normal Theme'}</span>
          </button>
        </div>
      </div>

      {/* Blood Group Quick Filter Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setSelectedGroup('All')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 cursor-pointer transition-all ${
            selectedGroup === 'All'
              ? glassMode
                ? 'liquid-blood-badge text-white shadow-md'
                : 'bg-rose-600 text-white shadow-xs'
              : glassMode
              ? 'liquid-blood-subcard text-rose-900 dark:text-rose-200 hover:border-rose-400 backdrop-blur-md'
              : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
          }`}
        >
          All Groups
        </button>
        {BLOOD_GROUPS_LIST.map((bg) => (
          <button
            key={bg}
            onClick={() => setSelectedGroup(bg)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 cursor-pointer transition-all ${
              selectedGroup === bg
                ? glassMode
                  ? 'liquid-blood-badge text-white shadow-md'
                  : 'bg-rose-600 text-white shadow-xs'
                : glassMode
                ? 'liquid-blood-subcard text-rose-900 dark:text-rose-200 hover:border-rose-400 backdrop-blur-md'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-rose-300'
            }`}
          >
            {bg}
          </button>
        ))}
      </div>

      {/* TAB 1: Blood Requests View */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          {filteredRequests.length === 0 ? (
            <div
              className={`p-8 text-center rounded-2xl text-slate-500 ${
                glassMode
                  ? 'liquid-blood-glass-card border border-rose-300/60 dark:border-rose-900/60 backdrop-blur-2xl'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
              }`}
            >
              <Heart className="w-8 h-8 mx-auto mb-2 text-rose-400 animate-blood-pulse" />
              <p className="font-bold text-sm">No active blood requests for this group.</p>
              <button
                onClick={() => setIsRequestModalOpen(true)}
                className="mt-3 text-xs font-bold text-rose-600 underline cursor-pointer hover:text-rose-700"
              >
                Post an emergency request
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRequests.map((req) => (
                <div key={req.id} className={`${cardClass} space-y-3`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-12 h-12 rounded-xl text-white font-black text-lg flex items-center justify-center shrink-0 ${
                          glassMode
                            ? 'liquid-blood-badge animate-blood-pulse shadow-md'
                            : 'bg-rose-600 shadow-md'
                        }`}
                      >
                        {req.bloodGroup}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                          {req.hospitalName}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 shrink-0 text-rose-500" />
                          <span className="truncate">{req.city || req.hospitalArea}</span>
                        </p>
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${
                        glassMode
                          ? 'liquid-blood-subcard text-rose-700 dark:text-rose-300 border border-rose-300/60'
                          : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/60'
                      }`}
                    >
                      {req.unitsRequired} Bag{req.unitsRequired > 1 ? 's' : ''}
                    </span>
                  </div>

                  {req.description && (
                    <p className={`${subcardClass} text-slate-700 dark:text-slate-200 line-clamp-2`}>
                      {req.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                    <span className="truncate">
                      By {req.requesterName} (Batch {req.requesterBatch})
                    </span>
                    <div className="flex items-center gap-2">
                      {req.contactPhone && (
                        <a
                          href={`tel:${req.contactPhone}`}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 transition-colors shadow-xs"
                        >
                          <Phone className="w-3 h-3" />
                          <span>Call</span>
                        </a>
                      )}
                      <button
                        onClick={() => handleRespondAsDonor(req)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 ${
                          glassMode
                            ? 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-md shadow-rose-600/40 border border-rose-400/50'
                            : 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs'
                        }`}
                      >
                        <Heart className="w-3 h-3 fill-current animate-blood-pulse" />
                        <span>I Can Donate</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Registered Donors View */}
      {activeTab === 'donors' && (
        <div className="space-y-4">
          {filteredDonors.length === 0 ? (
            <div
              className={`p-8 text-center rounded-2xl text-slate-500 ${
                glassMode
                  ? 'liquid-blood-glass-card border border-rose-300/60 dark:border-rose-900/60 backdrop-blur-2xl'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
              }`}
            >
              <Users className="w-8 h-8 mx-auto mb-2 text-rose-400 animate-blood-pulse" />
              <p className="font-bold text-sm">No donors found with {selectedGroup} group.</p>
              <button
                onClick={() => setIsRegisterModalOpen(true)}
                className="mt-3 text-xs font-bold text-rose-600 underline cursor-pointer hover:text-rose-700"
              >
                Be the first to join as a donor
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDonors.map((donor) => (
                <div key={donor.userId} className={`${cardClass} space-y-3`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={donor.avatarUrl || '/assets/aistudio/images__1__2778177d.png'}
                        alt={donor.fullName}
                        className={`w-10 h-10 rounded-full object-cover shrink-0 ${
                          glassMode
                            ? 'border-2 border-rose-400/60 shadow-md shadow-rose-600/20'
                            : 'border border-slate-200 dark:border-slate-700'
                        }`}
                      />
                      <div className="min-w-0">
                        <h4
                          onClick={() => onViewProfile && onViewProfile(donor.userId)}
                          className={`font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate ${onViewProfile ? 'hover:text-rose-600 cursor-pointer' : ''}`}
                        >
                          {donor.fullName}
                        </h4>
                        <p className="text-[11px] text-slate-500 truncate">
                          Batch {donor.batchYear} • {donor.city || 'Bogura'}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`w-8 h-8 rounded-lg font-black text-sm flex items-center justify-center shrink-0 ${
                        glassMode
                          ? 'liquid-blood-badge animate-blood-pulse shadow-md'
                          : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-900/60'
                      }`}
                    >
                      {donor.bloodGroup}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      donor.availability === 'available'
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 border border-slate-200 dark:border-slate-700'
                    }`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {donor.availability === 'available' ? 'Available' : 'Paused'}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {donor.phone && (
                        <a
                          href={`tel:${donor.phone}`}
                          className={`p-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:text-emerald-600 transition-colors shadow-2xs ${
                            glassMode
                              ? 'bg-white/70 dark:bg-slate-800/70 border border-rose-200/40 dark:border-rose-900/30 hover:border-emerald-400'
                              : 'bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50'
                          }`}
                          title="Call Donor"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {donor.whatsapp && (
                        <a
                          href={`https://wa.me/${donor.whatsapp.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`p-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:text-emerald-600 transition-colors shadow-2xs ${
                            glassMode
                              ? 'bg-white/70 dark:bg-slate-800/70 border border-rose-200/40 dark:border-rose-900/30 hover:border-emerald-400'
                              : 'bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50'
                          }`}
                          title="WhatsApp"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <BloodRequestModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        currentUser={currentUser}
        onSuccess={() => showToast('Emergency request posted successfully!')}
      />

      <BloodDonorRegistration
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        currentUser={currentUser}
        onSuccess={() => showToast('Donor profile updated!')}
      />
    </div>
  );
};
