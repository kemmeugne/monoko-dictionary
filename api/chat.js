/**
 * Vercel Serverless Function — Monoko Chat
 *
 * Proxies OpenAI calls so the API key never touches the browser.
 * Streams the response as SSE so the first token appears in <500ms.
 * Logs tester activity to Supabase after the stream completes.
 *
 * Environment variables:
 *   OPENAI_API_KEY       — OpenAI key (sk-proj-...)
 *   SUPABASE_SERVICE_KEY — optional, used for tester activity logging
 */

const SUPABASE_URL = "https://haioiccujncsehadipzb.supabase.co";

async function supaWrite(table, body) {
  if (!process.env.SUPABASE_SERVICE_KEY) return;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase POST ${table}: ${text}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { systemPrompt, messages, testerName, sessionId, languageId, userQuery, turnNumber, tRagMs } = req.body;

  if (!systemPrompt || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Missing systemPrompt or messages" });
  }

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 512,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    }),
  });

  if (!openaiRes.ok) {
    const data = await openaiRes.json().catch(() => ({}));
    return res.status(openaiRes.status).json({ error: data.error?.message || "OpenAI error" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.status(200);

  const reader = openaiRes.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";
  let lineBuffer = "";
  const streamStart = Date.now();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop(); // hold back incomplete trailing line

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || "";
          if (delta) {
            fullContent += delta;
            res.write(`data: ${JSON.stringify({ delta })}\n\n`);
          }
        } catch {}
      }
    }
  } catch (e) {
    console.error("Stream pump error:", e.message);
  }

  // Log to chat_events after the full response is assembled
  if (testerName || sessionId) {
    try {
      await supaWrite("chat_events", {
        tester_name: testerName || null,
        session_id: sessionId || null,
        language_id: languageId || null,
        user_query: userQuery || messages[messages.length - 1]?.content || null,
        assistant_response: fullContent || null,
        message_count: turnNumber || null,
        t_rag_ms: typeof tRagMs === "number" ? tRagMs : null,
        t_llm_ms: Date.now() - streamStart,
      });
    } catch (logError) {
      console.error("Chat tracking failed:", logError.message);
    }
  }

  res.write("data: [DONE]\n\n");
  res.end();
}
