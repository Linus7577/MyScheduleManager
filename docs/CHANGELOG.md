# Changelog

## What changed in Phase 1: The Loop

**Built**
- Templates: Semester, Exam Week and Holiday are seeded. Create, rename, delete, and make one active from a chosen date.
- Template editor: add, edit and delete blocks per weekday, with overlap warnings.
- Daily Loop page: a week strip, plus check-off as done, partial or skipped, each with an icon and colour, and an optional note.
- Editing a block changes that day only, with an explicit "also apply to the template" option and a confirmation.
- Rest Day (1 per week, before the day starts) and Shield (3 per month, same day allowed), with limits in `game.config.ts`.
- Calendar with month, week, day and agenda views, showing blocks and one-off events. Events can be created, edited and deleted, including all-day and multi-day ones.
- A one-off event in a productive category becomes a block you can check off in the Loop.
- New database tables in `supabase/migrations/20261103010000_schedule.sql`, all with RLS.
- Category weights moved into `game.config.ts`, ready for Phase 2.

**Decisions made, using the defaults proposed before Phase 0**
- A block crossing midnight belongs to its start date. (Phase 2's closeout will wait until it ends.)
- Switching or editing a template replaces only future blocks you haven't logged or edited.
- On a Shield day, done and partial blocks keep their progress, and open or skipped blocks become rest.

**Other choices**
- Future blocks can't be logged, because that would let you earn XP in advance.
- Productive events must be timed and on one date, because XP is based on minutes. All-day and multi-day events are "Other" only.
- A Rest Day can be taken back until its day starts, and a Shield until its day ends.
- FullCalendar v7 (MIT license) is the calendar library.
- Chinese fonts now load after the page appears. Loading them first let a slow connection to Google hold the whole page back.

**Not done yet**
- Nothing has run against your real Supabase database yet. The screens are tested with a temporary in-memory store, and the database tables with a test Postgres.
- Not deployed. Phase 0's sign-in test and Vercel deploy are still open.
- "Corrections after closeout" arrive with closeout in Phase 2, so for now a block can be changed at any time.

**In the spec, but not assigned to a phase, so not built**
- Drag to move or resize events, recurring events, calendar search and jump to date (§7.3).

## What changed in Phase 0: Foundation

**Built**
- Next.js 16, TypeScript in strict mode, Tailwind 4 and shadcn/ui, restyled to the "Final Boss" theme with fonts and colour scales.
- App shell: left sidebar on desktop, bottom tabs on phones, and a status strip placeholder on every page.
- English and 繁體中文, switchable in Settings.
- Settings page for language and timezone.
- Google sign-in flow with a server-side allowlist. Code is complete, but it needs real accounts to test.
- Database migration: `settings`, `audit_log`, and RLS on everything.
- PWA manifest and app icons.
- `.env.example`, `SETUP.md`, `ARCHITECTURE.md`, `GLOSSARY.md`.

**Added beyond the spec, as agreed**
- **Sign-up gate:** a Supabase hook and a Google test-user limit, closing a gap where a stranger could sign in straight against Supabase.
- **Security headers:** no phase listed them, so they were built now.
- **Keep-alive cron:** stops Supabase pausing before Phase 2 adds the closeout job.
- **Preview mode:** lets the shell be tested without a login. Production builds ignore it.

**Changed from the spec**
- `SUPABASE_SERVICE_ROLE_KEY` is now `SUPABASE_SECRET_KEY`, and the public key is `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, because Supabase is retiring the old keys by the end of 2026. `SPEC.md` is updated.
- Noto Chinese fonts load from Google at runtime instead of being self-hosted, because self-hosting meant about 240 font files on every build.
- No service worker yet. Chrome on Android can install the app without one, and it's planned for Phase 7.

**Not done yet (needs your accounts)**
- The real Google sign-in has not been run, including the hook. The migration has run only in a test database.
- Not deployed to Vercel.
