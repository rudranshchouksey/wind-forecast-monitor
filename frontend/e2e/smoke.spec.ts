import { expect, test, type Page } from "@playwright/test";

const CHART_TITLES = [
  "Actual vs forecast",
  "Error by forecast lead time",
  "Error distribution",
  "Error by hour of day",
  "Bias by delivery day",
];

async function openDashboard(page: Page, path = "/") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(path);
  await expect(page.getByText(/plan on [\d,]+ MW less wind/)).toBeVisible();
  return errors;
}

const metricsRequest = (page: Page, match: (url: URL) => boolean) =>
  page.waitForRequest((r) => {
    const u = new URL(r.url());
    return u.pathname.endsWith("/api/v1/metrics") && match(u);
  });

test("loads the dashboard with the hero, KPIs and every chart", async ({ page }) => {
  const errors = await openDashboard(page);
  await expect(page.getByRole("heading", { name: "GB Wind Forecast Monitor" })).toBeVisible();
  await expect(page.getByText("Day-ahead wind haircut")).toBeVisible();
  for (const title of CHART_TITLES) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  // The lazy chart chunks rendered real plots.
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  await expect(page.getByRole("img", { name: /^Daily P90 shortfall/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("changing the cutoff refetches and is written to the URL", async ({ page }) => {
  await openDashboard(page);
  const req = metricsRequest(page, (u) => u.searchParams.get("cutoff_time") === "09:50");
  await page.getByLabel(/Decision cutoff/).selectOption("09:50");
  await req;
  await expect(page).toHaveURL(/[?&]cutoff=09%3A50/);
  await expect(page.getByText(/plan on [\d,]+ MW less wind/)).toBeVisible();
});

test("toggling the buffer basis switches to random-only error", async ({ page }) => {
  await openDashboard(page);
  const req = metricsRequest(page, (u) => u.searchParams.get("buffer_basis") === "random");
  await page.getByText("Random error only", { exact: true }).first().click();
  await req;
  await expect(page).toHaveURL(/[?&]basis=random/);
  await expect(page.getByText(/^Random error only · \d+% of hours vs FUELHH$/)).toBeVisible();
});

test("URL state round-trips: open, reload, change, Back", async ({ page }) => {
  await openDashboard(page, "/?cutoff=09:50&p=95&basis=random");
  const cutoff = page.getByLabel(/Decision cutoff/);
  await expect(cutoff).toHaveValue("09:50");
  await expect(page.getByLabel("Buffer covers")).toHaveValue("95");
  await expect(page.getByRole("radio", { name: "Random error only" })).toBeChecked();
  await expect(page.getByText(/^Suggested buffer \(P95\)/).first()).toBeVisible();

  await page.reload();
  await expect(cutoff).toHaveValue("09:50");

  await page.getByText("At fixed lead time", { exact: true }).first().click();
  await expect(page).toHaveURL(/[?&]mode=horizon/);
  await page.goBack();
  await expect(page).not.toHaveURL(/mode=horizon/);
  await expect(page.getByRole("radio", { name: "At decision cutoff" })).toBeChecked();
  await expect(cutoff).toHaveValue("09:50");
});

test("keyboard shortcuts and the help overlay", async ({ page }) => {
  await openDashboard(page);
  await page.keyboard.press("m");
  await expect(page).toHaveURL(/[?&]mode=horizon/);
  await page.keyboard.press("Shift+Slash");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.keyboard.press("r");
  await expect(page).not.toHaveURL(/\?/);
});

test("phone layout: summary chip opens the settings drawer @mobile", async ({ page }) => {
  await openDashboard(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  await page.getByRole("button", { name: /Analysis settings:/ }).click();
  const drawer = page.getByRole("dialog", { name: "Analysis settings" });
  await expect(drawer).toBeVisible();
  await drawer.getByLabel("Buffer covers").selectOption("95");
  await expect(page).toHaveURL(/[?&]p=95/);
  await drawer.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: /^Analysis settings: .*P95/ })).toBeVisible();
});
