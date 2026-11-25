import { Router, type Response, type NextFunction } from 'express';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { requireSuperAdmin, type AuthRequest } from '../middleware/auth.ts';

const DIST_TOKEN_FILE = path.join(os.tmpdir(), 'szmc-dist-download-token.json');

export function verifySignedDistToken(rawToken: unknown): boolean {
  if (typeof rawToken !== 'string' || rawToken.length < 32 || rawToken.length > 256) {
    return false;
  }
  try {
    if (!existsSync(DIST_TOKEN_FILE)) return false;
    const raw = readFileSync(DIST_TOKEN_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as { tokenHash?: string; expiresAt?: number };
    if (!parsed?.tokenHash || typeof parsed.expiresAt !== 'number') return false;
    if (Date.now() > parsed.expiresAt) return false;
    const candidateHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const a = Buffer.from(candidateHash, 'utf-8');
    const b = Buffer.from(parsed.tokenHash, 'utf-8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function requireSuperAdminOrSignedDistToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (verifySignedDistToken(req.query.dl)) {
    return next();
  }
  return requireSuperAdmin(req, res, next);
}

export function createDistDownloadRouter(rootDir: string): Router {
  const router = Router();

  // Super Admin (or signed expiring link) download route for the production deployment dist archive
  router.get(
    [
      '/download/szmc-alumni-dist.zip',
      '/szmc-alumni-dist.zip',
      '/download/dist.zip',
      '/dist.zip',
      '/api/download-dist',
      '/download-dist',
    ],
    requireSuperAdminOrSignedDistToken,
    (_req: AuthRequest, res: Response) => {
      const candidates = [
        path.resolve(rootDir, 'szmc-alumni-dist.zip'),
        path.resolve(rootDir, 'dist', 'szmc-alumni-dist.zip'),
        path.resolve(rootDir, 'public', 'szmc-alumni-dist.zip'),
        path.resolve(rootDir, 'public', 'dist.zip'),
        path.resolve(rootDir, 'dist.zip'),
        path.resolve(rootDir, 'szmc-alumni-dist.tar.gz'),
        path.resolve(rootDir, 'public', 'szmc-alumni-dist.tar.gz'),
      ];
      for (const c of candidates) {
        if (existsSync(c)) {
          res.setHeader('Cache-Control', 'no-store');
          return res.download(c, 'szmc-alumni-dist.zip');
        }
      }
      return res.status(404).send('Production dist archive not found. Please build first.');
    }
  );

  router.get(
    ['/download/szmc-alumni-dist.tar.gz', '/szmc-alumni-dist.tar.gz'],
    requireSuperAdminOrSignedDistToken,
    (_req: AuthRequest, res: Response) => {
      const candidates = [
        path.resolve(rootDir, 'public', 'szmc-alumni-dist.tar.gz'),
        path.resolve(rootDir, 'szmc-alumni-dist.tar.gz'),
      ];
      for (const c of candidates) {
        if (existsSync(c)) {
          res.setHeader('Cache-Control', 'no-store');
          return res.download(c, 'szmc-alumni-dist.tar.gz');
        }
      }
      return res.status(404).send('Production dist tar.gz archive not found.');
    }
  );

  // Super Admin (or signed expiring link) download route for all Supabase SQL migrations
  router.get(
    [
      '/download/szmc-supabase-migrations.zip',
      '/szmc-supabase-migrations.zip',
      '/download/migrations.zip',
      '/api/download-migrations',
    ],
    requireSuperAdminOrSignedDistToken,
    (_req: AuthRequest, res: Response) => {
      const candidates = [path.resolve(rootDir, 'szmc-supabase-migrations.zip')];
      for (const c of candidates) {
        if (existsSync(c)) {
          res.setHeader('Cache-Control', 'no-store');
          return res.download(c, 'szmc-supabase-migrations.zip');
        }
      }
      return res.status(404).send('Supabase migrations archive not found.');
    }
  );

  return router;
}
