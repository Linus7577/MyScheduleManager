# Changelog

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
