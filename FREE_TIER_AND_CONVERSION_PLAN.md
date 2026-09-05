# Monɔkɔ — Free Tier and Conversion Plan

Last updated: 2026-08-25

Status: **approved product direction; implementation pending**. This file is the
source of truth for free access, trials, subscriptions, conversion UX and the
metrics used to refine them. Where an older document disagrees, this file wins.

## 1. Product promise

**Free learners can build a real Lingala foundation. Monoko Plus unlocks the
full journey, deeper practice and the highest-cost AI tools.**

The free tier must be useful enough to earn trust and establish a learning
habit. Conversion should happen after the learner has experienced progress and
received the full reward for it, never because an exercise was interrupted.

### Free-tier bill of rights

- The dictionary remains free, public and unlimited.
- An active lesson, exercise, result or reward ceremony is never interrupted by
  a paywall.
- Earned XP, streaks, medals, scores and course progress are never deleted when
  a trial or subscription ends.
- Pricing, renewal date and cancellation terms are shown before payment.
- A learner never loses previously promised free access retroactively without a
  deliberate product decision and clear communication.

## 2. Access matrix

| Capability | Public | Free account | Trial / Monoko Plus |
|---|---|---|---|
| Dictionary, search and audio | Unlimited | Unlimited | Unlimited |
| Course | Preview | **All of Niveau 1 — Fondations** | Niveaux 1–6 |
| Lesson order | — | Sequential within Niveau 1 | Sequential continuous trail |
| Maîtriser / Pratiquer | — | Unlimited in Niveau 1 | Unlimited everywhere |
| Review queue | — | Unlimited for learned free material | Unlimited everywhere |
| Aller plus loin / Élargir | — | **One complete session per day** in free content | Unlimited everywhere |
| Record and compare speaking | — | Unlimited in free lessons | Unlimited everywhere |
| Monoko AI chat | — | **10 learner messages per day** | Unlimited, subject to fair use |
| Live translation | — | **3 short translations per day** | Unlimited, subject to fair use |
| XP, streak and weekly ranking | — | Full access | Full access |
| Gifts and culture capsules | — | All rewards attached to Niveau 1 | All rewards |
| Niveau medals | — | First medal earnable | All medals |
| Grand défis | Preview | Locked beyond free boundary | Included |

Niveaux 2–6 stay visible so learners can understand the complete journey. A
locked node explains the requirement and opens the relevant upgrade screen; it
does not pretend that future content is unavailable or unfinished.

Developers keep the protected course simulator and bypass product entitlements
through `app_developers`. The bypass must never rely on a client-only flag.

## 3. Primary conversion journey

The main paywall occurs **after Niveau 1 is completed**:

1. The learner completes the final Niveau 1 lesson.
2. Monoko awards XP and plays the normal medal ceremony in full.
3. The completed trail and medal remain visible.
4. When the learner chooses **Entrer dans le Niveau 2**, show the upgrade screen.

The reward is never replaced by the paywall. Suggested French framing:

- Title: **Continuez vers la vie quotidienne**
- Primary action: **Essayer Monoko Plus pendant 7 jours**
- Secondary action: **Continuer gratuitement**

The secondary action returns to a useful free experience: dictionary, Niveau 1,
reviews, daily Élargir, chat and translation quotas. It must not be a dead end.

### Secondary upgrade moments

An upgrade prompt may also appear after the learner intentionally reaches a
premium boundary:

- the 10th daily AI chat message;
- an additional Élargir session after the daily free session;
- a fourth live translation in the same day;
- an explicit tap on a locked lesson, Grand défi or premium reward;
- the subscription area in Profile;
- an attempt to resume premium progress created during a previous trial.

Do not paywall the first lesson, interrupt an exercise, block a result, appear
during a reward, or repeat on ordinary navigation. A full-screen paywall should
appear at most once per app session unless the learner explicitly taps premium
content again.

## 4. Trial and subscription

### Trial

- Duration: **7 days of complete Monoko Plus access**.
- Trigger: offered at the first high-intent premium boundary, primarily entry to
  Niveau 2; never started automatically at signup.
- Initial checkout: collect a payment method transparently, show the exact
  renewal date and price, make cancellation straightforward, and send a reminder
  before renewal.
- Included: all levels, unlimited practice/Élargir/review, AI chat, live
  translation, Grand défis, rewards and culture capsules.

For analytics, a trial is **activated** only after the learner completes at
least two premium sessions on two separate days in Niveau 2 or above. Starting a
checkout is not meaningful product activation.

### Paid plan

Initial web pricing baseline:

- **$9.99 per month**
- **$59.99 per year**, visually recommended

Launch without a weekly plan, fake urgency or simultaneous personalized prices.
“Unlimited” AI features retain a server-side fair-use and abuse ceiling.

### Trial or subscription expiry

- Preserve every earned XP event, streak, medal, score and completed lesson.
- Keep the dictionary, Niveau 1 and eligible free reviews usable.
- Show completed premium lessons on the trail but lock premium re-entry.
- Resubscribing resumes exactly where the learner stopped.
- Distinguish voluntary cancellation from payment failure and support a short
  grace state for recoverable billing problems.

## 5. Entitlements and enforcement

Use server-authoritative access states rather than scattered UI booleans:

`public | free | trialing | active | grace | past_due | expired | developer`

The client may render from a cached entitlement for speed, but protected course
content, quotas and paid APIs must validate it server-side. Stripe webhooks are
the authority for billing state; webhook processing must be idempotent.

Daily usage limits use the learner's account and a documented reset boundary,
not local storage. Existing durable `api_usage_events` infrastructure should be
extended where suitable. Product quotas and burst rate limits are separate:
quota answers “is this included today?”, while rate limiting prevents bugs and
abuse.

Before the first Stripe checkout is enabled, publish Terms of Service and a
privacy policy suitable for the launch jurisdictions. Keep Stripe web-first;
mobile billing is a later Phase 5 decision.

## 6. Measurement contract

Every event includes `occurred_at`, authenticated `user_id` when available,
anonymous/session identifier when appropriate, `language_id`, app surface,
device class, country/cohort where legally and technically appropriate, and the
current entitlement state. Revenue events also include plan, price, currency
and trial duration.

Core events:

| Event | Meaning / key properties |
|---|---|
| `signup_completed` | Account creation succeeded; acquisition source |
| `first_lesson_started` | First real lesson began; lesson and level |
| `first_lesson_completed` | First lesson passed; elapsed days from signup |
| `first_gift_opened` | First trail reward claimed |
| `streak_day_2` | Learner returned and extended the streak |
| `niveau_1_completed` | Final free lesson and medal were completed |
| `paywall_viewed` | Trigger, surface, entitlement and paywall variant |
| `paywall_dismissed` | Trigger and time visible |
| `quota_reached` | Feature and configured limit; never raw feature content |
| `trial_started` | Checkout created a valid trial |
| `trial_activated` | Two premium sessions on two separate days |
| `trial_cancelled` | Cancellation timing and reason when voluntarily supplied |
| `subscription_started` | Paid entitlement began; plan and revenue fields |
| `subscription_renewed` | Successful renewal |
| `subscription_cancelled` | Cancellation timing and reason when supplied |

Do **not** send raw AI conversations, translations, learner answers, microphone
recordings, email addresses or other lesson content to product analytics. Use
IDs, counts, categories, durations and outcomes. Billing and security logs may
retain the minimum data independently required for their purpose.

### Initial funnel targets

These are directional launch thresholds, not promises:

| Funnel | Initial target |
|---|---:|
| Signup → first lesson completed | 60%+ |
| Niveau 1 started → completed | 25%+ |
| Niveau 2 paywall viewed → trial started | 10–20% |
| Trial started → paid | 25–40% |
| Signup → paid by day 35 | 3–5% |
| Paid retained after first month | 65%+ |

Segment the funnel by acquisition source, geography, device, trial activation,
and which quota or locked feature produced the paywall. Always report sample
size alongside a percentage.

## 7. Experiment sequence

Do not change the free boundary, price and trial duration at the same time. The
initial sequence is:

1. Launch the complete Niveau 1 free tier and 7-day trial.
2. Observe at least four weeks of organic cohorts and qualitative feedback.
3. If needed, compare 7-day and 14-day trials in sequential windows.
4. Test annual-plan presentation and messaging.
5. Test the one-session daily Élargir allowance.
6. Only then reconsider where the free course boundary belongs.

Record the dates, exact configuration, eligible cohorts and result of every
window. Small samples are directional; do not call a winner from noise.

## 8. Implementation order

1. Add entitlement/subscription storage and idempotent Stripe webhook handling.
2. Centralize server-side `canAccess` and quota decisions, including developer
   bypass and trial/grace states.
3. Instrument the baseline learning funnel before exposing a checkout.
4. Build the Niveau 2 paywall and smaller quota-reached prompts.
5. Add Stripe checkout, customer portal, renewal reminder and legal pages.
6. Cover free, trial, active, expired and developer paths in unit, database and
   Playwright tests on `monoko-test`.
7. Release to production, then begin the four-week organic observation window.

The launch decision log and phase sequencing remain in
`PHASE3_LAUNCH_PLAN.md`; exercise behavior remains in
`EXERCISE_ENGINE_PLAN.md`.
