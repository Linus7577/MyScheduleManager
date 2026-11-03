import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// The game through the real screens. A seed route gives each test a known starting point in preview's temporary store.
test.describe.configure({ mode: "serial" });

async function seed(request: APIRequestContext, query = "") {
  const response = await request.get(`/api/dev/preview-seed${query ? `?${query}` : ""}`);
  expect(response.ok()).toBe(true);
}

const strip = (page: Page) => page.getByRole("region", { name: "Character status" });
const card = (page: Page) => page.locator("li", { has: page.getByRole("heading", { level: 3, name: "Test block" }) });

test.afterAll(async ({ request }) => {
  await seed(request);
});

test("a new character starts at Hollow Squire with full Power", async ({ page, request }) => {
  await seed(request);
  await page.goto("/");
  await expect(strip(page).getByText("Hollow Squire")).toBeVisible();
  await expect(strip(page).getByText("Lv 1")).toBeVisible();
  await expect(page.getByText("Level 1 · Empowered")).toBeVisible();
  await expect(strip(page).getByRole("progressbar", { name: "Power" })).toHaveAttribute("aria-valuenow", "100");
});

test("checking off a block earns XP straight away, and it appears in the Battle Log", async ({ page, request }) => {
  await seed(request, "today=1");
  await page.goto("/loop");

  await card(page).getByRole("button", { name: "Done" }).click();
  await expect(strip(page).getByRole("progressbar", { name: "XP" })).toHaveAttribute("aria-valuetext", "60");

  await page.goto("/more");
  await page.getByRole("link", { name: "Battle Log" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Battle Log" })).toBeVisible();
  await expect(page.getByText("Test block")).toBeVisible();
  await expect(page.getByText("+60 XP")).toBeVisible();
});

test("changing a block adds a reversing row instead of editing history", async ({ page, request }) => {
  await seed(request, "today=1");
  await page.goto("/loop");
  await card(page).getByRole("button", { name: "Done" }).click();
  await expect(strip(page).getByRole("progressbar", { name: "XP" })).toHaveAttribute("aria-valuetext", "60");
  await card(page).getByRole("button", { name: "Partial" }).click();
  await expect(strip(page).getByRole("progressbar", { name: "XP" })).toHaveAttribute("aria-valuetext", "30");

  await page.goto("/battle-log");
  await expect(page.getByText("+60 XP")).toBeVisible();
  await expect(page.getByText("-30 XP")).toBeVisible();
});

test("The Reckoning appears after a closeout, and clears when dismissed", async ({ page, request }) => {
  await seed(request, "yesterday=1&xp=500");
  await page.goto("/");

  const reckoning = page.getByRole("dialog", { name: "The Reckoning" });
  await expect(reckoning).toBeVisible();
  await expect(reckoning.getByText("XP lost")).toBeVisible();
  // Tier 1: 60 min × 1.0 × 0.25 = 15. Power: 60 / 10 = 6.
  await expect(reckoning.getByText("-15")).toBeVisible();
  await expect(reckoning.getByText("-6")).toBeVisible();

  await reckoning.getByRole("button", { name: "Enter" }).click();
  await expect(reckoning).toBeHidden();
  await expect(strip(page).getByRole("progressbar", { name: "Power" })).toHaveAttribute("aria-valuenow", "94");

  await page.reload();
  await expect(strip(page).getByText("Hollow Squire")).toBeVisible();
  await expect(reckoning).toBeHidden();

  await page.goto("/battle-log");
  await expect(page.getByText("Skipped", { exact: false })).toBeVisible();
});

test("a closed day can still be corrected the next day", async ({ page, request }) => {
  await seed(request, "yesterday=1");
  await page.goto("/");
  await page.getByRole("button", { name: "Enter" }).click();

  const yesterday = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date())}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  await page.goto(`/loop?date=${yesterday.toISOString().slice(0, 10)}`);

  await expect(card(page).getByText("Skipped", { exact: true }).first()).toBeVisible();
  await card(page).getByRole("button", { name: "Done" }).click();
  await expect(strip(page).getByRole("progressbar", { name: "XP" })).toHaveAttribute("aria-valuetext", "60");
  await expect(strip(page).getByRole("progressbar", { name: "Power" })).toHaveAttribute("aria-valuenow", "100");
});

test("reaching a new level plays once, and can be skipped", async ({ page, request }) => {
  await seed(request, "today=1&xp=190");
  await page.goto("/loop");
  await card(page).getByRole("button", { name: "Done" }).click();

  const cinematic = page.getByRole("dialog", { name: "Level 2" });
  await expect(cinematic).toBeVisible();
  await cinematic.getByRole("button", { name: "Skip" }).click();
  await expect(cinematic).toBeHidden();

  await page.reload();
  await expect(strip(page).getByText("Lv 2")).toBeVisible();
  await expect(cinematic).toBeHidden();
});

test("reaching a new tier reveals its name", async ({ page, request }) => {
  await seed(request, "today=1&xp=3190");
  // The starting XP is already level 7, so acknowledge that first.
  await page.goto("/loop");
  await page.getByRole("dialog").getByRole("button", { name: "Skip" }).click();

  await card(page).getByRole("button", { name: "Done" }).click();
  const cinematic = page.getByRole("dialog", { name: "Ashen Knight" });
  await expect(cinematic).toBeVisible();
  await expect(cinematic.getByText("A new tier")).toBeVisible();
  await cinematic.getByRole("button", { name: "Skip" }).click();
  await expect(strip(page).getByText("Ashen Knight")).toBeVisible();
});

test("the Doom Clock counts down and can be opened from the status strip", async ({ page, request }) => {
  await seed(request, "today=1");
  await page.goto("/");
  await strip(page).getByRole("link", { name: /Doom Clock/ }).click();

  const timer = page.getByRole("timer");
  await expect(timer).toBeVisible();
  await expect(timer).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  const first = await timer.textContent();
  await expect(timer).not.toHaveText(first as string);

  await page.getByRole("link", { name: "Close the Doom Clock" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("focus mode runs a timer, counts leaving, and asks how it went", async ({ page, request }) => {
  await seed(request, "today=1");
  await page.goto("/loop");
  await card(page).getByRole("link", { name: "Focus" }).click();

  await expect(page.getByRole("timer")).toHaveText("01:00:00");
  await page.getByRole("button", { name: "Begin" }).click();
  await expect(page.getByRole("timer")).not.toHaveText("01:00:00");

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByText("You left.")).toBeVisible();

  await page.getByRole("button", { name: "End early" }).click();
  await expect(page.getByText("How did it go?")).toBeVisible();
  await page.getByRole("button", { name: "Partial" }).click();

  await expect(page).toHaveURL(/\/loop/);
  await expect(card(page).getByRole("button", { name: "Partial" })).toHaveAttribute("aria-pressed", "true");
  await expect(card(page).getByText("Focus broken once")).toBeVisible();
  // Leaving costs nothing. A partial 60 min Study block earns its 30 XP in full.
  await expect(strip(page).getByRole("progressbar", { name: "XP" })).toHaveAttribute("aria-valuetext", "30");
});

test("the Motion setting is saved and applied", async ({ page, request }) => {
  await seed(request);
  await page.goto("/settings");
  await page.getByLabel("Motion").selectOption("off");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("[data-motion]")).toHaveAttribute("data-motion", "off");

  await page.goto("/");
  await expect(page.locator("[data-motion]")).toHaveAttribute("data-motion", "off");
});

test("game screens have no browser errors, in English or Chinese", async ({ page, request, context, baseURL }) => {
  await seed(request, "today=1");
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  for (const path of ["/", "/battle-log", "/doom", "/loop"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }

  await context.addCookies([{ name: "locale", value: "zh-TW", url: baseURL as string }]);
  await page.goto("/");
  await expect(page.getByRole("region", { name: "角色狀態" }).getByText("空洞侍從")).toBeVisible();
  expect(errors).toEqual([]);
});
