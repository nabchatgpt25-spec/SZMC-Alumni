import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import {
  supabaseServer,
  isSupabaseServerConfigured,
  isSupabaseServiceRoleConfigured,
  getSupabaseWriteClient,
  SUPABASE_TABLES,
} from '../lib/supabase-server.ts';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export type CanonicalUserRole =
  | 'member'
  | 'batch_representative'
  | 'moderator'
  | 'admin'
  | 'super_admin';

export interface RolePermissions {
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isModerator: boolean;
  canAccessAdminPortal: boolean;
  canModerateContent: boolean;
  canManageUsers: boolean;
  canManageSettings: boolean;
  canAssignAdminRoles: boolean;
  canAccessTelemetry: boolean;
  canExportBackups: boolean;
}

export interface AuthRequest extends Request {
  user?: SupabaseUser | any;
  supabaseUser?: SupabaseUser;
  supabaseAccessToken?: string;
  dbUser?: {
    id: number;
    uid: string;
    email: string;
    fullName: string;
    role: CanonicalUserRole;
    accountStatus: string;
    auth_user_id?: string;
  };
}

const envSuperAdminEmails = (process.env.SUPER_ADMIN_EMAILS || process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const SUPER_ADMIN_EMAILS = Array.from(
  new Set([
    'admin@szmcalumni.net',
    'nabchatgpt25@gmail.com',
    'firstaidnetworkbd@gmail.com',
    'support@szmcalumni.net',
    'nurulanambashir25@gmail.com',
    'nurulanambashir20@gmail.com',
    ...envSuperAdminEmails,
  ])
);

// Cryptographically strong random per-process fallback secret if ADMIN_SESSION_SECRET is unset
export const ADMIN_SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET?.trim() ||
  crypto.randomBytes(32).toString('hex');

const ADMIN_TOKEN_PREFIX = 'szmc-admin-session:';
const MEMBER_TOKEN_PREFIX = 'szmc-member-session:';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return SUPER_ADMIN_EMAILS.some((e) => e.toLowerCase() === clean);
}

export function normalizeRole(rawRole?: string | null, email?: string | null): CanonicalUserRole {
  const clean = (rawRole || '').trim().toLowerCase();
  if (clean === 'super_admin' || isSuperAdminEmail(email)) return 'super_admin';
  if (clean === 'admin') return 'admin';
  if (clean === 'moderator') return 'moderator';
  if (clean === 'batch_representative') return 'batch_representative';
  return 'member';
}

export function getRolePermissions(role: CanonicalUserRole): RolePermissions {
  const isSuperAdmin = role === 'super_admin';
  const isAdmin = isSuperAdmin || role === 'admin';
  const isModerator = isAdmin || role === 'moderator';
  return {
    isSuperAdmin,
    isAdmin,
    isModerator,
    canAccessAdminPortal: isModerator,
    canModerateContent: isModerator,
    canManageUsers: isAdmin,
    canManageSettings: isAdmin,
    canAssignAdminRoles: isSuperAdmin,
    canAccessTelemetry: isSuperAdmin,
    canExportBackups: isSuperAdmin,
  };
}

function signPayload(prefix: string, payloadObj: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payloadObj), 'utf-8').toString('base64url');
  const hmac = crypto
    .createHmac('sha256', ADMIN_SESSION_SECRET)
    .update(`${prefix}${encoded}`)
    .digest('hex');
  return `${prefix}${encoded}:${hmac}`;
}

function verifySignedPayload<T>(
  token: string,
  expectedPrefix: string
): { valid: boolean; payload?: T } {
  if (!token || !token.startsWith(expectedPrefix)) return { valid: false };
  const rest = token.slice(expectedPrefix.length);
  const sepIdx = rest.lastIndexOf(':');
  if (sepIdx <= 0) return { valid: false };

  const encoded = rest.slice(0, sepIdx);
  const providedHmac = rest.slice(sepIdx + 1);

  try {
    const expectedHmac = crypto
      .createHmac('sha256', ADMIN_SESSION_SECRET)
      .update(`${expectedPrefix}${encoded}`)
      .digest('hex');
    const providedBuf = Buffer.from(providedHmac, 'utf-8');
    const expectedBuf = Buffer.from(expectedHmac, 'utf-8');
    if (
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      return { valid: false };
    }

    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as T & {
      iat?: number;
    };
    const ageMs = Date.now() - Number(parsed?.iat);
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > SESSION_MAX_AGE_MS) {
      return { valid: false };
    }
    return { valid: true, payload: parsed };
  } catch {
    return { valid: false };
  }
}

interface AdminTokenPayload {
  email: string;
  role: 'admin' | 'super_admin';
  userId: number;
  uid: string;
  fullName: string;
  iat: number;
}

interface MemberTokenPayload {
  email: string;
  role: 'member';
  userId: number;
  uid: string;
  fullName: string;
  iat: number;
}

/**
 * Signs an HMAC administrative session token strictly for verified 'admin' or 'super_admin' actors.
 * Rejects any attempt to sign a 'super_admin' token for a non-allowlisted email.
 */
export function signAdminToken(
  email: string,
  role: 'admin' | 'super_admin' = 'admin',
  meta?: { userId?: number; uid?: string; fullName?: string }
): string {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) {
    throw new Error('Cannot sign admin token without a valid administrator email.');
  }
  if (role === 'super_admin' && !isSuperAdminEmail(cleanEmail)) {
    throw new Error('Cannot issue super_admin session for a non-super-admin email.');
  }
  const effectiveRole: 'admin' | 'super_admin' = isSuperAdminEmail(cleanEmail)
    ? 'super_admin'
    : 'admin';

  const payload: AdminTokenPayload = {
    email: cleanEmail,
    role: effectiveRole,
    userId: Number(meta?.userId ?? 0),
    uid: meta?.uid || `admin:${cleanEmail}`,
    fullName: meta?.fullName || 'SZMC Administrator',
    iat: Date.now(),
  };
  return signPayload(ADMIN_TOKEN_PREFIX, payload as unknown as Record<string, unknown>);
}

/**
 * Signs a strictly scoped member session token for non-privileged fallback logins.
 * Member tokens can NEVER grant moderator, admin, or super_admin access.
 */
export function signMemberSessionToken(params: {
  email: string;
  userId: number;
  uid?: string;
  fullName?: string;
}): string {
  const cleanEmail = params.email.toLowerCase().trim();
  const payload: MemberTokenPayload = {
    email: cleanEmail,
    role: 'member',
    userId: Number(params.userId),
    uid: params.uid || `member:${params.userId}`,
    fullName: params.fullName || 'SZMC Alumnus',
    iat: Date.now(),
  };
  return signPayload(MEMBER_TOKEN_PREFIX, payload as unknown as Record<string, unknown>);
}

export function verifyAdminToken(token: string): {
  valid: boolean;
  email?: string;
  role?: 'admin' | 'super_admin';
  userId?: number;
  uid?: string;
  fullName?: string;
} {
  const result = verifySignedPayload<AdminTokenPayload>(token, ADMIN_TOKEN_PREFIX);
  if (!result.valid || !result.payload?.email) {
    return { valid: false };
  }
  const cleanEmail = result.payload.email.toLowerCase().trim();
  if (result.payload.role !== 'admin' && result.payload.role !== 'super_admin') {
    return { valid: false };
  }
  if (result.payload.role === 'super_admin' && !isSuperAdminEmail(cleanEmail)) {
    return { valid: false };
  }
  return {
    valid: true,
    email: cleanEmail,
    role: result.payload.role,
    userId: Number(result.payload.userId || 1),
    uid: result.payload.uid || `admin:${cleanEmail}`,
    fullName: result.payload.fullName || 'SZMC Administrator',
  };
}

export function verifyMemberSessionToken(token: string): {
  valid: boolean;
  email?: string;
  userId?: number;
  uid?: string;
  fullName?: string;
} {
  const result = verifySignedPayload<MemberTokenPayload>(token, MEMBER_TOKEN_PREFIX);
  if (!result.valid || !result.payload?.email || result.payload.role !== 'member') {
    return { valid: false };
  }
  return {
    valid: true,
    email: result.payload.email.toLowerCase().trim(),
    userId: Number(result.payload.userId),
    uid: result.payload.uid,
    fullName: result.payload.fullName || 'SZMC Alumnus',
  };
}

export async function verifyAuthToken(token: string) {
  if (!token) return null;

  // 1. Verify HMAC-signed administrative session token (re-validated against authority)
  if (token.startsWith(ADMIN_TOKEN_PREFIX)) {
    const adminCheck = verifyAdminToken(token);
    if (!adminCheck.valid || !adminCheck.email) {
      return null;
    }

    const adminEmail = adminCheck.email.toLowerCase().trim();
    let resolvedRole: CanonicalUserRole | null = isSuperAdminEmail(adminEmail)
      ? 'super_admin'
      : null;
    let resolvedId = adminCheck.userId || 1;
    let resolvedUid = adminCheck.uid || `admin:${adminEmail}`;
    let resolvedFullName = adminCheck.fullName || 'SZMC Administrator';

    // Re-confirm non-super-admin tokens against live database role
    if (!resolvedRole && isSupabaseServerConfigured) {
      try {
        const { data: profile } = await supabaseServer
          .from(SUPABASE_TABLES.ALUMNI_PROFILES)
          .select('id, auth_user_id, full_name, role, is_public')
          .ilike('email', adminEmail)
          .maybeSingle();

        if (profile && (profile.role === 'admin' || profile.role === 'super_admin')) {
          resolvedRole = normalizeRole(profile.role, adminEmail);
          resolvedId = Number(profile.id);
          resolvedUid = profile.auth_user_id || resolvedUid;
          resolvedFullName = profile.full_name || resolvedFullName;
        }
      } catch {
        // Fail closed when database verification cannot confirm non-super-admin authority
      }
    }

    if (!resolvedRole) {
      return null;
    }

    return {
      user: { id: resolvedUid, email: adminEmail } as any,
      dbUser: {
        id: resolvedId,
        uid: resolvedUid,
        email: adminEmail,
        fullName: resolvedFullName,
        role: resolvedRole,
        accountStatus: 'active',
      },
    };
  }

  // 2. Verify strictly scoped HMAC member session token (NEVER elevates privilege)
  if (token.startsWith(MEMBER_TOKEN_PREFIX)) {
    const memberCheck = verifyMemberSessionToken(token);
    if (!memberCheck.valid || !memberCheck.email) {
      return null;
    }
    return {
      user: { id: memberCheck.uid, email: memberCheck.email } as any,
      dbUser: {
        id: Number(memberCheck.userId || 0),
        uid: memberCheck.uid || `member:${memberCheck.userId}`,
        email: memberCheck.email,
        fullName: memberCheck.fullName || 'SZMC Alumnus',
        role: 'member' as CanonicalUserRole,
        accountStatus: 'active',
      },
    };
  }

  if (!isSupabaseServerConfigured) {
    return null;
  }

  // 3. Verify authoritative Supabase Auth JWT
  try {
    const { data, error } = await supabaseServer.auth.getUser(token);
    if (error || !data?.user) {
      return null;
    }

    const user = data.user;
    const cleanEmail = (user.email || '').toLowerCase().trim();

    const metadataRole =
      (user.app_metadata?.role as string) ||
      (user.app_metadata?.claims_admin ? 'admin' : undefined);

    const lookupClient = getSupabaseWriteClient(token)?.client || supabaseServer;
    // Note: column-level SELECT on `email` is revoked from `authenticated` in Migration 003,
    // so only select public non-revoked columns when using a user-scoped JWT client.
    const selectCols = isSupabaseServiceRoleConfigured
      ? 'id, auth_user_id, email, full_name, role, is_public'
      : 'id, auth_user_id, full_name, role, is_public';

    const { data: rawProfile } = await lookupClient
      .from(SUPABASE_TABLES.ALUMNI_PROFILES)
      .select(selectCols)
      .eq('auth_user_id', user.id)
      .maybeSingle();

    const profile = (rawProfile || null) as {
      id?: number;
      auth_user_id?: string;
      email?: string;
      full_name?: string;
      role?: string;
      is_public?: boolean;
    } | null;

    const profileRole = profile?.role as string | undefined;

    // Authoritative server-side role resolution (never trusts user_metadata)
    let resolvedRole: CanonicalUserRole = 'member';
    if (
      isSuperAdminEmail(cleanEmail) ||
      metadataRole === 'super_admin' ||
      profileRole === 'super_admin'
    ) {
      resolvedRole = 'super_admin';
    } else if (metadataRole === 'admin' || profileRole === 'admin') {
      resolvedRole = 'admin';
    } else if (metadataRole === 'moderator' || profileRole === 'moderator') {
      resolvedRole = 'moderator';
    } else if (profileRole === 'batch_representative') {
      resolvedRole = 'batch_representative';
    }

    return {
      user,
      supabaseAccessToken: token,
      dbUser: {
        id: Number(profile?.id || 0),
        uid: user.id,
        email: cleanEmail || `${user.id}@szmcalumni.net`,
        fullName:
          profile?.full_name ||
          (user.user_metadata as any)?.full_name ||
          'SZMC Alumnus',
        role: resolvedRole,
        accountStatus: profile?.is_public === false ? 'suspended' : 'active',
        auth_user_id: user.id,
      },
    };
  } catch (err) {
    console.warn('Supabase token verification error:', err);
    return null;
  }
}

async function authenticateBearerRequest(
  req: AuthRequest,
  res: Response,
  missingMsg: string,
  invalidMsg: string
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: missingMsg });
    return null;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const authResult = await verifyAuthToken(token);
  if (!authResult) {
    res.status(401).json({ error: invalidMsg });
    return null;
  }

  req.supabaseUser = authResult.user;
  req.user = authResult.user;
  req.dbUser = authResult.dbUser;
  if ('supabaseAccessToken' in authResult && authResult.supabaseAccessToken) {
    req.supabaseAccessToken = authResult.supabaseAccessToken;
  }
  return authResult;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authResult = await authenticateBearerRequest(
    req,
    res,
    'Unauthorized: Missing token',
    'Unauthorized: Invalid token'
  );
  if (!authResult) return;
  return next();
};

/**
 * Tier 2: Moderators, Admins, and Super Admins (content moderation, verifications, notices, blood alerts)
 */
export const requireModerator = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authResult = await authenticateBearerRequest(
    req,
    res,
    'Unauthorized: Valid moderation authorization token required.',
    'Unauthorized: Invalid or expired session token.'
  );
  if (!authResult) return;

  const perms = getRolePermissions(authResult.dbUser.role);
  if (!perms.isModerator) {
    return res.status(403).json({
      error: 'Forbidden: Moderation access restricted to verified moderators and administrators.',
    });
  }
  return next();
};

/**
 * Tier 3: Admins and Super Admins ONLY (user governance, phone verification, site configuration, stream groups)
 */
export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authResult = await authenticateBearerRequest(
    req,
    res,
    'Unauthorized: Valid administrator authorization token required.',
    'Unauthorized: Invalid or expired administrator session token.'
  );
  if (!authResult) return;

  const perms = getRolePermissions(authResult.dbUser.role);
  if (!perms.isAdmin) {
    return res.status(403).json({
      error: 'Forbidden: Admin access restricted to verified administrators.',
    });
  }
  return next();
};

/**
 * Tier 4: Super Admins ONLY (telemetry/ad engine, bulk verification/import, full DB backups, dist archives)
 */
export const requireSuperAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authResult = await authenticateBearerRequest(
    req,
    res,
    'Unauthorized: Super Administrator authorization token required.',
    'Unauthorized: Invalid or expired Super Administrator session token.'
  );
  if (!authResult) return;

  const perms = getRolePermissions(authResult.dbUser.role);
  if (!perms.isSuperAdmin) {
    return res.status(403).json({
      error: 'Forbidden: Super Administrator clearance is strictly required for this operation.',
    });
  }
  return next();
};

export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    const authResult = await verifyAuthToken(token);
    if (authResult) {
      req.supabaseUser = authResult.user;
      req.user = authResult.user;
      req.dbUser = authResult.dbUser;
      if ('supabaseAccessToken' in authResult && authResult.supabaseAccessToken) {
        req.supabaseAccessToken = authResult.supabaseAccessToken;
      }
    }
  }
  next();
};

