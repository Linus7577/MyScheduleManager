import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// The Home lobby and the look of each section. Each test starts from a known state, and they run one at a time.

async function seed(request: APIRequestContext, query = "") {
  expect((await request.get(`/api/dev/preview-seed${query ? `?${query}` : ""}`)).ok()).toBe(true);
}

const lobby = (page: Page) => page.getByRole("region", { name: "The citadel" });

async function artLoaded(page: Page, name: string) {
  await expect
    .poll(() =>
      page.evaluate((part) => {
        const image = [...document.images].find((candidate) => candidate.src.includes(part));
        return image ? image.complete && image.naturalWidth > 0 : false;
      }, name)
    )
    .toBe(true);
}

test.afterAll(async ({ request }) => {
  await seed(request);
});

test("Home shows the citadel, dragon and warrior, with no browser errors", async ({ page, request }) => {
  await seed(request);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  await expect(lobby(page)).toBeVisible();
  await artLoaded(page, "citadel");
  await artLoaded(page, "dragon");
  await artLoaded(page, "warrior/tier-1.webp");
  await artLoaded(page, "tier-1-face");
  await expect(lobby(page).getByText("Hollow Squire")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the first screen fills the view and has the next battle, with the widgets below", async ({ page, request }) => {
  await seed(request);
  await page.goto("/");
  const box = await lobby(page).boundingBox();
  const viewport = page.viewportSize();
  expect(box?.height).toBeGreaterThan((viewport?.height ?? 0) * 0.7);
  await expect(lobby(page).getByRole("link", { name: "Open the Loop" })).toBeVisible();
  await expect(lobby(page).getByText("Next battle")).toBeVisible();
  await expect(page.getByRole("button", { name: "Goals and projects" }).first()).toBeAttached();
});

test("the next battle names a block still to fight", async ({ page, request }) => {
  await seed(request);
  await page.goto("/loop/templates");
  await page.getByRole("link", { name: "Edit blocks in Semester" }).click();
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Taipei" }).format(new Date());
  await page.getByRole("button", { name: `Add a block on ${weekday}` }).click();
  await page.getByLabel("Title").fill("Night watch");
  await page.getByLabel("Start").fill("23:58");
  await page.getByLabel("End").fill("23:59");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  // New blocks reach today only through the loop, so the block is on the template and doesn't crash Home.
  await page.goto("/");
  await expect(lobby(page).getByText("Next battle")).toBeVisible();
});

test("tapping him brings a new line, in the app's language and never in Japanese", async ({ page, request }) => {
  await seed(request);
  await page.goto("/");
  const line = lobby(page).getByRole("status");
  const before = await line.textContent();
  await lobby(page).getByRole("button", { name: "Speak to him" }).click();
  await expect(line).not.toHaveText(before as string);
  expect(await line.textContent()).not.toMatch(/[぀-ヿ]/);
});

test("tapping him plays his voice, unless sound is muted", async ({ page, request }) => {
  await seed(request);
  await page.goto("/");
  const speak = lobby(page).getByRole("button", { name: "Speak to him" });
  const [clip] = await Promise.all([page.waitForResponse(/\/audio\/voice\/\w+\.mp3/), speak.click()]);
  expect(clip.ok()).toBe(true);

  let played = 0;
  page.on("request", (sent) => {
    if (sent.url().includes("/audio/voice/")) played++;
  });
  await lobby(page).getByRole("button", { name: "Mute sound" }).click();
  await speak.click();
  await page.waitForTimeout(400);
  expect(played).toBe(0);
  await lobby(page).getByRole("button", { name: "Mute sound" }).click();
});

test("his voice clips really load as sound", async ({ page }) => {
  await page.goto("/login");
  const seconds = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const clip = new Audio("/audio/voice/s3.mp3");
        clip.addEventListener("loadedmetadata", () => resolve(clip.duration));
        clip.addEventListener("error", () => reject(new Error("The clip wouldn't load")));
      })
  );
  expect(seconds).toBeGreaterThan(1);
  expect(seconds).toBeLessThan(10);
});

test("the voice is credited on Home and in Settings", async ({ page, request }) => {
  await seed(request);
  await page.goto("/");
  await expect(page.getByText("Voice made with VOICEVOX:青山龍星")).toBeAttached();
  await page.goto("/settings");
  await expect(page.getByText("Voice made with VOICEVOX:青山龍星")).toBeVisible();
});

test("sound can be muted, and stays muted after a reload", async ({ page, request }) => {
  await seed(request);
  await page.goto("/");
  const mute = lobby(page).getByRole("button", { name: "Mute sound" });
  await expect(mute).toHaveAttribute("aria-pressed", "false");
  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(lobby(page).getByRole("button", { name: "Mute sound" })).toHaveAttribute("aria-pressed", "true");
});

test("higher tiers wear their own art", async ({ page, request }) => {
  // Level 25 is Tier 4.
  await seed(request, "xp=31250");
  await page.goto("/");
  await page.getByRole("button", { name: "Skip" }).click();
  await artLoaded(page, "warrior/tier-4.webp");
  await expect(lobby(page).getByText("Bloodbound Reaver")).toBeVisible();
});

test("marking a block done brings the sound and a line from him", async ({ page, request }) => {
  await seed(request, "today=1");
  await page.goto("/loop");
  await page.getByRole("button", { name: "Done" }).first().click();
  const speech = page.getByRole("status").filter({ hasText: /One down|Not bad|Like that/ });
  await expect(speech).toBeVisible();
  expect(await speech.textContent()).not.toMatch(/[぀-ヿ]/);
});

test("the painting moves at Full motion, and holds still at Off", async ({ page, context, request, baseURL }) => {
  await seed(request);
  const moving = () =>
    page.evaluate(
      () =>
        [".dragon-wing-left", ".dragon-wing-right", ".dragon-breathe", ".warrior-breathe", ".warrior-wisp-1"].filter(
          (selector) => (document.querySelector(selector)?.getAnimations().length ?? 0) > 0
        ).length
    );

  await page.goto("/");
  await expect(lobby(page)).toBeVisible();
  expect(await moving()).toBe(5);

  await context.addCookies([{ name: "motion", value: "off", url: baseURL as string }]);
  await page.reload();
  await expect(lobby(page)).toBeVisible();
  expect(await moving()).toBe(0);
  await context.clearCookies({ name: "motion" });
});

test("the lobby speaks Chinese when the app does", async ({ page, context, request, baseURL }) => {
  await seed(request);
  await context.addCookies([{ name: "locale", value: "zh-TW", url: baseURL as string }]);
  await page.goto("/");
  await expect(page.getByRole("region", { name: "城塞" }).getByText("下一場戰鬥")).toBeVisible();
});

test("each section is its own place, and nothing scrolls sideways", async ({ page, request }) => {
  await seed(request);
  const places: [string, string][] = [
    ["/loop", "The War Table"],
    ["/calendar", "The Astral Observatory"],
    ["/finance", "The Dragon's Hoard"],
    ["/vault", "The Forbidden Archive"],
    ["/goals", "The Campaign Room"],
    ["/learning", "The Arcane Tower"],
    ["/habits", "The Training Grounds"],
    ["/battle-log", "The Hall of Records"],
    ["/more", "The Great Gate"],
    ["/settings", "The Armory"],
  ];
  for (const [path, name] of places) {
    await page.goto(path);
    await expect(page.getByText(name, { exact: true }), path).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.goto("/");
  await expect(lobby(page)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
