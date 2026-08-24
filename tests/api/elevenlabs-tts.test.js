import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockReq, createMockRes } from "../fixtures/mockRes.js";
import { arrayBufferResponse } from "../fixtures/mockFetch.js";

vi.mock("../../api/_rate-limit.js", () => ({
  checkRateLimit: vi.fn(() => true),
  getClientIp: vi.fn(() => "1.2.3.4"),
  setCorsHeaders: vi.fn(),
}));
vi.mock("../../api/_auth.js", () => ({ authorizeApiRequest: vi.fn(async () => ({ id: "user-1" })) }));

const { checkRateLimit } = await import("../../api/_rate-limit.js");
const { default: handler } = await import("../../api/elevenlabs-tts.js");

beforeEach(() => {
  checkRateLimit.mockReturnValue(true);
  vi.stubEnv("ELEVENLABS_API_KEY", "el-test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("elevenlabs-tts handler", () => {
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
    const req = createMockReq({ body: { text: "Mbote" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(429);
  });

  it("500s when ELEVENLABS_API_KEY is not configured", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const req = createMockReq({ body: { text: "Mbote" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
  });

  it("400s on missing or whitespace-only text", async () => {
    const res1 = createMockRes();
    await handler(createMockReq({ body: {} }), res1);
    expect(res1.statusCode).toBe(400);

    const res2 = createMockRes();
    await handler(createMockReq({ body: { text: "   " } }), res2);
    expect(res2.statusCode).toBe(400);
  });

  it("400s when text exceeds 500 chars", async () => {
    const req = createMockReq({ body: { text: "a".repeat(501) } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("returns synthesized audio with the right content type", async () => {
    global.fetch = vi.fn(async () => arrayBufferResponse(new Uint8Array([1, 2, 3, 4]), { contentType: "audio/mpeg" }));
    const req = createMockReq({ body: { text: "Mbote" } });
    const res = createMockRes();
    await handler(req, res);

    expect(res.statusCode).toBeNull(); // handler never calls res.status() on the success path
    expect(res.headers["Content-Type"]).toBe("audio/mpeg");
    expect(Buffer.isBuffer(res.body)).toBe(true);
  });

  it("passes through the upstream error status", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 401, text: async () => "invalid key" }));
    const req = createMockReq({ body: { text: "Mbote" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it("500s when the upstream call throws", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network down");
    });
    const req = createMockReq({ body: { text: "Mbote" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
  });
});
