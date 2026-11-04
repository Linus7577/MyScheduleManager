import { expect, test } from "@playwright/test";

// Runs against a production build with AUTH_PREVIEW=true set, to prove production ignores that flag.
test.describe("production gate", () => {
  test("private pages send a signed-out visitor to login", async ({ page }) => {
    for (const path of ["/", "/loop", "/calendar", "/oracle", "/more", "/settings"]) {
      await page.goto(path);
      await expect(page, `redirect from ${path}`).toHaveURL(/\/login$/);
    }
  });

  test("the service worker and offline notice can be reached without signing in", async ({ request }) => {
    const worker = await request.get("/sw.js", { maxRedirects: 0 });
    expect(worker.status()).toBe(200);
    expect(worker.headers()["content-type"]).toContain("javascript");

    const offline = await request.get("/offline.html", { maxRedirects: 0 });
    expect(offline.status()).toBe(200);
    expect(await offline.text()).toContain("You're offline");
  });

  test("backups and timers aren't open to a signed-out visitor", async ({ request }) => {
    for (const path of ["/api/backup/export", "/api/backup/finance?kind=transactions", "/api/calendar/export", "/api/calendar/search?q=a"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBeGreaterThanOrEqual(300);
      expect(await response.text(), path).not.toContain("exported_at");
    }
    for (const path of ["/api/cron/weekly", "/api/cron/notify"]) {
      expect((await request.get(path)).status(), path).toBe(401);
    }
    const restore = await request.post("/api/backup/restore", {
      data: "{}",
      headers: { "X-Restore-Confirm": "replace-everything" },
      maxRedirects: 0,
    });
    expect(restore.status()).toBeGreaterThanOrEqual(300);
  });

  test("the login and access-denied pages render", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "Enter the Keep" })).toBeVisible();

    await page.goto("/access-denied");
    await expect(page.getByRole("heading", { level: 1, name: "Access denied" })).toBeVisible();
  });

  test("security headers are on pages and static files", async ({ request }) => {
    const pageResponse = await request.get("/login");
    const headers = pageResponse.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).not.toContain("unsafe-eval");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["x-powered-by"]).toBeUndefined();

    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.headers()["x-frame-options"]).toBe("DENY");
  });

  test("production scripts carry the nonce and run without CSP errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    const response = await page.goto("/login");
    const nonce = response?.headers()["content-security-policy"].match(/'nonce-([^']+)'/)?.[1];
    expect(nonce).toBeTruthy();

    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);

    const unsigned = await page.evaluate(
      () => [...document.scripts].filter((script) => !script.nonce).map((script) => script.src)
    );
    expect(unsigned).toEqual([]);
  });

  test("the cron endpoint refuses callers without the secret", async ({ request }) => {
    expect((await request.get("/api/cron/daily")).status()).toBe(401);
    const wrong = await request.get("/api/cron/daily", { headers: { Authorization: "Bearer wrong" } });
    expect(wrong.status()).toBe(401);
  });

  test("the Oracle's endpoint refuses a signed-out visitor", async ({ request }) => {
    const response = await request.post("/api/oracle/chat", { data: { text: "Hello" }, maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toContain("/login");
  });

  test("the preview-only seed route doesn't exist in production", async ({ request }) => {
    const signedOut = await request.get("/api/dev/preview-seed?today=1", { maxRedirects: 0 });
    expect(signedOut.status()).toBe(307);
    expect(signedOut.headers().location).toContain("/login");
  });

  test("the PWA manifest and icons are reachable without login", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest.display).toBe("standalone");

    for (const icon of manifest.icons) {
      const file = await request.get(icon.src);
      expect(file.ok(), icon.src).toBe(true);
      expect(file.headers()["content-type"]).toBe("image/png");
    }
  });

  test("no secret reaches the browser", async ({ page }) => {
    const sources: string[] = [];
    page.on("response", async (response) => {
      if (response.url().includes("/_next/static/") && response.url().endsWith(".js")) {
        sources.push(await response.text());
      }
    });
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    expect(sources.length).toBeGreaterThan(0);
    for (const name of ["SUPABASE_SECRET_KEY", "CRON_SECRET", "ALLOWED_EMAIL", "GROQ_API_KEY"]) {
      expect(sources.join("\n")).not.toContain(name);
    }
  });
});
