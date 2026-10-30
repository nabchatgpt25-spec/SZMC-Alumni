import { notifyCareerApplication } from '../utils/notificationService';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

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

let isCareersSyncing = false;
async function syncCareersWithBackend() {
  if (isCareersSyncing) return;
  isCareersSyncing = true;
  try {
    let remoteData: any[] | null = null;
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('career_opportunities')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          remoteData = data.map((c: any) => ({
            id: String(c.id),
            title: c.title,
            company: c.company,
            location: c.location,
            type: c.type,
            description: c.description,
            posterId: Number(c.poster_id),
            posterName: c.poster_name,
            posterBatch: c.poster_batch,
            posterAvatar: c.poster_avatar,
            posterEmail: c.poster_email,
            status: c.status,
            applicants: Array.isArray(c.applicants) ? c.applicants : [],
            createdAt: c.created_at,
          }));
        }
      } catch {}
    }

    if (!remoteData) {
      const resp = await fetch('/api/careers');
      if (resp.ok) {
        const json = await resp.json();
        if (Array.isArray(json.opportunities) && json.opportunities.length > 0) {
          remoteData = json.opportunities;
        }
      }
    }

    if (remoteData && remoteData.length > 0) {
      const current = loadCareerOpportunities();
      const map = new Map<string, CareerOpportunity>();
      remoteData.forEach((opp) => map.set(opp.id, opp));
      current.forEach((opp) => {
        if (!map.has(opp.id)) map.set(opp.id, opp);
      });
      const merged = Array.from(map.values());
      localStorage.setItem(CAREER_STORAGE_KEY, JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent('careers_updated', { detail: merged }));
    }
  } catch (err) {
    console.warn('Career sync notice:', err);
  } finally {
    isCareersSyncing = false;
  }
}

export const loadCareerOpportunities = (): CareerOpportunity[] => {
  if (typeof window === 'undefined') return INITIAL_CAREER_OPPORTUNITIES;
  void syncCareersWithBackend();

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

  // Asynchronously persist to Supabase & Backend proxy
  const payload = {
    id: tempId,
    title: data.title,
    company: data.company,
    location: data.location,
    type: data.type,
    description: data.description,
    posterId: data.posterId,
    posterName: data.posterName,
    posterBatch: data.posterBatch,
    posterAvatar: data.posterAvatar,
    posterEmail: data.posterEmail,
  };

  (async () => {
    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from('career_opportunities')
          .insert({
            id: tempId,
            title: payload.title,
            company: payload.company,
            location: payload.location,
            type: payload.type,
            description: payload.description,
            poster_id: payload.posterId,
            poster_name: payload.posterName,
            poster_batch: payload.posterBatch,
            poster_avatar: payload.posterAvatar,
            poster_email: payload.posterEmail,
            status: 'active',
            applicants: [],
          });
        if (!error) return;
      } catch {}
    }

    try {
      await fetch('/api/careers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.warn('Backend proxy create career notice:', e);
    }
  })();

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

  // Asynchronously persist application to Supabase & Backend proxy
  const payload = {
    applicantId: applicant.applicantId,
    applicantName: applicant.applicantName,
    applicantBatch: applicant.applicantBatch,
    applicantAvatar: applicant.applicantAvatar,
    applicantEmail: applicant.applicantEmail,
    applicantPhone: applicant.applicantPhone,
  };

  fetch(`/api/careers/${encodeURIComponent(opportunityId)}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((e) => console.warn('Backend proxy apply career notice:', e));

  if (target.posterId && target.posterId > 0) {
    notifyCareerApplication({
      posterId: target.posterId,
      jobTitle: target.title,
      company: target.company,
      actor: {
        id: applicant.applicantId,
        fullName: applicant.applicantName,
        avatarUrl: applicant.applicantAvatar,
      },
    });
  }

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

  // Persist deletion to Supabase
  fetch(`/api/careers/${encodeURIComponent(opportunityId)}`, {
    method: 'DELETE',
  }).catch((e) => console.warn('Backend proxy delete career notice:', e));

  return true;
};

