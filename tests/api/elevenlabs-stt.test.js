import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockReq, createMockRes } from "../fixtures/mockRes.js";
import { jsonResponse } from "../fixtures/mockFetch.js";

vi.mock("../../api/_rate-limit.js", () => ({
  checkRateLimit: vi.fn(() => true),
  getClientIp: vi.fn(() => "1.2.3.4"),
  setCorsHeaders: vi.fn(),
}));
vi.mock("../../api/_auth.js", () => ({ authorizeApiRequest: vi.fn(async () => ({ id: "user-1" })) }));

const { checkRateLimit } = await import("../../api/_rate-limit.js");
const { default: handler } = await import("../../api/elevenlabs-stt.js");

beforeEach(() => {
  checkRateLimit.mockReturnValue(true);
  vi.stubEnv("ELEVENLABS_API_KEY", "el-test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("elevenlabs-stt handler", () => {
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
    const req = createMockReq({ body: { audio: "abc" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(429);
  });

  it("500s when ELEVENLABS_API_KEY is not configured", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const req = createMockReq({ body: { audio: "abc" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
  });

  it("400s when no audio is provided", async () => {
    const req = createMockReq({ body: {} });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("400s when the audio payload is too large", async () => {
    const req = createMockReq({ body: { audio: "a".repeat(7_000_001) } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toMatch(/too large/);
  });

  it("forwards audio as multipart form data with the right model/language", async () => {
    let capturedBody;
    global.fetch = vi.fn(async (url, opts) => {
      capturedBody = opts.body;
      return jsonResponse({ text: "Mbote" });
    });

    const req = createMockReq({ body: { audio: Buffer.from("hello").toString("base64") } });
    const res = createMockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ text: "Mbote" });
    expect(capturedBody.get("model_id")).toBe("scribe_v2");
    expect(capturedBody.get("language_code")).toBe("lin");
  });

  it("passes through the upstream error status", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 422, text: async () => "bad audio" }));
    const req = createMockReq({ body: { audio: "abc" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(422);
  });

  it("500s when the upstream call throws", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network down");
    });
    const req = createMockReq({ body: { audio: "abc" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
    expect(res.jsonBody.error).toBe("network down");
  });
});
