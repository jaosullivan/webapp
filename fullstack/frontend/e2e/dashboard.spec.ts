import { test, expect } from "@playwright/test";

// Re-usable login helper
async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill("#email", "admin@example.com");
  await page.fill("#password", "admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("shows Overview heading with today's date", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    await expect(page.getByText(today)).toBeVisible();
  });

  test("renders all four stat cards", async ({ page }) => {
    await expect(page.getByText("Users")).toBeVisible();
    await expect(page.getByText("Orders")).toBeVisible();
    await expect(page.getByText("Payments")).toBeVisible();
    await expect(page.getByText("Revenue")).toBeVisible();
  });

  test("stat cards show numeric values after data loads", async ({ page }) => {
    // Skeletons replace the values while loading; wait for them to resolve
    await expect(page.locator(".font-mono").first()).toBeVisible({ timeout: 8000 });
    const cardValues = page.locator(".font-mono");
    const count = await cardValues.count();
    expect(count).toBe(4);
    for (let i = 0; i < count; i++) {
      const text = await cardValues.nth(i).innerText();
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  test("sidebar navigation links are visible", async ({ page }) => {
    await expect(page.getByRole("link", { name: /overview/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /users/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /orders/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /payments/i })).toBeVisible();
  });
});
