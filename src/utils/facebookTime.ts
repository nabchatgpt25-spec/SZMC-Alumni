function parseDateInput(input: string | number | Date | undefined | null): Date | null {
  if (!input) return null;
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }
  if (typeof input === 'number') {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (trimmed.toLowerCase() === 'just now') return new Date();

    if (/^\d{10,13}$/.test(trimmed)) {
      const num = Number(trimmed);
      const d = new Date(num > 1e11 ? num : num * 1000);
      if (!isNaN(d.getTime())) return d;
    }

    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export function formatFacebookTime(input: string | number | Date | undefined | null): string {
  if (!input) return 'Just now';
  if (typeof input === 'string' && input.trim().toLowerCase() === 'just now') {
    return 'Just now';
  }
  const date = parseDateInput(input);
  if (!date) {
    return typeof input === 'string' ? input : 'Just now';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 45 * 1000) {
    return 'Just now';
  }

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 60) {
    return `${Math.max(1, diffMin)}m`;
  }

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (diffHours < 24) {
    if (
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()
    ) {
      return `${diffHours}h`;
    }
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return `Yesterday at ${timeStr}`;
  }

  if (diffDays < 7) {
    return `${Math.max(1, diffDays)}d`;
  }

  const monthShort = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();

  if (date.getFullYear() === now.getFullYear()) {
    return `${monthShort} ${day} at ${timeStr}`;
  }

  return `${monthShort} ${day}, ${date.getFullYear()} at ${timeStr}`;
}
