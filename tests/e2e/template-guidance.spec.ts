import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Guards the two mistakes the owner actually hit: adding blocks to a template that isn't active, and using the
// pencil expecting to add a block.
test.describe.configure({ mode: "serial" });

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

function weekdayName(date: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

async function seed(request: APIRequestContext) {
  expect((await request.get("/api/dev/preview-seed")).ok()).toBe(true);
}

async function addBlock(page: Page, title: string, start: string, end: string) {
  await page.getByRole("button", { name: `Add a block on ${weekdayName(todayIso())}` }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Start").fill(start);
  await page.getByLabel("End").fill(end);
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

async function openTemplate(page: Page, name: string) {
  await page.goto("/loop/templates");
  await page.getByRole("link", { name: `Edit blocks in ${name}` }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test.afterAll(async ({ request }) => {
  await seed(request);
});

test("an inactive template warns you, and switching makes its blocks earn XP", async ({ page, request }) => {
  await seed(request);
  await openTemplate(page, "Exam Week");

  const warning = page.getByRole("region", { name: "This template isn't active" });
  await expect(warning).toContainText("Semester");
  await addBlock(page, "Revise", "06:00", "07:00");

  await page.goto("/loop");
  await expect(page.getByText("Your blocks are in Exam Week, but Semester is the active template.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Revise" })).toHaveCount(0);

  await openTemplate(page, "Exam Week");
  await warning.getByRole("button", { name: "Make active" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(warning).toBeHidden();

  await page.goto("/loop");
  const card = page.locator("li", { has: page.getByRole("heading", { level: 3, name: "Revise" }) });
  await card.getByRole("button", { name: "Done" }).click();
  await expect(
    page.getByRole("region", { name: "Character status" }).getByRole("progressbar", { name: "XP" })
  ).toHaveAttribute("aria-valuetext", "60");
});

test("the active template shows no warning, and explains how XP is earned", async ({ page, request }) => {
  await seed(request);
  await openTemplate(page, "Semester");
  await expect(page.getByRole("region", { name: "This template isn't active" })).toHaveCount(0);
  await expect(page.getByText("You earn XP by tapping Done")).toBeVisible();

  await page.getByRole("link", { name: "Go to the Loop" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "The Loop" })).toBeVisible();
});

test("adding again stacks blocks, and nothing is lost", async ({ page, request }) => {
  await seed(request);
  await openTemplate(page, "Semester");

  await addBlock(page, "First", "06:00", "07:00");
  await addBlock(page, "Second", "08:00", "09:00");
  await addBlock(page, "Third", "10:00", "11:00");

  for (const title of ["First", "Second", "Third"]) {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
});

test("editing explains it replaces, and can save a copy as a new block instead", async ({ page, request }) => {
  await seed(request);
  await openTemplate(page, "Semester");
  await addBlock(page, "Original", "06:00", "07:00");

  await page.getByRole("button", { name: "Edit Original" }).click();
  await expect(page.getByText("Saving changes this block.")).toBeVisible();
  await page.getByLabel("Title").fill("Copy");
  await page.getByLabel("Start").fill("08:00");
  await page.getByLabel("End").fill("09:00");
  await page.getByRole("button", { name: "Save as a new block" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await expect(page.getByText("Original", { exact: true })).toBeVisible();
  await expect(page.getByText("Copy", { exact: true })).toBeVisible();
});

test("editing with plain Save still changes the block in place", async ({ page, request }) => {
  await seed(request);
  await openTemplate(page, "Semester");
  await addBlock(page, "Before", "06:00", "07:00");

  await page.getByRole("button", { name: "Edit Before" }).click();
  await page.getByLabel("Title").fill("After");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await expect(page.getByText("After", { exact: true })).toBeVisible();
  await expect(page.getByText("Before", { exact: true })).toHaveCount(0);
});
