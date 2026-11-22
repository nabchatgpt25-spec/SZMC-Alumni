export type QuadFeedFilter = 'for_you' | 'my_batch' | 'following' | 'latest';

export interface QuadFeedFilterOption {
  id: QuadFeedFilter;
  label: string;
  shortLabel: string;
  description: string;
}

export const QUAD_FEED_FILTERS: QuadFeedFilterOption[] = [
  {
    id: 'for_you',
    label: 'For You',
    shortLabel: 'For You',
    description: 'Prioritizes your batch, connections, pinned announcements, and active discussions',
  },
  {
    id: 'my_batch',
    label: 'My Batch',
    shortLabel: 'My Batch',
    description: 'Updates and discussions shared by your MBBS batchmates',
  },
  {
    id: 'following',
    label: 'Following',
    shortLabel: 'Following',
    description: 'Posts from connected alumni colleagues and followed spaces',
  },
  {
    id: 'latest',
    label: 'Latest',
    shortLabel: 'Latest',
    description: 'Chronological stream of the newest posts across SZMC Alumni',
  },
];

export type QuadPostCategory =
  | 'All'
  | 'General Discussion'
  | 'Announcement'
  | 'Achievement'
  | 'Career & Jobs'
  | 'Blood Request'
  | 'Events & Reunion'
  | 'Memories'
  | 'Help & Support';

export const QUAD_POST_CATEGORIES: QuadPostCategory[] = [
  'All',
  'General Discussion',
  'Announcement',
  'Achievement',
  'Career & Jobs',
  'Blood Request',
  'Events & Reunion',
  'Memories',
  'Help & Support',
];

/**
 * Maps legacy post categories (from 001_core_schema.sql) and new THE QUAD categories
 * into one unified matching helper so existing posts filter accurately before Phase 4 migration.
 */
export function matchesQuadCategory(
  postCategory: string | undefined | null,
  selectedCategory: QuadPostCategory
): boolean {
  if (selectedCategory === 'All') return true;
  const raw = (postCategory || '').trim().toLowerCase();
  const target = selectedCategory.toLowerCase();
  if (raw === target) return true;

  switch (selectedCategory) {
    case 'General Discussion':
      return raw === '' || raw === 'general update' || raw === 'tech & innovation' || raw === 'general';
    case 'Achievement':
      return raw === 'achievements' || raw === 'award' || raw === 'milestone';
    case 'Career & Jobs':
      return raw === 'professional insights' || raw === 'career' || raw === 'jobs';
    case 'Events & Reunion':
      return raw === 'reunion' || raw === 'events' || raw === 'event';
    case 'Announcement':
      return raw === 'official' || raw === 'official announcement' || raw === 'notice' || raw === 'notices';
    case 'Blood Request':
      return raw === 'blood' || raw === 'emergency' || raw === 'blood network';
    case 'Memories':
      return raw === 'nostalgia' || raw === 'heritage' || raw === 'archive' || raw === 'memory';
    case 'Help & Support':
      return raw === 'mentorship' || raw === 'help' || raw === 'support';
    default:
      return false;
  }
}

export interface OfficialPageSummary {
  slug: string;
  name: string;
  subtitle: string;
  category: QuadPostCategory;
  portalRoute?: string;
}

export const OFFICIAL_PAGES_DIRECTORY: OfficialPageSummary[] = [
  {
    slug: 'szmc-official',
    name: 'SZMC Official',
    subtitle: 'College notices & campus bulletins',
    category: 'Announcement',
  },
  {
    slug: 'alumni-association',
    name: 'Alumni Association',
    subtitle: 'Official governance & announcements',
    category: 'Announcement',
  },
  {
    slug: 'executive-committee',
    name: 'Executive Committee',
    subtitle: 'Leadership resolutions & initiatives',
    category: 'Announcement',
  },
  {
    slug: 'blood-donation-network',
    name: 'Blood Donation Network',
    subtitle: 'Urgent donor coordination',
    category: 'Blood Request',
    portalRoute: 'emergency',
  },
  {
    slug: 'career-and-mentorship',
    name: 'Career & Mentorship',
    subtitle: 'FCPS, MD/MS, BCS & guidance',
    category: 'Career & Jobs',
    portalRoute: 'careers',
  },
  {
    slug: 'alumni-events',
    name: 'Alumni Events',
    subtitle: 'SZMC DAY & batch reunions',
    category: 'Events & Reunion',
    portalRoute: 'events',
  },
];

export interface QuadPostsSummary {
  total: number;
  myBatchCount: number;
  followingCount: number;
  categoryCounts: Record<string, number>;
}
