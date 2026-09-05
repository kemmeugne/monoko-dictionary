# Monɔkɔ — Phase 3 → Launch Sequence

Last updated: 2026-08-27

Scope: what happens after Phase 1 (content) and Phase 2 (progress tracking ✅) — exam system, monetization, soft launch, and mobile wrap. Supersedes the high-level Phase 3/4/5 sketch in `ROADMAP.md`; read this file for the detailed sequence.

Strategic framing: launch Lingala-only, as a complete product, before adding other languages. The underserved Lingala-learner market (Congolese diaspora, heritage learners, NGO/missionary workers, partners of Lingala speakers) is the wedge — not a placeholder while waiting to "really" launch with 10 languages.

---

## Phase 3 — Exercise engine + engagement mechanics

**Revised 2026-08-07. Full plan: `EXERCISE_ENGINE_PLAN.md`.**

**Goal:** Turn the finished course content into a playable, habit-forming product.

**Exams are dropped.** The earlier version of this phase specced a per-level exam
(written 40% / listening 30% / speaking 30%, 70% to pass, gating the next level)
plus an `exam_results` table. That is a large build whose job is gating rather
than engagement, and it trapped speaking practice inside a once-per-level event.
Replaced by continuous points on every exercise. Lessons advance sequentially
on one continuous trail; the approved monetization boundary comes after all of
Niveau 1. See `FREE_TIER_AND_CONVERSION_PLAN.md`.

**Status 2026-08-18: the practice loop is playable end to end.** A session is 20
questions; Pratiquer (the professor's own rows) certifies a lesson at 80%
first-try and unlocks Élargir (the routed corpus). Attempts, the gate and the
mastery counter persist, and repeat sessions sweep forward through unseen
material rather than re-rolling. **All six exercise types exist** —
match-pairs, choose-the-audio, tap-words-in-order, fill-the-blank,
listen-and-type and record-and-compare speaking — and 47 of 49 lessons build a
full session, none below 15 questions. Speaking is capped at three prompts,
keeps recordings on-device and does not affect the objective 80% gate.

**Slice 7 built 2026-08-18 — XP, medals (80/90/100), streaks, SM-2 and Élargir
topic levels.** The streak is one row per learner spanning every language, the
scheduler covers both stages (Élargir added 2026-08-20), and a perfect session
pays a flat 50 XP bonus.
`sql/progression.sql` is applied. The remaining Phase 3 work is now the approved
entitlement, quota and conversion layer rather than a blanket session cap.

**2026-08-18:** every session now opens on a briefing that names the lesson first
and lists what is actually in the queue ("5 paires à associer"), and the first
professor's complete *ko linga* conjugation paradigm — lost in the original
import, 24 of its 30 forms already recorded — now heads the conjugation lessons.
Those forms are also the course's best match-pairs material, and as of the same
day they **are** exercise material: the migration is applied and 30 forms are in
`lesson_pool`, which gave L358 the match-pairs bucket it never had. Two rendering
bugs were hiding **181 example sentences** that were in the database all along.

**Build:**
- ✅ **Session engine** — one question per screen, progress bar, live queue (wrong
  answers are re-asked in the same session), XP scoring, session summary
- **Six exercise types**, generated client-side from a `lesson_pool` table:
  match pairs, choose-the-audio, tap-words-in-order, fill-the-blank, and
  listen-and-type last. 3,500–6,500 usable items each.
- **"Pourquoi ?"** — a wrong answer offers the rule behind the question. Points at
  the lesson view initially, at an LLM-drafted professor-verified rule card later.
- **Guest play** — the first session runs without an account, progress in
  localStorage, migrated on signup. Strongest conversion lever for a game loop:
  people commit after they have felt it.
- **Streaks** — still the single biggest retention lever, and now trivial: "did
  the user finish any session today". Visible in-app counter is the priority;
  real push notifications arrive with Capacitor in Phase 5.
- **Daily review queue** — SM-2 spaced repetition, surfaced on home as "X items to
  review today". A review is just a session sourced from the queue.
- **Speaking** — an ordinary exercise type, built last and gated on a real WER
  measurement against the 6,539 professor recordings. See `EXERCISE_ENGINE_PLAN.md` §7.

**Content position:** corpus→lesson routing on 2026-08-07 took the course from
1,347 items to **5,923** across all 50 lessons, so there is enough material for a
learner not to see repeats.

**Pre-launch content gate — ON HOLD pending professor delivery (2026-08-27).**
The collection package in
`audio_collection_html/professor_corpus_completion_2026-08-27/` is complete and
has been browser-tested. It requests four native-example supplements and twelve
grammar rule cards; conjugation remains in its dedicated workflow. Launch does
not wait on the professor while product work continues, but launch approval does:
the returned ZIPs must be validated and ingested, `lesson_pool` rebuilt, and the
native exercise audit rerun before the gate is marked complete.

**Native pool cleanup (applied and verified 2026-08-27).** This is independent of the new
material still with the professor. `populate_lesson_pool.py` now preserves the
source lessons while excluding ten prompts that cannot produce one unambiguous
answer, replacing four repeated headwords with their recorded examples, and
normalizing five prompts without inventing Lingala. The production migration
`sql/native_content_cleanup.sql` is applied; `npm run audit:native-content`
passes across 1,373 native rows. Rebuilding the pool preserves the same policy.

**Still explicitly deferred:** leaderboards, hearts/lives. Hearts frustrate casual
users without a clear monetization upside at this stage.

---

## Phase 3.5 — Monetization layer

**Goal:** turn the app into a business while letting free learners build a real
Lingala foundation. The exact approved contract, conversion UX, metrics and
experiment order live in `FREE_TIER_AND_CONVERSION_PLAN.md`.

**Launch offer:**
- Public dictionary, permanently free and unlimited.
- Logged-in free tier: all of **Niveau 1 — Fondations**, unlimited Pratiquer and
  eligible reviews, one Élargir session/day, record-and-compare speaking in free
  lessons, 10 AI chat messages/day and 3 short live translations/day.
- Niveaux 2–6 remain visible but require a 7-day trial or Monoko Plus.
- Trial: seven days of complete access, offered at a high-intent boundary rather
  than automatically at signup.
- Monoko Plus: full continuous trail, unlimited learning loops and AI/live tools
  subject to fair use.

**Pricing baseline:** **$9.99/month and $59.99/year**, with annual recommended.
Launch with one transparent price, no weekly plan and no fake urgency. Change
price, trial duration and the free boundary only in separate sequential windows.

**Primary conversion moment:** play the final Niveau 1 reward and medal ceremony
in full. Show the paywall only when the learner then taps **Entrer dans le Niveau
2**. Never interrupt a lesson, result or reward.

**Build:**
- Stripe Checkout and Customer Portal, web-first.
- Server-authoritative entitlement states: `public | free | trialing | active |
  grace | past_due | expired | developer`.
- Idempotent Stripe webhooks and a protected developer bypass through
  `app_developers`.
- Server-side product quotas, separate burst rate limits and a provider spending
  cap. Extend durable `api_usage_events` where it fits rather than trusting the
  browser.
- Funnel instrumentation before checkout exposure, using the event contract in
  `FREE_TIER_AND_CONVERSION_PLAN.md`; analytics never contains raw conversations,
  translations, answers or recordings.
- Unit, database and Playwright coverage for free, trial, active, expired and
  developer paths on `monoko-test`.

**🔒 Gate — ToS + privacy policy required before this phase goes live:**
For the soft-launch/test phase, a generator tool (Termly, iubenda, Shopify's free generator, or similar) is sufficient — these produce GDPR/Quebec Law 25-aware ToS and privacy policies for free or a small fee, and are standard practice for solo founders launching pre-revenue. This does not block the engineering work above — that can run in parallel — but a generated policy must be published **before the first Stripe checkout is enabled**.

**Full lawyer review is deferred to Phase 5** (Capacitor wrap + App Store/Play Store submission) — that's when real revenue, App Store legal requirements, and higher user volume justify the $500–1500 lawyer-review expense. Don't pay for this during the test phase.

---

## Phase 4 — Soft launch (web only)

**Goal:** Learn, not scale. Validate pricing, retention, and funnel before spending anything on acquisition or wrapping mobile.

**What happens:**
- Paywall live via Stripe, legal gate cleared
- **Pricing validation** — launch at the fixed anchor ($9.99/mo, $59.99/yr). If conversion is off, test alternatives in **sequential windows only** (not simultaneous cohorts — see Phase 3.5 rationale). A lifetime option ($150–200) can be trialed later as a sequential window if there's demand from diehards.
- Distribution: 100% organic — Congolese Facebook groups, r/Lingala, r/languagelearning, WhatsApp diaspora groups, Montreal/Paris/Brussels Congolese associations and churches, African Studies departments
- **No ads, no video production** at this stage. Organic, phone-recorded content outperforms polished ads for niche-language audiences, and there isn't yet conversion data to make paid spend rational.

**What gets measured:**
- Signup → first lesson completion and Niveau 1 completion
- Niveau 2 paywall → trial start → trial activation → paid conversion
- Day-7/day-30 learner retention and paid first-month retention
- Quota exhaustion by feature and the conversion it produces
- Annual vs. monthly selection, renewal and cancellation
- Qualitative: testimonials, complaint patterns and feature requests

The initial directional thresholds, event names and segmentation contract live
in `FREE_TIER_AND_CONVERSION_PLAN.md`. Run at least four weeks of organic cohorts
before the first experiment and report sample sizes with every rate.

**Exit criteria:** a real, data-backed CAC-viable price point, and a retention curve that doesn't collapse before day 7. That's what justifies moving to mobile.

---

## Phase 5 — Mobile wrap (Capacitor) + store submission

**Goal:** Reach the audience Phase 4 validated, at scale.

**Build:**
- Capacitor wrap of the now-validated web app — should be weeks, not months, if mobile-first discipline was followed throughout (see the "Mobile-first design" rules already in `CLAUDE.md`)
- Native mic plugin for speaking exercises
- Offline lesson caching (connectivity is unreliable in target markets)
- Native push notifications for streaks
- App Store / Play Store submission — title as **"Monoko: Learn Lingala"** for ASO, not just "Monoko"

**🔒 Gate — Lawyer-reviewed ToS/privacy policy required before store submission:**
Upgrade from the Phase 3.5 generator-tool policy to a proper lawyer review (~$500–1500, one-time) before submitting to the App Store / Play Store. Real revenue and app-store legal requirements at this stage justify the expense in a way the soft-launch test phase didn't.

**Pricing carry-over decision:** whether mobile subscriptions eat the 30% Apple/Google tax, or funnel users to the web/Stripe subscription with the app checking entitlement only — decided based on what Phase 4 data shows about margin tolerance.

---

## Phase 6 — Scale

**Goal:** Grow beyond the soft-launch base once mobile is live.

- Only now consider paid acquisition — and only once CAC and LTV are known from Phase 4/5 data
- TikTok/Instagram organic content, diaspora creator partnerships — still the highest-leverage channel for a niche language
- Add language #2 (Yoruba — largest African language by speakers after Swahili/Arabic, large diaspora, currently underserved) using the existing template system (`generate_course_templates.py`)

---

## Sequence summary

| Phase | Focus | Blocking gate |
|---|---|---|
| 3 | Exercise engine + streaks + spaced repetition (exams dropped 2026-08-07) | Complete: six exercise types, stage split, progression and rewards are live |
| 3.5 | Entitlements, conversion analytics, Stripe, free quotas and trial | **Published ToS/privacy before checkout goes live** |
| 4 | Soft launch, web only, organic only | Legal gate cleared |
| 5 | Capacitor wrap, App Store/Play Store | Phase 4 pricing + retention validated, **plus lawyer-reviewed ToS/privacy before submission** |
| 6 | Scale, paid acquisition, language #2 | CAC/LTV known from Phase 4/5 |
