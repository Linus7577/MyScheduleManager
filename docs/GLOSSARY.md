# Glossary

Short definitions of terms you'll meet in this project.

| Term | Meaning |
|---|---|
| **allowlist** | The list of who may enter. Here, one Google account. |
| **anon key / service_role key** | Supabase's older key names, being retired by the end of 2026. Replaced by the publishable and secret keys. |
| **API route / route handler** | A server URL that returns data rather than a page, such as the cron endpoint. |
| **App Router** | The way Next.js organizes pages: folders under `src/app` become URLs. |
| **audit log** | An append-only record of important actions, kept for later review. |
| **auth hook** | Your own code that Supabase runs during sign-in. Ours rejects sign-ups from any other email. |
| **client component** | UI code that runs in the browser, needed for interactivity. Never holds secrets. |
| **closeout** | "The Reckoning": the once-per-day process that settles a finished day. |
| **cron** | A job that runs on a schedule. Vercel Hobby allows each job to run once per day. |
| **CSP (Content Security Policy)** | A header telling the browser which scripts and connections to allow. It limits damage from injected code. |
| **environment variable (env var)** | A setting stored outside the code, such as a key. Kept in `.env.local` and on Vercel. |
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
| **RLS (Row Level Security)** | Rules inside the database that decide which rows each user can touch. |
| **secret key** | The powerful Supabase key (`sb_secret_...`) that bypasses RLS. Server only, used only by cron. |
| **server action** | A server function the page can call directly, used for saving data. |
| **server component** | UI code that runs only on the server. Its logic and secrets never reach the browser. |
| **service worker** | A background script in the browser, used for push and offline. Arrives in Phase 7. |
| **shadcn/ui** | A set of UI components copied into this project, so we can restyle them freely. |
| **Tailwind** | A CSS system where you style with small classes. Our colours are defined in `globals.css`. |
| **VAPID** | Keys that identify your app to the browser's push service, so only it can send you notifications. |
| **Zod** | A library that checks data has the expected shape, and rejects it if not. |
