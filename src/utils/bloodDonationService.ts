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
import {
  createBloodRequestInDb,
  registerBloodDonorInDb,
  respondToBloodRequestInDb,
  fetchBloodRequestsFromDb,
  fetchBloodDonorsFromDb,
} from '../services/supabaseService';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

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

const DEFAULT_SAMPLE_DONORS: BloodDonorProfile[] = [];

const DEFAULT_SAMPLE_REQUESTS: BloodEmergencyRequest[] = [];

export function loadBloodDonors(): BloodDonorProfile[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BLOOD_DONORS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((d) => d && d.userId && !(d.userId >= 101 && d.userId <= 120));
      }
    }
  } catch (err) {
    console.warn('Failed to load blood donors from localStorage:', err);
  }
  return [];
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
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BLOOD_REQUESTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter(
          (r) =>
            r &&
            r.id &&
            !String(r.id).startsWith('req_sample_') &&
            !(r.requesterId && r.requesterId >= 101 && r.requesterId <= 220)
        );
      }
    }
  } catch (err) {
    console.warn('Failed to load blood requests from localStorage:', err);
  }
  return [];
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

  // Asynchronously persist to Supabase Database
  registerBloodDonorInDb({
    userId: profile.userId,
    bloodGroup: profile.bloodGroup,
    isRegisteredDonor: profile.isRegisteredDonor,
    availability: profile.availability,
    preferredArea: profile.preferredArea || profile.city || 'Bogura',
    city: profile.city || 'Bogura',
    lastDonationDate: profile.lastDonationDate,
    emergencyAlertPreference: profile.emergencyAlertPreference || 'all_urgent',
    donationHistory: profile.donationHistory || [],
  }).catch((err) => console.warn('Supabase donor registration sync warning:', err));

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
  const tempId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newRequest: BloodEmergencyRequest = {
    id: tempId,
    bloodGroup: params.bloodGroup,
    unitsRequired: Math.max(1, params.unitsRequired),
    unitsFulfilled: 0,
    hospitalName: sanitizeInputText(params.hospitalName, 120),
    hospitalArea: sanitizeInputText(params.hospitalArea, 120),
    city: sanitizeInputText(params.city || 'Bogura', 60),
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

  // Asynchronously persist to Supabase Database
  createBloodRequestInDb({
    requesterId: params.requesterId,
    bloodGroup: params.bloodGroup,
    unitsRequired: params.unitsRequired,
    hospitalName: params.hospitalName,
    hospitalArea: params.hospitalArea,
    city: params.city || 'Bogura',
    requiredDateTime: params.requiredDateTime,
    emergencyLevel: params.emergencyLevel,
    contactMethod: params.contactMethod,
    description: params.description,
    status: 'Active',
    patientRelation: params.patientRelation,
  }).then((supabaseId) => {
    if (supabaseId) {
      // Reconcile temporary optimistic ID with permanent Supabase ID
      const currentList = loadBloodRequests();
      const target = currentList.find((r) => r.id === tempId);
      if (target) {
        target.id = supabaseId;
        saveBloodRequests(currentList);
      }
    }
  }).catch((err) => console.warn('Supabase blood request sync warning:', err));

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

      respondToBloodRequestInDb({
        requestId,
        donorUserId: actor.id,
        status: 'offered',
        note: sanitizeInputText(note || '', 200),
      }).catch((e) => console.warn('Supabase donor response sync warning:', e));
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

    respondToBloodRequestInDb({
      requestId: params.requestId,
      donorUserId: params.donorUserId,
      status: 'offered',
      note: sanitizeInputText(params.note || '', 200),
    }).catch((e) => console.warn('Supabase donor response sync warning:', e));

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

  if (isSupabaseConfigured) {
    supabase
      .from('blood_requests')
      .update({
        status: newStatus,
        units_fulfilled: req.unitsFulfilled,
        moderation_note: req.moderationNote || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .then(({ error }) => {
        if (error) console.warn('Supabase updateBloodRequestStatus error:', error.message);
      });
  }

  return typeof fulfilledUnitsOrActor === 'number' ? true : req;
}

export async function syncBloodDataFromSupabase(): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const [dbRequests, dbDonors] = await Promise.all([
      fetchBloodRequestsFromDb(),
      fetchBloodDonorsFromDb(),
    ]);
    if (dbRequests && dbRequests.length > 0) {
      saveBloodRequests(dbRequests);
    }
    if (dbDonors && dbDonors.length > 0) {
      saveBloodDonors(dbDonors);
    }
  } catch (err) {
    console.warn('Failed to sync blood data from Supabase:', err);
  }
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
