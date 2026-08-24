import { describe, it, expect } from "vitest";
import handler from "../../api/geo.js";
import { createMockRes } from "../fixtures/mockRes.js";

let ipCounter = 0;
function req(headers = {}, method = "GET") {
  ipCounter += 1;
  return { method, headers: { "x-forwarded-for": `10.9.0.${ipCounter}`, ...headers } };
}

describe("/api/geo", () => {
  it("returns a supported country from Vercel's edge header", async () => {
    const res = createMockRes();
    await handler(req({ "x-vercel-ip-country": "CA" }), res);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ country: "CA" });
  });

  it("normalises case and whitespace", async () => {
    const res = createMockRes();
    await handler(req({ "x-vercel-ip-country": " be " }), res);
    expect(res.jsonBody).toEqual({ country: "BE" });
  });

  it("maps a country the app does not offer to OTHER", async () => {
    const res = createMockRes();
    await handler(req({ "x-vercel-ip-country": "JP" }), res);
    expect(res.jsonBody).toEqual({ country: "OTHER" });
  });

  // Local development has no such header. Returning null rather than guessing
  // keeps the client's fallback explicit instead of recording a guess as fact.
  it("returns null when the header is absent", async () => {
    const res = createMockRes();
    await handler(req(), res);
    expect(res.jsonBody).toEqual({ country: null });
  });

  it("returns null for a malformed header", async () => {
    const res = createMockRes();
    await handler(req({ "x-vercel-ip-country": "XYZ" }), res);
    expect(res.jsonBody).toEqual({ country: null });
  });

  it("never returns anything but a country code", async () => {
    const res = createMockRes();
    await handler(req({
      "x-vercel-ip-country": "FR",
      "x-vercel-ip-city": "Paris",
      "x-vercel-ip-latitude": "48.85",
      "x-vercel-ip-longitude": "2.35",
    }), res);
    expect(Object.keys(res.jsonBody)).toEqual(["country"]);
    expect(JSON.stringify(res.jsonBody)).not.toMatch(/Paris|48\.85|2\.35/);
  });

  it("rejects non-GET methods", async () => {
    const res = createMockRes();
    await handler(req({}, "POST"), res);
    expect(res.statusCode).toBe(405);
  });

  it("rate-limits a single IP", async () => {
    const headers = { "x-forwarded-for": "10.9.9.9", "x-vercel-ip-country": "CA" };
    let last;
    for (let i = 0; i < 32; i += 1) {
      last = createMockRes();
      await handler({ method: "GET", headers }, last);
    }
    expect(last.statusCode).toBe(429);
  });
});
