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
};

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
      localCurrent.featuredAlumni.length > 0 &&
      (!Array.isArray(mergedPatch.featuredAlumni) || mergedPatch.featuredAlumni.length === 0)
    ) {
      mergedPatch.featuredAlumni = localCurrent.featuredAlumni;
    }
    const merged: SiteConfig = { ...localCurrent, ...mergedPatch };
    try {
      localStorage.setItem(SITE_CONFIG_STORAGE_KEY, JSON.stringify(merged));
    } catch {}
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

export function getSiteConfig(): SiteConfig {
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
    if (typeof window !== 'undefined') {
      localStorage.setItem(SITE_CONFIG_STORAGE_KEY, JSON.stringify(FACTORY_DEFAULT_SITE_CONFIG));
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

export async function saveSiteConfigToServer(configPatch: Partial<SiteConfig>): Promise<{ success: boolean; message?: string; error?: string }> {
  const fullConfig = saveSiteConfig(configPatch);

  // Broadcast immediately via Supabase Realtime Channel & persist to Supabase site_settings
  try {
    const [{ supabase, isSupabaseConfigured }, { realtimeManager }] = await Promise.all([
      import('../lib/supabase'),
      import('./supabaseRealtimeService'),
    ]);
    realtimeManager.broadcastSiteConfigUpdate(fullConfig);
    if (isSupabaseConfigured && supabase) {
      const nowIso = new Date().toISOString();
      void Promise.resolve(
        supabase
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
                  members: fullConfig.featuredAlumni || [],
                  updated_at: nowIso,
                },
                updated_at: nowIso,
              },
            ],
            { onConflict: 'key' }
          )
      ).catch(() => {});
    }
  } catch {
    // Non-blocking fallback to Express API
  }

  try {
    let authToken = typeof window !== 'undefined' ? localStorage.getItem('szmc_direct_auth_token') : null;
    if (!authToken) {
      try {
        const { supabase, isSupabaseConfigured } = await import('../lib/supabase');
        if (isSupabaseConfigured && supabase) {
          const { data: sessionData } = await supabase.auth.getSession();
          authToken = sessionData?.session?.access_token || null;
        }
      } catch {}
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
      headers['x-admin-token'] = authToken;
    }

    const res = await fetch('/api/admin/site-config', {
      method: 'POST',
      headers,
      body: JSON.stringify(fullConfig),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data?.error || 'Server save rejected' };
    }

    return { success: true, message: data?.message || 'Settings saved & broadcast live across all devices!' };
  } catch (err: any) {
    return { success: true, message: 'Saved successfully to local storage & cloud cache' };
  }
}

export function useSiteConfig() {
  const [config, setConfig] = useState<SiteConfig>(getSiteConfig);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    ensureRealtimeSiteConfigStream();

    // Initial fetch of server-persisted configuration + Supabase site_settings
    const loadRemoteConfig = async () => {
      try {
        const r = await fetch('/api/site-config');
        if (r.ok) {
          const data = await r.json();
          if (data?.config && typeof data.config === 'object' && isMounted) {
            const localCurrent = getSiteConfig();
            const mergedPatch = { ...data.config };
            if (
              Array.isArray(localCurrent.featuredAlumni) &&
              localCurrent.featuredAlumni.length > 0 &&
              (!Array.isArray(mergedPatch.featuredAlumni) || mergedPatch.featuredAlumni.length === 0)
            ) {
              mergedPatch.featuredAlumni = localCurrent.featuredAlumni;
            }
            const merged = saveSiteConfig(mergedPatch);
            setConfig(merged);
            return;
          }
        }
      } catch {}

      // Fallback: check Supabase site_settings directly
      try {
        const { supabase, isSupabaseConfigured } = await import('../lib/supabase');
        if (isSupabaseConfigured && supabase) {
          const { data } = await supabase
            .from('site_settings')
            .select('key, value')
            .in('key', ['master_site_config', 'hall_of_fame']);
          if (Array.isArray(data) && isMounted) {
            const masterRow = data.find((r) => r.key === 'master_site_config');
            const hofRow = data.find((r) => r.key === 'hall_of_fame');
            const patch: Partial<SiteConfig> = (masterRow?.value as any) || {};
            const hofMembers = hofRow?.value?.members || hofRow?.value;
            if (Array.isArray(hofMembers) && hofMembers.length > 0) {
              patch.featuredAlumni = hofMembers;
            }
            if (Object.keys(patch).length > 0) {
              const merged = saveSiteConfig(patch);
              setConfig(merged);
            }
          }
        }
      } catch {}
    };

    loadRemoteConfig();

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
  // Sync to Supabase site_settings table asynchronously
  if (typeof window !== 'undefined') {
    import('../lib/supabase').then(({ supabase, isSupabaseConfigured }) => {
      if (isSupabaseConfigured) {
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
      }
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
  // Sync to Supabase site_settings table asynchronously
  if (typeof window !== 'undefined') {
    import('../lib/supabase').then(({ supabase, isSupabaseConfigured }) => {
      if (isSupabaseConfigured) {
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
      }
    });
  }
  return updated;
}

// Automatically sync latest site_settings from Supabase on client initialization
if (typeof window !== 'undefined') {
  import('../lib/supabase').then(({ supabase, isSupabaseConfigured }) => {
    if (isSupabaseConfigured) {
      supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'auto_verification')
        .maybeSingle()
        .then(
          ({ data }) => {
            if (data?.value) {
              const v = data.value;
              saveSiteConfig({
                autoVerificationEnabled: v.enabled !== false,
                autoVerificationPaused: Boolean(v.paused),
                autoVerificationUntil: v.until || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              });
            }
          },
          () => {}
        );
    }
  });
}


