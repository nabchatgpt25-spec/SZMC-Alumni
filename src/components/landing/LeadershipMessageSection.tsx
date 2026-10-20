import React from 'react';
import { Quote, Award, ShieldCheck, HeartHandshake } from 'lucide-react';
import { NDCLogo } from '../NDCLogo';

export const LeadershipMessageSection: React.FC = () => {
  return (
    <section className="py-16 bg-gradient-to-b from-white to-slate-50 dark:from-slate-900 dark:to-slate-950 border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider mb-3">
            <Award className="w-3.5 h-3.5" />
            <span>INSTITUTIONAL LEADERSHIP CORNER</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            Messages from the College Patron & Alumni President
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            Guided by dedication to clinical excellence, medical ethics, and compassionate patient care since 1992.
          </p>
        </div>

        {/* Dual Leadership Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Card 1: Principal & Chief Patron */}
          <div className="relative rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-6 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-black/40 flex flex-col justify-between">
            <div className="absolute top-6 right-6 text-blue-100 dark:text-slate-800 pointer-events-none">
              <Quote className="w-16 h-16 opacity-40" />
            </div>

            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="relative w-20 h-20 rounded-2xl overflow-hidden ring-4 ring-blue-500/20 shadow-md shrink-0 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <img
                    src="https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=250&q=80"
                    alt="Principal, Shaheed Ziaur Rahman Medical College"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-blue-700 p-0.5 border border-white dark:border-slate-900 flex items-center justify-center">
                    <NDCLogo className="w-full h-full" />
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                    CHIEF PATRON & PRINCIPAL
                  </div>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white leading-tight">
                    Prof. Dr. Md. Rezaul Alam
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Principal, Shaheed Ziaur Rahman Medical College, Bogura
                  </p>
                </div>
              </div>

              <div className="relative z-10 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-3">
                <p>
                  "Shaheed Ziaur Rahman Medical College was founded in 1992 with the mission to cultivate compassionate, skilled physicians who serve society with medical excellence and integrity."
                </p>
                <p>
                  "Our alumni represent our greatest pride. Whether you practice in primary healthcare complexes, tertiary hospitals across Bangladesh, or international medical centres, you uphold the noble healing mission of SZMC. We warmly invite all 35 batches to remain united and support junior doctors through our clinical welfare and research endowments."
                </p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Office of the Principal, SZMC Campus, Bogura</span>
              </div>
              <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
                Directorate General of Medical Education
              </span>
            </div>
          </div>

          {/* Card 2: Alumni President */}
          <div className="relative rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-6 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-black/40 flex flex-col justify-between">
            <div className="absolute top-6 right-6 text-blue-100 dark:text-slate-800 pointer-events-none">
              <Quote className="w-16 h-16 opacity-40" />
            </div>

            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="relative w-20 h-20 rounded-2xl overflow-hidden ring-4 ring-blue-500/20 shadow-md shrink-0 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <img
                    src="https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=250&q=80"
                    alt="Prof. Dr. Tariqul Islam, SZMC-01"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-amber-500 p-0.5 border border-white dark:border-slate-900 flex items-center justify-center">
                    <NDCLogo className="w-full h-full" />
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                    PRESIDENT, CENTRAL COMMITTEE
                  </div>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white leading-tight">
                    Prof. Dr. Tariqul Islam, FCPS
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    SZMC Pioneer Batch 01 (1992) • Professor of Surgery
                  </p>
                </div>
              </div>

              <div className="relative z-10 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-3">
                <p>
                  "Dearest Colleagues and Doctors, whether you entered the anatomy halls in 1992 or completed your internship in 2026, our medical fraternity remains unbreakable. The Shaheed Ziaur Rahman Medical College Alumni Association is your bridge to lifelong friendship, clinical collaboration, and mutual support."
                </p>
                <p>
                  "We have formalized the digital membership system to give every SZMC doctor a verifiable digital identity and rapid access to benevolent support and blood donation coordination. I invite all alumni across the globe to connect on this network."
                </p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <HeartHandshake className="w-4 h-4 text-blue-600" />
                <span>Central Executive Committee, SZMCAA</span>
              </div>
              <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
                Fraternity • Service • Honor
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
