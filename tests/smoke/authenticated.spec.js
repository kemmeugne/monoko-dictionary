import { test, expect } from "@playwright/test";

const credentialsPresent = Boolean(
  process.env.TEST_SUPABASE_URL && process.env.TEST_SUPABASE_ANON_KEY &&
  process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD
);

test.describe("authenticated learner", () => {
  test.skip(!credentialsPresent, "Authenticated smoke credentials are not configured");

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(({ url, key }) => {
      window.__MONOKO_SUPABASE_URL__ = url;
      window.__MONOKO_SUPABASE_KEY__ = key;
    }, { url: process.env.TEST_SUPABASE_URL, key: process.env.TEST_SUPABASE_ANON_KEY });
  });

  test("learner can enter home, trail and a lesson", async ({ page }) => {
    await page.goto("/");
    await page.locator(".m-language-entry", { hasText: "Lingala" }).click();
    await expect(page.locator(".m-auth-card")).toBeVisible();
    await page.locator('input[type="email"]').fill(process.env.TEST_USER_EMAIL);
    await page.locator('input[type="password"]').fill(process.env.TEST_USER_PASSWORD);
    await page.locator(".m-auth-submit").click();

    await expect(page.locator(".m-home")).toBeVisible({ timeout: 20_000 });
    const trailButton = page.locator(".m-bottom-nav button", { hasText: "Parcours" });
    if (await trailButton.isVisible()) await trailButton.click();
    else await page.locator(".m-rail nav button", { hasText: "Apprendre" }).click();

    await expect(page.locator(".m-path-trail")).toBeVisible({ timeout: 20_000 });
    const deferredMedal = page.locator(".m-trail-reward-modal button", { hasText: "Plus tard" });
    try {
      await deferredMedal.waitFor({ state: "visible", timeout: 1500 });
      await deferredMedal.click();
    } catch {
      // No pending milestone ceremony for this seed state.
    }
    const lesson = page.locator(".m-path-node:not(.reward):not(.gate):not(.locked)").first();
    await lesson.click();
    await expect(page.locator(".m-lesson-preview")).toBeVisible();
    await expect(page.locator(".m-lesson-preview")).toContainText("80 % pour avancer");
  });
});
