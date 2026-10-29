# SZMC Alumni — Complete Supabase Setup & Repair Guide

Everything you need for the database side: what SQL to run, in what order, which Edge Functions
are required, secrets, storage buckets and diagnostics.

> ⚠️ Run the SQL in **Supabase → SQL Editor** (it runs as `postgres`, so RLS does not block it).
> Every block below is **idempotent** — running it twice is harmless.

---

## 0. Current state at a glance

| Layer | Status in this repo |
|---|---|
| Schema (tables, enums, indexes) | `supabase/migrations/001_core_schema.sql` |
| **Everything in one file** | **`supabase/APPLY_ALL.sql`** (generated, idempotent) |
| Security (functions + triggers) | `002_security_functions_triggers.sql` |
| RLS + column grants | `003_rls_policies.sql` |
| Reference seed (batches, streams, notices) | `004_reference_seed_data.sql` — **was broken, fixed in this branch** |
| Phone-verification columns | `005_admin_phone_verification.sql` |
| Rate-limit / edge-function support | `006`, `007` |
| Extra academic groups | `008` |
| Storage + phone-enumeration hardening | `009` |
| Admin system / notifications | `010_admin_system.sql`, `010_notifications_system.sql` |
| Anon permission fix | `011` |
| Realtime + indexes | `012` |
| Feature flags (admin verification portal) | `013` |
| **Fix: alumni cannot post** | `014` |

Fresh install shortcut: **`supabase/APPLY_ALL.sql`** — the single idempotent script generated from
`001…014` (also mirrored to `master_schema.sql` / `full_schema.sql` / the `public/` downloads by
`node scripts/build_apply_all.js`). Step-by-step run guide: **`supabase/RUN_THIS_ON_SUPABASE.md`**.

---

## 1. SQL to run (in this order)

### 1.1 Repair reference data — REQUIRED (this is why profiles/posts fail)

`004` used enum values that do not exist (`'MBBS'`, `'Blood Bank'`, medical departments). The whole
transaction aborted, so **`public.batches` was left empty** → every `alumni_profiles` insert fails with
a foreign-key error on `batch_year`, and no one can register or post.

Fixed in this branch. Either re-run the corrected `supabase/migrations/004_reference_seed_data.sql`,
or run this compact repair:

```sql
BEGIN;
SET search_path = public, extensions;

INSERT INTO public.batches (batch_year, session, hsc_year, special_note, representative_name,
                            registered_count, estimated_total)
SELECT b.n::smallint,
       (1990 + b.n)::text || '-' || lpad(((1991 + b.n) % 100)::text, 2, '0'),
       (1990 + b.n)::smallint,
       'MBBS Batch SZMC-' || lpad(b.n::text, 2, '0'),
       'SZMC-' || lpad(b.n::text, 2, '0') || ' Batch Coordinator',
       0,
       CASE WHEN b.n <= 10 THEN 100 WHEN b.n <= 25 THEN 150 ELSE 200 END
FROM generate_series(1, 50) AS b(n)
ON CONFLICT (batch_year) DO NOTHING;

-- public.academic_stream_type only allows Science / Humanities / Business Studies
INSERT INTO public.academic_stream_groups (stream, group_code, expected_group_count, is_active)
VALUES ('Science', NULL, 17, TRUE),
       ('Humanities', 'G', 4, TRUE), ('Humanities', 'H', 4, TRUE),
       ('Humanities', 'L', 4, TRUE), ('Humanities', 'W', 4, TRUE),
       ('Business Studies', 'A', 6, TRUE), ('Business Studies', 'B', 6, TRUE),
       ('Business Studies', 'C', 6, TRUE), ('Business Studies', 'D', 6, TRUE),
       ('Business Studies', 'E', 6, TRUE), ('Business Studies', 'F', 6, TRUE)
ON CONFLICT (stream, group_code) DO NOTHING;
COMMIT;
```

### 1.2 `013` — feature flags (admin verification portal)

Creates `public.app_feature_flags` with `member_verification_portal = FALSE`.
Full file: `supabase/migrations/013_admin_verification_portal_control.sql`.

### 1.3 `014` — fix "alumni cannot publish a post"

Full file: `supabase/migrations/014_fix_alumni_profile_creation_and_post_grants.sql`.
It does four things:

1. `GRANT INSERT/UPDATE` on the columns the client actually sends (`role`, `verification_status`,
   `verification_method`, `vouches_count`, `vouch_target_count`, `badges`, `phone_ownership_verified`,
   `phone_verified_at`, `phone_verified_by_profile_id`, `phone_verification_notes`) — previously these
   raised **42501** and killed the whole insert.
2. Adds `protect_phone_verification_columns()` trigger so members can **never** self-verify a phone
   number, even though the column is now writable (changing the phone always clears the flag).
3. Creates `public.ensure_alumni_profile(uuid, text, jsonb)` and an `AFTER INSERT ON auth.users`
   trigger → every new signup automatically gets exactly one `alumni_profiles` row.
4. **Backfills** a profile for every existing `auth.users` row that is missing one, and re-asserts the
   `posts_insert_own` policy.

Verified end-to-end on PostgreSQL 16: client insert OK, elevated fields forced down to
`member` / `unverified` / phone-unverified, post insert OK, `posts_count` incremented,
`select count(*) from auth.users u left join alumni_profiles p … where p.id is null` → `0`.

### 1.4 Optional / may already be applied

`006`, `007` (rate limiting for the phone-login function), `009` (storage hardening),
`010_*` (admin + notifications), `012` (realtime). All idempotent — safe to re-run.

---

## 2. Edge Functions

Four functions live in `supabase/functions/`:

| Function | Needed? | JWT verification | Purpose |
|---|---|---|---|
| `unified-phone-login` | **Yes** — mobile-number + password login | **OFF** (`--no-verify-jwt`) | Sign-in without SMS/Twilio, rate-limited via `check_and_increment_rate_limit` |
| `admin-verify-phone` | **Yes** — admin phone verification | ON | Marks `phone_ownership_verified` (service role, admin JWT required) |
| `admin-hub` | Optional | ON | Bulk admin operations; the UI currently uses direct RPC/table access |
| `unfurl` | Optional | OFF | Link previews; the app uses the Express `/api/unfurl` proxy instead |

Deploy:

```bash
supabase login
supabase link --project-ref <your-project-ref>

supabase functions deploy unified-phone-login --no-verify-jwt
supabase functions deploy admin-verify-phone
# optional:
supabase functions deploy admin-hub
supabase functions deploy unfurl --no-verify-jwt
```

**No manual secrets are required** — `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` are injected automatically into Edge Functions.

### ⚠️ CORS allow-list

`unified-phone-login` only answers these origins: `https://ndcbogura.alumniworld.xyz`,
`*.alumniworld.xyz`, `localhost`, `127.0.0.1`, `*.run.app`, `*.googleusercontent.com`.
If you deploy the frontend anywhere else (e.g. `*.vercel.app`), add your domain to
`ALLOWED_EXACT_ORIGINS` in `supabase/functions/unified-phone-login/index.ts` and redeploy — otherwise
phone login silently falls back to the Express `/api/auth/unified-login` endpoint.

`admin-verify-phone` uses `Access-Control-Allow-Origin: *`, so it works from any domain.

---

## 3. Storage buckets

Created by `001`/`009`/`APPLY_ALL.sql` (verify in **Storage**):

| Bucket | Public | Limit | Mime |
|---|---|---|---|
| `avatars` | yes | 5 MB | jpeg/png/webp/gif |
| `post-media` | yes | 20 MB | images + mp4/webm |
| `gallery` | yes | 20 MB | images |
| `verification-documents` | **no** | 10 MB | images + pdf |

If a bucket is missing:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('post-media','post-media',true,20971520,
        ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'])
ON CONFLICT (id) DO NOTHING;
```

---

## 4. Auth settings checklist (Dashboard → Authentication)

1. **Providers → Email**: enabled.
2. **Confirm email**: decide. If ON, `signUp()` returns no session and the app falls back to a local
   user; the DB profile is still created by the `014` trigger. Recommended: **OFF** for a members-only
   portal, or keep ON and users must confirm before their first login.
3. **URL Configuration → Site URL / Redirect URLs**: add your production domain (needed for Google
   OAuth and password recovery).
4. **Providers → Phone**: **not required** — phone login is handled by `unified-phone-login`.
5. Realtime: enabled by `012` for `posts`, `post_comments`, `post_likes`, `notifications`, etc.

---

## 5. Diagnostics (copy-paste)

```sql
-- 1. Every auth user must have exactly one profile (must return 0 rows)
SELECT u.id, u.email, u.created_at
FROM auth.users u
LEFT JOIN public.alumni_profiles p ON p.auth_user_id = u.id
WHERE p.id IS NULL;

-- 2. Batches + streams are seeded
SELECT count(*) AS batches FROM public.batches;                    -- expect >= 50
SELECT count(*) AS stream_groups FROM public.academic_stream_groups; -- expect >= 19

-- 3. RLS policies on posts (readable form)
SELECT polname AS policy,
       CASE polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                   WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
                   ELSE polcmd::text END AS command
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname = 'posts'
ORDER BY 1;

-- 4. Can `authenticated` insert the columns the app sends? (all must be true)
SELECT col, has_column_privilege('authenticated','public.alumni_profiles',col,'INSERT') AS can_insert
FROM unnest(ARRAY['role','verification_status','verification_method','phone_ownership_verified',
                  'vouches_count','vouch_target_count','full_name','batch_year','email','phone']) AS col;

-- 5. Feature flags
SELECT key, enabled, updated_at FROM public.app_feature_flags ORDER BY 1;

-- 6. Trigger + function sanity
SELECT tgname FROM pg_trigger
WHERE tgrelid IN ('public.alumni_profiles'::regclass, 'public.posts'::regclass)
  AND NOT tgisinternal ORDER BY 1;

SELECT proname FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('ensure_alumni_profile','handle_new_alumni_user','current_profile_id','is_admin_or_mod');
```

Test posting as a real (non-admin) user from the app: Feed → write → Post. If it still fails, check the
browser console — the message now carries the real Postgres error code.

---

## 6. Manual switch (verification portal)

```sql
-- hide all member-facing verification UI (default)
UPDATE public.app_feature_flags SET enabled = false WHERE key = 'member_verification_portal';

-- show it again
UPDATE public.app_feature_flags SET enabled = true  WHERE key = 'member_verification_portal';
```

Also available from **Admin Panel → Executive Quick Master Switches → Member Verification Portal**.
