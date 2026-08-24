import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockReq, createMockRes } from "../fixtures/mockRes.js";
import { textResponse } from "../fixtures/mockFetch.js";

vi.mock("../../api/_rate-limit.js", () => ({
  checkRateLimit: vi.fn(() => true),
  getClientIp: vi.fn(() => "1.2.3.4"),
  setCorsHeaders: vi.fn(),
}));
vi.mock("../../api/_auth.js", () => ({ authorizeApiRequest: vi.fn(async () => ({ id: "user-1" })) }));

const { default: handler } = await import("../../api/corrections.js");

beforeEach(() => vi.stubEnv("SUPABASE_SERVICE_KEY", "service-key"));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("corrections handler", () => {
  it("stores only server-controlled status and submitter", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(textResponse("", { status: 201 }));
    const req = createMockReq({ body: {
      language_id: 1,
      correction_type: "incorrect",
      user_query: "Bonjour",
      correct_lingala: "Mbote",
      status: "approved",
      submitted_by: "someone-else",
    } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(201);
    const stored = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(stored.status).toBe("pending");
    expect(stored.submitted_by).toBe("user-1");
  });

  it("rejects unsupported correction types before writing", async () => {
    const fetchMock = vi.spyOn(global, "fetch");
    const res = createMockRes();
    await handler(createMockReq({ body: { language_id: 1, correction_type: "admin" } }), res);
    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
