# Glossary

Short definitions of terms you'll meet in this project.

| Term | Meaning |
|---|---|
| **allowlist** | The list of who may enter. Here, one Google account. |
| **anon key / service_role key** | Supabase's older key names, being retired by the end of 2026. Replaced by the publishable and secret keys. |
| **API route / route handler** | A server URL that returns data rather than a page, such as the cron endpoint. |
| **App Router** | The way Next.js organizes pages: folders under `src/app` become URLs. |
| **activation** | A record saying "this template is active from this date". The latest one on or before a date wins. |
| **audit log** | An append-only record of important actions, kept for later review. |
| **auth hook** | Your own code that Supabase runs during sign-in. Ours rejects sign-ups from any other email. |
| **Battle Log** | The screen showing your ledger: every XP and Power change, and why. |
| **block instance** | One real block on one real date, such as "Study, Tuesday 3 November, 09:00". Copied from a template block, and it's what you check off. |
| **client component** | UI code that runs in the browser, needed for interactivity. Never holds secrets. |
| **closeout** | "The Reckoning": the once-per-day process that settles a finished day. |
| **collapse** | The penalty for Power sitting at 0 for 3 closeouts in a row: you lose one level. |
| **correction** | Changing a block after its day closed, allowed for 24 hours. It adds new ledger rows and never edits old ones. |
| **cron** | A job that runs on a schedule. Vercel Hobby allows each job to run once per day. |
| **CSP (Content Security Policy)** | A header telling the browser which scripts and connections to allow. It limits damage from injected code. |
| **environment variable (env var)** | A setting stored outside the code, such as a key. Kept in `.env.local` and on Vercel. |
| **heatmap** | A grid of days, where a filled square means something happened that day. Used for habits. |
| **hysteresis** | Waiting before reacting, to prevent flicker. Your tier only drops after 3 closeouts below its level. |
| **i18n** | "Internationalization": making the app work in several languages. Text lives in `messages/`. |
| **idempotent** | Safe to repeat: running it twice has the same result as once. Closeout must be. |
| **JWT** | A signed token proving who you are, stored in your session cookie. Its "claims" include your email. |
| **ledger** | A list of changes that's only ever added to. Current XP is the sum of the list, like a bank statement. |
| **lazy (generation or closeout)** | Doing work only when it's first needed, rather than on a schedule. |
| **manifest** | A small file describing the app to the phone: its name, icon and colours. It makes the app installable. |
| **migration** | A numbered file that changes the database's structure. Together they can rebuild it from nothing. |
| **next-intl** | The library that picks the right language's text. |
| **nonce** | A random one-time value. A script carrying this request's nonce may run; injected scripts can't guess it. |
| **OAuth** | The standard behind "Continue with Google": Google vouches for you without the app seeing a password. |
| **proxy** | Next.js code that runs before every page. Our gate. Older versions called it middleware. |
| **publishable key** | The Supabase key that's safe in the browser (`sb_publishable_...`). It can only do what RLS allows. |
| **PWA** | Progressive Web App: a website you can install on your phone like an app. |
| **rate limiting** | Capping how often something can be called, to protect a free quota. |
| **Reckoning** | The screen summarizing what closeout did, shown on your first open after one. Also the name of closeout itself. |
| **repository (repo)** | The one piece of code that talks to storage for a feature. Swapping it swaps where data lives. (Different from a GitHub repo, which holds the code.) |
| **Rest Day** | A planned day off, 1 per week, declared before the day starts. Blocks become "rest": no XP, no loss. |
| **RLS (Row Level Security)** | Rules inside the database that decide which rows each user can touch. |
| **secret key** | The powerful Supabase key (`sb_secret_...`) that bypasses RLS. Server only, used only by cron. |
| **server action** | A server function the page can call directly, used for saving data. |
| **server component** | UI code that runs only on the server. Its logic and secrets never reach the browser. |
| **snapshot** | A saved copy of a progress number for one day. Charts are drawn from these, since the live number only knows today. |
| **service worker** | A background script in the browser, used for push and offline. Arrives in Phase 7. |
| **shadcn/ui** | A set of UI components copied into this project, so we can restyle them freely. |
| **Shield** | A sick or emergency day, up to 3 per calendar month, which can be declared the same day. Works like a Rest Day. |
| **Tailwind** | A CSS system where you style with small classes. Our colours are defined in `globals.css`. |
| **template** | One version of your repeating week, such as Semester or Exam Week. Its blocks are the plan, not the real schedule. |
| **wall-clock time** | A time as read off a clock, like 09:00, with no timezone attached. Blocks are stored this way. |
| **track** | A course, roadmap or book you're working through. Blocks and tasks can be tagged with one. |
| **transaction** | A group of database changes that succeed or fail as one, so nothing is left half done. |
| **VAPID** | Keys that identify your app to the browser's push service, so only it can send you notifications. |
| **widget** | One movable card on the Home dashboard, which can be open, collapsed or hidden. |
| **Zod** | A library that checks data has the expected shape, and rejects it if not. |
