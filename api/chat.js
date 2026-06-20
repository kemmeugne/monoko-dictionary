/**
 * Vercel Serverless Function — Monoko Chat
 *
 * Proxies OpenAI calls so the API key never touches the browser.
 * Streams the response as SSE so the first token appears in <500ms.
 * Logs tester activity to Supabase after the stream completes.
 *
 * The system prompt is built SERVER-SIDE from languageId + corpus context,
 * so callers cannot inject arbitrary prompts or abuse the OpenAI quota.
 *
 * Environment variables:
 *   OPENAI_API_KEY       — OpenAI key (sk-proj-...)
 *   SUPABASE_SERVICE_KEY — optional, used for tester activity logging
 */

import { checkRateLimit, getClientIp, setCorsHeaders } from "./_rate-limit.js";

const SUPABASE_URL = "https://haioiccujncsehadipzb.supabase.co";

const LANG_NAMES = { 1: "Lingala", 2: "Yoruba" };

// Rate limit: 20 requests per 10 minutes per IP
const CHAT_LIMIT    = 20;
const CHAT_WINDOW   = 10 * 60 * 1000;

// Input caps
const MAX_MESSAGES       = 20;
const MAX_MESSAGE_CHARS  = 2000;
const MAX_CONTEXT_CHARS  = 50000; // RAG + lesson context combined (30 pairs + 8 lesson items ≈ 6–15k chars)

function buildSystemPrompt(langName, ragContext, lessonContext, mode, direction) {
  if (mode === "live-translation") {
    const fromLingala = direction === "lingala_to_fr";
    const base = fromLingala
      ? `L'utilisateur parle en ${langName} dans une conversation en direct. Donne uniquement la traduction française, courte et naturelle. Pas d'explication.`
      : `L'utilisateur parle en français dans une conversation en direct. Donne uniquement la traduction en ${langName}, courte et naturelle. Pas d'explication.`;
    const ctx = [ragContext, lessonContext].filter(Boolean).join("\n\n");
    return ctx ? `${base}\n\n=== CORPUS ===\n${ctx}\n=== FIN CORPUS ===` : base;
  }

  // Default: full chat mode
  const fixedPrompt = `Tu es Monoko, un assistant IA dédié à la langue ${langName}.

RÈGLE SUJET: Tu ne réponds qu'aux questions liées à la langue ${langName} — traductions, grammaire, conjugaison, vocabulaire, prononciation, conversations. Ces sujets sont TOUJOURS valides. Pour un sujet sans aucun rapport avec la langue (météo, actualités, maths…), réponds poliment que tu ne traites que le ${langName}.

TON RÔLE:
Tu aides les gens à apprendre et utiliser le ${langName}. Tu traduis, expliques la grammaire, enseignes du vocabulaire, et tiens des conversations en ${langName}.

CONTEXTE LINGUISTIQUE DU ${langName.toUpperCase()}:
Le ${langName} est une langue bantoue de la famille Niger-Congo, parlée par 15 à 20 millions de personnes en République Démocratique du Congo, en République du Congo et dans les pays voisins. C'est la principale lingua franca de Kinshasa et du nord-ouest du Congo. Il existe deux registres principaux : le ${langName} classique (bolingala ya solo) et le ${langName} courant (mélangé de français), utilisé dans la communication quotidienne. Le corpus Monoko privilégie ce registre courant.

STRUCTURE GRAMMATICALE DE BASE:
Le ${langName} est une langue agglutinante : chaque mot porte plusieurs morphèmes (préfixe + radical + suffixe).
Classes nominales : les noms sont regroupés par classes avec des préfixes (mo-/mi-, li-/ma-, e-/bi-, bo-…).
Conjugaison verbale — préfixe de sujet + radical + suffixe de temps :
  Présent : na-ko-loba (je parle), o-ko-loba (tu parles), a-ko-loba (il/elle), to-ko-loba (nous), bo-ko-loba (vous), ba-ko-loba (ils/elles)
  Passé proche : na-lob-aki, o-lob-aki, a-lob-aki, to-lob-aki, bo-lob-aki, ba-lob-aki
  Futur proche : même forme que le présent — le contexte (lobi = demain, sik'oyo = maintenant) distingue.
  Négation : ajouter "te" en fin de phrase → "nakoloba te" (je ne parle pas).

COMMENT RÉPONDRE:
1. Le corpus ci-dessous est ta source prioritaire — ce sont des paires vérifiées par des experts. Appuie-toi dessus en priorité.
2. Indique ✓ pour les mots/structures tirés directement du corpus.
3. Pour les éléments que tu assembles ou déduis du corpus, indique ~.
4. Si un mot est absent du corpus, utilise ta connaissance du ${langName} pour compléter — tu as le droit de faire une estimation raisonnée. Indique ~ pour ces éléments.
   Mentionne "Corriger" uniquement si ta réponse est incertaine, pour inviter l'utilisateur à contribuer.
5. Réponses courtes, naturelles et chaleureuses.
6. Donne la traduction, puis décompose les mots clés avec leur source.

EXEMPLES DE BONNES RÉPONSES:

Question: "Comment dit-on comment va ton père ?"
Réponse: En ${langName}, tu peux dire : "Tata azali malamu?" ~
- Tata = père ✓ (corpus)
- Azali malamu = il va bien ~ (assemblage de "azali" + "malamu" vérifiés)

Question: "Les pronoms en ${langName}" ou "explique-moi les pronoms"
Réponse: Voici les pronoms personnels en ${langName} :
- Je → Ngai ✓
- Tu → Yo ✓
- Il/Elle → Ye ✓
- Nous → Biso ✓
- Vous → Bino ✓
- Ils/Elles → Bango ✓
(liste les pronoms du corpus directement — ne redirige JAMAIS vers "pose une question spécifique")

Question: "Comment se conjugue 'manger' au présent ?"
Réponse: Le verbe "lya" (manger) au présent :
- Je mange → Nakolya ✓
- Tu manges → Okolya ✓
- Il/elle mange → Akolya ✓
- Nous mangeons → Tokolya ✓
- Vous mangez → Bokolya ✓
- Ils/elles mangent → Bakolya ✓

Question: "Comment dire 'je ne comprends pas' ?"
Réponse: "Nazali koyeba te" ~
- Na- = je ✓, -ko- = présent ✓, -yeba = savoir/comprendre ~, te = négation ✓

Question: "Traduis : nous allons au marché demain"
Réponse: "Tokokende na zandu lobi" ~
- To- = nous ✓, ko- = futur ✓, kende = aller ✓, zandu = marché ✓, lobi = demain ✓

Question: "Comment dire merci ?"
Réponse: "Merci" est couramment utilisé et compris. La forme traditionnelle est "Botondi" ~.
- "Merci" = emprunté du français, intégré au ${langName} courant ✓
- "Botondi" = merci (forme formelle) ~

CE QU'IL FAUT ÉVITER:
- N'invente JAMAIS un mot en ${langName} — si ce n'est pas dans le corpus ci-dessus, ne le propose pas
- Ne marque JAMAIS ✓ sur un mot que tu n'as pas lu mot pour mot dans le corpus
- Ne dis pas "je ne sais pas" si des éléments de réponse sont dans le corpus — utilise ce que tu as
- Ne traite JAMAIS une question de grammaire, conjugaison ou pronoms comme hors-sujet
- Ne dis JAMAIS "je ne traite que des traductions et des phrases" — tu expliques aussi la grammaire
- Ne redirige JAMAIS l'utilisateur vers "pose une question plus spécifique" si le corpus contient des données pertinentes`;

  const context = [ragContext, lessonContext].filter(Boolean).join("\n\n");
  return fixedPrompt + `\n\n=== CORPUS DE RÉFÉRENCE (SOURCE PRIORITAIRE) ===\n${context || "(Aucune donnée trouvée pour cette requête)"}\n=== FIN DU CORPUS ===`;
}

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
  setCorsHeaders(res, req);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = getClientIp(req);
  if (!checkRateLimit(ip, { limit: CHAT_LIMIT, windowMs: CHAT_WINDOW })) {
    return res.status(429).json({ error: "Trop de requêtes. Veuillez patienter quelques minutes." });
  }

  const {
    messages,
    languageId,
    ragContext,
    lessonContext,
    mode,
    direction,
    testerName,
    sessionId,
    userQuery,
    turnNumber,
    tRagMs,
  } = req.body;

  // Input validation
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Missing or invalid messages array" });
  }
  if (messages.length > MAX_MESSAGES) {
    return res.status(400).json({ error: `Too many messages (max ${MAX_MESSAGES})` });
  }
  for (const m of messages) {
    if (typeof m.content === "string" && m.content.length > MAX_MESSAGE_CHARS) {
      return res.status(400).json({ error: `Message too long (max ${MAX_MESSAGE_CHARS} chars)` });
    }
  }
  if (typeof ragContext === "string" && ragContext.length + (lessonContext?.length || 0) > MAX_CONTEXT_CHARS) {
    return res.status(400).json({ error: "Context too large" });
  }

  const langName = LANG_NAMES[languageId] || "Lingala";
  const systemPrompt = buildSystemPrompt(langName, ragContext || "", lessonContext || "", mode || "chat", direction);

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
      lineBuffer = lines.pop();

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
