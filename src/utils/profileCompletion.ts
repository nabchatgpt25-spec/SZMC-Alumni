import { AlumniProfile } from '../types';

export interface ProfileFieldCompletionItem {
  key: string;
  label: string;
  filled: boolean;
  source: 'registration' | 'edit_profile';
}

export interface ProfileCompletionResult {
  percentage: number;
  completedCount: number;
  totalCount: number;
  registrationCompletedCount: number;
  registrationTotalCount: number;
  editProfileCompletedCount: number;
  editProfileTotalCount: number;
  fields: ProfileFieldCompletionItem[];
}

export function calculateProfileCompletion(
  profile: Partial<AlumniProfile>
): ProfileCompletionResult {
  const batchNum = Number(profile.batchYear);
  const hasValidBatch =
    profile.batchYear !== undefined &&
    profile.batchYear !== null &&
    Number.isFinite(batchNum) &&
    ((batchNum >= 1 && batchNum <= 99) || /^\d{4}$/.test(String(profile.batchYear).trim()));

  const hasSpecialty =
    Array.isArray(profile.specialty) &&
    profile.specialty.map((s) => s.trim()).filter(Boolean).length > 0;

  const hasDegree =
    Array.isArray(profile.degree) &&
    profile.degree.map((d) => d.trim()).filter(Boolean).length > 0;

  const hasCareerHistory =
    Array.isArray(profile.careerHistory) &&
    profile.careerHistory.map((c) => c.trim()).filter(Boolean).length > 0;

  const fields: ProfileFieldCompletionItem[] = [
    // 12 Registration Form Fields
    {
      key: 'fullName',
      label: 'Full Name',
      filled: Boolean(profile.fullName && profile.fullName.trim().length > 0),
      source: 'registration',
    },
    {
      key: 'batchYear',
      label: 'SZMC MBBS Batch',
      filled: hasValidBatch,
      source: 'registration',
    },
    {
      key: 'collegeRoll',
      label: 'College Roll / Registration ID',
      filled: Boolean(profile.collegeRoll && profile.collegeRoll.trim().length > 0),
      source: 'registration',
    },
    {
      key: 'phone',
      label: 'Mobile Number',
      filled: Boolean(profile.phone && profile.phone.trim().length > 0),
      source: 'registration',
    },
    {
      key: 'email',
      label: 'Email Address',
      filled: Boolean(profile.email && profile.email.trim().length > 0),
      source: 'registration',
    },
    {
      key: 'position',
      label: 'Current Profession / Role',
      filled: Boolean(profile.position && profile.position.trim().length > 0),
      source: 'registration',
    },
    {
      key: 'institution',
      label: 'Organization / Workplace',
      filled: Boolean(profile.institution && profile.institution.trim().length > 0),
      source: 'registration',
    },
    {
      key: 'specialty',
      label: 'Field / Specialty',
      filled: hasSpecialty,
      source: 'registration',
    },
    {
      key: 'degree',
      label: 'Degrees & Qualifications',
      filled: hasDegree,
      source: 'registration',
    },
    {
      key: 'city',
      label: 'City',
      filled: Boolean(profile.city && profile.city.trim().length > 0),
      source: 'registration',
    },
    {
      key: 'country',
      label: 'Country',
      filled: Boolean(profile.country && profile.country.trim().length > 0),
      source: 'registration',
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp Number',
      filled: Boolean(profile.whatsapp && profile.whatsapp.trim().length > 0),
      source: 'registration',
    },

    // 5 Additional Edit Profile Full Form Fields
    {
      key: 'bio',
      label: 'Biography / About Me',
      filled: Boolean(profile.bio && profile.bio.trim().length > 0),
      source: 'edit_profile',
    },
    {
      key: 'profession',
      label: 'Profession Type',
      filled: Boolean(profile.profession && profile.profession.trim().length > 0),
      source: 'edit_profile',
    },
    {
      key: 'cadre',
      label: 'Civil Service / BCS Cadre',
      filled: Boolean(profile.cadre && profile.cadre.trim().length > 0),
      source: 'edit_profile',
    },
    {
      key: 'careerHistory',
      label: 'Career Timeline Entries',
      filled: hasCareerHistory,
      source: 'edit_profile',
    },
    {
      key: 'fbLink',
      label: 'Facebook Profile Link',
      filled: Boolean(profile.fbLink && profile.fbLink.trim().length > 0),
      source: 'edit_profile',
    },
  ];

  const registrationFields = fields.filter((f) => f.source === 'registration');
  const editProfileFields = fields.filter((f) => f.source === 'edit_profile');

  const registrationCompletedCount = registrationFields.filter((f) => f.filled).length;
  const editProfileCompletedCount = editProfileFields.filter((f) => f.filled).length;

  const completedCount = registrationCompletedCount + editProfileCompletedCount;
  const totalCount = fields.length;
  const percentage = Math.round((completedCount / totalCount) * 100);

  return {
    percentage,
    completedCount,
    totalCount,
    registrationCompletedCount,
    registrationTotalCount: registrationFields.length,
    editProfileCompletedCount,
    editProfileTotalCount: editProfileFields.length,
    fields,
  };
}

const PUBLIC_COMPLETION_KEYS = new Set([
  'fullName',
  'batchYear',
  'position',
  'institution',
  'specialty',
  'degree',
  'city',
  'country',
  'bio',
  'profession',
  'cadre',
  'careerHistory',
]);

/**
 * Returns true when a member has completed all profile information.
 * Uses all 17 fields when full contact/ID details are available on the profile object;
 * for public-only projections (ALUMNI_PUBLIC_COLUMNS, where email/phone/whatsapp/fbLink/collegeRoll
 * are withheld for privacy), verifies all 12 public profile fields are filled.
 */
export function isProfileFullyCompleted(
  profile?: Partial<AlumniProfile> | null
): boolean {
  if (!profile) return false;
  const result = calculateProfileCompletion(profile);
  const hasPrivateContactProjection =
    profile.email !== undefined ||
    profile.phone !== undefined ||
    profile.whatsapp !== undefined ||
    profile.fbLink !== undefined ||
    profile.collegeRoll !== undefined;

  if (hasPrivateContactProjection) {
    return result.percentage === 100;
  }

  return result.fields
    .filter((f) => PUBLIC_COMPLETION_KEYS.has(f.key))
    .every((f) => f.filled);
}

/**
 * Evaluates completion from a raw snake_case `alumni_profiles` DB row.
 */
export function isPublicRowProfileCompleted(row: any): boolean {
  if (!row || typeof row !== 'object') return false;
  return isProfileFullyCompleted({
    fullName: row.full_name,
    batchYear: row.batch_year !== undefined && row.batch_year !== null ? Number(row.batch_year) : undefined,
    collegeRoll: row.college_roll ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    fbLink: row.fb_link ?? undefined,
    profession: row.profession ?? undefined,
    position: row.position ?? undefined,
    institution: row.institution ?? undefined,
    cadre: row.cadre ?? undefined,
    specialty: Array.isArray(row.specialty) ? row.specialty : [],
    degree: Array.isArray(row.degree) ? row.degree : [],
    city: row.city ?? undefined,
    country: row.country ?? undefined,
    bio: row.bio ?? undefined,
    careerHistory: Array.isArray(row.career_history) ? row.career_history : [],
  });
}
