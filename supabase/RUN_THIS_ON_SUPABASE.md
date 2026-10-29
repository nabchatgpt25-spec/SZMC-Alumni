# ▶️ RUN THIS ON SUPABASE — complete checklist

Everything the database needs. Three parts: **SQL**, **Edge Functions**, **Auth/Storage settings**.
Nothing here requires deleting data.

---

## PART 1 — SQL (1 file, 1 run)

### The file
**`supabase/APPLY_ALL.sql`** (163 KB) — a single idempotent script built from `supabase/migrations/001…014`.

It creates/repairs: enums, all tables, indexes, RLS policies, column grants, security functions,
triggers, storage buckets + policies, realtime publication, reference seed data (50 batches,
academic stream groups, 2 official notices), the feature flags, and the profile-create + post fixes.

Verified on PostgreSQL 16: **run 3× in a row → 0 errors**, seeds correct, signup auto-profile OK,
member insert OK, posting OK.

### How to run
1. Supabase Dashboard → **SQL Editor** → **New query**.
2. Open `supabase/APPLY_ALL.sql` from the repo, copy **everything**, paste.
3. **Run**. It takes ~5–10 seconds.
4. Every section is guarded (`IF NOT EXISTS` / `DROP … IF EXISTS` / `ON CONFLICT`), so re-running is safe.

> If the SQL editor times out on the big file, run the migration files in order instead:
> `001_core_schema.sql` → `002_security_functions_triggers.sql` → `003_rls_policies.sql` →
> `004_reference_seed_data.sql` → `005_…` → `006_…` → `007_…` → `008_…` → `009_…` →
> `010_admin_system.sql` → `010_notifications_system.sql` → `011_…` → `012_…` → `013_…` → `014_…`.

### Make yourself admin (run once, replace the email)

```sql
-- SQL Editor runs as postgres, so the "you cannot change your own role" trigger
-- does not block this.
update public.alumni_profiles
   set role = 'admin',
       verification_status = 'verified',
       verification_method = 'admin_verified',
       verified_at = coalesce(verified_at, now())
 where lower(email) = lower('nurulanambashir20@gmail.com')
returning id, full_name, email, role, verification_status;
```

If it returns 0 rows, that auth user has no profile yet (log in once, or run:

```sql
select public.ensure_alumni_profile(u.id, u.email, u.raw_user_meta_data)
from auth.users u
left join public.alumni_profiles p on p.auth_user_id = u.id
where p.id is null;
```

then repeat the update).

### Verify (expect the values in the comments)

```sql
select (select count(*) from public.batches)                as batches,        -- >= 50
       (select count(*) from public.academic_stream_groups) as stream_groups,  -- >= 19
       (select count(*) from public.app_feature_flags)      as flags,          -- 2
       (select count(*) from public.official_notices)       as notices;        -- >= 2

-- must return 0 rows
select u.id, u.email from auth.users u
left join public.alumni_profiles p on p.auth_user_id = u.id
where p.id is null;

-- policies on posts (readable form)
select polname as policy,
       case polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
                   when 'w' then 'UPDATE' when 'd' then 'DELETE'
                   else polcmd::text end as command
from pg_policy p join pg_class c on c.oid = p.polrelid
where c.relname = 'posts' order by 1;
```

---

## PART 2 — Edge Functions

Four functions in `supabase/functions/`. Deploy from **your machine** (they are TypeScript/Deno;
pasting them into the dashboard editor also works, but the CLI is one command per function).

```bash
npm i -g supabase          # once
supabase login             # opens the browser
supabase link --project-ref <PROJECT_REF>   # Dashboard → Settings → General → Reference ID

# REQUIRED — mobile number + password login
supabase functions deploy unified-phone-login --no-verify-jwt

# REQUIRED — admin marks a phone number as verified
supabase functions deploy admin-verify-phone

# OPTIONAL
supabase functions deploy admin-hub
supabase functions deploy unfurl --no-verify-jwt
```

`supabase/config.toml` already records the correct `verify_jwt` value for each function, so
`--no-verify-jwt` is only needed if your CLI version ignores it.

| Function | Needed | JWT | Why |
|---|---|---|---|
| `unified-phone-login` | **yes** | off | members log in with phone + password (no SMS/Twilio). Rate-limited in DB via `check_and_increment_rate_limit` (created by migration 006). |
| `admin-verify-phone` | **yes** | on | admin flags `phone_ownership_verified`; caller must have `role='admin'` in `alumni_profiles`. |
| `admin-hub` | optional | on | bulk admin operations; the UI currently uses direct table/RPC calls. |
| `unfurl` | optional | off | link previews; the app already uses the Express `/api/unfurl` proxy instead. |

**Secrets needed: none.** `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`
are injected automatically into every Edge Function.

⚠️ **CORS allow-list:** `unified-phone-login` only answers `*.alumniworld.xyz`, `localhost`,
`127.0.0.1`, `*.run.app`, `*.googleusercontent.com`. If your frontend is on another domain
(e.g. `*.vercel.app`), add it to `ALLOWED_EXACT_ORIGINS` in
`supabase/functions/unified-phone-login/index.ts` and redeploy — otherwise phone login falls back
to the Express `/api/auth/unified-login` route.

---

## PART 3 — Dashboard settings (2 minutes)

**Authentication**
- Providers → **Email**: enabled.
- **Confirm email**: OFF is recommended for a members-only portal (otherwise `signUp()` returns no
  session and users must confirm before logging in; the profile row is created either way by the
  `014` trigger).
- **URL Configuration**: Site URL = your domain, and add it to *Redirect URLs* (needed for Google
  login + password reset).
- Providers → **Phone**: **not needed** — phone login goes through the edge function.

**Storage** — the SQL creates these buckets; just confirm they exist:

| Bucket | Public | Limit |
|---|---|---|
| `avatars` | yes | 5 MB |
| `post-media` | yes | 20 MB |
| `gallery` | yes | 20 MB |
| `verification-documents` | **no** (private) | 10 MB |

**Realtime** — enabled by migration `012` for `posts`, `post_comments`, `post_likes`,
`notifications`, `blood_*`, `alumni_profiles`, … and `app_feature_flags`.

---

## PART 4 — Smoke test (5 minutes)

1. **Sign up** a fresh test account → check `select * from alumni_profiles where email = 'test@…'`
   → exactly one row, `role='member'`, `verification_status='unverified'`.
2. **Post** from that account (Feed → write → Post) → row appears in `public.posts`, and
   `alumni_profiles.posts_count` becomes 1.
3. **Upload a photo** with the post → file lands in the `post-media` bucket.
4. **Admin Panel** → the *Member Verification Portal* switch flips and persists
   (`select * from app_feature_flags` shows the change).
5. **Member view**: Verification Center / vouch banner / badges are hidden (default).

If any step fails, open the browser console — the error now carries the real Postgres code
(e.g. `42501`, `23503`) instead of a generic message.

---

## Troubleshooting

| Error | Meaning | Fix |
|---|---|---|
| `invalid input value for enum academic_stream_type: "MBBS"` | you ran an **old** copy of `004` | use the current `APPLY_ALL.sql` (fixed in this branch) |
| `permission denied for table alumni_profiles` | `014` not applied | run `014_fix_alumni_profile_creation_and_post_grants.sql` |
| `null value in column "batch_year" … foreign key` | `public.batches` is empty | PART 1 (re-seeds 50 batches) |
| `new row violates row-level security policy for table "posts"` | profile not linked to `auth_user_id` | run the `ensure_alumni_profile` backfill above |
| `Only administrators can change this switch` (in the admin panel) | session is not a real Supabase admin session | log in with the admin email after PART 3 |
| phone login falls back / CORS error | origin not allow-listed | add the domain to `unified-phone-login`, redeploy |

---

## PART 5 — "Waiting for verification" on the Users page

Supabase shows **Waiting for verification** in the *Last sign in at* column when the user has
**never signed in because their email is not confirmed**. With *Confirm email* ON,
`signUp()` returns no session and `signInWithPassword()` fails with
`Email not confirmed`, so the app can never obtain a real session -> `auth.uid()` is NULL ->
every RLS-protected write (posts, admin switches, profile saves) is rejected.

### Fix in two steps

**1. Turn off email confirmation** (recommended for a members-only portal)

Dashboard -> **Authentication -> Sign In / Providers -> Email** -> **Confirm email = OFF** -> **Save**.

**2. Confirm the accounts that already exist** (SQL Editor)

```sql
UPDATE auth.users
   SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
       updated_at         = now()
 WHERE email_confirmed_at IS NULL;

UPDATE auth.identities
   SET email_verified = TRUE
 WHERE email_verified IS NULL OR email_verified = FALSE;

-- should return 0 rows afterwards
SELECT id, email, email_confirmed_at
FROM auth.users
WHERE email_confirmed_at IS NULL;
```

**3. Log out and log in again**, then open `https://your-domain/?diag=1` and confirm that
**Real Supabase login session** and **Create a post (write test)** are both green.
