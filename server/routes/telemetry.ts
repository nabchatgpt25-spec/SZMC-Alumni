import { Router, type Response } from 'express';
import { optionalAuth, requireSuperAdmin, type AuthRequest } from '../middleware/auth.ts';
import { rateLimitGuard } from '../lib/rateLimit.ts';
import {
  ingestTelemetryBatch,
  getTelemetryOverview,
  getUserTelemetryDossier,
  createAdSegment,
  deleteAdSegment,
  clearTelemetryLogs,
  listAdSegments,
} from '../db/telemetryRepository.ts';

function resolveActorEmail(req: AuthRequest): string {
  return req.dbUser?.email || 'Super Admin';
}

export function createTelemetryRouter(): Router {
  const router = Router();

  // Ingest sanitized behavioral event batches (page views, dwell time, clicks, scroll, searches)
  router.post(
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

  // Super Admin ONLY: Full User Activity Overview
  router.get(
    '/api/admin/telemetry/overview',
    rateLimitGuard(120, 60_000),
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const rawRange = Number(req.query.rangeHours);
        const rangeHours =
          Number.isFinite(rawRange) && rawRange >= 0 && rawRange <= 8760 ? rawRange : 168;
        const overview = await getTelemetryOverview(rangeHours);
        return res.json(overview);
      } catch (err: any) {
        return res.status(500).json({ error: err?.message || 'Failed to load telemetry overview.' });
      }
    }
  );

  // Super Admin ONLY: Deep-Dive Behavioral Dossier for a Specific User
  router.get(
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
  router.get(
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

  router.post(
    '/api/admin/telemetry/segments',
    rateLimitGuard(60, 60_000),
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const created = await createAdSegment(req.body || {}, resolveActorEmail(req));
        return res.status(201).json({ success: true, segment: created });
      } catch (err: any) {
        return res.status(400).json({ error: err?.message || 'Failed to create audience segment.' });
      }
    }
  );

  router.delete(
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

  router.post(
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

  return router;
}
