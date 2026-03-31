/**
 * Vercel Serverless Function — Monoko Chat
 *
 * Proxies OpenAI calls so the API key never touches the browser.
 * Optionally logs tester activity to Supabase when tracking fields are sent.
 *
 * Environment variable to set in Vercel dashboard:
 *   OPENAI_API_KEY  — your OpenAI API key (sk-proj-...)
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

  const { systemPrompt, messages, testerName, sessionId, languageId, userQuery, turnNumber } = req.body;

  if (!systemPrompt || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Missing systemPrompt or messages" });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 512,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "OpenAI error" });
    }

    const assistantContent = data.choices[0].message.content;

    if (testerName || sessionId) {
      try {
        await supaWrite("chat_events", {
          tester_name: testerName || null,
          session_id: sessionId || null,
          language_id: languageId || null,
          user_query: userQuery || messages[messages.length - 1]?.content || null,
          assistant_response: assistantContent || null,
          message_count: turnNumber || null,
        });
      } catch (logError) {
        console.error("Chat tracking failed:", logError.message);
      }
    }

    return res.status(200).json({ content: assistantContent });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
