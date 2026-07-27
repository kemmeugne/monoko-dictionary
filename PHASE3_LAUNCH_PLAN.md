# Monɔkɔ — Phase 3 → Launch Sequence

Last updated: 2026-07-06

Scope: what happens after Phase 1 (content) and Phase 2 (progress tracking ✅) — exam system, monetization, soft launch, and mobile wrap. Supersedes the high-level Phase 3/4/5 sketch in `ROADMAP.md`; read this file for the detailed sequence.

Strategic framing: launch Lingala-only, as a complete product, before adding other languages. The underserved Lingala-learner market (Congolese diaspora, heritage learners, NGO/missionary workers, partners of Lingala speakers) is the wedge — not a placeholder while waiting to "really" launch with 10 languages.

---

## Phase 3 — Exam system + Duolingo engagement mechanics

**Goal:** Turn the finished course content into a testable, habit-forming product.

**Build:**
- Per-level exam engine: written (40%) / listening (30%) / speaking (30%), 70% pass threshold — per `Cours/MONOKO_CURRICULUM.md` spec
- Speaking evaluation: ElevenLabs Scribe transcription → match % (levels 1–3) or LLM fluency/grammar scoring (levels 4–6)
- `exam_results` table (schema already spec'd in `ROADMAP.md`)
- **Streaks** — daily practice counter; the single biggest retention lever in Duolingo-style apps, cheap to build (just needs a "did the user do anything today" check)
- **Daily review queue** — SM-2 spaced repetition (already planned in `ROADMAP.md`), surfaced on home screen as "X items to review today"
- Streak counter — visible in-app counter is the priority; it delivers ~90% of the retention value pre-mobile. Web push/email streak reminders are **optional** at this stage (browser push has poor opt-in rates; email streak nudges tend to land in Promotions). Real streak notifications become native push once wrapped in Capacitor (Phase 5).

**Explicitly deferred:** leaderboards, hearts/lives. Both add complexity; hearts specifically frustrate casual users without a clear monetization upside at this stage.

---

## Phase 3.5 — Monetization layer

**Goal:** Turn the app into a business without touching what's already free.

**Tiers:**
- **Dictionary** — free, no ads, permanently. It's the SEO/goodwill engine, not a revenue line.
- **Free course tier** — Modules 1.1 and 1.2 only (sons et alphabet + salutations et politesse), full audio and exercises included. Short enough to create real paywall pressure without feeling like a bait-and-switch.
- **Free AI chat quota** — free/logged-in users get **10 AI chat messages per day**. The AI chat is the most differentiated feature (no competitor has a Lingala conversation partner); a small daily taste is the strongest conversion driver and costs almost nothing at gpt-4o-mini prices (~$0.001/message).
- **Paid tier** — "unlimited" AI chat, full course access (Module 1.3 onward), exams, speaking evaluation.

> Numbering note: free = modules **1.1 + 1.2**, paid starts at **module 1.3**. Keep this consistent with how `Cours/MONOKO_CURRICULUM.md` labels modules when implementing gating logic — do not mix "module 3" and "1.3".

**Pricing:** anchor at **$9.99/month and $59.99/year** (Stripe multi-currency — users will be in CAD, EUR, GBP). Launch with this single fixed price rather than showing different users different prices. Rationale: (1) a soft-launch audience of a few hundred won't reach statistical significance for true A/B testing; (2) diaspora communities talk to each other, so simultaneous different prices generate bad word-of-mouth. Adjust only in **sequential windows** (e.g. 2 weeks at price A, then price B) if conversion is off. Start higher rather than lower — it's easy to *lower* a price later (existing subscribers feel rewarded) and painful to *raise* one. Annual matters more than monthly: lower churn, cash upfront, "save 50%" sells itself.

**Build:**
- Stripe integration (web-first — zero platform tax vs. App Store/Play Store 30%)
- Paywall gating logic on course/chat views (extends the existing Supabase Auth gating already in place)
- Subscription state — new `subscriptions` table or extension of `profiles`
- **Server-side chat quota enforcement** — daily message count keyed on `user_id` + date (Supabase). Free tier: 10/day. Paid tier: advertised "unlimited" but with a silent fair-use ceiling of **100–150/day** (no real learner hits this; a scraper does). Never enforce quotas client-side — they're trivially bypassed.
- **Rate limiting on `/api/chat.js`** — max ~10 requests/minute per user, all tiers. Catches runaway frontend bugs and scripted abuse of the endpoint as a free gpt-4o-mini proxy.
- **OpenAI account hard spending limit** — set a hard monthly cap at ~2–3x expected spend, with an email alert at 50%. Caps worst-case damage from a bug or abuse to a known number instead of a surprise invoice.
- **ToS fair-use clause** — reserve the right to throttle abusive usage (covered by the Phase 3.5 legal gate below).

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
- Trial → paid conversion rate at each price point
- Day-7 / day-30 retention
- Funnel drop-off (signup → first lesson → paywall → checkout)
- Qualitative: testimonials, complaint patterns, feature requests
- **Free-tier completion vs. paywall churn** — how many users finish module 1.2 and then convert vs. churn at the paywall. If nearly everyone churns after 1.2, the free tier may be too short to build the habit; if conversion holds, leave it. Also watch how many free users exhaust the 10/day chat quota (high exhaustion = strong signal the chat is the conversion lever).

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
| 3 | Exam system + streaks + spaced repetition | None — can start once Phase 1 content lands |
| 3.5 | Stripe paywall, tiering, chat quota + rate limiting + spend cap | **Generator-tool ToS/privacy (Termly/iubenda) before checkout goes live** |
| 4 | Soft launch, web only, organic only | Legal gate cleared |
| 5 | Capacitor wrap, App Store/Play Store | Phase 4 pricing + retention validated, **plus lawyer-reviewed ToS/privacy before submission** |
| 6 | Scale, paid acquisition, language #2 | CAC/LTV known from Phase 4/5 |
