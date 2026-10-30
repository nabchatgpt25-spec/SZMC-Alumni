import { useState, useEffect } from 'react';

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
  batch: number;
  category: 'Medicine' | 'Public Service' | 'Engineering' | 'Business' | 'Academia' | 'Arts & Sports';
  designation: string;
  institution: string;
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
  heroBackgroundTexture: 'Mesh',
  heroOverlayOpacity: 65,

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
};

const SITE_CONFIG_STORAGE_KEY = 'szmc_institutional_site_config_v2';
const SITE_CONFIG_UPDATE_EVENT = 'szmc_site_config_updated';

export function getSiteConfig(): SiteConfig {
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(SITE_CONFIG_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (
          !parsed.logoUrl ||
          parsed.logoUrl.includes('images__1__2778177d.png') ||
          parsed.logoUrl.includes('ndc-logo')
        ) {
          parsed.logoUrl = '/szmc-logo.png';
        }
        if (
          !parsed.faviconUrl ||
          parsed.faviconUrl.includes('images__1__2778177d.png') ||
          parsed.faviconUrl.includes('ndc-logo')
        ) {
          parsed.faviconUrl = '/szmc-logo.png';
        }
        return { ...FACTORY_DEFAULT_SITE_CONFIG, ...parsed };
      }
    }
  } catch (e) {
    console.warn('Failed to load site config from localStorage', e);
  }
  return FACTORY_DEFAULT_SITE_CONFIG;
}

export function saveSiteConfig(newConfig: Partial<SiteConfig>): SiteConfig {
  try {
    const current = getSiteConfig();
    const merged: SiteConfig = { ...current, ...newConfig };
    if (typeof window !== 'undefined') {
      localStorage.setItem(SITE_CONFIG_STORAGE_KEY, JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent(SITE_CONFIG_UPDATE_EVENT, { detail: merged }));
    }
    return merged;
  } catch (e) {
    console.warn('Failed to save site config', e);
    return FACTORY_DEFAULT_SITE_CONFIG;
  }
}

export function resetSiteConfigToFactory(): SiteConfig {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SITE_CONFIG_STORAGE_KEY, JSON.stringify(FACTORY_DEFAULT_SITE_CONFIG));
      window.dispatchEvent(new CustomEvent(SITE_CONFIG_UPDATE_EVENT, { detail: FACTORY_DEFAULT_SITE_CONFIG }));
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
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Could not parse JSON configuration file.' };
  }
}

export function useSiteConfig() {
  const [config, setConfig] = useState<SiteConfig>(getSiteConfig);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const detail = (e as CustomEvent<SiteConfig>).detail;
      if (detail) {
        setConfig(detail);
      } else {
        setConfig(getSiteConfig());
      }
    };

    window.addEventListener(SITE_CONFIG_UPDATE_EVENT, handleUpdate);
    return () => window.removeEventListener(SITE_CONFIG_UPDATE_EVENT, handleUpdate);
  }, []);

  const updateConfig = (patch: Partial<SiteConfig>) => {
    const updated = saveSiteConfig(patch);
    setConfig(updated);
    return updated;
  };

  const resetConfig = () => {
    const factory = resetSiteConfigToFactory();
    setConfig(factory);
    return factory;
  };

  return {
    config,
    updateConfig,
    resetConfig,
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
  return saveSiteConfig({ autoVerificationPaused: paused });
}

export function resetAutoVerification7Days(): SiteConfig {
  const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return saveSiteConfig({
    autoVerificationEnabled: true,
    autoVerificationPaused: false,
    autoVerificationUntil: newExpiry,
  });
}

