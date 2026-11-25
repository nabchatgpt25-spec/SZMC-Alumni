import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeId, ThemeOption } from '../types';
import { THEMES_LIST, DEFAULT_THEME_ID, getThemeById } from '../data/themes';
import { playSound } from '../utils/audio';

export type AppVisualMode = 'classic' | 'glass' | 'clear-glass';

interface ThemeContextType {
  theme: ThemeId;
  currentThemeConfig: ThemeOption;
  availableThemes: ThemeOption[];
  isDark: boolean;
  setTheme: (themeId: ThemeId, playAudio?: boolean) => void;
  toggleTheme: () => void;
  cycleNextTheme: () => void;
  setRandomTheme: () => void;
  visualMode: AppVisualMode;
  isGlassMode: boolean;
  isClearGlassMode: boolean;
  setVisualMode: (mode: AppVisualMode, playAudio?: boolean) => void;
  toggleGlassMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'szmc_alumni_theme_v2';
const LEGACY_STORAGE_KEY = 'szmc_alumni_theme';
const VISUAL_MODE_STORAGE_KEY = 'szmc_app_visual_mode';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      if (stored === 'dark' || stored === 'midnight' || stored === 'cyber-neon' || stored === 'royal-prestige' || stored === 'crimson-pulse') {
        return 'dark';
      }
      if (stored === 'light' || stored === 'szmc-blue' || stored === 'ocean-teal' || stored === 'nordic-glacier' || stored === 'vintage-parchment') {
        return 'light';
      }

      if (
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
      ) {
        return 'dark';
      }
    } catch {
      // Fallback if localStorage or matchMedia is restricted
    }
    return DEFAULT_THEME_ID;
  });

  const [visualMode, setVisualModeState] = useState<AppVisualMode>(() => {
    try {
      const stored = localStorage.getItem(VISUAL_MODE_STORAGE_KEY);
      if (stored === 'clear-glass') return 'clear-glass';
      if (stored === 'glass') return 'glass';
      return 'classic';
    } catch {
      return 'classic';
    }
  });

  const currentThemeConfig = getThemeById(themeId);
  const isDark = currentThemeConfig.isDark;
  const isGlassMode = visualMode === 'glass' || visualMode === 'clear-glass';
  const isClearGlassMode = visualMode === 'clear-glass';

  useEffect(() => {
    const root = document.documentElement;
    const isGlobalThemeManaged = root.getAttribute('data-global-theme-active') === 'true';

    // Apply data-theme attribute
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');

    // Apply or remove dark class based on theme darkness
    if (isDark) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }

    // Only write default ThemeContext CSS variables if Admin Global Theme Manager is not active
    if (!isGlobalThemeManaged) {
      root.style.setProperty('--theme-color-primary', currentThemeConfig.colors.primary);
      root.style.setProperty('--theme-color-accent', currentThemeConfig.colors.accent);
      root.style.setProperty('--theme-color-bg', currentThemeConfig.colors.background);
      root.style.setProperty('--theme-color-surface', currentThemeConfig.colors.surface);
      root.style.setProperty('--theme-color-border', currentThemeConfig.colors.border);
    }

    try {
      localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
      localStorage.setItem(LEGACY_STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {
      // safe ignore
    }
  }, [themeId, isDark, currentThemeConfig]);

  useEffect(() => {
    const root = document.documentElement;
    if (visualMode === 'glass' || visualMode === 'clear-glass') {
      root.setAttribute('data-app-style', visualMode);
    } else {
      root.removeAttribute('data-app-style');
    }

    try {
      localStorage.setItem(VISUAL_MODE_STORAGE_KEY, visualMode);
    } catch {
      // safe ignore
    }
  }, [visualMode]);

  const setTheme = useCallback((newThemeId: ThemeId, playAudio = true) => {
    const normalized: ThemeId = (newThemeId === 'dark' || newThemeId === 'midnight') ? 'dark' : 'light';
    setThemeId((prev) => {
      if (normalized === prev) return prev;
      if (playAudio) playSound('theme');
      return normalized;
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeId((prev) => (prev === 'dark' || prev === 'midnight' ? 'light' : 'dark'));
    playSound('theme');
  }, []);

  const setVisualMode = useCallback((mode: AppVisualMode, playAudio = true) => {
    const normalized: AppVisualMode =
      mode === 'clear-glass' ? 'clear-glass' : mode === 'glass' ? 'glass' : 'classic';
    setVisualModeState((prev) => {
      if (normalized === prev) return prev;
      if (playAudio) playSound('theme');
      return normalized;
    });
  }, []);

  const toggleGlassMode = useCallback(() => {
    setVisualModeState((prev) => {
      if (prev === 'classic') return 'glass';
      if (prev === 'glass') return 'clear-glass';
      return 'classic';
    });
    playSound('theme');
  }, []);

  const contextValue = useMemo<ThemeContextType>(
    () => ({
      theme: isDark ? 'dark' : 'light',
      currentThemeConfig,
      availableThemes: THEMES_LIST,
      isDark,
      setTheme,
      toggleTheme,
      cycleNextTheme: toggleTheme,
      setRandomTheme: toggleTheme,
      visualMode,
      isGlassMode,
      isClearGlassMode,
      setVisualMode,
      toggleGlassMode,
    }),
    [
      isDark,
      currentThemeConfig,
      setTheme,
      toggleTheme,
      visualMode,
      isGlassMode,
      isClearGlassMode,
      setVisualMode,
      toggleGlassMode,
    ]
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
