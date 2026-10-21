import {
  BloodAlertPreference,
  BloodContactMethod,
  BloodDonorAvailability,
  BloodDonorProfile,
  BloodDonorResponse,
  BloodEmergencyLevel,
  BloodEmergencyRequest,
  BloodGroup,
  BloodRequestStatus,
} from '../types/blood';
import { matchDonorsForRequest } from './bloodMatching';

export const BLOOD_REQUESTS_STORAGE_KEY = 'blood_requests_v1';
export const BLOOD_DONORS_STORAGE_KEY = 'blood_donors_v1';

export const DONATION_AREAS_LIST: string[] = [
  'Shahbagh / Motijheel / Ramna (DMCH, BSMMU, BIRDEM)',
  'Dhanmondi / Panthapath / Green Road (Square, Labaid)',
  'Gulshan / Banani / Bashundhara (Evercare, United)',
  'Mirpur / Agargaon / Shyamoli (NICVD, NIKDU, Heart Foundation)',
  'Uttara / Kurmitola / Airport Corridor',
  'Mugda / Khilgaon / Malibagh',
  'Chattogram Metropolitan Area',
  'Sylhet / Rajshahi / Khulna Regional Hub',
];

export function sanitizeInputText(value: string, maxLength = 300): string {
  if (!value || typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>?/gm, '')
    .replace(/javascript:/gi, '')
    .trim()
    .slice(0, maxLength);
}

const DEFAULT_SAMPLE_DONORS: BloodDonorProfile[] = [
  {
    userId: 101,
    fullName: 'Dr. Tanvir Ahmed',
    avatarUrl: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=120&auto=format&fit=crop&q=80',
    batchYear: 24,
    profession: 'Registrar, Internal Medicine',
    institution: 'Dhaka Medical College Hospital',
    phone: '+880 1711-234567',
    whatsapp: '+880 1711-234567',
    email: 'tanvir.ahmed@szmc.edu.bd',
    verificationStatus: 'verified',
    bloodGroup: 'O+',
    isRegisteredDonor: true,
    availability: 'available',
    preferredArea: 'Shahbagh / Motijheel / Ramna (DMCH, BSMMU, BIRDEM)',
    city: 'Dhaka',
    lastDonationDate: '2024-01-10',
    emergencyAlertPreference: 'all_urgent',
    donationHistory: [
      { id: 'dh-1', date: '2024-01-10', hospital: 'DMCH', units: 1, notes: 'Emergency cardiac surgery' }
    ],
    updatedAt: new Date().toISOString(),
  },
  {
    userId: 102,
    fullName: 'Dr. Nafis Rahman',
    avatarUrl: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=120&auto=format&fit=crop&q=80',
    batchYear: 26,
    profession: 'Medical Officer, Cardiology',
    institution: 'National Institute of Cardiovascular Diseases',
    phone: '+880 1819-876543',
    whatsapp: '+880 1819-876543',
    email: 'nafis.rahman@szmc.edu.bd',
    verificationStatus: 'verified',
    bloodGroup: 'A+',
    isRegisteredDonor: true,
    availability: 'available',
    preferredArea: 'Mirpur / Agargaon / Shyamoli (NICVD, NIKDU, Heart Foundation)',
    city: 'Dhaka',
    lastDonationDate: '2024-02-15',
    emergencyAlertPreference: 'all_urgent',
    donationHistory: [],
    updatedAt: new Date().toISOString(),
  },
  {
    userId: 103,
    fullName: 'Dr. Sadia Islam',
    avatarUrl: 'https://images.unsplash.com/photo-1594824813579-0824b2b4d455?w=120&auto=format&fit=crop&q=80',
    batchYear: 27,
    profession: 'Assistant Professor, Pediatrics',
    institution: 'BSMMU',
    phone: '+880 1912-345678',
    whatsapp: '+880 1912-345678',
    email: 'sadia.islam@szmc.edu.bd',
    verificationStatus: 'verified',
    bloodGroup: 'B+',
    isRegisteredDonor: true,
    availability: 'available',
    preferredArea: 'Shahbagh / Motijheel / Ramna (DMCH, BSMMU, BIRDEM)',
    city: 'Dhaka',
    lastDonationDate: '2023-11-20',
    emergencyAlertPreference: 'same_area_only',
    donationHistory: [],
    updatedAt: new Date().toISOString(),
  },
  {
    userId: 104,
    fullName: 'Dr. Mahmudul Hasan',
    avatarUrl: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=120&auto=format&fit=crop&q=80',
    batchYear: 25,
    profession: 'Senior Consultant, Nephrology',
    institution: 'Square Hospital',
    phone: '+880 1611-456789',
    whatsapp: '+880 1611-456789',
    email: 'mahmud.hasan@szmc.edu.bd',
    verificationStatus: 'verified',
    bloodGroup: 'AB+',
    isRegisteredDonor: true,
    availability: 'available',
    preferredArea: 'Dhanmondi / Panthapath / Green Road (Square, Labaid)',
    city: 'Dhaka',
    lastDonationDate: '2023-12-05',
    emergencyAlertPreference: 'all_urgent',
    donationHistory: [],
    updatedAt: new Date().toISOString(),
  },
  {
    userId: 105,
    fullName: 'Dr. Farhana Yasmin',
    avatarUrl: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=120&auto=format&fit=crop&q=80',
    batchYear: 28,
    profession: 'Resident Physician, General Surgery',
    institution: 'Evercare Hospital Dhaka',
    phone: '+880 1722-334455',
    whatsapp: '+880 1722-334455',
    email: 'farhana.yasmin@szmc.edu.bd',
    verificationStatus: 'verified',
    bloodGroup: 'O-',
    isRegisteredDonor: true,
    availability: 'available',
    preferredArea: 'Gulshan / Banani / Bashundhara (Evercare, United)',
    city: 'Dhaka',
    lastDonationDate: '2023-10-15',
    emergencyAlertPreference: 'critical_only',
    donationHistory: [],
    updatedAt: new Date().toISOString(),
  },
  {
    userId: 106,
    fullName: 'Dr. Zubair Al Mamun',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    batchYear: 23,
    profession: 'Consultant, Orthopedics',
    institution: 'National Institute of Traumatology (NITOR)',
    phone: '+880 1515-678901',
    whatsapp: '+880 1515-678901',
    email: 'zubair.mamun@szmc.edu.bd',
    verificationStatus: 'verified',
    bloodGroup: 'A-',
    isRegisteredDonor: true,
    availability: 'available',
    preferredArea: 'Mirpur / Agargaon / Shyamoli (NICVD, NIKDU, Heart Foundation)',
    city: 'Dhaka',
    lastDonationDate: '2023-09-10',
    emergencyAlertPreference: 'all_urgent',
    donationHistory: [],
    updatedAt: new Date().toISOString(),
  },
  {
    userId: 107,
    fullName: 'Dr. Shahriar Kabir',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
    batchYear: 22,
    profession: 'Associate Professor, Surgery',
    institution: 'Shaheed Ziaur Rahman Medical College Hospital',
    phone: '+880 1712-998877',
    whatsapp: '+880 1712-998877',
    email: 'shahriar.kabir@szmc.edu.bd',
    verificationStatus: 'verified',
    bloodGroup: 'B-',
    isRegisteredDonor: true,
    availability: 'available',
    preferredArea: 'Sylhet / Rajshahi / Khulna Regional Hub',
    city: 'Bogura',
    lastDonationDate: '2024-01-05',
    emergencyAlertPreference: 'all_urgent',
    donationHistory: [],
    updatedAt: new Date().toISOString(),
  },
  {
    userId: 108,
    fullName: 'Dr. Rafiqul Haque',
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80',
    batchYear: 20,
    profession: 'Clinical Hematologist',
    institution: 'Kurmitola General Hospital',
    phone: '+880 1811-332211',
    whatsapp: '+880 1811-332211',
    email: 'rafiqul.haque@szmc.edu.bd',
    verificationStatus: 'verified',
    bloodGroup: 'AB-',
    isRegisteredDonor: true,
    availability: 'available',
    preferredArea: 'Uttara / Kurmitola / Airport Corridor',
    city: 'Dhaka',
    lastDonationDate: '2023-08-12',
    emergencyAlertPreference: 'all_urgent',
    donationHistory: [],
    updatedAt: new Date().toISOString(),
  }
];

const DEFAULT_SAMPLE_REQUESTS: BloodEmergencyRequest[] = [
  {
    id: 'req_sample_1',
    bloodGroup: 'O+',
    unitsRequired: 2,
    unitsFulfilled: 1,
    hospitalName: 'Dhaka Medical College Hospital (DMCH)',
    hospitalArea: 'Shahbagh / Motijheel / Ramna (DMCH, BSMMU, BIRDEM)',
    city: 'Dhaka',
    requiredDateTime: new Date(Date.now() + 4 * 3600000).toISOString(),
    emergencyLevel: 'critical',
    contactMethod: 'Attendant Emergency Line',
    contactPhone: '+880 1711-002233',
    description: 'Emergency trauma resuscitation following road traffic accident. ICU Bed 4.',
    patientRelation: 'Batchmate Mother',
    requesterId: 201,
    requesterName: 'Dr. Rezwan Karim',
    requesterAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    requesterBatch: 25,
    status: 'Active',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 1800000).toISOString(),
    responses: [],
  },
  {
    id: 'req_sample_2',
    bloodGroup: 'A+',
    unitsRequired: 1,
    unitsFulfilled: 0,
    hospitalName: 'Square Hospital',
    hospitalArea: 'Dhanmondi / Panthapath / Green Road (Square, Labaid)',
    city: 'Dhaka',
    requiredDateTime: new Date(Date.now() + 8 * 3600000).toISOString(),
    emergencyLevel: 'urgent',
    contactMethod: 'Attendant Emergency Line',
    contactPhone: '+880 1819-445566',
    description: 'Elective coronary artery bypass surgery tomorrow morning at 8:30 AM.',
    patientRelation: 'Alumnus Relative',
    requesterId: 202,
    requesterName: 'Dr. Momena Khatun',
    requesterAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80',
    requesterBatch: 27,
    status: 'Active',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: new Date(Date.now() - 7200000).toISOString(),
    responses: [],
  }
];

export function loadBloodDonors(): BloodDonorProfile[] {
  if (typeof window === 'undefined') return DEFAULT_SAMPLE_DONORS;
  try {
    const raw = localStorage.getItem(BLOOD_DONORS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (err) {
    console.warn('Failed to load blood donors from localStorage:', err);
  }
  return DEFAULT_SAMPLE_DONORS;
}

export function saveBloodDonors(donors: BloodDonorProfile[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BLOOD_DONORS_STORAGE_KEY, JSON.stringify(donors));
    window.dispatchEvent(new CustomEvent('blood_donors_changed', { detail: donors }));
  } catch (err) {
    console.error('Failed to save blood donors:', err);
  }
}

export function loadBloodRequests(): BloodEmergencyRequest[] {
  if (typeof window === 'undefined') return DEFAULT_SAMPLE_REQUESTS;
  try {
    const raw = localStorage.getItem(BLOOD_REQUESTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (err) {
    console.warn('Failed to load blood requests from localStorage:', err);
  }
  return DEFAULT_SAMPLE_REQUESTS;
}

export function saveBloodRequests(requests: BloodEmergencyRequest[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BLOOD_REQUESTS_STORAGE_KEY, JSON.stringify(requests));
    window.dispatchEvent(new CustomEvent('blood_requests_changed', { detail: requests }));
  } catch (err) {
    console.error('Failed to save blood requests:', err);
  }
}

export function registerOrUpdateBloodDonor(profile: BloodDonorProfile): BloodDonorProfile {
  const existing = loadBloodDonors();
  const index = existing.findIndex((d) => d.userId === profile.userId);
  const updatedProfile: BloodDonorProfile = {
    ...profile,
    updatedAt: new Date().toISOString(),
  };

  if (index >= 0) {
    existing[index] = updatedProfile;
  } else {
    existing.unshift(updatedProfile);
  }

  saveBloodDonors(existing);
  return updatedProfile;
}

export function getDonorProfileByUserId(userId: number): BloodDonorProfile | null {
  const donors = loadBloodDonors();
  return donors.find((d) => d.userId === userId) || null;
}

export function createBloodRequest(params: {
  bloodGroup: BloodGroup;
  unitsRequired: number;
  hospitalName: string;
  hospitalArea: string;
  city: string;
  requiredDateTime: string;
  emergencyLevel: BloodEmergencyLevel;
  contactMethod: BloodContactMethod;
  contactPhone?: string;
  description: string;
  patientRelation?: string;
  requesterId: number;
  requesterName: string;
  requesterAvatar: string;
  requesterBatch: number;
}): BloodEmergencyRequest {
  const newRequest: BloodEmergencyRequest = {
    id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    bloodGroup: params.bloodGroup,
    unitsRequired: Math.max(1, params.unitsRequired),
    unitsFulfilled: 0,
    hospitalName: sanitizeInputText(params.hospitalName, 120),
    hospitalArea: sanitizeInputText(params.hospitalArea, 120),
    city: sanitizeInputText(params.city || 'Dhaka', 60),
    requiredDateTime: params.requiredDateTime,
    emergencyLevel: params.emergencyLevel,
    contactMethod: params.contactMethod,
    contactPhone: sanitizeInputText(params.contactPhone || '', 30),
    description: sanitizeInputText(params.description, 500),
    patientRelation: sanitizeInputText(params.patientRelation || 'Alumnus / Relative', 50),
    requesterId: params.requesterId,
    requesterName: params.requesterName,
    requesterAvatar: params.requesterAvatar,
    requesterBatch: params.requesterBatch,
    status: 'Active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    responses: [],
  };

  const requests = loadBloodRequests();
  requests.unshift(newRequest);
  saveBloodRequests(requests);

  return newRequest;
}

export function respondToBloodRequest(
  param1:
    | string
    | {
        requestId: string;
        donorUserId: number;
        donorName: string;
        donorAvatar: string;
        donorBatchYear: number;
        donorBloodGroup: BloodGroup;
        donorPreferredArea: string;
        donorPhone?: string;
        note?: string;
      },
  param2?: any,
  param3?: string
): any {
  if (typeof param1 === 'string') {
    const requestId = param1;
    const actor = param2;
    const note = param3;
    const requests = loadBloodRequests();
    const req = requests.find((r) => r.id === requestId);
    if (!req) throw new Error('Blood request not found');

    const existing = req.responses.find((r) => r.donorUserId === actor.id);
    if (!existing) {
      req.responses.push({
        id: `resp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        requestId,
        donorUserId: actor.id,
        donorName: actor.fullName,
        donorAvatar: actor.avatarUrl,
        donorBatchYear: actor.batchYear || 25,
        donorBloodGroup: actor.bloodGroup || req.bloodGroup,
        donorPreferredArea: actor.preferredArea || actor.city || 'Dhaka',
        donorPhone: actor.phone,
        respondedAt: new Date().toISOString(),
        status: 'offered',
        note: sanitizeInputText(note || '', 200),
      });
      if (req.status === 'Active') req.status = 'Donor Found';
      req.updatedAt = new Date().toISOString();
      saveBloodRequests(requests);
    }
    return req;
  } else {
    const params = param1;
    const requests = loadBloodRequests();
    const req = requests.find((r) => r.id === params.requestId);
    if (!req) return false;

    const existingResponse = req.responses.find((r) => r.donorUserId === params.donorUserId);
    if (existingResponse) return false;

    const responseItem: BloodDonorResponse = {
      id: `resp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      requestId: params.requestId,
      donorUserId: params.donorUserId,
      donorName: params.donorName,
      donorAvatar: params.donorAvatar,
      donorBatchYear: params.donorBatchYear,
      donorBloodGroup: params.donorBloodGroup,
      donorPreferredArea: params.donorPreferredArea,
      donorPhone: params.donorPhone,
      respondedAt: new Date().toISOString(),
      status: 'offered',
      note: sanitizeInputText(params.note || '', 200),
    };

    req.responses.push(responseItem);
    if (req.status === 'Active') {
      req.status = 'Donor Found';
    }
    req.updatedAt = new Date().toISOString();

    saveBloodRequests(requests);
    return true;
  }
}

export function updateBloodRequestStatus(
  requestId: string,
  newStatus: BloodRequestStatus,
  fulfilledUnitsOrActor?: number | any,
  options?: any
): any {
  const requests = loadBloodRequests();
  const req = requests.find((r) => r.id === requestId);
  if (!req) return typeof fulfilledUnitsOrActor === 'number' ? false : null;

  req.status = newStatus;
  if (typeof fulfilledUnitsOrActor === 'number') {
    req.unitsFulfilled = Math.min(req.unitsRequired, fulfilledUnitsOrActor);
  } else if (newStatus === 'Fulfilled') {
    req.unitsFulfilled = req.unitsRequired;
  }
  if (options?.moderationNote) {
    req.moderationNote = sanitizeInputText(options.moderationNote, 200);
  }
  req.updatedAt = new Date().toISOString();

  saveBloodRequests(requests);
  return typeof fulfilledUnitsOrActor === 'number' ? true : req;
}

export function canModifyBloodRequest(
  request: BloodEmergencyRequest,
  actor: { id: number; userId?: number; role?: string },
  isModerator = false
): boolean {
  if (!actor || !request) return false;
  if (isModerator || actor.role === 'admin') return true;
  const actorId = actor.id || actor.userId;
  return request.requesterId === actorId;
}

export function confirmDonorDonationOnRequest(
  requestId: string,
  responseId: string,
  actor: any,
  isModerator = false
): BloodEmergencyRequest {
  const requests = loadBloodRequests();
  const req = requests.find((r) => r.id === requestId);
  if (!req) throw new Error('Blood request not found');

  const resp = req.responses.find((r) => r.id === responseId);
  if (resp) {
    resp.status = 'confirmed_donated';
  }
  req.unitsFulfilled = Math.min(req.unitsRequired, (req.unitsFulfilled || 0) + 1);
  if (req.unitsFulfilled >= req.unitsRequired) {
    req.status = 'Fulfilled';
  } else {
    req.status = 'Donation Confirmed';
  }
  req.updatedAt = new Date().toISOString();
  saveBloodRequests(requests);
  return req;
}

export const BLOOD_BANNER_DISMISSED_KEY = 'blood_emergency_banner_dismissed_v2';

export function isBloodBannerDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(BLOOD_BANNER_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function dismissBloodBanner(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BLOOD_BANNER_DISMISSED_KEY, 'true');
    window.dispatchEvent(new CustomEvent('blood_banner_dismissed'));
  } catch (e) {
    console.warn('Failed to dismiss blood banner', e);
  }
}

export function pushPortalNotification(notification: any): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('portal_notifications_v1');
    const list = raw ? JSON.parse(raw) : [];
    list.unshift({
      id: `notif_${Date.now()}`,
      timestamp: new Date().toISOString(),
      read: false,
      ...notification,
    });
    localStorage.setItem('portal_notifications_v1', JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('portal_notifications_changed'));
  } catch (e) {
    console.warn('Failed to push portal notification', e);
  }
}
