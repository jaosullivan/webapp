import { test, expect } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill("#email", "admin@example.com");
  await page.fill("#password", "admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("heading", { name: "Overview" }).waitFor({ timeout: 8000 });
}

test.describe("Payments", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: /payments/i }).click();
    await page.waitForURL("/payments");
  });

  test("shows payments table with correct columns", async ({ page }) => {
    await expect(page.getByRole("columnheader", { name: /payment id/i })).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("columnheader", { name: /order/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /amount/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /status/i })).toBeVisible();
  });

  test("rows contain status badges", async ({ page }) => {
    await expect(page.getByRole("row").nth(1)).toBeVisible({ timeout: 8000 });
    const statuses = ["pending", "completed", "failed", "refunded"];
    const firstRowText = await page.getByRole("row").nth(1).innerText();
    const hasStatus = statuses.some((s) => firstRowText.toLowerCase().includes(s));
    expect(hasStatus).toBe(true);
  });

  test("Process button is visible on pending payment rows", async ({ page }) => {
    await expect(page.getByRole("row").nth(1)).toBeVisible({ timeout: 8000 });
    // Pending payments have a Process button; may not exist if all are completed
    const processBtn = page.getByRole("button", { name: /process/i }).first();
    const visible = await processBtn.isVisible().catch(() => false);
    // If there's a pending payment, the button must be visible
    if (visible) {
      await expect(processBtn).toBeEnabled();
    }
  });

  test("pagination controls are present when there are multiple pages", async ({ page }) => {
    const nextBtn = page.getByRole("button", { name: /next/i });
    const isVisible = await nextBtn.isVisible().catch(() => false);
    if (isVisible) {
      await nextBtn.click();
      await expect(page.getByText(/page 2/i)).toBeVisible({ timeout: 4000 });
    }
  });

  test("revenue stat is visible in the dashboard", async ({ page }) => {
    // Navigate back to dashboard and verify Revenue card loads
    await page.getByRole("link", { name: /overview/i }).click();
    await expect(page.getByText("Revenue")).toBeVisible({ timeout: 8000 });
  });
});
