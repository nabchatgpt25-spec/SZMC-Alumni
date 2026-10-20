export type MentorshipCategory = 'Medical' | 'Job' | 'Abroad' | 'Degree' | 'Business' | 'Other';

export interface MentorshipAnswer {
  id: string;
  mentorId: number;
  mentorName: string;
  mentorBatch?: number | null;
  mentorAvatar?: string;
  mentorProfession?: string;
  answerText: string;
  createdAt: string;
}

export interface MentorshipRequest {
  id: string;
  userId: number;
  userName: string;
  userBatch?: number | null;
  userAvatar?: string;
  topic: MentorshipCategory;
  question: string;
  contactInfo?: string;
  createdAt: string;
  status: 'open' | 'answered' | 'resolved';
  answers?: MentorshipAnswer[];
  targetMentorId?: number;
  targetMentorName?: string;
}

export interface MentorOffer {
  id: string;
  userId: number;
  fullName: string;
  batchYear?: number | null;
  avatarUrl?: string;
  category: MentorshipCategory;
  expertise: string;
  shortDescription: string;
  institution?: string;
  position?: string;
  contactPreference?: string;
  createdAt: string;
}
