/**
 * Slice 7 — progression and retention.
 *
 * The scheduler, the streak and the level maths live inside index.html's
 * <script type="text/babel"> block, so as with the tokenizer and the builders
 * there is nothing to import: the marked section is sliced out and evaluated,
 * which means these tests run the exact source the browser runs.
 *
 * Two things here are worth more than the rest and are tested hardest:
 *
 *  - DAY ARITHMETIC. Streaks and due dates are the only place in the app where
 *    a date is a value rather than a timestamp, and every bug in that area is
 *    silent — a learner in a UTC-negative timezone losing a streak they kept
 *    generates a support message, not a stack trace.
 *  - THE 0-INTERVAL LAPSE. A missed item goes to interval 0, and multiplying
 *    that by an ease factor forever is the classic SM-2 implementation bug.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, "index.html"), "utf8");

const slice = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to);
  if (a < 0 || b < 0 || b <= a) {
    throw new Error(`progression markers not found: "${from}" .. "${to}" — did a section move?`);
  }
  return src.slice(a, b);
};

const {
  localDay, dayDiff, addDays,
  sm2, scheduleUpdates, dueItems,
  streakNext, streakDisplay,
  medalFor, MEDAL_TIERS,
  perfectBonus, PERFECT_BONUS_XP,
  elargirLevel, elargirLevelProgress, productionBias,
  ELARGIR_XP_PER_LEVEL, ELARGIR_MAX_LEVEL,
  SM2_START_EASE, SM2_MIN_EASE, SM2_MAX_EASE,
} = new Function(
  // scoreableAttempts lives in the engine block and scheduleUpdates depends on it.
  slice("const scoreableAttempts", "// French takes the singular") +
  slice("// ── Progression ─", "// ── Match-pairs screen ─") + `
  return { localDay, dayDiff, addDays, sm2, scheduleUpdates, dueItems,
           streakNext, streakDisplay, medalFor, MEDAL_TIERS,
           perfectBonus, PERFECT_BONUS_XP,
           elargirLevel, elargirLevelProgress, productionBias,
           ELARGIR_XP_PER_LEVEL, ELARGIR_MAX_LEVEL,
           SM2_START_EASE, SM2_MIN_EASE, SM2_MAX_EASE };`
)();

describe("day arithmetic — the learner's local day, never UTC", () => {
  it("localDay reads local getters, not toISOString", () => {
    // 23:30 on 3 March, local time whatever the runner's zone is. Built from
    // local components, so the answer is the 3rd in every timezone. Were this
    // toISOString().slice(0,10) it would read as the 4th anywhere west of UTC.
    const d = new Date(2026, 2, 3, 23, 30, 0);
    expect(localDay(d)).toBe("2026-03-03");
  });

  it("pads single-digit months and days", () => {
    expect(localDay(new Date(2026, 0, 5, 12, 0, 0))).toBe("2026-01-05");
  });

  it("dayDiff counts calendar days", () => {
    expect(dayDiff("2026-03-03", "2026-03-04")).toBe(1);
    expect(dayDiff("2026-03-03", "2026-03-03")).toBe(0);
    expect(dayDiff("2026-03-04", "2026-03-03")).toBe(-1);
    expect(dayDiff("2026-03-01", "2026-03-31")).toBe(30);
  });

  it("survives a daylight-saving boundary", () => {
    // North American DST forward: 8 March 2026. The local day is 23 hours long,
    // which is exactly the case that makes a local-time subtraction return 0.96
    // days and round to the wrong answer.
    expect(dayDiff("2026-03-08", "2026-03-09")).toBe(1);
    // ...and the autumn 25-hour day.
    expect(dayDiff("2026-11-01", "2026-11-02")).toBe(1);
  });

  it("crosses month and year boundaries", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");   // 2026 is not a leap year
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(dayDiff("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("addDays(0) is identity", () => {
    expect(addDays("2026-08-18", 0)).toBe("2026-08-18");
  });
});

describe("sm2 — binary-graded scheduling", () => {
  it("starts a new item at 1 day", () => {
    const r = sm2(undefined, true);
    expect(r).toEqual({ ease: 2.6, interval_days: 1, reps: 1 });
  });

  it("follows the 1 → 6 → ease ladder", () => {
    const a = sm2(undefined, true);                  // 1 day
    const b = sm2(a, true);                          // 6 days
    expect(b.interval_days).toBe(6);
    const c = sm2(b, true);                          // 6 * ease
    expect(c.reps).toBe(3);
    expect(c.interval_days).toBe(Math.round(6 * b.ease));
    expect(c.interval_days).toBeGreaterThan(6);
  });

  it("a miss resets reps and sends the item to interval 0 — due today", () => {
    const good = sm2(sm2(sm2(undefined, true), true), true);
    const bad = sm2(good, false);
    expect(bad.reps).toBe(0);
    expect(bad.interval_days).toBe(0);
    expect(bad.ease).toBeCloseTo(good.ease - 0.2, 5);
  });

  it("recovers from a lapse instead of multiplying zero forever", () => {
    // The classic SM-2 implementation bug: interval 0 * ease = 0, so a lapsed
    // item stays due today for the rest of time and crowds out the lesson.
    let s = sm2(undefined, false);
    expect(s.interval_days).toBe(0);
    s = sm2(s, true); expect(s.interval_days).toBe(1);
    s = sm2(s, true); expect(s.interval_days).toBe(6);
    s = sm2(s, true); expect(s.interval_days).toBeGreaterThanOrEqual(1);
  });

  it("never lets ease fall below the floor", () => {
    let s = { ease: SM2_START_EASE, interval_days: 0, reps: 0 };
    for (let i = 0; i < 40; i++) s = sm2(s, false);
    expect(s.ease).toBe(SM2_MIN_EASE);
  });

  it("caps ease so a binary signal cannot produce runaway intervals", () => {
    let s = undefined;
    for (let i = 0; i < 40; i++) s = sm2(s, true);
    expect(s.ease).toBe(SM2_MAX_EASE);
  });

  it("keeps ease free of floating-point dust", () => {
    // 2.5 + 0.1 is 2.6000000000000005 in IEEE 754, and that value would be
    // written to a real column and read back for the next multiplication.
    const r = sm2({ ease: 2.5, interval_days: 1, reps: 1 }, true);
    expect(r.ease).toBe(2.6);
    expect(String(r.ease)).toBe("2.6");
  });
});

describe("scheduleUpdates — folding a session's attempts into schedule rows", () => {
  const today = "2026-08-18";

  it("schedules one row per item answered", () => {
    const out = scheduleUpdates(
      [{ pool_item_id: 1, correct: true, format: "match_pairs" },
       { pool_item_id: 2, correct: false, format: "fill_blank" }],
      new Map(), today);
    expect(out.size).toBe(2);
    expect(out.get(1).due_on).toBe("2026-08-19");   // 1 day
    expect(out.get(2).due_on).toBe(today);          // a miss is due immediately
  });

  it("excludes speaking — a self-rating is not evidence of recall", () => {
    const out = scheduleUpdates(
      [{ pool_item_id: 7, correct: true, format: "speaking" }], new Map(), today);
    expect(out.size).toBe(0);
  });

  it("excludes retries, which are re-exposure of a known answer", () => {
    const out = scheduleUpdates(
      [{ pool_item_id: 7, correct: true, format: "match_pairs", scored: false }],
      new Map(), today);
    expect(out.size).toBe(0);
  });

  it("believes the first answer when an item appears twice in one session", () => {
    // A thin lesson may ask the same item in two formats. The second is warm —
    // the learner has just seen the answer — so only the first is taken cold.
    const out = scheduleUpdates(
      [{ pool_item_id: 3, correct: false, format: "match_pairs" },
       { pool_item_id: 3, correct: true,  format: "listen_type" }],
      new Map(), today);
    expect(out.size).toBe(1);
    expect(out.get(3).reps).toBe(0);          // the miss, not the later hit
    expect(out.get(3).due_on).toBe(today);
  });

  it("builds on the existing schedule row rather than restarting it", () => {
    const prior = new Map([[5, { ease: 2.6, interval_days: 6, reps: 2 }]]);
    const out = scheduleUpdates(
      [{ pool_item_id: 5, correct: true, format: "word_order" }], prior, today);
    expect(out.get(5).reps).toBe(3);
    expect(out.get(5).interval_days).toBe(Math.round(6 * 2.6));
  });

  it("ignores attempts with no pool id", () => {
    const out = scheduleUpdates(
      [{ pool_item_id: null, correct: true, format: "fill_blank" }], new Map(), today);
    expect(out.size).toBe(0);
  });
});

describe("dueItems — what the learner owes today", () => {
  it("includes items due today and overdue ones", () => {
    const schedule = new Map([
      [1, { due_on: "2026-08-18" }],   // today
      [2, { due_on: "2026-08-10" }],   // overdue while the learner was away
      [3, { due_on: "2026-08-25" }],   // not yet
    ]);
    const due = dueItems(schedule, "2026-08-18");
    expect([...due].sort()).toEqual([1, 2]);
  });

  it("treats a row with no due date as due", () => {
    // Defensive: a half-written row should surface for review rather than
    // disappear from the schedule forever.
    expect(dueItems(new Map([[9, {}]]), "2026-08-18").has(9)).toBe(true);
  });

  it("is empty for an empty or missing schedule", () => {
    expect(dueItems(new Map(), "2026-08-18").size).toBe(0);
    expect(dueItems(null, "2026-08-18").size).toBe(0);
  });
});

describe("streakNext", () => {
  it("starts at 1", () => {
    expect(streakNext(null, "2026-08-18"))
      .toEqual({ current_streak: 1, longest_streak: 1, last_day: "2026-08-18" });
  });

  it("increments on a consecutive day", () => {
    const r = streakNext({ current_streak: 4, longest_streak: 9, last_day: "2026-08-17" }, "2026-08-18");
    expect(r.current_streak).toBe(5);
    expect(r.longest_streak).toBe(9);
  });

  it("does not move on a second session the same day", () => {
    const prev = { current_streak: 4, longest_streak: 9, last_day: "2026-08-18" };
    expect(streakNext(prev, "2026-08-18")).toEqual(prev);
  });

  it("resets to 1 after a missed day, keeping the record", () => {
    const r = streakNext({ current_streak: 12, longest_streak: 12, last_day: "2026-08-15" }, "2026-08-18");
    expect(r.current_streak).toBe(1);
    expect(r.longest_streak).toBe(12);
  });

  it("raises the record when the current streak passes it", () => {
    const r = streakNext({ current_streak: 9, longest_streak: 9, last_day: "2026-08-17" }, "2026-08-18");
    expect(r.longest_streak).toBe(10);
  });

  it("never breaks a streak when the clock moves backwards", () => {
    // A flight west, or a device correcting its time, can make "today" earlier
    // than the last recorded day. That is not a new day and must not reset.
    const prev = { current_streak: 6, longest_streak: 6, last_day: "2026-08-18" };
    expect(streakNext(prev, "2026-08-17")).toEqual(prev);
  });

  it("survives a month boundary", () => {
    const r = streakNext({ current_streak: 3, longest_streak: 3, last_day: "2026-07-31" }, "2026-08-01");
    expect(r.current_streak).toBe(4);
  });
});

describe("streakDisplay — an already-broken streak reads as broken", () => {
  it("shows the streak on the day it was earned and the day after", () => {
    expect(streakDisplay({ current_streak: 5, last_day: "2026-08-18" }, "2026-08-18")).toBe(5);
    // Still alive: the learner can practise today and keep it.
    expect(streakDisplay({ current_streak: 5, last_day: "2026-08-17" }, "2026-08-18")).toBe(5);
  });

  it("shows 0 once a day has been missed, without waiting for the next session", () => {
    expect(streakDisplay({ current_streak: 5, last_day: "2026-08-16" }, "2026-08-18")).toBe(0);
  });

  it("shows 0 for a learner who has never finished a session", () => {
    expect(streakDisplay(null, "2026-08-18")).toBe(0);
    expect(streakDisplay({}, "2026-08-18")).toBe(0);
  });
});

describe("medals", () => {
  it("awards at 80 / 90 / 100", () => {
    expect(medalFor(100).key).toBe("or");
    expect(medalFor(95).key).toBe("argent");
    expect(medalFor(90).key).toBe("argent");
    expect(medalFor(85).key).toBe("bronze");
    expect(medalFor(80).key).toBe("bronze");
    expect(medalFor(79)).toBe(null);
    expect(medalFor(0)).toBe(null);
    expect(medalFor(undefined)).toBe(null);
  });

  it("bronze is the Pratiquer pass bar, so the two coincide", () => {
    const PASS_PCT = 80;   // mirrored from the engine; if it moves, this fails loudly
    expect(medalFor(PASS_PCT).key).toBe("bronze");
  });

  it("every tier has an icon and a label to render", () => {
    for (const m of MEDAL_TIERS) {
      expect(m.icon).toBeTruthy();
      expect(m.label).toBeTruthy();
    }
  });
});

describe("bonuses and Élargir levels", () => {
  it("pays the perfect bonus only at 100%", () => {
    expect(perfectBonus(100)).toBe(PERFECT_BONUS_XP);
    expect(perfectBonus(99)).toBe(0);
    expect(perfectBonus(0)).toBe(0);
  });

  it("levels up every ELARGIR_XP_PER_LEVEL and stops at the ceiling", () => {
    expect(elargirLevel(0)).toBe(1);
    expect(elargirLevel(ELARGIR_XP_PER_LEVEL - 1)).toBe(1);
    expect(elargirLevel(ELARGIR_XP_PER_LEVEL)).toBe(2);
    expect(elargirLevel(ELARGIR_XP_PER_LEVEL * 99)).toBe(ELARGIR_MAX_LEVEL);
  });

  it("treats missing or negative XP as level 1", () => {
    expect(elargirLevel(undefined)).toBe(1);
    expect(elargirLevel(-500)).toBe(1);
  });

  it("reports progress toward the next level, and a full bar at the ceiling", () => {
    const p = elargirLevelProgress(ELARGIR_XP_PER_LEVEL + 300);
    expect(p.into).toBe(300);
    expect(p.pct).toBe(50);
    expect(elargirLevelProgress(ELARGIR_XP_PER_LEVEL * 99).pct).toBe(100);
  });

  it("productionBias is 0 at level 1, so level 1 is exactly the shipped mix", () => {
    expect(productionBias(1)).toBe(0);
    expect(productionBias(ELARGIR_MAX_LEVEL)).toBe(1);
    expect(productionBias(undefined)).toBe(0);
  });

  it("productionBias rises monotonically and stays within 0..1", () => {
    let prev = -1;
    for (let l = 1; l <= ELARGIR_MAX_LEVEL; l++) {
      const b = productionBias(l);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
      expect(b).toBeGreaterThan(prev);
      prev = b;
    }
  });
});
