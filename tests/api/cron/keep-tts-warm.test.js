import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockReq, createMockRes } from "../../fixtures/mockRes.js";

// Unlike mms-tts.js, this handler reads process.env.MMS_SPACE_URL fresh on
// every call, so a plain env stub (no module reset) is sufficient.
const { default: handler } = await import("../../../api/cron/keep-tts-warm.js");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("keep-tts-warm handler", () => {
  it("reports no_space_url when MMS_SPACE_URL is unset", async () => {
    vi.stubEnv("MMS_SPACE_URL", "");
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ status: "no_space_url" });
  });

  it("reports ok when the Space responds ok", async () => {
    vi.stubEnv("MMS_SPACE_URL", "https://space.example.com");
    global.fetch = vi.fn(async () => ({ ok: true }));
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res.jsonBody).toEqual({ status: "ok" });
  });

  it("reports loading when the Space responds not-ok", async () => {
    vi.stubEnv("MMS_SPACE_URL", "https://space.example.com");
    global.fetch = vi.fn(async () => ({ ok: false }));
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res.jsonBody).toEqual({ status: "loading" });
  });

  it("reports warming when the ping throws (timeout)", async () => {
    vi.stubEnv("MMS_SPACE_URL", "https://space.example.com");
    global.fetch = vi.fn(async () => {
      throw new Error("timeout");
    });
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res.jsonBody).toEqual({ status: "warming" });
  });
});
