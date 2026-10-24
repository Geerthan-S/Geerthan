import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/tasks");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("creates, edits and deletes a task", async ({ page }) => {
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByPlaceholder("Use a clear action verb…").fill("Write release notes");
  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByRole("heading", { name: "Write release notes" })).toBeVisible();

  await page.getByRole("button", { name: "Edit Write release notes" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Write and publish release notes");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Write and publish release notes" })).toBeVisible();

  await page.getByRole("button", { name: "Edit Write and publish release notes" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete task" }).click();
  await expect(page.getByRole("heading", { name: "Write and publish release notes" })).toHaveCount(0);
});

test("creates and edits a project", async ({ page }) => {
  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Thesis");
  await dialog.getByLabel("Code").fill("ths");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Thesis" })).toBeVisible();

  await page.getByRole("button", { name: "Edit Thesis" }).click();
  await page.getByRole("dialog").getByLabel("Next milestone").fill("Submit outline");
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Submit outline")).toBeVisible();
});

test("closes dialogs with Escape", async ({ page }) => {
  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("shows a friendly 404 page", async ({ page }) => {
  const response = await page.goto("/definitely-not-a-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "That page doesn't exist." })).toBeVisible();
});

test("sends security headers", async ({ request }) => {
  const response = await request.get("/login");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("serves a public privacy policy that describes Google data use", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy policy" })).toBeVisible();
  await expect(page.getByText("calendar.events.readonly")).toBeVisible();
  await expect(page.getByRole("link", { name: "Google API Services User Data Policy" })).toBeVisible();
});
