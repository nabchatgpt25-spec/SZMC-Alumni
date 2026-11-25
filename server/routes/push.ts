import { Router, type Request, type Response } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.ts';
import { rateLimitGuard } from '../lib/rateLimit.ts';
import { cleanText, normalizeSafeHttpUrl } from '../lib/validation.ts';
import {
  isSupabaseServerConfigured,
  getSupabaseWriteClient,
  supabaseServer,
} from '../lib/supabase-server.ts';

interface MemoryPushSubscription {
  profileId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
  updatedAt: string;
}

const memoryPushSubscriptions = new Map<string, MemoryPushSubscription>();

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return null;
}

export function createPushRouter(): Router {
  const router = Router();

  // Public VAPID key discovery (returns configured flag & public key if provisioned)
  router.get('/api/push/vapid-public-key', rateLimitGuard(60, 60_000), (_req: Request, res: Response) => {
    const publicKey = (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '').trim();
    return res.json({
      configured: Boolean(publicKey),
      publicKey: publicKey || null,
    });
  });

  // Save / refresh authenticated user's browser PushSubscription
  router.post(
    '/api/push/subscribe',
    rateLimitGuard(30, 60_000),
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const profileId = Number(req.dbUser?.id || 0);
        if (!profileId) {
          return res.status(401).json({ error: 'Valid user profile required.' });
        }

        const sub = req.body?.subscription || req.body;
        const endpoint = normalizeSafeHttpUrl(sub?.endpoint);
        const p256dh = cleanText(sub?.keys?.p256dh || sub?.p256dh, 512);
        const authSecret = cleanText(sub?.keys?.auth || sub?.auth, 256);

        if (!endpoint || !p256dh || !authSecret) {
          return res.status(400).json({ error: 'Valid Web Push subscription (endpoint, p256dh, auth) required.' });
        }

        const userAgent = cleanText(req.headers['user-agent'] || '', 300);
        const nowIso = new Date().toISOString();

        memoryPushSubscriptions.set(`${profileId}:${endpoint}`, {
          profileId,
          endpoint,
          p256dh,
          auth: authSecret,
          userAgent,
          updatedAt: nowIso,
        });

        if (isSupabaseServerConfigured) {
          const writeCtx = getSupabaseWriteClient(req.supabaseAccessToken || extractBearerToken(req));
          const dbClient = writeCtx?.client || supabaseServer;
          const { error } = await dbClient.from('push_subscriptions').upsert(
            {
              profile_id: profileId,
              endpoint,
              p256dh,
              auth: authSecret,
              user_agent: userAgent || null,
              updated_at: nowIso,
            },
            { onConflict: 'profile_id,endpoint' }
          );
          if (!error) {
            return res.status(201).json({ ok: true, persisted: 'supabase' });
          }
        }

        return res.status(201).json({ ok: true, persisted: 'memory' });
      } catch (err: any) {
        return res.status(500).json({ error: err?.message || 'Failed to save push subscription.' });
      }
    }
  );

  // Remove browser PushSubscription on sign-out or toggle-off
  router.post(
    '/api/push/unsubscribe',
    rateLimitGuard(30, 60_000),
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const profileId = Number(req.dbUser?.id || 0);
        const endpoint = normalizeSafeHttpUrl(req.body?.endpoint);
        if (!profileId || !endpoint) {
          return res.status(400).json({ error: 'Valid profile and endpoint required.' });
        }

        memoryPushSubscriptions.delete(`${profileId}:${endpoint}`);

        if (isSupabaseServerConfigured) {
          const writeCtx = getSupabaseWriteClient(req.supabaseAccessToken || extractBearerToken(req));
          const dbClient = writeCtx?.client || supabaseServer;
          await dbClient
            .from('push_subscriptions')
            .delete()
            .eq('profile_id', profileId)
            .eq('endpoint', endpoint);
        }

        return res.json({ ok: true });
      } catch (err: any) {
        return res.status(500).json({ error: err?.message || 'Failed to remove push subscription.' });
      }
    }
  );

  return router;
}
