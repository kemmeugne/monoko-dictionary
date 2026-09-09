import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { textResponse } from "../fixtures/mockFetch.js";
import { createMockReq, createMockRes } from "../fixtures/mockRes.js";

vi.mock("../../api/_rate-limit.js", () => ({
  checkRateLimit:vi.fn(() => true),
  getClientIp:vi.fn(() => "1.2.3.4"),
  setCorsHeaders:vi.fn(),
}));
vi.mock("../../api/_auth.js", () => ({ authenticatedUser:vi.fn(async () => ({ id:"user-1" })) }));

const { default:handler } = await import("../../api/live-translation-events.js");

beforeEach(() => vi.stubEnv("SUPABASE_SERVICE_KEY", "service-key"));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const validBody = {
  event_id:"01993c0d-71d7-7000-8000-000000000001",
  language_id:1,
  event_type:"translation",
  direction:"lingala_to_fr",
  input_mode:"speech",
  outcome:"failure",
  failure_stage:"stt",
  failure_code:"http_429",
  source_length_bucket:"26-75",
  audio_duration_bucket:"3-7s",
  capture_ms:4200,
  stt_ms:860,
};

describe("live translation telemetry", () => {
  it("stores operational metadata under the authenticated user", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(textResponse("", { status:201 }));
    const res = createMockRes();
    await handler(createMockReq({ body:validBody }), res);

    expect(res.statusCode).toBe(201);
    const stored = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(stored).toMatchObject({ user_id:"user-1", direction:"lingala_to_fr", failure_stage:"stt", capture_ms:4200 });
    expect(stored).not.toHaveProperty("source");
    expect(stored).not.toHaveProperty("translation");
    expect(stored).not.toHaveProperty("audio");
  });

  it("rejects conversation content instead of silently logging it", async () => {
    const fetchMock = vi.spyOn(global, "fetch");
    const res = createMockRes();
    await handler(createMockReq({ body:{ ...validBody, transcript:"Mbote" } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toMatch(/content/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears failure fields on successful events", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(textResponse("", { status:201 }));
    const res = createMockRes();
    await handler(createMockReq({ body:{ ...validBody, outcome:"success" } }), res);
    const stored = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(stored.failure_stage).toBeNull();
    expect(stored.failure_code).toBeNull();
  });

  it("rejects malformed dimensions", async () => {
    const fetchMock = vi.spyOn(global, "fetch");
    const res = createMockRes();
    await handler(createMockReq({ body:{ ...validBody, direction:"world_to_mars" } }), res);
    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
