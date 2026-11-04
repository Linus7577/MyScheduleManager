import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// The Vault through the real screens. Each test starts from an empty store, and they run one at a time.

async function seed(request: APIRequestContext) {
  expect((await request.get("/api/dev/preview-seed")).ok()).toBe(true);
}

async function saveDialog(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

type NewItem = { title: string; url?: string; note?: string; type?: string; section?: string; tags?: string; link?: string };

async function addItem(page: Page, item: NewItem) {
  await page.getByRole("button", { name: "Add to the Vault" }).click();
  const dialog = page.getByRole("dialog");
  if (item.type) await dialog.getByLabel("Type").selectOption({ label: item.type });
  await dialog.getByLabel("Title").fill(item.title);
  if (item.url) await dialog.getByLabel("Address").fill(item.url);
  if (item.note) await dialog.getByLabel("Note", { exact: true }).fill(item.note);
  if (item.section) await dialog.getByLabel("Section").selectOption({ label: item.section });
  if (item.tags) await dialog.getByLabel("Tags").fill(item.tags);
  if (item.link) await dialog.getByLabel("Linked to").selectOption({ label: item.link });
  await saveDialog(page);
}

const filters = (page: Page) => page.getByRole("region", { name: "Search and filter" });
const row = (page: Page, title: string) => page.locator("li", { hasText: title }).first();

test.beforeEach(async ({ request }) => {
  await seed(request);
});

test.afterAll(async ({ request }) => {
  await seed(request);
});

test("More opens the Vault, empty at first, and the hall is no longer sealed", async ({ page }) => {
  await page.goto("/more");
  await expect(page.getByText("Sealed until Phase 6")).toHaveCount(0);
  await page.getByRole("link", { name: "The Vault" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "The Vault" })).toBeVisible();
  await expect(page.getByText("The Vault stands empty.")).toBeVisible();
});

test("a link opens where it points, safely, in a new tab", async ({ page }) => {
  await page.goto("/vault");
  await addItem(page, { title: "Course repo", url: "github.com/a/b", section: "Courses", tags: "code, 期末" });

  const link = page.getByRole("link", { name: "Course repo" });
  await expect(link).toHaveAttribute("href", "https://github.com/a/b");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expect(row(page, "Course repo").getByLabel("Link", { exact: true })).toBeVisible();
  await expect(row(page, "Course repo")).toContainText("github.com");
  await expect(row(page, "Course repo").getByRole("button", { name: "Show only 期末" })).toBeVisible();
});

test("an address that isn't a web address is refused", async ({ page }) => {
  await page.goto("/vault");
  await page.getByRole("button", { name: "Add to the Vault" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Bad");
  await dialog.getByLabel("Address").fill("javascript:alert(1)");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("The Vault stands empty.")).toBeVisible();
});

test("a note shows its markdown, and can't run code or load pictures", async ({ page }) => {
  await page.goto("/vault");
  await addItem(page, {
    title: "Study plan",
    type: "Note",
    note: [
      "# Week one",
      "**Bold words** and [a link](https://example.com).",
      "- first\n- second",
      "<script>window.hacked = true</script>",
      '<b onclick="window.hacked = true">raw html</b>',
      "[bad](javascript:window.hacked=true)",
      "![tracker](https://example.com/pixel.png)",
    ].join("\n\n"),
  });

  await page.getByRole("link", { name: "Study plan" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Study plan" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Week one" })).toBeVisible();
  await expect(page.locator("strong", { hasText: "Bold words" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "first" })).toBeVisible();
  await expect(page.getByRole("link", { name: "a link" })).toHaveAttribute("rel", /noopener/);

  await expect(page.locator("main img")).toHaveCount(0);
  await expect(page.locator('a[href*="javascript"]')).toHaveCount(0);
  await expect(page.locator("main script")).toHaveCount(0);
  await expect(page.locator("main [onclick]")).toHaveCount(0);
  expect(await page.evaluate(() => "hacked" in window)).toBe(false);
});

test("search and every filter narrow the list", async ({ page }) => {
  await page.goto("/vault");
  await addItem(page, { title: "Algebra slides", type: "File reference", url: "drive.google.com/a", section: "Courses", tags: "math" });
  await addItem(page, { title: "Budget sheet", url: "https://example.com/budget", section: "Finance", tags: "money" });
  await addItem(page, { title: "Ideas", type: "Note", note: "Learn Rust", section: "Personal", tags: "math" });

  const box = filters(page);
  await box.getByLabel("Search the Vault").fill("rust");
  await expect(row(page, "Ideas")).toBeVisible();
  await expect(page.getByText("Budget sheet")).toHaveCount(0);
  await expect(box.getByRole("status")).toHaveText("1 match");

  await box.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByText("Budget sheet")).toBeVisible();

  await box.getByLabel("Section").selectOption({ label: "Finance" });
  await expect(page.getByRole("link", { name: "Ideas" })).toHaveCount(0);
  await box.getByRole("button", { name: "Clear filters" }).click();

  await box.getByLabel("Tag").selectOption("math");
  await expect(page.getByText("Budget sheet")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ideas" })).toBeVisible();

  await box.getByLabel("Type").selectOption({ label: "File reference" });
  await expect(page.getByRole("link", { name: "Ideas" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Algebra slides" })).toBeVisible();

  await box.getByLabel("Search the Vault").fill("nothing like this");
  await expect(page.getByText("Nothing here matches.")).toBeVisible();
});

test("tapping a tag filters by it", async ({ page }) => {
  await page.goto("/vault");
  await addItem(page, { title: "One", url: "https://example.com/1", tags: "alpha" });
  await addItem(page, { title: "Two", url: "https://example.com/2", tags: "beta" });
  await page.getByRole("button", { name: "Show only alpha" }).click();
  await expect(page.getByRole("link", { name: "Two" })).toHaveCount(0);
  await expect(filters(page).getByLabel("Tag")).toHaveValue("alpha");
});

test("pinning moves an item to the top, and it can be edited and deleted", async ({ page }) => {
  await page.goto("/vault");
  await addItem(page, { title: "Older", url: "https://example.com/1" });
  await addItem(page, { title: "Newer", url: "https://example.com/2" });

  const titles = page.locator('main ul a[target="_blank"]');
  await expect(titles.first()).toContainText("Newer");
  await page.getByRole("button", { name: "Pin Older" }).click();
  await expect(page.getByRole("button", { name: "Unpin Older" })).toBeVisible();
  await expect(titles.first()).toContainText("Older");

  await page.getByRole("button", { name: "Edit Older" }).click();
  await page.getByRole("dialog").getByLabel("Title").fill("Renamed");
  await saveDialog(page);
  await expect(page.getByRole("link", { name: "Renamed" })).toBeVisible();
  // Editing keeps it pinned.
  await expect(page.getByRole("button", { name: "Unpin Renamed" })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Renamed" }).click();
  await expect(page.getByRole("link", { name: "Renamed" })).toHaveCount(0);
});

test("a note can be edited and deleted from its own page", async ({ page }) => {
  await page.goto("/vault");
  await addItem(page, { title: "Draft", type: "Note", note: "First version" });
  await page.getByRole("link", { name: "Draft" }).click();
  await expect(page.getByText("First version")).toBeVisible();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Note", { exact: true }).fill("Second version");
  await saveDialog(page);
  await expect(page.getByText("Second version")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/vault$/);
  await expect(page.getByText("The Vault stands empty.")).toBeVisible();
});

test("an item linked to a goal shows on the goal's page", async ({ page }) => {
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).click();
  await page.getByLabel("Goal", { exact: true }).fill("Pass finals");
  await saveDialog(page);

  await page.goto("/vault");
  await addItem(page, { title: "Past papers", url: "https://example.com/papers", link: "Pass finals" });

  await page.goto("/goals");
  await page.getByRole("link", { name: /Pass finals/ }).click();
  await expect(page.getByRole("heading", { name: "From the Vault" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Past papers" })).toBeVisible();
});

test("sections can be added and renamed, and one with items can't be deleted", async ({ page }) => {
  await page.goto("/vault");
  await addItem(page, { title: "Kept", url: "https://example.com", section: "Courses" });

  await page.getByRole("link", { name: "Manage sections" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sections" })).toBeVisible();

  await page.getByRole("button", { name: "New section" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Exams");
  await saveDialog(page);
  await expect(page.getByText("Exams", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Rename Personal" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Life");
  await saveDialog(page);
  await expect(page.getByText("Life", { exact: true })).toBeVisible();

  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Courses" }).click();
  await expect(page.getByText("This section still has items.")).toBeVisible();

  await page.getByRole("button", { name: "Delete Exams" }).click();
  await expect(page.getByText("Exams", { exact: true })).toHaveCount(0);
});

test("the pages fit the screen, with no sideways scrolling", async ({ page }) => {
  await page.goto("/vault");
  await addItem(page, {
    title: "A very long title that keeps going and going and going without any sign of stopping at all",
    url: "https://example.com/a/very/long/path/that/also/keeps/going/and/going/and/going/and/going/forever",
    tags: "one, two, three, four, five, six",
  });
  await addItem(page, { title: "Wide note", type: "Note", note: `Text\n\n\`\`\`\n${"x".repeat(300)}\n\`\`\`\n\n| a | b |\n|---|---|\n| 1 | 2 |` });

  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  for (const path of ["/vault", "/vault/sections"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await overflow(), path).toBeLessThanOrEqual(0);
  }
  await page.goto("/vault");
  await page.getByRole("link", { name: "Wide note" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Wide note" })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
});

test("the Vault works in Chinese", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "locale", value: "zh-TW", url: baseURL as string }]);
  await page.goto("/vault");
  await expect(page.getByRole("heading", { level: 1, name: "秘庫" })).toBeVisible();
  await page.getByRole("button", { name: "加入秘庫" }).click();
  await expect(page.getByRole("dialog").getByRole("option", { name: "課程" })).toBeAttached();
});
