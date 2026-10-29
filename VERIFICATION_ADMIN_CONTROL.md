# Verification system — Admin-controlled visibility

The **entire member-facing verification system is now controlled from the Admin Panel**.
Alumni can no longer see or trigger verification themselves; only administrators verify accounts.

## How it works

A single **server-side** flag decides everything:

| Flag | Table | Default |
|---|---|---|
| `member_verification_portal` | `public.app_feature_flags` | `FALSE` (hidden) |

Because it lives in the database (not `localStorage`), flipping it affects **every user on every device**.
Writes are protected by RLS — only `is_admin_or_mod()` can change it. Reads are public, so the UI can
decide what to render before login.

## Where is the switch?

**Admin Panel → (Super Admin header row)** → `Member Portal: HIDDEN / VISIBLE`
**Admin Panel → Executive Quick Master Switches** → `Member Verification Portal` card → *Show to Members / Hide from Members*

Both are the same flag and are saved to Supabase immediately.

- **HIDDEN** (default) → alumni never see any verification UI. Verification happens only from the admin panel.
- **VISIBLE** → the classic member verification UI comes back for everyone.
- Administrators always keep access to the admin verification screens either way.

## What is hidden while the flag is `FALSE`

| Area | File |
|---|---|
| Verification Center modal (not rendered at all) | `src/App.tsx` |
| Verification / vouch banner in the feed | `src/components/FeedView.tsx` |
| Verification card + badge on profiles | `src/components/ProfileView.tsx` |
| "Verification Center" in the sidebar | `src/components/Sidebar.tsx` |
| "Verification Center" in the avatar menu | `src/components/Header.tsx` |
| "Alumni Verification & Badges" settings section + status pill | `src/components/SettingsView.tsx` |
| Verification badges + "Peer Vouch Center" button in directories | `src/components/DirectoryView.tsx`, `src/components/AlumniDirectoryView.tsx` |
| "Verified Doctors" stat + per-alumni shield in batch lounges | `src/components/BatchesView.tsx` |
| Landing-page "Verification" button, hero link and explainer modal | `src/components/LandingPage.tsx` |
| "See profile verification" CTA in Career (replaced by an admin-contact note) | `src/components/CareerView.tsx` |
| `?vouch_for=…` shared links no longer auto-open the vouch dialog | `src/App.tsx` |

Admin-side verification tooling (`AdminVerificationView`, document review queue) is untouched.

## New / changed files

```
supabase/migrations/013_admin_verification_portal_control.sql   <- run this in Supabase
supabase/master_schema.sql, supabase/full_schema.sql            <- regenerated (fresh installs)
public/szmc_master_schema.sql, public/szmc_full_schema.sql      <- regenerated
scripts/generate_master_sql.js                                  <- emits the new section
src/services/featureFlagService.ts                              <- read/write flags (cached + TTL)
src/hooks/useVerificationVisibility.ts                          <- single source of truth for the UI
src/components/**                                               <- gated rendering (see table above)
```

## Deploy steps

1. In the Supabase SQL editor, run
   `supabase/migrations/013_admin_verification_portal_control.sql`
   (idempotent — safe to re-run).
2. Deploy the frontend.
3. Sign in as admin → Admin Panel → confirm the switch shows **HIDDEN**.
4. Verify as a normal alumnus: no Verification Center in the sidebar or avatar menu, no vouch banner in
   the feed, no badges in the directory, no verification section in Settings.
5. Approve somebody from **Admin Panel → Verifications** and confirm the badge appears for them.

## Manual fallback (if you ever need SQL)

```sql
-- hide the member verification UI everywhere
update public.app_feature_flags set enabled = false where key = 'member_verification_portal';

-- show it again
update public.app_feature_flags set enabled = true  where key = 'member_verification_portal';
```

## Notes

- The flag is fetched once per minute and cached in `localStorage` for instant first paint, so other
  clients pick up a change on next load / within a minute (the table is also added to the
  `supabase_realtime` publication if available).
- If the admin session is only a local (non-Supabase) login, the write is rejected by RLS and the panel
  shows *"Only administrators can change this switch."* — sign in with the real admin account.
