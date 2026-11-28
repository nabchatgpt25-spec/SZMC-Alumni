import { useState, useEffect } from 'react';
import {
  DEFAULT_GLOBAL_THEME_CONFIG,
  applyGlobalThemeToDom,
  type GlobalThemeConfig,
} from '../data/globalThemePresets';

export interface SiteNotice {
  id: string;
  refNo: string;
  title: string;
  category: 'Membership' | 'Reunion' | 'Scholarship' | 'General' | 'AGM' | 'Emergency';
  publishedDate: string;
  isUrgent: boolean;
  isPinned: boolean;
  isPublished: boolean;
  summary: string;
  fullContent: string;
  pdfUrl?: string | null;
  fileSize?: string | null;
  signatoryName: string;
  signatoryDesignation: string;
  signatoryOrganization: string;
}

export interface FeaturedAlumnus {
  id: string;
  name: string;
  isAlumni?: boolean; // true = SZMC Alumnus (default), false = Non-Alumnus (Faculty, Principal, Patron, Guest, etc.)
  nonAlumniRole?: string; // e.g. 'Former Principal', 'Distinguished Faculty', 'Honorary Patron', 'Special Guest'
  batch: number; // 0 when isAlumni === false
  category: 'Medicine' | 'Surgery' | 'Pediatrics' | 'Public Service' | 'Engineering' | 'Business' | 'Academia' | 'Arts & Sports' | 'Global' | 'Honorary & Faculty';
  designation: string;
  institution: string;
  city?: string;
  country?: string;
  avatarUrl: string;
  achievementSummary: string;
  order: number;
}

export interface BatchMetadata {
  batchNumber: number;
  session: string;
  admissionYear: number;
  representativeName: string;
  representativeContact?: string;
  estimatedClassSize: number;
  specialNote?: string;
}

export interface PortalTypographyConfig {
  enabled: boolean;
  headingFont: string;
  bodyFont: string;
  headingColorLight: string;
  bodyColorLight: string;
  mutedColorLight: string;
  accentColorLight: string;
  headingColorDark: string;
  bodyColorDark: string;
  mutedColorDark: string;
  accentColorDark: string;
  baseScale: number; // 0.85 to 1.25
  headingWeight: '500' | '600' | '700' | '800';
  bodyWeight: '400' | '500' | '600';
  headingTracking: 'tight' | 'normal' | 'wide';
  bodyLineHeight: 'compact' | 'normal' | 'relaxed';
  headingStyle: 'normal' | 'italic';
  headingTransform: 'none' | 'capitalize' | 'uppercase';
}

export interface PortalFontOption {
  name: string;
  label: string;
  category: 'Sans-Serif' | 'Serif' | 'Monospace';
  googleFamilyQuery: string;
}

export const PORTAL_FONT_OPTIONS: PortalFontOption[] = [
  { name: 'Inter', label: 'Inter (Clean Standard)', category: 'Sans-Serif', googleFamilyQuery: 'Inter:wght@400;500;600;700;800' },
  { name: 'Hind Siliguri', label: 'Hind Siliguri (EN & বাংলা)', category: 'Sans-Serif', googleFamilyQuery: 'Hind+Siliguri:wght@300;400;500;600;700' },
  { name: 'Plus Jakarta Sans', label: 'Plus Jakarta Sans', category: 'Sans-Serif', googleFamilyQuery: 'Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600' },
  { name: 'DM Sans', label: 'DM Sans', category: 'Sans-Serif', googleFamilyQuery: 'DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600' },
  { name: 'Outfit', label: 'Outfit', category: 'Sans-Serif', googleFamilyQuery: 'Outfit:wght@400;500;600;700;800' },
  { name: 'Manrope', label: 'Manrope', category: 'Sans-Serif', googleFamilyQuery: 'Manrope:wght@400;500;600;700;800' },
  { name: 'Playfair Display', label: 'Playfair Display', category: 'Serif', googleFamilyQuery: 'Playfair+Display:ital,wght@0,500;0,600;0,700;0,800;1,500;1,700' },
  { name: 'Fraunces', label: 'Fraunces', category: 'Serif', googleFamilyQuery: 'Fraunces:ital,wght@0,500;0,600;0,700;0,800;1,500;1,700' },
  { name: 'Lora', label: 'Lora', category: 'Serif', googleFamilyQuery: 'Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600' },
  { name: 'Merriweather', label: 'Merriweather', category: 'Serif', googleFamilyQuery: 'Merriweather:ital,wght@0,400;0,700;1,400;1,700' },
  { name: 'JetBrains Mono', label: 'JetBrains Mono', category: 'Monospace', googleFamilyQuery: 'JetBrains+Mono:wght@400;500;600;700' },
];

export const DEFAULT_PORTAL_TYPOGRAPHY: PortalTypographyConfig = {
  enabled: false,
  headingFont: 'Inter',
  bodyFont: 'Inter',
  headingColorLight: '#0f172a',
  bodyColorLight: '#334155',
  mutedColorLight: '#64748b',
  accentColorLight: '#1d4ed8',
  headingColorDark: '#f8fafc',
  bodyColorDark: '#e2e8f0',
  mutedColorDark: '#94a3b8',
  accentColorDark: '#60a5fa',
  baseScale: 1,
  headingWeight: '700',
  bodyWeight: '400',
  headingTracking: 'normal',
  bodyLineHeight: 'normal',
  headingStyle: 'normal',
  headingTransform: 'none',
};

export interface SiteConfig {
  // 1. Branding & Identity
  siteTitle: string;
  siteTagline: string;
  logoUrl: string;
  faviconUrl: string;
  establishedYear: number;
  collegeMotto: string;
  mottoSubtext: string;
  helplinePhone: string;
  contactEmail: string;
  secretariatAddress: string;

  // 2. Hero & Background Styling
  heroPrefix: string;
  heroHighlight: string;
  heroSuffix: string;
  heroSubtitle: string;
  heroBackgroundTexture: 'Mesh' | 'Aurora' | 'Vignette' | 'Campus Photo';
  heroOverlayOpacity: number; // 0 to 100
  heroBackgroundImageUrl?: string; // Custom or preset hero background image
  homepageCustomBackground?: string; // Optional full page background image
  heroBannerBadgeText?: string;
  heroCtaPrimaryText?: string;
  heroCtaSecondaryText?: string;

  // 2b. Homepage Section Visibility Controls
  showHeroSection?: boolean;
  showBloodNeededSection?: boolean;
  showBatchesSection?: boolean;
  showFeaturedAlumniSection?: boolean;
  showGallerySection?: boolean;
  showFaqSection?: boolean;

  // 3. Live Emergency Banner & Ticker
  liveTickerEnabled: boolean;
  liveTickerUrgency: 'standard' | 'urgent' | 'emergency';
  liveTickerMessage: string;
  liveTickerActionText: string;
  liveTickerActionUrl: string;

  // 4. System Controls & Auth Governance
  globalVerificationEnabled: boolean; // ON/OFF the verification system of whole website auth!
  autoVerificationEnabled: boolean; // 7-day auto-verification for new profiles
  autoVerificationUntil: string; // ISO date string: 7 days from activation
  autoVerificationPaused: boolean; // Super admin can pause/resume anytime
  maintenanceMode: boolean;
  maintenanceMessage: string;
  publicRegistrationOpen: boolean;
  phoneVerificationRequired: boolean;
  guestBrowsingAllowed: boolean;

  // 5. Reunion Event Configuration
  reunionTitle: string;
  reunionDate: string;
  reunionVenue: string;
  reunionRegistrationUrl: string;
  reunionStatus: 'open' | 'closing_soon' | 'closed';
  ticketPrices: {
    earlyBird: number;
    general: number;
    family: number;
    student: number;
  };
  reunionBannerUrl: string;

  // 6. Banking & Financial Info
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankRoutingNumber: string;
  bankBranch: string;
  bKashMerchantNumber: string;
  nagadMerchantNumber: string;
  rocketNumber: string;

  // 7. Anthem & Background Audio
  anthemTitle: string;
  anthemAudioUrl: string;
  anthemAutoPlay: boolean;

  // 8. Official Notices
  notices: SiteNotice[];

  // 9. Featured Alumni / Hall of Fame
  featuredAlumni: FeaturedAlumnus[];

  // 10. Batch Governance
  batchMetadataList: BatchMetadata[];

  // 11. Global Portal Typography, Colors & Text Styles (Super Admin controlled)
  portalTypography?: PortalTypographyConfig;

  // 12. Global Theme Manager Presets & :root CSS Variables (Admin Settings controlled)
  globalTheme?: GlobalThemeConfig;
}

export const FACTORY_DEFAULT_SITE_CONFIG: SiteConfig = {
  siteTitle: 'SZMC Alumni Portal',
  siteTagline: 'Shaheed Ziaur Rahman Medical College Alumni Association',
  logoUrl: '/szmc-logo.png',
  faviconUrl: '/szmc-logo.png',
  establishedYear: 1992,
  collegeMotto: 'Once a SZMCian, Always a SZMCian.',
  mottoSubtext: '35 MBBS Batches • One Lifelong Medical Fraternity • Silimpur, Bogura',
  helplinePhone: '+880 1711-234567',
  contactEmail: 'contact@szmcalumni.net',
  secretariatAddress: 'SZMC Campus, Silimpur, Bogura-5800, Bangladesh',

  heroPrefix: 'The Eternal Brotherhood of',
  heroHighlight: 'Shaheed Ziaur Rahman Medical College',
  heroSuffix: 'Alumni Worldwide',
  heroSubtitle: 'Uniting 35 MBBS batches, world-class specialists, clinical researchers, and healthcare changemakers across the globe.',
  heroBackgroundTexture: 'Campus Photo',
  heroOverlayOpacity: 65,
  heroBackgroundImageUrl: '/assets/szmc/szmc_day_1.jpg',
  homepageCustomBackground: '',
  heroBannerBadgeText: '35 MBBS Batches • Silimpur, Bogura • Estd. 1992',
  heroCtaPrimaryText: 'Alumni Login',
  heroCtaSecondaryText: 'Join the SZMC Alumni Family',
  showHeroSection: true,
  showBloodNeededSection: true,
  showBatchesSection: true,
  showFeaturedAlumniSection: true,
  showGallerySection: true,
  showFaqSection: true,

  liveTickerEnabled: true,
  liveTickerUrgency: 'emergency',
  liveTickerMessage: '🚨 Emergency O-Negative Blood needed urgently at SZMCH ICU. Contact Blood Desk or response team immediately!',
  liveTickerActionText: 'Respond Now',
  liveTickerActionUrl: '#blood',

  globalVerificationEnabled: true,
  autoVerificationEnabled: true,
  autoVerificationUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  autoVerificationPaused: false,
  maintenanceMode: false,
  maintenanceMessage: 'The portal is currently undergoing scheduled institutional maintenance. Please check back shortly.',
  publicRegistrationOpen: true,
  phoneVerificationRequired: true,
  guestBrowsingAllowed: true,

  reunionTitle: 'SZMC Grand Alumni Reunion & Academic Conclave 2026',
  reunionDate: '2026-12-25',
  reunionVenue: 'Shaheed Ziaur Rahman Medical College Auditorium & Campus Greens, Bogura',
  reunionRegistrationUrl: '#events',
  reunionStatus: 'open',
  ticketPrices: {
    earlyBird: 2500,
    general: 3500,
    family: 5000,
    student: 1500,
  },
  reunionBannerUrl: '/assets/szmc/szmc_day_1.jpg',

  bankName: 'Sonali Bank PLC',
  bankAccountName: 'SZMC Alumni Association Welfare Fund',
  bankAccountNumber: '01020304050607',
  bankRoutingNumber: '200270123',
  bankBranch: 'Silimpur Medical College Branch, Bogura',
  bKashMerchantNumber: '01711234567',
  nagadMerchantNumber: '01711234568',
  rocketNumber: '01711234569',

  anthemTitle: 'SZMC Ceremonial Alma Mater Anthem',
  anthemAudioUrl: 'https://cdn.freesound.org/previews/612/612610_5674468-lq.mp3',
  anthemAutoPlay: false,

  notices: [
    {
      id: 'notice-1',
      refNo: 'SZMC-AA/2026/041',
      title: 'Call for Registrations: 35th Anniversary Grand Alumni Conclave & CME Session',
      category: 'Reunion',
      publishedDate: '2026-10-15',
      isUrgent: true,
      isPinned: true,
      isPublished: true,
      summary: 'Official registration for the 35th Anniversary Grand Alumni Conclave is now open for all verified MBBS alumni batches.',
      fullContent: 'The Central Executive Committee of Shaheed Ziaur Rahman Medical College Alumni Association cordially invites all respected graduates of Batches 1 through 35 to the Grand Reunion 2026. Academic symposiums, batch galas, and life-membership drives will be organized.',
      pdfUrl: '#',
      fileSize: '1.8 MB',
      signatoryName: 'Dr. Nurul Anam Bashir',
      signatoryDesignation: 'Super Administrator & Patron',
      signatoryOrganization: 'SZMC Alumni Central Committee',
    },
    {
      id: 'notice-2',
      refNo: 'SZMC-AA/2026/039',
      title: 'Emergency Blood Network Protocol & 24/7 Coordinator Desk Operational Guidelines',
      category: 'Emergency',
      publishedDate: '2026-10-01',
      isUrgent: true,
      isPinned: false,
      isPublished: true,
      summary: 'Updated emergency blood broadcast standards for critical patient cases in Northern Bengal hospitals.',
      fullContent: 'All verified medical alumni registered on the SZMC Blood Network are requested to update their availability status and preferred zone for emergency platelet and rare blood group matching.',
      pdfUrl: '#',
      fileSize: '950 KB',
      signatoryName: 'General Secretary',
      signatoryDesignation: 'Executive Council',
      signatoryOrganization: 'SZMC Alumni Welfare Trust',
    },
  ],

  featuredAlumni: [
    {
      id: 'fa-1',
      name: 'Prof. Dr. Mahbubur Rahman',
      batch: 1,
      category: 'Medicine',
      designation: 'Professor & Head of Cardiology',
      institution: 'National Institute of Cardiovascular Diseases (NICVD)',
      avatarUrl: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=300&auto=format&fit=crop&q=80',
      achievementSummary: 'Pioneered advanced interventional electrophysiology and cardiac catheterization units in northern Bangladesh.',
      order: 1,
    },
    {
      id: 'fa-2',
      name: 'Dr. Sabrina Sultana',
      batch: 14,
      category: 'Public Service',
      designation: 'Director of Disease Surveillance',
      institution: 'World Health Organization (WHO) Regional Office',
      avatarUrl: 'https://images.unsplash.com/photo-1594824813583-b9b5f58c704a?w=300&auto=format&fit=crop&q=80',
      achievementSummary: 'Led international epidemiology missions for vaccine equity and maternal health survival initiatives.',
      order: 2,
    },
    {
      id: 'fa-3',
      name: 'Dr. Tanvir Ahmed',
      batch: 21,
      category: 'Academia',
      designation: 'Associate Professor of Neurosurgery',
      institution: 'Bangabandhu Sheikh Mujib Medical University (BSMMU)',
      avatarUrl: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=300&auto=format&fit=crop&q=80',
      achievementSummary: 'Published 40+ peer-reviewed neuro-oncology papers and received the National Young Surgeon Excellence Award.',
      order: 3,
    },
  ],

  batchMetadataList: Array.from({ length: 35 }, (_, i) => {
    const batchNum = i + 1;
    const admissionYear = 1991 + batchNum;
    return {
      batchNumber: batchNum,
      session: `${admissionYear}-${(admissionYear + 1).toString().slice(-2)}`,
      admissionYear,
      representativeName: batchNum === 34 ? 'Dr. Nurul Anam Bashir' : `Batch ${batchNum} Coordinator`,
      estimatedClassSize: batchNum <= 10 ? 50 : batchNum <= 20 ? 100 : 180,
      specialNote: batchNum === 34 ? 'Pacesetter Batch 34 • Portal Architecture' : `MBBS Batch ${batchNum} Alumni Group`,
    };
  }),

  portalTypography: DEFAULT_PORTAL_TYPOGRAPHY,
};

const loadedGoogleFonts = new Set<string>();

export function loadGoogleFontIfNeeded(fontName?: string | null): void {
  if (typeof document === 'undefined' || !fontName) return;
  const trimmed = fontName.trim();
  if (!trimmed || loadedGoogleFonts.has(trimmed)) return;
  const matched = PORTAL_FONT_OPTIONS.find((f) => f.name === trimmed);
  const query = matched
    ? matched.googleFamilyQuery
    : `${encodeURIComponent(trimmed).replace(/%20/g, '+')}:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600`;
  const linkId = `szmc-google-font-${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  if (document.getElementById(linkId)) {
    loadedGoogleFonts.add(trimmed);
    return;
  }
  const link = document.createElement('link');
  link.id = linkId;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${query}&display=swap`;
  document.head.appendChild(link);
  loadedGoogleFonts.add(trimmed);
}

export function applyPortalTypographyToDom(config?: SiteConfig | null): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const typo: PortalTypographyConfig = {
    ...DEFAULT_PORTAL_TYPOGRAPHY,
    ...(config?.portalTypography || {}),
  };

  if (!typo.enabled) {
    root.removeAttribute('data-portal-custom-typography');
    const props = [
      '--portal-font-heading',
      '--portal-font-body',
      '--portal-heading-color-light',
      '--portal-body-color-light',
      '--portal-muted-color-light',
      '--portal-accent-color-light',
      '--portal-heading-color-dark',
      '--portal-body-color-dark',
      '--portal-muted-color-dark',
      '--portal-accent-color-dark',
      '--portal-font-scale',
      '--portal-heading-weight',
      '--portal-body-weight',
      '--portal-heading-tracking',
      '--portal-body-line-height',
      '--portal-heading-style',
      '--portal-heading-transform',
    ];
    props.forEach((p) => root.style.removeProperty(p));
    return;
  }

  loadGoogleFontIfNeeded(typo.headingFont);
  loadGoogleFontIfNeeded(typo.bodyFont);

  const headingFallback =
    PORTAL_FONT_OPTIONS.find((f) => f.name === typo.headingFont)?.category === 'Serif'
      ? 'Georgia, serif'
      : PORTAL_FONT_OPTIONS.find((f) => f.name === typo.headingFont)?.category === 'Monospace'
      ? 'ui-monospace, monospace'
      : 'system-ui, -apple-system, sans-serif';

  const bodyFallback =
    PORTAL_FONT_OPTIONS.find((f) => f.name === typo.bodyFont)?.category === 'Serif'
      ? 'Georgia, serif'
      : PORTAL_FONT_OPTIONS.find((f) => f.name === typo.bodyFont)?.category === 'Monospace'
      ? 'ui-monospace, monospace'
      : 'system-ui, -apple-system, sans-serif';

  const trackingMap: Record<PortalTypographyConfig['headingTracking'], string> = {
    tight: '-0.025em',
    normal: '0em',
    wide: '0.03em',
  };

  const lineHeightMap: Record<PortalTypographyConfig['bodyLineHeight'], string> = {
    compact: '1.4',
    normal: '1.6',
    relaxed: '1.8',
  };

  const clampedScale = Math.min(1.25, Math.max(0.85, Number(typo.baseScale) || 1));

  root.setAttribute('data-portal-custom-typography', 'true');
  root.style.setProperty('--portal-font-heading', `'${typo.headingFont}', ${headingFallback}`);
  root.style.setProperty('--portal-font-body', `'${typo.bodyFont}', ${bodyFallback}`);
  root.style.setProperty('--portal-heading-color-light', typo.headingColorLight);
  root.style.setProperty('--portal-body-color-light', typo.bodyColorLight);
  root.style.setProperty('--portal-muted-color-light', typo.mutedColorLight);
  root.style.setProperty('--portal-accent-color-light', typo.accentColorLight);
  root.style.setProperty('--portal-heading-color-dark', typo.headingColorDark);
  root.style.setProperty('--portal-body-color-dark', typo.bodyColorDark);
  root.style.setProperty('--portal-muted-color-dark', typo.mutedColorDark);
  root.style.setProperty('--portal-accent-color-dark', typo.accentColorDark);
  root.style.setProperty('--portal-font-scale', String(clampedScale));
  root.style.setProperty('--portal-heading-weight', typo.headingWeight);
  root.style.setProperty('--portal-body-weight', typo.bodyWeight);
  root.style.setProperty('--portal-heading-tracking', trackingMap[typo.headingTracking] || '0em');
  root.style.setProperty('--portal-body-line-height', lineHeightMap[typo.bodyLineHeight] || '1.6');
  root.style.setProperty('--portal-heading-style', typo.headingStyle);
  root.style.setProperty('--portal-heading-transform', typo.headingTransform);
}

const SITE_CONFIG_STORAGE_KEY = 'szmc_institutional_site_config_v2';
const SITE_CONFIG_UPDATE_EVENT = 'szmc_site_config_updated';

let siteConfigBroadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    siteConfigBroadcastChannel = new BroadcastChannel('szmc_site_config_live_sync');
    siteConfigBroadcastChannel.onmessage = (evt) => {
      if (evt?.data?.type === 'SITE_CONFIG_UPDATED' && evt.data.config) {
        try {
          const current = getSiteConfig();
          const merged: SiteConfig = { ...current, ...evt.data.config };
          localStorage.setItem(SITE_CONFIG_STORAGE_KEY, JSON.stringify(merged));
          applyPortalTypographyToDom(merged);
          applyGlobalThemeToDom(merged.globalTheme);
          window.dispatchEvent(new CustomEvent(SITE_CONFIG_UPDATE_EVENT, { detail: merged }));
        } catch {}
      }
    };
  }
} catch {}

// Singleton listener for instant cross-device real-time site config & Hall of Fame updates
let siteConfigSseInitialized = false;
function ensureRealtimeSiteConfigStream() {
  if (siteConfigSseInitialized || typeof window === 'undefined') {
    return;
  }
  siteConfigSseInitialized = true;

  const applyRemoteConfig = (remoteCfg: any) => {
    if (!remoteCfg || typeof remoteCfg !== 'object') return;
    const localCurrent = getSiteConfig();
    const mergedPatch = { ...remoteCfg };
    if (
      Array.isArray(localCurrent.featuredAlumni) &&
      !Array.isArray(mergedPatch.featuredAlumni)
    ) {
      mergedPatch.featuredAlumni = localCurrent.featuredAlumni;
    }
    const merged: SiteConfig = { ...localCurrent, ...mergedPatch };
    memorySiteConfig = merged;
    try {
      localStorage.setItem(SITE_CONFIG_STORAGE_KEY, JSON.stringify(merged));
    } catch {}
    applyPortalTypographyToDom(merged);
    applyGlobalThemeToDom(merged.globalTheme);
    window.dispatchEvent(new CustomEvent(SITE_CONFIG_UPDATE_EVENT, { detail: merged }));
  };

  // Subscribe to unified SupabaseRealtimeManager (SSE + Supabase postgres_changes + Supabase broadcast)
  import('./supabaseRealtimeService')
    .then(({ realtimeManager }) => {
      realtimeManager.subscribeToSiteSettings((event) => {
        if (event.key === 'master_site_config' && event.value && typeof event.value === 'object') {
          applyRemoteConfig(event.value);
        }
      });
      realtimeManager.subscribeToHallOfFame((event) => {
        if (event.config && typeof event.config === 'object') {
          applyRemoteConfig(event.config);
        } else if (Array.isArray(event.featuredAlumni) && event.featuredAlumni.length > 0) {
          applyRemoteConfig({ featuredAlumni: event.featuredAlumni });
        }
      });
    })
    .catch(() => {});
}

let memorySiteConfig: SiteConfig | null = null;

export function getSiteConfig(): SiteConfig {
  if (memorySiteConfig) return memorySiteConfig;
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(SITE_CONFIG_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (
          !parsed.logoUrl ||
          parsed.logoUrl.includes('images__1__2778177d.png') ||
          parsed.logoUrl.includes('legacy-logo')
        ) {
          parsed.logoUrl = '/szmc-logo.png';
        }
        if (
          !parsed.faviconUrl ||
          parsed.faviconUrl.includes('images__1__2778177d.png') ||
          parsed.faviconUrl.includes('legacy-logo')
        ) {
          parsed.faviconUrl = '/szmc-logo.png';
        }
        memorySiteConfig = { ...FACTORY_DEFAULT_SITE_CONFIG, ...parsed };
        return memorySiteConfig;
      }
    }
  } catch (e) {
    console.warn('Failed to load site config from localStorage', e);
  }
  memorySiteConfig = FACTORY_DEFAULT_SITE_CONFIG;
  return memorySiteConfig;
}

export function saveSiteConfig(newConfig: Partial<SiteConfig>): SiteConfig {
  try {
    const current = getSiteConfig();
    const merged: SiteConfig = { ...current, ...newConfig };
    memorySiteConfig = merged;
    if (typeof window !== 'undefined') {
      localStorage.setItem(SITE_CONFIG_STORAGE_KEY, JSON.stringify(merged));
      applyPortalTypographyToDom(merged);
      applyGlobalThemeToDom(merged.globalTheme);
      window.dispatchEvent(new CustomEvent(SITE_CONFIG_UPDATE_EVENT, { detail: merged }));
      try {
        siteConfigBroadcastChannel?.postMessage({ type: 'SITE_CONFIG_UPDATED', config: merged });
      } catch {}
    }
    return merged;
  } catch (e) {
    console.warn('Failed to save site config', e);
    return FACTORY_DEFAULT_SITE_CONFIG;
  }
}

export function resetSiteConfigToFactory(): SiteConfig {
  try {
    memorySiteConfig = FACTORY_DEFAULT_SITE_CONFIG;
    if (typeof window !== 'undefined') {
      localStorage.setItem(SITE_CONFIG_STORAGE_KEY, JSON.stringify(FACTORY_DEFAULT_SITE_CONFIG));
      applyPortalTypographyToDom(FACTORY_DEFAULT_SITE_CONFIG);
      applyGlobalThemeToDom(DEFAULT_GLOBAL_THEME_CONFIG);
      window.dispatchEvent(new CustomEvent(SITE_CONFIG_UPDATE_EVENT, { detail: FACTORY_DEFAULT_SITE_CONFIG }));
      try {
        siteConfigBroadcastChannel?.postMessage({ type: 'SITE_CONFIG_UPDATED', config: FACTORY_DEFAULT_SITE_CONFIG });
      } catch {}
    }
  } catch (e) {
    console.warn('Failed to reset site config', e);
  }
  return FACTORY_DEFAULT_SITE_CONFIG;
}

export function exportSiteConfigJson(): string {
  const cfg = getSiteConfig();
  return JSON.stringify(cfg, null, 2);
}

export function importSiteConfigJson(jsonString: string): { success: boolean; error?: string } {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object') {
      return { success: false, error: 'Invalid JSON configuration schema.' };
    }
    saveSiteConfig(parsed);
    void saveSiteConfigToServer(parsed);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Could not parse JSON configuration file.' };
  }
}

let autoSaveTimeoutId: ReturnType<typeof setTimeout> | null = null;

/**
 * Optimizes an image file and uploads it directly to Supabase Storage (`gallery` bucket under `site-assets/`),
 * returning a permanent public CDN URL so Landing Page & Hall of Fame photos persist in Supabase and sync
 * across all devices in real time without bloating JSONB or localStorage.
 */
export async function uploadSiteAssetImage(
  file: File,
  folder: 'hero' | 'logo' | 'hall-of-fame' | 'banner' | 'general' = 'general',
  maxDimension = 1920,
  quality = 0.88
): Promise<string> {
  // Compress large images onto a canvas to keep uploads crisp and fast
  const blobToUpload = await new Promise<{ blob: Blob; ext: string; contentType: string; dataUrl: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxDimension || h > maxDimension) {
          if (w >= h) {
            h = Math.round((h * maxDimension) / w);
            w = maxDimension;
          } else {
            w = Math.round((w * maxDimension) / h);
            h = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ blob: file, ext: 'jpg', contentType: file.type || 'image/jpeg', dataUrl: rawDataUrl });
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
        const mime = isPng ? 'image/png' : 'image/jpeg';
        const ext = isPng ? 'png' : 'jpg';
        const outDataUrl = canvas.toDataURL(mime, isPng ? undefined : quality);
        canvas.toBlob(
          (b) => {
            resolve({ blob: b || file, ext, contentType: mime, dataUrl: outDataUrl });
          },
          mime,
          isPng ? undefined : quality
        );
      };
      img.onerror = () => resolve({ blob: file, ext: 'jpg', contentType: file.type || 'image/jpeg', dataUrl: rawDataUrl });
      img.src = rawDataUrl;
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });

  try {
    const { supabase, isSupabaseConfigured } = await import('../lib/supabase');
    if (isSupabaseConfigured && supabase) {
      const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${blobToUpload.ext}`;
      const storagePath = `site-assets/${folder}/${uniqueName}`;
      const { error } = await supabase.storage
        .from('gallery')
        .upload(storagePath, blobToUpload.blob, {
          contentType: blobToUpload.contentType,
          cacheControl: '31536000',
          upsert: true,
        });

      if (!error) {
        const { data: pubData } = supabase.storage.from('gallery').getPublicUrl(storagePath);
        if (pubData?.publicUrl) {
          return pubData.publicUrl;
        }
      } else {
        console.warn('[SiteConfig] Supabase Storage upload fallback to compressed data URL:', error.message);
      }
    }
  } catch (err) {
    console.warn('[SiteConfig] Storage upload exception:', err);
  }

  return blobToUpload.dataUrl;
}

export async function saveSiteConfigToServer(configPatch: Partial<SiteConfig>): Promise<{ success: boolean; message?: string; error?: string }> {
  const fullConfig = saveSiteConfig(configPatch);

  // Broadcast immediately via Supabase Realtime Channel & persist to Supabase site_settings
  try {
    const [{ supabase, isSupabaseConfigured }, { realtimeManager }] = await Promise.all([
      import('../lib/supabase'),
      import('./supabaseRealtimeService'),
    ]);
    realtimeManager.broadcastSiteConfigUpdate(fullConfig);

    let supabaseSuccess = false;
    let supabaseErrorMsg: string | null = null;
    let hasActiveSupabaseSession = false;

    // 1. Direct Supabase public.site_settings write via authenticated Supabase session only
    //    (anon role intentionally has no write permission on public.site_settings)
    if (isSupabaseConfigured && supabase) {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        hasActiveSupabaseSession = Boolean(session?.access_token);

        if (hasActiveSupabaseSession) {
          const nowIso = new Date().toISOString();
          const hofMembers = Array.isArray(fullConfig.featuredAlumni) ? fullConfig.featuredAlumni : [];
          const { error: upsertErr } = await supabase
            .from('site_settings')
            .upsert(
              [
                {
                  key: 'master_site_config',
                  value: fullConfig,
                  updated_at: nowIso,
                },
                {
                  key: 'hall_of_fame',
                  value: {
                    members: hofMembers,
                    updated_at: nowIso,
                  },
                  updated_at: nowIso,
                },
              ],
              { onConflict: 'key' }
            );

          if (!upsertErr) {
            supabaseSuccess = true;
          } else {
            supabaseErrorMsg = upsertErr.message;
            console.warn('Supabase site_settings upsert error:', upsertErr);
          }
        }
      } catch (dbErr: any) {
        supabaseErrorMsg = dbErr?.message || 'Supabase write exception';
      }
    }

    // 2. Persist to Express API & broadcast via SSE to all active devices
    let serverSuccess = false;
    let serverErrorMsg: string | null = null;
    let serverSyncMode: string | null = null;
    const { getClientAuthHeaders } = await import('../lib/supabase');
    const headers = await getClientAuthHeaders(true);

    try {
      const res = await fetch('/api/admin/site-config', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...fullConfig,
          _clientSupabaseSynced: supabaseSuccess,
        }),
      });

      const data = await res.json();
      if (res.ok && data?.success) {
        serverSuccess = true;
        serverSyncMode = data?.syncMode || null;
        if (data?.supabaseSynced) {
          supabaseSuccess = true;
        }
        if (data?.supabaseSyncError && !supabaseErrorMsg) {
          supabaseErrorMsg = data.supabaseSyncError;
        }
      } else {
        serverErrorMsg = data?.error || 'Server save rejected';
      }
    } catch (fetchErr: any) {
      serverErrorMsg = fetchErr?.message || 'Server connection failed';
    }

    // Strict error propagation: fail if an authenticated Supabase write was attempted and rejected,
    // or if the server save failed. Allow clean server-local fallback when running with an Express
    // admin session in an environment without SUPABASE_SERVICE_ROLE_KEY.
    let isSupaActive = false;
    try {
      const supaModule = await import('../lib/supabase');
      isSupaActive = Boolean(supaModule.isSupabaseConfigured);
    } catch {}

    const acceptedServerLocalFallback =
      serverSuccess && serverSyncMode === 'server_local_fallback' && !hasActiveSupabaseSession;

    if (isSupaActive && !supabaseSuccess && !acceptedServerLocalFallback) {
      const errMsg = supabaseErrorMsg || serverErrorMsg || 'Supabase rejected the site settings write (check admin permissions or RLS policies on public.site_settings).';
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('szmc-site-config-error', { detail: errMsg }));
      }
      return {
        success: false,
        error: errMsg,
      };
    }

    if (!isSupaActive && !serverSuccess) {
      return {
        success: false,
        error: serverErrorMsg || 'Failed to save site settings to server.',
      };
    }

    // Mirror to local storage only after backend / database write confirms success
    saveSiteConfig(fullConfig);

    return {
      success: true,
      message: supabaseSuccess
        ? 'Site configuration & Hall of Fame saved and broadcast live across all devices!'
        : 'Site configuration saved on server and broadcast live across all devices!',
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Unexpected failure while persisting site settings.',
    };
  }
}

let remoteSiteConfigPromise: Promise<SiteConfig | null> | null = null;

function fetchRemoteSiteConfigOnce(): Promise<SiteConfig | null> {
  if (remoteSiteConfigPromise) return remoteSiteConfigPromise;

  remoteSiteConfigPromise = (async () => {
    // 1. Fetch from Supabase site_settings first
    try {
      const { supabase, isSupabaseConfigured } = await import('../lib/supabase');
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
          .from('site_settings')
          .select('key, value')
          .in('key', ['master_site_config', 'hall_of_fame']);

        if (!error && Array.isArray(data) && data.length > 0) {
          const masterRow = data.find((r) => r.key === 'master_site_config');
          const hofRow = data.find((r) => r.key === 'hall_of_fame');
          const patch: Partial<SiteConfig> = (masterRow?.value as any) || {};
          const hofMembers = hofRow?.value?.members || hofRow?.value;
          if (Array.isArray(hofMembers)) {
            patch.featuredAlumni = hofMembers;
          }
          if (Object.keys(patch).length > 0) {
            return saveSiteConfig(patch);
          }
        }
      }
    } catch (supaErr) {
      console.warn('Supabase site_settings load notice:', supaErr);
    }

    // 2. Secondary fallback: Express server cache
    try {
      const r = await fetch('/api/site-config');
      if (r.ok) {
        const data = await r.json();
        if (data?.config && typeof data.config === 'object') {
          return saveSiteConfig(data.config);
        }
      }
    } catch {}

    return null;
  })();

  return remoteSiteConfigPromise;
}

export function useSiteConfig() {
  const [config, setConfig] = useState<SiteConfig>(getSiteConfig);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    ensureRealtimeSiteConfigStream();

    fetchRemoteSiteConfigOnce().then((merged) => {
      if (merged && isMounted) {
        setConfig(merged);
      }
    });

    const handleUpdate = (e: Event) => {
      const detail = (e as CustomEvent<SiteConfig>).detail;
      if (detail) {
        setConfig(detail);
      } else {
        setConfig(getSiteConfig());
      }
    };

    window.addEventListener(SITE_CONFIG_UPDATE_EVENT, handleUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener(SITE_CONFIG_UPDATE_EVENT, handleUpdate);
    };
  }, []);

  const updateConfig = (patch: Partial<SiteConfig>) => {
    const updated = saveSiteConfig(patch);
    setConfig(updated);
    setHasUnsavedChanges(true);

    // Automatically sync to server & broadcast via SSE after 350ms debounce so Admin edits propagate live
    if (autoSaveTimeoutId) {
      clearTimeout(autoSaveTimeoutId);
    }
    autoSaveTimeoutId = setTimeout(() => {
      saveSiteConfigToServer(updated).then((res) => {
        if (res.success) {
          setHasUnsavedChanges(false);
          setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        } else {
          console.warn('[SiteConfig] Auto-save failed:', res.error);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('szmc-site-config-error', { detail: res.error || 'Auto-save failed' }));
          }
        }
      });
    }, 350);

    return updated;
  };

  const saveAllChanges = async (): Promise<{ success: boolean; message?: string; error?: string }> => {
    if (autoSaveTimeoutId) {
      clearTimeout(autoSaveTimeoutId);
      autoSaveTimeoutId = null;
    }
    setIsSaving(true);
    try {
      const latest = getSiteConfig();
      const res = await saveSiteConfigToServer(latest);
      setIsSaving(false);
      if (res.success) {
        setHasUnsavedChanges(false);
        setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
      return res;
    } catch (e: any) {
      setIsSaving(false);
      return { success: false, error: e?.message || 'Save failed' };
    }
  };

  const resetConfig = () => {
    const factory = resetSiteConfigToFactory();
    setConfig(factory);
    setHasUnsavedChanges(true);
    saveSiteConfigToServer(factory);
    return factory;
  };

  return {
    config,
    updateConfig,
    resetConfig,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    isSaving,
    lastSavedTime,
    saveAllChanges,
    exportJson: exportSiteConfigJson,
    importJson: importSiteConfigJson,
  };
}

export function isInstantAutoVerificationActive(): boolean {
  try {
    const cfg = getSiteConfig();
    if (!cfg.autoVerificationEnabled || cfg.autoVerificationPaused) return false;
    const expiry = new Date(cfg.autoVerificationUntil).getTime();
    return !isNaN(expiry) && Date.now() < expiry;
  } catch {
    return false;
  }
}

export function getAutoVerificationRemainingTime(): {
  isActive: boolean;
  isPaused: boolean;
  days: number;
  hours: number;
  minutes: number;
  expiresAt: string;
} {
  const cfg = getSiteConfig();
  const expiry = new Date(cfg.autoVerificationUntil || Date.now() + 7 * 24 * 60 * 60 * 1000).getTime();
  const now = Date.now();
  const diff = Math.max(0, expiry - now);

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return {
    isActive: cfg.autoVerificationEnabled && !cfg.autoVerificationPaused && diff > 0,
    isPaused: Boolean(cfg.autoVerificationPaused),
    days,
    hours,
    minutes,
    expiresAt: cfg.autoVerificationUntil,
  };
}

export function pauseAutoVerification(paused: boolean): SiteConfig {
  const updated = saveSiteConfig({ autoVerificationPaused: paused });
  // Sync to Supabase site_settings table asynchronously only when an authenticated Supabase session exists
  if (typeof window !== 'undefined') {
    import('../lib/supabase').then(async ({ supabase, isSupabaseConfigured }) => {
      if (!isSupabaseConfigured) return;
      const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      if (!session?.access_token) return;
      supabase
        .from('site_settings')
        .upsert({
          key: 'auto_verification',
          value: {
            enabled: updated.autoVerificationEnabled,
            paused: updated.autoVerificationPaused,
            until: updated.autoVerificationUntil,
            updated_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .then(() => {}, () => {});
      supabase
        .rpc('toggle_auto_verification', {
          p_paused: paused,
          p_reset_7_days: false,
        })
        .then(() => {}, () => {});
    });
  }
  return updated;
}

export function resetAutoVerification7Days(): SiteConfig {
  const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const updated = saveSiteConfig({
    autoVerificationEnabled: true,
    autoVerificationPaused: false,
    autoVerificationUntil: newExpiry,
  });
  // Sync to Supabase site_settings table asynchronously only when an authenticated Supabase session exists
  if (typeof window !== 'undefined') {
    import('../lib/supabase').then(async ({ supabase, isSupabaseConfigured }) => {
      if (!isSupabaseConfigured) return;
      const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      if (!session?.access_token) return;
      supabase
        .from('site_settings')
        .upsert({
          key: 'auto_verification',
          value: {
            enabled: true,
            paused: false,
            until: newExpiry,
            updated_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .then(() => {}, () => {});
      supabase
        .rpc('toggle_auto_verification', {
          p_paused: false,
          p_reset_7_days: true,
        })
        .then(() => {}, () => {});
    });
  }
  return updated;
}

// Apply cached typography & global theme immediately for zero FOUC.
// Live Supabase site_settings hydration & Realtime sync are handled centrally by AdminSettingsProvider.
if (typeof window !== 'undefined') {
  const initialCfg = getSiteConfig();
  applyPortalTypographyToDom(initialCfg);
  applyGlobalThemeToDom(initialCfg.globalTheme);
}


