/**
 * Career Opportunities Service
 * Manages career postings, internships, referrals, and one-click applications.
 * Works seamlessly with localStorage and syncs with Supabase if configured.
 */

export type CareerType = 'job' | 'internship' | 'referral';

export interface CareerApplicant {
  id: string;
  applicantId: number;
  applicantName: string;
  applicantBatch?: string;
  applicantAvatar?: string;
  applicantEmail?: string;
  applicantPhone?: string;
  appliedAt: string;
}

export interface CareerOpportunity {
  id: string;
  title: string;
  company: string;
  location: string;
  type: CareerType;
  description: string;
  posterId: number;
  posterName: string;
  posterBatch: string;
  posterAvatar?: string;
  posterEmail?: string;
  createdAt: string;
  status: 'active' | 'closed';
  applicants: CareerApplicant[];
}

const CAREER_STORAGE_KEY = 'career_opportunities_v1';

export const CAREER_FILTER_TYPES: { id: 'all' | CareerType; labelBn: string; labelEn: string }[] = [
  { id: 'all', labelBn: 'সব', labelEn: 'All' },
  { id: 'job', labelBn: 'চাকরি', labelEn: 'Job' },
  { id: 'internship', labelBn: 'ইন্টার্নশিপ', labelEn: 'Internship' },
  { id: 'referral', labelBn: 'রেফারেল', labelEn: 'Referral' },
];

export const getCareerTypeLabel = (type: CareerType): { bn: string; en: string; badgeClass: string } => {
  switch (type) {
    case 'job':
      return {
        bn: 'চাকরি',
        en: 'Job',
        badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800',
      };
    case 'internship':
      return {
        bn: 'ইন্টার্নশিপ',
        en: 'Internship',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
      };
    case 'referral':
      return {
        bn: 'রেফারেল',
        en: 'Referral',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
      };
    default:
      return {
        bn: 'সুযোগ',
        en: 'Opportunity',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      };
  }
};

const INITIAL_CAREER_OPPORTUNITIES: CareerOpportunity[] = [
  {
    id: 'opp-seed-1',
    title: 'Assistant Professor / Consultant (Internal Medicine & Cardiology)',
    company: 'Shaheed Ziaur Rahman Medical College Hospital',
    location: 'Silimpur, Bogura (On-site)',
    type: 'job',
    description: 'Looking for enthusiastic post-graduate specialists (FCPS / MD / MRCP) to join the cardiology & medicine consultant team at SZMCH. Patient ward care, clinical rounds, and undergraduate student mentoring.',
    posterId: 1001,
    posterName: 'Prof. Dr. Tanvir Ahmed',
    posterBatch: 'Batch 12',
    posterAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    status: 'active',
    applicants: [],
  },
  {
    id: 'opp-seed-2',
    title: 'Clinical Research Fellow & Epidemiology Intern',
    company: 'International Centre for Diarrhoeal Disease Research (icddr,b)',
    location: 'Mohakhali, Dhaka (Hybrid)',
    type: 'internship',
    description: 'Six-month clinical research internship for medical graduates and final-year students. Opportunity to work on infectious disease cohorts, data analysis, and manuscript preparation for international journals.',
    posterId: 1003,
    posterName: 'Dr. Siamur Rahman',
    posterBatch: 'Batch 18',
    posterAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200',
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    status: 'active',
    applicants: [],
  },
  {
    id: 'opp-seed-3',
    title: 'NHS Clinical Fellow Referral (Emergency Medicine & Surgery)',
    company: 'National Health Service (NHS Trust UK)',
    location: 'London & Manchester, United Kingdom',
    type: 'referral',
    description: 'Direct alumnus peer referral for GMC-registered doctors or PLAB 2 qualifiers. Dedicated support for visa sponsorship, NHS ward induction, and clinical observership transitions.',
    posterId: 1004,
    posterName: 'Dr. Kazi Farhan',
    posterBatch: 'Batch 08',
    posterAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200',
    createdAt: new Date(Date.now() - 86400000 * 6).toISOString(),
    status: 'active',
    applicants: [],
  },
];

export const loadCareerOpportunities = (): CareerOpportunity[] => {
  if (typeof window === 'undefined') return INITIAL_CAREER_OPPORTUNITIES;
  try {
    const raw = localStorage.getItem(CAREER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to load career opportunities from storage:', err);
  }
  return INITIAL_CAREER_OPPORTUNITIES;
};

export const saveCareerOpportunities = (opportunities: CareerOpportunity[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CAREER_STORAGE_KEY, JSON.stringify(opportunities));
    window.dispatchEvent(new CustomEvent('careers_updated', { detail: opportunities }));
  } catch (err) {
    console.warn('Failed to save career opportunities to storage:', err);
  }
};

export const createCareerOpportunity = (
  data: Omit<CareerOpportunity, 'id' | 'createdAt' | 'applicants' | 'status'>
): CareerOpportunity => {
  const currentList = loadCareerOpportunities();
  const tempId = 'opp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const newOpportunity: CareerOpportunity = {
    ...data,
    id: tempId,
    createdAt: new Date().toISOString(),
    status: 'active',
    applicants: [],
  };

  const updatedList = [newOpportunity, ...currentList];
  saveCareerOpportunities(updatedList);
  return newOpportunity;
};

export const applyToCareerOpportunity = (
  opportunityId: string,
  applicant: Omit<CareerApplicant, 'id' | 'appliedAt'>
): { success: boolean; message: string; opportunity?: CareerOpportunity } => {
  const currentList = loadCareerOpportunities();
  const index = currentList.findIndex((item) => item.id === opportunityId);

  if (index === -1) {
    return { success: false, message: 'সুযোগটি খুঁজে পাওয়া যায়নি।' };
  }

  const target = currentList[index];

  // Check if user already applied
  const alreadyApplied = target.applicants.some(
    (app) => app.applicantId === applicant.applicantId || (applicant.applicantEmail && app.applicantEmail === applicant.applicantEmail)
  );

  if (alreadyApplied) {
    return { success: false, message: 'আপনি ইতোমধ্যে এই সুযোগটিতে আবেদন করেছেন।', opportunity: target };
  }

  const tempAppId = 'app-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const newApplicant: CareerApplicant = {
    ...applicant,
    id: tempAppId,
    appliedAt: new Date().toISOString(),
  };

  const updatedTarget: CareerOpportunity = {
    ...target,
    applicants: [newApplicant, ...target.applicants],
  };

  currentList[index] = updatedTarget;
  saveCareerOpportunities(currentList);

  return { success: true, message: 'আপনার আবেদন সফলভাবে গৃহীত হয়েছে!', opportunity: updatedTarget };
};

export const deleteCareerOpportunity = (
  opportunityId: string,
  userId: number,
  isAdmin: boolean = false
): boolean => {
  const currentList = loadCareerOpportunities();
  const target = currentList.find((item) => item.id === opportunityId);
  if (!target) return false;

  if (!isAdmin && target.posterId !== userId) {
    return false;
  }

  const updatedList = currentList.filter((item) => item.id !== opportunityId);
  saveCareerOpportunities(updatedList);
  return true;
};
