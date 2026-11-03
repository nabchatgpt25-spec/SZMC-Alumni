var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// server.ts
import express from "express";
import compression from "compression";
import { createServer as createHttpServer } from "http";
import { existsSync, writeFileSync, readFileSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import crypto2 from "crypto";
import * as dotenv2 from "dotenv";

// server/lib/supabase-server.ts
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ quiet: true });
var DEFAULT_SUPABASE_URL = "https://hjuyiqyviohinbhzaipl.supabase.co";
var DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqdXlpcXl2aW9oaW5iaHphaXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MjQ2NzIsImV4cCI6MjEwNzIwMDY3Mn0.fppNXVPWcsWGsUIBwvirhjEkdDyUCX-SyydNWExbwk8";
var DEFAULT_SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqdXlpcXl2aW9oaW5iaHphaXBsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTYyNDY3MiwiZXhwIjoyMTA3MjAwNjcyfQ.ue8jWRc6WYUf6LBDk7hKk_00JFmHL18cLxkoXv4U5SY";
var urlCandidates = [
  process.env.SUPABASE_URL,
  process.env.VITE_SUPABASE_URL
];
var rawUrl = (urlCandidates.find(
  (u) => typeof u === "string" && (u.trim().startsWith("http://") || u.trim().startsWith("https://")) && !u.includes("placeholder.supabase.co")
) || DEFAULT_SUPABASE_URL).trim();
var keyCandidates = [
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  DEFAULT_SUPABASE_SERVICE_ROLE_KEY,
  process.env.SUPABASE_ANON_KEY,
  process.env.VITE_SUPABASE_URL && !process.env.VITE_SUPABASE_URL.startsWith("http") ? process.env.VITE_SUPABASE_URL : void 0,
  process.env.VITE_SUPABASE_ANON_KEY
];
var rawKey = (keyCandidates.find(
  (k) => typeof k === "string" && (k.trim().startsWith("eyJ") || k.trim().startsWith("sb_") || k.trim().length > 30)
) || DEFAULT_SUPABASE_SERVICE_ROLE_KEY).trim();
var isSupabaseServerConfigured = Boolean(
  rawUrl && rawKey && rawUrl.startsWith("http") && !rawUrl.includes("placeholder.supabase.co")
);
var effectiveUrl = isSupabaseServerConfigured ? rawUrl : DEFAULT_SUPABASE_URL;
var effectiveKey = isSupabaseServerConfigured ? rawKey : DEFAULT_SUPABASE_ANON_KEY;
var supabaseServer = createClient(effectiveUrl, effectiveKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
var SUPABASE_TABLES = {
  ALUMNI_PROFILES: "alumni_profiles",
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
  AUDIT_LOGS: "audit_logs"
  // Reconciled: audit_logs (not security_audit_logs)
};

// server/middleware/auth.ts
import crypto from "crypto";
var envAdminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
var SUPER_ADMIN_EMAILS = Array.from(/* @__PURE__ */ new Set([
  "admin@szmcalumni.net",
  "nabchatgpt25@gmail.com",
  "firstaidnetworkbd@gmail.com",
  "support@szmcalumni.net",
  "nurulanambashir25@gmail.com",
  "nurulanambashir20@gmail.com",
  ...envAdminEmails
]));
var ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || crypto.createHash("sha256").update(`szmc_runtime_secret:${process.cwd()}`).digest("hex");
var ADMIN_PHONE_SUFFIX_DIGEST = "752c91e0a1047c99f82ee8eff19f0234f12b2818db5fe0695ac961315b4f4bae";
function isAdminPhoneDigestMatch(rawPhone) {
  const suffix = (rawPhone || "").replace(/\D/g, "").slice(-10);
  if (!suffix) return false;
  const digest = crypto.createHash("sha256").update(`szmc_id_salt:${suffix}`).digest("hex");
  return digest === ADMIN_PHONE_SUFFIX_DIGEST;
}
function signAdminToken(email) {
  const payload = `${email.toLowerCase().trim()}:${Date.now()}`;
  const hmac = crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(payload).digest("hex");
  return `szmc-admin-session:${Buffer.from(payload).toString("base64")}:${hmac}`;
}
function verifyAdminToken(token) {
  if (!token || !token.startsWith("szmc-admin-session:")) return { valid: false };
  const parts = token.split(":");
  if (parts.length !== 3) return { valid: false };
  try {
    const rawPayload = Buffer.from(parts[1], "base64").toString("utf-8");
    const expectedHmac = crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(rawPayload).digest("hex");
    const providedBuf = Buffer.from(parts[2], "utf-8");
    const expectedBuf = Buffer.from(expectedHmac, "utf-8");
    if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
      return { valid: false };
    }
    const [email, timestamp] = rawPayload.split(":");
    const ageMs = Date.now() - Number(timestamp);
    if (isNaN(ageMs) || ageMs < 0 || ageMs > 30 * 24 * 60 * 60 * 1e3) return { valid: false };
    return { valid: true, email };
  } catch {
    return { valid: false };
  }
}
async function verifyAuthToken(token) {
  if (!token) return null;
  const adminCheck = verifyAdminToken(token);
  if (adminCheck.valid && adminCheck.email) {
    const adminEmail = adminCheck.email.toLowerCase().trim();
    return {
      user: { id: "super-admin-nurul", email: adminEmail },
      dbUser: {
        id: 1,
        uid: "super-admin-nurul",
        email: adminEmail,
        fullName: "Dr. Nurul Anam Bashir",
        role: "admin",
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
    const cleanPhone = (user.phone || "").trim();
    const isVerifiedSuperAdmin = SUPER_ADMIN_EMAILS.some((e) => e.toLowerCase() === cleanEmail) || isAdminPhoneDigestMatch(cleanPhone);
    const metadataRole = user.app_metadata?.role || (user.app_metadata?.claims_admin ? "admin" : void 0);
    const { data: profile } = await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("id, auth_user_id, email, full_name, role").eq("auth_user_id", user.id).maybeSingle();
    const profileRole = profile?.role;
    const resolvedRole = isVerifiedSuperAdmin || metadataRole === "admin" || profileRole === "admin" ? "admin" : metadataRole === "moderator" || profileRole === "moderator" ? "moderator" : "member";
    return {
      user,
      dbUser: {
        id: Number(profile?.id || 1),
        uid: user.id,
        email: cleanEmail || `${user.id}@szmcalumni.net`,
        fullName: profile?.full_name || user.user_metadata?.full_name || "SZMC Alumnus",
        role: resolvedRole,
        accountStatus: "active"
      }
    };
  } catch (err) {
    console.warn("Supabase token verification error:", err);
    return null;
  }
}
var requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing token" });
  }
  const token = authHeader.split("Bearer ")[1].trim();
  const authResult = await verifyAuthToken(token);
  if (authResult) {
    req.supabaseUser = authResult.user;
    req.user = authResult.user;
    req.dbUser = authResult.dbUser;
    return next();
  }
  return res.status(401).json({ error: "Unauthorized: Invalid token" });
};
var requireAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Valid administrator authorization token required." });
  }
  const token = authHeader.split("Bearer ")[1].trim();
  const authResult = await verifyAuthToken(token);
  if (!authResult) {
    return res.status(401).json({ error: "Unauthorized: Invalid or expired administrator session token." });
  }
  req.supabaseUser = authResult.user;
  req.user = authResult.user;
  req.dbUser = authResult.dbUser;
  const isAuthorizedAdmin = authResult.dbUser.role === "admin" || authResult.dbUser.role === "super_admin" || authResult.dbUser.role === "moderator";
  if (!isAuthorizedAdmin) {
    return res.status(403).json({ error: "Forbidden: Admin access restricted to verified administrators." });
  }
  return next();
};
var optionalAuth = async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split("Bearer ")[1].trim();
    const authResult = await verifyAuthToken(token);
    if (authResult) {
      req.supabaseUser = authResult.user;
      req.user = authResult.user;
      req.dbUser = authResult.dbUser;
    }
  }
  next();
};

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
      const { data, error } = await supabaseServer.from(SUPABASE_TABLES.ACADEMIC_STREAM_GROUPS).select("*").order("stream").order("group_code");
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
        const { data: usersData } = await supabaseServer.auth.admin.listUsers();
        const existingAuthUser = usersData?.users?.find(
          (u) => u.email?.toLowerCase() === cleanEmail
        );
        if (existingAuthUser) {
          effectiveAuthUid = existingAuthUser.id;
          if (!existingAuthUser.email_confirmed_at) {
            await supabaseServer.auth.admin.updateUserById(existingAuthUser.id, {
              email_confirm: true
            });
          }
        }
      }
      if (!effectiveAuthUid && cleanEmail && (input.rawPassword || input.passwordHash)) {
        const initialPass = input.rawPassword || "TempPass_" + Date.now();
        try {
          const { data: createdAuthUser, error: createAuthErr } = await supabaseServer.auth.admin.createUser({
            email: cleanEmail,
            password: initialPass,
            email_confirm: true,
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
        try {
          await supabaseServer.auth.admin.updateUserById(effectiveAuthUid, {
            email_confirm: true
          });
        } catch {
        }
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
      let query = supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("*");
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
        const { data: usersData } = await supabaseServer.auth.admin.listUsers();
        const matched = usersData?.users?.find(
          (u) => u.email?.toLowerCase() === clean
        );
        if (matched) {
          if (!matched.email_confirmed_at) {
            await supabaseServer.auth.admin.updateUserById(matched.id, {
              email_confirm: true
            });
          }
          const restored = await createOrRegisterAlumniProfile({
            userUid: matched.id,
            fullName: matched.user_metadata?.full_name || matched.user_metadata?.name || clean.split("@")[0],
            batchYear: Number(matched.user_metadata?.batch_year) || 68,
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
  if (isSupabaseServerConfigured && profileId) {
    try {
      await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).update(dbUpdates).eq("id", profileId);
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
      const { data: profile, error: fetchErr } = await supabaseServer.from(SUPABASE_TABLES.ALUMNI_PROFILES).select("*").eq("id", profileId).single();
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
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var args = process.argv.slice(2);
var portFlagIdx = args.indexOf("--port");
var cliPort = portFlagIdx !== -1 && args[portFlagIdx + 1] ? Number(args[portFlagIdx + 1]) : void 0;
var PORT = cliPort || (process.env.APP_PORT ? Number(process.env.APP_PORT) : 3e3);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
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
var rateLimitStore = /* @__PURE__ */ new Map();
function rateLimitGuard(maxRequests, windowMs) {
  return (req, res, next) => {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
    const key = `${ip}:${req.baseUrl || req.path}`;
    const now = Date.now();
    const bucket = rateLimitStore.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > maxRequests) {
      return res.status(429).json({
        error: "Rate limit exceeded. Automated scraping and brute-force requests are blocked."
      });
    }
    return next();
  };
}
function resolveActor(req) {
  if (req.dbUser) {
    return {
      uid: req.dbUser.uid,
      email: req.dbUser.email,
      role: req.dbUser.role || "admin"
    };
  }
  if (req.user) {
    const user = req.user;
    return {
      uid: user.uid || user.id || "admin-user",
      email: user.email || "admin@szmcalumni.net",
      role: "admin"
    };
  }
  throw new Error("Unauthorized: Valid admin credentials required on backend");
}
app.get(["/api/download-dist", "/download-dist", "/download/dist.zip", "/szmc-alumni-dist.zip"], (_req, res) => {
  const publicZip = path.resolve(__dirname, "public", "szmc-alumni-dist.zip");
  if (existsSync(publicZip)) {
    return res.download(publicZip, "szmc-alumni-dist.zip");
  }
  const distZip = path.resolve(__dirname, "dist", "szmc-alumni-dist.zip");
  if (existsSync(distZip)) {
    return res.download(distZip, "szmc-alumni-dist.zip");
  }
  return res.status(404).json({ error: "Distribution bundle not found" });
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
    batchYear: row.batchYear || 68,
    session: row.session || void 0,
    collegeRoll: row.collegeRoll || "",
    academicStream: row.academicStream,
    academicGroup: row.academicGroup,
    group: row.academicStream || "Science",
    section: row.section || "Group 4",
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
    degree: Array.isArray(row.degree) ? row.degree : ["HSC"],
    city: row.city || "Dhaka",
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
var PASSWORD_SALT = "ndc_dhaka_1949_salt_v1:";
function hashPasswordServer(raw) {
  if (!raw) return "";
  if (raw.startsWith("sha256:")) return raw;
  const hash = crypto2.createHash("sha256").update(PASSWORD_SALT + raw).digest("hex");
  return `sha256:${hash}`;
}
function verifyPasswordServer(storedHash, inputPass) {
  if (!storedHash) return true;
  const hashedInput = hashPasswordServer(inputPass);
  if (storedHash === hashedInput) return true;
  if (storedHash === inputPass) return true;
  return false;
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
      userUid: req.body.userUid,
      rawPassword: password,
      fullName: fullName.trim(),
      avatarUrl,
      batchYear: Number(batchYear) || 68,
      session,
      collegeRoll: collegeRoll?.trim(),
      academicStream: academicStream === "Humanities" || academicStream === "Business Studies" ? academicStream : "Science",
      academicGroup: academicGroup || null,
      section: section || "Group 4",
      profession: profession || "",
      position: position || "",
      institution: institution || "",
      specialty: Array.isArray(specialty) ? specialty : [],
      degree: Array.isArray(degree) ? degree : ["HSC"],
      city: city || "Dhaka",
      country: country || "Bangladesh",
      phone: phone?.trim() || null,
      whatsapp: whatsapp?.trim() || null,
      email: email?.trim() || null,
      passwordHash: hashedPassword,
      bloodGroup: bloodGroup || null,
      isRegisteredDonor: Boolean(isRegisteredDonor)
    });
    const formattedProfile = formatAlumniRowToProfile(created);
    broadcastFeedEvent({
      type: "ALUMNI_REGISTERED",
      profile: formattedProfile,
      timestamp: Date.now()
    });
    res.status(201).json({
      success: true,
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
    const idDigitsSuffix = cleanId.replace(/\D/g, "").slice(-10);
    const idSuffixDigest = idDigitsSuffix ? crypto2.createHash("sha256").update(`szmc_id_salt:${idDigitsSuffix}`).digest("hex") : "";
    const ADMIN_PHONE_SUFFIX_DIGEST2 = "752c91e0a1047c99f82ee8eff19f0234f12b2818db5fe0695ac961315b4f4bae";
    const ADMIN_MASTER_PASS_HASH = "sha256:78c42a0b21dfeae36b95efa4b145e97e894a3f28d57fa8a233b64fddcaa9b3b1";
    const isDedicatedAdmin = cleanId.toLowerCase() === "nurulanambashir25@gmail.com" || cleanId.toLowerCase() === "nurulanambashir20@gmail.com" || idSuffixDigest === ADMIN_PHONE_SUFFIX_DIGEST2;
    if (isDedicatedAdmin) {
      let authSession = null;
      let authenticated = false;
      const targetEmail = cleanId.includes("@") ? cleanId.toLowerCase().trim() : "nurulanambashir25@gmail.com";
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
      if (!authenticated) {
        if (process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) {
          authenticated = true;
        } else if (hashPasswordServer(password) === ADMIN_MASTER_PASS_HASH) {
          authenticated = true;
        } else {
          const adminAlumnus = await findAlumniByCredential(targetEmail);
          if (adminAlumnus?.passwordHash && verifyPasswordServer(adminAlumnus.passwordHash, password)) {
            authenticated = true;
          }
        }
      }
      if (!authenticated) {
        return res.status(401).json({ error: "Incorrect administrator password. Access denied." });
      }
      const superAdminToken = signAdminToken(targetEmail);
      const superAdminProfile = {
        id: 1,
        userId: 1,
        fullName: "Dr. Nurul Anam Bashir",
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
        phone: !isEmail ? cleanId : "",
        role: "admin",
        isPublic: true,
        online: true,
        badges: ["SZMCian", "Super Admin", "Batch 25"]
      };
      return res.json({
        success: true,
        token: superAdminToken,
        session: authSession || { access_token: superAdminToken, token_type: "bearer", user: { email: targetEmail, role: "admin" } },
        profile: superAdminProfile
      });
    }
    if (isEmail) {
      const cleanEmail = cleanId.toLowerCase();
      if (isSupabaseServerConfigured) {
        try {
          const { data: uData } = await supabaseServer.auth.admin.listUsers();
          const existingU = uData?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);
          if (existingU && !existingU.email_confirmed_at) {
            await supabaseServer.auth.admin.updateUserById(existingU.id, { email_confirm: true });
          }
        } catch (confirmErr) {
          console.warn("Auto-confirm check notice:", confirmErr);
        }
        const { data: signInData, error: signInError } = await supabaseServer.auth.signInWithPassword({
          email: cleanEmail,
          password
        });
        if (!signInError && signInData?.user) {
          let alumnus3 = await findAlumniByCredential(cleanEmail);
          if (!alumnus3) {
            alumnus3 = await createOrRegisterAlumniProfile({
              userUid: signInData.user.id,
              rawPassword: password,
              fullName: signInData.user.user_metadata?.full_name || signInData.user.user_metadata?.name || cleanEmail.split("@")[0],
              batchYear: Number(signInData.user.user_metadata?.batch_year) || 68,
              email: cleanEmail,
              passwordHash: hashPasswordServer(password)
            });
          }
          const adminToken3 = signAdminToken(cleanEmail || "admin@szmcalumni.net");
          return res.json({
            success: true,
            session: signInData.session,
            token: signInData.session?.access_token || adminToken3,
            profile: formatAlumniRowToProfile(alumnus3)
          });
        }
        if (signInError) {
          const msg = signInError.message.toLowerCase();
          if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
            const { data: uData } = await supabaseServer.auth.admin.listUsers();
            const existingU = uData?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);
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
      if (!alumnus2) {
        return res.status(404).json({ error: "No registered account found with this email address." });
      }
      const isValid2 = verifyPasswordServer(alumnus2.passwordHash, password);
      if (!isValid2) {
        return res.status(401).json({ error: "Incorrect password. Please try again." });
      }
      const adminToken2 = signAdminToken(cleanEmail || "admin@szmcalumni.net");
      return res.json({
        success: true,
        token: adminToken2,
        profile: formatAlumniRowToProfile(alumnus2)
      });
    }
    const formattedPhone = formatToE164PhoneServer(cleanId);
    const alumnus = await findAlumniByCredential(cleanId);
    if (!alumnus) {
      return res.status(404).json({
        error: "No registered account found with this mobile number. Please register your verified profile first."
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
        if (alumnus.authUserId) {
          try {
            await supabaseServer.auth.admin.updateUserById(alumnus.authUserId, {
              phone: formattedPhone,
              phone_confirm: true
            });
          } catch {
          }
        }
        const adminToken2 = signAdminToken(alumnus.email || "admin@szmcalumni.net");
        return res.json({
          success: true,
          session: authSession,
          token: authSession?.access_token || adminToken2,
          profile: formatAlumniRowToProfile(alumnus)
        });
      }
      const { data: usersData } = await supabaseServer.auth.admin.listUsers();
      const matchedUser = usersData?.users?.find(
        (u) => alumnus.email && u.email?.toLowerCase() === alumnus.email.toLowerCase().trim() || u.phone && u.phone === formattedPhone
      );
      if (matchedUser && (matchedUser.app_metadata?.provider === "google" || !matchedUser.encrypted_password)) {
        return res.status(400).json({
          error: 'This account was created via Google Sign-In and does not have a password set yet. Please sign in with Google, or use "Forgot Password" to set a password for phone login.'
        });
      }
      return res.status(401).json({ error: "Incorrect password for this mobile number. Please try again." });
    }
    const isValid = verifyPasswordServer(alumnus.passwordHash, password);
    if (!isValid) {
      return res.status(401).json({ error: "Incorrect password. Please try again." });
    }
    const adminToken = signAdminToken(alumnus.email || "admin@szmcalumni.net");
    return res.json({
      success: true,
      token: adminToken,
      profile: formatAlumniRowToProfile(alumnus)
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
app.get("/api/admin/verify-access", requireAdmin, (req, res) => {
  const actor = req.dbUser;
  if (actor && (actor.role === "admin" || actor.role === "super_admin")) {
    return res.json({
      authorized: true,
      role: "admin",
      userId: actor.id || 1,
      userUid: actor.uid || "super-admin-nurul",
      email: actor.email || "nurulanambashir25@gmail.com",
      fullName: actor.fullName || "Dr. Nurul Anam Bashir",
      verifiedViaMetadata: true,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  return res.status(403).json({
    authorized: false,
    role: actor?.role || "member",
    error: "Forbidden: Admin access restricted to verified administrators."
  });
});
app.get("/api/admin/auto-verify-status", (_req, res) => {
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
app.post("/api/admin/bulk-verify-all", rateLimitGuard(15, 6e4), requireAdmin, async (req, res) => {
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
var serverSiteConfigStore = null;
var SITE_CONFIG_FILE = path.resolve(__dirname, "szmc-site-config.json");
function cleanAndPersistBase64Avatars(members) {
  if (!Array.isArray(members)) return [];
  const uploadsDir = path.resolve(__dirname, "public", "uploads", "avatars");
  if (!existsSync(uploadsDir)) {
    try {
      const { mkdirSync } = __require("fs");
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
          const filePath = path.join(uploadsDir, fileName);
          writeFileSync(filePath, Buffer.from(matches[2], "base64"));
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
    if (existsSync(SITE_CONFIG_FILE)) {
      const raw = readFileSync(SITE_CONFIG_FILE, "utf-8");
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
    writeFileSync(SITE_CONFIG_FILE, JSON.stringify(merged, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Server] Failed to write szmc-site-config.json:", err);
  }
  return merged;
}
function loadServerSiteConfig() {
  if (serverSiteConfigStore) return serverSiteConfigStore;
  try {
    if (existsSync(SITE_CONFIG_FILE)) {
      const raw = readFileSync(SITE_CONFIG_FILE, "utf-8");
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
    writeFileSync(SITE_CONFIG_FILE, JSON.stringify(updated, null, 2), "utf-8");
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
app.post("/api/admin/site-config", rateLimitGuard(120, 6e4), async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let isAuthorized = false;
    let actorEmail = "admin@szmcalumni.net";
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split("Bearer ")[1].trim();
      const authResult = await verifyAuthToken(token);
      if (authResult?.dbUser?.role === "admin" || authResult?.dbUser?.role === "super_admin" || authResult?.dbUser?.email && SUPER_ADMIN_EMAILS.includes(authResult.dbUser.email.toLowerCase().trim())) {
        isAuthorized = true;
        actorEmail = authResult.dbUser.email || actorEmail;
      }
    }
    if (!isAuthorized) {
      const directToken = req.headers["x-admin-token"] || req.query.token;
      if (directToken) {
        const verifyRes = verifyAdminToken(directToken);
        if (verifyRes.valid) {
          isAuthorized = true;
          if (verifyRes.email) actorEmail = verifyRes.email;
        }
      }
    }
    if (!isAuthorized) {
      return res.status(401).json({ error: "Unauthorized: Valid administrator authorization token required." });
    }
    const patch = req.body;
    if (!patch || typeof patch !== "object") {
      return res.status(400).json({ error: "Invalid configuration payload" });
    }
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
    if (isSupabaseServerConfigured) {
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const hofMembers = Array.isArray(updated.featuredAlumni) ? updated.featuredAlumni : [];
      void Promise.allSettled([
        supabaseServer.from("site_settings").upsert({
          key: "master_site_config",
          value: updated,
          updated_at: nowIso
        }, { onConflict: "key" }),
        supabaseServer.from("site_settings").upsert({
          key: "hall_of_fame",
          value: {
            members: hofMembers,
            updated_at: nowIso
          },
          updated_at: nowIso
        }, { onConflict: "key" })
      ]).catch(() => {
      });
    }
    return res.json({
      success: true,
      message: "Site configuration & Hall of Fame saved and broadcast live across all devices!",
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
    const { phone, newPassword } = req.body;
    if (!phone?.trim() || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Valid phone number and new password (min 6 chars) required." });
    }
    const alumnus = await findAlumniByCredential(phone.trim());
    if (!alumnus) {
      return res.status(404).json({ error: "No account found with this mobile number." });
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
  const targetUrl = req.query.url;
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).json({ error: "Valid HTTP/HTTPS URL required" });
  }
  const cleanUrl = targetUrl.trim();
  if (/\.(jpeg|jpg|png|webp|gif)(\?.*)?$/i.test(cleanUrl)) {
    return res.json({
      resolvedUrl: cleanUrl,
      imageUrl: cleanUrl,
      mediaType: "photo",
      title: "Direct Photo",
      publisher: new URL(cleanUrl).hostname
    });
  }
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(cleanUrl)) {
    return res.json({
      resolvedUrl: cleanUrl,
      videoUrl: cleanUrl,
      mediaType: "video",
      title: "Direct Video Stream",
      publisher: new URL(cleanUrl).hostname
    });
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7e3);
    const isFacebook = /(?:facebook\.com|fb\.watch|fb\.com)/i.test(cleanUrl);
    const crawlerUa = isFacebook ? "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    const resp = await fetch(cleanUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": crawlerUa,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,bn;q=0.8",
        "Cache-Control": "no-cache"
      }
    });
    clearTimeout(timer);
    const finalResolvedUrl = resp.url || cleanUrl;
    const rawHtml = await resp.text();
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
app.post("/api/feed/broadcast", rateLimitGuard(60, 6e4), (req, res) => {
  const payload = req.body;
  if (payload) {
    broadcastFeedEvent(payload);
  }
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
app.post("/api/posts", rateLimitGuard(40, 6e4), async (req, res) => {
  try {
    invalidatePostsCache();
    const authorId = Number(req.body.author_id || req.body.authorId || 1);
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
app.post("/api/posts/:id/react", rateLimitGuard(120, 6e4), async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const userId = Number(req.body.userId || req.body.user_id || 1);
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
app.post("/api/posts/:id/like", rateLimitGuard(120, 6e4), async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const userId = Number(req.body.userId || req.body.user_id || 1);
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
app.post("/api/posts/:id/comment", rateLimitGuard(90, 6e4), async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const userId = Number(req.body.userId || req.body.user_id || req.body.author_id || 1);
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
app.post("/api/posts/:id/reply", rateLimitGuard(90, 6e4), async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const parentCommentId = Number(req.body.parentCommentId);
    const userId = Number(req.body.userId || 1);
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
app.get("/api/gallery/albums", rateLimitGuard(60, 6e4), async (_req, res) => {
  try {
    if (isSupabaseServerConfigured) {
      try {
        const { data: albums, error } = await supabaseServer.from("gallery_albums").select("*, gallery_photos(*)").order("created_at", { ascending: false });
        if (!error && albums && albums.length > 0) {
          const formatted = albums.map((a) => {
            const rawPhotos = a.gallery_photos || [];
            const photos = rawPhotos.map((p) => ({
              id: String(p.id),
              albumId: Number(a.id),
              url: p.url || p.photo_url || a.cover_url || a.cover_photo_url,
              caption: p.caption || "",
              category: a.category,
              batchYear: p.batch_year || a.batch_year,
              year: String(a.batch_year || 2026),
              uploaderName: p.uploader_name || "SZMC Alumnus",
              uploaderId: p.uploader_id ? Number(p.uploader_id) : void 0,
              likes: Number(p.likes_count) || 0,
              liked: false,
              tags: Array.isArray(p.tags) ? p.tags : [],
              mediaType: p.media_type || "image",
              fileSize: p.file_size || "1.2 MB"
            }));
            return {
              id: Number(a.id),
              title: a.title,
              description: a.description || "",
              category: a.category,
              date: a.event_date_label || "2026",
              location: a.location || "SZMC Campus, Silimpur, Bogura",
              batchYear: a.batch_year || 0,
              photosCount: photos.length || a.photos_count || 1,
              coverUrl: a.cover_url || a.cover_photo_url || (photos[0]?.url ?? "/assets/aistudio/images__1__2778177d.png"),
              createdBy: a.created_by || "SZMC Alumni",
              createdById: a.created_by_id ? Number(a.created_by_id) : void 0,
              photos
            };
          });
          return res.json({ albums: formatted });
        }
      } catch (err) {
        console.warn("Supabase fetch gallery albums notice:", err);
      }
    }
    return res.json({ albums: memoryGalleryAlbums });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to fetch gallery albums" });
  }
});
app.post("/api/gallery/albums", rateLimitGuard(30, 6e4), async (req, res) => {
  try {
    const { title, description, category, eventDateLabel, location, batchYear, coverUrl, createdById, createdBy } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Album title is required" });
    }
    const validCat = ["reunion", "academic", "campus", "sports", "cultural", "milestone", "convocation"];
    const normCat = (category || "campus").toLowerCase();
    const finalCat = validCat.includes(normCat) ? normCat : "campus";
    const finalCover = coverUrl || "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=1000&auto=format&fit=crop&q=80";
    let insertedAlbumId = null;
    if (isSupabaseServerConfigured) {
      try {
        const payload = {
          title: title.trim(),
          description: description || "SZMC Album",
          category: finalCat,
          event_date_label: eventDateLabel || "Recent",
          location: location || "SZMC Campus, Silimpur, Bogura",
          batch_year: Number(batchYear) || null,
          cover_url: finalCover,
          cover_photo_url: finalCover,
          is_published: true,
          photos_count: 1
        };
        if (createdById) payload.created_by_id = Number(createdById);
        if (createdBy) payload.created_by = String(createdBy);
        const { data, error } = await supabaseServer.from("gallery_albums").insert(payload).select("id").single();
        if (!error && data?.id) {
          insertedAlbumId = Number(data.id);
          await supabaseServer.from("gallery_photos").insert({
            album_id: insertedAlbumId,
            url: finalCover,
            photo_url: finalCover,
            caption: `${title.trim()} - Cover Photo`,
            uploader_id: createdById ? Number(createdById) : null,
            uploader_name: createdBy ? String(createdBy) : "SZMC Alumnus",
            is_approved: true
          });
        }
      } catch (err) {
        console.warn("Supabase create album notice:", err);
      }
    }
    const finalId = insertedAlbumId || Date.now();
    const albumObj = {
      id: finalId,
      title: title.trim(),
      description: description || "A collection of SZMC memories.",
      category: finalCat,
      date: eventDateLabel || "Recent",
      location: location || "SZMC Campus, Silimpur, Bogura",
      batchYear: Number(batchYear) || 0,
      photosCount: 1,
      coverUrl: finalCover,
      createdById: createdById ? Number(createdById) : void 0,
      createdBy: createdBy || "SZMC Alumnus",
      photos: [
        {
          id: `p-${Date.now()}`,
          url: finalCover,
          caption: `${title.trim()} - Cover Photo`,
          uploaderId: createdById ? Number(createdById) : void 0,
          uploaderName: createdBy || "SZMC Alumnus",
          batchYear: Number(batchYear) || 0,
          uploadedAt: "Today",
          likesCount: 1,
          likedByMe: true,
          tags: ["Cover", finalCat]
        }
      ]
    };
    memoryGalleryAlbums.unshift(albumObj);
    return res.status(201).json({ success: true, album: albumObj });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to create album" });
  }
});
app.post("/api/gallery/photos", rateLimitGuard(60, 6e4), async (req, res) => {
  try {
    const { albumId, url, photoUrl, caption, batchYear, tags, mediaType, fileSize, uploaderId, uploaderName } = req.body;
    const finalUrl = url || photoUrl;
    if (!albumId || !finalUrl) {
      return res.status(400).json({ error: "albumId and url are required" });
    }
    let insertedPhotoId = null;
    if (isSupabaseServerConfigured) {
      try {
        const payload = {
          album_id: Number(albumId),
          url: finalUrl,
          photo_url: finalUrl,
          caption: caption || null,
          batch_year: Number(batchYear) || null,
          tags: Array.isArray(tags) ? tags : [],
          media_type: mediaType || "image",
          file_size: fileSize || null,
          is_approved: true
        };
        if (uploaderId) payload.uploader_id = Number(uploaderId);
        if (uploaderName) payload.uploader_name = String(uploaderName);
        const { data, error } = await supabaseServer.from("gallery_photos").insert(payload).select("id").single();
        if (!error && data?.id) {
          insertedPhotoId = String(data.id);
          const { count } = await supabaseServer.from("gallery_photos").select("id", { count: "exact", head: true }).eq("album_id", Number(albumId));
          if (typeof count === "number") {
            await supabaseServer.from("gallery_albums").update({ photos_count: count, photo_count: count }).eq("id", Number(albumId));
          }
        }
      } catch (err) {
        console.warn("Supabase add gallery photo notice:", err);
      }
    }
    const photoObj = {
      id: insertedPhotoId || `p-${Date.now()}`,
      albumId: Number(albumId),
      url: finalUrl,
      caption: caption || "",
      uploaderId: uploaderId ? Number(uploaderId) : void 0,
      uploaderName: uploaderName || "SZMC Alumnus",
      batchYear: Number(batchYear) || 0,
      tags: Array.isArray(tags) ? tags : [],
      mediaType: mediaType || "image",
      fileSize: fileSize || "1.2 MB"
    };
    const memAlbum = memoryGalleryAlbums.find((a) => a.id === Number(albumId));
    if (memAlbum) {
      if (!Array.isArray(memAlbum.photos)) memAlbum.photos = [];
      memAlbum.photos.unshift(photoObj);
      memAlbum.photosCount = memAlbum.photos.length;
    }
    return res.status(201).json({ success: true, photo: photoObj });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to add photo" });
  }
});
var handleGalleryAlbumDelete = async (req, res) => {
  try {
    const albumId = Number(req.params.id);
    if (!albumId) {
      return res.status(400).json({ error: "Album ID is required" });
    }
    const requesterUserId = Number(req.body.userId || req.query.userId || 0);
    const requesterIsAdmin = Boolean(req.body.isAdmin || req.query.isAdmin === "true" || req.user?.role === "admin");
    if (isSupabaseServerConfigured) {
      try {
        const { data: album } = await supabaseServer.from("gallery_albums").select("id, created_by_id").eq("id", albumId).maybeSingle();
        if (album) {
          const isOwner = requesterUserId > 0 && Number(album.created_by_id) === requesterUserId;
          if (!requesterIsAdmin && !isOwner) {
            return res.status(403).json({ error: "Access denied: You can only delete your own albums, or an administrator can delete any album." });
          }
          await supabaseServer.from("gallery_photos").delete().eq("album_id", albumId);
          await supabaseServer.from("gallery_albums").delete().eq("id", albumId);
        }
      } catch (err) {
        console.warn("Supabase delete gallery album notice:", err);
      }
    }
    const memIdx = memoryGalleryAlbums.findIndex((a) => a.id === albumId);
    if (memIdx >= 0) {
      memoryGalleryAlbums.splice(memIdx, 1);
    }
    return res.json({ success: true, message: "Album deleted successfully" });
  } catch (err) {
    console.error("Failed to delete gallery album:", err);
    return res.status(500).json({ error: err.message || "Failed to delete album" });
  }
};
app.delete("/api/gallery/albums/:id", rateLimitGuard(40, 6e4), handleGalleryAlbumDelete);
app.post("/api/gallery/albums/:id/delete", rateLimitGuard(40, 6e4), handleGalleryAlbumDelete);
var handleGalleryPhotoDelete = async (req, res) => {
  try {
    const photoId = String(req.params.id);
    const albumId = req.body.albumId || req.query.albumId ? Number(req.body.albumId || req.query.albumId) : null;
    const requesterUserId = Number(req.body.userId || req.query.userId || 0);
    const requesterIsAdmin = Boolean(req.body.isAdmin || req.query.isAdmin === "true" || req.user?.role === "admin");
    if (isSupabaseServerConfigured) {
      try {
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
            return res.status(403).json({ error: "Access denied: You can only delete your own photos, or an administrator can delete any photo." });
          }
          await supabaseServer.from("gallery_photos").delete().eq("id", photoId);
          const targetAlbumId = photo.album_id || albumId;
          if (targetAlbumId) {
            const { count } = await supabaseServer.from("gallery_photos").select("id", { count: "exact", head: true }).eq("album_id", targetAlbumId);
            const remainingCount = typeof count === "number" ? count : 0;
            await supabaseServer.from("gallery_albums").update({ photos_count: remainingCount, photo_count: remainingCount }).eq("id", targetAlbumId);
          }
        }
      } catch (err) {
        console.warn("Supabase delete photo notice:", err);
      }
    }
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
    return res.json({ success: true, message: "Photo deleted successfully" });
  } catch (err) {
    console.error("Failed to delete photo:", err);
    return res.status(500).json({ error: err.message || "Failed to delete photo" });
  }
};
app.delete("/api/gallery/photos/:id", rateLimitGuard(60, 6e4), handleGalleryPhotoDelete);
app.post("/api/gallery/photos/:id/delete", rateLimitGuard(60, 6e4), handleGalleryPhotoDelete);
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
app.post("/api/blood/requests", rateLimitGuard(30, 6e4), async (req, res) => {
  try {
    const {
      requesterId,
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
    let insertedId = null;
    if (isSupabaseServerConfigured) {
      try {
        const payload = {
          requester_id: Number(requesterId) || 1,
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
app.post("/api/blood/donors", rateLimitGuard(30, 6e4), async (req, res) => {
  try {
    const { userId, bloodGroup, isRegisteredDonor, availability, preferredArea, city, lastDonationDate, emergencyAlertPreference } = req.body;
    const donorUserId = Number(userId || 1);
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
app.post("/api/mentorship/requests", rateLimitGuard(30, 6e4), async (req, res) => {
  try {
    const { id, userId, userName, userBatch, userAvatar, topic, question, contactInfo, targetMentorId, targetMentorName } = req.body;
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
app.post("/api/mentorship/requests/:id/answers", rateLimitGuard(30, 6e4), async (req, res) => {
  try {
    const reqId = req.params.id;
    const { mentorId, mentorName, mentorBatch, mentorAvatar, mentorProfession, answerText } = req.body;
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
app.post("/api/mentorship/mentors", rateLimitGuard(30, 6e4), async (req, res) => {
  try {
    const { id, userId, fullName, batchYear, avatarUrl, category, expertise, shortDescription, institution, position, contactPreference } = req.body;
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
app.post("/api/careers", rateLimitGuard(30, 6e4), async (req, res) => {
  try {
    const { id, title, company, location, type, description, posterId, posterName, posterBatch, posterAvatar, posterEmail } = req.body;
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
app.post("/api/careers/:id/apply", rateLimitGuard(30, 6e4), async (req, res) => {
  try {
    const oppId = req.params.id;
    const { applicantId, applicantName, applicantBatch, applicantAvatar, applicantEmail, applicantPhone } = req.body;
    const newApp = {
      id: `app-${Date.now()}`,
      applicantId: Number(applicantId) || 1,
      applicantName: applicantName || "SZMC Applicant",
      applicantBatch: applicantBatch || "",
      applicantAvatar: applicantAvatar || "/assets/aistudio/images__1__2778177d.png",
      applicantEmail: applicantEmail || "",
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
app.delete("/api/careers/:id", rateLimitGuard(30, 6e4), async (req, res) => {
  try {
    const oppId = req.params.id;
    if (isSupabaseServerConfigured) {
      try {
        await supabaseServer.from("career_opportunities").delete().eq("id", oppId);
      } catch (err) {
        console.warn("Supabase delete career notice:", err);
      }
    }
    const idx = memoryCareerOpportunities.findIndex((o) => o.id === oppId);
    if (idx >= 0) memoryCareerOpportunities.splice(idx, 1);
    return res.json({ success: true, message: "Career opportunity deleted successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to delete opportunity" });
  }
});
app.get(
  "/api/alumni",
  rateLimitGuard(90, 6e4),
  optionalAuth,
  async (req, res) => {
    try {
      const isAdminView = req.query.adminView === "true" && req.dbUser?.role === "admin";
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
  optionalAuth,
  async (req, res) => {
    try {
      const user = req.user;
      const created = await createOrRegisterAlumniProfile({
        userUid: user?.uid || user?.id || req.body.userUid,
        fullName: req.body.fullName,
        avatarUrl: req.body.avatarUrl,
        batchYear: Number(req.body.batchYear) || 68,
        session: req.body.session,
        collegeRoll: req.body.collegeRoll,
        academicStream: req.body.academicStream || req.body.group || "Science",
        academicGroup: req.body.academicGroup || null,
        section: req.body.section,
        profession: req.body.profession,
        position: req.body.position,
        institution: req.body.institution,
        specialty: Array.isArray(req.body.specialty) ? req.body.specialty : [],
        degree: Array.isArray(req.body.degree) ? req.body.degree : ["HSC"],
        city: req.body.city,
        country: req.body.country,
        phone: req.body.phone,
        whatsapp: req.body.whatsapp,
        email: req.body.email,
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
  optionalAuth,
  async (req, res) => {
    try {
      const user = req.user;
      const callerEmail = user?.email || req.dbUser?.email || req.body.email;
      const callerAuthId = user?.uid || user?.id || req.dbUser?.auth_user_id || req.body.authUserId;
      let targetProfileId = Number(req.dbUser?.id || req.body.id);
      if (!targetProfileId && callerEmail) {
        const found = await findAlumniByCredential(callerEmail);
        if (found) targetProfileId = found.id;
      }
      if (!targetProfileId && req.body.phone) {
        const found = await findAlumniByCredential(req.body.phone);
        if (found) targetProfileId = found.id;
      }
      if (!targetProfileId) {
        return res.status(400).json({ error: "Could not identify target profile to update." });
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
  requireAdmin,
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
  requireAdmin,
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
  requireAdmin,
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
  requireAdmin,
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
  requireAdmin,
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
  requireAdmin,
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
  requireAdmin,
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
  requireAdmin,
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
app.get([
  "/download/szmc-alumni-dist.zip",
  "/szmc-alumni-dist.zip",
  "/download/dist.zip",
  "/dist.zip",
  "/api/download-dist",
  "/download-dist"
], (_req, res) => {
  const candidates = [
    path.resolve(__dirname, "public", "szmc-alumni-dist.zip"),
    path.resolve(__dirname, "szmc-alumni-dist.zip"),
    path.resolve(__dirname, "public", "dist.zip"),
    path.resolve(__dirname, "dist.zip"),
    path.resolve(__dirname, "public", "szmc-alumni-dist.tar.gz"),
    path.resolve(__dirname, "szmc-alumni-dist.tar.gz")
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      return res.download(c, "szmc-alumni-portal-dist.zip");
    }
  }
  return res.status(404).send("Production dist archive not found. Please build first.");
});
app.get(["/download/szmc-alumni-dist.tar.gz", "/szmc-alumni-dist.tar.gz"], (_req, res) => {
  const candidates = [
    path.resolve(__dirname, "public", "szmc-alumni-dist.tar.gz"),
    path.resolve(__dirname, "szmc-alumni-dist.tar.gz")
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      return res.download(c, "szmc-alumni-dist.tar.gz");
    }
  }
  return res.status(404).send("Production dist tar.gz archive not found.");
});
app.post(
  "/api/upload-video",
  express.raw({ type: ["video/*", "application/octet-stream"], limit: "100mb" }),
  async (req, res) => {
    try {
      const extHeader = String(req.headers["x-file-ext"] || "mp4").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "mp4";
      const userIdHeader = String(req.headers["x-user-id"] || "alumni").replace(/[^a-zA-Z0-9_-]/g, "");
      const fileName = `video_${userIdHeader}_${Date.now()}_${crypto2.randomBytes(4).toString("hex")}.${extHeader}`;
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
      const uploadsDir = path.resolve(__dirname, "public", "uploads", "videos");
      if (!existsSync(uploadsDir)) {
        const { mkdirSync } = await import("fs");
        mkdirSync(uploadsDir, { recursive: true });
      }
      const filePath = path.join(uploadsDir, fileName);
      writeFileSync(filePath, buffer);
      return res.json({
        url: `/uploads/videos/${fileName}`
      });
    } catch (err) {
      console.error("[Server] Video upload error:", err?.message || err);
      return res.status(500).json({ error: err?.message || "Failed to store video" });
    }
  }
);
async function startServer() {
  const httpServer = createHttpServer(app);
  httpServer.on("error", (err) => {
    console.error("[Server] HTTP Server socket error:", err.message);
  });
  try {
    await hydrateServerSiteConfigFromSupabase();
    console.log("[Server] Successfully hydrated site configuration and Hall of Fame from Supabase.");
  } catch (hydErr) {
    console.warn("[Server] Notice during initial Supabase site config hydration:", hydErr?.message || hydErr);
  }
  const publicPath = path.resolve(__dirname, "public");
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
        watch: null
      },
      appType: "custom"
    });
    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
      if (req.originalUrl.startsWith("/api/")) {
        return res.status(404).json({ error: "Endpoint not found" });
      }
      const cleanPath = req.originalUrl.split("?")[0];
      if (path.extname(cleanPath) && !cleanPath.endsWith(".html")) {
        return res.status(404).type("text/plain").send("File not found");
      }
      const url = req.originalUrl;
      try {
        let template = await readFile(path.resolve(__dirname, "index.html"), "utf-8");
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
    const distPath = path.resolve(__dirname, "dist");
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
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  app.use((err, _req, res, _next) => {
    console.error("[Server] Express error handler:", err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message || "Internal Server Error" });
    }
  });
  if (typeof PORT === "number") {
    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`SZMC Alumni Server running on http://0.0.0.0:${PORT}`);
    });
  } else {
    httpServer.listen(PORT, () => {
      console.log(`SZMC Alumni Server running on cPanel socket ${PORT}`);
    });
  }
}
startServer().catch((err) => {
  console.error("[Server] Fatal startup error:", err);
});
export {
  hydrateServerSiteConfigFromSupabase,
  invalidatePostsCache
};
