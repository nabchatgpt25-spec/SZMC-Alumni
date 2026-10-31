import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  getMessagingProfileId,
  invalidateMessagingIdentity,
  subscribeToMessagingIdentityChanges,
} from '../services/messagingService';

/**
 * Resolves the *messaging* identity (public.profiles.id) for the signed-in user.
 *
 * public.messages.sender_id and public.conversation_participants.profile_id both
 * reference public.profiles(id) — NOT public.alumni_profiles(id). Migration 013/014
 * bridges the two tables so the ids normally match, but we resolve the authoritative
 * id at runtime so that inserts never fail a foreign-key / RLS identity check.
 */
export function useMessagingProfileId(appProfileId?: number | null) {
  const [messagingProfileId, setMessagingProfileId] = useState<number | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const resolve = () => {
      getMessagingProfileId()
        .then((id) => {
          if (cancelled) return;
          setMessagingProfileId(id);
          setResolved(true);
        })
        .catch(() => {
          if (!cancelled) setResolved(true);
        });
    };

    resolve();

    const unsubscribe = subscribeToMessagingIdentityChanges((id) => {
      if (!cancelled) setMessagingProfileId(id);
    });

    // Re-resolve whenever the Supabase session changes (sign-in / sign-out / refresh).
    // The identity cache is dropped first so a different account can never inherit
    // the previous user's public.profiles.id.
    const authSubscription = isSupabaseConfigured
      ? supabase.auth.onAuthStateChange((event) => {
          if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
            invalidateMessagingIdentity();
          }
          if (!cancelled) window.setTimeout(resolve, 0);
        }).data.subscription
      : null;

    return () => {
      cancelled = true;
      unsubscribe();
      authSubscription?.unsubscribe();
    };
  }, [appProfileId]);

  return {
    messagingProfileId,
    resolved,
    /** Safe id to use in UI comparisons: messaging id first, app profile id as fallback. */
    effectiveProfileId: messagingProfileId ?? appProfileId ?? null,
  };
}
