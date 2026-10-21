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
  phone?: string;
  whatsapp?: string;
  email?: string;
  verificationStatus?: 'verified' | 'pending_vouch' | 'unverified';
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
  donorPhone?: string;
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
  contactPhone?: string;
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
