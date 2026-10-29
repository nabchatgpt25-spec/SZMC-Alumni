import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { isUserSuperAdmin, isUserGeneralAdmin, isUserSubAdmin } from '../types';
import {
  FEATURE_FLAG_DEFAULTS,
  fetchFeatureFlags,
  getCachedFeatureFlags,
  onFeatureFlagsChanged,
  setFeatureFlag,
  type FeatureFlagMap,
} from '../services/featureFlagService';

/**
 * Single source of truth for the verification system's visibility.
 *
 * The member-facing verification UI (Verification Center modal, peer-vouch
 * banners/buttons, verification badges, the verification section in Settings)
 * is fully controlled from the Admin Panel through the server-side flag
 * `member_verification_portal`.
 *
 * Default = HIDDEN. Administrators always keep access so they can still verify
 * alumni from the admin panel.
 */
export function useVerificationVisibility() {
  const { currentUser } = useAuth();
  const [flags, setFlags] = useState<FeatureFlagMap>(getCachedFeatureFlags);

  useEffect(() => {
    let active = true;

    const sync = () => {
      if (active) setFlags(getCachedFeatureFlags());
    };

    const unsubscribe = onFeatureFlagsChanged(sync);

    // Pull the authoritative values from Supabase (cache handles first paint).
    void fetchFeatureFlags().then((next) => {
      if (active) setFlags(next);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const isAdminUser =
    isUserSuperAdmin(currentUser) ||
    isUserGeneralAdmin(currentUser) ||
    isUserSubAdmin(currentUser);

  const rawMemberPortalVisible =
    flags.member_verification_portal ?? FEATURE_FLAG_DEFAULTS.member_verification_portal;

  /** Should the member-facing verification UI be rendered for this viewer? */
  const memberPortalVisible = isAdminUser || rawMemberPortalVisible === true;

  const setMemberPortalVisible = useCallback(
    async (visible: boolean) => {
      const result = await setFeatureFlag('member_verification_portal', visible);
      setFlags(getCachedFeatureFlags());
      return result;
    },
    []
  );

  return {
    /** Render the member-facing verification UI? (admins always yes) */
    memberPortalVisible,
    /** Raw stored flag value — use this for the admin toggle's own label/state. */
    rawMemberPortalVisible,
    /** Is the global verification gate (auth enforcement) currently enforced? */
    verificationGateEnabled:
      flags.global_verification_gate ?? FEATURE_FLAG_DEFAULTS.global_verification_gate,
    /** Can the current viewer change these switches? */
    canManageVerification: isAdminUser,
    /** Admin action: show/hide the member verification portal for everyone. */
    setMemberPortalVisible,
    flags,
  };
}
