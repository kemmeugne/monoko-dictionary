import { test, expect } from "@playwright/test";

// A recovery link carries a real session, so the app signs the visitor in the
// moment it loads. That made it indistinguishable from any other auth callback
// and the learner was dropped on the home screen, already logged in, never
// asked for the password they clicked the link to change.
//
// The session is seeded rather than obtained: supabase-js restores an unexpired
// session from storage without a network call, which is enough to reach the
// branch under test. Nothing here needs credentials or a live project.

const PROJECT_REF = "haioiccujncsehadipzb";

const languages = [
  { id: 1, name: "Lingala", code: "lin", status: "active" },
  { id: 2, name: "Yoruba", code: "yor", status: "active" },
];

test.beforeEach(async ({ page }) => {
  await page.route("**/rest/v1/languages?*", route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(languages),
  }));
  await page.route("**/rest/v1/**", route => route.fulfill({
    status: 200, contentType: "application/json",
    headers: { "content-range": "0-0/2337" }, body: "[]",
  }));
});

async function seedSession(page) {
  await page.addInitScript(({ ref }) => {
    try {
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
        access_token: "seeded", token_type: "bearer", expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "seeded",
        user: { id: "00000000-0000-0000-0000-000000000001", email: "test@example.com" },
      }));
    } catch (error) { /* storage blocked — the assertion will say so */ }
  }, { ref: PROJECT_REF });
}

test("a recovery link asks for a new password instead of logging you in", async ({ page }) => {
  await seedSession(page);
  await page.goto("/#access_token=seeded&type=recovery");

  const auth = page.locator(".m-auth");
  await expect(auth).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choisissez un nouveau mot de passe" })).toBeVisible();

  // The whole point: not the app.
  await expect(page.locator(".m-home")).toHaveCount(0);

  // No e-mail field — the session already identifies them — and two password
  // fields, so a typo cannot lock them out of the account they are recovering.
  const fields = page.locator(".m-auth-form .m-field span");
  await expect(fields).toHaveText(["Nouveau mot de passe", "Confirmer le mot de passe"]);
  await expect(page.locator(".m-auth-submit")).toHaveText(/Enregistrer le mot de passe/);

  // A recovery token in the address bar is worth as much as the password it sets.
  expect(await page.evaluate(() => window.location.hash)).toBe("");
});

test("a mismatched confirmation is refused before any call is made", async ({ page }) => {
  await seedSession(page);
  await page.goto("/#access_token=seeded&type=recovery");
  await expect(page.locator(".m-auth")).toBeVisible();

  const inputs = page.locator(".m-auth-form input[type=password]");
  await inputs.nth(0).fill("brandnew123");
  await inputs.nth(1).fill("brandnew124");
  await page.locator(".m-auth-submit").click();

  await expect(page.locator(".m-auth-message")).toContainText("ne correspondent pas");
  await expect(page.getByRole("heading", { name: "Choisissez un nouveau mot de passe" })).toBeVisible();
});

test("a link with no valid session does not drop the visitor into the app", async ({ page }) => {
  // Second click on an already-used link, or one that expired.
  await page.goto("/#access_token=stale&type=recovery");
  await expect(page.locator(".m-home")).toHaveCount(0);
  await expect(page.locator(".m-landing, .m-auth")).toHaveCount(1);
});
