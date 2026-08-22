import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createMockReq, createMockRes } from "../fixtures/mockRes.js";

vi.mock("../../api/_rate-limit.js", () => ({
  checkRateLimit: vi.fn(() => true),
  getClientIp: vi.fn(() => "127.0.0.1"),
  setCorsHeaders: vi.fn(),
}));

import handler, { rankParticipants } from "../../api/leaderboard.js";

const profiles = [
  { user_id: "u1", public_pseudonym: "AnthonyK", country_code: "CA" },
  { user_id: "u2", public_pseudonym: "MwanaMboka", country_code: "CA" },
  { user_id: "u3", public_pseudonym: "LingalaParis", country_code: "FR" },
];
const events = [
  { user_id: "u1", xp: 200 }, { user_id: "u1", xp: 50 },
  { user_id: "u2", xp: 300 }, { user_id: "u3", xp: 500 },
];
const streaks = [
  { user_id: "u1", current_streak: 4 },
  { user_id: "u2", current_streak: 6 },
  { user_id: "u3", current_streak: 2 },
];

describe("rankParticipants", () => {
  it("ranks only the learner's selected country and exposes pseudonyms, not ids", () => {
    const result = rankParticipants(profiles, events, streaks, "u1", "country");
    expect(result.total).toBe(2);
    expect(result.current).toMatchObject({ rank: 2, pseudonym: "AnthonyK", xp: 250, me: true });
    expect(result.rows[0]).toMatchObject({ rank: 1, pseudonym: "MwanaMboka", xp: 300 });
    expect(result.rows[0]).not.toHaveProperty("userId");
  });

  it("uses all opted-in profiles for the world scope", () => {
    const result = rankParticipants(profiles, events, streaks, "u1", "world");
    expect(result.total).toBe(3);
    expect(result.rows.map(row => row.pseudonym)).toEqual(["LingalaParis", "MwanaMboka", "AnthonyK"]);
  });
});

describe("leaderboard handler", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_SERVICE_KEY", "service-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("requires an authenticated user", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    const req = createMockReq({ method: "GET", headers: {} });
    req.query = { language_id: "1", scope: "country" };
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it("returns a sanitized weekly ranking", async () => {
    global.fetch = vi.fn(async url => {
      if (url.includes("/auth/v1/user")) return { ok: true, status: 200, json: async () => ({ id: "u1" }) };
      if (url.includes("/profiles?")) return { ok: true, status: 200, json: async () => profiles };
      if (url.includes("/user_xp_events?")) return { ok: true, status: 200, json: async () => events };
      if (url.includes("/user_streak?")) return { ok: true, status: 200, json: async () => streaks };
      throw new Error(`Unexpected URL ${url}`);
    });
    const req = createMockReq({ method: "GET", headers: { authorization: "Bearer user-token" } });
    req.query = { language_id: "1", scope: "country" };
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.current).toMatchObject({ pseudonym: "AnthonyK", rank: 2 });
    expect(res.jsonBody.rows.every(row => !Object.hasOwn(row, "userId"))).toBe(true);
  });
});
