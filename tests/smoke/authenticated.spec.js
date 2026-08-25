import { test, expect } from "@playwright/test";

const credentialsPresent = Boolean(
  process.env.TEST_SUPABASE_URL && process.env.TEST_SUPABASE_ANON_KEY &&
  process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD
);

async function resetDeveloperBoundary(page) {
  const rewardLater = page.locator(".m-trail-reward-modal button", { hasText: "Plus tard" });
  if (await rewardLater.isVisible()) await rewardLater.click();
  await page.locator(".m-developer-more").click();
  page.once("dialog", dialog => dialog.accept());
  await page.locator(".m-developer-menu button", { hasText: "Niveau 2 ouvert" }).click();
  await expect(page.locator(".m-path-node.current")).toBeVisible();
  try {
    await rewardLater.waitFor({ state: "visible", timeout: 1_000 });
    await rewardLater.click();
  } catch {
    // The session may already have acknowledged this boundary ceremony.
  }
}

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
    await resetDeveloperBoundary(page);
    const lesson = page.locator(".m-path-node.current").first();
    await lesson.click();
    await expect(page.locator(".m-lesson-preview")).toBeVisible();
    await expect(page.locator(".m-lesson-preview")).toContainText("80 % pour avancer");
    await expect(page.locator(".m-developer-complete")).toContainText("Simuler la leçon réussie");
  });

  // The landing page is a pitch. A learner who is already signed in must never
  // see it flash on the way to their own home — which is what happened while the
  // session, the language list and the stored preference resolved.
  test("a returning learner reloads straight into the app, never the landing", async ({ page }) => {
    await page.addInitScript(() => {
      // Observe `document`, never `document.documentElement`: an init script runs
      // before the DOM exists, so documentElement is null there and observe()
      // throws — which silently turns this whole assertion into a no-op.
      window.__sawLanding = false;
      new MutationObserver(() => {
        if (document.querySelector(".m-landing")) window.__sawLanding = true;
      }).observe(document, { childList: true, subtree: true });
    });

    await page.goto("/");
    await page.locator(".m-language-entry", { hasText: "Lingala" }).click();
    await page.locator('input[type="email"]').fill(process.env.TEST_USER_EMAIL);
    await page.locator('input[type="password"]').fill(process.env.TEST_USER_PASSWORD);
    await page.locator(".m-auth-submit").click();
    await expect(page.locator(".m-home")).toBeVisible({ timeout: 20_000 });

    // Twice: the first reload has only the session hint to go on, the second
    // also has the remembered language and should never leave the app shell.
    for (const attempt of [1, 2]) {
      await page.reload();
      await expect(page.locator(".m-home")).toBeVisible({ timeout: 20_000 });
      expect(await page.evaluate(() => window.__sawLanding), `landing flashed on reload ${attempt}`).toBe(false);
    }
  });

  test("developer can simulate the next lesson and replay the milestone", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "One shared test account mutates progression only once");

    await page.goto("/");
    await page.locator(".m-language-entry", { hasText: "Lingala" }).click();
    await page.locator('input[type="email"]').fill(process.env.TEST_USER_EMAIL);
    await page.locator('input[type="password"]').fill(process.env.TEST_USER_PASSWORD);
    await page.locator(".m-auth-submit").click();
    await expect(page.locator(".m-home")).toBeVisible({ timeout: 20_000 });
    await page.locator(".m-rail nav button", { hasText: "Apprendre" }).click();
    await expect(page.locator(".m-path-trail")).toBeVisible({ timeout: 20_000 });

    await resetDeveloperBoundary(page);

    try {
      const currentItem = page.locator("[data-trail-lesson-id]", { has: page.locator(".m-path-node.current") }).first();
      const lessonId = await currentItem.getAttribute("data-trail-lesson-id");
      const completedItem = page.locator(`[data-trail-lesson-id="${lessonId}"]`);
      await currentItem.locator(".m-path-node").click();
      await page.locator(".m-developer-complete").click();

      await expect(page.locator(".m-developer-notice")).toContainText("progression mise à jour");
      await expect(completedItem).toHaveClass(/just-completed/);
      await expect(completedItem.locator(".m-path-node")).toHaveClass(/completed/);
      await expect(page.locator(".m-trail-reward-modal")).toContainText("Niveau 2 terminé");
    } finally {
      await resetDeveloperBoundary(page);
    }
  });
});
