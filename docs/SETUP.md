# Setup: recreate the project from zero

Follow these in order. Each step says why it exists. Everything here is free.

**Tip for Windows:** if PowerShell says "running scripts is disabled", use `npm.cmd` instead of `npm`, or run commands in Command Prompt. You don't need to change any security setting.

## What you need
- Node.js 26 and Git
- Accounts: GitHub, Supabase, Google, Vercel

## 1. Run it locally without accounts (optional)
**Why:** to see the app before connecting anything.

```bash
npm install
```

Create a file named `.env.local` containing one line, `AUTH_PREVIEW=true`, then:

```bash
npm run dev
```

Open http://localhost:3000. Remove that line once step 5 is done.

## 2. Put the code on GitHub
**Why:** Vercel deploys from GitHub, so every push updates the live app.

1. On github.com, create a new repository with no README. This project's repo is public, so its code, this documentation and the commit author's email can be read by anyone. Choose private if you don't want that; Vercel can deploy either. Secrets are never in the repo, because Git ignores `.env.local`.
2. Copy its URL into the first command below, then run both:

```bash
git remote add origin https://github.com/YOUR-NAME/YOUR-REPO.git
```
```bash
git push -u origin main
```

## 3. Create the Supabase project
**Why:** Supabase is the database and the sign-in system.

1. At supabase.com, create a project. Under **Region**, click **Need a specific region?** and pick **Northeast Asia (Tokyo)**; don't leave it on Auto. **Why:** every page makes several database calls, and a project's region can't be changed later. This app's first project landed in Ireland, which made pages take seconds from Taiwan. The app doesn't use the database password, and you can reset it later under **Project Settings → Database**.
2. Open **SQL Editor**. For each file in `supabase/migrations/`, oldest first, paste the whole file and run it. **Why:** these create the tables and their security rules.
3. In the SQL Editor, run this with your own Gmail address. **Why:** it tells the sign-up gate who may create an account.
   ```sql
   insert into private.signup_allowlist (email) values ('you@gmail.com');
   ```
4. Open **Authentication → Hooks**, add a **Before User Created** hook, choose **Postgres**, and select `public.hook_before_user_created`. **Why:** without it, a stranger could sign in straight against Supabase. It's listed for the Free plan in Supabase's docs, though their pricing page doesn't mention it. If you can't enable it, do step 5.7 instead.
5. Open **Project Settings → API Keys** and note the **publishable** key and the **secret** key. Click the eye icon to reveal the whole secret key first, because the page shows a shortened version that won't work. If you only see old `eyJ...` keys, create the new ones there. **Why:** Supabase is retiring the old `anon` and `service_role` keys by the end of 2026.

## 4. Set up Google sign-in
**Why:** Google proves it's you, so the app never handles a password.

1. At console.cloud.google.com, create a project.
2. Open **Google Auth Platform** and start the setup. Choose **External**, and leave it in **Testing**.
3. Under **Audience → Test users**, add your Gmail address. **Why:** in Testing mode, Google refuses everyone who isn't on this list, which is a free extra lock. Google will show you an "unverified app" warning, which is expected for your own app.
4. Under **Clients**, create an **OAuth client** of type **Web application**. As the **Authorized redirect URI**, add:
   ```
   https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
   ```
5. Copy the client ID and client secret.

## 5. Connect Google to Supabase
1. In Supabase, open **Authentication → Providers**, enable **Google**, and paste the ID and secret.
2. Disable the **Email** provider. **Why:** the spec allows Google only.
3. Open **Authentication → URL Configuration**. **Why:** Supabase only returns people to addresses on this list.
4. Set **Site URL** to `http://localhost:3000` for now.
5. Add `http://localhost:3000/auth/callback` to **Redirect URLs**.
6. Create `.env.local` from `.env.example`, and fill in the five values from the top section. `node scripts/fill-env.mjs` asks for the Supabase values and your email one at a time, and hides the secret key as you paste it. To make a `CRON_SECRET`, run:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
7. Only if the hook wasn't available in step 3.4: sign in once at http://localhost:3000, then turn off **Allow new users to sign up** in Supabase's auth settings. **Why:** the same protection, reached a different way. You must turn it back on if you ever recreate your account.

Run `npm run dev` and sign in. You should reach the Home page.

## 6. Deploy to Vercel
**Why:** this makes the app available on your phone from anywhere.

1. At vercel.com, sign in with GitHub, choose **Add New → Project**, and import your repository.
2. Before deploying, add the five variables from `.env.local` under **Environment Variables**. Don't add `AUTH_PREVIEW`.
3. Deploy, and copy the live address, such as `https://your-app.vercel.app`.
   - **The function region is already set:** `vercel.json` says `hnd1`, which is Tokyo, to match the database. **Why:** every page makes several database calls, and each one crosses that distance. If you ever pick a different database region, change this to match.
4. Back in Supabase's **URL Configuration**, set **Site URL** to that address and add `https://your-app.vercel.app/auth/callback` to **Redirect URLs**. **Why:** so Google sign-in returns to the live app and not to localhost.

Vercel picks up the daily job from `vercel.json` automatically. **Why it matters:** it keeps Supabase from pausing after a quiet week.

## 7. Check it worked
- Open the live address and sign in. You should reach Home.
- Try a different Google account, in a private window. It should be refused.
- In Vercel, open **Settings → Cron Jobs** and run the job by hand. It should succeed.
- On your Android phone, open the address in Chrome and choose **Add to Home screen**.

## Later phases
You don't need these yet. They're here so this file stays complete.

- **Phase 4, Groq:** create a free key at console.groq.com, under **API Keys**, and add it as `GROQ_API_KEY` to `.env.local` and to Vercel. **Why:** this powers the Oracle. `AI_PROVIDER`, `AI_BASE_URL` and `AI_MODEL` are optional, with Groq as the default, and they let you change provider without a code change. Groq's model list changes over time, so if the Oracle stops answering, check `AI_MODEL` against their docs first.
- **Phase 5, Finnhub:** create a free key at finnhub.io and set `FINNHUB_API_KEY` in `.env.local` and in Vercel. **Why:** US stock prices. Without it, US prices are set by hand. Taiwan prices and exchange rates need no key.
- **Phase 7, VAPID keys:** these identify your app to the browser's push service, so only you can send it notifications. The exact command is added when that phase is built.

## Adding database changes later
Each phase adds a new file in `supabase/migrations/`. Run each new file once in the SQL Editor, oldest first. **Why:** this keeps the live database matching the code.
