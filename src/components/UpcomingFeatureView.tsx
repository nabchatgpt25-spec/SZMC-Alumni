import React, { useState } from 'react';
import {
  Building2,
  GraduationCap,
  Newspaper,
  Calendar,
  Briefcase,
  HeartHandshake,
  Clock,
  BellRing,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Users
} from 'lucide-react';

export type UpcomingFeatureType =
  | 'institutions'
  | 'mentorship'
  | 'news'
  | 'events'
  | 'careers'
  | 'emergency';

interface UpcomingFeatureViewProps {
  type: UpcomingFeatureType;
  onNavigate?: (tab: string) => void;
}

interface FeatureMeta {
  title: string;
  subtitle: string;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  highlights: { title: string; desc: string; icon: string }[];
  timeline: string;
  targetAudience: string;
}

const INSTITUTIONS_CONFIG: FeatureMeta = {
  title: 'Hospitals & Healthcare Directory',
  subtitle: 'Alumni-led tertiary hospitals, medical colleges, research clinics & healthcare organizations',
  badge: 'SOON',
  icon: Building2,
  description:
    'A verified registry of premier tertiary hospitals, medical college departments, specialized healthcare institutes, and health organizations where Shaheed Ziaur Rahman Medical College (SZMC) alumni serve in leadership and clinical positions.',
  timeline: 'Q3 2026',
  targetAudience: 'Doctors seeking clinical referrals, department coordination, and medical research collaboration',
  highlights: [
    {
      title: 'Clinical & Department Leadership',
      desc: 'Direct contact info of SZMC doctors leading surgery, medicine, pediatrics, cardiology, and administrative divisions.',
      icon: '🏥',
    },
    {
      title: 'Global Doctors Chapter Connect',
      desc: 'Find alumni at NHS UK, Johns Hopkins, Harvard Medical, BSMMU, DMCH, and top health centers globally.',
      icon: '🌍',
    },
    {
      title: 'Clinical Research Partnerships',
      desc: 'Facilitating collaborative medical studies, clinical trials, and multi-center epidemiological research.',
      icon: '🤝',
    },
    {
      title: 'Alumni Doctor Privileges',
      desc: 'Professional consultation referral networks and expedited care coordination for alumni families.',
      icon: '🩺',
    },
  ],
};

const FEATURE_CONFIGS: Record<UpcomingFeatureType, FeatureMeta> = {
  institutions: INSTITUTIONS_CONFIG,
  mentorship: {
    title: 'SZMC Medical Mentorship Network',
    subtitle: 'Guiding the next generation of doctors through post-grad training & clinical practice',
    badge: 'SOON',
    icon: GraduationCap,
    description:
      'Connect fresh MBBS graduates and intern doctors with senior alumni professors, consultants, BCS Health specialists, and overseas fellows for higher clinical training and residency guidance.',
    timeline: 'Launching Soon',
    targetAudience: 'Medical students, intern doctors, and early-career medical officers',
    highlights: [
      {
        title: '1-on-1 Clinical Mentorship',
        desc: 'Pair with experienced specialists based on your field (Surgery, Medicine, Pediatrics, Gynae, Ortho, etc.).',
        icon: '🤝',
      },
      {
        title: 'Global Residency & Fellowship Pathways',
        desc: 'MRCP, MRCS, USMLE, PLAB, AMC exam masterclasses led by alumni practicing in the UK, USA, and Australia.',
        icon: '✈️',
      },
      {
        title: 'FCPS & MD/MS Entrance Guidance',
        desc: 'Proven BCPS and university residency entrance strategies, question reviews, and clinical mock exams.',
        icon: '📚',
      },
      {
        title: 'Clinical Case Discussions & CME',
        desc: 'Participate in weekly grand rounds, diagnostic dilemmas, and journal club discussions with senior faculty.',
        icon: '🔬',
      },
    ],
  },
  news: {
    title: 'SZMC Medical Gazette & News',
    subtitle: 'Campus milestones, clinical research & alumni doctor achievements',
    badge: 'SOON',
    icon: Newspaper,
    description:
      'The central publication hub for Shaheed Ziaur Rahman Medical College Alumni. Read official notices, scientific publications, medical camp updates, doctor honors, and inspiring campus memories.',
    timeline: 'Next Release',
    targetAudience: 'All 35 SZMC MBBS batches, medical college faculty, and healthcare colleagues',
    highlights: [
      {
        title: 'Medical College & Hospital Updates',
        desc: 'Academic milestones, clinical ward updates, and Principal office notices from SZMC Bogura.',
        icon: '📰',
      },
      {
        title: 'Doctor Spotlights & Awards',
        desc: 'In-depth interviews with SZMC alumni receiving national fellowships, research honors, and clinical accolades.',
        icon: '🌟',
      },
      {
        title: 'Clinical Perspectives & Case Reports',
        desc: 'Interesting clinical case vignettes and essays on evidence-based healthcare and patient ethics.',
        icon: '✍️',
      },
      {
        title: 'Annual Reunion Souvenir Archive',
        desc: 'Downloadable PDF versions of batch yearbooks, scientific conference proceedings, and souvenir gazettes.',
        icon: '📑',
      },
    ],
  },
  events: {
    title: 'Alumni Conferences & Grand Reunions',
    subtitle: 'Scientific symposiums, batch reunions, CME conferences & sports carnivals',
    badge: 'SOON',
    icon: Calendar,
    description:
      'Stay updated on upcoming Grand Reunions, annual scientific conferences at SZMC Campus Bogura, overseas doctor chapters, and inter-batch tournaments.',
    timeline: 'Annual Calendar 2026',
    targetAudience: 'All registered SZMC doctors and students from Batch 01 to Batch 35',
    highlights: [
      {
        title: 'SZMC Grand Reunion 2026',
        desc: 'Registration, souvenir bookings, and delegate credentials for the annual gala at Silimpur campus.',
        icon: '🎉',
      },
      {
        title: 'Annual Scientific CME Conference',
        desc: 'Accredited continuing medical education seminars and clinical workshops led by visiting alumni.',
        icon: '🔬',
      },
      {
        title: 'Global Doctor Chapter Meetups',
        desc: 'Regional reunions organized by SZMC UK, North America, Australia, and Middle East chapters.',
        icon: '📍',
      },
      {
        title: 'Inter-Batch Doctors Sports Tournament',
        desc: 'Annual cricket, badminton, and football championships among batch teams from Batch 01 to Batch 35.',
        icon: '🏆',
      },
    ],
  },
  careers: {
    title: 'SZMC Doctor Opportunities & Career Board',
    subtitle: 'Consultant openings, residency slots, registrar vacancies & overseas placements',
    badge: 'SOON',
    icon: Briefcase,
    description:
      'An exclusive career and clinical placement board for the SZMC fraternity. Discover openings across tertiary hospitals, research centers, health organizations, and overseas clinical positions.',
    timeline: 'Q3 2026',
    targetAudience: 'Graduated doctors seeking specialist placements and clinical career transitions',
    highlights: [
      {
        title: 'Hospital & Clinic Openings',
        desc: 'Verified clinical vacancies from alumni-led hospitals, corporate medical groups, and diagnostic centers.',
        icon: '💼',
      },
      {
        title: 'Intern & Trainee Attachments',
        desc: 'Honorary medical officer (HMO) and clinical fellowship opportunities with top consultants.',
        icon: '🎓',
      },
      {
        title: 'Direct Colleague Referrals',
        desc: 'Get recommended directly by fellow SZMC doctors working inside healthcare institutions.',
        icon: '⭐',
      },
      {
        title: 'HealthTech & Research Opportunities',
        desc: 'Collaborate with digital health initiatives, telemedicine startups, and epidemiological bodies.',
        icon: '🚀',
      },
    ],
  },
  emergency: {
    title: 'Doctor Mutual Aid & Welfare Network',
    subtitle: 'Physician emergency relief, crisis aid & alumni welfare fund',
    badge: 'SOON',
    icon: HeartHandshake,
    description:
      'A collegiate mutual aid network designed to assist SZMC doctors, students, and their families in times of unexpected health crises, medical hardship, or emergency need.',
    timeline: 'Emergency Desk Active',
    targetAudience: 'Any SZMC alumnus, medical student, or family member needing urgent assistance',
    highlights: [
      {
        title: 'Fraternal Emergency Registry',
        desc: 'Rapid emergency support network among verified alumni chapters worldwide.',
        icon: '⚡',
      },
      {
        title: 'Legal & Advisory Assistance Desk',
        desc: 'Connect with senior alumni advocates, legal consultants, and administrative experts during family emergencies.',
        icon: '⚖️',
      },
      {
        title: 'Fr. Timm Alumni Welfare Fund',
        desc: 'Discretionary emergency assistance for alumni facing hardship or distress.',
        icon: '🛡️',
      },
      {
        title: 'Disaster Relief Cell',
        desc: 'Coordinating emergency relief mobilization during national flood and humanitarian crises.',
        icon: '🤝',
      },
    ],
  },
};

export const UpcomingFeatureView: React.FC<UpcomingFeatureViewProps> = ({ type, onNavigate }) => {
  const meta = FEATURE_CONFIGS[type];
  const Icon = meta.icon;

  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleNotifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubscribed(true);
    setTimeout(() => {
      setEmail('');
    }, 4000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Banner Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 text-white p-6 sm:p-8 shadow-lg border border-blue-500/20">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{meta.badge}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-white text-xs font-semibold">
              <Clock className="w-3.5 h-3.5 text-blue-200" />
              <span>Target: {meta.timeline}</span>
            </span>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shrink-0 shadow-inner">
              <Icon className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{meta.title}</h1>
              <p className="text-blue-100 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
                {meta.subtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
      </div>

      {/* Description & Overview */}
      <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            About This Upcoming Feature
          </h2>
          <p className="text-sm text-slate-700 dark:text-slate-300 mt-2 leading-relaxed">
            {meta.description}
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex items-center gap-3">
          <Users className="w-5 h-5 text-blue-600 shrink-0" />
          <div className="text-xs">
            <span className="font-bold text-slate-900 dark:text-slate-100">Intended For: </span>
            <span className="text-slate-600 dark:text-slate-400">{meta.targetAudience}</span>
          </div>
        </div>
      </div>

      {/* Feature Highlights Grid */}
      <div>
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 px-1">
          Planned Capabilities & Modules
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {meta.highlights.map((item, idx) => (
            <div
              key={idx}
              className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2"
            >
              <div className="text-2xl mb-1">{item.icon}</div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">{item.title}</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Email Notification Call-to-Action */}
      <div className="p-6 sm:p-8 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800/80 dark:to-slate-800/40 rounded-3xl border border-blue-100 dark:border-slate-700 space-y-4">
        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-bold text-xs uppercase tracking-wider">
          <BellRing className="w-4 h-4" />
          <span>Stay Updated</span>
        </div>
        <div>
          <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
            Be Notified When This Module Launches
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            Sign up to get early access notifications and contribute as a volunteer or chapter coordinator.
          </p>
        </div>

        {subscribed ? (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center gap-3 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>Thank you! You will be notified as soon as this feature goes live.</span>
          </div>
        ) : (
          <form onSubmit={handleNotifySubmit} className="flex flex-col sm:flex-row gap-2.5 max-w-md">
            <input
              type="email"
              required
              placeholder="Enter your email address..."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 px-4 py-2.5 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer whitespace-nowrap"
            >
              Notify Me
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
