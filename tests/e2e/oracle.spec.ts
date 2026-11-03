import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// The Oracle through the real screens. In preview mode a scripted stand-in plays the model, taking the same steps
// a real model would: reading the schedule, then calling a tool.
test.describe.configure({ mode: "serial" });

async function seed(request: APIRequestContext, query = "") {
  const response = await request.get(`/api/dev/preview-seed${query ? `?${query}` : ""}`);
  expect(response.ok()).toBe(true);
}

async function say(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Your message" }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

test.afterAll(async ({ request }) => {
  await seed(request);
});

test("the Oracle answers, and the conversation is remembered", async ({ page, request }) => {
  await seed(request);
  await page.goto("/oracle");
  await expect(page.getByText("Speak. The Oracle sees")).toBeVisible();

  await say(page, "Are you there?");
  await expect(page.getByText("Are you there?")).toBeVisible();
  await expect(page.getByText("The Oracle hears you.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Are you there?")).toBeVisible();
  await expect(page.getByText("The Oracle hears you.")).toBeVisible();
});

test("a proposal changes nothing until approved, then applies and is logged", async ({ page, request }) => {
  await seed(request, "today=1");
  await page.goto("/oracle");
  await say(page, "Please move my block");

  const card = page.getByRole("article", { name: "A proposal waiting for your decision" });
  await expect(card).toBeVisible();
  await expect(card.getByText("06:00–07:00 Test block")).toBeVisible();
  await expect(card.getByText("20:00–21:00 Test block")).toBeVisible();

  await page.goto("/loop");
  await expect(page.getByText("06:00–07:00", { exact: false }).first()).toBeVisible();

  await page.goto("/oracle");
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(card.getByText("Approved and applied")).toBeVisible();

  await page.goto("/loop");
  await expect(page.getByText("20:00–21:00", { exact: false }).first()).toBeVisible();

  await page.goto("/settings/logs");
  await expect(page.getByText("Proposal approved")).toBeVisible();
  await expect(page.getByText("The Oracle proposed a change")).toBeVisible();
});

test("a proposal can be edited before approving", async ({ page, request }) => {
  await seed(request, "today=1");
  await page.goto("/oracle");
  await say(page, "move it");

  const card = page.getByRole("article", { name: "A proposal waiting for your decision" });
  await card.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Start", { exact: true }).fill("18:00");
  await page.getByLabel("End", { exact: true }).fill("19:00");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Approved and applied")).toBeVisible();

  await page.goto("/loop");
  await expect(page.getByText("18:00–19:00", { exact: false }).first()).toBeVisible();
});

test("a proposal can be rejected, leaving the schedule alone", async ({ page, request }) => {
  await seed(request, "today=1");
  await page.goto("/oracle");
  await say(page, "move it");

  const card = page.getByRole("article", { name: "A proposal waiting for your decision" });
  await card.getByRole("button", { name: "Reject" }).click();
  await expect(card.getByText("Rejected", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Approve" })).toHaveCount(0);

  await page.goto("/loop");
  await expect(page.getByText("06:00–07:00", { exact: false }).first()).toBeVisible();
});

test("an automatic action shows a done card, and can be undone", async ({ page, request }) => {
  await seed(request);
  await page.goto("/oracle");
  await say(page, "Make me a goal");

  const card = page.getByRole("article", { name: "Something the Oracle did" });
  await expect(card.getByText("Run a marathon")).toBeVisible();

  await page.goto("/goals");
  await expect(page.getByRole("link", { name: /Run a marathon/ })).toBeVisible();

  await page.goto("/oracle");
  await card.getByRole("button", { name: "Undo" }).click();
  await expect(card.getByText("Undone")).toBeVisible();

  await page.goto("/goals");
  await expect(page.getByRole("link", { name: /Run a marathon/ })).toHaveCount(0);
});

test("the Oracle can't log a block, whatever you ask", async ({ page, request }) => {
  await seed(request, "today=1");
  await page.goto("/oracle");
  await say(page, "Mark my block as done");
  await expect(page.getByText("The Oracle hears you.")).toBeVisible();

  const status = page.getByRole("link", { name: "Close the Oracle" });
  await status.click();
  await expect(page.getByRole("region", { name: "Character status" }).getByRole("progressbar", { name: "XP" })).toHaveAttribute("aria-valuetext", "0");
});

test("the suggestion widget caches its advice, and stops at 3 a day", async ({ page, request }) => {
  await seed(request);
  await page.goto("/");
  await page.getByRole("button", { name: "The Oracle's counsel", exact: true }).click();
  await expect(page.getByText("The Oracle has not spoken today.")).toBeVisible();

  await page.getByRole("button", { name: "Seek counsel" }).click();
  await expect(page.getByText("Begin with what you've been avoiding.")).toBeVisible();
  await expect(page.getByText("2 left today")).toBeVisible();

  for (const left of ["1 left today", "No more today"]) {
    await page.getByRole("button", { name: "Ask again" }).click();
    await expect(page.getByText(left)).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Ask again" })).toBeDisabled();
});

test("the about-me note is saved", async ({ page, request }) => {
  await seed(request);
  await page.goto("/settings");
  await page.getByLabel("About me").fill("A student in Taipei");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").getByText(/Preview mode/)).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("About me")).toHaveValue("A student in Taipei");
});

test("logs show an empty state, and open from Settings", async ({ page, request }) => {
  await seed(request);
  await page.goto("/settings");
  await page.getByRole("link", { name: "Logs" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Logs" })).toBeVisible();
  await expect(page.getByText("Nothing has been written yet.")).toBeVisible();
});

test("these screens have no browser errors or sideways scroll, in either language", async ({ page, request, context, baseURL }) => {
  await seed(request, "today=1");
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/oracle");
  await say(page, "move it");
  await expect(page.getByRole("article", { name: "A proposal waiting for your decision" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await context.addCookies([{ name: "locale", value: "zh-TW", url: baseURL as string }]);
  await page.goto("/oracle");
  await expect(page.getByRole("heading", { level: 1, name: "神諭" })).toBeVisible();
  await expect(page.getByRole("button", { name: "核准" })).toBeVisible();
  expect(errors).toEqual([]);
});
