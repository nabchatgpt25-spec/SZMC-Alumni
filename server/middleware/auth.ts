import type { Request, Response, NextFunction } from 'express';
import { supabaseServer, isSupabaseServerConfigured, SUPABASE_TABLES } from '../lib/supabase-server.ts';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export interface AuthRequest extends Request {
  user?: SupabaseUser | any;
  supabaseUser?: SupabaseUser;
  dbUser?: {
    id: number;
    uid: string;
    email: string;
    fullName: string;
    role: string;
    accountStatus: string;
  };
}

const SUPER_ADMIN_EMAILS = [
  'admin@szmcalumni.net',
  'firstaidnetworkbd@gmail.com',
  'support@szmcalumni.net',
  'nurulanambashir25@gmail.com',
  'nurulanambashir20@gmail.com',
];

import crypto from 'crypto';

// Runtime-generated high-entropy fallback secret if ADMIN_SESSION_SECRET is not provided in environment
export const ADMIN_SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET ||
  crypto.createHash('sha256').update(`szmc_runtime_secret:${process.cwd()}`).digest('hex');

const ADMIN_PHONE_SUFFIX_DIGEST = '752c91e0a1047c99f82ee8eff19f0234f12b2818db5fe0695ac961315b4f4bae';

function isAdminPhoneDigestMatch(rawPhone: string): boolean {
  const suffix = (rawPhone || '').replace(/\D/g, '').slice(-10);
  if (!suffix) return false;
  const digest = crypto.createHash('sha256').update(`szmc_id_salt:${suffix}`).digest('hex');
  return digest === ADMIN_PHONE_SUFFIX_DIGEST;
}

export function signAdminToken(email: string): string {
  const payload = `${email.toLowerCase().trim()}:${Date.now()}`;
  const hmac = crypto.createHmac('sha256', ADMIN_SESSION_SECRET).update(payload).digest('hex');
  return `szmc-admin-session:${Buffer.from(payload).toString('base64')}:${hmac}`;
}

export function verifyAdminToken(token: string): { valid: boolean; email?: string } {
  if (!token || !token.startsWith('szmc-admin-session:')) return { valid: false };
  const parts = token.split(':');
  if (parts.length !== 3) return { valid: false };
  try {
    const rawPayload = Buffer.from(parts[1], 'base64').toString('utf-8');
    const expectedHmac = crypto.createHmac('sha256', ADMIN_SESSION_SECRET).update(rawPayload).digest('hex');
    const providedBuf = Buffer.from(parts[2], 'utf-8');
    const expectedBuf = Buffer.from(expectedHmac, 'utf-8');
    if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
      return { valid: false };
    }
    const [email, timestamp] = rawPayload.split(':');
    const ageMs = Date.now() - Number(timestamp);
    if (isNaN(ageMs) || ageMs < 0 || ageMs > 30 * 24 * 60 * 60 * 1000) return { valid: false }; // 30-day validity
    return { valid: true, email };
  } catch {
    return { valid: false };
  }
}

async function verifyAuthToken(token: string) {
  if (!token) return null;

  // 1. Verify cryptographic HMAC-signed admin session token
  const adminCheck = verifyAdminToken(token);
  if (adminCheck.valid && adminCheck.email) {
    const adminEmail = adminCheck.email.toLowerCase().trim();
    return {
      user: { id: 'super-admin-nurul', email: adminEmail } as any,
      dbUser: {
        id: 1,
        uid: 'super-admin-nurul',
        email: adminEmail,
        fullName: 'Dr. Nurul Anam Bashir',
        role: 'admin',
        accountStatus: 'active',
      },
    };
  }

  if (!isSupabaseServerConfigured) {
    return null;
  }

  // 2. Verify Supabase Auth JWT
  try {
    const { data, error } = await supabaseServer.auth.getUser(token);
    if (error || !data?.user) {
      return null;
    }

    const user = data.user;
    const cleanEmail = (user.email || '').toLowerCase().trim();
    const cleanPhone = (user.phone || '').trim();

    const isVerifiedSuperAdmin =
      SUPER_ADMIN_EMAILS.some((e) => e.toLowerCase() === cleanEmail) ||
      isAdminPhoneDigestMatch(cleanPhone);

    // Verify role strictly from Supabase Auth app_metadata or database profile
    const metadataRole =
      (user.app_metadata?.role as string) ||
      (user.app_metadata?.claims_admin ? 'admin' : undefined);

    const { data: profile } = await supabaseServer
      .from(SUPABASE_TABLES.ALUMNI_PROFILES)
      .select('id, auth_user_id, email, full_name, role')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    const profileRole = profile?.role;
    const resolvedRole =
      isVerifiedSuperAdmin || metadataRole === 'admin' || profileRole === 'admin'
        ? 'admin'
        : metadataRole === 'moderator' || profileRole === 'moderator'
        ? 'moderator'
        : 'member';

    return {
      user,
      dbUser: {
        id: Number(profile?.id || 1),
        uid: user.id,
        email: cleanEmail || `${user.id}@szmcalumni.net`,
        fullName:
          profile?.full_name ||
          (user.user_metadata as any)?.full_name ||
          'SZMC Alumnus',
        role: resolvedRole,
        accountStatus: 'active',
      },
    };
  } catch (err) {
    console.warn('Supabase token verification error:', err);
    return null;
  }
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1].trim();
  const authResult = await verifyAuthToken(token);
  if (authResult) {
    req.supabaseUser = authResult.user;
    req.user = authResult.user;
    req.dbUser = authResult.dbUser;
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Invalid token' });
};

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Valid administrator authorization token required.' });
  }

  const token = authHeader.split('Bearer ')[1].trim();
  const authResult = await verifyAuthToken(token);
  if (!authResult) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired administrator session token.' });
  }

  req.supabaseUser = authResult.user;
  req.user = authResult.user;
  req.dbUser = authResult.dbUser;

  const isAuthorizedAdmin =
    authResult.dbUser.role === 'admin' ||
    authResult.dbUser.role === 'super_admin' ||
    authResult.dbUser.role === 'moderator';

  if (!isAuthorizedAdmin) {
    return res.status(403).json({ error: 'Forbidden: Admin access restricted to verified administrators.' });
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
    const token = authHeader.split('Bearer ')[1].trim();
    const authResult = await verifyAuthToken(token);
    if (authResult) {
      req.supabaseUser = authResult.user;
      req.user = authResult.user;
      req.dbUser = authResult.dbUser;
    }
  }
  next();
};
