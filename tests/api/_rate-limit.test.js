import { describe, it, expect, vi, afterEach } from "vitest";
import { checkRateLimit, getClientIp, setCorsHeaders } from "../../api/_rate-limit.js";
import { createMockRes } from "../fixtures/mockRes.js";

// Each test uses a unique IP so the shared module-level `windows` Map
// doesn't leak state between assertions.
let ipCounter = 0;
function freshIp() {
  ipCounter += 1;
  return `10.0.0.${ipCounter}`;
}

describe("checkRateLimit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows requests under the limit", () => {
    const ip = freshIp();
    expect(checkRateLimit(ip, { limit: 3, windowMs: 1000 })).toBe(true);
    expect(checkRateLimit(ip, { limit: 3, windowMs: 1000 })).toBe(true);
    expect(checkRateLimit(ip, { limit: 3, windowMs: 1000 })).toBe(true);
  });

  it("blocks once the limit is reached", () => {
    const ip = freshIp();
    checkRateLimit(ip, { limit: 2, windowMs: 1000 });
    checkRateLimit(ip, { limit: 2, windowMs: 1000 });
    expect(checkRateLimit(ip, { limit: 2, windowMs: 1000 })).toBe(false);
  });

  it("tracks separate IPs independently", () => {
    const ipA = freshIp();
    const ipB = freshIp();
    checkRateLimit(ipA, { limit: 1, windowMs: 1000 });
    expect(checkRateLimit(ipA, { limit: 1, windowMs: 1000 })).toBe(false);
    expect(checkRateLimit(ipB, { limit: 1, windowMs: 1000 })).toBe(true);
  });

  it("allows requests again once the window slides past", () => {
    const ip = freshIp();
    const now = Date.now();
    const spy = vi.spyOn(Date, "now").mockReturnValue(now);

    checkRateLimit(ip, { limit: 1, windowMs: 1000 });
    expect(checkRateLimit(ip, { limit: 1, windowMs: 1000 })).toBe(false);

    spy.mockReturnValue(now + 1001);
    expect(checkRateLimit(ip, { limit: 1, windowMs: 1000 })).toBe(true);
  });
});

describe("getClientIp", () => {
  it("prefers the first x-forwarded-for entry", () => {
    const req = { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" }, socket: {} };
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = { headers: { "x-real-ip": "9.9.9.9" }, socket: {} };
    expect(getClientIp(req)).toBe("9.9.9.9");
  });

  it("falls back to socket.remoteAddress", () => {
    const req = { headers: {}, socket: { remoteAddress: "127.0.0.1" } };
    expect(getClientIp(req)).toBe("127.0.0.1");
  });

  it("falls back to 'unknown' when nothing is available", () => {
    const req = { headers: {}, socket: {} };
    expect(getClientIp(req)).toBe("unknown");
  });
});

describe("setCorsHeaders", () => {
  it("allows the production origin", () => {
    const res = createMockRes();
    const req = { headers: { origin: "https://monoko-dictionary.vercel.app" } };
    setCorsHeaders(res, req);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("https://monoko-dictionary.vercel.app");
  });

  it("allows any *.vercel.app preview origin", () => {
    const res = createMockRes();
    const req = { headers: { origin: "https://monoko-git-feature-anthony.vercel.app" } };
    setCorsHeaders(res, req);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("https://monoko-git-feature-anthony.vercel.app");
  });

  it("allows localhost", () => {
    const res = createMockRes();
    const req = { headers: { origin: "http://localhost:3000" } };
    setCorsHeaders(res, req);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("http://localhost:3000");
  });

  it("does not echo back a disallowed origin", () => {
    const res = createMockRes();
    const req = { headers: { origin: "https://evil.example.com" } };
    setCorsHeaders(res, req);
    expect(res.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("always sets the method/header/vary headers", () => {
    const res = createMockRes();
    const req = { headers: {} };
    setCorsHeaders(res, req);
    expect(res.headers["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
    expect(res.headers["Access-Control-Allow-Headers"]).toBe("Content-Type");
    expect(res.headers["Vary"]).toBe("Origin");
  });
});
