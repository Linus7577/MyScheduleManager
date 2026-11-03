import { expect, test } from "@playwright/test";

// Runs against a production build with AUTH_PREVIEW=true set, to prove production ignores that flag.
test.describe("production gate", () => {
  test("private pages send a signed-out visitor to login", async ({ page }) => {
    for (const path of ["/", "/loop", "/calendar", "/oracle", "/more", "/settings"]) {
      await page.goto(path);
      await expect(page, `redirect from ${path}`).toHaveURL(/\/login$/);
    }
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
    for (const name of ["SUPABASE_SECRET_KEY", "CRON_SECRET", "ALLOWED_EMAIL"]) {
      expect(sources.join("\n")).not.toContain(name);
    }
  });
});
