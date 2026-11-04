# Architecture

The big picture of My Schedule Manager: what the pieces are, how data moves, and how it stays private.

Status: **updated at the end of Phase 7, the last planned phase.** Everything described here exists. What's still to come is art, listed in `docs/CHANGELOG.md`.

## 1. System diagram

```mermaid
flowchart LR
  subgraph Device["Your phone or computer"]
    PWA["Browser / installed PWA"]
    SW["Service worker<br/>offline Loop, notifications"]
  end

  subgraph Vercel["Vercel (Hobby)"]
    Proxy["Proxy<br/>the gate on every request"]
    App["Next.js<br/>pages, server actions, API routes"]
    Cron["Vercel Cron<br/>nightly, and Sunday evening"]
  end

  subgraph Supabase["Supabase (Free)"]
    Auth["Auth<br/>Google sign-in"]
    DB[("Postgres<br/>protected by RLS")]
    Timer["Database timer<br/>every five minutes"]
  end

  Google["Google"]
  Groq["Groq AI"]
  Push["Browser push service<br/>Google, Mozilla, Apple or Microsoft"]
  Finnhub["Finnhub<br/>US prices"]
  TW["TWSE and TPEx<br/>Taiwan closing prices"]
  FX["ExchangeRate-API<br/>daily exchange rates"]

  PWA --> Proxy --> App
  App --> Auth
  App --> DB
  Auth <--> Google
  Cron -->|"secret header"| App
  Timer -->|"secret header"| App
  App --> Push --> SW
  PWA <--> SW
  App --> Groq
  App --> Finnhub
  App --> TW
  App --> FX
```

**In one sentence:** every request passes the gate, the app talks to the database as you (so the database's own rules apply), and the browser never holds a secret.

## 2. Component cards

### Auth (built)
- **Does:** signs you in with Google, and throws out anyone who isn't the one allowed account.
- **Owns:** the login session, stored in cookies. Supabase keeps the account record.
- **Called by:** the proxy on every page, and again by pages and server actions.
- **If it fails:** you're treated as signed out and sent to the login page. It never fails open.

### App shell and settings (built)
- **Does:** the sidebar, bottom tabs, status strip, language and timezone.
- **Owns:** the `settings` table and a language cookie.
- **Called by:** every signed-in page.
- **If it fails:** the page shows an error state with a retry button. Your data isn't affected.

### Schedule Loop (built)
- **Does:** weekly templates, the actual blocks on real dates, check-offs, Rest Days and Shields.
- **Owns:** `loop_templates`, `template_activations`, `template_blocks`, `block_instances`, `rest_days`.
- **Called by:** the Loop pages. Later, the game engine and the Oracle through proposals.
- **If it fails:** you see an error and nothing is saved. Existing logs are safe, and generation can safely run again.

### Calendar (built)
- **Does:** month, week, day and agenda views of blocks, events and task deadlines. Events can repeat (daily, weekly, monthly or a custom rule), be dragged to a new time, be found by search, and move in and out of `.ics` files. A repeating event is one row plus its rule, worked out into dates only when the calendar asks. It stays on the calendar and earns no XP, because only a one-off event counts like a block.
- **Owns:** `events`.
- **Called by:** the Calendar page, which asks `/api/calendar` for the dates on screen, plus `/api/calendar/search`, `/import` and `/export`.
- **If it fails:** only the calendar shows an error. Its heavy code downloads only on this page.

### Game Engine (built)
- **Does:** pure maths for XP, Power, levels and tiers, in `engine.ts`. Every formula is written above its function, and your spec's worked examples are its tests.
- **Owns:** `game_ledger` (every change ever) and `game_state` (a fast copy of the current totals).
- **Called by:** check-offs, corrections and Day Closeout.
- **If it fails:** nothing is written, because each change lands whole or not at all. XP and Power can always be rebuilt from the ledger, and a test proves they match.

### Day Closeout, "The Reckoning" (built)
- **Does:** closes each finished day exactly once: unlogged blocks become skipped, then losses, streak and counters apply, and a summary is written.
- **Owns:** `closed_days`, `daily_summaries`.
- **Called by:** your first request of a new day, and the daily cron as backup. The cron also keeps Supabase Free from pausing.
- **If it fails:** the next request or cron run tries again. `closed_days` allows each date once, so no day can count twice.

### Doom Clock and Focus (built)
- **Does:** countdown to midnight and to the end of the current block, plus a full-screen focus timer that keeps the screen awake.
- **Owns:** a focus-broken count on each block.
- **Called by:** the status strip, which opens the full clock, and the Focus link on a block.
- **If it fails:** only the visual stops. No XP or Power depends on it, and leaving focus mode has no penalty.

### Home lobby and warrior (built, art partly finished)
- **Does:** shows the full-screen painting, with the dragon coming out of the sky over the citadel, and the warrior for your tier in front of it. The dragon's wings, claws, head and body move a little, and its eyes and throat glow. His aura, eyes, cracks and color follow your Power state. Lightning, fog, embers and his lines add to it, along with the level-up and tier-up cinematics.
- **Owns:** nothing in the database. It only reflects the game state. Art is in `public/art`, the outlines of the painting's moving parts are in `src/config/lobby-art.ts`, and his lines are in `lines.ts` and the messages files.
- **Called by:** the Home page and status strip. His speech box and key-moment lines run on every page.
- **If it fails:** purely decorative, with your data unaffected. On phones it uses fewer particles, and at the Off motion setting the art holds still.

### Sound and voice (built)
- **Does:** thunder, wind and game sound effects, made live by the browser with no audio files or music licences. His Japanese voice is 21 small clips, made once ahead of time, so the live app needs no voice service.
- **Owns:** your mute choice, saved in this browser only.
- **Called by:** the lobby, and anything that marks a key moment.
- **If it fails:** phones block sound until the first tap, so nothing depends on it. The line is on screen either way.

### Section places (layouts built, paintings still to come)
- **Does:** gives each section its own place in the same world, with its own name plate, accent color, panel shape and arrangement. Behind that is the citadel painting, recolored to that place's light until the place has its own painting.
- **Owns:** nothing. The address decides the place.
- **Called by:** the signed-in layout.
- **If it fails:** the section works as normal on a dark background.

### Dashboard (built)
- **Does:** Home's hero, today's timeline and nine widgets you can open, collapse, hide and drag. The spending, portfolio and Oracle widgets are placeholders until their phases.
- **Owns:** `widget_layouts`, one saved layout for your phone and one for desktop.
- **Called by:** the Home page.
- **If it fails:** the page shows an error state with a retry button. If a save fails, your layout returns to what was saved.

### Goals, projects and tasks (built)
- **Does:** Goal → Project → Task. A project's progress comes from its finished tasks, or a number you set. A goal averages its projects, leaving out paused ones.
- **Owns:** `goals`, `projects`, `tasks`, and `progress_snapshots` for the charts.
- **Called by:** the Goals pages, the dashboard and the calendar, which shows tasks with due dates. Later, the Oracle's tools.
- **If it fails:** an error appears and nothing is saved. Deleting a goal also deletes its projects and tasks, after a confirmation.

### Learning tracker (built)
- **Does:** courses, roadmaps and books, each with units and a percent complete. Tag a block with a track to chart your study minutes per week.
- **Owns:** `learning_tracks`, `learning_units`, and the `track_id` tag on blocks and tasks.
- **Called by:** the Learning pages, the dashboard and the block editor.
- **If it fails:** an error appears and nothing is saved. Deleting a track removes the tag from blocks and tasks, but keeps them.

### Habits (built)
- **Does:** daily or weekly targets, with one tap to check in, a heatmap and streaks. They earn no XP, so they can't count twice with blocks.
- **Owns:** `habits`, `habit_checkins`.
- **Called by:** the Habits page and dashboard widget.
- **If it fails:** an error appears and nothing is saved. Nothing else depends on it.

### AI Oracle (built)
- **Looks like:** a dragon. The standing crimson dragon lives here, behind the chat on a phone and beside it on a computer, and the Oracle's instructions say that's what it is.
- **Does:** chat that reads a short summary of your week and acts only through a fixed list of 13 tools. Reads and goal or task creation happen directly. Schedule changes become proposals you approve, edit or reject.
- **Owns:** `ai_conversations`, `ai_messages`, `ai_proposals`, `ai_actions`, `ai_suggestions`, `ai_rate_limits`, `weekly_reviews`.
- **Called by:** the chat panel, through `/api/oracle/chat`, and the suggestion widget.
- **If it fails:** you get an in-character message, and rate limits retry a couple of times first. Everything else keeps working, because nothing depends on the AI.

### Audit log and Logs page (built)
- **Does:** records every Oracle action, approval, rejection, undo, closeout and correction, shown in **Settings → Logs**.
- **Owns:** `audit_log`, which can only be read and added to.
- **Called by:** the closeout, corrections and every Oracle change.
- **If it fails:** the page shows an error state. Closeouts write their entry in the same transaction as the closeout itself.

### Finance, "The Treasury" (built)
- **Does:** expenses and income in TWD, USD or IDR, repeating transactions, monthly budgets with alerts, and portfolio tracking. Totals are always worked out from the records, never stored.
- **Owns:** `fin_categories`, `transactions`, `recurring_rules`, `budgets`, `trades`, `price_cache`, `fx_rates`, `portfolio_snapshots`.
- **Called by:** Treasury pages, the Home banner and widgets, and the daily cron. The Oracle has no access.
- **If it fails:** a price source being down leaves the last known price showing, and any price or rate can be set by hand. Money trouble in the cron can't stop the day's closeout.

### Vault (built)
- **Does:** organizes links, markdown notes and references to files stored elsewhere, with sections, tags, pins, search and filters. An item can link to one goal, project or learning track, and shows on that page.
- **Owns:** `vault_sections`, `vault_items`.
- **Called by:** Vault pages, and the goal and learning track pages.
- **If it fails:** only the Vault is affected. It holds links, not the files themselves.

### Weekly review (built)
- **Does:** shows any week's planned and done minutes, XP, Power, streak, Rest Days and Shields, goal progress and spending, next to the Oracle's written review and your three answers. A button asks the Oracle to propose changes to next week's loop, which still need your approval.
- **Owns:** `weekly_reviews`.
- **Called by:** the Review page, and Sunday evening's job.
- **If it fails:** without the Oracle, the numbers and your answers still work. The Oracle is never given your money figures.

### Notifications (built)
- **Does:** sends the Sunday review, and whichever optional alerts you turn on: a block starting, open blocks near midnight, and low Power.
- **Owns:** `push_subscriptions`, `notification_log`, and the `notify_` columns of `settings`.
- **Called by:** Vercel Cron on Sunday, and a timer inside the database every five minutes. Vercel's free timers can't run that often, so the database's free one (`pg_cron`) calls the app instead.
- **If it fails:** you miss an alert, and nothing else is affected. Everything still exists in the app. `notification_log` makes sure a timer that runs twice can't send twice.

### Offline (built)
- **Does:** keeps today's Loop readable with no connection, and holds check-offs made offline until you're back. Other pages show a plain notice instead.
- **Owns:** a saved copy of the Loop page in the browser's cache, and the waiting check-offs in the browser's local storage. Nothing new on the server.
- **Called by:** the service worker (`public/sw.js`), started by the app shell.
- **If it fails:** the app works as it did before, needing a connection. A check-off the server refuses, for example because that day has closed, is reported on screen rather than lost silently.

### Backup and restore (built)
- **Does:** downloads everything as one JSON file, and money as CSV spreadsheets. Restore replaces everything with a backup file, after you've downloaded a fresh backup and typed a word to confirm.
- **Owns:** the `restore_backup` database function.
- **Called by:** the Settings page, through `/api/backup/...`.
- **If it fails:** a restore is one single database step, so a bad file changes nothing at all. It needs the server's secret key, so nothing in a browser can ever run it.

## 3. Traced flows

These all describe what really happens today.

### "I mark my Study block as done"
1. You tap **Done** on the phone.
2. The request reaches the **proxy**, which checks your session and the allowlist.
3. A **server action** checks your input with Zod and confirms you're the owner.
4. Any overdue closeout runs first, so you're never working from a day that should be closed.
5. The rules check that the block exists, its day has arrived, and it isn't a rest block.
6. The **game engine** works out what the block should be worth, using the streak at the start of the day.
7. It compares that with what the ledger says the block has already earned, and only the difference is applied. That's why changing Done to Partial just adds a reversing row.
8. One database call, `apply_game_commit`, updates the block, adds the ledger row and updates `game_state` together.
9. The whole shell refreshes, and the status strip shows your new XP and Power.

### How blocks get onto your schedule
1. You open the Loop or Calendar. The server finds the last day already generated.
2. For each new day up to the end of next week, it finds which template was active on that date, using `template_activations`.
3. It copies that weekday's blocks into `block_instances`. The database refuses duplicates, so this is safe to repeat.
4. Days already generated are never redone. That's why a block you add today can't appear on a past day, and why a block you edited stays edited.
5. When you edit a template or switch to another, future blocks you haven't logged or edited are replaced. Anything you touched stays.

### "Midnight closeout runs"
1. Either your first request of the day notices that yesterday isn't closed, or Vercel Cron calls `/api/cron/daily` with its secret header.
2. Any days not generated yet are filled in, so a day you never opened still counts.
3. For each unclosed past day, in date order, the engine works out the result. A planned block still running past midnight makes it wait.
4. Unlogged blocks become **skipped**, and each skipped block costs XP and Power.
5. The streak, Power-zero counter and tier-demotion counter update. Rest and Shield days, and days with nothing productive planned, leave all three unchanged.
6. `apply_game_commit` writes everything as one unit: `closed_days`, the blocks, `game_ledger`, `game_state`, `daily_summaries` and `audit_log`. If that date is already closed, the whole thing is refused, so running twice changes nothing.
7. On your next open, the **Reckoning screen** adds up every summary you haven't seen. Dismissing it marks them seen.

### "I fix yesterday's block after closeout"
1. You open yesterday in the Loop within 24 hours of its closeout, and change the block.
2. The day is scored as it stood then, using that day's starting streak and tier. New `correction` rows go into the ledger, and nothing old is edited.
3. That day's summary is recalculated, and the streak is replayed forward from it. XP earned on later days isn't changed.
4. After 24 hours, the change is refused.

### "I ask the Oracle to move my gym session and approve it"
1. You type the request. The server checks you're the owner, and counts it against the limit of 20 a minute.
2. The server sends the rules, a short summary of your week and your last few messages to Groq. Your notes and titles are marked as data, not instructions.
3. The model asks to call `get_schedule` to find the block's id. It can't touch the database: it can only ask, and the server runs the tool.
4. The model asks to call `propose_block_changes`. The server checks the request with Zod, and checks the real block: it must exist, be this week, and be unlogged. The "before" comes from your data, not from the model.
5. It saves that to `ai_proposals`. **Nothing on your schedule has changed yet.**
6. You see a before-and-after card, and tap **Approve**, **Edit** or **Reject**.
7. On approval, the server checks the proposal hasn't passed its 48 hours and the block hasn't changed since. Only then does it change `block_instances`, and write it to `audit_log`.

### "I add NT$120 of food, then buy a stock"
1. You tap **Add**, type 120 on the number pad and tap **Food**. Tapping the category is what saves it.
2. A server action checks the input with Zod. For foreign money it finds the rate for that date and stores the original amount, the rate and the TWD value together, so later rate changes can't rewrite the past.
3. The page refreshes. Totals and budgets are worked out from the records, and a budget at 80% or 100% raises the banner.
4. Adding a trade first replays every trade by date, and refuses it if you'd be selling shares you didn't hold yet.
5. Once the page is on screen, it asks for any price or rate that's out of date, so a slow source never holds the page up. The numbers update when the answer arrives, and today's portfolio value is saved for the history chart.

### "It's Sunday evening"
1. At about 21:00 Taipei time, Vercel Cron calls `/api/cron/weekly` with the secret.
2. If this week has no written review yet, the app sends the Oracle the week's numbers and your answers, marked as information only, and saves what comes back. Money isn't included. If the Oracle is down, this step is skipped.
3. The app records that this week's push was sent, then sends it to each device that turned notifications on. A device the push service says is gone is forgotten.
4. Your phone shows it, even with the app closed. Tapping it opens the review.

### "I check off a block with no connection"
1. When you opened the app earlier, the service worker saved the Loop page and every file it needs.
2. With no connection, the browser asks for the Loop and the service worker hands over the saved copy.
3. You tap Done. The app sees there's no connection, saves the check-off in this device's storage, and marks the block "Saved on this device".
4. When the connection returns, the app sends each waiting check-off through the normal server rules, then refreshes.
5. If a rule now refuses one, such as that day having closed, you're told which block and why.

### "I restore a backup"
1. The Restore button stays hidden until you've downloaded a backup of what's there now.
2. The browser checks the file looks like a backup, shows how many records it holds, and waits for you to type the word.
3. The file is compressed in the browser, since the free host accepts 4.5 MB per request, and backups shrink to about a tenth.
4. The server unpacks it, checks you're signed in, and calls `restore_backup` using the secret key.
5. That function deletes your rows and inserts the file's in one transaction, meaning all of it happens or none of it does. Every row is put under your account, whatever the file claims.

## 4. Security explained simply

Each layer stops something different, so one failure doesn't expose everything. "Built" means it exists and has tests. Google sign-in and the hook still need a real test once your accounts exist.

1. **Google login only (built).** Blocks password guessing, because there are no passwords to guess. Email sign-up is switched off in Supabase.
2. **Allowlist (built).** Google proves *who* someone is, but anyone can have a Google account. The server compares the email with `ALLOWED_EMAIL`, signs out anyone else and shows "Access denied". If that setting is missing, nobody gets in.
3. **Sign-up gate (built, added beyond the spec).** The allowlist guards our app, but someone could skip the app and talk to Supabase directly with the public key. Two extra locks stop them making an account at all: the Google consent screen is limited to you, and a database hook rejects any other email.
4. **Row Level Security (built).** Rules inside the database itself: you only see rows where `user_id` is yours. Even with a bug in the app or a leaked public key, the database still says no. A test fails if any table is missing RLS.
5. **Server-only secrets (built).** Secrets never get the `NEXT_PUBLIC_` prefix, so they're never sent to the browser. A test scans the browser's code for their names.
6. **Input validation (built).** Zod rejects anything unexpected before it reaches the database, even if someone crafts a request by hand.
7. **Cron secret (built).** Cron endpoints are public URLs, so they require a secret header. Without it the answer is 401.
8. **AI safety (built).** The model only asks to use fixed tools, and each request is re-checked on the server. Tools for logging blocks, money or game settings simply don't exist, so no trick can reach them. Schedule changes wait for your approval. Text from your notes is fenced off as data, so a malicious note can't give it orders, and a limit on tool rounds stops a confused model looping.
9. **Rate limiting (built).** Stops a runaway loop from burning your free AI quota, at 20 requests a minute. It lives in Postgres, because serverless memory doesn't last between requests.
10. **Security headers (built).**
    - CSP tells the browser to run only scripts that carry this request's random nonce, which limits damage from injected code.
    - `X-Frame-Options` stops other sites embedding the app to trick your clicks.
    - `Referrer-Policy` limits what other sites learn about where you came from.
    - `Permissions-Policy` turns off device features the app doesn't use.
11. **Audit log (built).** An append-only record of closeouts and corrections, with AI actions, approvals and undos joining in Phase 4. Even you can't edit or delete rows through the app, so the history can be trusted. The game ledger follows the same rule. Viewing it in Settings arrives with Phase 4.
12. **No personal data in logs (built).** Error paths log nothing personal, because hosted logs are outside the protections above.
13. **Backup (built).** JSON and CSV export with JSON restore, so a mistake or lost account doesn't mean lost data. The backup file holds everything, including Vault notes and money records, so keep it private. It leaves out your account id and the devices that receive notifications.
14. **Offline stays small (built).** The service worker saves only the Loop page, because every other page holds private data with no need to work offline. Signing out clears it, and so does the login page.
15. **Push addresses are checked (built).** The server only sends notifications to the big browsers' push services, so a bad address can't make it call anything else.

### Preview mode
`AUTH_PREVIEW=true` shows the app without a login, so it can be tested before accounts exist. Your data isn't involved: screens use a temporary in-memory store that disappears when the server stops, and a scripted stand-in plays the AI. A preview-only route, `/api/dev/preview-seed`, resets that store so tests can reach things that normally depend on a real midnight. Both only work outside production builds, and tests prove a production build ignores them.

## 5. Key design choices

- **The Home dragon is part of the painting, and still moves.** A painted-in dragon can't move on its own, so soft-edged copies of its parts lie exactly over the picture and move a little. Their outlines are in `src/config/lobby-art.ts`, which both the art script and the page read, so they can't disagree. A new painting needs new outlines.
- **Art effects are baked in, not live.** Cutting those copies, and tinting the Oracle's dragon, happens in `scripts/prepare-art.mjs`. Doing it live would make a phone redo that work on every frame.
- **Only one-off events earn XP.** The spec says so, and it keeps the game honest: a repeating event would create blocks nobody planned in their Loop. To earn XP from something weekly, it belongs in the template.
- **Repeat rules use the calendar world's own format.** Called RRULE, it's what Google Calendar and others use, so `.ics` files keep their repeats. The app accepts daily or slower rules only, because more frequent ones would flood the calendar and some never-matching rules take seconds to reject. The rule library stays on the server, so it adds nothing to what your phone downloads.
- **Restore replaces, it doesn't merge.** Merging two histories of a game with a ledger could produce a total neither of them had. This was the owner's decision.
- **The timer's secret isn't in a migration.** Migrations are public on GitHub. `supabase/timers/notify-timer.sql` has a placeholder instead, and the real value goes into Supabase Vault, which is a Supabase feature unrelated to the app's own Vault.

- **Dark and private means dynamic.** Every page is rendered fresh per request, because each needs a new CSP nonce and a session check. Next's `cacheComponents` is off for that reason.
- **Chinese fonts come from Google at runtime.** Self-hosting them meant about 240 font files on every build. They load only in Chinese, and only after the page appears, so a slow connection to Google can't hold the page back. The device's built-in Chinese font shows until they arrive.
- **The database is changed only by migration files.** Everything in `supabase/migrations/` can recreate the database from nothing.
- **Schedule times are wall-clock times.** A block at 09:00 is stored as date plus 09:00, with no timezone. Changing timezone changes what "today" means, but never moves a block. The calendar runs in "UTC" mode purely so that it doesn't shift them, and it's told the current time in your timezone.
- **Rules and storage are separate.** The schedule rules (`service.ts`, `logic.ts`) talk to storage through one interface (`repo.ts`), with a Supabase version and an in-memory version. This lets the rules be fully tested without a database.
- **Generation is lazy.** Nothing runs in the background. Blocks are created when you open a schedule page, which suits a free plan with limited scheduled jobs.
- **The ledger stores what really happened.** If a gain is capped because Power is already 100, the row records the amount that was actually applied. That's what lets the totals be rebuilt exactly by adding up the rows.
- **Each database call is a network trip, so calls are kept few.** A page load remembers each read for that one request, closeout skips its work when there's nothing to close, and heavy libraries (charts, calendar, dragging) only download when they're on screen. The database and the Vercel functions both run in Tokyo, close to Taiwan. Keep them in the same region, or every call crosses an ocean.
- **The AI provider is a setting.** The app speaks the common OpenAI chat format, so changing `AI_PROVIDER`, `AI_BASE_URL` and `AI_MODEL` switches provider with no code change. The default is `openai/gpt-oss-20b` on Groq, because it supports tools on the free tier and has no retirement date.
- **The Oracle is kept deliberately short-winded.** Free tiers allow few tokens per minute, so it gets a capped summary, its last 6 messages, and one tool request per step.
- **Charts follow fixed rules.** Colours were checked with a colour-blindness validator rather than chosen by eye. A learning track keeps its colour, there's only ever one axis, and every chart has a table view.
- **Money is rounded to cents at every step.** Computers can't hold values like 0.1 exactly, so every money result passes through one rounding function, and budget percentages are worked out in whole cents.
- **Holdings use the average-cost method.** A sale takes shares out at the average cost so far. Each trade keeps its own exchange rate, so profit in TWD includes any gain from the currency moving.
- **A stock's currency follows its market.** US stocks are in USD and Taiwan stocks in TWD, so one holding's average cost can never mix two currencies.
- **Outside sources sit behind one interface.** `market-data.ts` is the only code that talks to Finnhub, TWSE, TPEx and the rate source. Tests and preview mode use fixed answers instead, so they never touch the network.
- **Categories are archived, never deleted.** Old records must keep their category. A default category stores a key rather than a name, so it shows in your language until you rename it.
- **Painted art, moved by code.** Images are generated once, cut out and compressed by `scripts/prepare-art.mjs`, and animated only with movement and fading, which phones handle smoothly. The dragon is three copies of one picture, with the wings cut out so they can beat around the shoulders.
- **The art never copies its references.** The owner's reference pictures only guided the style, because the code and art are public and nobody here knows who owns them.
- **His voice is checked, not assumed.** The voice engine guesses how to read kanji, and it guessed some wrong, such as reading 立て ("stand") as "date". `voice-lines.ts` spells those lines out by hand. Check any new line the same way.
- **The Vault treats saved text as untrusted.** Addresses must be `http` or `https`, checked in both the form's schema and the database, so a saved item can't hold a `javascript:` link. Notes are turned into a page on the server with raw HTML and pictures removed, so a pasted note can't run code or tell another site you opened it. The Oracle has no way to read the Vault.
- **Vault search runs in your browser.** The page loads your items once, and each keystroke filters them with no trip to the server. It's instant, and it suits one person's collection.
- **Every game change is one transaction.** The server can't make several database calls safely in a row, because a crash midway would leave things half done. So one Postgres function, `apply_game_commit`, does it all. It also checks a version number, so two tabs can't overwrite each other's changes.
