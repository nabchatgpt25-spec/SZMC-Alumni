// server.ts
import express from "express";
import compression from "compression";
import { createServer as createHttpServer } from "http";
import { existsSync as existsSync3, writeFileSync as writeFileSync2, readFileSync as readFileSync3, mkdirSync } from "fs";
import { readFile } from "fs/promises";
import path3 from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import crypto5 from "crypto";
import * as dotenv2 from "dotenv";

// server/lib/supabase-server.ts
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ quiet: true });
var DEFAULT_SUPABASE_URL = "https://hjuyiqyviohinbhzaipl.supabase.co";
var DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqdXlpcXl2aW9oaW5iaHphaXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MjQ2NzIsImV4cCI6MjEwNzIwMDY3Mn0.fppNXVPWcsWGsUIBwvirhjEkdDyUCX-SyydNWExbwk8";
var urlCandidates = [
  process.env.SUPABASE_URL,
  process.env.VITE_SUPABASE_URL
];
var rawUrl = (urlCandidates.find(
  (u) => typeof u === "string" && (u.trim().startsWith("http://") || u.trim().startsWith("https://")) && !u.includes("placeholder.supabase.co")
) || DEFAULT_SUPABASE_URL).trim();
var envServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!envServiceRoleKey) {
  console.warn(
    "[SupabaseServer] SUPABASE_SERVICE_ROLE_KEY is not set in environment; falling back to anon key (privileged admin writes will be subject to RLS)."
  );
}
var keyCandidates = [
  envServiceRoleKey,
  process.env.SUPABASE_ANON_KEY,
  process.env.VITE_SUPABASE_URL && !process.env.VITE_SUPABASE_URL.startsWith("http") ? process.env.VITE_SUPABASE_URL : void 0,
  process.env.VITE_SUPABASE_ANON_KEY
];
var rawKey = (keyCandidates.find(
  (k) => typeof k === "string" && (k.trim().startsWith("eyJ") || k.trim().startsWith("sb_") || k.trim().length > 30)
) || DEFAULT_SUPABASE_ANON_KEY).trim();
var isSupabaseServiceRoleConfigured = Boolean(envServiceRoleKey);
var isSupabaseServerConfigured = Boolean(
  rawUrl && rawKey && rawUrl.startsWith("http") && !rawUrl.includes("placeholder.supabase.co")
);
var anonKeyCandidates = [
  process.env.SUPABASE_ANON_KEY,
  process.env.VITE_SUPABASE_ANON_KEY
];
var effectiveAnonKey = (anonKeyCandidates.find(
  (k) => typeof k === "string" && (k.trim().startsWith("eyJ") || k.trim().startsWith("sb_") || k.trim().length > 30)
) || DEFAULT_SUPABASE_ANON_KEY).trim();
var effectiveUrl = isSupabaseServerConfigured ? rawUrl : DEFAULT_SUPABASE_URL;
var effectiveKey = isSupabaseServerConfigured ? rawKey : DEFAULT_SUPABASE_ANON_KEY;
var supabaseServer = createClient(effectiveUrl, effectiveKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
function createUserScopedSupabaseClient(accessToken) {
  const cleanToken = accessToken?.trim();
  if (!isSupabaseServerConfigured || !cleanToken || !cleanToken.startsWith("eyJ")) {
    return null;
  }
  return createClient(effectiveUrl, effectiveAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${cleanToken}`
      }
    }
  });
}
function getSupabaseWriteClient(accessToken) {
  if (!isSupabaseServerConfigured) return null;
  if (isSupabaseServiceRoleConfigured) {
    return { client: supabaseServer, mode: "service_role" };
  }
  const userClient = createUserScopedSupabaseClient(accessToken);
  if (userClient) {
    return { client: userClient, mode: "user_jwt" };
  }
  return null;
}
var UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function findAuthUserByEmailOrPhone(params) {
  if (!isSupabaseServerConfigured || !isSupabaseServiceRoleConfigured) {
    return null;
  }
  const cleanAuthId = params.authUserId?.trim();
  if (cleanAuthId && UUID_REGEX.test(cleanAuthId)) {
    try {
      const { data, error } = await supabaseServer.auth.admin.getUserById(cleanAuthId);
      if (!error && data?.user) {
        return data.user;
      }
    } catch {
    }
  }
  const cleanEmail = params.email?.trim().toLowerCase() || "";
  const cleanPhone = params.phone?.trim() || "";
  if (!cleanEmail && !cleanPhone) {
    return null;
  }
  try {
    let profileQuery = supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("auth_user_id");
    if (cleanEmail) {
      profileQuery = profileQuery.ilike("email", cleanEmail);
    } else if (cleanPhone) {
      profileQuery = profileQuery.eq("phone", cleanPhone);
    }
    const { data: profileRow } = await profileQuery.maybeSingle();
    if (profileRow?.auth_user_id && UUID_REGEX.test(profileRow.auth_user_id)) {
      const { data: authRes, error: authErr } = await supabaseServer.auth.admin.getUserById(
        profileRow.auth_user_id
      );
      if (!authErr && authRes?.user) {
        return authRes.user;
      }
    }
  } catch {
  }
  const maxPages = Math.min(Math.max(params.maxPages ?? 20, 1), 50);
  const perPage = Math.min(Math.max(params.perPage ?? 100, 10), 1e3);
  for (let page = 1; page <= maxPages; page += 1) {
    try {
      const { data, error } = await supabaseServer.auth.admin.listUsers({ page, perPage });
      if (error || !Array.isArray(data?.users) || data.users.length === 0) {
        break;
      }
      const matched = data.users.find(
        (u) => cleanEmail && u.email?.toLowerCase() === cleanEmail || cleanPhone && u.phone === cleanPhone
      );
      if (matched) {
        return matched;
      }
      if (data.users.length < perPage) {
        break;
      }
    } catch {
      break;
    }
  }
  return null;
}
var SUPABASE_TABLES = {
  ALUMNI_PROFILES: "alumni_profiles",
  PROFILES: "profiles",
  CONNECTIONS: "connections",
  BATCHES: "batches",
  ACADEMIC_STREAM_GROUPS: "academic_stream_groups",
  POSTS: "posts",
  POST_COMMENTS: "post_comments",
  POST_LIKES: "post_likes",
  SAVED_POSTS: "saved_posts",
  // Reconciled: saved_posts (not post_saves)
  VERIFICATION_REQUESTS: "verification_requests",
  // Reconciled: verification_requests (not verification_submissions)
  ADMIN_DOC_SUBMISSIONS: "admin_doc_submissions",
  PEER_VOUCHES: "peer_vouches",
  BLOOD_DONORS: "blood_donors",
  // Reconciled: blood_donors (not blood_donor_registrations)
  BLOOD_REQUESTS: "blood_requests",
  // Reconciled: blood_requests (not blood_emergency_requests)
  BLOOD_REQUEST_RESPONSES: "blood_request_responses",
  // Reconciled: blood_request_responses (not blood_donation_responses)
  NOTIFICATIONS: "notifications",
  GALLERY_ALBUMS: "gallery_albums",
  GALLERY_PHOTOS: "gallery_photos",
  OFFICIAL_NOTICES: "official_notices",
  CONTACT_INQUIRIES: "contact_inquiries",
  AUDIT_LOGS: "audit_logs",
  // Reconciled: audit_logs (not security_audit_logs)
  SITE_SETTINGS: "site_settings",
  FEATURED_ALUMNI: "featured_alumni",
  HALL_OF_FAME: "hall_of_fame",
  CAREER_OPPORTUNITIES: "career_opportunities",
  MENTORSHIP_REQUESTS: "mentorship_requests",
  MENTOR_OFFERS: "mentor_offers",
  EVENTS: "events",
  EVENT_REGISTRATIONS: "event_registrations",
  APP_FEATURE_FLAGS: "app_feature_flags",
  BATCH_LOUNGES: "batch_lounges",
  BATCH_LOUNGE_MODERATORS: "batch_lounge_moderators",
  OFFICIAL_PAGES: "official_pages",
  OFFICIAL_PAGE_ROLES: "official_page_roles",
  OFFICIAL_PAGE_FOLLOWERS: "official_page_followers",
  COMMUNITY_POLLS: "community_polls",
  COMMUNITY_POLL_VOTES: "community_poll_votes",
  FEED_RANKING_WEIGHTS: "feed_ranking_weights",
  CONTENT_REPORTS: "content_reports",
  USER_BLOCKS: "user_blocks"
};

// server/lib/safeFetch.ts
import dns from "dns/promises";
import net from "net";
var MAX_UNFURL_HTML_BYTES = 512 * 1024;
var ALLOWED_PORTS = /* @__PURE__ */ new Set(["", "80", "443", "8080", "8443"]);
var BLOCKED_HOSTNAMES = /* @__PURE__ */ new Set([
  "localhost",
  "localhost.localdomain",
  "0.0.0.0",
  "127.0.0.1",
  "::1",
  "metadata.google.internal",
  "metadata.goog",
  "169.254.169.254",
  "100.100.100.200"
  // Alibaba Cloud metadata
]);
function normalizeIpv6MappedIpv4(ip) {
  const lower = ip.toLowerCase().trim();
  const dotted = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) return dotted[1];
  const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${hi >> 8 & 255}.${hi & 255}.${lo >> 8 & 255}.${lo & 255}`;
  }
  return null;
}
function isPrivateOrNonRoutableIp(rawIp) {
  const ip = rawIp.trim().replace(/^\[|\]$/g, "").toLowerCase();
  if (!ip) return true;
  const mappedV4 = normalizeIpv6MappedIpv4(ip);
  if (mappedV4) {
    return isPrivateOrNonRoutableIp(mappedV4);
  }
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b, c] = parts;
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    if (a >= 224) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    if (ip === "::" || ip === "::1") return true;
    if (ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb")) {
      return true;
    }
    if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
    if (ip.startsWith("ff")) return true;
    if (ip.startsWith("2001:db8:")) return true;
    if (ip.startsWith("100::")) return true;
    return false;
  }
  if (/^(0x[0-9a-f]+|\d+)$/i.test(ip)) {
    return true;
  }
  return false;
}
function isSafeTargetUrl(rawUrl2) {
  try {
    const parsed = new URL(rawUrl2.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { safe: false, error: "Only HTTP and HTTPS URLs are permitted." };
    }
    if (parsed.username || parsed.password) {
      return { safe: false, error: "URLs containing embedded credentials are not allowed." };
    }
    if (!ALLOWED_PORTS.has(parsed.port)) {
      return { safe: false, error: "Non-standard network port is not allowed." };
    }
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!host) {
      return { safe: false, error: "Missing hostname." };
    }
    if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa") || host.includes("metadata.google")) {
      return { safe: false, error: "Requests to internal or localhost addresses are blocked." };
    }
    if (isPrivateOrNonRoutableIp(host)) {
      return { safe: false, error: "Requests to private or non-routable IP addresses are blocked." };
    }
    return { safe: true, parsed };
  } catch {
    return { safe: false, error: "Malformed URL." };
  }
}
async function validateHostDns(hostname) {
  const cleanHost = hostname.toLowerCase().trim().replace(/^\[|\]$/g, "");
  if (!cleanHost) {
    return { safe: false, error: "Missing hostname." };
  }
  if (net.isIP(cleanHost)) {
    if (isPrivateOrNonRoutableIp(cleanHost)) {
      return { safe: false, error: "Private or non-routable IP address is blocked." };
    }
    return { safe: true };
  }
  const resolvedIps = /* @__PURE__ */ new Set();
  try {
    const records = await dns.lookup(cleanHost, { all: true, verbatim: true });
    for (const r of records) {
      if (r?.address) resolvedIps.add(r.address);
    }
  } catch {
  }
  const [v4Res, v6Res] = await Promise.allSettled([
    dns.resolve4(cleanHost),
    dns.resolve6(cleanHost)
  ]);
  if (v4Res.status === "fulfilled") {
    for (const ip of v4Res.value) resolvedIps.add(ip);
  }
  if (v6Res.status === "fulfilled") {
    for (const ip of v6Res.value) resolvedIps.add(ip);
  }
  if (resolvedIps.size === 0) {
    return { safe: false, error: "Unable to resolve destination hostname." };
  }
  for (const ip of resolvedIps) {
    if (isPrivateOrNonRoutableIp(ip)) {
      return {
        safe: false,
        error: "Destination resolves to a private or non-routable IP address."
      };
    }
  }
  return { safe: true };
}
async function safeFetchHtml(targetUrl, options) {
  const maxRedirects = options?.maxRedirects ?? 4;
  const timeoutMs = options?.timeoutMs ?? 6e3;
  const maxBytes = options?.maxBytes ?? MAX_UNFURL_HTML_BYTES;
  const userAgent = options?.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
  let currentUrl = targetUrl.trim();
  let redirectsRemaining = maxRedirects;
  while (redirectsRemaining >= 0) {
    const urlCheck = isSafeTargetUrl(currentUrl);
    if (!urlCheck.safe || !urlCheck.parsed) {
      throw new Error(urlCheck.error || "Target URL is not permitted.");
    }
    const dnsCheck = await validateHostDns(urlCheck.parsed.hostname);
    if (!dnsCheck.safe) {
      throw new Error(dnsCheck.error || "Destination host resolution blocked.");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let resp;
    try {
      resp = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9,bn;q=0.8",
          "Cache-Control": "no-cache"
        }
      });
    } finally {
      clearTimeout(timer);
    }
    if ([301, 302, 303, 307, 308].includes(resp.status)) {
      redirectsRemaining -= 1;
      const location = resp.headers.get("location");
      if (!location) {
        throw new Error("Redirect response missing Location header.");
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    if (!resp.ok) {
      throw new Error(`Upstream returned HTTP ${resp.status}`);
    }
    const contentType = resp.headers.get("content-type") || "";
    const reader = resp.body?.getReader();
    if (!reader) {
      return { html: "", finalUrl: currentUrl, contentType };
    }
    const chunks = [];
    let receivedBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const remaining = maxBytes - receivedBytes;
        if (remaining <= 0) {
          await reader.cancel().catch(() => {
          });
          break;
        }
        const slice = value.length > remaining ? value.subarray(0, remaining) : value;
        chunks.push(slice);
        receivedBytes += slice.length;
        if (receivedBytes >= maxBytes) {
          await reader.cancel().catch(() => {
          });
          break;
        }
      }
    }
    const merged = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    const html = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true }).decode(merged);
    return { html, finalUrl: currentUrl, contentType };
  }
  throw new Error("Too many redirects.");
}

// server/lib/password.ts
import crypto from "crypto";
var LEGACY_STATIC_SALT = "ndc_dhaka_1949_salt_v1:";
var SCRYPT_PREFIX = "scrypt:";
var SCRYPT_KEYLEN = 64;
function hashPasswordServer(raw) {
  if (!raw || typeof raw !== "string") return "";
  if (raw.startsWith(SCRYPT_PREFIX) || raw.startsWith("sha256:")) return raw;
  const saltHex = crypto.randomBytes(16).toString("hex");
  const derivedHex = crypto.scryptSync(raw, saltHex, SCRYPT_KEYLEN).toString("hex");
  return `${SCRYPT_PREFIX}${saltHex}:${derivedHex}`;
}
function timingSafeHexEqual(aHex, bHex) {
  if (!aHex || !bHex || aHex.length !== bHex.length) return false;
  try {
    const aBuf = Buffer.from(aHex, "hex");
    const bBuf = Buffer.from(bHex, "hex");
    return aBuf.length > 0 && aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}
function verifyPasswordServer(storedHash, inputPass) {
  if (!storedHash || typeof storedHash !== "string" || !storedHash.trim()) {
    return false;
  }
  if (!inputPass || typeof inputPass !== "string") {
    return false;
  }
  if (storedHash.startsWith(SCRYPT_PREFIX)) {
    const rest = storedHash.slice(SCRYPT_PREFIX.length);
    const sep = rest.indexOf(":");
    if (sep <= 0) return false;
    const saltHex = rest.slice(0, sep);
    const expectedHex = rest.slice(sep + 1);
    if (!saltHex || !expectedHex) return false;
    try {
      const derivedHex = crypto.scryptSync(inputPass, saltHex, SCRYPT_KEYLEN).toString("hex");
      return timingSafeHexEqual(derivedHex, expectedHex);
    } catch {
      return false;
    }
  }
  if (storedHash.startsWith("sha256:")) {
    const expectedHex = storedHash.slice("sha256:".length);
    const candidateHex = crypto.createHash("sha256").update(LEGACY_STATIC_SALT + inputPass).digest("hex");
    return timingSafeHexEqual(candidateHex, expectedHex);
  }
  const aDigest = crypto.createHash("sha256").update(storedHash).digest();
  const bDigest = crypto.createHash("sha256").update(inputPass).digest();
  return crypto.timingSafeEqual(aDigest, bDigest);
}

// server/lib/rateLimit.ts
var MAX_RATE_BUCKETS = 1e4;
var PRUNE_INTERVAL_MS = 6e4;
var SlidingRateLimiter = class {
  constructor() {
    this.store = /* @__PURE__ */ new Map();
    this.lastPrunedAt = Date.now();
  }
  prune(now = Date.now()) {
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
  check(key, maxRequests, windowMs, now = Date.now()) {
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
      resetAt: bucket.resetAt
    };
  }
  get size() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
};
var globalRateLimiter = new SlidingRateLimiter();
function resolveClientIp(req) {
  if (req.ip && typeof req.ip === "string") {
    return req.ip.replace(/^::ffff:/, "").trim();
  }
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}
function rateLimitGuard(maxRequests, windowMs) {
  return (req, res, next) => {
    const ip = resolveClientIp(req);
    const key = `${ip}:${req.baseUrl || req.path}`;
    const result = globalRateLimiter.check(key, maxRequests, windowMs);
    if (!result.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1e3));
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        error: "Rate limit exceeded. Automated scraping and brute-force requests are blocked."
      });
    }
    return next();
  };
}

// server/routes/distDownload.ts
import { Router } from "express";
import { existsSync, readFileSync } from "fs";
import path from "path";
import os from "os";
import crypto3 from "crypto";

// server/middleware/auth.ts
import crypto2 from "crypto";
var envSuperAdminEmails = (process.env.SUPER_ADMIN_EMAILS || process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
var SUPER_ADMIN_EMAILS = Array.from(
  /* @__PURE__ */ new Set([
    "admin@szmcalumni.net",
    "nabchatgpt25@gmail.com",
    "firstaidnetworkbd@gmail.com",
    "support@szmcalumni.net",
    "nurulanambashir25@gmail.com",
    "nurulanambashir20@gmail.com",
    ...envSuperAdminEmails
  ])
);
var ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET?.trim() || crypto2.randomBytes(32).toString("hex");
var ADMIN_TOKEN_PREFIX = "szmc-admin-session:";
var MEMBER_TOKEN_PREFIX = "szmc-member-session:";
var SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1e3;
function isSuperAdminEmail(email) {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return SUPER_ADMIN_EMAILS.some((e) => e.toLowerCase() === clean);
}
function normalizeRole(rawRole, email) {
  const clean = (rawRole || "").trim().toLowerCase();
  if (clean === "super_admin" || isSuperAdminEmail(email)) return "super_admin";
  if (clean === "admin") return "admin";
  if (clean === "moderator") return "moderator";
  if (clean === "batch_representative") return "batch_representative";
  return "member";
}
function getRolePermissions(role) {
  const isSuperAdmin = role === "super_admin";
  const isAdmin = isSuperAdmin || role === "admin";
  const isModerator = isAdmin || role === "moderator";
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
    canExportBackups: isSuperAdmin
  };
}
function signPayload(prefix, payloadObj) {
  const encoded = Buffer.from(JSON.stringify(payloadObj), "utf-8").toString("base64url");
  const hmac = crypto2.createHmac("sha256", ADMIN_SESSION_SECRET).update(`${prefix}${encoded}`).digest("hex");
  return `${prefix}${encoded}:${hmac}`;
}
function verifySignedPayload(token, expectedPrefix) {
  if (!token || !token.startsWith(expectedPrefix)) return { valid: false };
  const rest = token.slice(expectedPrefix.length);
  const sepIdx = rest.lastIndexOf(":");
  if (sepIdx <= 0) return { valid: false };
  const encoded = rest.slice(0, sepIdx);
  const providedHmac = rest.slice(sepIdx + 1);
  try {
    const expectedHmac = crypto2.createHmac("sha256", ADMIN_SESSION_SECRET).update(`${expectedPrefix}${encoded}`).digest("hex");
    const providedBuf = Buffer.from(providedHmac, "utf-8");
    const expectedBuf = Buffer.from(expectedHmac, "utf-8");
    if (providedBuf.length !== expectedBuf.length || !crypto2.timingSafeEqual(providedBuf, expectedBuf)) {
      return { valid: false };
    }
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
    const ageMs = Date.now() - Number(parsed?.iat);
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > SESSION_MAX_AGE_MS) {
      return { valid: false };
    }
    return { valid: true, payload: parsed };
  } catch {
    return { valid: false };
  }
}
function signAdminToken(email, role = "admin", meta) {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) {
    throw new Error("Cannot sign admin token without a valid administrator email.");
  }
  if (role === "super_admin" && !isSuperAdminEmail(cleanEmail)) {
    throw new Error("Cannot issue super_admin session for a non-super-admin email.");
  }
  const effectiveRole = isSuperAdminEmail(cleanEmail) ? "super_admin" : "admin";
  const payload = {
    email: cleanEmail,
    role: effectiveRole,
    userId: Number(meta?.userId || 1),
    uid: meta?.uid || `admin:${cleanEmail}`,
    fullName: meta?.fullName || "SZMC Administrator",
    iat: Date.now()
  };
  return signPayload(ADMIN_TOKEN_PREFIX, payload);
}
function signMemberSessionToken(params) {
  const cleanEmail = params.email.toLowerCase().trim();
  const payload = {
    email: cleanEmail,
    role: "member",
    userId: Number(params.userId),
    uid: params.uid || `member:${params.userId}`,
    fullName: params.fullName || "SZMC Alumnus",
    iat: Date.now()
  };
  return signPayload(MEMBER_TOKEN_PREFIX, payload);
}
function verifyAdminToken(token) {
  const result = verifySignedPayload(token, ADMIN_TOKEN_PREFIX);
  if (!result.valid || !result.payload?.email) {
    return { valid: false };
  }
  const cleanEmail = result.payload.email.toLowerCase().trim();
  if (result.payload.role !== "admin" && result.payload.role !== "super_admin") {
    return { valid: false };
  }
  if (result.payload.role === "super_admin" && !isSuperAdminEmail(cleanEmail)) {
    return { valid: false };
  }
  return {
    valid: true,
    email: cleanEmail,
    role: result.payload.role,
    userId: Number(result.payload.userId || 1),
    uid: result.payload.uid || `admin:${cleanEmail}`,
    fullName: result.payload.fullName || "SZMC Administrator"
  };
}
function verifyMemberSessionToken(token) {
  const result = verifySignedPayload(token, MEMBER_TOKEN_PREFIX);
  if (!result.valid || !result.payload?.email || result.payload.role !== "member") {
    return { valid: false };
  }
  return {
    valid: true,
    email: result.payload.email.toLowerCase().trim(),
    userId: Number(result.payload.userId),
    uid: result.payload.uid,
    fullName: result.payload.fullName || "SZMC Alumnus"
  };
}
async function verifyAuthToken(token) {
  if (!token) return null;
  if (token.startsWith(ADMIN_TOKEN_PREFIX)) {
    const adminCheck = verifyAdminToken(token);
    if (!adminCheck.valid || !adminCheck.email) {
      return null;
    }
    const adminEmail = adminCheck.email.toLowerCase().trim();
    let resolvedRole = isSuperAdminEmail(adminEmail) ? "super_admin" : null;
    let resolvedId = adminCheck.userId || 1;
    let resolvedUid = adminCheck.uid || `admin:${adminEmail}`;
    let resolvedFullName = adminCheck.fullName || "SZMC Administrator";
    if (!resolvedRole && isSupabaseServerConfigured) {
      try {
        const { data: profile } = await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("id, auth_user_id, full_name, role, is_public").ilike("email", adminEmail).maybeSingle();
        if (profile && (profile.role === "admin" || profile.role === "super_admin")) {
          resolvedRole = normalizeRole(profile.role, adminEmail);
          resolvedId = Number(profile.id);
          resolvedUid = profile.auth_user_id || resolvedUid;
          resolvedFullName = profile.full_name || resolvedFullName;
        }
      } catch {
      }
    }
    if (!resolvedRole) {
      return null;
    }
    return {
      user: { id: resolvedUid, email: adminEmail },
      dbUser: {
        id: resolvedId,
        uid: resolvedUid,
        email: adminEmail,
        fullName: resolvedFullName,
        role: resolvedRole,
        accountStatus: "active"
      }
    };
  }
  if (token.startsWith(MEMBER_TOKEN_PREFIX)) {
    const memberCheck = verifyMemberSessionToken(token);
    if (!memberCheck.valid || !memberCheck.email) {
      return null;
    }
    return {
      user: { id: memberCheck.uid, email: memberCheck.email },
      dbUser: {
        id: Number(memberCheck.userId || 0),
        uid: memberCheck.uid || `member:${memberCheck.userId}`,
        email: memberCheck.email,
        fullName: memberCheck.fullName || "SZMC Alumnus",
        role: "member",
        accountStatus: "active"
      }
    };
  }
  if (!isSupabaseServerConfigured) {
    return null;
  }
  try {
    const { data, error } = await supabaseServer.auth.getUser(token);
    if (error || !data?.user) {
      return null;
    }
    const user = data.user;
    const cleanEmail = (user.email || "").toLowerCase().trim();
    const metadataRole = user.app_metadata?.role || (user.app_metadata?.claims_admin ? "admin" : void 0);
    const { data: profile } = await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("id, auth_user_id, email, full_name, role, is_public").eq("auth_user_id", user.id).maybeSingle();
    const profileRole = profile?.role;
    let resolvedRole = "member";
    if (isSuperAdminEmail(cleanEmail) || metadataRole === "super_admin" || profileRole === "super_admin") {
      resolvedRole = "super_admin";
    } else if (metadataRole === "admin" || profileRole === "admin") {
      resolvedRole = "admin";
    } else if (metadataRole === "moderator" || profileRole === "moderator") {
      resolvedRole = "moderator";
    } else if (profileRole === "batch_representative") {
      resolvedRole = "batch_representative";
    }
    return {
      user,
      supabaseAccessToken: token,
      dbUser: {
        id: Number(profile?.id || 0),
        uid: user.id,
        email: cleanEmail || `${user.id}@szmcalumni.net`,
        fullName: profile?.full_name || user.user_metadata?.full_name || "SZMC Alumnus",
        role: resolvedRole,
        accountStatus: profile?.is_public === false ? "suspended" : "active",
        auth_user_id: user.id
      }
    };
  } catch (err) {
    console.warn("Supabase token verification error:", err);
    return null;
  }
}
async function authenticateBearerRequest(req, res, missingMsg, invalidMsg) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: missingMsg });
    return null;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  const authResult = await verifyAuthToken(token);
  if (!authResult) {
    res.status(401).json({ error: invalidMsg });
    return null;
  }
  req.supabaseUser = authResult.user;
  req.user = authResult.user;
  req.dbUser = authResult.dbUser;
  if ("supabaseAccessToken" in authResult && authResult.supabaseAccessToken) {
    req.supabaseAccessToken = authResult.supabaseAccessToken;
  }
  return authResult;
}
var requireAuth = async (req, res, next) => {
  const authResult = await authenticateBearerRequest(
    req,
    res,
    "Unauthorized: Missing token",
    "Unauthorized: Invalid token"
  );
  if (!authResult) return;
  return next();
};
var requireModerator = async (req, res, next) => {
  const authResult = await authenticateBearerRequest(
    req,
    res,
    "Unauthorized: Valid moderation authorization token required.",
    "Unauthorized: Invalid or expired session token."
  );
  if (!authResult) return;
  const perms = getRolePermissions(authResult.dbUser.role);
  if (!perms.isModerator) {
    return res.status(403).json({
      error: "Forbidden: Moderation access restricted to verified moderators and administrators."
    });
  }
  return next();
};
var requireAdmin = async (req, res, next) => {
  const authResult = await authenticateBearerRequest(
    req,
    res,
    "Unauthorized: Valid administrator authorization token required.",
    "Unauthorized: Invalid or expired administrator session token."
  );
  if (!authResult) return;
  const perms = getRolePermissions(authResult.dbUser.role);
  if (!perms.isAdmin) {
    return res.status(403).json({
      error: "Forbidden: Admin access restricted to verified administrators."
    });
  }
  return next();
};
var requireSuperAdmin = async (req, res, next) => {
  const authResult = await authenticateBearerRequest(
    req,
    res,
    "Unauthorized: Super Administrator authorization token required.",
    "Unauthorized: Invalid or expired Super Administrator session token."
  );
  if (!authResult) return;
  const perms = getRolePermissions(authResult.dbUser.role);
  if (!perms.isSuperAdmin) {
    return res.status(403).json({
      error: "Forbidden: Super Administrator clearance is strictly required for this operation."
    });
  }
  return next();
};
var optionalAuth = async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    const authResult = await verifyAuthToken(token);
    if (authResult) {
      req.supabaseUser = authResult.user;
      req.user = authResult.user;
      req.dbUser = authResult.dbUser;
      if ("supabaseAccessToken" in authResult && authResult.supabaseAccessToken) {
        req.supabaseAccessToken = authResult.supabaseAccessToken;
      }
    }
  }
  next();
};

// server/routes/distDownload.ts
var DIST_TOKEN_FILE = path.join(os.tmpdir(), "szmc-dist-download-token.json");
function verifySignedDistToken(rawToken) {
  if (typeof rawToken !== "string" || rawToken.length < 32 || rawToken.length > 256) {
    return false;
  }
  try {
    if (!existsSync(DIST_TOKEN_FILE)) return false;
    const raw = readFileSync(DIST_TOKEN_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed?.tokenHash || typeof parsed.expiresAt !== "number") return false;
    if (Date.now() > parsed.expiresAt) return false;
    const candidateHash = crypto3.createHash("sha256").update(rawToken).digest("hex");
    const a = Buffer.from(candidateHash, "utf-8");
    const b = Buffer.from(parsed.tokenHash, "utf-8");
    return a.length === b.length && crypto3.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
function requireSuperAdminOrSignedDistToken(req, res, next) {
  if (verifySignedDistToken(req.query.dl)) {
    return next();
  }
  return requireSuperAdmin(req, res, next);
}
function createDistDownloadRouter(rootDir) {
  const router = Router();
  router.get(
    [
      "/download/szmc-alumni-dist.zip",
      "/szmc-alumni-dist.zip",
      "/download/dist.zip",
      "/dist.zip",
      "/api/download-dist",
      "/download-dist"
    ],
    requireSuperAdminOrSignedDistToken,
    (_req, res) => {
      const candidates = [
        path.resolve(rootDir, "szmc-alumni-dist.zip"),
        path.resolve(rootDir, "dist", "szmc-alumni-dist.zip"),
        path.resolve(rootDir, "public", "szmc-alumni-dist.zip"),
        path.resolve(rootDir, "public", "dist.zip"),
        path.resolve(rootDir, "dist.zip"),
        path.resolve(rootDir, "szmc-alumni-dist.tar.gz"),
        path.resolve(rootDir, "public", "szmc-alumni-dist.tar.gz")
      ];
      for (const c of candidates) {
        if (existsSync(c)) {
          res.setHeader("Cache-Control", "no-store");
          return res.download(c, "szmc-alumni-dist.zip");
        }
      }
      return res.status(404).send("Production dist archive not found. Please build first.");
    }
  );
  router.get(
    ["/download/szmc-alumni-dist.tar.gz", "/szmc-alumni-dist.tar.gz"],
    requireSuperAdminOrSignedDistToken,
    (_req, res) => {
      const candidates = [
        path.resolve(rootDir, "public", "szmc-alumni-dist.tar.gz"),
        path.resolve(rootDir, "szmc-alumni-dist.tar.gz")
      ];
      for (const c of candidates) {
        if (existsSync(c)) {
          res.setHeader("Cache-Control", "no-store");
          return res.download(c, "szmc-alumni-dist.tar.gz");
        }
      }
      return res.status(404).send("Production dist tar.gz archive not found.");
    }
  );
  router.get(
    [
      "/download/szmc-supabase-migrations.zip",
      "/szmc-supabase-migrations.zip",
      "/download/migrations.zip",
      "/api/download-migrations"
    ],
    requireSuperAdminOrSignedDistToken,
    (_req, res) => {
      const candidates = [path.resolve(rootDir, "szmc-supabase-migrations.zip")];
      for (const c of candidates) {
        if (existsSync(c)) {
          res.setHeader("Cache-Control", "no-store");
          return res.download(c, "szmc-supabase-migrations.zip");
        }
      }
      return res.status(404).send("Supabase migrations archive not found.");
    }
  );
  return router;
}

// server/routes/telemetry.ts
import { Router as Router2 } from "express";

// server/db/telemetryRepository.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, writeFileSync } from "fs";
import path2 from "path";
import { fileURLToPath } from "url";
import crypto4 from "crypto";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
var LOCAL_TELEMETRY_FILE = path2.resolve(__dirname, "..", "..", "szmc-telemetry-store.json");
var ALLOWED_TELEMETRY_EVENT_TYPES = /* @__PURE__ */ new Set([
  "session_start",
  "session_heartbeat",
  "page_view",
  "page_leave",
  "click",
  "rage_click",
  "scroll_milestone",
  "search",
  "profile_view",
  "post_interaction",
  "ad_impression",
  "ad_click"
]);
var MAX_LOCAL_EVENTS = 8e3;
var MAX_LOCAL_SESSIONS = 2e3;
var ONLINE_WINDOW_MS = 2 * 60 * 1e3;
var ROUTE_INTEREST_MAP = {
  feed: "Community & Newsfeed",
  dashboard: "Community & Newsfeed",
  alumni: "Alumni Networking",
  directory: "Alumni Networking",
  find: "Alumni Search & Lookup",
  batches: "Batch Cohorts",
  map: "Global Physicians Map",
  "map-directory": "Global Physicians Map",
  careers: "Medical Careers & Recruitment",
  mentorship: "Mentorship & Coaching",
  events: "Reunions & CME Events",
  gallery: "Campus Heritage & Media",
  messages: "Direct Messaging",
  emergency: "Blood Donation & Emergency",
  blood: "Blood Donation & Emergency",
  "blood-network": "Blood Donation & Emergency",
  profile: "Doctor Profiles",
  saved: "Saved Posts & Resources",
  settings: "Account & Personalization",
  contact: "Institutional Support",
  admin: "Admin Operations",
  landing: "Portal Discovery"
};
var ROUTE_LABELS = {
  feed: "The Quad (Feed)",
  dashboard: "The Quad (Feed)",
  alumni: "Alumni Directory",
  directory: "Alumni Directory",
  find: "Find Alumni",
  batches: "MBBS Batches",
  map: "Global Alumni Map",
  "map-directory": "Global Alumni Map",
  careers: "Medical Careers",
  mentorship: "Mentorship Hub",
  events: "Events & Reunions",
  gallery: "Heritage Gallery",
  messages: "Messenger",
  emergency: "Blood Lifeline",
  blood: "Blood Lifeline",
  "blood-network": "Blood Lifeline",
  profile: "Doctor Profile",
  saved: "Saved Posts",
  settings: "Profile Settings",
  "profile-settings": "Profile Settings",
  contact: "Contact Secretariat",
  admin: "Admin Console",
  landing: "Landing Page",
  entry: "Direct Entry",
  exit: "Session Exit"
};
var store = {
  sessions: {},
  events: [],
  segments: [
    {
      id: "seg-high-engagement-feed",
      name: "High-Engagement Feed Readers",
      description: "Alumni who actively browse The Quad feed with 5+ clicks and 60s+ dwell time.",
      target_routes: ["feed", "dashboard"],
      target_interests: ["Community & Newsfeed"],
      target_devices: [],
      min_clicks: 5,
      min_dwell_sec: 60,
      min_batch: null,
      max_batch: null,
      created_by: "System Preset",
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    },
    {
      id: "seg-career-seekers",
      name: "Medical Careers & Fellowship Prospects",
      description: "Doctors spending time on Medical Careers or Mentorship pages (ideal for hospital & CME ads).",
      target_routes: ["careers", "mentorship"],
      target_interests: ["Medical Careers & Recruitment", "Mentorship & Coaching"],
      target_devices: [],
      min_clicks: 2,
      min_dwell_sec: 30,
      min_batch: null,
      max_batch: null,
      created_by: "System Preset",
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    },
    {
      id: "seg-events-reunion",
      name: "Events, Reunions & Heritage Enthusiasts",
      description: "Members engaging with Events and Gallery albums (ideal for sponsorship & event tickets).",
      target_routes: ["events", "gallery"],
      target_interests: ["Reunions & CME Events", "Campus Heritage & Media"],
      target_devices: [],
      min_clicks: 2,
      min_dwell_sec: 20,
      min_batch: null,
      max_batch: null,
      created_by: "System Preset",
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }
  ]
};
var supabaseTablesAvailable = null;
var flushDiskTimer = null;
function loadLocalStore() {
  try {
    if (existsSync2(LOCAL_TELEMETRY_FILE)) {
      const raw = readFileSync2(LOCAL_TELEMETRY_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        store = {
          sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
          events: Array.isArray(parsed.events) ? parsed.events.slice(0, MAX_LOCAL_EVENTS) : [],
          segments: Array.isArray(parsed.segments) && parsed.segments.length > 0 ? parsed.segments : store.segments
        };
      }
    }
  } catch (err) {
    console.warn("[Telemetry] Could not load local telemetry store:", err);
  }
}
function scheduleDiskFlush() {
  if (flushDiskTimer) return;
  flushDiskTimer = setTimeout(() => {
    flushDiskTimer = null;
    try {
      const sessionKeys = Object.keys(store.sessions);
      if (sessionKeys.length > MAX_LOCAL_SESSIONS) {
        const sorted = sessionKeys.sort(
          (a, b) => (store.sessions[b]?.last_active_at || "").localeCompare(store.sessions[a]?.last_active_at || "")
        );
        const keep = new Set(sorted.slice(0, MAX_LOCAL_SESSIONS));
        for (const k of sessionKeys) {
          if (!keep.has(k)) delete store.sessions[k];
        }
      }
      writeFileSync(LOCAL_TELEMETRY_FILE, JSON.stringify(store), "utf-8");
    } catch (err) {
      console.warn("[Telemetry] Disk flush skipped:", err);
    }
  }, 1500);
}
loadLocalStore();
function clampString(val, maxLen) {
  if (typeof val !== "string") return null;
  const cleaned = val.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLen);
}
function clampInt(val, min, max, fallback = 0) {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}
function clampFloat(val, min, max) {
  if (val === null || val === void 0 || val === "") return null;
  const num = Number(val);
  if (!Number.isFinite(num)) return null;
  return Math.round(Math.max(min, Math.min(max, num)) * 100) / 100;
}
function getRouteLabel(route) {
  const normalized = (route || "landing").split(":")[0].split("?")[0].toLowerCase().trim();
  return ROUTE_LABELS[normalized] || normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
function getRouteInterest(route) {
  const normalized = (route || "landing").split(":")[0].split("?")[0].toLowerCase().trim();
  return ROUTE_INTEREST_MAP[normalized] || "General Portal Activity";
}
async function ingestTelemetryBatch(input, verifiedDbUser) {
  const sessionId = clampString(input?.session?.sessionId, 80);
  if (!sessionId) {
    return { accepted: 0, supabaseSynced: false };
  }
  const rawEvents = Array.isArray(input.events) ? input.events.slice(0, 50) : [];
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const profileId = verifiedDbUser?.id ?? (Number.isFinite(Number(input.session.profileId)) && Number(input.session.profileId) > 0 ? Number(input.session.profileId) : null);
  const authUserId = verifiedDbUser?.uid || clampString(input.session.authUserId, 80);
  const userName = verifiedDbUser?.fullName || clampString(input.session.userName, 80) || "Guest Visitor";
  const userEmail = verifiedDbUser?.email || clampString(input.session.userEmail, 120);
  const rawDevice = (input.session.deviceType || "desktop").toLowerCase();
  const deviceType = rawDevice === "mobile" ? "mobile" : rawDevice === "tablet" ? "tablet" : "desktop";
  const existing = store.sessions[sessionId];
  const sessionRecord = {
    session_id: sessionId,
    profile_id: profileId ?? existing?.profile_id ?? null,
    auth_user_id: authUserId ?? existing?.auth_user_id ?? null,
    user_name: userName !== "Guest Visitor" ? userName : existing?.user_name || "Guest Visitor",
    user_email: userEmail ?? existing?.user_email ?? null,
    batch_year: input.session.batchYear && Number.isFinite(Number(input.session.batchYear)) ? clampInt(input.session.batchYear, 1, 100) : existing?.batch_year ?? null,
    specialty: clampString(input.session.specialty, 80) ?? existing?.specialty ?? null,
    city: clampString(input.session.city, 60) ?? existing?.city ?? null,
    country: clampString(input.session.country, 60) ?? existing?.country ?? null,
    device_type: deviceType,
    browser: clampString(input.session.browser, 40) || existing?.browser || "Unknown",
    os: clampString(input.session.os, 40) || existing?.os || "Unknown",
    screen_resolution: clampString(input.session.screenResolution, 30) ?? existing?.screen_resolution ?? null,
    referrer: clampString(input.session.referrer, 160) ?? existing?.referrer ?? null,
    timezone: clampString(input.session.timezone, 60) ?? existing?.timezone ?? null,
    language: clampString(input.session.language, 30) ?? existing?.language ?? null,
    connection_type: clampString(input.session.connectionType, 30) ?? existing?.connection_type ?? null,
    utm_source: clampString(input.session.utmSource, 60) ?? existing?.utm_source ?? null,
    utm_medium: clampString(input.session.utmMedium, 60) ?? existing?.utm_medium ?? null,
    utm_campaign: clampString(input.session.utmCampaign, 80) ?? existing?.utm_campaign ?? null,
    color_scheme: clampString(input.session.colorScheme, 20) ?? existing?.color_scheme ?? null,
    current_route: clampString(input.session.currentRoute, 80) || existing?.current_route || "landing",
    started_at: existing?.started_at || nowIso,
    last_active_at: nowIso,
    total_duration_sec: existing?.total_duration_sec || 0,
    total_clicks: existing?.total_clicks || 0,
    rage_clicks: existing?.rage_clicks || 0,
    total_page_views: existing?.total_page_views || 0,
    max_scroll_pct: existing?.max_scroll_pct || 0,
    is_active: true
  };
  const sanitizedEvents = [];
  for (const ev of rawEvents) {
    if (!ev || typeof ev.eventType !== "string" || !ALLOWED_TELEMETRY_EVENT_TYPES.has(ev.eventType)) {
      continue;
    }
    const eventType = ev.eventType;
    const route = clampString(ev.route, 80) || sessionRecord.current_route || "landing";
    const routeLabel = clampString(ev.routeLabel, 80) || getRouteLabel(route);
    const durationSec = clampInt(ev.durationSec, 0, 7200, 0);
    const scrollDepthPct = clampInt(ev.scrollDepthPct, 0, 100, 0);
    const safeMetadata = {};
    if (ev.metadata && typeof ev.metadata === "object" && !Array.isArray(ev.metadata)) {
      let count = 0;
      for (const [k, v] of Object.entries(ev.metadata)) {
        if (count >= 10) break;
        const cleanKey = clampString(k, 40);
        if (!cleanKey || /pass|token|secret|auth|cookie/i.test(cleanKey)) continue;
        if (typeof v === "string") safeMetadata[cleanKey] = clampString(v, 140);
        else if (typeof v === "number" && Number.isFinite(v)) safeMetadata[cleanKey] = v;
        else if (typeof v === "boolean") safeMetadata[cleanKey] = v;
        count += 1;
      }
    }
    const record = {
      id: `${Date.now()}-${crypto4.randomBytes(4).toString("hex")}`,
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
      created_at: typeof ev.createdAt === "string" && !Number.isNaN(Date.parse(ev.createdAt)) ? ev.createdAt : nowIso
    };
    sanitizedEvents.push(record);
    if (eventType === "click" || eventType === "ad_click" || eventType === "post_interaction") {
      sessionRecord.total_clicks += 1;
    }
    if (eventType === "rage_click") {
      sessionRecord.total_clicks += 1;
      sessionRecord.rage_clicks += 1;
    }
    if (eventType === "page_view") {
      sessionRecord.total_page_views += 1;
      sessionRecord.current_route = route;
    }
    if (eventType === "page_leave" || eventType === "session_heartbeat") {
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
      const { error: sessErr } = await supabaseServer.from("user_activity_sessions").upsert(
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
          is_active: true
        },
        { onConflict: "session_id" }
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
            created_at: e.created_at
          }));
          const { error: evErr } = await supabaseServer.from("user_activity_events").insert(rows);
          if (!evErr) {
            supabaseSynced = true;
          }
        } else {
          supabaseSynced = true;
        }
      }
    } catch {
    }
  }
  return { accepted: sanitizedEvents.length, supabaseSynced };
}
function isUuid(val) {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
}
function isMissingRelationError(err) {
  const msg = String(err?.message || err?.code || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("42p01") || msg.includes("could not find the table");
}
async function fetchMergedTelemetryDataset() {
  const sessionsMap = /* @__PURE__ */ new Map();
  for (const s of Object.values(store.sessions)) {
    sessionsMap.set(s.session_id, s);
  }
  let eventsList = [...store.events];
  let supabaseConnected = false;
  if (isSupabaseServerConfigured) {
    try {
      const [sessRes, evRes] = await Promise.all([
        supabaseServer.from("user_activity_sessions").select("*").order("last_active_at", { ascending: false }).limit(600),
        supabaseServer.from("user_activity_events").select("*").order("created_at", { ascending: false }).limit(2500)
      ]);
      if (!sessRes.error && !evRes.error) {
        supabaseConnected = true;
        supabaseTablesAvailable = true;
        for (const row of sessRes.data || []) {
          sessionsMap.set(String(row.session_id), {
            session_id: String(row.session_id),
            profile_id: row.profile_id ? Number(row.profile_id) : null,
            auth_user_id: row.auth_user_id || null,
            user_name: row.user_name || "Guest Visitor",
            user_email: row.user_email || null,
            batch_year: row.batch_year ? Number(row.batch_year) : null,
            specialty: row.specialty || null,
            city: row.city || null,
            country: row.country || null,
            device_type: row.device_type || "desktop",
            browser: row.browser || "Unknown",
            os: row.os || "Unknown",
            screen_resolution: row.screen_resolution || null,
            referrer: row.referrer || null,
            timezone: row.timezone || null,
            language: row.language || null,
            connection_type: row.connection_type || null,
            utm_source: row.utm_source || null,
            utm_medium: row.utm_medium || null,
            utm_campaign: row.utm_campaign || null,
            color_scheme: row.color_scheme || null,
            current_route: row.current_route || "landing",
            started_at: row.started_at,
            last_active_at: row.last_active_at,
            total_duration_sec: Number(row.total_duration_sec || 0),
            total_clicks: Number(row.total_clicks || 0),
            rage_clicks: Number(row.rage_clicks || 0),
            total_page_views: Number(row.total_page_views || 0),
            max_scroll_pct: Number(row.max_scroll_pct || 0),
            is_active: Boolean(row.is_active)
          });
        }
        const remoteEvents = (evRes.data || []).map((e) => ({
          id: `sb-${e.id}`,
          session_id: String(e.session_id),
          profile_id: e.profile_id ? Number(e.profile_id) : null,
          auth_user_id: e.auth_user_id || null,
          user_name: e.user_name || "Guest Visitor",
          event_type: e.event_type,
          route: e.route || "landing",
          route_label: e.route_label || getRouteLabel(e.route || "landing"),
          element_tag: e.element_tag || null,
          element_label: e.element_label || null,
          element_section: e.element_section || null,
          click_x_pct: e.click_x_pct !== null && e.click_x_pct !== void 0 ? Number(e.click_x_pct) : null,
          click_y_pct: e.click_y_pct !== null && e.click_y_pct !== void 0 ? Number(e.click_y_pct) : null,
          duration_sec: Number(e.duration_sec || 0),
          scroll_depth_pct: Number(e.scroll_depth_pct || 0),
          metadata: e.metadata && typeof e.metadata === "object" ? e.metadata : {},
          created_at: e.created_at
        }));
        if (remoteEvents.length > 0) {
          eventsList = remoteEvents;
        }
      } else if (isMissingRelationError(sessRes.error) || isMissingRelationError(evRes.error)) {
        supabaseTablesAvailable = false;
      }
    } catch {
    }
  }
  const sessions = Array.from(sessionsMap.values()).sort(
    (a, b) => (b.last_active_at || "").localeCompare(a.last_active_at || "")
  );
  eventsList.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  return { sessions, events: eventsList, supabaseConnected };
}
function buildUserSummaries(sessions, events) {
  const nowMs = Date.now();
  const userMap = /* @__PURE__ */ new Map();
  const keyFor = (profileId, email, sessionId) => {
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
        sessionIds: /* @__PURE__ */ new Set(),
        totalClicks: 0,
        rageClicks: 0,
        totalPageViews: 0,
        totalDwellSec: 0,
        maxScrollPct: 0,
        deviceCounts: /* @__PURE__ */ new Map(),
        browser: s.browser,
        os: s.os,
        screenResolution: s.screen_resolution,
        timezone: s.timezone || null,
        language: s.language || null,
        connectionType: s.connection_type || null,
        utmSource: s.utm_source || null,
        colorScheme: s.color_scheme || null,
        hourHistogram: new Array(24).fill(0),
        routeStats: /* @__PURE__ */ new Map()
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
    if (s.user_name && s.user_name !== "Guest Visitor") entry.userName = s.user_name;
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
  const sessionToKey = /* @__PURE__ */ new Map();
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
    const rKey = (ev.route || "landing").split(":")[0].toLowerCase();
    const rStat = entry.routeStats.get(rKey) || { dwellSec: 0, views: 0, clicks: 0 };
    if (ev.event_type === "page_view") rStat.views += 1;
    if (ev.event_type === "click" || ev.event_type === "rage_click" || ev.event_type === "post_interaction" || ev.event_type === "ad_click") {
      rStat.clicks += 1;
    }
    if (ev.event_type === "page_leave" || ev.event_type === "session_heartbeat") {
      rStat.dwellSec += ev.duration_sec;
    }
    entry.routeStats.set(rKey, rStat);
  }
  const summaries = [];
  for (const entry of userMap.values()) {
    const routeBreakdown = Array.from(entry.routeStats.entries()).map(([route, stats]) => ({
      route,
      routeLabel: getRouteLabel(route),
      dwellSec: stats.dwellSec,
      views: stats.views,
      clicks: stats.clicks
    })).sort((a, b) => b.dwellSec * 2 + b.clicks * 5 + b.views * 3 - (a.dwellSec * 2 + a.clicks * 5 + a.views * 3));
    const topRouteObj = routeBreakdown[0] || {
      route: entry.currentRoute || "feed",
      routeLabel: getRouteLabel(entry.currentRoute || "feed")
    };
    const interestScores = /* @__PURE__ */ new Map();
    for (const r of routeBreakdown) {
      if (r.route === "admin") continue;
      const interest = getRouteInterest(r.route);
      const pts = r.dwellSec * 1.5 + r.clicks * 8 + r.views * 4;
      interestScores.set(interest, (interestScores.get(interest) || 0) + pts);
    }
    const maxPts = Math.max(1, ...Array.from(interestScores.values()));
    const inferredInterests = Array.from(interestScores.entries()).map(([label, pts]) => ({
      label,
      score: Math.min(99, Math.max(15, Math.round(pts / maxPts * 100)))
    })).sort((a, b) => b.score - a.score).slice(0, 4);
    let primaryDevice = "desktop";
    let bestDeviceCount = -1;
    for (const [dev, cnt] of entry.deviceCounts.entries()) {
      if (cnt > bestDeviceCount) {
        bestDeviceCount = cnt;
        primaryDevice = dev;
      }
    }
    const lastMs = Date.parse(entry.lastActiveAt || "");
    const hoursSinceActive = Number.isFinite(lastMs) ? Math.max(0, (nowMs - lastMs) / 36e5) : 999;
    const isOnlineNow = Number.isFinite(lastMs) && nowMs - lastMs <= ONLINE_WINDOW_MS;
    const recencyPts = hoursSinceActive <= 24 ? 25 : hoursSinceActive <= 72 ? 18 : hoursSinceActive <= 168 ? 10 : 3;
    const sessionPts = Math.min(20, entry.sessionIds.size * 6);
    const clickPts = Math.min(25, entry.totalClicks * 1.4);
    const dwellPts = Math.min(20, entry.totalDwellSec / 60 * 3.5);
    const scrollPts = Math.min(10, entry.maxScrollPct / 100 * 10);
    const engagementScore = Math.min(100, Math.round(recencyPts + sessionPts + clickPts + dwellPts + scrollPts));
    let lifecycleStage = "New Visitor";
    if (hoursSinceActive > 168 && entry.totalClicks >= 3) {
      lifecycleStage = "At-Risk";
    } else if (engagementScore >= 72) {
      lifecycleStage = "Power User";
    } else if (engagementScore >= 45) {
      lifecycleStage = "Active Regular";
    } else if (entry.totalPageViews >= 3 || entry.totalClicks >= 3) {
      lifecycleStage = "Explorer";
    }
    const churnRisk = hoursSinceActive > 168 ? "High" : hoursSinceActive > 48 || engagementScore < 35 ? "Medium" : "Low";
    let bestHour = 0;
    let bestHourCount = -1;
    entry.hourHistogram.forEach((cnt, hr) => {
      if (cnt > bestHourCount) {
        bestHourCount = cnt;
        bestHour = hr;
      }
    });
    const peakHourLabel = bestHourCount > 0 ? `${String(bestHour).padStart(2, "0")}:00\u2013${String((bestHour + 2) % 24).padStart(2, "0")}:00` : "Not enough data";
    const recommendedActions = [];
    if (inferredInterests[0]) {
      recommendedActions.push(
        `Target with "${inferredInterests[0].label}" campaigns (${inferredInterests[0].score}% behavioral fit).`
      );
    }
    if (bestHourCount > 0) {
      recommendedActions.push(`Best delivery window for ads & notices: ${peakHourLabel}.`);
    }
    if (churnRisk === "High") {
      recommendedActions.push("Dormant >7 days \u2014 include in re-engagement digest or reunion email.");
    } else if (lifecycleStage === "Power User") {
      recommendedActions.push("High-influence member \u2014 strong candidate for ambassador/sponsor outreach.");
    }
    if (entry.rageClicks > 0) {
      recommendedActions.push(
        `Experienced ${entry.rageClicks} rage-click friction event(s) \u2014 review UX on ${topRouteObj.routeLabel}.`
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
      routeDwellBreakdown: routeBreakdown
    });
  }
  return summaries.sort((a, b) => {
    if (a.isOnlineNow !== b.isOnlineNow) return a.isOnlineNow ? -1 : 1;
    return (b.lastActiveAt || "").localeCompare(a.lastActiveAt || "");
  });
}
async function getTelemetryOverview(rangeHours = 168) {
  const { sessions, events, supabaseConnected } = await fetchMergedTelemetryDataset();
  const cutoffMs = rangeHours > 0 ? Date.now() - rangeHours * 3600 * 1e3 : 0;
  const filteredSessions = cutoffMs ? sessions.filter((s) => Date.parse(s.last_active_at || "") >= cutoffMs) : sessions;
  const filteredEvents = cutoffMs ? events.filter((e) => Date.parse(e.created_at || "") >= cutoffMs) : events;
  const users = buildUserSummaries(filteredSessions, filteredEvents);
  const onlineNowCount = users.filter((u) => u.isOnlineNow).length;
  const totalClicks = filteredSessions.reduce((acc, s) => acc + s.total_clicks, 0);
  const totalRageClicks = filteredSessions.reduce((acc, s) => acc + (s.rage_clicks || 0), 0);
  const totalPageViews = filteredSessions.reduce((acc, s) => acc + s.total_page_views, 0);
  const totalDwellSec = filteredSessions.reduce((acc, s) => acc + s.total_duration_sec, 0);
  const avgSessionSec = filteredSessions.length > 0 ? Math.round(totalDwellSec / filteredSessions.length) : 0;
  const avgEngagementScore = users.length > 0 ? Math.round(users.reduce((acc, u) => acc + u.engagementScore, 0) / users.length) : 0;
  const routeMap = /* @__PURE__ */ new Map();
  for (const ev of filteredEvents) {
    const r = (ev.route || "landing").split(":")[0].toLowerCase();
    let item = routeMap.get(r);
    if (!item) {
      item = {
        route: r,
        routeLabel: getRouteLabel(r),
        views: 0,
        clicks: 0,
        dwellSec: 0,
        uniqueUsers: /* @__PURE__ */ new Set()
      };
      routeMap.set(r, item);
    }
    item.uniqueUsers.add(ev.profile_id ? `p:${ev.profile_id}` : ev.session_id);
    if (ev.event_type === "page_view") item.views += 1;
    if (ev.event_type === "click" || ev.event_type === "rage_click" || ev.event_type === "post_interaction" || ev.event_type === "ad_click") {
      item.clicks += 1;
    }
    if (ev.event_type === "page_leave" || ev.event_type === "session_heartbeat") {
      item.dwellSec += ev.duration_sec;
    }
  }
  const routeMetrics = Array.from(routeMap.values()).map((r) => ({
    route: r.route,
    routeLabel: r.routeLabel,
    views: r.views,
    clicks: r.clicks,
    dwellSec: r.dwellSec,
    uniqueUsers: r.uniqueUsers.size,
    avgDwellSec: r.views > 0 ? Math.round(r.dwellSec / r.views) : r.dwellSec
  })).sort((a, b) => b.dwellSec + b.clicks * 4 + b.views * 2 - (a.dwellSec + a.clicks * 4 + a.views * 2));
  const hotspotMap = /* @__PURE__ */ new Map();
  for (const ev of filteredEvents) {
    if (ev.event_type !== "click" && ev.event_type !== "rage_click" && ev.event_type !== "post_interaction" && ev.event_type !== "ad_click") {
      continue;
    }
    const label = ev.element_label || ev.element_tag || "Interactive Element";
    const route = (ev.route || "landing").split(":")[0].toLowerCase();
    const key = `${route}::${label.toLowerCase()}`;
    const existing = hotspotMap.get(key);
    if (!existing) {
      hotspotMap.set(key, {
        label,
        tag: ev.element_tag || "button",
        route,
        routeLabel: getRouteLabel(route),
        section: ev.element_section || getRouteLabel(route),
        clicks: 1,
        lastClickedAt: ev.created_at
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
  const topClickHotspots = Array.from(hotspotMap.values()).sort((a, b) => b.clicks - a.clicks).slice(0, 15).map((h) => ({
    ...h,
    sharePct: Math.round(h.clicks / totalHotspotClicks * 1e3) / 10
  }));
  const heatmapPoints = filteredEvents.filter(
    (ev) => (ev.event_type === "click" || ev.event_type === "rage_click") && ev.click_x_pct !== null && ev.click_y_pct !== null
  ).slice(0, 400).map((ev) => ({
    route: (ev.route || "landing").split(":")[0].toLowerCase(),
    routeLabel: ev.route_label,
    xPct: ev.click_x_pct,
    yPct: ev.click_y_pct,
    isRage: ev.event_type === "rage_click",
    label: ev.element_label || ev.element_tag || "Click"
  }));
  const flowMap = /* @__PURE__ */ new Map();
  for (const ev of filteredEvents) {
    if (ev.event_type === "page_view" && ev.metadata?.fromRoute) {
      const from = String(ev.metadata.fromRoute).split(":")[0].toLowerCase();
      const to = (ev.route || "landing").split(":")[0].toLowerCase();
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
          count: 1
        });
      }
    }
  }
  const navigationFlows = Array.from(flowMap.values()).sort((a, b) => b.count - a.count).slice(0, 12);
  const rageMap = /* @__PURE__ */ new Map();
  for (const ev of filteredEvents) {
    if (ev.event_type !== "rage_click") continue;
    const label = ev.element_label || ev.element_tag || "Unresponsive Element";
    const key = `${ev.route}::${label}`;
    const existing = rageMap.get(key);
    if (existing) {
      existing.count += 1;
      if (ev.created_at > existing.lastSeen) existing.lastSeen = ev.created_at;
    } else {
      rageMap.set(key, { label, routeLabel: ev.route_label, count: 1, lastSeen: ev.created_at });
    }
  }
  const rageClickAlerts = Array.from(rageMap.values()).sort((a, b) => b.count - a.count).slice(0, 8);
  const lifecycleCounts = {
    "Power User": 0,
    "Active Regular": 0,
    Explorer: 0,
    "At-Risk": 0,
    "New Visitor": 0
  };
  for (const u of users) {
    lifecycleCounts[u.lifecycleStage] += 1;
  }
  const lifecycleDistribution = Object.entries(lifecycleCounts).map(([stage, count]) => ({
    stage,
    count
  }));
  const peakBlocks = [
    { label: "00\u201303", start: 0, events: 0 },
    { label: "03\u201306", start: 3, events: 0 },
    { label: "06\u201309", start: 6, events: 0 },
    { label: "09\u201312", start: 9, events: 0 },
    { label: "12\u201315", start: 12, events: 0 },
    { label: "15\u201318", start: 15, events: 0 },
    { label: "18\u201321", start: 18, events: 0 },
    { label: "21\u201324", start: 21, events: 0 }
  ];
  for (const ev of filteredEvents) {
    const d = new Date(ev.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const idx = Math.floor(d.getHours() / 3);
    if (peakBlocks[idx]) peakBlocks[idx].events += 1;
  }
  const utmMap = /* @__PURE__ */ new Map();
  const tzMap = /* @__PURE__ */ new Map();
  const langMap = /* @__PURE__ */ new Map();
  for (const s of filteredSessions) {
    const src = s.utm_source || (s.referrer ? safeHost(s.referrer) : "Direct / Portal");
    utmMap.set(src, (utmMap.get(src) || 0) + 1);
    if (s.timezone) tzMap.set(s.timezone, (tzMap.get(s.timezone) || 0) + 1);
    if (s.language) langMap.set(s.language, (langMap.get(s.language) || 0) + 1);
  }
  const acquisitionSources = Array.from(utmMap.entries()).map(([source, sessionsCount]) => ({ source, sessions: sessionsCount })).sort((a, b) => b.sessions - a.sessions).slice(0, 8);
  const topTimezones = Array.from(tzMap.entries()).map(([timezone, count]) => ({ timezone, count })).sort((a, b) => b.count - a.count).slice(0, 6);
  const topLanguages = Array.from(langMap.entries()).map(([language, count]) => ({ language, count })).sort((a, b) => b.count - a.count).slice(0, 6);
  const hourlyMap = /* @__PURE__ */ new Map();
  const now = /* @__PURE__ */ new Date();
  for (let i = 11; i >= 0; i--) {
    const slot = new Date(now.getTime() - i * 2 * 3600 * 1e3);
    const key = `${slot.getFullYear()}-${slot.getMonth()}-${slot.getDate()}-${Math.floor(slot.getHours() / 2)}`;
    const hourStr = `${String(Math.floor(slot.getHours() / 2) * 2).padStart(2, "0")}:00`;
    hourlyMap.set(key, { label: hourStr, clicks: 0, pageViews: 0, dwellMin: 0 });
  }
  for (const ev of filteredEvents) {
    const d = new Date(ev.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${Math.floor(d.getHours() / 2)}`;
    const bucket = hourlyMap.get(key);
    if (!bucket) continue;
    if (ev.event_type === "click" || ev.event_type === "rage_click" || ev.event_type === "post_interaction") {
      bucket.clicks += 1;
    }
    if (ev.event_type === "page_view") bucket.pageViews += 1;
    if (ev.event_type === "page_leave" || ev.event_type === "session_heartbeat") {
      bucket.dwellMin = Math.round((bucket.dwellMin + ev.duration_sec / 60) * 10) / 10;
    }
  }
  const deviceCounts = { desktop: 0, mobile: 0, tablet: 0 };
  for (const s of filteredSessions) {
    deviceCounts[s.device_type] = (deviceCounts[s.device_type] || 0) + 1;
  }
  const deviceBreakdown = Object.entries(deviceCounts).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    key: name,
    value
  }));
  const interestTotals = /* @__PURE__ */ new Map();
  for (const u of users) {
    for (const intr of u.inferredInterests) {
      interestTotals.set(intr.label, (interestTotals.get(intr.label) || 0) + 1);
    }
  }
  const audienceInterests = Array.from(interestTotals.entries()).map(([interest, userCount]) => ({ interest, userCount })).sort((a, b) => b.userCount - a.userCount);
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
      avgEngagementScore
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
    segments: await listAdSegments(users)
  };
}
function safeHost(urlStr) {
  try {
    return new URL(urlStr).hostname || "Referral";
  } catch {
    return urlStr.slice(0, 40) || "Referral";
  }
}
async function getUserTelemetryDossier(userKey) {
  const { sessions, events, supabaseConnected } = await fetchMergedTelemetryDataset();
  const users = buildUserSummaries(sessions, events);
  const summary = users.find((u) => u.userKey === userKey || String(u.profileId) === userKey);
  if (!summary) {
    return null;
  }
  const matchingSessionIds = new Set(
    sessions.filter((s) => {
      if (summary.profileId && s.profile_id === summary.profileId) return true;
      if (summary.userEmail && s.user_email?.toLowerCase() === summary.userEmail.toLowerCase()) return true;
      return `guest:${s.session_id}` === summary.userKey;
    }).map((s) => s.session_id)
  );
  const userSessions = sessions.filter((s) => matchingSessionIds.has(s.session_id));
  const userEvents = events.filter(
    (e) => matchingSessionIds.has(e.session_id) || summary.profileId && e.profile_id === summary.profileId
  );
  const searchTerms = userEvents.filter((e) => e.event_type === "search" && e.metadata?.query).map((e) => ({
    query: String(e.metadata.query),
    route: e.route_label,
    createdAt: e.created_at
  })).slice(0, 20);
  const clickMap = /* @__PURE__ */ new Map();
  for (const ev of userEvents) {
    if (ev.event_type !== "click" && ev.event_type !== "rage_click" && ev.event_type !== "post_interaction") {
      continue;
    }
    const label = ev.element_label || ev.element_tag || "Element";
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
    topClicks: Array.from(clickMap.values()).sort((a, b) => b.count - a.count).slice(0, 12)
  };
}
function matchUsersForSegment(users, segment) {
  return users.filter((u) => {
    if (segment.min_clicks > 0 && u.totalClicks < segment.min_clicks) return false;
    if (segment.min_dwell_sec > 0 && u.totalDwellSec < segment.min_dwell_sec) return false;
    if (segment.min_batch !== null && segment.min_batch !== void 0) {
      if (!u.batchYear || u.batchYear < segment.min_batch) return false;
    }
    if (segment.max_batch !== null && segment.max_batch !== void 0) {
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
async function listAdSegments(precomputedUsers) {
  let segments = [...store.segments];
  if (isSupabaseServerConfigured && supabaseTablesAvailable !== false) {
    try {
      const { data, error } = await supabaseServer.from("ad_audience_segments").select("*").order("created_at", { ascending: false });
      if (!error && Array.isArray(data) && data.length > 0) {
        segments = data;
      }
    } catch {
    }
  }
  let users = precomputedUsers;
  if (!users) {
    const merged = await fetchMergedTelemetryDataset();
    users = buildUserSummaries(merged.sessions, merged.events);
  }
  return segments.map((seg) => {
    const matched = matchUsersForSegment(users, seg);
    return {
      ...seg,
      matchedUsersCount: matched.length,
      matchedUserPreview: matched.slice(0, 6).map((u) => ({
        userKey: u.userKey,
        profileId: u.profileId,
        userName: u.userName,
        batchYear: u.batchYear,
        totalClicks: u.totalClicks,
        totalDwellSec: u.totalDwellSec
      }))
    };
  });
}
async function createAdSegment(input, createdBy) {
  const name = clampString(input.name, 80);
  if (!name) throw new Error("Audience segment name is required.");
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const segment = {
    id: `seg-${Date.now()}-${crypto4.randomBytes(3).toString("hex")}`,
    name,
    description: clampString(input.description, 240) || "",
    target_routes: Array.isArray(input.target_routes) ? input.target_routes.map((r) => String(r).toLowerCase().trim()).filter(Boolean).slice(0, 15) : [],
    target_interests: Array.isArray(input.target_interests) ? input.target_interests.map((i) => String(i).trim()).filter(Boolean).slice(0, 10) : [],
    target_devices: Array.isArray(input.target_devices) ? input.target_devices.filter((d) => ["desktop", "mobile", "tablet"].includes(String(d))) : [],
    min_clicks: clampInt(input.min_clicks, 0, 1e5, 0),
    min_dwell_sec: clampInt(input.min_dwell_sec, 0, 1e6, 0),
    min_batch: input.min_batch !== null && input.min_batch !== void 0 && String(input.min_batch) !== "" ? clampInt(input.min_batch, 1, 100) : null,
    max_batch: input.max_batch !== null && input.max_batch !== void 0 && String(input.max_batch) !== "" ? clampInt(input.max_batch, 1, 100) : null,
    created_by: createdBy,
    created_at: nowIso,
    updated_at: nowIso
  };
  store.segments = [segment, ...store.segments];
  scheduleDiskFlush();
  if (isSupabaseServerConfigured && supabaseTablesAvailable !== false) {
    try {
      await supabaseServer.from("ad_audience_segments").upsert(segment, { onConflict: "id" });
    } catch {
    }
  }
  return segment;
}
async function deleteAdSegment(id) {
  const cleanId = clampString(id, 80);
  if (!cleanId) return false;
  store.segments = store.segments.filter((s) => s.id !== cleanId);
  scheduleDiskFlush();
  if (isSupabaseServerConfigured && supabaseTablesAvailable !== false) {
    try {
      await supabaseServer.from("ad_audience_segments").delete().eq("id", cleanId);
    } catch {
    }
  }
  return true;
}
async function clearTelemetryLogs() {
  store.sessions = {};
  store.events = [];
  scheduleDiskFlush();
}

// server/routes/telemetry.ts
function resolveActorEmail(req) {
  return req.dbUser?.email || "Super Admin";
}
function createTelemetryRouter() {
  const router = Router2();
  router.post(
    "/api/telemetry/batch",
    rateLimitGuard(180, 6e4),
    optionalAuth,
    async (req, res) => {
      try {
        const body = req.body;
        if (!body || typeof body !== "object" || !body.session?.sessionId) {
          return res.status(400).json({ error: "Invalid telemetry payload." });
        }
        const result = await ingestTelemetryBatch(body, req.dbUser || null);
        return res.json({ ok: true, ...result });
      } catch (err) {
        return res.status(500).json({ error: err?.message || "Failed to ingest telemetry batch." });
      }
    }
  );
  router.get(
    "/api/admin/telemetry/overview",
    rateLimitGuard(120, 6e4),
    requireSuperAdmin,
    async (req, res) => {
      try {
        const rawRange = Number(req.query.rangeHours);
        const rangeHours = Number.isFinite(rawRange) && rawRange >= 0 && rawRange <= 8760 ? rawRange : 168;
        const overview = await getTelemetryOverview(rangeHours);
        return res.json(overview);
      } catch (err) {
        return res.status(500).json({ error: err?.message || "Failed to load telemetry overview." });
      }
    }
  );
  router.get(
    "/api/admin/telemetry/user/:userKey",
    rateLimitGuard(120, 6e4),
    requireSuperAdmin,
    async (req, res) => {
      try {
        const userKey = decodeURIComponent(String(req.params.userKey || "")).trim();
        if (!userKey || userKey.length > 140) {
          return res.status(400).json({ error: "Invalid user identifier." });
        }
        const dossier = await getUserTelemetryDossier(userKey);
        if (!dossier) {
          return res.status(404).json({ error: "No behavioral telemetry found for this user." });
        }
        return res.json(dossier);
      } catch (err) {
        return res.status(500).json({ error: err?.message || "Failed to load user dossier." });
      }
    }
  );
  router.get(
    "/api/admin/telemetry/segments",
    rateLimitGuard(120, 6e4),
    requireSuperAdmin,
    async (_req, res) => {
      try {
        const segments = await listAdSegments();
        return res.json({ segments });
      } catch (err) {
        return res.status(500).json({ error: err?.message || "Failed to list audience segments." });
      }
    }
  );
  router.post(
    "/api/admin/telemetry/segments",
    rateLimitGuard(60, 6e4),
    requireSuperAdmin,
    async (req, res) => {
      try {
        const created = await createAdSegment(req.body || {}, resolveActorEmail(req));
        return res.status(201).json({ success: true, segment: created });
      } catch (err) {
        return res.status(400).json({ error: err?.message || "Failed to create audience segment." });
      }
    }
  );
  router.delete(
    "/api/admin/telemetry/segments/:id",
    rateLimitGuard(60, 6e4),
    requireSuperAdmin,
    async (req, res) => {
      try {
        const id = String(req.params.id || "").trim();
        await deleteAdSegment(id);
        return res.json({ success: true });
      } catch (err) {
        return res.status(500).json({ error: err?.message || "Failed to delete audience segment." });
      }
    }
  );
  router.post(
    "/api/admin/telemetry/clear",
    rateLimitGuard(10, 6e4),
    requireSuperAdmin,
    async (_req, res) => {
      try {
        await clearTelemetryLogs();
        return res.json({ success: true, message: "Local telemetry session buffer cleared." });
      } catch (err) {
        return res.status(500).json({ error: err?.message || "Failed to clear telemetry logs." });
      }
    }
  );
  return router;
}

// server/routes/push.ts
import { Router as Router3 } from "express";

// server/lib/validation.ts
function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maxLength);
}
function normalizeSafeHttpUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) return trimmed.slice(0, 500);
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href.slice(0, 1e3);
    }
  } catch {
    return null;
  }
  return null;
}

// server/routes/push.ts
var memoryPushSubscriptions = /* @__PURE__ */ new Map();
function extractBearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  return null;
}
function createPushRouter() {
  const router = Router3();
  router.get("/api/push/vapid-public-key", rateLimitGuard(60, 6e4), (_req, res) => {
    const publicKey = (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || "").trim();
    return res.json({
      configured: Boolean(publicKey),
      publicKey: publicKey || null
    });
  });
  router.post(
    "/api/push/subscribe",
    rateLimitGuard(30, 6e4),
    requireAuth,
    async (req, res) => {
      try {
        const profileId = Number(req.dbUser?.id || 0);
        if (!profileId) {
          return res.status(401).json({ error: "Valid user profile required." });
        }
        const sub = req.body?.subscription || req.body;
        const endpoint = normalizeSafeHttpUrl(sub?.endpoint);
        const p256dh = cleanText(sub?.keys?.p256dh || sub?.p256dh, 512);
        const authSecret = cleanText(sub?.keys?.auth || sub?.auth, 256);
        if (!endpoint || !p256dh || !authSecret) {
          return res.status(400).json({ error: "Valid Web Push subscription (endpoint, p256dh, auth) required." });
        }
        const userAgent = cleanText(req.headers["user-agent"] || "", 300);
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        memoryPushSubscriptions.set(`${profileId}:${endpoint}`, {
          profileId,
          endpoint,
          p256dh,
          auth: authSecret,
          userAgent,
          updatedAt: nowIso
        });
        if (isSupabaseServerConfigured) {
          const writeCtx = getSupabaseWriteClient(req.supabaseAccessToken || extractBearerToken(req));
          const dbClient = writeCtx?.client || supabaseServer;
          const { error } = await dbClient.from("push_subscriptions").upsert(
            {
              profile_id: profileId,
              endpoint,
              p256dh,
              auth: authSecret,
              user_agent: userAgent || null,
              updated_at: nowIso
            },
            { onConflict: "profile_id,endpoint" }
          );
          if (!error) {
            return res.status(201).json({ ok: true, persisted: "supabase" });
          }
        }
        return res.status(201).json({ ok: true, persisted: "memory" });
      } catch (err) {
        return res.status(500).json({ error: err?.message || "Failed to save push subscription." });
      }
    }
  );
  router.post(
    "/api/push/unsubscribe",
    rateLimitGuard(30, 6e4),
    requireAuth,
    async (req, res) => {
      try {
        const profileId = Number(req.dbUser?.id || 0);
        const endpoint = normalizeSafeHttpUrl(req.body?.endpoint);
        if (!profileId || !endpoint) {
          return res.status(400).json({ error: "Valid profile and endpoint required." });
        }
        memoryPushSubscriptions.delete(`${profileId}:${endpoint}`);
        if (isSupabaseServerConfigured) {
          const writeCtx = getSupabaseWriteClient(req.supabaseAccessToken || extractBearerToken(req));
          const dbClient = writeCtx?.client || supabaseServer;
          await dbClient.from("push_subscriptions").delete().eq("profile_id", profileId).eq("endpoint", endpoint);
        }
        return res.json({ ok: true });
      } catch (err) {
        return res.status(500).json({ error: err?.message || "Failed to remove push subscription." });
      }
    }
  );
  return router;
}

// server/db/adminRepository.ts
var DEFAULT_STREAM_GROUPS = [
  { id: 1, stream: "Science", group_code: null, groupCode: null, expected_group_count: 17, expectedGroupCount: 17, is_active: true, isActive: true },
  { id: 2, stream: "Humanities", group_code: "G", groupCode: "G", expected_group_count: 4, expectedGroupCount: 4, is_active: true, isActive: true },
  { id: 3, stream: "Humanities", group_code: "H", groupCode: "H", expected_group_count: 4, expectedGroupCount: 4, is_active: true, isActive: true },
  { id: 4, stream: "Humanities", group_code: "L", groupCode: "L", expected_group_count: 4, expectedGroupCount: 4, is_active: true, isActive: true },
  { id: 5, stream: "Humanities", group_code: "W", groupCode: "W", expected_group_count: 4, expectedGroupCount: 4, is_active: true, isActive: true },
  { id: 6, stream: "Business Studies", group_code: "A", groupCode: "A", expected_group_count: 6, expectedGroupCount: 6, is_active: true, isActive: true },
  { id: 7, stream: "Business Studies", group_code: "B", groupCode: "B", expected_group_count: 6, expectedGroupCount: 6, is_active: true, isActive: true },
  { id: 8, stream: "Business Studies", group_code: "C", groupCode: "C", expected_group_count: 6, expectedGroupCount: 6, is_active: true, isActive: true },
  { id: 9, stream: "Business Studies", group_code: "D", groupCode: "D", expected_group_count: 6, expectedGroupCount: 6, is_active: true, isActive: true },
  { id: 10, stream: "Business Studies", group_code: "E", groupCode: "E", expected_group_count: 6, expectedGroupCount: 6, is_active: true, isActive: true },
  { id: 11, stream: "Business Studies", group_code: "F", groupCode: "F", expected_group_count: 6, expectedGroupCount: 6, is_active: true, isActive: true }
];
var inMemoryAlumniProfiles = [];
var serverAutoVerifyConfig = {
  enabled: true,
  paused: false,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3).toISOString()
};
function isServerAutoVerifyActive() {
  if (!serverAutoVerifyConfig.enabled || serverAutoVerifyConfig.paused) return false;
  return /* @__PURE__ */ new Date() < new Date(serverAutoVerifyConfig.expiresAt);
}
function setServerAutoVerifyConfig(updates) {
  Object.assign(serverAutoVerifyConfig, updates);
  return { ...serverAutoVerifyConfig };
}
async function bulkVerifyAllAlumniProfiles(params) {
  let verifiedCount = 0;
  if (isSupabaseServerConfigured) {
    try {
      const { data, error } = await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).update({
        verification_status: "verified",
        verification_method: "admin_instant",
        vouches_count: 2,
        verified_at: (/* @__PURE__ */ new Date()).toISOString()
      }).neq("verification_status", "verified").select("id");
      if (!error && data) {
        verifiedCount = data.length;
      }
    } catch (err) {
      console.warn("Supabase bulk verify notice:", err);
    }
  }
  for (const p of inMemoryAlumniProfiles) {
    if (p.verificationStatus !== "verified") {
      p.verificationStatus = "verified";
      p.verificationMethod = "admin_instant";
      p.vouchesCount = 2;
      p.verifiedAt = (/* @__PURE__ */ new Date()).toISOString();
      verifiedCount++;
    }
  }
  await recordSecurityAuditLog({
    actorUid: params.actorUid,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    action: "BULK_VERIFY_ALUMNI",
    targetType: "alumni_profiles",
    targetId: "ALL_PENDING",
    summary: `Super Admin bulk verified all ${verifiedCount} pending alumni profiles during launch window.`
  });
  return { verifiedCount };
}
async function recordSecurityAuditLog(params) {
  if (isSupabaseServerConfigured) {
    try {
      const { data, error } = await supabaseServer.from(SUPABASE_TABLES.AUDIT_LOGS).insert({
        actor_auth_id: params.actorUid,
        action: params.action,
        entity_table: params.targetType,
        entity_id: params.targetId,
        reason: params.summary
      }).select().single();
      if (!error && data) return data;
    } catch (err) {
      console.warn("Supabase audit log insert error:", err);
    }
  }
  return {
    id: Date.now(),
    actorUid: params.actorUid,
    actorEmail: params.actorEmail,
    action: params.action,
    summary: params.summary,
    createdAt: /* @__PURE__ */ new Date()
  };
}
async function getAcademicStreamGroupsConfig() {
  if (isSupabaseServerConfigured) {
    try {
      const { data, error } = await supabaseServer.from(SUPABASE_TABLES.ACADEMIC_STREAM_GROUPS).select("id, stream, group_code, expected_group_count, is_active, created_at, updated_at").order("stream").order("group_code");
      if (!error && data && data.length > 0) {
        return data.map((r) => ({
          id: r.id,
          stream: r.stream,
          groupCode: r.group_code,
          expectedGroupCount: r.expected_group_count,
          isActive: r.is_active,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }));
      }
    } catch (err) {
      console.warn("Supabase getAcademicStreamGroupsConfig error:", err);
    }
  }
  return DEFAULT_STREAM_GROUPS;
}
async function toggleAcademicStreamGroupActive(params) {
  if (isSupabaseServerConfigured) {
    try {
      const { data, error } = await supabaseServer.from(SUPABASE_TABLES.ACADEMIC_STREAM_GROUPS).update({
        is_active: params.isActive,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }).eq("id", params.id).select().single();
      if (!error && data) {
        return {
          id: data.id,
          stream: data.stream,
          groupCode: data.group_code,
          expectedGroupCount: data.expected_group_count,
          isActive: data.is_active
        };
      }
    } catch (err) {
      console.warn("Supabase toggleAcademicStreamGroupActive error:", err);
    }
  }
  const found = DEFAULT_STREAM_GROUPS.find((g) => g.id === params.id);
  if (!found) throw new Error("Academic stream group row not found.");
  found.is_active = params.isActive;
  found.isActive = params.isActive;
  return found;
}
async function getAdminOverviewMetrics() {
  let totalProfiles = 0;
  let verifiedProfiles = 0;
  let pendingProfiles = 0;
  let suspendedProfiles = 0;
  let registeredDonors = 0;
  let pendingDocReviews = 0;
  let activeBloodEmergencies = 0;
  let publishedNotices = 0;
  let scienceCount = 0;
  let humanitiesCount = 0;
  let businessCount = 0;
  let streamGroupsConfig = DEFAULT_STREAM_GROUPS;
  let recentAuditLogs = [];
  if (isSupabaseServerConfigured) {
    try {
      const [
        totalRes,
        verifiedRes,
        pendingRes,
        suspendedRes,
        donorsRes,
        pendingDocsRes,
        bloodRes,
        noticesRes,
        streamConfigRes,
        auditLogsRes,
        sciRes,
        humRes,
        busRes
      ] = await Promise.all([
        supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("id", { count: "exact", head: true }),
        supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("id", { count: "exact", head: true }).eq("verification_status", "verified"),
        supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("id", { count: "exact", head: true }).eq("verification_status", "pending_vouch"),
        supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("id", { count: "exact", head: true }).eq("is_public", false),
        supabaseServer.from(SUPABASE_TABLES.BLOOD_DONORS).select("user_id", { count: "exact", head: true }).eq("is_registered_donor", true),
        supabaseServer.from(SUPABASE_TABLES.ADMIN_DOC_SUBMISSIONS).select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabaseServer.from(SUPABASE_TABLES.BLOOD_REQUESTS).select("id", { count: "exact", head: true }).in("status", ["Active", "Pending Verification"]),
        supabaseServer.from(SUPABASE_TABLES.OFFICIAL_NOTICES).select("id", { count: "exact", head: true }).eq("is_published", true),
        supabaseServer.from(SUPABASE_TABLES.ACADEMIC_STREAM_GROUPS).select("*").order("stream").order("group_code"),
        supabaseServer.from(SUPABASE_TABLES.AUDIT_LOGS).select("*").order("created_at", { ascending: false }).limit(15),
        supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("id", { count: "exact", head: true }).eq("academic_stream", "Science"),
        supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("id", { count: "exact", head: true }).eq("academic_stream", "Humanities"),
        supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("id", { count: "exact", head: true }).eq("academic_stream", "Business Studies")
      ]);
      totalProfiles = totalRes.count ?? 0;
      verifiedProfiles = verifiedRes.count ?? 0;
      pendingProfiles = pendingRes.count ?? 0;
      suspendedProfiles = suspendedRes.count ?? 0;
      registeredDonors = donorsRes.count ?? 0;
      pendingDocReviews = pendingDocsRes.count ?? 0;
      activeBloodEmergencies = bloodRes.count ?? 0;
      publishedNotices = noticesRes.count ?? 0;
      scienceCount = sciRes.count ?? 0;
      humanitiesCount = humRes.count ?? 0;
      businessCount = busRes.count ?? 0;
      if (streamConfigRes.data && streamConfigRes.data.length > 0) {
        streamGroupsConfig = streamConfigRes.data.map((r) => ({
          id: r.id,
          stream: r.stream,
          groupCode: r.group_code,
          expectedGroupCount: r.expected_group_count,
          isActive: r.is_active
        }));
      }
      if (auditLogsRes.data && auditLogsRes.data.length > 0) {
        recentAuditLogs = auditLogsRes.data.map((r) => ({
          id: r.id,
          actorUid: r.actor_auth_id || "system",
          actorEmail: r.actor_auth_id || "admin@szmcalumni.net",
          actorRole: "admin",
          action: r.action,
          targetType: r.entity_table,
          targetId: r.entity_id,
          severity: "info",
          summary: r.reason || r.action,
          createdAt: r.created_at
        }));
      }
    } catch (err) {
      console.warn("Supabase overview metrics error:", err);
    }
  }
  return {
    totalProfiles,
    verifiedProfiles,
    pendingProfiles,
    suspendedProfiles,
    registeredDonors,
    pendingDocReviews,
    activeBloodEmergencies,
    publishedNotices,
    streamDistribution: {
      Science: scienceCount,
      Humanities: humanitiesCount,
      "Business Studies": businessCount
    },
    streamGroupsConfig,
    recentAuditLogs
  };
}
async function queryPaginatedAlumniProfiles(params) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 25));
  const offset = (page - 1) * limit;
  if (isSupabaseServerConfigured) {
    try {
      let query = supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("*", { count: "exact" });
      if (params.batchYear && !Number.isNaN(Number(params.batchYear))) {
        query = query.eq("batch_year", Number(params.batchYear));
      }
      if (params.academicStream && params.academicStream !== "all") {
        query = query.eq("academic_stream", params.academicStream);
      }
      if (params.verificationStatus && params.verificationStatus !== "all") {
        query = query.eq("verification_status", params.verificationStatus);
      }
      if (params.role && params.role !== "all") {
        query = query.eq("role", params.role);
      }
      if (params.bloodGroup && params.bloodGroup !== "all") {
        query = query.eq("blood_group", params.bloodGroup);
      }
      if (params.search && params.search.trim()) {
        const s = params.search.trim();
        query = query.or(
          `full_name.ilike.%${s}%,institution.ilike.%${s}%,profession.ilike.%${s}%,city.ilike.%${s}%,college_roll.ilike.%${s}%`
        );
      }
      query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      const { data, count, error } = await query;
      if (!error && data) {
        const total2 = count ?? data.length;
        const totalPages2 = Math.ceil(total2 / limit) || 1;
        const profiles = data.map((r) => ({
          id: Number(r.id),
          fullName: r.full_name || "SZMC Alumnus",
          avatarUrl: r.avatar_url || "/szmc-logo.png",
          batchYear: Number(r.batch_year) >= 1 && Number(r.batch_year) <= 35 ? Number(r.batch_year) : 1,
          session: r.session || null,
          collegeRoll: r.college_roll || null,
          academicStream: r.academic_stream || "Science",
          academicGroup: r.academic_group || null,
          section: r.section || null,
          verificationStatus: r.verification_status || "unverified",
          verificationMethod: r.verification_method || "two_vouches",
          vouchesCount: Number(r.vouches_count) || 0,
          vouchTargetCount: Number(r.vouch_target_count) || 2,
          verifiedByAdmin: r.verified_by_profile_id ? String(r.verified_by_profile_id) : null,
          profession: r.profession || "",
          position: r.position || "",
          institution: r.institution || "",
          city: r.city || "Dhaka",
          country: r.country || "Bangladesh",
          phone: params.includeSensitivePii ? r.phone : r.phone ? "Protected" : null,
          phoneOwnershipVerified: Boolean(r.phone_ownership_verified),
          phoneVerifiedAt: r.phone_verified_at || null,
          phoneVerifiedByAdmin: r.phone_verified_by_profile_id ? String(r.phone_verified_by_profile_id) : null,
          phoneVerificationNotes: params.includeSensitivePii ? r.phone_verification_notes || null : null,
          whatsapp: params.includeSensitivePii ? r.whatsapp : r.whatsapp ? "Protected" : null,
          email: params.includeSensitivePii ? r.email : r.email ? "Protected" : null,
          bloodGroup: r.blood_group || null,
          isRegisteredDonor: Boolean(r.is_registered_donor),
          role: r.role || "member",
          accountStatus: r.is_public ? "active" : "suspended",
          createdAt: r.created_at || (/* @__PURE__ */ new Date()).toISOString()
        }));
        return {
          profiles,
          pagination: { page, limit, total: total2, totalPages: totalPages2 }
        };
      }
    } catch (err) {
      console.warn("Supabase queryPaginatedAlumniProfiles error:", err);
    }
  }
  let filtered = [...inMemoryAlumniProfiles];
  if (params.batchYear && !Number.isNaN(Number(params.batchYear))) {
    filtered = filtered.filter((p) => p.batchYear === Number(params.batchYear));
  }
  if (params.academicStream && params.academicStream !== "all") {
    filtered = filtered.filter((p) => p.academicStream === params.academicStream);
  }
  if (params.verificationStatus && params.verificationStatus !== "all") {
    filtered = filtered.filter((p) => p.verificationStatus === params.verificationStatus);
  }
  if (params.role && params.role !== "all") {
    filtered = filtered.filter((p) => p.role === params.role);
  }
  if (params.bloodGroup && params.bloodGroup !== "all") {
    filtered = filtered.filter((p) => p.bloodGroup === params.bloodGroup);
  }
  if (params.search && params.search.trim()) {
    const s = params.search.trim().toLowerCase();
    filtered = filtered.filter(
      (p) => p.fullName && p.fullName.toLowerCase().includes(s) || p.institution && p.institution.toLowerCase().includes(s) || p.profession && p.profession.toLowerCase().includes(s) || p.city && p.city.toLowerCase().includes(s) || p.collegeRoll && p.collegeRoll.toLowerCase().includes(s)
    );
  }
  const total = filtered.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const pageProfiles = filtered.slice(offset, offset + limit).map((r) => ({
    ...r,
    phone: params.includeSensitivePii ? r.phone : r.phone ? "Protected" : null,
    whatsapp: params.includeSensitivePii ? r.whatsapp : r.whatsapp ? "Protected" : null,
    email: params.includeSensitivePii ? r.email : r.email ? "Protected" : null
  }));
  return {
    profiles: pageProfiles,
    pagination: { page, limit, total, totalPages }
  };
}
async function createOrRegisterAlumniProfile(input) {
  const cleanEmail = (input.email || "").trim().toLowerCase() || null;
  const cleanPhone = (input.phone || "").trim() || null;
  const batchNum = input.batchYear > 1900 ? Math.min(35, Math.max(1, input.batchYear - 1991)) : Math.min(35, Math.max(1, Number(input.batchYear) || 1));
  const session = input.session || `${1991 + batchNum}-${String(1992 + batchNum).slice(-2)}`;
  const streamVal = input.academicStream === "Humanities" || input.academicStream === "Business Studies" ? input.academicStream : "Science";
  const groupVal = streamVal === "Science" ? null : input.academicGroup ? input.academicGroup.trim().toUpperCase() : null;
  let effectiveAuthUid = null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (input.userUid && uuidRegex.test(input.userUid)) {
    effectiveAuthUid = input.userUid;
  }
  if (isSupabaseServerConfigured) {
    try {
      if (!effectiveAuthUid && cleanEmail) {
        const existingAuthUser = await findAuthUserByEmailOrPhone({ email: cleanEmail });
        if (existingAuthUser) {
          effectiveAuthUid = existingAuthUser.id;
        }
      }
      if (!effectiveAuthUid && cleanEmail && (input.rawPassword || input.passwordHash)) {
        const initialPass = input.rawPassword || "TempPass_" + Date.now();
        try {
          const { data: createdAuthUser, error: createAuthErr } = await supabaseServer.auth.admin.createUser({
            email: cleanEmail,
            password: initialPass,
            email_confirm: false,
            user_metadata: {
              full_name: input.fullName.trim(),
              batch_year: batchNum,
              phone: cleanPhone
            }
          });
          if (!createAuthErr && createdAuthUser?.user) {
            effectiveAuthUid = createdAuthUser.user.id;
          }
        } catch {
        }
        if (!effectiveAuthUid) {
          try {
            const { data: sData, error: sErr } = await supabaseServer.auth.signUp({
              email: cleanEmail,
              password: initialPass,
              options: {
                data: {
                  full_name: input.fullName.trim(),
                  batch_year: batchNum,
                  phone: cleanPhone
                }
              }
            });
            if (!sErr && sData?.user) {
              effectiveAuthUid = sData.user.id;
            }
          } catch {
          }
        }
      }
      if (effectiveAuthUid) {
        const { data, error } = await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).upsert(
          {
            auth_user_id: effectiveAuthUid,
            full_name: input.fullName.trim(),
            avatar_url: input.avatarUrl || "/assets/aistudio/images__1__2778177d.png",
            batch_year: batchNum,
            session,
            college_roll: input.collegeRoll?.trim() || null,
            academic_stream: streamVal,
            academic_group: groupVal,
            section: input.section || "SZMC",
            profession: input.profession || "",
            position: input.position || "",
            institution: input.institution || "",
            specialty: Array.isArray(input.specialty) ? input.specialty : [],
            degree: Array.isArray(input.degree) ? input.degree : ["MBBS"],
            city: input.city || "Bogura",
            country: input.country || "Bangladesh",
            phone: cleanPhone,
            whatsapp: input.whatsapp?.trim() || null,
            email: cleanEmail,
            blood_group: input.bloodGroup || null,
            role: "member",
            verification_status: isServerAutoVerifyActive() ? "verified" : "unverified",
            verification_method: isServerAutoVerifyActive() ? "admin_instant" : null,
            vouches_count: isServerAutoVerifyActive() ? 2 : 0,
            vouch_target_count: 2,
            verified_at: isServerAutoVerifyActive() ? (/* @__PURE__ */ new Date()).toISOString() : null,
            is_public: true
          },
          { onConflict: "auth_user_id" }
        ).select().single();
        if (!error && data) {
          const profileResult = {
            id: Number(data.id),
            fullName: data.full_name,
            avatarUrl: data.avatar_url,
            batchYear: data.batch_year,
            session: data.session,
            collegeRoll: data.college_roll,
            academicStream: data.academic_stream,
            academicGroup: data.academic_group,
            section: data.section,
            profession: data.profession,
            position: data.position,
            institution: data.institution,
            city: data.city,
            country: data.country,
            phone: data.phone,
            email: data.email,
            bloodGroup: data.blood_group,
            role: data.role,
            verificationStatus: data.verification_status,
            isPublic: data.is_public,
            createdAt: data.created_at
          };
          const existingIdx2 = inMemoryAlumniProfiles.findIndex(
            (p) => p.id === profileResult.id || cleanEmail && p.email?.toLowerCase() === cleanEmail
          );
          if (existingIdx2 >= 0) {
            inMemoryAlumniProfiles[existingIdx2] = profileResult;
          } else {
            inMemoryAlumniProfiles.unshift(profileResult);
          }
          return profileResult;
        } else if (error) {
          console.warn("Supabase alumni_profiles upsert notice:", error.message);
        }
      }
    } catch (err) {
      console.warn("Supabase createOrRegisterAlumniProfile notice:", err);
    }
  }
  const fallbackId = Date.now();
  const fallbackProfile = {
    id: fallbackId,
    fullName: input.fullName.trim(),
    avatarUrl: input.avatarUrl || "/assets/aistudio/images__1__2778177d.png",
    batchYear: batchNum,
    session,
    collegeRoll: input.collegeRoll?.trim() || null,
    academicStream: streamVal,
    academicGroup: groupVal,
    section: input.section || "SZMC",
    profession: input.profession || "Medical Doctor",
    position: input.position || "",
    institution: input.institution || "Shaheed Ziaur Rahman Medical College Hospital",
    city: input.city || "Bogura",
    country: input.country || "Bangladesh",
    phone: cleanPhone,
    phoneOwnershipVerified: false,
    phoneVerifiedAt: null,
    phoneVerifiedByProfileId: null,
    phoneVerificationNotes: null,
    email: cleanEmail,
    passwordHash: input.passwordHash || null,
    bloodGroup: input.bloodGroup || null,
    role: "member",
    verificationStatus: isServerAutoVerifyActive() ? "verified" : "unverified",
    verificationMethod: isServerAutoVerifyActive() ? "admin_instant" : null,
    vouchesCount: isServerAutoVerifyActive() ? 2 : 0,
    vouchTargetCount: 2,
    verifiedAt: isServerAutoVerifyActive() ? (/* @__PURE__ */ new Date()).toISOString() : null,
    accountStatus: "active",
    isPublic: true,
    authUserId: effectiveAuthUid || `local-${fallbackId}`,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const existingIdx = inMemoryAlumniProfiles.findIndex(
    (p) => cleanEmail && p.email?.toLowerCase() === cleanEmail
  );
  if (existingIdx >= 0) {
    inMemoryAlumniProfiles[existingIdx] = fallbackProfile;
  } else {
    inMemoryAlumniProfiles.unshift(fallbackProfile);
  }
  return fallbackProfile;
}
async function findAlumniByCredential(credential) {
  const clean = credential.trim().toLowerCase();
  if (isSupabaseServerConfigured && clean) {
    try {
      let query = supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("id, full_name, avatar_url, batch_year, session, college_roll, academic_stream, academic_group, section, profession, position, institution, city, country, phone, phone_ownership_verified, phone_verified_at, phone_verified_by_profile_id, phone_verification_notes, email, blood_group, role, verification_status, is_public, auth_user_id, created_at");
      if (clean.includes("@")) {
        query = query.eq("email", clean);
      } else {
        const cleanDigits2 = clean.replace(/[^0-9]/g, "");
        query = query.or(`phone.eq.${clean},phone.eq.+88${clean},phone.eq.+880${cleanDigits2}`);
      }
      const { data, error } = await query.maybeSingle();
      if (!error && data) {
        return {
          id: Number(data.id),
          fullName: data.full_name,
          avatarUrl: data.avatar_url,
          batchYear: Number(data.batch_year),
          session: data.session,
          collegeRoll: data.college_roll,
          academicStream: data.academic_stream,
          academicGroup: data.academic_group,
          section: data.section,
          profession: data.profession,
          position: data.position,
          institution: data.institution,
          city: data.city,
          country: data.country,
          phone: data.phone,
          phoneOwnershipVerified: Boolean(data.phone_ownership_verified),
          phoneVerifiedAt: data.phone_verified_at || null,
          phoneVerifiedByProfileId: data.phone_verified_by_profile_id || null,
          phoneVerificationNotes: data.phone_verification_notes || null,
          email: data.email,
          bloodGroup: data.blood_group,
          role: data.role,
          verificationStatus: data.verification_status,
          accountStatus: data.is_public ? "active" : "suspended",
          passwordHash: null,
          authUserId: data.auth_user_id || void 0,
          createdAt: data.created_at
        };
      }
      if (clean.includes("@")) {
        const matched = await findAuthUserByEmailOrPhone({ email: clean });
        if (matched && matched.email_confirmed_at) {
          const restored = await createOrRegisterAlumniProfile({
            userUid: matched.id,
            fullName: matched.user_metadata?.full_name || matched.user_metadata?.name || clean.split("@")[0],
            batchYear: Number(matched.user_metadata?.batch_year) || 25,
            email: clean,
            phone: matched.user_metadata?.phone || null
          });
          return restored;
        }
      }
    } catch (err) {
      console.warn("Supabase findAlumniByCredential error:", err);
    }
  }
  const cleanDigits = clean.replace(/[^0-9]/g, "");
  const found = inMemoryAlumniProfiles.find(
    (p) => p.email && p.email.toLowerCase() === clean || cleanDigits && p.phone && p.phone.replace(/[^0-9]/g, "").endsWith(cleanDigits)
  );
  return found || null;
}
async function updateAlumniPassword(profileId, passwordHash) {
  if (isSupabaseServerConfigured && profileId) {
    try {
      await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).update({ updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", profileId);
      return true;
    } catch (err) {
      console.warn("Supabase updateAlumniPassword error:", err);
    }
  }
  const found = inMemoryAlumniProfiles.find((p) => p.id === profileId);
  if (found) {
    found.passwordHash = passwordHash;
  }
  return true;
}
async function deleteAlumniProfile(profileId) {
  if (isSupabaseServerConfigured && profileId) {
    try {
      const { error } = await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).delete().eq("id", profileId);
      return !error;
    } catch (err) {
      console.warn("Supabase deleteAlumniProfile error:", err);
    }
  }
  const idx = inMemoryAlumniProfiles.findIndex((p) => p.id === profileId);
  if (idx !== -1) {
    inMemoryAlumniProfiles.splice(idx, 1);
  }
  return true;
}
async function updateAlumniProfileRecord(profileId, updates) {
  const dbUpdates = {
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (updates.fullName !== void 0) dbUpdates.full_name = updates.fullName;
  if (updates.avatarUrl !== void 0) dbUpdates.avatar_url = updates.avatarUrl;
  if (updates.coverUrl !== void 0) dbUpdates.cover_url = updates.coverUrl;
  if (updates.batchYear !== void 0) dbUpdates.batch_year = Number(updates.batchYear);
  if (updates.collegeRoll !== void 0) dbUpdates.college_roll = updates.collegeRoll;
  if (updates.profession !== void 0) dbUpdates.profession = updates.profession;
  if (updates.position !== void 0) dbUpdates.position = updates.position;
  if (updates.institution !== void 0) dbUpdates.institution = updates.institution;
  if (updates.cadre !== void 0) dbUpdates.cadre = updates.cadre;
  if (updates.city !== void 0) dbUpdates.city = updates.city;
  if (updates.country !== void 0) dbUpdates.country = updates.country;
  if (updates.bio !== void 0) dbUpdates.bio = updates.bio;
  if (updates.whatsapp !== void 0) dbUpdates.whatsapp = updates.whatsapp;
  if (updates.fbLink !== void 0) dbUpdates.fb_link = updates.fbLink;
  if (updates.phone !== void 0) dbUpdates.phone = updates.phone;
  if (updates.email !== void 0) dbUpdates.email = updates.email;
  if (updates.careerHistory !== void 0) dbUpdates.career_history = updates.careerHistory;
  if (updates.degree !== void 0) dbUpdates.degree = updates.degree;
  if (updates.specialty !== void 0) dbUpdates.specialty = updates.specialty;
  if (updates.specialtyOther !== void 0) dbUpdates.specialty_other = updates.specialtyOther;
  if (updates.bloodGroup !== void 0) dbUpdates.blood_group = updates.bloodGroup;
  if (updates.isPublic !== void 0) dbUpdates.is_public = updates.isPublic;
  if (updates.showContactToVerified !== void 0) {
    dbUpdates.show_contact_to_verified = Boolean(updates.showContactToVerified);
  }
  if (updates.userPreferences !== void 0 && typeof updates.userPreferences === "object") {
    dbUpdates.user_preferences = updates.userPreferences;
  }
  if (isSupabaseServerConfigured && profileId) {
    try {
      const { error } = await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).update(dbUpdates).eq("id", profileId);
      if (error && dbUpdates.user_preferences !== void 0) {
        const { user_preferences: _ignored, ...compatUpdates } = dbUpdates;
        await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).update(compatUpdates).eq("id", profileId);
      }
    } catch (err) {
      console.warn("Supabase updateAlumniProfileRecord error:", err);
    }
  }
  const idx = inMemoryAlumniProfiles.findIndex((p) => p.id === profileId);
  if (idx !== -1) {
    inMemoryAlumniProfiles[idx] = {
      ...inMemoryAlumniProfiles[idx],
      ...updates
    };
    return inMemoryAlumniProfiles[idx];
  }
  return { id: profileId, ...updates };
}
async function adminUpdateAlumniGovernance(params) {
  if (params.role !== void 0) {
    const supportedRoles = ["member", "moderator", "admin"];
    if (params.actorRole !== "admin" || !supportedRoles.includes(params.role)) {
      throw new Error("Only administrators may assign supported database roles.");
    }
  }
  if (params.verificationStatus !== void 0 && isSupabaseServerConfigured) {
    const { data: target, error: targetError } = await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("auth_user_id, role").eq("id", params.profileId).maybeSingle();
    if (targetError || !target) throw new Error("Alumni profile not found.");
    if (target.auth_user_id === params.actorUid) {
      throw new Error("Administrators cannot change their own verification status.");
    }
    if (target.role === "admin" && params.actorRole !== "admin") {
      throw new Error("Only administrators may change an administrator profile.");
    }
  }
  if (isSupabaseServerConfigured && params.profileId) {
    try {
      const updates = {
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (params.verificationStatus) updates.verification_status = params.verificationStatus;
      if (params.role) updates.role = params.role;
      if (params.academicStream) updates.academic_stream = params.academicStream;
      if (params.academicGroup !== void 0) updates.academic_group = params.academicGroup;
      if (params.accountStatus !== void 0) updates.is_public = params.accountStatus !== "suspended";
      const { data, error } = await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).update(updates).eq("id", params.profileId).select().single();
      if (!error && data) {
        await recordSecurityAuditLog({
          actorUid: params.actorUid,
          actorEmail: params.actorEmail,
          actorRole: params.actorRole,
          action: "UPDATE_PROFILE_GOVERNANCE",
          targetType: "alumni_profile",
          targetId: String(params.profileId),
          severity: "info",
          summary: `Updated profile governance for ${data.full_name} (ID ${data.id}).`
        });
        return {
          id: Number(data.id),
          fullName: data.full_name,
          verificationStatus: data.verification_status,
          role: data.role,
          accountStatus: data.is_public ? "active" : "suspended",
          academicStream: data.academic_stream,
          academicGroup: data.academic_group,
          updatedAt: data.updated_at
        };
      }
    } catch (err) {
      console.warn("Supabase adminUpdateAlumniGovernance error:", err);
      throw err;
    }
  }
  throw new Error("Supabase is required to update profile governance.");
}
async function adminVerifyAlumniPhoneOwnership(params) {
  const profileId = Number(params.profileId);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (isSupabaseServerConfigured && profileId) {
    try {
      const { data: profile, error: fetchErr } = await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("id, auth_user_id, phone, full_name, email").eq("id", profileId).single();
      if (fetchErr || !profile) {
        throw new Error("Alumni profile not found.");
      }
      if (profile.auth_user_id === params.actorUid) {
        throw new Error("Administrators cannot verify their own phone ownership.");
      }
      const rawPhone = (profile.phone || "").trim();
      if (!rawPhone) {
        throw new Error("Alumnus does not have a registered mobile number to verify.");
      }
      const normalizedPhone = rawPhone.startsWith("+") ? rawPhone.replace(/[^\d+]/g, "") : rawPhone.replace(/\D/g, "").startsWith("880") ? `+${rawPhone.replace(/\D/g, "")}` : `+880${rawPhone.replace(/\D/g, "").replace(/^0+/, "")}`;
      const { data: duplicate } = await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("id, full_name").eq("phone", normalizedPhone).eq("phone_ownership_verified", true).neq("id", profileId).maybeSingle();
      if (duplicate) {
        throw new Error(
          `This phone number (${normalizedPhone}) is already verified for another alumnus (${duplicate.full_name}, ID: ${duplicate.id}). Dual-account phone reuse is prohibited.`
        );
      }
      const { data: updated, error: updateErr } = await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).update({
        phone: normalizedPhone,
        phone_ownership_verified: true,
        phone_verified_at: now,
        phone_verification_notes: params.notes || "Verified by portal administrator",
        updated_at: now
      }).eq("id", profileId).select().single();
      if (updateErr || !updated) {
        throw new Error("Phone verification could not be saved.");
      }
      if (profile.auth_user_id) {
        try {
          await supabaseServer.auth.admin.updateUserById(profile.auth_user_id, {
            phone: normalizedPhone,
            phone_confirm: true
          });
        } catch (authErr) {
          console.warn("Note: GoTrue phone provider update notice:", authErr?.message || authErr);
        }
      }
      await recordSecurityAuditLog({
        actorUid: params.actorUid,
        actorEmail: params.actorEmail,
        actorRole: params.actorRole,
        action: "VERIFY_PHONE_OWNERSHIP",
        targetType: "alumni_profile",
        targetId: String(profileId),
        severity: "info",
        summary: `Admin verified phone ownership for ${profile.full_name} (${normalizedPhone}). Phone login enabled.`
      });
      return {
        id: profileId,
        fullName: profile.full_name,
        phone: normalizedPhone,
        phoneOwnershipVerified: true,
        phoneVerifiedAt: now,
        phoneVerificationNotes: params.notes || "Verified by portal administrator"
      };
    } catch (err) {
      console.error("adminVerifyAlumniPhoneOwnership error:", err);
      throw err;
    }
  }
  throw new Error("Supabase is required to verify phone ownership.");
}
async function adminRevokeAlumniPhoneOwnership(params) {
  const profileId = Number(params.profileId);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (isSupabaseServerConfigured && profileId) {
    try {
      const { data: profile } = await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("*").eq("id", profileId).single();
      if (profile) {
        await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).update({
          phone_ownership_verified: false,
          phone_verified_at: null,
          phone_verification_notes: params.notes || "Phone verification revoked by administrator",
          updated_at: now
        }).eq("id", profileId);
        await recordSecurityAuditLog({
          actorUid: params.actorUid,
          actorEmail: params.actorEmail,
          actorRole: params.actorRole,
          action: "REVOKE_PHONE_OWNERSHIP",
          targetType: "alumni_profile",
          targetId: String(profileId),
          severity: "warning",
          summary: `Admin revoked phone ownership verification for ${profile.full_name} (${profile.phone}). Phone login disabled.`
        });
      }
      return { id: profileId, phoneOwnershipVerified: false };
    } catch (err) {
      console.error("adminRevokeAlumniPhoneOwnership error:", err);
      throw err;
    }
  }
  const found = inMemoryAlumniProfiles.find((p) => p.id === profileId);
  if (found) {
    found.phoneOwnershipVerified = false;
    found.phoneVerifiedAt = null;
  }
  return { id: profileId, phoneOwnershipVerified: false };
}
async function getVerificationQueue(statusFilter) {
  if (isSupabaseServerConfigured) {
    try {
      let query = supabaseServer.from(SUPABASE_TABLES.ADMIN_DOC_SUBMISSIONS).select("*").order("submitted_at", { ascending: false });
      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      const { data, error } = await query;
      if (!error && data) {
        return data.map((r) => ({
          id: r.id,
          submissionCode: `DOC-${String(r.id).slice(0, 8)}`,
          profileId: r.user_id,
          fullName: "SZMC Alumnus",
          avatarUrl: "/assets/aistudio/images__1__2778177d.png",
          batchYear: r.batch_year,
          collegeRoll: r.college_roll,
          academicStream: r.academic_stream,
          academicGroup: r.academic_group,
          docType: r.doc_type,
          docTypeLabel: r.doc_type_label,
          documentUrl: r.storage_object_path,
          status: r.status,
          submittedAt: r.submitted_at,
          reviewedBy: r.reviewed_by ? String(r.reviewed_by) : null,
          reviewedAt: r.reviewed_at,
          adminNote: r.admin_note
        }));
      }
    } catch (err) {
      console.warn("Supabase getVerificationQueue error:", err);
    }
  }
  return [];
}
async function reviewVerificationSubmission(params) {
  if (isSupabaseServerConfigured && params.submissionId) {
    try {
      const { data: submission, error: submissionError } = await supabaseServer.from(SUPABASE_TABLES.ADMIN_DOC_SUBMISSIONS).select("id, user_id").eq("id", params.submissionId).maybeSingle();
      if (submissionError || !submission) throw new Error("Verification submission not found.");
      if (submission.user_id) {
        const { data: applicant, error: applicantError } = await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("auth_user_id").eq("id", submission.user_id).maybeSingle();
        if (applicantError) throw applicantError;
        if (applicant?.auth_user_id === params.actorUid) {
          throw new Error("Administrators cannot review their own verification submission.");
        }
      }
      const { data, error } = await supabaseServer.from(SUPABASE_TABLES.ADMIN_DOC_SUBMISSIONS).update({
        status: params.decision,
        admin_note: params.adminNote || "Reviewed by central admin",
        reviewed_at: (/* @__PURE__ */ new Date()).toISOString()
      }).eq("id", params.submissionId).select().single();
      if (!error && data) {
        if (params.decision === "approved" && data.user_id) {
          await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).update({
            verification_status: "verified",
            verification_method: "id_card_upload",
            verified_at: (/* @__PURE__ */ new Date()).toISOString()
          }).eq("id", data.user_id);
        }
        await recordSecurityAuditLog({
          actorUid: params.actorUid,
          actorEmail: params.actorEmail,
          actorRole: params.actorRole,
          action: params.decision === "approved" ? "APPROVE_VERIFICATION_DOC" : "REJECT_VERIFICATION_DOC",
          targetType: "verification_submission",
          targetId: String(params.submissionId),
          severity: params.decision === "approved" ? "info" : "warning",
          summary: `${params.decision.toUpperCase()} document verification for submission ID ${params.submissionId}.`
        });
        return data;
      }
    } catch (err) {
      console.warn("Supabase reviewVerificationSubmission error:", err);
      throw err;
    }
  }
  throw new Error("Supabase is required to review verification submissions.");
}
async function getBloodEmergencyList() {
  if (isSupabaseServerConfigured) {
    try {
      const { data, error } = await supabaseServer.from(SUPABASE_TABLES.BLOOD_REQUESTS).select("*").order("created_at", { ascending: false });
      if (!error && data) {
        return data.map((r) => ({
          id: r.id,
          requestCode: `BLD-${String(r.id).slice(0, 8)}`,
          patientName: r.patient_relation || "SZMC Patient",
          bloodGroup: r.blood_group,
          unitsNeeded: r.units_required,
          unitsFulfilled: r.units_fulfilled || 0,
          hospitalName: r.hospital_name,
          hospitalArea: r.hospital_area,
          contactNumber: r.coordination_ref || "Through Portal",
          urgencyLevel: r.emergency_level,
          status: r.status,
          verifiedByAdmin: r.verified_by_admin_id ? String(r.verified_by_admin_id) : null,
          moderationNote: r.moderation_note,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }));
      }
    } catch (err) {
      console.warn("Supabase getBloodEmergencyList error:", err);
    }
  }
  return [];
}
async function moderateBloodEmergency(params) {
  if (isSupabaseServerConfigured && params.id) {
    try {
      const updates = {
        status: params.status,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (params.unitsFulfilled !== void 0) updates.units_fulfilled = params.unitsFulfilled;
      if (params.moderationNote !== void 0) updates.moderation_note = params.moderationNote;
      const { data, error } = await supabaseServer.from(SUPABASE_TABLES.BLOOD_REQUESTS).update(updates).eq("id", params.id).select().single();
      if (!error && data) {
        await recordSecurityAuditLog({
          actorUid: params.actorUid,
          actorEmail: params.actorEmail,
          actorRole: params.actorRole,
          action: "MODERATE_BLOOD_REQUEST",
          targetType: "blood_request",
          targetId: String(params.id),
          severity: "info",
          summary: `Moderated blood request ${params.id} to "${params.status}".`
        });
        return data;
      }
    } catch (err) {
      console.warn("Supabase moderateBloodEmergency error:", err);
    }
  }
  return {
    id: params.id,
    status: params.status,
    unitsFulfilled: params.unitsFulfilled,
    moderationNote: params.moderationNote
  };
}
async function getOfficialNoticesList() {
  if (isSupabaseServerConfigured) {
    try {
      const { data, error } = await supabaseServer.from(SUPABASE_TABLES.OFFICIAL_NOTICES).select("*").order("is_urgent", { ascending: false }).order("created_at", { ascending: false });
      if (!error && data) {
        return data.map((r) => ({
          id: r.id,
          refNo: r.ref_no || `SZMC/NOT-${String(r.id).slice(0, 6)}`,
          title: r.title,
          category: r.category,
          content: r.full_content || r.summary,
          targetBatch: null,
          isPinned: r.is_urgent,
          isPublished: r.is_published,
          authorName: r.signatory_name || "Alumni Secretariat",
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }));
      }
    } catch (err) {
      console.warn("Supabase getOfficialNoticesList error:", err);
    }
  }
  return [];
}
async function createOrUpdateOfficialNotice(params) {
  if (isSupabaseServerConfigured) {
    try {
      if (params.id) {
        const { data, error } = await supabaseServer.from(SUPABASE_TABLES.OFFICIAL_NOTICES).update({
          title: params.title.trim(),
          category: params.category,
          full_content: params.content.trim(),
          summary: params.content.trim().slice(0, 200),
          is_urgent: Boolean(params.isPinned),
          is_published: Boolean(params.isPublished ?? true),
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }).eq("id", params.id).select().single();
        if (!error && data) return data;
      } else {
        const { data, error } = await supabaseServer.from(SUPABASE_TABLES.OFFICIAL_NOTICES).insert({
          ref_no: `SZMC/NOT-2026/${Math.floor(Math.random() * 900) + 100}`,
          title: params.title.trim(),
          category: params.category,
          published_date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
          summary: params.content.trim().slice(0, 200),
          full_content: params.content.trim(),
          is_urgent: Boolean(params.isPinned),
          is_published: Boolean(params.isPublished ?? true),
          signatory_name: params.actorEmail,
          signatory_designation: "Portal Administrator",
          signatory_organization: "Shaheed Ziaur Rahman Medical College Alumni Association"
        }).select().single();
        if (!error && data) return data;
      }
    } catch (err) {
      console.warn("Supabase createOrUpdateOfficialNotice error:", err);
    }
  }
  return {
    id: params.id || Date.now(),
    refNo: `SZMC/NOT-2026/099`,
    title: params.title.trim(),
    category: params.category,
    content: params.content.trim(),
    isPinned: Boolean(params.isPinned),
    isPublished: Boolean(params.isPublished ?? true),
    authorName: params.actorEmail,
    createdAt: /* @__PURE__ */ new Date(),
    updatedAt: /* @__PURE__ */ new Date()
  };
}
async function generateBulkBatchCohortSample(params) {
  await recordSecurityAuditLog({
    actorUid: params.actorUid,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    action: "BULK_COHORT_ATTEMPT",
    targetType: "alumni_profile",
    targetId: "PRODUCTION_NOOP",
    severity: "info",
    summary: "Bulk sample generation skipped in production mode (Supabase is single source of truth)."
  });
  return { insertedCount: 0 };
}

// server.ts
if (typeof globalThis.__dirname !== "undefined") {
  delete globalThis.__dirname;
}
if (typeof globalThis.__filename !== "undefined") {
  delete globalThis.__filename;
}
process.on("uncaughtException", (err) => {
  console.error("[Server] Uncaught Exception (kept alive):", err?.message || err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[Server] Unhandled Rejection (kept alive):", reason?.message || reason);
});
dotenv2.config({ quiet: true });
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = path3.dirname(__filename2);
var app = express();
app.set("trust proxy", 1);
var args = process.argv.slice(2);
var portFlagIdx = args.indexOf("--port");
var cliPort = portFlagIdx !== -1 && args[portFlagIdx + 1] ? Number(args[portFlagIdx + 1]) : void 0;
var PORT = cliPort || (process.env.APP_PORT ? Number(process.env.APP_PORT) : 3e3);
var EXTRA_ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || "").split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean)
);
function isAllowedCorsOrigin(origin) {
  const normalized = origin.trim().replace(/\/+$/, "");
  if (normalized === "https://szmcalumni.net" || normalized === "https://www.szmcalumni.net" || normalized === "https://ndcbogura.alumniworld.xyz" || normalized === "https://alumniworld.xyz" || normalized === "https://www.alumniworld.xyz" || EXTRA_ALLOWED_ORIGINS.has(normalized)) {
    return true;
  }
  return /^https:\/\/([a-zA-Z0-9-]+\.)*szmcalumni\.net$/.test(normalized) || /^https:\/\/([a-zA-Z0-9-]+\.)*alumniworld\.xyz$/.test(normalized) || /^https:\/\/([a-zA-Z0-9-]+\.)*run\.app$/.test(normalized) || /^https:\/\/([a-zA-Z0-9-]+\.)*googleusercontent\.com$/.test(normalized) || /^https?:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?$/.test(normalized);
}
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isAllowedCorsOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, x-file-ext, x-user-id");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers["x-no-compression"]) return false;
    return compression.filter(req, res);
  }
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
function resolveActor(req) {
  if (req.dbUser) {
    return {
      uid: req.dbUser.uid,
      email: req.dbUser.email,
      role: req.dbUser.role || "member"
    };
  }
  throw new Error("Unauthorized: Valid verified session required on backend");
}
app.get("/api/auth/verify-session", requireAuth, (req, res) => {
  const actor = req.dbUser;
  if (!actor) {
    return res.status(401).json({ authenticated: false, error: "Unauthorized" });
  }
  return res.json({
    authenticated: true,
    user: actor,
    permissions: getRolePermissions(actor.role),
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.post("/api/auth/sync", requireAuth, async (req, res) => {
  try {
    res.json({
      authenticated: true,
      user: req.dbUser
    });
  } catch (error) {
    console.error("Failed to sync authenticated user:", error);
    res.status(500).json({ error: error.message || "Failed to synchronize user" });
  }
});
function formatAlumniRowToProfile(row) {
  return {
    id: row.id,
    userId: row.id,
    fullName: row.fullName || "SZMC Alumnus",
    avatarUrl: row.avatarUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80",
    coverUrl: row.coverUrl || void 0,
    batchYear: row.batchYear || 25,
    session: row.session || void 0,
    collegeRoll: row.collegeRoll || "",
    academicStream: row.academicStream || "MBBS",
    academicGroup: row.academicGroup,
    group: row.academicStream || "MBBS",
    section: row.section || "MBBS",
    verificationStatus: row.verificationStatus || "pending_vouch",
    verificationMethod: row.verificationMethod || "two_vouches",
    verifiedBy: row.verifiedByAdmin ? [row.verifiedByAdmin] : [],
    vouchesCount: row.vouchesCount || 0,
    vouchTargetCount: row.vouchTargetCount || 2,
    profession: row.profession || "",
    position: row.position || "",
    institution: row.institution || "",
    cadre: row.cadre || "",
    specialty: Array.isArray(row.specialty) ? row.specialty : [],
    degree: Array.isArray(row.degree) ? row.degree : ["MBBS"],
    city: row.city || "Bogura",
    country: row.country || "Bangladesh",
    phone: row.phone || "",
    phoneOwnershipVerified: Boolean(row.phoneOwnershipVerified ?? row.phone_ownership_verified),
    phoneVerifiedAt: row.phoneVerifiedAt || row.phone_verified_at || void 0,
    phoneVerifiedByProfileId: row.phoneVerifiedByProfileId || row.phone_verified_by_profile_id || void 0,
    phoneVerificationNotes: row.phoneVerificationNotes || row.phone_verification_notes || void 0,
    authUserId: row.authUserId || row.auth_user_id || void 0,
    whatsapp: row.whatsapp || "",
    email: row.email || "",
    fbLink: row.fbLink || "",
    bio: row.bio || "",
    bloodGroup: row.bloodGroup || void 0,
    isRegisteredDonor: Boolean(row.isRegisteredDonor),
    donorAvailability: row.donorAvailability || "available",
    role: row.role || "member",
    accountStatus: row.accountStatus || "active",
    isPublic: Boolean(row.isPublic),
    postsCount: row.postsCount || 0,
    badges: Array.isArray(row.badges) ? row.badges : []
  };
}
app.post("/api/auth/register", rateLimitGuard(25, 6e4), async (req, res) => {
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
      isRegisteredDonor
    } = req.body;
    if (!fullName?.trim()) {
      return res.status(400).json({ error: "Please provide your Full Name." });
    }
    if (!phone?.trim() && !email?.trim()) {
      return res.status(400).json({ error: "Please provide your Mobile Number or Email." });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }
    const hashedPassword = hashPasswordServer(password);
    const created = await createOrRegisterAlumniProfile({
      userUid: void 0,
      rawPassword: password,
      fullName: fullName.trim(),
      avatarUrl,
      batchYear: Number(batchYear) || 25,
      session,
      collegeRoll: collegeRoll?.trim(),
      academicStream: academicStream === "Humanities" || academicStream === "Business Studies" ? academicStream : "Science",
      academicGroup: academicGroup || null,
      section: section || "MBBS",
      profession: profession || "",
      position: position || "",
      institution: institution || "",
      specialty: Array.isArray(specialty) ? specialty : [],
      degree: Array.isArray(degree) ? degree : ["MBBS"],
      city: city || "Bogura",
      country: country || "Bangladesh",
      phone: phone?.trim() || null,
      whatsapp: whatsapp?.trim() || null,
      email: email?.trim() || null,
      passwordHash: hashedPassword,
      bloodGroup: bloodGroup || null,
      isRegisteredDonor: Boolean(isRegisteredDonor)
    });
    const formattedProfile = formatAlumniRowToProfile(created);
    const memberToken = signMemberSessionToken({
      email: formattedProfile.email || `member-${formattedProfile.id}@szmcalumni.net`,
      userId: formattedProfile.id,
      uid: formattedProfile.authUserId || `member:${formattedProfile.id}`,
      fullName: formattedProfile.fullName
    });
    broadcastFeedEvent({
      type: "ALUMNI_REGISTERED",
      profile: formattedProfile,
      timestamp: Date.now()
    });
    res.status(201).json({
      success: true,
      token: memberToken,
      profile: formattedProfile
    });
  } catch (error) {
    console.error("Registration failed:", error);
    res.status(400).json({ error: error.message || "Registration failed." });
  }
});
function formatToE164PhoneServer(raw) {
  const cleaned = raw.trim();
  if (cleaned.startsWith("+")) {
    return cleaned.replace(/[^\d+]/g, "");
  }
  const digits = cleaned.replace(/\D/g, "");
  if (digits.startsWith("880")) {
    return `+${digits}`;
  }
  return `+880${digits.replace(/^0+/, "")}`;
}
async function handleUnifiedLoginCore(req, res) {
  try {
    const { identifier, password } = req.body;
    if (!identifier?.trim() || !password) {
      return res.status(400).json({ error: "Please enter your mobile number or email and password." });
    }
    const cleanId = identifier.trim();
    const isEmail = cleanId.includes("@");
    const safeCompareSecret = (provided, expected) => {
      const a = crypto5.createHash("sha256").update(provided).digest();
      const b = crypto5.createHash("sha256").update(expected).digest();
      return crypto5.timingSafeEqual(a, b);
    };
    const isDedicatedSuperAdmin = isEmail && isSuperAdminEmail(cleanId);
    if (isDedicatedSuperAdmin) {
      let authSession = null;
      let authenticated = false;
      const targetEmail = cleanId.toLowerCase().trim();
      let dbProfile = null;
      if (isSupabaseServerConfigured) {
        try {
          const { data: sData, error: sErr } = await supabaseServer.auth.signInWithPassword({
            email: targetEmail,
            password
          });
          if (!sErr && sData?.session) {
            authSession = sData.session;
            authenticated = true;
          }
        } catch {
        }
      }
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
        return res.status(401).json({ error: "Invalid credentials. Access denied." });
      }
      const resolvedId = Number(dbProfile?.id || 1);
      const resolvedUid = authSession?.user?.id || dbProfile?.authUserId || `super-admin:${targetEmail}`;
      const resolvedName = dbProfile?.fullName || "Dr. Nurul Anam Bashir";
      const superAdminToken = signAdminToken(targetEmail, "super_admin", {
        userId: resolvedId,
        uid: resolvedUid,
        fullName: resolvedName
      });
      const superAdminProfile = dbProfile ? { ...formatAlumniRowToProfile(dbProfile), role: "super_admin" } : {
        id: resolvedId,
        userId: resolvedId,
        authUserId: resolvedUid,
        fullName: resolvedName,
        avatarUrl: "/assets/aistudio/images__1__2778177d.png",
        batchYear: 25,
        academicStream: "MBBS",
        academicGroup: null,
        section: "MBBS",
        verificationStatus: "verified",
        verificationMethod: "admin_verified",
        vouchesCount: 10,
        profession: "Medical Doctor / Physician",
        position: "Super Admin / Lead Physician",
        institution: "Shaheed Ziaur Rahman Medical College Hospital",
        specialty: ["Internal Medicine", "Surgery"],
        degree: ["MBBS", "FCPS"],
        city: "Bogura",
        country: "Bangladesh",
        email: targetEmail,
        phone: "",
        role: "super_admin",
        isPublic: true,
        online: true,
        badges: ["SZMCian", "Super Admin", "Batch 25"]
      };
      return res.json({
        success: true,
        token: authSession?.access_token || superAdminToken,
        session: authSession || null,
        profile: superAdminProfile
      });
    }
    if (isEmail) {
      const cleanEmail = cleanId.toLowerCase();
      if (isSupabaseServerConfigured) {
        const { data: signInData, error: signInError } = await supabaseServer.auth.signInWithPassword({
          email: cleanEmail,
          password
        });
        if (!signInError && signInData?.user && signInData?.session) {
          let alumnus3 = await findAlumniByCredential(cleanEmail);
          if (!alumnus3) {
            alumnus3 = await createOrRegisterAlumniProfile({
              userUid: signInData.user.id,
              rawPassword: password,
              fullName: signInData.user.user_metadata?.full_name || signInData.user.user_metadata?.name || cleanEmail.split("@")[0],
              batchYear: Number(signInData.user.user_metadata?.batch_year) || 25,
              email: cleanEmail,
              passwordHash: hashPasswordServer(password)
            });
          }
          return res.json({
            success: true,
            session: signInData.session,
            token: signInData.session.access_token,
            profile: formatAlumniRowToProfile(alumnus3)
          });
        }
        if (signInError) {
          const msg = signInError.message.toLowerCase();
          if (msg.includes("email not confirmed") || msg.includes("not confirmed")) {
            return res.status(403).json({
              error: "Please confirm your email address using the verification link sent to your inbox before signing in."
            });
          }
          if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
            const existingU = await findAuthUserByEmailOrPhone({ email: cleanEmail });
            if (existingU && (existingU.app_metadata?.provider === "google" || !existingU.encrypted_password)) {
              return res.status(400).json({
                error: 'This account was created via Google Sign-In and does not have a password set yet. Please continue with "Sign in with Google" or use "Forgot Password" to set a password.'
              });
            }
            return res.status(401).json({ error: "Invalid email or password. Please verify your credentials." });
          }
        }
      }
      const alumnus2 = await findAlumniByCredential(cleanEmail);
      if (!alumnus2 || !verifyPasswordServer(alumnus2.passwordHash, password)) {
        return res.status(401).json({ error: "Invalid email or password. Please verify your credentials." });
      }
      const formatted2 = formatAlumniRowToProfile(alumnus2);
      const memberToken2 = signMemberSessionToken({
        email: cleanEmail,
        userId: formatted2.id,
        uid: formatted2.authUserId || `member:${formatted2.id}`,
        fullName: formatted2.fullName
      });
      return res.json({
        success: true,
        token: memberToken2,
        profile: formatted2
      });
    }
    const formattedPhone = formatToE164PhoneServer(cleanId);
    const alumnus = await findAlumniByCredential(cleanId);
    if (!alumnus) {
      return res.status(401).json({
        error: "Invalid mobile number or password. Please verify your credentials."
      });
    }
    if (alumnus.accountStatus === "suspended") {
      return res.status(403).json({ error: "Your account is currently suspended. Please contact SZMC Alumni support." });
    }
    if (isSupabaseServerConfigured) {
      let authSession = null;
      if (alumnus.email) {
        const { data: signInData, error: signInError } = await supabaseServer.auth.signInWithPassword({
          email: alumnus.email.toLowerCase().trim(),
          password
        });
        if (signInError && signInError.message.toLowerCase().includes("not confirmed")) {
          return res.status(403).json({
            error: "Please confirm your registered email address before signing in."
          });
        }
        if (!signInError && signInData?.session) {
          authSession = signInData.session;
        }
      }
      if (!authSession) {
        try {
          const { data: phoneSignInData, error: phoneSignInErr } = await supabaseServer.auth.signInWithPassword({
            phone: formattedPhone,
            password
          });
          if (!phoneSignInErr && phoneSignInData?.session) {
            authSession = phoneSignInData.session;
          }
        } catch {
        }
      }
      if (authSession) {
        if (alumnus.authUserId && alumnus.phoneOwnershipVerified) {
          try {
            await supabaseServer.auth.admin.updateUserById(alumnus.authUserId, {
              phone: formattedPhone,
              phone_confirm: true
            });
          } catch {
          }
        }
        return res.json({
          success: true,
          session: authSession,
          token: authSession.access_token,
          profile: formatAlumniRowToProfile(alumnus)
        });
      }
      const matchedUser = await findAuthUserByEmailOrPhone({
        authUserId: alumnus.authUserId,
        email: alumnus.email,
        phone: formattedPhone
      });
      if (matchedUser && (matchedUser.app_metadata?.provider === "google" || !matchedUser.encrypted_password)) {
        return res.status(400).json({
          error: 'This account was created via Google Sign-In and does not have a password set yet. Please sign in with Google, or use "Forgot Password" to set a password for phone login.'
        });
      }
      return res.status(401).json({ error: "Invalid mobile number or password. Please verify your credentials." });
    }
    const isValid = verifyPasswordServer(alumnus.passwordHash, password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid mobile number or password. Please verify your credentials." });
    }
    const formatted = formatAlumniRowToProfile(alumnus);
    const memberToken = signMemberSessionToken({
      email: formatted.email || `phone-${formatted.id}@szmcalumni.net`,
      userId: formatted.id,
      uid: formatted.authUserId || `member:${formatted.id}`,
      fullName: formatted.fullName
    });
    return res.json({
      success: true,
      token: memberToken,
      profile: formatted
    });
  } catch (error) {
    console.error("Unified login error:", error);
    res.status(500).json({ error: error.message || "Login failed. Please try again." });
  }
}
app.post("/api/auth/login", rateLimitGuard(40, 6e4), handleUnifiedLoginCore);
app.post("/api/auth/unified-login", rateLimitGuard(40, 6e4), handleUnifiedLoginCore);
app.post(
  "/api/admin/verify-phone",
  rateLimitGuard(40, 6e4),
  requireAdmin,
  async (req, res) => {
    try {
      const { profileId, notes } = req.body;
      if (!profileId) {
        return res.status(400).json({ error: "profileId is required." });
      }
      const actor = resolveActor(req);
      const verified = await adminVerifyAlumniPhoneOwnership({
        profileId: Number(profileId),
        notes: typeof notes === "string" ? notes.trim() : void 0,
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role
      });
      res.json({
        success: true,
        message: "Phone ownership verified successfully. Phone + Password login is now active.",
        profile: verified
      });
    } catch (error) {
      console.error("admin verify-phone error:", error);
      res.status(400).json({ error: error.message || "Failed to verify phone ownership." });
    }
  }
);
app.post(
  "/api/admin/revoke-phone-verification",
  rateLimitGuard(40, 6e4),
  requireAdmin,
  async (req, res) => {
    try {
      const { profileId, notes } = req.body;
      if (!profileId) {
        return res.status(400).json({ error: "profileId is required." });
      }
      const actor = resolveActor(req);
      const revoked = await adminRevokeAlumniPhoneOwnership({
        profileId: Number(profileId),
        notes: typeof notes === "string" ? notes.trim() : void 0,
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role
      });
      res.json({
        success: true,
        message: "Phone ownership verification revoked. Phone login disabled.",
        profile: revoked
      });
    } catch (error) {
      console.error("admin revoke-phone error:", error);
      res.status(400).json({ error: error.message || "Failed to revoke phone verification." });
    }
  }
);
app.get("/api/admin/verify-access", requireModerator, (req, res) => {
  const actor = req.dbUser;
  if (!actor) {
    return res.status(401).json({
      authorized: false,
      role: "member",
      error: "Unauthorized: Missing verified session."
    });
  }
  const permissions = getRolePermissions(actor.role);
  if (!permissions.canAccessAdminPortal) {
    return res.status(403).json({
      authorized: false,
      role: actor.role,
      error: "Forbidden: Portal access restricted to verified moderators and administrators."
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
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.get("/api/admin/auto-verify-status", requireAdmin, (_req, res) => {
  const active = isServerAutoVerifyActive();
  const expiry = new Date(serverAutoVerifyConfig.expiresAt).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, expiry - now);
  const remainingHours = Math.floor(diffMs / (1e3 * 60 * 60));
  const remainingDays = Math.floor(remainingHours / 24);
  res.json({
    active,
    paused: serverAutoVerifyConfig.paused,
    enabled: serverAutoVerifyConfig.enabled,
    expiresAt: serverAutoVerifyConfig.expiresAt,
    remainingDays,
    remainingHours
  });
});
app.post("/api/admin/auto-verify-toggle", rateLimitGuard(30, 6e4), requireAdmin, (req, res) => {
  try {
    const { paused, reset7Days } = req.body;
    if (reset7Days) {
      const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3).toISOString();
      setServerAutoVerifyConfig({ enabled: true, paused: false, expiresAt: newExpiry });
    } else if (typeof paused === "boolean") {
      setServerAutoVerifyConfig({ paused });
    }
    const active = isServerAutoVerifyActive();
    res.json({
      success: true,
      message: serverAutoVerifyConfig.paused ? "Instant Auto-Verification paused by Super Admin." : "Instant Auto-Verification is now active.",
      config: serverAutoVerifyConfig,
      active
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to toggle auto-verification" });
  }
});
app.post("/api/admin/bulk-verify-all", rateLimitGuard(15, 6e4), requireSuperAdmin, async (req, res) => {
  try {
    const actor = resolveActor(req);
    const result = await bulkVerifyAllAlumniProfiles({
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role
    });
    res.json({
      success: true,
      message: `Successfully verified all ${result.verifiedCount} alumni profiles!`,
      verifiedCount: result.verifiedCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to bulk verify profiles" });
  }
});
app.use(createTelemetryRouter());
app.use(createPushRouter());
var serverSiteConfigStore = null;
var SITE_CONFIG_FILE = path3.resolve(__dirname2, "szmc-site-config.json");
function cleanAndPersistBase64Avatars(members) {
  if (!Array.isArray(members)) return [];
  const uploadsDir = path3.resolve(__dirname2, "public", "uploads", "avatars");
  if (!existsSync3(uploadsDir)) {
    try {
      mkdirSync(uploadsDir, { recursive: true });
    } catch {
    }
  }
  return members.map((member, idx) => {
    if (typeof member?.avatarUrl === "string" && member.avatarUrl.startsWith("data:image")) {
      try {
        const matches = member.avatarUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (matches && matches[2]) {
          const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
          const fileName = `hof_${Date.now()}_${idx}.${ext}`;
          const filePath = path3.join(uploadsDir, fileName);
          writeFileSync2(filePath, Buffer.from(matches[2], "base64"));
          return {
            ...member,
            avatarUrl: `/uploads/avatars/${fileName}`
          };
        }
      } catch (err) {
        console.warn("Failed to extract base64 avatar:", err);
      }
    }
    return member;
  });
}
async function hydrateServerSiteConfigFromSupabase() {
  let diskConfig = null;
  try {
    if (existsSync3(SITE_CONFIG_FILE)) {
      const raw = readFileSync3(SITE_CONFIG_FILE, "utf-8");
      diskConfig = JSON.parse(raw);
    }
  } catch (err) {
    console.warn("[Server] Notice reading szmc-site-config.json:", err);
  }
  let remoteMasterConfig = null;
  let remoteHofMembers = null;
  if (isSupabaseServerConfigured) {
    try {
      const { data, error } = await supabaseServer.from("site_settings").select("*");
      if (!error && Array.isArray(data)) {
        const masterRow = data.find((r) => r.key === "master_site_config");
        if (masterRow?.value && typeof masterRow.value === "object") {
          remoteMasterConfig = masterRow.value;
        }
        const hofRow = data.find((r) => r.key === "hall_of_fame");
        if (hofRow?.value) {
          const members = Array.isArray(hofRow.value.members) ? hofRow.value.members : Array.isArray(hofRow.value) ? hofRow.value : null;
          if (members && members.length > 0) {
            remoteHofMembers = members;
          }
        }
      }
    } catch (supaErr) {
      console.warn("[Server] Supabase site_settings hydration notice:", supaErr?.message || supaErr);
    }
  }
  const rawFeatured = Array.isArray(diskConfig?.featuredAlumni) && diskConfig.featuredAlumni.length > 0 ? diskConfig.featuredAlumni : Array.isArray(remoteHofMembers) && remoteHofMembers.length > 0 ? remoteHofMembers : Array.isArray(remoteMasterConfig?.featuredAlumni) && remoteMasterConfig.featuredAlumni.length > 0 ? remoteMasterConfig.featuredAlumni : [];
  const finalFeaturedAlumni = cleanAndPersistBase64Avatars(rawFeatured);
  const merged = {
    ...remoteMasterConfig || {},
    ...diskConfig || {},
    featuredAlumni: finalFeaturedAlumni,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  serverSiteConfigStore = merged;
  try {
    writeFileSync2(SITE_CONFIG_FILE, JSON.stringify(merged, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Server] Failed to write szmc-site-config.json:", err);
  }
  return merged;
}
function loadServerSiteConfig() {
  if (serverSiteConfigStore) return serverSiteConfigStore;
  try {
    if (existsSync3(SITE_CONFIG_FILE)) {
      const raw = readFileSync3(SITE_CONFIG_FILE, "utf-8");
      serverSiteConfigStore = JSON.parse(raw);
      return serverSiteConfigStore;
    }
  } catch (err) {
    console.warn("Notice reading szmc-site-config.json:", err);
  }
  return null;
}
function saveServerSiteConfig(patch) {
  const current = loadServerSiteConfig() || {};
  let cleanedPatch = { ...patch };
  if (Array.isArray(cleanedPatch.featuredAlumni)) {
    cleanedPatch.featuredAlumni = cleanAndPersistBase64Avatars(cleanedPatch.featuredAlumni);
  }
  const updated = { ...current, ...cleanedPatch, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  serverSiteConfigStore = updated;
  try {
    writeFileSync2(SITE_CONFIG_FILE, JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    console.warn("Failed to write szmc-site-config.json:", err);
  }
  return updated;
}
app.get(["/api/site-config", "/api/admin/site-config"], async (_req, res) => {
  try {
    let config3 = loadServerSiteConfig();
    if (!config3 || !config3.featuredAlumni || config3.featuredAlumni.length === 0) {
      config3 = await hydrateServerSiteConfigFromSupabase();
    }
    res.setHeader("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=60");
    return res.json({ success: true, config: config3 });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to read site configuration" });
  }
});
app.get("/api/hall-of-fame", async (_req, res) => {
  try {
    let config3 = loadServerSiteConfig();
    if (!config3 || !config3.featuredAlumni || config3.featuredAlumni.length === 0) {
      config3 = await hydrateServerSiteConfigFromSupabase();
    }
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
    return res.json({
      success: true,
      members: config3?.featuredAlumni || [],
      updatedAt: config3?.updatedAt || (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to read Hall of Fame" });
  }
});
app.post("/api/admin/site-config", rateLimitGuard(120, 6e4), requireAdmin, async (req, res) => {
  try {
    const rawBody = req.body;
    if (!rawBody || typeof rawBody !== "object") {
      return res.status(400).json({ error: "Invalid configuration payload" });
    }
    const { _clientSupabaseSynced, ...patch } = rawBody;
    const updated = saveServerSiteConfig(patch);
    broadcastFeedEvent({
      type: "SITE_CONFIG_UPDATED",
      config: updated,
      timestamp: Date.now()
    });
    if (Array.isArray(updated.featuredAlumni)) {
      broadcastFeedEvent({
        type: "HALL_OF_FAME_UPDATED",
        featuredAlumni: updated.featuredAlumni,
        config: updated,
        timestamp: Date.now()
      });
    }
    let supabaseSynced = false;
    let supabaseSyncError = null;
    let syncMode = "server_local_fallback";
    if (_clientSupabaseSynced === true && !isSupabaseServiceRoleConfigured) {
      supabaseSynced = true;
      syncMode = "client_jwt";
    } else if (isSupabaseServerConfigured) {
      const writeTarget = getSupabaseWriteClient(req.supabaseAccessToken);
      if (writeTarget) {
        syncMode = writeTarget.mode;
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        const hofMembers = Array.isArray(updated.featuredAlumni) ? updated.featuredAlumni : [];
        const results = await Promise.allSettled([
          writeTarget.client.from("site_settings").upsert({
            key: "master_site_config",
            value: updated,
            updated_at: nowIso
          }, { onConflict: "key" }),
          writeTarget.client.from("site_settings").upsert({
            key: "hall_of_fame",
            value: {
              members: hofMembers,
              updated_at: nowIso
            },
            updated_at: nowIso
          }, { onConflict: "key" })
        ]);
        const errors = results.map((r) => r.status === "rejected" ? r.reason?.message : r.value?.error?.message).filter(Boolean);
        if (errors.length === 0) {
          supabaseSynced = true;
        } else {
          supabaseSyncError = errors.join("; ");
          console.warn("Supabase site_settings server sync error:", supabaseSyncError);
        }
      } else {
        syncMode = "server_local_fallback";
      }
    }
    return res.json({
      success: true,
      supabaseSynced,
      syncMode,
      supabaseSyncError,
      message: supabaseSynced ? "Site configuration & Hall of Fame saved to Supabase and broadcast live across all devices!" : "Site configuration saved on server and broadcast live across all devices.",
      savedAt: updated.updatedAt,
      config: updated
    });
  } catch (err) {
    console.error("Save site-config error:", err);
    return res.status(500).json({ error: err.message || "Failed to save site configuration" });
  }
});
app.post("/api/auth/reset-password", rateLimitGuard(10, 6e4), requireAuth, async (req, res) => {
  try {
    const { phone, email, newPassword } = req.body || {};
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters." });
    }
    const credential = typeof phone === "string" && phone.trim() || typeof email === "string" && email.trim() || req.dbUser?.email || "";
    if (!credential) {
      return res.status(400).json({ error: "Valid account credential and new password (min 6 chars) required." });
    }
    const alumnus = await findAlumniByCredential(credential);
    if (!alumnus) {
      return res.status(404).json({ error: "No matching account found." });
    }
    const isAdminCaller = req.dbUser?.role === "admin" || req.dbUser?.role === "super_admin";
    const isOwnerCaller = req.dbUser?.id === Number(alumnus.id) || req.dbUser?.email && alumnus.email && req.dbUser.email.toLowerCase() === alumnus.email.toLowerCase();
    if (!isAdminCaller && !isOwnerCaller) {
      return res.status(403).json({ error: "Forbidden: You can only change the password for your own verified account." });
    }
    const newHash = hashPasswordServer(newPassword);
    await updateAlumniPassword(alumnus.id, newHash);
    res.json({ success: true, message: "Password updated successfully across all devices." });
  } catch (error) {
    console.error("Password reset failed:", error);
    res.status(500).json({ error: error.message || "Password reset failed." });
  }
});
app.post("/api/auth/delete-account", rateLimitGuard(10, 6e4), requireAuth, async (req, res) => {
  try {
    const { profileId } = req.body;
    if (!profileId) {
      return res.status(400).json({ error: "Profile ID is required for deletion." });
    }
    const targetId = Number(profileId);
    const isAdminCaller = req.dbUser?.role === "admin" || req.dbUser?.role === "super_admin";
    const isOwnerCaller = req.dbUser?.id === targetId;
    if (!isAdminCaller && !isOwnerCaller) {
      return res.status(403).json({ error: "Forbidden: You can only delete your own account." });
    }
    await deleteAlumniProfile(targetId);
    res.json({ success: true, message: "Profile and associated account deleted successfully." });
  } catch (error) {
    console.error("Account deletion error:", error);
    res.status(500).json({ error: error.message || "Failed to delete account." });
  }
});
function decodeHtmlEntities(raw) {
  if (!raw) return "";
  return raw.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&#x2F;/gi, "/").replace(/&#x3D;/gi, "=").replace(/&middot;/gi, "\xB7").replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try {
      return String.fromCharCode(parseInt(hex, 16));
    } catch {
      return _;
    }
  }).replace(/&#(\d+);/g, (_, dec) => {
    try {
      return String.fromCharCode(Number(dec));
    } catch {
      return _;
    }
  });
}
app.get("/api/unfurl", rateLimitGuard(120, 6e4), async (req, res) => {
  const targetUrl = typeof req.query.url === "string" ? req.query.url : "";
  const cleanUrl = targetUrl.trim();
  const safety = isSafeTargetUrl(cleanUrl);
  if (!safety.safe || !safety.parsed) {
    return res.status(400).json({ error: safety.error || "Valid public HTTP/HTTPS URL required" });
  }
  if (/\.(jpeg|jpg|png|webp|gif)(\?.*)?$/i.test(cleanUrl)) {
    return res.json({
      resolvedUrl: cleanUrl,
      imageUrl: cleanUrl,
      mediaType: "photo",
      title: "Direct Photo",
      publisher: safety.parsed.hostname
    });
  }
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(cleanUrl)) {
    return res.json({
      resolvedUrl: cleanUrl,
      videoUrl: cleanUrl,
      mediaType: "video",
      title: "Direct Video Stream",
      publisher: safety.parsed.hostname
    });
  }
  try {
    const isFacebook = /(?:facebook\.com|fb\.watch|fb\.com)/i.test(cleanUrl);
    const crawlerUa = isFacebook ? "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    const { html: rawHtml, finalUrl: finalResolvedUrl } = await safeFetchHtml(cleanUrl, {
      userAgent: crawlerUa,
      timeoutMs: 6e3,
      maxRedirects: 4
    });
    const getMeta = (propName) => {
      const p1 = new RegExp(`<meta[^>]+(?:property|name)=["']${propName}["'][^>]+content=["']([^"']*)["']`, "i");
      const m1 = rawHtml.match(p1);
      if (m1 && m1[1]) return decodeHtmlEntities(m1[1].trim());
      const p2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${propName}["']`, "i");
      const m2 = rawHtml.match(p2);
      if (m2 && m2[1]) return decodeHtmlEntities(m2[1].trim());
      return void 0;
    };
    const titleMatch = rawHtml.match(/<title[^>]*>([^<]*)<\/title>/i);
    const htmlTitle = titleMatch && titleMatch[1] ? decodeHtmlEntities(titleMatch[1].trim()) : void 0;
    let title = getMeta("og:title") || getMeta("twitter:title") || htmlTitle;
    let description = getMeta("og:description") || getMeta("twitter:description") || getMeta("description");
    let imageUrl = getMeta("og:image:secure_url") || getMeta("og:image") || getMeta("twitter:image");
    let videoUrl = getMeta("og:video:secure_url") || getMeta("og:video:url") || getMeta("og:video") || getMeta("twitter:player:stream");
    let siteName = getMeta("og:site_name") || getMeta("publisher");
    const ogType = getMeta("og:type");
    if (!imageUrl) {
      const linkImgMatch = rawHtml.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']*)["']/i);
      if (linkImgMatch && linkImgMatch[1]) {
        imageUrl = decodeHtmlEntities(linkImgMatch[1].trim());
      }
    }
    if (isFacebook) {
      if (title && /^(Log into Facebook|Facebook|Log in to Facebook)/i.test(title)) {
        title = void 0;
      }
      if (description && /^(Log into Facebook|Facebook helps you connect)/i.test(description)) {
        description = void 0;
      }
      if (!imageUrl || !title) {
        try {
          const oembedResp = await fetch(
            `https://noembed.com/embed?url=${encodeURIComponent(finalResolvedUrl)}`,
            { signal: AbortSignal.timeout(3e3) }
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
        }
      }
    }
    let mediaType = "website";
    if (videoUrl || ogType?.includes("video") || /(?:videos\/|reel\/|reels\/|watch|\/share\/v\/|\/share\/r\/|fb\.watch)/i.test(
      finalResolvedUrl
    )) {
      mediaType = "video";
    } else if (imageUrl && (/(?:photo\.php|photos\/|\/photo\/)/i.test(finalResolvedUrl) || ogType?.includes("image"))) {
      mediaType = "photo";
    } else if (isFacebook) {
      mediaType = "post";
    }
    res.json({
      resolvedUrl: finalResolvedUrl,
      title,
      description,
      imageUrl,
      videoUrl,
      publisher: siteName || (isFacebook ? "Facebook" : void 0),
      mediaType,
      ogType
    });
  } catch (error) {
    const isFb = /(?:facebook\.com|fb\.watch|fb\.com)/i.test(cleanUrl);
    res.json({
      resolvedUrl: cleanUrl,
      publisher: isFb ? "Facebook" : void 0,
      mediaType: isFb ? "post" : "website",
      error: error.message
    });
  }
});
app.get("/api/stream-groups", rateLimitGuard(120, 6e4), async (_req, res) => {
  try {
    const rows = await getAcademicStreamGroupsConfig();
    res.json({ streamGroups: rows });
  } catch (error) {
    console.error("Failed to load stream groups:", error);
    res.status(500).json({ error: error.message || "Failed to load stream groups" });
  }
});
var memoryPostsStore = [];
var cachedPostsResponse = null;
function invalidatePostsCache() {
  cachedPostsResponse = null;
}
var feedClients = /* @__PURE__ */ new Set();
app.get("/api/feed/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders?.();
  feedClients.add(res);
  const activeConfig = loadServerSiteConfig();
  res.write(
    `data: ${JSON.stringify({
      type: "CONNECTED",
      config: activeConfig || void 0,
      timestamp: Date.now()
    })}

`
  );
  req.on("close", () => {
    feedClients.delete(res);
  });
});
function broadcastFeedEvent(event) {
  if (event?.type?.startsWith("POST_")) {
    invalidatePostsCache();
  }
  const data = `data: ${JSON.stringify(event)}

`;
  for (const client of feedClients) {
    try {
      client.write(data);
    } catch {
      feedClients.delete(client);
    }
  }
}
app.post("/api/feed/broadcast", rateLimitGuard(60, 6e4), requireAuth, (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Invalid broadcast payload" });
  }
  const eventType = String(payload.type || "");
  const isAdminActor = req.dbUser?.role === "admin" || req.dbUser?.role === "super_admin" || req.dbUser?.role === "moderator";
  if ((eventType === "SITE_CONFIG_UPDATED" || eventType === "HALL_OF_FAME_UPDATED" || eventType === "NOTICE_UPDATED") && !isAdminActor) {
    return res.status(403).json({ error: "Forbidden: Only administrators can broadcast system configuration events." });
  }
  broadcastFeedEvent(payload);
  res.json({ success: true });
});
app.get("/api/posts", rateLimitGuard(120, 6e4), async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    if (cachedPostsResponse && Date.now() < cachedPostsResponse.expiresAt && req.query.fresh !== "1") {
      return res.json({ posts: cachedPostsResponse.posts.slice(0, limit) });
    }
    let dbPosts = [];
    if (isSupabaseServerConfigured) {
      try {
        const { data: posts } = await supabaseServer.from("posts").select(`
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
          `).eq("is_deleted", false).order("created_at", { ascending: false }).limit(limit);
        if (posts && Array.isArray(posts)) {
          dbPosts = posts.map((p) => {
            const author = p.author || {};
            return {
              ...p,
              userId: p.author_id,
              fullName: author.full_name || "SZMC Alumnus",
              avatarUrl: author.avatar_url || "/assets/aistudio/images__1__2778177d.png",
              batchYear: author.batch_year || 20,
              author: author.full_name || "SZMC Alumnus",
              authorAvatar: author.avatar_url || "/assets/aistudio/images__1__2778177d.png",
              authorBatch: author.batch_year || 20,
              verified: author.verification_status === "verified"
            };
          });
        }
      } catch (dbErr) {
        try {
          const { data: simplePosts } = await supabaseServer.from("posts").select("*").eq("is_deleted", false).order("created_at", { ascending: false }).limit(limit);
          if (simplePosts && Array.isArray(simplePosts)) {
            dbPosts = simplePosts.map((p) => {
              const meta = typeof p.link_metadata === "object" && p.link_metadata ? p.link_metadata : {};
              const isDocNurul = Number(p.author_id) === 1 || Number(p.author_id) === 10002 || String(meta.authorName || "").includes("Nurul");
              const authorName = meta.authorName || (isDocNurul ? "Dr. Nurul Anam Bashir" : "SZMC Alumnus");
              const authorAvatar = meta.authorAvatar || "/assets/aistudio/images__1__2778177d.png";
              const authorBatch = Number(meta.authorBatch || (isDocNurul ? 25 : 20));
              return {
                ...p,
                userId: p.author_id,
                fullName: authorName,
                avatarUrl: authorAvatar,
                batchYear: authorBatch,
                author: authorName,
                authorAvatar,
                authorBatch,
                verified: true,
                likesCount: Number(p.likes_count || 0),
                commentsCount: Number(p.comments_count || 0)
              };
            });
          }
        } catch {
        }
      }
    }
    const combined = [...memoryPostsStore, ...dbPosts.filter((p) => !memoryPostsStore.some((m) => m.id === p.id))];
    cachedPostsResponse = {
      posts: combined,
      expiresAt: Date.now() + 8e3
    };
    return res.json({ posts: combined });
  } catch (err) {
    return res.json({ posts: memoryPostsStore });
  }
});
app.post("/api/posts", rateLimitGuard(40, 6e4), requireAuth, async (req, res) => {
  try {
    invalidatePostsCache();
    const isAdminActor = req.dbUser?.role === "admin" || req.dbUser?.role === "super_admin";
    const requestedAuthorId = Number(req.body.author_id || req.body.authorId || 0);
    const authorId = isAdminActor && requestedAuthorId > 0 ? requestedAuthorId : Number(req.dbUser?.id || 1);
    const content = String(req.body.content || "").trim();
    const category = req.body.category || "General Update";
    const images = Array.isArray(req.body.images) ? req.body.images : [];
    const videos = Array.isArray(req.body.videos) ? req.body.videos : [];
    const linked_url = req.body.linked_url || null;
    const link_metadata = req.body.link_metadata || null;
    if (!content && images.length === 0 && videos.length === 0 && !linked_url) {
      return res.status(400).json({ error: "Post must have content, photos, videos, or a link" });
    }
    let authorProfile = null;
    if (isSupabaseServerConfigured) {
      try {
        const { data: author } = await supabaseServer.from("alumni_profiles").select("id, full_name, avatar_url, batch_year, verification_status, profession, institution").eq("id", authorId).maybeSingle();
        if (author) authorProfile = author;
      } catch {
      }
    }
    if (!authorProfile) {
      authorProfile = {
        id: authorId,
        full_name: authorId === 1 ? "Dr. Nurul Anam Bashir" : "SZMC Alumnus",
        avatarUrl: "/assets/aistudio/images__1__2778177d.png",
        batch_year: 25,
        verification_status: "verified"
      };
    }
    const insertPayload = {
      author_id: authorId,
      content: content || (videos.length > 0 ? videos.length > 1 ? `Shared ${videos.length} videos` : "Shared a video" : images.length > 0 ? images.length > 1 ? `Shared ${images.length} photos` : "Shared a photo" : "Shared an update"),
      category,
      images,
      videos
    };
    if (linked_url) insertPayload.linked_url = linked_url;
    if (link_metadata) insertPayload.link_metadata = link_metadata;
    let newPost = null;
    let error = null;
    if (isSupabaseServerConfigured) {
      const res2 = await supabaseServer.from("posts").insert(insertPayload).select(`
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
        `).single();
      newPost = res2.data;
      error = res2.error;
      if (error && (error.code === "23503" || String(error.message || "").includes("foreign key"))) {
        try {
          const resilientPayload = {
            ...insertPayload,
            author_id: 10002,
            link_metadata: {
              ...insertPayload.link_metadata || {},
              originalAuthorId: authorId,
              authorName: authorProfile.full_name || "Dr. Nurul Anam Bashir",
              authorAvatar: authorProfile.avatar_url || "/assets/aistudio/images__1__2778177d.png",
              authorBatch: authorProfile.batch_year || 25
            }
          };
          const retryRes = await supabaseServer.from("posts").insert(resilientPayload).select(`
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
            `).single();
          if (!retryRes.error && retryRes.data) {
            newPost = {
              ...retryRes.data,
              author_id: authorId,
              fullName: authorProfile.full_name || "Dr. Nurul Anam Bashir",
              avatarUrl: authorProfile.avatar_url || "/assets/aistudio/images__1__2778177d.png",
              batchYear: authorProfile.batch_year || 25
            };
            error = null;
          }
        } catch {
        }
      }
    }
    if (error || !newPost) {
      console.warn("Supabase post insert fallback to memory store:", error?.message);
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
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        userId: authorId,
        fullName: authorProfile.full_name || "Dr. Nurul Anam Bashir",
        avatarUrl: authorProfile.avatar_url || "/assets/aistudio/images__1__2778177d.png",
        batchYear: authorProfile.batch_year || 25,
        author: authorProfile.full_name || "Dr. Nurul Anam Bashir",
        authorAvatar: authorProfile.avatar_url || "/assets/aistudio/images__1__2778177d.png",
        authorBatch: authorProfile.batch_year || 25
      };
      memoryPostsStore.unshift(fallbackPost);
      broadcastFeedEvent({
        type: "POST_CREATED",
        table: "posts",
        eventType: "INSERT",
        post: fallbackPost,
        newRecord: fallbackPost
      });
      return res.status(201).json({ success: true, post: fallbackPost });
    }
    const createdPost = {
      ...newPost,
      userId: newPost.author_id,
      fullName: authorProfile.full_name || "Dr. Nurul Anam Bashir",
      avatarUrl: authorProfile.avatar_url || "/assets/aistudio/images__1__2778177d.png",
      batchYear: authorProfile.batch_year || 25,
      author: authorProfile.full_name || "Dr. Nurul Anam Bashir",
      authorAvatar: authorProfile.avatar_url || "/assets/aistudio/images__1__2778177d.png",
      authorBatch: authorProfile.batch_year || 25
    };
    memoryPostsStore.unshift(createdPost);
    broadcastFeedEvent({
      type: "POST_CREATED",
      table: "posts",
      eventType: "INSERT",
      post: createdPost,
      newRecord: newPost
    });
    broadcastFeedEvent({
      type: "POST_CREATED",
      table: "posts",
      eventType: "INSERT",
      post: createdPost,
      newRecord: newPost
    });
    return res.status(201).json({ success: true, post: createdPost });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to create post" });
  }
});
app.post("/api/posts/:id/react", rateLimitGuard(120, 6e4), requireAuth, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const userId = Number(req.dbUser?.id || 1);
    const reaction = req.body.reaction ? String(req.body.reaction) : null;
    let likesCount = 0;
    let liked = Boolean(reaction);
    if (isSupabaseServerConfigured) {
      try {
        if (!reaction) {
          await supabaseServer.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
        } else {
          const { error: upsertErr } = await supabaseServer.from("post_likes").upsert({
            post_id: postId,
            user_id: userId,
            reaction
          });
          if (upsertErr) {
            await supabaseServer.from("post_likes").upsert({
              post_id: postId,
              user_id: userId
            });
          }
        }
        const { count } = await supabaseServer.from("post_likes").select("id", { count: "exact", head: true }).eq("post_id", postId);
        likesCount = typeof count === "number" ? count : 0;
        await supabaseServer.from("posts").update({ likes_count: likesCount }).eq("id", postId);
      } catch (err) {
        console.warn("Supabase post react notice:", err);
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
    const finalLikesCount = typeof likesCount === "number" && likesCount > 0 ? likesCount : memPost?.likes_count || (liked ? 1 : 0);
    const reactionsSummary = memPost?.reactionsSummary || (reaction ? { [reaction]: 1 } : {});
    broadcastFeedEvent({
      type: "POST_REACTED",
      table: "post_likes",
      eventType: "UPDATE",
      postId,
      userId,
      liked,
      reaction,
      likesCount: finalLikesCount,
      reactionsSummary
    });
    return res.json({ success: true, liked, reaction, likesCount: finalLikesCount, reactionsSummary });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to update reaction" });
  }
});
app.post("/api/posts/:id/like", rateLimitGuard(120, 6e4), requireAuth, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const userId = Number(req.dbUser?.id || 1);
    let liked = false;
    let likesCount = 0;
    if (isSupabaseServerConfigured) {
      try {
        const { data: existing } = await supabaseServer.from("post_likes").select("id").eq("post_id", postId).eq("user_id", userId).maybeSingle();
        if (existing) {
          await supabaseServer.from("post_likes").delete().eq("id", existing.id);
          liked = false;
        } else {
          await supabaseServer.from("post_likes").insert({ post_id: postId, user_id: userId, reaction: "like" });
          liked = true;
        }
        const { count } = await supabaseServer.from("post_likes").select("id", { count: "exact", head: true }).eq("post_id", postId);
        likesCount = typeof count === "number" ? count : 0;
        await supabaseServer.from("posts").update({ likes_count: likesCount }).eq("id", postId);
      } catch (err) {
        console.warn("Supabase post_like toggle notice:", err);
      }
    }
    const memPost = memoryPostsStore.find((p) => p.id === postId);
    if (memPost) {
      memPost.likes_count = likesCount || (liked ? (memPost.likes_count || 0) + 1 : Math.max(0, (memPost.likes_count || 1) - 1));
      memPost.likes = memPost.likes_count;
      memPost.liked = liked;
      memPost.likedByMe = liked;
      memPost.userReaction = liked ? "like" : null;
    }
    const finalLikesCount = likesCount || memPost?.likes_count || (liked ? 1 : 0);
    broadcastFeedEvent({
      type: "POST_LIKED",
      table: "post_likes",
      eventType: "UPDATE",
      postId,
      userId,
      liked,
      likesCount: finalLikesCount,
      reaction: liked ? "like" : null
    });
    return res.json({ success: true, liked, likesCount: finalLikesCount });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to toggle like" });
  }
});
app.post("/api/posts/:id/comment", rateLimitGuard(90, 6e4), requireAuth, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const userId = Number(req.dbUser?.id || 1);
    const content = String(req.body.content || "").trim();
    let fullName = String(req.body.fullName || req.body.authorName || "").trim();
    let avatarUrl = String(req.body.avatarUrl || req.body.authorAvatar || "").trim();
    const skipDbInsert = Boolean(req.body.skipDbInsert);
    const clientCommentId = req.body.commentId ? Number(req.body.commentId) : null;
    const clientCreatedAt = req.body.createdAt ? String(req.body.createdAt) : null;
    if (!content) {
      return res.status(400).json({ error: "Comment content cannot be empty" });
    }
    if ((!fullName || !avatarUrl) && isSupabaseServerConfigured) {
      try {
        const { data: profile } = await supabaseServer.from("alumni_profiles").select("full_name, avatar_url").eq("id", userId).maybeSingle();
        if (profile) {
          if (!fullName) fullName = profile.full_name || "SZMC Colleague";
          if (!avatarUrl) avatarUrl = profile.avatar_url || "/assets/aistudio/images__1__2778177d.png";
        }
      } catch {
      }
    }
    if (!fullName) fullName = userId === 1 || userId === 10002 ? "Dr. Nurul Anam Bashir" : "SZMC Colleague";
    if (!avatarUrl) avatarUrl = "/assets/aistudio/images__1__2778177d.png";
    let insertedComment = null;
    if (isSupabaseServerConfigured && !skipDbInsert) {
      try {
        const try1 = await supabaseServer.from("post_comments").insert({ post_id: postId, user_id: userId, content }).select("*").single();
        if (!try1.error && try1.data) {
          insertedComment = try1.data;
        } else {
          const tryFk = await supabaseServer.from("post_comments").insert({ post_id: postId, user_id: 10002, content }).select("*").single();
          if (!tryFk.error && tryFk.data) {
            insertedComment = tryFk.data;
          }
        }
      } catch (err) {
        console.warn("Supabase comment insert notice:", err);
      }
    }
    if (isSupabaseServerConfigured) {
      try {
        const { count } = await supabaseServer.from("post_comments").select("id", { count: "exact", head: true }).eq("post_id", postId);
        if (typeof count === "number" && count > 0) {
          await supabaseServer.from("posts").update({ comments_count: count }).eq("id", postId);
        }
      } catch {
      }
    }
    const commentId = clientCommentId || Number(insertedComment?.id) || Date.now();
    const createdTimestamp = clientCreatedAt || insertedComment?.created_at || (/* @__PURE__ */ new Date()).toISOString();
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
      replies: []
    };
    const memPost = memoryPostsStore.find((p) => p.id === postId);
    if (memPost) {
      if (!Array.isArray(memPost.comments)) memPost.comments = [];
      if (!memPost.comments.some((c) => Number(c.id) === commentId)) {
        memPost.comments.push(formattedComment);
        memPost.comments_count = Math.max((memPost.comments_count || 0) + 1, memPost.comments.length);
      }
    }
    broadcastFeedEvent({
      type: "POST_COMMENTED",
      table: "post_comments",
      eventType: "INSERT",
      postId,
      userId,
      comment: formattedComment,
      newRecord: formattedComment
    });
    return res.status(201).json({ success: true, comment: formattedComment });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to add comment" });
  }
});
app.post("/api/posts/:id/reply", rateLimitGuard(90, 6e4), requireAuth, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const parentCommentId = Number(req.body.parentCommentId);
    const userId = Number(req.dbUser?.id || 1);
    const content = String(req.body.content || "").trim();
    const fullName = String(req.body.fullName || "SZMC Colleague").trim();
    const avatarUrl = String(req.body.avatarUrl || "/assets/aistudio/images__1__2778177d.png").trim();
    const skipDbInsert = Boolean(req.body.skipDbInsert);
    const clientCommentId = req.body.commentId ? Number(req.body.commentId) : null;
    const clientCreatedAt = req.body.createdAt ? String(req.body.createdAt) : null;
    if (!content) {
      return res.status(400).json({ error: "Reply content cannot be empty" });
    }
    let insertedReply = null;
    if (isSupabaseServerConfigured && !skipDbInsert) {
      try {
        const try1 = await supabaseServer.from("post_comments").insert({ post_id: postId, user_id: userId, content }).select("*").single();
        if (!try1.error && try1.data) {
          insertedReply = try1.data;
        } else {
          const tryFk = await supabaseServer.from("post_comments").insert({ post_id: postId, user_id: 10002, content }).select("*").single();
          if (!tryFk.error && tryFk.data) insertedReply = tryFk.data;
        }
      } catch {
      }
    }
    const replyId = clientCommentId || Number(insertedReply?.id) || Date.now();
    const createdTimestamp = clientCreatedAt || insertedReply?.created_at || (/* @__PURE__ */ new Date()).toISOString();
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
      created_at: createdTimestamp
    };
    broadcastFeedEvent({
      type: "POST_REPLY",
      table: "post_comments",
      eventType: "UPDATE",
      postId,
      parentCommentId,
      reply
    });
    return res.status(201).json({ success: true, reply });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to add reply" });
  }
});
var memoryGalleryAlbums = [];
var memoryGalleryPhotoLikes = /* @__PURE__ */ new Map();
var memoryGalleryLikeCounts = /* @__PURE__ */ new Map();
var ALLOWED_GALLERY_CATEGORIES = /* @__PURE__ */ new Set([
  "reunion",
  "academic",
  "campus",
  "convocation",
  "sports",
  "cultural",
  "all"
]);
var ALLOWED_GALLERY_IMAGE_EXTS = /* @__PURE__ */ new Set(["jpg", "jpeg", "png", "webp", "gif"]);
var ALLOWED_GALLERY_VIDEO_EXTS = /* @__PURE__ */ new Set(["mp4", "webm", "mov", "ogg"]);
function sanitizeGalleryUrl(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    return trimmed;
  }
  if (trimmed.startsWith("/assets/") || trimmed.startsWith("/uploads/")) {
    return trimmed;
  }
  if (/^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}
function normalizeGalleryBatchYear(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 38) return null;
  return n;
}
function extractBearerToken2(req) {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim() || null;
}
function formatGalleryPhotoRow(p, album, currentUserId) {
  const photoId = String(p.id);
  const dbLikes = Number(p.likes_count) || 0;
  const serverLikes = memoryGalleryLikeCounts.get(photoId);
  const likesCount = typeof serverLikes === "number" ? Math.max(0, serverLikes) : dbLikes;
  const likedSet = memoryGalleryPhotoLikes.get(photoId);
  const likedByMe = currentUserId > 0 && Boolean(likedSet?.has(currentUserId));
  const uploaderRel = Array.isArray(p.uploader) ? p.uploader[0] : p.uploader;
  return {
    id: photoId,
    albumId: Number(album.id),
    url: p.url || p.photo_url || album.cover_url || album.cover_photo_url,
    caption: p.caption || "",
    category: album.category,
    batchYear: p.batch_year || album.batch_year || void 0,
    year: String(p.batch_year || album.batch_year || 2026),
    uploaderName: uploaderRel?.full_name || p.uploader_name || "SZMC Alumnus",
    uploaderAvatar: uploaderRel?.avatar_url || void 0,
    uploaderId: p.uploader_id ? Number(p.uploader_id) : void 0,
    uploadedAt: p.uploaded_at || p.created_at || void 0,
    likesCount,
    likedByMe,
    tags: Array.isArray(p.tags) ? p.tags : [],
    mediaType: p.media_type === "video" ? "video" : "image",
    fileSize: p.file_size || "1.2 MB"
  };
}
app.post(
  "/api/gallery/upload",
  rateLimitGuard(40, 6e4),
  requireAuth,
  express.raw({ type: ["image/*", "video/*", "application/octet-stream"], limit: "25mb" }),
  async (req, res) => {
    try {
      const rawExt = String(req.headers["x-file-ext"] || "jpg").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      const isVideo = ALLOWED_GALLERY_VIDEO_EXTS.has(rawExt);
      const isImage = ALLOWED_GALLERY_IMAGE_EXTS.has(rawExt);
      if (!isImage && !isVideo) {
        return res.status(400).json({
          error: "Unsupported media format. Allowed: JPG, PNG, WEBP, GIF, MP4, WEBM, MOV, OGG."
        });
      }
      const buffer = Buffer.isBuffer(req.body) ? req.body : null;
      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ error: "Empty media upload payload." });
      }
      const contentTypeMap = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        gif: "image/gif",
        mp4: "video/mp4",
        webm: "video/webm",
        mov: "video/quicktime",
        ogg: "video/ogg"
      };
      const contentType = contentTypeMap[rawExt] || "application/octet-stream";
      const userIdSafe = String(req.dbUser?.id || "alumni").replace(/[^a-zA-Z0-9_-]/g, "");
      const rawAlbumFolder = String(req.headers["x-album-id"] || "general").replace(/[^a-zA-Z0-9_-]/g, "");
      const fileName = `gallery_${userIdSafe}_${Date.now()}_${crypto5.randomBytes(4).toString("hex")}.${rawExt}`;
      if (isSupabaseServerConfigured) {
        const writeCtx = getSupabaseWriteClient(req.supabaseAccessToken || extractBearerToken2(req));
        const storageClient = writeCtx?.client || supabaseServer;
        const bucketName = isVideo ? "post-media" : "gallery";
        const storagePath = isVideo ? `gallery-videos/${rawAlbumFolder}/${fileName}` : `albums/${rawAlbumFolder}/${fileName}`;
        try {
          const { error: upErr } = await storageClient.storage.from(bucketName).upload(storagePath, buffer, {
            contentType,
            cacheControl: "3600",
            upsert: true
          });
          if (!upErr) {
            const { data: pubData } = storageClient.storage.from(bucketName).getPublicUrl(storagePath);
            if (pubData?.publicUrl) {
              return res.status(201).json({
                url: pubData.publicUrl,
                storagePath,
                bucket: bucketName
              });
            }
          } else {
            console.warn("[Server] Gallery Supabase Storage upload notice:", upErr.message);
          }
        } catch (supaErr) {
          console.warn("[Server] Gallery Supabase Storage upload fallback:", supaErr);
        }
      }
      const uploadsDir = path3.resolve(__dirname2, "public", "uploads", "gallery");
      if (!existsSync3(uploadsDir)) {
        mkdirSync(uploadsDir, { recursive: true });
      }
      const targetPath = path3.resolve(uploadsDir, fileName);
      if (!targetPath.startsWith(uploadsDir + path3.sep)) {
        return res.status(400).json({ error: "Invalid upload file path." });
      }
      writeFileSync2(targetPath, buffer);
      return res.status(201).json({
        url: `/uploads/gallery/${fileName}`,
        storagePath: `uploads/gallery/${fileName}`,
        bucket: "local"
      });
    } catch (err) {
      console.error("[Server] Gallery media upload error:", err);
      return res.status(500).json({ error: err?.message || "Failed to upload gallery media." });
    }
  }
);
app.get("/api/gallery/albums", rateLimitGuard(90, 6e4), optionalAuth, async (req, res) => {
  try {
    const currentUserId = Number(req.dbUser?.id || 0);
    if (isSupabaseServerConfigured) {
      try {
        let albumsData = null;
        let queryError = null;
        const richRes = await supabaseServer.from("gallery_albums").select(
          "*, creator:alumni_profiles!gallery_albums_created_by_id_fkey(id, full_name, avatar_url), gallery_photos(*, uploader:alumni_profiles!gallery_photos_uploader_id_fkey(id, full_name, avatar_url))"
        ).eq("is_published", true).order("created_at", { ascending: false });
        if (!richRes.error && Array.isArray(richRes.data)) {
          albumsData = richRes.data;
        } else {
          const basicRes = await supabaseServer.from("gallery_albums").select("*, gallery_photos(*)").order("created_at", { ascending: false });
          albumsData = basicRes.data;
          queryError = basicRes.error;
        }
        if (!queryError && Array.isArray(albumsData)) {
          const formatted = albumsData.map((a) => {
            const rawPhotos = Array.isArray(a.gallery_photos) ? [...a.gallery_photos] : [];
            rawPhotos.sort((p1, p2) => {
              const t1 = p1.uploaded_at ? new Date(p1.uploaded_at).getTime() : 0;
              const t2 = p2.uploaded_at ? new Date(p2.uploaded_at).getTime() : 0;
              return t2 - t1;
            });
            const photos = rawPhotos.filter((p) => p.is_approved !== false).map((p) => formatGalleryPhotoRow(p, a, currentUserId));
            const creatorRel = Array.isArray(a.creator) ? a.creator[0] : a.creator;
            return {
              id: Number(a.id),
              title: a.title,
              description: a.description || "",
              category: a.category,
              date: a.event_date_label || "2026",
              location: a.location || "SZMC Campus, Silimpur, Bogura",
              batchYear: a.batch_year || 0,
              photosCount: photos.length,
              coverUrl: a.cover_url || a.cover_photo_url || (photos[0]?.url ?? "/assets/aistudio/images__1__2778177d.png"),
              createdBy: creatorRel?.full_name || a.created_by || "SZMC Alumni",
              createdById: a.created_by_id ? Number(a.created_by_id) : void 0,
              createdDate: a.created_at || void 0,
              photos
            };
          });
          return res.json({ albums: formatted, source: "supabase" });
        }
      } catch (err) {
        console.warn("Supabase fetch gallery albums notice:", err);
      }
    }
    return res.json({ albums: memoryGalleryAlbums, source: "memory" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to fetch gallery albums" });
  }
});
app.post("/api/gallery/albums", rateLimitGuard(30, 6e4), requireAuth, async (req, res) => {
  try {
    const { title, description, category, eventDateLabel, location, batchYear, coverUrl, createdBy } = req.body;
    const createdById = Number(req.dbUser?.id || 0);
    const authorName = String(req.dbUser?.fullName || createdBy || "SZMC Alumnus").trim();
    const cleanTitle = typeof title === "string" ? title.trim() : "";
    if (cleanTitle.length < 2 || cleanTitle.length > 250) {
      return res.status(400).json({ error: "Album title must be between 2 and 250 characters." });
    }
    const normCat = String(category || "campus").toLowerCase();
    const finalCat = ALLOWED_GALLERY_CATEGORIES.has(normCat) ? normCat : "campus";
    const validatedCover = sanitizeGalleryUrl(coverUrl);
    if (coverUrl && !validatedCover) {
      return res.status(400).json({ error: "Invalid cover photo URL format." });
    }
    const finalCover = validatedCover || "https://hjuyiqyviohinbhzaipl.supabase.co/storage/v1/object/public/gallery/szmc/campus_1.jpg";
    const safeBatchYear = normalizeGalleryBatchYear(batchYear);
    const safeDateLabel = String(eventDateLabel || "Recent").trim().slice(0, 64) || "Recent";
    let insertedAlbumId = null;
    let insertedCoverPhotoId = null;
    if (isSupabaseServerConfigured) {
      const writeCtx = getSupabaseWriteClient(req.supabaseAccessToken || extractBearerToken2(req));
      const dbClient = writeCtx?.client || supabaseServer;
      const payload = {
        title: cleanTitle,
        description: typeof description === "string" && description.trim() ? description.trim() : "SZMC Album",
        category: finalCat,
        event_date_label: safeDateLabel,
        location: typeof location === "string" && location.trim() ? location.trim() : "SZMC Campus, Silimpur, Bogura",
        batch_year: safeBatchYear,
        cover_url: finalCover,
        cover_photo_url: finalCover,
        is_published: true,
        photos_count: 1,
        photo_count: 1,
        created_by: authorName
      };
      if (createdById > 0) payload.created_by_id = createdById;
      const { data, error } = await dbClient.from("gallery_albums").insert(payload).select("id").single();
      if (error || !data?.id) {
        console.error("[Server] Supabase create album error:", error?.message || error);
        return res.status(500).json({
          error: error?.message || "Could not save album to Supabase database."
        });
      }
      insertedAlbumId = Number(data.id);
      const coverPhotoPayload = {
        album_id: insertedAlbumId,
        url: finalCover,
        photo_url: finalCover,
        caption: `${cleanTitle} - Cover Photo`,
        batch_year: safeBatchYear,
        tags: ["Cover", finalCat],
        media_type: "image",
        uploader_name: authorName,
        is_approved: true
      };
      if (createdById > 0) coverPhotoPayload.uploader_id = createdById;
      const { data: photoData, error: photoErr } = await dbClient.from("gallery_photos").insert(coverPhotoPayload).select("id").single();
      if (!photoErr && photoData?.id) {
        insertedCoverPhotoId = String(photoData.id);
      } else if (photoErr) {
        console.warn("[Server] Cover photo insert notice:", photoErr.message);
      }
    }
    const finalId = insertedAlbumId || Date.now();
    const coverPhotoId = insertedCoverPhotoId || `p-${Date.now()}`;
    const albumObj = {
      id: finalId,
      title: cleanTitle,
      description: description || "A collection of SZMC memories.",
      category: finalCat,
      date: safeDateLabel,
      location: location || "SZMC Campus, Silimpur, Bogura",
      batchYear: safeBatchYear || 0,
      photosCount: 1,
      coverUrl: finalCover,
      createdById: createdById > 0 ? createdById : void 0,
      createdBy: authorName,
      photos: [
        {
          id: coverPhotoId,
          albumId: finalId,
          url: finalCover,
          caption: `${cleanTitle} - Cover Photo`,
          uploaderId: createdById > 0 ? createdById : void 0,
          uploaderName: authorName,
          batchYear: safeBatchYear || void 0,
          uploadedAt: (/* @__PURE__ */ new Date()).toISOString(),
          likesCount: 0,
          likedByMe: false,
          tags: ["Cover", finalCat],
          mediaType: "image"
        }
      ]
    };
    memoryGalleryAlbums.unshift(albumObj);
    broadcastFeedEvent({
      type: "GALLERY_UPDATED",
      action: "ALBUM_CREATED",
      albumId: finalId,
      timestamp: Date.now()
    });
    return res.status(201).json({ success: true, album: albumObj, coverPhotoId });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to create album" });
  }
});
app.post("/api/gallery/photos", rateLimitGuard(60, 6e4), requireAuth, async (req, res) => {
  try {
    const {
      albumId,
      album_id,
      url,
      photoUrl,
      photo_url,
      storagePath,
      storage_object_path,
      caption,
      batchYear,
      batch_year,
      tags,
      mediaType,
      media_type,
      fileSize,
      file_size,
      uploaderName,
      uploader_name
    } = req.body;
    const targetAlbumId = Number(albumId ?? album_id);
    const uploaderId = Number(req.dbUser?.id || 0);
    const authorName = String(req.dbUser?.fullName || uploaderName || uploader_name || "SZMC Alumnus").trim();
    const rawUrl2 = url || photoUrl || photo_url;
    const finalUrl = sanitizeGalleryUrl(rawUrl2);
    if (!Number.isInteger(targetAlbumId) || targetAlbumId <= 0 || !finalUrl) {
      return res.status(400).json({ error: "Valid albumId and safe media url are required." });
    }
    const safeBatchYear = normalizeGalleryBatchYear(batchYear ?? batch_year);
    const safeMediaType = (mediaType || media_type) === "video" ? "video" : "image";
    const safeTags = Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 12) : [];
    const safeCaption = typeof caption === "string" && caption.trim() ? caption.trim().slice(0, 1e3) : null;
    const safeFileSize = typeof (fileSize || file_size) === "string" ? String(fileSize || file_size).slice(0, 32) : null;
    const safeStoragePath = typeof (storagePath || storage_object_path) === "string" ? String(storagePath || storage_object_path).slice(0, 500) : null;
    let insertedPhotoId = null;
    if (isSupabaseServerConfigured) {
      const writeCtx = getSupabaseWriteClient(req.supabaseAccessToken || extractBearerToken2(req));
      const dbClient = writeCtx?.client || supabaseServer;
      const payload = {
        album_id: targetAlbumId,
        url: finalUrl,
        photo_url: finalUrl,
        storage_object_path: safeStoragePath,
        caption: safeCaption,
        batch_year: safeBatchYear,
        tags: safeTags,
        media_type: safeMediaType,
        file_size: safeFileSize,
        uploader_name: authorName,
        is_approved: true
      };
      if (uploaderId > 0) payload.uploader_id = uploaderId;
      const { data, error } = await dbClient.from("gallery_photos").insert(payload).select("id").single();
      if (error || !data?.id) {
        console.error("[Server] Supabase add gallery photo error:", error?.message || error);
        return res.status(500).json({
          error: error?.message || "Could not save photo to Supabase database."
        });
      }
      insertedPhotoId = String(data.id);
      try {
        const { count } = await dbClient.from("gallery_photos").select("id", { count: "exact", head: true }).eq("album_id", targetAlbumId);
        if (typeof count === "number") {
          await dbClient.from("gallery_albums").update({ photos_count: count, photo_count: count }).eq("id", targetAlbumId);
        }
      } catch {
      }
    }
    const photoObj = {
      id: insertedPhotoId || `p-${Date.now()}`,
      albumId: targetAlbumId,
      url: finalUrl,
      caption: safeCaption || "",
      uploaderId: uploaderId > 0 ? uploaderId : void 0,
      uploaderName: authorName,
      batchYear: safeBatchYear || void 0,
      uploadedAt: (/* @__PURE__ */ new Date()).toISOString(),
      likesCount: 0,
      likedByMe: false,
      tags: safeTags,
      mediaType: safeMediaType,
      fileSize: safeFileSize || "1.2 MB"
    };
    const memAlbum = memoryGalleryAlbums.find((a) => Number(a.id) === targetAlbumId);
    if (memAlbum) {
      if (!Array.isArray(memAlbum.photos)) memAlbum.photos = [];
      memAlbum.photos.unshift(photoObj);
      memAlbum.photosCount = memAlbum.photos.length;
    }
    broadcastFeedEvent({
      type: "GALLERY_UPDATED",
      action: "PHOTO_ADDED",
      albumId: targetAlbumId,
      photoId: photoObj.id,
      timestamp: Date.now()
    });
    return res.status(201).json({ success: true, photo: photoObj });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to add photo" });
  }
});
app.post("/api/gallery/photos/:id/like", rateLimitGuard(120, 6e4), requireAuth, async (req, res) => {
  try {
    const photoId = String(req.params.id || "").trim();
    if (!photoId) {
      return res.status(400).json({ error: "Photo ID is required." });
    }
    const actorId = Number(req.dbUser?.id || 0);
    if (actorId <= 0) {
      return res.status(401).json({ error: "Authentication required to like photos." });
    }
    let currentDbLikes = 0;
    let albumId = req.body?.albumId ? Number(req.body.albumId) : null;
    if (isSupabaseServerConfigured) {
      const { data: existingPhoto } = await supabaseServer.from("gallery_photos").select("id, album_id, likes_count").eq("id", photoId).maybeSingle();
      if (existingPhoto) {
        currentDbLikes = Number(existingPhoto.likes_count) || 0;
        albumId = Number(existingPhoto.album_id) || albumId;
      }
    }
    let likedSet = memoryGalleryPhotoLikes.get(photoId);
    if (!likedSet) {
      likedSet = /* @__PURE__ */ new Set();
      memoryGalleryPhotoLikes.set(photoId, likedSet);
    }
    const baseCount = memoryGalleryLikeCounts.has(photoId) ? memoryGalleryLikeCounts.get(photoId) : currentDbLikes;
    const desiredLiked = typeof req.body?.liked === "boolean" ? Boolean(req.body.liked) : !likedSet.has(actorId);
    const wasLiked = likedSet.has(actorId);
    let nextLikesCount = baseCount;
    if (desiredLiked && !wasLiked) {
      likedSet.add(actorId);
      nextLikesCount = baseCount + 1;
    } else if (!desiredLiked && wasLiked) {
      likedSet.delete(actorId);
      nextLikesCount = Math.max(0, baseCount - 1);
    } else if (desiredLiked && wasLiked && typeof req.body?.liked === "boolean") {
      nextLikesCount = Math.max(1, baseCount);
    } else if (!desiredLiked && !wasLiked && typeof req.body?.liked === "boolean") {
      nextLikesCount = Math.max(0, baseCount - 1);
    }
    memoryGalleryLikeCounts.set(photoId, nextLikesCount);
    let persistedToSupabase = false;
    if (isSupabaseServerConfigured) {
      try {
        const writeCtx = getSupabaseWriteClient(req.supabaseAccessToken || extractBearerToken2(req));
        const dbClient = writeCtx?.client || supabaseServer;
        const { data: updatedRow, error: upErr } = await dbClient.from("gallery_photos").update({ likes_count: nextLikesCount }).eq("id", photoId).select("likes_count").maybeSingle();
        if (!upErr && updatedRow && Number(updatedRow.likes_count) === nextLikesCount) {
          persistedToSupabase = true;
        }
      } catch (err) {
        console.warn("[Server] Gallery photo like Supabase update notice:", err);
      }
    }
    for (const alb of memoryGalleryAlbums) {
      const target = Array.isArray(alb.photos) ? alb.photos.find((p) => String(p.id) === photoId) : null;
      if (target) {
        target.likesCount = nextLikesCount;
        break;
      }
    }
    broadcastFeedEvent({
      type: "GALLERY_UPDATED",
      action: "PHOTO_LIKED",
      albumId,
      photoId,
      likesCount: nextLikesCount,
      timestamp: Date.now()
    });
    return res.json({
      success: true,
      photoId,
      albumId,
      likedByMe: desiredLiked,
      likesCount: nextLikesCount,
      persistedToSupabase
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Failed to update photo like." });
  }
});
app.patch("/api/gallery/albums/:id", rateLimitGuard(40, 6e4), requireAuth, async (req, res) => {
  try {
    const albumId = Number(req.params.id);
    if (!Number.isInteger(albumId) || albumId <= 0) {
      return res.status(400).json({ error: "Valid Album ID is required." });
    }
    const requesterUserId = Number(req.dbUser?.id || 0);
    const requesterIsAdmin = req.dbUser?.role === "admin" || req.dbUser?.role === "super_admin" || req.dbUser?.role === "moderator";
    const { title, description, category, eventDateLabel, location, batchYear, coverUrl } = req.body;
    const updates = {};
    if (typeof title === "string") {
      const cleanTitle = title.trim();
      if (cleanTitle.length < 2 || cleanTitle.length > 250) {
        return res.status(400).json({ error: "Album title must be between 2 and 250 characters." });
      }
      updates.title = cleanTitle;
    }
    if (typeof description === "string") {
      updates.description = description.trim() || null;
    }
    if (typeof category === "string") {
      const normCat = category.toLowerCase();
      if (ALLOWED_GALLERY_CATEGORIES.has(normCat)) {
        updates.category = normCat;
      }
    }
    if (typeof eventDateLabel === "string" && eventDateLabel.trim()) {
      updates.event_date_label = eventDateLabel.trim().slice(0, 64);
    }
    if (typeof location === "string") {
      updates.location = location.trim() || null;
    }
    if (batchYear !== void 0) {
      updates.batch_year = normalizeGalleryBatchYear(batchYear);
    }
    if (typeof coverUrl === "string" && coverUrl.trim()) {
      const validCover = sanitizeGalleryUrl(coverUrl);
      if (!validCover) {
        return res.status(400).json({ error: "Invalid cover photo URL format." });
      }
      updates.cover_url = validCover;
      updates.cover_photo_url = validCover;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid album fields provided to update." });
    }
    if (isSupabaseServerConfigured) {
      const { data: existingAlbum } = await supabaseServer.from("gallery_albums").select("id, created_by_id").eq("id", albumId).maybeSingle();
      if (existingAlbum) {
        const isOwner = requesterUserId > 0 && Number(existingAlbum.created_by_id) === requesterUserId;
        if (!requesterIsAdmin && !isOwner) {
          return res.status(403).json({
            error: "Access denied: You can only edit your own albums, or an administrator can edit any album."
          });
        }
        const writeCtx = getSupabaseWriteClient(req.supabaseAccessToken || extractBearerToken2(req));
        const dbClient = writeCtx?.client || supabaseServer;
        const { error: upErr } = await dbClient.from("gallery_albums").update(updates).eq("id", albumId);
        if (upErr) {
          return res.status(500).json({
            error: upErr.message || "Failed to update album in Supabase."
          });
        }
      }
    }
    const memAlbum = memoryGalleryAlbums.find((a) => Number(a.id) === albumId);
    if (memAlbum) {
      if (updates.title) memAlbum.title = updates.title;
      if (updates.description !== void 0) memAlbum.description = updates.description || "";
      if (updates.category) memAlbum.category = updates.category;
      if (updates.event_date_label) memAlbum.date = updates.event_date_label;
      if (updates.location !== void 0) memAlbum.location = updates.location || "";
      if (updates.batch_year !== void 0) memAlbum.batchYear = updates.batch_year || 0;
      if (updates.cover_url) memAlbum.coverUrl = updates.cover_url;
    }
    broadcastFeedEvent({
      type: "GALLERY_UPDATED",
      action: "ALBUM_UPDATED",
      albumId,
      timestamp: Date.now()
    });
    return res.json({ success: true, albumId, updates });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Failed to update album." });
  }
});
var handleGalleryAlbumDelete = async (req, res) => {
  try {
    const albumId = Number(req.params.id);
    if (!Number.isInteger(albumId) || albumId <= 0) {
      return res.status(400).json({ error: "Valid Album ID is required." });
    }
    const requesterUserId = Number(req.dbUser?.id || 0);
    const requesterIsAdmin = req.dbUser?.role === "admin" || req.dbUser?.role === "super_admin" || req.dbUser?.role === "moderator";
    if (isSupabaseServerConfigured) {
      const writeCtx = getSupabaseWriteClient(req.supabaseAccessToken || extractBearerToken2(req));
      const dbClient = writeCtx?.client || supabaseServer;
      const { data: album } = await supabaseServer.from("gallery_albums").select("id, created_by_id").eq("id", albumId).maybeSingle();
      if (album) {
        const isOwner = requesterUserId > 0 && Number(album.created_by_id) === requesterUserId;
        if (!requesterIsAdmin && !isOwner) {
          return res.status(403).json({
            error: "Access denied: You can only delete your own albums, or an administrator can delete any album."
          });
        }
        const { error: photosDelErr } = await dbClient.from("gallery_photos").delete().eq("album_id", albumId);
        if (photosDelErr) {
          console.warn("[Server] Delete album photos error:", photosDelErr.message);
        }
        const { error: albumDelErr } = await dbClient.from("gallery_albums").delete().eq("id", albumId);
        if (albumDelErr) {
          return res.status(500).json({
            error: albumDelErr.message || "Failed to delete album from Supabase."
          });
        }
      }
    }
    const memIdx = memoryGalleryAlbums.findIndex((a) => Number(a.id) === albumId);
    if (memIdx >= 0) {
      memoryGalleryAlbums.splice(memIdx, 1);
    }
    broadcastFeedEvent({
      type: "GALLERY_UPDATED",
      action: "ALBUM_DELETED",
      albumId,
      timestamp: Date.now()
    });
    return res.json({ success: true, message: "Album deleted successfully" });
  } catch (err) {
    console.error("Failed to delete gallery album:", err);
    return res.status(500).json({ error: err.message || "Failed to delete album" });
  }
};
app.delete("/api/gallery/albums/:id", rateLimitGuard(40, 6e4), requireAuth, handleGalleryAlbumDelete);
app.post("/api/gallery/albums/:id/delete", rateLimitGuard(40, 6e4), requireAuth, handleGalleryAlbumDelete);
var handleGalleryPhotoDelete = async (req, res) => {
  try {
    const photoId = String(req.params.id || "").trim();
    if (!photoId) {
      return res.status(400).json({ error: "Photo ID is required." });
    }
    const bodyAlbumId = req.body?.albumId || req.query?.albumId;
    let targetAlbumId = bodyAlbumId ? Number(bodyAlbumId) : null;
    const requesterUserId = Number(req.dbUser?.id || 0);
    const requesterIsAdmin = req.dbUser?.role === "admin" || req.dbUser?.role === "super_admin" || req.dbUser?.role === "moderator";
    if (isSupabaseServerConfigured) {
      const writeCtx = getSupabaseWriteClient(extractBearerToken2(req));
      const dbClient = writeCtx?.client || supabaseServer;
      const { data: photo } = await supabaseServer.from("gallery_photos").select("id, album_id, uploader_id").eq("id", photoId).maybeSingle();
      if (photo) {
        let isOwner = requesterUserId > 0 && Number(photo.uploader_id) === requesterUserId;
        if (!isOwner && photo.album_id) {
          const { data: parentAlbum } = await supabaseServer.from("gallery_albums").select("id, created_by_id").eq("id", photo.album_id).maybeSingle();
          if (parentAlbum && Number(parentAlbum.created_by_id) === requesterUserId) {
            isOwner = true;
          }
        }
        if (!requesterIsAdmin && !isOwner) {
          return res.status(403).json({
            error: "Access denied: You can only delete your own photos, or an administrator can delete any photo."
          });
        }
        const { error: delErr } = await dbClient.from("gallery_photos").delete().eq("id", photoId);
        if (delErr) {
          return res.status(500).json({
            error: delErr.message || "Failed to delete photo from Supabase."
          });
        }
        targetAlbumId = Number(photo.album_id) || targetAlbumId;
        if (targetAlbumId) {
          try {
            const { count } = await dbClient.from("gallery_photos").select("id", { count: "exact", head: true }).eq("album_id", targetAlbumId);
            const remainingCount = typeof count === "number" ? count : 0;
            await dbClient.from("gallery_albums").update({ photos_count: remainingCount, photo_count: remainingCount }).eq("id", targetAlbumId);
          } catch {
          }
        }
      }
    }
    memoryGalleryPhotoLikes.delete(photoId);
    memoryGalleryLikeCounts.delete(photoId);
    for (const alb of memoryGalleryAlbums) {
      if (Array.isArray(alb.photos)) {
        const pIdx = alb.photos.findIndex((p) => String(p.id) === photoId);
        if (pIdx >= 0) {
          alb.photos.splice(pIdx, 1);
          alb.photosCount = alb.photos.length;
          break;
        }
      }
    }
    broadcastFeedEvent({
      type: "GALLERY_UPDATED",
      action: "PHOTO_DELETED",
      albumId: targetAlbumId,
      photoId,
      timestamp: Date.now()
    });
    return res.json({ success: true, message: "Photo deleted successfully" });
  } catch (err) {
    console.error("Failed to delete photo:", err);
    return res.status(500).json({ error: err.message || "Failed to delete photo" });
  }
};
app.delete("/api/gallery/photos/:id", rateLimitGuard(60, 6e4), requireAuth, handleGalleryPhotoDelete);
app.post("/api/gallery/photos/:id/delete", rateLimitGuard(60, 6e4), requireAuth, handleGalleryPhotoDelete);
var memoryBloodRequests = [];
var memoryBloodDonors = [];
app.get("/api/blood/requests", rateLimitGuard(60, 6e4), async (_req, res) => {
  try {
    if (isSupabaseServerConfigured) {
      try {
        const { data: rows, error } = await supabaseServer.from("blood_requests").select(`
            *,
            requester:alumni_profiles!blood_requests_requester_id_fkey(id, full_name, avatar_url, batch_year, phone),
            blood_request_responses(id, donor_id, status, response_note, created_at, donor:blood_donors(user_id, blood_group))
          `).order("created_at", { ascending: false });
        if (!error && rows && rows.length > 0) {
          const mapped = rows.map((r) => ({
            id: String(r.id),
            bloodGroup: r.blood_group,
            unitsRequired: r.units_required || r.units_needed || 1,
            unitsFulfilled: r.units_fulfilled || 0,
            hospitalName: r.hospital_name || r.hospital || "SZMC Hospital Bogura",
            hospitalArea: r.hospital_area || r.hospital_address || "Silimpur",
            city: r.city || r.district || "Bogura",
            requiredDateTime: r.required_datetime || r.required_date || (/* @__PURE__ */ new Date()).toISOString(),
            emergencyLevel: (r.emergency_level || r.urgency || "urgent").toLowerCase(),
            contactMethod: r.contact_method || "Portal Secure Coordination",
            contactPhone: r.coordination_ref || r.contact_number || r.requester?.phone || "",
            description: r.description || r.medical_reason || "Urgent requirement for patient care at SZMCH.",
            patientRelation: r.patient_relation || "Alumnus Relative",
            requesterId: r.requester_id,
            requesterName: r.requester?.full_name || r.patient_name || "SZMC Doctor",
            requesterAvatar: r.requester?.avatar_url || "/assets/aistudio/images__1__2778177d.png",
            requesterBatch: r.requester?.batch_year || 20,
            status: r.status || "Active",
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            responses: (r.blood_request_responses || []).map((resp) => ({
              id: String(resp.id),
              requestId: String(r.id),
              donorUserId: resp.donor_id || resp.donor?.user_id || 0,
              donorName: "Registered Doctor Donor",
              donorAvatar: "/assets/aistudio/images__1__2778177d.png",
              donorBatchYear: 20,
              donorBloodGroup: resp.donor?.blood_group || r.blood_group,
              donorPreferredArea: r.hospital_area || "Bogura",
              respondedAt: resp.created_at,
              status: resp.status || "offered",
              note: resp.response_note || ""
            }))
          }));
          return res.json({ requests: mapped });
        }
      } catch (err) {
        console.warn("Supabase fetch blood requests notice:", err);
      }
    }
    return res.json({ requests: memoryBloodRequests });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to fetch blood requests" });
  }
});
app.post("/api/blood/requests", rateLimitGuard(30, 6e4), requireAuth, async (req, res) => {
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
      patientRelation
    } = req.body;
    const requesterId = Number(req.dbUser?.id || 1);
    let insertedId = null;
    if (isSupabaseServerConfigured) {
      try {
        const payload = {
          requester_id: requesterId,
          blood_group: bloodGroup,
          units_required: Number(unitsRequired) || 1,
          units_needed: Number(unitsRequired) || 1,
          hospital_name: hospitalName || "SZMC Hospital",
          hospital: hospitalName || "SZMC Hospital",
          hospital_area: hospitalArea || "Silimpur",
          hospital_address: hospitalArea || "Silimpur",
          city: city || "Bogura",
          district: city || "Bogura",
          required_datetime: requiredDateTime ? new Date(requiredDateTime).toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
          required_date: requiredDateTime ? new Date(requiredDateTime).toISOString().split("T")[0] : (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
          emergency_level: (emergencyLevel || "urgent").toLowerCase(),
          urgency: (emergencyLevel || "urgent").toLowerCase(),
          contact_method: contactMethod || "Portal Secure Coordination",
          contact_number: contactPhone || "Through Portal",
          coordination_ref: contactPhone || "Through Portal",
          description: description || "Urgent blood requirement for clinical patient care.",
          medical_reason: description || "Urgent blood requirement.",
          patient_name: patientRelation || "Patient",
          patient_relation: patientRelation || "Relative",
          status: "Active"
        };
        const { data, error } = await supabaseServer.from("blood_requests").insert(payload).select("id").single();
        if (!error && data?.id) {
          insertedId = String(data.id);
        }
      } catch (err) {
        console.warn("Supabase insert blood request notice:", err);
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
      city: city || "Bogura",
      requiredDateTime: requiredDateTime || (/* @__PURE__ */ new Date()).toISOString(),
      emergencyLevel: emergencyLevel || "urgent",
      contactMethod: contactMethod || "Portal Secure Coordination",
      contactPhone: contactPhone || "",
      description: description || "",
      patientRelation: patientRelation || "Relative",
      requesterId: Number(requesterId) || 1,
      requesterName: req.body.requesterName || "SZMC Doctor",
      requesterAvatar: req.body.requesterAvatar || "/assets/aistudio/images__1__2778177d.png",
      requesterBatch: Number(req.body.requesterBatch) || 20,
      status: "Active",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      responses: []
    };
    memoryBloodRequests.unshift(newReq);
    broadcastFeedEvent({
      type: "BLOOD_UPDATED",
      table: "blood_requests",
      eventType: "INSERT",
      record: newReq,
      timestamp: Date.now()
    });
    return res.status(201).json({ success: true, request: newReq });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to create blood request" });
  }
});
app.post("/api/blood/donors", rateLimitGuard(30, 6e4), requireAuth, async (req, res) => {
  try {
    const { bloodGroup, isRegisteredDonor, availability, preferredArea, city, lastDonationDate, emergencyAlertPreference } = req.body;
    const donorUserId = Number(req.dbUser?.id || 1);
    if (isSupabaseServerConfigured) {
      try {
        const payload = {
          user_id: donorUserId,
          profile_id: donorUserId,
          blood_group: bloodGroup,
          is_registered_donor: Boolean(isRegisteredDonor),
          availability: availability || "available",
          preferred_area: preferredArea || "Bogura",
          city: city || "Bogura",
          last_donation_date: lastDonationDate || null,
          emergency_alert_preference: emergencyAlertPreference || "all_urgent",
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        };
        await supabaseServer.from("blood_donors").upsert(payload);
        await supabaseServer.from("alumni_profiles").update({
          blood_group: bloodGroup,
          is_registered_donor: Boolean(isRegisteredDonor)
        }).eq("id", donorUserId);
      } catch (err) {
        console.warn("Supabase upsert blood donor notice:", err);
      }
    }
    const donorObj = {
      userId: donorUserId,
      bloodGroup,
      isRegisteredDonor: Boolean(isRegisteredDonor),
      availability: availability || "available",
      preferredArea: preferredArea || "Bogura",
      city: city || "Bogura",
      lastDonationDate,
      emergencyAlertPreference: emergencyAlertPreference || "all_urgent",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const exIdx = memoryBloodDonors.findIndex((d) => d.userId === donorUserId);
    if (exIdx >= 0) memoryBloodDonors[exIdx] = donorObj;
    else memoryBloodDonors.push(donorObj);
    return res.json({ success: true, donor: donorObj });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to register blood donor" });
  }
});
var memoryMentorshipRequests = [];
var memoryMentorOffers = [];
app.get("/api/mentorship/requests", rateLimitGuard(60, 6e4), async (_req, res) => {
  try {
    if (isSupabaseServerConfigured) {
      try {
        const { data: rows, error } = await supabaseServer.from("mentorship_requests").select("*").order("created_at", { ascending: false });
        if (!error && rows && rows.length > 0) {
          const mapped = rows.map((r) => ({
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
            createdAt: r.created_at
          }));
          return res.json({ requests: mapped });
        }
      } catch (err) {
        console.warn("Supabase fetch mentorship requests notice:", err);
      }
    }
    return res.json({ requests: memoryMentorshipRequests });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to fetch mentorship requests" });
  }
});
app.post("/api/mentorship/requests", rateLimitGuard(30, 6e4), requireAuth, async (req, res) => {
  try {
    const { id, userName, userBatch, userAvatar, topic, question, contactInfo, targetMentorId, targetMentorName } = req.body;
    const userId = Number(req.dbUser?.id || 0);
    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Question text is required" });
    }
    const reqId = id || `req-${Date.now()}`;
    const newReq = {
      id: reqId,
      user_id: Number(userId) || null,
      user_name: userName || "SZMC Doctor",
      user_batch: Number(userBatch) || null,
      user_avatar: userAvatar || "/assets/aistudio/images__1__2778177d.png",
      topic: topic || "Medical",
      question: question.trim(),
      contact_info: contactInfo || null,
      target_mentor_id: targetMentorId ? Number(targetMentorId) : null,
      target_mentor_name: targetMentorName || null,
      status: "open",
      answers: [],
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (isSupabaseServerConfigured) {
      try {
        await supabaseServer.from("mentorship_requests").insert(newReq);
      } catch (err) {
        console.warn("Supabase insert mentorship request notice:", err);
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
      targetMentorName: newReq.target_mentor_name
    });
    return res.status(201).json({ success: true, request: newReq });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to create mentorship request" });
  }
});
app.post("/api/mentorship/requests/:id/answers", rateLimitGuard(30, 6e4), requireAuth, async (req, res) => {
  try {
    const reqId = req.params.id;
    const { mentorName, mentorBatch, mentorAvatar, mentorProfession, answerText } = req.body;
    const mentorId = Number(req.dbUser?.id || 1);
    if (!answerText || !answerText.trim()) {
      return res.status(400).json({ error: "Answer text is required" });
    }
    const newAns = {
      id: `ans-${Date.now()}`,
      mentorId: Number(mentorId) || 1,
      mentorName: mentorName || "SZMC Mentor",
      mentorBatch: Number(mentorBatch) || null,
      mentorAvatar: mentorAvatar || "/assets/aistudio/images__1__2778177d.png",
      mentorProfession: mentorProfession || "Consultant Physician",
      answerText: answerText.trim(),
      createdAt: "Just now"
    };
    if (isSupabaseServerConfigured) {
      try {
        const { data: current } = await supabaseServer.from("mentorship_requests").select("answers").eq("id", reqId).maybeSingle();
        const currentAnswers = Array.isArray(current?.answers) ? current.answers : [];
        const updatedAnswers = [...currentAnswers, newAns];
        await supabaseServer.from("mentorship_requests").update({ answers: updatedAnswers, status: "answered", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", reqId);
      } catch (err) {
        console.warn("Supabase add mentorship answer notice:", err);
      }
    }
    const memReq = memoryMentorshipRequests.find((r) => r.id === reqId);
    if (memReq) {
      if (!Array.isArray(memReq.answers)) memReq.answers = [];
      memReq.answers.push(newAns);
      memReq.status = "answered";
    }
    return res.status(201).json({ success: true, answer: newAns });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to add answer" });
  }
});
app.get("/api/mentorship/mentors", rateLimitGuard(60, 6e4), async (_req, res) => {
  try {
    if (isSupabaseServerConfigured) {
      try {
        const { data: rows, error } = await supabaseServer.from("mentor_offers").select("*").order("created_at", { ascending: false });
        if (!error && rows && rows.length > 0) {
          const mapped = rows.map((m) => ({
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
            createdAt: m.created_at
          }));
          return res.json({ mentors: mapped });
        }
      } catch (err) {
        console.warn("Supabase fetch mentors notice:", err);
      }
    }
    return res.json({ mentors: memoryMentorOffers });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to fetch mentors" });
  }
});
app.post("/api/mentorship/mentors", rateLimitGuard(30, 6e4), requireAuth, async (req, res) => {
  try {
    const { id, fullName, batchYear, avatarUrl, category, expertise, shortDescription, institution, position, contactPreference } = req.body;
    const userId = Number(req.dbUser?.id || 0);
    if (!fullName || !expertise) {
      return res.status(400).json({ error: "Full name and expertise are required" });
    }
    const mentorId = id || `mentor-${Date.now()}`;
    const payload = {
      id: mentorId,
      user_id: Number(userId) || null,
      full_name: fullName.trim(),
      batch_year: Number(batchYear) || null,
      avatar_url: avatarUrl || "/assets/aistudio/images__1__2778177d.png",
      category: category || "Medical",
      expertise: expertise.trim(),
      short_description: shortDescription || "",
      institution: institution || "SZMC Hospital",
      position: position || "Doctor",
      contact_preference: contactPreference || "WhatsApp",
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (isSupabaseServerConfigured) {
      try {
        await supabaseServer.from("mentor_offers").upsert(payload);
      } catch (err) {
        console.warn("Supabase register mentor notice:", err);
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
      createdAt: payload.created_at
    };
    const exIdx = memoryMentorOffers.findIndex((m) => m.fullName.toLowerCase() === mentorObj.fullName.toLowerCase());
    if (exIdx >= 0) memoryMentorOffers[exIdx] = mentorObj;
    else memoryMentorOffers.unshift(mentorObj);
    return res.status(201).json({ success: true, mentor: mentorObj });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to register mentor" });
  }
});
var memoryCareerOpportunities = [];
app.get("/api/careers", rateLimitGuard(60, 6e4), async (_req, res) => {
  try {
    if (isSupabaseServerConfigured) {
      try {
        const { data: rows, error } = await supabaseServer.from("career_opportunities").select("*").order("created_at", { ascending: false });
        if (!error && rows && rows.length > 0) {
          const mapped = rows.map((c) => ({
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
            createdAt: c.created_at
          }));
          return res.json({ opportunities: mapped });
        }
      } catch (err) {
        console.warn("Supabase fetch careers notice:", err);
      }
    }
    return res.json({ opportunities: memoryCareerOpportunities });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to fetch career opportunities" });
  }
});
app.post("/api/careers", rateLimitGuard(30, 6e4), requireAuth, async (req, res) => {
  try {
    const { id, title, company, location, type, description, posterName, posterBatch, posterAvatar, posterEmail } = req.body;
    const posterId = Number(req.dbUser?.id || 0);
    if (!title || !company) {
      return res.status(400).json({ error: "Title and company/institution are required" });
    }
    const oppId = id || `opp-${Date.now()}`;
    const payload = {
      id: oppId,
      title: title.trim(),
      company: company.trim(),
      location: location || "Bogura / Hybrid",
      type: type || "job",
      description: description || "",
      poster_id: Number(posterId) || null,
      poster_name: posterName || "SZMC Doctor",
      poster_batch: posterBatch || "Alumnus",
      poster_avatar: posterAvatar || "/assets/aistudio/images__1__2778177d.png",
      poster_email: posterEmail || null,
      status: "active",
      applicants: [],
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (isSupabaseServerConfigured) {
      try {
        await supabaseServer.from("career_opportunities").insert(payload);
      } catch (err) {
        console.warn("Supabase insert career notice:", err);
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
      createdAt: payload.created_at
    };
    memoryCareerOpportunities.unshift(oppObj);
    return res.status(201).json({ success: true, opportunity: oppObj });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to create career opportunity" });
  }
});
app.post("/api/careers/:id/apply", rateLimitGuard(30, 6e4), requireAuth, async (req, res) => {
  try {
    const oppId = req.params.id;
    const { applicantName, applicantBatch, applicantAvatar, applicantEmail, applicantPhone } = req.body;
    const applicantId = Number(req.dbUser?.id || 1);
    const newApp = {
      id: `app-${Date.now()}`,
      applicantId,
      applicantName: applicantName || req.dbUser?.fullName || "SZMC Applicant",
      applicantBatch: applicantBatch || "",
      applicantAvatar: applicantAvatar || "/assets/aistudio/images__1__2778177d.png",
      applicantEmail: applicantEmail || req.dbUser?.email || "",
      applicantPhone: applicantPhone || "",
      appliedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    let updatedApplicants = [newApp];
    if (isSupabaseServerConfigured) {
      try {
        const { data: current } = await supabaseServer.from("career_opportunities").select("applicants").eq("id", oppId).maybeSingle();
        const existing = Array.isArray(current?.applicants) ? current.applicants : [];
        updatedApplicants = [newApp, ...existing];
        await supabaseServer.from("career_opportunities").update({ applicants: updatedApplicants, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", oppId);
      } catch (err) {
        console.warn("Supabase apply career notice:", err);
      }
    }
    const memOpp = memoryCareerOpportunities.find((o) => o.id === oppId);
    if (memOpp) {
      if (!Array.isArray(memOpp.applicants)) memOpp.applicants = [];
      memOpp.applicants.unshift(newApp);
    }
    return res.status(201).json({ success: true, application: newApp });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to apply for opportunity" });
  }
});
app.delete("/api/careers/:id", rateLimitGuard(30, 6e4), requireAuth, async (req, res) => {
  try {
    const oppId = req.params.id;
    const requesterId = Number(req.dbUser?.id || 0);
    const isAdminActor = req.dbUser?.role === "admin" || req.dbUser?.role === "super_admin" || req.dbUser?.role === "moderator";
    if (isSupabaseServerConfigured) {
      try {
        const { data: opp } = await supabaseServer.from("career_opportunities").select("id, poster_id").eq("id", oppId).maybeSingle();
        if (opp && !isAdminActor && Number(opp.poster_id) !== requesterId) {
          return res.status(403).json({ error: "Forbidden: Only the poster or an administrator can delete this opportunity." });
        }
        await supabaseServer.from("career_opportunities").delete().eq("id", oppId);
      } catch (err) {
        console.warn("Supabase delete career notice:", err);
      }
    }
    const idx = memoryCareerOpportunities.findIndex((o) => o.id === oppId);
    if (idx >= 0) {
      if (!isAdminActor && Number(memoryCareerOpportunities[idx].posterId) !== requesterId) {
        return res.status(403).json({ error: "Forbidden: Only the poster or an administrator can delete this opportunity." });
      }
      memoryCareerOpportunities.splice(idx, 1);
    }
    return res.json({ success: true, message: "Career opportunity deleted successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to delete opportunity" });
  }
});
var memoryFeatureFlags = /* @__PURE__ */ new Map([
  ["the_quad_enabled", { key: "the_quad_enabled", enabled: true, description: "Master toggle for THE QUAD Hybrid Community System", config: { version: 1 }, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }],
  ["batch_lounges_enabled", { key: "batch_lounges_enabled", enabled: true, description: "Dedicated Batch Lounges across all 35 SZMC batches", config: { total_batches: 35 }, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }],
  ["official_pages_enabled", { key: "official_pages_enabled", enabled: true, description: "Institutional Official Pages inside THE QUAD", config: { official_pages: 6 }, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }],
  ["community_polls_enabled", { key: "community_polls_enabled", enabled: true, description: "Interactive polls inside community posts", config: {}, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }],
  ["content_moderation_queue_enabled", { key: "content_moderation_queue_enabled", enabled: true, description: "User reporting, blocking, and moderator review queue", config: {}, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }]
]);
var FEATURE_FLAG_KEY_REGEX = /^[a-z0-9_]{2,64}$/;
app.get("/api/feature-flags", rateLimitGuard(120, 6e4), async (_req, res) => {
  try {
    if (isSupabaseServerConfigured) {
      try {
        const { data, error } = await supabaseServer.from(SUPABASE_TABLES.APP_FEATURE_FLAGS).select("key, enabled, description, config, updated_at").order("key", { ascending: true });
        if (!error && Array.isArray(data) && data.length > 0) {
          const flags = data.map((row) => ({
            key: String(row.key),
            enabled: Boolean(row.enabled),
            description: row.description ?? null,
            config: row.config && typeof row.config === "object" ? row.config : {},
            updatedAt: row.updated_at || (/* @__PURE__ */ new Date()).toISOString()
          }));
          return res.json({ flags });
        }
      } catch (err) {
        console.warn("Supabase fetch feature flags notice:", err);
      }
    }
    return res.json({ flags: Array.from(memoryFeatureFlags.values()) });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load feature flags" });
  }
});
app.put(
  "/api/admin/feature-flags/:key",
  rateLimitGuard(30, 6e4),
  requireAdmin,
  async (req, res) => {
    try {
      const cleanKey = String(req.params.key || "").trim().toLowerCase();
      if (!FEATURE_FLAG_KEY_REGEX.test(cleanKey)) {
        return res.status(400).json({ error: "Invalid feature flag key format (use 2-64 lowercase letters, digits, or underscores)." });
      }
      if (typeof req.body?.enabled !== "boolean") {
        return res.status(400).json({ error: 'Field "enabled" must be a boolean.' });
      }
      const description = typeof req.body.description === "string" ? req.body.description.trim().slice(0, 280) : memoryFeatureFlags.get(cleanKey)?.description ?? null;
      const config3 = req.body.config && typeof req.body.config === "object" && !Array.isArray(req.body.config) ? req.body.config : memoryFeatureFlags.get(cleanKey)?.config ?? {};
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      if (isSupabaseServerConfigured) {
        const { error } = await supabaseServer.from(SUPABASE_TABLES.APP_FEATURE_FLAGS).upsert(
          {
            key: cleanKey,
            enabled: req.body.enabled,
            description,
            config: config3,
            updated_by: req.dbUser?.id || null,
            updated_at: nowIso
          },
          { onConflict: "key" }
        );
        if (error) {
          console.warn("Supabase upsert feature flag notice:", error.message);
        }
      }
      const flag = {
        key: cleanKey,
        enabled: req.body.enabled,
        description,
        config: config3,
        updatedAt: nowIso
      };
      memoryFeatureFlags.set(cleanKey, flag);
      return res.json({ success: true, flag });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Failed to update feature flag" });
    }
  }
);
var memoryFeedRankingWeights = {
  batchRelevanceWeight: 28,
  followedAlumniWeight: 20,
  followedPageWeight: 22,
  engagementLikeWeight: 1.5,
  engagementCommentWeight: 3,
  engagementCap: 42,
  recencyMaxBoost: 48,
  recencyDecayPerHour: 0.5,
  featuredBoost: 18,
  updatedAt: (/* @__PURE__ */ new Date()).toISOString()
};
app.get("/api/feed/ranking-weights", rateLimitGuard(120, 6e4), async (_req, res) => {
  try {
    if (isSupabaseServerConfigured) {
      try {
        const { data, error } = await supabaseServer.from(SUPABASE_TABLES.FEED_RANKING_WEIGHTS).select("*").eq("id", 1).maybeSingle();
        if (!error && data) {
          return res.json({
            weights: {
              batchRelevanceWeight: Number(data.batch_relevance_weight ?? 28),
              followedAlumniWeight: Number(data.followed_alumni_weight ?? 20),
              followedPageWeight: Number(data.followed_page_weight ?? 22),
              engagementLikeWeight: Number(data.engagement_like_weight ?? 1.5),
              engagementCommentWeight: Number(data.engagement_comment_weight ?? 3),
              engagementCap: Number(data.engagement_cap ?? 42),
              recencyMaxBoost: Number(data.recency_max_boost ?? 48),
              recencyDecayPerHour: Number(data.recency_decay_per_hour ?? 0.5),
              featuredBoost: Number(data.featured_boost ?? 18),
              updatedAt: data.updated_at || (/* @__PURE__ */ new Date()).toISOString()
            }
          });
        }
      } catch (err) {
        console.warn("Supabase fetch feed ranking weights notice:", err);
      }
    }
    return res.json({ weights: memoryFeedRankingWeights });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load feed ranking weights" });
  }
});
app.put(
  "/api/admin/feed/ranking-weights",
  rateLimitGuard(30, 6e4),
  requireAdmin,
  async (req, res) => {
    try {
      const clampNum = (val, min, max, fallback) => {
        const n = Number(val);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, Math.round(n * 1e3) / 1e3));
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
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (isSupabaseServerConfigured) {
        const { error } = await supabaseServer.from(SUPABASE_TABLES.FEED_RANKING_WEIGHTS).upsert(
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
            updated_at: next.updatedAt
          },
          { onConflict: "id" }
        );
        if (error) {
          console.warn("Supabase upsert feed ranking weights notice:", error.message);
        }
      }
      Object.assign(memoryFeedRankingWeights, next);
      return res.json({ success: true, weights: next });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Failed to update ranking weights" });
    }
  }
);
var memoryContentReports = [];
var VALID_REPORT_TARGET_TYPES = /* @__PURE__ */ new Set(["post", "comment", "profile"]);
var VALID_REPORT_STATUSES = /* @__PURE__ */ new Set(["open", "in_review", "resolved_removed", "resolved_dismissed"]);
app.post(
  "/api/community/reports",
  rateLimitGuard(20, 6e4),
  requireAuth,
  async (req, res) => {
    try {
      const reporterId = Number(req.dbUser?.id || 0);
      if (!reporterId) {
        return res.status(401).json({ error: "Authenticated alumni profile required to submit a report." });
      }
      const targetType = String(req.body?.targetType || "").trim().toLowerCase();
      const targetId = Number(req.body?.targetId);
      const targetAuthorId = req.body?.targetAuthorId ? Number(req.body.targetAuthorId) : null;
      const reason = String(req.body?.reason || "").trim().slice(0, 140);
      const details = typeof req.body?.details === "string" ? req.body.details.trim().slice(0, 1e3) : null;
      if (!VALID_REPORT_TARGET_TYPES.has(targetType)) {
        return res.status(400).json({ error: "Invalid report target type." });
      }
      if (!Number.isInteger(targetId) || targetId <= 0) {
        return res.status(400).json({ error: "Invalid report target ID." });
      }
      if (!reason || reason.length < 3) {
        return res.status(400).json({ error: "Please select a valid report reason." });
      }
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      if (isSupabaseServerConfigured) {
        const { data, error } = await supabaseServer.from(SUPABASE_TABLES.CONTENT_REPORTS).insert({
          reporter_id: reporterId,
          target_type: targetType,
          target_id: targetId,
          target_author_id: targetAuthorId && targetAuthorId > 0 ? targetAuthorId : null,
          reason,
          details: details || null,
          status: "open"
        }).select("*").single();
        if (!error && data) {
          return res.status(201).json({ success: true, report: data, source: "supabase" });
        }
        if (error && (error.code === "23505" || String(error.message || "").includes("uq_content_reports_open"))) {
          return res.status(200).json({
            success: true,
            duplicate: true,
            message: "You already have an open report for this item.",
            source: "supabase"
          });
        }
      }
      const existing = memoryContentReports.find(
        (r) => r.reporter_id === reporterId && r.target_type === targetType && r.target_id === targetId && r.status === "open"
      );
      if (existing) {
        return res.status(200).json({
          success: true,
          duplicate: true,
          report: existing,
          source: "memory"
        });
      }
      const fallbackReport = {
        id: Date.now(),
        reporter_id: reporterId,
        target_type: targetType,
        target_id: targetId,
        target_author_id: targetAuthorId && targetAuthorId > 0 ? targetAuthorId : null,
        reason,
        details: details || null,
        status: "open",
        reviewed_by: null,
        resolution_note: null,
        created_at: nowIso,
        reviewed_at: null
      };
      memoryContentReports.unshift(fallbackReport);
      return res.status(201).json({ success: true, report: fallbackReport, source: "memory" });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Failed to submit content report" });
    }
  }
);
app.get(
  "/api/admin/moderation/reports",
  rateLimitGuard(60, 6e4),
  requireModerator,
  async (req, res) => {
    try {
      const statusFilter = String(req.query.status || "all").trim().toLowerCase();
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
      if (isSupabaseServerConfigured) {
        let query = supabaseServer.from(SUPABASE_TABLES.CONTENT_REPORTS).select("*").order("created_at", { ascending: false }).limit(limit);
        if (statusFilter !== "all" && VALID_REPORT_STATUSES.has(statusFilter)) {
          query = query.eq("status", statusFilter);
        }
        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          const profileIds = Array.from(
            new Set(
              data.flatMap((r) => [r.reporter_id, r.target_author_id, r.reviewed_by]).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
            )
          );
          const profileMap = /* @__PURE__ */ new Map();
          if (profileIds.length > 0) {
            const { data: profiles } = await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("id, full_name, batch_year, avatar_url").in("id", profileIds);
            (profiles || []).forEach(
              (p) => profileMap.set(Number(p.id), {
                full_name: p.full_name || "SZMC Alumnus",
                batch_year: p.batch_year ? Number(p.batch_year) : null,
                avatar_url: p.avatar_url || null
              })
            );
          }
          const enriched = data.map((r) => ({
            ...r,
            reporter: profileMap.get(Number(r.reporter_id)) || null,
            target_author: r.target_author_id ? profileMap.get(Number(r.target_author_id)) || null : null,
            reviewer: r.reviewed_by ? profileMap.get(Number(r.reviewed_by)) || null : null
          }));
          return res.json({ reports: enriched, source: "supabase" });
        }
      }
      const filtered = statusFilter !== "all" && VALID_REPORT_STATUSES.has(statusFilter) ? memoryContentReports.filter((r) => r.status === statusFilter) : memoryContentReports;
      return res.json({ reports: filtered.slice(0, limit), source: "memory" });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Failed to fetch moderation reports" });
    }
  }
);
app.put(
  "/api/admin/moderation/reports/:id",
  rateLimitGuard(30, 6e4),
  requireModerator,
  async (req, res) => {
    try {
      const reportId = Number(req.params.id);
      if (!Number.isInteger(reportId) || reportId <= 0) {
        return res.status(400).json({ error: "Invalid report ID." });
      }
      const nextStatus = String(req.body?.status || "").trim().toLowerCase();
      if (!VALID_REPORT_STATUSES.has(nextStatus) || nextStatus === "open") {
        return res.status(400).json({
          error: "Status must be one of: in_review, resolved_removed, resolved_dismissed."
        });
      }
      const resolutionNote = typeof req.body?.resolutionNote === "string" ? req.body.resolutionNote.trim().slice(0, 600) : null;
      const removeContent = Boolean(req.body?.removeContent) || nextStatus === "resolved_removed";
      const reviewerId = Number(req.dbUser?.id || 0) || null;
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      if (isSupabaseServerConfigured) {
        const { data: updated, error } = await supabaseServer.from(SUPABASE_TABLES.CONTENT_REPORTS).update({
          status: nextStatus,
          reviewed_by: reviewerId,
          resolution_note: resolutionNote,
          reviewed_at: nowIso
        }).eq("id", reportId).select("*").maybeSingle();
        if (!error && updated) {
          if (removeContent) {
            if (updated.target_type === "post") {
              await supabaseServer.from(SUPABASE_TABLES.POSTS).update({ is_deleted: true }).eq("id", updated.target_id);
            } else if (updated.target_type === "comment") {
              await supabaseServer.from(SUPABASE_TABLES.POST_COMMENTS).update({ is_deleted: true }).eq("id", updated.target_id);
            }
          }
          if (updated.reporter_id && updated.reporter_id !== reviewerId && nextStatus.startsWith("resolved_")) {
            try {
              await supabaseServer.from(SUPABASE_TABLES.NOTIFICATIONS).insert({
                recipient_id: updated.reporter_id,
                actor_id: reviewerId,
                type: "moderation_action",
                title: "Report Reviewed",
                message: nextStatus === "resolved_removed" ? "Thank you for helping keep The Quad safe. Our moderation team reviewed your report and took action." : "Our moderation team reviewed your report and closed it after review.",
                target_route: "feed",
                unread: true
              });
            } catch {
            }
          }
          return res.json({ success: true, report: updated, contentRemoved: removeContent, source: "supabase" });
        }
      }
      const idx = memoryContentReports.findIndex((r) => r.id === reportId);
      if (idx === -1) {
        return res.status(404).json({ error: "Report not found." });
      }
      memoryContentReports[idx] = {
        ...memoryContentReports[idx],
        status: nextStatus,
        reviewed_by: reviewerId,
        resolution_note: resolutionNote,
        reviewed_at: nowIso
      };
      return res.json({
        success: true,
        report: memoryContentReports[idx],
        contentRemoved: removeContent,
        source: "memory"
      });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Failed to update moderation report" });
    }
  }
);
var memoryBatchModerators = [];
var memoryOfficialPageRoles = [];
var memoryOfficialPages = [
  { id: 1, slug: "szmc-official", name: "SZMC Official", tagline: "Shaheed Ziaur Rahman Medical College Institutional Desk", description: "Official institutional announcements, academic milestones, and campus updates from SZMC Bogura.", category: "Announcement", is_verified: true, is_active: true, followers_count: 0, posts_count: 0 },
  { id: 2, slug: "alumni-association", name: "Alumni Association", tagline: "SZMC Alumni Association Secretariat", description: "Official updates, annual general meetings, membership initiatives, and global alumni news.", category: "Announcement", is_verified: true, is_active: true, followers_count: 0, posts_count: 0 },
  { id: 3, slug: "executive-committee", name: "Executive Committee", tagline: "Governance & Elected Leadership Updates", description: "Resolutions, policy briefings, and executive committee notices for all MBBS batches.", category: "Announcement", is_verified: true, is_active: true, followers_count: 0, posts_count: 0 },
  { id: 4, slug: "blood-donation-network", name: "Blood Donation Network", tagline: "Emergency Blood Lifeline & Donor Coordination", description: "Urgent blood donor mobilization, verified emergency requests, and donor drives.", category: "Blood Request", is_verified: true, is_active: true, followers_count: 0, posts_count: 0 },
  { id: 5, slug: "career-mentorship", name: "Career & Mentorship", tagline: "Residency, Fellowship & Clinical Career Guidance", description: "FCPS, MD/MS, USMLE, PLAB/MRCP mentorship, medical fellowships, and clinical job opportunities.", category: "Career & Jobs", is_verified: true, is_active: true, followers_count: 0, posts_count: 0 },
  { id: 6, slug: "alumni-events", name: "Alumni Events", tagline: "Reunions, Scientific Seminars & Batch Gatherings", description: "Official reunion calendars, Silver Jubilee celebrations, CME conferences, and chapter meetups.", category: "Events & Reunion", is_verified: true, is_active: true, followers_count: 0, posts_count: 0 }
];
app.get(
  "/api/admin/community/overview",
  rateLimitGuard(60, 6e4),
  requireModerator,
  async (_req, res) => {
    try {
      let openReportsCount = memoryContentReports.filter((r) => r.status === "open" || r.status === "in_review").length;
      let totalReportsCount = memoryContentReports.length;
      let batchModerators = [...memoryBatchModerators];
      let officialPages = memoryOfficialPages.map((p) => ({
        ...p,
        roles: memoryOfficialPageRoles.filter((r) => r.page_id === p.id)
      }));
      let featureFlags = Array.from(memoryFeatureFlags.values());
      let rankingWeights = { ...memoryFeedRankingWeights };
      if (isSupabaseServerConfigured) {
        const [reportsRes, batchModsRes, pagesRes, pageRolesRes, flagsRes, weightsRes] = await Promise.all([
          supabaseServer.from(SUPABASE_TABLES.CONTENT_REPORTS).select("id, status"),
          supabaseServer.from(SUPABASE_TABLES.BATCH_LOUNGE_MODERATORS).select("id, batch_year, profile_id, role, created_at").order("batch_year", { ascending: true }),
          supabaseServer.from(SUPABASE_TABLES.OFFICIAL_PAGES).select("id, slug, name, tagline, description, category, is_verified, is_active, followers_count, posts_count").order("id", { ascending: true }),
          supabaseServer.from(SUPABASE_TABLES.OFFICIAL_PAGE_ROLES).select("id, page_id, profile_id, role, created_at").order("created_at", { ascending: false }),
          supabaseServer.from(SUPABASE_TABLES.APP_FEATURE_FLAGS).select("*").order("key", { ascending: true }),
          supabaseServer.from(SUPABASE_TABLES.FEED_RANKING_WEIGHTS).select("*").eq("id", 1).maybeSingle()
        ]);
        if (!reportsRes.error && Array.isArray(reportsRes.data)) {
          totalReportsCount = reportsRes.data.length;
          openReportsCount = reportsRes.data.filter(
            (r) => r.status === "open" || r.status === "in_review"
          ).length;
        }
        const profileIds = /* @__PURE__ */ new Set();
        if (!batchModsRes.error && Array.isArray(batchModsRes.data)) {
          batchModsRes.data.forEach((m) => {
            if (m.profile_id) profileIds.add(Number(m.profile_id));
          });
        }
        if (!pageRolesRes.error && Array.isArray(pageRolesRes.data)) {
          pageRolesRes.data.forEach((r) => {
            if (r.profile_id) profileIds.add(Number(r.profile_id));
          });
        }
        const profileMap = /* @__PURE__ */ new Map();
        if (profileIds.size > 0) {
          const { data: profiles } = await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("id, full_name, email, batch_year, avatar_url").in("id", Array.from(profileIds));
          (profiles || []).forEach((p) => profileMap.set(Number(p.id), p));
        }
        if (!batchModsRes.error && Array.isArray(batchModsRes.data)) {
          batchModerators = batchModsRes.data.map((m) => ({
            ...m,
            profile: profileMap.get(Number(m.profile_id)) || null
          }));
        }
        const rolesByPage = /* @__PURE__ */ new Map();
        if (!pageRolesRes.error && Array.isArray(pageRolesRes.data)) {
          for (const r of pageRolesRes.data) {
            const pid = Number(r.page_id);
            const list = rolesByPage.get(pid) || [];
            list.push({ ...r, profile: profileMap.get(Number(r.profile_id)) || null });
            rolesByPage.set(pid, list);
          }
        }
        if (!pagesRes.error && Array.isArray(pagesRes.data) && pagesRes.data.length > 0) {
          officialPages = pagesRes.data.map((p) => ({
            ...p,
            roles: rolesByPage.get(Number(p.id)) || []
          }));
        }
        if (!flagsRes.error && Array.isArray(flagsRes.data) && flagsRes.data.length > 0) {
          featureFlags = flagsRes.data.map((f) => ({
            key: f.key,
            enabled: Boolean(f.enabled),
            description: f.description || null,
            config: f.config || {},
            updatedAt: f.updated_at || (/* @__PURE__ */ new Date()).toISOString()
          }));
        }
        if (!weightsRes.error && weightsRes.data) {
          const d = weightsRes.data;
          rankingWeights = {
            batchRelevanceWeight: Number(d.batch_relevance_weight ?? 28),
            followedAlumniWeight: Number(d.followed_alumni_weight ?? 20),
            followedPageWeight: Number(d.followed_page_weight ?? 22),
            engagementLikeWeight: Number(d.engagement_like_weight ?? 1.5),
            engagementCommentWeight: Number(d.engagement_comment_weight ?? 3),
            engagementCap: Number(d.engagement_cap ?? 42),
            recencyMaxBoost: Number(d.recency_max_boost ?? 48),
            recencyDecayPerHour: Number(d.recency_decay_per_hour ?? 0.5),
            featuredBoost: Number(d.featured_boost ?? 18),
            updatedAt: d.updated_at || (/* @__PURE__ */ new Date()).toISOString()
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
          totalFlagsCount: featureFlags.length
        },
        batchModerators,
        officialPages,
        featureFlags,
        rankingWeights
      });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Failed to load community overview" });
    }
  }
);
app.get(
  "/api/admin/community/alumni-search",
  rateLimitGuard(60, 6e4),
  requireAdmin,
  async (req, res) => {
    try {
      const q = String(req.query.q || "").trim().replace(/[%_,]/g, "");
      if (q.length < 2) {
        return res.json({ alumni: [] });
      }
      if (!isSupabaseServerConfigured) {
        return res.json({ alumni: [] });
      }
      const { data, error } = await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("id, full_name, email, batch_year, avatar_url, role").or(`full_name.ilike.%${q}%,email.ilike.%${q}%`).limit(10);
      if (error) {
        return res.status(500).json({ error: error.message || "Search failed" });
      }
      return res.json({ alumni: data || [] });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Alumni search failed" });
    }
  }
);
app.post(
  "/api/admin/community/batch-moderators",
  rateLimitGuard(30, 6e4),
  requireAdmin,
  async (req, res) => {
    try {
      const batchYear = Number(req.body?.batchYear);
      const profileId = Number(req.body?.profileId);
      const role = String(req.body?.role || "moderator").trim().toLowerCase();
      if (!Number.isInteger(batchYear) || batchYear < 1 || batchYear > 35) {
        return res.status(400).json({ error: "Batch year must be an integer between 1 and 35." });
      }
      if (!Number.isInteger(profileId) || profileId <= 0) {
        return res.status(400).json({ error: "A valid alumni profile ID is required." });
      }
      if (role !== "moderator" && role !== "coordinator") {
        return res.status(400).json({ error: 'Role must be "moderator" or "coordinator".' });
      }
      const assignedBy = Number(req.dbUser?.id || 0) || null;
      let profileMeta = null;
      if (isSupabaseServerConfigured) {
        const { data: prof } = await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("id, full_name, email, batch_year, avatar_url").eq("id", profileId).maybeSingle();
        profileMeta = prof || null;
        const { data, error } = await supabaseServer.from(SUPABASE_TABLES.BATCH_LOUNGE_MODERATORS).upsert(
          {
            batch_year: batchYear,
            profile_id: profileId,
            role,
            assigned_by: assignedBy
          },
          { onConflict: "batch_year,profile_id" }
        ).select("*").single();
        if (!error && data) {
          return res.status(201).json({
            success: true,
            assignment: { ...data, profile: profileMeta },
            source: "supabase"
          });
        }
      }
      const existingIdx = memoryBatchModerators.findIndex(
        (m) => m.batch_year === batchYear && m.profile_id === profileId
      );
      const entry = {
        id: existingIdx >= 0 ? memoryBatchModerators[existingIdx].id : Date.now(),
        batch_year: batchYear,
        profile_id: profileId,
        role,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        profile: profileMeta || { id: profileId, full_name: `Alumnus #${profileId}`, batch_year: batchYear }
      };
      if (existingIdx >= 0) memoryBatchModerators[existingIdx] = entry;
      else memoryBatchModerators.unshift(entry);
      return res.status(201).json({ success: true, assignment: entry, source: "memory" });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Failed to assign batch moderator" });
    }
  }
);
app.delete(
  "/api/admin/community/batch-moderators/:batchYear/:profileId",
  rateLimitGuard(30, 6e4),
  requireAdmin,
  async (req, res) => {
    try {
      const batchYear = Number(req.params.batchYear);
      const profileId = Number(req.params.profileId);
      if (!Number.isInteger(batchYear) || !Number.isInteger(profileId)) {
        return res.status(400).json({ error: "Invalid batch year or profile ID." });
      }
      if (isSupabaseServerConfigured) {
        const { error } = await supabaseServer.from(SUPABASE_TABLES.BATCH_LOUNGE_MODERATORS).delete().eq("batch_year", batchYear).eq("profile_id", profileId);
        if (!error) {
          return res.json({ success: true, source: "supabase" });
        }
      }
      const idx = memoryBatchModerators.findIndex(
        (m) => m.batch_year === batchYear && m.profile_id === profileId
      );
      if (idx >= 0) memoryBatchModerators.splice(idx, 1);
      return res.json({ success: true, source: "memory" });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Failed to remove batch moderator" });
    }
  }
);
app.post(
  "/api/admin/community/official-pages/:pageId/roles",
  rateLimitGuard(30, 6e4),
  requireAdmin,
  async (req, res) => {
    try {
      const pageId = Number(req.params.pageId);
      const profileId = Number(req.body?.profileId);
      const role = String(req.body?.role || "editor").trim().toLowerCase();
      if (!Number.isInteger(pageId) || pageId <= 0 || !Number.isInteger(profileId) || profileId <= 0) {
        return res.status(400).json({ error: "Valid page ID and alumni profile ID are required." });
      }
      if (role !== "admin" && role !== "editor") {
        return res.status(400).json({ error: 'Role must be "admin" or "editor".' });
      }
      const assignedBy = Number(req.dbUser?.id || 0) || null;
      let profileMeta = null;
      if (isSupabaseServerConfigured) {
        const { data: prof } = await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("id, full_name, email, batch_year, avatar_url").eq("id", profileId).maybeSingle();
        profileMeta = prof || null;
        const { data, error } = await supabaseServer.from(SUPABASE_TABLES.OFFICIAL_PAGE_ROLES).upsert(
          {
            page_id: pageId,
            profile_id: profileId,
            role,
            assigned_by: assignedBy
          },
          { onConflict: "page_id,profile_id" }
        ).select("*").single();
        if (!error && data) {
          return res.status(201).json({
            success: true,
            assignment: { ...data, profile: profileMeta },
            source: "supabase"
          });
        }
      }
      const existingIdx = memoryOfficialPageRoles.findIndex(
        (r) => r.page_id === pageId && r.profile_id === profileId
      );
      const entry = {
        id: existingIdx >= 0 ? memoryOfficialPageRoles[existingIdx].id : Date.now(),
        page_id: pageId,
        profile_id: profileId,
        role,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        profile: profileMeta || { id: profileId, full_name: `Alumnus #${profileId}` }
      };
      if (existingIdx >= 0) memoryOfficialPageRoles[existingIdx] = entry;
      else memoryOfficialPageRoles.unshift(entry);
      return res.status(201).json({ success: true, assignment: entry, source: "memory" });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Failed to assign official page role" });
    }
  }
);
app.delete(
  "/api/admin/community/official-pages/:pageId/roles/:profileId",
  rateLimitGuard(30, 6e4),
  requireAdmin,
  async (req, res) => {
    try {
      const pageId = Number(req.params.pageId);
      const profileId = Number(req.params.profileId);
      if (!Number.isInteger(pageId) || !Number.isInteger(profileId)) {
        return res.status(400).json({ error: "Invalid page ID or profile ID." });
      }
      if (isSupabaseServerConfigured) {
        const { error } = await supabaseServer.from(SUPABASE_TABLES.OFFICIAL_PAGE_ROLES).delete().eq("page_id", pageId).eq("profile_id", profileId);
        if (!error) {
          return res.json({ success: true, source: "supabase" });
        }
      }
      const idx = memoryOfficialPageRoles.findIndex(
        (r) => r.page_id === pageId && r.profile_id === profileId
      );
      if (idx >= 0) memoryOfficialPageRoles.splice(idx, 1);
      return res.json({ success: true, source: "memory" });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Failed to remove official page role" });
    }
  }
);
app.put(
  "/api/admin/community/official-pages/:pageId",
  rateLimitGuard(30, 6e4),
  requireAdmin,
  async (req, res) => {
    try {
      const pageId = Number(req.params.pageId);
      if (!Number.isInteger(pageId) || pageId <= 0) {
        return res.status(400).json({ error: "Invalid official page ID." });
      }
      const patch = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
      if (typeof req.body?.isVerified === "boolean") patch.is_verified = req.body.isVerified;
      if (typeof req.body?.isActive === "boolean") patch.is_active = req.body.isActive;
      if (typeof req.body?.description === "string") patch.description = req.body.description.trim().slice(0, 600);
      if (typeof req.body?.tagline === "string") patch.tagline = req.body.tagline.trim().slice(0, 180);
      if (isSupabaseServerConfigured) {
        const { data, error } = await supabaseServer.from(SUPABASE_TABLES.OFFICIAL_PAGES).update(patch).eq("id", pageId).select("*").maybeSingle();
        if (!error && data) {
          return res.json({ success: true, page: data, source: "supabase" });
        }
      }
      const page = memoryOfficialPages.find((p) => p.id === pageId);
      if (!page) return res.status(404).json({ error: "Official page not found." });
      if (typeof patch.is_verified === "boolean") page.is_verified = patch.is_verified;
      if (typeof patch.is_active === "boolean") page.is_active = patch.is_active;
      if (typeof patch.description === "string") page.description = patch.description;
      if (typeof patch.tagline === "string") page.tagline = patch.tagline;
      return res.json({ success: true, page, source: "memory" });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Failed to update official page" });
    }
  }
);
app.get(
  "/api/alumni",
  rateLimitGuard(90, 6e4),
  optionalAuth,
  async (req, res) => {
    try {
      const isAdminView = req.query.adminView === "true" && (req.dbUser?.role === "admin" || req.dbUser?.role === "super_admin");
      const result = await queryPaginatedAlumniProfiles({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 25,
        search: req.query.search || "",
        batchYear: req.query.batchYear ? Number(req.query.batchYear) : void 0,
        academicStream: req.query.academicStream || void 0,
        verificationStatus: req.query.verificationStatus || void 0,
        role: req.query.role || void 0,
        accountStatus: req.query.accountStatus || void 0,
        bloodGroup: req.query.bloodGroup || void 0,
        includeSensitivePii: isAdminView
      });
      res.json(result);
    } catch (error) {
      console.error("Failed to fetch paginated alumni profiles:", error);
      res.status(500).json({ error: error.message || "Failed to fetch alumni profiles" });
    }
  }
);
app.post(
  "/api/alumni/register",
  rateLimitGuard(20, 6e4),
  requireAuth,
  async (req, res) => {
    try {
      const user = req.user;
      const isAdminCaller = req.dbUser?.role === "admin" || req.dbUser?.role === "super_admin";
      const created = await createOrRegisterAlumniProfile({
        userUid: isAdminCaller ? req.body.userUid || user?.uid || user?.id : user?.uid || user?.id,
        fullName: req.body.fullName,
        avatarUrl: req.body.avatarUrl,
        batchYear: Number(req.body.batchYear) || 25,
        session: req.body.session,
        collegeRoll: req.body.collegeRoll,
        academicStream: req.body.academicStream || req.body.group || "MBBS",
        academicGroup: req.body.academicGroup || null,
        section: req.body.section || "MBBS",
        profession: req.body.profession,
        position: req.body.position,
        institution: req.body.institution,
        specialty: Array.isArray(req.body.specialty) ? req.body.specialty : [],
        degree: Array.isArray(req.body.degree) ? req.body.degree : ["MBBS"],
        city: req.body.city,
        country: req.body.country,
        phone: req.body.phone,
        whatsapp: req.body.whatsapp,
        email: isAdminCaller ? req.body.email : user?.email || req.dbUser?.email || req.body.email,
        bloodGroup: req.body.bloodGroup,
        isRegisteredDonor: Boolean(req.body.isRegisteredDonor)
      });
      res.status(201).json({ profile: created });
    } catch (error) {
      console.error("Failed to register alumni profile:", error);
      res.status(400).json({ error: error.message || "Failed to register alumni profile" });
    }
  }
);
app.post(
  "/api/profile/update",
  rateLimitGuard(40, 6e4),
  requireAuth,
  async (req, res) => {
    try {
      const user = req.user;
      const isAdminCaller = req.dbUser?.role === "admin" || req.dbUser?.role === "super_admin";
      const callerEmail = user?.email || req.dbUser?.email;
      let targetProfileId = Number(req.dbUser?.id || 0);
      if (isAdminCaller && req.body.id && Number(req.body.id) > 0) {
        targetProfileId = Number(req.body.id);
      } else if (!targetProfileId && callerEmail) {
        const found = await findAlumniByCredential(callerEmail);
        if (found) targetProfileId = found.id;
      }
      if (!targetProfileId) {
        return res.status(400).json({ error: "Could not identify target profile to update." });
      }
      if (!isAdminCaller && req.body.id && Number(req.body.id) !== targetProfileId) {
        return res.status(403).json({ error: "Forbidden: You can only update your own profile." });
      }
      const updates = {};
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
      if (req.body.isPublic !== void 0) updates.isPublic = req.body.isPublic;
      if (req.body.showContactToVerified !== void 0) {
        updates.showContactToVerified = Boolean(req.body.showContactToVerified);
      }
      if (req.body.userPreferences && typeof req.body.userPreferences === "object") {
        updates.userPreferences = req.body.userPreferences;
      }
      const updated = await updateAlumniProfileRecord(targetProfileId, updates);
      return res.json({ success: true, profile: updated });
    } catch (error) {
      console.error("Failed to update profile on server:", error);
      return res.status(400).json({ error: error.message || "Failed to update profile" });
    }
  }
);
app.get(
  "/api/admin/overview",
  rateLimitGuard(60, 6e4),
  requireAdmin,
  async (_req, res) => {
    try {
      const overview = await getAdminOverviewMetrics();
      res.json(overview);
    } catch (error) {
      console.error("Failed to load admin overview:", error);
      res.status(500).json({ error: error.message || "Failed to load admin overview" });
    }
  }
);
app.patch(
  "/api/admin/alumni/:id",
  rateLimitGuard(40, 6e4),
  requireAdmin,
  async (req, res) => {
    try {
      const profileId = Number(req.params.id);
      if (Number.isNaN(profileId)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }
      const actor = resolveActor(req);
      if ((req.body.role === "admin" || req.body.role === "super_admin") && actor.role !== "super_admin") {
        return res.status(403).json({
          error: "Forbidden: Only Super Administrators can assign admin or super_admin roles."
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
        actorRole: actor.role
      });
      res.json({ profile: updated });
    } catch (error) {
      console.error("Failed to update profile governance:", error);
      res.status(400).json({ error: error.message || "Failed to update profile governance" });
    }
  }
);
app.get(
  "/api/admin/verifications",
  rateLimitGuard(60, 6e4),
  requireModerator,
  async (req, res) => {
    try {
      const status = req.query.status || "all";
      const submissions = await getVerificationQueue(status);
      res.json({ submissions });
    } catch (error) {
      console.error("Failed to fetch verification queue:", error);
      res.status(500).json({ error: error.message || "Failed to load verification queue" });
    }
  }
);
app.post(
  "/api/admin/verifications/:id/review",
  rateLimitGuard(40, 6e4),
  requireModerator,
  async (req, res) => {
    try {
      const submissionId = Number(req.params.id);
      const decision = req.body.decision === "approved" ? "approved" : "rejected";
      const actor = resolveActor(req);
      const updated = await reviewVerificationSubmission({
        submissionId,
        decision,
        adminNote: req.body.adminNote,
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role
      });
      res.json({ submission: updated });
    } catch (error) {
      console.error("Failed to review verification submission:", error);
      res.status(400).json({ error: error.message || "Failed to review verification submission" });
    }
  }
);
app.get(
  "/api/admin/blood-requests",
  rateLimitGuard(60, 6e4),
  requireModerator,
  async (_req, res) => {
    try {
      const requests = await getBloodEmergencyList();
      res.json({ requests });
    } catch (error) {
      console.error("Failed to load blood emergency requests:", error);
      res.status(500).json({ error: error.message || "Failed to load blood emergency requests" });
    }
  }
);
app.patch(
  "/api/admin/blood-requests/:id",
  rateLimitGuard(40, 6e4),
  requireModerator,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const actor = resolveActor(req);
      const updated = await moderateBloodEmergency({
        id,
        status: req.body.status,
        unitsFulfilled: req.body.unitsFulfilled !== void 0 ? Number(req.body.unitsFulfilled) : void 0,
        moderationNote: req.body.moderationNote,
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role
      });
      res.json({ request: updated });
    } catch (error) {
      console.error("Failed to moderate blood emergency:", error);
      res.status(400).json({ error: error.message || "Failed to moderate blood emergency" });
    }
  }
);
app.get(
  "/api/admin/notices",
  rateLimitGuard(60, 6e4),
  requireModerator,
  async (_req, res) => {
    try {
      const notices = await getOfficialNoticesList();
      res.json({ notices });
    } catch (error) {
      console.error("Failed to load notices:", error);
      res.status(500).json({ error: error.message || "Failed to load official notices" });
    }
  }
);
app.post(
  "/api/admin/notices",
  rateLimitGuard(30, 6e4),
  requireModerator,
  async (req, res) => {
    try {
      const actor = resolveActor(req);
      const notice = await createOrUpdateOfficialNotice({
        id: req.body.id ? Number(req.body.id) : void 0,
        title: req.body.title,
        category: req.body.category || "General",
        content: req.body.content,
        targetBatch: req.body.targetBatch ? Number(req.body.targetBatch) : null,
        isPinned: Boolean(req.body.isPinned),
        isPublished: Boolean(req.body.isPublished),
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role
      });
      res.json({ notice });
    } catch (error) {
      console.error("Failed to save notice:", error);
      res.status(400).json({ error: error.message || "Failed to save official notice" });
    }
  }
);
app.patch(
  "/api/admin/stream-groups/:id",
  rateLimitGuard(30, 6e4),
  requireAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const actor = resolveActor(req);
      const updated = await toggleAcademicStreamGroupActive({
        id,
        isActive: Boolean(req.body.isActive),
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role
      });
      res.json({ streamGroup: updated });
    } catch (error) {
      console.error("Failed to update stream group:", error);
      res.status(400).json({ error: error.message || "Failed to update stream group" });
    }
  }
);
app.post(
  "/api/admin/bulk-cohort",
  rateLimitGuard(10, 6e4),
  requireSuperAdmin,
  async (req, res) => {
    try {
      const actor = resolveActor(req);
      const countToGenerate = Number(req.body.count) || 50;
      const result = await generateBulkBatchCohortSample({
        countToGenerate,
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role
      });
      res.json(result);
    } catch (error) {
      console.error("Failed to execute bulk cohort import:", error);
      res.status(500).json({ error: error.message || "Failed to execute bulk cohort import" });
    }
  }
);
app.get(
  "/api/admin/export-full-backup",
  rateLimitGuard(15, 6e4),
  requireSuperAdmin,
  async (_req, res) => {
    try {
      const [overview, directory, verifications, blood, notices] = await Promise.all([
        getAdminOverviewMetrics(),
        queryPaginatedAlumniProfiles({ page: 1, limit: 100, includeSensitivePii: true }),
        getVerificationQueue("all"),
        getBloodEmergencyList(),
        getOfficialNoticesList()
      ]);
      res.json({
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        platform: "Shaheed Ziaur Rahman Medical College Alumni Network (SZMC Bogura)",
        overview,
        alumniProfiles: directory.profiles,
        verificationSubmissions: verifications,
        bloodEmergencyRequests: blood,
        officialNotices: notices
      });
    } catch (error) {
      console.error("Failed to export full backup:", error);
      res.status(500).json({ error: error.message || "Failed to export database backup" });
    }
  }
);
app.use(createDistDownloadRouter(__dirname2));
var ALLOWED_VIDEO_EXTENSIONS = /* @__PURE__ */ new Set(["mp4", "webm", "mov", "ogg"]);
app.post(
  "/api/upload-video",
  rateLimitGuard(20, 6e4),
  requireAuth,
  express.raw({ type: ["video/*", "application/octet-stream"], limit: "50mb" }),
  async (req, res) => {
    try {
      const rawExt = String(req.headers["x-file-ext"] || "mp4").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      const extHeader = ALLOWED_VIDEO_EXTENSIONS.has(rawExt) ? rawExt : "mp4";
      const userIdHeader = String(req.dbUser?.id || "alumni").replace(/[^a-zA-Z0-9_-]/g, "");
      const fileName = `video_${userIdHeader}_${Date.now()}_${crypto5.randomBytes(4).toString("hex")}.${extHeader}`;
      let buffer = null;
      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        buffer = req.body;
      } else if (req.body && typeof req.body.dataUrl === "string") {
        const base64Part = req.body.dataUrl.split(",")[1];
        if (base64Part) {
          buffer = Buffer.from(base64Part, "base64");
        }
      }
      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ error: "Empty video payload" });
      }
      const contentType = extHeader === "webm" ? "video/webm" : extHeader === "mov" ? "video/quicktime" : extHeader === "ogg" ? "video/ogg" : "video/mp4";
      if (isSupabaseServerConfigured) {
        try {
          const storagePath = `videos/${fileName}`;
          const { error: upErr } = await supabaseServer.storage.from("post-media").upload(storagePath, buffer, {
            contentType,
            cacheControl: "3600",
            upsert: true
          });
          if (!upErr) {
            const { data: pubData } = supabaseServer.storage.from("post-media").getPublicUrl(storagePath);
            if (pubData?.publicUrl) {
              return res.json({ url: pubData.publicUrl });
            }
          }
        } catch (supaErr) {
          console.warn("[Server] Supabase storage video upload fallback:", supaErr);
        }
      }
      const uploadsDir = path3.resolve(__dirname2, "public", "uploads", "videos");
      if (!existsSync3(uploadsDir)) {
        const { mkdirSync: mkdirSync2 } = await import("fs");
        mkdirSync2(uploadsDir, { recursive: true });
      }
      const filePath = path3.join(uploadsDir, fileName);
      writeFileSync2(filePath, buffer);
      return res.json({
        url: `/uploads/videos/${fileName}`
      });
    } catch (err) {
      console.error("[Server] Video upload error:", err?.message || err);
      return res.status(500).json({ error: err?.message || "Failed to store video" });
    }
  }
);
app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: Date.now() });
});
async function startServer() {
  const httpServer = createHttpServer(app);
  let listenRetries = 0;
  const MAX_LISTEN_RETRIES = 15;
  let viteInstance = null;
  const bindPort = () => {
    if (typeof PORT === "number") {
      httpServer.listen(PORT, "0.0.0.0", () => {
        console.log(`SZMC Alumni Server running on http://0.0.0.0:${PORT}`);
      });
    } else {
      httpServer.listen(PORT, () => {
        console.log(`SZMC Alumni Server running on cPanel socket ${PORT}`);
      });
    }
  };
  httpServer.on("error", (err) => {
    if (err.code === "EADDRINUSE" && listenRetries < MAX_LISTEN_RETRIES) {
      listenRetries += 1;
      console.warn(
        `[Server] Port ${PORT} busy (EADDRINUSE), retrying (${listenRetries}/${MAX_LISTEN_RETRIES})...`
      );
      setTimeout(() => {
        try {
          httpServer.close();
        } catch {
        }
        bindPort();
      }, 400);
      return;
    }
    console.error("[Server] HTTP Server socket error:", err.message);
  });
  loadServerSiteConfig();
  const publicPath = path3.resolve(__dirname2, "public");
  app.use(express.static(publicPath, {
    maxAge: "7d",
    etag: true
  }));
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: false,
        ws: false,
        watch: null
      },
      plugins: [
        {
          name: "szmc-disable-vite-ws-and-watch",
          config(cfg) {
            cfg.server = cfg.server || {};
            cfg.server.hmr = false;
            cfg.server.ws = false;
            cfg.server.watch = null;
          }
        }
      ],
      appType: "custom"
    });
    viteInstance = vite;
    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
      if (req.originalUrl.startsWith("/api/")) {
        return res.status(404).json({ error: "Endpoint not found" });
      }
      const cleanPath = req.originalUrl.split("?")[0];
      if (path3.extname(cleanPath) && !cleanPath.endsWith(".html")) {
        return res.status(404).type("text/plain").send("File not found");
      }
      const url = req.originalUrl;
      try {
        let template = await readFile(path3.resolve(__dirname2, "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({
          "Content-Type": "text/html",
          "Cache-Control": "no-cache, no-store, must-revalidate"
        }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path3.resolve(__dirname2, "dist");
    app.use(express.static(distPath, {
      maxAge: "1y",
      etag: true,
      immutable: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        }
      }
    }));
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path3.join(distPath, "index.html"));
    });
  }
  app.use((err, _req, res, _next) => {
    console.error("[Server] Express error handler:", err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message || "Internal Server Error" });
    }
  });
  bindPort();
  Promise.race([
    hydrateServerSiteConfigFromSupabase(),
    new Promise(
      (_, reject) => setTimeout(() => reject(new Error("Supabase config hydration timeout (8s)")), 8e3)
    )
  ]).then(() => {
    console.log("[Server] Successfully hydrated site configuration and Hall of Fame from Supabase.");
  }).catch((hydErr) => {
    console.warn("[Server] Notice during initial Supabase site config hydration:", hydErr?.message || hydErr);
  });
  const gracefulShutdown = async () => {
    try {
      httpServer.close();
      if (viteInstance) {
        await viteInstance.close();
      }
    } catch {
    }
    process.exit(0);
  };
  process.once("SIGTERM", gracefulShutdown);
  process.once("SIGINT", gracefulShutdown);
}
startServer().catch((err) => {
  console.error("[Server] Fatal startup error:", err);
});
export {
  hydrateServerSiteConfigFromSupabase,
  invalidatePostsCache
};
