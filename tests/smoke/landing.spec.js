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
  await expect(page.getByRole("button", { name: /Commencer|Mon espace/ })).toBeVisible();
  await expect(page.locator(".m-language-map.immersive")).toBeVisible();

  // The "Un point de départ" directory used to be asserted here. It listed the
  // same languages the map already offers and was removed; the caption under the
  // tabs is what now names the selection, so that is what the landing must show.
  await expect(page.locator(".m-landing-map-caption")).toBeVisible();
  await expect(page.locator(".m-landing-map-caption strong")).toHaveText(/Lingala|Yoruba/);

  // The dictionary is a permanent section, not something a visitor summons. It
  // used to mount only on click, which hid the one screen usable without an
  // account — assert it is present with nothing clicked, or that can regress
  // silently back to click-to-mount.
  await expect(page.locator("#landing-dictionary")).toBeVisible();

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
      ".m-landing-dictionary",
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
      failures,
    };
  });
  expect(report.pageOverflow, JSON.stringify(report)).toBeLessThanOrEqual(1);
  expect(report.failures, JSON.stringify(report)).toEqual([]);

  await page.screenshot({ path: testInfo.outputPath("landing.png"), fullPage: true });
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
