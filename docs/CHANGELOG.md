# Changelog

## Fixes after first real use

- **Blocks in an inactive template:** the template editor now warns when a template isn't active, with a Make active button. The Loop also says when your blocks are in a different template from the active one. Before, blocks added there silently never appeared, so they could never earn XP.
- **Editing mistaken for adding:** the edit dialog now says saving replaces the block, and offers Save as a new block to keep the original.

## What changed in Phase 4: The Oracle

**Built**
- Chat panel: a full-screen sheet on phones and a side drawer on desktop, with replies appearing as they're written, in the language of your message.
- Provider layer: switch AI provider by changing settings. Defaults to `openai/gpt-oss-20b` on Groq. Rate limits retry with backoff, then show an in-character message.
- The 13 tools from the spec, with every request re-checked on the server.
- Proposals: before-and-after approval cards with Approve, Edit and Reject, expiring after 48 hours.
- Automatic actions: done cards with Undo, available for 7 days.
- Suggestion widget: regenerated at most 3 times a day, and cached.
- Rate limit of 20 requests a minute, in Postgres.
- Settings → Logs, showing the audit log, and the "About me" note for the Oracle.
- New tables in `supabase/migrations/20261103040000_oracle.sql`, all with RLS.

**Decisions made**
- As planned, the Oracle never sees money. The weekly review's spending summary, in Phase 7, will be calculated by the app.
- The Oracle can't change a block that's logged, in the past, outside this week, or tied to a calendar event.
- A proposal is refused at approval if its block has changed since, rather than overwriting what you did.
- Undoing a created goal or project also removes anything you've added under it since.
- The suggestion widget waits for you to ask rather than generating on its own, to save quota.
- A suggestion is written in the language the app is set to.

**Not done yet**
- It has never talked to the real Groq service, because that needs your API key. The tests use a stand-in, and the free-tier limits on Groq's own pages disagree, so real use may need tuning.
- Saving through the Oracle hasn't run on your real database.
- Not deployed.

## What changed in Phase 3: Command Center

**Built**
- Dashboard: Home's hero with today's timeline, plus nine widgets you can open, collapse, hide and reorder by dragging or with arrows. Phone and desktop each keep their own layout.
- Goals, projects and tasks, with progress computed from tasks or set by hand. Tasks with due dates appear on the calendar.
- Learning tracker: courses, roadmaps and books, with units and percent complete. Blocks and tasks can be tagged with a track.
- Habits: daily or weekly targets, one-tap check-in, a clickable heatmap and streaks. No XP.
- Daily progress snapshots, from the daily cron and when you open a goal or track.
- Charts: progress over time, planned against done minutes this week, and study minutes per track per week. Each has a table view.
- New tables in `supabase/migrations/20261103030000_command.sql`, all with RLS.

**Speed**
- A page load now remembers each database read for that request, instead of repeating it.
- Closeout skips its work when there's nothing to close, and generation skips when everything's already generated.
- The charts and drag library only download when needed.

**Decisions made**
- A goal averages its projects and leaves out paused ones, so pausing a project doesn't drag the goal down.
- A daily habit (7 times a week) counts days in a row. A less frequent one counts weeks that reached the target. An unfinished today or this week doesn't break a streak.
- Check-ins can be added or removed for today and past days, but not future ones.
- Partial blocks count as half in the study and weekly charts, the same as in the streak rule.
- A track's colour stays with it. Past eight tracks, the rest fold into "Other".
- The spending, portfolio and Oracle widgets show a sealed note until Phases 4 and 5.

**Not done yet**
- Google sign-in and reading data work on your real database. Saving blocks, and all of Phases 2 and 3's saving, still haven't run there.
- Not deployed.

## What changed in Phase 2: The Game

**Built**
- Game engine: XP, streak, losses, Power, levels and 8 tiers, with every worked example from the spec as a test. All numbers are in `game.config.ts`.
- Ledger: every XP or Power change is a row. Current totals can be rebuilt from it, and a test proves they match.
- Day closeout, on your first request of a new day and from the daily cron. It can't count a day twice. The cron replaces the keep-alive job, at `/api/cron/daily`.
- Corrections: a closed day can be changed for 24 hours, by adding rows and replaying the streak forward.
- Reckoning screen, Battle Log, a live status strip and Power-state warnings.
- Collapse after 3 closeouts at Power 0, and tier demotion after 3 closeouts below the tier's level, with the "armor is failing" warning.
- Placeholder avatars per tier, with aura, eyes, cracks, desaturation and breathing. Ember particles and fog.
- Level-up and tier-up cinematics, skippable, each playing once.
- Motion setting (Full, Reduced, Off), which also respects the device's reduced-motion setting.
- Doom Clock, full screen and compact, with 24 hour segments, block progress, a last-hour alarm and calm gold when everything's done.
- Focus mode: a timer that keeps the screen awake, counts leaving with no penalty, and asks how it went at the end.
- New tables in `supabase/migrations/20261103020000_game.sql`, all with RLS. The ledger and closed days are append-only.

**Decisions made, using the defaults proposed before Phase 0**
- Done and partial score at check-off. Skipped only costs at closeout, so you can change your mind until then.
- XP uses the streak as of the start of that day. Losses use your displayed tier.
- Fractional Power stays as decimals, and bands are ≥70, ≥40 and ≥15, so 69.5 is Steady.
- A day with nothing productive planned is neutral, like a Rest Day.
- "Other" blocks don't touch Power. An unlogged "Other" block isn't marked skipped either, since it can't cost anything.
- The 60-minute YouTube cap applies to XP, losses, Power and planned minutes. Watched videos claim those minutes before skipped ones.
- Tier demotion drops one tier at a time. A collapse at level 1 falls to 0 XP.
- Rest and Shield days don't advance or reset the streak or either counter.
- A correction replays the streak forward, but later days keep the XP they earned.

**Not done yet**
- Nothing has run against your real database or a real midnight. Closeout is tested with simulated dates, and the database function with a test Postgres.
- Art and animation are functional placeholders. Polish is Phase 7.
- Later spec items not built here: the page-transition veil.
- Not deployed. Phase 0's sign-in test and Vercel deploy are still open.

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
