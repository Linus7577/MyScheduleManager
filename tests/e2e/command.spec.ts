import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// The command center through the real screens, starting each test from a known state.
test.describe.configure({ mode: "serial" });

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

function weekdayName(date: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

async function seed(request: APIRequestContext, query = "") {
  const response = await request.get(`/api/dev/preview-seed${query ? `?${query}` : ""}`);
  expect(response.ok()).toBe(true);
}

async function saveDialog(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

async function createGoal(page: Page, title: string) {
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).click();
  await page.getByLabel("Goal", { exact: true }).fill(title);
  await page.getByLabel("Why it matters").fill("Because it matters");
  await saveDialog(page);
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

test.afterAll(async ({ request }) => {
  await seed(request);
});

test("a goal's progress follows its tasks, and tasks with due dates reach the calendar", async ({ page, request }) => {
  await seed(request);
  await createGoal(page, "Graduate");

  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project", { exact: true }).fill("Thesis");
  await saveDialog(page);

  for (const [title, due] of [
    ["Write chapter one", todayIso()],
    ["Write chapter two", ""],
  ]) {
    await page.getByRole("button", { name: "New task in Thesis" }).click();
    await page.getByLabel("Task", { exact: true }).fill(title);
    if (due) await page.getByLabel("Due date").fill(due);
    await saveDialog(page);
  }

  const goalBar = page.getByRole("progressbar", { name: "Progress of Graduate" });
  await expect(goalBar).toHaveAttribute("aria-valuenow", "0");

  await page.getByRole("checkbox", { name: "Write chapter two done" }).click();
  await expect(goalBar).toHaveAttribute("aria-valuenow", "50");

  await page.goto("/calendar");
  await page.getByRole("tab", { name: "Day view" }).click();
  await page.getByText("Write chapter one").first().click();
  await expect(page).toHaveURL(/\/goals\//);
  await expect(page.getByRole("heading", { level: 1, name: "Graduate" })).toBeVisible();
});

test("a project can set its progress by hand", async ({ page, request }) => {
  await seed(request);
  await createGoal(page, "Ship the app");

  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project", { exact: true }).fill("Launch");
  await page.getByLabel("Progress comes from").selectOption("manual");
  await page.getByLabel("Percent complete").fill("40");
  await saveDialog(page);

  await expect(page.getByRole("progressbar", { name: "Progress of Ship the app" })).toHaveAttribute("aria-valuenow", "40");
  await expect(page.getByRole("img", { name: /Ship the app progress/ })).toBeVisible();
});

test("the learning tracker tracks units, and tagged blocks count toward the chart", async ({ page, request }) => {
  await seed(request);
  await page.goto("/learning");
  await page.getByRole("button", { name: "New track" }).click();
  await page.getByLabel("Title").fill("Algorithms");
  await page.getByLabel("Type").selectOption("book");
  await saveDialog(page);

  await page.getByRole("link", { name: /Algorithms/ }).click();
  await page.getByRole("button", { name: "New unit" }).click();
  await page.getByLabel("Unit", { exact: true }).fill("Sorting");
  await page.getByLabel("Percent complete").fill("80");
  await saveDialog(page);
  await expect(page.getByRole("progressbar", { name: "Progress of Algorithms" })).toHaveAttribute("aria-valuenow", "80");

  await page.goto("/loop/templates");
  await page.getByRole("link", { name: "Edit blocks in Semester" }).click();
  await page.getByRole("button", { name: `Add a block on ${weekdayName(todayIso())}` }).click();
  await page.getByLabel("Title").fill("Study algorithms");
  await page.getByLabel("Start").fill("06:00");
  await page.getByLabel("End").fill("07:00");
  await page.getByLabel("Learning track").selectOption({ label: "Algorithms" });
  await saveDialog(page);

  await page.goto("/loop");
  const card = page.locator("li", { has: page.getByRole("heading", { level: 3, name: "Study algorithms" }) });
  await card.getByRole("button", { name: "Done" }).click();
  await expect(card.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");

  await page.goto("/learning");
  await expect(page.getByRole("img", { name: /study minutes per week/ })).toBeVisible();
  await page.getByText("View as a table").click();
  await expect(page.getByRole("cell", { name: "60", exact: true })).toBeVisible();
});

test("habits check in, build a streak and fill the heatmap, without touching XP", async ({ page, request }) => {
  await seed(request);
  await page.goto("/habits");
  await expect(page.getByText("Small rites build empires")).toBeVisible();

  await page.getByRole("button", { name: "New habit" }).click();
  await page.getByLabel("Habit", { exact: true }).fill("Sleep before 01:00");
  await saveDialog(page);

  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByRole("button", { name: "Done today" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1 day", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Checked in on / })).toHaveCount(1);

  const status = page.getByRole("region", { name: "Character status" });
  await expect(status.getByRole("progressbar", { name: "XP" })).toHaveAttribute("aria-valuetext", "0");

  await page.getByRole("button", { name: "Done today" }).click();
  await expect(page.getByRole("button", { name: "Check in" })).toBeVisible();
});

test("the dashboard starts with goals open and the rest collapsed", async ({ page, request }) => {
  await seed(request);
  await page.goto("/");

  const goals = page.getByRole("button", { name: "Goals and projects", exact: true });
  await expect(goals).toHaveAttribute("aria-expanded", "true");

  for (const name of ["Today's loop", "Learning", "Streaks and habits", "Spending this month", "Portfolio", "The Oracle's counsel", "Coming up", "This week"]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute("aria-expanded", "false");
  }
});

test("widgets open, close, hide and reorder, and the layout is remembered", async ({ page, request }) => {
  await seed(request);
  await page.goto("/");

  const weekly = page.getByRole("button", { name: "This week", exact: true });
  await weekly.click();
  await expect(weekly).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("img", { name: /planned and done minutes/ })).toBeVisible();

  await page.getByRole("button", { name: "Arrange" }).click();
  await page.getByRole("button", { name: "Move Today's loop up" }).click();
  await page.getByRole("button", { name: "Hide Portfolio" }).click();
  await page.getByRole("button", { name: "Finish arranging" }).click();
  await page.waitForLoadState("networkidle");

  await page.reload();
  await expect(page.locator("main section h2 button").first()).toHaveText("Today's loop");
  const titles = await page.locator("main section h2 button").allTextContents();
  expect(titles[1]).toBe("Goals and projects");
  expect(titles).not.toContain("Portfolio");
  await expect(page.getByRole("button", { name: "This week", exact: true })).toHaveAttribute("aria-expanded", "true");
});

test("a widget can be dragged by its handle", async ({ page, request }, testInfo) => {
  // Touch dragging is the same code path, and Playwright's mouse only drives this reliably at desktop size.
  test.skip(testInfo.project.name === "shell-mobile", "Mouse drag is checked at desktop size");

  await seed(request);
  await page.goto("/");
  await page.getByRole("button", { name: "Arrange" }).click();

  const from = await page.getByRole("button", { name: "Drag Goals and projects" }).boundingBox();
  const to = await page.getByRole("button", { name: "Drag Learning" }).boundingBox();
  if (!from || !to) throw new Error("Drag handles aren't on screen");

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2 + 8, { steps: 12 });
  await page.mouse.up();
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Finish arranging" }).click();
  await expect(page.locator("main section h2 button").first()).not.toHaveText("Goals and projects");
});

test("phone and desktop keep separate layouts", async ({ page, request, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "shell-desktop", "One run is enough, since this switches sizes itself");

  await seed(request);
  await page.goto("/");
  await page.getByRole("button", { name: "Arrange" }).click();
  await page.getByRole("button", { name: "Hide Goals and projects" }).click();
  await page.getByRole("button", { name: "Finish arranging" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Goals and projects", exact: true })).toHaveCount(0);

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: testInfo.project.use.baseURL });
  const phonePage = await phone.newPage();
  await phonePage.goto("/");
  await expect(phonePage.getByRole("button", { name: "Goals and projects", exact: true })).toBeVisible();
  await phone.close();
});

test("the hero shows today's loop as a timeline", async ({ page, request }) => {
  await seed(request, "today=1");
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Today's loop" }).getByText("Test block")).toBeVisible();
});

test("these screens have no browser errors or sideways scroll", async ({ page, request }) => {
  await seed(request, "today=1");
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  for (const path of ["/", "/goals", "/learning", "/habits", "/more"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, `sideways scroll on ${path}`).toBeLessThanOrEqual(0);
  }
  expect(errors).toEqual([]);
});

test("they work in Chinese", async ({ page, request, context, baseURL }) => {
  await seed(request);
  await context.addCookies([{ name: "locale", value: "zh-TW", url: baseURL as string }]);
  for (const [path, heading] of [
    ["/goals", "目標"],
    ["/learning", "學習"],
    ["/habits", "習慣"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: "指揮中心" })).toBeVisible();
});
