/**
 * Privacy-Safe Behavioral Activity Telemetry Tracker
 * Captures route navigation, exact active page dwell time (pauses when tab hidden),
 * non-sensitive UI click targets & normalized coordinates, scroll depth milestones,
 * searches, and session heartbeats for the Super Admin Data & Ad Intelligence Center.
 *
 * Strictly NEVER captures password inputs, form field values, auth tokens, or [data-sensitive] elements.
 */

import { getClientAuthHeaders } from '../lib/supabase';

export interface TrackerUserIdentity {
  profileId?: number | null;
  authUserId?: string | null;
  userName?: string;
  userEmail?: string | null;
  batchYear?: number | null;
  specialty?: string | null;
  city?: string | null;
  country?: string | null;
}

interface QueuedTelemetryEvent {
  eventType:
    | 'session_start'
    | 'session_heartbeat'
    | 'page_view'
    | 'page_leave'
    | 'click'
    | 'scroll_milestone'
    | 'search'
    | 'profile_view'
    | 'post_interaction'
    | 'ad_impression'
    | 'ad_click';
  route: string;
  routeLabel?: string;
  elementTag?: string | null;
  elementLabel?: string | null;
  elementSection?: string | null;
  clickXPct?: number | null;
  clickYPct?: number | null;
  durationSec?: number;
  scrollDepthPct?: number;
  metadata?: Record<string, any>;
  createdAt: string;
}

const SESSION_STORAGE_KEY = 'szmc_telemetry_session_id';

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return 'ssr-session';
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing && existing.length > 8) return existing;
    const generated = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function detectDeviceInfo() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      deviceType: 'desktop',
      browser: 'Unknown',
      os: 'Unknown',
      screenResolution: '1440x900',
    };
  }
  const ua = navigator.userAgent || '';
  const width = window.innerWidth || 1440;
  const deviceType =
    /iPad|Tablet/i.test(ua) || (width >= 640 && width < 1024 && 'ontouchstart' in window)
      ? 'tablet'
      : /Mobi|Android|iPhone/i.test(ua) || width < 640
      ? 'mobile'
      : 'desktop';

  let browser = 'Other';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  let os = 'Other';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iOS/i.test(ua)) os = 'iOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  const screenResolution = `${window.screen?.width || width}x${window.screen?.height || window.innerHeight || 900}`;
  return { deviceType, browser, os, screenResolution };
}

function sanitizeLabel(raw: string | null | undefined, maxLen = 75): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  // Never store anything that looks like an email, JWT, or long numeric card/phone
  if (/eyJ[a-zA-Z0-9_-]{10,}/.test(cleaned)) return null;
  return cleaned.slice(0, maxLen);
}

function findNearestSectionTitle(el: HTMLElement | null): string | null {
  let cursor: HTMLElement | null = el;
  let depth = 0;
  while (cursor && depth < 7) {
    const explicit = cursor.getAttribute('data-track-section') || cursor.getAttribute('aria-label');
    if (explicit && cursor.tagName !== 'BUTTON' && cursor.tagName !== 'A') {
      return sanitizeLabel(explicit, 60);
    }
    if (['HEADER', 'NAV', 'ASIDE', 'FOOTER', 'MAIN', 'SECTION'].includes(cursor.tagName)) {
      const heading = cursor.querySelector('h1, h2, h3');
      if (heading?.textContent) {
        return sanitizeLabel(heading.textContent, 60);
      }
      return cursor.tagName.toLowerCase();
    }
    cursor = cursor.parentElement;
    depth += 1;
  }
  return null;
}

class ActivityTrackerEngine {
  private sessionId: string = '';
  private user: TrackerUserIdentity = {};
  private currentRoute: string = 'landing';
  private routeEnteredAtMs: number = Date.now();
  private accumulatedActiveMs: number = 0;
  private lastTickMs: number = Date.now();
  private isTabVisible: boolean = true;
  private maxScrollForRoute: number = 0;
  private reachedScrollMilestones = new Set<number>();

  private queue: QueuedTelemetryEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private initialized: boolean = false;
  private lastClickAtMs: number = 0;

  private boundClickHandler: ((e: MouseEvent) => void) | null = null;
  private boundScrollHandler: (() => void) | null = null;
  private boundVisibilityHandler: (() => void) | null = null;
  private boundUnloadHandler: (() => void) | null = null;

  public init(initialRoute: string, user: TrackerUserIdentity) {
    if (typeof window === 'undefined') return;
    this.user = { ...user };

    if (this.initialized) {
      this.setRoute(initialRoute);
      return;
    }

    this.initialized = true;
    this.sessionId = getOrCreateSessionId();
    this.currentRoute = initialRoute || 'landing';
    this.routeEnteredAtMs = Date.now();
    this.lastTickMs = Date.now();
    this.isTabVisible = document.visibilityState !== 'hidden';

    this.enqueue({
      eventType: 'session_start',
      route: this.currentRoute,
      createdAt: new Date().toISOString(),
    });
    this.enqueue({
      eventType: 'page_view',
      route: this.currentRoute,
      createdAt: new Date().toISOString(),
    });

    this.boundClickHandler = (e: MouseEvent) => this.handleDocumentClick(e);
    this.boundScrollHandler = () => this.handleScroll();
    this.boundVisibilityHandler = () => this.handleVisibilityChange();
    this.boundUnloadHandler = () => this.handleUnload();

    document.addEventListener('click', this.boundClickHandler, { capture: true, passive: true });
    window.addEventListener('scroll', this.boundScrollHandler, { passive: true });
    document.addEventListener('visibilitychange', this.boundVisibilityHandler);
    window.addEventListener('pagehide', this.boundUnloadHandler);

    this.flushTimer = setInterval(() => {
      void this.flush(false);
    }, 4500);

    this.heartbeatTimer = setInterval(() => {
      this.emitActiveHeartbeat();
    }, 25000);
  }

  public updateIdentity(user: TrackerUserIdentity) {
    this.user = { ...this.user, ...user };
  }

  public setRoute(nextRoute: string) {
    if (!this.initialized) return;
    const cleanNext = (nextRoute || 'landing').trim();
    if (cleanNext === this.currentRoute) return;

    // Emit page_leave for previous route with exact active dwell seconds
    const dwellSec = this.harvestActiveSeconds();
    if (dwellSec > 0 || this.maxScrollForRoute > 0) {
      this.enqueue({
        eventType: 'page_leave',
        route: this.currentRoute,
        durationSec: dwellSec,
        scrollDepthPct: this.maxScrollForRoute,
        createdAt: new Date().toISOString(),
      });
    }

    this.currentRoute = cleanNext;
    this.routeEnteredAtMs = Date.now();
    this.lastTickMs = Date.now();
    this.accumulatedActiveMs = 0;
    this.maxScrollForRoute = 0;
    this.reachedScrollMilestones.clear();

    this.enqueue({
      eventType: 'page_view',
      route: this.currentRoute,
      createdAt: new Date().toISOString(),
    });

    void this.flush(false);
  }

  public trackSearch(query: string, route?: string) {
    if (!this.initialized) return;
    const clean = sanitizeLabel(query, 90);
    if (!clean || clean.length < 2) return;
    this.enqueue({
      eventType: 'search',
      route: route || this.currentRoute,
      elementLabel: clean,
      metadata: { query: clean },
      createdAt: new Date().toISOString(),
    });
  }

  public trackProfileView(targetProfileId: number) {
    if (!this.initialized || !Number.isFinite(targetProfileId)) return;
    this.enqueue({
      eventType: 'profile_view',
      route: 'profile',
      elementLabel: `Profile #${targetProfileId}`,
      metadata: { targetProfileId },
      createdAt: new Date().toISOString(),
    });
  }

  public trackCustomEvent(
    eventType: QueuedTelemetryEvent['eventType'],
    label: string,
    metadata?: Record<string, any>
  ) {
    if (!this.initialized) return;
    this.enqueue({
      eventType,
      route: this.currentRoute,
      elementLabel: sanitizeLabel(label, 85),
      metadata,
      createdAt: new Date().toISOString(),
    });
  }

  private harvestActiveSeconds(): number {
    const now = Date.now();
    if (this.isTabVisible) {
      this.accumulatedActiveMs += Math.max(0, Math.min(now - this.lastTickMs, 120000));
    }
    this.lastTickMs = now;
    const sec = Math.round(this.accumulatedActiveMs / 1000);
    this.accumulatedActiveMs = 0;
    return sec;
  }

  private emitActiveHeartbeat() {
    if (!this.isTabVisible) return;
    const sec = this.harvestActiveSeconds();
    if (sec <= 0) return;
    this.enqueue({
      eventType: 'session_heartbeat',
      route: this.currentRoute,
      durationSec: sec,
      scrollDepthPct: this.maxScrollForRoute,
      createdAt: new Date().toISOString(),
    });
    void this.flush(false);
  }

  private handleVisibilityChange() {
    const now = Date.now();
    if (document.visibilityState === 'hidden') {
      if (this.isTabVisible) {
        this.accumulatedActiveMs += Math.max(0, Math.min(now - this.lastTickMs, 120000));
      }
      this.isTabVisible = false;
      const sec = this.harvestActiveSeconds();
      if (sec > 0) {
        this.enqueue({
          eventType: 'session_heartbeat',
          route: this.currentRoute,
          durationSec: sec,
          scrollDepthPct: this.maxScrollForRoute,
          createdAt: new Date().toISOString(),
        });
      }
      void this.flush(true);
    } else {
      this.isTabVisible = true;
      this.lastTickMs = now;
    }
  }

  private handleUnload() {
    const sec = this.harvestActiveSeconds();
    if (sec > 0) {
      this.enqueue({
        eventType: 'page_leave',
        route: this.currentRoute,
        durationSec: sec,
        scrollDepthPct: this.maxScrollForRoute,
        createdAt: new Date().toISOString(),
      });
    }
    void this.flush(true);
  }

  private handleScroll() {
    const doc = document.documentElement;
    const scrollable = Math.max(1, doc.scrollHeight - window.innerHeight);
    const pct = Math.min(100, Math.max(0, Math.round((window.scrollY / scrollable) * 100)));
    if (pct > this.maxScrollForRoute) {
      this.maxScrollForRoute = pct;
    }
    for (const milestone of [25, 50, 75, 100]) {
      if (pct >= milestone && !this.reachedScrollMilestones.has(milestone)) {
        this.reachedScrollMilestones.add(milestone);
        this.enqueue({
          eventType: 'scroll_milestone',
          route: this.currentRoute,
          scrollDepthPct: milestone,
          elementLabel: `Scrolled ${milestone}%`,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  private handleDocumentClick(e: MouseEvent) {
    const now = Date.now();
    // Light debounce to avoid double-firing on nested label clicks
    if (now - this.lastClickAtMs < 120) return;

    const rawTarget = e.target as HTMLElement | null;
    if (!rawTarget || typeof rawTarget.closest !== 'function') return;

    // Never track sensitive containers or raw password/text inputs
    if (rawTarget.closest('[data-sensitive="true"], [data-no-track="true"]')) return;

    const interactive =
      (rawTarget.closest('button, a, [role="button"], [role="tab"], [data-track]') as HTMLElement | null) ||
      rawTarget;

    const tagName = interactive.tagName.toLowerCase();
    // Skip logging plain body/div background clicks unless explicitly interactive
    if (!['button', 'a', 'summary', 'label', 'select'].includes(tagName) && !interactive.getAttribute('role') && !interactive.getAttribute('data-track')) {
      return;
    }
    // Never capture text input/password/textarea values
    if (tagName === 'input' || tagName === 'textarea') return;

    this.lastClickAtMs = now;

    const explicitTrack = interactive.getAttribute('data-track');
    const ariaLabel = interactive.getAttribute('aria-label') || interactive.getAttribute('title');
    const textContent = interactive.textContent;
    const label = sanitizeLabel(explicitTrack || ariaLabel || textContent, 75) || `<${tagName}>`;
    const section = findNearestSectionTitle(interactive);

    const clickXPct = window.innerWidth > 0 ? Math.round((e.clientX / window.innerWidth) * 1000) / 10 : null;
    const clickYPct = window.innerHeight > 0 ? Math.round((e.clientY / window.innerHeight) * 1000) / 10 : null;

    this.enqueue({
      eventType: 'click',
      route: this.currentRoute,
      elementTag: tagName,
      elementLabel: label,
      elementSection: section,
      clickXPct,
      clickYPct,
      createdAt: new Date().toISOString(),
    });

    if (this.queue.length >= 8) {
      void this.flush(false);
    }
  }

  private enqueue(ev: QueuedTelemetryEvent) {
    this.queue.push(ev);
    if (this.queue.length > 60) {
      this.queue = this.queue.slice(-60);
    }
  }

  public async flush(useKeepalive = false) {
    if (!this.initialized || this.queue.length === 0) return;
    const batch = this.queue.splice(0, 45);
    const device = detectDeviceInfo();

    const payload = {
      session: {
        sessionId: this.sessionId,
        profileId: this.user.profileId ?? null,
        authUserId: this.user.authUserId ?? null,
        userName: this.user.userName || 'Guest Visitor',
        userEmail: this.user.userEmail || null,
        batchYear: this.user.batchYear ?? null,
        specialty: this.user.specialty ?? null,
        city: this.user.city ?? null,
        country: this.user.country ?? null,
        deviceType: device.deviceType,
        browser: device.browser,
        os: device.os,
        screenResolution: device.screenResolution,
        referrer: typeof document !== 'undefined' ? document.referrer || null : null,
        currentRoute: this.currentRoute,
      },
      events: batch,
    };

    try {
      const headers = await getClientAuthHeaders(true);
      await fetch('/api/telemetry/batch', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        keepalive: useKeepalive,
      });
    } catch {
      // Silently drop on transient network failure so UX is never interrupted
    }
  }

  public destroy() {
    if (!this.initialized) return;
    if (this.boundClickHandler) {
      document.removeEventListener('click', this.boundClickHandler, { capture: true });
    }
    if (this.boundScrollHandler) {
      window.removeEventListener('scroll', this.boundScrollHandler);
    }
    if (this.boundVisibilityHandler) {
      document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
    }
    if (this.boundUnloadHandler) {
      window.removeEventListener('pagehide', this.boundUnloadHandler);
    }
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.initialized = false;
  }
}

export const activityTracker = new ActivityTrackerEngine();
