export type ClinicalStatusKey =
  | 'on_duty'
  | 'in_ot'
  | 'on_call'
  | 'in_clinic'
  | 'studying';

export interface ClinicalStatusMeta {
  key: ClinicalStatusKey;
  label: string;
  description: string;
  requiresQuietWarning: boolean;
  dotClass: string;
  badgeClass: string;
  activeButtonClass: string;
}

export const CLINICAL_STATUS_META: Record<ClinicalStatusKey, ClinicalStatusMeta> = {
  on_duty: {
    key: 'on_duty',
    label: 'On Duty',
    description: 'Active on ward or hospital rounds',
    requiresQuietWarning: false,
    dotClass: 'bg-emerald-500',
    badgeClass:
      'bg-emerald-500/12 border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
    activeButtonClass:
      'bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-600/25',
  },
  in_ot: {
    key: 'in_ot',
    label: 'In OT',
    description: 'In Operating Theatre — scrub / procedure active',
    requiresQuietWarning: true,
    dotClass: 'bg-rose-500',
    badgeClass:
      'bg-rose-500/12 border-rose-500/30 text-rose-700 dark:text-rose-300',
    activeButtonClass:
      'bg-rose-600 border-rose-600 text-white shadow-sm shadow-rose-600/25',
  },
  in_clinic: {
    key: 'in_clinic',
    label: 'In Clinic',
    description: 'Seeing outpatients or chamber consultation',
    requiresQuietWarning: false,
    dotClass: 'bg-sky-500',
    badgeClass:
      'bg-sky-500/12 border-sky-500/30 text-sky-700 dark:text-sky-300',
    activeButtonClass:
      'bg-sky-600 border-sky-600 text-white shadow-sm shadow-sky-600/25',
  },
  studying: {
    key: 'studying',
    label: 'Studying',
    description: 'Exam prep (FCPS / MD / USMLE / PLAB)',
    requiresQuietWarning: false,
    dotClass: 'bg-violet-500',
    badgeClass:
      'bg-violet-500/12 border-violet-500/30 text-violet-700 dark:text-violet-300',
    activeButtonClass:
      'bg-violet-600 border-violet-600 text-white shadow-sm shadow-violet-600/25',
  },
  on_call: {
    key: 'on_call',
    label: 'On Call',
    description: 'Covering emergency or night call duties',
    requiresQuietWarning: true,
    dotClass: 'bg-amber-500',
    badgeClass:
      'bg-amber-500/12 border-amber-500/35 text-amber-800 dark:text-amber-300',
    activeButtonClass:
      'bg-amber-600 border-amber-600 text-white shadow-sm shadow-amber-600/25',
  },
};

export const CLINICAL_STATUS_OPTIONS: ClinicalStatusMeta[] = [
  CLINICAL_STATUS_META.on_duty,
  CLINICAL_STATUS_META.in_ot,
  CLINICAL_STATUS_META.in_clinic,
  CLINICAL_STATUS_META.studying,
  CLINICAL_STATUS_META.on_call,
];

export function isValidClinicalStatus(value: unknown): value is ClinicalStatusKey {
  return (
    value === 'on_duty' ||
    value === 'in_ot' ||
    value === 'on_call' ||
    value === 'in_clinic' ||
    value === 'studying'
  );
}

export function isQuietRecommendedStatus(status?: ClinicalStatusKey | null): status is 'in_ot' | 'on_call' {
  return status === 'in_ot' || status === 'on_call';
}

const STORAGE_PREFIX = 'szmc_clinical_status:';

export function loadSavedClinicalStatus(profileId?: number | null): ClinicalStatusKey | null {
  if (typeof window === 'undefined' || !profileId || !Number.isFinite(profileId)) return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${profileId}`);
    return isValidClinicalStatus(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function saveClinicalStatus(profileId: number | null | undefined, status: ClinicalStatusKey | null): void {
  if (typeof window === 'undefined' || !profileId || !Number.isFinite(profileId)) return;
  try {
    const key = `${STORAGE_PREFIX}${profileId}`;
    if (status) {
      localStorage.setItem(key, status);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore storage quota errors */
  }
}

export const SILENT_MESSAGE_MARKER = '[SZMC Silent]';

export function decodeSilentMessageBody(rawBody: string): { isSilent: boolean; body: string } {
  const input = typeof rawBody === 'string' ? rawBody : '';
  if (input === SILENT_MESSAGE_MARKER) {
    return { isSilent: true, body: '' };
  }
  if (input.startsWith(`${SILENT_MESSAGE_MARKER}\n`)) {
    return {
      isSilent: true,
      body: input.slice(SILENT_MESSAGE_MARKER.length + 1),
    };
  }
  if (input.startsWith(`${SILENT_MESSAGE_MARKER} `)) {
    return {
      isSilent: true,
      body: input.slice(SILENT_MESSAGE_MARKER.length + 1),
    };
  }
  return { isSilent: false, body: input };
}

export function encodeSilentMessageBody(body: string): string {
  const { body: clean } = decodeSilentMessageBody(body ?? '');
  const trimmed = clean.trim();
  if (!trimmed) return SILENT_MESSAGE_MARKER;
  return `${SILENT_MESSAGE_MARKER}\n${clean}`;
}
