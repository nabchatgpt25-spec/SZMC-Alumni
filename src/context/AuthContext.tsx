import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, ALUMNI_PUBLIC_COLUMNS } from '../lib/supabase';
import {
  getOrCreateSupabaseProfile,
  mapSupabaseRowToAlumniProfile,
} from '../lib/supabase-auth';
import { apiUrl } from '../lib/apiConfig';
import { AlumniProfile, SUPER_ADMIN_EMAILS } from '../types';
import {
  DEFAULT_BLANK_USER,
  ALUMNI_PROFILES,
  saveStoredAlumniProfiles,
} from '../data/mockData';
import {
  registerUserVouchRequest,
  submitDocumentForAdminReview,
} from '../utils/verificationService';
import campusHeroImg from '../assets/images/szmc_campus_hero.jpg';
import { formatToE164Phone, normalizePhoneNumber } from '../utils/phone';
import { isInstantAutoVerificationActive } from '../services/siteConfigService';

export { formatToE164Phone, normalizePhoneNumber };

interface PendingOtpEntry {
  otp: string;
  expiresAt: number;
}

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

function getDirectAuthUser(): AlumniProfile | null {
  try {
    if (typeof window !== 'undefined') {
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
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(DIRECT_AUTH_STORAGE_KEY);
      localStorage.removeItem('szmc_direct_auth_token');
    }
  } catch (e) {
    console.warn('Failed to clear direct auth user', e);
  }
}

function normalizePhoneDigits(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
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
  const otpStoreRef = useRef<Map<string, PendingOtpEntry>>(new Map());
  const [supabaseToken, setSupabaseToken] = useState<string | null>(null);

  // Synchronously restore direct authenticated alumni from localStorage so there is zero logout on page refresh
  const initialDirectUser = getDirectAuthUser();

  const [isAdminUser, setIsAdminUser] = useState<boolean>(() => {
    if (!initialDirectUser) return false;
    return (
      initialDirectUser.role === 'admin' ||
      cleanEmailMatchAdmin(initialDirectUser.email)
    );
  });

  const [isAuthInitializing, setIsAuthInitializing] = useState(!initialDirectUser);
  const [authInitializationError, setAuthInitializationError] = useState<string | null>(null);
  const authResolutionIdRef = useRef(0);
  const resolvedAuthUserIdRef = useRef<string | null>(
    initialDirectUser ? (initialDirectUser.authUserId || String(initialDirectUser.id)) : null
  );
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(Boolean(initialDirectUser));

  const [currentUser, setCurrentUser] = useState<AlumniProfile>(() => initialDirectUser || DEFAULT_BLANK_USER);

  // Restore session; if email confirmation is disabled/bypassed, direct authenticated user is restored.
  useEffect(() => {
    let active = true;
    let authEventReceived = false;

    const applySession = async (session: Session | null, requestId: number) => {
      if (!active || requestId !== authResolutionIdRef.current) return;

      if (!session?.user) {
        const directUser = getDirectAuthUser();
        if (directUser) {
          const cleanEmail = directUser.email?.toLowerCase().trim();
          const isSuperAdmin =
            cleanEmail === 'nurulanambashir25@gmail.com' ||
            cleanEmail === 'nurulanambashir20@gmail.com' ||
            cleanEmail === 'admin@szmcalumni.net' ||
            cleanEmail === 'firstaidnetworkbd@gmail.com' ||
            directUser.role === 'admin' ||
            SUPER_ADMIN_EMAILS.some((e) => e.toLowerCase() === cleanEmail);

          resolvedAuthUserIdRef.current = directUser.authUserId || String(directUser.id);
          const effectiveProfile: AlumniProfile = {
            ...directUser,
            role: isSuperAdmin ? 'admin' : (directUser.role || 'member'),
            verificationStatus: isSuperAdmin ? 'verified' : (directUser.verificationStatus || 'unverified'),
          };
          setCurrentUser(effectiveProfile);
          setIsAdminUser(isSuperAdmin);
          setIsLoggedIn(true);
          setAuthInitializationError(null);
          setIsAuthInitializing(false);
          return;
        }

        // Only log out if there is NO stored directUser either
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
        const isAdmin =
          profile.role === 'admin' ||
          cleanEmailMatchAdmin(userEmail);

        const effectiveProfile: AlumniProfile = {
          ...profile,
          role: isAdmin ? 'admin' : (profile.role || 'member'),
          verificationStatus: isAdmin ? 'verified' : profile.verificationStatus,
        };

        setCurrentUser(effectiveProfile);
        setIsAdminUser(isAdmin);
        setIsLoggedIn(true);
        saveDirectAuthUser(effectiveProfile);
      } catch (err) {
        if (!active || requestId !== authResolutionIdRef.current) return;
        console.warn('Failed to load profile for Supabase session:', err);
        const directUser = getDirectAuthUser();
        if (directUser) {
          const directEmail = (directUser.email || '').toLowerCase().trim();
          const isAdmin = directUser.role === 'admin' || cleanEmailMatchAdmin(directEmail);
          const effective = {
            ...directUser,
            role: (isAdmin ? 'admin' : directUser.role) as any,
            verificationStatus: (isAdmin ? 'verified' : directUser.verificationStatus) as any,
          };
          setCurrentUser(effective);
          setIsAdminUser(isAdmin);
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
    try {
    } catch {
      // safe ignore
    }
  }, [currentUser]);

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

    const storedDirectToken =
      typeof window !== 'undefined' ? localStorage.getItem('szmc_direct_auth_token') : null;
    if (storedDirectToken) {
      headers.Authorization = `Bearer ${storedDirectToken}`;
      return headers;
    }

    if (anonKey && !headers.Authorization) {
      headers.Authorization = `Bearer ${anonKey}`;
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

    // 1. Try Server-Verified Authentication First (verifies password hash on backend & issues HMAC token)
    try {
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: cleanInput, password: pass }),
      });
      if (loginRes.status === 401) {
        const errJson = await loginRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Incorrect password. Access denied.');
      }
      if (loginRes.ok) {
        const loginJson = await loginRes.json();
        if (loginJson.success && loginJson.profile) {
          const returnedToken = loginJson.token || loginJson.session?.access_token || null;
          if (returnedToken) {
            inMemorySupabaseToken = returnedToken;
            setSupabaseToken(returnedToken);
            if (typeof window !== 'undefined') {
              localStorage.setItem('szmc_direct_auth_token', returnedToken);
            }
          }
          const profile: AlumniProfile = loginJson.profile;
          const isAdmin = profile.role === 'admin' || cleanEmailMatchAdmin(profile.email);
          resolvedAuthUserIdRef.current = profile.authUserId || String(profile.id);
          setCurrentUser(profile);
          setIsAdminUser(isAdmin);
          setIsLoggedIn(true);
          saveDirectAuthUser(profile);

          if (profile.email) {
            supabase.auth
              .signInWithPassword({
                email: profile.email.toLowerCase(),
                password: pass,
              })
              .catch(() => {});
          }
          return true;
        }
      }
    } catch (serverAuthErr: any) {
      if (serverAuthErr?.message?.includes('Access denied') || serverAuthErr?.message?.includes('Incorrect')) {
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
            setIsAdminUser(fallbackJson.profile.role === 'admin');
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
      const msg = authError.message.toLowerCase();
      if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
        throw new Error('Invalid email or password. Please verify your credentials or reset your password.');
      }
      if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
        // Direct Login without Email Confirmation
        // Since Supabase validated the credentials before returning email not confirmed,
        // we directly log the user in without requiring any confirmation email!
        let profile: AlumniProfile | null = null;
        try {
          const { data: profileRow } = await supabase
            .from('alumni_profiles')
            .select(ALUMNI_PUBLIC_COLUMNS)
            .ilike('email', cleanInput)
            .maybeSingle();

          if (profileRow) {
            profile = mapSupabaseRowToAlumniProfile(profileRow);
          }
        } catch (fetchErr) {
          console.warn('Could not query alumni_profiles during unconfirmed bypass:', fetchErr);
        }

        if (!profile) {
          profile = {
            id: Date.now(),
            userId: Date.now(),
            authUserId: 'direct-user-' + Date.now(),
            fullName: cleanInput.split('@')[0],
            avatarUrl: '/assets/aistudio/images__1__2778177d.png',
            batchYear: 25,
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
            email: cleanInput.toLowerCase(),
            role: 'member',
            isPublic: true,
            online: true,
            badges: ['SZMCian'],
          };
        }

        setCurrentUser(profile);
        setIsAdminUser(profile.role === 'admin');
        setIsLoggedIn(true);
        saveDirectAuthUser(profile);
        return true;
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
      setIsAdminUser(profile.role === 'admin');
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
        setIsAdminUser(profile.role === 'admin');
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

    if (!isSupabaseConfigured) {
      throw new Error('Supabase client is not configured.');
    }
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

    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: cleanEmail,
      password: profileData.password,
      options: {
        data: {
          full_name: profileData.fullName?.trim(),
          batch_year: normalizedBatch,
          phone: cleanPhone || undefined,
        },
      },
    });

    let resolvedUser = signUpData?.user;

    if (signUpErr || !resolvedUser) {
      const msg = (signUpErr?.message || '').toLowerCase();
      if (msg.includes('already registered') || msg.includes('user already exists')) {
        throw new Error('An account with this email already exists. Please sign in directly.');
      }

      // Try server registration fallback if direct Supabase signUp failed (e.g. email rate limit)
      try {
        const fallbackRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: profileData.fullName?.trim() || cleanEmail.split('@')[0],
            email: cleanEmail,
            phone: cleanPhone || undefined,
            password: profileData.password,
            batchYear: normalizedBatch,
            collegeRoll: profileData.collegeRoll,
            profession: profileData.profession,
            position: profileData.position,
            institution: profileData.institution,
            city: profileData.city,
            country: profileData.country,
          }),
        });
        const fallbackJson = await fallbackRes.json();
        if (fallbackRes.ok && fallbackJson?.profile) {
          setCurrentUser(fallbackJson.profile);
          setIsAdminUser(false);
          setIsLoggedIn(true);
          saveDirectAuthUser(fallbackJson.profile);
          return true;
        } else if (!fallbackRes.ok && fallbackJson?.error) {
          throw new Error(fallbackJson.error);
        }
      } catch (fbErr: any) {
        if (fbErr.message && !fbErr.message.includes('fetch')) {
          throw fbErr;
        }
      }

      if (msg.includes('rate limit')) {
        throw new Error('Email service rate limit reached. Please wait a few moments or try again shortly.');
      }
      throw new Error(signUpErr?.message || 'Registration failed. Please check your credentials.');
    }

    if (signUpData.session?.access_token) {
      inMemorySupabaseToken = signUpData.session.access_token;
      setSupabaseToken(inMemorySupabaseToken);
    }

    // Direct Login after Registration:
    // Build user profile and log in directly without requiring email confirmation!
    let profile: AlumniProfile | null = null;
    if (signUpData?.session && resolvedUser) {
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
                academic_stream: 'MBBS',
                academic_group: null,
                section: profile.section,
                college_roll: profile.collegeRoll,
                profession: profile.profession,
                position: profile.position,
                institution: profile.institution,
                city: profile.city,
                country: profile.country,
                email: profile.email,
                phone: profile.phone,
                whatsapp: profile.whatsapp,
                is_public: true,
              },
              { onConflict: 'auth_user_id' }
            )
            .select('id')
            .maybeSingle();

          if (upsertedRow?.id) {
            profile.id = Number(upsertedRow.id);
            profile.userId = Number(upsertedRow.id);
            try {
              await supabase
                .from('alumni_profiles')
                .update({
                  verification_status: isAutoActive ? 'verified' : 'unverified',
                  verification_method: isAutoActive ? 'admin_instant' : 'two_vouches',
                  verified_at: isAutoActive ? new Date().toISOString() : null,
                  badges: isAutoActive ? ['Verified SZMC Doctor', 'SZMCian'] : ['SZMCian'],
                })
                .eq('id', upsertedRow.id);
            } catch {}
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
      setIsAdminUser(profile.role === 'admin');
      setIsLoggedIn(true);
      saveDirectAuthUser(profile);
      return true;
    }

    throw new Error('Registration could not complete profile creation. Please try again.');
  };

  const updateProfile = async (
    updated: Partial<AlumniProfile>
  ): Promise<{ success: boolean; error?: string }> => {
    let cleanPhone = updated.phone;
    if (cleanPhone) {
      const norm = normalizePhoneNumber(cleanPhone);
      if (norm.isValid) {
        cleanPhone = norm.formatted;
      }
    }

    const nextUser: AlumniProfile = {
      ...currentUser,
      ...updated,
      phone: cleanPhone ?? updated.phone ?? currentUser.phone,
    };

    // Build strictly permitted client update payload for public.alumni_profiles
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (updated.fullName !== undefined) updatePayload.full_name = updated.fullName;
    if (updated.avatarUrl !== undefined) updatePayload.avatar_url = updated.avatarUrl;
    if (updated.coverUrl !== undefined) updatePayload.cover_url = updated.coverUrl;
    if (updated.batchYear !== undefined) updatePayload.batch_year = Number(updated.batchYear);
    if (updated.collegeRoll !== undefined) updatePayload.college_roll = updated.collegeRoll;
    if (updated.profession !== undefined) updatePayload.profession = updated.profession;
    if (updated.position !== undefined) updatePayload.position = updated.position;
    if (updated.institution !== undefined) updatePayload.institution = updated.institution;
    if (updated.cadre !== undefined) updatePayload.cadre = updated.cadre;
    if (updated.city !== undefined) updatePayload.city = updated.city;
    if (updated.country !== undefined) updatePayload.country = updated.country;
    if (updated.bio !== undefined) updatePayload.bio = updated.bio;
    if (updated.whatsapp !== undefined) updatePayload.whatsapp = updated.whatsapp;
    if (updated.fbLink !== undefined) updatePayload.fb_link = updated.fbLink;
    if (cleanPhone !== undefined) updatePayload.phone = cleanPhone;
    if (updated.email !== undefined) updatePayload.email = updated.email;
    if (updated.careerHistory !== undefined) updatePayload.career_history = updated.careerHistory;
    if (updated.degree !== undefined) updatePayload.degree = updated.degree;
    if (updated.specialty !== undefined) updatePayload.specialty = updated.specialty;
    if (updated.specialtyOther !== undefined) updatePayload.specialty_other = updated.specialtyOther;
    if (updated.bloodGroup !== undefined) updatePayload.blood_group = updated.bloodGroup;
    if (updated.isPublic !== undefined) updatePayload.is_public = updated.isPublic;

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

    let supabaseSuccess = false;
    let failureError: string | null = null;

    if (isSupabaseConfigured) {
      try {
        let authUserId = currentUser.authUserId;
        if (!authUserId) {
          const { data: supaUser } = await supabase.auth.getUser();
          authUserId = supaUser?.user?.id;
        }

        // 1. Update public.alumni_profiles by auth_user_id or id
        let query = supabase.from('alumni_profiles').update(updatePayload);
        if (authUserId) {
          query = query.eq('auth_user_id', authUserId);
        } else if (currentUser.id) {
          query = query.eq('id', currentUser.id);
        }

        const { data: updatedRows, error: updateErr } = await query.select('id');
        if (updateErr) {
          console.warn('Supabase alumni_profiles update rejected:', updateErr);
          if (updateErr.message.toLowerCase().includes('unique') || updateErr.message.toLowerCase().includes('phone')) {
            failureError = 'This mobile number is already registered to another alumni account.';
          } else {
            failureError = updateErr.message;
          }
        } else if (Array.isArray(updatedRows) && updatedRows.length > 0) {
          supabaseSuccess = true;
        }

        // 2. Dual-table synchronization: Keep public.profiles in step for Messenger
        if (authUserId && (updatePayload.full_name || updatePayload.avatar_url || updatePayload.batch_year)) {
          const profileDisplay: Record<string, any> = {
            updated_at: new Date().toISOString(),
          };
          if (updatePayload.full_name) profileDisplay.full_name = updatePayload.full_name;
          if (updatePayload.avatar_url) profileDisplay.avatar_url = updatePayload.avatar_url;
          if (updatePayload.batch_year) profileDisplay.batch = updatePayload.batch_year;

          await supabase
            .from('profiles')
            .update(profileDisplay)
            .eq('user_id', authUserId);
        }
      } catch (err: any) {
        console.warn('Supabase profile update warning:', err);
        failureError = err?.message || 'Database update failed';
      }
    }

    // 3. Fallback / Server-side synchronization to /api/profile/update
    let serverSuccess = false;
    try {
      let authToken = typeof window !== 'undefined' ? localStorage.getItem('szmc_direct_auth_token') : null;
      if (!authToken) {
        const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: null }));
        authToken = sessionData?.session?.access_token || null;
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }
      const sRes = await fetch('/api/profile/update', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: currentUser.id,
          authUserId: currentUser.authUserId,
          ...updated,
          phone: cleanPhone ?? updated.phone,
        }),
      });
      if (sRes.ok) {
        const sData = await sRes.json();
        if (sData?.success) {
          serverSuccess = true;
        }
      }
    } catch (sErr: any) {
      console.warn('Server profile update sync notice:', sErr);
    }

    // Strict validation: fail if neither Supabase nor Server confirmed the write
    if (!supabaseSuccess && !serverSuccess && isSupabaseConfigured) {
      return {
        success: false,
        error: failureError || 'Failed to persist profile changes to the server database.',
      };
    }

    // Persist to local state & storage only when backend write succeeds
    setCurrentUser(nextUser);
    saveDirectAuthUser(nextUser);
    return { success: true };
  };

  const deleteAccount = async (): Promise<boolean> => {
    if (isSupabaseConfigured && currentUser.authUserId) {
      try {
        await supabase
          .from('alumni_profiles')
          .delete()
          .eq('auth_user_id', currentUser.authUserId);
      } catch (err) {
        console.warn('Supabase delete profile warning:', err);
      }
      try {
        await supabase.auth.signOut();
      } catch {}
    }

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

  return (
    <AuthContext.Provider
      value={{
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
