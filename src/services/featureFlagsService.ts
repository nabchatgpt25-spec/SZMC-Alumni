import { supabase, isSupabaseConfigured, getClientAuthHeaders } from '../lib/supabase';

export interface AppFeatureFlag {
  key: string;
  enabled: boolean;
  description?: string | null;
  config?: Record<string, unknown>;
  updatedAt?: string;
}

export const DEFAULT_FEATURE_FLAGS: Record<string, boolean> = {
  the_quad_enabled: true,
  batch_lounges_enabled: true,
  official_pages_enabled: true,
  community_polls_enabled: true,
  content_moderation_queue_enabled: true,
};

let cachedFlags: Record<string, AppFeatureFlag> | null = null;
let inflightLoad: Promise<Record<string, AppFeatureFlag>> | null = null;

function buildDefaultFlagMap(): Record<string, AppFeatureFlag> {
  const map: Record<string, AppFeatureFlag> = {};
  for (const [key, enabled] of Object.entries(DEFAULT_FEATURE_FLAGS)) {
    map[key] = { key, enabled, config: {} };
  }
  return map;
}

export async function loadFeatureFlags(forceRefresh = false): Promise<Record<string, AppFeatureFlag>> {
  if (cachedFlags && !forceRefresh) {
    return cachedFlags;
  }
  if (inflightLoad && !forceRefresh) {
    return inflightLoad;
  }

  inflightLoad = (async () => {
    const merged = buildDefaultFlagMap();

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('app_feature_flags')
          .select('key, enabled, description, config, updated_at');

        if (!error && Array.isArray(data)) {
          for (const row of data) {
            if (!row?.key) continue;
            merged[row.key] = {
              key: String(row.key),
              enabled: Boolean(row.enabled),
              description: row.description ?? null,
              config: (row.config && typeof row.config === 'object' ? row.config : {}) as Record<string, unknown>,
              updatedAt: row.updated_at ?? undefined,
            };
          }
          cachedFlags = merged;
          return merged;
        }
      } catch {
        // Fall through to Express API fallback
      }
    }

    try {
      const res = await fetch('/api/feature-flags');
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.flags)) {
          for (const item of json.flags) {
            if (!item?.key) continue;
            merged[item.key] = {
              key: String(item.key),
              enabled: Boolean(item.enabled),
              description: item.description ?? null,
              config: (item.config && typeof item.config === 'object' ? item.config : {}) as Record<string, unknown>,
              updatedAt: item.updatedAt ?? item.updated_at ?? undefined,
            };
          }
        }
      }
    } catch {
      // Safe defaults remain active
    }

    cachedFlags = merged;
    return merged;
  })();

  try {
    return await inflightLoad;
  } finally {
    inflightLoad = null;
  }
}

export async function isFeatureEnabled(key: string): Promise<boolean> {
  const flags = await loadFeatureFlags();
  if (key in flags) return flags[key].enabled;
  return DEFAULT_FEATURE_FLAGS[key] ?? false;
}

export async function updateFeatureFlag(
  key: string,
  enabled: boolean,
  options?: { description?: string; config?: Record<string, unknown> }
): Promise<{ success: boolean; flag?: AppFeatureFlag; error?: string }> {
  const cleanKey = key.trim().toLowerCase();
  if (!/^[a-z0-9_]{2,64}$/.test(cleanKey)) {
    return { success: false, error: 'Invalid feature flag key format.' };
  }

  try {
    const headers = await getClientAuthHeaders(true);
    const res = await fetch(`/api/admin/feature-flags/${encodeURIComponent(cleanKey)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        enabled,
        description: options?.description,
        config: options?.config,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data?.error || `Failed to update flag (${res.status})` };
    }

    const updatedFlag: AppFeatureFlag = data.flag || {
      key: cleanKey,
      enabled,
      description: options?.description ?? null,
      config: options?.config ?? {},
      updatedAt: new Date().toISOString(),
    };

    cachedFlags = {
      ...(cachedFlags || buildDefaultFlagMap()),
      [cleanKey]: updatedFlag,
    };

    return { success: true, flag: updatedFlag };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update feature flag.' };
  }
}

export function subscribeFeatureFlags(
  onChange: (flags: Record<string, AppFeatureFlag>) => void
): () => void {
  if (!isSupabaseConfigured) {
    return () => {};
  }

  const channel = supabase
    .channel('realtime:app_feature_flags')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_feature_flags' },
      () => {
        void loadFeatureFlags(true).then(onChange);
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
