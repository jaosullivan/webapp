import { test, expect } from "@playwright/test";

async function loginAs(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("heading", { name: "Overview" }).waitFor({ timeout: 8000 });
}

test.describe("Users page — admin access", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "admin@example.com", "admin123");
  });

  test("admin sees Users link in sidebar", async ({ page }) => {
    await expect(page.getByRole("link", { name: /users/i })).toBeVisible();
  });

  test("admin can navigate to /users", async ({ page }) => {
    await page.getByRole("link", { name: /users/i }).click();
    await page.waitForURL("/users");
    await expect(page.getByRole("heading", { name: /users/i })).toBeVisible({ timeout: 6000 });
  });

  test("users table shows email column", async ({ page }) => {
    await page.goto("/users");
    await expect(page.getByRole("columnheader", { name: /email/i })).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("columnheader", { name: /status/i })).toBeVisible();
  });

  test("users table shows at least one row after seeding", async ({ page }) => {
    await page.goto("/users");
    // Wait for skeleton to resolve
    await expect(page.getByRole("row").nth(1)).toBeVisible({ timeout: 8000 });
  });

  test("Deactivate button is present on active user rows", async ({ page }) => {
    await page.goto("/users");
    await expect(page.getByRole("row").nth(1)).toBeVisible({ timeout: 8000 });
    // At least one toggle button should be visible
    const toggleBtn = page.getByRole("button", { name: /deactivate|activate/i }).first();
    await expect(toggleBtn).toBeVisible();
  });
});

test.describe("Users page — non-admin access", () => {
  test.beforeEach(async ({ page }) => {
    // Login as a regular (non-admin) user seeded by seed.py
    await loginAs(page, "alice@example.com", "password123");
  });

  test("non-admin does not see Users link in sidebar", async ({ page }) => {
    // The Users nav item is hidden for non-admin tokens
    const usersLink = page.getByRole("link", { name: /^users$/i });
    await expect(usersLink).not.toBeVisible();
  });

  test("non-admin navigating to /users is redirected to /", async ({ page }) => {
    await page.goto("/users");
    // RequireAdmin guard redirects to /
    await expect(page).toHaveURL("/", { timeout: 5000 });
  });
});
