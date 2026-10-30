// Defensively clean up any global __dirname / __filename polluted by tsx CLI
// so that ESM packages like vite-plugin-pwa and Vite resolve relative to import.meta.url correctly
if (typeof (globalThis as any).__dirname !== 'undefined') {
  delete (globalThis as any).__dirname;
}
if (typeof (globalThis as any).__filename !== 'undefined') {
  delete (globalThis as any).__filename;
}

import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer as createHttpServer } from 'http';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import * as dotenv from 'dotenv';
import { supabaseServer, isSupabaseServerConfigured } from './server/lib/supabase-server.ts';
import { requireAuth, requireAdmin, optionalAuth, type AuthRequest } from './server/middleware/auth.ts';
import {
  adminUpdateAlumniGovernance,
  createOrRegisterAlumniProfile,
  createOrUpdateOfficialNotice,
  findAlumniByCredential,
  generateBulkBatchCohortSample,
  getAcademicStreamGroupsConfig,
  getAdminOverviewMetrics,
  getBloodEmergencyList,
  getOfficialNoticesList,
  getVerificationQueue,
  moderateBloodEmergency,
  queryPaginatedAlumniProfiles,
  reviewVerificationSubmission,
  toggleAcademicStreamGroupActive,
  updateAlumniPassword,
  deleteAlumniProfile,
  adminVerifyAlumniPhoneOwnership,
  adminRevokeAlumniPhoneOwnership,
  isServerAutoVerifyActive,
  serverAutoVerifyConfig,
  setServerAutoVerifyConfig,
  bulkVerifyAllAlumniProfiles,
} from './server/db/adminRepository.ts';
import { attemptBootstrapMessagingTables } from './server/db/setupMessagingDb.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT: number | string = process.env.PORT
  ? (isNaN(Number(process.env.PORT)) ? process.env.PORT : Number(process.env.PORT))
  : 3000;

// 1. Security Headers & Custom Domain CORS Middleware
const ALLOWED_ORIGINS = new Set([
  'https://szmcalumni.net',
  'http://szmcalumni.net',
  'https://www.szmcalumni.net',
  'https://szmc-alumni-2026.ai.studio',
  'https://ndcbogura.alumniworld.xyz',
  'http://ndcbogura.alumniworld.xyz',
  'https://www.ndcbogura.alumniworld.xyz',
  'https://ndc-alumni-2026.ai.studio',
  'https://ais-pre-siz5cxwdtehl5ayj3qiu3s-456498149201.asia-southeast1.run.app',
  'https://ais-dev-siz5cxwdtehl5ayj3qiu3s-456498149201.asia-southeast1.run.app',
]);

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (
    origin &&
    (ALLOWED_ORIGINS.has(origin) ||
      origin.endsWith('.alumniworld.xyz') ||
      origin.endsWith('.ai.studio') ||
      origin.endsWith('.run.app') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1'))
  ) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self), payment=()'
  );
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 2. Sliding-Window Anti-Scraping & Brute-Force Rate Limiter
interface RateBucket {
  count: number;
  resetAt: number;
}
const rateLimitStore = new Map<string, RateBucket>();

function rateLimitGuard(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
    const key = `${ip}:${req.baseUrl || req.path}`;
    const now = Date.now();
    const bucket = rateLimitStore.get(key);

    if (!bucket || now > bucket.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Automated scraping and brute-force requests are blocked.',
      });
    }
    return next();
  };
}

function resolveActor(req: AuthRequest) {
  if (req.dbUser) {
    return {
      uid: req.dbUser.uid,
      email: req.dbUser.email,
      role: req.dbUser.role || 'admin',
    };
  }
  if (req.user) {
    const user = req.user as any;
    return {
      uid: user.uid || user.id || 'admin-user',
      email: user.email || 'admin@szmcalumni.net',
      role: 'admin',
    };
  }
  throw new Error('Unauthorized: Valid admin credentials required on backend');
}

// ---------------------------------------------------------------------------
// API ROUTES
// ---------------------------------------------------------------------------

// Sync Firebase Auth User with Cloud SQL
app.post('/api/auth/sync', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    res.json({
      authenticated: true,
      user: req.dbUser,
    });
  } catch (error: any) {
    console.error('Failed to sync authenticated user:', error);
    res.status(500).json({ error: error.message || 'Failed to synchronize user' });
  }
});

function formatAlumniRowToProfile(row: any) {
  return {
    id: row.id,
    userId: row.id,
    fullName: row.fullName || 'SZMC Alumnus',
    avatarUrl:
      row.avatarUrl ||
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
    coverUrl: row.coverUrl || undefined,
    batchYear: row.batchYear || 68,
    session: row.session || undefined,
    collegeRoll: row.collegeRoll || '',
    academicStream: row.academicStream,
    academicGroup: row.academicGroup,
    group: row.academicStream || 'Science',
    section: row.section || 'Group 4',
    verificationStatus: row.verificationStatus || 'pending_vouch',
    verificationMethod: row.verificationMethod || 'two_vouches',
    verifiedBy: row.verifiedByAdmin ? [row.verifiedByAdmin] : [],
    vouchesCount: row.vouchesCount || 0,
    vouchTargetCount: row.vouchTargetCount || 2,
    profession: row.profession || '',
    position: row.position || '',
    institution: row.institution || '',
    cadre: row.cadre || '',
    specialty: Array.isArray(row.specialty) ? row.specialty : [],
    degree: Array.isArray(row.degree) ? row.degree : ['HSC'],
    city: row.city || 'Dhaka',
    country: row.country || 'Bangladesh',
    phone: row.phone || '',
    phoneOwnershipVerified: Boolean(row.phoneOwnershipVerified ?? row.phone_ownership_verified),
    phoneVerifiedAt: row.phoneVerifiedAt || row.phone_verified_at || undefined,
    phoneVerifiedByProfileId: row.phoneVerifiedByProfileId || row.phone_verified_by_profile_id || undefined,
    phoneVerificationNotes: row.phoneVerificationNotes || row.phone_verification_notes || undefined,
    authUserId: row.authUserId || row.auth_user_id || undefined,
    whatsapp: row.whatsapp || '',
    email: row.email || '',
    fbLink: row.fbLink || '',
    bio: row.bio || '',
    bloodGroup: row.bloodGroup || undefined,
    isRegisteredDonor: Boolean(row.isRegisteredDonor),
    donorAvailability: row.donorAvailability || 'available',
    role: row.role || 'member',
    accountStatus: row.accountStatus || 'active',
    isPublic: Boolean(row.isPublic),
    postsCount: row.postsCount || 0,
    badges: Array.isArray(row.badges) ? row.badges : [],
  };
}

const PASSWORD_SALT = 'ndc_dhaka_1949_salt_v1:';

function hashPasswordServer(raw: string): string {
  if (!raw) return '';
  if (raw.startsWith('sha256:')) return raw;
  const hash = crypto.createHash('sha256').update(PASSWORD_SALT + raw).digest('hex');
  return `sha256:${hash}`;
}

function verifyPasswordServer(storedHash: string | null | undefined, inputPass: string): boolean {
  if (!storedHash) return true;
  const hashedInput = hashPasswordServer(inputPass);
  if (storedHash === hashedInput) return true;
  if (storedHash === inputPass) return true;
  return false;
}

// Global Cross-Device Registration Endpoint (stores directly in Cloud SQL)
app.post('/api/auth/register', rateLimitGuard(25, 60_000), async (req: Request, res: Response) => {
  try {
    const {
      fullName,
      avatarUrl,
      coverUrl,
      batchYear,
      session,
      collegeRoll,
      academicStream,
      academicGroup,
      section,
      profession,
      position,
      institution,
      specialty,
      degree,
      city,
      country,
      phone,
      whatsapp,
      email,
      password,
      bloodGroup,
      isRegisteredDonor,
    } = req.body;

    if (!fullName?.trim()) {
      return res.status(400).json({ error: 'Please provide your Full Name.' });
    }
    if (!phone?.trim() && !email?.trim()) {
      return res.status(400).json({ error: 'Please provide your Mobile Number or Email.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const hashedPassword = hashPasswordServer(password);

    const created = await createOrRegisterAlumniProfile({
      userUid: req.body.userUid,
      rawPassword: password,
      fullName: fullName.trim(),
      avatarUrl,
      batchYear: Number(batchYear) || 68,
      session,
      collegeRoll: collegeRoll?.trim(),
      academicStream:
        academicStream === 'Humanities' || academicStream === 'Business Studies'
          ? academicStream
          : 'Science',
      academicGroup: academicGroup || null,
      section: section || 'Group 4',
      profession: profession || '',
      position: position || '',
      institution: institution || '',
      specialty: Array.isArray(specialty) ? specialty : [],
      degree: Array.isArray(degree) ? degree : ['HSC'],
      city: city || 'Dhaka',
      country: country || 'Bangladesh',
      phone: phone?.trim() || null,
      whatsapp: whatsapp?.trim() || null,
      email: email?.trim() || null,
      passwordHash: hashedPassword,
      bloodGroup: bloodGroup || null,
      isRegisteredDonor: Boolean(isRegisteredDonor),
    });

    res.status(201).json({
      success: true,
      profile: formatAlumniRowToProfile(created),
    });
  } catch (error: any) {
    console.error('Registration failed:', error);
    res.status(400).json({ error: error.message || 'Registration failed.' });
  }
});

// Helper to normalize phone numbers to E.164
function formatToE164PhoneServer(raw: string): string {
  const cleaned = raw.trim();
  if (cleaned.startsWith('+')) {
    return cleaned.replace(/[^\d+]/g, '');
  }
  const digits = cleaned.replace(/\D/g, '');
  if (digits.startsWith('880')) {
    return `+${digits}`;
  }
  return `+880${digits.replace(/^0+/, '')}`;
}

async function handleUnifiedLoginCore(req: Request, res: Response) {
  try {
    const { identifier, password } = req.body;
    if (!identifier?.trim() || !password) {
      return res.status(400).json({ error: 'Please enter your mobile number or email and password.' });
    }

    const cleanId = identifier.trim();
    const isEmail = cleanId.includes('@');

    // =========================================================================
    // CASE A: EMAIL LOGIN
    // =========================================================================
    if (isEmail) {
      const cleanEmail = cleanId.toLowerCase();

      if (isSupabaseServerConfigured) {
        try {
          // Auto-confirm email if needed so cross-device logins succeed
          const { data: uData } = await supabaseServer.auth.admin.listUsers();
          const existingU = (uData?.users as any[])?.find((u: any) => u.email?.toLowerCase() === cleanEmail);
          if (existingU && !existingU.email_confirmed_at) {
            await supabaseServer.auth.admin.updateUserById(existingU.id, { email_confirm: true });
          }
        } catch (confirmErr) {
          console.warn('Auto-confirm check notice:', confirmErr);
        }

        const { data: signInData, error: signInError } = await supabaseServer.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (!signInError && signInData?.user) {
          let alumnus = await findAlumniByCredential(cleanEmail);
          if (!alumnus) {
            alumnus = await createOrRegisterAlumniProfile({
              userUid: signInData.user.id,
              rawPassword: password,
              fullName:
                (signInData.user.user_metadata as any)?.full_name ||
                (signInData.user.user_metadata as any)?.name ||
                cleanEmail.split('@')[0],
              batchYear: Number((signInData.user.user_metadata as any)?.batch_year) || 68,
              email: cleanEmail,
              passwordHash: hashPasswordServer(password),
            });
          }

          return res.json({
            success: true,
            session: signInData.session,
            profile: formatAlumniRowToProfile(alumnus),
          });
        }

        if (signInError) {
          const msg = signInError.message.toLowerCase();
          if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
            // Check if user was registered with Google OAuth and has no password
            const { data: uData } = await supabaseServer.auth.admin.listUsers();
            const existingU = (uData?.users as any[])?.find((u: any) => u.email?.toLowerCase() === cleanEmail);
            if (existingU && (existingU.app_metadata?.provider === 'google' || !existingU.encrypted_password)) {
              return res.status(400).json({
                error: 'This account was created via Google Sign-In and does not have a password set yet. Please continue with "Sign in with Google" or use "Forgot Password" to set a password.',
              });
            }
            return res.status(401).json({ error: 'Invalid email or password. Please verify your credentials.' });
          }
        }
      }

      // In-memory fallback
      const alumnus = await findAlumniByCredential(cleanEmail);
      if (!alumnus) {
        return res.status(404).json({ error: 'No registered account found with this email address.' });
      }
      const isValid = verifyPasswordServer(alumnus.passwordHash, password);
      if (!isValid) {
        return res.status(401).json({ error: 'Incorrect password. Please try again.' });
      }
      return res.json({
        success: true,
        profile: formatAlumniRowToProfile(alumnus),
      });
    }

    // =========================================================================
    // CASE B: PHONE NUMBER LOGIN
    // =========================================================================
    const formattedPhone = formatToE164PhoneServer(cleanId);
    const alumnus = await findAlumniByCredential(cleanId);

    if (!alumnus) {
      return res.status(404).json({
        error: 'No registered account found with this mobile number. Please register your verified profile first.',
      });
    }

    if (alumnus.accountStatus === 'suspended') {
      return res.status(403).json({ error: 'Your account is currently suspended. Please contact SZMC Alumni support.' });
    }

    // Authenticate against Supabase Auth using the user's password
    if (isSupabaseServerConfigured) {
      let authSession: any = null;

      // Method 1: Try authenticating with user's verified registered email & password
      if (alumnus.email) {
        const { data: signInData, error: signInError } = await supabaseServer.auth.signInWithPassword({
          email: alumnus.email.toLowerCase().trim(),
          password,
        });

        if (!signInError && signInData?.session) {
          authSession = signInData.session;
        }
      }

      // Method 2: If email attempt was not applicable or failed, try native phone sign-in
      if (!authSession) {
        try {
          const { data: phoneSignInData, error: phoneSignInErr } = await supabaseServer.auth.signInWithPassword({
            phone: formattedPhone,
            password,
          });
          if (!phoneSignInErr && phoneSignInData?.session) {
            authSession = phoneSignInData.session;
          }
        } catch {
          // Phone provider may be disabled in dashboard
        }
      }

      if (authSession) {
        // Keep phone on auth.users synchronized
        if (alumnus.authUserId) {
          try {
            await supabaseServer.auth.admin.updateUserById(alumnus.authUserId, {
              phone: formattedPhone,
              phone_confirm: true,
            });
          } catch {}
        }

        return res.json({
          success: true,
          session: authSession,
          profile: formatAlumniRowToProfile(alumnus),
        });
      }

      // Check if user was registered via Google OAuth and has no password
      const { data: usersData } = await supabaseServer.auth.admin.listUsers();
      const matchedUser = (usersData?.users as any[])?.find(
        (u: any) =>
          (alumnus.email && u.email?.toLowerCase() === alumnus.email.toLowerCase().trim()) ||
          (u.phone && u.phone === formattedPhone)
      );

      if (matchedUser && (matchedUser.app_metadata?.provider === 'google' || !matchedUser.encrypted_password)) {
        return res.status(400).json({
          error:
            'This account was created via Google Sign-In and does not have a password set yet. Please sign in with Google, or use "Forgot Password" to set a password for phone login.',
        });
      }

      return res.status(401).json({ error: 'Incorrect password for this mobile number. Please try again.' });
    }

    // In-memory fallback
    const isValid = verifyPasswordServer(alumnus.passwordHash, password);
    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    return res.json({
      success: true,
      profile: formatAlumniRowToProfile(alumnus),
    });
  } catch (error: any) {
    console.error('Unified login error:', error);
    res.status(500).json({ error: error.message || 'Login failed. Please try again.' });
  }
}

// Global Cross-Device Login Endpoint (supports both Email and Phone)
app.post('/api/auth/login', rateLimitGuard(40, 60_000), handleUnifiedLoginCore);
app.post('/api/auth/unified-login', rateLimitGuard(40, 60_000), handleUnifiedLoginCore);

// Admin Command Center: Verify Alumnus Phone Ownership (enables Phone + Password login)
app.post(
  '/api/admin/verify-phone',
  rateLimitGuard(40, 60_000),
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const { profileId, notes } = req.body;
      if (!profileId) {
        return res.status(400).json({ error: 'profileId is required.' });
      }

      const actor = resolveActor(req);
      const verified = await adminVerifyAlumniPhoneOwnership({
        profileId: Number(profileId),
        notes: typeof notes === 'string' ? notes.trim() : undefined,
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
      });

      res.json({
        success: true,
        message: 'Phone ownership verified successfully. Phone + Password login is now active.',
        profile: verified,
      });
    } catch (error: any) {
      console.error('admin verify-phone error:', error);
      res.status(400).json({ error: error.message || 'Failed to verify phone ownership.' });
    }
  }
);

// Admin Command Center: Revoke Alumnus Phone Ownership Verification
app.post(
  '/api/admin/revoke-phone-verification',
  rateLimitGuard(40, 60_000),
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const { profileId, notes } = req.body;
      if (!profileId) {
        return res.status(400).json({ error: 'profileId is required.' });
      }

      const actor = resolveActor(req);
      const revoked = await adminRevokeAlumniPhoneOwnership({
        profileId: Number(profileId),
        notes: typeof notes === 'string' ? notes.trim() : undefined,
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
      });

      res.json({
        success: true,
        message: 'Phone ownership verification revoked. Phone login disabled.',
        profile: revoked,
      });
    } catch (error: any) {
      console.error('admin revoke-phone error:', error);
      res.status(400).json({ error: error.message || 'Failed to revoke phone verification.' });
    }
  }
);

// Admin: Query 7-Day Auto-Verification Status
app.get('/api/admin/auto-verify-status', (_req: Request, res: Response) => {
  const active = isServerAutoVerifyActive();
  const expiry = new Date(serverAutoVerifyConfig.expiresAt).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, expiry - now);
  const remainingHours = Math.floor(diffMs / (1000 * 60 * 60));
  const remainingDays = Math.floor(remainingHours / 24);

  res.json({
    active,
    paused: serverAutoVerifyConfig.paused,
    enabled: serverAutoVerifyConfig.enabled,
    expiresAt: serverAutoVerifyConfig.expiresAt,
    remainingDays,
    remainingHours,
  });
});

// Admin: Toggle Auto-Verification (Pause/Resume or Reset to 7 Days)
app.post('/api/admin/auto-verify-toggle', rateLimitGuard(30, 60_000), requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { paused, reset7Days } = req.body;
    if (reset7Days) {
      const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      setServerAutoVerifyConfig({ enabled: true, paused: false, expiresAt: newExpiry });
    } else if (typeof paused === 'boolean') {
      setServerAutoVerifyConfig({ paused });
    }

    const active = isServerAutoVerifyActive();
    res.json({
      success: true,
      message: serverAutoVerifyConfig.paused
        ? 'Instant Auto-Verification paused by Super Admin.'
        : 'Instant Auto-Verification is now active.',
      config: serverAutoVerifyConfig,
      active,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to toggle auto-verification' });
  }
});

// Super Admin: Instant Bulk Verify All Unverified/Pending Alumni
app.post('/api/admin/bulk-verify-all', rateLimitGuard(15, 60_000), requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const actor = resolveActor(req);
    const result = await bulkVerifyAllAlumniProfiles({
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
    });

    res.json({
      success: true,
      message: `Successfully verified all ${result.verifiedCount} alumni profiles!`,
      verifiedCount: result.verifiedCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to bulk verify profiles' });
  }
});

// Global Cross-Device Password Reset Endpoint
app.post('/api/auth/reset-password', rateLimitGuard(15, 60_000), async (req: Request, res: Response) => {
  try {
    const { phone, newPassword } = req.body;
    if (!phone?.trim() || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Valid phone number and new password (min 6 chars) required.' });
    }

    const alumnus = await findAlumniByCredential(phone.trim());
    if (!alumnus) {
      return res.status(404).json({ error: 'No account found with this mobile number.' });
    }

    const newHash = hashPasswordServer(newPassword);
    await updateAlumniPassword(alumnus.id, newHash);

    res.json({ success: true, message: 'Password updated successfully across all devices.' });
  } catch (error: any) {
    console.error('Password reset failed:', error);
    res.status(500).json({ error: error.message || 'Password reset failed.' });
  }
});

// Self-Service Profile / Account Deletion Endpoint
app.post('/api/auth/delete-account', rateLimitGuard(15, 60_000), async (req: Request, res: Response) => {
  try {
    const { profileId } = req.body;
    if (!profileId) {
      return res.status(400).json({ error: 'Profile ID is required for deletion.' });
    }

    await deleteAlumniProfile(Number(profileId));
    res.json({ success: true, message: 'Profile and associated account deleted successfully.' });
  } catch (error: any) {
    console.error('Account deletion error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete account.' });
  }
});

function decodeHtmlEntities(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#x3D;/gi, '=')
    .replace(/&middot;/gi, '·')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return _;
      }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(Number(dec));
      } catch {
        return _;
      }
    });
}

// Universal Rich Link Unfurl & OpenGraph Media Extractor (Facebook Pictures, Posts, Videos, YouTube, Instagram, LinkedIn, Web)
app.get('/api/unfurl', rateLimitGuard(120, 60_000), async (req: Request, res: Response) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).json({ error: 'Valid HTTP/HTTPS URL required' });
  }

  const cleanUrl = targetUrl.trim();
  // Handle direct media files immediately
  if (/\.(jpeg|jpg|png|webp|gif)(\?.*)?$/i.test(cleanUrl)) {
    return res.json({
      resolvedUrl: cleanUrl,
      imageUrl: cleanUrl,
      mediaType: 'photo',
      title: 'Direct Photo',
      publisher: new URL(cleanUrl).hostname,
    });
  }
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(cleanUrl)) {
    return res.json({
      resolvedUrl: cleanUrl,
      videoUrl: cleanUrl,
      mediaType: 'video',
      title: 'Direct Video Stream',
      publisher: new URL(cleanUrl).hostname,
    });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);

    const isFacebook = /(?:facebook\.com|fb\.watch|fb\.com)/i.test(cleanUrl);
    // Facebook and social networks serve rich public OpenGraph metadata to crawler UAs without login wall
    const crawlerUa = isFacebook
      ? 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

    const resp = await fetch(cleanUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': crawlerUa,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,bn;q=0.8',
        'Cache-Control': 'no-cache',
      },
    });
    clearTimeout(timer);

    const finalResolvedUrl = resp.url || cleanUrl;
    const rawHtml = await resp.text();

    const getMeta = (propName: string): string | undefined => {
      const p1 = new RegExp(`<meta[^>]+(?:property|name)=["']${propName}["'][^>]+content=["']([^"']*)["']`, 'i');
      const m1 = rawHtml.match(p1);
      if (m1 && m1[1]) return decodeHtmlEntities(m1[1].trim());

      const p2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${propName}["']`, 'i');
      const m2 = rawHtml.match(p2);
      if (m2 && m2[1]) return decodeHtmlEntities(m2[1].trim());

      return undefined;
    };

    const titleMatch = rawHtml.match(/<title[^>]*>([^<]*)<\/title>/i);
    const htmlTitle = titleMatch && titleMatch[1] ? decodeHtmlEntities(titleMatch[1].trim()) : undefined;

    let title = getMeta('og:title') || getMeta('twitter:title') || htmlTitle;
    let description = getMeta('og:description') || getMeta('twitter:description') || getMeta('description');
    let imageUrl =
      getMeta('og:image:secure_url') ||
      getMeta('og:image') ||
      getMeta('twitter:image');
    let videoUrl =
      getMeta('og:video:secure_url') ||
      getMeta('og:video:url') ||
      getMeta('og:video') ||
      getMeta('twitter:player:stream');
    let siteName = getMeta('og:site_name') || getMeta('publisher');
    const ogType = getMeta('og:type');

    // Extract link[rel="image_src"] fallback
    if (!imageUrl) {
      const linkImgMatch = rawHtml.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']*)["']/i);
      if (linkImgMatch && linkImgMatch[1]) {
        imageUrl = decodeHtmlEntities(linkImgMatch[1].trim());
      }
    }

    if (isFacebook) {
      if (title && /^(Log into Facebook|Facebook|Log in to Facebook)/i.test(title)) {
        title = undefined;
      }
      if (description && /^(Log into Facebook|Facebook helps you connect)/i.test(description)) {
        description = undefined;
      }

      // If Facebook direct scrape was thin on metadata, enrich via public oEmbed endpoint
      if (!imageUrl || !title) {
        try {
          const oembedResp = await fetch(
            `https://noembed.com/embed?url=${encodeURIComponent(finalResolvedUrl)}`,
            { signal: AbortSignal.timeout(3000) }
          );
          if (oembedResp.ok) {
            const oeJson = await oembedResp.json();
            if (oeJson && !oeJson.error) {
              if (!title && oeJson.title) title = oeJson.title;
              if (!imageUrl && oeJson.thumbnail_url) imageUrl = oeJson.thumbnail_url;
              if (!siteName && oeJson.author_name) siteName = oeJson.author_name;
            }
          }
        } catch {
          // graceful fallback
        }
      }
    }

    let mediaType: 'photo' | 'video' | 'post' | 'article' | 'website' = 'website';
    if (
      videoUrl ||
      ogType?.includes('video') ||
      /(?:videos\/|reel\/|reels\/|watch|\/share\/v\/|\/share\/r\/|fb\.watch)/i.test(
        finalResolvedUrl
      )
    ) {
      mediaType = 'video';
    } else if (
      imageUrl &&
      (/(?:photo\.php|photos\/|\/photo\/)/i.test(finalResolvedUrl) || ogType?.includes('image'))
    ) {
      mediaType = 'photo';
    } else if (isFacebook) {
      mediaType = 'post';
    }

    res.json({
      resolvedUrl: finalResolvedUrl,
      title,
      description,
      imageUrl,
      videoUrl,
      publisher: siteName || (isFacebook ? 'Facebook' : undefined),
      mediaType,
      ogType,
    });
  } catch (error: any) {
    const isFb = /(?:facebook\.com|fb\.watch|fb\.com)/i.test(cleanUrl);
    res.json({
      resolvedUrl: cleanUrl,
      publisher: isFb ? 'Facebook' : undefined,
      mediaType: isFb ? 'post' : 'website',
      error: error.message,
    });
  }
});

// Get official Academic Stream & Group configuration
app.get('/api/stream-groups', rateLimitGuard(120, 60_000), async (_req: Request, res: Response) => {
  try {
    const rows = await getAcademicStreamGroupsConfig();
    res.json({ streamGroups: rows });
  } catch (error: any) {
    console.error('Failed to load stream groups:', error);
    res.status(500).json({ error: error.message || 'Failed to load stream groups' });
  }
});

// In-memory resilient fallback post store for zero-downtime posting
const memoryPostsStore: any[] = [
  {
    id: 9001,
    author_id: 10002,
    userId: 10002,
    fullName: 'SZMC Media & Cultural Archive',
    avatarUrl: '/szmc-logo.png',
    batchYear: 25,
    author: 'SZMC Media & Cultural Archive',
    authorAvatar: '/szmc-logo.png',
    authorBatch: 25,
    category: 'Reunion',
    content: '📸 Added a new photo album: "SZMC Medical College Campus & Academic Facilities"\n\nIconic panoramic views of Shaheed Ziaur Rahman Medical College Bogura campus, hospital building, and green courtyards.\n\nClick "See Album" below to explore all high-resolution photos in the gallery!\n[szmc_album_ref:1]',
    images: [
      'https://hjuyiqyviohinbhzaipl.supabase.co/storage/v1/object/public/gallery/szmc/campus_1.jpg',
      'https://hjuyiqyviohinbhzaipl.supabase.co/storage/v1/object/public/gallery/szmc/campus_2.jpg'
    ],
    videos: [],
    likes_count: 48,
    comments_count: 5,
    is_pinned: false,
    is_edited: false,
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    albumId: 1,
    albumTitle: 'SZMC Medical College Campus & Academic Facilities',
  },
  {
    id: 9002,
    author_id: 10002,
    userId: 10002,
    fullName: 'SZMC Alumni Association',
    avatarUrl: '/szmc-logo.png',
    batchYear: 18,
    author: 'SZMC Alumni Association',
    authorAvatar: '/szmc-logo.png',
    authorBatch: 18,
    category: 'Reunion',
    content: '📸 Added a new photo album: "SZMC Day Grand Annual Celebration & Alumni Gathering"\n\nAnnual 5th November SZMC Day celebrations, reunion rallies, student assemblies, and historic commemorative posters: "এসো স্মৃতির প্রাঙ্গণে মিলি প্রীতির বন্ধনে".\n\n[szmc_album_ref:2]',
    images: [
      'https://hjuyiqyviohinbhzaipl.supabase.co/storage/v1/object/public/gallery/szmc/szmc_day_1.jpg',
      'https://hjuyiqyviohinbhzaipl.supabase.co/storage/v1/object/public/gallery/szmc/szmc_day_2.jpg',
      'https://hjuyiqyviohinbhzaipl.supabase.co/storage/v1/object/public/gallery/szmc/szmc_day_3.jpg'
    ],
    videos: [],
    likes_count: 82,
    comments_count: 11,
    is_pinned: false,
    is_edited: false,
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    albumId: 2,
    albumTitle: 'SZMC Day Grand Annual Celebration & Alumni Gathering',
  },
];

// Quad Feed Posts - Resilient Server Proxy
app.get('/api/posts', rateLimitGuard(120, 60_000), async (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const { data: posts } = await supabaseServer
      .from('posts')
      .select(`
        id,
        author_id,
        content,
        category,
        images,
        videos,
        likes_count,
        comments_count,
        is_pinned,
        is_edited,
        created_at
      `)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    const dbPosts = posts || [];
    const combined = [...memoryPostsStore, ...dbPosts.filter((p: any) => !memoryPostsStore.some((m) => m.id === p.id))];
    return res.json({ posts: combined });
  } catch (err: any) {
    return res.json({ posts: memoryPostsStore });
  }
});

app.post('/api/posts', rateLimitGuard(40, 60_000), async (req: Request, res: Response) => {
  try {
    const authorId = Number(req.body.author_id || req.body.authorId || 1);
    const content = String(req.body.content || '').trim();
    const category = req.body.category || 'General Update';
    const images = Array.isArray(req.body.images) ? req.body.images : [];
    const videos = Array.isArray(req.body.videos) ? req.body.videos : [];
    const linked_url = req.body.linked_url || null;
    const link_metadata = req.body.link_metadata || null;

    if (!content && images.length === 0 && !linked_url) {
      return res.status(400).json({ error: 'Post must have content, photos, or a link' });
    }

    const { data: author } = await supabaseServer
      .from('alumni_profiles')
      .select('id, full_name, avatar_url, batch_year, verification_status, profession, institution')
      .eq('id', authorId)
      .maybeSingle();

    const authorProfile = author || {
      id: authorId,
      full_name: 'SZMC Alumnus',
      avatar_url: '/assets/aistudio/images__1__2778177d.png',
      batch_year: 20,
      verification_status: 'verified',
    };

    const insertPayload: any = {
      author_id: authorId,
      content: content || (images.length > 0 ? (images.length > 1 ? `Shared ${images.length} photos` : 'Shared a photo') : 'Shared an update'),
      category,
      images,
      videos,
    };

    if (linked_url) insertPayload.linked_url = linked_url;
    if (link_metadata) insertPayload.link_metadata = link_metadata;

    const { data: newPost, error } = await supabaseServer
      .from('posts')
      .insert(insertPayload)
      .select(`
        id,
        author_id,
        content,
        category,
        images,
        videos,
        linked_url,
        link_metadata,
        likes_count,
        comments_count,
        is_pinned,
        is_edited,
        created_at
      `)
      .single();

    if (error || !newPost) {
      console.warn('Supabase post insert fallback to memory store:', error?.message);
      const fallbackPost = {
        id: Date.now(),
        author_id: authorId,
        content: insertPayload.content,
        category: insertPayload.category,
        images: insertPayload.images,
        videos: insertPayload.videos,
        linked_url: insertPayload.linked_url,
        link_metadata: insertPayload.link_metadata,
        likes_count: 0,
        comments_count: 0,
        is_pinned: false,
        is_edited: false,
        created_at: new Date().toISOString(),
        userId: authorId,
        fullName: authorProfile.full_name || 'SZMC Alumnus',
        avatarUrl: authorProfile.avatar_url || '/assets/aistudio/images__1__2778177d.png',
        batchYear: authorProfile.batch_year || 20,
        author: authorProfile.full_name || 'SZMC Alumnus',
        authorAvatar: authorProfile.avatar_url || '/assets/aistudio/images__1__2778177d.png',
        authorBatch: authorProfile.batch_year || 20,
      };
      memoryPostsStore.unshift(fallbackPost);
      return res.status(201).json({ post: fallbackPost });
    }

    const createdPost = {
      ...newPost,
      userId: newPost.author_id,
      fullName: authorProfile.full_name || 'SZMC Alumnus',
      avatarUrl: authorProfile.avatar_url || '/assets/aistudio/images__1__2778177d.png',
      batchYear: authorProfile.batch_year || 20,
      author: authorProfile.full_name || 'SZMC Alumnus',
      authorAvatar: authorProfile.avatar_url || '/assets/aistudio/images__1__2778177d.png',
      authorBatch: authorProfile.batch_year || 20,
    };
    memoryPostsStore.unshift(createdPost);

    return res.status(201).json({ post: createdPost });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to create post' });
  }
});

// Post Likes - High Performance Supabase Storage
app.post('/api/posts/:id/like', rateLimitGuard(60, 60_000), async (req: Request, res: Response) => {
  try {
    const postId = Number(req.params.id);
    const userId = Number(req.body.userId || req.body.user_id || 1);

    let liked = false;
    let likesCount = 0;

    if (isSupabaseServerConfigured) {
      try {
        const { data: existing } = await supabaseServer
          .from('post_likes')
          .select('id')
          .eq('post_id', postId)
          .eq('user_id', userId)
          .maybeSingle();

        if (existing) {
          await supabaseServer.from('post_likes').delete().eq('id', existing.id);
          liked = false;
        } else {
          await supabaseServer.from('post_likes').insert({ post_id: postId, user_id: userId });
          liked = true;
        }

        const { count } = await supabaseServer
          .from('post_likes')
          .select('id', { count: 'exact', head: true })
          .eq('post_id', postId);

        likesCount = count || 0;
        await supabaseServer.from('posts').update({ likes_count: likesCount }).eq('id', postId);
      } catch (err) {
        console.warn('Supabase post_like toggle notice:', err);
      }
    }

    // Keep memoryPostsStore in sync
    const memPost = memoryPostsStore.find((p) => p.id === postId);
    if (memPost) {
      memPost.likes_count = likesCount || (liked ? (memPost.likes_count || 0) + 1 : Math.max(0, (memPost.likes_count || 1) - 1));
      memPost.likes = memPost.likes_count;
      memPost.liked = liked;
      memPost.likedByMe = liked;
    }

    return res.json({ success: true, liked, likesCount: likesCount || memPost?.likes_count || (liked ? 1 : 0) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to toggle like' });
  }
});

// Post Comments - Dual Column Supabase Storage (author_id & user_id)
app.post('/api/posts/:id/comment', rateLimitGuard(60, 60_000), async (req: Request, res: Response) => {
  try {
    const postId = Number(req.params.id);
    const userId = Number(req.body.userId || req.body.user_id || req.body.author_id || 1);
    const content = String(req.body.content || '').trim();

    if (!content) {
      return res.status(400).json({ error: 'Comment content cannot be empty' });
    }

    let insertedComment: any = null;

    if (isSupabaseServerConfigured) {
      try {
        // Try with user_id first, fallback to author_id
        const payload: any = { post_id: postId, content };
        payload.user_id = userId;
        payload.author_id = userId;

        const { data, error } = await supabaseServer
          .from('post_comments')
          .insert(payload)
          .select('*')
          .single();

        if (!error && data) {
          insertedComment = data;
        } else {
          // If inserting both failed due to strict column check, try user_id alone then author_id alone
          const try1 = await supabaseServer.from('post_comments').insert({ post_id: postId, user_id: userId, content }).select('*').single();
          if (!try1.error && try1.data) {
            insertedComment = try1.data;
          } else {
            const try2 = await supabaseServer.from('post_comments').insert({ post_id: postId, author_id: userId, content }).select('*').single();
            if (!try2.error && try2.data) insertedComment = try2.data;
          }
        }

        // Increment comments_count on post
        const { count } = await supabaseServer
          .from('post_comments')
          .select('id', { count: 'exact', head: true })
          .eq('post_id', postId);

        if (typeof count === 'number') {
          await supabaseServer.from('posts').update({ comments_count: count }).eq('id', postId);
        }
      } catch (err) {
        console.warn('Supabase comment insert notice:', err);
      }
    }

    if (!insertedComment) {
      insertedComment = {
        id: Date.now(),
        post_id: postId,
        user_id: userId,
        author_id: userId,
        content,
        created_at: new Date().toISOString(),
      };
    }

    const memPost = memoryPostsStore.find((p) => p.id === postId);
    if (memPost) {
      memPost.comments_count = (memPost.comments_count || 0) + 1;
      if (!Array.isArray(memPost.comments)) memPost.comments = [];
      memPost.comments.push({
        id: insertedComment.id,
        postId,
        userId,
        fullName: 'You',
        avatarUrl: '/assets/aistudio/images__1__2778177d.png',
        content,
        likesCount: 0,
        createdAt: insertedComment.created_at || new Date().toISOString(),
      });
    }

    return res.status(201).json({ success: true, comment: insertedComment });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to add comment' });
  }
});

// Gallery Albums & Photos - High Resilient Supabase Storage
const memoryGalleryAlbums: any[] = [];

app.get('/api/gallery/albums', rateLimitGuard(60, 60_000), async (_req: Request, res: Response) => {
  try {
    if (isSupabaseServerConfigured) {
      try {
        const { data: albums, error } = await supabaseServer
          .from('gallery_albums')
          .select('*, gallery_photos(*)')
          .order('created_at', { ascending: false });

        if (!error && albums && albums.length > 0) {
          const formatted = albums.map((a: any) => {
            const rawPhotos = a.gallery_photos || [];
            const photos = rawPhotos.map((p: any) => ({
              id: String(p.id),
              albumId: Number(a.id),
              url: p.url || p.photo_url || a.cover_url || a.cover_photo_url,
              caption: p.caption || '',
              category: a.category,
              batchYear: p.batch_year || a.batch_year,
              year: String(a.batch_year || 2026),
              uploaderName: p.uploader_name || 'SZMC Alumnus',
              uploaderId: p.uploader_id ? Number(p.uploader_id) : undefined,
              likes: Number(p.likes_count) || 0,
              liked: false,
              tags: Array.isArray(p.tags) ? p.tags : [],
              mediaType: p.media_type || 'image',
              fileSize: p.file_size || '1.2 MB',
            }));
            return {
              id: Number(a.id),
              title: a.title,
              description: a.description || '',
              category: a.category,
              date: a.event_date_label || '2026',
              location: a.location || 'SZMC Campus, Silimpur, Bogura',
              batchYear: a.batch_year || 0,
              photosCount: photos.length || a.photos_count || 1,
              coverUrl: a.cover_url || a.cover_photo_url || (photos[0]?.url ?? '/assets/aistudio/images__1__2778177d.png'),
              createdBy: a.created_by || 'SZMC Alumni',
              createdById: a.created_by_id ? Number(a.created_by_id) : undefined,
              photos,
            };
          });
          return res.json({ albums: formatted });
        }
      } catch (err) {
        console.warn('Supabase fetch gallery albums notice:', err);
      }
    }
    return res.json({ albums: memoryGalleryAlbums });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch gallery albums' });
  }
});

app.post('/api/gallery/albums', rateLimitGuard(30, 60_000), async (req: Request, res: Response) => {
  try {
    const { title, description, category, eventDateLabel, location, batchYear, coverUrl, createdById, createdBy } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Album title is required' });
    }

    const validCat = ['reunion', 'academic', 'campus', 'sports', 'cultural', 'milestone', 'convocation'];
    const normCat = (category || 'campus').toLowerCase();
    const finalCat = validCat.includes(normCat) ? normCat : 'campus';
    const finalCover = coverUrl || 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=1000&auto=format&fit=crop&q=80';

    let insertedAlbumId: number | null = null;

    if (isSupabaseServerConfigured) {
      try {
        const payload: any = {
          title: title.trim(),
          description: description || 'SZMC Album',
          category: finalCat,
          event_date_label: eventDateLabel || 'Recent',
          location: location || 'SZMC Campus, Silimpur, Bogura',
          batch_year: Number(batchYear) || null,
          cover_url: finalCover,
          cover_photo_url: finalCover,
          is_published: true,
          photos_count: 1,
        };
        if (createdById) payload.created_by_id = Number(createdById);
        if (createdBy) payload.created_by = String(createdBy);

        const { data, error } = await supabaseServer.from('gallery_albums').insert(payload).select('id').single();
        if (!error && data?.id) {
          insertedAlbumId = Number(data.id);
          // Insert cover photo into gallery_photos
          await supabaseServer.from('gallery_photos').insert({
            album_id: insertedAlbumId,
            url: finalCover,
            photo_url: finalCover,
            caption: `${title.trim()} - Cover Photo`,
            uploader_id: createdById ? Number(createdById) : null,
            uploader_name: createdBy ? String(createdBy) : 'SZMC Alumnus',
            is_approved: true,
          });
        }
      } catch (err) {
        console.warn('Supabase create album notice:', err);
      }
    }

    const finalId = insertedAlbumId || Date.now();
    const albumObj = {
      id: finalId,
      title: title.trim(),
      description: description || 'A collection of SZMC memories.',
      category: finalCat,
      date: eventDateLabel || 'Recent',
      location: location || 'SZMC Campus, Silimpur, Bogura',
      batchYear: Number(batchYear) || 0,
      photosCount: 1,
      coverUrl: finalCover,
      createdById: createdById ? Number(createdById) : undefined,
      createdBy: createdBy || 'SZMC Alumnus',
      photos: [
        {
          id: `p-${Date.now()}`,
          url: finalCover,
          caption: `${title.trim()} - Cover Photo`,
          uploaderId: createdById ? Number(createdById) : undefined,
          uploaderName: createdBy || 'SZMC Alumnus',
          batchYear: Number(batchYear) || 0,
          uploadedAt: 'Today',
          likesCount: 1,
          likedByMe: true,
          tags: ['Cover', finalCat],
        },
      ],
    };

    memoryGalleryAlbums.unshift(albumObj);
    return res.status(201).json({ success: true, album: albumObj });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to create album' });
  }
});

app.post('/api/gallery/photos', rateLimitGuard(60, 60_000), async (req: Request, res: Response) => {
  try {
    const { albumId, url, photoUrl, caption, batchYear, tags, mediaType, fileSize, uploaderId, uploaderName } = req.body;
    const finalUrl = url || photoUrl;
    if (!albumId || !finalUrl) {
      return res.status(400).json({ error: 'albumId and url are required' });
    }

    let insertedPhotoId: string | null = null;

    if (isSupabaseServerConfigured) {
      try {
        const payload: any = {
          album_id: Number(albumId),
          url: finalUrl,
          photo_url: finalUrl,
          caption: caption || null,
          batch_year: Number(batchYear) || null,
          tags: Array.isArray(tags) ? tags : [],
          media_type: mediaType || 'image',
          file_size: fileSize || null,
          is_approved: true,
        };
        if (uploaderId) payload.uploader_id = Number(uploaderId);
        if (uploaderName) payload.uploader_name = String(uploaderName);

        const { data, error } = await supabaseServer.from('gallery_photos').insert(payload).select('id').single();
        if (!error && data?.id) {
          insertedPhotoId = String(data.id);
          // Increment album photos_count
          const { count } = await supabaseServer.from('gallery_photos').select('id', { count: 'exact', head: true }).eq('album_id', Number(albumId));
          if (typeof count === 'number') {
            await supabaseServer.from('gallery_albums').update({ photos_count: count, photo_count: count }).eq('id', Number(albumId));
          }
        }
      } catch (err) {
        console.warn('Supabase add gallery photo notice:', err);
      }
    }

    const photoObj = {
      id: insertedPhotoId || `p-${Date.now()}`,
      albumId: Number(albumId),
      url: finalUrl,
      caption: caption || '',
      uploaderId: uploaderId ? Number(uploaderId) : undefined,
      uploaderName: uploaderName || 'SZMC Alumnus',
      batchYear: Number(batchYear) || 0,
      tags: Array.isArray(tags) ? tags : [],
      mediaType: mediaType || 'image',
      fileSize: fileSize || '1.2 MB',
    };

    // Update in memoryGalleryAlbums if present
    const memAlbum = memoryGalleryAlbums.find((a) => a.id === Number(albumId));
    if (memAlbum) {
      if (!Array.isArray(memAlbum.photos)) memAlbum.photos = [];
      memAlbum.photos.unshift(photoObj);
      memAlbum.photosCount = memAlbum.photos.length;
    }

    return res.status(201).json({ success: true, photo: photoObj });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to add photo' });
  }
});

// Delete Album Endpoint: Creator can delete own album, Admin can delete any album
const handleGalleryAlbumDelete = async (req: Request, res: Response) => {
  try {
    const albumId = Number(req.params.id);
    if (!albumId) {
      return res.status(400).json({ error: 'Album ID is required' });
    }

    const requesterUserId = Number(req.body.userId || req.query.userId || 0);
    const requesterIsAdmin = Boolean(req.body.isAdmin || req.query.isAdmin === 'true' || (req as any).user?.role === 'admin');

    if (isSupabaseServerConfigured) {
      try {
        const { data: album } = await supabaseServer
          .from('gallery_albums')
          .select('id, created_by_id')
          .eq('id', albumId)
          .maybeSingle();

        if (album) {
          const isOwner = requesterUserId > 0 && Number(album.created_by_id) === requesterUserId;
          if (!requesterIsAdmin && !isOwner) {
            return res.status(403).json({ error: 'Access denied: You can only delete your own albums, or an administrator can delete any album.' });
          }

          // Delete all associated photos first, then delete album
          await supabaseServer.from('gallery_photos').delete().eq('album_id', albumId);
          await supabaseServer.from('gallery_albums').delete().eq('id', albumId);
        }
      } catch (err) {
        console.warn('Supabase delete gallery album notice:', err);
      }
    }

    // Delete from memoryGalleryAlbums
    const memIdx = memoryGalleryAlbums.findIndex((a) => a.id === albumId);
    if (memIdx >= 0) {
      memoryGalleryAlbums.splice(memIdx, 1);
    }

    return res.json({ success: true, message: 'Album deleted successfully' });
  } catch (err: any) {
    console.error('Failed to delete gallery album:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete album' });
  }
};

app.delete('/api/gallery/albums/:id', rateLimitGuard(40, 60_000), handleGalleryAlbumDelete);
app.post('/api/gallery/albums/:id/delete', rateLimitGuard(40, 60_000), handleGalleryAlbumDelete);

// Delete Photo Endpoint: Uploader or Album Creator can delete own photo, Admin can delete any photo
const handleGalleryPhotoDelete = async (req: Request, res: Response) => {
  try {
    const photoId = String(req.params.id);
    const albumId = req.body.albumId || req.query.albumId ? Number(req.body.albumId || req.query.albumId) : null;
    const requesterUserId = Number(req.body.userId || req.query.userId || 0);
    const requesterIsAdmin = Boolean(req.body.isAdmin || req.query.isAdmin === 'true' || (req as any).user?.role === 'admin');

    if (isSupabaseServerConfigured) {
      try {
        const { data: photo } = await supabaseServer
          .from('gallery_photos')
          .select('id, album_id, uploader_id')
          .eq('id', photoId)
          .maybeSingle();

        if (photo) {
          let isOwner = requesterUserId > 0 && Number(photo.uploader_id) === requesterUserId;
          if (!isOwner && photo.album_id) {
            // Check if requester owns the album
            const { data: parentAlbum } = await supabaseServer
              .from('gallery_albums')
              .select('id, created_by_id')
              .eq('id', photo.album_id)
              .maybeSingle();
            if (parentAlbum && Number(parentAlbum.created_by_id) === requesterUserId) {
              isOwner = true;
            }
          }

          if (!requesterIsAdmin && !isOwner) {
            return res.status(403).json({ error: 'Access denied: You can only delete your own photos, or an administrator can delete any photo.' });
          }

          await supabaseServer.from('gallery_photos').delete().eq('id', photoId);

          const targetAlbumId = photo.album_id || albumId;
          if (targetAlbumId) {
            const { count } = await supabaseServer
              .from('gallery_photos')
              .select('id', { count: 'exact', head: true })
              .eq('album_id', targetAlbumId);
            const remainingCount = typeof count === 'number' ? count : 0;
            await supabaseServer.from('gallery_albums').update({ photos_count: remainingCount, photo_count: remainingCount }).eq('id', targetAlbumId);
          }
        }
      } catch (err) {
        console.warn('Supabase delete photo notice:', err);
      }
    }

    // Also update in memoryGalleryAlbums
    for (const alb of memoryGalleryAlbums) {
      if (Array.isArray(alb.photos)) {
        const pIdx = alb.photos.findIndex((p: any) => String(p.id) === photoId);
        if (pIdx >= 0) {
          alb.photos.splice(pIdx, 1);
          alb.photosCount = alb.photos.length;
          break;
        }
      }
    }

    return res.json({ success: true, message: 'Photo deleted successfully' });
  } catch (err: any) {
    console.error('Failed to delete photo:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete photo' });
  }
};

app.delete('/api/gallery/photos/:id', rateLimitGuard(60, 60_000), handleGalleryPhotoDelete);
app.post('/api/gallery/photos/:id/delete', rateLimitGuard(60, 60_000), handleGalleryPhotoDelete);

// Blood Network - High Resilient Supabase Storage
const memoryBloodRequests: any[] = [];
const memoryBloodDonors: any[] = [];

app.get('/api/blood/requests', rateLimitGuard(60, 60_000), async (_req: Request, res: Response) => {
  try {
    if (isSupabaseServerConfigured) {
      try {
        const { data: rows, error } = await supabaseServer
          .from('blood_requests')
          .select(`
            *,
            requester:alumni_profiles!blood_requests_requester_id_fkey(id, full_name, avatar_url, batch_year, phone),
            blood_request_responses(id, donor_id, status, response_note, created_at, donor:blood_donors(user_id, blood_group))
          `)
          .order('created_at', { ascending: false });

        if (!error && rows && rows.length > 0) {
          const mapped = rows.map((r: any) => ({
            id: String(r.id),
            bloodGroup: r.blood_group,
            unitsRequired: r.units_required || r.units_needed || 1,
            unitsFulfilled: r.units_fulfilled || 0,
            hospitalName: r.hospital_name || r.hospital || 'SZMC Hospital Bogura',
            hospitalArea: r.hospital_area || r.hospital_address || 'Silimpur',
            city: r.city || r.district || 'Bogura',
            requiredDateTime: r.required_datetime || r.required_date || new Date().toISOString(),
            emergencyLevel: (r.emergency_level || r.urgency || 'urgent').toLowerCase(),
            contactMethod: r.contact_method || 'Portal Secure Coordination',
            contactPhone: r.coordination_ref || r.contact_number || r.requester?.phone || '',
            description: r.description || r.medical_reason || 'Urgent requirement for patient care at SZMCH.',
            patientRelation: r.patient_relation || 'Alumnus Relative',
            requesterId: r.requester_id,
            requesterName: r.requester?.full_name || r.patient_name || 'SZMC Doctor',
            requesterAvatar: r.requester?.avatar_url || '/assets/aistudio/images__1__2778177d.png',
            requesterBatch: r.requester?.batch_year || 20,
            status: r.status || 'Active',
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            responses: (r.blood_request_responses || []).map((resp: any) => ({
              id: String(resp.id),
              requestId: String(r.id),
              donorUserId: resp.donor_id || resp.donor?.user_id || 0,
              donorName: 'Registered Doctor Donor',
              donorAvatar: '/assets/aistudio/images__1__2778177d.png',
              donorBatchYear: 20,
              donorBloodGroup: resp.donor?.blood_group || r.blood_group,
              donorPreferredArea: r.hospital_area || 'Bogura',
              respondedAt: resp.created_at,
              status: resp.status || 'offered',
              note: resp.response_note || '',
            })),
          }));
          return res.json({ requests: mapped });
        }
      } catch (err) {
        console.warn('Supabase fetch blood requests notice:', err);
      }
    }
    return res.json({ requests: memoryBloodRequests });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch blood requests' });
  }
});

app.post('/api/blood/requests', rateLimitGuard(30, 60_000), async (req: Request, res: Response) => {
  try {
    const {
      requesterId,
      bloodGroup,
      unitsRequired,
      hospitalName,
      hospitalArea,
      city,
      requiredDateTime,
      emergencyLevel,
      contactMethod,
      contactPhone,
      description,
      patientRelation,
    } = req.body;

    let insertedId: string | null = null;

    if (isSupabaseServerConfigured) {
      try {
        const payload: any = {
          requester_id: Number(requesterId) || 1,
          blood_group: bloodGroup,
          units_required: Number(unitsRequired) || 1,
          units_needed: Number(unitsRequired) || 1,
          hospital_name: hospitalName || 'SZMC Hospital',
          hospital: hospitalName || 'SZMC Hospital',
          hospital_area: hospitalArea || 'Silimpur',
          hospital_address: hospitalArea || 'Silimpur',
          city: city || 'Bogura',
          district: city || 'Bogura',
          required_datetime: requiredDateTime ? new Date(requiredDateTime).toISOString() : new Date().toISOString(),
          required_date: requiredDateTime ? new Date(requiredDateTime).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          emergency_level: (emergencyLevel || 'urgent').toLowerCase(),
          urgency: (emergencyLevel || 'urgent').toLowerCase(),
          contact_method: contactMethod || 'Portal Secure Coordination',
          contact_number: contactPhone || 'Through Portal',
          coordination_ref: contactPhone || 'Through Portal',
          description: description || 'Urgent blood requirement for clinical patient care.',
          medical_reason: description || 'Urgent blood requirement.',
          patient_name: patientRelation || 'Patient',
          patient_relation: patientRelation || 'Relative',
          status: 'Active',
        };

        const { data, error } = await supabaseServer.from('blood_requests').insert(payload).select('id').single();
        if (!error && data?.id) {
          insertedId = String(data.id);
        }
      } catch (err) {
        console.warn('Supabase insert blood request notice:', err);
      }
    }

    const finalId = insertedId || `req_${Date.now()}`;
    const newReq = {
      id: finalId,
      bloodGroup,
      unitsRequired: Number(unitsRequired) || 1,
      unitsFulfilled: 0,
      hospitalName,
      hospitalArea,
      city: city || 'Bogura',
      requiredDateTime: requiredDateTime || new Date().toISOString(),
      emergencyLevel: emergencyLevel || 'urgent',
      contactMethod: contactMethod || 'Portal Secure Coordination',
      contactPhone: contactPhone || '',
      description: description || '',
      patientRelation: patientRelation || 'Relative',
      requesterId: Number(requesterId) || 1,
      requesterName: req.body.requesterName || 'SZMC Doctor',
      requesterAvatar: req.body.requesterAvatar || '/assets/aistudio/images__1__2778177d.png',
      requesterBatch: Number(req.body.requesterBatch) || 20,
      status: 'Active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      responses: [],
    };

    memoryBloodRequests.unshift(newReq);
    return res.status(201).json({ success: true, request: newReq });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to create blood request' });
  }
});

app.post('/api/blood/donors', rateLimitGuard(30, 60_000), async (req: Request, res: Response) => {
  try {
    const { userId, bloodGroup, isRegisteredDonor, availability, preferredArea, city, lastDonationDate, emergencyAlertPreference } = req.body;
    const donorUserId = Number(userId || 1);

    if (isSupabaseServerConfigured) {
      try {
        const payload: any = {
          user_id: donorUserId,
          profile_id: donorUserId,
          blood_group: bloodGroup,
          is_registered_donor: Boolean(isRegisteredDonor),
          availability: availability || 'available',
          preferred_area: preferredArea || 'Bogura',
          city: city || 'Bogura',
          last_donation_date: lastDonationDate || null,
          emergency_alert_preference: emergencyAlertPreference || 'all_urgent',
          updated_at: new Date().toISOString(),
        };

        await supabaseServer.from('blood_donors').upsert(payload);
        await supabaseServer.from('alumni_profiles').update({
          blood_group: bloodGroup,
          is_registered_donor: Boolean(isRegisteredDonor),
        }).eq('id', donorUserId);
      } catch (err) {
        console.warn('Supabase upsert blood donor notice:', err);
      }
    }

    const donorObj = {
      userId: donorUserId,
      bloodGroup,
      isRegisteredDonor: Boolean(isRegisteredDonor),
      availability: availability || 'available',
      preferredArea: preferredArea || 'Bogura',
      city: city || 'Bogura',
      lastDonationDate,
      emergencyAlertPreference: emergencyAlertPreference || 'all_urgent',
      updatedAt: new Date().toISOString(),
    };

    const exIdx = memoryBloodDonors.findIndex((d) => d.userId === donorUserId);
    if (exIdx >= 0) memoryBloodDonors[exIdx] = donorObj;
    else memoryBloodDonors.push(donorObj);

    return res.json({ success: true, donor: donorObj });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to register blood donor' });
  }
});

// Mentorship System - High Resilient Supabase Storage
const memoryMentorshipRequests: any[] = [];
const memoryMentorOffers: any[] = [];

app.get('/api/mentorship/requests', rateLimitGuard(60, 60_000), async (_req: Request, res: Response) => {
  try {
    if (isSupabaseServerConfigured) {
      try {
        const { data: rows, error } = await supabaseServer
          .from('mentorship_requests')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && rows && rows.length > 0) {
          const mapped = rows.map((r: any) => ({
            id: String(r.id),
            userId: Number(r.user_id),
            userName: r.user_name,
            userBatch: r.user_batch,
            userAvatar: r.user_avatar,
            topic: r.topic,
            question: r.question,
            contactInfo: r.contact_info,
            targetMentorId: r.target_mentor_id,
            targetMentorName: r.target_mentor_name,
            status: r.status,
            answers: Array.isArray(r.answers) ? r.answers : [],
            createdAt: r.created_at,
          }));
          return res.json({ requests: mapped });
        }
      } catch (err) {
        console.warn('Supabase fetch mentorship requests notice:', err);
      }
    }
    return res.json({ requests: memoryMentorshipRequests });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch mentorship requests' });
  }
});

app.post('/api/mentorship/requests', rateLimitGuard(30, 60_000), async (req: Request, res: Response) => {
  try {
    const { id, userId, userName, userBatch, userAvatar, topic, question, contactInfo, targetMentorId, targetMentorName } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Question text is required' });
    }

    const reqId = id || `req-${Date.now()}`;
    const newReq = {
      id: reqId,
      user_id: Number(userId) || null,
      user_name: userName || 'SZMC Doctor',
      user_batch: Number(userBatch) || null,
      user_avatar: userAvatar || '/assets/aistudio/images__1__2778177d.png',
      topic: topic || 'Medical',
      question: question.trim(),
      contact_info: contactInfo || null,
      target_mentor_id: targetMentorId ? Number(targetMentorId) : null,
      target_mentor_name: targetMentorName || null,
      status: 'open',
      answers: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (isSupabaseServerConfigured) {
      try {
        await supabaseServer.from('mentorship_requests').insert(newReq);
      } catch (err) {
        console.warn('Supabase insert mentorship request notice:', err);
      }
    }

    memoryMentorshipRequests.unshift({
      ...newReq,
      userId: newReq.user_id,
      userName: newReq.user_name,
      userBatch: newReq.user_batch,
      userAvatar: newReq.user_avatar,
      contactInfo: newReq.contact_info,
      targetMentorId: newReq.target_mentor_id,
      targetMentorName: newReq.target_mentor_name,
    });

    return res.status(201).json({ success: true, request: newReq });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to create mentorship request' });
  }
});

app.post('/api/mentorship/requests/:id/answers', rateLimitGuard(30, 60_000), async (req: Request, res: Response) => {
  try {
    const reqId = req.params.id;
    const { mentorId, mentorName, mentorBatch, mentorAvatar, mentorProfession, answerText } = req.body;

    if (!answerText || !answerText.trim()) {
      return res.status(400).json({ error: 'Answer text is required' });
    }

    const newAns = {
      id: `ans-${Date.now()}`,
      mentorId: Number(mentorId) || 1,
      mentorName: mentorName || 'SZMC Mentor',
      mentorBatch: Number(mentorBatch) || null,
      mentorAvatar: mentorAvatar || '/assets/aistudio/images__1__2778177d.png',
      mentorProfession: mentorProfession || 'Consultant Physician',
      answerText: answerText.trim(),
      createdAt: 'Just now',
    };

    if (isSupabaseServerConfigured) {
      try {
        const { data: current } = await supabaseServer.from('mentorship_requests').select('answers').eq('id', reqId).maybeSingle();
        const currentAnswers = Array.isArray(current?.answers) ? current.answers : [];
        const updatedAnswers = [...currentAnswers, newAns];

        await supabaseServer
          .from('mentorship_requests')
          .update({ answers: updatedAnswers, status: 'answered', updated_at: new Date().toISOString() })
          .eq('id', reqId);
      } catch (err) {
        console.warn('Supabase add mentorship answer notice:', err);
      }
    }

    const memReq = memoryMentorshipRequests.find((r) => r.id === reqId);
    if (memReq) {
      if (!Array.isArray(memReq.answers)) memReq.answers = [];
      memReq.answers.push(newAns);
      memReq.status = 'answered';
    }

    return res.status(201).json({ success: true, answer: newAns });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to add answer' });
  }
});

app.get('/api/mentorship/mentors', rateLimitGuard(60, 60_000), async (_req: Request, res: Response) => {
  try {
    if (isSupabaseServerConfigured) {
      try {
        const { data: rows, error } = await supabaseServer
          .from('mentor_offers')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && rows && rows.length > 0) {
          const mapped = rows.map((m: any) => ({
            id: String(m.id),
            userId: Number(m.user_id),
            fullName: m.full_name,
            batchYear: Number(m.batch_year),
            avatarUrl: m.avatar_url,
            category: m.category,
            expertise: m.expertise,
            shortDescription: m.short_description,
            institution: m.institution,
            position: m.position,
            contactPreference: m.contact_preference,
            createdAt: m.created_at,
          }));
          return res.json({ mentors: mapped });
        }
      } catch (err) {
        console.warn('Supabase fetch mentors notice:', err);
      }
    }
    return res.json({ mentors: memoryMentorOffers });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch mentors' });
  }
});

app.post('/api/mentorship/mentors', rateLimitGuard(30, 60_000), async (req: Request, res: Response) => {
  try {
    const { id, userId, fullName, batchYear, avatarUrl, category, expertise, shortDescription, institution, position, contactPreference } = req.body;
    if (!fullName || !expertise) {
      return res.status(400).json({ error: 'Full name and expertise are required' });
    }

    const mentorId = id || `mentor-${Date.now()}`;
    const payload = {
      id: mentorId,
      user_id: Number(userId) || null,
      full_name: fullName.trim(),
      batch_year: Number(batchYear) || null,
      avatar_url: avatarUrl || '/assets/aistudio/images__1__2778177d.png',
      category: category || 'Medical',
      expertise: expertise.trim(),
      short_description: shortDescription || '',
      institution: institution || 'SZMC Hospital',
      position: position || 'Doctor',
      contact_preference: contactPreference || 'WhatsApp',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (isSupabaseServerConfigured) {
      try {
        await supabaseServer.from('mentor_offers').upsert(payload);
      } catch (err) {
        console.warn('Supabase register mentor notice:', err);
      }
    }

    const mentorObj = {
      id: mentorId,
      userId: payload.user_id,
      fullName: payload.full_name,
      batchYear: payload.batch_year,
      avatarUrl: payload.avatar_url,
      category: payload.category,
      expertise: payload.expertise,
      shortDescription: payload.short_description,
      institution: payload.institution,
      position: payload.position,
      contactPreference: payload.contact_preference,
      createdAt: payload.created_at,
    };

    const exIdx = memoryMentorOffers.findIndex((m) => m.fullName.toLowerCase() === mentorObj.fullName.toLowerCase());
    if (exIdx >= 0) memoryMentorOffers[exIdx] = mentorObj;
    else memoryMentorOffers.unshift(mentorObj);

    return res.status(201).json({ success: true, mentor: mentorObj });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to register mentor' });
  }
});

// Career & Job Opportunities System - High Resilient Supabase Storage
const memoryCareerOpportunities: any[] = [];

app.get('/api/careers', rateLimitGuard(60, 60_000), async (_req: Request, res: Response) => {
  try {
    if (isSupabaseServerConfigured) {
      try {
        const { data: rows, error } = await supabaseServer
          .from('career_opportunities')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && rows && rows.length > 0) {
          const mapped = rows.map((c: any) => ({
            id: String(c.id),
            title: c.title,
            company: c.company,
            location: c.location,
            type: c.type,
            description: c.description,
            posterId: Number(c.poster_id),
            posterName: c.poster_name,
            posterBatch: c.poster_batch,
            posterAvatar: c.poster_avatar,
            posterEmail: c.poster_email,
            status: c.status,
            applicants: Array.isArray(c.applicants) ? c.applicants : [],
            createdAt: c.created_at,
          }));
          return res.json({ opportunities: mapped });
        }
      } catch (err) {
        console.warn('Supabase fetch careers notice:', err);
      }
    }
    return res.json({ opportunities: memoryCareerOpportunities });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch career opportunities' });
  }
});

app.post('/api/careers', rateLimitGuard(30, 60_000), async (req: Request, res: Response) => {
  try {
    const { id, title, company, location, type, description, posterId, posterName, posterBatch, posterAvatar, posterEmail } = req.body;
    if (!title || !company) {
      return res.status(400).json({ error: 'Title and company/institution are required' });
    }

    const oppId = id || `opp-${Date.now()}`;
    const payload = {
      id: oppId,
      title: title.trim(),
      company: company.trim(),
      location: location || 'Bogura / Hybrid',
      type: type || 'job',
      description: description || '',
      poster_id: Number(posterId) || null,
      poster_name: posterName || 'SZMC Doctor',
      poster_batch: posterBatch || 'Alumnus',
      poster_avatar: posterAvatar || '/assets/aistudio/images__1__2778177d.png',
      poster_email: posterEmail || null,
      status: 'active',
      applicants: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (isSupabaseServerConfigured) {
      try {
        await supabaseServer.from('career_opportunities').insert(payload);
      } catch (err) {
        console.warn('Supabase insert career notice:', err);
      }
    }

    const oppObj = {
      id: oppId,
      title: payload.title,
      company: payload.company,
      location: payload.location,
      type: payload.type,
      description: payload.description,
      posterId: payload.poster_id,
      posterName: payload.poster_name,
      posterBatch: payload.poster_batch,
      posterAvatar: payload.poster_avatar,
      posterEmail: payload.poster_email,
      status: payload.status,
      applicants: [],
      createdAt: payload.created_at,
    };

    memoryCareerOpportunities.unshift(oppObj);
    return res.status(201).json({ success: true, opportunity: oppObj });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to create career opportunity' });
  }
});

app.post('/api/careers/:id/apply', rateLimitGuard(30, 60_000), async (req: Request, res: Response) => {
  try {
    const oppId = req.params.id;
    const { applicantId, applicantName, applicantBatch, applicantAvatar, applicantEmail, applicantPhone } = req.body;

    const newApp = {
      id: `app-${Date.now()}`,
      applicantId: Number(applicantId) || 1,
      applicantName: applicantName || 'SZMC Applicant',
      applicantBatch: applicantBatch || '',
      applicantAvatar: applicantAvatar || '/assets/aistudio/images__1__2778177d.png',
      applicantEmail: applicantEmail || '',
      applicantPhone: applicantPhone || '',
      appliedAt: new Date().toISOString(),
    };

    let updatedApplicants: any[] = [newApp];

    if (isSupabaseServerConfigured) {
      try {
        const { data: current } = await supabaseServer.from('career_opportunities').select('applicants').eq('id', oppId).maybeSingle();
        const existing = Array.isArray(current?.applicants) ? current.applicants : [];
        updatedApplicants = [newApp, ...existing];

        await supabaseServer
          .from('career_opportunities')
          .update({ applicants: updatedApplicants, updated_at: new Date().toISOString() })
          .eq('id', oppId);
      } catch (err) {
        console.warn('Supabase apply career notice:', err);
      }
    }

    const memOpp = memoryCareerOpportunities.find((o) => o.id === oppId);
    if (memOpp) {
      if (!Array.isArray(memOpp.applicants)) memOpp.applicants = [];
      memOpp.applicants.unshift(newApp);
    }

    return res.status(201).json({ success: true, application: newApp });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to apply for opportunity' });
  }
});

app.delete('/api/careers/:id', rateLimitGuard(30, 60_000), async (req: Request, res: Response) => {
  try {
    const oppId = req.params.id;
    if (isSupabaseServerConfigured) {
      try {
        await supabaseServer.from('career_opportunities').delete().eq('id', oppId);
      } catch (err) {
        console.warn('Supabase delete career notice:', err);
      }
    }
    const idx = memoryCareerOpportunities.findIndex((o) => o.id === oppId);
    if (idx >= 0) memoryCareerOpportunities.splice(idx, 1);

    return res.json({ success: true, message: 'Career opportunity deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to delete opportunity' });
  }
});


// ===========================================================================
// MESSAGING & CHAT SETTINGS API ROUTES (SUPABASE + RESILIENT STORE)
// ===========================================================================

interface InMemoryConversation {
  id: string;
  created_by: number;
  created_at: string;
  last_message_at: string;
}

interface InMemoryParticipant {
  conversation_id: string;
  profile_id: number;
  joined_at: string;
  last_read_at: string;
  is_muted: boolean;
}

interface InMemoryMessage {
  id: string;
  conversation_id: string;
  sender_id: number;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

const memoryConversations: InMemoryConversation[] = [
  {
    id: 'conv-szmc-001',
    created_by: 1,
    created_at: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
    last_message_at: new Date(Date.now() - 3600000 * 3).toISOString(),
  },
  {
    id: 'conv-szmc-002',
    created_by: 2,
    created_at: new Date(Date.now() - 3600000 * 24 * 5).toISOString(),
    last_message_at: new Date(Date.now() - 3600000 * 18).toISOString(),
  },
];

const memoryParticipants: InMemoryParticipant[] = [
  {
    conversation_id: 'conv-szmc-001',
    profile_id: 1,
    joined_at: new Date().toISOString(),
    last_read_at: new Date().toISOString(),
    is_muted: false,
  },
  {
    conversation_id: 'conv-szmc-001',
    profile_id: 2,
    joined_at: new Date().toISOString(),
    last_read_at: new Date().toISOString(),
    is_muted: false,
  },
  {
    conversation_id: 'conv-szmc-002',
    profile_id: 1,
    joined_at: new Date().toISOString(),
    last_read_at: new Date().toISOString(),
    is_muted: false,
  },
  {
    conversation_id: 'conv-szmc-002',
    profile_id: 3,
    joined_at: new Date().toISOString(),
    last_read_at: new Date().toISOString(),
    is_muted: false,
  },
];

const memoryMessages: InMemoryMessage[] = [
  {
    id: 'msg-001',
    conversation_id: 'conv-szmc-001',
    sender_id: 2,
    body: 'Assalamu Alaikum Doctor! Are you attending the upcoming SZMC Bogura Alumni Reunion?',
    created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
    edited_at: null,
    deleted_at: null,
  },
  {
    id: 'msg-002',
    conversation_id: 'conv-szmc-001',
    sender_id: 1,
    body: 'Walaikum Assalam! Yes, our batch has already coordinated travel. Looking forward to meeting everyone at the auditorium.',
    created_at: new Date(Date.now() - 3600000 * 3).toISOString(),
    edited_at: null,
    deleted_at: null,
  },
  {
    id: 'msg-003',
    conversation_id: 'conv-szmc-002',
    sender_id: 3,
    body: 'Greetings colleague! Please let me know if you can connect regarding clinical case consultation.',
    created_at: new Date(Date.now() - 3600000 * 18).toISOString(),
    edited_at: null,
    deleted_at: null,
  },
];

const memoryUserSettings = new Map<number, {
  profileId: number;
  whoCanMessage: 'everyone' | 'verified_only' | 'batch_only';
  readReceiptsEnabled: boolean;
  soundEnabled: boolean;
  notificationPreviewEnabled: boolean;
  emailNotificationDigest: boolean;
  updatedAt: string;
}>();

// 1. Get Live Messaging & Supabase Connection Status
app.get('/api/messages/status', async (_req: Request, res: Response) => {
  try {
    let tablesOnline = false;
    let settingsTableOnline = false;
    let tablesCheckError: string | null = null;

    if (isSupabaseServerConfigured) {
      try {
        const [msgRes, settingsRes] = await Promise.all([
          supabaseServer.from('messages').select('id').limit(1),
          supabaseServer.from('user_message_settings').select('profile_id').limit(1),
        ]);
        if (!msgRes.error) tablesOnline = true;
        if (!settingsRes.error) settingsTableOnline = true;
        if (msgRes.error && settingsRes.error) {
          tablesCheckError = msgRes.error.message;
        }
      } catch (err: any) {
        tablesCheckError = err.message;
      }
    }

    res.json({
      configured: isSupabaseServerConfigured,
      supabaseUrl: isSupabaseServerConfigured ? 'https://hjuyiqyviohinbhzaipl.supabase.co' : null,
      publishKeyPrefix: 'sb_publishable_uTT8y...',
      tablesOnline: tablesOnline || settingsTableOnline,
      messagesTableOnline: tablesOnline,
      settingsTableOnline,
      tablesCheckError,
      realtimeEnabled: true,
      storageFallbackActive: !(tablesOnline || settingsTableOnline),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/messages/run-setup', async (_req: Request, res: Response) => {
  try {
    const result = await attemptBootstrapMessagingTables();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. List Conversations for a Profile
app.get('/api/messages/conversations', rateLimitGuard(60, 60_000), async (req: Request, res: Response) => {
  const profileId = Number(req.query.profileId || 1);

  // Try fetching from Supabase first
  if (isSupabaseServerConfigured) {
    try {
      const { data: participants, error: partErr } = await supabaseServer
        .from('conversation_participants')
        .select('conversation_id, last_read_at, is_muted')
        .eq('profile_id', profileId);

      if (!partErr && participants && participants.length > 0) {
        const convIds = participants.map((p: any) => p.conversation_id);
        const [convRes, othersRes, msgRes] = await Promise.all([
          supabaseServer.from('conversations').select('id, last_message_at').in('id', convIds),
          supabaseServer
            .from('conversation_participants')
            .select('conversation_id, profile_id')
            .in('conversation_id', convIds)
            .neq('profile_id', profileId),
          supabaseServer
            .from('messages')
            .select('id, conversation_id, sender_id, body, created_at, edited_at, deleted_at')
            .in('conversation_id', convIds)
            .order('created_at', { ascending: false })
            .limit(500),
        ]);

        if (!convRes.error && !othersRes.error && !msgRes.error) {
          const otherProfileIds = Array.from(new Set((othersRes.data || []).map((o: any) => o.profile_id)));
          const { data: alumniProfiles } = await supabaseServer
            .from('alumni_profiles')
            .select('id, full_name, avatar_url, batch_year, profession')
            .in('id', otherProfileIds);

          const profileMap = new Map((alumniProfiles || []).map((p: any) => [p.id, p]));
          const participantMap = new Map(participants.map((p: any) => [p.conversation_id, p]));
          const convMap = new Map((convRes.data || []).map((c: any) => [c.id, c]));

          const latestMsgMap = new Map<string, any>();
          const unreadMap = new Map<string, number>();

          for (const msg of (msgRes.data || [])) {
            if (!latestMsgMap.has(msg.conversation_id)) {
              latestMsgMap.set(msg.conversation_id, msg);
            }
            const p = participantMap.get(msg.conversation_id);
            if (msg.sender_id !== profileId && !msg.deleted_at && p?.last_read_at && msg.created_at > p.last_read_at) {
              unreadMap.set(msg.conversation_id, (unreadMap.get(msg.conversation_id) || 0) + 1);
            }
          }

          const conversations = [];
          for (const other of (othersRes.data || [])) {
            const alumnus = profileMap.get(other.profile_id);
            const conv = convMap.get(other.conversation_id);
            const p = participantMap.get(other.conversation_id);
            const latest = latestMsgMap.get(other.conversation_id);

            if (alumnus && conv) {
              conversations.push({
                id: other.conversation_id,
                person: {
                  profileId: alumnus.id,
                  fullName: alumnus.full_name || 'SZMC Doctor',
                  avatarUrl: alumnus.avatar_url || 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150',
                  batchYear: alumnus.batch_year || 20,
                  profession: alumnus.profession || 'Physician',
                },
                lastMessageAt: latest?.created_at || conv.last_message_at,
                lastMessagePreview: latest?.deleted_at ? 'Message deleted' : (latest?.body || ''),
                lastMessageFromMe: latest?.sender_id === profileId,
                unreadCount: unreadMap.get(other.conversation_id) || 0,
                isMuted: Boolean(p?.is_muted),
              });
            }
          }

          conversations.sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
          return res.json({ conversations });
        }
      }
    } catch (err: any) {
      console.warn('Supabase conversations query fallback:', err.message);
    }
  }

  // Resilient in-memory fallback
  const myParticipantRows = memoryParticipants.filter((p) => p.profile_id === profileId);
  const conversations = [];

  for (const part of myParticipantRows) {
    const conv = memoryConversations.find((c) => c.id === part.conversation_id);
    const otherPart = memoryParticipants.find(
      (p) => p.conversation_id === part.conversation_id && p.profile_id !== profileId
    );
    if (!conv || !otherPart) continue;

    const msgs = memoryMessages
      .filter((m) => m.conversation_id === part.conversation_id)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const latest = msgs[0];
    const unreadCount = msgs.filter(
      (m) => m.sender_id !== profileId && !m.deleted_at && m.created_at > part.last_read_at
    ).length;

    // Doctor profile details
    const sampleDoctors: Record<number, any> = {
      1: { fullName: 'Dr. Shahriar Rahman', profession: 'Cardiologist', batchYear: 20 },
      2: { fullName: 'Dr. Nusrat Jahan', profession: 'Assistant Professor, Pediatrics', batchYear: 22 },
      3: { fullName: 'Dr. Tariqul Islam', profession: 'General Surgeon, SZMCH', batchYear: 18 },
      4: { fullName: 'Dr. Farhana Ahmed', profession: 'Dermatologist', batchYear: 24 },
    };
    const doc = sampleDoctors[otherPart.profile_id] || {
      fullName: `Dr. Alumnus #${otherPart.profile_id}`,
      profession: 'Physician',
      batchYear: 25,
    };

    conversations.push({
      id: conv.id,
      person: {
        profileId: otherPart.profile_id,
        fullName: doc.fullName,
        avatarUrl: `https://images.unsplash.com/photo-${1535713875002 + otherPart.profile_id}?w=150&auto=format&fit=crop&q=80`,
        batchYear: doc.batchYear,
        profession: doc.profession,
      },
      lastMessageAt: latest?.created_at || conv.last_message_at,
      lastMessagePreview: latest?.deleted_at ? 'Message deleted' : (latest?.body || ''),
      lastMessageFromMe: latest?.sender_id === profileId,
      unreadCount,
      isMuted: part.is_muted,
    });
  }

  conversations.sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
  res.json({ conversations });
});

// 3. Find or Create Direct Conversation
app.post('/api/messages/conversations', rateLimitGuard(40, 60_000), async (req: Request, res: Response) => {
  const { myProfileId, otherProfileId } = req.body;
  const myId = Number(myProfileId);
  const otherId = Number(otherProfileId);

  if (!myId || !otherId || myId === otherId) {
    return res.status(400).json({ error: 'Valid and distinct myProfileId and otherProfileId required.' });
  }

  // Try Supabase first
  if (isSupabaseServerConfigured) {
    try {
      const { data: myConvs } = await supabaseServer
        .from('conversation_participants')
        .select('conversation_id')
        .eq('profile_id', myId);

      const convIds = (myConvs || []).map((r: any) => r.conversation_id);
      if (convIds.length > 0) {
        const { data: existing } = await supabaseServer
          .from('conversation_participants')
          .select('conversation_id')
          .eq('profile_id', otherId)
          .in('conversation_id', convIds)
          .limit(1);

        if (existing && existing.length > 0) {
          return res.json({ conversationId: existing[0].conversation_id });
        }
      }

      const { data: createdConv, error: convErr } = await supabaseServer
        .from('conversations')
        .insert({ created_by: myId })
        .select('id')
        .single();

      if (!convErr && createdConv) {
        await supabaseServer.from('conversation_participants').insert([
          { conversation_id: createdConv.id, profile_id: myId },
          { conversation_id: createdConv.id, profile_id: otherId },
        ]);
        return res.status(201).json({ conversationId: createdConv.id });
      }
    } catch (err: any) {
      console.warn('Supabase create conversation notice:', err.message);
    }
  }

  // Memory fallback
  const myExisting = memoryParticipants
    .filter((p) => p.profile_id === myId)
    .map((p) => p.conversation_id);
  const shared = memoryParticipants.find(
    (p) => p.profile_id === otherId && myExisting.includes(p.conversation_id)
  );

  if (shared) {
    return res.json({ conversationId: shared.conversation_id });
  }

  const newId = `conv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  memoryConversations.push({
    id: newId,
    created_by: myId,
    created_at: now,
    last_message_at: now,
  });

  memoryParticipants.push(
    { conversation_id: newId, profile_id: myId, joined_at: now, last_read_at: now, is_muted: false },
    { conversation_id: newId, profile_id: otherId, joined_at: now, last_read_at: now, is_muted: false }
  );

  res.status(201).json({ conversationId: newId });
});

// 4. List Messages in a Conversation
app.get('/api/messages/conversations/:id', rateLimitGuard(60, 60_000), async (req: Request, res: Response) => {
  const convId = req.params.id;

  if (isSupabaseServerConfigured) {
    try {
      const { data, error } = await supabaseServer
        .from('messages')
        .select('id, conversation_id, sender_id, body, created_at, edited_at, deleted_at')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })
        .limit(500);

      if (!error && data) {
        const mapped = data.map((m: any) => ({
          id: m.id,
          conversationId: m.conversation_id,
          senderId: m.sender_id,
          body: m.body,
          createdAt: m.created_at,
          editedAt: m.edited_at || null,
          deletedAt: m.deleted_at || null,
        }));
        return res.json({ messages: mapped });
      }
    } catch (err: any) {
      console.warn('Supabase list messages fallback:', err.message);
    }
  }

  const msgs = memoryMessages
    .filter((m) => m.conversation_id === convId)
    .sort((a, b) => (a.created_at > b.created_at ? 1 : -1))
    .map((m) => ({
      id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      body: m.body,
      createdAt: m.created_at,
      editedAt: m.edited_at,
      deletedAt: m.deleted_at,
    }));

  res.json({ messages: msgs });
});

// 5. Send a Message
app.post('/api/messages/conversations/:id', rateLimitGuard(60, 60_000), async (req: Request, res: Response) => {
  const convId = req.params.id;
  const { senderId, body } = req.body;

  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: 'Message body cannot be empty.' });
  }

  const cleanBody = String(body).trim();
  const numSenderId = Number(senderId);

  if (isSupabaseServerConfigured) {
    try {
      const { data, error } = await supabaseServer
        .from('messages')
        .insert({
          conversation_id: convId,
          sender_id: numSenderId,
          body: cleanBody,
        })
        .select('id, conversation_id, sender_id, body, created_at, edited_at, deleted_at')
        .single();

      if (!error && data) {
        // Update conversation last_message_at
        await supabaseServer
          .from('conversations')
          .update({ last_message_at: data.created_at })
          .eq('id', convId);

        const formatted = {
          id: data.id,
          conversationId: data.conversation_id,
          senderId: data.sender_id,
          body: data.body,
          createdAt: data.created_at,
          editedAt: data.edited_at || null,
          deletedAt: data.deleted_at || null,
        };
        try {
          const ch = supabaseServer.channel('messages-realtime-feed');
          void ch.send({ type: 'broadcast', event: 'new_message', payload: formatted });
        } catch {}
        return res.status(201).json({ message: formatted });
      }
    } catch (err: any) {
      console.warn('Supabase send message fallback:', err.message);
    }
  }

  const now = new Date().toISOString();
  const newMsg: InMemoryMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    conversation_id: convId,
    sender_id: numSenderId,
    body: cleanBody,
    created_at: now,
    edited_at: null,
    deleted_at: null,
  };

  memoryMessages.push(newMsg);

  const conv = memoryConversations.find((c) => c.id === convId);
  if (conv) {
    conv.last_message_at = now;
  }

  const formattedMsg = {
    id: newMsg.id,
    conversationId: newMsg.conversation_id,
    senderId: newMsg.sender_id,
    body: newMsg.body,
    createdAt: newMsg.created_at,
    editedAt: newMsg.edited_at,
    deletedAt: newMsg.deleted_at,
  };

  if (isSupabaseServerConfigured) {
    try {
      const ch = supabaseServer.channel('messages-realtime-feed');
      void ch.send({ type: 'broadcast', event: 'new_message', payload: formattedMsg });
    } catch {}
  }

  res.status(201).json({ message: formattedMsg });
});

// 6. Edit a Message
app.patch('/api/messages/:id', rateLimitGuard(40, 60_000), async (req: Request, res: Response) => {
  const msgId = req.params.id;
  const { body } = req.body;

  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: 'Edited body cannot be empty.' });
  }

  const cleanBody = String(body).trim();

  if (isSupabaseServerConfigured) {
    try {
      const { data, error } = await supabaseServer
        .from('messages')
        .update({ body: cleanBody, edited_at: new Date().toISOString() })
        .eq('id', msgId)
        .select()
        .single();

      if (!error && data) {
        return res.json({
          message: {
            id: data.id,
            conversationId: data.conversation_id,
            senderId: data.sender_id,
            body: data.body,
            createdAt: data.created_at,
            editedAt: data.edited_at,
            deletedAt: data.deleted_at,
          },
        });
      }
    } catch (err: any) {
      console.warn('Supabase edit message fallback:', err.message);
    }
  }

  const found = memoryMessages.find((m) => m.id === msgId);
  if (!found) return res.status(404).json({ error: 'Message not found.' });

  found.body = cleanBody;
  found.edited_at = new Date().toISOString();

  res.json({
    message: {
      id: found.id,
      conversationId: found.conversation_id,
      senderId: found.sender_id,
      body: found.body,
      createdAt: found.created_at,
      editedAt: found.edited_at,
      deletedAt: found.deleted_at,
    },
  });
});

// 7. Delete (Soft) a Message
app.delete('/api/messages/:id', rateLimitGuard(40, 60_000), async (req: Request, res: Response) => {
  const msgId = req.params.id;

  if (isSupabaseServerConfigured) {
    try {
      const { data, error } = await supabaseServer
        .from('messages')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', msgId)
        .select()
        .single();

      if (!error && data) {
        return res.json({
          message: {
            id: data.id,
            conversationId: data.conversation_id,
            senderId: data.sender_id,
            body: data.body,
            createdAt: data.created_at,
            editedAt: data.edited_at,
            deletedAt: data.deleted_at,
          },
        });
      }
    } catch (err: any) {
      console.warn('Supabase delete message fallback:', err.message);
    }
  }

  const found = memoryMessages.find((m) => m.id === msgId);
  if (!found) return res.status(404).json({ error: 'Message not found.' });

  found.deleted_at = new Date().toISOString();

  res.json({
    message: {
      id: found.id,
      conversationId: found.conversation_id,
      senderId: found.sender_id,
      body: found.body,
      createdAt: found.created_at,
      editedAt: found.edited_at,
      deletedAt: found.deleted_at,
    },
  });
});

// 8. Mark Conversation Read
app.post('/api/messages/conversations/:id/read', rateLimitGuard(60, 60_000), async (req: Request, res: Response) => {
  const convId = req.params.id;
  const profileId = Number(req.body.profileId);
  const now = new Date().toISOString();

  if (isSupabaseServerConfigured) {
    try {
      await supabaseServer
        .from('conversation_participants')
        .update({ last_read_at: now })
        .eq('conversation_id', convId)
        .eq('profile_id', profileId);
    } catch {}
  }

  const part = memoryParticipants.find((p) => p.conversation_id === convId && p.profile_id === profileId);
  if (part) {
    part.last_read_at = now;
  }

  res.json({ success: true, lastReadAt: now });
});

// 9. Mute / Unmute Conversation
app.post('/api/messages/conversations/:id/mute', rateLimitGuard(40, 60_000), async (req: Request, res: Response) => {
  const convId = req.params.id;
  const { profileId, isMuted } = req.body;
  const numProfileId = Number(profileId);
  const mutedVal = Boolean(isMuted);

  if (isSupabaseServerConfigured) {
    try {
      await supabaseServer
        .from('conversation_participants')
        .update({ is_muted: mutedVal })
        .eq('conversation_id', convId)
        .eq('profile_id', numProfileId);
    } catch {}
  }

  const part = memoryParticipants.find((p) => p.conversation_id === convId && p.profile_id === numProfileId);
  if (part) {
    part.is_muted = mutedVal;
  }

  res.json({ success: true, isMuted: mutedVal });
});

// 10. Leave Conversation
app.post('/api/messages/conversations/:id/leave', rateLimitGuard(30, 60_000), async (req: Request, res: Response) => {
  const convId = req.params.id;
  const profileId = Number(req.body.profileId);

  if (isSupabaseServerConfigured) {
    try {
      await supabaseServer
        .from('conversation_participants')
        .delete()
        .eq('conversation_id', convId)
        .eq('profile_id', profileId);
    } catch {}
  }

  const idx = memoryParticipants.findIndex((p) => p.conversation_id === convId && p.profile_id === profileId);
  if (idx !== -1) {
    memoryParticipants.splice(idx, 1);
  }

  res.json({ success: true, message: 'Left conversation successfully' });
});

// 11. User Message Settings (Get & Save)
app.get('/api/messages/settings', rateLimitGuard(60, 60_000), async (req: Request, res: Response) => {
  const profileId = Number(req.query.profileId || 1);

  if (isSupabaseServerConfigured) {
    try {
      const { data, error } = await supabaseServer
        .from('user_message_settings')
        .select('*')
        .eq('profile_id', profileId)
        .maybeSingle();

      if (!error && data) {
        return res.json({
          settings: {
            profileId: data.profile_id,
            whoCanMessage: data.who_can_message || 'everyone',
            readReceiptsEnabled: Boolean(data.read_receipts_enabled),
            soundEnabled: Boolean(data.sound_enabled),
            notificationPreviewEnabled: Boolean(data.notification_preview_enabled),
            emailNotificationDigest: Boolean(data.email_notification_digest),
            updatedAt: data.updated_at,
          },
        });
      }
    } catch (err: any) {
      console.warn('Supabase get user_message_settings notice:', err.message);
    }
  }

  const fallback = memoryUserSettings.get(profileId) || {
    profileId,
    whoCanMessage: 'everyone',
    readReceiptsEnabled: true,
    soundEnabled: true,
    notificationPreviewEnabled: true,
    emailNotificationDigest: false,
    updatedAt: new Date().toISOString(),
  };

  res.json({ settings: fallback });
});

app.post('/api/messages/settings', rateLimitGuard(30, 60_000), async (req: Request, res: Response) => {
  const {
    profileId,
    whoCanMessage = 'everyone',
    readReceiptsEnabled = true,
    soundEnabled = true,
    notificationPreviewEnabled = true,
    emailNotificationDigest = false,
  } = req.body;

  const numProfileId = Number(profileId || 1);
  const now = new Date().toISOString();

  const payload = {
    profileId: numProfileId,
    whoCanMessage,
    readReceiptsEnabled: Boolean(readReceiptsEnabled),
    soundEnabled: Boolean(soundEnabled),
    notificationPreviewEnabled: Boolean(notificationPreviewEnabled),
    emailNotificationDigest: Boolean(emailNotificationDigest),
    updatedAt: now,
  };

  if (isSupabaseServerConfigured) {
    try {
      await supabaseServer.from('user_message_settings').upsert({
        profile_id: numProfileId,
        who_can_message: whoCanMessage,
        read_receipts_enabled: payload.readReceiptsEnabled,
        sound_enabled: payload.soundEnabled,
        notification_preview_enabled: payload.notificationPreviewEnabled,
        email_notification_digest: payload.emailNotificationDigest,
        updated_at: now,
      });
    } catch (err: any) {
      console.warn('Supabase upsert user_message_settings notice:', err.message);
    }
  }

  memoryUserSettings.set(numProfileId, payload);
  res.json({ success: true, settings: payload });
});

// Downloadable quick fix SQL script
app.get(['/szmc_quick_fix.sql', '/download/szmc_quick_fix.sql'], (_req: Request, res: Response) => {
  const filePath = path.join(__dirname, 'public', 'szmc_quick_fix.sql');
  if (existsSync(filePath)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="szmc_quick_fix.sql"');
    return res.sendFile(filePath);
  }
  return res.status(404).send('szmc_quick_fix.sql not found');
});

// Paginated 100k-scale Alumni Directory Query (with PII redaction guard)
app.get(
  '/api/alumni',
  rateLimitGuard(90, 60_000),
  optionalAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const isAdminView =
        req.query.adminView === 'true' &&
        req.dbUser?.role === 'admin';

      const result = await queryPaginatedAlumniProfiles({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 25,
        search: (req.query.search as string) || '',
        batchYear: req.query.batchYear ? Number(req.query.batchYear) : undefined,
        academicStream: (req.query.academicStream as string) || undefined,
        verificationStatus: (req.query.verificationStatus as string) || undefined,
        role: (req.query.role as string) || undefined,
        accountStatus: (req.query.accountStatus as string) || undefined,
        bloodGroup: (req.query.bloodGroup as string) || undefined,
        includeSensitivePii: isAdminView,
      });
      res.json(result);
    } catch (error: any) {
      console.error('Failed to fetch paginated alumni profiles:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch alumni profiles' });
    }
  }
);

// Register new Alumnus Profile in Cloud SQL (with Stream/Group validation)
app.post(
  '/api/alumni/register',
  rateLimitGuard(20, 60_000),
  optionalAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user as any;
      const created = await createOrRegisterAlumniProfile({
        userUid: user?.uid || user?.id || req.body.userUid,
        fullName: req.body.fullName,
        avatarUrl: req.body.avatarUrl,
        batchYear: Number(req.body.batchYear) || 68,
        session: req.body.session,
        collegeRoll: req.body.collegeRoll,
        academicStream: req.body.academicStream || req.body.group || 'Science',
        academicGroup: req.body.academicGroup || null,
        section: req.body.section,
        profession: req.body.profession,
        position: req.body.position,
        institution: req.body.institution,
        specialty: Array.isArray(req.body.specialty) ? req.body.specialty : [],
        degree: Array.isArray(req.body.degree) ? req.body.degree : ['HSC'],
        city: req.body.city,
        country: req.body.country,
        phone: req.body.phone,
        whatsapp: req.body.whatsapp,
        email: req.body.email,
        bloodGroup: req.body.bloodGroup,
        isRegisteredDonor: Boolean(req.body.isRegisteredDonor),
      });
      res.status(201).json({ profile: created });
    } catch (error: any) {
      console.error('Failed to register alumni profile:', error);
      res.status(400).json({ error: error.message || 'Failed to register alumni profile' });
    }
  }
);

// Admin Command Center: Overview Metrics & Audit Feed
app.get(
  '/api/admin/overview',
  rateLimitGuard(60, 60_000),
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const overview = await getAdminOverviewMetrics();
      res.json(overview);
    } catch (error: any) {
      console.error('Failed to load admin overview:', error);
      res.status(500).json({ error: error.message || 'Failed to load admin overview' });
    }
  }
);

// Admin Command Center: Update Profile Governance (Role, Verification, Suspension, Stream/Group)
app.patch(
  '/api/admin/alumni/:id',
  rateLimitGuard(40, 60_000),
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const profileId = Number(req.params.id);
      if (Number.isNaN(profileId)) {
        return res.status(400).json({ error: 'Invalid profile ID' });
      }
      const actor = resolveActor(req);
      const updated = await adminUpdateAlumniGovernance({
        profileId,
        verificationStatus: req.body.verificationStatus,
        role: req.body.role,
        accountStatus: req.body.accountStatus,
        academicStream: req.body.academicStream,
        academicGroup: req.body.academicGroup,
        adminReviewNote: req.body.adminReviewNote,
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
      });
      res.json({ profile: updated });
    } catch (error: any) {
      console.error('Failed to update profile governance:', error);
      res.status(400).json({ error: error.message || 'Failed to update profile governance' });
    }
  }
);

// Admin Command Center: Verification Submissions Queue
app.get(
  '/api/admin/verifications',
  rateLimitGuard(60, 60_000),
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const status = (req.query.status as string) || 'all';
      const submissions = await getVerificationQueue(status);
      res.json({ submissions });
    } catch (error: any) {
      console.error('Failed to fetch verification queue:', error);
      res.status(500).json({ error: error.message || 'Failed to load verification queue' });
    }
  }
);

// Admin Command Center: Approve or Reject Document Verification
app.post(
  '/api/admin/verifications/:id/review',
  rateLimitGuard(40, 60_000),
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const submissionId = Number(req.params.id);
      const decision = req.body.decision === 'approved' ? 'approved' : 'rejected';
      const actor = resolveActor(req);

      const updated = await reviewVerificationSubmission({
        submissionId,
        decision,
        adminNote: req.body.adminNote,
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
      });
      res.json({ submission: updated });
    } catch (error: any) {
      console.error('Failed to review verification submission:', error);
      res.status(400).json({ error: error.message || 'Failed to review verification submission' });
    }
  }
);

// Admin Command Center: Blood Emergency Moderation
app.get(
  '/api/admin/blood-requests',
  rateLimitGuard(60, 60_000),
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const requests = await getBloodEmergencyList();
      res.json({ requests });
    } catch (error: any) {
      console.error('Failed to load blood emergency requests:', error);
      res.status(500).json({ error: error.message || 'Failed to load blood emergency requests' });
    }
  }
);

app.patch(
  '/api/admin/blood-requests/:id',
  rateLimitGuard(40, 60_000),
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const actor = resolveActor(req);
      const updated = await moderateBloodEmergency({
        id,
        status: req.body.status,
        unitsFulfilled:
          req.body.unitsFulfilled !== undefined ? Number(req.body.unitsFulfilled) : undefined,
        moderationNote: req.body.moderationNote,
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
      });
      res.json({ request: updated });
    } catch (error: any) {
      console.error('Failed to moderate blood emergency:', error);
      res.status(400).json({ error: error.message || 'Failed to moderate blood emergency' });
    }
  }
);

// Admin Command Center: Official Notices
app.get(
  '/api/admin/notices',
  rateLimitGuard(60, 60_000),
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const notices = await getOfficialNoticesList();
      res.json({ notices });
    } catch (error: any) {
      console.error('Failed to load notices:', error);
      res.status(500).json({ error: error.message || 'Failed to load official notices' });
    }
  }
);

app.post(
  '/api/admin/notices',
  rateLimitGuard(30, 60_000),
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const actor = resolveActor(req);
      const notice = await createOrUpdateOfficialNotice({
        id: req.body.id ? Number(req.body.id) : undefined,
        title: req.body.title,
        category: req.body.category || 'General',
        content: req.body.content,
        targetBatch: req.body.targetBatch ? Number(req.body.targetBatch) : null,
        isPinned: Boolean(req.body.isPinned),
        isPublished: Boolean(req.body.isPublished),
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
      });
      res.json({ notice });
    } catch (error: any) {
      console.error('Failed to save notice:', error);
      res.status(400).json({ error: error.message || 'Failed to save official notice' });
    }
  }
);

// Admin Command Center: Toggle Academic Stream Group Active State
app.patch(
  '/api/admin/stream-groups/:id',
  rateLimitGuard(30, 60_000),
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const actor = resolveActor(req);
      const updated = await toggleAcademicStreamGroupActive({
        id,
        isActive: Boolean(req.body.isActive),
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
      });
      res.json({ streamGroup: updated });
    } catch (error: any) {
      console.error('Failed to update stream group:', error);
      res.status(400).json({ error: error.message || 'Failed to update stream group' });
    }
  }
);

// Admin Command Center: Bulk 100k-Scale Cohort Seeder / Stress-Test Importer
app.post(
  '/api/admin/bulk-cohort',
  rateLimitGuard(10, 60_000),
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const actor = resolveActor(req);
      const countToGenerate = Number(req.body.count) || 50;
      const result = await generateBulkBatchCohortSample({
        countToGenerate,
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
      });
      res.json(result);
    } catch (error: any) {
      console.error('Failed to execute bulk cohort import:', error);
      res.status(500).json({ error: error.message || 'Failed to execute bulk cohort import' });
    }
  }
);

// Admin Command Center: One-Click Combined Production SQL Bundle Download (001 -> 004)
app.get(
  '/api/admin/export-sql-bundle',
  rateLimitGuard(20, 60_000),
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const fullSchemaPath = path.resolve(__dirname, 'supabase', 'full_schema.sql');
      let bundleSql = '';
      try {
        bundleSql = await readFile(fullSchemaPath, 'utf-8');
      } catch {
        const files = [
          path.join('supabase', 'migrations', '001_core_schema.sql'),
          path.join('supabase', 'migrations', '002_security_functions_triggers.sql'),
          path.join('supabase', 'migrations', '003_rls_policies.sql'),
          path.join('supabase', 'migrations', '004_reference_seed_data.sql'),
          path.join('supabase', 'migrations', '005_admin_phone_verification.sql'),
          path.join('supabase', 'migrations', '006_edge_functions_support.sql'),
          path.join('supabase', 'migrations', '007_phone_login_additive_support.sql'),
          path.join('supabase', 'migrations', '008_expand_academic_stream_groups.sql'),
          path.join('supabase', 'migrations', '009_harden_storage_and_phone_enumeration.sql'),
          path.join('supabase', 'storage_policies.sql'),
        ];
        const parts: string[] = [];
        for (const file of files) {
          const filePath = path.resolve(__dirname, file);
          const content = await readFile(filePath, 'utf-8');
          parts.push(
            `-- =============================================================================\n-- MIGRATION FILE: ${file}\n-- =============================================================================\n\n${content}`
          );
        }
        bundleSql = parts.join('\n\n');
      }

      res.json({
        bundleSql,
        filesCount: 1,
      });
    } catch (error: any) {
      console.error('Failed to export SQL bundle:', error);
      res.status(500).json({ error: error.message || 'Failed to generate SQL migration bundle' });
    }
  }
);

// Public / Admin Direct SQL Download Endpoint for easy copy-pasting into Supabase SQL Editor
app.get('/api/sql/full-schema.sql', async (_req: Request, res: Response) => {
  try {
    const fullSchemaPath = path.resolve(__dirname, 'supabase', 'full_schema.sql');
    const content = await readFile(fullSchemaPath, 'utf-8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);
  } catch (error: any) {
    res.status(500).send(`-- Error loading SQL: ${error.message}`);
  }
});

// Admin Command Center: Full Database Snapshot Export (JSON Backup)
app.get(
  '/api/admin/export-full-backup',
  rateLimitGuard(15, 60_000),
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const [overview, directory, verifications, blood, notices] = await Promise.all([
        getAdminOverviewMetrics(),
        queryPaginatedAlumniProfiles({ page: 1, limit: 100, includeSensitivePii: true }),
        getVerificationQueue('all'),
        getBloodEmergencyList(),
        getOfficialNoticesList(),
      ]);
      res.json({
        exportedAt: new Date().toISOString(),
        platform: 'Shaheed Ziaur Rahman Medical College Alumni Network (SZMC Bogura)',
        overview,
        alumniProfiles: directory.profiles,
        verificationSubmissions: verifications,
        bloodEmergencyRequests: blood,
        officialNotices: notices,
      });
    } catch (error: any) {
      console.error('Failed to export full backup:', error);
      res.status(500).json({ error: error.message || 'Failed to export database backup' });
    }
  }
);

// Direct download route for the cPanel deployment zip
app.get(['/download/szmc-alumni-dist.zip', '/szmc-alumni-dist.zip', '/download/ndc-alumni-dist.zip', '/ndc-alumni-dist.zip'], (_req: Request, res: Response) => {
  const zipPath = path.resolve(__dirname, 'szmc-alumni-dist.zip');
  const fallbackZip = path.resolve(__dirname, 'ndc-alumni-dist.zip');
  const finalPath = existsSync(zipPath) ? zipPath : fallbackZip;
  res.download(finalPath, 'szmc-alumni-dist.zip');
});

// Direct download route for the consolidated master Supabase SQL script
app.get(['/szmc_full_schema.sql', '/download/szmc_full_schema.sql'], (_req: Request, res: Response) => {
  const sqlPath = path.resolve(__dirname, 'supabase', 'full_schema.sql');
  res.download(sqlPath, 'SZMC_Alumni_Full_Database_Schema.sql');
});


// ---------------------------------------------------------------------------
// VITE DEV SERVER / STATIC ASSET SERVING
// ---------------------------------------------------------------------------
async function startServer() {
  const httpServer = createHttpServer(app);

  // Serve static assets from public directory (images, fonts, favicons, logos)
  const publicPath = path.resolve(__dirname, 'public');
  app.use(express.static(publicPath));

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
      },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.use('*', async (req: Request, res: Response, next: NextFunction) => {
      const url = req.originalUrl;
      try {
        let template = await readFile(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (typeof PORT === 'number') {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`SZMC Alumni Server running on http://0.0.0.0:${PORT}`);
      void attemptBootstrapMessagingTables();
    });
  } else {
    httpServer.listen(PORT, () => {
      console.log(`SZMC Alumni Server running on cPanel socket ${PORT}`);
      void attemptBootstrapMessagingTables();
    });
  }
}

startServer();
