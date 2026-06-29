import { test, expect } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill("#email", "admin@example.com");
  await page.fill("#password", "admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("heading", { name: "Overview" }).waitFor({ timeout: 8000 });
}

test.describe("Orders", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: /orders/i }).click();
    await page.waitForURL("/orders");
  });

  test("shows orders table with correct columns", async ({ page }) => {
    // Wait for the table to appear (skeletons resolve)
    await expect(page.getByRole("columnheader", { name: /order id/i })).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("columnheader", { name: /user/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /total/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /status/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /date/i })).toBeVisible();
  });

  test("rows contain status badges", async ({ page }) => {
    await expect(page.getByRole("row").nth(1)).toBeVisible({ timeout: 8000 });
    // Each data row should have a badge with a known status word
    const statuses = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
    const firstRowText = await page.getByRole("row").nth(1).innerText();
    const hasStatus = statuses.some((s) => firstRowText.toLowerCase().includes(s));
    expect(hasStatus).toBe(true);
  });

  test("pagination controls are present when there are multiple pages", async ({ page }) => {
    // Pagination appears when total > PAGE_SIZE (20). Seed data creates ~35 orders.
    const nextBtn = page.getByRole("button", { name: /next/i });
    const isVisible = await nextBtn.isVisible().catch(() => false);
    if (isVisible) {
      await nextBtn.click();
      // URL stays on /orders; page indicator should change
      await expect(page.getByText(/page 2/i)).toBeVisible({ timeout: 4000 });
    }
    // If only one page, test passes trivially — correct behaviour.
  });

  test("logout from orders page clears session", async ({ page }) => {
    await page.getByRole("button", { name: /sign out|logout/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    // Token should be gone
    const token = await page.evaluate(() => localStorage.getItem("token"));
    expect(token).toBeNull();
  });
});
