import { vi } from "vitest";

// Minimal Vercel-style `res` mock: status/json/setHeader/write/end/send,
// all chainable like the real Node http response object.
export function createMockRes() {
  const res = {
    statusCode: null,
    headers: {},
    jsonBody: undefined,
    body: undefined,
    chunks: [],
    ended: false,
  };
  res.status = vi.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((obj) => {
    res.jsonBody = obj;
    return res;
  });
  res.setHeader = vi.fn((key, value) => {
    res.headers[key] = value;
    return res;
  });
  res.write = vi.fn((chunk) => {
    res.chunks.push(chunk);
    return true;
  });
  res.end = vi.fn((chunk) => {
    if (chunk) res.chunks.push(chunk);
    res.ended = true;
    return res;
  });
  res.send = vi.fn((payload) => {
    res.body = payload;
    return res;
  });
  return res;
}

export function createMockReq({ method = "POST", headers = {}, body = {} } = {}) {
  return {
    method,
    headers,
    body,
    socket: { remoteAddress: "127.0.0.1" },
  };
}
