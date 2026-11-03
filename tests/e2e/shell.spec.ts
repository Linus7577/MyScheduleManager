import { expect, test } from "@playwright/test";

test.describe("app shell", () => {
  test("every section opens with the status strip and no sideways scroll", async ({ page }) => {
    for (const [path, heading] of [
      ["/", "The Keep"],
      ["/loop", "The Loop"],
      ["/calendar", "Calendar"],
      ["/oracle", "The Oracle"],
      ["/more", "More"],
      ["/settings", "Settings"],
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page.getByRole("region", { name: "Character status" })).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `sideways scroll on ${path}`).toBeLessThanOrEqual(0);
    }
  });

  test("uses the bottom bar on phones and the sidebar on desktop", async ({ page }, testInfo) => {
    await page.goto("/");
    const isMobile = testInfo.project.name === "shell-mobile";
    await expect(page.locator("aside")).toBeVisible({ visible: !isMobile });
    await expect(page.locator("nav.fixed")).toBeVisible({ visible: isMobile });
  });

  test("navigation moves between sections and marks the current one", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main navigation" }).locator("visible=true");
    await nav.getByRole("link", { name: "Loop" }).click();
    await expect(page).toHaveURL(/\/loop$/);
    await expect(nav.getByRole("link", { name: "Loop" })).toHaveAttribute("aria-current", "page");
  });

  test("switches language to 繁體中文 and back", async ({ page }) => {
    await page.goto("/settings");
    await page.getByLabel("Language").selectOption("zh-TW");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "設定" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "要塞" })).toBeVisible();

    await page.goto("/settings");
    await page.getByLabel("語言").selectOption("en");
    await page.getByRole("button", { name: "儲存" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  });

  test("Chinese fonts are allowed by the CSP", async ({ page, context, baseURL }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("Content Security Policy")) violations.push(message.text());
    });
    await context.addCookies([{ name: "locale", value: "zh-TW", url: baseURL as string }]);

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "要塞" })).toBeVisible();
    await expect(page.locator('link[href*="fonts.googleapis.com"]')).toHaveCount(1);
    await page.waitForLoadState("networkidle");
    expect(violations).toEqual([]);
  });

  test("runs under the CSP without browser errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });
});
