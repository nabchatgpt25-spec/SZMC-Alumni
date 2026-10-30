export type ThemeId = 'light' | 'dark' | 'ndc-blue' | 'midnight';

export type ThemeMode = 'light' | 'dark';

export interface ThemeOption {
  id: ThemeId;
  name: string;
  tagline: string;
  isDark: boolean;
  category: 'light' | 'dark';
  colors: {
    primary: string;
    accent: string;
    background: string;
    surface: string;
    border: string;
    textPreview: string;
  };
  palette: string[];
}

export type VerificationStatus = 'verified' | 'pending_vouch' | 'unverified';
export type VerificationMethod = 'two_vouches' | 'id_card_upload' | 'souvenir_photo' | 'admin_verified' | 'admin';
export type VerificationDocType = 'id_card' | 'nid_card' | 'hsc_slip' | 'souvenir';

export interface AdminDocSubmission {
  id: string;
  userId: number;
  fullName: string;
  avatarUrl: string;
  batchYear: number;
  collegeRoll: string;
  group: string;
  phone?: string;
  email?: string;
  docType: VerificationDocType;
  docTypeLabel: string;
  documentUrl: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  adminNote?: string;
  vouchLink?: string;
}

export interface VouchItem {
  id: string;
  voucherId: number;
  voucherName: string;
  voucherAvatar: string;
  voucherBatch: number;
  date: string;
  comment?: string;
}

export interface VouchRequest {
  id: string;
  requesterId: number;
  requesterName: string;
  requesterAvatar: string;
  batchYear: number;
  collegeRoll: string;
  group: 'Science' | 'Business Studies' | 'Humanities' | string;
  section?: string;
  profession?: string;
  city?: string;
  createdAt: string;
  status: 'pending' | 'verified' | 'declined';
  vouches: VouchItem[];
  targetVouches: number;
  idProofUrl?: string;
  idDocType?: VerificationDocType;
  adminNote?: string;
  message?: string;
}

export type UserRole = 'member' | 'batch_representative' | 'moderator' | 'admin';

/**
 * Administrator check: Verified via user role ('admin').
 * Strictly role-authoritative; no hardcoded email bypasses.
 */
export function isUserSuperAdmin(user?: { email?: string | null; role?: string | null } | null): boolean {
  if (!user) return false;
  return user.role === 'admin';
}

/**
 * General Admin check: Verified via user role ('admin').
 */
export function isUserGeneralAdmin(user?: { email?: string | null; role?: string | null } | null): boolean {
  if (!user) return false;
  return user.role === 'admin';
}

/**
 * Any admin check (role === 'admin')
 */
export function isUserAnyAdmin(user?: { email?: string | null; role?: string | null } | null): boolean {
  if (!user) return false;
  return user.role === 'admin';
}

/**
 * Sub-Admin / Moderator check (excluding full admins)
 */
export function isUserSubAdmin(user?: { email?: string | null; role?: string | null } | null): boolean {
  if (!user) return false;
  if (user.role === 'admin') return false;
  return user.role === 'moderator' || user.role === 'batch_representative';
}

export type AcademicStreamType = 'MBBS' | 'Medicine' | 'Science' | 'Humanities' | 'Business Studies';

export interface AlumniProfile {
  id: number;
  userId: number;
  authUserId?: string;
  role?: UserRole;
  fullName: string;
  avatarUrl: string;
  coverUrl?: string;
  batchYear: number;
  session?: string;
  collegeRoll?: string;
  academicStream?: AcademicStreamType | null;
  academicGroup?: string | null;
  group?: 'Science' | 'Business Studies' | 'Humanities' | string;
  section?: string;
  verificationStatus?: VerificationStatus;
  verificationMethod?: VerificationMethod;
  verifiedBy?: string[];
  vouchedBy?: { id?: number; name: string; batchYear: number; collegeRoll?: string; timestamp?: string }[];
  vouchedForIds?: number[];
  vouchesCount?: number;
  vouchTargetCount?: number;
  idProofUrl?: string;
  idDocType?: VerificationDocType;
  idSubmissionStatus?: 'pending' | 'approved' | 'rejected';
  adminReviewNote?: string;
  verificationDate?: string;
  profession: string;
  position: string;
  institution: string;
  cadre?: string;
  specialty: string[];
  specialtyOther?: string;
  degree: string[];
  city: string;
  country: string;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  whatsapp?: string;
  fbLink?: string;
  phone?: string;
  phoneOwnershipVerified?: boolean;
  phoneVerifiedAt?: string;
  phoneVerifiedByProfileId?: number;
  phoneVerificationNotes?: string;
  email?: string;
  bio?: string;
  careerHistory?: string[];
  isPublic: boolean;
  online: boolean;
  lastSeen?: string;
  postsCount?: number;
  badges?: string[];
  bloodGroup?: BloodGroup;
  bloodDonorProfile?: {
    isRegisteredDonor: boolean;
    availability: BloodDonorAvailability;
    preferredArea: string;
    lastDonationDate?: string;
    emergencyAlertPreference: BloodAlertPreference;
    donationHistory?: BloodDonationHistoryItem[];
  };
}

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export const BLOOD_GROUPS_LIST: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export type BloodDonorAvailability = 'available' | 'on_cooldown' | 'unavailable';

export type BloodAlertPreference = 'all_urgent' | 'same_area_only' | 'critical_only' | 'paused';

export type BloodEmergencyLevel = 'critical' | 'urgent' | 'standard';

export type BloodRequestStatus =
  | 'Pending Verification'
  | 'Active'
  | 'Donor Found'
  | 'Donation Confirmed'
  | 'Fulfilled'
  | 'Cancelled'
  | 'Expired';

export type BloodContactMethod =
  | 'Portal Secure Coordination'
  | 'Hospital Blood Bank Desk'
  | 'Batch Coordinator Relay'
  | 'Attendant Emergency Line';

export interface BloodDonationHistoryItem {
  id: string;
  date: string;
  hospital: string;
  location?: string;
  units?: number;
  notes?: string;
}

export interface BloodDonorProfile {
  userId: number;
  fullName: string;
  avatarUrl: string;
  batchYear: number;
  profession?: string;
  institution?: string;
  verificationStatus?: VerificationStatus;
  bloodGroup: BloodGroup;
  isRegisteredDonor: boolean;
  availability: BloodDonorAvailability;
  preferredArea: string;
  city: string;
  lastDonationDate?: string;
  emergencyAlertPreference: BloodAlertPreference;
  donationHistory: BloodDonationHistoryItem[];
  updatedAt: string;
}

export interface BloodDonorResponse {
  id: string;
  requestId: string;
  donorUserId: number;
  donorName: string;
  donorAvatar: string;
  donorBatchYear: number;
  donorBloodGroup: BloodGroup;
  donorPreferredArea: string;
  respondedAt: string;
  status: 'offered' | 'accepted' | 'confirmed_donated' | 'declined';
  note?: string;
}

export interface BloodEmergencyRequest {
  id: string;
  bloodGroup: BloodGroup;
  unitsRequired: number;
  unitsFulfilled: number;
  hospitalName: string;
  hospitalArea: string;
  city: string;
  requiredDateTime: string;
  emergencyLevel: BloodEmergencyLevel;
  contactMethod: BloodContactMethod;
  coordinationRef?: string;
  description: string;
  patientRelation?: string;
  requesterId: number;
  requesterName: string;
  requesterAvatar: string;
  requesterBatch: number;
  requesterVerified?: boolean;
  status: BloodRequestStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  responses: BloodDonorResponse[];
  moderationNote?: string;
  verifiedByAdmin?: string;
}

export interface PostComment {
  id: number;
  postId: number;
  userId: number;
  fullName: string;
  avatarUrl: string;
  content: string;
  likesCount: number;
  likedByMe: boolean;
  createdAt: string;
  replies?: PostComment[];
}

export interface PostItem {
  id: number;
  userId: number;
  fullName: string;
  avatarUrl: string;
  batchYear?: number;
  content: string;
  images: string[];
  videos?: string[];
  layout_template?: 'carousel' | 'grid' | 'column' | 'hero';
  linked_url?: string;
  link_metadata?: any;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  likedByMe?: boolean;
  comments?: PostComment[];
  category?: 'General Update' | 'Tech & Innovation' | 'Professional Insights' | 'Reunion' | 'Achievement' | string;
  isEdited?: boolean;
  isSaved?: boolean;
  isBatchmate?: boolean;
  isFriend?: boolean;
  albumId?: number | string;
  albumTitle?: string;
  albumCoverUrl?: string;
  albumCategory?: string;
  albumPhotosCount?: number;
  pinned?: boolean;
  verified?: boolean;
  profession?: string;
  institution?: string;
  author?: string;
  authorAvatar?: string;
  authorBatch?: number;
  authorRole?: string;
  timestamp?: string;
  likes?: number;
  liked?: boolean;
  commentsList?: any[];
  shares?: number;
}

export type { NotificationItem, UserPreferences } from './types/notification.types';

export interface BatchSummary {
  batchYear: number;
  session: string;
  total: number | null;
  representative?: string;
  specialNote?: string;
}

export interface GalleryPhoto {
  id: string;
  url: string;
  caption?: string;
  uploaderName?: string;
  uploaderAvatar?: string;
  batchYear?: number;
  uploadedAt?: string;
  likesCount?: number;
  likedByMe?: boolean;
  tags?: string[];
  mediaType?: 'image' | 'video';
  fileSize?: string;
}

export interface GalleryAlbum {
  id: number;
  title: string;
  description?: string;
  category: 'reunion' | 'academic' | 'campus' | 'convocation' | 'sports' | 'cultural' | 'all';
  date: string;
  location?: string;
  batchYear?: number;
  photosCount: number;
  coverUrl: string;
  photos: GalleryPhoto[];
  createdBy?: string;
  createdDate?: string;
}

export const SPECIALTIES_LIST = [
  'Internal Medicine',
  'General Surgery',
  'Pediatrics & Child Health',
  'Obstetrics & Gynecology (Obs & Gynae)',
  'Cardiology & Cardiac Surgery',
  'Orthopedics & Trauma Surgery',
  'Anesthesiology, Critical Care & ICU',
  'Radiology & Imaging',
  'Pathology & Laboratory Medicine',
  'Ophthalmology (Eye)',
  'Otorhinolaryngology (ENT)',
  'Dermatology & Venereology',
  'Psychiatry & Behavioral Sciences',
  'Nephrology & Urology',
  'Gastroenterology & Hepatology',
  'Neurology & Neurosurgery',
  'Pulmonology & Respiratory Medicine',
  'Oncology & Radiotherapy',
  'Physical Medicine & Rehabilitation',
  'Community Medicine & Public Health',
  'Emergency Medicine & Trauma',
  'Forensic Medicine & Toxicology',
  'Pharmacology & Therapeutics',
  'Microbiology & Parasitology',
  'Biochemistry & Molecular Biology',
  'Anatomy & Physiology',
  'Hospital Administration & Health Economics',
  'General Physician / Medical Officer',
  'Intern Doctor / Medical Student',
  'Others'
];

export const DEGREES_LIST = [
  'MBBS', 'FCPS', 'MD', 'MS', 'MRCP', 'MRCS', 'FRCS', 'FRCP',
  'FACS', 'D-Card', 'DGO', 'DCH', 'DO', 'DLO', 'DA', 'DDV',
  'MPH', 'MPhil', 'PhD', 'BDS', 'BCS (Health)', 'Diploma',
  'BSc', 'MSc', 'HSC', 'Others'
];

export const SUPER_ADMIN_EMAILS = [
  'admin@szmcalumni.net',
  'firstaidnetworkbd@gmail.com',
  'support@szmcalumni.net',
];

export type { OfficialNotice } from './data/noticesData';
