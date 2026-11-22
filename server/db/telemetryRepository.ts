import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { supabaseServer, isSupabaseServerConfigured } from '../lib/supabase-server.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_TELEMETRY_FILE = path.resolve(__dirname, '..', '..', 'szmc-telemetry-store.json');

export const ALLOWED_TELEMETRY_EVENT_TYPES = new Set([
  'session_start',
  'session_heartbeat',
  'page_view',
  'page_leave',
  'click',
  'rage_click',
  'scroll_milestone',
  'search',
  'profile_view',
  'post_interaction',
  'ad_impression',
  'ad_click',
] as const);

export type TelemetryEventType =
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

export interface TelemetrySessionRecord {
  session_id: string;
  profile_id: number | null;
  auth_user_id: string | null;
  user_name: string;
  user_email: string | null;
  batch_year: number | null;
  specialty: string | null;
  city: string | null;
  country: string | null;
  device_type: 'mobile' | 'tablet' | 'desktop';
  browser: string;
  os: string;
  screen_resolution: string | null;
  referrer: string | null;
  timezone: string | null;
  language: string | null;
  connection_type: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  color_scheme: string | null;
  current_route: string;
  started_at: string;
  last_active_at: string;
  total_duration_sec: number;
  total_clicks: number;
  rage_clicks: number;
  total_page_views: number;
  max_scroll_pct: number;
  is_active: boolean;
}

export interface TelemetryEventRecord {
  id: string;
  session_id: string;
  profile_id: number | null;
  auth_user_id: string | null;
  user_name: string;
  event_type: TelemetryEventType;
  route: string;
  route_label: string;
  element_tag: string | null;
  element_label: string | null;
  element_section: string | null;
  click_x_pct: number | null;
  click_y_pct: number | null;
  duration_sec: number;
  scroll_depth_pct: number;
  metadata: Record<string, any>;
  created_at: string;
}

export interface AdAudienceSegment {
  id: string;
  name: string;
  description: string;
  target_routes: string[];
  target_interests: string[];
  target_devices: string[];
  min_clicks: number;
  min_dwell_sec: number;
  min_batch: number | null;
  max_batch: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface LocalTelemetryStore {
  sessions: Record<string, TelemetrySessionRecord>;
  events: TelemetryEventRecord[];
  segments: AdAudienceSegment[];
}

const MAX_LOCAL_EVENTS = 8000;
const MAX_LOCAL_SESSIONS = 2000;
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

const ROUTE_INTEREST_MAP: Record<string, string> = {
  feed: 'Community & Newsfeed',
  dashboard: 'Community & Newsfeed',
  alumni: 'Alumni Networking',
  directory: 'Alumni Networking',
  find: 'Alumni Search & Lookup',
  batches: 'Batch Cohorts',
  map: 'Global Physicians Map',
  'map-directory': 'Global Physicians Map',
  careers: 'Medical Careers & Recruitment',
  mentorship: 'Mentorship & Coaching',
  events: 'Reunions & CME Events',
  gallery: 'Campus Heritage & Media',
  messages: 'Direct Messaging',
  emergency: 'Blood Donation & Emergency',
  blood: 'Blood Donation & Emergency',
  'blood-network': 'Blood Donation & Emergency',
  profile: 'Doctor Profiles',
  saved: 'Saved Posts & Resources',
  settings: 'Account & Personalization',
  contact: 'Institutional Support',
  admin: 'Admin Operations',
  landing: 'Portal Discovery',
};

const ROUTE_LABELS: Record<string, string> = {
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
  entry: 'Direct Entry',
  exit: 'Session Exit',
};

let store: LocalTelemetryStore = {
  sessions: {},
  events: [],
  segments: [
    {
      id: 'seg-high-engagement-feed',
      name: 'High-Engagement Feed Readers',
      description: 'Alumni who actively browse The Quad feed with 5+ clicks and 60s+ dwell time.',
      target_routes: ['feed', 'dashboard'],
      target_interests: ['Community & Newsfeed'],
      target_devices: [],
      min_clicks: 5,
      min_dwell_sec: 60,
      min_batch: null,
      max_batch: null,
      created_by: 'System Preset',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'seg-career-seekers',
      name: 'Medical Careers & Fellowship Prospects',
      description: 'Doctors spending time on Medical Careers or Mentorship pages (ideal for hospital & CME ads).',
      target_routes: ['careers', 'mentorship'],
      target_interests: ['Medical Careers & Recruitment', 'Mentorship & Coaching'],
      target_devices: [],
      min_clicks: 2,
      min_dwell_sec: 30,
      min_batch: null,
      max_batch: null,
      created_by: 'System Preset',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'seg-events-reunion',
      name: 'Events, Reunions & Heritage Enthusiasts',
      description: 'Members engaging with Events and Gallery albums (ideal for sponsorship & event tickets).',
      target_routes: ['events', 'gallery'],
      target_interests: ['Reunions & CME Events', 'Campus Heritage & Media'],
      target_devices: [],
      min_clicks: 2,
      min_dwell_sec: 20,
      min_batch: null,
      max_batch: null,
      created_by: 'System Preset',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
};

let supabaseTablesAvailable: boolean | null = null;
let flushDiskTimer: ReturnType<typeof setTimeout> | null = null;

function loadLocalStore() {
  try {
    if (existsSync(LOCAL_TELEMETRY_FILE)) {
      const raw = readFileSync(LOCAL_TELEMETRY_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        store = {
          sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
          events: Array.isArray(parsed.events) ? parsed.events.slice(0, MAX_LOCAL_EVENTS) : [],
          segments:
            Array.isArray(parsed.segments) && parsed.segments.length > 0
              ? parsed.segments
              : store.segments,
        };
      }
    }
  } catch (err) {
    console.warn('[Telemetry] Could not load local telemetry store:', err);
  }
}

function scheduleDiskFlush() {
  if (flushDiskTimer) return;
  flushDiskTimer = setTimeout(() => {
    flushDiskTimer = null;
    try {
      const sessionKeys = Object.keys(store.sessions);
      if (sessionKeys.length > MAX_LOCAL_SESSIONS) {
        const sorted = sessionKeys.sort((a, b) =>
          (store.sessions[b]?.last_active_at || '').localeCompare(store.sessions[a]?.last_active_at || '')
        );
        const keep = new Set(sorted.slice(0, MAX_LOCAL_SESSIONS));
        for (const k of sessionKeys) {
          if (!keep.has(k)) delete store.sessions[k];
        }
      }
      writeFileSync(LOCAL_TELEMETRY_FILE, JSON.stringify(store), 'utf-8');
    } catch (err) {
      console.warn('[Telemetry] Disk flush skipped:', err);
    }
  }, 1500);
}

loadLocalStore();

function clampString(val: unknown, maxLen: number): string | null {
  if (typeof val !== 'string') return null;
  const cleaned = val.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLen);
}

function clampInt(val: unknown, min: number, max: number, fallback = 0): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function clampFloat(val: unknown, min: number, max: number): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  if (!Number.isFinite(num)) return null;
  return Math.round(Math.max(min, Math.min(max, num)) * 100) / 100;
}

export function getRouteLabel(route: string): string {
  const normalized = (route || 'landing').split(':')[0].split('?')[0].toLowerCase().trim();
  return ROUTE_LABELS[normalized] || normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function getRouteInterest(route: string): string {
  const normalized = (route || 'landing').split(':')[0].split('?')[0].toLowerCase().trim();
  return ROUTE_INTEREST_MAP[normalized] || 'General Portal Activity';
}

export interface IngestBatchInput {
  session: {
    sessionId: string;
    profileId?: number | null;
    authUserId?: string | null;
    userName?: string;
    userEmail?: string | null;
    batchYear?: number | null;
    specialty?: string | null;
    city?: string | null;
    country?: string | null;
    deviceType?: string;
    browser?: string;
    os?: string;
    screenResolution?: string | null;
    referrer?: string | null;
    timezone?: string | null;
    language?: string | null;
    connectionType?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    colorScheme?: string | null;
    currentRoute?: string;
  };
  events: Array<{
    eventType: string;
    route?: string;
    routeLabel?: string;
    elementTag?: string | null;
    elementLabel?: string | null;
    elementSection?: string | null;
    clickXPct?: number | null;
    clickYPct?: number | null;
    durationSec?: number;
    scrollDepthPct?: number;
    metadata?: Record<string, any>;
    createdAt?: string;
  }>;
}

export async function ingestTelemetryBatch(
  input: IngestBatchInput,
  verifiedDbUser?: {
    id: number;
    uid: string;
    email: string;
    fullName: string;
  } | null
): Promise<{ accepted: number; supabaseSynced: boolean }> {
  const sessionId = clampString(input?.session?.sessionId, 80);
  if (!sessionId) {
    return { accepted: 0, supabaseSynced: false };
  }

  const rawEvents = Array.isArray(input.events) ? input.events.slice(0, 50) : [];
  const nowIso = new Date().toISOString();

  const profileId =
    verifiedDbUser?.id ??
    (Number.isFinite(Number(input.session.profileId)) && Number(input.session.profileId) > 0
      ? Number(input.session.profileId)
      : null);
  const authUserId = verifiedDbUser?.uid || clampString(input.session.authUserId, 80);
  const userName =
    verifiedDbUser?.fullName ||
    clampString(input.session.userName, 80) ||
    'Guest Visitor';
  const userEmail = verifiedDbUser?.email || clampString(input.session.userEmail, 120);

  const rawDevice = (input.session.deviceType || 'desktop').toLowerCase();
  const deviceType: 'mobile' | 'tablet' | 'desktop' =
    rawDevice === 'mobile' ? 'mobile' : rawDevice === 'tablet' ? 'tablet' : 'desktop';

  const existing = store.sessions[sessionId];
  const sessionRecord: TelemetrySessionRecord = {
    session_id: sessionId,
    profile_id: profileId ?? existing?.profile_id ?? null,
    auth_user_id: authUserId ?? existing?.auth_user_id ?? null,
    user_name: userName !== 'Guest Visitor' ? userName : existing?.user_name || 'Guest Visitor',
    user_email: userEmail ?? existing?.user_email ?? null,
    batch_year:
      input.session.batchYear && Number.isFinite(Number(input.session.batchYear))
        ? clampInt(input.session.batchYear, 1, 100)
        : existing?.batch_year ?? null,
    specialty: clampString(input.session.specialty, 80) ?? existing?.specialty ?? null,
    city: clampString(input.session.city, 60) ?? existing?.city ?? null,
    country: clampString(input.session.country, 60) ?? existing?.country ?? null,
    device_type: deviceType,
    browser: clampString(input.session.browser, 40) || existing?.browser || 'Unknown',
    os: clampString(input.session.os, 40) || existing?.os || 'Unknown',
    screen_resolution: clampString(input.session.screenResolution, 30) ?? existing?.screen_resolution ?? null,
    referrer: clampString(input.session.referrer, 160) ?? existing?.referrer ?? null,
    timezone: clampString(input.session.timezone, 60) ?? existing?.timezone ?? null,
    language: clampString(input.session.language, 30) ?? existing?.language ?? null,
    connection_type: clampString(input.session.connectionType, 30) ?? existing?.connection_type ?? null,
    utm_source: clampString(input.session.utmSource, 60) ?? existing?.utm_source ?? null,
    utm_medium: clampString(input.session.utmMedium, 60) ?? existing?.utm_medium ?? null,
    utm_campaign: clampString(input.session.utmCampaign, 80) ?? existing?.utm_campaign ?? null,
    color_scheme: clampString(input.session.colorScheme, 20) ?? existing?.color_scheme ?? null,
    current_route: clampString(input.session.currentRoute, 80) || existing?.current_route || 'landing',
    started_at: existing?.started_at || nowIso,
    last_active_at: nowIso,
    total_duration_sec: existing?.total_duration_sec || 0,
    total_clicks: existing?.total_clicks || 0,
    rage_clicks: existing?.rage_clicks || 0,
    total_page_views: existing?.total_page_views || 0,
    max_scroll_pct: existing?.max_scroll_pct || 0,
    is_active: true,
  };

  const sanitizedEvents: TelemetryEventRecord[] = [];

  for (const ev of rawEvents) {
    if (!ev || typeof ev.eventType !== 'string' || !ALLOWED_TELEMETRY_EVENT_TYPES.has(ev.eventType as any)) {
      continue;
    }
    const eventType = ev.eventType as TelemetryEventType;
    const route = clampString(ev.route, 80) || sessionRecord.current_route || 'landing';
    const routeLabel = clampString(ev.routeLabel, 80) || getRouteLabel(route);
    const durationSec = clampInt(ev.durationSec, 0, 7200, 0);
    const scrollDepthPct = clampInt(ev.scrollDepthPct, 0, 100, 0);

    const safeMetadata: Record<string, any> = {};
    if (ev.metadata && typeof ev.metadata === 'object' && !Array.isArray(ev.metadata)) {
      let count = 0;
      for (const [k, v] of Object.entries(ev.metadata)) {
        if (count >= 10) break;
        const cleanKey = clampString(k, 40);
        if (!cleanKey || /pass|token|secret|auth|cookie/i.test(cleanKey)) continue;
        if (typeof v === 'string') safeMetadata[cleanKey] = clampString(v, 140);
        else if (typeof v === 'number' && Number.isFinite(v)) safeMetadata[cleanKey] = v;
        else if (typeof v === 'boolean') safeMetadata[cleanKey] = v;
        count += 1;
      }
    }

    const record: TelemetryEventRecord = {
      id: `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      session_id: sessionId,
      profile_id: sessionRecord.profile_id,
      auth_user_id: sessionRecord.auth_user_id,
      user_name: sessionRecord.user_name,
      event_type: eventType,
      route,
      route_label: routeLabel,
      element_tag: clampString(ev.elementTag, 30),
      element_label: clampString(ev.elementLabel, 90),
      element_section: clampString(ev.elementSection, 80),
      click_x_pct: clampFloat(ev.clickXPct, 0, 100),
      click_y_pct: clampFloat(ev.clickYPct, 0, 100),
      duration_sec: durationSec,
      scroll_depth_pct: scrollDepthPct,
      metadata: safeMetadata,
      created_at:
        typeof ev.createdAt === 'string' && !Number.isNaN(Date.parse(ev.createdAt))
          ? ev.createdAt
          : nowIso,
    };

    sanitizedEvents.push(record);

    if (eventType === 'click' || eventType === 'ad_click' || eventType === 'post_interaction') {
      sessionRecord.total_clicks += 1;
    }
    if (eventType === 'rage_click') {
      sessionRecord.total_clicks += 1;
      sessionRecord.rage_clicks += 1;
    }
    if (eventType === 'page_view') {
      sessionRecord.total_page_views += 1;
      sessionRecord.current_route = route;
    }
    if (eventType === 'page_leave' || eventType === 'session_heartbeat') {
      sessionRecord.total_duration_sec += durationSec;
    }
    if (scrollDepthPct > sessionRecord.max_scroll_pct) {
      sessionRecord.max_scroll_pct = scrollDepthPct;
    }
  }

  store.sessions[sessionId] = sessionRecord;
  if (sanitizedEvents.length > 0) {
    store.events = [...sanitizedEvents.reverse(), ...store.events].slice(0, MAX_LOCAL_EVENTS);
  }
  scheduleDiskFlush();

  let supabaseSynced = false;
  if (isSupabaseServerConfigured && supabaseTablesAvailable !== false) {
    try {
      const { error: sessErr } = await supabaseServer
        .from('user_activity_sessions')
        .upsert(
          {
            session_id: sessionRecord.session_id,
            profile_id: sessionRecord.profile_id,
            auth_user_id: isUuid(sessionRecord.auth_user_id) ? sessionRecord.auth_user_id : null,
            user_name: sessionRecord.user_name,
            user_email: sessionRecord.user_email,
            batch_year: sessionRecord.batch_year,
            specialty: sessionRecord.specialty,
            city: sessionRecord.city,
            country: sessionRecord.country,
            device_type: sessionRecord.device_type,
            browser: sessionRecord.browser,
            os: sessionRecord.os,
            screen_resolution: sessionRecord.screen_resolution,
            referrer: sessionRecord.referrer,
            timezone: sessionRecord.timezone,
            language: sessionRecord.language,
            connection_type: sessionRecord.connection_type,
            utm_source: sessionRecord.utm_source,
            utm_medium: sessionRecord.utm_medium,
            utm_campaign: sessionRecord.utm_campaign,
            color_scheme: sessionRecord.color_scheme,
            current_route: sessionRecord.current_route,
            started_at: sessionRecord.started_at,
            last_active_at: sessionRecord.last_active_at,
            total_duration_sec: sessionRecord.total_duration_sec,
            total_clicks: sessionRecord.total_clicks,
            rage_clicks: sessionRecord.rage_clicks,
            total_page_views: sessionRecord.total_page_views,
            max_scroll_pct: sessionRecord.max_scroll_pct,
            is_active: true,
          },
          { onConflict: 'session_id' }
        );

      if (sessErr) {
        if (isMissingRelationError(sessErr)) {
          supabaseTablesAvailable = false;
        }
      } else {
        supabaseTablesAvailable = true;
        if (sanitizedEvents.length > 0) {
          const rows = sanitizedEvents.map((e) => ({
            session_id: e.session_id,
            profile_id: e.profile_id,
            auth_user_id: isUuid(e.auth_user_id) ? e.auth_user_id : null,
            user_name: e.user_name,
            event_type: e.event_type,
            route: e.route,
            route_label: e.route_label,
            element_tag: e.element_tag,
            element_label: e.element_label,
            element_section: e.element_section,
            click_x_pct: e.click_x_pct,
            click_y_pct: e.click_y_pct,
            duration_sec: e.duration_sec,
            scroll_depth_pct: e.scroll_depth_pct,
            metadata: e.metadata,
            created_at: e.created_at,
          }));
          const { error: evErr } = await supabaseServer.from('user_activity_events').insert(rows);
          if (!evErr) {
            supabaseSynced = true;
          }
        } else {
          supabaseSynced = true;
        }
      }
    } catch {
      // Quiet local fallback
    }
  }

  return { accepted: sanitizedEvents.length, supabaseSynced };
}

function isUuid(val: string | null | undefined): boolean {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
}

function isMissingRelationError(err: any): boolean {
  const msg = String(err?.message || err?.code || '').toLowerCase();
  return msg.includes('does not exist') || msg.includes('42p01') || msg.includes('could not find the table');
}

async function fetchMergedTelemetryDataset(): Promise<{
  sessions: TelemetrySessionRecord[];
  events: TelemetryEventRecord[];
  supabaseConnected: boolean;
}> {
  const sessionsMap = new Map<string, TelemetrySessionRecord>();
  for (const s of Object.values(store.sessions)) {
    sessionsMap.set(s.session_id, s);
  }
  let eventsList: TelemetryEventRecord[] = [...store.events];
  let supabaseConnected = false;

  if (isSupabaseServerConfigured) {
    try {
      const [sessRes, evRes] = await Promise.all([
        supabaseServer
          .from('user_activity_sessions')
          .select('*')
          .order('last_active_at', { ascending: false })
          .limit(600),
        supabaseServer
          .from('user_activity_events')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(2500),
      ]);

      if (!sessRes.error && !evRes.error) {
        supabaseConnected = true;
        supabaseTablesAvailable = true;

        for (const row of (sessRes.data || []) as any[]) {
          sessionsMap.set(String(row.session_id), {
            session_id: String(row.session_id),
            profile_id: row.profile_id ? Number(row.profile_id) : null,
            auth_user_id: row.auth_user_id || null,
            user_name: row.user_name || 'Guest Visitor',
            user_email: row.user_email || null,
            batch_year: row.batch_year ? Number(row.batch_year) : null,
            specialty: row.specialty || null,
            city: row.city || null,
            country: row.country || null,
            device_type: (row.device_type || 'desktop') as 'mobile' | 'tablet' | 'desktop',
            browser: row.browser || 'Unknown',
            os: row.os || 'Unknown',
            screen_resolution: row.screen_resolution || null,
            referrer: row.referrer || null,
            timezone: row.timezone || null,
            language: row.language || null,
            connection_type: row.connection_type || null,
            utm_source: row.utm_source || null,
            utm_medium: row.utm_medium || null,
            utm_campaign: row.utm_campaign || null,
            color_scheme: row.color_scheme || null,
            current_route: row.current_route || 'landing',
            started_at: row.started_at,
            last_active_at: row.last_active_at,
            total_duration_sec: Number(row.total_duration_sec || 0),
            total_clicks: Number(row.total_clicks || 0),
            rage_clicks: Number(row.rage_clicks || 0),
            total_page_views: Number(row.total_page_views || 0),
            max_scroll_pct: Number(row.max_scroll_pct || 0),
            is_active: Boolean(row.is_active),
          });
        }

        const remoteEvents: TelemetryEventRecord[] = (evRes.data || []).map((e: any) => ({
          id: `sb-${e.id}`,
          session_id: String(e.session_id),
          profile_id: e.profile_id ? Number(e.profile_id) : null,
          auth_user_id: e.auth_user_id || null,
          user_name: e.user_name || 'Guest Visitor',
          event_type: e.event_type as TelemetryEventType,
          route: e.route || 'landing',
          route_label: e.route_label || getRouteLabel(e.route || 'landing'),
          element_tag: e.element_tag || null,
          element_label: e.element_label || null,
          element_section: e.element_section || null,
          click_x_pct: e.click_x_pct !== null && e.click_x_pct !== undefined ? Number(e.click_x_pct) : null,
          click_y_pct: e.click_y_pct !== null && e.click_y_pct !== undefined ? Number(e.click_y_pct) : null,
          duration_sec: Number(e.duration_sec || 0),
          scroll_depth_pct: Number(e.scroll_depth_pct || 0),
          metadata: e.metadata && typeof e.metadata === 'object' ? e.metadata : {},
          created_at: e.created_at,
        }));

        if (remoteEvents.length > 0) {
          eventsList = remoteEvents;
        }
      } else if (isMissingRelationError(sessRes.error) || isMissingRelationError(evRes.error)) {
        supabaseTablesAvailable = false;
      }
    } catch {
      // Keep local dataset
    }
  }

  const sessions = Array.from(sessionsMap.values()).sort((a, b) =>
    (b.last_active_at || '').localeCompare(a.last_active_at || '')
  );
  eventsList.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  return { sessions, events: eventsList, supabaseConnected };
}

export type UserLifecycleStage = 'Power User' | 'Active Regular' | 'Explorer' | 'At-Risk' | 'New Visitor';
export type ChurnRiskLevel = 'Low' | 'Medium' | 'High';

export interface MonitoredUserSummary {
  userKey: string;
  profileId: number | null;
  userName: string;
  userEmail: string | null;
  batchYear: number | null;
  specialty: string | null;
  city: string | null;
  country: string | null;
  isOnlineNow: boolean;
  lastActiveAt: string;
  currentRoute: string;
  currentRouteLabel: string;
  totalSessions: number;
  totalClicks: number;
  rageClicks: number;
  totalPageViews: number;
  totalDwellSec: number;
  maxScrollPct: number;
  topRoute: string;
  topRouteLabel: string;
  primaryDevice: string;
  browser: string;
  os: string;
  screenResolution: string | null;
  timezone: string | null;
  language: string | null;
  connectionType: string | null;
  utmSource: string | null;
  colorScheme: string | null;
  routesVisited: string[];
  engagementScore: number;
  lifecycleStage: UserLifecycleStage;
  churnRisk: ChurnRiskLevel;
  peakHourLabel: string;
  recommendedActions: string[];
  inferredInterests: Array<{ label: string; score: number }>;
  routeDwellBreakdown: Array<{ route: string; routeLabel: string; dwellSec: number; views: number; clicks: number }>;
}

function buildUserSummaries(
  sessions: TelemetrySessionRecord[],
  events: TelemetryEventRecord[]
): MonitoredUserSummary[] {
  const nowMs = Date.now();
  const userMap = new Map<
    string,
    {
      userKey: string;
      profileId: number | null;
      userName: string;
      userEmail: string | null;
      batchYear: number | null;
      specialty: string | null;
      city: string | null;
      country: string | null;
      lastActiveAt: string;
      currentRoute: string;
      sessionIds: Set<string>;
      totalClicks: number;
      rageClicks: number;
      totalPageViews: number;
      totalDwellSec: number;
      maxScrollPct: number;
      deviceCounts: Map<string, number>;
      browser: string;
      os: string;
      screenResolution: string | null;
      timezone: string | null;
      language: string | null;
      connectionType: string | null;
      utmSource: string | null;
      colorScheme: string | null;
      hourHistogram: number[];
      routeStats: Map<string, { dwellSec: number; views: number; clicks: number }>;
    }
  >();

  const keyFor = (profileId: number | null, email: string | null, sessionId: string) => {
    if (profileId && profileId > 0) return `profile:${profileId}`;
    if (email) return `email:${email.toLowerCase()}`;
    return `guest:${sessionId}`;
  };

  for (const s of sessions) {
    const key = keyFor(s.profile_id, s.user_email, s.session_id);
    let entry = userMap.get(key);
    if (!entry) {
      entry = {
        userKey: key,
        profileId: s.profile_id,
        userName: s.user_name,
        userEmail: s.user_email,
        batchYear: s.batch_year,
        specialty: s.specialty,
        city: s.city,
        country: s.country,
        lastActiveAt: s.last_active_at,
        currentRoute: s.current_route,
        sessionIds: new Set(),
        totalClicks: 0,
        rageClicks: 0,
        totalPageViews: 0,
        totalDwellSec: 0,
        maxScrollPct: 0,
        deviceCounts: new Map(),
        browser: s.browser,
        os: s.os,
        screenResolution: s.screen_resolution,
        timezone: s.timezone || null,
        language: s.language || null,
        connectionType: s.connection_type || null,
        utmSource: s.utm_source || null,
        colorScheme: s.color_scheme || null,
        hourHistogram: new Array(24).fill(0),
        routeStats: new Map(),
      };
      userMap.set(key, entry);
    }

    entry.sessionIds.add(s.session_id);
    if (s.last_active_at > entry.lastActiveAt) {
      entry.lastActiveAt = s.last_active_at;
      entry.currentRoute = s.current_route;
      entry.browser = s.browser;
      entry.os = s.os;
      if (s.screen_resolution) entry.screenResolution = s.screen_resolution;
      if (s.timezone) entry.timezone = s.timezone;
      if (s.language) entry.language = s.language;
      if (s.connection_type) entry.connectionType = s.connection_type;
      if (s.utm_source) entry.utmSource = s.utm_source;
      if (s.color_scheme) entry.colorScheme = s.color_scheme;
    }
    if (s.user_name && s.user_name !== 'Guest Visitor') entry.userName = s.user_name;
    if (s.user_email && !entry.userEmail) entry.userEmail = s.user_email;
    if (s.batch_year && !entry.batchYear) entry.batchYear = s.batch_year;
    if (s.specialty && !entry.specialty) entry.specialty = s.specialty;
    if (s.city && !entry.city) entry.city = s.city;
    if (s.country && !entry.country) entry.country = s.country;
    entry.totalClicks += s.total_clicks;
    entry.rageClicks += s.rage_clicks || 0;
    entry.totalPageViews += s.total_page_views;
    entry.totalDwellSec += s.total_duration_sec;
    entry.maxScrollPct = Math.max(entry.maxScrollPct, s.max_scroll_pct);
    entry.deviceCounts.set(s.device_type, (entry.deviceCounts.get(s.device_type) || 0) + 1);
  }

  const sessionToKey = new Map<string, string>();
  for (const s of sessions) {
    sessionToKey.set(s.session_id, keyFor(s.profile_id, s.user_email, s.session_id));
  }

  for (const ev of events) {
    const key = sessionToKey.get(ev.session_id) || keyFor(ev.profile_id, null, ev.session_id);
    const entry = userMap.get(key);
    if (!entry) continue;

    const evDate = new Date(ev.created_at);
    if (!Number.isNaN(evDate.getTime())) {
      entry.hourHistogram[evDate.getHours()] += 1;
    }

    const rKey = (ev.route || 'landing').split(':')[0].toLowerCase();
    const rStat = entry.routeStats.get(rKey) || { dwellSec: 0, views: 0, clicks: 0 };
    if (ev.event_type === 'page_view') rStat.views += 1;
    if (
      ev.event_type === 'click' ||
      ev.event_type === 'rage_click' ||
      ev.event_type === 'post_interaction' ||
      ev.event_type === 'ad_click'
    ) {
      rStat.clicks += 1;
    }
    if (ev.event_type === 'page_leave' || ev.event_type === 'session_heartbeat') {
      rStat.dwellSec += ev.duration_sec;
    }
    entry.routeStats.set(rKey, rStat);
  }

  const summaries: MonitoredUserSummary[] = [];

  for (const entry of userMap.values()) {
    const routeBreakdown = Array.from(entry.routeStats.entries())
      .map(([route, stats]) => ({
        route,
        routeLabel: getRouteLabel(route),
        dwellSec: stats.dwellSec,
        views: stats.views,
        clicks: stats.clicks,
      }))
      .sort((a, b) => b.dwellSec * 2 + b.clicks * 5 + b.views * 3 - (a.dwellSec * 2 + a.clicks * 5 + a.views * 3));

    const topRouteObj = routeBreakdown[0] || {
      route: entry.currentRoute || 'feed',
      routeLabel: getRouteLabel(entry.currentRoute || 'feed'),
    };

    const interestScores = new Map<string, number>();
    for (const r of routeBreakdown) {
      if (r.route === 'admin') continue;
      const interest = getRouteInterest(r.route);
      const pts = r.dwellSec * 1.5 + r.clicks * 8 + r.views * 4;
      interestScores.set(interest, (interestScores.get(interest) || 0) + pts);
    }
    const maxPts = Math.max(1, ...Array.from(interestScores.values()));
    const inferredInterests = Array.from(interestScores.entries())
      .map(([label, pts]) => ({
        label,
        score: Math.min(99, Math.max(15, Math.round((pts / maxPts) * 100))),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    let primaryDevice = 'desktop';
    let bestDeviceCount = -1;
    for (const [dev, cnt] of entry.deviceCounts.entries()) {
      if (cnt > bestDeviceCount) {
        bestDeviceCount = cnt;
        primaryDevice = dev;
      }
    }

    const lastMs = Date.parse(entry.lastActiveAt || '');
    const hoursSinceActive = Number.isFinite(lastMs) ? Math.max(0, (nowMs - lastMs) / 3600000) : 999;
    const isOnlineNow = Number.isFinite(lastMs) && nowMs - lastMs <= ONLINE_WINDOW_MS;

    // Decision-Intelligence Scoring (0-100)
    const recencyPts = hoursSinceActive <= 24 ? 25 : hoursSinceActive <= 72 ? 18 : hoursSinceActive <= 168 ? 10 : 3;
    const sessionPts = Math.min(20, entry.sessionIds.size * 6);
    const clickPts = Math.min(25, entry.totalClicks * 1.4);
    const dwellPts = Math.min(20, (entry.totalDwellSec / 60) * 3.5);
    const scrollPts = Math.min(10, (entry.maxScrollPct / 100) * 10);
    const engagementScore = Math.min(100, Math.round(recencyPts + sessionPts + clickPts + dwellPts + scrollPts));

    let lifecycleStage: UserLifecycleStage = 'New Visitor';
    if (hoursSinceActive > 168 && entry.totalClicks >= 3) {
      lifecycleStage = 'At-Risk';
    } else if (engagementScore >= 72) {
      lifecycleStage = 'Power User';
    } else if (engagementScore >= 45) {
      lifecycleStage = 'Active Regular';
    } else if (entry.totalPageViews >= 3 || entry.totalClicks >= 3) {
      lifecycleStage = 'Explorer';
    }

    const churnRisk: ChurnRiskLevel =
      hoursSinceActive > 168 ? 'High' : hoursSinceActive > 48 || engagementScore < 35 ? 'Medium' : 'Low';

    // Peak Activity Hour
    let bestHour = 0;
    let bestHourCount = -1;
    entry.hourHistogram.forEach((cnt, hr) => {
      if (cnt > bestHourCount) {
        bestHourCount = cnt;
        bestHour = hr;
      }
    });
    const peakHourLabel =
      bestHourCount > 0
        ? `${String(bestHour).padStart(2, '0')}:00–${String((bestHour + 2) % 24).padStart(2, '0')}:00`
        : 'Not enough data';

    // Concrete Decision Recommendations
    const recommendedActions: string[] = [];
    if (inferredInterests[0]) {
      recommendedActions.push(
        `Target with "${inferredInterests[0].label}" campaigns (${inferredInterests[0].score}% behavioral fit).`
      );
    }
    if (bestHourCount > 0) {
      recommendedActions.push(`Best delivery window for ads & notices: ${peakHourLabel}.`);
    }
    if (churnRisk === 'High') {
      recommendedActions.push('Dormant >7 days — include in re-engagement digest or reunion email.');
    } else if (lifecycleStage === 'Power User') {
      recommendedActions.push('High-influence member — strong candidate for ambassador/sponsor outreach.');
    }
    if (entry.rageClicks > 0) {
      recommendedActions.push(
        `Experienced ${entry.rageClicks} rage-click friction event(s) — review UX on ${topRouteObj.routeLabel}.`
      );
    }

    summaries.push({
      userKey: entry.userKey,
      profileId: entry.profileId,
      userName: entry.userName,
      userEmail: entry.userEmail,
      batchYear: entry.batchYear,
      specialty: entry.specialty,
      city: entry.city,
      country: entry.country,
      isOnlineNow,
      lastActiveAt: entry.lastActiveAt,
      currentRoute: entry.currentRoute,
      currentRouteLabel: getRouteLabel(entry.currentRoute),
      totalSessions: entry.sessionIds.size,
      totalClicks: entry.totalClicks,
      rageClicks: entry.rageClicks,
      totalPageViews: entry.totalPageViews,
      totalDwellSec: entry.totalDwellSec,
      maxScrollPct: entry.maxScrollPct,
      topRoute: topRouteObj.route,
      topRouteLabel: topRouteObj.routeLabel,
      primaryDevice,
      browser: entry.browser,
      os: entry.os,
      screenResolution: entry.screenResolution,
      timezone: entry.timezone,
      language: entry.language,
      connectionType: entry.connectionType,
      utmSource: entry.utmSource,
      colorScheme: entry.colorScheme,
      routesVisited: routeBreakdown.map((r) => r.route),
      engagementScore,
      lifecycleStage,
      churnRisk,
      peakHourLabel,
      recommendedActions: recommendedActions.slice(0, 3),
      inferredInterests,
      routeDwellBreakdown: routeBreakdown,
    });
  }

  return summaries.sort((a, b) => {
    if (a.isOnlineNow !== b.isOnlineNow) return a.isOnlineNow ? -1 : 1;
    return (b.lastActiveAt || '').localeCompare(a.lastActiveAt || '');
  });
}

export async function getTelemetryOverview(rangeHours = 168) {
  const { sessions, events, supabaseConnected } = await fetchMergedTelemetryDataset();
  const cutoffMs = rangeHours > 0 ? Date.now() - rangeHours * 3600 * 1000 : 0;

  const filteredSessions = cutoffMs
    ? sessions.filter((s) => Date.parse(s.last_active_at || '') >= cutoffMs)
    : sessions;
  const filteredEvents = cutoffMs
    ? events.filter((e) => Date.parse(e.created_at || '') >= cutoffMs)
    : events;

  const users = buildUserSummaries(filteredSessions, filteredEvents);
  const onlineNowCount = users.filter((u) => u.isOnlineNow).length;

  const totalClicks = filteredSessions.reduce((acc, s) => acc + s.total_clicks, 0);
  const totalRageClicks = filteredSessions.reduce((acc, s) => acc + (s.rage_clicks || 0), 0);
  const totalPageViews = filteredSessions.reduce((acc, s) => acc + s.total_page_views, 0);
  const totalDwellSec = filteredSessions.reduce((acc, s) => acc + s.total_duration_sec, 0);
  const avgSessionSec = filteredSessions.length > 0 ? Math.round(totalDwellSec / filteredSessions.length) : 0;
  const avgEngagementScore =
    users.length > 0 ? Math.round(users.reduce((acc, u) => acc + u.engagementScore, 0) / users.length) : 0;

  // Route performance breakdown
  const routeMap = new Map<
    string,
    { route: string; routeLabel: string; views: number; clicks: number; dwellSec: number; uniqueUsers: Set<string> }
  >();
  for (const ev of filteredEvents) {
    const r = (ev.route || 'landing').split(':')[0].toLowerCase();
    let item = routeMap.get(r);
    if (!item) {
      item = {
        route: r,
        routeLabel: getRouteLabel(r),
        views: 0,
        clicks: 0,
        dwellSec: 0,
        uniqueUsers: new Set(),
      };
      routeMap.set(r, item);
    }
    item.uniqueUsers.add(ev.profile_id ? `p:${ev.profile_id}` : ev.session_id);
    if (ev.event_type === 'page_view') item.views += 1;
    if (
      ev.event_type === 'click' ||
      ev.event_type === 'rage_click' ||
      ev.event_type === 'post_interaction' ||
      ev.event_type === 'ad_click'
    ) {
      item.clicks += 1;
    }
    if (ev.event_type === 'page_leave' || ev.event_type === 'session_heartbeat') {
      item.dwellSec += ev.duration_sec;
    }
  }

  const routeMetrics = Array.from(routeMap.values())
    .map((r) => ({
      route: r.route,
      routeLabel: r.routeLabel,
      views: r.views,
      clicks: r.clicks,
      dwellSec: r.dwellSec,
      uniqueUsers: r.uniqueUsers.size,
      avgDwellSec: r.views > 0 ? Math.round(r.dwellSec / r.views) : r.dwellSec,
    }))
    .sort((a, b) => b.dwellSec + b.clicks * 4 + b.views * 2 - (a.dwellSec + a.clicks * 4 + a.views * 2));

  // Top Clicked UI Hotspots
  const hotspotMap = new Map<
    string,
    { label: string; tag: string; route: string; routeLabel: string; section: string; clicks: number; lastClickedAt: string }
  >();
  for (const ev of filteredEvents) {
    if (
      ev.event_type !== 'click' &&
      ev.event_type !== 'rage_click' &&
      ev.event_type !== 'post_interaction' &&
      ev.event_type !== 'ad_click'
    ) {
      continue;
    }
    const label = ev.element_label || ev.element_tag || 'Interactive Element';
    const route = (ev.route || 'landing').split(':')[0].toLowerCase();
    const key = `${route}::${label.toLowerCase()}`;
    const existing = hotspotMap.get(key);
    if (!existing) {
      hotspotMap.set(key, {
        label,
        tag: ev.element_tag || 'button',
        route,
        routeLabel: getRouteLabel(route),
        section: ev.element_section || getRouteLabel(route),
        clicks: 1,
        lastClickedAt: ev.created_at,
      });
    } else {
      existing.clicks += 1;
      if (ev.created_at > existing.lastClickedAt) existing.lastClickedAt = ev.created_at;
    }
  }

  const totalHotspotClicks = Math.max(
    1,
    Array.from(hotspotMap.values()).reduce((sum, h) => sum + h.clicks, 0)
  );
  const topClickHotspots = Array.from(hotspotMap.values())
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 15)
    .map((h) => ({
      ...h,
      sharePct: Math.round((h.clicks / totalHotspotClicks) * 1000) / 10,
    }));

  // Click Heatmap Points (for visual 2D viewport heatmap)
  const heatmapPoints = filteredEvents
    .filter(
      (ev) =>
        (ev.event_type === 'click' || ev.event_type === 'rage_click') &&
        ev.click_x_pct !== null &&
        ev.click_y_pct !== null
    )
    .slice(0, 400)
    .map((ev) => ({
      route: (ev.route || 'landing').split(':')[0].toLowerCase(),
      routeLabel: ev.route_label,
      xPct: ev.click_x_pct!,
      yPct: ev.click_y_pct!,
      isRage: ev.event_type === 'rage_click',
      label: ev.element_label || ev.element_tag || 'Click',
    }));

  // Navigation Journey Flows (fromRoute -> toRoute)
  const flowMap = new Map<string, { from: string; fromLabel: string; to: string; toLabel: string; count: number }>();
  for (const ev of filteredEvents) {
    if (ev.event_type === 'page_view' && ev.metadata?.fromRoute) {
      const from = String(ev.metadata.fromRoute).split(':')[0].toLowerCase();
      const to = (ev.route || 'landing').split(':')[0].toLowerCase();
      if (from === to) continue;
      const key = `${from}->${to}`;
      const existing = flowMap.get(key);
      if (existing) existing.count += 1;
      else {
        flowMap.set(key, {
          from,
          fromLabel: getRouteLabel(from),
          to,
          toLabel: getRouteLabel(to),
          count: 1,
        });
      }
    }
  }
  const navigationFlows = Array.from(flowMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // Rage-click UX Friction Alerts
  const rageMap = new Map<string, { label: string; routeLabel: string; count: number; lastSeen: string }>();
  for (const ev of filteredEvents) {
    if (ev.event_type !== 'rage_click') continue;
    const label = ev.element_label || ev.element_tag || 'Unresponsive Element';
    const key = `${ev.route}::${label}`;
    const existing = rageMap.get(key);
    if (existing) {
      existing.count += 1;
      if (ev.created_at > existing.lastSeen) existing.lastSeen = ev.created_at;
    } else {
      rageMap.set(key, { label, routeLabel: ev.route_label, count: 1, lastSeen: ev.created_at });
    }
  }
  const rageClickAlerts = Array.from(rageMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Lifecycle Cohort Distribution
  const lifecycleCounts: Record<UserLifecycleStage, number> = {
    'Power User': 0,
    'Active Regular': 0,
    Explorer: 0,
    'At-Risk': 0,
    'New Visitor': 0,
  };
  for (const u of users) {
    lifecycleCounts[u.lifecycleStage] += 1;
  }
  const lifecycleDistribution = Object.entries(lifecycleCounts).map(([stage, count]) => ({
    stage,
    count,
  }));

  // Peak Activity Hour Distribution (8 x 3-hour blocks across all events)
  const peakBlocks = [
    { label: '00–03', start: 0, events: 0 },
    { label: '03–06', start: 3, events: 0 },
    { label: '06–09', start: 6, events: 0 },
    { label: '09–12', start: 9, events: 0 },
    { label: '12–15', start: 12, events: 0 },
    { label: '15–18', start: 15, events: 0 },
    { label: '18–21', start: 18, events: 0 },
    { label: '21–24', start: 21, events: 0 },
  ];
  for (const ev of filteredEvents) {
    const d = new Date(ev.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const idx = Math.floor(d.getHours() / 3);
    if (peakBlocks[idx]) peakBlocks[idx].events += 1;
  }

  // Acquisition & Environment Signals
  const utmMap = new Map<string, number>();
  const tzMap = new Map<string, number>();
  const langMap = new Map<string, number>();
  for (const s of filteredSessions) {
    const src = s.utm_source || (s.referrer ? safeHost(s.referrer) : 'Direct / Portal');
    utmMap.set(src, (utmMap.get(src) || 0) + 1);
    if (s.timezone) tzMap.set(s.timezone, (tzMap.get(s.timezone) || 0) + 1);
    if (s.language) langMap.set(s.language, (langMap.get(s.language) || 0) + 1);
  }
  const acquisitionSources = Array.from(utmMap.entries())
    .map(([source, sessionsCount]) => ({ source, sessions: sessionsCount }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 8);
  const topTimezones = Array.from(tzMap.entries())
    .map(([timezone, count]) => ({ timezone, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const topLanguages = Array.from(langMap.entries())
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Hourly activity buckets (last 24h)
  const hourlyMap = new Map<string, { label: string; clicks: number; pageViews: number; dwellMin: number }>();
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const slot = new Date(now.getTime() - i * 2 * 3600 * 1000);
    const key = `${slot.getFullYear()}-${slot.getMonth()}-${slot.getDate()}-${Math.floor(slot.getHours() / 2)}`;
    const hourStr = `${String(Math.floor(slot.getHours() / 2) * 2).padStart(2, '0')}:00`;
    hourlyMap.set(key, { label: hourStr, clicks: 0, pageViews: 0, dwellMin: 0 });
  }
  for (const ev of filteredEvents) {
    const d = new Date(ev.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${Math.floor(d.getHours() / 2)}`;
    const bucket = hourlyMap.get(key);
    if (!bucket) continue;
    if (ev.event_type === 'click' || ev.event_type === 'rage_click' || ev.event_type === 'post_interaction') {
      bucket.clicks += 1;
    }
    if (ev.event_type === 'page_view') bucket.pageViews += 1;
    if (ev.event_type === 'page_leave' || ev.event_type === 'session_heartbeat') {
      bucket.dwellMin = Math.round((bucket.dwellMin + ev.duration_sec / 60) * 10) / 10;
    }
  }

  // Device breakdown
  const deviceCounts: Record<string, number> = { desktop: 0, mobile: 0, tablet: 0 };
  for (const s of filteredSessions) {
    deviceCounts[s.device_type] = (deviceCounts[s.device_type] || 0) + 1;
  }
  const deviceBreakdown = Object.entries(deviceCounts).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    key: name,
    value,
  }));

  // Interest affinity distribution
  const interestTotals = new Map<string, number>();
  for (const u of users) {
    for (const intr of u.inferredInterests) {
      interestTotals.set(intr.label, (interestTotals.get(intr.label) || 0) + 1);
    }
  }
  const audienceInterests = Array.from(interestTotals.entries())
    .map(([interest, userCount]) => ({ interest, userCount }))
    .sort((a, b) => b.userCount - a.userCount);

  return {
    supabaseConnected,
    kpis: {
      trackedUsers: users.length,
      onlineNow: onlineNowCount,
      totalSessions: filteredSessions.length,
      totalEvents: filteredEvents.length,
      totalClicks,
      totalRageClicks,
      totalPageViews,
      totalDwellSec,
      avgSessionSec,
      avgEngagementScore,
    },
    routeMetrics,
    topClickHotspots,
    heatmapPoints,
    navigationFlows,
    rageClickAlerts,
    lifecycleDistribution,
    peakBlocks,
    acquisitionSources,
    topTimezones,
    topLanguages,
    activityTimeline: Array.from(hourlyMap.values()),
    deviceBreakdown,
    audienceInterests,
    users,
    recentEvents: filteredEvents.slice(0, 140),
    segments: await listAdSegments(users),
  };
}

function safeHost(urlStr: string): string {
  try {
    return new URL(urlStr).hostname || 'Referral';
  } catch {
    return urlStr.slice(0, 40) || 'Referral';
  }
}

export async function getUserTelemetryDossier(userKey: string) {
  const { sessions, events, supabaseConnected } = await fetchMergedTelemetryDataset();
  const users = buildUserSummaries(sessions, events);
  const summary = users.find((u) => u.userKey === userKey || String(u.profileId) === userKey);

  if (!summary) {
    return null;
  }

  const matchingSessionIds = new Set(
    sessions
      .filter((s) => {
        if (summary.profileId && s.profile_id === summary.profileId) return true;
        if (summary.userEmail && s.user_email?.toLowerCase() === summary.userEmail.toLowerCase()) return true;
        return `guest:${s.session_id}` === summary.userKey;
      })
      .map((s) => s.session_id)
  );

  const userSessions = sessions.filter((s) => matchingSessionIds.has(s.session_id));
  const userEvents = events.filter(
    (e) => matchingSessionIds.has(e.session_id) || (summary.profileId && e.profile_id === summary.profileId)
  );

  const searchTerms = userEvents
    .filter((e) => e.event_type === 'search' && e.metadata?.query)
    .map((e) => ({
      query: String(e.metadata.query),
      route: e.route_label,
      createdAt: e.created_at,
    }))
    .slice(0, 20);

  const clickMap = new Map<string, { label: string; routeLabel: string; count: number }>();
  for (const ev of userEvents) {
    if (ev.event_type !== 'click' && ev.event_type !== 'rage_click' && ev.event_type !== 'post_interaction') {
      continue;
    }
    const label = ev.element_label || ev.element_tag || 'Element';
    const key = `${ev.route}::${label}`;
    const item = clickMap.get(key);
    if (item) item.count += 1;
    else clickMap.set(key, { label, routeLabel: ev.route_label, count: 1 });
  }

  return {
    supabaseConnected,
    summary,
    sessions: userSessions.slice(0, 30),
    timeline: userEvents.slice(0, 200),
    searchTerms,
    topClicks: Array.from(clickMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
  };
}

export function matchUsersForSegment(
  users: MonitoredUserSummary[],
  segment: Pick<
    AdAudienceSegment,
    'target_routes' | 'target_interests' | 'target_devices' | 'min_clicks' | 'min_dwell_sec' | 'min_batch' | 'max_batch'
  >
): MonitoredUserSummary[] {
  return users.filter((u) => {
    if (segment.min_clicks > 0 && u.totalClicks < segment.min_clicks) return false;
    if (segment.min_dwell_sec > 0 && u.totalDwellSec < segment.min_dwell_sec) return false;
    if (segment.min_batch !== null && segment.min_batch !== undefined) {
      if (!u.batchYear || u.batchYear < segment.min_batch) return false;
    }
    if (segment.max_batch !== null && segment.max_batch !== undefined) {
      if (!u.batchYear || u.batchYear > segment.max_batch) return false;
    }
    if (segment.target_devices.length > 0 && !segment.target_devices.includes(u.primaryDevice)) {
      return false;
    }
    if (segment.target_routes.length > 0) {
      const visited = new Set(u.routesVisited);
      const anyRouteMatch = segment.target_routes.some((r) => visited.has(r));
      if (!anyRouteMatch) return false;
    }
    if (segment.target_interests.length > 0) {
      const userInterests = new Set(u.inferredInterests.map((i) => i.label));
      const anyInterestMatch = segment.target_interests.some((i) => userInterests.has(i));
      if (!anyInterestMatch) return false;
    }
    return true;
  });
}

export async function listAdSegments(precomputedUsers?: MonitoredUserSummary[]) {
  let segments = [...store.segments];

  if (isSupabaseServerConfigured && supabaseTablesAvailable !== false) {
    try {
      const { data, error } = await supabaseServer
        .from('ad_audience_segments')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data) && data.length > 0) {
        segments = data as AdAudienceSegment[];
      }
    } catch {
      // use local segments
    }
  }

  let users = precomputedUsers;
  if (!users) {
    const merged = await fetchMergedTelemetryDataset();
    users = buildUserSummaries(merged.sessions, merged.events);
  }

  return segments.map((seg) => {
    const matched = matchUsersForSegment(users!, seg);
    return {
      ...seg,
      matchedUsersCount: matched.length,
      matchedUserPreview: matched.slice(0, 6).map((u) => ({
        userKey: u.userKey,
        profileId: u.profileId,
        userName: u.userName,
        batchYear: u.batchYear,
        totalClicks: u.totalClicks,
        totalDwellSec: u.totalDwellSec,
      })),
    };
  });
}

export async function createAdSegment(
  input: Partial<AdAudienceSegment>,
  createdBy: string
): Promise<AdAudienceSegment> {
  const name = clampString(input.name, 80);
  if (!name) throw new Error('Audience segment name is required.');

  const nowIso = new Date().toISOString();
  const segment: AdAudienceSegment = {
    id: `seg-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    name,
    description: clampString(input.description, 240) || '',
    target_routes: Array.isArray(input.target_routes)
      ? input.target_routes.map((r) => String(r).toLowerCase().trim()).filter(Boolean).slice(0, 15)
      : [],
    target_interests: Array.isArray(input.target_interests)
      ? input.target_interests.map((i) => String(i).trim()).filter(Boolean).slice(0, 10)
      : [],
    target_devices: Array.isArray(input.target_devices)
      ? input.target_devices.filter((d) => ['desktop', 'mobile', 'tablet'].includes(String(d)))
      : [],
    min_clicks: clampInt(input.min_clicks, 0, 100000, 0),
    min_dwell_sec: clampInt(input.min_dwell_sec, 0, 1000000, 0),
    min_batch:
      input.min_batch !== null && input.min_batch !== undefined && String(input.min_batch) !== ''
        ? clampInt(input.min_batch, 1, 100)
        : null,
    max_batch:
      input.max_batch !== null && input.max_batch !== undefined && String(input.max_batch) !== ''
        ? clampInt(input.max_batch, 1, 100)
        : null,
    created_by: createdBy,
    created_at: nowIso,
    updated_at: nowIso,
  };

  store.segments = [segment, ...store.segments];
  scheduleDiskFlush();

  if (isSupabaseServerConfigured && supabaseTablesAvailable !== false) {
    try {
      await supabaseServer.from('ad_audience_segments').upsert(segment, { onConflict: 'id' });
    } catch {
      // already stored locally
    }
  }

  return segment;
}

export async function deleteAdSegment(id: string): Promise<boolean> {
  const cleanId = clampString(id, 80);
  if (!cleanId) return false;
  store.segments = store.segments.filter((s) => s.id !== cleanId);
  scheduleDiskFlush();

  if (isSupabaseServerConfigured && supabaseTablesAvailable !== false) {
    try {
      await supabaseServer.from('ad_audience_segments').delete().eq('id', cleanId);
    } catch {
      // local deletion done
    }
  }
  return true;
}

export async function clearTelemetryLogs(): Promise<void> {
  store.sessions = {};
  store.events = [];
  scheduleDiskFlush();
}
