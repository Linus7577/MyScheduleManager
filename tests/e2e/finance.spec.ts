import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// The Treasury through the real screens. Preview mode answers prices and rates with fixed values: US 150, TW 1000,
// 1 USD = 32 TWD, 1 IDR = 0.002 TWD. Each test starts from an empty store, and they run one at a time.

async function seed(request: APIRequestContext) {
  expect((await request.get("/api/dev/preview-seed")).ok()).toBe(true);
}

async function saveDialog(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

/** Types on the on-screen pad, as a phone would. */
async function pressPad(page: Page, digits: string) {
  for (const digit of digits) {
    await page.getByRole("dialog").getByRole("button", { name: digit, exact: true }).click();
  }
}

async function quickAdd(page: Page, digits: string, category: string) {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await pressPad(page, digits);
  await page.getByRole("button", { name: `Save to ${category}` }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

async function totals(page: Page) {
  return page.getByRole("region", { name: "Totals" });
}

async function addTrade(page: Page, trade: { symbol: string; quantity: string; price: string; side?: string; market?: string }) {
  await page.getByRole("button", { name: "Add trade" }).click();
  if (trade.side) await page.getByLabel("Side").selectOption(trade.side);
  if (trade.market) await page.getByLabel("Market", { exact: true }).selectOption(trade.market);
  await page.getByLabel("Symbol").fill(trade.symbol);
  await page.getByLabel("Quantity").fill(trade.quantity);
  await page.getByLabel(/^Price/).fill(trade.price);
}

test.beforeEach(async ({ request }) => {
  await seed(request);
});

test.afterAll(async ({ request }) => {
  await seed(request);
});

test("quick add: Add, the amount on the pad, a category, and it's saved", async ({ page }) => {
  await page.goto("/finance");
  await quickAdd(page, "120", "Food");

  await expect(await totals(page)).toContainText("120");
  await expect(page.getByText("Food", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Food record" })).toBeVisible();
});

test("a category can't be tapped until there's an amount", async ({ page }) => {
  await page.goto("/finance");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const food = page.getByRole("button", { name: "Save to Food" });
  await expect(food).toBeDisabled();
  await pressPad(page, "5");
  await expect(food).toBeEnabled();
  await page.getByRole("button", { name: "Delete last digit" }).click();
  await expect(food).toBeDisabled();
});

test("foreign money shows and saves its TWD value", async ({ page }) => {
  await page.goto("/finance");
  // The first visit fetches today's rates in the background.
  await page.goto("/finance/portfolio");
  await expect(page.getByText("1 USD = 32 TWD")).toBeVisible();

  await page.goto("/finance");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "USD", exact: true }).click();
  await pressPad(page, "10");
  await expect(page.getByText(/About .*320 at 32/)).toBeVisible();
  await page.getByRole("button", { name: "Save to Food" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await expect(await totals(page)).toContainText("320");
  await expect(page.getByText("$10.00").or(page.getByText("US$10.00"))).toBeVisible();
});

test("income, note and date go through More details, and show in net savings", async ({ page }) => {
  await page.goto("/finance");
  await quickAdd(page, "100", "Food");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Income", exact: true }).click();
  await pressPad(page, "1000");
  await page.getByRole("button", { name: "More details" }).click();
  await page.getByLabel("Note").fill("Stipend");
  await page.getByRole("button", { name: "Save to Allowance" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  const box = await totals(page);
  await expect(box).toContainText("1,000");
  await expect(box).toContainText("+NT$900");
  await expect(page.getByText(/Stipend/)).toBeVisible();
});

test("the views switch between day, month and year", async ({ page }) => {
  await page.goto("/finance");
  await quickAdd(page, "250", "Transport");

  await page.getByRole("link", { name: "Day", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit Transport record" })).toBeVisible();

  await page.getByRole("link", { name: "Year", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Income and spending" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Spending by category" })).toBeVisible();
  await expect(page.getByRole("img", { name: /income and spending for each month/ })).toBeVisible();

  await page.getByRole("link", { name: "Month", exact: true }).click();
  await expect(page.getByRole("img", { name: /spending for each day/ })).toBeVisible();

  await page.getByRole("link", { name: "Previous period" }).click();
  await expect(page.getByText("Nothing recorded here. The ledger waits.")).toBeVisible();
});

test("a record can be edited and deleted", async ({ page }) => {
  await page.goto("/finance");
  await quickAdd(page, "100", "Food");

  await page.getByRole("button", { name: "Edit Food record" }).click();
  await page.getByLabel("Amount").fill("150");
  await saveDialog(page);
  await expect(await totals(page)).toContainText("150");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Food record" }).click();
  await expect(page.getByText("Nothing recorded here. The ledger waits.")).toBeVisible();
});

test("budgets warn at 80% and again at 100%, on the Treasury and on Home", async ({ page }) => {
  await page.goto("/finance/budgets");
  await page.getByRole("button", { name: "Set budget for Food" }).click();
  await page.getByLabel("Monthly budget").fill("1000");
  await saveDialog(page);
  await expect(page.getByText("On track")).toBeVisible();

  await page.goto("/finance");
  await quickAdd(page, "800", "Food");
  const banner = page.getByRole("region", { name: "Budget alerts" });
  await expect(banner).toContainText("Food is at 80%");

  await page.goto("/");
  await expect(page.getByRole("region", { name: "Budget alerts" })).toContainText("Food is at 80%");

  await page.goto("/finance");
  await quickAdd(page, "200", "Food");
  await expect(banner).toContainText("Food has reached 100%");

  await page.goto("/finance/budgets");
  await expect(page.getByText("Limit reached")).toBeVisible();
});

test("a recurring rule creates its records automatically, once", async ({ page }) => {
  await page.goto("/finance/recurring");
  await page.getByRole("button", { name: "New recurring" }).click();
  await page.getByLabel("Amount").fill("5000");
  await page.getByLabel("Category").selectOption({ label: "Rent/Housing" });
  await page.getByLabel("Note").fill("Rent");
  await saveDialog(page);
  await expect(page.getByText(/Next:/)).toBeVisible();

  await page.goto("/finance");
  await expect(page.getByRole("button", { name: "Edit Rent/Housing record" })).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Edit Rent/Housing record" })).toHaveCount(1);
  await expect(page.getByLabel("Recurring")).toBeVisible();
});

test("categories can be renamed, added and archived", async ({ page }) => {
  await page.goto("/finance/categories");
  await page.getByRole("button", { name: "Rename Food" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Meals");
  await saveDialog(page);
  await expect(page.getByText("Meals", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add a category to Spent" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Pets");
  await saveDialog(page);

  await page.getByRole("button", { name: "Archive Gifts" }).click();
  await expect(page.getByRole("button", { name: "Restore Gifts" })).toBeVisible();

  await page.goto("/finance");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save to Meals" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save to Pets" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save to Gifts" })).toHaveCount(0);
});

test("the portfolio tracks trades, prices and profit, and says it isn't advice", async ({ page }) => {
  await page.goto("/finance/portfolio");
  await expect(page.getByText("Tracking only. Not investment advice.")).toBeVisible();
  await expect(page.getByText("1 USD = 32 TWD")).toBeVisible();

  await addTrade(page, { symbol: "aapl", quantity: "10", price: "100" });
  await saveDialog(page);

  // Cost 10 × 100 × 32 = 32,000. Worth 10 × 150 × 32 = 48,000. Up 16,000.
  const box = await totals(page);
  await page.getByRole("button", { name: "Refresh prices" }).click();
  await expect(box).toContainText("48,000");
  await expect(box).toContainText("+NT$16,000");
  await expect(page.getByRole("heading", { name: "Allocation" })).toBeVisible();

  await addTrade(page, { symbol: "AAPL", quantity: "4", price: "150", side: "sell" });
  await saveDialog(page);
  // 4 × (150 − 100) × 32 = 6,400 realized.
  await expect(box).toContainText("+NT$6,400");

  await addTrade(page, { symbol: "AAPL", quantity: "100", price: "150", side: "sell" });
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("more shares than you held");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
});

test("a Taiwan holding is priced in TWD, and a price can be set by hand", async ({ page }) => {
  await page.goto("/finance/portfolio");
  await addTrade(page, { symbol: "2330", quantity: "2", price: "900", market: "TW" });
  await saveDialog(page);
  await page.getByRole("button", { name: "Refresh prices" }).click();

  const box = await totals(page);
  await expect(box).toContainText("2,000");
  await expect(page.getByText(/Taiwan Stock Exchange closing price/)).toBeVisible();

  await page.getByRole("button", { name: "Set price for 2330" }).click();
  await page.getByLabel(/^Price/).fill("1200");
  await saveDialog(page);
  await expect(box).toContainText("2,400");
  await expect(page.getByText("Price set by hand")).toBeVisible();

  await page.getByRole("button", { name: "Set price for 2330" }).click();
  await page.getByRole("button", { name: "Use fetched price" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(box).toContainText("2,000");
});

test("a first trade in a new stock fetches its price by itself", async ({ page }) => {
  await page.goto("/finance/portfolio");
  await expect(page.getByText("1 USD = 32 TWD")).toBeVisible();
  await addTrade(page, { symbol: "2330", quantity: "1", price: "900", market: "TW" });
  await saveDialog(page);
  await expect(page.getByText(/Taiwan Stock Exchange closing price/)).toBeVisible();
  await expect(await totals(page)).toContainText("1,000");
});

test("a dividend is income linked to its holding", async ({ page }) => {
  await page.goto("/finance/portfolio");
  await addTrade(page, { symbol: "2330", quantity: "1", price: "900", market: "TW" });
  await saveDialog(page);

  await page.getByRole("button", { name: "Record dividend for 2330" }).click();
  await page.getByLabel("Amount in TWD").fill("50");
  await saveDialog(page);
  await expect(await totals(page)).toContainText("50");

  await page.goto("/finance");
  await expect(await totals(page)).toContainText("50");
  await expect(page.getByText(/2330/)).toBeVisible();
});

test("an exchange rate can be set by hand", async ({ page }) => {
  await page.goto("/finance/portfolio");
  await expect(page.getByText("1 USD = 32 TWD")).toBeVisible();
  await page.getByRole("button", { name: "Set USD rate" }).click();
  await page.getByLabel("1 USD in TWD").fill("31.5");
  await saveDialog(page);
  await expect(page.getByText("1 USD = 31.5 TWD")).toBeVisible();
  await expect(page.getByText(/Set by hand/)).toBeVisible();
});

test("Home shows the spending and portfolio widgets instead of sealed ones", async ({ page }) => {
  await page.goto("/finance");
  await quickAdd(page, "300", "Food");

  await page.goto("/");
  await page.getByRole("button", { name: /Spending this month/ }).click();
  await expect(page.getByRole("link", { name: "Open the Treasury" })).toBeVisible();
  await page.getByRole("button", { name: /Portfolio/ }).click();
  await expect(page.getByRole("link", { name: "Open the portfolio" })).toBeVisible();
  await expect(page.getByText("Sealed until Phase 5.")).toHaveCount(0);
});

test("the Home widget's Add opens quick add straight away", async ({ page }) => {
  await page.goto("/finance?add=1");
  await expect(page.getByRole("dialog")).toBeVisible();
  await pressPad(page, "45");
  await page.getByRole("button", { name: "Save to Food" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("More opens the Treasury", async ({ page }) => {
  await page.goto("/more");
  await page.getByRole("link", { name: "The Treasury" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "The Treasury" })).toBeVisible();
});

test("the page fits the screen, with no sideways scrolling", async ({ page }) => {
  await page.goto("/finance");
  await quickAdd(page, "123456", "Utilities & Phone");
  for (const path of ["/finance", "/finance/portfolio", "/finance/budgets", "/finance/recurring", "/finance/categories"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: "The Treasury" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
