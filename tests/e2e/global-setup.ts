const SHELL_URL = "http://localhost:3100";
const ROUTES = [
  "/api/dev/preview-seed",
  "/",
  "/loop",
  "/loop/templates",
  "/calendar",
  "/oracle",
  "/more",
  "/settings",
  "/battle-log",
  "/doom",
  "/goals",
  "/learning",
  "/habits",
  "/settings/logs",
  "/api/calendar?start=2026-01-01&end=2026-01-02",
];

/** The dev server compiles each page on its first visit, which can outlast a test's time limit. */
export default async function globalSetup() {
  for (const route of ROUTES) {
    await fetch(`${SHELL_URL}${route}`, { signal: AbortSignal.timeout(180_000) });
  }
}
