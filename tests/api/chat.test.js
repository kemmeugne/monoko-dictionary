import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockReq, createMockRes } from "../fixtures/mockRes.js";
import { jsonResponse, mockOpenAIStreamResponse, routeFetchByUrl } from "../fixtures/mockFetch.js";

vi.mock("../../api/_rate-limit.js", () => ({
  checkRateLimit: vi.fn(() => true),
  getClientIp: vi.fn(() => "1.2.3.4"),
  setCorsHeaders: vi.fn(),
}));
vi.mock("../../api/_auth.js", () => ({ authorizeApiRequest: vi.fn(async () => ({ id: "user-1" })) }));

const { checkRateLimit } = await import("../../api/_rate-limit.js");
const { default: handler, buildSystemPrompt } = await import("../../api/chat.js");

beforeEach(() => {
  checkRateLimit.mockReturnValue(true);
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
  vi.stubEnv("SUPABASE_SERVICE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("buildSystemPrompt", () => {
  it("live-translation mode, Lingala -> French: French-only instruction", () => {
    const p = buildSystemPrompt("Lingala", "", "", "live-translation", "lingala_to_fr");
    expect(p).toContain("traduction française");
    expect(p).not.toContain("traduction en Lingala");
  });

  it("live-translation mode, French -> Lingala: Lingala-only instruction", () => {
    const p = buildSystemPrompt("Lingala", "", "", "live-translation", "fr_to_lingala");
    expect(p).toContain("traduction en Lingala");
  });

  it("live-translation mode appends corpus block only when context is non-empty", () => {
    const withCtx = buildSystemPrompt("Lingala", "• a → b", "", "live-translation", "fr_to_lingala");
    expect(withCtx).toContain("=== CORPUS ===");
    const withoutCtx = buildSystemPrompt("Lingala", "", "", "live-translation", "fr_to_lingala");
    expect(withoutCtx).not.toContain("=== CORPUS ===");
  });

  it("default chat mode includes the Monoko persona and corpus fallback text", () => {
    const p = buildSystemPrompt("Lingala", "", "", "chat");
    expect(p).toContain("Tu es Monoko");
    expect(p).toContain("(Aucune donnée trouvée pour cette requête)");
  });

  it("default chat mode injects provided corpus context", () => {
    const p = buildSystemPrompt("Lingala", "• Bonjour → Mbote [vérifié]", "", "chat");
    expect(p).toContain("Bonjour → Mbote");
  });
});

describe("chat handler", () => {
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
    const req = createMockReq({ body: { messages: [{ role: "user", content: "hi" }] } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(429);
  });

  it("400s on missing messages array", async () => {
    const req = createMockReq({ body: {} });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("400s on empty messages array", async () => {
    const req = createMockReq({ body: { messages: [] } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("400s when message count exceeds the cap", async () => {
    const messages = Array.from({ length: 21 }, () => ({ role: "user", content: "hi" }));
    const req = createMockReq({ body: { messages } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toMatch(/Too many messages/);
  });

  it("400s when a message exceeds the char cap", async () => {
    const messages = [{ role: "user", content: "x".repeat(2001) }];
    const req = createMockReq({ body: { messages } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toMatch(/too long/);
  });

  it("400s when combined RAG + lesson context exceeds the cap", async () => {
    const req = createMockReq({
      body: {
        messages: [{ role: "user", content: "hi" }],
        ragContext: "a".repeat(40000),
        lessonContext: "b".repeat(20000),
      },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toMatch(/Context too large/);
  });

  it("passes through OpenAI's error status when the upstream call fails", async () => {
    global.fetch = vi.fn(async () => jsonResponse({ error: { message: "bad key" } }, { ok: false, status: 401 }));
    const req = createMockReq({ body: { messages: [{ role: "user", content: "hi" }] } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.jsonBody.error).toBe("bad key");
  });

  it("streams deltas as SSE events and terminates with [DONE]", async () => {
    global.fetch = vi.fn(async () => mockOpenAIStreamResponse(["Bonjour", " le monde"]));
    const req = createMockReq({ body: { messages: [{ role: "user", content: "salut" }] } });
    const res = createMockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("text/event-stream");
    expect(res.chunks).toContain(`data: ${JSON.stringify({ delta: "Bonjour" })}\n\n`);
    expect(res.chunks).toContain(`data: ${JSON.stringify({ delta: " le monde" })}\n\n`);
    expect(res.chunks.at(-1)).toBe("data: [DONE]\n\n");
    expect(res.ended).toBe(true);
  });

  it("logs chat_events with timing fields when a testerName/sessionId is present", async () => {
    vi.stubEnv("SUPABASE_SERVICE_KEY", "service-key");
    const supabaseCalls = [];
    global.fetch = vi.fn(
      routeFetchByUrl([
        ["api.openai.com", async () => mockOpenAIStreamResponse(["ok"])],
        [
          "supabase.co",
          async (url, opts) => {
            supabaseCalls.push(JSON.parse(opts.body));
            return { ok: true, text: async () => "" };
          },
        ],
      ])
    );

    const req = createMockReq({
      body: {
        messages: [{ role: "user", content: "salut" }],
        testerName: "Prof",
        sessionId: "sess-1",
        tRagMs: 42,
      },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(supabaseCalls).toHaveLength(1);
    expect(supabaseCalls[0]).toMatchObject({ tester_name: "Prof", session_id: "sess-1", t_rag_ms: 42 });
    expect(typeof supabaseCalls[0].t_llm_ms).toBe("number");
  });

  it("does not crash the response if the Supabase logging write fails", async () => {
    vi.stubEnv("SUPABASE_SERVICE_KEY", "service-key");
    global.fetch = vi.fn(
      routeFetchByUrl([
        ["api.openai.com", async () => mockOpenAIStreamResponse(["ok"])],
        ["supabase.co", async () => ({ ok: false, text: async () => "boom" })],
      ])
    );

    const req = createMockReq({
      body: { messages: [{ role: "user", content: "salut" }], testerName: "Prof" },
    });
    const res = createMockRes();
    await expect(handler(req, res)).resolves.not.toThrow();
    expect(res.chunks.at(-1)).toBe("data: [DONE]\n\n");
    expect(res.ended).toBe(true);
  });
});
