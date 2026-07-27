import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockReq, createMockRes } from "../fixtures/mockRes.js";

vi.mock("../../api/_rate-limit.js", () => ({
  checkRateLimit: vi.fn(() => true),
  getClientIp: vi.fn(() => "1.2.3.4"),
  setCorsHeaders: vi.fn(),
}));

const { checkRateLimit } = await import("../../api/_rate-limit.js");
const { default: handler } = await import("../../api/admin-action.js");

beforeEach(() => {
  checkRateLimit.mockReturnValue(true);
  vi.stubEnv("ADMIN_PASSWORD", "correct-horse");
  vi.stubEnv("SUPABASE_SERVICE_KEY", "service-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function fetchCalls(mockFn) {
  return mockFn.mock.calls.map(([url, opts]) => ({
    url,
    method: opts.method,
    body: opts.body ? JSON.parse(opts.body) : undefined,
  }));
}

describe("admin-action handler", () => {
  it("rejects non-POST with 405", async () => {
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it("returns 429 when rate limited", async () => {
    checkRateLimit.mockReturnValue(false);
    const req = createMockReq({ body: { action: "verify", password: "correct-horse" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(429);
  });

  it("401s on wrong password regardless of action", async () => {
    const req = createMockReq({ body: { action: "verify", password: "nope" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it("401s on missing password", async () => {
    const req = createMockReq({ body: { action: "verify" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it("verify: 200 with correct password", async () => {
    const req = createMockReq({ body: { action: "verify", password: "correct-horse" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ ok: true });
  });

  it("approve: inserts the pair and marks the correction approved", async () => {
    global.fetch = vi.fn(async () => ({ ok: true }));
    const req = createMockReq({
      body: {
        action: "approve",
        password: "correct-horse",
        correction: {
          id: 42,
          language_id: 1,
          correct_french: "Bonjour",
          correct_lingala: "Mbote",
          example_sentence: "Mbote na yo",
        },
      },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const calls = fetchCalls(global.fetch);
    expect(calls).toHaveLength(2);

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/parallel_sentences");
    expect(calls[0].body).toMatchObject({
      language_id: 1,
      french_text: "Bonjour",
      lingala_text: "Mbote",
      source: "correction",
      quality: "verified",
    });

    expect(calls[1].method).toBe("PATCH");
    expect(calls[1].url).toContain("/corrections?id=eq.42");
    expect(calls[1].body).toMatchObject({ status: "approved", professor_modified: false });
    expect(typeof calls[1].body.reviewed_at).toBe("string");
  });

  it("approve: respects professor_modified when provided", async () => {
    global.fetch = vi.fn(async () => ({ ok: true }));
    const req = createMockReq({
      body: {
        action: "approve",
        password: "correct-horse",
        correction: { id: 1, language_id: 1, correct_french: "a", correct_lingala: "b", professor_modified: true },
      },
    });
    const res = createMockRes();
    await handler(req, res);
    const calls = fetchCalls(global.fetch);
    expect(calls[1].body.professor_modified).toBe(true);
  });

  it("reject: marks the correction rejected with a reviewed_at timestamp", async () => {
    global.fetch = vi.fn(async () => ({ ok: true }));
    const req = createMockReq({ body: { action: "reject", password: "correct-horse", id: 7 } });
    const res = createMockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const calls = fetchCalls(global.fetch);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toContain("/corrections?id=eq.7");
    expect(calls[0].body.status).toBe("rejected");
    expect(typeof calls[0].body.reviewed_at).toBe("string");
  });

  it("bulk_approve: batch-inserts rows and batch-updates ids", async () => {
    global.fetch = vi.fn(async () => ({ ok: true }));
    const rows = [{ language_id: 1, french_text: "a", lingala_text: "b", source: "correction", quality: "verified" }];
    const req = createMockReq({
      body: { action: "bulk_approve", password: "correct-horse", rows, ids: [1, 2, 3] },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ ok: true, count: 1 });
    const calls = fetchCalls(global.fetch);
    expect(calls[0].body).toEqual(rows);
    expect(calls[1].url).toContain("/corrections?id=in.(1,2,3)");
    expect(calls[1].body.status).toBe("approved");
  });

  it("400s on an unknown action", async () => {
    const req = createMockReq({ body: { action: "nuke_everything", password: "correct-horse" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toMatch(/Unknown action/);
  });

  it("500s when the Supabase write fails", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, text: async () => "db error" }));
    const req = createMockReq({ body: { action: "reject", password: "correct-horse", id: 1 } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
  });
});
