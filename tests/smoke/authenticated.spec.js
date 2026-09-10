import { test, expect } from "@playwright/test";

const testSupabaseUrl = process.env.TEST_SUPABASE_URL || process.env.SUPABASE_URL;
const testSupabaseAnonKey = process.env.TEST_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const credentialsPresent = Boolean(
  testSupabaseUrl && testSupabaseAnonKey &&
  process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD
);

async function openLingalaCourse(page) {
  await page.locator(".m-landing-actions .primary").click();
}

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
    }, { url: testSupabaseUrl, key: testSupabaseAnonKey });
  });

  test("learner can enter home, trail and a lesson", async ({ page }) => {
    await page.goto("/");
    await openLingalaCourse(page);
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

  test("lesson help pauses and resumes the same exercise", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "The state-preservation assertion only needs one browser");
    await page.goto("/");
    await openLingalaCourse(page);
    await page.locator('input[type="email"]').fill(process.env.TEST_USER_EMAIL);
    await page.locator('input[type="password"]').fill(process.env.TEST_USER_PASSWORD);
    await page.locator(".m-auth-submit").click();
    await expect(page.locator(".m-home")).toBeVisible({ timeout:20_000 });
    await page.locator(".m-rail nav button", { hasText:"Apprendre" }).click();
    await expect(page.locator(".m-path-trail")).toBeVisible({ timeout:20_000 });

    const deferredReward = page.locator(".m-trail-reward-modal button", { hasText:"Plus tard" });
    if (await deferredReward.isVisible()) await deferredReward.click();
    await page.locator("[data-trail-lesson-id]", { has:page.locator(".m-path-node.completed") }).first().locator(".m-path-node").click();
    await page.locator(".m-lesson-primary").click();
    await expect(page.locator(".m-lesson-workspace")).toBeVisible();
    await page.locator(".m-practice-action.primary").click();
    await expect(page.locator(".m-session-shell")).toBeVisible();
    await page.getByRole("button", { name:"Commencer", exact:true }).click();

    const shell = page.locator(".m-session-shell");
    const before = await shell.innerText();
    await page.getByRole("button", { name:/Pourquoi.*Voir la leçon/ }).click();
    await expect(page.locator(".m-session-reference")).toBeVisible();
    await expect(page.locator(".m-session-reference")).toContainText("Leçon complète");
    await expect(page.locator(".m-session-reference")).toContainText("Votre exercice reste en pause");
    await page.getByRole("button", { name:/Reprendre l'exercice/ }).click();
    await expect(page.locator(".m-session-reference")).toBeHidden();
    expect(await shell.innerText()).toBe(before);
  });

  test("live translation offers two speaker turns and a text fallback", async ({ page }) => {
    await page.goto("/");
    await openLingalaCourse(page);
    await page.locator('input[type="email"]').fill(process.env.TEST_USER_EMAIL);
    await page.locator('input[type="password"]').fill(process.env.TEST_USER_PASSWORD);
    await page.locator(".m-auth-submit").click();
    await expect(page.locator(".m-home")).toBeVisible({ timeout:20_000 });

    // Install the Space mocks before opening the view: opening it now starts a
    // preference-aware fixed-phrase warm-up in the background.
    await page.route("**/api/rag-context", route => route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ context:"", result_count:0 }) }));
    await page.route("**/api/lesson-context", route => route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ context:"", result_count:0 }) }));
    await page.route("**/api/live-translation-events", route => route.fulfill({ status:201, contentType:"application/json", body:JSON.stringify({ ok:true }) }));
    let ttsStarts = 0;
    await page.route(/\/gradio_api\/call\/synthesise$/, route => {
      ttsStarts += 1;
      return route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ event_id:`test-event-${ttsStarts}` }) });
    });
    await page.route(/\/gradio_api\/call\/synthesise\/test-event-\d+$/, route => route.fulfill({
      status:200,
      contentType:"text/event-stream",
      body:'event: complete\ndata: [{"url":"data:audio/wav;base64,UklGRg=="}]\n\n',
    }));
    await page.route("**/api/chat", async route => {
      const source = route.request().postDataJSON().messages.at(-1).content;
      const translation = source === "Bonjour à tous" ? "Mbote na bino nyonso" : source === "Bonsoir" ? "Mbote ya mpokwa" : "Mbote";
      await route.fulfill({
        status:200,
        headers:{ "Content-Type":"text/event-stream" },
        body:`data: ${JSON.stringify({ delta:translation })}\n\ndata: [DONE]\n\n`,
      });
    });
    await page.evaluate(() => {
      window.__monokoAudioPlayCount = 0;
      window.Audio = class {
        constructor(src) { this.src = src; this.playbackRate = 1; }
        play() {
          window.__monokoAudioPlayCount += 1;
          setTimeout(() => this.onended?.(), 0);
          return Promise.resolve();
        }
        pause() {}
      };
    });

    const railLink = page.locator(".m-rail nav button", { hasText:"Traduction en direct" });
    if (await railLink.isVisible()) await railLink.click();
    else await page.locator(".m-tool.live").click();

    await expect(page.locator(".m-live")).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator(".m-live-speakers button")).toHaveCount(2);
    await expect(page.locator(".m-live-speakers")).toContainText("Parler en français");
    await expect(page.locator(".m-live-speakers")).toContainText("Parler en Lingala");
    let autoplay = page.getByRole("checkbox", { name:"Lecture automatique" });
    await expect(autoplay).toBeChecked();
    await page.locator(".m-live-text-toggle").click();
    await expect(page.locator(".m-live-composer")).toBeVisible();
    await expect(page.locator("#live-text-input")).toBeVisible();

    await page.locator("#live-text-input").fill("Bonjour");
    await page.locator('.m-live-composer button[type="submit"]').click();
    await expect(page.locator(".m-live-turn.french")).toContainText("Mbote");
    await expect.poll(() => ttsStarts).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__monokoAudioPlayCount)).toBe(1);

    await page.locator(".m-live-back").click();
    await expect(page.locator(".m-home")).toBeVisible();
    if (await railLink.isVisible()) await railLink.click();
    else await page.locator(".m-tool.live").click();
    await page.locator(".m-live-text-toggle").click();
    await page.locator("#live-text-input").fill("Bonjour");
    await page.locator('.m-live-composer button[type="submit"]').click();
    await expect(page.locator(".m-live-turn.french")).toContainText("Mbote");
    await expect.poll(() => page.evaluate(() => window.__monokoAudioPlayCount)).toBe(2);
    expect(ttsStarts).toBe(1);

    autoplay = page.getByRole("checkbox", { name:"Lecture automatique" });
    await page.locator(".m-live-autoplay").click();
    await expect(autoplay).not.toBeChecked();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("monoko_live_autoplay"))).toBe("false");
    await page.locator(".m-live-text-toggle").click();
    await page.locator("#live-text-input").fill("Bonsoir");
    await page.locator('.m-live-composer button[type="submit"]').click();
    await expect(page.locator(".m-live-turn.french", { hasText:"Mbote ya mpokwa" })).toBeVisible();
    await page.waitForTimeout(250);
    expect(ttsStarts).toBe(1);

    await page.locator('.m-live-turn.french button[aria-label="Corriger la transcription"]').first().click();
    await page.locator(".m-live-edit textarea").fill("Bonjour à tous");
    await page.locator('.m-live-edit button[type="submit"]').click();
    await expect(page.locator("article.m-live-turn.french", { hasText:"Mbote na bino nyonso" })).toBeVisible();
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
    await openLingalaCourse(page);
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
    await openLingalaCourse(page);
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
