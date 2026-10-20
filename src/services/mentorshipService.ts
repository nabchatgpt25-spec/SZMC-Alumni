import { MentorshipCategory, MentorshipRequest, MentorOffer, MentorshipAnswer } from '../types/mentorship';

const REQUESTS_STORAGE_KEY = 'mentorship_requests_v1';
const MENTORS_STORAGE_KEY = 'mentorship_mentors_v1';

export const MENTORSHIP_CATEGORIES: { id: MentorshipCategory; labelBn: string; labelEn: string; icon: string; descriptionBn: string }[] = [
  {
    id: 'Medical',
    labelBn: 'মেডিকেল',
    labelEn: 'Medical',
    icon: '🩺',
    descriptionBn: 'মেডিকেল ভর্তি, এমবিবিএস, এফসিপিএস ও স্বাস্থ্য ক্যাডার গাইডলাইন',
  },
  {
    id: 'Job',
    labelBn: 'চাকরি',
    labelEn: 'Job & Career',
    icon: '💼',
    descriptionBn: 'হাসপাতাল পদায়ন, বিসিএস স্বাস্থ্য, করপোরেট ও সরকারি জব প্রিপারেশন',
  },
  {
    id: 'Abroad',
    labelBn: 'উচ্চশিক্ষা ও বিদেশ',
    labelEn: 'Study Abroad',
    icon: '✈️',
    descriptionBn: 'ইউএসএমএলই, প্ল্যাব, এমআরসিপি, আইইএলটিএস ও বিদেশের রেসিডেন্সি',
  },
  {
    id: 'Degree',
    labelBn: 'বিশ্ববিদ্যালয় ও ডিগ্রি',
    labelEn: 'University & Degree',
    icon: '🎓',
    descriptionBn: 'এফসিপিএস, এমডি/এমএস, এমপিএইচ ও পোস্ট-গ্রাজুয়েট ডিগ্রি নির্বাচন',
  },
  {
    id: 'Business',
    labelBn: 'উদ্যোক্তা ও স্বাস্থ্য ব্যবসা',
    labelEn: 'Business & Startup',
    icon: '🚀',
    descriptionBn: 'হাসপাতাল/ডায়াগনস্টিক সেন্টার, হেলথটেক স্টার্টআপ ও ম্যানেজমেন্ট',
  },
];

const INITIAL_MENTOR_OFFERS: MentorOffer[] = [
  {
    id: 'mentor-seed-1',
    userId: 1001,
    fullName: 'Prof. Dr. Tanvir Ahmed',
    batchYear: 12,
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200',
    category: 'Medical',
    expertise: 'FCPS (Part 1 & 2 Medicine), Cardiology Residency',
    shortDescription: 'SZMC Batch 12 Alumnus. Happy to guide interns and junior doctors on post-graduation strategy, internal medicine ward clinical exams, and BCPS protocol.',
    institution: 'Shaheed Ziaur Rahman Medical College Hospital',
    position: 'Associate Professor & Consultant',
    contactPreference: 'হোয়াটসঅ্যাপ / মেসেজ',
    createdAt: '2026-02-15',
  },
  {
    id: 'mentor-seed-2',
    userId: 1003,
    fullName: 'Dr. Siamur Rahman',
    batchYear: 18,
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200',
    category: 'Abroad',
    expertise: 'PLAB 1 & 2, GMC Registration, NHS Clinical Fellow Transition',
    shortDescription: 'Currently practicing in Manchester, UK. Can mentor on UK GMC licensing, NHS interview technique, clinical audit prep, and Tier 2 visa processing.',
    institution: 'Manchester University NHS Foundation Trust',
    position: 'Specialist Registrar (Surgery)',
    contactPreference: 'ইমেইল / গুগল মিট',
    createdAt: '2026-03-01',
  },
  {
    id: 'mentor-seed-3',
    userId: 1004,
    fullName: 'Dr. Nusrat Jahan',
    batchYear: 24,
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200',
    category: 'Job',
    expertise: '43rd BCS (Health Cadre), Upazila Health Complex Clinical Operations',
    shortDescription: 'Guidance on BCS preliminary & written preparation for medical doctors, cadre choice, foundation training, and rural hospital clinical leadership.',
    institution: 'Ministry of Health & Family Welfare',
    position: 'Medical Officer (43rd BCS Health)',
    contactPreference: 'হোয়াটসঅ্যাপ',
    createdAt: '2026-03-10',
  },
];

const INITIAL_MENTORSHIP_REQUESTS: MentorshipRequest[] = [
  {
    id: 'req-seed-1',
    userId: 2005,
    userName: 'Dr. Fahim Murshed',
    userBatch: 31,
    userAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200',
    topic: 'Medical',
    question: 'ইন্টার্নশিপ শেষ করে FCPS Part 1 Medicine নাকি MD Residency কোনটা শুরু করা বাস্তবসম্মত হবে? প্রস্তুতি কীভাবে শুরু করব?',
    contactInfo: 'fahim.murshed.dr@gmail.com',
    createdAt: '2 days ago',
    status: 'answered',
    answers: [
      {
        id: 'ans-seed-1',
        mentorId: 1001,
        mentorName: 'Prof. Dr. Tanvir Ahmed',
        mentorBatch: 12,
        mentorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200',
        mentorProfession: 'Associate Professor & Consultant',
        answerText: 'ইন্টার্নশিপ চলাকালীন Davidson ও basic physiology/pathology পড়ে রাখা ভালো। জুলাই সেশনে FCPS Part-1 দেওয়া যায়, একই প্রস্তুতিতে নভেম্বরে BSMMU residency পরীক্ষা দেওয়া সম্ভব। যেকোনো সহযোগিতায় যোগাযোগ করতে পারো।',
        createdAt: '1 day ago',
      },
    ],
  },
  {
    id: 'req-seed-2',
    userId: 2008,
    userName: 'Kazi Naimur',
    userBatch: 34,
    userAvatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&q=80&w=200',
    topic: 'Abroad',
    question: 'PLAB 1 পাস করেছি, এখন UK clinical attachment ও PLAB 2 একাডেমি কীভাবে নির্বাচন করা উচিত?',
    contactInfo: '01711223344',
    createdAt: '3 days ago',
    status: 'open',
    answers: [],
  },
];

export const loadMentorshipRequests = (): MentorshipRequest[] => {
  if (typeof window === 'undefined') return INITIAL_MENTORSHIP_REQUESTS;
  try {
    const raw = localStorage.getItem(REQUESTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Failed to load mentorship requests from storage', e);
  }
  return INITIAL_MENTORSHIP_REQUESTS;
};

export const saveMentorshipRequests = (requests: MentorshipRequest[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(requests));
    window.dispatchEvent(new CustomEvent('mentorship_requests_updated', { detail: requests }));
  } catch (e) {
    console.warn('Failed to save mentorship requests', e);
  }
};

export const createMentorshipRequest = (
  topic: MentorshipCategory,
  question: string,
  user: { id: number; name: string; batch?: number | null; avatar?: string; contact?: string },
  targetMentor?: { id: number | string; name: string }
): MentorshipRequest => {
  const current = loadMentorshipRequests();
  const tempId = `req-${Date.now()}`;
  const newReq: MentorshipRequest = {
    id: tempId,
    userId: user.id,
    userName: user.name || 'Alumnus',
    userBatch: user.batch ?? null,
    userAvatar: user.avatar,
    topic,
    question: question.trim(),
    contactInfo: user.contact?.trim() || undefined,
    targetMentorId: typeof targetMentor?.id === 'number' ? targetMentor.id : undefined,
    targetMentorName: targetMentor?.name,
    createdAt: 'Just now',
    status: 'open',
    answers: [],
  };

  const updated = [newReq, ...current];
  saveMentorshipRequests(updated);
  return newReq;
};

export const addMentorshipAnswer = (
  requestId: string,
  answerText: string,
  mentor: { id: number; name: string; batch?: number | null; avatar?: string; profession?: string }
): MentorshipAnswer => {
  const current = loadMentorshipRequests();
  const tempAnsId = `ans-${Date.now()}`;
  const newAns: MentorshipAnswer = {
    id: tempAnsId,
    mentorId: mentor.id,
    mentorName: mentor.name,
    mentorBatch: mentor.batch ?? null,
    mentorAvatar: mentor.avatar,
    mentorProfession: mentor.profession,
    answerText: answerText.trim(),
    createdAt: 'Just now',
  };

  const updated = current.map((req) => {
    if (req.id === requestId) {
      return {
        ...req,
        status: 'answered' as const,
        answers: [...(req.answers || []), newAns],
      };
    }
    return req;
  });

  saveMentorshipRequests(updated);
  return newAns;
};

export const loadMentorOffers = (): MentorOffer[] => {
  if (typeof window === 'undefined') return INITIAL_MENTOR_OFFERS;
  try {
    const raw = localStorage.getItem(MENTORS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Failed to load mentor offers from storage', e);
  }
  return INITIAL_MENTOR_OFFERS;
};

export const saveMentorOffers = (mentors: MentorOffer[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MENTORS_STORAGE_KEY, JSON.stringify(mentors));
    window.dispatchEvent(new CustomEvent('mentors_updated', { detail: mentors }));
  } catch (e) {
    console.warn('Failed to save mentor offers', e);
  }
};

export const registerMentorOffer = (
  data: Omit<MentorOffer, 'id' | 'createdAt'>
): MentorOffer => {
  const current = loadMentorOffers();
  const existingIdx = current.findIndex((m) => m.fullName.toLowerCase() === data.fullName.toLowerCase());

  const newOffer: MentorOffer = {
    ...data,
    id: `mentor-${Date.now()}`,
    createdAt: new Date().toISOString().split('T')[0],
  };

  let updated: MentorOffer[];
  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = { ...current[existingIdx], ...newOffer };
  } else {
    updated = [newOffer, ...current];
  }

  saveMentorOffers(updated);
  return newOffer;
};
