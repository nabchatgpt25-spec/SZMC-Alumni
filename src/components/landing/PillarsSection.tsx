import React from 'react';
import {
  GraduationCap,
  HeartHandshake,
  ShieldCheck,
  Building2,
  Users,
  Compass,
  Sparkles,
  BookOpen
} from 'lucide-react';

export const PillarsSection: React.FC = () => {
  const pillars = [
    {
      icon: GraduationCap,
      title: 'Clinical Mentorship & Post-Grad Guidance',
      description:
        'Specialty guidance, post-graduate entrance (FCPS, MD/MS, MRCP, USMLE, PLAB), and hospital rotations guided by senior SZMC consultants.',
      color: 'blue',
      badge: 'Clinical Excellence',
    },
    {
      icon: BookOpen,
      title: 'Evidence-Based Medicine & Scientific Enquiry',
      description:
        'Advancing clinical research, medical journals, CME symposiums, case studies, and healthcare innovation across medical specialties.',
      color: 'indigo',
      badge: 'Medical Science',
    },
    {
      icon: HeartHandshake,
      title: '24/7 Doctor Blood Network & Mutual Aid',
      description:
        'Rapid emergency blood donor coordination across hospitals, doctor benevolent welfare, and crisis support for alumni and families.',
      color: 'rose',
      badge: 'Healers United',
    },
    {
      icon: Building2,
      title: 'SZMC Heritage & 35 Batch Lounges',
      description:
        'Connecting all 35 MBBS batches from Pioneer Batch 01 (1992) to Batch 35, hospital memories, ward duty stories, and lifelong batch camaraderie.',
      color: 'emerald',
      badge: '35 Batches Heritage',
    },
  ];

  return (
    <section className="py-16 sm:py-20 max-w-7xl mx-auto px-4 sm:px-6">
      <div className="text-center max-w-3xl mx-auto mb-12">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider mb-3">
          <Compass className="w-3.5 h-3.5" />
          <span>Our Guiding Principles</span>
        </div>
        <h2 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
          Four Pillars of the SZMC Medical Fraternity
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2 font-normal">
          Dedicated to the noble oath of healing — empowering every graduate doctor to practice with integrity, competence, and compassionate service.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {pillars.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <div
              key={pillar.title}
              className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 flex flex-col justify-between hover:border-blue-500/80 dark:hover:border-blue-500/80 hover:shadow-lg transition-all"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {pillar.badge}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                  {pillar.title}
                </h3>

                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {pillar.description}
                </p>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Active Network Program</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
