const SPACE_URL = (process.env.LINGALA_TTS_SPACE_URL
  || "https://kemz42-monoko-lingala-tts.hf.space").replace(/\/$/, "");

const PHRASES = [
  "Mbote",
  "Matondo mingi",
  "Mbote na yo",
  "Nalingi koyekola Lingala",
  "Kombo na ngai ezali Monoko",
  "Tokokende na zando lobi na ntongo",
  "Nazali na esengo mingi mpo nazali koyekola Lingala",
  "Oyo kati na Ye ozwi lisiko mpe bolimbisi ya masumu",
];

const now = () => performance.now();
const elapsed = start => Math.round(now() - start);

function percentile(values, proportion) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(proportion * sorted.length) - 1];
}

function wavMetadata(buffer) {
  if (buffer.length < 44
      || buffer.toString("ascii", 0, 4) !== "RIFF"
      || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("The generated file is not a valid RIFF/WAVE file");
  }

  let byteRate = 0;
  let dataBytes = 0;
  let sampleRate = 0;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "fmt " && size >= 16 && offset + 16 <= buffer.length) {
      sampleRate = buffer.readUInt32LE(offset + 12);
      byteRate = buffer.readUInt32LE(offset + 16);
    } else if (id === "data") {
      dataBytes = Math.min(size, buffer.length - offset - 8);
    }
    offset += 8 + size + (size % 2);
  }

  return {
    bytes: buffer.length,
    sample_rate_hz: sampleRate || null,
    duration_s: byteRate && dataBytes
      ? Number((dataBytes / byteRate).toFixed(2))
      : null,
  };
}

async function synthesise(text) {
  const startedAt = now();
  const startResponse = await fetch(`${SPACE_URL}/gradio_api/call/synthesise`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: [text] }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!startResponse.ok) throw new Error(`start HTTP ${startResponse.status}`);

  const { event_id: eventId } = await startResponse.json();
  if (!eventId) throw new Error("The Space did not return an event_id");
  const acceptedMs = elapsed(startedAt);

  const eventResponse = await fetch(
    `${SPACE_URL}/gradio_api/call/synthesise/${eventId}`,
    { signal: AbortSignal.timeout(120_000) },
  );
  if (!eventResponse.ok) throw new Error(`events HTTP ${eventResponse.status}`);

  const reader = eventResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let audioUrl = "";

  try {
    while (!audioUrl) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        const lines = event.split("\n");
        const eventName = lines.find(line => line.startsWith("event:"))?.slice(6).trim();
        if (eventName === "error") {
          throw new Error(lines.find(line => line.startsWith("data:"))?.slice(5).trim()
            || "Space synthesis failed");
        }
        if (eventName !== "complete" && eventName !== "process_completed") continue;

        const raw = lines.find(line => line.startsWith("data:"))?.slice(5).trim();
        const parsed = JSON.parse(raw || "null");
        const output = Array.isArray(parsed) ? parsed : (parsed?.output?.data || parsed?.data);
        const audio = output?.[0];
        const source = typeof audio === "string" ? audio : (audio?.url || audio?.path || audio?.name);
        if (source) {
          audioUrl = source.startsWith("http")
            ? source
            : `${SPACE_URL}/gradio_api/file=${source}`;
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  if (!audioUrl) throw new Error("The completion event contained no audio URL");
  const readyMs = elapsed(startedAt);

  const downloadStartedAt = now();
  const audioResponse = await fetch(audioUrl, { signal: AbortSignal.timeout(60_000) });
  if (!audioResponse.ok) throw new Error(`audio HTTP ${audioResponse.status}`);
  const audio = Buffer.from(await audioResponse.arrayBuffer());

  return {
    characters: text.length,
    accepted_ms: acceptedMs,
    ready_ms: readyMs,
    download_ms: elapsed(downloadStartedAt),
    ...wavMetadata(audio),
  };
}

console.log(`Benchmarking ${SPACE_URL}`);
const results = [];
for (const [index, phrase] of PHRASES.entries()) {
  try {
    const result = await synthesise(phrase);
    results.push({ ok: true, ...result });
    console.log(
      `${index + 1}/${PHRASES.length} OK  ${result.ready_ms} ms  `
      + `${result.duration_s}s audio  ${result.characters} chars`,
    );
  } catch (error) {
    results.push({ ok: false, error: error.message, characters: phrase.length });
    console.error(`${index + 1}/${PHRASES.length} FAIL ${error.message}`);
  }
}

const successful = results.filter(result => result.ok);
if (!successful.length) process.exitCode = 1;
const readyTimes = successful.map(result => result.ready_ms);
console.log(JSON.stringify({
  space_url: SPACE_URL,
  generated_at: new Date().toISOString(),
  samples: results.length,
  successes: successful.length,
  failures: results.length - successful.length,
  ready_ms: readyTimes.length ? {
    min: Math.min(...readyTimes),
    median: percentile(readyTimes, 0.5),
    p95: percentile(readyTimes, 0.95),
    max: Math.max(...readyTimes),
  } : null,
  results,
}, null, 2));
