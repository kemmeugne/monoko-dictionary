# Monɔkɔ — Claude Code Context

## What this project is

Monɔkɔ is a multilingual dictionary and AI conversation app for African languages (Lingala, Yoruba). It combines a professor-verified dictionary, structured grammar courses, and an AI chat assistant backed by a pgvector RAG system on Supabase.

**Live app**: https://monoko.africa (since 2026-09-04)
**Admin panel**: https://monoko.africa/admin.html (password in Vercel env vars)

`monoko-app.vercel.app`, `monoko-dictionary.vercel.app`, `www.monoko.africa`,
`monoko.ca` and `www.monoko.ca` all 308 to the apex. **Never hardcode any of
them** — see the origin rule below.

The frontend is a mobile-first responsive web app that will be wrapped with Capacitor and shipped to the App Store and Play Store. All UI work must follow the mobile-first rules below.

---

## Origins, domains and mail (2026-09-04)

**Never hardcode the app's own origin.** `emailRedirectTo` used to be the literal
`https://monoko-dictionary.vercel.app`, so the day the domain changed, every
signup confirmation sent the new learner to the old host. Both auth redirects now
use `` `${window.location.origin}/` ``, which is correct on the apex, on previews
and on localhost with no per-environment configuration.

That rule has one known exception ahead of it: **under Capacitor
`window.location.origin` is `capacitor://localhost` (iOS) or `http://localhost`
(Android)**, which is a dead confirmation link. The mobile wrap needs an explicit
https URL or a deep link — this is right for web and wrong for native.

**CORS lives in `api/_rate-limit.js`, as an explicit allowlist.** It used to admit
`origin.endsWith(".vercel.app")`, which let *any* site hosted on Vercel call the
API from a browser. Preview matching is now `^https://monoko-[a-z0-9-]+\.vercel\.app$`.
Note the app itself never depended on this: every call is a relative `/api/...`
path, so it is same-origin and CORS never applied. The allowlist governs
everything *else*.

**Supabase Site URL needs the scheme.** Set to a bare `monoko.africa` it produced
`redirect_to=monoko.africa` and every confirmation link died on
`{"error":"requested path is invalid"}` — the app's own `emailRedirectTo` was
discarded and Site URL used as the fallback. It must read `https://monoko.africa`,
with `https://monoko.africa/**` in the Redirect URLs allowlist or the fallback
happens regardless of what the client asks for.

**Mail sends from `mail.monoko.africa` via Resend**, not the shared Supabase
sender. The DNS lives on that subdomain — `resend._domainkey.mail` (DKIM),
`send.mail` (MX + SPF) — so **the root SPF is never edited**. One SPF record on
the root, ever; a second is a PermError that breaks Google Workspace too. DMARC
sits at `p=none` while the new sender warms up.

## Landing page (2026-09-04)

**The apex is the only indexable identity.** `index.html` self-canonicals to
`https://monoko.africa/` and includes description, Open Graph, X/Twitter and
`WebSite` JSON-LD metadata. Both `.vercel.app` production aliases are
host-conditioned permanent redirects in `vercel.json`; do not replace those
with an unconditional redirect or the apex will loop. `robots.txt` points to a
one-URL `sitemap.xml` and disallows only `/api/`. The admin page remains
crawlable so search engines can read its `noindex` HTML metadata and
`X-Robots-Tag` response header. The build must keep copying both crawl files,
and `tests/smoke/landing.spec.js` checks the whole contract plus the social image.

**The map is the language selector.** A second "Un point de départ" directory
listed the same languages the map already offers, and on a phone it pushed the
only thing that says *Africa* off screen. It is gone; the map markers and tabs
select, and the caption under the tabs carries that language's name, family,
speaker count, description and regions.

**The dictionary is a permanent section of the landing page**, not something a
visitor summons. It used to mount only on click, which hid the one screen usable
without an account — and it is the SEO and goodwill engine per
`PHASE3_LAUNCH_PLAN.md`. The buttons now scroll to it and set which language it
opens on; its close button renders only when an `onClose` is passed.

**The hero map opens on the selected language's region and flies between them.**
Lingala opens over the Congo, tapping Yoruba travels to Nigeria, both at zoom 5.
A continent-wide `fitBounds` was tried and reverted: it does show all of Africa,
but a 1:2 portrait phone cannot hold a roughly square continent without filling
the spare height with Europe, and the result read as a world map rather than a
place. Travelling between regions is the point of having a map here.

**Basemap is Esri Light Gray Canvas, and the reason matters.** CARTO's
`light_all` began requiring an API key — but it does not fail. It answers **200
with the tile replaced by an "API KEY REQUIRED" watermark**, so nothing appears
in the console or the network tab and the landing page simply renders the demand
for a key across the hero. Esri needs no key; its axis order is `{z}/{y}/{x}`,
not CARTO's `{z}/{x}/{y}`, and its attribution is required, so
`attributionControl` stays on and CSS keeps it quiet.

**The browser back button is wired to `view`.** The app is one view value with no
router, so back left the site entirely. `view` now mirrors into
`history.pushState`, and a `popstate` restores it. Only `RESTORABLE_VIEWS` come
back directly — a lesson, a word detail or a running session also needs state the
history entry does not carry, so those fall through to `home`/`lang_select`
rather than rendering half-empty. A view change that *came from* the back button
must not push a new entry, or back can never escape it.

**A recovery link must not be treated as a sign-in.** `resetPasswordForEmail`
sends a link carrying a real session, so supabase-js signs the visitor in the
moment the page loads. That made it indistinguishable from any other auth
callback, and the learner landed on the home screen already logged in, never
asked for the password they clicked the link to change — the reset silently did
nothing. `AUTH_RECOVERY` (a `type=recovery` fragment) routes them to `AuthPage`
in **`recover` mode** instead: no e-mail field, since the session already
identifies them, and two password fields so a typo cannot lock someone out of
the account they are recovering.

`completePasswordReset` calls `updateUser` **without re-authenticating**, unlike
`changePassword` in settings. The recovery link is the proof, and the learner
does not know the old password — that is why they are here. The tokens are
stripped from the address bar on arrival: a recovery token in history is worth
as much as the password it sets.

**It then signs them out and returns them to the login form**, with their
address filled in and a confirmation message, rather than walking them into the
app. The session came from a link in an inbox, not from anyone proving they know
the password — and the password just changed. Making the new one earn the first
sign-in also answers "did that work?", which being carried into the app does not.
`recoveryRouted` stays true afterwards: it means "this page load has handled its
recovery link", and clearing it sends the learner back to the reset form the
moment they sign in.

**Mid-recovery, nothing may move the learner off the form.** Three things used to:
the initial view is `home` whenever a language is remembered, the boot-language
hint calls `selectLanguage` on mount, and the profile resume calls it again when
the network lands about a second later — the form appeared and was redirected
over. The latch (`recoveryPendingRef`) sits **inside `selectLanguage`**, not on
its callers: every automatic navigation funnels through it, so guarding the
destination cannot be defeated by a caller nobody remembered. The language data
still loads; only the view is held.

**A completed reset explicitly requests global sign-out and verifies it.** The
`signOut({ scope: "global" })` after `updateUser` revokes the account's refresh
tokens. Already-issued access-token JWTs remain valid until their normal expiry,
so do not describe this as instantaneous revocation of every access token. If
global sign-out fails, the app attempts local sign-out, clears its stored auth
token as a last resort, and shows a warning instead of claiming that every
session was closed.

**An expired or already-used auth link gets its own screen.** Supabase redirects
these visits with `error`, `error_code` and `error_description` instead of a
session. `AUTH_CALLBACK_ERROR` routes that shape to `link_error`, removes the
error fragment/query from browser history, and offers a new reset link. A
`type=recovery` URL whose token exchange produces no session lands on the same
screen; it must never claim "Votre lien est valide" or fall through to the
marketing landing page.

The failure this replaced was not an access-control hole — the link goes to the
owner's inbox, and whoever reads that inbox can take the account anyway. It was
worse in a subtler way: the reset *silently did not happen*, so someone resetting
a password they believed was compromised kept the compromised one and was told
nothing.

Covered by `tests/smoke/recovery.spec.js`. **Two traps in that file are worth
reading before touching it**, because both produce tests that pass while testing
nothing:

- **Do not seed a session into localStorage.** supabase-js restores a stored
  session and then never looks at the URL fragment, which is the entire path a
  recovery link takes. The first version of this spec did that and passed
  against the broken build.
- **Playwright matches routes in REVERSE registration order.** Register the
  `**/rest/v1/**` catch-all *first* and the specific `languages` / `profiles`
  mocks after it. The other way round, languages come back empty, the profile
  resume finds nothing to resume into and returns early — and the navigation the
  test exists to survive is never armed.

**Prove a regression test fails against the bug.** Both traps above were caught
only by checking out the broken commit, rebuilding and running the test against
it. A test that has never been seen to fail is a guess.

**A confirmation link signs the learner in after the first paint.** The session
arrives in the URL, not in storage, so `hasStoredSession()` is false and the
landing page paints; supabase-js then consumes the URL and signs them in with
nothing watching, leaving them on the marketing page already logged in.
`AUTH_CALLBACK` records that the visit came from such a link, and the app moves
them into their language once the session lands — stripping the tokens from the
address bar on the way.

---
## How to write to Anthony

**Write in a straightforward and clear way that is structured and gets to the
point.**

This is a standing instruction, not a style preference. Earlier sessions were
hard to follow and confusing to read.

What that means in practice:

- **Lead with the answer.** State what happened or what you recommend in the
  first line. Do not build up to it.
- **Structure it.** Short sections with headings, or a table. Not long prose.
- **Cut the commentary.** No narrating your reasoning, no restating the question,
  no explaining what you are about to say before you say it.
- **One idea per paragraph.** Two or three sentences, then stop.
- **Say what needs doing.** If there is an action for Anthony, put it at the top
  or under its own heading, not buried in the middle.
- **Plain words.** If a term needs defining ("gloss"), either define it in the
  same sentence or use a simpler word.

Length is not the measure — clarity is. A long answer that is well structured and
scannable is fine. A short one that rambles is not.

---
## Mobile-first design (Capacitor-bound)

This app will be wrapped with Capacitor and shipped to the App Store and Play Store. Every new feature must be designed mobile-first.

**Hard rules**
- Design at 375px width first, scale up with `@media (min-width: ...)`
- Interactive elements ≥44×44px (tap targets)
- No hover-only interactions
- `<input>` and `<textarea>` use `font-size: 16px` minimum (prevents iOS focus zoom)
- Use `100dvh` not `100vh` for full-height layouts
- Use `padding: env(safe-area-inset-top) ... env(safe-area-inset-bottom)` on full-screen views
- No `position: fixed` for primary UI (mobile Safari + virtual keyboard bugs)
- Bottom navigation, not top
- No horizontal scroll
- **Centre a scrollable box with `margin: auto`, never `justify-content: center`.**
  They are identical until the content is taller than the box, and then a
  centred flex container overflows in *both* directions — browsers will not
  scroll above the origin, so the top of the content becomes unreachable. Auto
  margins collapse to 0 when space runs out and the content scrolls normally.
  This bit the session briefing in Slice 7: the learner with a streak, items due
  and a topic level is precisely the one with enough content to overflow, and
  what they lost was the lesson title and the stage chip.

**Test before merging**
- Chrome DevTools mobile emulation (iPhone SE, iPhone 14 Pro, Pixel 5)
- Actual iPhone via Vercel URL → Safari → Share → Add to Home Screen
- All audio playback (Lingala TTS, dictionary audio) confirmed working in iOS Safari WebView

**Avoid**
- Browser-only APIs without Capacitor equivalents (use feature detection)
- Heavy initial bundle — Capacitor WebView startup is slower than browser
- `localStorage` for anything critical — Capacitor has it but it can be cleared by the OS; use Supabase for persistence

## Stack

| Layer | Technology | Where |
|---|---|---|
| Frontend | Single-file React source, esbuild production artifact | Vercel (`dist/`) |
| Database | Supabase (PostgreSQL + pgvector) | `haioiccujncsehadipzb.supabase.co` |
| LLM | OpenAI `gpt-4o-mini` | via Vercel serverless `/api/chat.js` |
| Admin writes | Vercel serverless function | `api/admin-action.js` |
| Chat proxy | Vercel serverless function | `api/chat.js` |
| RAG context | Vercel serverless function | `api/rag-context.js` |
| Lesson context | Vercel serverless function | `api/lesson-context.js` |
| Vector search (corpus) | Supabase pgvector (`parallel_sentences.embedding`) | `match_parallel_sentences` RPC |
| Vector search (courses) | Supabase pgvector (`lesson_items.embedding`) | `match_lesson_items` RPC |
| Vector search (dictionary) | Supabase pgvector (`examples.embedding`, `senses.embedding`) | `match_examples` / `match_senses` RPCs (2026-08-07) |
| Lingala TTS | HuggingFace Space `Kemz42/monoko-lingala-tts` (ESPnet2 VITS, DigitalUmuganda model, 71.6h Lingala) | called directly from browser |
| French TTS | Web Speech API (browser built-in, `SpeechSynthesisUtterance`) | `index.html` |

---

## Key files in this repo

```
index.html                        — entire frontend (React, ~6,700 lines — a build step is now
                                    a Phase 4 prerequisite, see BUILD_AND_SPLIT_PLAN.md).
                                    Module 1.1 has a
                                    special tile view (AlphabetPanel); it reads every tile from
                                    lesson_items, so DB fixes reach the screen. It used to render
                                    from a hardcoded ALPHABET_DATA table that had drifted from the
                                    audio — do not reintroduce hardcoded lesson content.
admin.html                        — admin panel: per-card approve/reject, pagination top+bottom, page X/Y counter, professor_modified tracking
api/admin-action.js               — Vercel serverless function (secure Supabase writes)
api/chat.js                       — Vercel serverless function (SSE-streaming gpt-4o-mini proxy; logs t_rag_ms + t_llm_ms to chat_events)
api/rag-context.js                — Vercel serverless function (pgvector search over parallel_sentences + the dictionary (examples/senses), 3 RPCs in parallel; accepts optional min_similarity)
api/lesson-context.js             — Vercel serverless function (pgvector semantic search over lesson_items)
api/mms-tts.js                    — Vercel serverless function (warm-up GET ping for HF Space; POST proxies audio but unused — client calls Space directly)
api/cron/keep-tts-warm.js         — Vercel cron handler (GET ping to MMS_SPACE_URL; requires Vercel Pro for sub-hourly schedule)
api/_rate-limit.js                — shared per-IP rate limiter + CORS helper, used by every api/*.js endpoint (in-memory sliding window)
api/leaderboard.js                — authenticated weekly country/world ranking; returns pseudonyms only, never user ids
api/geo.js                        — GET → { country } from Vercel's own `x-vercel-ip-country` edge header. No third-party geo-IP service, no learner IP leaving the platform, and it returns the country code alone — never city, region or coordinates. Absent header (local dev) returns null so the client falls back rather than recording a guess
monoko-ui.css                     — production learner shell: public landing, home, continuous course trail, lesson pages, profile, rewards, ranking and responsive navigation
course-trail-meta.js              — mock-matched lesson preview descriptions and estimated durations, kept separate from the exercise/content records
COURSE_TRAIL_PARITY.md            — production contract for every course-trail behavior carried over from the isolated mock
FREE_TIER_AND_CONVERSION_PLAN.md  — APPROVED product contract for free access, trial, Monoko Plus, paywall behavior, analytics events and experiment order
populate_lesson_pool.py           — rebuilds the routed exercise pool; also owns the native-only curation rules so a rebuild cannot restore ambiguous prompts
sql/native_content_cleanup.sql    — applies those native curation rules to the current pool without modifying professor lesson rows
                                    (in effect in production: `npm run audit:native-content` clean, 2026-09-05)
scripts/audit_native_content.mjs  — read-only production check for blanks, within-lesson duplicates, excluded prompts, example substitutions and expected audio gaps

Phase 2 — the session, chat, live and dictionary (2026-08-24). The last of the
retired cream/purple surface moved onto the design system. It was a palette and
geometry conversion, not a rewrite: the six exercise screens, the session shell,
briefing and summary, the chat, live translation, the in-app dictionary and word
detail are all still inline-styled JSX, but every colour literal is now a design
token and every radius is 8–10px.

`--m-correct` / `--m-wrong` (and their `-soft` / `-line` variants) were added for
this: the exercise screens need a right/wrong pair the rest of the app never had,
and both are drawn from the app's own family so a correct answer reads as
Monɔkɔ's green rather than a system green. `STAGE_BRIEF` accents are now
`--m-purple-dark` (Pratiquer), `--m-forest` (Élargir) and `--m-gold` (Grand
défi). Every `linear-gradient(135deg, …)` in the session and dictionary is a flat
fill — the design system has no gradients anywhere else. The only retired
literals left in the file are the two `LANG_THEMES` / `LANG_GEO` entries, which
are per-language brand colours for the map markers and are meant to stay.

The chat carried a third copy of sign out — a "Connecté / Déconnexion" card in
the middle of a conversation screen, from before the rail and settings had it.
Removed.

**Verifying the exercise screens needs a richer pool than the seed provides.**
`scripts/seed_test_data.js` leaves lesson 277 with four `lesson_pool` rows, which
only ever builds listen-and-type. Inserting a dozen short native rows with audio
into that lesson makes match-pairs and choose-the-audio reachable; re-seed
afterwards. Without that step a session playthrough silently exercises one screen
out of six.

Auth and navigation (2026-08-23). There are now three distinct front doors and
one rule about who sees what.

- **`lang_select`** is the public marketing landing, for anonymous visitors.
- **`auth`** (`AuthPage`) is the login page: sign in, sign up and password
  reset, in the redesigned template. **Signing out lands here, not on the
  landing page** — a returning learner should meet a login form, not a pitch.
  It keeps a "Découvrir Monɔkɔ" link back to the landing.
- **`home` and everything behind it** require a learner. `PRIVATE_VIEWS` lists
  them and an effect redirects to `auth` when there is no `currentUser`. The app
  used to render home signed out and only challenge you at Parcours, on the
  *previous design's* auth screen — inconsistent in both behaviour and styling.

The gate is checked only once `authLoading` is false. Treating "session not
resolved yet" as "signed out" would bounce a returning learner to the login page
on every cold load.

**Changing a password requires the old one.** Supabase's `updateUser` does not
ask for it, so an unattended open session would be enough to take an account
over; `changePassword` re-authenticates with `signInWithPassword` first, and the
form asks for the new password twice.

Password reset uses `resetPasswordForEmail` and always reports the same message
whether or not the address has an account — a different one would turn the form
into a way to test which e-mail addresses are registered.

**The dictionary is the one public screen, and it renders ON the landing page.**
`LandingDictionary` unfolds in place — language tabs, direction toggle, search,
and results that expand to their senses, audio and an example — rather than
sending a visitor into the app shell to look up one word. It is the SEO and
goodwill engine, free forever per `PHASE3_LAUNCH_PLAN.md`. `search` / `browse` /
`detail` remain outside `PRIVATE_VIEWS` and `openPublicDictionary` still exists
as the in-shell fallback. **The hero clips rather than scrolls.** `.m-landing-hero` is
`overflow: hidden`, so anything wider than the viewport is silently cut off and
`scrollWidth - clientWidth` stays 0 — a page-level overflow check cannot see it.
Adding one nav button was enough to push the grid's `auto` track past 390px and
cut off the end of every line in the hero. The track is pinned with
`grid-template-columns: minmax(0,1fr)`, the header wraps, and the landing check
now measures element right edges against `innerWidth` instead of trusting the
page-level number.

**The language card is folded on arrival.** On a phone the description pushed
the map off screen, and the map is what tells a visitor this is about Africa.
It is a disclosure: tap to open, tap to close, closed by default.

Signed out, `StandardPage` renders a visitor shell:
`signedIn={false}` turns the rail account block and the XP/streak/medal chips
into a "Se connecter" call, the bottom nav says Dictionnaire/Connexion, and the
dictionary's back button returns to the landing rather than bouncing off the
home gate. Any learner destination from that shell asks for an account, which
is the intended funnel. **This is web-only in spirit**: the Capacitor build
never shows the landing page, so everything there is behind login.

**Every shell must be handed the account actions.** `HomeHub`, `CourseTrail` and
`ProfileHub` build their own shells rather than going through `StandardPage`, so
each one needs `onSettings` / `onSignOut` passed to its rail explicitly. They
were missed on the first pass and Paramètres/Déconnexion silently did nothing
from Accueil and Profil — an undefined `onClick` fails quietly. If you add a
component that renders `GlobalRail`, `TopBar` or `CourseLevelRail` directly,
wire both handlers and check them from that screen.

Account, settings and sign out (2026-08-22). `SettingsHub` (view `settings`)
holds everything personal: read-only email, password change, display name,
the one-time pseudonym, country, ranking opt-in, optional phone/address/
ethnicity, the language switch and sign out. It is reached from the gear in
the top bar — the rail is desktop-only, which is why a phone previously had
no route to language switching or sign out at all — and from the rail, which
also carries `Paramètres` and `Déconnexion` under the pseudonym.

`handleSignOut` clears the learner, not just the session: progress, XP,
rewards, streak and the resolved profile, plus the resume guard, or the next
person to sign in on the device sees someone else's streak and lands in
someone else's language.

**Checking a pseudonym needs a SECURITY DEFINER function, not a select.**
`profiles` RLS is `auth.uid() = user_id`, so a visitor who is still signing up
reads back an empty set for *every* name — a availability check that queries
the table directly always says "free", which is what the first version of this
form did. `pseudonym_available(text)` answers the one question without exposing
the table. If that function is missing the form lets the signup through rather
than blocking it: the unique index still refuses the duplicate, and the profile
insert retries without the name so the learner keeps a profile row. A missing
migration costs the warning, never the ability to sign up.

**The country is detected at signup, correctable there, and fixed afterwards.**
`/api/geo` pre-fills the field when the signup form opens; the learner can
change it before the account exists; the chosen value rides in auth metadata to
the first `profiles` insert; and the settings form never sends `country_code`,
so it cannot move a learner between rankings later.

The correction step is the point, not a convenience. Edge geolocation reports
where the *request* came from, not where someone lives — a VPN, a carrier
routing through another country, or signing up while travelling all report the
wrong one, and the core market is diaspora, exactly the people most likely to be
somewhere other than "their" country. Locking a detected value with no recourse
would have made every such case a support request. Correct-once-then-fix keeps
the anti-gaming property (nobody hops rankings week to week) without permanent
wrong data.

Deliberately **not** enforced by a database trigger, unlike the pseudonym: the
lock is in the UI so an operator can still repair a wrong value with SQL.

**The public pseudonym is chosen once.** It is asked for at signup, carried
from auth metadata into `profiles` on the first insert, and then fixed: the
`profiles_pseudonym_immutable` trigger refuses every later change including
blanking it, and `saveLearnerProfile` strips the field from the payload once
it is set so saving anything else cannot trip the trigger. Uniqueness is a
full unique index now — the old one was partial on `leaderboard_opt_in = true`,
so two learners could hold the same name until one of them opted in.

Landing, home and language switching (2026-08-22). `/` is the **public landing
page** (`PublicLanding`, view `lang_select`) — a signed-out marketing page, not a
chooser. A signed-in learner never sees it: the app reads
`profiles.preferred_language_id` on load and resumes straight to that language's
home, and switching language opens a sheet (`.m-language-sheet`) from the shell
instead of walking back through the landing page. The preference is now written
on the language choice itself; before this it was only ever set as a side effect
of editing a profile, and nothing read it back, so every returning learner met
the chooser again. `lang_select_legacy` holds the retired chooser as a rollback
reference and is not routed to.

**"Never sees it" is now true at the first paint, not a second later
(2026-08-25).** Resuming was correct but slow: the landing page is the default
`view`, and it stayed on screen through three round trips — `getSession()`, the
language list with its per-language word counts, then
`profiles.preferred_language_id`. A returning learner watched the marketing page
for about a second before the app replaced it.

Two synchronous localStorage reads at module load decide the first paint:
`hasStoredSession()` looks for supabase's own `sb-<project-ref>-auth-token` key,
and `readLastLanguage()` reads `monoko_last_language`, written by
`selectLanguage` and cleared by `handleSignOut`. With both, the app opens on
`home` with the language already in state. With a session but no remembered
language — every existing learner's first load after this shipped — `BootSplash`
(`.m-boot`) holds the screen until the resume settles. With neither, the landing
page renders immediately, as before.

Rules that fall out of it:

- **These are hints, never authority.** `getSession()` and the `PRIVATE_VIEWS`
  guard still decide what a visitor gets; a stale hint costs one redirect to the
  login form, not access. This is also why the localStorage rule above is not
  broken — the source of truth stays `profiles.preferred_language_id`, and a
  cleared key just restores the old three-round-trip path.
- **The cached language is a stale copy.** When the real list loads, the fresh
  row replaces it, and a language that is no longer active drops the hint and
  falls back to the chooser.
- **Nothing may strand a visitor on the splash.** `resumeChecked` is set on every
  branch of the resume effect including the failures, and a 4s `bootTimedOut`
  falls through to the landing page regardless.
- **The regression test must observe `document`, not `document.documentElement`.**
  A Playwright init script runs before the DOM exists, so `documentElement` is
  null there and `MutationObserver.observe()` throws — which turned the first
  version of this test into a silent no-op that passed against the bug.

The hero map is a backdrop, not a control: at full-viewport height Leaflet's own
touch handlers would swallow a vertical swipe and trap a phone reader on the
first screen, so every interaction handler is off for `immersive` and the
container is `pointer-events: none`. The language tabs under it do the selecting.
tests/                            — Vitest unit tests for every api/*.js file (see tests/README.md); test Supabase harness docs live here
sql/test_schema.sql               — idempotent schema for the test Supabase project (harness sprint; see HARNESS_SPRINT.md)
scripts/sync_test_schema.js       — applies sql/test_schema.sql to the test project via psql (refuses to run against any non-test project ref)
scripts/seed_test_data.js         — wipes + reseeds the test project with representative data + test user (refuses to run against any non-test project ref)
scripts/release_browser_check.mjs — dependency-free Chrome CDP release check for desktop, 390px and 320px against monoko-test

Developer course controls: `sql/developer_course_tools.sql` (applied 2026-08-22) stores authorized
accounts in `app_developers` and exposes protected progress preset RPCs. An
authorized developer sees the three-dot menu in `Apprendre`; its presets rebuild
that developer's real lesson progress, XP and prior milestone claims atomically,
while leaving the reward at the selected boundary available for ceremony testing.
The menu and the current-lesson preview also expose a one-lesson simulator. It
advances through the same protected snapshot RPC, animates the completed and
newly unlocked nodes, and deliberately re-arms a level-boundary medal ceremony
so the full progression flow can be replayed without running 20 questions.
The table has no client policies, so developer access must be granted with SQL.

HARNESS_SPRINT.md                 — implemented verification harness: unit tests, test Supabase, Playwright, guardrails and CI
tts_space/app.py                  — HuggingFace Space: ESPnet2 VITS Lingala TTS (Gradio 6.x, served at kemz42-monoko-lingala-tts.hf.space)
tts_space/requirements.txt        — Space deps: git+espnet, huggingface_hub, numpy, soundfile, nltk
tts_space/README.md               — Space metadata: sdk=gradio 6.13.0, python=3.10, app_file=app.py
sql/pgvector_parallel_sentences.sql — SQL migration: add embedding col + match_parallel_sentences RPC
sql/pgvector_dictionary.sql       — SQL migration: embedding cols on senses+examples + match_examples/match_senses RPCs (applied 2026-08-07)
sql/lesson_pool.sql               — SQL migration: lesson_pool, the exercise engine's material (applied 2026-08-10)
sql/exercise_progress.sql         — SQL migration: exercise_attempts + lesson_stage_state, what a session leaves behind (applied 2026-08-17)
sql/merge_ordinals_into_numbers.sql — SQL migration: folds L375 "Les nombres ordinaux" (3 items) into L350 "Les nombres" (applied 2026-08-17)
sql/conjugation_tables.sql        — SQL migration: conjugation_forms + lesson_conjugation_tables, a paradigm stored as a GRID (applied 2026-08-18)
sql/conjugation_lesson_tenses.sql — SQL migration: adds lesson_conjugation_tables.tenses text[] — a lesson shows only the tenses it teaches; NULL means all (applied 2026-08-18)
sql/lesson_pool_conjugation_source.sql — SQL migration: widens lesson_pool's source_table CHECK to admit conjugation_forms (applied 2026-08-18)
sql/progression.sql               — SQL migration: user_streak + review_schedule (SM-2), and the pratiquer_runs/elargir_runs drift repair (applied 2026-08-18)
sql/lesson_exercise_policy.sql    — SQL migration: per-lesson exercise-type ALLOW-list. Only L346 has a row (applied 2026-08-22)
sql/culture_capsules.sql          — editable lesson-linked cultural capsules + one-time claims (applied 2026-08-22)
sql/culture_capsules_seed.sql     — 16 sourced Lingala/Congolese capsule drafts tied to relevant live lessons (applied 2026-08-22)
sql/community_experience.sql      — profile pseudonyms/country, XP events, 500-XP level rewards and Grand défi state (applied 2026-08-22)
sql/trail_rewards.sql             — protected ordinary-gift and medal-ceremony claims, culture unlocks, and developer reward rebuild helper (applied 2026-08-22, verified against production 2026-08-22)
sql/account_settings.sql          — optional profile fields (phone/address/ethnicity) + pseudonym unique across ALL learners and immutable once chosen (applied 2026-08-23)
sql/pseudonym_availability.sql    — `pseudonym_available(text)` SECURITY DEFINER check, granted to anon (applied 2026-08-23)
sql/security_hardening.sql        — private corrections, immutable country, durable API quotas and trusted/idempotent progression RPCs (verified on monoko-test and applied to production 2026-08-24)
scripts/build.mjs                 — compiles the index/admin JSX with esbuild into ignored `dist/`; removes browser Babel. `npm run build`, also the authoritative whole-app syntax check
scripts/check_guardrails.mjs      — scans tracked files for committed secrets, unsafe correction RLS, browser progression writes and missing API auth guards
make_alphabet_cut_tool.py         — builds alphabet_cut_tool.html: confirm where the WORD starts in each of L346's 46 clips. The clips read the sound before the word ('O ... Motoki'), and the structure varies (1-4 speech segments), so the tool proposes the last segment and a human confirms. Audio is base64-embedded because R2 sends no CORS header
apply_alphabet_cuts.py            — cuts each clip to the confirmed word, uploads to R2 as <name>_word.mp3 (never overwriting the original), repoints lesson_pool. Needs .env.r2. Rollback JSON first
populate_alphabet_pool.py         — makes L346 'Sons et alphabet' usable as exercise material: trims the teaching label off lesson_pool.french ('Consonne B — Maladie' -> 'Maladie'), swaps in the DICTIONARY's clean word audio where the word exists there (21/46), and deletes the lesson's mis-routed Élargir rows. Rollback JSON first; lesson_items untouched
populate_conjugation_forms.py     — loads the FIRST professor's ko linga paradigm (5 tenses x 6 persons, 24 clips already on R2) from the original Cours 2 workbook matrix, attaches it to the lessons that teach those tenses, and mirrors the forms into lesson_pool as exercise material
populate_lesson_pool.py           — assembles lesson_pool from the three tiers; idempotent upsert on (source_table, source_id)
EXERCISE_ENGINE_PLAN.md           — CURRENT WORK. Exercise engine plan: decisions, measured data, build slices. Supersedes the Phase 3 "exam system" sections of ROADMAP/PHASE3_LAUNCH_PLAN/MONOKO_CURRICULUM
BUILD_AND_SPLIT_PLAN.md           — why index.html gets a bundler BEFORE Capacitor, and why splitting the file is a SEPARATE, later change gated on Playwright. Measured load-time numbers and the target module boundaries
sql/progress_tracking.sql         — SQL migration: profiles + user_progress tables with RLS (added 2026-04-14)
sql/enable_rls.sql                — RLS on every public table; dictionary stays public-read, everything else own-row
                                    (verified applied against production 2026-09-05)
sql/pgvector_lesson_items.sql     — lesson_items.embedding + match_lesson_items RPC (verified applied 2026-09-05)
sql/session_counters.sql          — lesson_stage_state.pratiquer_runs/elargir_runs; a counter, not a count over
                                    exercise_attempts, which are per QUESTION and carry no session id
                                    (verified applied 2026-09-05)
sql/user_delete_cascade.sql       — makes profiles/user_progress FKs cascade so an auth user can be deleted; they
                                    predate the convention every later table follows (applied 2026-09-05)
DOMAIN_AND_EMAIL.md               — monoko.africa DNS zone, Supabase auth URLs, Resend SMTP, and the failure mode
                                    each one produces when wrong
email_templates/                  — source of the Supabase auth e-mail templates, which otherwise live only in the
                                    dashboard with no history. Confirm signup was branded and Reset Password was
                                    not, and custom SMTP does not touch templates — the default English body went
                                    out from the branded sender for weeks. Only two templates are ever sent
monoko_auto_test.py               — automated quality tester: generates sentences, evaluates Lingala, inserts corrections
benchmark_monoko_models.py        — model benchmark: chrF scoring across OpenAI models (gpt-4o-mini chosen)
liste_200_phrases.docx            — 200 phrase types across 19 themes used by monoko_auto_test.py
route_corpus_to_lessons.py        — first-pass routing: nearest lesson_item by cosine. Measured at only 77% precision, FLAT across similarity bands -> superseded by the two scripts below, kept because it produces the candidate pool
llm_route_judge.py                — stage 1: LLM votes yes/no on cosine's guess (gpt-4.1-mini + `strict` prompt; 96% precision, 82% recall). --compare scores prompt variants against the human labels; --run does the full pass
reassign_discarded.py             — stage 2: shows the model all 50 lessons and asks WHICH one a rejected sentence belongs to. Recovered 1,786 of 3,334 rejects at 90% precision
classify_word_difficulty.py       — rates all 2,311 dictionary headwords 1-6; topic is the wrong axis for a single word, level is the right one
make_routing_qa_tool.py           — builds routing_qa_tool.html: 100 routed items stratified by similarity, for measuring routing precision
analyse_routing_qa.py             — reads the QA verdicts, reports precision per similarity band + per source, recommends a threshold
TECHNICAL_DOCS.md                 — full system documentation

Cours/MONOKO_CURRICULUM.md        — universal CEFR-aligned curriculum (6 levels, 29 modules) for all languages
Cours/lingala_curriculum_migration.sql — migration script: restructures old 4 courses into 6-level CEFR curriculum
generate_audio_collection_html.py — generates one HTML recording app per module for Lingala items missing audio
populate_stub_modules.py          — populates stub modules with suggested French content, then re-runs HTML generator
audio_collection_html/            — generated HTML recording apps (one per module), sent to professor for audio recording
generate_course_templates.py      — generates generic HTML recording apps for all 29 modules for any new language
ingest_professor_zips.py          — ZIP -> R2 -> Supabase ingest for returned recording apps; stages plan/upload/apply, --only <modules>, modes append/replace_all/new_lesson/upsert (2026-08-04)
make_variant_split_tool.py        — builds variant_split_tool.html: waveform review UI for rows holding several Lingala variants in one cell
apply_variant_split.py            — applies the tool's decisions: cuts clips, course keeps variant 1, alternatives -> parallel_sentences
translate_examples_to_parallel_sentences.py — translates professor example sentences (Lingala) to French via GPT and inserts into parallel_sentences; supports --dry-run and --from-log to insert directly from existing JSON log
sql/corrections_reviewed_at.sql   — migration: adds reviewed_at to corrections + pace monitoring queries
sql/chat_events_latency.sql       — migration: adds t_rag_ms + t_llm_ms integer columns to chat_events (applied 2026-04-30)
```

---

## Database tables (Supabase)

- `languages` — Lingala (id=1), Yoruba (id=2)
- `words` → `senses` → `examples` — dictionary hierarchy
- `senses.audio_url/audio_key/audio_source_cell` — Lingala word audio links (added 2026-03-15)
- `examples.audio_url/audio_key/audio_source_cell` — Lingala example audio links (added 2026-03-15)
- `parallel_sentences` — FR↔dialect sentence pairs for RAG; `embedding vector(384)` added 2026-03-31.
  **Actual size 3,481 rows** (counted 2026-08-07): 2,009 `flores200`/gold + 1,263
  `correction`/verified + 209 `course_variant`/verified. An earlier version of this
  file claimed ~7k ("5,227 verified Monoko + 2,008 FLORES") — the FLORES half was
  right, the rest was not.
- `senses.embedding` / `examples.embedding` — `vector(384)`, added **2026-08-07**
  (`sql/pgvector_dictionary.sql`), 2,686 + 2,686 rows backfilled. Before this the
  dictionary was **not in the RAG index at all** — see the RAG section below
- `corrections` — user-submitted AI corrections (pending → approved); `professor_modified boolean` tracks whether the professor edited the correction before approving; `reviewed_at timestamptz` set on approve/reject for session pace tracking (added 2026-04-18)
- `chat_events` — tester-tracked chat activity (`tester_name`, `session_id`, query/response, timestamps, `t_rag_ms`, `t_llm_ms` added 2026-04-30)
- `courses` → `lessons` → `lesson_items` — structured grammar courses
- `lesson_items.audio_url/audio_key/audio_source_cell` — Lingala course line audio links (added 2026-03-16)
- `lesson_items.example_audio_url/example_audio_key/example_audio_source_cell` — Lingala course example audio links (added 2026-03-16)
- `lesson_items.embedding vector(384)` — OpenAI text-embedding-3-small embeddings for pgvector search (added 2026-03-21, 1,740 rows embedded on old structure; new structure needs re-embedding via `embed_lesson_items.py`)
- `lesson_exercise_policy` — `(lesson_id PK, allow_types text[], reason)`. **A lesson with no row serves every type**, which is every lesson but one. The engine picks exercise types from the *shape* of a lesson's rows, and shape cannot see what a lesson is *for*: L346 "Sons et alphabet" has `french = 'Consonne T — Conseil'`, a teaching label rather than a translation, so match-pairs is solvable by first letter in **30 of its 46 rows** and choose-the-audio is given away by the clip pronouncing the letter before the word. It serves `listen_type` + `speaking` only. **Allow-list, not deny-list** — a seventh exercise type must not silently opt a curated lesson back in. Add a row only when a type is *wrong* for a lesson, never to tune difficulty (added 2026-08-18)
- `conjugation_forms` — one verb's paradigm as a **grid**: `(language_id, verb, tense, person)` unique, plus `french`, `lingala`, `audio_url`, sort orders. 30 rows = *ko linga* × 5 tenses × 6 persons, 24 of them with the professor's clip (added 2026-08-18)
- `lesson_conjugation_tables` — pins a paradigm to a lesson: `(lesson_id, verb)` unique, plus `tenses text[]`. **NULL `tenses` means every tense**; a list restricts the lesson to what it teaches. Two rows today: L358 gets four tenses, L359 gets `futur`, L393 (futur proche) is deliberately attached to nothing (added 2026-08-18)
- `profiles` — one row per auth user: private display name/preferences plus optional unique `public_pseudonym`, `country_code` and `leaderboard_opt_in` for the community ranking
- `user_progress` — lesson completion tracking: `user_id`, `lesson_id`, `language_id`, `completed_at`, `exam_score` (null until Phase 3); RLS ensures users only access their own rows (added 2026-04-14). **A row is written by PASSING PRATIQUER at 80%, never by the learner declaring it** (changed 2026-08-20 — it used to be a "J'ai terminé ce module" button, so the checkmark, the level progress bars and the "Continuer" card reported what someone had tapped rather than what they had learned). It stays a table rather than being read off `lesson_stage_state.pratiquer_passed` because the level cards need completion for every lesson at once, and stage state loads one lesson at a time
- `user_streak` — **one row per USER, not per language and not per lesson**: `current_streak`, `longest_streak`, `last_day`. A streak answers "did you show up today", which is a fact about the person; keying it by language would break the streak of someone doing Lingala on Monday and Yoruba on Tuesday. `last_day` is a **date in the learner's local day**, sent by the client — never `now()::date`, which is UTC (added 2026-08-18, `sql/progression.sql`)
- `review_schedule` — SM-2 scheduler state, **both stages** (Élargir added 2026-08-20): `(user_id, pool_item_id)` unique, plus `ease`, `interval_days`, `reps`, `due_on`. Distinct from `exercise_attempts`, which is an append-only event log — squeezing ease/interval into it would mean recomputing the whole history on every session start. Élargir writes nothing here (added 2026-08-18)
- `culture_capsules` / `user_culture_rewards` — editable lesson-linked culture content and one-time learner claims. Only naturally relevant lessons get capsules; other trail gifts remain XP rewards.
- `lesson_reward_claims` — one row per opened ordinary lesson gift. `claim_lesson_reward` derives eligibility and level-based XP server-side, records leaderboard XP once, and unlocks a linked cultural capsule when present. Final-lesson gifts use `claim_level_reward`, which derives the completed course and awards its medal ceremony safely.
- `user_xp_events` — weekly ranking event ledger. RLS exposes only a learner's own events; the leaderboard endpoint aggregates with a service credential and emits pseudonyms only.
- `user_level_rewards` — one row per completed course level; claims the named medal and fixed 500 XP exactly once. A database trigger creates its leaderboard XP event.
- `level_challenge_state` — one row per learner and level for the optional 20-question Grand défi: retained best score, one-way `passed`, replay count/session XP and a one-time 300-XP enriched-level reward.

---

## RAG pipeline (how chat works)

1. User clicks chat → if no `nom du testeur` is stored locally, frontend forces a tester setup step
2. User message → two parallel context fetches:
   - `POST /api/rag-context` on Vercel → OpenAI embedding → **three RPCs in parallel server-side**:
     `match_parallel_sentences` (top-30 corpus) + `match_examples` (top-12 dictionary
     sentences) + `match_senses` (top-6 dictionary words). Corpus is required; the two
     dictionary calls run through `allSettled` and degrade to corpus-only on failure.
   - `POST /api/lesson-context` on Vercel → OpenAI embedding → pgvector `match_lesson_items` RPC → top-8 course rows
3. Both contexts merged → `POST /api/chat` (Vercel serverless) → OpenAI `gpt-4o-mini` streaming SSE. Client consumes `data: {"delta":"..."}` chunks with `getReader()`, updating the message placeholder on each token.
4. Response shown with quality indicators: ✓ verified / ~ suggestion (assembled from verified elements)
5. If `SUPABASE_SERVICE_KEY` is configured on Vercel, `/api/chat` logs tester activity into `chat_events` (including `t_rag_ms` passed from client and `t_llm_ms` measured server-side)

**pgvector corpus index**: `parallel_sentences.embedding` — 3,481 rows, `text-embedding-3-small` (384 dim), via `match_parallel_sentences`

**pgvector course index**: `lesson_items.embedding` — 1,347 Lingala rows, via `match_lesson_items` filtered by `language_id`

**pgvector dictionary index** (added 2026-08-07): `examples.embedding` (2,686) +
`senses.embedding` (2,686), via `match_examples` / `match_senses`, both joined
through `words` for `language_id`.

**Why this mattered.** Only the corpus and `lesson_items` ever had embedding
columns, so retrieval reached **5,238 of the ~10,066** verified FR↔LN pairs the app
owns. The 2,686 professor-recorded dictionary example sentences and 2,686 headword
pairs were unreachable — and since the system prompt permits best-guess
translations when a word is absent from the corpus (changed 2026-04-02), the model
answered those from its own Lingala knowledge while the verified pair sat in a
table it could not see. Silent, and worst on exactly the vocabulary questions the
dictionary exists to answer.

**Dictionary filtering is a relative cutoff, not an absolute floor.** Dictionary
entries are short strings and short strings embed into a narrow band that shifts
per query: on *"comment dit-on une cuillère"* the right answer scores 0.67 while
cochon, grillon and palabre still score 0.48–0.52. `topCluster()` in
`api/rag-context.js` keeps only hits within 0.06 of the best score — which returns
just `Cuillère → Lutu` for a precise lookup and still returns all 12 family
sentences for *"parle-moi de la famille"*. Do not replace it with a fixed threshold.

---

## Correction flow

```
User flags AI error → corrections table (status: pending, with optional `tester_name` + `session_id`)
→ Professor reviews at /admin.html
  → Professor edits correct_french, correct_lingala, example_sentence directly in the card if needed
→ Approve → inserts into parallel_sentences (quality: verified) + status: approved + professor_modified: true/false + reviewed_at: now()
→ Reject → status: rejected + reviewed_at: now()
```

**Monitoring query** — % of corrections the professor had to fix:
```sql
SELECT
  COUNT(*) FILTER (WHERE professor_modified = true) AS edited,
  COUNT(*) AS total,
  CASE WHEN COUNT(*) = 0 THEN NULL
       ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE professor_modified = true) / COUNT(*), 1)
  END AS pct_edited
FROM corrections WHERE status = 'approved';
```

**Monitoring query** — professor review pace (see `sql/corrections_reviewed_at.sql` for full queries):
```sql
SELECT
  DATE(reviewed_at) AS day,
  COUNT(*) AS reviewed,
  ROUND(EXTRACT(EPOCH FROM (MAX(reviewed_at) - MIN(reviewed_at))) / NULLIF(COUNT(*) - 1, 0)) AS avg_seconds_between
FROM corrections
WHERE reviewed_at IS NOT NULL
GROUP BY day ORDER BY day DESC;
```

---

## Environment variables

**Vercel**:
- `SUPABASE_SERVICE_KEY` — server-only `sb_secret_...` key for admin writes, quotas, RAG and lesson-context RPC calls. `api/_supabase.js` sends opaque keys as `apikey` only; never as a bearer token
- `ADMIN_PASSWORD` — password for admin.html
- `OPENAI_API_KEY` — OpenAI API key for `/api/chat.js`, `/api/rag-context.js`, and `/api/lesson-context.js`
- `MMS_SPACE_URL` — base URL of the HuggingFace Space, e.g. `https://kemz42-monoko-lingala-tts.hf.space` (used only by warm-up ping in `api/mms-tts.js`; client calls Space directly)

**Cloudflare R2 audio details**:
- Bucket: `audios`
- Public base URL: `https://pub-78d23bf07fce46b3adc19df91148ffb8.r2.dev`
- Object layout:
  - `Lingala/senses/<letter>/<file>.mp3`
  - `Lingala/examples/<letter>/<file>.mp3`

---

## Test harness (added 2026-07-09)

A second Supabase project, `monoko-test` (ref `bdejouumyzovfirqxmdr`), exists
solely for automated testing. **No script in this repo ever touches
production** — `scripts/sync_test_schema.js` and `scripts/seed_test_data.js`
both hard-refuse to run unless pointed at that exact test project ref.

- Credentials live in `.env.test` (gitignored) — copy `.env.test.example`
  and fill in real values, or ask for them.
- `npm test` — Vitest, **317 tests, no network calls, fully mocked**. Covers
  every `api/*.js` handler plus the exercise engine: the tokenizer, the
  exercise builders, the audio hand-off and the progression maths (SM-2,
  streaks, medals, levels). Engine tests slice the code out of
  `index.html` and evaluate it, so they run against the source the browser runs.
  See `tests/README.md`.
- `npm run verify` — secret/RLS/API guardrails, all Vitest tests, then the
  production esbuild. The build parses the whole JSX block and fails before a
  stray bracket can ship a blank page.
- **`npm run verify` is NOT the full gate.** `.github/workflows/ci.yml` runs it
  *and then* `npm run test:browser`, and nothing in verify opens a browser. The
  order to run before pushing to `main` is:
  ```
  npm run verify && npm run test:browser
  ```
  Skipping the second is how the landing rework of 2026-09-05 went red on CI:
  `landing.spec.js` asserted on a section that had been deleted, and verify was
  green throughout. **After any change to `index.html` or `monoko-ui.css`, run
  the browser gate** — it takes about five seconds — and when deleting a UI
  section, grep `tests/smoke/` for its class names first.
- `npm run test:browser` — Chromium smoke tests against the compiled `dist/`
  artifact at desktop, 390px and 320px. Authenticated coverage uses monoko-test
  credentials only. The separate `authenticated-smoke` CI job runs the complete
  desktop authenticated spec against the locally built commit on pull requests
  and pushes to `main`. Missing secrets may skip a pull-request run, but fail a
  `main` push: production changes cannot report a green gate with no authenticated
  coverage.
- `npm run verify:security:test` — trusted session receipt, direct-XP denial,
  private corrections, fixed country and durable quota against monoko-test.
- `npm run verify:progression` — the Slice 7 write path end to end against
  monoko-test, **as the test user with a real session token**, so it exercises
  RLS rather than bypassing it with the service key. Catches what unit tests
  structurally cannot: a column the code writes that the schema lacks (one
  unknown column makes PostgREST reject the whole row), an `on_conflict` target
  it cannot infer (409), a type that will not round-trip, and a policy missing
  its `WITH CHECK`. Creates and deletes its own fixtures. 20/20 as of
  2026-08-22.
- **`npm run db:sync-test-schema` applies `sql/test_schema.sql` and then the
  real migration files**, the same ones run against production — never a copy
  of their DDL, which would fork and then drift. Add any new structural
  migration to that script's `FILES` list. Data and pgvector migrations are
  deliberately excluded.
- `npm run db:sync-test-schema` / `npm run db:seed-test` — set up or reset
  the test project's schema and data. Both are safe to re-run any time.
- `node scripts/release_browser_check.mjs` — with `.env.test`, a local Vercel
  server and Chrome CDP port 9230, signs in as the real test learner and checks
  home, weekly ranking, continuous trail, lesson preview/Aller plus loin,
  ordinary gifts, automatic medal ceremony, real Grand défi handoff, confetti,
  culture modal and horizontal overflow at desktop/390/320px.
- **Never complete a public `auth.signUp()` against the test project.** Supabase
  sends a confirmation email to whatever address is used, and a fake one bounces
  — enough of them and the project's email sending gets restricted (this
  happened on 2026-08-23). Create users the way `scripts/seed_test_data.js`
  does: `POST /auth/v1/admin/users` with `email_confirm: true`, which creates a
  confirmed user and sends nothing. Signup *form* logic can still be tested in
  the browser as long as the assertion stops on a path that returns before
  `signUp()` is called — the taken-pseudonym refusal does — and the
  accept path is asserted against `pseudonym_available()` directly.
- **Do not assert on `document.body.textContent` in this app.** `index.html`
  carries its React source in an inline `<script type="text/babel">`, and that
  source is part of `body.textContent`, so any assertion on a user-facing string
  also matches the code that produces it. Two checks passed this way while the
  feature underneath was broken. Assert against the rendered element.
- Full spec and session-by-session status: `HARNESS_SPRINT.md`. This runs
  before Phase 3 feature work and is a hard prerequisite for Phase 3.5
  (Stripe, quotas, rate limiting) per `PHASE3_LAUNCH_PLAN.md`.

---

## Authentication (added 2026-04-10)

Supabase Auth v2 is integrated into `index.html`. Dictionary is fully public; courses and chat require a logged-in account.

**How it works:**
- Supabase JS SDK loaded via CDN: `@supabase/supabase-js@2`
- `supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)` initialized at app load
- Auth state managed via `onAuthStateChange` listener — `currentUser` React state always reflects live session
- `testerName` auto-populated from `user_metadata.display_name` or `email` on login (no manual tester setup needed)
- `requireAuth(returnTo)` redirects to auth view with a return destination ("courses" or "chat")
- After login/signup, user is sent back to their intended destination

**Auth view (`view === "auth"`):**
- Login / signup toggle
- Email + password fields
- Display name field (signup only)
- Error display
- On success: redirects to `authReturnTo` or home

**Gated screens:**
- Courses (`view === "courses"`) — requires login
- Chat (`view === "chat"`) — requires login
- Dictionary, search, browse — fully public

**Chat header:**
- "Session testeur / Modifier" card replaced with logged-in user name + "Déconnexion" button

**Future auth work needed:**
- Role field for professor/admin access (replaces shared admin password)

---

## Important conventions

- `index.html` uses the **anon key** for public content and authenticated own-row reads; correction submissions go through `/api/corrections`
- All correction reads and admin writes go through `/api/admin-action.js` (service key never in client code)
- **Competitive progress writes are RPC-only.** `record_learning_session` and `record_level_challenge_session` validate and derive attempts, scores, XP, streak and completion atomically; browser roles have read-only own-row policies
- All **LLM and paid voice calls** go through authenticated Vercel APIs with durable per-account quotas (provider keys never enter client code)
- Dictionary is public; courses + chat require Supabase Auth login
- `testerName` is now auto-populated from the authenticated user — manual tester setup flow is bypassed for logged-in users
- `session_id` is still generated locally and reused for that browser session
- `admin.html` password is verified **server-side** only — no password logic in client code, no secrets in `admin.html`
- Lingala dictionary audio is now linked through `senses.audio_url` and `examples.audio_url`
- Lingala course audio is now linked directly through `lesson_items.audio_url` and `lesson_items.example_audio_url`
- `index.html` `WordDetail` renders audio buttons only when an audio URL exists
- The LLM system prompt allows best-guess translations when words are absent from the corpus (changed 2026-04-02) — the model uses its own Lingala knowledge to fill gaps rather than refusing
- `monoko_auto_test.py` inserts corrections with `tester_name='auto_test_script'` — use this to filter/delete auto-generated corrections in Supabase if needed
- **Vercel env vars**: `SUPABASE_SERVICE_KEY` must be set on the correct Vercel project (monoko, not anthony's project) and for the Production environment
- **New Supabase API key** (legacy keys disabled 2026-04-02): `sb_secret_*** (see Vercel env vars or ask Anthony)` — update this in Vercel env vars

## Lingala curriculum restructure (2026-04-06)

The old 4-course flat structure (courses id=22,23,24,25) was migrated to a CEFR-aligned 6-level curriculum.

**New structure:**
- 6 courses (levels A1→B2+), 29 modules, ~948 lesson_items
  *(now **49 lessons / 1,346 items** — the July 2026 restructure split mega-lessons
  into focused ones, so a curriculum module no longer maps 1:1 to a DB lesson;
  `MONOKO_CURRICULUM.md` describes 31 modules)*
- Migration script: `Cours/lingala_curriculum_migration.sql`
- Old courses (22,23,24,25) still exist — **delete only after verifying new structure in app and re-embedding**

**Audio preservation:**
- Step 4 in migration SQL copies audio from old items to new items by `french + dialect` match
- Step 4b copies audio from `senses` and `examples` tables for new dictionary-sourced items
- Audio coverage after migration: ~89% overall (some modules 100%, stubs 0%)

**Post-migration completed (2026-04-07):**
1. ✅ `embed_lesson_items.py` run — new lesson_items embedded
2. ✅ Chat verified working with new course content
3. ✅ Old courses deleted: `DELETE FROM courses WHERE id IN (22, 23, 24, 25);`
4. ✅ Vercel `SUPABASE_SERVICE_KEY` updated to new key `sb_secret_*** (see Vercel env vars or ask Anthony)`

**Audio collection for missing items (2026-04-07):**
- Generated 23 HTML recording apps in `audio_collection_html/` — one per module with missing audio
- Stub modules (8 modules with placeholder content) were populated with suggested French content via `populate_stub_modules.py`
- Proverbes et expressions idiomatiques (4.3) left entirely to the professor
- Workflow: professor opens HTML in browser → fills in Lingala (where empty) → records audio → exports ZIP → sends back
- After receiving ZIPs: upload audio to R2, update `lesson_items.audio_url` in Supabase

**Module audio coverage (verified post-migration):**

| Module | Items | With audio |
|--------|-------|-----------|
| Pronoms et possessifs | 12 | 12 (100%) |
| Famille | 14 | 14 (100%) |
| Maison et objets | 36 | 36 (100%) |
| Travail et métiers | 25 | 25 (100%) |
| Marché et argent | 11 | 11 (100%) |
| Ville et lieux | 29 | 29 (100%) |
| Chiffres/jours | 92 | 90 (98%) |
| Nature et animaux | 75 | 73 (97%) |
| Cuisine | 66 | 65 (98%) |
| Salutations | 41 | 36 (88%) |
| Construction 2 | 237 | 209 (88%) |
| Présentation | 33 | 27 (82%) |
| Manger et boire | 24 | 18 (75%) |
| Corps et santé | 50 | 38 (76%) |
| Construction 1 | 62 | 52 (84%) |
| Déplacements | 23 | 18 (78%) |
| Conjugaison passé | 18 | 11 (61%) |
| Sentiments | 30 | 20 (67%) |
| Débats et opinions | 22 | 13 (59%) |
| Langue dans le monde | 6 | 2 (33%) |
| Stubs (8 modules) | 3-20 | 0 (professor needed) |

---

## Generic course template system (2026-04-10)

`generate_course_templates.py` produces a complete set of HTML recording apps for any new language, based on the 6-level CEFR curriculum.

**How it works:**
- Queries all Lingala `lesson_items` to get the French curriculum content (1,076 items across 29 modules)
- Strips all dialect translations → empty fields for the professor to fill in
- Sets `db_id = null` (language-agnostic; linked to Supabase after upload)
- Generates one HTML file per module following the same recording app format

**Output:** `../professor_tools/templates/general/` (relative to repo root — updated 2026-04-14, was previously a hardcoded absolute path)

**Usage:**
```bash
# Generic template (language shown as "[Langue]")
SUPABASE_SERVICE_KEY=sb_secret_... python3 generate_course_templates.py

# Language-specific (replaces [Langue] with the language name)
SUPABASE_SERVICE_KEY=sb_secret_... python3 generate_course_templates.py --language Yoruba

# Custom output directory
SUPABASE_SERVICE_KEY=sb_secret_... python3 generate_course_templates.py --language Yoruba --output /path/to/output
```

**Output files (29 total):** `Monoko_[langue]_1.1_sons_et_alphabet.html` … `Monoko_[langue]_6.4_la_langue_dans_le_monde.html`

**Differences vs `generate_audio_collection_html.py`:**
| | `generate_audio_collection_html.py` | `generate_course_templates.py` |
|---|---|---|
| Purpose | Lingala items **missing audio** | All items, **any language** |
| Dialect fields | Pre-filled from DB | Empty (professor writes) |
| `db_id` | Real Supabase ID | `null` |
| Output | `audio_collection_html/` | `../professor_tools/templates/general/` |
| Language | Always Lingala | Configurable via `--language` |

**Modules under curriculum target** (thin Lingala content, professor should expand):
- 4.1 Marché et argent — 11 items (target: 30-40)
- 3.3/3.4 Conjugaison — 18 items each (target: 40-60)
- 4.3 Proverbes — 3 items (requires native speaker input)
- 6.4 Langue dans le monde — 6 items (target: 20-30)

Re-run the script after adding content to Lingala to pick up new items automatically.

---

## Lingala audio status

Completed on `2026-03-15`.

- `5,265` local audio files parsed from the final Lingala workbook/audio package
- `5,209` exact matches found against live Lingala DB rows
- `5,209` R2 audio objects uploaded under `audios/Lingala/...`
- `2,616` `senses` rows linked with `audio_url`
- `2,593` `examples` rows linked with `audio_url`
- `56` files remain unmatched
- `6` files point to blank workbook cells

Artifacts and scripts:
- `lingala_audio_manifest.py`
- `upload_lingala_audio_to_r2.py`
- `LINGALA_AUDIO_WORKFLOW.md`
- `artifacts/lingala_audio/`

Course audio completed on `2026-03-16`.

- `1,251` Lingala course audio files matched to live course lesson rows
- `830` `lesson_items` rows updated with direct course audio columns
- course audio now lives in Supabase on `lesson_items`
- the temporary static `course_audio_map.json` fallback was removed from the frontend

Artifacts and scripts:
- `course_audio_mapper.py`
- `apply_course_audio_to_lesson_items.py`

## User progress tracking (added 2026-04-14)

Phase 2 of the product roadmap. Users can now track their advancement through the CEFR curriculum.

**Database** (`sql/progress_tracking.sql`, hardened by `sql/security_hardening.sql`):
- `profiles (user_id PK, display_name, preferred_language_id, created_at)` — one row per auth user
- `user_progress (id, user_id, lesson_id, language_id, completed_at, exam_score)` — one row per completed lesson per user; `UNIQUE(user_id, lesson_id)` prevents duplicates
- Profiles remain own-row read/write. Progress is own-row read only; trusted
  progression RPCs create completion rows after a validated 80% Pratiquer pass
- `exam_score` is retained but unused; the old exam system was dropped

**Frontend mechanics:**
- `loadUserProgress(userId, languageId)` — called automatically via `useEffect` whenever the logged-in user or active language changes; populates `userProgress` state (a `Set` of completed lesson IDs)
- `record_learning_session` — called once at session end with the attempt ledger;
  the database computes score and XP and records completion transactionally
- `resumeLesson()` — called from the "Continuer" home card; navigates directly to the last opened lesson using `courseId`+`lessonId` stored in `localStorage`
- Last opened lesson is persisted to `localStorage` key `monoko_last_lesson` every time a lesson is opened

**What's visible in the UI:**
- **Home screen**: Dark green "Continuer ▶" card shows the last visited lesson (logged-in users only, same language)
- **Level list**: Each level card shows `X/Y` completed modules + a mini progress bar (purple → green when level complete)
- **Module list**: Completed lesson rows show a green `✓` instead of the step number
- **Course trail**: passing Pratiquer unlocks the next lesson; completing a niveau
  awards its medal and opens the optional Grand défi

---

## Live Translation + Lingala TTS (added 2026-04-22)

The "Traduction en direct" view streams microphone input through speech recognition, translates segments via the AI chat pipeline, and plays back Lingala audio using a custom HuggingFace Space.

### Architecture

```
Microphone → Web Speech API (STT, browser built-in)
          → segment translation via /api/chat.js (OpenAI gpt-4o-mini)
          → Lingala audio: lingalaTTS() → HuggingFace Space (ESPnet2 VITS)
          → French audio: Web Speech API SpeechSynthesisUtterance (browser built-in)
```

### HuggingFace Space

- **Space**: `Kemz42/monoko-lingala-tts` → `https://kemz42-monoko-lingala-tts.hf.space`
- **Model**: `DigitalUmuganda/lingala_vits_tts` (ESPnet2 VITS, trained on 71.6h real Lingala speech)
- **Source**: `tts_space/app.py` in this repo — edit there, then copy to Space UI (Files tab → Edit → Commit)
- **SDK**: Gradio 6.13.0, Python 3.10

### How `lingalaTTS()` works (index.html)

The client calls the Space **directly** (not via Vercel) because ESPnet2 CPU inference takes 20-40s, far beyond Vercel's 10s free-plan timeout.

1. `POST https://kemz42-monoko-lingala-tts.hf.space/gradio_api/call/synthesise` → returns `{ event_id }`
2. `GET .../gradio_api/call/synthesise/{event_id}` → SSE stream, read with `getReader()` (never `.text()` — Gradio 6.x keeps the connection open)
3. Wait for `event: complete` in the stream (Gradio 6.x; older versions send `process_completed`)
4. Parse the `data:` line that follows — it's a JSON array `[{"path": "...", "url": "https://..."}]`
5. Use the `url` field directly (already absolute) or prepend `/gradio_api/file=` if only a path

### Mobile mic persistence (`liveStreamRef` pattern)

`liveStreamRef = useRef(null)` holds the `MediaStream` for the entire `LiveTranslationView` lifetime. Both `startLingalaSTT` and `startFrenchSTT` reuse it — `getUserMedia` is only called when `liveStreamRef.current` is null or has ended tracks. Tracks are only stopped in the component's unmount `useEffect`. `stopAmplitudeLoop()` does **not** stop any tracks. This prevents iOS/Android from re-prompting on every stop/restart cycle.

### Chat Lingala TTS (`chatAudioCache` pattern)

`const chatAudioCache = {}` at module level caches synthesised Lingala audio URLs keyed by fragment text. `extractLingalaFragments(text)` regex-parses Lingala from assistant responses (after `→`, in backticks, in quotes). `playChatLingala(msgIdx)` calls `lingalaTTS` sequentially on all fragments, using the cache to skip already-synthesised text. The 🔊 button on assistant messages triggers this; only visible when fragments are found and `!chatLoading`.

### Key gotchas (hard-won)

| Issue | Root cause | Fix |
|---|---|---|
| `facebook/mms-tts-lin` 404 | Lingala is in MMS ASR only, not TTS | Use DigitalUmuganda VITS instead |
| ESPnet2 not on PyPI | `espnet` on PyPI is a stub; `espnet2` doesn't exist as a package | `git+https://github.com/espnet/espnet.git` in requirements.txt |
| `allow_flagging="never"` error | Parameter removed in Gradio 6.x | Remove from `gr.Interface()` |
| Space 404 on `/call/synthesise` | Gradio 6.x moved to `/gradio_api/call/` prefix | Use `/gradio_api/call/synthesise` |
| `{"error": null}` from Space | `demo.queue()` missing — required by Gradio 6.x event API | Add `demo.queue()` before launch |
| SSE `.text()` hangs forever | Gradio 6.x keeps SSE connection open indefinitely | Stream with `getReader()`, break on `event: complete` |
| `averaged_perceptron_tagger_eng` LookupError | Newer NLTK renamed the resource; `g2p_en` (used by ESPnet2 VITS) needs it | Add `nltk.download('averaged_perceptron_tagger_eng')` in `app.py` startup |
| SSE parser misses audio | Was checking for `process_completed` but Gradio 6.x sends `event: complete`; data is a raw JSON array, not `{output:{data:[]}}` | Check for both markers; parse array directly |
| French TTS silent | Chrome loads voices async | Listen to `voiceschanged` event before calling `speechSynthesis.speak()` |
| French TTS `cancel()` fires error | `cancel()` on new utterance triggers `onerror` on the previous one | Filter `e.error !== "canceled"` in the error handler |

### Updating the Space

The Space is a separate git repo on HuggingFace. Fastest update path:
1. Edit `tts_space/app.py` locally
2. Go to `https://huggingface.co/spaces/Kemz42/monoko-lingala-tts` → Files → `app.py` → Edit
3. Paste the updated content → Commit changes → Space rebuilds automatically (~2-3 min)

---

## Professor ZIP ingest + variant policy (2026-08-04)

All 39 returned recording ZIPs were ingested (they had been sitting unused —
no tooling existed for the recording-app export format). Lingala course content
is now **1,346 items across 50 lessons, 100% audio, no missing translations**.
(`Cours/MONOKO_CURRICULUM.md` describes **31 modules**; the July restructure split
several into multiple lessons, so modules and lessons are not 1:1.)

**Pipeline:** `ingest_professor_zips.py plan | upload | apply` — re-runnable,
rollback JSON before every write, artifacts in `artifacts/professor_ingest/`.

**Non-obvious rules — read before touching course audio again:**
- Recording apps export **WebM/Opus, which iOS Safari cannot decode**. Always
  transcode to MP3 before upload or the audio is silent on every iPhone.
- New course audio goes to `Lingala/lesson_items/<module>/`. The existing
  `Lingala/lesson_items/course_1..4/` is March workbook audio under the **deleted**
  22/23/24/25 course numbering with workbook-cell filenames (`2.C259.mp3`) —
  do not reuse those prefixes, they mean something else.
- **Always pass `--only <modules>` when re-running after a delivery is applied**,
  or every other module's content inserts a second time.
- A re-delivery (`upsert` mode) matches on French inside the target lesson and
  stamps object keys with the export date — reusing the key would overwrite the
  old object at a URL the DB still points to, and serve a stale cached copy.
- `embed_lesson_items.py` embeds only rows **missing** a vector by default; use
  `--force` after any text edit. `match_lesson_items` takes `p_language_id`.

**Variant policy:** when the professor gives several ways to say one thing, the
**course shows one**; the rest go to `parallel_sentences` with
`source='course_variant'`, so RAG knows them without cluttering the lesson.
202 alternatives live there now. Review via `make_variant_split_tool.py` →
`apply_variant_split.py`; see `ROADMAP.md` Phase 1 for the cut heuristics and the
slash trap (an unspaced `Bokoki/okoki` means he read every combination, and no
confidence score detects it).

## Current work: the exercise engine

**Read `EXERCISE_ENGINE_PLAN.md`.** That file holds the settled decisions, the
measured data, and the build slices. Short version:

- The course is content-complete but is still a **table with play buttons**. The
  practice loop is the gap between here and a sellable product.
- **Exams were dropped 2026-08-07** for continuous Duolingo-style points.
  Lessons advance sequentially on one trail. The approved free tier contains all
  of Niveau 1; trial/subscription access begins at Niveau 2. The canonical
  product contract is `FREE_TIER_AND_CONVERSION_PLAN.md`.
- **Corpus→lesson routing (2026-08-07)** took the course from 1,347 items to
  **5,923** across all 50 lessons, using the existing embeddings at cosine ≥ 0.55.
  Artifact: `artifacts/professor_ingest/corpus_routing.json`.
- **The dictionary has zero tone marks; the course has 31%.** Of 678 words in both,
  75 are never spelled the same. Rule: untoned and toned content must never appear
  in the same exercise.
- **Slice 0 is done (2026-08-10).** Cosine routing measured 77% precision and
  flat across similarity bands, so it was replaced by an LLM judge (96%) plus a
  reassignment pass for what the judge rejects (90%). Pool: **6,196 items** —
  1,347 native + 3,063 judge-approved + 1,786 reassigned, 4.6x the original.
- **Slice 1 is done (2026-08-10).** `lesson_pool` holds **6,196 rows** across all
  50 lessons (median 107), each tagged `tier` (native/approved/reassigned =
  100%/96%/90% precision), `orthography`, `token_count` and `effective_level`.
  Re-runnable via `populate_lesson_pool.py`; anon-key read verified.
- **Slices 2 and 3 are done (2026-08-10).** Session shell + match-pairs
  (`212ba5e`), choose-the-audio (`599ae7b`), audio prefetch (`eb55200`).

### The stage model (settled 2026-08-10) — read §2 of the plan

**Stage keys vs labels.** The code and DB say `pratiquer` / `elargir` — those
are in a CHECK constraint and in every `exercise_attempts` row already written,
so they never change. The learner sees **"Maîtriser la leçon"** and **"Aller
plus loin"** (renamed 2026-08-17). Labels live in one place, `STAGE_BRIEF`;
never hardcode a stage name in a screen.

A lesson is **three stages over two disjoint pools**:

| Stage | Material | Shape |
|---|---|---|
| Apprendre | the lesson page (exists) | the teach beat |
| **Pratiquer** | `tier = native` (100% precision) | finite, **80% to pass**, unlocks Élargir |
| **Élargir** | `approved` + `reassigned` | endless, replayable for best score |

Non-obvious rules that fall out of it:

- **A session is 20 questions, not 15 screens.** A match-pairs screen counts as
  5. Screens are unequal in time; questions are not, and question-counting makes
  variable screen sizes free.
- **Thin lessons repeat the item, not the session.** The same item may be tested
  in up to 3 *different formats*. 47/50 lessons then fill a full session from
  native content alone.
- **Routing error is not linguistic error.** Everything in `lesson_pool` is
  professor-verified; the 96%/90% tiers measure *lesson placement*, not Lingala
  correctness. A miss serves a correct off-topic sentence (~1.2 per session) —
  which is what makes endless Élargir acceptable.
- **`buildSession` takes a pool, never a `lesson_id`.** The topic hub, play
  button and placement session are all just different pools.
- **Free practice is useful, not punitive.** Pratiquer and eligible reviews are
  unlimited in Niveau 1; Élargir allows one complete session/day; speaking
  comparison is unlimited in free lessons. Never interrupt an active session,
  result or reward with a paywall.
- **Every format is universal except match-pairs**, which needs 5 items sharing
  orthography + shape band and excludes 12/50 lessons.
- **All six exercise types ship together in Slice 6.** Listen-and-type uses
  **character tiles, never a keyboard** — the pool needs 42 letters and 16 of them
  (`ɛ ɔ` and the toned vowels) cannot be typed on an iPhone French keyboard at all.
  Speaking is **record-and-compare** (no STT, so no WER dependency) and is excluded
  from the Pratiquer 80% gate because self-assessment cannot be scored.

- **Slice 4 is done (2026-08-17).** A session is now a budget of **20 questions**,
  not 15 screens: `questionCount()` prices a screen (match-pairs costs
  `pairs.length`, everything else 1), pair screens are **3–5**, XP is 10 a
  question, and `buildSession(items, level, count)` takes a **pool** — never a
  `lesson_id`. A per-session ledger keyed by **(item, format)** lets a thin lesson
  reuse an item in a different format, capped at 3 formats per item.
  `sql/exercise_progress.sql` adds `exercise_attempts` + `lesson_stage_state`.

- **Slice 5 is done (2026-08-17).** `startSession(stage)` filters the pool by
  tier — `native` for Pratiquer, `approved`+`reassigned` for Élargir — which
  fixes practice serving corpus rows the lesson never taught. Two buttons on the
  lesson screen, Élargir locked behind `pratiquer_passed`, 80% first-try to pass,
  `18/25 maîtrisés` counter, and a ⚑ Signaler flag on Élargir items that files
  into `corrections` with `correction_type = 'routing'`.
  `sql/exercise_progress.sql` **is applied**.

- **The tokenizer is done (2026-08-17)**, the first piece of Slice 6:
  `tokenize` / `tokenCount` / `characters` / `fold` / `sameWord` / `usableRow` at
  the top of the babel block, with 25 tests in `tests/tokenizer.test.js` (which
  slices the block out of `index.html` and evaluates it — the first `npm test`
  coverage of engine code, 144 tests total).

- **Tap-words-in-order shipped (2026-08-17)** — `word_order`, 3–9 tokens, one
  entry in `EXERCISE_SCREENS` plus a builder, shell untouched. It needs **no
  buckets**: only multi-item screens (match-pairs, choose-audio) must keep one
  orthography and shape band per screen. Full Pratiquer sessions went from 35
  lessons to **40**. 166 tests.

- **Fill-the-blank shipped (2026-08-17)** — `fill_blank`. One word ≥4 chars and
  unique in its sentence is replaced by an inline input; `sameWord` accepts it
  typed without accents, then the feedback shows the accented spelling. Audio
  plays only **after** the answer (the clip reads the missing word aloud). Full
  Pratiquer sessions: **43 of 49** lessons, and every lesson builds ≥10
  questions. 181 tests.

- **Listen-and-type shipped (2026-08-17)** — `listen_type`, character tiles only.
  Distractors come first from the **accent twins** of the answer's own letters
  (a bare `o` beside the required `ó`), which is what makes it a test of tone.
  Compared **exactly** — no `fold` here, unlike fill-the-blank: this exercise
  *is* the spelling. A space is never a tile; slots are grouped per word.
  47 of 49 lessons now build a full session, none below 15 questions (the audit
  randomises, so the thinnest lesson draws 15–16). 228 tests.
  The play button + waveform are now a shared **`ClipPlayer`**.

- **Selection is breadth-first (2026-08-17).** `selectionOrder` is the order
  every builder draws in: **unseen across sessions → unused in this session →
  better tier → longest ago → random**. `startSession` loads the learner's
  `exercise_attempts` for the lesson and passes them as `history`, so tapping
  "S'entraîner" again moves through the lesson instead of re-rolling. Measured on
  Les nombres (58 items): random plateaus at 87% coverage, history-led reaches
  100% in four sessions. Note breadth **outranks tier** — an unseen `reassigned`
  row goes before a seen `approved` one.

- **The briefing screen was rebuilt (2026-08-18).** Order on the screen is now
  stage chip → lesson title (largest) → description → stats → *Au programme* →
  Commencer: the learner came for the lesson, so the lesson is the biggest thing
  on it. **`Au programme` lists one line per exercise type actually in the built
  queue** — "5 paires à associer", "4 mots à écrire à l'oreille" — counted with
  `questionCount()` over the **built** queue, never from the budget constants, so
  a match-pairs screen reads as the 5 questions it is. Types absent are omitted.
  `PROGRAMME_LABELS` lives in the pure engine next to `plural()` precisely so a
  unit test and the corpus audit can both assert **every type `buildSession` can
  emit has a label** — an unlabelled type renders a blank line and no builder
  test would catch it. `plural(n, one, many)` is the single place that knows
  **French takes the singular after both 0 and 1**, and it joins number to unit
  with a non-break space, which is what stops "20questions" recurring.

- **Conjugation paradigms are back (2026-08-18), stored as a grid.** The first
  professor's Cours 2 workbook held a complete *ko linga* table — 5 tenses × 6
  persons — that never reached the app: it is a **matrix** (rows 259–264 are the
  persons, columns B–F the tenses) and the original migration read the sheet
  row-wise, so the whole grid fell out. 24 of the 30 forms have had his recording
  on R2 the whole time, addressed by the workbook cell they were cut from
  (`2.C259.mp3` = column C, row 259 = *Na lingaki*); the présent column was never
  recorded, so those six render with no play button.

  Rules that fall out of it, and that the next verb must respect:
  - **Store it as a grid, never as `lesson_items`.** A paradigm is addressed by
    (verb, tense, person) and flattening is exactly what lost it the first time.
  - **The French glosses are GENERATED from (tense, person), not copied.** The
    workbook's French has typos (`Tu aimess`, `Ils aimes`) and mislabels the
    passé progressif as a present. One regular verb, so generating cannot drift.
    **The Lingala is copied verbatim — it is his, and not ours to fix.**
  - **A lesson shows only the tenses it teaches** (`lesson_conjugation_tables.tenses`).
    L358 gets four, L359 gets `futur`, and **L393 futur proche gets nothing at
    all** — this paradigm has no futur proche column, and showing it the futur
    simple would teach the wrong tense on that page.
  - **The loader `select`s `*`, never the new column by name.** Naming a column a
    database has not migrated yet 400s, and a 400 there takes the table off the
    lesson page entirely. Undefined `tenses` reads as "all".
  - Rendered as **tense tabs**, not a 5×6 matrix — thirty cells do not fit 375px —
    and the table sits **above** the lesson's own rows.

- **A paradigm is match-pairs material (2026-08-18).** Six forms of one tense
  share an orthography, a shape band and a topic *by construction*, which is the
  homogeneity the bucket rules hunt for in ordinary sentences; the imparfait and
  futur sets are 1–2 tokens, the shape match-pairs is most starved of. The
  mirroring into `lesson_pool` is driven by **`lesson_conjugation_tables`** — the
  same link rows that decide what a lesson displays — so a lesson is never
  drilled on a tense it does not teach, and attaching the professor's next verb
  makes it exercise material with **no code change**. Orthography is decided per
  **verb**, not per form: one toned form makes the whole paradigm toned, because
  sniffing individual forms would label every legitimately toneless word
  "untoned". **`sql/lesson_pool_conjugation_source.sql` was applied 2026-08-18**
  — `lesson_pool`'s `source_table` CHECK predated `conjugation_forms` and
  rejected it outright (a 23514 violation, not a silent skip) — and
  `populate_conjugation_forms.py` then wrote **30 pool rows**, 24 to L358 and 6
  to L359, all `tier = native`, 24 of them with audio.

  **Only the imparfait and futur sets reach match-pairs**, and the reason is a
  cap on the *French* side: `pairsBuckets` filters `longestSide(r) <= 3`, so
  "Je suis en train d'aimer" and the other progressives are excluded, as is most
  of the présent ("J'aime / j'ai aimé"). They still feed the other five types.
  The effect where it counts: **L358 had zero viable match-pairs buckets before
  this and now has one** (every native row there that clears the cap is a
  conjugation form), and L359 went from one bucket sitting exactly at
  `PAIRS_MIN` to two. That is the shape the plan predicted these forms would
  fill.

- **Two bugs were hiding 181 example sentences the professor had already
  recorded (2026-08-18).** Nothing was added; they simply became visible.
  - `example_french` carries **two different things**: the row's example
    sentence, and — in a few older lessons — a section label like "Présent"
    repeated across the rows it heads. The rule telling them apart was "is any
    value repeated?", so two pronouns sharing one sentence flipped a whole lesson
    into grouped mode and turned its 29 examples into headings. A real label is
    now **short (≤24 chars), free of terminal punctuation, and heads ≥2 rows**.
    Four lessons changed, all four false positives; **no current lesson is
    grouped**, because the heuristic was written for a lesson shape the July
    restructure removed.
  - **Every niveau-1 lesson takes an earlier branch** — the "Phrases — Série 1 /
    Série 2" split — which rendered French and dialect only and had no example
    row at all, so the grouping fix never reached it. That branch keys off
    `course_order === 1`, not off the lesson's shape, so it also catches
    vocabulary lessons where the split is an arbitrary cut down a word list. It
    now renders the same example row the default table has. **50 sentences across
    5 lessons, 48 of them recorded.** The Série split itself is left alone —
    cosmetic, and changing it moves every niveau-1 lesson.

**Slice 6 is complete.** Record-and-compare speaking shipped 2026-08-18: no STT,
at most three prompts per session, recordings stay on-device, and self-ratings
are excluded from the 80% gate.

**Slice 7 is built (2026-08-18) — XP, medals, streaks, SM-2 and Élargir topic
levels.** `sql/progression.sql` **applied 2026-08-18**, RLS verified on both new
tables with the client's publishable key (rejected `42501`). Rules that matter:
- **SM-2 runs on both stages** (Élargir added 2026-08-20). It needs a finite
  item set with per-item state, and both are finite **per lesson** — median 25
  native items, median 80 routed. The 4,788-row figure that first ruled Élargir
  out counts the whole corpus across 49 lessons, which no learner ever meets.
  `review_schedule` needs no `stage` column: a pool item has exactly one tier,
  and `items` is tier-filtered before `due` is consulted. The grading signal
  is one bit, so ease moves +0.1/−0.2 with a **3.0 ceiling that is ours, not
  SM-2's** — a binary signal cannot justify runaway intervals. A miss sets
  `interval_days = 0`; the ladder floors at 1 day so `0 × ease` cannot strand
  a lapsed item as due-forever.
- **Due sits BELOW breadth in `selectionOrder`** (unseen → unused → due → tier
  → stalest). An unseen item has no schedule row and cannot be due, so putting
  SM-2 first would quietly undo the breadth-first coverage Slice 6 measured.
- **`buildSession`'s `production` argument is 0 for every Pratiquer session and
  for Élargir level 1**, and at 0 the arithmetic is exactly Slice 6's — that is
  what keeps the measured per-lesson session sizes true. Verify with the audit,
  not by eye.
- **Session-end writes are one trusted database transaction.** The browser sends
  attempts and scheduling state to `record_learning_session`; the function
  validates the session, derives score and bounded XP, and atomically updates
  attempts, scheduling, stage state, streak, XP and completion. Do not restore
  direct client writes to any competitive table.
- **Days are the learner's local days.** `last_day` and `due_on` are dates and
  the client sends its own `YYYY-MM-DD`. `now()::date` is UTC and would award a
  Montreal learner two streak days for one evening.

`EXERCISE_ENGINE_PLAN.md` **§4c is the executable task list**.
Read it before touching engine code.

**Verifying engine work:** `npm run verify` proves the page builds and covers the
builders on hand-made rows;
**`node scripts/audit_exercise_types.mjs`** checks every shipped type against the
live 6,196-row pool across all 50 lessons and both stages, and exits non-zero on
a violation. Run both. The audit is what found the `/` placeholder rows and the
947 rows whose stored `token_count` disagrees with the tokenizer.

**Tokenizer rules that other code must not re-invent:**
- **Never count words with `lesson_pool.token_count`** — it came from a bare
  whitespace split, and French puts a space before `?`, so `"Olingi kofanda ?"`
  reads as 3 there and is 2 real words. 947 of 6,196 rows disagree. Use
  `tokenCount()`; the column is a coarse index only.
- **`fold()`/`sameWord()` are for fill-the-blank only.** They ignore accents and
  map `ɛ→e`, `ɔ→o` (distinct letters, not accents — Unicode decomposition misses
  them) because 17.7% of blank-words are untypeable on an iPhone French keyboard.
  Listen-and-type must NOT use them: it tests transcription.
- **`usableRow()` before showing any row.** The dictionary writes `/` or `?` for
  a missing translation and 9 such rows are in the pool; `.trim()` lets them
  through because `"/"` is not empty.
- **Build listen-and-type tiles from tokens, not the raw string** — a "2-token"
  row with a gloss needs 35 tiles from the raw string, 22 max from tokens.

**Non-obvious rules the attempt log depends on:**
- `exercise_attempts.correct` is **first-try only**. Retry screens carry
  `retry: true` and record nothing — counting them would let the 80% gate be
  farmed by failing and then clearing the retry.
- Attempts batch into one insert at session end; an **abandoned** session still
  flushes (the mastery counter reads items ever answered right) but never moves
  the gate. Only a completed session can pass.
- `pratiquer_passed` is a **one-way door** — never cleared by a later weaker
  session.
- Every exercise item must carry `poolId` (`lesson_pool.id`). Without it an
  attempt cannot be written, and the item silently vanishes from the gate.
- **Thin lessons used to face a harsher gate** (80% of a 3-question session is
  3/3). Resolved: Slice 6's extra formats took full sessions to 43, and the last
  holdout was fixed as **content** — `sql/merge_ordinals_into_numbers.sql` folded
  L375 "Les nombres ordinaux" into L350, applied 2026-08-17. **All 49 lessons now
  build ≥10 questions**, so the harshest gate anywhere is 8/10. When a lesson
  cannot build a session, check whether the engine is pointing at a content
  problem before changing the engine.
- **Merging a lesson has two silent failure modes** — see that migration's
  header. Everything cascades from `lessons`, so the delete goes last; and
  `populate_lesson_pool.py` silently *skips* rows whose lesson id no longer
  exists, so it carries `LESSON_MERGES` to remap them.

**Audio prefetch gotcha:** R2 sends no `Access-Control-Allow-Origin` and 403s the
OPTIONS preflight, so `fetch()` cannot read audio clips from the browser — a blob
cache fails *silently* and streams on every tap. Prefetch uses
`<audio preload="auto">`, which is exempt from CORS. Setting `Cache-Control` +
CORS on the bucket would fix this at the source for dictionary audio too.

**Screen-boundary audio rule (fixed 2026-08-17).** There is **one** shared
`<audio>` element, so `playClip` stops whatever is already sounding. A screen
that autoplays on mount therefore cuts off the clip the previous screen was still
playing — that is what made the last match-pairs word come out as "Qu'est-ce que
vous entendez ?" instead of the professor's word. Two rules fell out of it, and
new exercise types in Slice 6 need both:

- **No exercise screen autoplays.** `ChooseAudioScreen` waits for its play
  button. Sound follows a tap, never a mount. This also sidesteps iOS entirely,
  where a fresh element cannot play without a gesture anyway.
- **No screen may hand over while a clip is sounding — ever, in any type.**
  Use **`afterClip(clip, onDone, floorMs)`**, never a bare `setTimeout`. It waits
  for `ended` with a duration-derived ceiling (an unloadable clip fires no event
  and would strand the session) and falls back to `floorMs` when nothing is
  playing. Pass `playingClip(url)` to wait on a clip you did not start.
  `tests/audio-handoff.test.js` covers this; keep it passing.

Related rule: **a clip belongs to the match, not to the tap.** Playback tied to
the Lingala tap meant a pair closed from the French tile played nothing at all.

**A lesson's exercise material may differ from its lesson page, and sometimes
must.** `lesson_items` is the teaching surface; `lesson_pool` is the exercise
surface. L346 "Sons et alphabet" is the case that proved it: its rows are a
teaching label plus a gloss (`'Consonne B — Maladie'`) and its clips read the
letter before the word, so **30 of 46 match-pairs were solvable by first letter
with no Lingala**, and choose-the-audio was given away by the clip. The lesson
page still shows the label and the letter-first clip; the pool now holds the
gloss and, where the dictionary has the word, its clean recording
(`populate_alphabet_pool.py`). **Only audio comes from the dictionary — never
the French**, which is often a different sense (`Mwǎsi` is *Femme* here and
*Fiancé(e)* there), and never `lingala`, because the dictionary is untoned and
this is the lesson that teaches tone.

**L346's audio is now cut from the course clips, not the dictionary** (2026-08-20).
Only 21 of its 46 words exist in the dictionary, so that source could never
cover the lesson. All 46 were cut from the professor's own letter-first clips
instead — one session, one voice, no level mismatch. `.env.r2` (gitignored,
mode 600) holds the R2 credentials the upload needs; **do not paste an R2
token into a chat again, and rotate any that has been.**

**Élargir needs a topic.** It means "everything else the course knows about this
topic", so a lesson that is not *about* a subject has nothing to widen into —
routing gave L346 *Musicien, Fourchette, "Cette meuf est joviale"*, plus seven
of its own words with the tone marks stripped (`Tólí` → `Toli`). Those rows are
deleted, and **the lesson screen hides Élargir when a lesson has no routed
material at all** rather than unlocking a stage that dead-ends on "pas assez de
contenu". The probe is a single-row read and fails towards showing the stage.
Note the toned/untoned rule is enforced *within a screen* by the orthography
bucket — nothing enforces it *across stages*, which is how this surfaced.

**Exercises play Lingala only — never French.** The French side of any exercise
is text. This is a product rule, not an accident of the data: French is the
prompt the learner already reads, and speaking it aloud would let a listening
question be answered without hearing the Lingala. Verified 2026-08-17 — all
4,668 clips reachable from `lesson_pool` sit under `Lingala/` on R2, and the
only French TTS in the app (`SpeechSynthesisUtterance`, `lang = "fr-FR"`) lives
in `LiveTranslationView` and must stay there. **Do not wire Web Speech into any
exercise screen** — the temptation lands in Slice 6 (listen-and-type, speaking).

## Deprioritised: fine-tune TTS on professor's voice

**Status**: unblocked 2026-08-04, **deprioritised 2026-08-07**. The professor's
voice already covers 100% of course items and ~2,600 dictionary examples; TTS only
speaks text he never recorded (chat replies, live translation). **STT fine-tuning
is now the more valuable of the two** — `api/elevenlabs-stt.js` documents 20–50%
WER on Lingala, which blocks the speaking exercise type. Measure real WER against
the 6,539 professor recordings before committing to either.

**Goal**: replace the current DigitalUmuganda speaker voice with the professor's voice, keeping the same Lingala phonetics. The Space, API, and frontend stay exactly as-is — only the model weights change.

**Why it will work:**
- Single speaker throughout (one professor, Borgeas studio)
- Already have ~3,400 sentence-level clips with transcriptions in DB:
  - `examples` with `audio_url`: 2,593 clips (~3.6h estimated)
  - `lesson_items` with `audio_url`: **1,346** clips (all of them, after the
    2026-08-04 ingest) — was 815
  - plus **203** single-utterance clips cut out of multi-variant recordings,
    listed with their transcripts in
    `artifacts/professor_ingest/variant_clips_for_tts.json`
  - Total: **~6h+** — comfortably above what fine-tuning a VITS checkpoint needs
- Transcriptions already paired in Supabase (`dialect` column) — no labelling needed
- Audio on Cloudflare R2 at `https://pub-78d23bf07fce46b3adc19df91148ffb8.r2.dev`

**Fine-tuning pipeline (to build once professor finishes):**

1. **Data prep script** (`prepare_tts_finetune.py` — to write):
   - Query Supabase for all `(audio_url, dialect)` pairs from `examples` + `lesson_items`
   - Download MP3s from R2
   - Convert to 22kHz mono WAV (ESPnet2 format)
   - Write `wav.scp` and `text` files in Kaldi/ESPnet2 format

2. **Fine-tune** on Google Colab A100 (free tier sufficient):
   - Start from `DigitalUmuganda/lingala_vits_tts` checkpoint
   - Run ESPnet2 VITS fine-tuning recipe
   - ~few hours on A100

3. **Deploy**: upload new `.pth` weights to `Kemz42/monoko-lingala-tts` Space, update `model_path` in `app.py`

**Trigger**: reached. The only outstanding professor item is one argot row flagged
for re-record (`artifacts/professor_ingest/rerecord.json`), which does not block
this work.

---

## Deploy

```bash
# Frontend + API (Vercel auto-deploys on push)
git add index.html admin.html api/
git commit -m "your message"
git push
```

## Full docs

See `TECHNICAL_DOCS.md` for complete architecture, schema, RAG pipeline details, and a step-by-step guide to adding a new language.
