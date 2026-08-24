import { describe, it, expect, vi, afterEach } from "vitest";
import { createMockReq, createMockRes } from "../fixtures/mockRes.js";
import { jsonResponse } from "../fixtures/mockFetch.js";
import { authenticatedUser, authorizeApiRequest } from "../../api/_auth.js";

afterEach(() => vi.restoreAllMocks());

describe("authenticated API quota", () => {
  it("rejects a request without a bearer token", async () => {
    const fetchMock = vi.spyOn(global, "fetch");
    const res = createMockRes();
    const user = await authorizeApiRequest(createMockReq(), res, { scope: "chat", limit: 2, windowMs: 1000 });
    expect(user).toBeNull();
    expect(res.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("authenticates the Supabase token and consumes a durable quota slot", async () => {
    vi.stubEnv("SUPABASE_SERVICE_KEY", "service-key");
    const fetchMock = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonResponse({ id: "user-1" }))
      .mockResolvedValueOnce(jsonResponse(true));
    const req = createMockReq({ headers: { authorization: "Bearer user-token" } });
    const res = createMockRes();
    const user = await authorizeApiRequest(req, res, { scope: "chat", limit: 20, windowMs: 600_000 });
    expect(user.id).toBe("user-1");
    expect(fetchMock.mock.calls[1][0]).toContain("/rpc/check_api_quota");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      p_user_id: "user-1", p_scope: "chat", p_limit: 20, p_window_seconds: 600,
    });
    vi.unstubAllEnvs();
  });

  it("returns 429 when the durable quota is exhausted", async () => {
    vi.stubEnv("SUPABASE_SERVICE_KEY", "service-key");
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonResponse({ id: "user-1" }))
      .mockResolvedValueOnce(jsonResponse(false));
    const res = createMockRes();
    const user = await authorizeApiRequest(
      createMockReq({ headers: { authorization: "Bearer user-token" } }),
      res,
      { scope: "chat", limit: 1, windowMs: 1000 },
    );
    expect(user).toBeNull();
    expect(res.statusCode).toBe(429);
    vi.unstubAllEnvs();
  });

  it("does not accept an invalid Supabase token", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse({}, { ok: false, status: 401 }));
    const user = await authenticatedUser(createMockReq({ headers: { authorization: "Bearer bad" } }));
    expect(user).toBeNull();
  });
});
