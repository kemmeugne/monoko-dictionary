import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockReq, createMockRes } from "../fixtures/mockRes.js";
import { jsonResponse, routeFetchByUrl } from "../fixtures/mockFetch.js";

vi.mock("../../api/_rate-limit.js", () => ({
  checkRateLimit: vi.fn(() => true),
  getClientIp: vi.fn(() => "1.2.3.4"),
  setCorsHeaders: vi.fn(),
}));
vi.mock("../../api/_auth.js", () => ({ authorizeApiRequest: vi.fn(async () => ({ id: "user-1" })) }));

const { checkRateLimit } = await import("../../api/_rate-limit.js");
const { default: handler, formatContext } = await import("../../api/lesson-context.js");

beforeEach(() => {
  checkRateLimit.mockReturnValue(true);
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
  vi.stubEnv("SUPABASE_SERVICE_KEY", "service-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("formatContext", () => {
  it("returns an empty string for no rows", () => {
    expect(formatContext([])).toBe("");
  });

  it("formats french -> dialect pairs and includes example lines when present", () => {
    const out = formatContext([
      { french: "Je", dialect: "Ngai", example_french: "Je veux manger", example_dialect: "Ngai nalingi kolia" },
      { french: "Tu", dialect: "Yo" },
    ]);
    expect(out).toContain("• Je → Ngai [cours vérifié]");
    expect(out).toContain("Ex: Je veux manger → Ngai nalingi kolia");
    expect(out).toContain("• Tu → Yo [cours vérifié]");
  });
});

function mockEmbedMatchAndExpand({ topMatches = [], fullLessonRows = [], embedOk = true, matchOk = true, expandOk = true } = {}) {
  return routeFetchByUrl([
    [
      "api.openai.com",
      async () =>
        embedOk
          ? jsonResponse({ data: [{ embedding: [0.1, 0.2] }] })
          : { ok: false, status: 500, text: async () => "embed failed" },
    ],
    [
      "rpc/match_lesson_items",
      async () =>
        matchOk
          ? jsonResponse(topMatches)
          : { ok: false, status: 500, text: async () => "rpc failed" },
    ],
    [
      "lesson_items?lesson_id=in",
      async () =>
        expandOk
          ? jsonResponse(fullLessonRows)
          : { ok: false, status: 500, text: async () => "expand failed" },
    ],
  ]);
}

describe("lesson-context handler", () => {
  it("responds 204 to OPTIONS", async () => {
    const req = createMockReq({ method: "OPTIONS" });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(204);
  });

  it("rejects non-POST with 405", async () => {
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it("returns 429 when rate limited", async () => {
    checkRateLimit.mockReturnValue(false);
    const req = createMockReq({ body: { query: "bonjour", language_id: 1 } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(429);
  });

  it("400s on missing query or language_id", async () => {
    const res = createMockRes();
    await handler(createMockReq({ body: { language_id: 1 } }), res);
    expect(res.statusCode).toBe(400);
  });

  it("400s when query exceeds 1000 chars", async () => {
    const req = createMockReq({ body: { query: "a".repeat(1001), language_id: 1 } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("500s when OPENAI_API_KEY is not configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const req = createMockReq({ body: { query: "bonjour", language_id: 1 } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
  });

  it("500s when SUPABASE_SERVICE_KEY is not configured", async () => {
    vi.stubEnv("SUPABASE_SERVICE_KEY", "");
    const req = createMockReq({ body: { query: "bonjour", language_id: 1 } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
  });

  it("500s when the Supabase RPC fails", async () => {
    global.fetch = vi.fn(mockEmbedMatchAndExpand({ matchOk: false }));
    const req = createMockReq({ body: { query: "bonjour", language_id: 1 } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
  });

  it("uses the raw top matches directly when none clear the expansion threshold", async () => {
    global.fetch = vi.fn(
      mockEmbedMatchAndExpand({
        topMatches: [{ lesson_id: 1, french: "Je", dialect: "Ngai", similarity: 0.1 }],
      })
    );
    const req = createMockReq({ body: { query: "je", language_id: 1 } });
    const res = createMockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.result_count).toBe(1);
    expect(res.jsonBody.context).toContain("Je → Ngai");
  });

  it("expands to full lesson rows when a match clears the 0.4 threshold", async () => {
    global.fetch = vi.fn(
      mockEmbedMatchAndExpand({
        topMatches: [{ lesson_id: 7, french: "Je", dialect: "Ngai", similarity: 0.9 }],
        fullLessonRows: [
          { lesson_id: 7, french: "Je", dialect: "Ngai" },
          { lesson_id: 7, french: "Tu", dialect: "Yo" },
        ],
      })
    );
    const req = createMockReq({ body: { query: "pronoms", language_id: 1 } });
    const res = createMockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.result_count).toBe(2);
    expect(res.jsonBody.context).toContain("Tu → Yo");
  });

  it("500s when lesson expansion fails", async () => {
    global.fetch = vi.fn(
      mockEmbedMatchAndExpand({
        topMatches: [{ lesson_id: 7, french: "Je", dialect: "Ngai", similarity: 0.9 }],
        expandOk: false,
      })
    );
    const req = createMockReq({ body: { query: "pronoms", language_id: 1 } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
  });
});
