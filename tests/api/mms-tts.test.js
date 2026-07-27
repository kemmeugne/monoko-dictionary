import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockReq, createMockRes } from "../fixtures/mockRes.js";
import { arrayBufferResponse, routeFetchByUrl } from "../fixtures/mockFetch.js";

// mms-tts.js reads MMS_SPACE_URL into a module-level const at import time,
// so each test that varies the env var must reset the module cache and
// re-import after stubbing the env, rather than mutating process.env after
// the fact.
async function loadHandler(spaceUrl) {
  vi.resetModules();
  vi.stubEnv("MMS_SPACE_URL", spaceUrl ?? "");
  const mod = await import("../../api/mms-tts.js");
  return mod;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("parseSSEAudio", () => {
  it("returns null when there is no process_completed event", async () => {
    const { parseSSEAudio } = await loadHandler("https://space.example.com");
    expect(parseSSEAudio("event: ping\ndata: {}\n")).toBeNull();
  });

  it("parses a raw string path/url from the data array", async () => {
    const { parseSSEAudio } = await loadHandler("https://space.example.com");
    const sse = [
      "event: process_completed",
      `data: ${JSON.stringify({ output: { data: ["/tmp/audio.wav"] } })}`,
      "",
    ].join("\n");
    expect(parseSSEAudio(sse)).toBe("/tmp/audio.wav");
  });

  it("parses an object with a url field", async () => {
    const { parseSSEAudio } = await loadHandler("https://space.example.com");
    const sse = [
      "event: process_completed",
      `data: ${JSON.stringify({ data: [{ url: "https://space.example.com/file=audio.wav" }] })}`,
      "",
    ].join("\n");
    expect(parseSSEAudio(sse)).toBe("https://space.example.com/file=audio.wav");
  });

  it("falls back to a path or name field", async () => {
    const { parseSSEAudio } = await loadHandler("https://space.example.com");
    const sse = [
      "event: process_completed",
      `data: ${JSON.stringify({ data: [{ path: "/tmp/out.wav" }] })}`,
      "",
    ].join("\n");
    expect(parseSSEAudio(sse)).toBe("/tmp/out.wav");
  });

  it("returns null when the data array is empty", async () => {
    const { parseSSEAudio } = await loadHandler("https://space.example.com");
    const sse = ["event: process_completed", `data: ${JSON.stringify({ data: [] })}`, ""].join("\n");
    expect(parseSSEAudio(sse)).toBeNull();
  });
});

describe("mms-tts GET (warm-up ping)", () => {
  it("reports no_space_url when MMS_SPACE_URL is unset", async () => {
    const { default: handler } = await loadHandler(undefined);
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ status: "no_space_url" });
  });

  it("reports ok when the Space responds ok", async () => {
    const { default: handler } = await loadHandler("https://space.example.com");
    global.fetch = vi.fn(async () => ({ ok: true }));
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res.jsonBody).toEqual({ status: "ok" });
  });

  it("reports loading when the Space responds not-ok", async () => {
    const { default: handler } = await loadHandler("https://space.example.com");
    global.fetch = vi.fn(async () => ({ ok: false }));
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res.jsonBody).toEqual({ status: "loading" });
  });

  it("reports warming when the ping throws", async () => {
    const { default: handler } = await loadHandler("https://space.example.com");
    global.fetch = vi.fn(async () => {
      throw new Error("timeout");
    });
    const req = createMockReq({ method: "GET" });
    const res = createMockRes();
    await handler(req, res);
    expect(res.jsonBody).toEqual({ status: "warming" });
  });
});

describe("mms-tts POST (synthesise)", () => {
  it("405s on unsupported methods other than GET/POST", async () => {
    const { default: handler } = await loadHandler("https://space.example.com");
    const req = createMockReq({ method: "PUT" });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it("500s when MMS_SPACE_URL is not configured", async () => {
    const { default: handler } = await loadHandler(undefined);
    const req = createMockReq({ body: { text: "Mbote" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
  });

  it("400s on missing/blank text", async () => {
    const { default: handler } = await loadHandler("https://space.example.com");
    const req = createMockReq({ body: { text: "   " } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("full happy path: start -> SSE -> audio fetch -> binary response", async () => {
    const { default: handler } = await loadHandler("https://space.example.com");
    const sseText = [
      "event: process_completed",
      `data: ${JSON.stringify({ output: { data: [{ url: "https://space.example.com/file=out.wav" }] } })}`,
      "",
    ].join("\n");

    global.fetch = vi.fn(
      routeFetchByUrl([
        ["/call/synthesise/", async () => ({ text: async () => sseText })],
        ["/call/synthesise", async () => ({ ok: true, json: async () => ({ event_id: "evt-1" }) })],
        ["file=out.wav", async () => arrayBufferResponse(new Uint8Array([9, 9]), { contentType: "audio/wav" })],
      ])
    );

    const req = createMockReq({ body: { text: "Mbote" } });
    const res = createMockRes();
    await handler(req, res);

    expect(res.headers["Content-Type"]).toBe("audio/wav");
    expect(Buffer.isBuffer(res.body)).toBe(true);
  });

  it("503s when the initial prediction call fails", async () => {
    const { default: handler } = await loadHandler("https://space.example.com");
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, text: async () => "boom" }));
    const req = createMockReq({ body: { text: "Mbote" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: "space_unavailable" });
  });

  it("503s when the start call returns no event_id", async () => {
    const { default: handler } = await loadHandler("https://space.example.com");
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    const req = createMockReq({ body: { text: "Mbote" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(503);
  });

  it("503s when the SSE stream has no parseable audio", async () => {
    const { default: handler } = await loadHandler("https://space.example.com");
    global.fetch = vi.fn(
      routeFetchByUrl([
        ["/call/synthesise/", async () => ({ text: async () => "event: ping\ndata: {}\n" })],
        ["/call/synthesise", async () => ({ ok: true, json: async () => ({ event_id: "evt-1" }) })],
      ])
    );
    const req = createMockReq({ body: { text: "Mbote" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(503);
  });

  it("503s when the final audio fetch fails", async () => {
    const { default: handler } = await loadHandler("https://space.example.com");
    const sseText = [
      "event: process_completed",
      `data: ${JSON.stringify({ data: [{ url: "https://space.example.com/file=out.wav" }] })}`,
      "",
    ].join("\n");
    global.fetch = vi.fn(
      routeFetchByUrl([
        ["/call/synthesise/", async () => ({ text: async () => sseText })],
        ["/call/synthesise", async () => ({ ok: true, json: async () => ({ event_id: "evt-1" }) })],
        ["file=out.wav", async () => ({ ok: false })],
      ])
    );
    const req = createMockReq({ body: { text: "Mbote" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(503);
  });

  it("503s with a warming-up log when the call times out", async () => {
    const { default: handler } = await loadHandler("https://space.example.com");
    global.fetch = vi.fn(async () => {
      const err = new Error("timeout");
      err.name = "TimeoutError";
      throw err;
    });
    const req = createMockReq({ body: { text: "Mbote" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(503);
  });

  it("500s on a generic unexpected exception", async () => {
    const { default: handler } = await loadHandler("https://space.example.com");
    global.fetch = vi.fn(async () => {
      throw new Error("something else broke");
    });
    const req = createMockReq({ body: { text: "Mbote" } });
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
    expect(res.jsonBody.error).toBe("something else broke");
  });
});
