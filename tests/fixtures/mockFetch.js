// Small helpers for building fetch-mock response objects. All api/*.js
// handlers call raw global `fetch`, so tests stub `global.fetch` and use
// these builders to construct the shapes each upstream call expects.

export function jsonResponse(data, { ok = true, status = ok ? 200 : 500 } = {}) {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

export function textResponse(text, { ok = true, status = ok ? 200 : 500 } = {}) {
  return {
    ok,
    status,
    text: async () => text,
  };
}

export function arrayBufferResponse(bytes = new Uint8Array([1, 2, 3]), { ok = true, status = 200, contentType = "audio/wav" } = {}) {
  return {
    ok,
    status,
    headers: { get: (name) => (name.toLowerCase() === "content-type" ? contentType : null) },
    arrayBuffer: async () => bytes.buffer,
  };
}

// Builds a fake OpenAI Chat Completions streaming response consumable by
// api/chat.js's `openaiRes.body.getReader()` loop. `deltas` is an array of
// content fragments emitted as separate SSE `data:` events, terminated with
// the real API's `[DONE]` sentinel.
export function mockOpenAIStreamResponse(deltas, { ok = true, status = 200 } = {}) {
  const lines = deltas.map(
    (d) => `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`
  );
  lines.push("data: [DONE]\n\n");

  const encoder = new TextEncoder();
  let index = 0;

  return {
    ok,
    status,
    json: async () => ({ error: { message: "not used on success path" } }),
    body: {
      getReader() {
        return {
          async read() {
            if (index >= lines.length) return { done: true, value: undefined };
            const value = encoder.encode(lines[index]);
            index += 1;
            return { done: false, value };
          },
        };
      },
    },
  };
}

// Dispatches a global.fetch mock across multiple upstream hosts by matching
// on substrings in the request URL, in the order given. Falls back to
// throwing so an unexpected call fails loudly instead of hanging.
export function routeFetchByUrl(routes) {
  return async (url, opts) => {
    for (const [match, respond] of routes) {
      if (url.includes(match)) return respond(url, opts);
    }
    throw new Error(`Unmocked fetch call: ${url}`);
  };
}
