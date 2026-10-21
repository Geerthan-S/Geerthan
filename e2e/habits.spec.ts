import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/habits");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Daily habits" })).toBeVisible();
});

test("creates a habit and ticks a past day on the month grid", async ({ page }) => {
  await page.getByRole("button", { name: "New habit" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Cold shower");
  await dialog.getByRole("button", { name: "Create habit" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("tab", { name: "Month" }).click();
  const row = page.getByRole("row", { name: /Cold shower/ });
  await expect(row).toBeVisible();

  const today = new Date();
  const cells = row.getByRole("button");
  const todayCell = cells.nth(today.getDate() - 1);
  await expect(todayCell).toHaveAttribute("aria-pressed", "false");
  await todayCell.click();
  await expect(todayCell).toHaveAttribute("aria-pressed", "true");

  // Days after today cannot be ticked.
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  if (today.getDate() < daysInMonth) await expect(cells.nth(today.getDate())).toBeDisabled();

  // The tick survives a reload (preview mode persists to localStorage).
  await page.reload();
  await page.getByRole("tab", { name: "Month" }).click();
  await expect(
    page
      .getByRole("row", { name: /Cold shower/ })
      .getByRole("button")
      .nth(today.getDate() - 1),
  ).toHaveAttribute("aria-pressed", "true");
});

test("edits, reorders and archives habits", async ({ page }) => {
  await page.getByRole("tab", { name: "Manage" }).click();
  await page.getByRole("button", { name: "Edit Water" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Hydration");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Hydration", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Move Hydration up" }).click();
  const names = page.locator(".habit-manage-list").first().locator("strong");
  await expect(names.nth(1)).toHaveText("Hydration");

  await page.getByRole("button", { name: "Archive Hydration" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByRole("button", { name: "Edit Hydration" })).toBeVisible();
});

test("keeps the month grid inside the page on small screens", async ({ page }) => {
  await page.getByRole("tab", { name: "Month" }).click();
  await expect(page.locator(".habit-month-table")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
