import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockReq, createMockRes } from "../fixtures/mockRes.js";
import { jsonResponse, routeFetchByUrl } from "../fixtures/mockFetch.js";

vi.mock("../../api/_rate-limit.js", () => ({
  checkRateLimit: vi.fn(() => true),
  getClientIp: vi.fn(() => "1.2.3.4"),
  setCorsHeaders: vi.fn(),
}));

const { checkRateLimit } = await import("../../api/_rate-limit.js");
const { default: handler, formatContext } = await import("../../api/rag-context.js");

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
    expect(formatContext(null)).toBe("");
  });

  it("sorts verified/gold rows before others and tags accordingly", () => {
    const rows = [
      { french_text: "Merci", lingala_text: "Botondi", quality: "auto" },
      { french_text: "Bonjour", lingala_text: "Mbote", quality: "verified" },
    ];
    const out = formatContext(rows);
    const lines = out.split("\n");
    expect(lines[1]).toContain("Bonjour → Mbote [vérifié]");
    expect(lines[2]).toContain("Merci → Botondi [auto]");
  });

  it("tags gold quality as vérifié too", () => {
    const out = formatContext([{ french_text: "a", lingala_text: "b", quality: "gold" }]);
    expect(out).toContain("[vérifié]");
  });
});

function mockEmbedAndMatch({ matchRows = [], embedOk = true, matchOk = true } = {}) {
  return routeFetchByUrl([
    [
      "api.openai.com",
      async () =>
        embedOk
          ? jsonResponse({ data: [{ embedding: [0.1, 0.2] }] })
          : { ok: false, status: 500, text: async () => "embed failed" },
    ],
    [
      "rpc/match_parallel_sentences",
      async () =>
        matchOk
          ? jsonResponse(matchRows)
          : { ok: false, status: 500, text: async () => "rpc failed" },
    ],
  ]);
}

describe("rag-context handler", () => {
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
    const res1 = createMockRes();
    await handler(createMockReq({ body: { language_id: 1 } }), res1);
    expect(res1.statusCode).toBe(400);

    const res2 = createMockRes();
    await handler(createMockReq({ body: { query: "bonjour" } }), res2);
    expect(res2.statusCode).toBe(400);
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
    expect(res.jsonBody.error).toMatch(/OPENAI_API_KEY/);
  });

  it("500s when SUPABASE_SERVICE_KEY is not configured", async () => {
    vi.stubEnv("SUPABASE_SERVICE_KEY", "");
    const req = createMockReq({ body: { query: "bonjour", language_id: 1 } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
    expect(res.jsonBody.error).toMatch(/SUPABASE_SERVICE_KEY/);
  });

  it("500s when the embedding call fails", async () => {
    global.fetch = vi.fn(mockEmbedAndMatch({ embedOk: false }));
    const req = createMockReq({ body: { query: "bonjour", language_id: 1 } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
  });

  it("500s when the Supabase RPC fails", async () => {
    global.fetch = vi.fn(mockEmbedAndMatch({ matchOk: false }));
    const req = createMockReq({ body: { query: "bonjour", language_id: 1 } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
  });

  it("returns formatted context filtered by the default similarity threshold", async () => {
    global.fetch = vi.fn(
      mockEmbedAndMatch({
        matchRows: [
          { french_text: "Bonjour", lingala_text: "Mbote", quality: "verified", similarity: 0.8 },
          { french_text: "Chat", lingala_text: "Nyau", quality: "auto", similarity: 0.1 },
        ],
      })
    );
    const req = createMockReq({ body: { query: "bonjour", language_id: 1 } });
    const res = createMockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.context).toContain("Bonjour → Mbote");
    expect(res.jsonBody.context).not.toContain("Chat → Nyau");
    expect(res.jsonBody.result_count).toBe(2);
  });

  it("honors a custom min_similarity override", async () => {
    global.fetch = vi.fn(
      mockEmbedAndMatch({
        matchRows: [{ french_text: "Bonjour", lingala_text: "Mbote", quality: "verified", similarity: 0.5 }],
      })
    );
    const req = createMockReq({ body: { query: "bonjour", language_id: 1, min_similarity: 0.6 } });
    const res = createMockRes();
    await handler(req, res);

    // Nothing clears the higher bar, so it falls back to returning all rows.
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.context).toContain("Bonjour → Mbote");
  });

  it("falls back to unfiltered rows when nothing clears the threshold", async () => {
    global.fetch = vi.fn(
      mockEmbedAndMatch({
        matchRows: [{ french_text: "Bonjour", lingala_text: "Mbote", quality: "auto", similarity: 0.05 }],
      })
    );
    const req = createMockReq({ body: { query: "bonjour", language_id: 1 } });
    const res = createMockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.context).toContain("Bonjour → Mbote [auto]");
  });
});
