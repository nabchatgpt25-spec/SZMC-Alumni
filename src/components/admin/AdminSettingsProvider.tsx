import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import {
  DEFAULT_PORTAL_TYPOGRAPHY,
  applyPortalTypographyToDom,
  getSiteConfig,
  saveSiteConfig,
  saveSiteConfigToServer,
  type PortalTypographyConfig,
  type SiteConfig,
} from '../../services/siteConfigService';
import {
  DEFAULT_GLOBAL_THEME_CONFIG,
  applyGlobalThemeToDom,
  normalizeGlobalThemeConfig,
  type GlobalThemeConfig,
} from '../../data/globalThemePresets';

export type AdminSettingsChannelStatus = 'connecting' | 'subscribed' | 'error' | 'offline';

export interface SiteSettingRecord {
  key: string;
  value: any;
  updated_at?: string | null;
}

export interface AdminSettingsMutationResult {
  success: boolean;
  error?: string;
}

export interface AdminSettingsContextValue {
  /** All rows from public.site_settings keyed by setting key */
  settingsMap: Record<string, any>;
  /** Merged master SiteConfig hydrated from public.site_settings */
  siteConfig: SiteConfig;
  /** Active global portal typography, colors & text styles */
  typography: PortalTypographyConfig;
  /** Active Global Theme Manager configuration (:root CSS variables & saved presets) */
  globalTheme: GlobalThemeConfig;
  /** Live Supabase Realtime channel status for public.site_settings */
  channelStatus: AdminSettingsChannelStatus;
  /** True while initial hydration from Supabase is in flight */
  isLoading: boolean;
  /** Timestamp of the most recent synced settings update */
  lastUpdatedAt: string | null;
  /** Re-fetch all rows from public.site_settings and re-apply to app state & DOM */
  refreshSettings: () => Promise<void>;
  /** Save and broadcast global typography/colors/styles to site_settings and all connected clients */
  updateTypographySettings: (
    patch: Partial<PortalTypographyConfig>
  ) => Promise<AdminSettingsMutationResult>;
  /** Reset portal typography/colors/styles to institutional defaults and broadcast live */
  resetTypographySettings: () => Promise<AdminSettingsMutationResult>;
  /** Save and broadcast Global Theme preset & CSS variables to site_settings and all connected clients */
  updateGlobalTheme: (
    patch: Partial<GlobalThemeConfig>
  ) => Promise<AdminSettingsMutationResult>;
  /** Reset Global Theme override back to default institutional CSS variables */
  resetGlobalTheme: () => Promise<AdminSettingsMutationResult>;
  /** Save and broadcast any SiteConfig fields (landing page, Hall of Fame, branding, styles) */
  updateSiteConfig: (patch: Partial<SiteConfig>) => Promise<AdminSettingsMutationResult>;
  /** Upsert any key-value row in public.site_settings and apply immediately if relevant */
  upsertSettingKey: (key: string, value: unknown) => Promise<AdminSettingsMutationResult>;
}

const AdminSettingsContext = createContext<AdminSettingsContextValue | null>(null);

function normalizeTypography(raw?: Partial<PortalTypographyConfig> | null): PortalTypographyConfig {
  return {
    ...DEFAULT_PORTAL_TYPOGRAPHY,
    ...(raw && typeof raw === 'object' ? raw : {}),
  };
}

function applyDocumentBranding(cfg: SiteConfig): void {
  if (typeof document === 'undefined') return;
  if (cfg.siteTitle && cfg.siteTitle.trim()) {
    document.title = cfg.siteTitle.trim();
  }
  if (cfg.faviconUrl && cfg.faviconUrl.trim()) {
    const iconLink = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (iconLink && iconLink.href !== cfg.faviconUrl) {
      iconLink.href = cfg.faviconUrl;
    }
  }
}

export const AdminSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [siteConfig, setSiteConfig] = useState<SiteConfig>(() => getSiteConfig());
  const [settingsMap, setSettingsMap] = useState<Record<string, any>>(() => ({
    master_site_config: getSiteConfig(),
    portal_typography: normalizeTypography(getSiteConfig().portalTypography),
    global_theme_config: normalizeGlobalThemeConfig(getSiteConfig().globalTheme),
  }));
  const [channelStatus, setChannelStatus] = useState<AdminSettingsChannelStatus>(
    isSupabaseConfigured ? 'connecting' : 'offline'
  );
  const [isLoading, setIsLoading] = useState<boolean>(isSupabaseConfigured);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);

  const typography = useMemo<PortalTypographyConfig>(
    () => normalizeTypography(siteConfig.portalTypography),
    [siteConfig.portalTypography]
  );

  const globalTheme = useMemo<GlobalThemeConfig>(
    () => normalizeGlobalThemeConfig(siteConfig.globalTheme),
    [siteConfig.globalTheme]
  );

  /**
   * Applies a merged SiteConfig immediately across React state, localStorage,
   * custom events (for useSiteConfig consumers), document branding, and CSS variables.
   */
  const applyConfigToApplication = useCallback((patch: Partial<SiteConfig>, timestamp?: string) => {
    const merged = saveSiteConfig(patch);
    applyPortalTypographyToDom(merged);
    applyGlobalThemeToDom(merged.globalTheme);
    applyDocumentBranding(merged);
    setSiteConfig(merged);
    setSettingsMap((prev) => ({
      ...prev,
      master_site_config: merged,
      portal_typography: normalizeTypography(merged.portalTypography),
      global_theme_config: normalizeGlobalThemeConfig(merged.globalTheme),
    }));
    setLastUpdatedAt(timestamp || new Date().toISOString());
    return merged;
  }, []);

  /**
   * Applies an array of site_settings rows fetched from Supabase Postgres.
   */
  const hydrateFromRows = useCallback(
    (rows: SiteSettingRecord[]) => {
      if (!Array.isArray(rows)) return;
      const nextMap: Record<string, any> = {};
      let latestUpdated: string | null = null;

      for (const row of rows) {
        if (!row?.key) continue;
        nextMap[row.key] = row.value;
        if (row.updated_at && (!latestUpdated || row.updated_at > latestUpdated)) {
          latestUpdated = row.updated_at;
        }
      }

      const masterVal =
        nextMap.master_site_config && typeof nextMap.master_site_config === 'object'
          ? (nextMap.master_site_config as Partial<SiteConfig>)
          : {};
      const hofVal = nextMap.hall_of_fame?.members || nextMap.hall_of_fame;
      const standaloneTypo =
        nextMap.portal_typography && typeof nextMap.portal_typography === 'object'
          ? (nextMap.portal_typography as Partial<PortalTypographyConfig>)
          : null;
      const standaloneTheme =
        nextMap.global_theme_config && typeof nextMap.global_theme_config === 'object'
          ? (nextMap.global_theme_config as Partial<GlobalThemeConfig>)
          : null;

      const patch: Partial<SiteConfig> = { ...masterVal };
      if (Array.isArray(hofVal)) {
        patch.featuredAlumni = hofVal;
      }
      if (standaloneTypo) {
        patch.portalTypography = normalizeTypography({
          ...(masterVal.portalTypography || {}),
          ...standaloneTypo,
        });
      }
      if (standaloneTheme) {
        patch.globalTheme = normalizeGlobalThemeConfig({
          ...(masterVal.globalTheme || {}),
          ...standaloneTheme,
        });
      }

      setSettingsMap((prev) => ({ ...prev, ...nextMap }));
      if (Object.keys(patch).length > 0) {
        applyConfigToApplication(patch, latestUpdated || new Date().toISOString());
      } else {
        const current = getSiteConfig();
        applyPortalTypographyToDom(current);
        applyGlobalThemeToDom(current.globalTheme);
        applyDocumentBranding(current);
        setLastUpdatedAt(latestUpdated || new Date().toISOString());
      }
    },
    [applyConfigToApplication]
  );

  const refreshSettings = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      const current = getSiteConfig();
      applyPortalTypographyToDom(current);
      applyDocumentBranding(current);
      setSiteConfig(current);
      setChannelStatus('offline');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('key, value, updated_at')
        .order('key', { ascending: true });

      if (!error && Array.isArray(data)) {
        hydrateFromRows(data as SiteSettingRecord[]);
      }
    } catch (err) {
      console.warn('[AdminSettingsProvider] Failed to fetch site_settings:', err);
    } finally {
      setIsLoading(false);
    }
  }, [hydrateFromRows]);

  /**
   * Handles a single INSERT / UPDATE / DELETE event from Supabase Realtime on public.site_settings.
   */
  const handleSiteSettingsRowChange = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, any>>) => {
      const eventType = payload.eventType;
      const newRow = (payload.new || {}) as Partial<SiteSettingRecord>;
      const oldRow = (payload.old || {}) as Partial<SiteSettingRecord>;
      const key = String(newRow.key || oldRow.key || '').trim();
      if (!key) return;

      const nowIso = String(newRow.updated_at || new Date().toISOString());

      if (eventType === 'DELETE') {
        setSettingsMap((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
        if (key === 'portal_typography') {
          applyConfigToApplication({ portalTypography: DEFAULT_PORTAL_TYPOGRAPHY }, nowIso);
        } else if (key === 'global_theme_config') {
          applyConfigToApplication({ globalTheme: DEFAULT_GLOBAL_THEME_CONFIG }, nowIso);
        }
        setLastUpdatedAt(nowIso);
        return;
      }

      const val = newRow.value;
      setSettingsMap((prev) => ({ ...prev, [key]: val }));

      if (key === 'master_site_config' && val && typeof val === 'object') {
        applyConfigToApplication(val as Partial<SiteConfig>, nowIso);
      } else if (key === 'portal_typography' && val && typeof val === 'object') {
        applyConfigToApplication(
          { portalTypography: normalizeTypography(val as Partial<PortalTypographyConfig>) },
          nowIso
        );
      } else if (key === 'global_theme_config' && val && typeof val === 'object') {
        applyConfigToApplication(
          { globalTheme: normalizeGlobalThemeConfig(val as Partial<GlobalThemeConfig>) },
          nowIso
        );
      } else if (key === 'hall_of_fame' && val) {
        const members = Array.isArray(val?.members) ? val.members : Array.isArray(val) ? val : null;
        if (members) {
          applyConfigToApplication({ featuredAlumni: members }, nowIso);
        }
      } else if (key === 'auto_verification' && val && typeof val === 'object') {
        applyConfigToApplication(
          {
            autoVerificationEnabled: val.enabled !== false,
            autoVerificationPaused: Boolean(val.paused),
            autoVerificationUntil: val.until || getSiteConfig().autoVerificationUntil,
          },
          nowIso
        );
      } else {
        setLastUpdatedAt(nowIso);
      }
    },
    [applyConfigToApplication]
  );

  // Initial hydration + Supabase Realtime channel subscription on public.site_settings
  useEffect(() => {
    // Apply cached config immediately on mount for zero flash of unstyled text
    const initial = getSiteConfig();
    applyPortalTypographyToDom(initial);
    applyGlobalThemeToDom(initial.globalTheme);
    applyDocumentBranding(initial);

    void refreshSettings();

    // Keep state in sync if another legacy consumer calls saveSiteConfig directly
    const onLocalSiteConfigEvent = (e: Event) => {
      const detail = (e as CustomEvent<SiteConfig>).detail;
      if (detail) {
        applyPortalTypographyToDom(detail);
        applyGlobalThemeToDom(detail.globalTheme);
        applyDocumentBranding(detail);
        setSiteConfig(detail);
      }
    };
    window.addEventListener('szmc_site_config_updated', onLocalSiteConfigEvent);

    if (!isSupabaseConfigured || !supabase) {
      setChannelStatus('offline');
      return () => {
        window.removeEventListener('szmc_site_config_updated', onLocalSiteConfigEvent);
      };
    }

    setChannelStatus('connecting');
    const channel = supabase
      .channel('szmc-global-site-settings-realtime', {
        config: { broadcast: { self: false } },
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'site_settings' },
        handleSiteSettingsRowChange
      )
      .on('broadcast', { event: 'site_settings_applied' }, ({ payload }) => {
        if (!payload || typeof payload !== 'object') return;
        const p = payload as {
          configPatch?: Partial<SiteConfig>;
          key?: string;
          value?: unknown;
          updatedAt?: string;
        };
        if (p.key && p.value !== undefined) {
          setSettingsMap((prev) => ({ ...prev, [p.key!]: p.value }));
        }
        if (p.configPatch && typeof p.configPatch === 'object') {
          applyConfigToApplication(p.configPatch, p.updatedAt);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setChannelStatus('subscribed');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setChannelStatus('error');
        } else if (status === 'CLOSED') {
          setChannelStatus('offline');
        }
      });

    channelRef.current = channel;

    return () => {
      window.removeEventListener('szmc_site_config_updated', onLocalSiteConfigEvent);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch(() => {});
        channelRef.current = null;
      }
    };
  }, [applyConfigToApplication, handleSiteSettingsRowChange, refreshSettings]);

  const broadcastPatch = useCallback(
    (payload: { configPatch?: Partial<SiteConfig>; key?: string; value?: unknown }) => {
      try {
        if (channelRef.current && channelStatus === 'subscribed') {
          void channelRef.current.send({
            type: 'broadcast',
            event: 'site_settings_applied',
            payload: { ...payload, updatedAt: new Date().toISOString() },
          });
        }
      } catch {}
    },
    [channelStatus]
  );

  const updateSiteConfig = useCallback(
    async (patch: Partial<SiteConfig>): Promise<AdminSettingsMutationResult> => {
      const merged = applyConfigToApplication(patch);
      const res = await saveSiteConfigToServer(merged);
      if (!res.success) {
        return { success: false, error: res.error || 'Failed to save site configuration.' };
      }

      // If portalTypography was part of the update, also persist to dedicated portal_typography row
      if (patch.portalTypography && isSupabaseConfigured && supabase) {
        const normalizedTypo = normalizeTypography(merged.portalTypography);
        await supabase
          .from('site_settings')
          .upsert(
            {
              key: 'portal_typography',
              value: normalizedTypo,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'key' }
          )
          .then(() => {}, () => {});
      }

      broadcastPatch({ configPatch: merged, key: 'master_site_config', value: merged });
      return { success: true };
    },
    [applyConfigToApplication, broadcastPatch]
  );

  const updateTypographySettings = useCallback(
    async (patch: Partial<PortalTypographyConfig>): Promise<AdminSettingsMutationResult> => {
      const nextTypography = normalizeTypography({
        ...typography,
        ...patch,
      });

      // Apply instantly to the entire application DOM and React state
      applyConfigToApplication({ portalTypography: nextTypography });

      const nowIso = new Date().toISOString();
      let directErr: string | null = null;

      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from('site_settings')
          .upsert(
            {
              key: 'portal_typography',
              value: nextTypography,
              updated_at: nowIso,
            },
            { onConflict: 'key' }
          );
        if (error) {
          directErr = error.message;
        }
      }

      // Persist inside master_site_config as well for unified snapshot recovery
      const res = await saveSiteConfigToServer({ portalTypography: nextTypography });
      if (!res.success && directErr) {
        return { success: false, error: res.error || directErr };
      }

      broadcastPatch({
        configPatch: { portalTypography: nextTypography },
        key: 'portal_typography',
        value: nextTypography,
      });
      return { success: true };
    },
    [applyConfigToApplication, broadcastPatch, typography]
  );

  const resetTypographySettings = useCallback(async (): Promise<AdminSettingsMutationResult> => {
    return updateTypographySettings(DEFAULT_PORTAL_TYPOGRAPHY);
  }, [updateTypographySettings]);

  const updateGlobalTheme = useCallback(
    async (patch: Partial<GlobalThemeConfig>): Promise<AdminSettingsMutationResult> => {
      const nowIso = new Date().toISOString();
      const nextTheme = normalizeGlobalThemeConfig({
        ...globalTheme,
        ...patch,
        variables: {
          ...globalTheme.variables,
          ...(patch.variables || {}),
        },
        customPresets: patch.customPresets ?? globalTheme.customPresets,
        updatedAt: nowIso,
      });

      // Apply instantly to :root CSS variables in index.css across the entire DOM & React state
      applyConfigToApplication({ globalTheme: nextTheme }, nowIso);

      let directErr: string | null = null;
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from('site_settings')
          .upsert(
            {
              key: 'global_theme_config',
              value: nextTheme,
              updated_at: nowIso,
            },
            { onConflict: 'key' }
          );
        if (error) {
          directErr = error.message;
        }
      }

      const res = await saveSiteConfigToServer({ globalTheme: nextTheme });
      if (!res.success && directErr) {
        return { success: false, error: res.error || directErr };
      }

      broadcastPatch({
        configPatch: { globalTheme: nextTheme },
        key: 'global_theme_config',
        value: nextTheme,
      });
      return { success: true };
    },
    [applyConfigToApplication, broadcastPatch, globalTheme]
  );

  const resetGlobalTheme = useCallback(async (): Promise<AdminSettingsMutationResult> => {
    return updateGlobalTheme({
      ...DEFAULT_GLOBAL_THEME_CONFIG,
      customPresets: globalTheme.customPresets,
    });
  }, [updateGlobalTheme, globalTheme.customPresets]);

  const upsertSettingKey = useCallback(
    async (key: string, value: unknown): Promise<AdminSettingsMutationResult> => {
      const cleanKey = key.trim();
      if (!cleanKey) return { success: false, error: 'Setting key is required.' };
      const nowIso = new Date().toISOString();

      setSettingsMap((prev) => ({ ...prev, [cleanKey]: value }));

      if (cleanKey === 'master_site_config' && value && typeof value === 'object') {
        applyConfigToApplication(value as Partial<SiteConfig>, nowIso);
      } else if (cleanKey === 'portal_typography' && value && typeof value === 'object') {
        applyConfigToApplication(
          { portalTypography: normalizeTypography(value as Partial<PortalTypographyConfig>) },
          nowIso
        );
      } else if (cleanKey === 'global_theme_config' && value && typeof value === 'object') {
        applyConfigToApplication(
          { globalTheme: normalizeGlobalThemeConfig(value as Partial<GlobalThemeConfig>) },
          nowIso
        );
      }

      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from('site_settings')
          .upsert({ key: cleanKey, value, updated_at: nowIso }, { onConflict: 'key' });
        if (error) return { success: false, error: error.message };
      }

      broadcastPatch({
        key: cleanKey,
        value,
        configPatch:
          cleanKey === 'master_site_config' && value && typeof value === 'object'
            ? (value as Partial<SiteConfig>)
            : cleanKey === 'portal_typography' && value && typeof value === 'object'
            ? { portalTypography: normalizeTypography(value as Partial<PortalTypographyConfig>) }
            : cleanKey === 'global_theme_config' && value && typeof value === 'object'
            ? { globalTheme: normalizeGlobalThemeConfig(value as Partial<GlobalThemeConfig>) }
            : undefined,
      });
      return { success: true };
    },
    [applyConfigToApplication, broadcastPatch]
  );

  const value = useMemo<AdminSettingsContextValue>(
    () => ({
      settingsMap,
      siteConfig,
      typography,
      globalTheme,
      channelStatus,
      isLoading,
      lastUpdatedAt,
      refreshSettings,
      updateTypographySettings,
      resetTypographySettings,
      updateGlobalTheme,
      resetGlobalTheme,
      updateSiteConfig,
      upsertSettingKey,
    }),
    [
      settingsMap,
      siteConfig,
      typography,
      globalTheme,
      channelStatus,
      isLoading,
      lastUpdatedAt,
      refreshSettings,
      updateTypographySettings,
      resetTypographySettings,
      updateGlobalTheme,
      resetGlobalTheme,
      updateSiteConfig,
      upsertSettingKey,
    ]
  );

  return <AdminSettingsContext.Provider value={value}>{children}</AdminSettingsContext.Provider>;
};

export function useAdminSettings(): AdminSettingsContextValue {
  const ctx = useContext(AdminSettingsContext);
  if (!ctx) {
    throw new Error('useAdminSettings must be used within an AdminSettingsProvider');
  }
  return ctx;
}

export function useOptionalAdminSettings(): AdminSettingsContextValue | null {
  return useContext(AdminSettingsContext);
}

export default AdminSettingsProvider;
