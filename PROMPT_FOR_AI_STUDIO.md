# Copy‑paste prompt for Google AI Studio

Paste everything between the lines into AI Studio (attach / open the project `SZMC-Alumni` first, or paste the relevant files it asks for).

---

You are fixing a production bug in **SZMC‑Alumni**, a React 19 + Vite + TypeScript + Tailwind app backed by **Supabase** (Postgres + RLS + Storage). Do **not** refactor unrelated code, do **not** weaken security, and do **not** use the service_role key anywhere in the browser.

## Symptom
Alumni can log in and the feed loads fine (Supabase connection is OK, reads work), but **nobody can publish a post**. The composer rolls back the optimistic post and shows:

> "Unable to publish: Could not verify your registered alumni profile in Supabase."

Some users instead see: "You must be signed in with a valid account to publish a post to Supabase."

## Root cause (already diagnosed — verify, then fix)
The insert into `public.alumni_profiles` performed by the client is rejected by Postgres with **`42501 permission denied for table public.alumni_profiles`**, because `supabase/migrations/003_rls_policies.sql` does:

```sql
REVOKE ALL ON public.alumni_profiles FROM PUBLIC, anon, authenticated;
GRANT INSERT ( auth_user_id, full_name, avatar_url, cover_url, batch_year, session,
  academic_stream, academic_group, section, profession, position, institution, cadre,
  specialty, specialty_other, degree, city, country, latitude, longitude, bio,
  career_history, blood_group, college_roll, email, phone, whatsapp, fb_link,
  is_public, show_contact_to_verified ) ON public.alumni_profiles TO authenticated;
```

but the client inserts columns that were **never granted** for INSERT:

1. `role`, `verification_status`, `verification_method` — never granted.
2. `phone_ownership_verified` — this column is created later by `supabase/migrations/005_admin_phone_verification.sql`, and the column privileges were never re‑granted for it.

Consequences, in order:

- `getOrCreateSupabaseProfile()` in `src/lib/supabase-auth.ts` (the `initialRecord` object, then the `.insert().select(ALUMNI_PUBLIC_COLUMNS).single()`) **fails wholesale** — Postgres rejects the entire row, not just the column.
- There is **no `AFTER INSERT ON auth.users` trigger** anywhere in `supabase/`, so a self‑registered alumnus has an `auth.users` account but **no `alumni_profiles` row**.
- In `createFeedPostInDb()` (`src/services/supabaseService.ts`), all three `author_id` resolution paths then fail: lookup by `auth_user_id` returns 0 rows; the fallback lookup `.ilike('email', …)` is also blocked (`email` SELECT was revoked in migration 003 → 42501); and the create‑profile fallback fails with 42501. The function returns early with the "Could not verify your registered alumni profile" error, so **the `INSERT INTO public.posts` is never even attempted**.
- If a profile row exists but its `auth_user_id` is not linked to the logged‑in user, the posts insert does run and then fails RLS: policy `posts_insert_own` requires `author_id = public.current_profile_id()` and `current_profile_id()` returns NULL → `new row violates row-level security policy for table "posts"`.
- Secondary: if email confirmation is enabled, `signUp()` returns no session, `AuthContext` falls back to a fabricated user persisted in `localStorage` (`szmc_direct_authenticated_user`), and posting fails with "You must be signed in…".
- Unrelated but user‑visible: posts written from the Profile page (`ProfileView.handleCreateProfilePost`) are only stored in `localStorage` (`ndc_alumni_posts`); they are never sent to Supabase.

## Required changes

### 1. New idempotent migration `supabase/migrations/013_fix_profile_grants_and_signup_trigger.sql`

- `GRANT INSERT (phone_ownership_verified, phone_verified_at, phone_verified_by_profile_id, phone_verification_notes) ON public.alumni_profiles TO authenticated;`
- `GRANT UPDATE (phone_ownership_verified) ON public.alumni_profiles TO authenticated;`
- Do **not** grant `role`, `verification_status`, `verification_method`, `vouches_count`, `vouch_target_count`, `badges` to the client. They must stay server‑controlled (the trigger `protect_privileged_profile_columns()` already forces `role='member'`, `verification_status='unverified'`, `verification_method=NULL`, `vouches_count=0`, `vouch_target_count=2`, `badges='{}'`, `posts_count=0` on INSERT). Instead, **remove them from the client insert payload** (see step 2).
- Add a `SECURITY DEFINER` function + `AFTER INSERT ON auth.users` trigger `handle_new_alumni_profile()` that creates the `alumni_profiles` row server‑side from `new.raw_user_meta_data` (`full_name`, `batch_year`, `phone`), with safe defaults and `ON CONFLICT (auth_user_id) DO NOTHING`. It must set `search_path = public, extensions`, `batch_year` must fall back to a value that exists in `public.batches`, and it must not fail signup (wrap risky parts defensively).
- Add a `SECURITY DEFINER` RPC `public.link_profile_by_email()` (or `get_my_profile()`) that links/returns the caller's profile without exposing the `email` column to the client. It must only ever act on `auth.uid()`.
- `REVOKE`/`GRANT EXECUTE` on the new functions appropriately (no `PUBLIC` execute on internal helpers).
- Keep the migration additive and re‑runnable (`IF NOT EXISTS`, `DROP … IF EXISTS` before `CREATE`, `ON CONFLICT DO NOTHING`), wrapped in `BEGIN; … COMMIT;`.

### 2. Stop the client from writing protected columns — `src/lib/supabase-auth.ts`

- In `getOrCreateSupabaseProfile()`, remove `role`, `verification_status`, `verification_method`, `vouches_count`, `vouch_target_count` from the inserted object (and drop the super‑admin special‑casing from the insert payload — the server trigger and the admin RPC own those fields).
- Keep `phone_ownership_verified: false` only if the grant from step 1 is in place; otherwise omit it and let the column default apply.
- Replace the `.ilike('email', …)` profile‑matching fallback with the new RPC, and stop relying on reading `email` directly.
- Surface the real Postgres error (`error.code`, `error.message`) in the returned error string instead of swallowing it, so the UI can show something actionable.

### 3. Same payload cleanup in `src/context/AuthContext.tsx`

- In `register()`, the emergency `supabase.from('alumni_profiles').upsert({ … verification_status, vouches_count, vouch_target_count … })` must use the same trimmed column set (or be deleted once the signup trigger exists).
- In `updateProfile()`, keep `phone_ownership_verified = false` on phone change (the grant now permits it) and **do not** swallow the error silently — log it and, if the update fails, keep the previous value in state.

### 4. Make the failure visible instead of silent — `src/services/supabaseService.ts`

- In `createFeedPostInDb()`, when the profile cannot be resolved, include the underlying error code/message in the returned `error` string.
- Log the insert error with its Postgres `code`, `details`, and `hint` (currently only `insertError.message`).
- Do not change the `posts` insert payload (it correctly sends only `author_id, content, category, images, videos`).

### 5. Persist Profile‑page posts — `src/components/ProfileView.tsx`

- `handleCreateProfilePost` (and the edit/delete/like handlers on the profile) must call `createFeedPostInDb` / `editFeedPostInDb` / `deleteFeedPostInDb` / `togglePostLikeInDb` from `src/services/supabaseService.ts` instead of only writing to `localStorage`. Keep the optimistic UI, but roll back and toast on failure, exactly like `FeedView.handleCreatePost` does.

## Constraints
- Never call `.select('*')` on `alumni_profiles`; always use `ALUMNI_PUBLIC_COLUMNS` from `src/lib/supabase.ts` (sensitive columns are revoked).
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL` to the client bundle.
- Keep RLS enabled on every table; never add a `USING (true)` policy on a write path.
- Keep TypeScript strict‑clean (`npm run lint` = `tsc --noEmit`).
- Do not remove or rename existing migrations; add `013_…` only.

## Acceptance criteria
1. A brand new user (`supabase.auth.signUp`) automatically gets exactly one `alumni_profiles` row with `role='member'`, `verification_status='unverified'`, `posts_count=0` — with no client insert at all.
2. A verified **and** an unverified member can publish a text‑only post; the row is committed to `public.posts` and `posts_count` increments via the existing `trg_sync_user_posts_count` trigger.
3. Publishing with a photo uploads to the `post-media` bucket and the post stores the public URL.
4. A member with no profile row gets an error toast that names the real cause, not a generic message.
5. Posting from the Profile page survives a hard refresh and appears on another device.
6. Editing the phone number in Settings persists `phone` (and resets `phone_ownership_verified` to `false`) without a 42501.
7. Diagnostic query returns zero rows:
   ```sql
   SELECT u.id, u.email, p.id AS profile_id
   FROM auth.users u
   LEFT JOIN public.alumni_profiles p ON p.auth_user_id = u.id
   WHERE p.id IS NULL;
   ```

## Output format
Return: (a) the full contents of the new migration file, (b) a diff per changed TypeScript file, (c) a short "how to verify" list, and (d) any SQL the operator must run manually in the Supabase SQL editor.

---
