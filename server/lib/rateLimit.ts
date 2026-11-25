import type { Request, Response, NextFunction } from 'express';

export interface RateBucket {
  count: number;
  resetAt: number;
}

const MAX_RATE_BUCKETS = 10_000;
const PRUNE_INTERVAL_MS = 60_000;

export class SlidingRateLimiter {
  private readonly store = new Map<string, RateBucket>();
  private lastPrunedAt = Date.now();

  public prune(now = Date.now()): void {
    for (const [key, bucket] of this.store.entries()) {
      if (now > bucket.resetAt) {
        this.store.delete(key);
      }
    }
    if (this.store.size > MAX_RATE_BUCKETS) {
      const overflow = this.store.size - MAX_RATE_BUCKETS;
      let removed = 0;
      for (const key of this.store.keys()) {
        this.store.delete(key);
        removed += 1;
        if (removed >= overflow) break;
      }
    }
    this.lastPrunedAt = now;
  }

  public check(
    key: string,
    maxRequests: number,
    windowMs: number,
    now = Date.now()
  ): { allowed: boolean; remaining: number; resetAt: number } {
    if (now - this.lastPrunedAt >= PRUNE_INTERVAL_MS || this.store.size >= MAX_RATE_BUCKETS) {
      this.prune(now);
    }

    const bucket = this.store.get(key);
    if (!bucket || now > bucket.resetAt) {
      const resetAt = now + windowMs;
      this.store.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: Math.max(0, maxRequests - 1), resetAt };
    }

    bucket.count += 1;
    const allowed = bucket.count <= maxRequests;
    return {
      allowed,
      remaining: Math.max(0, maxRequests - bucket.count),
      resetAt: bucket.resetAt,
    };
  }

  public get size(): number {
    return this.store.size;
  }

  public clear(): void {
    this.store.clear();
  }
}

export const globalRateLimiter = new SlidingRateLimiter();

export function resolveClientIp(req: Request): string {
  // Express resolves req.ip reliably when `app.set('trust proxy', 1)` is configured
  if (req.ip && typeof req.ip === 'string') {
    return req.ip.replace(/^::ffff:/, '').trim();
  }
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function rateLimitGuard(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = resolveClientIp(req);
    const key = `${ip}:${req.baseUrl || req.path}`;
    const result = globalRateLimiter.check(key, maxRequests, windowMs);

    if (!result.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: 'Rate limit exceeded. Automated scraping and brute-force requests are blocked.',
      });
    }
    return next();
  };
}
