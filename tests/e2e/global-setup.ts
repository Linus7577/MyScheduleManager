const SHELL_URL = "http://localhost:3100";
const ROUTES = ["/", "/loop", "/loop/templates", "/calendar", "/oracle", "/more", "/settings", "/api/calendar?start=2026-01-01&end=2026-01-02"];

/** The dev server compiles each page on its first visit, which can outlast a test's time limit. */
export default async function globalSetup() {
  for (const route of ROUTES) {
    await fetch(`${SHELL_URL}${route}`, { signal: AbortSignal.timeout(180_000) });
  }
}
