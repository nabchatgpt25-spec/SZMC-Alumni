export function parsePositiveInt(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

export function clampBoundedInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.trunc(num);
  return Math.min(max, Math.max(min, rounded));
}

export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

export function normalizeOptionalEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim().toLowerCase();
  if (!clean) return null;
  if (clean.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    return null;
  }
  return clean;
}

export function normalizeSafeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/')) return trimmed.slice(0, 500);
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href.slice(0, 1000);
    }
  } catch {
    return null;
  }
  return null;
}

export const VALID_BLOOD_GROUPS = new Set([
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-',
]);

export function normalizeBloodGroup(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return VALID_BLOOD_GROUPS.has(upper) ? upper : null;
}
