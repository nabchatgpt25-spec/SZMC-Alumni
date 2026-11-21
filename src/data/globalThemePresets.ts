export interface GlobalThemeVariables {
  primary: string;
  primaryHover: string;
  accent: string;
  bg: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  text: string;
  textMuted: string;
  glow: string;
}

export interface GlobalThemePreset {
  id: string;
  name: string;
  description: string;
  mode: 'light' | 'dark';
  isBuiltIn?: boolean;
  variables: GlobalThemeVariables;
  createdAt?: string;
}

export interface GlobalThemeConfig {
  enabled: boolean;
  activePresetId: string;
  variables: GlobalThemeVariables;
  mode: 'light' | 'dark';
  customPresets: GlobalThemePreset[];
  updatedAt?: string;
}

export const BUILT_IN_GLOBAL_THEME_PRESETS: GlobalThemePreset[] = [
  {
    id: 'corporate-blue',
    name: 'Corporate Blue',
    description: 'Clean institutional sapphire, crisp white surfaces, and warm amber highlights.',
    mode: 'light',
    isBuiltIn: true,
    variables: {
      primary: '#1d4ed8',
      primaryHover: '#1e40af',
      accent: '#d97706',
      bg: '#f8fafc',
      surface: '#ffffff',
      surfaceElevated: '#f1f5f9',
      border: '#e2e8f0',
      text: '#0f172a',
      textMuted: '#64748b',
      glow: 'rgba(29, 78, 216, 0.16)',
    },
  },
  {
    id: 'midnight-obsidian',
    name: 'Midnight Obsidian',
    description: 'Deep obsidian canvas, slate-glass surfaces, and refined sapphire clarity.',
    mode: 'dark',
    isBuiltIn: true,
    variables: {
      primary: '#3b82f6',
      primaryHover: '#2563eb',
      accent: '#38bdf8',
      bg: '#060913',
      surface: '#0d1424',
      surfaceElevated: '#152038',
      border: '#1e293b',
      text: '#f8fafc',
      textMuted: '#94a3b8',
      glow: 'rgba(59, 130, 246, 0.28)',
    },
  },
  {
    id: 'neon-cyber',
    name: 'Neon Cyber',
    description: 'Ultra-dark cyber navy, electric cyan primaries, and ultraviolet accents.',
    mode: 'dark',
    isBuiltIn: true,
    variables: {
      primary: '#06b6d4',
      primaryHover: '#0891b2',
      accent: '#a855f7',
      bg: '#050816',
      surface: '#0b1229',
      surfaceElevated: '#131d3d',
      border: '#1e3a5f',
      text: '#f0f9ff',
      textMuted: '#94a3b8',
      glow: 'rgba(6, 182, 212, 0.38)',
    },
  },
  {
    id: 'emerald-clinical',
    name: 'Emerald Clinical',
    description: 'Medical emerald and coastal teal palette tailored for healthcare alumni.',
    mode: 'light',
    isBuiltIn: true,
    variables: {
      primary: '#047857',
      primaryHover: '#065f46',
      accent: '#0284c7',
      bg: '#f2fbf8',
      surface: '#ffffff',
      surfaceElevated: '#e6f7f1',
      border: '#cbd5e1',
      text: '#0f172a',
      textMuted: '#475569',
      glow: 'rgba(4, 120, 87, 0.18)',
    },
  },
  {
    id: 'royal-heritage',
    name: 'Royal Heritage',
    description: 'Ceremonial midnight navy paired with burnished institutional gold.',
    mode: 'dark',
    isBuiltIn: true,
    variables: {
      primary: '#d97706',
      primaryHover: '#b45309',
      accent: '#fbbf24',
      bg: '#070c18',
      surface: '#0f182c',
      surfaceElevated: '#172542',
      border: '#2b354d',
      text: '#f8fafc',
      textMuted: '#a8b3cf',
      glow: 'rgba(217, 119, 6, 0.30)',
    },
  },
  {
    id: 'warm-ivory',
    name: 'Warm Ivory Editorial',
    description: 'Scholarly warm ivory canvas, archival burgundy primary, and bronze ink.',
    mode: 'light',
    isBuiltIn: true,
    variables: {
      primary: '#9f1239',
      primaryHover: '#881337',
      accent: '#b45309',
      bg: '#faf7f2',
      surface: '#ffffff',
      surfaceElevated: '#f3ede3',
      border: '#e5ddd0',
      text: '#1c1917',
      textMuted: '#57534e',
      glow: 'rgba(159, 18, 57, 0.15)',
    },
  },
];

export const DEFAULT_GLOBAL_THEME_PRESET = BUILT_IN_GLOBAL_THEME_PRESETS[0];

export const DEFAULT_GLOBAL_THEME_CONFIG: GlobalThemeConfig = {
  enabled: false,
  activePresetId: DEFAULT_GLOBAL_THEME_PRESET.id,
  mode: DEFAULT_GLOBAL_THEME_PRESET.mode,
  variables: { ...DEFAULT_GLOBAL_THEME_PRESET.variables },
  customPresets: [],
};

export function normalizeGlobalThemeConfig(
  raw?: Partial<GlobalThemeConfig> | null
): GlobalThemeConfig {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_GLOBAL_THEME_CONFIG,
      variables: { ...DEFAULT_GLOBAL_THEME_CONFIG.variables },
      customPresets: [],
    };
  }

  const customPresets = Array.isArray(raw.customPresets)
    ? raw.customPresets.filter(
        (p): p is GlobalThemePreset =>
          Boolean(p && typeof p === 'object' && typeof p.id === 'string' && typeof p.name === 'string' && p.variables)
      )
    : [];

  const allPresets = [...BUILT_IN_GLOBAL_THEME_PRESETS, ...customPresets];
  const matchedPreset = allPresets.find((p) => p.id === raw.activePresetId);
  const fallbackVars = matchedPreset?.variables || DEFAULT_GLOBAL_THEME_CONFIG.variables;

  return {
    enabled: Boolean(raw.enabled),
    activePresetId: raw.activePresetId || DEFAULT_GLOBAL_THEME_CONFIG.activePresetId,
    mode: raw.mode === 'dark' || raw.mode === 'light' ? raw.mode : matchedPreset?.mode || 'light',
    variables: {
      primary: raw.variables?.primary || fallbackVars.primary,
      primaryHover: raw.variables?.primaryHover || fallbackVars.primaryHover,
      accent: raw.variables?.accent || fallbackVars.accent,
      bg: raw.variables?.bg || fallbackVars.bg,
      surface: raw.variables?.surface || fallbackVars.surface,
      surfaceElevated: raw.variables?.surfaceElevated || fallbackVars.surfaceElevated,
      border: raw.variables?.border || fallbackVars.border,
      text: raw.variables?.text || fallbackVars.text,
      textMuted: raw.variables?.textMuted || fallbackVars.textMuted,
      glow: raw.variables?.glow || fallbackVars.glow,
    },
    customPresets,
    updatedAt: raw.updatedAt,
  };
}

export function getAllGlobalThemePresets(config?: GlobalThemeConfig | null): GlobalThemePreset[] {
  const custom = Array.isArray(config?.customPresets) ? config.customPresets : [];
  return [...BUILT_IN_GLOBAL_THEME_PRESETS, ...custom];
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return `rgba(29, 78, 216, ${alpha})`;
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Applies the active Global Theme CSS custom properties directly onto `document.documentElement`
 * so the `:root` CSS variables declared in `src/index.css` update across the entire application.
 */
export function applyGlobalThemeToDom(rawConfig?: Partial<GlobalThemeConfig> | null): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const cfg = normalizeGlobalThemeConfig(rawConfig);

  if (!cfg.enabled) {
    root.removeAttribute('data-global-theme');
    root.removeAttribute('data-global-theme-active');
    root.removeAttribute('data-global-theme-mode');
    root.style.removeProperty('--theme-color-primary-hover');
    root.style.removeProperty('--theme-color-surface-elevated');
    root.style.removeProperty('--theme-color-text');
    root.style.removeProperty('--theme-color-text-muted');
    root.style.removeProperty('--theme-glow');
    root.style.removeProperty('--theme-primary-soft');
    return;
  }

  const v = cfg.variables;
  root.setAttribute('data-global-theme', cfg.activePresetId);
  root.setAttribute('data-global-theme-active', 'true');
  root.setAttribute('data-global-theme-mode', cfg.mode);

  // Sync light/dark mode class with the active theme preset for WCAG contrast harmony
  if (cfg.mode === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
    root.setAttribute('data-theme', 'dark');
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
    root.setAttribute('data-theme', 'light');
  }

  root.style.setProperty('--theme-color-primary', v.primary);
  root.style.setProperty('--theme-color-primary-hover', v.primaryHover);
  root.style.setProperty('--theme-color-accent', v.accent);
  root.style.setProperty('--theme-color-bg', v.bg);
  root.style.setProperty('--theme-color-surface', v.surface);
  root.style.setProperty('--theme-color-surface-elevated', v.surfaceElevated);
  root.style.setProperty('--theme-color-border', v.border);
  root.style.setProperty('--theme-color-text', v.text);
  root.style.setProperty('--theme-color-text-muted', v.textMuted);
  root.style.setProperty('--theme-glow', v.glow || hexToRgba(v.primary, 0.25));
  root.style.setProperty('--theme-primary-soft', hexToRgba(v.primary, cfg.mode === 'dark' ? 0.2 : 0.1));
}

export function formatThemeCssVariablesBlock(presetName: string, variables: GlobalThemeVariables): string {
  return `/* ${presetName} — Global Theme Variables */\n:root {\n  --theme-color-primary: ${variables.primary};\n  --theme-color-primary-hover: ${variables.primaryHover};\n  --theme-color-accent: ${variables.accent};\n  --theme-color-bg: ${variables.bg};\n  --theme-color-surface: ${variables.surface};\n  --theme-color-surface-elevated: ${variables.surfaceElevated};\n  --theme-color-border: ${variables.border};\n  --theme-color-text: ${variables.text};\n  --theme-color-text-muted: ${variables.textMuted};\n  --theme-glow: ${variables.glow};\n}`;
}
