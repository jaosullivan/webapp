import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test.beforeEach(async ({ page }) => {
    // Clear any stored token
    await page.goto("/login");
    await page.evaluate(() => localStorage.clear());
  });

  test("shows login form with Nexus branding", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Nexus" })).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", "wrong@example.com");
    await page.fill("#password", "badpassword");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid email or password")).toBeVisible({ timeout: 5000 });
  });

  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("successful login redirects to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", "admin@example.com");
    await page.fill("#password", "admin123");
    await page.getByRole("button", { name: "Sign in" }).click();
    // After successful login we land on the dashboard (Overview heading)
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible({ timeout: 8000 });
  });
});
