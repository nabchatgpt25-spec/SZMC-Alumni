import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  supabase,
  isSupabaseConfigured,
  setInMemoryDirectAuthToken,
  getInMemoryDirectAuthToken,
} from '../lib/supabase';
import {
  getOrCreateSupabaseProfile,
} from '../lib/supabase-auth';
import { AlumniProfile, SUPER_ADMIN_EMAILS, isUserAnyAdmin } from '../types';
import { DEFAULT_BLANK_USER } from '../data/mockData';
import { formatToE164Phone, normalizePhoneNumber } from '../utils/phone';
import { isInstantAutoVerificationActive } from '../services/siteConfigService';
import { invalidateAlumniDirectoryCache } from '../services/supabaseService';

export { formatToE164Phone, normalizePhoneNumber };

interface AuthContextType {
  isAuthInitializing: boolean;
  authInitializationError: string | null;
  isLoggedIn: boolean;
  currentUser: AlumniProfile;
  firebaseToken: string | null;
  supabaseToken: string | null;
  isAdminUser: boolean;
  login: (phoneOrEmail: string, pass: string) => Promise<boolean>;
  loginWithPhoneOtp: (phone: string) => Promise<boolean>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<boolean>;
  logout: () => void;
  register: (profileData: Partial<AlumniProfile> & { password?: string }) => Promise<boolean>;
  updateProfile: (updated: Partial<AlumniProfile>) => Promise<{ success: boolean; error?: string }>;
  deleteAccount: (confirmationPassword?: string) => Promise<boolean>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean }>;
  completePasswordRecovery: (newPassword: string) => Promise<boolean>;
  getAuthHeaders: () => Promise<Record<string, string>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);


// In-memory token reference (never persisted to localStorage per security guidelines)
let inMemorySupabaseToken: string | null = null;

const DIRECT_AUTH_STORAGE_KEY = 'szmc_direct_authenticated_user';

function saveDirectAuthUser(profile: AlumniProfile) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(DIRECT_AUTH_STORAGE_KEY, JSON.stringify(profile));
    }
  } catch (e) {
    console.warn('Failed to save direct auth user to localStorage', e);
  }
}

function getDirectAuthToken(): string | null {
  return getInMemoryDirectAuthToken();
}

function getDirectAuthUser(): AlumniProfile | null {
  try {
    if (typeof window !== 'undefined') {
      // Never restore an unauthenticated cached profile unless a live in-memory session token exists
      if (!getDirectAuthToken()) {
        return null;
      }
      const stored = localStorage.getItem(DIRECT_AUTH_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as AlumniProfile;
      }
    }
  } catch (e) {
    console.warn('Failed to parse direct auth user', e);
  }
  return null;
}

function clearDirectAuthUser() {
  setInMemoryDirectAuthToken(null);
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(DIRECT_AUTH_STORAGE_KEY);
      localStorage.removeItem('szmc_direct_auth_token');
    }
  } catch (e) {
    console.warn('Failed to clear direct auth user', e);
  }
}

function cleanEmailMatchAdmin(email?: string): boolean {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  return (
    clean === 'nurulanambashir25@gmail.com' ||
    clean === 'nurulanambashir20@gmail.com' ||
    clean === 'admin@szmcalumni.net' ||
    clean === 'firstaidnetworkbd@gmail.com' ||
    SUPER_ADMIN_EMAILS.some((e) => e.toLowerCase() === clean)
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabaseToken, setSupabaseToken] = useState<string | null>(null);

  // Synchronously restore direct authenticated alumni from localStorage so there is zero logout on page refresh
  const initialDirectUser = getDirectAuthUser();

  // Never grant client-side admin UI solely from unverified localStorage on boot
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);

  const [isAuthInitializing, setIsAuthInitializing] = useState(!initialDirectUser);
  const [authInitializationError, setAuthInitializationError] = useState<string | null>(null);
  const authResolutionIdRef = useRef(0);
  const resolvedAuthUserIdRef = useRef<string | null>(
    initialDirectUser ? (initialDirectUser.authUserId || String(initialDirectUser.id)) : null
  );
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(Boolean(initialDirectUser));

  const [currentUser, setCurrentUser] = useState<AlumniProfile>(() => initialDirectUser || DEFAULT_BLANK_USER);

  // Restore session; if a server-issued direct token exists without a Supabase session, verify it against the backend.
  useEffect(() => {
    let active = true;
    let authEventReceived = false;

    const applySession = async (session: Session | null, requestId: number) => {
      if (!active || requestId !== authResolutionIdRef.current) return;

      if (!session?.user) {
        const directToken = getDirectAuthToken();
        const directUser = directToken ? getDirectAuthUser() : null;
        if (directUser && directToken) {
          try {
            const verifyRes = await fetch('/api/auth/verify-session', {
              headers: { Authorization: `Bearer ${directToken}` },
            });
            if (verifyRes.ok) {
              const verifyData = await verifyRes.json();
              if (!active || requestId !== authResolutionIdRef.current) return;

              const verifiedRole = (verifyData?.user?.role || 'member') as AlumniProfile['role'];
              const isPrivileged = Boolean(verifyData?.permissions?.canAccessAdminPortal);

              resolvedAuthUserIdRef.current = directUser.authUserId || String(directUser.id);
              const effectiveProfile: AlumniProfile = {
                ...directUser,
                role: verifiedRole,
                verificationStatus: isPrivileged
                  ? 'verified'
                  : (directUser.verificationStatus || 'unverified'),
              };
              setCurrentUser(effectiveProfile);
              setIsAdminUser(isPrivileged);
              setIsLoggedIn(true);
              setAuthInitializationError(null);
              setIsAuthInitializing(false);
              return;
            }
          } catch {
            // Fall through to signed-out cleanup
          }
        }

        clearDirectAuthUser();

        resolvedAuthUserIdRef.current = null;
        inMemorySupabaseToken = null;
        setSupabaseToken(null);
        setIsAdminUser(false);
        setCurrentUser(DEFAULT_BLANK_USER);
        setIsLoggedIn(false);
        setAuthInitializationError(null);
        setIsAuthInitializing(false);
        return;
      }

      // Session exists: do NOT proactively wipe currentUser or set isLoggedIn(false)
      if (session.access_token) {
        inMemorySupabaseToken = session.access_token;
        setSupabaseToken(session.access_token);
      }
      setAuthInitializationError(null);

      try {
        let profile = await getOrCreateSupabaseProfile(session.user);
        if (!active || requestId !== authResolutionIdRef.current) return;

        if (!profile) {
          const directUser = getDirectAuthUser();
          if (directUser) {
            profile = directUser;
          } else {
            const rawBatch = Number((session.user.user_metadata as any)?.batch_year) || 25;
            const normalizedBatch = rawBatch > 1900 ? rawBatch - 1991 : (rawBatch > 0 && rawBatch <= 35 ? rawBatch : 25);
            profile = {
              id: Number(session.user.id.replace(/[^0-9]/g, '').slice(0, 10)) || Date.now(),
              userId: Number(session.user.id.replace(/[^0-9]/g, '').slice(0, 10)) || Date.now(),
              authUserId: session.user.id,
              fullName:
                (session.user.user_metadata as any)?.full_name ||
                (session.user.user_metadata as any)?.name ||
                session.user.email?.split('@')[0] ||
                (session.user.phone ? `Doctor (${session.user.phone})` : 'SZMC Doctor'),
              avatarUrl: (session.user.user_metadata as any)?.avatar_url || '/assets/aistudio/images__1__2778177d.png',
              batchYear: normalizedBatch,
              academicStream: 'MBBS',
              academicGroup: null,
              section: 'MBBS',
              verificationStatus: 'unverified',
              vouchesCount: 0,
              vouchTargetCount: 2,
              profession: 'Medical Doctor / Physician',
              position: 'Physician',
              institution: 'Shaheed Ziaur Rahman Medical College Hospital',
              specialty: ['Internal Medicine'],
              degree: ['MBBS'],
              city: 'Bogura',
              country: 'Bangladesh',
              email: session.user.email,
              phone: session.user.phone,
              role: 'member',
              isPublic: true,
              online: true,
              badges: ['SZMCian'],
            };
          }
        }

        resolvedAuthUserIdRef.current = session.user.id;
        const userEmail = (profile.email || session.user.email || '').toLowerCase().trim();
        const isSuperAdmin =
          profile.role === 'super_admin' || cleanEmailMatchAdmin(userEmail);
        const isAnyPortalRole =
          isSuperAdmin || profile.role === 'admin' || profile.role === 'moderator';

        const effectiveProfile: AlumniProfile = {
          ...profile,
          role: isSuperAdmin ? 'super_admin' : (profile.role || 'member'),
          verificationStatus: isSuperAdmin || profile.role === 'admin' ? 'verified' : profile.verificationStatus,
        };

        setCurrentUser(effectiveProfile);
        setIsAdminUser(isAnyPortalRole);
        setIsLoggedIn(true);
        saveDirectAuthUser(effectiveProfile);
      } catch (err) {
        if (!active || requestId !== authResolutionIdRef.current) return;
        console.warn('Failed to load profile for Supabase session:', err);
        const directUser = getDirectAuthUser();
        if (directUser) {
          const directEmail = (directUser.email || '').toLowerCase().trim();
          const isSuper = directUser.role === 'super_admin' || cleanEmailMatchAdmin(directEmail);
          const hasPortalAccess = isSuper || directUser.role === 'admin' || directUser.role === 'moderator';
          const effective = {
            ...directUser,
            role: (isSuper ? 'super_admin' : directUser.role) as any,
            verificationStatus: (isSuper || directUser.role === 'admin' ? 'verified' : directUser.verificationStatus) as any,
          };
          setCurrentUser(effective);
          setIsAdminUser(hasPortalAccess);
          setIsLoggedIn(true);
        } else {
          setAuthInitializationError(
            'Your session is active, but your profile had a transient load error. Refreshing shortly.'
          );
        }
      } finally {
        if (active && requestId === authResolutionIdRef.current) {
          setIsAuthInitializing(false);
        }
      }
    };

    if (!isSupabaseConfigured) {
      const directUser = getDirectAuthUser();
      if (directUser && directUser.role !== 'admin') {
        setCurrentUser(directUser);
        setIsAdminUser(false);
        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
        setIsAdminUser(false);
        setCurrentUser(DEFAULT_BLANK_USER);
      }
      setSupabaseToken(null);
      setAuthInitializationError(null);
      setIsAuthInitializing(false);
      return () => {
        active = false;
        authResolutionIdRef.current += 1;
      };
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      authEventReceived = true;
      const requestId = ++authResolutionIdRef.current;
      // Only clear credentials if user explicitly initiated sign out
      if (event === 'SIGNED_OUT') {
        clearDirectAuthUser();
        resolvedAuthUserIdRef.current = null;
        setCurrentUser(DEFAULT_BLANK_USER);
        setIsLoggedIn(false);
        setIsAdminUser(false);
        setSupabaseToken(null);
        setIsAuthInitializing(false);
        return;
      }
      window.setTimeout(() => {
        void applySession(session, requestId);
      }, 0);
    });

    // Safety fallback: Never leave isAuthInitializing true for more than 1 second
    const initSafetyTimer = window.setTimeout(() => {
      if (active) {
        setIsAuthInitializing(false);
      }
    }, 1000);

    void supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        clearTimeout(initSafetyTimer);
        if (error) throw error;
        // Avoid duplicate profile DB query if onAuthStateChange already resolved INITIAL_SESSION
        if (authEventReceived) {
          if (!session && !initialDirectUser) {
            setIsAuthInitializing(false);
          }
          return;
        }
        if (session) {
          const requestId = ++authResolutionIdRef.current;
          void applySession(session, requestId);
        } else if (!initialDirectUser) {
          setIsAuthInitializing(false);
        }
      })
      .catch((err) => {
        clearTimeout(initSafetyTimer);
        if (!active) return;
        console.warn('Supabase getSession warning:', err);
        setIsAuthInitializing(false);
      });

    return () => {
      active = false;
      clearTimeout(initSafetyTimer);
      authResolutionIdRef.current += 1;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleAdminUserUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<AlumniProfile>;
      if (customEvent.detail && customEvent.detail.id === currentUser.id) {
        setCurrentUser(customEvent.detail);
      }
    };
    window.addEventListener('szmc_current_user_updated', handleAdminUserUpdate);
    return () => window.removeEventListener('szmc_current_user_updated', handleAdminUserUpdate);
  }, [currentUser.id]);

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const anonKey = (import.meta.env?.VITE_SUPABASE_ANON_KEY || '').trim();
    if (anonKey) {
      headers.apikey = anonKey;
    }

    // Primary: Use Supabase session JWT
    if (isSupabaseConfigured) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          inMemorySupabaseToken = session.access_token;
          headers.Authorization = `Bearer ${session.access_token}`;
          return headers;
        }
      } catch {}
    }
    if (inMemorySupabaseToken) {
      headers.Authorization = `Bearer ${inMemorySupabaseToken}`;
      return headers;
    }

    const directToken = getInMemoryDirectAuthToken();
    if (directToken) {
      headers.Authorization = `Bearer ${directToken}`;
      return headers;
    }

    return headers;
  };

  const loginWithGoogle = async (): Promise<boolean> => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase client is not configured.');
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });
    if (error) {
      throw new Error(error.message || 'Google sign-in could not be started.');
    }
    return Boolean(data?.url);
  };

  const login = async (phoneOrEmail: string, pass: string): Promise<boolean> => {
    if (!phoneOrEmail?.trim() || !pass) {
      throw new Error('Please enter your email or mobile number and password.');
    }

    if (!isSupabaseConfigured) {
      throw new Error('Supabase client is not configured. Please check environment variables.');
    }

    const cleanInput = phoneOrEmail.trim();
    const isEmail = cleanInput.includes('@');

    // 1. Try Server-Verified Authentication First (verifies credentials on backend)
    try {
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: cleanInput, password: pass }),
      });
      if (loginRes.status === 401 || loginRes.status === 403) {
        const errJson = await loginRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Invalid credentials. Access denied.');
      }
      if (loginRes.ok) {
        const loginJson = await loginRes.json();
        if (loginJson.success && loginJson.profile) {
          if (loginJson.session?.access_token && loginJson.session?.refresh_token) {
            await supabase.auth
              .setSession({
                access_token: loginJson.session.access_token,
                refresh_token: loginJson.session.refresh_token,
              })
              .catch(() => {});
          }

          const returnedToken = loginJson.session?.access_token || loginJson.token || null;
          if (returnedToken) {
            inMemorySupabaseToken = returnedToken;
            setInMemoryDirectAuthToken(returnedToken);
            setSupabaseToken(returnedToken);
          }

          let profile: AlumniProfile = loginJson.profile;
          // If server returned a placeholder/unlinked profile id while a real Supabase session exists,
          // hydrate the authoritative alumni_profiles row directly using the active session.
          if (loginJson.session?.user && (!profile.id || profile.id <= 0 || !profile.authUserId)) {
            const hydrated = await getOrCreateSupabaseProfile(loginJson.session.user, profile).catch(
              () => null
            );
            if (hydrated) {
              profile = {
                ...hydrated,
                role:
                  profile.role === 'super_admin' || cleanEmailMatchAdmin(hydrated.email || profile.email)
                    ? 'super_admin'
                    : hydrated.role,
              };
            }
          }

          const hasPortalAccess =
            isUserAnyAdmin(profile) || profile.role === 'moderator';
          resolvedAuthUserIdRef.current = profile.authUserId || String(profile.id);
          setCurrentUser(profile);
          setIsAdminUser(hasPortalAccess);
          setIsLoggedIn(true);
          saveDirectAuthUser(profile);
          return true;
        }
      }
    } catch (serverAuthErr: any) {
      if (
        serverAuthErr?.message?.includes('Access denied') ||
        serverAuthErr?.message?.includes('Invalid') ||
        serverAuthErr?.message?.includes('Incorrect') ||
        serverAuthErr?.message?.includes('confirm your')
      ) {
        throw serverAuthErr;
      }
    }

    let authData: any = null;
    let authError: any = null;

    if (isEmail) {
      const cleanEmail = cleanInput.toLowerCase();
      try {
        const res = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: pass,
        });
        authData = res.data;
        authError = res.error;
      } catch (clientErr: any) {
        authError = clientErr;
      }

      // If client direct sign-in failed due to network or connection, try backend server proxy
      if (authError && (authError.message?.includes('fetch') || authError.message?.includes('network'))) {
        try {
          const fallbackRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: cleanEmail, password: pass }),
          });
          const fallbackJson = await fallbackRes.json();
          if (fallbackRes.ok && fallbackJson.session) {
            authData = { session: fallbackJson.session, user: fallbackJson.session.user };
            authError = null;
            await supabase.auth.setSession({
              access_token: fallbackJson.session.access_token,
              refresh_token: fallbackJson.session.refresh_token,
            });
          }
        } catch {}
      }
    } else {
      const norm = normalizePhoneNumber(cleanInput);
      if (!norm.isValid) {
        throw new Error(
          norm.error || 'Please enter a valid mobile number (e.g. 017xxxxxxxx or +8801xxxxxxxx).'
        );
      }
      const formattedPhone = norm.formatted;

      let edgeData: any = null;
      let edgeErr: any = null;

      try {
        const res = await supabase.functions.invoke('unified-phone-login', {
          body: { identifier: formattedPhone, password: pass },
        });
        edgeData = res.data;
        edgeErr = res.error;
      } catch (err: any) {
        edgeErr = err;
      }

      // If Edge Function invocation failed, is not deployed, or returned error, try backend endpoint /api/auth/unified-login
      if (edgeErr || edgeData?.error || !edgeData?.session) {
        try {
          const fallbackRes = await fetch('/api/auth/unified-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: formattedPhone, password: pass }),
          });
          const fallbackJson = await fallbackRes.json();
          if (fallbackRes.ok && fallbackJson?.session) {
            edgeData = { session: fallbackJson.session };
            edgeErr = null;
          } else if (fallbackRes.ok && fallbackJson?.profile) {
            setCurrentUser(fallbackJson.profile);
            setIsAdminUser(
              isUserAnyAdmin(fallbackJson.profile) ||
              fallbackJson.profile.role === 'moderator' ||
              cleanEmailMatchAdmin(fallbackJson.profile.email)
            );
            setIsLoggedIn(true);
            saveDirectAuthUser(fallbackJson.profile);
            return true;
          } else if (!fallbackRes.ok && fallbackJson?.error) {
            throw new Error(fallbackJson.error);
          }
        } catch (serverFallbackErr: any) {
          if (serverFallbackErr.message && !serverFallbackErr.message.includes('fetch')) {
            throw serverFallbackErr;
          }
        }
      }

      if (edgeErr && !edgeData?.session) {
        let parsedErr = '';
        try {
          if (edgeErr.context && typeof edgeErr.context.json === 'function') {
            const j = await edgeErr.context.json();
            if (j?.error) parsedErr = j.error;
            else if (j?.message) parsedErr = j.message;
          }
        } catch {}

        if (!parsedErr) {
          parsedErr = (edgeErr as any)?.context?.message || edgeErr.message || '';
        }

        if (parsedErr.includes('Failed to send a request') || parsedErr.includes('FunctionsFetchError')) {
          throw new Error(
            'Unable to connect to authentication service. Please check your internet connection or sign in using your registered email address.'
          );
        }

        throw new Error(parsedErr || 'Invalid mobile number or incorrect password.');
      }

      if (edgeData?.error) {
        throw new Error(edgeData.error);
      }

      if (!edgeData?.session?.access_token || !edgeData?.session?.refresh_token) {
        throw new Error('Invalid authentication response. Please check your credentials.');
      }

      const { data: sessionData, error: sessionErr } = await supabase.auth.setSession({
        access_token: edgeData.session.access_token,
        refresh_token: edgeData.session.refresh_token,
      });

      if (sessionErr) {
        throw new Error(sessionErr.message || 'Failed to establish authenticated session.');
      }

      if (sessionData?.user) {
        authData = sessionData;
      } else {
        authData = {
          user: edgeData.session.user,
          session: edgeData.session,
        };
      }
    }

    if (authError) {
      const msg = (authError.message || '').toLowerCase();
      if (msg.includes('email logins are disabled') || msg.includes('email_provider_disabled')) {
        throw new Error(
          'Email login is currently disabled in your Supabase project. Enable Email provider in Supabase Dashboard → Authentication → Providers → Email.'
        );
      }
      if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
        throw new Error('Invalid email or password. Please verify your credentials or reset your password.');
      }
      if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
        throw new Error(
          'Your email address has not been confirmed yet. Please open the confirmation link sent to your inbox before signing in.'
        );
      }
      throw new Error(authError.message || 'Login failed. Please check your credentials.');
    }

    if (!authData?.user) {
      throw new Error('Unable to authenticate with Supabase. Please check your credentials.');
    }

    if (authData.session?.access_token) {
      inMemorySupabaseToken = authData.session.access_token;
      setSupabaseToken(authData.session.access_token);
    }

    const profile = await getOrCreateSupabaseProfile(authData.user);
    if (profile) {
      setCurrentUser(profile);
      setIsAdminUser(
        isUserAnyAdmin(profile) ||
        profile.role === 'moderator' ||
        cleanEmailMatchAdmin(profile.email)
      );
      setIsLoggedIn(true);
      saveDirectAuthUser(profile);
      return true;
    }

    // Direct profile construction from authenticated user metadata if table query had transient delay
    const fallbackProfile: AlumniProfile = {
      id: Number(authData.user.id.replace(/[^0-9]/g, '').slice(0, 10)) || Date.now(),
      userId: Number(authData.user.id.replace(/[^0-9]/g, '').slice(0, 10)) || Date.now(),
      authUserId: authData.user.id,
      fullName:
        (authData.user.user_metadata as any)?.full_name ||
        (authData.user.user_metadata as any)?.name ||
        (isEmail ? cleanInput.split('@')[0] : cleanInput),
      avatarUrl: (authData.user.user_metadata as any)?.avatar_url || '/assets/aistudio/images__1__2778177d.png',
      batchYear: Number((authData.user.user_metadata as any)?.batch_year) || 25,
      academicStream: 'MBBS',
      academicGroup: null,
      section: 'MBBS',
      verificationStatus: 'unverified',
      vouchesCount: 0,
      vouchTargetCount: 2,
      profession: 'Medical Doctor / Physician',
      position: 'Physician',
      institution: 'Shaheed Ziaur Rahman Medical College Hospital, Bogura',
      specialty: ['Internal Medicine'],
      degree: ['MBBS'],
      city: 'Bogura',
      country: 'Bangladesh',
      email: isEmail ? cleanInput.toLowerCase() : (authData.user.email || undefined),
      phone: !isEmail ? formatToE164Phone(cleanInput) : (authData.user.phone || undefined),
      role: 'member',
      isPublic: true,
      online: true,
      badges: [],
    };
    setCurrentUser(fallbackProfile);
    setIsAdminUser(false);
    setIsLoggedIn(true);
    saveDirectAuthUser(fallbackProfile);
    return true;
  };

  const loginWithPhoneOtp = async (phone: string): Promise<boolean> => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase client is not configured.');
    }
    const norm = normalizePhoneNumber(phone);
    if (!norm.isValid) {
      throw new Error(norm.error || 'Please enter a valid mobile number (e.g. 017xxxxxxxx).');
    }
    const { error } = await supabase.auth.signInWithOtp({
      phone: norm.formatted,
    });
    if (error) {
      throw new Error(error.message || 'Failed to send verification SMS.');
    }
    return true;
  };

  const verifyPhoneOtp = async (phone: string, token: string): Promise<boolean> => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase client is not configured.');
    }
    const norm = normalizePhoneNumber(phone);
    if (!norm.isValid) {
      throw new Error(norm.error || 'Please enter a valid mobile number (e.g. 017xxxxxxxx).');
    }
    const { data, error } = await supabase.auth.verifyOtp({
      phone: norm.formatted,
      token: token.trim(),
      type: 'sms',
    });
    if (error) {
      throw new Error(error.message || 'Invalid or expired SMS verification code.');
    }
    if (data.user) {
      const profile = await getOrCreateSupabaseProfile(data.user);
      if (profile) {
        setCurrentUser(profile);
        setIsAdminUser(
          isUserAnyAdmin(profile) ||
          profile.role === 'moderator' ||
          cleanEmailMatchAdmin(profile.email)
        );
        setIsLoggedIn(true);
        saveDirectAuthUser(profile);
      }
    }
    return true;
  };

  const logout = () => {
    clearDirectAuthUser();
    authResolutionIdRef.current += 1;
    resolvedAuthUserIdRef.current = null;
    setAuthInitializationError(null);
    setIsAdminUser(false);
    setCurrentUser(DEFAULT_BLANK_USER);
    setIsLoggedIn(false);
    inMemorySupabaseToken = null;
    setSupabaseToken(null);
    if (isSupabaseConfigured) {
      supabase.auth.signOut().catch(() => {});
    }
  };

  const register = async (profileData: Partial<AlumniProfile> & { password?: string }): Promise<boolean> => {
    const cleanEmail = (profileData.email || '').trim().toLowerCase();
    const rawPhone = (profileData.phone || '').trim();
    const rawBatch = profileData.batchYear || 25;
    const normalizedBatch = rawBatch > 1900 ? rawBatch - 1991 : (rawBatch > 0 && rawBatch <= 35 ? rawBatch : 25);

    if (!cleanEmail || !profileData.password) {
      throw new Error('Please provide your email address and a password.');
    }

    let cleanPhone = '';
    if (rawPhone) {
      const norm = normalizePhoneNumber(rawPhone);
      if (!norm.isValid) {
        throw new Error(
          norm.error || 'Please enter a valid mobile number (e.g. 017xxxxxxxx or +8801xxxxxxxx).'
        );
      }
      cleanPhone = norm.formatted;
    }

    // 1. Primary: Server-side instant registration (auto-confirms account without sending a verification email)
    try {
      const registerRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: profileData.fullName?.trim() || cleanEmail.split('@')[0],
          avatarUrl: profileData.avatarUrl,
          email: cleanEmail,
          phone: cleanPhone || undefined,
          whatsapp: profileData.whatsapp?.trim() || undefined,
          password: profileData.password,
          batchYear: normalizedBatch,
          collegeRoll: profileData.collegeRoll,
          profession: profileData.profession,
          position: profileData.position,
          institution: profileData.institution,
          specialty: profileData.specialty,
          degree: profileData.degree,
          city: profileData.city,
          country: profileData.country,
          bloodGroup: profileData.bloodGroup,
        }),
      });
      const registerJson = await registerRes.json().catch(() => ({}));

      if (registerRes.status === 409 || registerRes.status === 400) {
        throw new Error(registerJson.error || 'Registration failed. Please check your details.');
      }

      if (registerRes.ok && registerJson?.profile && !registerJson?.useClientSignUp) {
        if (
          isSupabaseConfigured &&
          registerJson.session?.access_token &&
          registerJson.session?.refresh_token
        ) {
          await supabase.auth
            .setSession({
              access_token: registerJson.session.access_token,
              refresh_token: registerJson.session.refresh_token,
            })
            .catch(() => {});
        }

        const returnedToken = registerJson.session?.access_token || registerJson.token || null;
        if (returnedToken) {
          inMemorySupabaseToken = returnedToken;
          setInMemoryDirectAuthToken(returnedToken);
          setSupabaseToken(returnedToken);
        }

        const serverProfile: AlumniProfile = registerJson.profile;
        try {
          sessionStorage.setItem('szmc_just_registered', '1');
        } catch {}
        resolvedAuthUserIdRef.current = serverProfile.authUserId || String(serverProfile.id);
        setCurrentUser(serverProfile);
        setIsAdminUser(
          isUserAnyAdmin(serverProfile) ||
          serverProfile.role === 'moderator' ||
          cleanEmailMatchAdmin(serverProfile.email)
        );
        setIsLoggedIn(true);
        saveDirectAuthUser(serverProfile);
        return true;
      }
    } catch (serverRegErr: any) {
      if (
        serverRegErr?.message &&
        !serverRegErr.message.toLowerCase().includes('failed to fetch') &&
        !serverRegErr.message.toLowerCase().includes('network')
      ) {
        throw serverRegErr;
      }
    }

    if (!isSupabaseConfigured) {
      throw new Error('Registration service is currently unavailable. Please try again shortly.');
    }

    // 2. Direct Supabase Auth signUp (passes full profile metadata so auth.users trigger persists alumni_profiles immediately)
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: cleanEmail,
      password: profileData.password,
      options: {
        data: {
          full_name: profileData.fullName?.trim() || cleanEmail.split('@')[0],
          batch_year: normalizedBatch,
          phone: cleanPhone || null,
          whatsapp: profileData.whatsapp?.trim() || null,
          avatar_url: profileData.avatarUrl || null,
          position: profileData.position?.trim() || 'Physician',
          institution: profileData.institution?.trim() || 'Shaheed Ziaur Rahman Medical College Hospital',
          specialty: Array.isArray(profileData.specialty) ? profileData.specialty : [],
          degree: Array.isArray(profileData.degree) && profileData.degree.length > 0 ? profileData.degree : ['MBBS'],
          city: profileData.city?.trim() || 'Bogura',
          country: profileData.country?.trim() || 'Bangladesh',
          blood_group: profileData.bloodGroup || null,
        },
      },
    });

    const resolvedUser = signUpData?.user;
    if (signUpErr || !resolvedUser) {
      const msg = (signUpErr?.message || '').toLowerCase();
      if (msg.includes('email signups are disabled') || msg.includes('email_provider_disabled')) {
        throw new Error(
          'Email sign-up is currently disabled in your Supabase project. Enable Email provider in Supabase Dashboard → Authentication → Providers → Email.'
        );
      }
      if (msg.includes('already registered') || msg.includes('user already exists')) {
        throw new Error('An account with this email already exists. Please sign in directly.');
      }
      throw new Error(signUpErr?.message || 'Registration failed. Please check your credentials.');
    }

    // Supabase returns an empty identities array when signing up with an already-registered email
    if (Array.isArray(resolvedUser.identities) && resolvedUser.identities.length === 0) {
      throw new Error('An account with this email already exists. Please sign in directly.');
    }

    if (!signUpData.session) {
      throw new Error(
        'CONFIRM_EMAIL_REQUIRED: Account created! Please check your email inbox to confirm your address, then sign in.'
      );
    }

    if (signUpData.session?.access_token) {
      inMemorySupabaseToken = signUpData.session.access_token;
      setSupabaseToken(inMemorySupabaseToken);
    }

    try {
      sessionStorage.setItem('szmc_just_registered', '1');
    } catch {}

    let profile: AlumniProfile | null = null;
    if (resolvedUser) {
      profile = await getOrCreateSupabaseProfile(resolvedUser, {
        ...profileData,
        email: cleanEmail,
        phone: cleanPhone || undefined,
        batchYear: normalizedBatch,
      });
    }

    if (!profile && resolvedUser) {
      const isAutoActive = isInstantAutoVerificationActive();
      const syntheticFallbackId = Number(resolvedUser.id.replace(/[^0-9]/g, '').slice(0, 10)) || Date.now();

      profile = {
        id: syntheticFallbackId,
        userId: syntheticFallbackId,
        authUserId: resolvedUser.id,
        fullName: profileData.fullName?.trim() || cleanEmail.split('@')[0],
        avatarUrl: profileData.avatarUrl || '/assets/aistudio/images__1__2778177d.png',
        batchYear: normalizedBatch,
        academicStream: 'MBBS',
        academicGroup: null,
        group: 'MBBS',
        section: `SZMC-${normalizedBatch < 10 ? '0' + normalizedBatch : normalizedBatch}`,
        collegeRoll: profileData.collegeRoll || '',
        verificationMethod: isAutoActive ? 'admin_instant' : (profileData.verificationMethod || 'two_vouches'),
        verificationStatus: isAutoActive ? 'verified' : 'unverified',
        vouchesCount: isAutoActive ? 2 : 0,
        vouchTargetCount: 2,
        verifiedBy: isAutoActive ? ['Instant Admin Verification'] : [],
        badges: isAutoActive ? ['Verified SZMC Doctor', 'SZMCian'] : ['SZMCian'],
        profession: profileData.profession || profileData.position || 'Medical Doctor',
        position: profileData.position || 'Physician',
        institution: profileData.institution || 'Shaheed Ziaur Rahman Medical College Hospital',
        specialty: profileData.specialty || ['General Medicine'],
        degree: profileData.degree || ['MBBS'],
        city: profileData.city || 'Bogura',
        country: profileData.country || 'Bangladesh',
        phone: cleanPhone || undefined,
        whatsapp: profileData.whatsapp || undefined,
        email: cleanEmail,
        role: 'member',
        isPublic: true,
        online: true,
      };

      try {
        if (resolvedUser?.id) {
          const { data: upsertedRow, error: upsertErr } = await supabase
            .from('alumni_profiles')
            .upsert(
              {
                auth_user_id: resolvedUser.id,
                full_name: profile.fullName,
                avatar_url: profile.avatarUrl,
                batch_year: profile.batchYear,
                academic_stream: 'Science',
                academic_group: null,
                section: profile.section,
                position: profile.position,
                institution: profile.institution,
                specialty: Array.isArray(profile.specialty) ? profile.specialty : [],
                degree: Array.isArray(profile.degree) && profile.degree.length > 0 ? profile.degree : ['MBBS'],
                city: profile.city,
                country: profile.country,
                email: profile.email,
                phone: profile.phone || null,
                whatsapp: profile.whatsapp || null,
                blood_group: profileData.bloodGroup || null,
                is_public: true,
              },
              { onConflict: 'auth_user_id' }
            )
            .select('id')
            .maybeSingle();

          if (upsertedRow?.id) {
            profile.id = Number(upsertedRow.id);
            profile.userId = Number(upsertedRow.id);
          }
          if (upsertErr) {
            console.warn('Note on direct alumni_profiles insert:', upsertErr);
          }
        }
      } catch (upsertErr) {
        console.warn('Note on direct alumni_profiles insert:', upsertErr);
      }
    }

    if (profile) {
      setCurrentUser(profile);
      setIsAdminUser(
        isUserAnyAdmin(profile) ||
        profile.role === 'moderator' ||
        cleanEmailMatchAdmin(profile.email)
      );
      setIsLoggedIn(true);
      saveDirectAuthUser(profile);
      return true;
    }

    throw new Error('Registration could not complete profile creation. Please try again.');
  };

  const updateProfile = async (
    updated: Partial<AlumniProfile>
  ): Promise<{ success: boolean; error?: string }> => {
    const VALID_BLOOD_GROUPS = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);

    let cleanPhone: string | undefined = updated.phone;
    if (typeof cleanPhone === 'string') {
      const trimmedPhone = cleanPhone.trim();
      if (!trimmedPhone) {
        cleanPhone = '';
      } else {
        const norm = normalizePhoneNumber(trimmedPhone);
        cleanPhone = norm.isValid ? norm.formatted : trimmedPhone;
      }
    }

    const nullableText = (val: unknown, maxLen?: number): string | null => {
      if (val === null || val === undefined) return null;
      const trimmed = String(val).trim();
      if (!trimmed) return null;
      return maxLen ? trimmed.slice(0, maxLen) : trimmed;
    };

    const nextUser: AlumniProfile = {
      ...currentUser,
      ...updated,
      phone: cleanPhone !== undefined ? (cleanPhone || undefined) : currentUser.phone,
    };

    // Build strictly permitted client update payload for public.alumni_profiles.
    // IMPORTANT: Do NOT include `updated_at` — PostgreSQL maintains it automatically via
    // trigger `trg_alumni_profiles_updated_at`, and `updated_at` is intentionally omitted
    // from column-level `GRANT UPDATE (...) TO authenticated` (sending it triggers 42501).
    const updatePayload: Record<string, any> = {};

    if (updated.fullName !== undefined) {
      const cleanName = String(updated.fullName).trim().slice(0, 150);
      if (cleanName.length < 2) {
        return { success: false, error: 'Full name must be at least 2 characters long.' };
      }
      updatePayload.full_name = cleanName;
      nextUser.fullName = cleanName;
    }
    if (updated.avatarUrl !== undefined) {
      const cleanAvatar = String(updated.avatarUrl || '').trim();
      if (cleanAvatar) updatePayload.avatar_url = cleanAvatar;
    }
    if (updated.coverUrl !== undefined) {
      updatePayload.cover_url = nullableText(updated.coverUrl);
    }
    if (updated.batchYear !== undefined) {
      const rawBatch = Number(updated.batchYear);
      if (Number.isFinite(rawBatch)) {
        const normalizedBatch = rawBatch > 1900 ? rawBatch - 1991 : Math.round(rawBatch);
        if (normalizedBatch >= 1 && normalizedBatch <= 35) {
          updatePayload.batch_year = normalizedBatch;
          nextUser.batchYear = normalizedBatch;
        }
      }
    }
    if (updated.position !== undefined) updatePayload.position = String(updated.position ?? '').trim();
    if (updated.institution !== undefined) updatePayload.institution = String(updated.institution ?? '').trim();
    if (updated.cadre !== undefined) updatePayload.cadre = nullableText(updated.cadre, 120);
    if (updated.city !== undefined) updatePayload.city = String(updated.city ?? '').trim() || 'Bogura';
    if (updated.country !== undefined) updatePayload.country = String(updated.country ?? '').trim() || 'Bangladesh';
    if (updated.bio !== undefined) updatePayload.bio = nullableText(updated.bio, 2500);
    if (updated.whatsapp !== undefined) updatePayload.whatsapp = nullableText(updated.whatsapp, 32);
    if (updated.fbLink !== undefined) updatePayload.fb_link = nullableText(updated.fbLink, 500);
    if (cleanPhone !== undefined) updatePayload.phone = nullableText(cleanPhone, 32);
    if (updated.email !== undefined) {
      const cleanEmail = nullableText(updated.email, 254);
      updatePayload.email = cleanEmail ? cleanEmail.toLowerCase() : null;
    }
    if (updated.careerHistory !== undefined) {
      updatePayload.career_history = Array.isArray(updated.careerHistory)
        ? updated.careerHistory.map((item) => String(item).trim()).filter(Boolean)
        : [];
    }
    if (updated.degree !== undefined) {
      updatePayload.degree = Array.isArray(updated.degree)
        ? updated.degree.map((item) => String(item).trim()).filter(Boolean)
        : [];
    }
    if (updated.specialty !== undefined) {
      updatePayload.specialty = Array.isArray(updated.specialty)
        ? updated.specialty.map((item) => String(item).trim()).filter(Boolean)
        : [];
    }
    if (updated.specialtyOther !== undefined) {
      updatePayload.specialty_other = nullableText(updated.specialtyOther, 200);
    }
    if (updated.bloodGroup !== undefined) {
      const cleanBg = nullableText(updated.bloodGroup, 8);
      if (cleanBg === null) {
        updatePayload.blood_group = null;
      } else if (VALID_BLOOD_GROUPS.has(cleanBg)) {
        updatePayload.blood_group = cleanBg;
      }
    }
    if (updated.isPublic !== undefined) updatePayload.is_public = Boolean(updated.isPublic);

    // FORBIDDEN COLUMNS — strictly stripped from client payload to prevent 42501 RLS / GRANT rejections
    delete updatePayload.role;
    delete updatePayload.verification_status;
    delete updatePayload.verification_method;
    delete updatePayload.verified_at;
    delete updatePayload.verified_by_profile_id;
    delete updatePayload.badges;
    delete updatePayload.phone_ownership_verified;
    delete updatePayload.phone_verified_at;
    delete updatePayload.phone_verified_by_profile_id;
    delete updatePayload.phone_verification_notes;
    delete updatePayload.vouches_count;
    delete updatePayload.vouch_target_count;
    delete updatePayload.updated_at;

    let supabaseSuccess = false;
    let confirmedProfileId: number | null = null;
    let failureError: string | null = null;

    if (isSupabaseConfigured && Object.keys(updatePayload).length > 0) {
      try {
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const { data: sessionRes } = await supabase.auth.getSession();
        const activeSession = sessionRes?.session || null;
        let authUserId = activeSession?.user?.id || currentUser.authUserId;
        if (!authUserId && activeSession) {
          const { data: supaUser } = await supabase.auth.getUser();
          authUserId = supaUser?.user?.id;
        }
        const validAuthUuid = authUserId && UUID_RE.test(authUserId) ? authUserId : null;

        if (!activeSession?.access_token) {
          failureError =
            'No active Supabase Auth session. Enable Email login in Supabase Dashboard → Authentication → Providers → Email, then sign out and sign in again.';
        } else {
        const runDirectUpdate = async (payload: Record<string, any>, targetId?: number) => {
          let query = supabase.from('alumni_profiles').update(payload);
          if (validAuthUuid) {
            query = query.eq('auth_user_id', validAuthUuid);
          } else if (targetId && targetId > 0) {
            query = query.eq('id', targetId);
          } else if (currentUser.id && currentUser.id > 0) {
            query = query.eq('id', currentUser.id);
          } else {
            return { data: null, error: { code: 'NO_TARGET', message: 'No active Supabase user session found.' } };
          }
          return query.select('id');
        };

        let candidatePayload = { ...updatePayload };
        let { data: updatedRows, error: updateErr } = await runDirectUpdate(candidatePayload);

        // Self-healing: if authenticated user has no row in alumni_profiles yet, create it and retry
        if (
          !updateErr &&
          (!Array.isArray(updatedRows) || updatedRows.length === 0) &&
          activeSession?.user
        ) {
          const ensured = await getOrCreateSupabaseProfile(activeSession.user, nextUser);
          if (ensured?.id) {
            const retryAfterCreate = await runDirectUpdate(candidatePayload, ensured.id);
            updatedRows = retryAfterCreate.data;
            updateErr = retryAfterCreate.error;
          }
        }

        // Resilient fallback for column-level GRANT drift (e.g. master_schema vs migration 003)
        const optionalDriftColumns = ['career_history', 'specialty_other', 'cadre'];
        let driftAttempts = 0;
        while (
          updateErr &&
          driftAttempts < optionalDriftColumns.length &&
          (updateErr.code === '42501' || updateErr.code === 'PGRST204' || updateErr.code === '42703')
        ) {
          driftAttempts += 1;
          const errMsg = String(updateErr.message || '').toLowerCase();
          let colToStrip = optionalDriftColumns.find(
            (col) => col in candidatePayload && errMsg.includes(col)
          );
          if (!colToStrip) {
            colToStrip = optionalDriftColumns.find((col) => col in candidatePayload);
          }
          if (!colToStrip) break;

          console.warn(`Stripping ungranted/missing optional column "${colToStrip}" and retrying profile save.`);
          delete candidatePayload[colToStrip];
          if (Object.keys(candidatePayload).length === 0) break;

          const retryRes = await runDirectUpdate(candidatePayload);
          updatedRows = retryRes.data;
          updateErr = retryRes.error;
        }

        if (updateErr) {
          console.warn('Supabase alumni_profiles update rejected:', updateErr);
          const lowerMsg = String(updateErr.message || '').toLowerCase();
          if (updateErr.code === '23505' || lowerMsg.includes('unique')) {
            if (lowerMsg.includes('phone')) {
              failureError = 'This mobile number is already registered to another alumni account.';
            } else if (lowerMsg.includes('email')) {
              failureError = 'This email address is already registered to another alumni account.';
            } else if (lowerMsg.includes('college_roll')) {
              failureError = 'This college roll number is already registered in your batch.';
            } else {
              failureError = 'A unique field value conflicts with another alumni account.';
            }
          } else {
            failureError = updateErr.message;
          }
        } else if (Array.isArray(updatedRows) && updatedRows.length > 0) {
          supabaseSuccess = true;
          confirmedProfileId = Number(updatedRows[0].id) || null;
        }

        // 2. Dual-table synchronization: Keep public.profiles in step for Messenger
        if (
          supabaseSuccess &&
          authUserId &&
          (candidatePayload.full_name || candidatePayload.avatar_url || candidatePayload.batch_year)
        ) {
          const profileDisplay: Record<string, any> = {};
          if (candidatePayload.full_name) profileDisplay.full_name = candidatePayload.full_name;
          if (candidatePayload.avatar_url) profileDisplay.avatar_url = candidatePayload.avatar_url;
          if (candidatePayload.batch_year) profileDisplay.batch = candidatePayload.batch_year;

          try {
            await supabase
              .from('profiles')
              .update(profileDisplay)
              .eq('user_id', validAuthUuid || authUserId);
          } catch {
            // Non-blocking messenger display sync
          }
        }
        }
      } catch (err: any) {
        console.warn('Supabase profile update warning:', err);
        failureError = err?.message || 'Database update failed';
      }
    }

    // 3. Fallback server-side synchronization ONLY if direct Supabase update did not succeed
    let serverSuccess = false;
    if (!supabaseSuccess) {
      try {
        const headers = await getAuthHeaders();
        const sRes = await fetch('/api/profile/update', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            id: currentUser.id,
            authUserId: currentUser.authUserId,
            ...updated,
            phone: cleanPhone !== undefined ? cleanPhone : updated.phone,
          }),
        });
        const sData = await sRes.json().catch(() => ({}));
        if (sRes.ok && sData?.success) {
          serverSuccess = true;
          if (sData?.profile?.id) {
            confirmedProfileId = Number(sData.profile.id) || confirmedProfileId;
          }
        } else if (sData?.error && !failureError) {
          failureError = sData.error;
        }
      } catch (sErr: any) {
        console.warn('Server profile update sync notice:', sErr);
      }
    }

    // Strict validation: fail if neither Supabase nor Server confirmed the write
    if (!supabaseSuccess && !serverSuccess && isSupabaseConfigured) {
      return {
        success: false,
        error: failureError || 'Failed to persist profile changes to Supabase. Please sign in again and retry.',
      };
    }

    if (confirmedProfileId && confirmedProfileId > 0) {
      nextUser.id = confirmedProfileId;
      nextUser.userId = confirmedProfileId;
    }

    // Invalidate directory/profile caches so navigating or reloading fetches fresh Supabase data
    invalidateAlumniDirectoryCache(nextUser.id);
    if (currentUser.id && currentUser.id !== nextUser.id) {
      invalidateAlumniDirectoryCache(currentUser.id);
    }

    // Persist to local state & storage only when backend write succeeds
    setCurrentUser(nextUser);
    saveDirectAuthUser(nextUser);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('szmc_current_user_updated', { detail: nextUser }));
    }
    return { success: true };
  };

  const deleteAccount = async (confirmationPassword?: string): Promise<boolean> => {
    const cleanPass = typeof confirmationPassword === 'string' ? confirmationPassword.trim() : '';

    if (isSupabaseConfigured) {
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData?.session?.user;
      if (sessionUser?.email && cleanPass) {
        const { error: reauthErr } = await supabase.auth.signInWithPassword({
          email: sessionUser.email,
          password: cleanPass,
        });
        if (reauthErr) {
          throw new Error('Incorrect password. Account deletion cancelled.');
        }
      }
    }

    const headers = await getAuthHeaders();
    let deletedOnServer = false;
    if (headers.Authorization && currentUser.id) {
      const delRes = await fetch('/api/auth/delete-account', {
        method: 'POST',
        headers,
        body: JSON.stringify({ profileId: currentUser.id }),
      });
      if (!delRes.ok) {
        const errJson = await delRes.json().catch(() => ({}));
        throw new Error(errJson?.error || 'Could not delete account on server.');
      }
      deletedOnServer = true;
    }

    if (!deletedOnServer && isSupabaseConfigured && currentUser.authUserId) {
      const { error: directDelErr } = await supabase
        .from('alumni_profiles')
        .delete()
        .eq('auth_user_id', currentUser.authUserId);
      if (directDelErr) {
        throw new Error(directDelErr.message || 'Could not delete alumni profile.');
      }
    }

    if (isSupabaseConfigured) {
      try {
        await supabase.auth.signOut();
      } catch {}
    }

    clearDirectAuthUser();
    authResolutionIdRef.current += 1;
    resolvedAuthUserIdRef.current = null;
    inMemorySupabaseToken = null;
    setSupabaseToken(null);
    setCurrentUser(DEFAULT_BLANK_USER);
    setIsAdminUser(false);
    setAuthInitializationError(null);
    setIsLoggedIn(false);
    return true;
  };

  const requestPasswordReset = async (email: string): Promise<{ success: boolean }> => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase client is not configured.');
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Enter the email address associated with your account.');
    }

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/?recovery=1` : undefined,
    });
    if (error) {
      throw new Error(error.message || 'Unable to request a password reset.');
    }
    return { success: true };
  };

  const completePasswordRecovery = async (newPassword: string): Promise<boolean> => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase client is not configured.');
    }
    if (!newPassword || newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      throw new Error('Open the password reset link from your registered email before choosing a new password.');
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw new Error(error.message || 'Password reset failed.');
    }
    return true;
  };

  const authContextValue = useMemo<AuthContextType>(
    () => ({
      isAuthInitializing,
      authInitializationError,
      isLoggedIn,
      currentUser,
      firebaseToken: null,
      supabaseToken,
      isAdminUser,
      login,
      loginWithPhoneOtp,
      verifyPhoneOtp,
      loginWithGoogle,
      logout,
      register,
      updateProfile,
      deleteAccount,
      requestPasswordReset,
      completePasswordRecovery,
      getAuthHeaders,
    }),
    // Only re-emit context when actual auth state changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAuthInitializing, authInitializationError, isLoggedIn, currentUser, supabaseToken, isAdminUser]
  );

  return <AuthContext.Provider value={authContextValue}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
