import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockReq, createMockRes } from "../fixtures/mockRes.js";
import { jsonResponse, routeFetchByUrl } from "../fixtures/mockFetch.js";

vi.mock("../../api/_rate-limit.js", () => ({
  checkRateLimit: vi.fn(() => true),
  getClientIp: vi.fn(() => "1.2.3.4"),
  setCorsHeaders: vi.fn(),
}));

const { checkRateLimit } = await import("../../api/_rate-limit.js");
const { default: handler, formatContext, formatDictionaryContext, topCluster } =
  await import("../../api/rag-context.js");

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

describe("topCluster", () => {
  it("returns nothing for empty input", () => {
    expect(topCluster([])).toEqual([]);
    expect(topCluster(null)).toEqual([]);
  });

  it("keeps only the hits clustered near the best score", () => {
    // The "cuillère" shape: one right answer, then an unrelated noise band.
    const rows = [
      { french_word: "Cuillère", similarity: 0.666 },
      { french_word: "Flèche",   similarity: 0.523 },
      { french_word: "Cochon",   similarity: 0.502 },
    ];
    expect(topCluster(rows).map(r => r.french_word)).toEqual(["Cuillère"]);
  });

  it("keeps the whole set when everything is equally relevant", () => {
    // The "parle-moi de la famille" shape: a broad query where every hit is on topic.
    const rows = [
      { id: 1, similarity: 0.382 },
      { id: 2, similarity: 0.379 },
      { id: 3, similarity: 0.357 },
    ];
    expect(topCluster(rows)).toHaveLength(3);
  });
});

describe("formatDictionaryContext", () => {
  it("returns an empty string when there is nothing to show", () => {
    expect(formatDictionaryContext([], [])).toBe("");
    expect(formatDictionaryContext(null, null)).toBe("");
  });

  it("labels example sentences and words as separate sections", () => {
    const out = formatDictionaryContext(
      [{ sentence_french: "Je remue la sauce", sentence_dialect: "Na zo balola elubu" }],
      [{ french_word: "Cuillère", dialect_word: "Lutu" }]
    );
    expect(out).toContain("phrases d'exemple");
    expect(out).toContain("Je remue la sauce → Na zo balola elubu");
    expect(out).toContain("=== DICTIONNAIRE — mots (vérifiés) ===");
    expect(out).toContain("Cuillère → Lutu");
  });

  it("omits the words section entirely when there are none", () => {
    const out = formatDictionaryContext(
      [{ sentence_french: "a", sentence_dialect: "b" }],
      []
    );
    expect(out).not.toContain("mots (vérifiés)");
  });
});

function mockEmbedAndMatch({
  matchRows = [], embedOk = true, matchOk = true,
  exampleRows = [], senseRows = [], dictOk = true,
} = {}) {
  const dict = async (rows) =>
    dictOk
      ? jsonResponse(rows)
      : { ok: false, status: 500, text: async () => "dict rpc failed" };
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
    ["rpc/match_examples", async () => dict(exampleRows)],
    ["rpc/match_senses",   async () => dict(senseRows)],
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

describe("rag-context dictionary retrieval", () => {
  it("merges dictionary hits into the context alongside the corpus", async () => {
    global.fetch = mockEmbedAndMatch({
      matchRows:   [{ french_text: "Bonjour", lingala_text: "Mbote", quality: "verified", similarity: 0.9 }],
      exampleRows: [{ sentence_french: "Je remue la sauce", sentence_dialect: "Na zo balola elubu", similarity: 0.74 }],
      senseRows:   [{ french_word: "Cuillère", dialect_word: "Lutu", similarity: 0.67 }],
    });
    const req = createMockReq({ method: "POST", body: { query: "cuillère", language_id: 1 } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.context).toContain("Bonjour → Mbote");
    expect(res.jsonBody.context).toContain("Je remue la sauce → Na zo balola elubu");
    expect(res.jsonBody.context).toContain("Cuillère → Lutu");
    expect(res.jsonBody.result_count).toBe(3);
  });

  it("still answers from the corpus when the dictionary RPCs fail", async () => {
    // The dictionary lookups are additive; a failure there must not take chat down.
    global.fetch = mockEmbedAndMatch({
      matchRows: [{ french_text: "Bonjour", lingala_text: "Mbote", quality: "verified", similarity: 0.9 }],
      dictOk: false,
    });
    const req = createMockReq({ method: "POST", body: { query: "bonjour", language_id: 1 } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.context).toContain("Bonjour → Mbote");
    expect(res.jsonBody.context).not.toContain("DICTIONNAIRE");
  });

  it("drops dictionary hits that fall below the similarity floor", async () => {
    global.fetch = mockEmbedAndMatch({
      matchRows:   [{ french_text: "Bonjour", lingala_text: "Mbote", quality: "verified", similarity: 0.9 }],
      exampleRows: [{ sentence_french: "sans rapport", sentence_dialect: "x", similarity: 0.12 }],
      senseRows:   [{ french_word: "Cochon", dialect_word: "Ngulu", similarity: 0.31 }],
    });
    const req = createMockReq({ method: "POST", body: { query: "bonjour", language_id: 1 } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.jsonBody.context).not.toContain("sans rapport");
    expect(res.jsonBody.context).not.toContain("Cochon");
  });
});
