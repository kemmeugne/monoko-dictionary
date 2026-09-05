import { test, expect } from "@playwright/test";

// A recovery link carries a real session, so the app signs the visitor in the
// moment it loads. That made it indistinguishable from any other auth callback:
// the learner was carried into the app and never asked for the password they
// clicked the link to change.
//
// These tests drive the real path — supabase-js consuming the fragment itself.
// An earlier version seeded a session into localStorage instead, which makes
// supabase-js restore it and never look at the URL. Those tests passed against
// the broken build, which is worse than having none.

const FRAGMENT = "#access_token=fake&expires_in=3600&refresh_token=fake&token_type=bearer&type=recovery";

const user = {
  id: "00000000-0000-0000-0000-000000000001", aud: "authenticated",
  role: "authenticated", email: "learner@example.com",
  user_metadata: { display_name: "Test" }, app_metadata: {},
};

test.beforeEach(async ({ page }) => {
  // GET returns the user for the fragment exchange; PUT is updateUser.
  await page.route("**/auth/v1/user*", route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(user),
  }));
  await page.route("**/auth/v1/logout*", route => route.fulfill({ status: 204, body: "" }));
  // Playwright matches routes in REVERSE registration order, so the catch-all
  // goes first and the specific ones override it. Registered the other way round
  // this returns [] for languages, the profile resume finds nothing to resume
  // into and returns early — and the navigation these tests exist to survive is
  // never armed. They pass, having tested nothing.
  await page.route("**/rest/v1/**", route => route.fulfill({
    status: 200, contentType: "application/json",
    headers: { "content-range": "0-0/2337" }, body: "[]",
  }));
  await page.route("**/rest/v1/languages*", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify([
      { id: 1, name: "Lingala", code: "lin", status: "active" },
      { id: 2, name: "Yoruba", code: "yor", status: "active" },
    ]),
  }));
  // The profile resume reads this and then calls selectLanguage. Returning a
  // real preferred language is what arms the navigation these tests survive.
  await page.route("**/rest/v1/profiles*", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ user_id: user.id, preferred_language_id: 1 }),
  }));
});

const rememberLanguage = page => page.addInitScript(() => {
  try {
    localStorage.setItem("monoko_last_language",
      JSON.stringify({ id: 1, name: "Lingala", wordCount: 2337 }));
  } catch (error) { /* storage blocked — the assertion will say so */ }
});

// A remembered language arms two more navigations: the boot hint makes the
// initial view "home", and the profile resume fires about a second in. Both
// states are covered because the second is the one that actually broke.
for (const remembered of [false, true]) {
  test(`a recovery link asks for a password and keeps asking (remembered=${remembered})`, async ({ page }) => {
    if (remembered) await rememberLanguage(page);
    await page.goto("/" + FRAGMENT);

    await expect(page.getByRole("heading", { name: "Choisissez un nouveau mot de passe" })).toBeVisible();
    await expect(page.locator(".m-home")).toHaveCount(0);

    // No e-mail field — the session already identifies them — and two password
    // fields, so a typo cannot lock them out of the account being recovered.
    await expect(page.locator(".m-auth-form .m-field span"))
      .toHaveText(["Nouveau mot de passe", "Confirmer le mot de passe"]);

    // A recovery token in the address bar is worth as much as the password it sets.
    expect(await page.evaluate(() => window.location.hash)).toBe("");

    // It has to STILL be here. The form used to render and then get redirected
    // over about a second later: long enough to read, not long enough to use.
    await page.waitForTimeout(4000);
    await expect(page.getByRole("heading", { name: "Choisissez un nouveau mot de passe" })).toBeVisible();
    await expect(page.locator(".m-home")).toHaveCount(0);
  });
}

test("setting the password signs you out and asks you to log in with it", async ({ page }) => {
  await rememberLanguage(page);
  await page.goto("/" + FRAGMENT);
  await expect(page.getByRole("heading", { name: "Choisissez un nouveau mot de passe" })).toBeVisible();

  const inputs = page.locator(".m-auth-form input[type=password]");
  await inputs.nth(0).fill("brandnew123");
  await inputs.nth(1).fill("brandnew123");
  await page.locator(".m-auth-submit").click();

  // Confirmed, not silently carried into the app: the session came from a link
  // in an inbox, and the new password should earn the first sign-in.
  await expect(page.locator(".m-auth-message.ok")).toContainText("Mot de passe mis à jour");
  await expect(page.locator(".m-home")).toHaveCount(0);
  await expect(page.locator(".m-auth-submit")).toHaveText(/Se connecter/);
  // The address is carried over so only the password has to be typed.
  await expect(page.locator('.m-auth-form input[type=email]')).toHaveValue(user.email);

  // And it must not bounce back to the reset form now that a session exists again.
  await page.waitForTimeout(2500);
  await expect(page.getByRole("heading", { name: "Choisissez un nouveau mot de passe" })).toHaveCount(0);
});

test("a mismatched confirmation is refused before any call is made", async ({ page }) => {
  await page.goto("/" + FRAGMENT);
  await expect(page.locator(".m-auth")).toBeVisible();

  const inputs = page.locator(".m-auth-form input[type=password]");
  await inputs.nth(0).fill("brandnew123");
  await inputs.nth(1).fill("brandnew124");
  await page.locator(".m-auth-submit").click();

  await expect(page.locator(".m-auth-message")).toContainText("ne correspondent pas");
  await expect(page.getByRole("heading", { name: "Choisissez un nouveau mot de passe" })).toBeVisible();
});

test("a link with no valid session does not drop the visitor into the app", async ({ page }) => {
  // Second click on an already-used link, or one that expired: the fragment
  // exchange fails, so no session is created.
  await page.unroute("**/auth/v1/user*");
  await page.route("**/auth/v1/user*", route => route.fulfill({
    status: 401, contentType: "application/json", body: JSON.stringify({ message: "invalid token" }),
  }));
  await page.goto("/" + FRAGMENT);
  await page.waitForTimeout(3000);
  await expect(page.locator(".m-home")).toHaveCount(0);
});
