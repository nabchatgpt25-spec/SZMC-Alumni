export type ProfileDisplayModeId = 'present' | 'glass' | (string & {});

export type ProfileDisplayModeStatus = 'available' | 'coming_soon';

export type ProfileDisplayModeScope = 'everyone' | 'alumni_only' | 'self_only';

export interface ProfileDisplayModeOption {
  id: ProfileDisplayModeId;
  name: string;
  shortLabel: string;
  description: string;
  status: ProfileDisplayModeStatus;
  /** Preview styling tokens for the Settings mode selector card */
  previewBgClass: string;
  previewCardClass: string;
  previewAccentClass: string;
}

export interface ProfileDisplayModePreference {
  modeId: ProfileDisplayModeId;
  visitorScope: ProfileDisplayModeScope;
  updatedAt: string;
}

/**
 * Extensible registry of alumni profile display modes.
 * Add new moods here in future releases and they will automatically appear in Settings.
 */
export const PROFILE_DISPLAY_MODES: ProfileDisplayModeOption[] = [
  {
    id: 'present',
    name: 'Present Mode',
    shortLabel: 'Default',
    description:
      'Clean institutional profile layout with crisp card surfaces, clear visual hierarchy, and high contrast readability.',
    status: 'available',
    previewBgClass: 'bg-slate-100 dark:bg-slate-800',
    previewCardClass: 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700',
    previewAccentClass: 'bg-blue-600',
  },
  {
    id: 'glass',
    name: 'Glass Mode',
    shortLabel: 'Liquid Glass',
    description:
      'Translucent frosted-glass profile presentation with subtle refraction, layered depth, and soft ambient highlights.',
    status: 'available',
    previewBgClass:
      'bg-gradient-to-br from-sky-100 via-indigo-100 to-cyan-100 dark:from-slate-800 dark:via-blue-950 dark:to-indigo-950',
    previewCardClass:
      'bg-white/65 dark:bg-slate-900/55 backdrop-blur-md border-white/70 dark:border-white/15',
    previewAccentClass: 'bg-cyan-500',
  },
  {
    id: 'executive',
    name: 'Executive Mode',
    shortLabel: 'Upcoming',
    description: 'Formal editorial academic portfolio layout tailored for senior consultants and faculty.',
    status: 'coming_soon',
    previewBgClass: 'bg-stone-100 dark:bg-stone-900',
    previewCardClass: 'bg-stone-50 dark:bg-stone-800/80 border-stone-200 dark:border-stone-700',
    previewAccentClass: 'bg-amber-600',
  },
  {
    id: 'minimal',
    name: 'Minimalist Mode',
    shortLabel: 'Upcoming',
    description: 'Ultra-clean distraction-free typography-first profile view with streamlined sections.',
    status: 'coming_soon',
    previewBgClass: 'bg-zinc-100 dark:bg-zinc-900',
    previewCardClass: 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800',
    previewAccentClass: 'bg-zinc-800 dark:bg-zinc-200',
  },
  {
    id: 'heritage',
    name: 'SZMC Heritage Mode',
    shortLabel: 'Upcoming',
    description: 'Classic Bogura campus-inspired ceremonial frame celebrating SZMC batch legacy.',
    status: 'coming_soon',
    previewBgClass: 'bg-emerald-50 dark:bg-emerald-950/50',
    previewCardClass: 'bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-900',
    previewAccentClass: 'bg-emerald-600',
  },
];

export const PROFILE_DISPLAY_MODE_EVENT = 'szmc_profile_display_mode_changed';

export const DEFAULT_PROFILE_DISPLAY_PREFERENCE: ProfileDisplayModePreference = {
  modeId: 'present',
  visitorScope: 'everyone',
  updatedAt: '',
};

function getStorageKey(userId?: number | string | null): string {
  return `szmc_profile_display_mode_v1_${userId ?? 'default'}`;
}

export function getProfileDisplayModeOption(modeId: ProfileDisplayModeId): ProfileDisplayModeOption {
  return (
    PROFILE_DISPLAY_MODES.find((m) => m.id === modeId && m.status === 'available') ||
    PROFILE_DISPLAY_MODES[0]
  );
}

export function getProfileDisplayModePreference(
  userId?: number | string | null
): ProfileDisplayModePreference {
  if (typeof window === 'undefined') {
    return DEFAULT_PROFILE_DISPLAY_PREFERENCE;
  }
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return DEFAULT_PROFILE_DISPLAY_PREFERENCE;
    const parsed = JSON.parse(raw);
    const validMode = PROFILE_DISPLAY_MODES.some(
      (m) => m.id === parsed?.modeId && m.status === 'available'
    )
      ? (parsed.modeId as ProfileDisplayModeId)
      : 'present';
    const validScope: ProfileDisplayModeScope =
      parsed?.visitorScope === 'alumni_only' || parsed?.visitorScope === 'self_only'
        ? parsed.visitorScope
        : 'everyone';
    return {
      modeId: validMode,
      visitorScope: validScope,
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return DEFAULT_PROFILE_DISPLAY_PREFERENCE;
  }
}

export function saveProfileDisplayModePreference(
  userId: number | string | null | undefined,
  patch: Partial<ProfileDisplayModePreference>
): ProfileDisplayModePreference {
  const current = getProfileDisplayModePreference(userId);
  const nextMode =
    patch.modeId &&
    PROFILE_DISPLAY_MODES.some((m) => m.id === patch.modeId && m.status === 'available')
      ? patch.modeId
      : current.modeId;
  const nextScope: ProfileDisplayModeScope =
    patch.visitorScope === 'everyone' ||
    patch.visitorScope === 'alumni_only' ||
    patch.visitorScope === 'self_only'
      ? patch.visitorScope
      : current.visitorScope;

  const next: ProfileDisplayModePreference = {
    modeId: nextMode,
    visitorScope: nextScope,
    updatedAt: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(getStorageKey(userId), JSON.stringify(next));
      window.dispatchEvent(
        new CustomEvent(PROFILE_DISPLAY_MODE_EVENT, {
          detail: { userId, preference: next },
        })
      );
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }

  return next;
}
