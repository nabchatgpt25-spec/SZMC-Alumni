import React from 'react';
import {
  MessageSquare,
  Sparkles,
  GraduationCap,
  ShieldCheck,
  Quote
} from 'lucide-react';

export const TestimonialsSection: React.FC = () => {
  const testimonials = [
    {
      quote:
        'Walking onto the Silimpur campus back in 1992 as the pioneer MBBS batch, the clinical rounds, dissections, and mentorship shaped our medical journeys. Today, across hospitals in Bangladesh and the globe, the SZMC fraternity remains our greatest strength.',
      author: 'Prof. Dr. Tariqul Islam',
      batch: 'SZMC Batch 01 (1992)',
      role: 'Professor & Head of Surgery, SZMCH Bogura',
      degrees: 'MBBS (SZMC-01), FCPS, MS',
      avatar: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=200&auto=format&fit=crop&q=80',
    },
    {
      quote:
        'Whenever a younger SZMCian reaches out for PLAB, MRCP, or NHS clinical attachment advice, I see myself years ago. This portal bridges oceans — no matter where you practice, your SZMC doctor family is just a tap away.',
      author: 'Dr. Mahbubur Rahman',
      batch: 'SZMC Batch 01',
      role: 'Consultant Cardiologist, Barts Health NHS Trust, London',
      degrees: 'MBBS (SZMC-01), MRCP (UK), FRCP (Edin)',
      avatar: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=200&auto=format&fit=crop&q=80',
    },
    {
      quote:
        'The camaraderie forged during night duties at SZMCH wards, emergency triages, and clinical societies never fades. From post-grad residency to specialist consulting, our SZMC seniors and peers are always there with support and guidance.',
      author: 'Dr. Sadia Afrin',
      batch: 'SZMC Batch 10',
      role: 'Associate Professor of Radiology, DMCH',
      degrees: 'MBBS (SZMC-10), MD (Radiology)',
      avatar: 'https://images.unsplash.com/photo-1594824813593-617a80b85a3c?w=200&auto=format&fit=crop&q=80',
    },
  ];

  return (
    <section className="py-16 sm:py-20 bg-slate-100/60 dark:bg-slate-900/30 border-t border-slate-200/80 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider mb-3">
            <Quote className="w-3.5 h-3.5" />
            <span>Voices of SZMC</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            Reflections from Our Doctor Alumni
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2">
            Hear what our senior professors, NHS consultants, and specialist clinicians say about our shared heritage.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((item) => (
            <div
              key={item.author}
              className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-7 shadow-xs flex flex-col justify-between"
            >
              <div>
                <Quote className="w-8 h-8 text-blue-500/30 mb-4" />
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed italic mb-6">
                  "{item.quote}"
                </p>
              </div>

              <div className="flex items-center gap-3.5 pt-4 border-t border-slate-100 dark:border-slate-800">
                <img
                  src={item.avatar}
                  alt={item.author}
                  className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs font-black text-slate-900 dark:text-white truncate">
                      {item.author}
                    </h4>
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  </div>
                  <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 truncate">
                    {item.role}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    {item.batch} • {item.degrees}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
