export interface SmallAdminPermissions {
  canVerifyAlumni: boolean;
  canDeletePosts: boolean;
  canViewDirectory: boolean;
}

export interface SmallAdminUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  role: 'moderator';
  appointedAt: string;
  appointedBy: string;
  isActive: boolean;
  permissions: SmallAdminPermissions;
  notes?: string;
}

const STORAGE_KEY = 'portal_small_admins_list';

const DEFAULT_SMALL_ADMINS: SmallAdminUser[] = [
  {
    id: 'sa-initial-1',
    email: 'tahsin.moderator@szmc.edu.bd',
    fullName: 'Dr. Tahsin Ahmed (Batch 26)',
    avatarUrl: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80',
    role: 'moderator',
    appointedAt: new Date(Date.now() - 86400000 * 14).toISOString(),
    appointedBy: 'System Super Admin',
    isActive: true,
    permissions: {
      canVerifyAlumni: true,
      canDeletePosts: true,
      canViewDirectory: true,
    },
    notes: 'Batch 26 Coordinator & Clinical Tutor',
  },
  {
    id: 'sa-initial-2',
    email: 'samia.szmc28@gmail.com',
    fullName: 'Dr. Samia Chowdhury (Batch 28)',
    avatarUrl: 'https://images.unsplash.com/photo-1594824813624-95996f014e38?w=150&auto=format&fit=crop&q=80',
    role: 'moderator',
    appointedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    appointedBy: 'System Super Admin',
    isActive: true,
    permissions: {
      canVerifyAlumni: true,
      canDeletePosts: false,
      canViewDirectory: true,
    },
    notes: 'Sub-Admin for ID Verification Queue',
  },
];

export function getSmallAdminsList(): SmallAdminUser[] {
  try {
    if (typeof window === 'undefined') return DEFAULT_SMALL_ADMINS;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SMALL_ADMINS));
      return DEFAULT_SMALL_ADMINS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SMALL_ADMINS;
  } catch {
    return DEFAULT_SMALL_ADMINS;
  }
}

export function appointSmallAdmin(admin: Omit<SmallAdminUser, 'id' | 'appointedAt' | 'isActive'>): SmallAdminUser {
  const current = getSmallAdminsList();
  const newAdmin: SmallAdminUser = {
    ...admin,
    id: `sa-${Date.now()}`,
    appointedAt: new Date().toISOString(),
    isActive: true,
  };
  const updated = [newAdmin, ...current];
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }
  return newAdmin;
}

export function toggleSmallAdminStatus(id: string): boolean {
  const current = getSmallAdminsList();
  const updated = current.map((a) => (a.id === id ? { ...a, isActive: !a.isActive } : a));
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }
  return true;
}

export function removeSmallAdmin(id: string): boolean {
  const current = getSmallAdminsList();
  const updated = current.filter((a) => a.id !== id);
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }
  return true;
}
