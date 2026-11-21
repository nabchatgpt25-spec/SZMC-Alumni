import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  Copy,
  Eye,
  Loader2,
  Moon,
  Palette,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sun,
  Trash2,
} from 'lucide-react';
import {
  DEFAULT_GLOBAL_THEME_CONFIG,
  applyGlobalThemeToDom,
  formatThemeCssVariablesBlock,
  getAllGlobalThemePresets,
  hexToRgba,
  type GlobalThemeConfig,
  type GlobalThemePreset,
  type GlobalThemeVariables,
} from '../../data/globalThemePresets';
import { useAdminSettings } from './AdminSettingsProvider';
import { useAdminVisualMode } from './adminVisualModes';

interface GlobalThemeManagerProps {
  /** Compact quick-switcher bar embedded inside Landing & Settings */
  compact?: boolean;
  /** Optional handler to jump to the full Global Theme tab */
  onOpenFullStudio?: () => void;
  /** Optional toast callback from parent AdminControlPanel */
  onNotify?: (type: 'success' | 'error', text: string) => void;
}

const CSS_VAR_FIELDS: Array<{
  key: keyof Omit<GlobalThemeVariables, 'glow'>;
  cssVar: string;
  label: string;
  hint: string;
}> = [
  {
    key: 'primary',
    cssVar: '--theme-color-primary',
    label: 'Primary Brand Color',
    hint: 'Primary buttons, active links, highlights',
  },
  {
    key: 'primaryHover',
    cssVar: '--theme-color-primary-hover',
    label: 'Primary Hover Color',
    hint: 'Hover state for primary actions',
  },
  {
    key: 'accent',
    cssVar: '--theme-color-accent',
    label: 'Secondary Accent',
    hint: 'Secondary highlights & charts',
  },
  {
    key: 'bg',
    cssVar: '--theme-color-bg',
    label: 'Page Canvas Background',
    hint: 'Main application backdrop',
  },
  {
    key: 'surface',
    cssVar: '--theme-color-surface',
    label: 'Surface / Card Background',
    hint: 'Cards, panels, navigation bars',
  },
  {
    key: 'surfaceElevated',
    cssVar: '--theme-color-surface-elevated',
    label: 'Elevated Surface',
    hint: 'Secondary containers & inputs',
  },
  {
    key: 'border',
    cssVar: '--theme-color-border',
    label: 'Border Hairline',
    hint: 'Dividers and panel outlines',
  },
  {
    key: 'text',
    cssVar: '--theme-color-text',
    label: 'Primary Text',
    hint: 'Headings and body copy',
  },
  {
    key: 'textMuted',
    cssVar: '--theme-color-text-muted',
    label: 'Muted Text',
    hint: 'Captions and secondary metadata',
  },
];

function slugifyPresetId(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `custom-${base || 'preset'}-${Date.now().toString(36).slice(-4)}`;
}

export const GlobalThemeManager: React.FC<GlobalThemeManagerProps> = ({
  compact = false,
  onOpenFullStudio,
  onNotify,
}) => {
  const {
    globalTheme,
    channelStatus,
    lastUpdatedAt,
    updateGlobalTheme,
    resetGlobalTheme,
  } = useAdminSettings();
  const [visualMode] = useAdminVisualMode();
  const isNeonMode = visualMode === 'neon_aura';

  const [draft, setDraft] = useState<GlobalThemeConfig>(() => globalTheme);
  const [livePreview, setLivePreview] = useState<boolean>(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Save custom preset form state
  const [customName, setCustomName] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [copiedCss, setCopiedCss] = useState(false);

  // Sync draft when remote real-time updates arrive from site_settings
  useEffect(() => {
    setDraft(globalTheme);
  }, [globalTheme]);

  // Apply live preview directly to :root CSS variables while editing in the full studio
  useEffect(() => {
    if (compact) return;
    if (livePreview) {
      applyGlobalThemeToDom(draft);
    } else {
      applyGlobalThemeToDom(globalTheme);
    }
  }, [compact, livePreview, draft, globalTheme]);

  // Restore persisted theme if unmounting with unsaved live preview
  useEffect(() => {
    if (compact) return;
    return () => {
      applyGlobalThemeToDom(globalTheme);
    };
  }, [compact, globalTheme]);

  const allPresets = useMemo(() => getAllGlobalThemePresets(draft), [draft]);

  const activePreset = useMemo(
    () => allPresets.find((p) => p.id === draft.activePresetId) || allPresets[0],
    [allPresets, draft.activePresetId]
  );

  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(draft) !== JSON.stringify(globalTheme);
  }, [draft, globalTheme]);

  const report = (type: 'success' | 'error', text: string) => {
    if (onNotify) {
      onNotify(type, text);
    } else {
      setLocalStatus({ type, text });
      setTimeout(() => {
        setLocalStatus((curr) => (curr?.text === text ? null : curr));
      }, 4000);
    }
  };

  const handleSelectPresetInStudio = (preset: GlobalThemePreset) => {
    setDraft((prev) => ({
      ...prev,
      enabled: true,
      activePresetId: preset.id,
      mode: preset.mode,
      variables: { ...preset.variables },
    }));
  };

  const handleQuickApplyPreset = async (preset: GlobalThemePreset) => {
    setBusyAction(`preset-${preset.id}`);
    try {
      const res = await updateGlobalTheme({
        enabled: true,
        activePresetId: preset.id,
        mode: preset.mode,
        variables: { ...preset.variables },
        customPresets: globalTheme.customPresets,
      });
      if (res.success) {
        report('success', `Global theme switched to "${preset.name}" and synced live to all users.`);
      } else {
        report('error', res.error || 'Failed to switch global theme.');
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handlePublishDraft = async () => {
    setBusyAction('publish');
    try {
      const res = await updateGlobalTheme(draft);
      if (res.success) {
        report('success', 'Global Theme CSS variables saved to Supabase and applied across the portal.');
      } else {
        report('error', res.error || 'Failed to publish global theme.');
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleResetDefault = async () => {
    setBusyAction('reset');
    try {
      const res = await resetGlobalTheme();
      if (res.success) {
        setDraft({
          ...DEFAULT_GLOBAL_THEME_CONFIG,
          customPresets: globalTheme.customPresets,
        });
        report('success', 'Global Theme override disabled and restored to default index.css variables.');
      } else {
        report('error', res.error || 'Failed to reset theme.');
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveCustomPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = customName.trim();
    if (cleanName.length < 2) {
      report('error', 'Enter a preset name (at least 2 characters).');
      return;
    }

    const newPreset: GlobalThemePreset = {
      id: slugifyPresetId(cleanName),
      name: cleanName,
      description: customDesc.trim() || 'Custom admin theme preset',
      mode: draft.mode,
      isBuiltIn: false,
      variables: {
        ...draft.variables,
        glow: hexToRgba(draft.variables.primary, draft.mode === 'dark' ? 0.34 : 0.18),
      },
      createdAt: new Date().toISOString(),
    };

    const nextCustomPresets = [...draft.customPresets, newPreset];
    const nextConfig: GlobalThemeConfig = {
      ...draft,
      enabled: true,
      activePresetId: newPreset.id,
      customPresets: nextCustomPresets,
    };

    setBusyAction('save-preset');
    try {
      setDraft(nextConfig);
      const res = await updateGlobalTheme(nextConfig);
      if (res.success) {
        setCustomName('');
        setCustomDesc('');
        report('success', `Custom preset "${cleanName}" saved and applied live.`);
      } else {
        report('error', res.error || 'Failed to save custom preset.');
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteCustomPreset = async (preset: GlobalThemePreset) => {
    if (preset.isBuiltIn) return;
    setBusyAction(`del-${preset.id}`);
    try {
      const remaining = draft.customPresets.filter((p) => p.id !== preset.id);
      const fallbackActive =
        draft.activePresetId === preset.id ? DEFAULT_GLOBAL_THEME_CONFIG.activePresetId : draft.activePresetId;
      const nextConfig: GlobalThemeConfig = {
        ...draft,
        activePresetId: fallbackActive,
        customPresets: remaining,
      };
      setDraft(nextConfig);
      const res = await updateGlobalTheme(nextConfig);
      if (res.success) {
        report('success', `Deleted custom preset "${preset.name}".`);
      } else {
        report('error', res.error || 'Failed to delete preset.');
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleVariableChange = (key: keyof Omit<GlobalThemeVariables, 'glow'>, value: string) => {
    setDraft((prev) => {
      const nextVars: GlobalThemeVariables = {
        ...prev.variables,
        [key]: value,
      };
      if (key === 'primary') {
        nextVars.glow = hexToRgba(value, prev.mode === 'dark' ? 0.34 : 0.18);
      }
      return {
        ...prev,
        enabled: true,
        variables: nextVars,
      };
    });
  };

  const cssPreviewCode = useMemo(
    () => formatThemeCssVariablesBlock(activePreset?.name || 'Custom Theme', draft.variables),
    [activePreset?.name, draft.variables]
  );

  const handleCopyCss = async () => {
    try {
      await navigator.clipboard.writeText(cssPreviewCode);
      setCopiedCss(true);
      setTimeout(() => setCopiedCss(false), 1800);
    } catch {
      report('error', 'Clipboard copy is not available in this browser context.');
    }
  };

  /* ==========================================================================
     COMPACT MODE (Quick Preset Switcher inside Landing & Settings)
     ========================================================================== */
  if (compact) {
    const featuredPresets = allPresets.slice(0, 6);
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Global Theme Manager
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Switch portal-wide CSS variables in index.css · Active:{' '}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {globalTheme.enabled ? activePreset?.name || 'Custom Theme' : 'Portal Default'}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {globalTheme.enabled && (
              <button
                type="button"
                disabled={busyAction === 'reset'}
                onClick={() => void handleResetDefault()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Default</span>
              </button>
            )}
            {onOpenFullStudio && (
              <button
                type="button"
                onClick={onOpenFullStudio}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Customize CSS Variables</span>
              </button>
            )}
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {featuredPresets.map((preset) => {
            const isActive = globalTheme.enabled && globalTheme.activePresetId === preset.id;
            const isBusy = busyAction === `preset-${preset.id}`;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() => void handleQuickApplyPreset(preset)}
                className={`group text-left p-3 rounded-xl border transition-all cursor-pointer disabled:opacity-60 ${
                  isActive
                    ? isNeonMode
                      ? 'border-cyan-400/70 bg-cyan-500/10 shadow-[0_0_16px_rgba(34,211,238,0.2)]'
                      : 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-950/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5">
                    {[
                      preset.variables.bg,
                      preset.variables.surface,
                      preset.variables.primary,
                      preset.variables.accent,
                    ].map((hex, idx) => (
                      <span
                        key={idx}
                        className="w-4 h-4 rounded-full border border-black/15 dark:border-white/20 shrink-0"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    {isBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                    ) : isActive ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Active</span>
                      </>
                    ) : (
                      <span>{preset.mode === 'dark' ? 'Dark' : 'Light'}</span>
                    )}
                  </span>
                </div>
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {preset.name}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {preset.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ==========================================================================
     FULL GLOBAL THEME STUDIO
     ========================================================================== */
  return (
    <div className="space-y-6">
      {localStatus && (
        <div
          className={`px-4 py-3 rounded-lg border text-xs font-medium ${
            localStatus.type === 'success'
              ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
              : 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300'
          }`}
        >
          {localStatus.text}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {/* Studio Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-blue-600 dark:text-cyan-400 shrink-0" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Global Theme Manager
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Save and switch presets to update `:root` CSS variables in `index.css` across the entire portal · Channel{' '}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {channelStatus === 'subscribed' ? 'live' : channelStatus}
              </span>
              {lastUpdatedAt ? (
                <>
                  {' · '}
                  <span className="font-mono tabular-nums">
                    Synced {new Date(lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setLivePreview((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                livePreview
                  ? 'border-blue-500/50 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-cyan-300'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{livePreview ? 'Live Preview On' : 'Live Preview Off'}</span>
            </button>

            <button
              type="button"
              disabled={busyAction === 'reset'}
              onClick={() => void handleResetDefault()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Default</span>
            </button>

            <button
              type="button"
              disabled={busyAction === 'publish'}
              onClick={() => void handlePublishDraft()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              {busyAction === 'publish' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{hasUnsavedChanges ? 'Save & Publish Theme' : 'Publish Theme'}</span>
            </button>
          </div>
        </div>

        <div className="p-5 space-y-6">
          {/* Master Enable Toggle & Base Mode */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Activate Global CSS Variable Theme Across Portal
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                When active, the selected preset&apos;s `:root` CSS variables override primary actions, surfaces, canvas backgrounds, and borders for all users in real time.
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              {/* Light / Dark Base Mode */}
              <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, mode: 'light', enabled: true }))}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    draft.mode === 'light'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, mode: 'dark', enabled: true }))}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    draft.mode === 'dark'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>Dark</span>
                </button>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={draft.enabled}
                onClick={() => setDraft((prev) => ({ ...prev, enabled: !prev.enabled }))}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                  draft.enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    draft.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Curated & Custom Presets Gallery */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Theme Presets ({allPresets.length})
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Select a preset to load its CSS variables immediately, then click Save &amp; Publish Theme to broadcast live.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {allPresets.map((preset) => {
                const selected = draft.enabled && draft.activePresetId === preset.id;
                return (
                  <motion.div
                    key={preset.id}
                    whileHover={{ y: -2 }}
                    transition={{ duration: 0.16 }}
                    className={`relative rounded-xl border p-3.5 transition-all ${
                      selected
                        ? isNeonMode
                          ? 'border-cyan-400/75 bg-cyan-500/10 shadow-[0_0_22px_-6px_rgba(34,211,238,0.4)]'
                          : 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/60 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectPresetInStudio(preset)}
                      className="w-full text-left cursor-pointer"
                    >
                      {/* Mini UI Preview Strip */}
                      <div
                        className="h-14 rounded-lg p-2.5 mb-3 border flex items-center justify-between gap-2 overflow-hidden"
                        style={{
                          backgroundColor: preset.variables.bg,
                          borderColor: preset.variables.border,
                        }}
                      >
                        <div
                          className="h-full flex-1 rounded-md px-2.5 flex items-center justify-between border"
                          style={{
                            backgroundColor: preset.variables.surface,
                            borderColor: preset.variables.border,
                          }}
                        >
                          <div className="space-y-1 min-w-0">
                            <div
                              className="h-2 w-14 rounded-xs"
                              style={{ backgroundColor: preset.variables.text }}
                            />
                            <div
                              className="h-1.5 w-10 rounded-xs opacity-65"
                              style={{ backgroundColor: preset.variables.textMuted }}
                            />
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className="h-4 w-8 rounded-xs"
                              style={{ backgroundColor: preset.variables.primary }}
                            />
                            <span
                              className="h-4 w-4 rounded-xs"
                              style={{ backgroundColor: preset.variables.accent }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {preset.name}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                            {preset.description}
                          </div>
                        </div>
                        {selected && (
                          <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                            <Check className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span>
                          {preset.mode === 'dark' ? 'Dark base' : 'Light base'} ·{' '}
                          {preset.isBuiltIn ? 'Built-in' : 'Custom preset'}
                        </span>
                        <span className="font-mono tabular-nums">{preset.variables.primary}</span>
                      </div>
                    </button>

                    {!preset.isBuiltIn && (
                      <button
                        type="button"
                        title={`Delete ${preset.name}`}
                        disabled={busyAction === `del-${preset.id}`}
                        onClick={() => void handleDeleteCustomPreset(preset)}
                        className="absolute top-2.5 right-2.5 p-1.5 rounded-md bg-slate-900/75 text-rose-300 hover:text-rose-200 hover:bg-rose-950/90 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* CSS Variable Editor Grid */}
          <div className="pt-5 border-t border-slate-200 dark:border-slate-800">
            <div className="mb-3">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Fine-Tune `:root` CSS Variables (`src/index.css`)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Adjust any token below to customize the active preset or build a brand-new institutional theme.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {CSS_VAR_FIELDS.map((field) => {
                const value = draft.variables[field.key];
                return (
                  <div
                    key={field.key}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                          {field.label}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          {field.cssVar}
                        </div>
                      </div>
                      <input
                        type="color"
                        aria-label={field.label}
                        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#1d4ed8'}
                        onChange={(e) => handleVariableChange(field.key, e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer border border-slate-300 dark:border-slate-700 bg-transparent shrink-0"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => handleVariableChange(field.key, e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Split: Save Custom Preset + Live Component & CSS Output Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-5 border-t border-slate-200 dark:border-slate-800">
            {/* Save as Custom Preset */}
            <form
              onSubmit={(e) => void handleSaveCustomPreset(e)}
              className="lg:col-span-5 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 flex flex-col justify-between gap-3"
            >
              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Save Current Palette as Custom Preset
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Saved presets are stored in Supabase `site_settings` and available to all administrators.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Preset Name
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Golden Jubilee Night"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Short Description
                  </label>
                  <input
                    type="text"
                    value={customDesc}
                    onChange={(e) => setCustomDesc(e.target.value)}
                    placeholder="e.g. Reunion evening dark gold palette"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busyAction === 'save-preset'}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors cursor-pointer disabled:opacity-50"
              >
                {busyAction === 'save-preset' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>Save &amp; Apply Custom Preset</span>
              </button>
            </form>

            {/* Generated :root CSS Output + Live Preview Card */}
            <div className="lg:col-span-7 space-y-3">
              <div
                className="p-4 rounded-xl border transition-colors"
                style={{
                  backgroundColor: draft.variables.bg,
                  borderColor: draft.variables.border,
                  color: draft.variables.text,
                }}
              >
                <div
                  className="p-4 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  style={{
                    backgroundColor: draft.variables.surface,
                    borderColor: draft.variables.border,
                  }}
                >
                  <div>
                    <div
                      data-preserve-text-color="true"
                      className="text-sm font-bold"
                      style={{ color: draft.variables.text }}
                    >
                      SZMC Alumni Portal Preview
                    </div>
                    <div
                      data-preserve-text-color="true"
                      className="text-xs mt-0.5"
                      style={{ color: draft.variables.textMuted }}
                    >
                      Previewing {activePreset?.name || 'Custom Theme'} · {draft.mode === 'dark' ? 'Dark' : 'Light'} mode
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                      style={{
                        backgroundColor: draft.variables.primary,
                        boxShadow: `0 6px 18px -6px ${draft.variables.glow}`,
                      }}
                    >
                      Primary Action
                    </span>
                    <span
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                      style={{ backgroundColor: draft.variables.accent }}
                    >
                      Accent
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-200 overflow-hidden">
                <div className="px-3.5 py-2 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-400">
                    index.css · Active :root CSS Variables
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopyCss()}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    {copiedCss ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCss ? 'Copied' : 'Copy CSS'}</span>
                  </button>
                </div>
                <pre className="p-3.5 text-[11px] leading-relaxed font-mono overflow-x-auto text-cyan-200">
                  {cssPreviewCode}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlobalThemeManager;
