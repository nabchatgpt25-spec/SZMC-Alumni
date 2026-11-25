/**
 * First-Party Behavioral Telemetry & Decision-Intelligence Collector
 * Captures route transitions (funnels), true active dwell time (pauses on tab hide or 45s idle),
 * component/section interaction dwell, non-sensitive click targets & normalized viewport coordinates,
 * rage-click frustration detection, scroll depth milestones, searches, and standard
 * browser/environment attribution signals (timezone, language, connection, UTM parameters).
 *
 * Exposes live raw event stream & subscription API (`getRawSessionEvents`, `subscribe`)
 * for the Super Admin `UserSessionJourney` viewer.
 *
 * Privacy-safe: Strictly NEVER captures passwords, keystrokes, form field values,
 * auth tokens, or elements inside [data-sensitive="true"] / [data-no-track="true"].
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

export type TrackedEventType =
  | 'session_start'
  | 'session_heartbeat'
  | 'page_view'
  | 'page_leave'
  | 'click'
  | 'rage_click'
  | 'scroll_milestone'
  | 'search'
  | 'profile_view'
  | 'post_interaction'
  | 'ad_impression'
  | 'ad_click';

export interface RawActivityEvent {
  id: string;
  sessionId: string;
  profileId: number | null;
  userName: string;
  userEmail: string | null;
  eventType: TrackedEventType;
  route: string;
  routeLabel: string;
  elementTag: string | null;
  elementLabel: string | null;
  elementSection: string | null;
  clickXPct: number | null;
  clickYPct: number | null;
  durationSec: number;
  scrollDepthPct: number;
  metadata: Record<string, any>;
  createdAt: string;
}

interface QueuedTelemetryEvent {
  eventType: TrackedEventType;
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
const RAW_EVENTS_STORAGE_KEY = 'szmc_telemetry_raw_journey_v1';
const IDLE_THRESHOLD_MS = 45_000;
const MAX_RAW_HISTORY = 400;

const CLIENT_ROUTE_LABELS: Record<string, string> = {
  feed: 'The Quad (Feed)',
  dashboard: 'The Quad (Feed)',
  alumni: 'Alumni Directory',
  directory: 'Alumni Directory',
  find: 'Find Alumni',
  batches: 'MBBS Batches',
  map: 'Global Alumni Map',
  'map-directory': 'Global Alumni Map',
  careers: 'Medical Careers',
  mentorship: 'Mentorship Hub',
  events: 'Events & Reunions',
  gallery: 'Heritage Gallery',
  messages: 'Messenger',
  emergency: 'Blood Lifeline',
  blood: 'Blood Lifeline',
  'blood-network': 'Blood Lifeline',
  profile: 'Doctor Profile',
  saved: 'Saved Posts',
  settings: 'Profile Settings',
  'profile-settings': 'Profile Settings',
  contact: 'Contact Secretariat',
  admin: 'Admin Console',
  landing: 'Landing Page',
};

export function resolveClientRouteLabel(route: string): string {
  const clean = (route || 'landing').split(':')[0].split('?')[0].toLowerCase().trim();
  return CLIENT_ROUTE_LABELS[clean] || clean.charAt(0).toUpperCase() + clean.slice(1);
}

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

function detectEnvironmentInfo() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      deviceType: 'desktop',
      browser: 'Unknown',
      os: 'Unknown',
      screenResolution: '1440x900',
      timezone: null as string | null,
      language: null as string | null,
      connectionType: null as string | null,
      utmSource: null as string | null,
      utmMedium: null as string | null,
      utmCampaign: null as string | null,
      colorScheme: 'light',
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
  let timezone: string | null = null;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {}

  const language = navigator.language || null;
  const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  const connectionType = conn?.effectiveType ? String(conn.effectiveType) : null;

  let utmSource: string | null = null;
  let utmMedium: string | null = null;
  let utmCampaign: string | null = null;
  try {
    const params = new URLSearchParams(window.location.search);
    utmSource = params.get('utm_source')?.slice(0, 60) || null;
    utmMedium = params.get('utm_medium')?.slice(0, 60) || null;
    utmCampaign = params.get('utm_campaign')?.slice(0, 80) || null;
  } catch {}

  const colorScheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';

  return {
    deviceType,
    browser,
    os,
    screenResolution,
    timezone,
    language,
    connectionType,
    utmSource,
    utmMedium,
    utmCampaign,
    colorScheme,
  };
}

function sanitizeLabel(raw: string | null | undefined, maxLen = 75): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  if (/eyJ[a-zA-Z0-9_-]{10,}/.test(cleaned)) return null;
  return cleaned.slice(0, maxLen);
}

function findNearestSectionTitle(el: HTMLElement | null): string | null {
  let cursor: HTMLElement | null = el;
  let depth = 0;
  while (cursor && depth < 7) {
    const explicit =
      cursor.getAttribute('data-track-component') ||
      cursor.getAttribute('data-track-section') ||
      cursor.getAttribute('aria-label');
    if (explicit && cursor.tagName !== 'BUTTON' && cursor.tagName !== 'A') {
      return sanitizeLabel(explicit, 60);
    }
    if (['HEADER', 'NAV', 'ASIDE', 'FOOTER', 'MAIN', 'SECTION'].includes(cursor.tagName)) {
      const heading = cursor.querySelector('h1, h2, h3');
      if (heading?.textContent) {
        return sanitizeLabel(heading.textContent, 60);
      }
      const tagMap: Record<string, string> = {
        HEADER: 'Top Header Bar',
        NAV: 'Navigation Bar',
        ASIDE: 'Sidebar Navigation',
        FOOTER: 'Portal Footer',
        MAIN: 'Main Workspace',
        SECTION: 'Content Section',
      };
      return tagMap[cursor.tagName] || cursor.tagName.toLowerCase();
    }
    cursor = cursor.parentElement;
    depth += 1;
  }
  return null;
}

type RawEventListener = (events: RawActivityEvent[]) => void;

class ActivityTrackerEngine {
  private sessionId: string = '';
  private user: TrackerUserIdentity = {};
  private currentRoute: string = 'landing';
  private activeComponent: string = 'Landing Page';
  private activeComponentEnteredAtMs: number = Date.now();
  private accumulatedActiveMs: number = 0;
  private lastTickMs: number = Date.now();
  private lastUserInteractionMs: number = Date.now();
  private isTabVisible: boolean = true;
  private maxScrollForRoute: number = 0;
  private reachedScrollMilestones = new Set<number>();

  private recentClickTimestamps: Array<{ ts: number; x: number; y: number }> = [];
  private queue: QueuedTelemetryEvent[] = [];
  private rawHistory: RawActivityEvent[] = [];
  private listeners = new Set<RawEventListener>();

  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private scrollRafId: number | null = null;
  private lastScrollCheckMs: number = 0;
  private cachedEnvInfo: ReturnType<typeof detectEnvironmentInfo> | null = null;
  private initialized: boolean = false;
  private lastClickAtMs: number = 0;

  private boundClickHandler: ((e: MouseEvent) => void) | null = null;
  private boundScrollHandler: (() => void) | null = null;
  private boundPointerActivityHandler: (() => void) | null = null;
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
    this.activeComponent = resolveClientRouteLabel(this.currentRoute);
    this.activeComponentEnteredAtMs = Date.now();
    this.lastTickMs = Date.now();
    this.lastUserInteractionMs = Date.now();
    this.isTabVisible = document.visibilityState !== 'hidden';

    // Restore any raw session events from the current browser tab session
    this.restoreRawHistory();

    this.enqueue({
      eventType: 'session_start',
      route: this.currentRoute,
      elementSection: this.activeComponent,
      createdAt: new Date().toISOString(),
    });
    this.enqueue({
      eventType: 'page_view',
      route: this.currentRoute,
      elementSection: this.activeComponent,
      metadata: { fromRoute: 'entry', component: this.activeComponent },
      createdAt: new Date().toISOString(),
    });

    this.boundClickHandler = (e: MouseEvent) => this.handleDocumentClick(e);
    this.boundScrollHandler = () => this.scheduleScrollCheck();
    this.boundPointerActivityHandler = () => {
      const now = Date.now();
      if (now - this.lastUserInteractionMs > 2000) {
        this.lastUserInteractionMs = now;
      }
    };
    this.boundVisibilityHandler = () => this.handleVisibilityChange();
    this.boundUnloadHandler = () => this.handleUnload();

    document.addEventListener('click', this.boundClickHandler, { capture: true, passive: true });
    window.addEventListener('scroll', this.boundScrollHandler, { passive: true });
    window.addEventListener('pointerdown', this.boundPointerActivityHandler, { passive: true });
    window.addEventListener('keydown', this.boundPointerActivityHandler, { passive: true });
    document.addEventListener('visibilitychange', this.boundVisibilityHandler);
    window.addEventListener('pagehide', this.boundUnloadHandler);

    this.flushTimer = setInterval(() => {
      if (this.queue.length > 0) {
        void this.flush(false);
      }
    }, 15000);

    this.heartbeatTimer = setInterval(() => {
      this.emitActiveHeartbeat();
    }, 30000);
  }

  /**
   * Returns a snapshot of the live raw session event log recorded by activityTracker.
   */
  public getRawSessionEvents(): RawActivityEvent[] {
    return [...this.rawHistory];
  }

  /**
   * Returns current session metadata for the UserSessionJourney live viewer.
   */
  public getCurrentSessionInfo() {
    const env = detectEnvironmentInfo();
    return {
      sessionId: this.sessionId || getOrCreateSessionId(),
      user: { ...this.user },
      currentRoute: this.currentRoute,
      currentRouteLabel: resolveClientRouteLabel(this.currentRoute),
      activeComponent: this.activeComponent,
      ...env,
    };
  }

  /**
   * Subscribe to live raw event updates from activityTracker (used by UserSessionJourney).
   */
  public subscribe(listener: RawEventListener): () => void {
    this.listeners.add(listener);
    listener(this.getRawSessionEvents());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    if (this.listeners.size === 0) return;
    const snapshot = this.getRawSessionEvents();
    for (const fn of this.listeners) {
      try {
        fn(snapshot);
      } catch {
        // isolate subscriber errors
      }
    }
  }

  private restoreRawHistory() {
    try {
      const saved = sessionStorage.getItem(RAW_EVENTS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.rawHistory = parsed.slice(-MAX_RAW_HISTORY);
        }
      }
    } catch {
      // ignore storage errors
    }
  }

  private persistRawHistory(immediate = false) {
    const writeNow = () => {
      this.persistTimer = null;
      try {
        sessionStorage.setItem(RAW_EVENTS_STORAGE_KEY, JSON.stringify(this.rawHistory.slice(-MAX_RAW_HISTORY)));
      } catch {
        // ignore storage quota errors
      }
    };

    if (immediate) {
      if (this.persistTimer) {
        clearTimeout(this.persistTimer);
        this.persistTimer = null;
      }
      writeNow();
      return;
    }

    if (!this.persistTimer) {
      this.persistTimer = setTimeout(writeNow, 3000);
    }
  }

  public updateIdentity(user: TrackerUserIdentity) {
    this.user = { ...this.user, ...user };
  }

  public setRoute(nextRoute: string) {
    if (!this.initialized) return;
    const cleanNext = (nextRoute || 'landing').trim();
    if (cleanNext === this.currentRoute) return;

    const prevRoute = this.currentRoute;
    const prevComponent = this.activeComponent || resolveClientRouteLabel(prevRoute);
    const dwellSec = this.harvestActiveSeconds();
    if (dwellSec > 0 || this.maxScrollForRoute > 0) {
      this.enqueue({
        eventType: 'page_leave',
        route: prevRoute,
        elementSection: prevComponent,
        durationSec: dwellSec,
        scrollDepthPct: this.maxScrollForRoute,
        metadata: { toRoute: cleanNext, component: prevComponent },
        createdAt: new Date().toISOString(),
      });
    }

    this.currentRoute = cleanNext;
    this.activeComponent = resolveClientRouteLabel(cleanNext);
    this.activeComponentEnteredAtMs = Date.now();
    this.lastTickMs = Date.now();
    this.lastUserInteractionMs = Date.now();
    this.accumulatedActiveMs = 0;
    this.maxScrollForRoute = 0;
    this.reachedScrollMilestones.clear();

    this.enqueue({
      eventType: 'page_view',
      route: this.currentRoute,
      elementSection: this.activeComponent,
      metadata: { fromRoute: prevRoute, component: this.activeComponent },
      createdAt: new Date().toISOString(),
    });

    void this.flush(false);
  }

  public trackSearch(query: string, route?: string) {
    if (!this.initialized) return;
    const clean = sanitizeLabel(query, 90);
    if (!clean || clean.length < 2) return;
    this.lastUserInteractionMs = Date.now();
    this.enqueue({
      eventType: 'search',
      route: route || this.currentRoute,
      elementLabel: clean,
      elementSection: 'Search Bar',
      metadata: { query: clean },
      createdAt: new Date().toISOString(),
    });
  }

  public trackProfileView(targetProfileId: number) {
    if (!this.initialized || !Number.isFinite(targetProfileId)) return;
    this.lastUserInteractionMs = Date.now();
    this.enqueue({
      eventType: 'profile_view',
      route: 'profile',
      elementLabel: `Profile #${targetProfileId}`,
      elementSection: 'Doctor Profile View',
      metadata: { targetProfileId },
      createdAt: new Date().toISOString(),
    });
  }

  public trackCustomEvent(
    eventType: TrackedEventType,
    label: string,
    metadata?: Record<string, any>
  ) {
    if (!this.initialized) return;
    this.lastUserInteractionMs = Date.now();
    this.enqueue({
      eventType,
      route: this.currentRoute,
      elementLabel: sanitizeLabel(label, 85),
      elementSection: this.activeComponent,
      metadata,
      createdAt: new Date().toISOString(),
    });
  }

  private harvestActiveSeconds(): number {
    const now = Date.now();
    const isActivelyEngaged = this.isTabVisible && now - this.lastUserInteractionMs <= IDLE_THRESHOLD_MS;
    if (isActivelyEngaged) {
      this.accumulatedActiveMs += Math.max(0, Math.min(now - this.lastTickMs, 60000));
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
      elementSection: this.activeComponent,
      durationSec: sec,
      scrollDepthPct: this.maxScrollForRoute,
      metadata: { component: this.activeComponent },
      createdAt: new Date().toISOString(),
    });
    void this.flush(false);
  }

  private handleVisibilityChange() {
    const now = Date.now();
    if (document.visibilityState === 'hidden') {
      const sec = this.harvestActiveSeconds();
      this.isTabVisible = false;
      if (sec > 0) {
        this.enqueue({
          eventType: 'session_heartbeat',
          route: this.currentRoute,
          elementSection: this.activeComponent,
          durationSec: sec,
          scrollDepthPct: this.maxScrollForRoute,
          metadata: { component: this.activeComponent },
          createdAt: new Date().toISOString(),
        });
      }
      this.persistRawHistory(true);
      void this.flush(true);
    } else {
      this.isTabVisible = true;
      this.lastTickMs = now;
      this.lastUserInteractionMs = now;
    }
  }

  private handleUnload() {
    const sec = this.harvestActiveSeconds();
    if (sec > 0) {
      this.enqueue({
        eventType: 'page_leave',
        route: this.currentRoute,
        elementSection: this.activeComponent,
        durationSec: sec,
        scrollDepthPct: this.maxScrollForRoute,
        metadata: { toRoute: 'exit', component: this.activeComponent },
        createdAt: new Date().toISOString(),
      });
    }
    this.persistRawHistory(true);
    void this.flush(true);
  }

  private scheduleScrollCheck() {
    const now = Date.now();
    this.lastUserInteractionMs = now;
    if (this.scrollRafId !== null || now - this.lastScrollCheckMs < 250) return;
    this.scrollRafId = requestAnimationFrame(() => {
      this.scrollRafId = null;
      this.lastScrollCheckMs = Date.now();
      this.handleScroll();
    });
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
          elementSection: this.activeComponent,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  private handleDocumentClick(e: MouseEvent) {
    const now = Date.now();
    this.lastUserInteractionMs = now;

    const rawTarget = e.target as HTMLElement | null;
    if (!rawTarget || typeof rawTarget.closest !== 'function') return;

    if (rawTarget.closest('[data-sensitive="true"], [data-no-track="true"]')) return;
    const rawTag = rawTarget.tagName.toLowerCase();
    if (rawTag === 'input' || rawTag === 'textarea') return;

    const clickXPct = window.innerWidth > 0 ? Math.round((e.clientX / window.innerWidth) * 1000) / 10 : null;
    const clickYPct = window.innerHeight > 0 ? Math.round((e.clientY / window.innerHeight) * 1000) / 10 : null;

    this.recentClickTimestamps = this.recentClickTimestamps.filter((c) => now - c.ts <= 800);
    this.recentClickTimestamps.push({ ts: now, x: e.clientX, y: e.clientY });
    const nearbyRapidClicks = this.recentClickTimestamps.filter(
      (c) => Math.hypot(c.x - e.clientX, c.y - e.clientY) <= 36
    );
    const isRageClick = nearbyRapidClicks.length >= 3;

    if (!isRageClick && now - this.lastClickAtMs < 120) return;

    const interactive =
      (rawTarget.closest('button, a, [role="button"], [role="tab"], [data-track]') as HTMLElement | null) ||
      rawTarget;

    const tagName = interactive.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea') return;
    if (
      !isRageClick &&
      !['button', 'a', 'summary', 'label', 'select'].includes(tagName) &&
      !interactive.getAttribute('role') &&
      !interactive.getAttribute('data-track')
    ) {
      return;
    }

    this.lastClickAtMs = now;

    const explicitTrack = interactive.getAttribute('data-track');
    const ariaLabel = interactive.getAttribute('aria-label') || interactive.getAttribute('title');
    const textContent = interactive.textContent;
    const label = sanitizeLabel(explicitTrack || ariaLabel || textContent, 75) || `<${tagName}>`;
    const section = findNearestSectionTitle(interactive) || resolveClientRouteLabel(this.currentRoute);

    // Track component transition dwell if user switched to a different UI component
    let prevComponentDwellSec = 0;
    if (section && section !== this.activeComponent) {
      prevComponentDwellSec = Math.min(300, Math.max(0, Math.round((now - this.activeComponentEnteredAtMs) / 1000)));
      this.activeComponent = section;
      this.activeComponentEnteredAtMs = now;
    }

    if (isRageClick) {
      this.recentClickTimestamps = [];
      this.enqueue({
        eventType: 'rage_click',
        route: this.currentRoute,
        elementTag: tagName,
        elementLabel: label,
        elementSection: section,
        clickXPct,
        clickYPct,
        durationSec: prevComponentDwellSec,
        metadata: { burstCount: nearbyRapidClicks.length, component: section },
        createdAt: new Date().toISOString(),
      });
    } else {
      this.enqueue({
        eventType: 'click',
        route: this.currentRoute,
        elementTag: tagName,
        elementLabel: label,
        elementSection: section,
        clickXPct,
        clickYPct,
        durationSec: prevComponentDwellSec,
        metadata: { component: section },
        createdAt: new Date().toISOString(),
      });
    }

    if (this.queue.length >= 8) {
      void this.flush(false);
    }
  }

  private enqueue(ev: QueuedTelemetryEvent) {
    this.queue.push(ev);
    if (this.queue.length > 80) {
      this.queue = this.queue.slice(-80);
    }

    const rawRecord: RawActivityEvent = {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sessionId: this.sessionId || getOrCreateSessionId(),
      profileId: this.user.profileId ?? null,
      userName: this.user.userName || 'Guest Visitor',
      userEmail: this.user.userEmail || null,
      eventType: ev.eventType,
      route: ev.route,
      routeLabel: ev.routeLabel || resolveClientRouteLabel(ev.route),
      elementTag: ev.elementTag ?? null,
      elementLabel: ev.elementLabel ?? null,
      elementSection: ev.elementSection ?? resolveClientRouteLabel(ev.route),
      clickXPct: ev.clickXPct ?? null,
      clickYPct: ev.clickYPct ?? null,
      durationSec: ev.durationSec ?? 0,
      scrollDepthPct: ev.scrollDepthPct ?? 0,
      metadata: ev.metadata ? { ...ev.metadata } : {},
      createdAt: ev.createdAt,
    };

    this.rawHistory.push(rawRecord);
    if (this.rawHistory.length > MAX_RAW_HISTORY) {
      this.rawHistory = this.rawHistory.slice(-MAX_RAW_HISTORY);
    }
    this.persistRawHistory();
    this.notifyListeners();
  }

  public async flush(useKeepalive = false) {
    if (!this.initialized || this.queue.length === 0) return;
    const batch = this.queue.splice(0, 45);
    if (!this.cachedEnvInfo) {
      this.cachedEnvInfo = detectEnvironmentInfo();
    }
    const env = this.cachedEnvInfo;
    const colorScheme =
      typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
        ? 'dark'
        : 'light';

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
        deviceType: env.deviceType,
        browser: env.browser,
        os: env.os,
        screenResolution: env.screenResolution,
        referrer: typeof document !== 'undefined' ? document.referrer || null : null,
        timezone: env.timezone,
        language: env.language,
        connectionType: env.connectionType,
        utmSource: env.utmSource,
        utmMedium: env.utmMedium,
        utmCampaign: env.utmCampaign,
        colorScheme,
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
    if (this.boundPointerActivityHandler) {
      window.removeEventListener('pointerdown', this.boundPointerActivityHandler);
      window.removeEventListener('keydown', this.boundPointerActivityHandler);
    }
    if (this.boundVisibilityHandler) {
      document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
    }
    if (this.boundUnloadHandler) {
      window.removeEventListener('pagehide', this.boundUnloadHandler);
    }
    if (this.scrollRafId !== null) {
      cancelAnimationFrame(this.scrollRafId);
      this.scrollRafId = null;
    }
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.initialized = false;
  }
}

export const activityTracker = new ActivityTrackerEngine();
