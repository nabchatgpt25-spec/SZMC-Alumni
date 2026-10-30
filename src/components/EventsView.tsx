import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Sparkles,
  Ticket,
  Users,
  CheckCircle2,
  Share2,
  Award,
  BookOpen,
  Music,
  HeartHandshake,
  Download,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Building2,
  Camera,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { playSound } from '../utils/audio';

interface EventsViewProps {
  onNavigate?: (tab: string) => void;
}

export const EventsView: React.FC<EventsViewProps> = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'schedule' | 'gallery' | 'registration'>('overview');

  // Registration Form State
  const [regForm, setRegForm] = useState({
    name: currentUser?.fullName || '',
    batchYear: currentUser?.batchYear || 20,
    phone: currentUser?.phone || '',
    email: currentUser?.email || '',
    category: 'Alumnus Doctor (MBBS)',
    guestCount: 0,
    tshirtSize: 'L',
    attendingDays: 'Both Days (4th & 5th November)',
    notes: '',
  });
  const [regSubmitted, setRegSubmitted] = useState(false);

  // Target event date: November 4, 2026 at 09:00 AM
  const eventTargetDate = new Date('2026-11-04T09:00:00');
  const [countdown, setCountdown] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      const diff = eventTargetDate.getTime() - now;
      if (diff > 0) {
        setCountdown({
          days: Math.floor(diff / (1000 * 60 * 60 * 24)),
          hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((diff / (1000 * 60)) % 60),
          seconds: Math.floor((diff / 1000) % 60),
        });
      } else {
        setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  const eventPhotos = [
    {
      src: '/assets/aistudio/844630102_122141641941179457_1692878458464947990_n_99cb78bb.jpg',
      title: 'SZMC DAY 2026 Official Announcement',
      subtitle: 'Coming Soon • 4, 5th November, 2026',
      tag: 'Official Poster',
    },
    {
      src: '/assets/aistudio/854533386_122142631293179457_8618775669176399815_n_370b56ab.jpg',
      title: 'Registration Is Open Now',
      subtitle: 'SZMC DAY!! 5th November, 2026 • Hurray!!',
      tag: 'Registration',
    },
    {
      src: '/assets/aistudio/863598542_4472569353005923_5113190631392080562_n_bb604d97.jpg',
      title: 'SZMC Day Grand Rally & Batch Gathering',
      subtitle: '‘এসো স্মৃতির প্রাঙ্গণে মিলি প্রীতির বন্ধনে’ — মোরা শহীদজিয়াকিয়ান',
      tag: 'Campus Rally',
    },
    {
      src: '/assets/aistudio/855662974_122142718455179457_4307805146952035028_n_59640775.jpg',
      title: 'শিকড় থেকে শিখরে (Roots to Summit)',
      subtitle: 'Commemorating 34+ Golden Years of Medical Excellence',
      tag: 'Campus Heritage',
    },
  ];

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRegSubmitted(true);
    playSound('post');
    setTimeout(() => {
      setIsRegisterModalOpen(false);
      setRegSubmitted(false);
    }, 2800);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'SZMC DAY 2026 is on 4, 5th November',
        text: 'Join us for SZMC DAY 2026 on 4th & 5th November at Shaheed Ziaur Rahman Medical College Campus, Silimpur, Bogura! Registration is open now.',
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(window.location.href);
      alert('Event link copied to clipboard!');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8 pb-12">
      {/* Mega Event Headline Hero Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white border border-blue-500/30 shadow-2xl">
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 w-[480px] h-[480px] bg-sky-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 left-10 w-[400px] h-[400px] bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 p-6 sm:p-10 lg:p-12">
          {/* Top badges */}
          <div className="flex flex-wrap items-center gap-2.5 mb-5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-sm animate-pulse">
              <Sparkles className="w-3.5 h-3.5" />
              <span>SZMC Mega Milestone</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/30 border border-blue-400/40 text-blue-200 text-xs font-bold backdrop-blur-md">
              <Calendar className="w-3.5 h-3.5 text-blue-300" />
              <span>4th & 5th November, 2026</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-xs font-bold backdrop-blur-md">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
              <span>Registration Open Now</span>
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Main Content */}
            <div className="lg:col-span-7 space-y-4">
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-[1.08] font-serif">
                SZMC DAY 2026
              </h1>
              <p className="text-xl sm:text-2xl font-bold text-amber-300 font-serif italic">
                &ldquo;এসো স্মৃতির প্রাঙ্গণে মিলি প্রীতির বন্ধনে&rdquo;
              </p>
              <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed max-w-xl">
                Shaheed Ziaur Rahman Medical College cordially invites all respected teachers, seniors, batchmates, intern doctors, and students across <strong>Batches 01 to 35</strong> to the grand celebration of <strong>SZMC DAY 2026 on 4th & 5th November, 2026</strong>.
              </p>

              {/* Event Metadata row */}
              <div className="pt-2 flex flex-wrap items-center gap-y-2 gap-x-5 text-xs text-blue-200 font-medium">
                <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 backdrop-blur-sm">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <strong>Dates:</strong> 4th & 5th November, 2026
                </span>
                <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 backdrop-blur-sm">
                  <MapPin className="w-4 h-4 text-rose-400" />
                  <strong>Venue:</strong> SZMC Campus Grounds, Silimpur, Bogura
                </span>
                <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 backdrop-blur-sm">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <strong>Delegates:</strong> All SZMC Doctors & Students
                </span>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(true)}
                  className="px-6 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-blue-600/30 transition-all cursor-pointer inline-flex items-center gap-2 group active:scale-95"
                >
                  <Ticket className="w-4 h-4" />
                  <span>Register for SZMC DAY 2026</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>

                <button
                  type="button"
                  onClick={handleShare}
                  className="px-4 py-3.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs sm:text-sm rounded-2xl border border-white/20 transition-all cursor-pointer inline-flex items-center gap-2"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share Event</span>
                </button>
              </div>
            </div>

            {/* Right Countdown & Visual Card */}
            <div className="lg:col-span-5 space-y-4">
              {/* Countdown Card */}
              <div className="bg-white/10 backdrop-blur-md rounded-3xl p-5 sm:p-6 border border-white/20 text-center shadow-lg">
                <div className="flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider text-blue-200 mb-3">
                  <Clock className="w-4 h-4 text-amber-400 animate-spin" />
                  <span>Countdown to November 4, 2026</span>
                </div>

                <div className="grid grid-cols-4 gap-2 sm:gap-3 mb-4">
                  <div className="p-2.5 sm:p-3 rounded-2xl bg-black/40 border border-white/10">
                    <span className="text-2xl sm:text-3xl font-black text-white">{countdown.days}</span>
                    <span className="block text-[10px] uppercase font-bold text-blue-300">Days</span>
                  </div>
                  <div className="p-2.5 sm:p-3 rounded-2xl bg-black/40 border border-white/10">
                    <span className="text-2xl sm:text-3xl font-black text-white">{String(countdown.hours).padStart(2, '0')}</span>
                    <span className="block text-[10px] uppercase font-bold text-blue-300">Hours</span>
                  </div>
                  <div className="p-2.5 sm:p-3 rounded-2xl bg-black/40 border border-white/10">
                    <span className="text-2xl sm:text-3xl font-black text-white">{String(countdown.minutes).padStart(2, '0')}</span>
                    <span className="block text-[10px] uppercase font-bold text-blue-300">Mins</span>
                  </div>
                  <div className="p-2.5 sm:p-3 rounded-2xl bg-black/40 border border-white/10">
                    <span className="text-2xl sm:text-3xl font-black text-white">{String(countdown.seconds).padStart(2, '0')}</span>
                    <span className="block text-[10px] uppercase font-bold text-blue-300">Secs</span>
                  </div>
                </div>

                {/* Primary Poster Thumbnail */}
                <div
                  onClick={() => setSelectedPhoto(eventPhotos[0].src)}
                  className="relative rounded-2xl overflow-hidden border border-white/20 aspect-[16/9] cursor-pointer group shadow-inner"
                >
                  <img
                    src={eventPhotos[0].src}
                    alt="SZMC DAY 2026 Poster"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-3">
                    <div className="text-left">
                      <span className="text-[10px] font-bold text-amber-300 uppercase">Click to Enlarge Official Poster</span>
                      <p className="text-xs font-black text-white">SZMC DAY 2026 • November 05</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid with Content on Left & Events Sidebar on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
        {/* Left Column: Tabs, Schedule, Posters, Event Information */}
        <div className="lg:col-span-8 space-y-6">
          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 p-1.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-x-auto">
            {[
              { id: 'overview', label: 'Overview', icon: Building2 },
              { id: 'schedule', label: '2-Day Program (Nov 4 & 5)', icon: Calendar },
              { id: 'gallery', label: 'Official Posters & Rally', icon: Camera },
              { id: 'registration', label: 'Registration Info', icon: Ticket },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Event Description Card */}
              <div className="p-6 sm:p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                    <span>About SZMC DAY 2026</span>
                  </h2>
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded-lg">
                    34+ Years of Legacy
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  SZMC DAY is the annual homecoming and pinnacle fraternal celebration of <strong>Shaheed Ziaur Rahman Medical College (SZMC)</strong>. Held over two memorable days on <strong>4th & 5th November, 2026</strong> at our beloved campus in Silimpur, Bogura, it brings together alumni doctors practicing across Bangladesh and overseas, respected faculty members, and current medical students.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 space-y-1">
                    <div className="text-blue-600 dark:text-blue-400 font-black text-base sm:text-lg">Nov 4</div>
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">Day 1: Homecoming & Rally</div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">Campus assembly, colourful grand rally, batch flag hoist, and nostalgic departmental walkthrough.</p>
                  </div>

                  <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-900/40 space-y-1">
                    <div className="text-indigo-600 dark:text-indigo-400 font-black text-base sm:text-lg">Nov 5</div>
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">Day 2: Grand Gala & CME</div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">Scientific symposium, lifetime awards to teachers, batch souvenirs, traditional feast, and cultural night.</p>
                  </div>

                  <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 space-y-1">
                    <div className="text-emerald-600 dark:text-emerald-400 font-black text-base sm:text-lg">All Batches</div>
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">Batches 01 to 35</div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">Pioneer doctors to youngest batch members celebrating our sacred medical fraternity.</p>
                  </div>
                </div>
              </div>

              {/* Four Featured Highlight Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Senior Faculty & Pioneer Honors</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                      Conferring lifetime achievement accolades upon our revered medical teachers and founding batch leaders.
                    </p>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Annual Scientific CME & Souvenir</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                      Accredited clinical seminars, case symposiums, and release of the grand SZMC DAY 2026 commemorative souvenir.
                    </p>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                    <Music className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Cultural Extravaganza & Banquet</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                      Musical performances by talented alumni doctors and student artists, accompanied by the legendary North Bengal feast.
                    </p>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                    <HeartHandshake className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Fraternal Networking & Mentorship</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                      Connecting senior professors and consultants with junior doctors for post-graduate training and fellowship pathways.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: 2-DAY SCHEDULE */}
          {activeTab === 'schedule' && (
            <div className="space-y-6">
              {/* Day 1: 4th November */}
              <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <span className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 tracking-wider">Day 1</span>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">Wednesday, 4th November, 2026 • Campus Homecoming</h3>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-bold">
                    Silimpur Campus
                  </span>
                </div>

                <div className="space-y-3">
                  {[
                    { time: '08:30 AM', title: 'Delegate Registration & Welcome Kit Distribution', desc: 'Collection of official delegate badges, commemorative polo t-shirt, and reunion registration gift bag.' },
                    { time: '10:00 AM', title: 'Grand Campus Rally (বর্ণাঢ্য র্যালী)', desc: 'Colorful rally around SZMC campus & hospital grounds with batch banners, balloons, and musical band.' },
                    { time: '11:30 AM', title: 'Inaugural Session & Flag Hoisting', desc: 'National anthem, hoisting of College & Alumni flags by Principal, Vice-Principal & Batch representatives.' },
                    { time: '01:00 PM', title: 'Fraternal Lunch & Batch Lounge Reunions', desc: 'Batch-wise lounge meetings, nostalgic classroom photo sessions, and inter-batch greetings.' },
                    { time: '03:30 PM', title: 'Friendly Inter-Batch Cricket & Badminton Exhibition', desc: 'Friendly collegiate sports festival on the central campus grounds.' },
                    { time: '06:30 PM', title: 'Campus Nostalgia Evening & Open Mic Adda', desc: 'Sharing unforgettable medical hostel memories, acoustic melodies, and tea under the stars.' },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                      <div className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-black whitespace-nowrap shrink-0">
                        {item.time}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">{item.title}</h4>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Day 2: 5th November */}
              <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <span className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">Day 2 (Main Gala)</span>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">Thursday, 5th November, 2026 • Grand Gala & CME</h3>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold">
                    Main Auditorium
                  </span>
                </div>

                <div className="space-y-3">
                  {[
                    { time: '09:00 AM', title: 'SZMC Annual Scientific CME Symposium', desc: 'Clinical keynote presentations by eminent alumni specialists from Bangladesh, UK, USA, and Australia.' },
                    { time: '11:00 AM', title: 'Solemn Remembrance & Tribute Session', desc: 'Honoring the memory of our departed teachers, doctors, and students with profound prayers.' },
                    { time: '11:45 AM', title: 'Lifetime Accolades & Souvenir Unveiling', desc: 'Presentation of crests to founding professors, pioneer batch delegates, and release of the Souvenir.' },
                    { time: '01:30 PM', title: 'Royal Alumni Mezban Feast & Banquet', desc: 'Traditional Bogura banquet lunch with special delicacies for all attendees.' },
                    { time: '04:00 PM', title: 'Alumni General Meeting & Chapter Resolutions', desc: 'Discussion on alumni welfare fund, emergency medical trust, and future campus development.' },
                    { time: '06:00 PM', title: 'Grand Cultural Night & Concert', desc: 'Mega musical performances, comedy sketches, alumni doctor band performances, and gala fireworks.' },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                      <div className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-black whitespace-nowrap shrink-0">
                        {item.time}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">{item.title}</h4>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: GALLERY & POSTERS */}
          {activeTab === 'gallery' && (
            <div className="space-y-6">
              <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-black text-base text-slate-900 dark:text-white">Official Event Artwork & Rally Moments</h3>
                    <p className="text-xs text-slate-500">Click any image to view in high resolution</p>
                  </div>
                  <span className="text-xs font-bold text-slate-400">4 Official Assets</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {eventPhotos.map((photo, idx) => (
                    <div
                      key={idx}
                      onClick={() => setSelectedPhoto(photo.src)}
                      className="group relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 aspect-[4/3] cursor-pointer shadow-sm hover:shadow-md transition-all"
                    >
                      <img
                        src={photo.src}
                        alt={photo.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute top-2.5 left-2.5">
                        <span className="px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-wider">
                          {photo.tag}
                        </span>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent flex flex-col justify-end p-4 text-white">
                        <h4 className="font-bold text-sm leading-tight text-white">{photo.title}</h4>
                        <p className="text-xs text-slate-200 mt-0.5 line-clamp-1">{photo.subtitle}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: REGISTRATION INFO */}
          {activeTab === 'registration' && (
            <div className="p-6 sm:p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Delegate Registration Tiers</h3>
                <p className="text-xs text-slate-500 mt-1">Registration includes 2-day event passes, kit bag, commemorative polo shirt, banquets, and official souvenir.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl border-2 border-blue-500/80 bg-blue-50/50 dark:bg-blue-950/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-blue-700 dark:text-blue-300">Alumnus Doctor</span>
                    <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold">Standard</span>
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">Delegate Pass</div>
                  <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 pt-1">
                    <li className="flex items-center gap-1.5">✓ 2-Day Full Access (Nov 4 & 5)</li>
                    <li className="flex items-center gap-1.5">✓ Welcome Kit & Commemorative Shirt</li>
                    <li className="flex items-center gap-1.5">✓ Both Day Banquets & Feast</li>
                    <li className="flex items-center gap-1.5">✓ Official Souvenir Copy</li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => setIsRegisterModalOpen(true)}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                  >
                    Register Now
                  </button>
                </div>

                <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-slate-600 dark:text-slate-400">Current Student / Intern</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold">Discounted</span>
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">Student Pass</div>
                  <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 pt-1">
                    <li className="flex items-center gap-1.5">✓ Valid for SZMC Enrolled Students</li>
                    <li className="flex items-center gap-1.5">✓ Official Rally & Campus Access</li>
                    <li className="flex items-center gap-1.5">✓ Both Day Banquets & Kit</li>
                    <li className="flex items-center gap-1.5">✓ Scientific Session Attendance</li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => setIsRegisterModalOpen(true)}
                    className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs shadow-sm transition-all cursor-pointer"
                  >
                    Register as Student
                  </button>
                </div>

                <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-amber-600 dark:text-amber-400">Spouse / Family Guest</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold">Add-on</span>
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">Guest Pass</div>
                  <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 pt-1">
                    <li className="flex items-center gap-1.5">✓ Accompanying Doctor&apos;s Family</li>
                    <li className="flex items-center gap-1.5">✓ Grand Mezban Feast & Banquets</li>
                    <li className="flex items-center gap-1.5">✓ Evening Cultural Concert</li>
                    <li className="flex items-center gap-1.5">✓ Special Family Lounge Access</li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => setIsRegisterModalOpen(true)}
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
                  >
                    Add Guest Pass
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Dedicated Events Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          {/* Events Sidebar Widget 1: Event at a Glance */}
          <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <h3 className="font-black text-sm uppercase tracking-wider text-slate-900 dark:text-white">
                Events Sidebar Summary
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="font-bold text-slate-400 uppercase text-[10px]">Headline Event</span>
                <p className="font-black text-sm text-blue-600 dark:text-blue-400">SZMC DAY 2026</p>
                <p className="text-slate-600 dark:text-slate-300 font-medium">Annual Grand Homecoming & 34th Anniversary</p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="font-bold text-slate-400 uppercase text-[10px]">Event Dates</span>
                <p className="font-bold text-slate-900 dark:text-white">November 4 & 5, 2026</p>
                <p className="text-slate-500 text-[11px]">Wednesday & Thursday</p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="font-bold text-slate-400 uppercase text-[10px]">Campus Location</span>
                <p className="font-bold text-slate-900 dark:text-white">Silimpur, Bogura, Bangladesh</p>
                <p className="text-slate-500 text-[11px]">College Grounds, Central Auditorium & Mezban Field</p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="font-bold text-slate-400 uppercase text-[10px]">Theme Motto</span>
                <p className="font-serif italic font-bold text-slate-900 dark:text-slate-100">
                  &ldquo;এসো স্মৃতির প্রাঙ্গণে মিলি প্রীতির বন্ধনে&rdquo;
                </p>
                <p className="text-slate-500 text-[10px]">— মোরা শহীদজিয়াকিয়ান</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsRegisterModalOpen(true)}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Ticket className="w-4 h-4" />
              <span>Register Online</span>
            </button>
          </div>

          {/* Events Sidebar Widget 2: Event Gallery Preview with user posters */}
          <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
            <h3 className="font-black text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Event Posters & Announcements
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {eventPhotos.map((p, idx) => (
                <div
                  key={idx}
                  onClick={() => setSelectedPhoto(p.src)}
                  className="relative rounded-xl overflow-hidden aspect-square border border-slate-200 dark:border-slate-700 cursor-pointer group"
                >
                  <img
                    src={p.src}
                    alt={p.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors" />
                </div>
              ))}
            </div>
          </div>

          {/* Events Sidebar Widget 3: Organizing Committee & Helpline */}
          <div className="p-5 sm:p-6 bg-gradient-to-br from-slate-900 to-blue-950 text-white rounded-3xl border border-blue-900/40 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-black uppercase">
              <ShieldCheck className="w-4 h-4" />
              <span>Fraternal Secretariat</span>
            </div>
            <h4 className="font-black text-sm text-white">Need Registration Support?</h4>
            <p className="text-xs text-blue-200/80 leading-relaxed">
              Contact your Batch Delegate coordinator or reach out to the SZMC Alumni Secretariat desk for accommodation and guest pass assistance.
            </p>
            <div className="text-[11px] text-blue-300 space-y-1 pt-1 font-mono">
              <p>📍 Secretariat: SZMC Alumni Office, Silimpur</p>
              <p>📧 Email: szmcday2026@alumni.szmc.ac.bd</p>
            </div>
          </div>
        </div>
      </div>

      {/* REGISTRATION MODAL */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-xl text-blue-600 dark:text-blue-400">
                  <Ticket className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-900 dark:text-white">Register for SZMC DAY 2026</h3>
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-bold">4th & 5th November, 2026</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRegisterModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {regSubmitted ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h4 className="text-lg font-black text-slate-900 dark:text-white">Registration Received!</h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 max-w-sm mx-auto">
                  Welcome to SZMC DAY 2026! We look forward to seeing you at Silimpur Campus on November 4 & 5. A confirmation has been registered to your profile.
                </p>
              </div>
            ) : (
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Full Name & Title
                  </label>
                  <input
                    type="text"
                    required
                    value={regForm.name}
                    onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Dr. Mahfuzur Rahman"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Batch (01–35)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={35}
                      required
                      value={regForm.batchYear}
                      onChange={(e) => setRegForm({ ...regForm, batchYear: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      T-Shirt Size
                    </label>
                    <select
                      value={regForm.tshirtSize}
                      onChange={(e) => setRegForm({ ...regForm, tshirtSize: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="M">Medium (M)</option>
                      <option value="L">Large (L)</option>
                      <option value="XL">Extra Large (XL)</option>
                      <option value="XXL">XXL</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Mobile Number
                    </label>
                    <input
                      type="tel"
                      required
                      value={regForm.phone}
                      onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="01XXXXXXXXX"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Accompanying Guests
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={5}
                      value={regForm.guestCount}
                      onChange={(e) => setRegForm({ ...regForm, guestCount: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Attending Program
                  </label>
                  <select
                    value={regForm.attendingDays}
                    onChange={(e) => setRegForm({ ...regForm, attendingDays: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Both Days (4th & 5th November)">Both Days (4th & 5th November) — Recommended</option>
                    <option value="Day 1 Only (4th November)">Day 1 Only (4th November: Rally & Homecoming)</option>
                    <option value="Day 2 Only (5th November)">Day 2 Only (5th November: CME Gala & Feast)</option>
                  </select>
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsRegisterModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                  >
                    Confirm Registration
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* FULL-SCREEN PHOTO LIGHTBOX */}
      {selectedPhoto && (
        <div
          onClick={() => setSelectedPhoto(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-pointer animate-fade-in"
        >
          <div className="relative max-w-4xl max-h-[92vh] overflow-hidden rounded-2xl">
            <img
              src={selectedPhoto}
              alt="SZMC DAY Poster Enlarge"
              className="w-full h-full object-contain max-h-[90vh] rounded-2xl shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-3 right-3 p-2 rounded-full bg-black/70 hover:bg-rose-600 text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
export default EventsView;
