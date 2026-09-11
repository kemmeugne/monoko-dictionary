import { test, expect } from "@playwright/test";

const languages = [
  { id: 1, name: "Lingala", code: "lin", status: "active" },
  { id: 2, name: "Yoruba", code: "yor", status: "active" },
];

test.beforeEach(async ({ page }) => {
  await page.route("**/rest/v1/languages?*", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(languages),
  }));
  await page.route("**/rest/v1/words?*", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "content-range": "0-0/2337" },
    body: "[]",
  }));
});

test("public landing remains visible and contained", async ({ page }, testInfo) => {
  await page.goto("/");
  const landing = page.locator(".m-landing");
  await expect(landing).toBeVisible();
  await expect(page.getByRole("heading", { name: "Monɔkɔ", level: 1 })).toBeVisible();
  await expect(page.locator(".m-landing-header").getByRole("button", { name: /Commencer|Mon espace/ })).toBeVisible();
  await expect(page.locator(".m-language-map.immersive")).toBeVisible();
  await expect(page.locator(".m-landing-language-explorer")).toBeVisible();
  await expect.poll(() => page.locator(".m-map-marker").count()).toBeGreaterThan(1);
  await expect.poll(async () => {
    const tiles = page.locator(".m-language-map.immersive .leaflet-tile");
    const count = await tiles.count();
    if (!count) return false;
    return tiles.evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0));
  }, { timeout: 15_000 }).toBe(true);
  const overviewZoom = testInfo.project.name === "desktop" ? "4" : "3";
  const immersiveMap = page.locator(".m-language-map.immersive");
  await expect(immersiveMap).toHaveAttribute("data-map-zoom", overviewZoom);
  if (testInfo.project.name === "desktop") {
    await expect(immersiveMap).toHaveAttribute("data-map-interactive", "true");
    await page.getByRole("button", { name: "Zoomer sur la carte", exact:true }).click();
    await expect(immersiveMap).toHaveAttribute("data-map-zoom", String(Number(overviewZoom) + 1));
    await page.getByRole("button", { name: "Recentrer la carte sur l'Afrique" }).click();
    await expect(immersiveMap).toHaveAttribute("data-map-zoom", overviewZoom);
  } else {
    await expect(immersiveMap).toHaveAttribute("data-map-interactive", "false");
    await page.getByRole("button", { name: "Explorer la carte" }).click();
    await expect(page.locator(".m-landing-hero")).toHaveClass(/map-exploring/);
    await expect(immersiveMap).toHaveAttribute("data-map-interactive", "true");
    await page.getByRole("button", { name: "Zoomer sur la carte", exact:true }).click();
    await expect(immersiveMap).toHaveAttribute("data-map-zoom", String(Number(overviewZoom) + 1));
    await page.getByRole("button", { name: "Recentrer la carte sur l'Afrique" }).click();
    await expect(immersiveMap).toHaveAttribute("data-map-zoom", overviewZoom);
    await page.locator(".m-map-explore-toggle").click();
    await expect(immersiveMap).toHaveAttribute("data-map-interactive", "false");
  }

  // The "Un point de départ" directory used to be asserted here. It listed the
  // same languages the map already offers and was removed; the caption under the
  // tabs is what now names the selection, so that is what the landing must show.
  await expect(page.locator(".m-landing-map-caption")).toBeVisible();
  await expect(page.locator(".m-landing-map-caption strong")).toHaveText(/Lingala|Yoruba/);
  await expect(page.locator(".m-landing-proof dl")).toContainText("6niveaux à parcourir50+leçons progressives1 000+exercices ludiques2 500+phrases d'exemple avec audio");

  await expect(page.locator("#landing-mission")).toContainText("Nos langues portent notre histoire");
  await expect(page.locator("#landing-method")).toContainText("Des leçons qui donnent envie de revenir");
  await expect(page.locator(".m-landing-product")).toContainText("Votre chemin en lingala");
  await expect(page.locator(".m-landing-skills")).toContainText("Lire, écrire, écouter et parler");
  await expect(page.locator(".m-landing-skills-grid article")).toHaveCount(4);
  await expect(page.locator(".m-exercise-showcase")).toBeVisible();
  await expect(page.locator(".m-exercise-track > article")).toHaveCount(4);
  await page.getByRole("button", { name: "Mettre les aperçus en pause" }).click();
  await page.locator(".m-exercise-dots").getByRole("button", { name: "Associer les mots" }).click();
  await expect(page.locator(".m-exercise-showcase > header h3")).toHaveText("Associer les mots");
  await page.getByRole("button", { name: "Exercice suivant" }).click();
  await expect(page.locator(".m-exercise-showcase > header h3")).toHaveText("Reconnaître à l'oreille");
  await page.getByRole("button", { name: "Exercice précédent" }).click();
  await expect(page.locator(".m-landing-method-proof")).toContainText("Une pédagogie appuyée par la recherche");
  await expect(page.locator(".m-landing-quality")).toHaveCount(0);
  const aiShowcase = page.locator(".m-landing-ai");
  await expect(aiShowcase).toContainText("Traduisez en direct. Pratiquez avec Monɔkɔ.");
  // The corpus promise is stated in the section lede.
  await expect(page.locator(".m-landing-ai-heading")).toContainText("corpus vérifié par des linguistes et des locuteurs natifs");
  // The two tools now share a sliding window; live translation opens it.
  await expect(aiShowcase).toHaveAttribute("data-carousel-index", "0");
  await expect(page.locator(".m-landing-ai-slide")).toHaveCount(2);
  await expect(page.locator(".m-landing-ai-slide").first()).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator(".m-landing-ai-feature")).toHaveCount(2);
  await expect(page.locator(".m-landing-ai-feature.live")).toContainText("Chacun parle dans sa langue");
  await expect(page.locator(".m-landing-ai-feature.chat")).toContainText("corpus validé par des linguistes experts");
  await expect(page.locator(".m-landing-ai-feature.chat")).toContainText("explication grammaticale");
  await expect(page.locator(".m-landing-ai-feature-title")).toHaveCount(2);
  await expect(page.locator(".m-landing-ai-tabs")).toHaveCount(0);
  await expect(page.locator(".m-landing-ai-cta")).toHaveCount(2);
  // The second slide must translate INTO the frame, not past it: a track wider
  // than one viewport once left this section blank on slide 2.
  await page.locator(".m-landing-ai-dots button").nth(1).click();
  await expect(aiShowcase).toHaveAttribute("data-carousel-index", "1");
  await page.waitForTimeout(1_200);
  const frame = await page.locator(".m-landing-ai-viewport").boundingBox();
  const chatCard = await page.locator(".m-landing-ai-feature.chat").boundingBox();
  expect(chatCard.x).toBeGreaterThanOrEqual(frame.x - 2);
  expect(chatCard.x + chatCard.width).toBeLessThanOrEqual(frame.x + frame.width + 2);
  await page.locator(".m-landing-ai-dots button").nth(0).click();
  await page.waitForTimeout(1_200);
  // The live preview shows the mic flanked by waveforms.
  await expect(page.locator(".m-landing-ai-feature.live .m-ai-wave")).toHaveCount(2);
  // The trust note stays its own band ABOVE the dark section, not inside it.
  await expect(page.locator(".m-landing-ai-bridge .m-landing-ai-trust")).toContainText("Une technologie guidée par l'expertise humaine");
  await expect(page.locator(".m-landing-ai .m-landing-ai-trust")).toHaveCount(0);
  await page.waitForTimeout(600);
  await page.locator(".m-landing-ai").screenshot({ path: testInfo.outputPath("landing-ai.png") });
  await expect(page.locator(".m-landing-mission-visual img")).toHaveJSProperty("complete", true);
  expect(await page.locator(".m-landing-mission-visual img").evaluate(image => image.naturalWidth)).toBeGreaterThan(0);

  // The dictionary is a permanent section, not something a visitor summons. It
  // used to mount only on click, which hid the one screen usable without an
  // account — assert it is present with nothing clicked, or that can regress
  // silently back to click-to-mount.
  await expect(page.locator("#landing-dictionary")).toBeVisible();
  const landingFooter = page.locator(".m-landing-foot");
  await expect(page.locator(".m-landing-final h2")).toHaveText("Apprenez la langue de vos ancêtres.");
  await expect(landingFooter).toContainText("Les langues africaines, transmises par celles et ceux qui les parlent.");
  await expect(landingFooter).toContainText("Le dictionnaire reste libre d'accès");

  const report = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const selectors = [
      ".m-landing-header",
      ".m-landing-header button:visible",
      ".m-landing-copy",
      ".m-landing-copy h1",
      ".m-landing-copy p",
      ".m-landing-map-tabs",
      ".m-landing-map-caption",
      ".m-landing-map-caption > button",
      ".m-landing-proof-inner",
      ".m-landing-mission-grid",
      ".m-landing-method-grid",
      ".m-landing-product",
      ".m-landing-skills-heading",
      ".m-landing-skills-grid",
      ".m-exercise-showcase",
      ".m-exercise-viewport",
      ".m-landing-ai",
      ".m-landing-ai-viewport",
      ".m-landing-ai-slide[aria-hidden='false'] .m-landing-ai-feature",
      ".m-landing-ai-slide[aria-hidden='false'] .m-ai-demo",
      ".m-landing-dictionary",
      ".m-landing-final .m-landing-section-inner",
      ".m-landing-foot",
    ];
    const failures = [];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector.replace(":visible", ""))) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const rect = node.getBoundingClientRect();
        if (rect.left < -1 || rect.right > viewport + 1) {
          failures.push({ selector, text: node.textContent?.trim().slice(0, 60), left: rect.left, right: rect.right, viewport });
        }
      }
    }
    return {
      pageOverflow: document.documentElement.scrollWidth - viewport,
      nextSectionTop: document.querySelector(".m-landing-language-explorer")?.getBoundingClientRect().top,
      viewportHeight: window.innerHeight,
      visibleLanguages: (() => {
        const map = document.querySelector(".m-language-map.immersive")?.getBoundingClientRect();
        if (!map) return [];
        const names = new Set();
        for (const marker of document.querySelectorAll(".m-map-marker")) {
          const rect = marker.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          if (x >= map.left && x <= map.right && y >= map.top && y <= map.bottom) names.add(marker.dataset.language);
        }
        return [...names].sort();
      })(),
      failures,
    };
  });
  expect(report.pageOverflow, JSON.stringify(report)).toBeLessThanOrEqual(1);
  expect(report.nextSectionTop, JSON.stringify(report)).toBeLessThan(report.viewportHeight);
  expect(report.visibleLanguages, JSON.stringify(report)).toEqual(["Lingala", "Yoruba"]);
  expect(report.failures, JSON.stringify(report)).toEqual([]);

  await page.screenshot({ path: testInfo.outputPath("landing.png"), fullPage: true });

  // The first frame is the continental overview. Choosing a language restores
  // the original animated map behavior and travels to its regional network.
  await page.locator(".m-landing-map-tabs").getByRole("button", { name: "Yoruba" }).click();
  await expect(page.locator(".m-landing-map-caption strong")).toHaveText("Yoruba");
  await expect(page.locator(".m-language-map.immersive")).toHaveAttribute("data-map-zoom", "5");
  await page.locator(".m-landing-hero").screenshot({ path: testInfo.outputPath("landing-yoruba.png") });
  await page.locator(".m-landing-map-tabs").getByRole("button", { name: "Yoruba" }).click();
  await expect(page.locator(".m-language-map.immersive")).toHaveAttribute("data-map-zoom", overviewZoom);
});

test("exercise previews advance automatically while AI tools remain manual", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Autoplay timing is viewport-independent");
  await page.goto("/");
  const showcase = page.locator(".m-exercise-showcase");
  const aiShowcase = page.locator(".m-landing-ai");
  await expect(showcase).toHaveAttribute("data-carousel-index", "0");
  await expect(aiShowcase).toHaveAttribute("data-carousel-index", "0");
  await expect.poll(() => showcase.getAttribute("data-carousel-index"), { timeout:7_500 }).toBe("1");
  await page.waitForTimeout(2_000);
  await expect(aiShowcase).toHaveAttribute("data-carousel-index", "0");
  await expect(page.locator(".m-landing-ai-pause")).toHaveCount(0);
});

test("AI calls to action preserve their intended destination", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Feature routing is viewport-independent");
  await page.goto("/");
  await page.locator(".m-landing-ai-feature.live").getByRole("button", { name:"Essayer gratuitement" }).click();
  await expect(page.locator(".m-auth-gate")).toContainText("à la traduction en direct");

  await page.getByRole("button", { name:"Découvrir Monɔkɔ" }).click();
  // The chat CTA is on the second slide, so bring it into frame first.
  await page.locator(".m-landing-ai-dots button").nth(1).click();
  await page.waitForTimeout(1_000);
  await page.locator(".m-landing-ai-feature.chat").getByRole("button", { name:"Parler avec Monɔkɔ" }).click();
  await expect(page.locator(".m-auth-gate")).toContainText("aux conversations");
});

test("the landing dictionary plays the example sentence, not just the word", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Audio wiring is viewport-independent");

  const WORD_MP3 = "https://audio.test/Lingala/senses/P/word.mp3";
  const EXAMPLE_MP3 = "https://audio.test/Lingala/examples/P/example.mp3";

  // Record every URL handed to the Audio constructor, so this asserts which clip
  // a button actually plays. A regression that passed the sense's own audio_url
  // to the example button would keep the right label and still be wrong.
  await page.addInitScript(() => {
    window.__played = [];
    const Original = window.Audio;
    window.Audio = function (src) {
      window.__played.push(src);
      const audio = new Original(src);
      audio.play = () => Promise.resolve();
      return audio;
    };
  });

  // Playwright matches routes in REVERSE registration order: the catch-all goes
  // first and the specific ones override it.
  await page.route("**/rest/v1/**", route => route.fulfill({
    status: 200, contentType: "application/json", body: "[]",
  }));
  await page.route("**/rest/v1/languages*", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify([
      { id: 1, name: "Lingala", code: "lin", status: "active" },
      { id: 2, name: "Yoruba", code: "yor", status: "active" },
    ]),
  }));
  await page.route("**/rest/v1/words*", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify([{ id: 501, french_word: "Pipi", senses: [{ dialect_word: "Ko suba" }] }]),
  }));
  // Two senses: one fully recorded, one with no audio at all. The second proves
  // AudioButton still renders nothing rather than a dead control.
  await page.route("**/rest/v1/senses*", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify([
      {
        id: 900, sense_number: 1, dialect_word: "Ko suba", audio_url: WORD_MP3,
        examples: [{ id: 1, sentence_dialect: "Mwana na ngai ya mobali asubi.", sentence_french: "Mon fils a fait pipi", audio_url: EXAMPLE_MP3 }],
      },
      {
        id: 901, sense_number: 2, dialect_word: "Ko sopa", audio_url: null,
        examples: [{ id: 2, sentence_dialect: "Asopi mai.", sentence_french: "Il a renversé de l'eau", audio_url: null }],
      },
    ]),
  }));

  await page.goto("/");
  await expect(page.locator("#landing-dictionary")).toBeVisible();
  await page.locator(".m-landing-dictionary input").fill("pipi");
  await page.locator(".m-landing-dictionary form").evaluate(form => form.requestSubmit());

  const row = page.locator(".m-landing-dict-row").first();
  await expect(row).toBeVisible();
  await row.locator("button").first().click();
  await expect(page.locator(".m-landing-sense")).toHaveCount(2);

  // Recorded audio gets a button on BOTH the word and its example; the silent
  // sense gets neither.
  await expect(page.locator(".m-landing-sense-head button")).toHaveCount(1);
  await expect(page.locator(".m-landing-sense-example button")).toHaveCount(1);

  await page.locator(".m-landing-sense-example button").click();
  await expect.poll(() => page.evaluate(() => window.__played)).toContain(EXAMPLE_MP3);
  expect(await page.evaluate(() => window.__played)).not.toContain(WORD_MP3);

  await page.locator(".m-landing-sense-head button").click();
  await expect.poll(() => page.evaluate(() => window.__played)).toContain(WORD_MP3);
});

test("canonical SEO and crawl assets point only to monoko.africa", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Head metadata and crawl files are viewport-independent");
  await page.goto("/");

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://monoko.africa/");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /lingala/i);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", "https://monoko.africa/");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", "https://monoko.africa/assets/monoko-social-preview.png");
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");

  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  const robotsText = await robots.text();
  expect(robotsText).toContain("Disallow: /api/");
  expect(robotsText).not.toContain("Disallow: /admin.html");
  expect(robotsText).toContain("Sitemap: https://monoko.africa/sitemap.xml");

  const admin = await request.get("/admin.html");
  expect(admin.ok()).toBe(true);
  expect(await admin.text()).toContain('content="noindex, nofollow, noarchive"');

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain("<loc>https://monoko.africa/</loc>");

  const socialImage = await request.get("/assets/monoko-social-preview.png");
  expect(socialImage.ok()).toBe(true);
  expect(socialImage.headers()["content-type"]).toContain("image/png");
});
