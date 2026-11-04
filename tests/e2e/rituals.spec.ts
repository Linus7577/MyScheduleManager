import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Phase 7 through the real screens. Each test starts from an empty store, and they run one at a time.

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

function plusDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

async function seed(request: APIRequestContext, query = "") {
  expect((await request.get(`/api/dev/preview-seed${query}`)).ok()).toBe(true);
}

type FeedItem = { id: string; title: string; kind: string; date: string; start: string; end: string; event: { id: string } | null };

async function feed(request: APIRequestContext, start: string, end: string): Promise<FeedItem[]> {
  const response = await request.get(`/api/calendar?start=${start}&end=${end}`);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { items: FeedItem[] }).items.filter((item) => item.kind === "event");
}

async function newEvent(page: Page, title: string, options: { repeat?: string; rule?: string; start?: string; end?: string } = {}) {
  await page.getByRole("button", { name: "New event" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Start time").fill(options.start ?? "14:00");
  await dialog.getByLabel("End time").fill(options.end ?? "15:00");
  if (options.repeat) await dialog.getByLabel("Repeat").selectOption({ label: options.repeat });
  if (options.rule) await dialog.getByLabel("Rule").fill(options.rule);
  await dialog.getByRole("button", { name: "Save" }).click();
}

async function openCalendarDay(page: Page) {
  await page.goto("/calendar");
  await page.getByRole("tab", { name: "Day view" }).click();
}

const TODAY = todayIso();

test.beforeEach(async ({ request }) => {
  await seed(request, "?today=1");
});

test.afterAll(async ({ request }) => {
  await seed(request);
});

test.describe("repeating events", () => {
  test("shows on each date, marks itself, and one date can be taken out", async ({ page, request }) => {
    await openCalendarDay(page);
    await newEvent(page, "Morning run", { repeat: "Every day" });
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("Morning run").first()).toBeVisible();

    expect((await feed(request, TODAY, plusDays(TODAY, 2))).map((item) => item.date)).toEqual([TODAY, plusDays(TODAY, 1), plusDays(TODAY, 2)]);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByText("Morning run").first().click();
    await expect(page.getByRole("dialog").getByText("every date in this series")).toBeVisible();
    await page.getByRole("button", { name: "Delete this one" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("Morning run")).toHaveCount(0);
    expect((await feed(request, TODAY, plusDays(TODAY, 1))).map((item) => item.date)).toEqual([plusDays(TODAY, 1)]);
  });

  test("the whole series can be deleted", async ({ page, request }) => {
    await openCalendarDay(page);
    await newEvent(page, "Weekly class", { repeat: "Every week" });
    await expect(page.getByText("Weekly class").first()).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByText("Weekly class").first().click();
    await page.getByRole("button", { name: "Delete all" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(await feed(request, TODAY, plusDays(TODAY, 30))).toEqual([]);
  });

  test("refuses a custom rule it can't use, and accepts one it can", async ({ page, request }) => {
    await openCalendarDay(page);
    await newEvent(page, "Custom", { repeat: "Custom rule", rule: "FREQ=SECONDLY" });
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("repeat rule");

    await page.getByRole("dialog").getByLabel("Rule").fill("FREQ=DAILY;COUNT=2");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(await feed(request, TODAY, plusDays(TODAY, 9))).toHaveLength(2);
  });

  test("tells the owner a repeating event earns no XP, and makes no block", async ({ page }) => {
    await openCalendarDay(page);
    await page.getByRole("button", { name: "New event" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Category").selectOption("study");
    await expect(dialog.getByText("needs a start and end time")).toBeVisible();
    await dialog.getByLabel("Repeat").selectOption({ label: "Every day" });
    await expect(dialog.getByText("earns no XP")).toBeVisible();
    await dialog.getByLabel("Title").fill("Study club");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    await page.goto("/loop");
    await expect(page.getByRole("heading", { level: 3, name: "Test block" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Study club" })).toHaveCount(0);
  });
});

test.describe("finding things", () => {
  test("search finds an event, and tapping it opens that day", async ({ page }) => {
    const later = plusDays(TODAY, 40);
    await page.goto("/calendar");
    await page.getByRole("button", { name: "New event" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill("Passport renewal");
    await dialog.getByLabel("Start date").fill(later);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    await page.getByLabel("Search the calendar").fill("passport");
    await page.getByRole("button", { name: /Passport renewal/ }).click();
    await expect(page.getByRole("tab", { name: "Day view" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Passport renewal").first()).toBeVisible();
    await expect(page.getByLabel("Search the calendar")).toHaveValue("");

    await page.getByLabel("Search the calendar").fill("no such thing");
    await expect(page.getByText("Nothing found.")).toBeVisible();
    await page.getByRole("button", { name: "Close search results" }).click();
    await expect(page.getByText("Nothing found.")).toHaveCount(0);
  });

  test("jump to date opens that day", async ({ page }) => {
    const later = plusDays(TODAY, 50);
    await page.goto("/calendar");
    await page.getByRole("button", { name: "New event" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill("Far away");
    await dialog.getByLabel("Start date").fill(later);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Far away")).toHaveCount(0);

    await page.getByLabel("Jump to date").fill(later);
    await expect(page.getByText("Far away").first()).toBeVisible();
  });
});

test.describe("dragging", () => {
  test("dragging an event moves it and saves", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name === "shell-mobile", "A phone drags with a long press, which test mice can't do.");
    await openCalendarDay(page);
    // Early in the day, so the event starts near the middle of the screen and the mouse stays on the page.
    await newEvent(page, "Drag me", { start: "09:00", end: "10:00" });
    const entry = page.getByText("Drag me").first();
    await expect(entry).toBeVisible();
    await entry.scrollIntoViewIfNeeded();

    const box = await entry.boundingBox();
    if (!box) throw new Error("The event has no position");
    await page.mouse.move(box.x + 10, box.y + 5);
    await page.mouse.down();
    await page.mouse.move(box.x + 10, box.y + 45, { steps: 8 });
    await page.mouse.move(box.x + 10, box.y + 85, { steps: 8 });
    await page.mouse.up();

    await expect
      .poll(async () => (await feed(request, TODAY, TODAY))[0].start)
      .not.toBe(`${TODAY}T09:00:00`);
    const [moved] = await feed(request, TODAY, TODAY);
    expect(moved.start > `${TODAY}T09:00:00`).toBe(true);
    // The length stays an hour.
    expect(Date.parse(`${moved.end}Z`) - Date.parse(`${moved.start}Z`)).toBe(3_600_000);
  });

  test("a repeating event can't be dragged, so its dates can't drift apart", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name === "shell-mobile", "A phone drags with a long press, which test mice can't do.");
    await openCalendarDay(page);
    await newEvent(page, "Fixed series", { repeat: "Every day", start: "09:00", end: "10:00" });
    const entry = page.getByText("Fixed series").first();
    await expect(entry).toBeVisible();
    await entry.scrollIntoViewIfNeeded();

    const box = await entry.boundingBox();
    if (!box) throw new Error("The event has no position");
    await page.mouse.move(box.x + 10, box.y + 5);
    await page.mouse.down();
    await page.mouse.move(box.x + 10, box.y + 45, { steps: 8 });
    await page.mouse.move(box.x + 10, box.y + 85, { steps: 8 });
    await page.mouse.up();
    await page.waitForLoadState("networkidle");

    expect((await feed(request, TODAY, TODAY))[0].start).toBe(`${TODAY}T09:00:00`);
    // Letting go on a series that can't move counts as a tap, which is how its form opens.
    await expect(entry).toBeVisible();
  });
});

test.describe("calendar files", () => {
  const FILE = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:from-a-file",
    "SUMMARY:Imported lecture",
    `DTSTART;TZID=Asia/Taipei:${TODAY.replace(/-/g, "")}T080000`,
    `DTEND;TZID=Asia/Taipei:${TODAY.replace(/-/g, "")}T090000`,
    "RRULE:FREQ=WEEKLY",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const file = (body: string) => ({ name: "calendar.ics", mimeType: "text/calendar", buffer: Buffer.from(body) });

  test("imports a file once, even when it's chosen twice", async ({ page, request }) => {
    await openCalendarDay(page);
    const input = page.locator('input[type="file"]');
    await input.setInputFiles(file(FILE));
    await expect(page.getByRole("status").filter({ hasText: "1 event added." })).toBeVisible();
    await expect(page.getByText("Imported lecture").first()).toBeVisible();

    await input.setInputFiles(file(FILE));
    await expect(page.getByRole("status").filter({ hasText: "0 events added." })).toContainText("1 was already here.");
    expect(await feed(request, TODAY, plusDays(TODAY, 7))).toHaveLength(2);
  });

  test("refuses a file that isn't a calendar", async ({ page }) => {
    await page.goto("/calendar");
    await page.locator('input[type="file"]').setInputFiles(file("just some words"));
    await expect(page.getByRole("alert").filter({ hasText: "isn't a calendar file" })).toBeVisible();
  });

  test("exports events a calendar app can read", async ({ page, request }) => {
    await openCalendarDay(page);
    await newEvent(page, "Goes in the file", { repeat: "Every week" });
    await expect(page.getByRole("dialog")).toBeHidden();

    const response = await request.get("/api/calendar/export");
    expect(response.headers()["content-type"]).toContain("text/calendar");
    expect(response.headers()["content-disposition"]).toContain(".ics");
    const body = await response.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("SUMMARY:Goes in the file");
    expect(body).toContain("RRULE:FREQ=WEEKLY");
    await expect(page.getByRole("link", { name: "Export calendar file" })).toHaveAttribute("href", "/api/calendar/export");
  });
});

test.describe("weekly review", () => {
  test("opens from More, and shows the week", async ({ page }) => {
    await page.goto("/more");
    await page.getByRole("link", { name: "Weekly review" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Weekly review" })).toBeVisible();
    for (const heading of ["The Oracle's review", "The week in numbers", "Planned and done", "Goal progress", "Spending", "Your answers", "Adjust next week's loop"]) {
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    await expect(page.getByText("XP gained")).toBeVisible();
    await expect(page.getByText("Power at the end of each day")).toBeVisible();
    await expect(page.getByText("Sealed until")).toHaveCount(0);
  });

  test("counts a block finished this week", async ({ page }) => {
    await page.goto("/loop");
    const card = page.locator("li", { has: page.getByRole("heading", { level: 3, name: "Test block" }) });
    await card.getByRole("button", { name: "Done" }).click();
    await expect(card.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");

    await page.goto("/review");
    await expect(page.getByText("60 of 60 min")).toBeVisible();
    await expect(page.getByText("Hours done: 1 of 1.")).toBeVisible();
  });

  test("keeps the owner's answers", async ({ page }) => {
    await page.goto("/review");
    await page.getByLabel("What worked?").fill("Early mornings");
    await page.getByLabel("What didn't?").fill("Late nights");
    await page.getByLabel("What's next week's focus?").fill("Sleep");
    await page.getByRole("button", { name: "Save answers" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("What worked?")).toHaveValue("Early mornings");
    await expect(page.getByLabel("What's next week's focus?")).toHaveValue("Sleep");
  });

  test("a week has its own answers, and there's no reaching a week to come", async ({ page }) => {
    await page.goto("/review");
    await page.getByLabel("What worked?").fill("This week");
    await page.getByRole("button", { name: "Save answers" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Next week" })).toHaveCount(0);

    await page.getByRole("link", { name: "Previous week" }).click();
    await expect(page.getByLabel("What worked?")).toHaveValue("");
    await page.getByRole("link", { name: "Next week" }).click();
    await expect(page.getByLabel("What worked?")).toHaveValue("This week");

    await page.goto(`/review?week=${plusDays(TODAY, 30)}`);
    await expect(page.getByRole("link", { name: "Next week" })).toHaveCount(0);
  });

  test("the Oracle writes the review on request", async ({ page }) => {
    await page.goto("/review");
    await expect(page.getByText("Nothing written yet.")).toBeVisible();
    await page.getByRole("button", { name: "Ask the Oracle to write it" }).click();
    await expect(page.getByRole("button", { name: "Write it again" })).toBeVisible();
    await expect(page.getByText("Nothing written yet.")).toHaveCount(0);
  });

  test("adjusting the loop fills in the question, and sends nothing by itself", async ({ page }) => {
    await page.goto("/review");
    await page.getByRole("link", { name: "Ask the Oracle" }).click();
    await expect(page).toHaveURL(/\/oracle\?ask=adjust$/);
    await expect(page.getByRole("textbox")).toHaveValue(/propose changes to next week's loop/);
    await expect(page.getByText("propose changes to next week's loop")).toHaveCount(1);
  });

  test("fits the screen with no browser errors, and works in Chinese", async ({ page, context, baseURL }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/review");
    await expect(page.getByRole("heading", { level: 1, name: "Weekly review" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await context.addCookies([{ name: "locale", value: "zh-TW", url: baseURL as string }]);
    await page.goto("/review");
    await expect(page.getByRole("heading", { level: 1, name: "每週回顧" })).toBeVisible();
  });
});

test.describe("notification settings", () => {
  test("only the Sunday review starts on, and choices are kept", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(page.getByLabel("Weekly review, Sunday at 21:00")).toBeChecked();
    await expect(page.getByLabel("When a block starts")).not.toBeChecked();
    await expect(page.getByLabel("30 minutes before midnight, if blocks are still open")).not.toBeChecked();
    await expect(page.getByLabel("When Power drops below 30%")).not.toBeChecked();

    await page.getByLabel("When a block starts").check();
    await page.getByLabel("Weekly review, Sunday at 21:00").uncheck();
    await expect(page.getByLabel("When a block starts")).toBeChecked();
    await page.waitForLoadState("networkidle");

    await page.reload();
    await expect(page.getByLabel("When a block starts")).toBeChecked();
    await expect(page.getByLabel("Weekly review, Sunday at 21:00")).not.toBeChecked();
  });

  test("says so when the server isn't set up, and has the Android install guide", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("Notifications aren't set up on the server yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Turn on for this device" })).toHaveCount(0);

    await page.getByText("Install the app on Android").click();
    await expect(page.getByText("Open this site in Chrome on your phone.")).toBeVisible();
  });

  test("timers need the secret", async ({ request }) => {
    for (const path of ["/api/cron/notify", "/api/cron/weekly"]) {
      expect((await request.get(path)).status(), path).toBe(401);
      expect((await request.get(path, { headers: { authorization: "Bearer wrong" } })).status(), path).toBe(401);
    }
    expect((await request.post("/api/cron/notify")).status()).toBe(401);
  });
});

test.describe("backup", () => {
  type BackupFile = { app: string; version: number; exported_at: string; tables: { events: { title: string }[] } };

  async function makeEvent(page: Page, title: string) {
    await page.goto("/calendar");
    await newEvent(page, title);
    await expect(page.getByRole("dialog")).toBeHidden();
  }

  test("downloads everything, and money as spreadsheets", async ({ page, request }) => {
    await makeEvent(page, "In the backup");

    const response = await request.get("/api/backup/export");
    expect(response.headers()["content-disposition"]).toContain("my-schedule-backup-");
    const backup = (await response.json()) as BackupFile;
    expect(backup.app).toBe("my-schedule-manager");
    expect(backup.tables.events.map((event) => event.title)).toContain("In the backup");

    const transactions = await request.get("/api/backup/finance?kind=transactions");
    expect(transactions.headers()["content-type"]).toContain("text/csv");
    expect(await transactions.text()).toContain("date,kind,category,amount");
    expect(await (await request.get("/api/backup/finance?kind=trades")).text()).toContain("date,side,market,symbol");
    expect((await request.get("/api/backup/finance?kind=secrets")).status()).toBe(400);
  });

  test("restoring needs a fresh backup, the typed word, and then replaces everything", async ({ page, request }) => {
    await makeEvent(page, "Saved before");
    const backup = (await (await request.get("/api/backup/export")).json()) as BackupFile;
    await makeEvent(page, "Added after");

    await page.goto("/settings");
    await expect(page.locator('input[accept*="json"]')).toHaveCount(0);

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Everything (JSON)" }).click();
    expect((await download).suggestedFilename()).toContain("my-schedule-backup-");

    await page.locator('input[accept*="json"]').setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(page.getByText(/This file has \d+ records?, saved/)).toBeVisible();
    const button = page.getByRole("button", { name: "Replace everything" });
    await expect(button).toBeDisabled();
    await page.getByLabel("Type RESTORE to confirm").fill("restore");
    await expect(button).toBeDisabled();
    await page.getByLabel("Type RESTORE to confirm").fill("RESTORE");
    await button.click();
    await expect(page).toHaveURL(/\/$/);

    const titles = (await feed(request, TODAY, TODAY)).map((item) => item.title);
    expect(titles).toContain("Saved before");
    expect(titles).not.toContain("Added after");
  });

  test("refuses a file that isn't a backup, and changes nothing", async ({ page, request }) => {
    await makeEvent(page, "Still here");
    await page.goto("/settings");
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Everything (JSON)" }).click();
    await download;

    await page.locator('input[accept*="json"]').setInputFiles({
      name: "other.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ hello: "world" })),
    });
    await expect(page.getByRole("alert").filter({ hasText: "isn't a backup from this app" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Replace everything" })).toHaveCount(0);
    expect((await feed(request, TODAY, TODAY)).map((item) => item.title)).toContain("Still here");
  });

  test("the restore address refuses a request not sent by the page, or that isn't a real backup", async ({ request }) => {
    expect((await request.post("/api/backup/restore", { data: "{}" })).status()).toBe(403);
    const notPacked = await request.post("/api/backup/restore", {
      data: "{}",
      headers: { "X-Restore-Confirm": "replace-everything" },
    });
    expect(notPacked.status()).toBe(400);
  });
});

test.describe("page changes", () => {
  test("a dark fade plays between pages when Motion is Full, and never blocks a tap", async ({ page }) => {
    await page.goto("/more");
    const veil = page.locator(".page-veil");
    await expect(veil).toBeAttached();
    expect(await veil.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("none");
    expect(await veil.evaluate((element) => getComputedStyle(element).animationName)).toBe("page-veil");

    await page.getByRole("link", { name: "Weekly review" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Weekly review" })).toBeVisible();
  });

  test("the fade is left out when Motion is Off", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "motion", value: "off", url: baseURL as string }]);
    await page.goto("/more");
    expect(await page.locator(".page-veil").evaluate((element) => getComputedStyle(element).display)).toBe("none");
  });
});

test.describe("offline", () => {
  const card = (page: Page) => page.locator("li", { has: page.getByRole("heading", { level: 3, name: "Test block" }) });

  test("a check-off made offline waits, then saves when back online", async ({ page, context }) => {
    await page.goto("/loop");
    await expect(card(page)).toBeVisible();

    await context.setOffline(true);
    await expect(page.getByText("You're offline.")).toBeVisible();
    await card(page).getByRole("button", { name: "Done" }).click();
    await expect(card(page).getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");
    await expect(card(page).getByText("Saved on this device.")).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByText("You're offline.")).toHaveCount(0);
    await expect(card(page).getByText("Saved on this device.")).toHaveCount(0);

    await page.reload();
    await expect(card(page).getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");
  });

  test("changing a check-off offline keeps only the last choice", async ({ page, context }) => {
    await page.goto("/loop");
    await expect(card(page)).toBeVisible();

    await context.setOffline(true);
    await expect(page.getByText("You're offline.")).toBeVisible();
    await card(page).getByRole("button", { name: "Done" }).click();
    await expect(card(page).getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");
    await card(page).getByRole("button", { name: "Skipped" }).click();
    await expect(card(page).getByRole("button", { name: "Skipped" })).toHaveAttribute("aria-pressed", "true");

    await context.setOffline(false);
    await expect(card(page).getByText("Saved on this device.")).toHaveCount(0);
    await page.reload();
    await expect(card(page).getByRole("button", { name: "Skipped" })).toHaveAttribute("aria-pressed", "true");
    await expect(card(page).getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "false");
  });

  test("says so when a waiting check-off can't be saved", async ({ page }) => {
    await page.goto("/loop");
    await page.evaluate(() => {
      window.localStorage.setItem(
        "offline-checkoffs",
        JSON.stringify([{ id: "00000000-0000-4000-8000-000000000000", status: "done", log_note: "", title: "A lost block" }])
      );
    });
    await page.reload();
    await expect(page.getByRole("alert").filter({ hasText: "A lost block" })).toContainText("couldn't be saved");
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByText("A lost block")).toHaveCount(0);
    expect(await page.evaluate(() => window.localStorage.getItem("offline-checkoffs"))).toBeNull();
  });

  test("the saved Loop opens with no connection, and other pages explain why they can't", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name === "shell-mobile", "The service worker is the same on both.");
    await page.goto("/loop");
    await expect(card(page)).toBeVisible();

    // Outside production the app doesn't start it by itself, because it would cache files being edited.
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;
      registration.active?.postMessage({ type: "save-loop" });
    });
    await expect
      .poll(() => page.evaluate(async () => Boolean(await (await caches.open("pages-v1")).match("/loop", { ignoreVary: true }))))
      .toBe(true);
    // A second visit under the worker's control saves the files the page needs.
    await page.reload();
    await expect(card(page)).toBeVisible();
    await page.waitForLoadState("networkidle");

    await context.setOffline(true);
    await page.goto("/loop");
    await expect(card(page)).toBeVisible();

    // Its buttons start up offline only in a production build, unlike this development one, and production has no preview
    // mode to test it through. A throwaway production build confirmed they work, and that check-offs wait and then save.
    await page.goto("/settings");
    await expect(page.getByText("You're offline. Only today's Loop can be opened")).toBeVisible();

    await context.setOffline(false);
  });
});

test("Settings lists categories and their weights, read-only", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Categories and weights" })).toBeVisible();
  const row = (name: string) => page.getByRole("row", { name: new RegExp(`^${name}`) });
  await expect(row("Project work")).toContainText("1.2");
  await expect(row("Useful YouTube")).toContainText("Counts up to 60 minutes a day");
  await expect(row("Other")).toContainText("0");
});
