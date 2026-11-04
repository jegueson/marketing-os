import { test, expect } from "@playwright/test";

test.describe("public shell", () => {
  test.skip(!process.env.E2E_BASE_URL, "Set E2E_BASE_URL to run browser journey");

  test("home and get-started render", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Marketing OS" })).toBeVisible();
    await page.goto("/get-started");
    await expect(page.getByRole("heading", { name: "Get started" })).toBeVisible();
  });
});
