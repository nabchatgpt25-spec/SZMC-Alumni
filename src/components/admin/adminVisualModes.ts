import { useEffect, useState } from 'react';

export type AdminVisualModeId = 'neon_aura' | 'classic';

export interface AdminVisualModeMeta {
  id: AdminVisualModeId;
  name: string;
  tagline: string;
  status: 'available' | 'coming_soon';
}

/**
 * Extensible registry for Admin Dashboard appearance modes.
 * Mode 1 ('neon_aura') is the signature luminous motion-graphics command theme.
 * Additional visual modes can be added here later without altering admin features.
 */
export const ADMIN_VISUAL_MODES: AdminVisualModeMeta[] = [
  {
    id: 'neon_aura',
    name: 'Neon Aura (Mode 1)',
    tagline: 'Luminous midnight glass, animated circles, interactive bars & motion graphics',
    status: 'available',
  },
  {
    id: 'classic',
    name: 'Classic Clean',
    tagline: 'Standard light/dark institutional workspace',
    status: 'available',
  },
];

const STORAGE_KEY = 'szmc_admin_visual_mode_v1';
const CHANGE_EVENT = 'szmc_admin_visual_mode_changed';

export function getStoredAdminVisualMode(): AdminVisualModeId {
  if (typeof window === 'undefined') return 'neon_aura';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'classic' || saved === 'neon_aura') {
      return saved;
    }
  } catch {}
  return 'neon_aura';
}

export function setStoredAdminVisualMode(mode: AdminVisualModeId): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: mode }));
  } catch {}
}

export function useAdminVisualMode(): [AdminVisualModeId, (mode: AdminVisualModeId) => void] {
  const [mode, setModeState] = useState<AdminVisualModeId>(() => getStoredAdminVisualMode());

  useEffect(() => {
    const handler = (evt: Event) => {
      const next = (evt as CustomEvent<AdminVisualModeId>).detail;
      if (next === 'neon_aura' || next === 'classic') {
        setModeState(next);
      }
    };
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  }, []);

  const setMode = (next: AdminVisualModeId) => {
    setModeState(next);
    setStoredAdminVisualMode(next);
  };

  return [mode, setMode];
}
