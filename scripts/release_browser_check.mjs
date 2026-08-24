#!/usr/bin/env node

import fs from "node:fs";

const CDP_PORT = process.env.CDP_PORT || "9230";
const APP_URL = process.env.APP_URL || "http://localhost:4176";
const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "TEST_USER_EMAIL", "TEST_USER_PASSWORD"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}

const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then(response => response.json());
const target = targets.find(item => item.type === "page");
if (!target) throw new Error("No Chrome page target found");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 0;
const pending = new Map();
const browserErrors = [];
socket.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result || {});
  }
  if (message.method === "Runtime.exceptionThrown") {
    browserErrors.push(message.params.exceptionDetails?.text || "Uncaught browser exception");
  }
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
    browserErrors.push(message.params.entry.text);
  }
  if (message.method === "Network.responseReceived" && message.params.response.status >= 400) {
    browserErrors.push(`HTTP ${message.params.response.status}: ${message.params.response.url}`);
  }
});

function send(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, {
    resolve,
    reject: error => reject(new Error(`${method}: ${error.message}`)),
  }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
  return result.result?.value;
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitFor(expression, label, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function clickByText(selector, text) {
  const clicked = await evaluate(`(() => {
    const node = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find(item => item.textContent.replace(/\\s+/g, " ").trim().includes(${JSON.stringify(text)}));
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Could not click ${selector} containing ${text}`);
}

async function clickLastByText(selector, text) {
  const clicked = await evaluate(`(() => {
    const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .filter(item => item.textContent.replace(/\\s+/g, " ").trim().includes(${JSON.stringify(text)}));
    const node = nodes.at(-1);
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Could not click final ${selector} containing ${text}`);
}

async function fill(selector, value) {
  const filled = await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  if (!filled) throw new Error(`Could not fill ${selector}`);
}

async function screenshot(name) {
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const file = `/tmp/monoko-release-${name}.png`;
  fs.writeFileSync(file, Buffer.from(result.data, "base64"));
  return file;
}

async function assertPage(label, checks) {
  const report = await evaluate(`(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    title: document.title,
    styles: [...document.styleSheets].map(sheet => sheet.href || "inline"),
    checks: (${checks})()
  }))()`);
  if (report.overflow > 1) throw new Error(`${label} has ${report.overflow}px horizontal overflow`);
  if (!report.styles.some(href => href.includes("monoko-ui.css"))) throw new Error(`${label} did not load monoko-ui.css`);
  for (const [name, passed] of Object.entries(report.checks)) {
    if (!passed) throw new Error(`${label} failed check: ${name}`);
  }
  return report;
}

await Promise.all([send("Page.enable"), send("Runtime.enable"), send("Log.enable"), send("Network.enable")]);
await Promise.all([
  send("Network.clearBrowserCookies"),
  send("Storage.clearDataForOrigin", { origin: new URL(APP_URL).origin, storageTypes: "all" }),
]);
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `window.__MONOKO_SUPABASE_URL__=${JSON.stringify(process.env.SUPABASE_URL)};window.__MONOKO_SUPABASE_KEY__=${JSON.stringify(process.env.SUPABASE_ANON_KEY)};`,
});
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: APP_URL });

await waitFor(`[...document.querySelectorAll("button")].some(button => button.textContent.includes("Français") && button.textContent.includes("Lingala"))`, "Lingala language button");
await clickByText("button", "Français");
// Signed out, a language now opens the login page rather than an empty home:
// home shows a streak, XP and a next lesson, none of which exist without a
// learner. Sign in first, then assert home.
await waitFor(`document.querySelector(".m-auth-card")`, "login page");
await fill('input[type="email"]', process.env.TEST_USER_EMAIL);
await fill('input[type="password"]', process.env.TEST_USER_PASSWORD);
await sleep(100);
await evaluate(`document.querySelector(".m-auth-submit").click()`);
await waitFor(`document.querySelector(".m-home")`, "redesigned home", 25000);
await assertPage("desktop home", `() => ({
  home: !!document.querySelector(".m-home"),
  dictionary: document.body.textContent.includes("Dictionnaire"),
  practice: document.body.textContent.includes("Pratiquer autrement"),
  oneStatGroup: document.querySelectorAll(".m-progress-chips").length === 1 && !document.querySelector(".m-home-stats"),
  largeChips: parseFloat(getComputedStyle(document.querySelector(".m-chip")).minHeight) >= 40
})`);
const homeShot = await screenshot("home-desktop");

await evaluate(`document.querySelector(".m-rail-profile").click()`);
await waitFor(`document.querySelector(".m-profile")`, "authenticated profile", 20000);
await waitFor(`document.body.textContent.includes("MonokoTest") && document.body.textContent.includes("650 XP")`, "profile data before reward claims", 20000);
await waitFor(`document.querySelector(".m-ranking-row.me")?.textContent.includes("650 XP")`, "weekly leaderboard row", 20000);
await assertPage("desktop profile", `() => ({
  profile: !!document.querySelector(".m-profile"),
  xp: document.body.textContent.includes("650 XP"),
  streak: document.body.textContent.includes("4"),
  ranking: document.querySelector(".m-ranking-row.me")?.textContent.includes("MonokoTest"),
  medalsFollowClaims: document.querySelector(".m-chip.medals")?.textContent.trim().startsWith("0/"),
  culturesFollowClaims: document.querySelectorAll(".m-culture-card:not(.locked)").length === 0
})`);
const profileShot = await screenshot("profile-desktop");

await clickByText(".m-rail nav button", "Apprendre");
await waitFor(`document.querySelectorAll(".m-path-node").length >= 7`, "course trail");
await waitFor(`document.querySelector(".m-trail-reward-modal .m-milestone-stage") && document.body.textContent.includes("Recevoir ma médaille")`, "automatic level medal ceremony");
await assertPage("desktop course trail", `() => ({
  trail: !!document.querySelector(".m-path-trail"),
  curvedPath: (document.querySelector(".m-path-base")?.getAttribute("d") || "").includes(" C "),
  lessons: document.querySelectorAll(".m-path-node:not(.reward):not(.gate)").length === 3,
  rewards: document.querySelectorAll(".m-path-node.reward").length === 3,
  gates: document.querySelectorAll(".m-path-node.gate").length >= 1,
  completed: document.querySelectorAll(".m-path-node:not(.reward):not(.gate).completed").length === 2,
  available: document.querySelectorAll(".m-path-node:not(.reward):not(.gate).current").length === 1,
  enriched: document.querySelectorAll(".m-path-node.elargir-passed").length >= 1,
  orangeGifts: document.querySelectorAll(".m-path-node.reward.gift.available").length > 0 && [...document.querySelectorAll(".m-path-node.reward.gift.available")].every(node => getComputedStyle(node).backgroundColor === "rgb(211, 154, 36)"),
  courseRail: getComputedStyle(document.querySelector(".m-course-level-rail")).display !== "none",
  developerMenu: !!document.querySelector('.m-developer-more[aria-label="Outils développeur"]'),
  levelReward: document.body.textContent.includes("+500 XP"),
  medalAvailable: !!document.querySelector(".m-path-node.reward.milestone.available")
})`);
const trailShot = await screenshot("trail-desktop");
const medalShot = await screenshot("medal-ceremony-desktop");
await clickByText(".m-trail-reward-modal button", "Recevoir ma médaille");
await waitFor(`document.querySelector(".m-milestone-stage.revealed") && document.querySelector(".m-chip.xp")?.textContent.includes("1150")`, "persisted level medal reveal", 20000);
await assertPage("level medal reveal", `() => ({
  confetti: document.querySelectorAll(".m-celebration span").length >= 40,
  medalCount: document.querySelector(".m-chip.medals")?.textContent.trim().startsWith("1/"),
  grandChallenge: document.body.textContent.includes("Relever le Grand défi")
})`);
const medalRevealShot = await screenshot("medal-reveal-desktop");
await clickByText(".m-trail-reward-modal button", "Entrer dans le niveau");
await waitFor(`!document.querySelector(".m-trail-reward-modal")`, "medal ceremony close");

await clickByText(".m-course-level", "Fondations");
await evaluate(`document.querySelector(".m-path-node:not(.reward):not(.gate).completed").click()`);
await waitFor(`document.querySelector(".m-lesson-preview") && document.body.textContent.includes("80 % pour avancer")`, "mock-style lesson preview");
await waitFor(`[...document.querySelectorAll(".m-lesson-preview button")].some(button => button.textContent.includes("Aller plus loin"))`, "eligible Aller plus loin action");
await assertPage("lesson preview", `() => ({
  mastered: document.body.textContent.includes("Leçon maîtrisée"),
  description: document.body.textContent.includes("Saluer, remercier"),
  duration: document.body.textContent.includes("8 min"),
  replay: document.body.textContent.includes("Revoir la leçon"),
  elargir: document.body.textContent.includes("Aller plus loin")
})`);
const lessonPreviewShot = await screenshot("lesson-preview-desktop");
await clickByText(".m-lesson-preview button", "Aller plus loin");
await waitFor(`document.body.textContent.includes("Aller plus loin") && [...document.querySelectorAll("button")].some(button => button.textContent.includes("Commencer"))`, "real Aller plus loin engine", 20000);
await assertPage("real Aller plus loin engine", `() => ({
  briefing: document.body.textContent.includes("Aller plus loin"),
  target: document.body.textContent.includes("80"),
  questions: document.body.textContent.includes("question")
})`);
await evaluate(`document.querySelector('button[aria-label="Quitter"]').click()`);
await waitFor(`document.body.textContent.includes("Module terminé")`, "lesson after Aller plus loin exit");
// The redesigned lesson page returns to the trail with one labelled control;
// the course name it used to carry now sits in the lesson heading kicker.
await clickByText(".m-lesson-back", "Retour au parcours");
await waitFor(`document.querySelector(".m-path-trail")`, "course trail after Aller plus loin");
await clickByText(".m-course-level", "Fondations");

await evaluate(`document.querySelector(".m-reward-horizon .m-level-challenge:not(:disabled)").click()`);
await waitFor(`document.querySelector(".m-challenge-brief") && [...document.querySelectorAll("button")].some(button => button.textContent.includes("Lancer les 20 questions"))`, "Grand défi briefing", 20000);
await assertPage("Grand défi briefing", `() => ({
  title: document.body.textContent.includes("Grand défi du niveau"),
  target: document.body.textContent.includes("80"),
  questions: document.body.textContent.includes("20") && document.body.textContent.includes("questions"),
  record: document.body.textContent.includes("record")
})`);
const challengeShot = await screenshot("challenge-desktop");
await clickByText(".m-challenge-brief button", "Lancer les 20 questions");
await waitFor(`document.body.textContent.includes("Grand défi · Fondations") && [...document.querySelectorAll("button")].some(button => button.textContent.includes("Commencer"))`, "real Grand défi engine", 20000);
await evaluate(`document.querySelector('button[aria-label="Quitter"]').click()`);
await waitFor(`document.querySelector(".m-path-trail")`, "course trail after challenge");

await evaluate(`document.querySelector(".m-path-node.reward.available:not(.milestone)").click()`);
await waitFor(`document.querySelector(".m-trail-reward-modal") && document.body.textContent.includes("Ouvrir le cadeau")`, "lesson gift modal");
const giftShot = await screenshot("gift-desktop");
await clickByText(".m-trail-reward-modal button", "Ouvrir le cadeau");
await waitFor(`document.querySelector(".m-trail-reward-modal .m-reward-earned") && document.querySelector(".m-chip.xp")?.textContent.includes("1200")`, "persisted gift XP reveal", 20000);
await waitFor(`document.querySelectorAll(".m-celebration span").length >= 20`, "gift confetti");
await clickByText(".m-trail-reward-modal button", "Découvrir la capsule");
await waitFor(`document.querySelector(".m-culture-modal") && document.querySelectorAll(".m-celebration span").length >= 20`, "culture capsule modal and confetti");
await waitFor(`getComputedStyle(document.querySelector(".m-modal-art")).backgroundImage.includes("assets/culture/capsules-1.jpg")`, "culture capsule artwork");
const cultureShot = await screenshot("culture-desktop");
await clickByText(".m-modal button", "Fermer");
await evaluate(`document.querySelector(".m-path-node.reward.gift.completed").click()`);
await waitFor(`document.querySelector(".m-trail-reward-modal .m-reward-earned") && document.querySelector(".m-chip.xp")?.textContent.includes("1200")`, "claimed gift remains one-time");
await clickByText(".m-trail-reward-modal button", "Fermer");

await evaluate(`window.confirm = () => true`);
await evaluate(`document.querySelector('.m-developer-more[aria-label="Outils développeur"]').click()`);
await waitFor(`document.querySelector(".m-developer-menu")`, "developer progress menu");
await clickByText(".m-developer-menu button", "Parcours terminé");
await waitFor(`[...document.querySelectorAll(".m-path-node:not(.reward):not(.gate)")].every(node => node.classList.contains("completed"))`, "developer completed-course preset", 20000);
await assertPage("developer completed-course preset", `() => ({
  allLessonsComplete: [...document.querySelectorAll(".m-path-node:not(.reward):not(.gate)")].every(node => node.classList.contains("completed")),
  everyLevelOpen: [...document.querySelectorAll(".m-course-level")].every(button => !button.disabled),
  xpRecalculated: [...document.querySelectorAll(".m-chip.xp")].some(chip => Number(chip.textContent.trim()) >= 1000),
  boundaryMedalAvailable: !!document.querySelector(".m-path-node.reward.milestone.available"),
  medalsEarned: document.querySelector(".m-chip.medals")?.textContent.trim().startsWith("1/")
})`);
await evaluate(`document.querySelector(".m-trail-reward-modal .m-reward-secondary")?.click()`);
await waitFor(`!document.querySelector(".m-developer-menu")`, "developer menu to close after preset");
await evaluate(`document.querySelector('.m-developer-more[aria-label="Outils développeur"]').click()`);
await waitFor(`document.querySelector(".m-developer-menu")`, "developer menu restore preset");
await clickByText(".m-developer-menu button", "Niveau 2 ouvert");
await waitFor(`document.querySelectorAll(".m-path-node:not(.reward):not(.gate).completed").length === 2`, "developer level-two preset", 20000);

await evaluate(`document.querySelector(".m-course-brand").click()`);
await waitFor(`document.querySelector(".m-home")`, "home before secondary tools");
await clickByText(".m-rail nav button", "Dictionnaire");
await waitFor(`document.querySelector(".m-dictionary-panel.focused")`, "focused home dictionary");
await assertPage("home dictionary focus", `() => ({
  active: document.querySelector(".m-rail .m-nav-button.active")?.textContent.includes("Dictionnaire"),
  panel: !!document.querySelector(".m-dictionary-panel.focused"),
  search: getComputedStyle(document.querySelector(".m-dictionary-panel.focused .m-search")).borderColor !== "rgb(223, 230, 223)"
})`);
const dictionaryShot = await screenshot("dictionary-focus-desktop");
await evaluate(`document.querySelector(".m-browse").click()`);
await waitFor(`document.querySelector(".m-secondary-content") && document.body.textContent.includes("Parcourir")`, "browse shell");
await assertPage("desktop dictionary shell", `() => ({
  browse: document.body.textContent.includes("Parcourir"),
  active: document.querySelector(".m-rail .m-nav-button.active")?.textContent.includes("Dictionnaire"),
  medals: !!document.querySelector(".m-chip.medals")
})`);
await clickByText(".m-rail nav button", "Accueil");
await waitFor(`document.querySelector(".m-home")`, "home after dictionary shell");
await clickByText(".m-rail nav button", "Parler");
await waitFor(`document.querySelector(".m-secondary-content.conversation")`, "chat shell");
await assertPage("desktop chat shell", `() => ({
  chat: document.body.textContent.includes("Parler avec Monoko"),
  rail: getComputedStyle(document.querySelector(".m-rail")).display !== "none",
  active: document.querySelector(".m-rail .m-nav-button.active")?.textContent.includes("Parler"),
  medals: !!document.querySelector(".m-chip.medals")
})`);
await sleep(500);
const chatShot = await screenshot("chat-desktop");
await clickByText(".m-rail nav button", "Traduction en direct");
await waitFor(`document.querySelector(".m-secondary-content.conversation") && document.body.textContent.includes("Traduction en direct")`, "live translation shell");
await assertPage("desktop live shell", `() => ({
  live: document.body.textContent.includes("Traduction en direct"),
  active: document.querySelector(".m-rail .m-nav-button.active")?.textContent.includes("Traduction en direct"),
  medals: !!document.querySelector(".m-chip.medals")
})`);
await sleep(500);
const liveShot = await screenshot("live-desktop");

await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });
await evaluate(`document.querySelector(".m-bottom-nav button").click()`);
await waitFor(`document.querySelector(".m-home")`, "mobile home");
await assertPage("mobile home", `() => ({
  home: !!document.querySelector(".m-home"),
  railHidden: getComputedStyle(document.querySelector(".m-rail")).display === "none",
  bottomNav: getComputedStyle(document.querySelector(".m-bottom-nav")).display !== "none"
})`);
const mobileShot = await screenshot("home-mobile");

await clickByText(".m-bottom-nav button", "Parcours");
await waitFor(`document.querySelector(".m-path-trail")`, "mobile course trail");
await assertPage("mobile course trail", `() => ({
  trail: !!document.querySelector(".m-path-trail"),
  railHidden: getComputedStyle(document.querySelector(".m-course-level-rail")).display === "none",
  bottomNav: getComputedStyle(document.querySelector(".m-bottom-nav")).display !== "none",
  labels: document.querySelectorAll(".m-path-label").length >= 3
})`);
const mobileTrailShot = await screenshot("trail-mobile");

await send("Emulation.setDeviceMetricsOverride", { width: 320, height: 700, deviceScaleFactor: 2, mobile: true, screenWidth: 320, screenHeight: 700 });
await assertPage("320px course trail", `() => ({ trail: !!document.querySelector(".m-path-trail") })`);

const ignored = ["favicon.ico", "Failed to load resource"];
const appOrigin = new URL(APP_URL).origin;
if (["localhost", "127.0.0.1"].includes(new URL(APP_URL).hostname)) {
  ignored.push(`HTTP 500: ${appOrigin}/api/lesson-context`, `HTTP 500: ${appOrigin}/api/rag-context`);
}
const seriousErrors = browserErrors.filter(error => !ignored.some(fragment => error.includes(fragment)));
if (seriousErrors.length) throw new Error(`Browser errors: ${seriousErrors.join(" | ")}`);

console.log(JSON.stringify({
  ok: true,
  screenshots: [homeShot, profileShot, trailShot, medalShot, medalRevealShot, lessonPreviewShot, challengeShot, giftShot, cultureShot, dictionaryShot, chatShot, liveShot, mobileShot, mobileTrailShot],
  checks: ["desktop home", "profile and weekly ranking", "continuous course trail", "automatic medal ceremony", "lesson preview and Aller plus loin", "lesson gift claim and XP", "developer progress and reward boundaries", "Grand défi briefing and real engine", "culture modal and confetti", "dictionary focus", "shared dictionary/chat/live shell", "390px mobile", "390px mobile trail", "320px overflow"],
}, null, 2));
socket.close();
