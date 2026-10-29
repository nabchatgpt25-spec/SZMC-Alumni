import React, { useEffect, useState } from 'react';
import { AlertTriangle, Stethoscope } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getCachedFeatureFlags } from '../services/featureFlagService';

/**
 * Shows a loud banner when the UI is "logged in" but there is no real Supabase
 * session. In that state every RLS-protected write silently fails, which makes
 * the app look broken ("everything is visible but nothing saves").
 */
export const ConnectionHealthBanner: React.FC = () => {
  const { isLoggedIn } = useAuth();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [flagsLoaded, setFlagsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    if (!isSupabaseConfigured) {
      setHasSession(false);
      return;
    }
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setHasSession(Boolean(data.session?.access_token));
      })
      .catch(() => active && setHasSession(false));
    return () => {
      active = false;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    // If the feature-flag table is unreachable we are most likely offline /
    // pointing at the wrong project; still show the banner based on defaults.
    setFlagsLoaded(Object.keys(getCachedFeatureFlags()).length > 0);
  }, []);

  if (!isLoggedIn || hasSession === null || hasSession) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[60] bg-rose-600 text-white text-xs font-semibold px-4 py-2 flex flex-wrap items-center justify-center gap-2 shadow-lg">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>
        Local mode: you are visible as logged in, but there is <strong>no Supabase session</strong> —
        posts, admin switches and profile saves will NOT be stored.
      </span>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event('szmc_open_diagnostics'))}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/20 hover:bg-white/30 cursor-pointer"
      >
        <Stethoscope className="w-3.5 h-3.5" />
        Run diagnostics
      </button>
      <span className="opacity-70">
        {flagsLoaded ? '' : '(flags could not be loaded)'}
      </span>
    </div>
  );
};
