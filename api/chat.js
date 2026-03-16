/**
 * Vercel Serverless Function — Monoko Chat
 *
 * Proxies OpenAI calls so the API key never touches the browser.
 *
 * Environment variable to set in Vercel dashboard:
 *   OPENAI_API_KEY  — your OpenAI API key (sk-proj-...)
 */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { systemPrompt, messages } = req.body;

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

    return res.status(200).json({ content: data.choices[0].message.content });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
