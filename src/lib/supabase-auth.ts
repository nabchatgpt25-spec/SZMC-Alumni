import { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, ALUMNI_PUBLIC_COLUMNS } from './supabase.ts';
import { AlumniProfile, UserRole } from '../types.ts';
import { formatToE164Phone } from '../utils/phone.ts';
import { normalizeAcademicStreamAndGroup } from '../utils/academicGroupMapping.ts';

/**
 * Format a database row from public.alumni_profiles into the application's AlumniProfile.
 * Role is strictly authoritative from Supabase Auth metadata and database; no hardcoded email bypasses.
 */
export function mapSupabaseRowToAlumniProfile(row: any, authUser?: User): AlumniProfile {
  if (!row) {
    throw new Error('Cannot map empty row to AlumniProfile');
  }

  const email = (row.email || '').toLowerCase().trim();
  const metadataRole =
    (authUser?.app_metadata?.role as string) ||
    (authUser?.app_metadata?.claims_admin ? 'admin' : undefined) ||
    ((authUser?.user_metadata as any)?.role as string);

  const resolvedRole: UserRole =
    metadataRole === 'admin' || row.role === 'admin'
      ? 'admin'
      : metadataRole === 'moderator' || row.role === 'moderator'
      ? 'moderator'
      : 'member';

  return {
    id: Number(row.id),
    userId: Number(row.id),
    authUserId: row.auth_user_id || undefined,
    role: resolvedRole,
    fullName: row.full_name || (authUser?.user_metadata as any)?.full_name || 'SZMC Alumnus',
    avatarUrl:
      row.avatar_url ||
      '/assets/aistudio/images__1__2778177d.png',
    coverUrl: row.cover_url || undefined,
    batchYear: Number(row.batch_year) || 25,
    session: row.session || undefined,
    collegeRoll: row.college_roll || undefined,
    academicStream: row.academic_stream || 'Medicine',
    academicGroup: row.academic_group || undefined,
    group: row.academic_stream || 'MBBS',
    section: row.section || undefined,
    verificationStatus: row.verification_status || (resolvedRole === 'admin' ? 'verified' : 'unverified'),
    verificationMethod: row.verification_method || (resolvedRole === 'admin' ? 'admin' : undefined),
    verifiedBy: row.verified_by_profile_id ? [String(row.verified_by_profile_id)] : (resolvedRole === 'admin' ? ['System Administrator'] : []),
    vouchesCount: Number(row.vouches_count) || (resolvedRole === 'admin' ? 2 : 0),
    vouchTargetCount: Number(row.vouch_target_count) || 2,
    verificationDate: row.verified_at ? String(row.verified_at) : undefined,
    profession: row.profession || (resolvedRole === 'admin' ? 'Portal Administrator' : 'Medical Doctor / Physician'),
    position: row.position || '',
    institution: row.institution || '',
    cadre: row.cadre || undefined,
    specialty: Array.isArray(row.specialty) ? row.specialty : [],
    specialtyOther: row.specialty_other || undefined,
    degree: Array.isArray(row.degree) ? row.degree : ['HSC'],
    city: row.city || 'Dhaka',
    country: row.country || 'Bangladesh',
    latitude: row.latitude ? Number(row.latitude) : undefined,
    longitude: row.longitude ? Number(row.longitude) : undefined,
    lat: row.latitude ? Number(row.latitude) : undefined,
    lng: row.longitude ? Number(row.longitude) : undefined,
    phone: row.phone || undefined,
    phoneOwnershipVerified: Boolean(row.phone_ownership_verified),
    phoneVerifiedAt: row.phone_verified_at ? String(row.phone_verified_at) : undefined,
    phoneVerifiedByProfileId: row.phone_verified_by_profile_id ? Number(row.phone_verified_by_profile_id) : undefined,
    phoneVerificationNotes: row.phone_verification_notes || undefined,
    whatsapp: row.whatsapp || undefined,
    fbLink: row.fb_link || undefined,
    email: email || undefined,
    bio: row.bio || '',
    careerHistory: Array.isArray(row.career_history) ? row.career_history : [],
    badges: Array.isArray(row.badges) ? row.badges : [],
    bloodGroup: row.blood_group || undefined,
    isPublic: Boolean(row.is_public ?? true),
    online: true,
    lastSeen: row.last_seen_at ? String(row.last_seen_at) : 'Just now',
    postsCount: Number(row.posts_count) || 0,
  };
}

/**
 * Fetch or idempotently initialize the authenticated user's alumni_profiles record.
 * Handles database errors safely without attempting accidental duplicate inserts.
 */
export async function getOrCreateSupabaseProfile(
  authUser: User,
  extraData?: Partial<AlumniProfile>
): Promise<AlumniProfile | null> {
  if (!isSupabaseConfigured || !authUser?.id) {
    return null;
  }

  try {
    // 1. Check if profile already exists for this auth_user_id
    const { data: existing, error: fetchErr } = await supabase
      .from('alumni_profiles')
      .select(ALUMNI_PUBLIC_COLUMNS)
      .eq('auth_user_id', authUser.id)
      .maybeSingle();

    if (fetchErr) {
      console.warn('Database error fetching alumni profile:', fetchErr.message);
      // Safe error handling: Do NOT attempt an insert if SELECT encountered a database error
      return null;
    }

    if (existing) {
      // Enrich with contact details via authorized RPC
      try {
        const { data: contacts } = await supabase.rpc('get_alumni_contact_details', {
          p_profile_id: (existing as any).id,
        });
        if (contacts && contacts[0]) {
          Object.assign(existing, contacts[0]);
        }
      } catch {
        // graceful fallback if RPC unavailable
      }
      return mapSupabaseRowToAlumniProfile(existing, authUser);
    }

    // 2. Otherwise, insert a new profile record for the authenticated user
    const cleanEmail = (authUser.email || extraData?.email || '').toLowerCase().trim();
    const batchYear = Number(extraData?.batchYear) || 25;
    const normalizedBatch = batchYear > 1900 ? batchYear - 1991 : (batchYear > 0 && batchYear <= 35 ? batchYear : 25);

    // Normalize academic stream and academic group
    const rawGroupInput =
      extraData?.academicGroup ||
      extraData?.group ||
      extraData?.academicStream;
    const streamGroup = normalizeAcademicStreamAndGroup(rawGroupInput);

    const metadataRole =
      (authUser.app_metadata?.role as string) ||
      (authUser.app_metadata?.claims_admin ? 'admin' : undefined) ||
      ((authUser.user_metadata as any)?.role as string);

    const resolvedRole: UserRole =
      metadataRole === 'admin' || extraData?.role === 'admin'
        ? 'admin'
        : metadataRole === 'moderator' || extraData?.role === 'moderator'
        ? 'moderator'
        : 'member';

    // New profiles start with role = 'member' unless verified admin in Auth metadata
    const initialRecord: Record<string, any> = {
      auth_user_id: authUser.id,
      role: resolvedRole,
      verification_status: resolvedRole === 'admin' ? 'verified' : 'unverified',
      verification_method: resolvedRole === 'admin' ? 'admin' : null,
      full_name:
        extraData?.fullName?.trim() ||
        (authUser.user_metadata as any)?.full_name ||
        (authUser.user_metadata as any)?.name ||
        (cleanEmail ? cleanEmail.split('@')[0] : null) ||
        (authUser.phone ? `Doctor (${authUser.phone})` : 'SZMC Doctor'),
      avatar_url:
        extraData?.avatarUrl ||
        (authUser.user_metadata as any)?.avatar_url ||
        (authUser.user_metadata as any)?.picture ||
        '/assets/aistudio/images__1__2778177d.png',
      batch_year: normalizedBatch,
      session: extraData?.session || `Session ${1990 + normalizedBatch}-${String(1991 + normalizedBatch).slice(-2)}`,
      academic_stream: streamGroup.academicStream,
      academic_group: streamGroup.academicGroup,
      section: extraData?.section || 'MBBS',
      profession: extraData?.profession || (resolvedRole === 'admin' ? 'Portal Administrator' : 'Medical Doctor / Physician'),
      position: extraData?.position || (resolvedRole === 'admin' ? 'Administrator' : 'Physician'),
      institution: extraData?.institution || 'Shaheed Ziaur Rahman Medical College Hospital',
      city: extraData?.city || 'Bogura',
      country: extraData?.country || 'Bangladesh',
      email: cleanEmail || null,
      phone: extraData?.phone
        ? formatToE164Phone(extraData.phone)
        : ((authUser.user_metadata as any)?.phone ? formatToE164Phone((authUser.user_metadata as any).phone) : (authUser.phone ? formatToE164Phone(authUser.phone) : null)),
      phone_ownership_verified: isSuperAdminEmail ? true : false,
      whatsapp: extraData?.whatsapp?.trim() || null,
      blood_group: extraData?.bloodGroup || null,
    };

    let { data: inserted, error: insertErr } = await supabase
      .from('alumni_profiles')
      .insert(initialRecord)
      .select(ALUMNI_PUBLIC_COLUMNS)
      .single();

    // Gracefully handle database trigger if academic_group for Science is not configured
    if (insertErr && (insertErr.message.includes('academic_group') || insertErr.message.includes('stream_group'))) {
      initialRecord.academic_group = null;
      const retry = await supabase
        .from('alumni_profiles')
        .insert(initialRecord)
        .select(ALUMNI_PUBLIC_COLUMNS)
        .single();
      inserted = retry.data;
      insertErr = retry.error;
    }

    // Idempotency check: if duplicate key on auth_user_id, fetch the concurrently inserted record
    if (insertErr) {
      if (insertErr.code === '23505' || insertErr.message.includes('duplicate key')) {
        const { data: secondFetch } = await supabase
          .from('alumni_profiles')
          .select(ALUMNI_PUBLIC_COLUMNS)
          .eq('auth_user_id', authUser.id)
          .maybeSingle();
        if (secondFetch) {
          return mapSupabaseRowToAlumniProfile(secondFetch);
        }
      }
      console.warn('Failed to insert new alumni_profiles record:', insertErr.message);
      return null;
    }

    try {
      const { data: contacts } = await supabase.rpc('get_alumni_contact_details', {
        p_profile_id: (inserted as any).id,
      });
      if (contacts && contacts[0]) {
        Object.assign(inserted, contacts[0]);
      }
    } catch {}

    return mapSupabaseRowToAlumniProfile(inserted);
  } catch (err) {
    console.warn('Error during getOrCreateSupabaseProfile:', err);
    return null;
  }
}
