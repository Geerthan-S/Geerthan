import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/habits");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("sets a habit reminder time and shows it in the list", async ({ page }) => {
  await page.getByRole("tab", { name: "Manage" }).click();
  await page.getByRole("button", { name: "Edit Workout" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Reminder/).fill("06:30");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/reminder 06:30/)).toBeVisible();

  await page.getByRole("button", { name: "Edit Workout" }).click();
  await page
    .getByRole("dialog")
    .getByLabel(/Reminder/)
    .fill("");
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/reminder 06:30/)).toHaveCount(0);
});

test("shows the weekly review with a suggestion and lets you go back a week", async ({ page }) => {
  await page.goto("/review");
  await expect(page.getByRole("heading", { name: /Your week so far|How your week went/ })).toBeVisible();
  await expect(page.getByText("One thing to change", { exact: true })).toBeVisible();
  await expect(page.getByText("Habits completed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next week" })).toBeDisabled();
  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(page.getByRole("heading", { name: "How your week went" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
