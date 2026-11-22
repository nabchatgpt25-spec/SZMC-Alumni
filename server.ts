// Defensively clean up any global __dirname / __filename polluted by tsx CLI
// so that ESM packages like vite-plugin-pwa and Vite resolve relative to import.meta.url correctly
if (typeof (globalThis as any).__dirname !== 'undefined') {
  delete (globalThis as any).__dirname;
}
if (typeof (globalThis as any).__filename !== 'undefined') {
  delete (globalThis as any).__filename;
}

// Guard the Node process against transient unhandled rejections or socket errors during pre-warming
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception (kept alive):', err?.message || err);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('[Server] Unhandled Rejection (kept alive):', reason?.message || reason);
});

import express, { type Request, type Response, type NextFunction } from 'express';
import compression from 'compression';
import { createServer as createHttpServer } from 'http';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config({ quiet: true });

import {
  supabaseServer,
  isSupabaseServerConfigured,
  isSupabaseServiceRoleConfigured,
  getSupabaseWriteClient,
  findAuthUserByEmailOrPhone,
  SUPABASE_TABLES,
} from './server/lib/supabase-server.ts';
import { isSafeTargetUrl, safeFetchHtml } from './server/lib/safeFetch.ts';
import {
  requireAuth,
  requireModerator,
  requireAdmin,
  requireSuperAdmin,
  optionalAuth,
  signAdminToken,
  signMemberSessionToken,
  getRolePermissions,
  isSuperAdminEmail,
  type AuthRequest,
} from './server/middleware/auth.ts';
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
  updateAlumniProfileRecord,
  adminVerifyAlumniPhoneOwnership,
  adminRevokeAlumniPhoneOwnership,
  isServerAutoVerifyActive,
  serverAutoVerifyConfig,
  setServerAutoVerifyConfig,
  bulkVerifyAllAlumniProfiles,
} from './server/db/adminRepository.ts';
import {
  ingestTelemetryBatch,
  getTelemetryOverview,
  getUserTelemetryDossier,
  createAdSegment,
  deleteAdSegment,
  clearTelemetryLogs,
  listAdSegments,
} from './server/db/telemetryRepository.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// AI Studio environment strictly requires the application to bind to port 3000
const args = process.argv.slice(2);
const portFlagIdx = args.indexOf('--port');
const cliPort = portFlagIdx !== -1 && args[portFlagIdx + 1] ? Number(args[portFlagIdx + 1]) : undefined;
const PORT: number = cliPort || (process.env.APP_PORT ? Number(process.env.APP_PORT) : 3000);

// 1. Security Headers & Strict Domain CORS Allowlist Middleware
const EXTRA_ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)
);

function isAllowedCorsOrigin(origin: string): boolean {
  const normalized = origin.trim().replace(/\/+$/, '');
  if (
    normalized === 'https://szmcalumni.net' ||
    normalized === 'https://www.szmcalumni.net' ||
    normalized === 'https://ndcbogura.alumniworld.xyz' ||
    normalized === 'https://alumniworld.xyz' ||
    normalized === 'https://www.alumniworld.xyz' ||
    EXTRA_ALLOWED_ORIGINS.has(normalized)
  ) {
    return true;
  }
  return (
    /^https:\/\/([a-zA-Z0-9-]+\.)*szmcalumni\.net$/.test(normalized) ||
    /^https:\/\/([a-zA-Z0-9-]+\.)*alumniworld\.xyz$/.test(normalized) ||
    /^https:\/\/([a-zA-Z0-9-]+\.)*run\.app$/.test(normalized) ||
    /^https:\/\/([a-zA-Z0-9-]+\.)*googleusercontent\.com$/.test(normalized) ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?$/.test(normalized)
  );
}

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin && isAllowedCorsOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, x-file-ext, x-user-id');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Enable high-performance HTTP compression (gzip/deflate)
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

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
      role: req.dbUser.role || 'member',
    };
  }
  throw new Error('Unauthorized: Valid verified session required on backend');
}

// ---------------------------------------------------------------------------
// API ROUTES
// ---------------------------------------------------------------------------

// Verify any authenticated session (member, moderator, admin, or super_admin)
app.get('/api/auth/verify-session', requireAuth, (req: AuthRequest, res: Response) => {
  const actor = req.dbUser;
  if (!actor) {
    return res.status(401).json({ authenticated: false, error: 'Unauthorized' });
  }
  return res.json({
    authenticated: true,
    user: actor,
    permissions: getRolePermissions(actor.role),
    timestamp: new Date().toISOString(),
  });
});

// Super-Admin-only download route for the compiled production distribution package
app.get(['/api/download-dist', '/download-dist', '/download/dist.zip', '/szmc-alumni-dist.zip'], requireSuperAdmin, (_req: AuthRequest, res: Response) => {
  const publicZip = path.resolve(__dirname, 'public', 'szmc-alumni-dist.zip');
  if (existsSync(publicZip)) {
    return res.download(publicZip, 'szmc-alumni-dist.zip');
  }
  const distZip = path.resolve(__dirname, 'dist', 'szmc-alumni-dist.zip');
  if (existsSync(distZip)) {
    return res.download(distZip, 'szmc-alumni-dist.zip');
  }
  return res.status(404).json({ error: 'Distribution bundle not found' });
});

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
      userUid: undefined,
      rawPassword: password,
      fullName: fullName.trim(),
      avatarUrl,
      batchYear: Number(batchYear) || 25,
      session,
      collegeRoll: collegeRoll?.trim(),
      academicStream:
        academicStream === 'Humanities' || academicStream === 'Business Studies'
          ? academicStream
          : 'Science',
      academicGroup: academicGroup || null,
      section: section || 'MBBS',
      profession: profession || '',
      position: position || '',
      institution: institution || '',
      specialty: Array.isArray(specialty) ? specialty : [],
      degree: Array.isArray(degree) ? degree : ['MBBS'],
      city: city || 'Bogura',
      country: country || 'Bangladesh',
      phone: phone?.trim() || null,
      whatsapp: whatsapp?.trim() || null,
      email: email?.trim() || null,
      passwordHash: hashedPassword,
      bloodGroup: bloodGroup || null,
      isRegisteredDonor: Boolean(isRegisteredDonor),
    });

    const formattedProfile = formatAlumniRowToProfile(created);
    const memberToken = signMemberSessionToken({
      email: formattedProfile.email || `member-${formattedProfile.id}@szmcalumni.net`,
      userId: formattedProfile.id,
      uid: formattedProfile.authUserId || `member:${formattedProfile.id}`,
      fullName: formattedProfile.fullName,
    });

    broadcastFeedEvent({
      type: 'ALUMNI_REGISTERED',
      profile: formattedProfile,
      timestamp: Date.now(),
    });

    res.status(201).json({
      success: true,
      token: memberToken,
      profile: formattedProfile,
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

    const safeCompareSecret = (provided: string, expected: string): boolean => {
      const a = crypto.createHash('sha256').update(provided).digest();
      const b = crypto.createHash('sha256').update(expected).digest();
      return crypto.timingSafeEqual(a, b);
    };

    // Dedicated Super Admin Verification (verified strictly via Supabase Auth, env ADMIN_PASSWORD, or stored DB password hash)
    const isDedicatedSuperAdmin = isEmail && isSuperAdminEmail(cleanId);

    if (isDedicatedSuperAdmin) {
      let authSession: any = null;
      let authenticated = false;
      const targetEmail = cleanId.toLowerCase().trim();
      let dbProfile: any = null;

      // 1. Primary: Supabase Auth password verification
      if (isSupabaseServerConfigured) {
        try {
          const { data: sData, error: sErr } = await supabaseServer.auth.signInWithPassword({
            email: targetEmail,
            password,
          });
          if (!sErr && sData?.session) {
            authSession = sData.session;
            authenticated = true;
          }
        } catch {}
      }

      // 2. Secondary: Environment-configured ADMIN_PASSWORD or stored DB password hash (no hardcoded password hashes in source)
      dbProfile = await findAlumniByCredential(targetEmail);
      if (!authenticated) {
        const envAdminPass = process.env.ADMIN_PASSWORD?.trim();
        if (envAdminPass && safeCompareSecret(password, envAdminPass)) {
          authenticated = true;
        } else if (dbProfile?.passwordHash && verifyPasswordServer(dbProfile.passwordHash, password)) {
          authenticated = true;
        }
      }

      if (!authenticated) {
        return res.status(401).json({ error: 'Invalid credentials. Access denied.' });
      }

      const resolvedId = Number(dbProfile?.id || 1);
      const resolvedUid = authSession?.user?.id || dbProfile?.authUserId || `super-admin:${targetEmail}`;
      const resolvedName = dbProfile?.fullName || 'Dr. Nurul Anam Bashir';

      const superAdminToken = signAdminToken(targetEmail, 'super_admin', {
        userId: resolvedId,
        uid: resolvedUid,
        fullName: resolvedName,
      });

      const superAdminProfile = dbProfile
        ? { ...formatAlumniRowToProfile(dbProfile), role: 'super_admin' }
        : {
            id: resolvedId,
            userId: resolvedId,
            authUserId: resolvedUid,
            fullName: resolvedName,
            avatarUrl: '/assets/aistudio/images__1__2778177d.png',
            batchYear: 25,
            academicStream: 'MBBS',
            academicGroup: null,
            section: 'MBBS',
            verificationStatus: 'verified',
            verificationMethod: 'admin_verified',
            vouchesCount: 10,
            profession: 'Medical Doctor / Physician',
            position: 'Super Admin / Lead Physician',
            institution: 'Shaheed Ziaur Rahman Medical College Hospital',
            specialty: ['Internal Medicine', 'Surgery'],
            degree: ['MBBS', 'FCPS'],
            city: 'Bogura',
            country: 'Bangladesh',
            email: targetEmail,
            phone: '',
            role: 'super_admin',
            isPublic: true,
            online: true,
            badges: ['SZMCian', 'Super Admin', 'Batch 25'],
          };

      return res.json({
        success: true,
        token: authSession?.access_token || superAdminToken,
        session: authSession || null,
        profile: superAdminProfile,
      });
    }

    // =========================================================================
    // CASE A: EMAIL LOGIN
    // =========================================================================
    if (isEmail) {
      const cleanEmail = cleanId.toLowerCase();

      if (isSupabaseServerConfigured) {
        const { data: signInData, error: signInError } = await supabaseServer.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (!signInError && signInData?.user && signInData?.session) {
          let alumnus = await findAlumniByCredential(cleanEmail);
          if (!alumnus) {
            alumnus = await createOrRegisterAlumniProfile({
              userUid: signInData.user.id,
              rawPassword: password,
              fullName:
                (signInData.user.user_metadata as any)?.full_name ||
                (signInData.user.user_metadata as any)?.name ||
                cleanEmail.split('@')[0],
              batchYear: Number((signInData.user.user_metadata as any)?.batch_year) || 25,
              email: cleanEmail,
              passwordHash: hashPasswordServer(password),
            });
          }

          return res.json({
            success: true,
            session: signInData.session,
            token: signInData.session.access_token,
            profile: formatAlumniRowToProfile(alumnus),
          });
        }

        if (signInError) {
          const msg = signInError.message.toLowerCase();
          if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
            return res.status(403).json({
              error: 'Please confirm your email address using the verification link sent to your inbox before signing in.',
            });
          }
          if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
            const existingU = await findAuthUserByEmailOrPhone({ email: cleanEmail });
            if (existingU && (existingU.app_metadata?.provider === 'google' || !existingU.encrypted_password)) {
              return res.status(400).json({
                error: 'This account was created via Google Sign-In and does not have a password set yet. Please continue with "Sign in with Google" or use "Forgot Password" to set a password.',
              });
            }
            return res.status(401).json({ error: 'Invalid email or password. Please verify your credentials.' });
          }
        }
      }

      // In-memory fallback (strictly issues a non-privileged member token, NEVER an admin token)
      const alumnus = await findAlumniByCredential(cleanEmail);
      if (!alumnus || !verifyPasswordServer(alumnus.passwordHash, password)) {
        return res.status(401).json({ error: 'Invalid email or password. Please verify your credentials.' });
      }
      const formatted = formatAlumniRowToProfile(alumnus);
      const memberToken = signMemberSessionToken({
        email: cleanEmail,
        userId: formatted.id,
        uid: formatted.authUserId || `member:${formatted.id}`,
        fullName: formatted.fullName,
      });
      return res.json({
        success: true,
        token: memberToken,
        profile: formatted,
      });
    }

    // =========================================================================
    // CASE B: PHONE NUMBER LOGIN
    // =========================================================================
    const formattedPhone = formatToE164PhoneServer(cleanId);
    const alumnus = await findAlumniByCredential(cleanId);

    if (!alumnus) {
      return res.status(401).json({
        error: 'Invalid mobile number or password. Please verify your credentials.',
      });
    }

    if (alumnus.accountStatus === 'suspended') {
      return res.status(403).json({ error: 'Your account is currently suspended. Please contact SZMC Alumni support.' });
    }

    // Authenticate against Supabase Auth using the user's password
    if (isSupabaseServerConfigured) {
      let authSession: any = null;

      // Method 1: Authenticate via user's verified registered email & password
      if (alumnus.email) {
        const { data: signInData, error: signInError } = await supabaseServer.auth.signInWithPassword({
          email: alumnus.email.toLowerCase().trim(),
          password,
        });

        if (signInError && signInError.message.toLowerCase().includes('not confirmed')) {
          return res.status(403).json({
            error: 'Please confirm your registered email address before signing in.',
          });
        }
        if (!signInError && signInData?.session) {
          authSession = signInData.session;
        }
      }

      // Method 2: Native phone sign-in fallback
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
        if (alumnus.authUserId && alumnus.phoneOwnershipVerified) {
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
          token: authSession.access_token,
          profile: formatAlumniRowToProfile(alumnus),
        });
      }

      // Bounded check for Google-only accounts
      const matchedUser = await findAuthUserByEmailOrPhone({
        authUserId: alumnus.authUserId,
        email: alumnus.email,
        phone: formattedPhone,
      });

      if (matchedUser && (matchedUser.app_metadata?.provider === 'google' || !matchedUser.encrypted_password)) {
        return res.status(400).json({
          error:
            'This account was created via Google Sign-In and does not have a password set yet. Please sign in with Google, or use "Forgot Password" to set a password for phone login.',
        });
      }

      return res.status(401).json({ error: 'Invalid mobile number or password. Please verify your credentials.' });
    }

    // In-memory fallback (strictly issues a non-privileged member token, NEVER an admin token)
    const isValid = verifyPasswordServer(alumnus.passwordHash, password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid mobile number or password. Please verify your credentials.' });
    }

    const formatted = formatAlumniRowToProfile(alumnus);
    const memberToken = signMemberSessionToken({
      email: formatted.email || `phone-${formatted.id}@szmcalumni.net`,
      userId: formatted.id,
      uid: formatted.authUserId || `member:${formatted.id}`,
      fullName: formatted.fullName,
    });
    return res.json({
      success: true,
      token: memberToken,
      profile: formatted,
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

// Admin/Moderator: Verify Server-Side Administrative Access & Authoritative Permissions
app.get('/api/admin/verify-access', requireModerator, (req: AuthRequest, res: Response) => {
  const actor = req.dbUser;
  if (!actor) {
    return res.status(401).json({
      authorized: false,
      role: 'member',
      error: 'Unauthorized: Missing verified session.',
    });
  }
  const permissions = getRolePermissions(actor.role);
  if (!permissions.canAccessAdminPortal) {
    return res.status(403).json({
      authorized: false,
      role: actor.role,
      error: 'Forbidden: Portal access restricted to verified moderators and administrators.',
    });
  }

  return res.json({
    authorized: true,
    role: actor.role,
    permissions,
    userId: actor.id,
    userUid: actor.uid,
    email: actor.email,
    fullName: actor.fullName,
    verifiedViaMetadata: true,
    timestamp: new Date().toISOString(),
  });
});

// Admin: Query 7-Day Auto-Verification Status
app.get('/api/admin/auto-verify-status', requireAdmin, (_req: AuthRequest, res: Response) => {
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
app.post('/api/admin/bulk-verify-all', rateLimitGuard(15, 60_000), requireSuperAdmin, async (req: AuthRequest, res: Response) => {
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

// ---------------------------------------------------------------------------
// User Behavioral Telemetry & Super Admin Ad Intelligence Data Center Routes
// ---------------------------------------------------------------------------

// Ingest sanitized behavioral event batches (page views, dwell time, clicks, scroll, searches)
app.post(
  '/api/telemetry/batch',
  rateLimitGuard(180, 60_000),
  optionalAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const body = req.body;
      if (!body || typeof body !== 'object' || !body.session?.sessionId) {
        return res.status(400).json({ error: 'Invalid telemetry payload.' });
      }
      const result = await ingestTelemetryBatch(body, req.dbUser || null);
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to ingest telemetry batch.' });
    }
  }
);

// Super Admin ONLY: Full User Activity Overview (KPIs, Route Dwell, Click Hotspots, Users, Live Feed)
app.get(
  '/api/admin/telemetry/overview',
  rateLimitGuard(120, 60_000),
  requireSuperAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const rawRange = Number(req.query.rangeHours);
      const rangeHours = Number.isFinite(rawRange) && rawRange >= 0 && rawRange <= 8760 ? rawRange : 168;
      const overview = await getTelemetryOverview(rangeHours);
      return res.json(overview);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to load telemetry overview.' });
    }
  }
);

// Super Admin ONLY: Deep-Dive Behavioral Dossier for a Specific User
app.get(
  '/api/admin/telemetry/user/:userKey',
  rateLimitGuard(120, 60_000),
  requireSuperAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const userKey = decodeURIComponent(String(req.params.userKey || '')).trim();
      if (!userKey || userKey.length > 140) {
        return res.status(400).json({ error: 'Invalid user identifier.' });
      }
      const dossier = await getUserTelemetryDossier(userKey);
      if (!dossier) {
        return res.status(404).json({ error: 'No behavioral telemetry found for this user.' });
      }
      return res.json(dossier);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to load user dossier.' });
    }
  }
);

// Super Admin ONLY: List, Create, and Delete Targeted Ad Audience Segments
app.get(
  '/api/admin/telemetry/segments',
  rateLimitGuard(120, 60_000),
  requireSuperAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const segments = await listAdSegments();
      return res.json({ segments });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to list audience segments.' });
    }
  }
);

app.post(
  '/api/admin/telemetry/segments',
  rateLimitGuard(60, 60_000),
  requireSuperAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const actor = resolveActor(req);
      const created = await createAdSegment(req.body || {}, actor.email || 'Super Admin');
      return res.status(201).json({ success: true, segment: created });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Failed to create audience segment.' });
    }
  }
);

app.delete(
  '/api/admin/telemetry/segments/:id',
  rateLimitGuard(60, 60_000),
  requireSuperAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = String(req.params.id || '').trim();
      await deleteAdSegment(id);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to delete audience segment.' });
    }
  }
);

app.post(
  '/api/admin/telemetry/clear',
  rateLimitGuard(10, 60_000),
  requireSuperAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      await clearTelemetryLogs();
      return res.json({ success: true, message: 'Local telemetry session buffer cleared.' });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to clear telemetry logs.' });
    }
  }
);

// ---------------------------------------------------------------------------
// Institutional Site Configuration Storage & Cross-Device Persistence Engine
// ---------------------------------------------------------------------------
let serverSiteConfigStore: any = null;
const SITE_CONFIG_FILE = path.resolve(__dirname, 'szmc-site-config.json');

function cleanAndPersistBase64Avatars(members: any[]): any[] {
  if (!Array.isArray(members)) return [];
  const uploadsDir = path.resolve(__dirname, 'public', 'uploads', 'avatars');
  if (!existsSync(uploadsDir)) {
    try {
      const { mkdirSync } = require('fs');
      mkdirSync(uploadsDir, { recursive: true });
    } catch {}
  }

  return members.map((member, idx) => {
    if (typeof member?.avatarUrl === 'string' && member.avatarUrl.startsWith('data:image')) {
      try {
        const matches = member.avatarUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (matches && matches[2]) {
          const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
          const fileName = `hof_${Date.now()}_${idx}.${ext}`;
          const filePath = path.join(uploadsDir, fileName);
          writeFileSync(filePath, Buffer.from(matches[2], 'base64'));
          return {
            ...member,
            avatarUrl: `/uploads/avatars/${fileName}`,
          };
        }
      } catch (err) {
        console.warn('Failed to extract base64 avatar:', err);
      }
    }
    return member;
  });
}

export async function hydrateServerSiteConfigFromSupabase(): Promise<any> {
  let diskConfig: any = null;
  try {
    if (existsSync(SITE_CONFIG_FILE)) {
      const raw = readFileSync(SITE_CONFIG_FILE, 'utf-8');
      diskConfig = JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[Server] Notice reading szmc-site-config.json:', err);
  }

  let remoteMasterConfig: any = null;
  let remoteHofMembers: any[] | null = null;

  if (isSupabaseServerConfigured) {
    try {
      const { data, error } = await supabaseServer.from('site_settings').select('*');
      if (!error && Array.isArray(data)) {
        const masterRow = data.find((r) => r.key === 'master_site_config');
        if (masterRow?.value && typeof masterRow.value === 'object') {
          remoteMasterConfig = masterRow.value;
        }
        const hofRow = data.find((r) => r.key === 'hall_of_fame');
        if (hofRow?.value) {
          const members = Array.isArray(hofRow.value.members)
            ? hofRow.value.members
            : Array.isArray(hofRow.value)
            ? hofRow.value
            : null;
          if (members && members.length > 0) {
            remoteHofMembers = members;
          }
        }
      }
    } catch (supaErr: any) {
      console.warn('[Server] Supabase site_settings hydration notice:', supaErr?.message || supaErr);
    }
  }

  const rawFeatured =
    (Array.isArray(diskConfig?.featuredAlumni) && diskConfig.featuredAlumni.length > 0)
      ? diskConfig.featuredAlumni
      : (Array.isArray(remoteHofMembers) && remoteHofMembers.length > 0)
      ? remoteHofMembers
      : (Array.isArray(remoteMasterConfig?.featuredAlumni) && remoteMasterConfig.featuredAlumni.length > 0)
      ? remoteMasterConfig.featuredAlumni
      : [];

  const finalFeaturedAlumni = cleanAndPersistBase64Avatars(rawFeatured);

  const merged = {
    ...(remoteMasterConfig || {}),
    ...(diskConfig || {}),
    featuredAlumni: finalFeaturedAlumni,
    updatedAt: new Date().toISOString(),
  };

  serverSiteConfigStore = merged;
  try {
    writeFileSync(SITE_CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Server] Failed to write szmc-site-config.json:', err);
  }
  return merged;
}

function loadServerSiteConfig(): any {
  if (serverSiteConfigStore) return serverSiteConfigStore;
  try {
    if (existsSync(SITE_CONFIG_FILE)) {
      const raw = readFileSync(SITE_CONFIG_FILE, 'utf-8');
      serverSiteConfigStore = JSON.parse(raw);
      return serverSiteConfigStore;
    }
  } catch (err) {
    console.warn('Notice reading szmc-site-config.json:', err);
  }
  return null;
}

function saveServerSiteConfig(patch: any): any {
  const current = loadServerSiteConfig() || {};
  let cleanedPatch = { ...patch };
  if (Array.isArray(cleanedPatch.featuredAlumni)) {
    cleanedPatch.featuredAlumni = cleanAndPersistBase64Avatars(cleanedPatch.featuredAlumni);
  }
  const updated = { ...current, ...cleanedPatch, updatedAt: new Date().toISOString() };
  serverSiteConfigStore = updated;
  try {
    writeFileSync(SITE_CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Failed to write szmc-site-config.json:', err);
  }
  return updated;
}

// Get Active Institutional Site Configuration (Fast response with browser cache control)
app.get(['/api/site-config', '/api/admin/site-config'], async (_req: Request, res: Response) => {
  try {
    let config = loadServerSiteConfig();
    if (!config || !config.featuredAlumni || config.featuredAlumni.length === 0) {
      config = await hydrateServerSiteConfigFromSupabase();
    }
    res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=30, stale-while-revalidate=60');
    return res.json({ success: true, config });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to read site configuration' });
  }
});

// Dedicated Hall of Fame API endpoint
app.get('/api/hall-of-fame', async (_req: Request, res: Response) => {
  try {
    let config = loadServerSiteConfig();
    if (!config || !config.featuredAlumni || config.featuredAlumni.length === 0) {
      config = await hydrateServerSiteConfigFromSupabase();
    }
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=120');
    return res.json({
      success: true,
      members: config?.featuredAlumni || [],
      updatedAt: config?.updatedAt || new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to read Hall of Fame' });
  }
});

// Admin Command: Save & Persist Institutional Site Configuration + Broadcast Live via SSE & Supabase
app.post('/api/admin/site-config', rateLimitGuard(120, 60_000), requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const rawBody = req.body;
    if (!rawBody || typeof rawBody !== 'object') {
      return res.status(400).json({ error: 'Invalid configuration payload' });
    }

    const { _clientSupabaseSynced, ...patch } = rawBody as Record<string, any>;
    const updated = saveServerSiteConfig(patch);

    // Immediately broadcast to all connected browsers in real-time (<50ms)
    broadcastFeedEvent({
      type: 'SITE_CONFIG_UPDATED',
      config: updated,
      timestamp: Date.now(),
    });

    if (Array.isArray(updated.featuredAlumni)) {
      broadcastFeedEvent({
        type: 'HALL_OF_FAME_UPDATED',
        featuredAlumni: updated.featuredAlumni,
        config: updated,
        timestamp: Date.now(),
      });
    }

    // Sync to Supabase site_settings using either service_role or the verified admin's Supabase JWT.
    // Never attempt an anon-role write to public.site_settings (anon writes are intentionally revoked by RLS).
    let supabaseSynced = false;
    let supabaseSyncError: string | null = null;
    let syncMode: 'service_role' | 'user_jwt' | 'client_jwt' | 'server_local_fallback' = 'server_local_fallback';

    if (_clientSupabaseSynced === true && !isSupabaseServiceRoleConfigured) {
      supabaseSynced = true;
      syncMode = 'client_jwt';
    } else if (isSupabaseServerConfigured) {
      const writeTarget = getSupabaseWriteClient(req.supabaseAccessToken);
      if (writeTarget) {
        syncMode = writeTarget.mode;
        const nowIso = new Date().toISOString();
        const hofMembers = Array.isArray(updated.featuredAlumni) ? updated.featuredAlumni : [];
        const results = await Promise.allSettled([
          writeTarget.client.from('site_settings').upsert({
            key: 'master_site_config',
            value: updated,
            updated_at: nowIso,
          }, { onConflict: 'key' }),
          writeTarget.client.from('site_settings').upsert({
            key: 'hall_of_fame',
            value: {
              members: hofMembers,
              updated_at: nowIso,
            },
            updated_at: nowIso,
          }, { onConflict: 'key' }),
        ]);
        const errors = results
          .map((r) => (r.status === 'rejected' ? r.reason?.message : r.value?.error?.message))
          .filter(Boolean);
        if (errors.length === 0) {
          supabaseSynced = true;
        } else {
          supabaseSyncError = errors.join('; ');
          console.warn('Supabase site_settings server sync error:', supabaseSyncError);
        }
      } else {
        // Neither SUPABASE_SERVICE_ROLE_KEY nor a Supabase Auth JWT is present (e.g. local Express admin session).
        // Server persistence + live SSE broadcast already succeeded without triggering a rejected anon write.
        syncMode = 'server_local_fallback';
      }
    }

    return res.json({
      success: true,
      supabaseSynced,
      syncMode,
      supabaseSyncError,
      message: supabaseSynced
        ? 'Site configuration & Hall of Fame saved to Supabase and broadcast live across all devices!'
        : 'Site configuration saved on server and broadcast live across all devices.',
      savedAt: updated.updatedAt,
      config: updated,
    });
  } catch (err: any) {
    console.error('Save site-config error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save site configuration' });
  }
});

// Global Cross-Device Password Reset Endpoint (Protected: requires authenticated session or admin authority)
app.post('/api/auth/reset-password', rateLimitGuard(10, 60_000), requireAuth as any, async (req: AuthRequest, res: Response) => {
  try {
    const { phone, newPassword } = req.body;
    if (!phone?.trim() || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Valid phone number and new password (min 6 chars) required.' });
    }

    const alumnus = await findAlumniByCredential(phone.trim());
    if (!alumnus) {
      return res.status(404).json({ error: 'No account found with this mobile number.' });
    }

    const isAdminCaller = req.dbUser?.role === 'admin' || req.dbUser?.role === 'super_admin';
    const isOwnerCaller =
      req.dbUser?.id === Number(alumnus.id) ||
      (req.dbUser?.email && alumnus.email && req.dbUser.email.toLowerCase() === alumnus.email.toLowerCase());

    if (!isAdminCaller && !isOwnerCaller) {
      return res.status(403).json({ error: 'Forbidden: You can only change the password for your own verified account.' });
    }

    const newHash = hashPasswordServer(newPassword);
    await updateAlumniPassword(alumnus.id, newHash);

    res.json({ success: true, message: 'Password updated successfully across all devices.' });
  } catch (error: any) {
    console.error('Password reset failed:', error);
    res.status(500).json({ error: error.message || 'Password reset failed.' });
  }
});

// Self-Service Profile / Account Deletion Endpoint (Protected: requires authenticated session or admin authority)
app.post('/api/auth/delete-account', rateLimitGuard(10, 60_000), requireAuth as any, async (req: AuthRequest, res: Response) => {
  try {
    const { profileId } = req.body;
    if (!profileId) {
      return res.status(400).json({ error: 'Profile ID is required for deletion.' });
    }

    const targetId = Number(profileId);
    const isAdminCaller = req.dbUser?.role === 'admin' || req.dbUser?.role === 'super_admin';
    const isOwnerCaller = req.dbUser?.id === targetId;

    if (!isAdminCaller && !isOwnerCaller) {
      return res.status(403).json({ error: 'Forbidden: You can only delete your own account.' });
    }

    await deleteAlumniProfile(targetId);
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

// Universal Rich Link Unfurl & OpenGraph Media Extractor (SSRF-hardened: blocks internal/private IPs, DNS rebinding, unsafe redirects, oversized payloads)
app.get('/api/unfurl', rateLimitGuard(120, 60_000), async (req: Request, res: Response) => {
  const targetUrl = typeof req.query.url === 'string' ? req.query.url : '';
  const cleanUrl = targetUrl.trim();
  const safety = isSafeTargetUrl(cleanUrl);
  if (!safety.safe || !safety.parsed) {
    return res.status(400).json({ error: safety.error || 'Valid public HTTP/HTTPS URL required' });
  }

  // Handle direct media files immediately after SSRF safety validation
  if (/\.(jpeg|jpg|png|webp|gif)(\?.*)?$/i.test(cleanUrl)) {
    return res.json({
      resolvedUrl: cleanUrl,
      imageUrl: cleanUrl,
      mediaType: 'photo',
      title: 'Direct Photo',
      publisher: safety.parsed.hostname,
    });
  }
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(cleanUrl)) {
    return res.json({
      resolvedUrl: cleanUrl,
      videoUrl: cleanUrl,
      mediaType: 'video',
      title: 'Direct Video Stream',
      publisher: safety.parsed.hostname,
    });
  }

  try {
    const isFacebook = /(?:facebook\.com|fb\.watch|fb\.com)/i.test(cleanUrl);
    const crawlerUa = isFacebook
      ? 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

    const { html: rawHtml, finalUrl: finalResolvedUrl } = await safeFetchHtml(cleanUrl, {
      userAgent: crawlerUa,
      timeoutMs: 6000,
      maxRedirects: 4,
    });

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

// In-memory resilient fallback post store for zero-downtime posting & sub-millisecond reads
const memoryPostsStore: any[] = [];
let cachedPostsResponse: { posts: any[]; expiresAt: number } | null = null;

export function invalidatePostsCache() {
  cachedPostsResponse = null;
}

// ---------------------------------------------------------------------------
// REAL-TIME FEED SSE STREAM & BROADCASTING
// ---------------------------------------------------------------------------
const feedClients = new Set<Response>();

app.get('/api/feed/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders?.();

  feedClients.add(res);

  // Send initial connected heartbeat + latest site config if available
  const activeConfig = loadServerSiteConfig();
  res.write(
    `data: ${JSON.stringify({
      type: 'CONNECTED',
      config: activeConfig || undefined,
      timestamp: Date.now(),
    })}\n\n`
  );

  req.on('close', () => {
    feedClients.delete(res);
  });
});

function broadcastFeedEvent(event: any) {
  if (event?.type?.startsWith('POST_')) {
    invalidatePostsCache();
  }
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of feedClients) {
    try {
      client.write(data);
    } catch {
      feedClients.delete(client);
    }
  }
}

app.post('/api/feed/broadcast', rateLimitGuard(60, 60_000), requireAuth, (req: AuthRequest, res: Response) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Invalid broadcast payload' });
  }
  const eventType = String(payload.type || '');
  const isAdminActor = req.dbUser?.role === 'admin' || req.dbUser?.role === 'super_admin' || req.dbUser?.role === 'moderator';
  // Only verified admins can broadcast global site/config/notice events
  if (
    (eventType === 'SITE_CONFIG_UPDATED' || eventType === 'HALL_OF_FAME_UPDATED' || eventType === 'NOTICE_UPDATED') &&
    !isAdminActor
  ) {
    return res.status(403).json({ error: 'Forbidden: Only administrators can broadcast system configuration events.' });
  }
  broadcastFeedEvent(payload);
  res.json({ success: true });
});

// Quad Feed Posts - Resilient Server Proxy with Sub-Millisecond Memory Cache & Real-Time Broadcasting
app.get('/api/posts', rateLimitGuard(120, 60_000), async (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

    // Serve from ultra-fast memory cache if fresh (< 8 seconds) and not force-refreshing
    if (
      cachedPostsResponse &&
      Date.now() < cachedPostsResponse.expiresAt &&
      req.query.fresh !== '1'
    ) {
      return res.json({ posts: cachedPostsResponse.posts.slice(0, limit) });
    }

    let dbPosts: any[] = [];
    if (isSupabaseServerConfigured) {
      try {
        const { data: posts } = await supabaseServer
          .from('posts')
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
            created_at,
            author:alumni_profiles!posts_author_id_fkey (
              id,
              full_name,
              avatar_url,
              batch_year,
              verification_status,
              profession,
              institution
            )
          `)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (posts && Array.isArray(posts)) {
          dbPosts = posts.map((p: any) => {
            const author = p.author || {};
            return {
              ...p,
              userId: p.author_id,
              fullName: author.full_name || 'SZMC Alumnus',
              avatarUrl: author.avatar_url || '/assets/aistudio/images__1__2778177d.png',
              batchYear: author.batch_year || 20,
              author: author.full_name || 'SZMC Alumnus',
              authorAvatar: author.avatar_url || '/assets/aistudio/images__1__2778177d.png',
              authorBatch: author.batch_year || 20,
              verified: author.verification_status === 'verified',
            };
          });
        }
      } catch (dbErr) {
        // Fallback without join if foreign key alias not present or restricted
        try {
          const { data: simplePosts } = await supabaseServer
            .from('posts')
            .select('*')
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })
            .limit(limit);
          if (simplePosts && Array.isArray(simplePosts)) {
            dbPosts = simplePosts.map((p: any) => {
              const meta = typeof p.link_metadata === 'object' && p.link_metadata ? p.link_metadata : {};
              const isDocNurul = Number(p.author_id) === 1 || Number(p.author_id) === 10002 || String(meta.authorName || '').includes('Nurul');
              const authorName = meta.authorName || (isDocNurul ? 'Dr. Nurul Anam Bashir' : 'SZMC Alumnus');
              const authorAvatar = meta.authorAvatar || '/assets/aistudio/images__1__2778177d.png';
              const authorBatch = Number(meta.authorBatch || (isDocNurul ? 25 : 20));
              return {
                ...p,
                userId: p.author_id,
                fullName: authorName,
                avatarUrl: authorAvatar,
                batchYear: authorBatch,
                author: authorName,
                authorAvatar: authorAvatar,
                authorBatch: authorBatch,
                verified: true,
                likesCount: Number(p.likes_count || 0),
                commentsCount: Number(p.comments_count || 0),
              };
            });
          }
        } catch {}
      }
    }

    const combined = [...memoryPostsStore, ...dbPosts.filter((p: any) => !memoryPostsStore.some((m) => m.id === p.id))];
    cachedPostsResponse = {
      posts: combined,
      expiresAt: Date.now() + 8000,
    };
    return res.json({ posts: combined });
  } catch (err: any) {
    return res.json({ posts: memoryPostsStore });
  }
});

app.post('/api/posts', rateLimitGuard(40, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    invalidatePostsCache();
    const isAdminActor = req.dbUser?.role === 'admin' || req.dbUser?.role === 'super_admin';
    const requestedAuthorId = Number(req.body.author_id || req.body.authorId || 0);
    const authorId = isAdminActor && requestedAuthorId > 0 ? requestedAuthorId : Number(req.dbUser?.id || 1);
    const content = String(req.body.content || '').trim();
    const category = req.body.category || 'General Update';
    const images = Array.isArray(req.body.images) ? req.body.images : [];
    const videos = Array.isArray(req.body.videos) ? req.body.videos : [];
    const linked_url = req.body.linked_url || null;
    const link_metadata = req.body.link_metadata || null;

    if (!content && images.length === 0 && videos.length === 0 && !linked_url) {
      return res.status(400).json({ error: 'Post must have content, photos, videos, or a link' });
    }

    let authorProfile: any = null;
    if (isSupabaseServerConfigured) {
      try {
        const { data: author } = await supabaseServer
          .from('alumni_profiles')
          .select('id, full_name, avatar_url, batch_year, verification_status, profession, institution')
          .eq('id', authorId)
          .maybeSingle();
        if (author) authorProfile = author;
      } catch {}
    }

    if (!authorProfile) {
      authorProfile = {
        id: authorId,
        full_name: authorId === 1 ? 'Dr. Nurul Anam Bashir' : 'SZMC Alumnus',
        avatarUrl: '/assets/aistudio/images__1__2778177d.png',
        batch_year: 25,
        verification_status: 'verified',
      };
    }

    const insertPayload: any = {
      author_id: authorId,
      content:
        content ||
        (videos.length > 0
          ? videos.length > 1
            ? `Shared ${videos.length} videos`
            : 'Shared a video'
          : images.length > 0
          ? images.length > 1
            ? `Shared ${images.length} photos`
            : 'Shared a photo'
          : 'Shared an update'),
      category,
      images,
      videos,
    };

    if (linked_url) insertPayload.linked_url = linked_url;
    if (link_metadata) insertPayload.link_metadata = link_metadata;

    let newPost: any = null;
    let error: any = null;

    if (isSupabaseServerConfigured) {
      const res = await supabaseServer
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
      newPost = res.data;
      error = res.error;

      // Resilient database insertion: if author_id violated foreign key constraint because profile is not yet in Supabase,
      // retry with verified existing profile id 10002 while stamping true author metadata
      if (error && (error.code === '23503' || String(error.message || '').includes('foreign key'))) {
        try {
          const resilientPayload = {
            ...insertPayload,
            author_id: 10002,
            link_metadata: {
              ...(insertPayload.link_metadata || {}),
              originalAuthorId: authorId,
              authorName: authorProfile.full_name || 'Dr. Nurul Anam Bashir',
              authorAvatar: authorProfile.avatar_url || '/assets/aistudio/images__1__2778177d.png',
              authorBatch: authorProfile.batch_year || 25,
            },
          };
          const retryRes = await supabaseServer
            .from('posts')
            .insert(resilientPayload)
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

          if (!retryRes.error && retryRes.data) {
            newPost = {
              ...retryRes.data,
              author_id: authorId,
              fullName: authorProfile.full_name || 'Dr. Nurul Anam Bashir',
              avatarUrl: authorProfile.avatar_url || '/assets/aistudio/images__1__2778177d.png',
              batchYear: authorProfile.batch_year || 25,
            };
            error = null;
          }
        } catch {}
      }
    }

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
        fullName: authorProfile.full_name || 'Dr. Nurul Anam Bashir',
        avatarUrl: authorProfile.avatar_url || '/assets/aistudio/images__1__2778177d.png',
        batchYear: authorProfile.batch_year || 25,
        author: authorProfile.full_name || 'Dr. Nurul Anam Bashir',
        authorAvatar: authorProfile.avatar_url || '/assets/aistudio/images__1__2778177d.png',
        authorBatch: authorProfile.batch_year || 25,
      };
      memoryPostsStore.unshift(fallbackPost);

      broadcastFeedEvent({
        type: 'POST_CREATED',
        table: 'posts',
        eventType: 'INSERT',
        post: fallbackPost,
        newRecord: fallbackPost,
      });

      return res.status(201).json({ success: true, post: fallbackPost });
    }

    const createdPost = {
      ...newPost,
      userId: newPost.author_id,
      fullName: authorProfile.full_name || 'Dr. Nurul Anam Bashir',
      avatarUrl: authorProfile.avatar_url || '/assets/aistudio/images__1__2778177d.png',
      batchYear: authorProfile.batch_year || 25,
      author: authorProfile.full_name || 'Dr. Nurul Anam Bashir',
      authorAvatar: authorProfile.avatar_url || '/assets/aistudio/images__1__2778177d.png',
      authorBatch: authorProfile.batch_year || 25,
    };
    memoryPostsStore.unshift(createdPost);

    broadcastFeedEvent({
      type: 'POST_CREATED',
      table: 'posts',
      eventType: 'INSERT',
      post: createdPost,
      newRecord: newPost,
    });

    broadcastFeedEvent({
      type: 'POST_CREATED',
      table: 'posts',
      eventType: 'INSERT',
      post: createdPost,
      newRecord: newPost,
    });

    return res.status(201).json({ success: true, post: createdPost });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to create post' });
  }
});

// Post Likes & Reactions - High Performance Realtime Supabase & In-Memory Storage
app.post('/api/posts/:id/react', rateLimitGuard(120, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const postId = Number(req.params.id);
    const userId = Number(req.dbUser?.id || 1);
    const reaction = req.body.reaction ? String(req.body.reaction) : null; // 'like' | 'love' | 'care' | 'haha' | 'wow' | 'sad' | 'angry' | null

    let likesCount = 0;
    let liked = Boolean(reaction);

    if (isSupabaseServerConfigured) {
      try {
        if (!reaction) {
          // Un-react / Unlike
          await supabaseServer.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
        } else {
          // Upsert reaction
          const { error: upsertErr } = await supabaseServer.from('post_likes').upsert({
            post_id: postId,
            user_id: userId,
            reaction,
          });
          if (upsertErr) {
            // Fallback if reaction column not present
            await supabaseServer.from('post_likes').upsert({
              post_id: postId,
              user_id: userId,
            });
          }
        }

        const { count } = await supabaseServer
          .from('post_likes')
          .select('id', { count: 'exact', head: true })
          .eq('post_id', postId);

        likesCount = typeof count === 'number' ? count : 0;
        await supabaseServer.from('posts').update({ likes_count: likesCount }).eq('id', postId);
      } catch (err) {
        console.warn('Supabase post react notice:', err);
      }
    }

    const memPost = memoryPostsStore.find((p) => p.id === postId);
    if (memPost) {
      if (!memPost.reactionsSummary) memPost.reactionsSummary = {};
      if (reaction) {
        memPost.reactionsSummary[reaction] = (memPost.reactionsSummary[reaction] || 0) + 1;
        memPost.likes_count = (memPost.likes_count || 0) + 1;
      } else {
        memPost.likes_count = Math.max(0, (memPost.likes_count || 1) - 1);
      }
      memPost.likes = memPost.likes_count;
      memPost.liked = liked;
      memPost.likedByMe = liked;
      memPost.userReaction = reaction;
    }

    const finalLikesCount = typeof likesCount === 'number' && likesCount > 0 ? likesCount : (memPost?.likes_count || (liked ? 1 : 0));
    const reactionsSummary = memPost?.reactionsSummary || (reaction ? { [reaction]: 1 } : {});

    broadcastFeedEvent({
      type: 'POST_REACTED',
      table: 'post_likes',
      eventType: 'UPDATE',
      postId,
      userId,
      liked,
      reaction,
      likesCount: finalLikesCount,
      reactionsSummary,
    });

    return res.json({ success: true, liked, reaction, likesCount: finalLikesCount, reactionsSummary });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update reaction' });
  }
});

// Post Likes - High Performance Supabase Storage
app.post('/api/posts/:id/like', rateLimitGuard(120, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const postId = Number(req.params.id);
    const userId = Number(req.dbUser?.id || 1);

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
          await supabaseServer.from('post_likes').insert({ post_id: postId, user_id: userId, reaction: 'like' });
          liked = true;
        }

        const { count } = await supabaseServer
          .from('post_likes')
          .select('id', { count: 'exact', head: true })
          .eq('post_id', postId);

        likesCount = typeof count === 'number' ? count : 0;
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
      memPost.userReaction = liked ? 'like' : null;
    }

    const finalLikesCount = likesCount || memPost?.likes_count || (liked ? 1 : 0);

    broadcastFeedEvent({
      type: 'POST_LIKED',
      table: 'post_likes',
      eventType: 'UPDATE',
      postId,
      userId,
      liked,
      likesCount: finalLikesCount,
      reaction: liked ? 'like' : null,
    });

    return res.json({ success: true, liked, likesCount: finalLikesCount });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to toggle like' });
  }
});

// Post Comments - Realtime Cross-Alumni Broadcast with Full Author Details
app.post('/api/posts/:id/comment', rateLimitGuard(90, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const postId = Number(req.params.id);
    const userId = Number(req.dbUser?.id || 1);
    const content = String(req.body.content || '').trim();
    let fullName = String(req.body.fullName || req.body.authorName || '').trim();
    let avatarUrl = String(req.body.avatarUrl || req.body.authorAvatar || '').trim();
    const skipDbInsert = Boolean(req.body.skipDbInsert);
    const clientCommentId = req.body.commentId ? Number(req.body.commentId) : null;
    const clientCreatedAt = req.body.createdAt ? String(req.body.createdAt) : null;

    if (!content) {
      return res.status(400).json({ error: 'Comment content cannot be empty' });
    }

    // Resolve author name and avatar if not provided
    if ((!fullName || !avatarUrl) && isSupabaseServerConfigured) {
      try {
        const { data: profile } = await supabaseServer
          .from('alumni_profiles')
          .select('full_name, avatar_url')
          .eq('id', userId)
          .maybeSingle();
        if (profile) {
          if (!fullName) fullName = profile.full_name || 'SZMC Colleague';
          if (!avatarUrl) avatarUrl = profile.avatar_url || '/assets/aistudio/images__1__2778177d.png';
        }
      } catch {}
    }

    if (!fullName) fullName = userId === 1 || userId === 10002 ? 'Dr. Nurul Anam Bashir' : 'SZMC Colleague';
    if (!avatarUrl) avatarUrl = '/assets/aistudio/images__1__2778177d.png';

    let insertedComment: any = null;

    if (isSupabaseServerConfigured && !skipDbInsert) {
      try {
        const try1 = await supabaseServer
          .from('post_comments')
          .insert({ post_id: postId, user_id: userId, content })
          .select('*')
          .single();

        if (!try1.error && try1.data) {
          insertedComment = try1.data;
        } else {
          // Resilient retry with verified profile 10002 if foreign key constraint was triggered
          const tryFk = await supabaseServer
            .from('post_comments')
            .insert({ post_id: postId, user_id: 10002, content })
            .select('*')
            .single();
          if (!tryFk.error && tryFk.data) {
            insertedComment = tryFk.data;
          }
        }
      } catch (err) {
        console.warn('Supabase comment insert notice:', err);
      }
    }

    if (isSupabaseServerConfigured) {
      try {
        const { count } = await supabaseServer
          .from('post_comments')
          .select('id', { count: 'exact', head: true })
          .eq('post_id', postId);

        if (typeof count === 'number' && count > 0) {
          await supabaseServer.from('posts').update({ comments_count: count }).eq('id', postId);
        }
      } catch {}
    }

    const commentId = clientCommentId || Number(insertedComment?.id) || Date.now();
    const createdTimestamp = clientCreatedAt || insertedComment?.created_at || new Date().toISOString();
    const formattedComment = {
      id: commentId,
      postId,
      post_id: postId,
      userId,
      user_id: userId,
      fullName,
      full_name: fullName,
      avatarUrl,
      avatar_url: avatarUrl,
      content,
      likesCount: 0,
      likes_count: 0,
      likedByMe: false,
      createdAt: createdTimestamp,
      created_at: createdTimestamp,
      replies: [],
    };

    const memPost = memoryPostsStore.find((p) => p.id === postId);
    if (memPost) {
      if (!Array.isArray(memPost.comments)) memPost.comments = [];
      if (!memPost.comments.some((c: any) => Number(c.id) === commentId)) {
        memPost.comments.push(formattedComment);
        memPost.comments_count = Math.max((memPost.comments_count || 0) + 1, memPost.comments.length);
      }
    }

    // Broadcast full formatted comment with author info to all connected alumni
    broadcastFeedEvent({
      type: 'POST_COMMENTED',
      table: 'post_comments',
      eventType: 'INSERT',
      postId,
      userId,
      comment: formattedComment,
      newRecord: formattedComment,
    });

    return res.status(201).json({ success: true, comment: formattedComment });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to add comment' });
  }
});

// Post Comment Replies - Realtime Cross-Alumni Broadcast + Supabase Persistence
app.post('/api/posts/:id/reply', rateLimitGuard(90, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const postId = Number(req.params.id);
    const parentCommentId = Number(req.body.parentCommentId);
    const userId = Number(req.dbUser?.id || 1);
    const content = String(req.body.content || '').trim();
    const fullName = String(req.body.fullName || 'SZMC Colleague').trim();
    const avatarUrl = String(req.body.avatarUrl || '/assets/aistudio/images__1__2778177d.png').trim();
    const skipDbInsert = Boolean(req.body.skipDbInsert);
    const clientCommentId = req.body.commentId ? Number(req.body.commentId) : null;
    const clientCreatedAt = req.body.createdAt ? String(req.body.createdAt) : null;

    if (!content) {
      return res.status(400).json({ error: 'Reply content cannot be empty' });
    }

    let insertedReply: any = null;
    if (isSupabaseServerConfigured && !skipDbInsert) {
      try {
        const try1 = await supabaseServer
          .from('post_comments')
          .insert({ post_id: postId, user_id: userId, content })
          .select('*')
          .single();
        if (!try1.error && try1.data) {
          insertedReply = try1.data;
        } else {
          const tryFk = await supabaseServer
            .from('post_comments')
            .insert({ post_id: postId, user_id: 10002, content })
            .select('*')
            .single();
          if (!tryFk.error && tryFk.data) insertedReply = tryFk.data;
        }
      } catch {}
    }

    const replyId = clientCommentId || Number(insertedReply?.id) || Date.now();
    const createdTimestamp = clientCreatedAt || insertedReply?.created_at || new Date().toISOString();

    const reply = {
      id: replyId,
      postId,
      post_id: postId,
      parentCommentId,
      userId,
      user_id: userId,
      fullName,
      full_name: fullName,
      avatarUrl,
      avatar_url: avatarUrl,
      content,
      likesCount: 0,
      likes_count: 0,
      likedByMe: false,
      createdAt: createdTimestamp,
      created_at: createdTimestamp,
    };

    broadcastFeedEvent({
      type: 'POST_REPLY',
      table: 'post_comments',
      eventType: 'UPDATE',
      postId,
      parentCommentId,
      reply,
    });

    return res.status(201).json({ success: true, reply });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to add reply' });
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

app.post('/api/gallery/albums', rateLimitGuard(30, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, category, eventDateLabel, location, batchYear, coverUrl, createdBy } = req.body;
    const createdById = Number(req.dbUser?.id || 0);
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

app.post('/api/gallery/photos', rateLimitGuard(60, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { albumId, url, photoUrl, caption, batchYear, tags, mediaType, fileSize, uploaderName } = req.body;
    const uploaderId = Number(req.dbUser?.id || 0);
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
const handleGalleryAlbumDelete = async (req: AuthRequest, res: Response) => {
  try {
    const albumId = Number(req.params.id);
    if (!albumId) {
      return res.status(400).json({ error: 'Album ID is required' });
    }

    const requesterUserId = Number(req.dbUser?.id || 0);
    const requesterIsAdmin = req.dbUser?.role === 'admin' || req.dbUser?.role === 'super_admin' || req.dbUser?.role === 'moderator';

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

app.delete('/api/gallery/albums/:id', rateLimitGuard(40, 60_000), requireAuth, handleGalleryAlbumDelete);
app.post('/api/gallery/albums/:id/delete', rateLimitGuard(40, 60_000), requireAuth, handleGalleryAlbumDelete);

// Delete Photo Endpoint: Uploader or Album Creator can delete own photo, Admin can delete any photo
const handleGalleryPhotoDelete = async (req: AuthRequest, res: Response) => {
  try {
    const photoId = String(req.params.id);
    const albumId = req.body.albumId || req.query.albumId ? Number(req.body.albumId || req.query.albumId) : null;
    const requesterUserId = Number(req.dbUser?.id || 0);
    const requesterIsAdmin = req.dbUser?.role === 'admin' || req.dbUser?.role === 'super_admin' || req.dbUser?.role === 'moderator';

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

app.delete('/api/gallery/photos/:id', rateLimitGuard(60, 60_000), requireAuth, handleGalleryPhotoDelete);
app.post('/api/gallery/photos/:id/delete', rateLimitGuard(60, 60_000), requireAuth, handleGalleryPhotoDelete);

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

app.post('/api/blood/requests', rateLimitGuard(30, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const {
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
    const requesterId = Number(req.dbUser?.id || 1);

    let insertedId: string | null = null;

    if (isSupabaseServerConfigured) {
      try {
        const payload: any = {
          requester_id: requesterId,
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
    broadcastFeedEvent({
      type: 'BLOOD_UPDATED',
      table: 'blood_requests',
      eventType: 'INSERT',
      record: newReq,
      timestamp: Date.now(),
    });
    return res.status(201).json({ success: true, request: newReq });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to create blood request' });
  }
});

app.post('/api/blood/donors', rateLimitGuard(30, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { bloodGroup, isRegisteredDonor, availability, preferredArea, city, lastDonationDate, emergencyAlertPreference } = req.body;
    const donorUserId = Number(req.dbUser?.id || 1);

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

app.post('/api/mentorship/requests', rateLimitGuard(30, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id, userName, userBatch, userAvatar, topic, question, contactInfo, targetMentorId, targetMentorName } = req.body;
    const userId = Number(req.dbUser?.id || 0);
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

app.post('/api/mentorship/requests/:id/answers', rateLimitGuard(30, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const reqId = req.params.id;
    const { mentorName, mentorBatch, mentorAvatar, mentorProfession, answerText } = req.body;
    const mentorId = Number(req.dbUser?.id || 1);

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

app.post('/api/mentorship/mentors', rateLimitGuard(30, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id, fullName, batchYear, avatarUrl, category, expertise, shortDescription, institution, position, contactPreference } = req.body;
    const userId = Number(req.dbUser?.id || 0);
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

app.post('/api/careers', rateLimitGuard(30, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id, title, company, location, type, description, posterName, posterBatch, posterAvatar, posterEmail } = req.body;
    const posterId = Number(req.dbUser?.id || 0);
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

app.post('/api/careers/:id/apply', rateLimitGuard(30, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const oppId = req.params.id;
    const { applicantName, applicantBatch, applicantAvatar, applicantEmail, applicantPhone } = req.body;
    const applicantId = Number(req.dbUser?.id || 1);

    const newApp = {
      id: `app-${Date.now()}`,
      applicantId,
      applicantName: applicantName || req.dbUser?.fullName || 'SZMC Applicant',
      applicantBatch: applicantBatch || '',
      applicantAvatar: applicantAvatar || '/assets/aistudio/images__1__2778177d.png',
      applicantEmail: applicantEmail || req.dbUser?.email || '',
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

app.delete('/api/careers/:id', rateLimitGuard(30, 60_000), requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const oppId = req.params.id;
    const requesterId = Number(req.dbUser?.id || 0);
    const isAdminActor = req.dbUser?.role === 'admin' || req.dbUser?.role === 'super_admin' || req.dbUser?.role === 'moderator';

    if (isSupabaseServerConfigured) {
      try {
        const { data: opp } = await supabaseServer
          .from('career_opportunities')
          .select('id, poster_id')
          .eq('id', oppId)
          .maybeSingle();

        if (opp && !isAdminActor && Number(opp.poster_id) !== requesterId) {
          return res.status(403).json({ error: 'Forbidden: Only the poster or an administrator can delete this opportunity.' });
        }

        await supabaseServer.from('career_opportunities').delete().eq('id', oppId);
      } catch (err) {
        console.warn('Supabase delete career notice:', err);
      }
    }
    const idx = memoryCareerOpportunities.findIndex((o) => o.id === oppId);
    if (idx >= 0) {
      if (!isAdminActor && Number(memoryCareerOpportunities[idx].posterId) !== requesterId) {
        return res.status(403).json({ error: 'Forbidden: Only the poster or an administrator can delete this opportunity.' });
      }
      memoryCareerOpportunities.splice(idx, 1);
    }

    return res.json({ success: true, message: 'Career opportunity deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to delete opportunity' });
  }
});

// Feature Flags System (Backed by public.app_feature_flags)
const memoryFeatureFlags = new Map<
  string,
  { key: string; enabled: boolean; description?: string | null; config: Record<string, unknown>; updatedAt: string }
>([
  ['the_quad_enabled', { key: 'the_quad_enabled', enabled: true, description: 'Master toggle for THE QUAD Hybrid Community System', config: { version: 1 }, updatedAt: new Date().toISOString() }],
  ['batch_lounges_enabled', { key: 'batch_lounges_enabled', enabled: true, description: 'Dedicated Batch Lounges across all 35 SZMC batches', config: { total_batches: 35 }, updatedAt: new Date().toISOString() }],
  ['official_pages_enabled', { key: 'official_pages_enabled', enabled: true, description: 'Institutional Official Pages inside THE QUAD', config: { official_pages: 6 }, updatedAt: new Date().toISOString() }],
  ['community_polls_enabled', { key: 'community_polls_enabled', enabled: true, description: 'Interactive polls inside community posts', config: {}, updatedAt: new Date().toISOString() }],
  ['content_moderation_queue_enabled', { key: 'content_moderation_queue_enabled', enabled: true, description: 'User reporting, blocking, and moderator review queue', config: {}, updatedAt: new Date().toISOString() }],
]);

const FEATURE_FLAG_KEY_REGEX = /^[a-z0-9_]{2,64}$/;

app.get('/api/feature-flags', rateLimitGuard(120, 60_000), async (_req: Request, res: Response) => {
  try {
    if (isSupabaseServerConfigured) {
      try {
        const { data, error } = await supabaseServer
          .from(SUPABASE_TABLES.APP_FEATURE_FLAGS)
          .select('key, enabled, description, config, updated_at')
          .order('key', { ascending: true });

        if (!error && Array.isArray(data) && data.length > 0) {
          const flags = data.map((row: any) => ({
            key: String(row.key),
            enabled: Boolean(row.enabled),
            description: row.description ?? null,
            config: row.config && typeof row.config === 'object' ? row.config : {},
            updatedAt: row.updated_at || new Date().toISOString(),
          }));
          return res.json({ flags });
        }
      } catch (err) {
        console.warn('Supabase fetch feature flags notice:', err);
      }
    }
    return res.json({ flags: Array.from(memoryFeatureFlags.values()) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to load feature flags' });
  }
});

app.put(
  '/api/admin/feature-flags/:key',
  rateLimitGuard(30, 60_000),
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const cleanKey = String(req.params.key || '').trim().toLowerCase();
      if (!FEATURE_FLAG_KEY_REGEX.test(cleanKey)) {
        return res.status(400).json({ error: 'Invalid feature flag key format (use 2-64 lowercase letters, digits, or underscores).' });
      }
      if (typeof req.body?.enabled !== 'boolean') {
        return res.status(400).json({ error: 'Field "enabled" must be a boolean.' });
      }

      const description =
        typeof req.body.description === 'string'
          ? req.body.description.trim().slice(0, 280)
          : memoryFeatureFlags.get(cleanKey)?.description ?? null;
      const config =
        req.body.config && typeof req.body.config === 'object' && !Array.isArray(req.body.config)
          ? req.body.config
          : memoryFeatureFlags.get(cleanKey)?.config ?? {};
      const nowIso = new Date().toISOString();

      if (isSupabaseServerConfigured) {
        const { error } = await supabaseServer
          .from(SUPABASE_TABLES.APP_FEATURE_FLAGS)
          .upsert(
            {
              key: cleanKey,
              enabled: req.body.enabled,
              description,
              config,
              updated_by: req.dbUser?.id || null,
              updated_at: nowIso,
            },
            { onConflict: 'key' }
          );

        if (error) {
          console.warn('Supabase upsert feature flag notice:', error.message);
        }
      }

      const flag = {
        key: cleanKey,
        enabled: req.body.enabled,
        description,
        config,
        updatedAt: nowIso,
      };
      memoryFeatureFlags.set(cleanKey, flag);

      return res.json({ success: true, flag });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to update feature flag' });
    }
  }
);

// -----------------------------------------------------------------------------
// PHASE 4: CONFIGURABLE FEED RANKING WEIGHTS (THE QUAD — FOR YOU ALGORITHM)
// -----------------------------------------------------------------------------
const memoryFeedRankingWeights = {
  batchRelevanceWeight: 28,
  followedAlumniWeight: 20,
  followedPageWeight: 22,
  engagementLikeWeight: 1.5,
  engagementCommentWeight: 3.0,
  engagementCap: 42,
  recencyMaxBoost: 48,
  recencyDecayPerHour: 0.5,
  featuredBoost: 18,
  updatedAt: new Date().toISOString(),
};

app.get('/api/feed/ranking-weights', rateLimitGuard(120, 60_000), async (_req: Request, res: Response) => {
  try {
    if (isSupabaseServerConfigured) {
      try {
        const { data, error } = await supabaseServer
          .from(SUPABASE_TABLES.FEED_RANKING_WEIGHTS)
          .select('*')
          .eq('id', 1)
          .maybeSingle();

        if (!error && data) {
          return res.json({
            weights: {
              batchRelevanceWeight: Number(data.batch_relevance_weight ?? 28),
              followedAlumniWeight: Number(data.followed_alumni_weight ?? 20),
              followedPageWeight: Number(data.followed_page_weight ?? 22),
              engagementLikeWeight: Number(data.engagement_like_weight ?? 1.5),
              engagementCommentWeight: Number(data.engagement_comment_weight ?? 3.0),
              engagementCap: Number(data.engagement_cap ?? 42),
              recencyMaxBoost: Number(data.recency_max_boost ?? 48),
              recencyDecayPerHour: Number(data.recency_decay_per_hour ?? 0.5),
              featuredBoost: Number(data.featured_boost ?? 18),
              updatedAt: data.updated_at || new Date().toISOString(),
            },
          });
        }
      } catch (err) {
        console.warn('Supabase fetch feed ranking weights notice:', err);
      }
    }
    return res.json({ weights: memoryFeedRankingWeights });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to load feed ranking weights' });
  }
});

app.put(
  '/api/admin/feed/ranking-weights',
  rateLimitGuard(30, 60_000),
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const clampNum = (val: any, min: number, max: number, fallback: number): number => {
        const n = Number(val);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, Math.round(n * 1000) / 1000));
      };

      const next = {
        batchRelevanceWeight: clampNum(req.body?.batchRelevanceWeight, 0, 200, memoryFeedRankingWeights.batchRelevanceWeight),
        followedAlumniWeight: clampNum(req.body?.followedAlumniWeight, 0, 200, memoryFeedRankingWeights.followedAlumniWeight),
        followedPageWeight: clampNum(req.body?.followedPageWeight, 0, 200, memoryFeedRankingWeights.followedPageWeight),
        engagementLikeWeight: clampNum(req.body?.engagementLikeWeight, 0, 50, memoryFeedRankingWeights.engagementLikeWeight),
        engagementCommentWeight: clampNum(req.body?.engagementCommentWeight, 0, 50, memoryFeedRankingWeights.engagementCommentWeight),
        engagementCap: clampNum(req.body?.engagementCap, 0, 300, memoryFeedRankingWeights.engagementCap),
        recencyMaxBoost: clampNum(req.body?.recencyMaxBoost, 0, 300, memoryFeedRankingWeights.recencyMaxBoost),
        recencyDecayPerHour: clampNum(req.body?.recencyDecayPerHour, 0.01, 20, memoryFeedRankingWeights.recencyDecayPerHour),
        featuredBoost: clampNum(req.body?.featuredBoost, 0, 200, memoryFeedRankingWeights.featuredBoost),
        updatedAt: new Date().toISOString(),
      };

      if (isSupabaseServerConfigured) {
        const { error } = await supabaseServer
          .from(SUPABASE_TABLES.FEED_RANKING_WEIGHTS)
          .upsert(
            {
              id: 1,
              batch_relevance_weight: next.batchRelevanceWeight,
              followed_alumni_weight: next.followedAlumniWeight,
              followed_page_weight: next.followedPageWeight,
              engagement_like_weight: next.engagementLikeWeight,
              engagement_comment_weight: next.engagementCommentWeight,
              engagement_cap: next.engagementCap,
              recency_max_boost: next.recencyMaxBoost,
              recency_decay_per_hour: next.recencyDecayPerHour,
              featured_boost: next.featuredBoost,
              updated_by: req.dbUser?.id || null,
              updated_at: next.updatedAt,
            },
            { onConflict: 'id' }
          );
        if (error) {
          console.warn('Supabase upsert feed ranking weights notice:', error.message);
        }
      }

      Object.assign(memoryFeedRankingWeights, next);
      return res.json({ success: true, weights: next });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to update ranking weights' });
    }
  }
);

// -----------------------------------------------------------------------------
// PHASE 6: COMMUNITY SAFETY — CONTENT REPORTS & MODERATION QUEUE
// -----------------------------------------------------------------------------
interface MemoryContentReport {
  id: number;
  reporter_id: number;
  target_type: 'post' | 'comment' | 'profile';
  target_id: number;
  target_author_id: number | null;
  reason: string;
  details: string | null;
  status: 'open' | 'in_review' | 'resolved_removed' | 'resolved_dismissed';
  reviewed_by: number | null;
  resolution_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const memoryContentReports: MemoryContentReport[] = [];
const VALID_REPORT_TARGET_TYPES = new Set(['post', 'comment', 'profile']);
const VALID_REPORT_STATUSES = new Set(['open', 'in_review', 'resolved_removed', 'resolved_dismissed']);

app.post(
  '/api/community/reports',
  rateLimitGuard(20, 60_000),
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const reporterId = Number(req.dbUser?.id || 0);
      if (!reporterId) {
        return res.status(401).json({ error: 'Authenticated alumni profile required to submit a report.' });
      }

      const targetType = String(req.body?.targetType || '').trim().toLowerCase();
      const targetId = Number(req.body?.targetId);
      const targetAuthorId = req.body?.targetAuthorId ? Number(req.body.targetAuthorId) : null;
      const reason = String(req.body?.reason || '').trim().slice(0, 140);
      const details = typeof req.body?.details === 'string' ? req.body.details.trim().slice(0, 1000) : null;

      if (!VALID_REPORT_TARGET_TYPES.has(targetType)) {
        return res.status(400).json({ error: 'Invalid report target type.' });
      }
      if (!Number.isInteger(targetId) || targetId <= 0) {
        return res.status(400).json({ error: 'Invalid report target ID.' });
      }
      if (!reason || reason.length < 3) {
        return res.status(400).json({ error: 'Please select a valid report reason.' });
      }

      const nowIso = new Date().toISOString();
      if (isSupabaseServerConfigured) {
        const { data, error } = await supabaseServer
          .from(SUPABASE_TABLES.CONTENT_REPORTS)
          .insert({
            reporter_id: reporterId,
            target_type: targetType,
            target_id: targetId,
            target_author_id: targetAuthorId && targetAuthorId > 0 ? targetAuthorId : null,
            reason,
            details: details || null,
            status: 'open',
          })
          .select('*')
          .single();

        if (!error && data) {
          return res.status(201).json({ success: true, report: data, source: 'supabase' });
        }
        if (error && (error.code === '23505' || String(error.message || '').includes('uq_content_reports_open'))) {
          return res.status(200).json({
            success: true,
            duplicate: true,
            message: 'You already have an open report for this item.',
            source: 'supabase',
          });
        }
      }

      // Fallback when migration 025 has not been applied remotely yet
      const existing = memoryContentReports.find(
        (r) =>
          r.reporter_id === reporterId &&
          r.target_type === targetType &&
          r.target_id === targetId &&
          r.status === 'open'
      );
      if (existing) {
        return res.status(200).json({
          success: true,
          duplicate: true,
          report: existing,
          source: 'memory',
        });
      }

      const fallbackReport: MemoryContentReport = {
        id: Date.now(),
        reporter_id: reporterId,
        target_type: targetType as 'post' | 'comment' | 'profile',
        target_id: targetId,
        target_author_id: targetAuthorId && targetAuthorId > 0 ? targetAuthorId : null,
        reason,
        details: details || null,
        status: 'open',
        reviewed_by: null,
        resolution_note: null,
        created_at: nowIso,
        reviewed_at: null,
      };
      memoryContentReports.unshift(fallbackReport);
      return res.status(201).json({ success: true, report: fallbackReport, source: 'memory' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to submit content report' });
    }
  }
);

app.get(
  '/api/admin/moderation/reports',
  rateLimitGuard(60, 60_000),
  requireModerator,
  async (req: AuthRequest, res: Response) => {
    try {
      const statusFilter = String(req.query.status || 'all').trim().toLowerCase();
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);

      if (isSupabaseServerConfigured) {
        let query = supabaseServer
          .from(SUPABASE_TABLES.CONTENT_REPORTS)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (statusFilter !== 'all' && VALID_REPORT_STATUSES.has(statusFilter)) {
          query = query.eq('status', statusFilter);
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          const profileIds = Array.from(
            new Set(
              data
                .flatMap((r: any) => [r.reporter_id, r.target_author_id, r.reviewed_by])
                .map((id: any) => Number(id))
                .filter((id: number) => Number.isInteger(id) && id > 0)
            )
          );

          const profileMap = new Map<number, { full_name: string; batch_year: number | null; avatar_url: string | null }>();
          if (profileIds.length > 0) {
            const { data: profiles } = await supabaseServer
              .from(SUPABASE_TABLES.ALUMNI_PROFILES)
              .select('id, full_name, batch_year, avatar_url')
              .in('id', profileIds);
            (profiles || []).forEach((p: any) =>
              profileMap.set(Number(p.id), {
                full_name: p.full_name || 'SZMC Alumnus',
                batch_year: p.batch_year ? Number(p.batch_year) : null,
                avatar_url: p.avatar_url || null,
              })
            );
          }

          const enriched = data.map((r: any) => ({
            ...r,
            reporter: profileMap.get(Number(r.reporter_id)) || null,
            target_author: r.target_author_id ? profileMap.get(Number(r.target_author_id)) || null : null,
            reviewer: r.reviewed_by ? profileMap.get(Number(r.reviewed_by)) || null : null,
          }));

          return res.json({ reports: enriched, source: 'supabase' });
        }
      }

      const filtered =
        statusFilter !== 'all' && VALID_REPORT_STATUSES.has(statusFilter)
          ? memoryContentReports.filter((r) => r.status === statusFilter)
          : memoryContentReports;
      return res.json({ reports: filtered.slice(0, limit), source: 'memory' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to fetch moderation reports' });
    }
  }
);

app.put(
  '/api/admin/moderation/reports/:id',
  rateLimitGuard(30, 60_000),
  requireModerator,
  async (req: AuthRequest, res: Response) => {
    try {
      const reportId = Number(req.params.id);
      if (!Number.isInteger(reportId) || reportId <= 0) {
        return res.status(400).json({ error: 'Invalid report ID.' });
      }

      const nextStatus = String(req.body?.status || '').trim().toLowerCase();
      if (!VALID_REPORT_STATUSES.has(nextStatus) || nextStatus === 'open') {
        return res.status(400).json({
          error: 'Status must be one of: in_review, resolved_removed, resolved_dismissed.',
        });
      }

      const resolutionNote =
        typeof req.body?.resolutionNote === 'string'
          ? req.body.resolutionNote.trim().slice(0, 600)
          : null;
      const removeContent = Boolean(req.body?.removeContent) || nextStatus === 'resolved_removed';
      const reviewerId = Number(req.dbUser?.id || 0) || null;
      const nowIso = new Date().toISOString();

      if (isSupabaseServerConfigured) {
        const { data: updated, error } = await supabaseServer
          .from(SUPABASE_TABLES.CONTENT_REPORTS)
          .update({
            status: nextStatus,
            reviewed_by: reviewerId,
            resolution_note: resolutionNote,
            reviewed_at: nowIso,
          })
          .eq('id', reportId)
          .select('*')
          .maybeSingle();

        if (!error && updated) {
          if (removeContent) {
            if (updated.target_type === 'post') {
              await supabaseServer
                .from(SUPABASE_TABLES.POSTS)
                .update({ is_deleted: true })
                .eq('id', updated.target_id);
            } else if (updated.target_type === 'comment') {
              await supabaseServer
                .from(SUPABASE_TABLES.POST_COMMENTS)
                .update({ is_deleted: true })
                .eq('id', updated.target_id);
            }
          }

          // Notify reporter of resolution (without leaking moderator PII)
          if (updated.reporter_id && updated.reporter_id !== reviewerId && nextStatus.startsWith('resolved_')) {
            try {
              await supabaseServer.from(SUPABASE_TABLES.NOTIFICATIONS).insert({
                recipient_id: updated.reporter_id,
                actor_id: reviewerId,
                type: 'moderation_action',
                title: 'Report Reviewed',
                message:
                  nextStatus === 'resolved_removed'
                    ? 'Thank you for helping keep The Quad safe. Our moderation team reviewed your report and took action.'
                    : 'Our moderation team reviewed your report and closed it after review.',
                target_route: 'feed',
                unread: true,
              });
            } catch {}
          }

          return res.json({ success: true, report: updated, contentRemoved: removeContent, source: 'supabase' });
        }
      }

      const idx = memoryContentReports.findIndex((r) => r.id === reportId);
      if (idx === -1) {
        return res.status(404).json({ error: 'Report not found.' });
      }
      memoryContentReports[idx] = {
        ...memoryContentReports[idx],
        status: nextStatus as MemoryContentReport['status'],
        reviewed_by: reviewerId,
        resolution_note: resolutionNote,
        reviewed_at: nowIso,
      };
      return res.json({
        success: true,
        report: memoryContentReports[idx],
        contentRemoved: removeContent,
        source: 'memory',
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to update moderation report' });
    }
  }
);

// -----------------------------------------------------------------------------
// PHASE 7: ADMIN COMMUNITY MANAGEMENT (BATCH MODERATORS, OFFICIAL PAGES, OVERVIEW)
// -----------------------------------------------------------------------------
interface MemoryBatchModerator {
  id: number;
  batch_year: number;
  profile_id: number;
  role: 'coordinator' | 'moderator';
  created_at: string;
  profile?: { id: number; full_name: string; email?: string | null; batch_year?: number | null; avatar_url?: string | null };
}

interface MemoryOfficialPageRole {
  id: number;
  page_id: number;
  profile_id: number;
  role: 'admin' | 'editor';
  created_at: string;
  profile?: { id: number; full_name: string; email?: string | null; batch_year?: number | null; avatar_url?: string | null };
}

interface MemoryOfficialPage {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  is_verified: boolean;
  is_active: boolean;
  followers_count: number;
  posts_count: number;
}

const memoryBatchModerators: MemoryBatchModerator[] = [];
const memoryOfficialPageRoles: MemoryOfficialPageRole[] = [];
const memoryOfficialPages: MemoryOfficialPage[] = [
  { id: 1, slug: 'szmc-official', name: 'SZMC Official', tagline: 'Shaheed Ziaur Rahman Medical College Institutional Desk', description: 'Official institutional announcements, academic milestones, and campus updates from SZMC Bogura.', category: 'Announcement', is_verified: true, is_active: true, followers_count: 0, posts_count: 0 },
  { id: 2, slug: 'alumni-association', name: 'Alumni Association', tagline: 'SZMC Alumni Association Secretariat', description: 'Official updates, annual general meetings, membership initiatives, and global alumni news.', category: 'Announcement', is_verified: true, is_active: true, followers_count: 0, posts_count: 0 },
  { id: 3, slug: 'executive-committee', name: 'Executive Committee', tagline: 'Governance & Elected Leadership Updates', description: 'Resolutions, policy briefings, and executive committee notices for all MBBS batches.', category: 'Announcement', is_verified: true, is_active: true, followers_count: 0, posts_count: 0 },
  { id: 4, slug: 'blood-donation-network', name: 'Blood Donation Network', tagline: 'Emergency Blood Lifeline & Donor Coordination', description: 'Urgent blood donor mobilization, verified emergency requests, and donor drives.', category: 'Blood Request', is_verified: true, is_active: true, followers_count: 0, posts_count: 0 },
  { id: 5, slug: 'career-mentorship', name: 'Career & Mentorship', tagline: 'Residency, Fellowship & Clinical Career Guidance', description: 'FCPS, MD/MS, USMLE, PLAB/MRCP mentorship, medical fellowships, and clinical job opportunities.', category: 'Career & Jobs', is_verified: true, is_active: true, followers_count: 0, posts_count: 0 },
  { id: 6, slug: 'alumni-events', name: 'Alumni Events', tagline: 'Reunions, Scientific Seminars & Batch Gatherings', description: 'Official reunion calendars, Silver Jubilee celebrations, CME conferences, and chapter meetups.', category: 'Events & Reunion', is_verified: true, is_active: true, followers_count: 0, posts_count: 0 },
];

app.get(
  '/api/admin/community/overview',
  rateLimitGuard(60, 60_000),
  requireModerator,
  async (_req: AuthRequest, res: Response) => {
    try {
      let openReportsCount = memoryContentReports.filter((r) => r.status === 'open' || r.status === 'in_review').length;
      let totalReportsCount = memoryContentReports.length;
      let batchModerators: any[] = [...memoryBatchModerators];
      let officialPages: any[] = memoryOfficialPages.map((p) => ({
        ...p,
        roles: memoryOfficialPageRoles.filter((r) => r.page_id === p.id),
      }));
      let featureFlags: any[] = Array.from(memoryFeatureFlags.values());
      let rankingWeights: any = { ...memoryFeedRankingWeights };

      if (isSupabaseServerConfigured) {
        const [reportsRes, batchModsRes, pagesRes, pageRolesRes, flagsRes, weightsRes] = await Promise.all([
          supabaseServer.from(SUPABASE_TABLES.CONTENT_REPORTS).select('id, status'),
          supabaseServer
            .from(SUPABASE_TABLES.BATCH_LOUNGE_MODERATORS)
            .select('id, batch_year, profile_id, role, created_at')
            .order('batch_year', { ascending: true }),
          supabaseServer
            .from(SUPABASE_TABLES.OFFICIAL_PAGES)
            .select('id, slug, name, tagline, description, category, is_verified, is_active, followers_count, posts_count')
            .order('id', { ascending: true }),
          supabaseServer
            .from(SUPABASE_TABLES.OFFICIAL_PAGE_ROLES)
            .select('id, page_id, profile_id, role, created_at')
            .order('created_at', { ascending: false }),
          supabaseServer.from(SUPABASE_TABLES.APP_FEATURE_FLAGS).select('*').order('key', { ascending: true }),
          supabaseServer.from(SUPABASE_TABLES.FEED_RANKING_WEIGHTS).select('*').eq('id', 1).maybeSingle(),
        ]);

        if (!reportsRes.error && Array.isArray(reportsRes.data)) {
          totalReportsCount = reportsRes.data.length;
          openReportsCount = reportsRes.data.filter(
            (r: any) => r.status === 'open' || r.status === 'in_review'
          ).length;
        }

        const profileIds = new Set<number>();
        if (!batchModsRes.error && Array.isArray(batchModsRes.data)) {
          batchModsRes.data.forEach((m: any) => {
            if (m.profile_id) profileIds.add(Number(m.profile_id));
          });
        }
        if (!pageRolesRes.error && Array.isArray(pageRolesRes.data)) {
          pageRolesRes.data.forEach((r: any) => {
            if (r.profile_id) profileIds.add(Number(r.profile_id));
          });
        }

        const profileMap = new Map<number, any>();
        if (profileIds.size > 0) {
          const { data: profiles } = await supabaseServer
            .from(SUPABASE_TABLES.ALUMNI_PROFILES)
            .select('id, full_name, email, batch_year, avatar_url')
            .in('id', Array.from(profileIds));
          (profiles || []).forEach((p: any) => profileMap.set(Number(p.id), p));
        }

        if (!batchModsRes.error && Array.isArray(batchModsRes.data)) {
          batchModerators = batchModsRes.data.map((m: any) => ({
            ...m,
            profile: profileMap.get(Number(m.profile_id)) || null,
          }));
        }

        const rolesByPage = new Map<number, any[]>();
        if (!pageRolesRes.error && Array.isArray(pageRolesRes.data)) {
          for (const r of pageRolesRes.data as any[]) {
            const pid = Number(r.page_id);
            const list = rolesByPage.get(pid) || [];
            list.push({ ...r, profile: profileMap.get(Number(r.profile_id)) || null });
            rolesByPage.set(pid, list);
          }
        }

        if (!pagesRes.error && Array.isArray(pagesRes.data) && pagesRes.data.length > 0) {
          officialPages = pagesRes.data.map((p: any) => ({
            ...p,
            roles: rolesByPage.get(Number(p.id)) || [],
          }));
        }

        if (!flagsRes.error && Array.isArray(flagsRes.data) && flagsRes.data.length > 0) {
          featureFlags = flagsRes.data.map((f: any) => ({
            key: f.key,
            enabled: Boolean(f.enabled),
            description: f.description || null,
            config: f.config || {},
            updatedAt: f.updated_at || new Date().toISOString(),
          }));
        }

        if (!weightsRes.error && weightsRes.data) {
          const d: any = weightsRes.data;
          rankingWeights = {
            batchRelevanceWeight: Number(d.batch_relevance_weight ?? 28),
            followedAlumniWeight: Number(d.followed_alumni_weight ?? 20),
            followedPageWeight: Number(d.followed_page_weight ?? 22),
            engagementLikeWeight: Number(d.engagement_like_weight ?? 1.5),
            engagementCommentWeight: Number(d.engagement_comment_weight ?? 3.0),
            engagementCap: Number(d.engagement_cap ?? 42),
            recencyMaxBoost: Number(d.recency_max_boost ?? 48),
            recencyDecayPerHour: Number(d.recency_decay_per_hour ?? 0.5),
            featuredBoost: Number(d.featured_boost ?? 18),
            updatedAt: d.updated_at || new Date().toISOString(),
          };
        }
      }

      return res.json({
        metrics: {
          openReportsCount,
          totalReportsCount,
          batchLoungesCount: 35,
          batchModeratorsCount: batchModerators.length,
          officialPagesCount: officialPages.length,
          activeFlagsCount: featureFlags.filter((f) => f.enabled).length,
          totalFlagsCount: featureFlags.length,
        },
        batchModerators,
        officialPages,
        featureFlags,
        rankingWeights,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to load community overview' });
    }
  }
);

app.get(
  '/api/admin/community/alumni-search',
  rateLimitGuard(60, 60_000),
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const q = String(req.query.q || '').trim().replace(/[%_,]/g, '');
      if (q.length < 2) {
        return res.json({ alumni: [] });
      }
      if (!isSupabaseServerConfigured) {
        return res.json({ alumni: [] });
      }

      const { data, error } = await supabaseServer
        .from(SUPABASE_TABLES.ALUMNI_PROFILES)
        .select('id, full_name, email, batch_year, avatar_url, role')
        .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(10);

      if (error) {
        return res.status(500).json({ error: error.message || 'Search failed' });
      }
      return res.json({ alumni: data || [] });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Alumni search failed' });
    }
  }
);

app.post(
  '/api/admin/community/batch-moderators',
  rateLimitGuard(30, 60_000),
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const batchYear = Number(req.body?.batchYear);
      const profileId = Number(req.body?.profileId);
      const role = String(req.body?.role || 'moderator').trim().toLowerCase();

      if (!Number.isInteger(batchYear) || batchYear < 1 || batchYear > 35) {
        return res.status(400).json({ error: 'Batch year must be an integer between 1 and 35.' });
      }
      if (!Number.isInteger(profileId) || profileId <= 0) {
        return res.status(400).json({ error: 'A valid alumni profile ID is required.' });
      }
      if (role !== 'moderator' && role !== 'coordinator') {
        return res.status(400).json({ error: 'Role must be "moderator" or "coordinator".' });
      }

      const assignedBy = Number(req.dbUser?.id || 0) || null;
      let profileMeta: any = null;

      if (isSupabaseServerConfigured) {
        const { data: prof } = await supabaseServer
          .from(SUPABASE_TABLES.ALUMNI_PROFILES)
          .select('id, full_name, email, batch_year, avatar_url')
          .eq('id', profileId)
          .maybeSingle();
        profileMeta = prof || null;

        const { data, error } = await supabaseServer
          .from(SUPABASE_TABLES.BATCH_LOUNGE_MODERATORS)
          .upsert(
            {
              batch_year: batchYear,
              profile_id: profileId,
              role,
              assigned_by: assignedBy,
            },
            { onConflict: 'batch_year,profile_id' }
          )
          .select('*')
          .single();

        if (!error && data) {
          return res.status(201).json({
            success: true,
            assignment: { ...data, profile: profileMeta },
            source: 'supabase',
          });
        }
      }

      const existingIdx = memoryBatchModerators.findIndex(
        (m) => m.batch_year === batchYear && m.profile_id === profileId
      );
      const entry: MemoryBatchModerator = {
        id: existingIdx >= 0 ? memoryBatchModerators[existingIdx].id : Date.now(),
        batch_year: batchYear,
        profile_id: profileId,
        role: role as 'coordinator' | 'moderator',
        created_at: new Date().toISOString(),
        profile: profileMeta || { id: profileId, full_name: `Alumnus #${profileId}`, batch_year: batchYear },
      };
      if (existingIdx >= 0) memoryBatchModerators[existingIdx] = entry;
      else memoryBatchModerators.unshift(entry);
      return res.status(201).json({ success: true, assignment: entry, source: 'memory' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to assign batch moderator' });
    }
  }
);

app.delete(
  '/api/admin/community/batch-moderators/:batchYear/:profileId',
  rateLimitGuard(30, 60_000),
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const batchYear = Number(req.params.batchYear);
      const profileId = Number(req.params.profileId);
      if (!Number.isInteger(batchYear) || !Number.isInteger(profileId)) {
        return res.status(400).json({ error: 'Invalid batch year or profile ID.' });
      }

      if (isSupabaseServerConfigured) {
        const { error } = await supabaseServer
          .from(SUPABASE_TABLES.BATCH_LOUNGE_MODERATORS)
          .delete()
          .eq('batch_year', batchYear)
          .eq('profile_id', profileId);
        if (!error) {
          return res.json({ success: true, source: 'supabase' });
        }
      }

      const idx = memoryBatchModerators.findIndex(
        (m) => m.batch_year === batchYear && m.profile_id === profileId
      );
      if (idx >= 0) memoryBatchModerators.splice(idx, 1);
      return res.json({ success: true, source: 'memory' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to remove batch moderator' });
    }
  }
);

app.post(
  '/api/admin/community/official-pages/:pageId/roles',
  rateLimitGuard(30, 60_000),
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const pageId = Number(req.params.pageId);
      const profileId = Number(req.body?.profileId);
      const role = String(req.body?.role || 'editor').trim().toLowerCase();

      if (!Number.isInteger(pageId) || pageId <= 0 || !Number.isInteger(profileId) || profileId <= 0) {
        return res.status(400).json({ error: 'Valid page ID and alumni profile ID are required.' });
      }
      if (role !== 'admin' && role !== 'editor') {
        return res.status(400).json({ error: 'Role must be "admin" or "editor".' });
      }

      const assignedBy = Number(req.dbUser?.id || 0) || null;
      let profileMeta: any = null;

      if (isSupabaseServerConfigured) {
        const { data: prof } = await supabaseServer
          .from(SUPABASE_TABLES.ALUMNI_PROFILES)
          .select('id, full_name, email, batch_year, avatar_url')
          .eq('id', profileId)
          .maybeSingle();
        profileMeta = prof || null;

        const { data, error } = await supabaseServer
          .from(SUPABASE_TABLES.OFFICIAL_PAGE_ROLES)
          .upsert(
            {
              page_id: pageId,
              profile_id: profileId,
              role,
              assigned_by: assignedBy,
            },
            { onConflict: 'page_id,profile_id' }
          )
          .select('*')
          .single();

        if (!error && data) {
          return res.status(201).json({
            success: true,
            assignment: { ...data, profile: profileMeta },
            source: 'supabase',
          });
        }
      }

      const existingIdx = memoryOfficialPageRoles.findIndex(
        (r) => r.page_id === pageId && r.profile_id === profileId
      );
      const entry: MemoryOfficialPageRole = {
        id: existingIdx >= 0 ? memoryOfficialPageRoles[existingIdx].id : Date.now(),
        page_id: pageId,
        profile_id: profileId,
        role: role as 'admin' | 'editor',
        created_at: new Date().toISOString(),
        profile: profileMeta || { id: profileId, full_name: `Alumnus #${profileId}` },
      };
      if (existingIdx >= 0) memoryOfficialPageRoles[existingIdx] = entry;
      else memoryOfficialPageRoles.unshift(entry);
      return res.status(201).json({ success: true, assignment: entry, source: 'memory' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to assign official page role' });
    }
  }
);

app.delete(
  '/api/admin/community/official-pages/:pageId/roles/:profileId',
  rateLimitGuard(30, 60_000),
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const pageId = Number(req.params.pageId);
      const profileId = Number(req.params.profileId);
      if (!Number.isInteger(pageId) || !Number.isInteger(profileId)) {
        return res.status(400).json({ error: 'Invalid page ID or profile ID.' });
      }

      if (isSupabaseServerConfigured) {
        const { error } = await supabaseServer
          .from(SUPABASE_TABLES.OFFICIAL_PAGE_ROLES)
          .delete()
          .eq('page_id', pageId)
          .eq('profile_id', profileId);
        if (!error) {
          return res.json({ success: true, source: 'supabase' });
        }
      }

      const idx = memoryOfficialPageRoles.findIndex(
        (r) => r.page_id === pageId && r.profile_id === profileId
      );
      if (idx >= 0) memoryOfficialPageRoles.splice(idx, 1);
      return res.json({ success: true, source: 'memory' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to remove official page role' });
    }
  }
);

app.put(
  '/api/admin/community/official-pages/:pageId',
  rateLimitGuard(30, 60_000),
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const pageId = Number(req.params.pageId);
      if (!Number.isInteger(pageId) || pageId <= 0) {
        return res.status(400).json({ error: 'Invalid official page ID.' });
      }

      const patch: Record<string, any> = { updated_at: new Date().toISOString() };
      if (typeof req.body?.isVerified === 'boolean') patch.is_verified = req.body.isVerified;
      if (typeof req.body?.isActive === 'boolean') patch.is_active = req.body.isActive;
      if (typeof req.body?.description === 'string') patch.description = req.body.description.trim().slice(0, 600);
      if (typeof req.body?.tagline === 'string') patch.tagline = req.body.tagline.trim().slice(0, 180);

      if (isSupabaseServerConfigured) {
        const { data, error } = await supabaseServer
          .from(SUPABASE_TABLES.OFFICIAL_PAGES)
          .update(patch)
          .eq('id', pageId)
          .select('*')
          .maybeSingle();
        if (!error && data) {
          return res.json({ success: true, page: data, source: 'supabase' });
        }
      }

      const page = memoryOfficialPages.find((p) => p.id === pageId);
      if (!page) return res.status(404).json({ error: 'Official page not found.' });
      if (typeof patch.is_verified === 'boolean') page.is_verified = patch.is_verified;
      if (typeof patch.is_active === 'boolean') page.is_active = patch.is_active;
      if (typeof patch.description === 'string') page.description = patch.description;
      if (typeof patch.tagline === 'string') page.tagline = patch.tagline;
      return res.json({ success: true, page, source: 'memory' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to update official page' });
    }
  }
);

// Paginated 100k-scale Alumni Directory Query (with PII redaction guard)
app.get(
  '/api/alumni',
  rateLimitGuard(90, 60_000),
  optionalAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const isAdminView =
        req.query.adminView === 'true' &&
        (req.dbUser?.role === 'admin' || req.dbUser?.role === 'super_admin');

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
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user as any;
      const isAdminCaller = req.dbUser?.role === 'admin' || req.dbUser?.role === 'super_admin';
      const created = await createOrRegisterAlumniProfile({
        userUid: isAdminCaller ? (req.body.userUid || user?.uid || user?.id) : (user?.uid || user?.id),
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
        email: isAdminCaller ? req.body.email : (user?.email || req.dbUser?.email || req.body.email),
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

// Update own Alumnus Profile in Database & Memory (with strict auth + ownership + privilege sanitization)
app.post(
  '/api/profile/update',
  rateLimitGuard(40, 60_000),
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user as any;
      const isAdminCaller = req.dbUser?.role === 'admin' || req.dbUser?.role === 'super_admin';
      const callerEmail = user?.email || req.dbUser?.email;
      let targetProfileId = Number(req.dbUser?.id || 0);

      if (isAdminCaller && req.body.id && Number(req.body.id) > 0) {
        targetProfileId = Number(req.body.id);
      } else if (!targetProfileId && callerEmail) {
        const found = await findAlumniByCredential(callerEmail);
        if (found) targetProfileId = found.id;
      }

      if (!targetProfileId) {
        return res.status(400).json({ error: 'Could not identify target profile to update.' });
      }

      if (!isAdminCaller && req.body.id && Number(req.body.id) !== targetProfileId) {
        return res.status(403).json({ error: 'Forbidden: You can only update your own profile.' });
      }

      const updates: Record<string, any> = {};
      if (req.body.fullName) updates.fullName = req.body.fullName;
      if (req.body.avatarUrl) updates.avatarUrl = req.body.avatarUrl;
      if (req.body.coverUrl) updates.coverUrl = req.body.coverUrl;
      if (req.body.batchYear) updates.batchYear = Number(req.body.batchYear);
      if (req.body.collegeRoll) updates.collegeRoll = req.body.collegeRoll;
      if (req.body.profession) updates.profession = req.body.profession;
      if (req.body.position) updates.position = req.body.position;
      if (req.body.institution) updates.institution = req.body.institution;
      if (req.body.cadre) updates.cadre = req.body.cadre;
      if (req.body.city) updates.city = req.body.city;
      if (req.body.country) updates.country = req.body.country;
      if (req.body.bio) updates.bio = req.body.bio;
      if (req.body.whatsapp) updates.whatsapp = req.body.whatsapp;
      if (req.body.fbLink) updates.fbLink = req.body.fbLink;
      if (req.body.phone) updates.phone = req.body.phone;
      if (req.body.email) updates.email = req.body.email;
      if (req.body.careerHistory) updates.careerHistory = req.body.careerHistory;
      if (req.body.degree) updates.degree = req.body.degree;
      if (req.body.specialty) updates.specialty = req.body.specialty;
      if (req.body.specialtyOther) updates.specialtyOther = req.body.specialtyOther;
      if (req.body.bloodGroup) updates.bloodGroup = req.body.bloodGroup;
      if (req.body.isPublic !== undefined) updates.isPublic = req.body.isPublic;

      // Note: role, verificationStatus, badges are strictly ignored to prevent client privilege escalation
      const updated = await updateAlumniProfileRecord(targetProfileId, updates);
      return res.json({ success: true, profile: updated });
    } catch (error: any) {
      console.error('Failed to update profile on server:', error);
      return res.status(400).json({ error: error.message || 'Failed to update profile' });
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

      // Strict privilege boundary: only super_admin can assign or elevate to admin/super_admin
      if (
        (req.body.role === 'admin' || req.body.role === 'super_admin') &&
        actor.role !== 'super_admin'
      ) {
        return res.status(403).json({
          error: 'Forbidden: Only Super Administrators can assign admin or super_admin roles.',
        });
      }

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

// Moderation & Admin: Verification Submissions Queue
app.get(
  '/api/admin/verifications',
  rateLimitGuard(60, 60_000),
  requireModerator,
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

// Moderation & Admin: Approve or Reject Document Verification
app.post(
  '/api/admin/verifications/:id/review',
  rateLimitGuard(40, 60_000),
  requireModerator,
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

// Moderation & Admin: Blood Emergency Moderation
app.get(
  '/api/admin/blood-requests',
  rateLimitGuard(60, 60_000),
  requireModerator,
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
  requireModerator,
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

// Moderation & Admin: Official Notices
app.get(
  '/api/admin/notices',
  rateLimitGuard(60, 60_000),
  requireModerator,
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
  requireModerator,
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

// Super Admin ONLY: Bulk 100k-Scale Cohort Seeder / Stress-Test Importer
app.post(
  '/api/admin/bulk-cohort',
  rateLimitGuard(10, 60_000),
  requireSuperAdmin,
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

// Super Admin ONLY: Full Database Snapshot Export (JSON Backup)
app.get(
  '/api/admin/export-full-backup',
  rateLimitGuard(15, 60_000),
  requireSuperAdmin,
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

// Super Admin ONLY download route for the production deployment dist archive
app.get([
  '/download/szmc-alumni-dist.zip',
  '/szmc-alumni-dist.zip',
  '/download/dist.zip',
  '/dist.zip',
  '/api/download-dist',
  '/download-dist',
], requireSuperAdmin, (_req: AuthRequest, res: Response) => {
  const candidates = [
    path.resolve(__dirname, 'public', 'szmc-alumni-dist.zip'),
    path.resolve(__dirname, 'szmc-alumni-dist.zip'),
    path.resolve(__dirname, 'public', 'dist.zip'),
    path.resolve(__dirname, 'dist.zip'),
    path.resolve(__dirname, 'public', 'szmc-alumni-dist.tar.gz'),
    path.resolve(__dirname, 'szmc-alumni-dist.tar.gz'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      return res.download(c, 'szmc-alumni-portal-dist.zip');
    }
  }
  return res.status(404).send('Production dist archive not found. Please build first.');
});

app.get(['/download/szmc-alumni-dist.tar.gz', '/szmc-alumni-dist.tar.gz'], requireSuperAdmin, (_req: AuthRequest, res: Response) => {
  const candidates = [
    path.resolve(__dirname, 'public', 'szmc-alumni-dist.tar.gz'),
    path.resolve(__dirname, 'szmc-alumni-dist.tar.gz'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      return res.download(c, 'szmc-alumni-dist.tar.gz');
    }
  }
  return res.status(404).send('Production dist tar.gz archive not found.');
});

// Persistent Video Upload Route (authenticated + strict video extension allowlist + 50MB limit)
const ALLOWED_VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'ogg']);
app.post(
  '/api/upload-video',
  rateLimitGuard(20, 60_000),
  requireAuth,
  express.raw({ type: ['video/*', 'application/octet-stream'], limit: '50mb' }),
  async (req: AuthRequest, res: Response) => {
    try {
      const rawExt = String(req.headers['x-file-ext'] || 'mp4')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
      const extHeader = ALLOWED_VIDEO_EXTENSIONS.has(rawExt) ? rawExt : 'mp4';
      const userIdHeader = String(req.dbUser?.id || 'alumni').replace(/[^a-zA-Z0-9_-]/g, '');
      const fileName = `video_${userIdHeader}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${extHeader}`;

      let buffer: Buffer | null = null;
      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        buffer = req.body;
      } else if (req.body && typeof req.body.dataUrl === 'string') {
        const base64Part = req.body.dataUrl.split(',')[1];
        if (base64Part) {
          buffer = Buffer.from(base64Part, 'base64');
        }
      }

      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ error: 'Empty video payload' });
      }

      const contentType =
        extHeader === 'webm'
          ? 'video/webm'
          : extHeader === 'mov'
          ? 'video/quicktime'
          : extHeader === 'ogg'
          ? 'video/ogg'
          : 'video/mp4';

      if (isSupabaseServerConfigured) {
        try {
          const storagePath = `videos/${fileName}`;
          const { error: upErr } = await supabaseServer.storage
            .from('post-media')
            .upload(storagePath, buffer, {
              contentType,
              cacheControl: '3600',
              upsert: true,
            });
          if (!upErr) {
            const { data: pubData } = supabaseServer.storage.from('post-media').getPublicUrl(storagePath);
            if (pubData?.publicUrl) {
              return res.json({ url: pubData.publicUrl });
            }
          }
        } catch (supaErr) {
          console.warn('[Server] Supabase storage video upload fallback:', supaErr);
        }
      }

      const uploadsDir = path.resolve(__dirname, 'public', 'uploads', 'videos');
      if (!existsSync(uploadsDir)) {
        const { mkdirSync } = await import('fs');
        mkdirSync(uploadsDir, { recursive: true });
      }

      const filePath = path.join(uploadsDir, fileName);
      writeFileSync(filePath, buffer);

      return res.json({
        url: `/uploads/videos/${fileName}`,
      });
    } catch (err: any) {
      console.error('[Server] Video upload error:', err?.message || err);
      return res.status(500).json({ error: err?.message || 'Failed to store video' });
    }
  }
);


// ---------------------------------------------------------------------------
// VITE DEV SERVER / STATIC ASSET SERVING
// ---------------------------------------------------------------------------
async function startServer() {
  const httpServer = createHttpServer(app);

  httpServer.on('error', (err) => {
    console.error('[Server] HTTP Server socket error:', err.message);
  });

  // Hydrate site settings and Hall of Fame from Supabase on boot
  try {
    await hydrateServerSiteConfigFromSupabase();
    console.log('[Server] Successfully hydrated site configuration and Hall of Fame from Supabase.');
  } catch (hydErr: any) {
    console.warn('[Server] Notice during initial Supabase site config hydration:', hydErr?.message || hydErr);
  }

  // Serve static assets from public directory (images, fonts, favicons, logos) with browser caching
  const publicPath = path.resolve(__dirname, 'public');
  app.use(express.static(publicPath, {
    maxAge: '7d',
    etag: true,
  }));

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: false,
        watch: null,
      },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.use('*', async (req: Request, res: Response, next: NextFunction) => {
      if (req.originalUrl.startsWith('/api/')) {
        return res.status(404).json({ error: 'Endpoint not found' });
      }
      // If a missing static asset with an extension was requested, return 404 instead of serving HTML
      const cleanPath = req.originalUrl.split('?')[0];
      if (path.extname(cleanPath) && !cleanPath.endsWith('.html')) {
        return res.status(404).type('text/plain').send('File not found');
      }
      const url = req.originalUrl;
      try {
        let template = await readFile(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 
          'Content-Type': 'text/html',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath, {
      maxAge: '1y',
      etag: true,
      immutable: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      }
    }));
    app.get('*', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Express global error handler to prevent unhandled middleware exceptions from crashing the server
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Server] Express error handler:', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message || 'Internal Server Error' });
    }
  });

  if (typeof PORT === 'number') {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`SZMC Alumni Server running on http://0.0.0.0:${PORT}`);
    });
  } else {
    httpServer.listen(PORT, () => {
      console.log(`SZMC Alumni Server running on cPanel socket ${PORT}`);
    });
  }
}

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
});

