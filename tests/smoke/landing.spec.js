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
  // Both tools render at once — no tabs, nothing aria-hidden from crawlers.
  await expect(page.locator(".m-landing-ai-feature")).toHaveCount(2);
  await expect(page.locator(".m-landing-ai-feature.live")).toBeVisible();
  await expect(page.locator(".m-landing-ai-feature.chat")).toBeVisible();
  await expect(page.locator(".m-landing-ai-feature.live")).toContainText("chacun peut parler dans sa langue");
  await expect(page.locator(".m-landing-ai-feature.chat")).toContainText("corpus validé par des linguistes experts");
  await expect(page.locator(".m-landing-ai-feature[aria-hidden]")).toHaveCount(0);
  await expect(page.locator(".m-landing-ai-tabs")).toHaveCount(0);
  await expect(page.locator(".m-landing-ai-cta")).toHaveCount(2);
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
      ".m-landing-ai-grid",
      ".m-landing-ai-feature.live",
      ".m-landing-ai-feature.chat",
      ".m-landing-ai-feature.live .m-ai-demo",
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
  await expect(showcase).toHaveAttribute("data-carousel-index", "0");
  await expect.poll(() => showcase.getAttribute("data-carousel-index"), { timeout:7_500 }).toBe("1");
  // The AI section is no longer a carousel at all, so nothing there can rotate.
  await expect(page.locator(".m-landing-ai")).not.toHaveAttribute("data-carousel-index");
});

test("AI calls to action preserve their intended destination", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Feature routing is viewport-independent");
  await page.goto("/");
  await page.locator(".m-landing-ai-feature.live").getByRole("button", { name:"Essayer gratuitement" }).click();
  await expect(page.locator(".m-auth-gate")).toContainText("à la traduction en direct");

  await page.getByRole("button", { name:"Découvrir Monɔkɔ" }).click();
  await page.locator(".m-landing-ai-feature.chat").getByRole("button", { name:"Parler avec Monɔkɔ" }).click();
  await expect(page.locator(".m-auth-gate")).toContainText("aux conversations");
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
