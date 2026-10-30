import { AlumniProfile, PostItem, NotificationItem, BatchSummary } from '../types';
import campusHeroImg from '../assets/images/ndc_campus_hero_1790233370828.jpg';

export const PROFILES_STORAGE_KEY = 'ndc_alumni_profiles';
export const POSTS_STORAGE_KEY = 'ndc_alumni_posts';

export const SEED_ALUMNI_PROFILES: AlumniProfile[] = [];

/**
 * Load persisted alumni profiles from local storage.
 * Filters out legacy demo records (id 101 to 116) so only real user registrations appear.
 */
export const loadStoredAlumniProfiles = (): AlumniProfile[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter(
          (p) =>
            p &&
            p.id &&
            !(p.id >= 101 && p.id <= 120) &&
            !(p.id >= 1001 && p.id <= 1006) &&
            !(p.id >= 800000 && p.id <= 999999)
        );
      }
    }
  } catch (e) {
    console.warn("Failed to load alumni profiles from storage", e);
  }
  return [];
};

/**
 * Save registered alumni profiles into persistent storage.
 */
export const saveStoredAlumniProfiles = (profiles: AlumniProfile[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
  } catch (e) {
    console.warn('Failed to save alumni profiles to storage', e);
  }
};

/**
 * Fallback empty user structure used when no user is signed in yet.
 */
export const DEFAULT_BLANK_USER: AlumniProfile = {
  id: 0,
  userId: 0,
  fullName: 'SZMC Alumnus',
  avatarUrl: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=200&auto=format&fit=crop&q=80',
  coverUrl: campusHeroImg,
  batchYear: 20,
  session: 'MBBS',
  group: 'MBBS',
  collegeRoll: '',
  profession: 'Medical Doctor / Physician',
  position: '',
  institution: 'Shaheed Ziaur Rahman Medical College Hospital, Bogura',
  specialty: [],
  degree: ['MBBS'],
  city: 'Bogura',
  country: 'Bangladesh',
  isPublic: true,
  online: false,
  lastSeen: 'Now',
  postsCount: 0,
  badges: ['SZMCian'],
  bio: '',
};

// Aliased for backward compatibility in imports
export const CURRENT_USER: AlumniProfile = DEFAULT_BLANK_USER;

/**
 * Active alumni profiles list.
 * Initialized from storage (starts empty [] so real users can add real data).
 */
export const ALUMNI_PROFILES: AlumniProfile[] = loadStoredAlumniProfiles();

export const INITIAL_POSTS: PostItem[] = [];

// Shaheed Ziaur Rahman Medical College (SZMC Bogura) MBBS Batches (Est. 1992, Batches 1 to 35, Session 1991-92 onwards)
const SPECIAL_BATCH_NOTES: Record<number, { note: string }> = {
  1: { note: 'Pioneer MBBS Batch (SZMC-01, Session 1991-92)' },
  5: { note: '5th Batch (SZMC-05, Session 1995-96)' },
  10: { note: '10th Milestone Batch (SZMC-10, Session 2000-01)' },
  15: { note: '15th Batch (SZMC-15, Session 2005-06)' },
  20: { note: '20th Batch (SZMC-20, Session 2010-11)' },
  25: { note: 'Silver Jubilee Batch (SZMC-25, Session 2015-16)' },
  30: { note: '30th Batch (SZMC-30, Session 2020-21)' },
  35: { note: 'Current MBBS Session (SZMC-35, Session 2025-26)' },
};

export const BATCH_LIST: BatchSummary[] = Array.from({ length: 35 }, (_, idx) => {
  const batchNum = idx + 1;
  const startYear = 1990 + batchNum; // 1991 for batch 1 (Session 1991-92), 2025 for batch 35 (Session 2025-26)
  const sessionEndYear = startYear + 1;
  const sessionEndShort = String(sessionEndYear).slice(-2);
  const special = SPECIAL_BATCH_NOTES[batchNum];

  return {
    batchYear: batchNum,
    session: `${startYear}-${sessionEndShort}`,
    total: null,
    representative: `SZMC-${batchNum < 10 ? '0' + batchNum : batchNum} Coordinator`,
    specialNote: special?.note,
  };
});

export const NOTIFICATIONS_LIST: NotificationItem[] = [];
