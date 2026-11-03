# My Schedule Manager — Product & Build Spec

> Owner: Linus (single user). Builder: Claude Code.
> This file is the source of truth. Build in phases (Section 13). Do **not** build everything at once.

---

## 0. Rules for Claude Code

1. **Work one phase at a time.** Finish the phase, meet its Definition of Done, report, then **stop** and wait for the owner to say "next phase".
2. **Ask instead of guessing.** If something in this spec is ambiguous, contradictory, or impossible on the free tiers in Section 2, ask the owner before coding it.
3. **Check current docs, not memory.** Library APIs, free-tier limits and model names change. Verify against official docs at build time.
4. **The owner wants to understand the system, not every line of code.** Keep the docs in Section 4 up to date every phase. That is a deliverable, not an extra.
5. **Every tunable number lives in config**, never scattered through the code. Game numbers go in `src/config/game.config.ts`, finance defaults in `src/config/finance.config.ts`.
6. **Mobile-first.** Every screen must work on an Android phone viewport (≈390×844) and on desktop.

---

## 1. Product summary

A personal web app (installable PWA) that treats the owner's week as a **repeating loop** of time blocks. The owner logs each block as **done / partial / skipped**. That feeds a game engine (**XP, Power, Levels, 8 Tiers**), which drives a dark-fantasy **avatar** that grows more epic with productivity and visibly weakens with slacking.

Around that core:
- calendar
- "Doom Clock" countdown and focus mode
- AI manager ("The Oracle")
- finance (expenses, income, budgets, portfolio)
- storage hub ("The Vault")
- goals / projects / tasks
- learning tracker
- habits
- weekly review
- push notifications
- export / backup

**Visual identity:** dark, crimson, "final boss" energy. Animated, but never laggy.

---

## 2. Hard constraints

| Area | Constraint |
|---|---|
| Users | Single user. Google login. Only one allow-listed email may enter. |
| Budget | **$0/month.** Vercel Hobby + Supabase Free + free API tiers. |
| Vercel Hobby cron | Runs **at most once per day**, and timing is only guaranteed **within the hour**. Design around this (Section 7.5). |
| Supabase Free | Projects with low activity over 7 days get paused. The daily cron in 7.5 must touch the DB, which keeps it active. |
| AI | Free tier of **Groq** (OpenAI-compatible API, supports tool calling). Must be swappable via env vars (Section 7.12). |
| Devices | Primary: Android phone (Chrome, installed PWA). Secondary: desktop browser (macOS / Windows). |
| Timezone | Default `Asia/Taipei`, changeable in settings. All "day" logic uses the owner's timezone, never UTC. |
| Language | UI switchable between **English** and **繁體中文**. No hard-coded UI strings. |
| Currency | Base currency **TWD**. Also supports USD and IDR. |

---

## 3. Tech stack

- **Framework:** Next.js (App Router) + TypeScript (strict mode)
- **Styling / UI:** Tailwind CSS + shadcn/ui, restyled to the theme in Section 6
- **Animation:** Framer Motion for UI. Canvas 2D (or a light library) for particles.
- **Backend:** Supabase — Postgres, Auth (Google provider), Row Level Security, Storage (only for avatar images)
- **Validation:** Zod on every server action and API route
- **Charts:** Recharts (or equivalent)
- **Calendar UI:** a library with month/week/day views plus drag-and-drop, under a **free** license (verify the license)
- **i18n:** next-intl (or equivalent)
- **PWA:** web app manifest + service worker + Web Push (VAPID keys)
- **Tests:** Vitest for logic (game engine and finance math are mandatory). Playwright for a few smoke flows.
- **Hosting:** Vercel Hobby. Use the latest stable versions of everything.

---

## 4. Documentation the owner must be able to read

The owner wants the **big picture**: the major components, how data flows, and how security works, without reading every file. Create and maintain:

**`docs/ARCHITECTURE.md`**

1. **One-page system diagram** (Mermaid) showing:
   - Browser/PWA ↔ Next.js (pages, server actions, API routes) ↔ Supabase (Auth + Postgres)
   - External services: Groq, Finnhub, the Taiwan price source, the FX source
   - Vercel Cron
2. **Component cards.** One per major component (Auth, Schedule Loop, Game Engine, Day Closeout, Calendar, Doom Clock/Focus, Dashboard, AI Oracle, Finance, Vault, Notifications). Each card has 3–6 plain-language lines:
   - what it does
   - what data it owns
   - who calls it
   - what happens if it fails
3. **Three traced flows**, step by step, from tap to database and back:
   - "I mark my Study block as done"
   - "Midnight closeout runs"
   - "I ask the Oracle to move my gym session and approve it"
4. **Security explained simply.** Each layer from Section 5, one short paragraph each: what it blocks and why it's there.

**Other docs**
- **`docs/SETUP.md`:** how to recreate the whole project from zero (Supabase project, Google OAuth, env vars, Vercel deploy, VAPID keys, Groq/Finnhub keys). Each step says **why** it exists, not just what to click.
- **`docs/GLOSSARY.md`:** short definitions of terms the owner will meet (RLS, server action, service worker, VAPID, idempotent, ledger, cron, etc.).
- **`docs/CHANGELOG.md`:** a "What changed in Phase N" section added at the end of each phase.

Code comments: only for non-obvious logic. Game engine functions must state their formula in a doc comment.

---

## 5. Security

1. **Login:** Supabase Auth with the Google provider only. Disable email/password signups.
2. **Allowlist:** after login, the server checks `email === ALLOWED_EMAIL` (env var). If it doesn't match, sign out immediately and show "Access denied". Check on the server, never only in the browser. Sign-ups are also blocked at the source, by a Supabase "Before User Created" hook and a Google test-user limit, so a stranger can't create an account by going straight to Supabase.
3. **Row Level Security:** enabled on **every** table, with policies `user_id = auth.uid()`. Even a leaked publishable key can't read the data.
4. **Server-only secrets:** `GROQ_API_KEY`, `FINNHUB_API_KEY`, `SUPABASE_SECRET_KEY`, `VAPID_PRIVATE_KEY` and `CRON_SECRET` are never prefixed `NEXT_PUBLIC_` and never reach the browser. Document every var in `.env.example`.
5. **Input validation:** Zod schemas on every mutation. Reject anything not in the schema.
6. **Cron endpoints** require `Authorization: Bearer ${CRON_SECRET}`.
7. **AI safety:**
   - The model never touches the database directly. It can only call the typed tools in 7.12, and every tool re-validates its input on the server.
   - Tools that need approval create a *proposal* and change nothing until the owner approves it.
   - Text from notes, links or the Vault is passed to the model as data, never as instructions.
8. **Rate limiting** on the AI endpoint (e.g. 20 requests/min) to protect the free quota.
9. **Security headers:** CSP, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
10. **Audit log:** every AI action, approval, undo and day closeout is written to an audit table, viewable in Settings → Logs.
11. **No personal data or secrets in server logs.**
12. **Backup:** full JSON export of all data, CSV export for finance, and JSON import to restore.

---

## 6. Design system — "Final Boss"

**Palette** (define as Tailwind tokens and a full scale for each)

| Token | Value (starting point) | Use |
|---|---|---|
| `bg` | `#0a0a0c` | page background |
| `surface-1/2` | `#121216` / `#1a1a20` | cards, panels |
| `crimson` | `#dc143c` (scale 50–950) | primary accent, Power, danger |
| `ember` | `#ff6a2b` | highlights, particles |
| `bone` | `#e8e4dc` | main text |
| `ash` | `#8a8580` | secondary text |
| `gold` | `#d4af37` | **only** level-up / tier-up moments and "all blocks done" |

**Typography**
- Headings: a free display font with a gothic or serif edge (e.g. Cinzel).
- Body: Inter.
- Chinese: Noto Serif TC for headings, Noto Sans TC for body.

**Motifs:** runes, embers, cracked stone, glowing crimson edges, slow fog.

**Motion**
- **Home:** drifting ember particles, slow fog layer, avatar idle "breathing" and aura.
- **Interactions:** cards glow crimson on hover/press. Page transitions as a short dark "veil" fade.
- **Level-up:** full-screen cinematic, about 3 s, skippable, gold burst.
- **Tier-up:** a bigger version, with the new tier name revealed.
- **Performance tiers:** full motion on desktop. On mobile, about 70% fewer particles and no heavy blur. Respect `prefers-reduced-motion`. Settings toggle: Motion = Full / Reduced / Off. Pause canvases when the tab is hidden. Target 60 fps.

**Accessibility:** text contrast at least WCAG AA. Done / partial / skipped use **icons plus color**, never color alone.

**Flavor text:** empty states and toasts use short dark-fantasy lines (e.g. "No blocks remain. The night is yours."). Keep them in i18n files, in both languages.

---

## 7. Features

### 7.1 App shell, auth, settings

**Navigation**
- Desktop: left sidebar.
- Mobile: bottom tab bar with Home, Loop, Calendar, Oracle, More.

**Status strip** (fixed at the top of every page):
- mini avatar portrait
- tier name, level, XP bar
- Power bar
- compact Doom Clock

**Settings**
- language
- timezone
- motion level
- notifications
- categories and weights (read-only view of game config)
- avatar images upload
- "about me" text for the Oracle
- export / import
- logs

### 7.2 Schedule loops (the core)

**Templates**
- The owner can have several weekly templates. Seed three: **Semester**, **Exam Week**, **Holiday**.
- Exactly one is active. Switching takes effect from a date the owner chooses.

**Template blocks:** weekday (Mon–Sun), start time, end time, category, title, notes.

**Categories and default XP weights** (in `game.config.ts`):

| Category | Weight |
|---|---|
| Project work | 1.2 |
| Study | 1.0 |
| Gym | 1.0 |
| Reading | 0.8 |
| Useful YouTube | 0.5 (max 60 min/day counted) |
| Other | 0 (no XP, no penalty) |

**Block instances**
- Generated from the active template for actual dates. Generate lazily for the current and next week.
- Editing an instance changes that day only. "Also apply to template" is an explicit option with a confirmation.
- Overlapping blocks show a warning.

**Check-off:** each instance can be marked done / partial / skipped, with an optional note.
- It can be changed freely until that day's closeout.
- After closeout, a correction is allowed within 24 h. It is recorded as reversing ledger entries (7.4), never by editing history.

**Rest Day:** 1 per week, declared **before** the day starts. Planned blocks become "rest": no XP, no loss, and the streak is neither broken nor extended.

**Shield (sick / emergency):** 3 per calendar month, can be declared the same day. Same effect as a Rest Day.
- Both are shown and counted in the weekly review so they can't be abused silently.
- Their limits are configurable.

### 7.3 Calendar

- **Views:** month, week, day, agenda.
- **Shows:** loop block instances, one-off events, and task deadlines.
- **Event editing:** create, edit, delete, drag to move or resize; all-day and multi-day events; recurring events (daily / weekly / monthly / custom RRULE); color by category; search; jump to date.
- **XP:** a one-off event with a productive category behaves like a block (can be checked off, earns XP, gets closeout). Events with category "Other" are plain events.
- **Phase 7 extra:** `.ics` import (e.g. the university timetable) and export.

### 7.4 Game engine — XP, Power, Levels, Tiers

All constants live in `src/config/game.config.ts`. Pure functions, fully unit-tested, using **at least the worked examples below as test cases**.

#### 7.4.1 Earning XP (done / partial blocks)

```
XP = floor( minutes × weight × completion × streakMult )

completion:  done = 1.0   partial = 0.5   skipped = 0
streakMult = min( 1 + 0.05 × streakDays, 1.5 )
Useful YouTube: only the first 60 minutes per day count.
```

Worked example (test case): 90 min Study, done, 4-day streak
1. streakMult = 1 + 0.05 × 4 = 1.20
2. 90 × 1.0 (weight) = 90
3. 90 × 1.0 (done) = 90
4. 90 × 1.20 = 108 → **108 XP**

#### 7.4.2 Streak

A day **counts** toward the streak if:

```
(doneMinutes + 0.5 × partialMinutes) ≥ 0.70 × plannedProductiveMinutes
```

Worked example (test case): planned 300 min, done 180, partial 80
1. 0.5 × 80 = 40
2. 180 + 40 = 220
3. 0.70 × 300 = 210
4. 220 ≥ 210 → **counts**

A day that doesn't count resets the streak to 0. Rest/Shield days are skipped over: they neither break nor extend it.

#### 7.4.3 Losing XP (skipped blocks), scaled by tier

The higher the tier, the harsher the loss (owner's explicit request).

```
XP lost = floor( minutes × weight × lossFactor(tier) )
lossFactor(tier) = 0.25 × tier        → T1 = 0.25 … T8 = 2.0
Partial blocks lose nothing (they just earn half).
Total XP never goes below 0.
```

Worked examples (test cases): 60 min Study skipped
- Tier 1: 60 × 1.0 × 0.25 = **15 XP lost**
- Tier 5: 60 × 1.0 × 1.25 = **75 XP lost**
- Tier 8: 60 × 1.0 × 2.00 = **120 XP lost**

#### 7.4.4 Power (0–100, starts at 100)

```
done:     + minutes / 20
partial:  + minutes / 40
skipped:  − minutes / 10
clamp to [0, 100]
```

Worked example (test case): Power 50, then 60 min done, then 60 min skipped
1. 60 / 20 = 3 → 50 + 3 = 53
2. 60 / 10 = 6 → 53 − 6 = **47**

**Collapse rule:** if Power is 0 at **3 consecutive closeouts**, the owner loses 1 level. Set total XP to the threshold of (current level − 1), then reset the counter.

#### 7.4.5 Levels

```
XP needed for level L  =  50 × L²
level = max( 1, floor( sqrt( totalXP / 50 ) ) )
```

Test: totalXP 5,000 → 5,000 / 50 = 100 → sqrt(100) = 10 → **level 10**

#### 7.4.6 Tiers (8)

| Tier | Name | Reached at level | Total XP | ≈ Days at 360 XP/day |
|---|---|---|---|---|
| 1 | Hollow Squire | 1 | 0 | start |
| 2 | Ashen Knight | 8 | 50 × 64 = 3,200 | 3,200 / 360 ≈ 9 |
| 3 | Shadow Warden | 16 | 50 × 256 = 12,800 | 12,800 / 360 ≈ 36 |
| 4 | Bloodbound Reaver | 25 | 50 × 625 = 31,250 | 31,250 / 360 ≈ 87 |
| 5 | Dread Warlord | 35 | 50 × 1,225 = 61,250 | 61,250 / 360 ≈ 170 |
| 6 | Abyss Sovereign | 45 | 50 × 2,025 = 101,250 | 101,250 / 360 ≈ 281 |
| 7 | Crimson Tyrant | 57 | 50 × 3,249 = 162,450 | 162,450 / 360 ≈ 451 |
| 8 | **The Eclipse** (Final Boss) | 70 | 50 × 4,900 = 245,000 | 245,000 / 360 ≈ 681 |

**Tier demotion hysteresis:** the level can drop immediately when XP drops. The **tier** only drops if the level stays below that tier's threshold at **3 consecutive closeouts**. This prevents flicker and makes a tier loss feel like an event. Show a "Your armor is failing" warning during those days.

#### 7.4.7 Power → visual state

| Power | State | Visual |
|---|---|---|
| 70–100 | Empowered | full aura, bright eyes, strong particles |
| 40–69 | Steady | normal aura |
| 15–39 | Wounded | dim aura, cracks overlay, slight desaturation |
| 0–14 | Broken | heavy cracks, strong desaturation, flickering aura, "Broken" label |

#### 7.4.8 Ledger

Every XP or Power change is a row in `game_ledger`: date, source (block / closeout / correction / collapse), deltaXP, deltaPower, reason, tier at the time.
- The current state is derived from the ledger. Cache it in `game_state` for speed, but it must be recomputable.
- Show the ledger as a **"Battle Log"** page.

### 7.5 Day closeout — "The Reckoning"

For each past day that is not closed yet, in date order:
1. Mark unlogged planned blocks as **skipped**.
2. Apply XP losses and Power changes.
3. Update the streak, the Power-zero counter and the tier-demotion counter.
4. Write a daily summary row.

**Idempotent:** a `closed_days` table with a unique `(user_id, date)` constraint. Running it twice changes nothing.

**Triggers** (both required, because Vercel Hobby cron is daily and imprecise):
1. **Lazy:** on any authenticated request, if the last closed day is before yesterday (owner's timezone), run the closeout first.
2. **Cron backup:** Vercel cron `0 16 * * *` UTC (= 00:00–00:59 Taipei). This also keeps Supabase active.

**Reckoning screen:** on the first app open after a closeout, show a dramatic summary:
- XP gained and lost
- Power change
- blocks skipped
- streak
- tier warnings

Dismiss to enter.

### 7.6 Doom Clock (countdown) and focus mode

There are **two countdowns:** time to 00:00 (owner's timezone) and time to the end of the current block.

**Visual concept, full-screen "Doom Clock"**
- **Outer ring:** 24 rune segments, one per hour. Passed hours have burned out to ash-grey. The current hour pulses crimson.
- **Inner ring:** progress of the current block.
- **Center:** large numerals with the time remaining until 00:00.
- **Particles:** embers drift inward toward the center.
- **Last hour of the day, if planned blocks are still open:** the screen-edge vignette pulses red like a heartbeat, with the text "N blocks remain. The Eclipse watches."
- **All blocks done:** the ring turns calm gold, the embers slow down, and it shows "The night is yours."
- **Compact version:** shown in the status strip. Tap it to open the full screen.

**Focus mode**
- Started from a block. Full-screen timer with the Doom Clock styling.
- Uses the Screen Wake Lock API if supported.
- **Leaving the tab or app** (Page Visibility API): show a warning toast on return and increment a "focus broken" counter on that block. **No XP/Power penalty** (owner's choice).
- When the timer ends, prompt the owner to mark the block done or partial.

### 7.7 Dashboard (Home)

- **Hero:** large animated avatar with tier name, level and Power state, plus today's loop as a horizontal timeline.

**Widgets**

| Widget | Default |
|---|---|
| Goal/project progress | **open** |
| Today's loop | collapsed |
| Learning progress | collapsed |
| Streaks/habits | collapsed |
| Spending this month | collapsed |
| Portfolio | collapsed |
| Oracle suggestion | collapsed |
| Upcoming events | collapsed |
| Weekly stats chart | collapsed |

- Each widget can be **open**, **collapsed** (one tap to expand) or **hidden**.
- Widgets can be dragged to reorder.
- The layout is saved separately for mobile and desktop.

### 7.8 Goals → Projects → Tasks

- **Goal:** title, "why it matters", target date, status.
- **Project:** belongs to a goal. Progress % is computed from its tasks, or set manually.
- **Task:** title, due date, status, estimate, category. Tasks with due dates appear on the calendar.
- **Charts:** progress is snapshotted daily so progress-over-time charts work.

### 7.9 Learning tracker

- **Tracks:** courses, roadmap stages, books. Each has units/stages with % complete.
- **Linking:** blocks and tasks can be tagged with a track. Study minutes per track per week are charted.

### 7.10 Habits

- **Habits** with a target, e.g. Gym 4×/week, sleep before 01:00, protein target met (yes/no).
- **Display:** check-in heatmap and streaks.
- **No XP** by default, to avoid double-counting with blocks. A configurable bonus can be added later.

### 7.11 Weekly review (Sunday)

**Push notification:** Sunday 21:00 Taipei. Vercel cron `0 13 * * 0` UTC fires between 21:00 and 21:59 Taipei.

**Review page**
- **Stats:** planned vs done minutes per category, XP gained and lost, Power trend, streak, Rest/Shield used, spending summary, goal progress.
- **Oracle-written review:** generated automatically.
- **Three reflection prompts for the owner:** what worked, what didn't, next week's focus. Saved.
- **"Adjust next week's loop":** the Oracle proposes changes, which need approval.

### 7.12 AI manager — "The Oracle"

**UI**
- Chat panel: side drawer on desktop, full-screen sheet on mobile. Streaming responses.
- Replies in the language of the owner's message.

**Provider**
- Groq, via its OpenAI-compatible API.
- Config: `AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL`. Pick a current Groq model that supports tool calling (check Groq's docs at build time).
- Switching provider must be an env change, not a code rewrite.
- On a rate-limit error, show an in-character message and retry with backoff.

**Context sent per request** (keep it compact, since free tiers have low tokens-per-minute; summarize, don't dump):
- today's and this week's blocks with status
- active template summary
- goals / projects / tasks summary
- game state
- learning and habits summary
- the owner's "about me" text from Settings

**Tools and permissions**

| Tool | Effect | Approval |
|---|---|---|
| `get_schedule`, `get_goals`, `get_game_state`, `get_learning`, `get_habits` | read | — |
| `recommend_next_action` | read, returns a suggestion | — |
| `propose_block_changes` (this week's instances) | write | **owner must approve** |
| `propose_template_changes` (permanent loop) | write | **owner must approve** |
| `create_goal`, `create_project`, `create_task` | write | auto |
| `update_progress` (project / learning %) | write | auto |
| `write_weekly_review` | write | auto |

**The Oracle can never:**
- mark blocks done, partial or skipped (only the owner can, to protect XP integrity)
- touch finance data
- change game config
- delete anything outside an approved proposal

**Approval card:** shows a before/after diff with Approve / Edit / Reject. Proposals expire after 48 h.

**Auto actions** appear in chat as "done" cards with **Undo** (available for 7 days). Everything is written to the audit log.

**Suggestion widget:** regenerated at most 3 times per day and cached, to save quota.

### 7.13 Finance

**Transactions (expenses and income)**
- **Fields:** amount, currency (TWD / USD / IDR), date, category, note, optional payment method.
- **Foreign currency:** store the original amount, the FX rate used, and the converted TWD amount.
- **Quick add:** on the phone, no more than 3 taps with the number pad first.
- **Recurring transactions** (rent, subscriptions) are created automatically.

**Default categories** (editable)
- Expense: Food, Transport, Rent/Housing, Utilities & Phone, Education, Health & Fitness, Shopping, Entertainment, Subscriptions, Travel, Gifts, Other.
- Income: Allowance, Part-time, Scholarship, Investment income, Other.

**Views:** daily, monthly and yearly. Totals, breakdown by category, trends, income vs expense, net savings.

**Budgets:** a monthly budget per category, with in-app alerts at 80% and 100% (banner plus dashboard widget).

**Portfolio**
- **Trades:** buy/sell, symbol, market (US / TW), quantity, price, fee, currency, date. Dividends are recorded as income linked to a holding.
- **Shows:** holdings, average cost, market value (in TWD and original currency), unrealized and realized P/L, allocation by market and by holding, and a value-history chart from daily snapshots.
- **US prices:** Finnhub free API, called server-side, cached about 15 min during market hours.
- **TW prices:** find a free, reliable source at build time (e.g. official TWSE open data). If none is reliable, fall back to manual price entry. Report the choice to the owner.
- **FX** (USD→TWD, IDR→TWD): a free source cached daily, with manual fallback.
- **Manual override:** any price can be set by hand.
- **Label:** "Tracking only. Not investment advice."

### 7.14 The Vault (storage hub)

A **hub, not a file host.** It organizes links and notes pointing to where files already live (Google Drive, GitHub, websites, YouTube, etc.).

- **Item types:** link, note (markdown), file reference (a link to a file elsewhere).
- **Fields:** title, section, tags, description, linked goal/project/learning track, pinned.
- **Default sections** (editable): Courses, Projects, Learning, Finance, Personal.
- **Browsing:** search; filter by section, tag and type. Icon by domain (Drive, GitHub, YouTube, PDF…).
- **No file uploads in v1**, except avatar images (Section 9).

### 7.15 Notifications

- **Mechanism:** Web Push via service worker and VAPID, plus an in-app guide for installing the PWA on Android Chrome.
- **On by default:** only the **Sunday weekly review**.
- **Available in Settings, off by default:** block start, 30 min before midnight with open blocks, Power below 30%.
  - These need sub-daily scheduling, which Vercel Hobby cron cannot do.
  - Investigate a free option (e.g. Supabase `pg_cron` calling an endpoint). If none is free and reliable, show them as in-app alerts only, and say so in the docs.

### 7.16 i18n

- **Languages:** English and 繁體中文, switchable in Settings. Dates and numbers use the active locale.
- **Translations:** every string, including flavor text, lives in message files.

### 7.17 PWA and offline

- Installable on Android, with an app icon in the theme.
- **Phase 7:** offline read of today's loop. Check-offs made offline are queued and synced when back online.

---

## 8. Data model (outline — Claude Code finalizes)

Every table has `id`, `user_id`, `created_at`, `updated_at`, and an RLS policy.

**Schedule:** `loop_templates`, `template_blocks`, `block_instances`, `events`, `rest_days`

**Game:** `game_ledger`, `game_state`, `closed_days`, `daily_summaries`

**Goals, learning, habits:** `goals`, `projects`, `tasks`, `progress_snapshots`, `learning_tracks`, `learning_units`, `habits`, `habit_checkins`

**Weekly review:** `weekly_reviews`

**Oracle:** `ai_conversations`, `ai_messages`, `ai_proposals`, `ai_actions`

**Finance:** `fin_categories`, `transactions`, `recurring_rules`, `budgets`, `trades`, `price_cache`, `fx_rates`, `portfolio_snapshots`

**Vault:** `vault_sections`, `vault_items`

**System:** `push_subscriptions`, `widget_layouts`, `settings`, `audit_log`

---

## 9. Avatar art pipeline

**Owner-supplied images**
- Uploaded later in Settings, stored in Supabase Storage.
- **Format:** 8 images, one per tier. Transparent PNG/WebP, portrait about 1024×1536.
- **Consistency:** same pose and framing across all tiers.
- **Optional:** a `broken` variant per tier.

**Placeholders until then:** procedural SVG/canvas avatars per tier. A dark silhouette with a rune halo whose complexity grows with the tier.

**Code-driven effect layers on top of any image**
- aura particles: color and intensity by tier and Power
- crimson eye-glow point (position configurable per tier)
- cracks overlay: by Power state
- desaturation: by Power state
- idle "breathing": scale 1.000–1.015, about 4 s loop
- level-up and tier-up burst

---

## 10. Non-functional requirements

- **Testing:** game engine and finance math have unit tests, including every worked example in this file.
- **Code checks:** typecheck and lint pass before a phase is marked done.
- **States:** every list has loading, empty (with flavor text) and error states.
- **Performance:** no layout jank on a mid-range Android phone. Lazy-load heavy views (charts, calendar, Doom Clock).
- **Time logic:** all "today" logic is computed in the owner's timezone. Test the 00:00 boundary.

---

## 11. Out of scope for v1

- multi-user / public signup
- native mobile app
- broker or bank auto-sync
- general file uploads
- Oracle finance tools

---

## 12. Owner preferences for how Claude Code works

- Explain big components and flows, not line-by-line code.
- Keep phase reports short:
  - what was built
  - how to try it
  - decisions the owner needs to make
  - known limitations

---

## 13. Build phases

Each phase's **Definition of Done:**
1. features work on desktop and an Android-size viewport
2. tests, typecheck and lint pass
3. docs updated (Section 4)
4. deployed to Vercel
5. short report given to the owner, then **stop**

| Phase | Scope |
|---|---|
| **0 — Foundation** | Next.js + TS + Tailwind + shadcn setup; Supabase project; Google OAuth; allowlist; RLS baseline; theme tokens and fonts; app shell (sidebar / bottom nav, status strip placeholder); i18n EN/繁中; PWA manifest; `.env.example`; `SETUP.md`, `ARCHITECTURE.md` v1, `GLOSSARY.md`; deploy. |
| **1 — The Loop** | Templates (Semester / Exam / Holiday), template editor, block instances, check-off, Rest Day / Shield, basic calendar (month / week / day) showing blocks and one-off events. |
| **2 — The Game** | Game engine with tests; ledger; Day Closeout (lazy + cron); Reckoning screen; avatar placeholders and effect layers; level-up / tier-up cinematics; Battle Log; Doom Clock; focus mode. |
| **3 — Command Center** | Dashboard widgets (drag, collapse, hide, saved layout); goals / projects / tasks; learning tracker; habits; progress snapshots and charts. |
| **4 — The Oracle** | Groq integration with provider abstraction; tools; proposals with approval cards; auto actions with undo; audit log; suggestion widget; rate limiting. |
| **5 — The Treasury** | Transactions, categories, recurring, budgets with alerts, daily / monthly / yearly views; portfolio (trades, holdings, P/L, US prices via Finnhub, TW price source or manual, FX). |
| **6 — The Vault** | Sections, items, tags, linking to goals / projects / tracks, search and filter. |
| **7 — Rituals & Polish** | Weekly review + Sunday push; optional notifications; avatar image upload; JSON / CSV export and import; `.ics` import / export; offline queue; animation and performance polish; final docs pass. |

---

## Appendix A — Prompts for the owner's 8 avatar images

Use the **same base prompt** for every tier so pose and framing match. Then add the tier line. Keep the character original: no references to existing game or movie characters.

**Base:**
> Full-body portrait of an original dark-fantasy armored warrior, front-facing, standing centered, identical pose and framing, black and crimson palette, glowing crimson eyes visible through the helmet, dramatic rim lighting, painterly 2D game art, plain flat dark background, no text, no logo.

| Tier | Add to the base prompt |
|---|---|
| 1 Hollow Squire | worn leather and dented iron, chipped short sword, no aura, humble and lean |
| 2 Ashen Knight | grey ash-covered plate armor, faint ember sparks around the feet |
| 3 Shadow Warden | dark plate with a tattered shadow cloak, rune-marked shield, wisps of black smoke |
| 4 Bloodbound Reaver | spiked armor with glowing crimson veins, long curved blade, red mist |
| 5 Dread Warlord | massive horned helm, heavy pauldrons, torn war banner, burning embers in the air |
| 6 Abyss Sovereign | obsidian armor, floating rune rings orbiting the body, crown of black flame |
| 7 Crimson Tyrant | towering stature, flaming blood-red greatsword, cracked ground beneath, wings of smoke |
| 8 The Eclipse | colossal final-boss presence, black-and-gold armor, a solar-eclipse halo with a crimson corona behind the head |

Remove the background afterwards (e.g. with any background-remover) and upload in Settings → Avatar.
