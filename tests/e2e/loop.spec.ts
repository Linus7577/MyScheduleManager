import { expect, test, type Page } from "@playwright/test";

// A real flow through the screens, using preview mode's in-memory storage. The steps build on each other,
// and each project gets its own uniquely named template, because storage is shared across the run.
test.describe.configure({ mode: "serial" });

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

function plusDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function weekdayName(date: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

async function fillBlock(page: Page, title: string, start: string, end: string, category = "study") {
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Start").fill(start);
  await page.getByLabel("End").fill(end);
  await page.getByLabel("Category").selectOption(category);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("the three templates are seeded, with one active", async ({ page }) => {
  await page.goto("/loop/templates");
  await expect(page.getByRole("heading", { level: 2, name: "Semester" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Exam Week" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Holiday" })).toBeVisible();
  await expect(page.getByText("Active", { exact: true })).toHaveCount(1);
});

test("blocks added to the template appear on the day, with an overlap warning", async ({ page }, testInfo) => {
  const today = todayIso();
  const title = `Study ${testInfo.project.name}`;
  const overlap = `Gym ${testInfo.project.name}`;

  await page.goto("/loop/templates");
  await page.getByRole("link", { name: "Edit blocks in Semester" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Semester" })).toBeVisible();

  await page.getByRole("button", { name: `Add a block on ${weekdayName(today)}` }).click();
  await fillBlock(page, title, "06:00", "07:00");

  await page.getByRole("button", { name: `Add a block on ${weekdayName(today)}` }).click();
  await fillBlock(page, overlap, "06:30", "07:30", "gym");
  await expect(page.getByText("This block overlaps another.").first()).toBeVisible();

  await page.goto(`/loop?date=${today}`);
  await expect(page.getByRole("heading", { level: 3, name: title })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: overlap })).toBeVisible();
  await expect(page.getByText("This block overlaps another.").first()).toBeVisible();
});

test("a block can be checked off, changed and given a note", async ({ page }, testInfo) => {
  const title = `Study ${testInfo.project.name}`;
  await page.goto(`/loop?date=${todayIso()}`);
  const card = page.locator("li", { has: page.getByRole("heading", { level: 3, name: title }) });

  await card.getByRole("button", { name: "Done" }).click();
  await expect(card.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");

  await card.getByRole("button", { name: "Partial" }).click();
  await expect(card.getByRole("button", { name: "Partial" })).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "false");

  await card.getByRole("button", { name: "Note" }).click();
  await page.getByLabel("Note", { exact: true }).fill("Half an hour lost");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Half an hour lost")).toBeVisible();

  await page.reload();
  await expect(card.getByRole("button", { name: "Partial" })).toHaveAttribute("aria-pressed", "true");
});

test("editing changes one day only", async ({ page }, testInfo) => {
  const today = todayIso();
  const title = `Gym ${testInfo.project.name}`;
  await page.goto(`/loop?date=${today}`);
  const card = page.locator("li", { has: page.getByRole("heading", { level: 3, name: title }) });

  await card.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Title").fill(`${title} moved`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { level: 3, name: `${title} moved` })).toBeVisible();

  await page.goto(`/loop?date=${plusDays(today, 7)}`);
  await expect(page.getByRole("heading", { level: 3, name: title, exact: true })).toBeVisible();
});

test("future blocks can't be logged", async ({ page }, testInfo) => {
  await page.goto(`/loop?date=${plusDays(todayIso(), 7)}`);
  const card = page.locator("li", {
    has: page.getByRole("heading", { level: 3, name: `Gym ${testInfo.project.name}`, exact: true }),
  });
  await expect(card).toBeVisible();
  await expect(card.getByRole("button", { name: "Done" })).toHaveCount(0);
});

test("a Rest Day rests the day's blocks and can be taken back", async ({ page }, testInfo) => {
  const nextWeek = plusDays(todayIso(), 7);
  await page.goto(`/loop?date=${nextWeek}`);
  const card = page.locator("li", {
    has: page.getByRole("heading", { level: 3, name: `Gym ${testInfo.project.name}`, exact: true }),
  });

  await page.getByRole("button", { name: "Rest Day" }).click();
  await expect(page.getByText("Rest Day. No XP")).toBeVisible();
  await expect(card.getByText("Rest", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Take it back" }).click();
  await expect(page.getByRole("button", { name: "Rest Day" })).toBeVisible();
  await expect(card.getByText("Planned", { exact: true })).toBeVisible();
});

test("a Rest Day isn't offered today, but a Shield is", async ({ page }) => {
  await page.goto(`/loop?date=${todayIso()}`);
  await expect(page.getByRole("button", { name: "Rest Day" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Shield" })).toBeEnabled();
});

test("a template can be switched from a chosen date", async ({ page }, testInfo) => {
  const startsOn = plusDays(todayIso(), 60);
  const name = `Summer ${testInfo.project.name}`;

  await page.goto("/loop/templates");
  await page.getByRole("button", { name: "New template" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Save" }).click();

  const row = page.locator("li", { has: page.getByRole("heading", { level: 2, name }) });
  await row.getByRole("button", { name: "Make active" }).click();
  await page.getByLabel("Takes effect from").fill(startsOn);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(row.getByText(/^Starts /)).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();

  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("This template is active or scheduled")).toBeVisible();
});

test.describe("calendar", () => {
  test("shows the views, and blocks from the loop", async ({ page }, testInfo) => {
    await page.goto("/calendar");
    await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
    for (const view of ["Month", "Week", "Agenda", "Day"]) {
      await page.getByRole("tab", { name: `${view} view` }).click();
      await expect(page.getByRole("tab", { name: `${view} view` })).toHaveAttribute("aria-selected", "true");
    }
    await expect(page.getByText(`Study ${testInfo.project.name}`).first()).toBeVisible();
  });

  test("creates, shows, edits and deletes a one-off event", async ({ page }, testInfo) => {
    const title = `Dentist ${testInfo.project.name}`;
    await page.goto("/calendar");
    await page.getByRole("tab", { name: "Day view" }).click();

    await page.getByRole("button", { name: "New event" }).click();
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Start time").fill("14:00");
    await page.getByLabel("End time").fill("15:00");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText(title).first()).toBeVisible();

    await page.getByText(title).first().click();
    await page.getByLabel("Title").fill(`${title} moved`);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(`${title} moved`).first()).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByText(`${title} moved`).first().click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText(`${title} moved`)).toHaveCount(0);
  });

  test("a productive event can be logged in the Loop", async ({ page }, testInfo) => {
    const title = `Library ${testInfo.project.name}`;
    await page.goto("/calendar");
    await page.getByRole("button", { name: "New event" }).click();
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Category").selectOption("study");
    await expect(page.getByLabel("All day")).toHaveCount(0);
    await page.getByLabel("Start time").fill("16:00");
    await page.getByLabel("End time").fill("17:00");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.goto(`/loop?date=${todayIso()}`);
    const card = page.locator("li", { has: page.getByRole("heading", { level: 3, name: title }) });
    await card.getByRole("button", { name: "Done" }).click();
    await expect(card.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");
  });

  test("has no browser errors and no sideways scroll", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/calendar");
    await expect(page.getByRole("button", { name: "New event" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("works in Chinese", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "locale", value: "zh-TW", url: baseURL as string }]);
    await page.goto("/calendar");
    await expect(page.getByRole("heading", { level: 1, name: "行事曆" })).toBeVisible();
    await expect(page.getByRole("button", { name: "新增活動" })).toBeVisible();
    await expect(page.getByText("議程", { exact: true })).toBeVisible();
  });
});
