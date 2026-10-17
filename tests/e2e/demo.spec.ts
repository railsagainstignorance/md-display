import { expect, test } from "@playwright/test";

test("opens on the demo document", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#mdd-content h1").first()).toHaveText("md-display");
  await expect(page).toHaveTitle("Feature demo · md-display");
});
