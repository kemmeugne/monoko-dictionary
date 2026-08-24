#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const failures = [];
const textFiles = files.filter(file => existsSync(file) && !/\.(?:mp3|wav|zip|xlsx|xls|jpg|jpeg|png|gif|pdf|docx|rtf)$/i.test(file));

function decodeJwtPayload(token) {
  try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")); }
  catch { return null; }
}

for (const file of textFiles) {
  const source = readFileSync(file, "utf8");
  for (const token of source.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || []) {
    if (decodeJwtPayload(token)?.role === "service_role") failures.push(`${file}: committed Supabase service-role JWT`);
  }
  if (/sk-(?:proj-)?[A-Za-z0-9_-]{24,}/.test(source)) failures.push(`${file}: committed OpenAI-style secret`);
  if (/sb_secret_[A-Za-z0-9_-]{20,}/.test(source)) failures.push(`${file}: committed Supabase secret key`);
}

for (const sqlFile of readdirSync("sql").filter(file => file.endsWith(".sql"))) {
  const schema = readFileSync(`sql/${sqlFile}`, "utf8");
  if (/create policy[^;]+(?:on\s+)?corrections[^;]+(?:using|check)\s*\(true\)/is.test(schema)) {
    failures.push(`sql/${sqlFile}: corrections must not have an unconditional browser policy`);
  }
}

const index = readFileSync("index.html", "utf8");
for (const table of ["user_xp_events", "user_progress", "lesson_stage_state", "exercise_attempts", "user_streak", "review_schedule", "level_challenge_state"]) {
  const directWrite = new RegExp(`from\\(["']${table}["']\\)[\\s\\S]{0,80}\\.(?:insert|upsert|update)\\(`);
  if (directWrite.test(index)) failures.push(`index.html: direct competitive write to ${table}`);
}

for (const file of ["api/chat.js", "api/rag-context.js", "api/lesson-context.js", "api/elevenlabs-stt.js", "api/elevenlabs-tts.js", "api/mms-tts.js", "api/corrections.js"]) {
  if (!readFileSync(file, "utf8").includes("authorizeApiRequest")) failures.push(`${file}: missing authenticated quota guard`);
}

for (const file of textFiles.filter(file => file.startsWith("api/") && /\.(?:js|mjs)$/.test(file))) {
  if (file === "api/_supabase.js") continue;
  const source = readFileSync(file, "utf8");
  if (/Authorization\s*:\s*`Bearer \$\{(?:process\.env\.SUPABASE_SERVICE_KEY|serviceKey|key)\}`/.test(source)) {
    failures.push(`${file}: opaque Supabase secret keys must not be sent as bearer tokens`);
  }
}

if (failures.length) {
  console.error(`Guardrails failed:\n- ${[...new Set(failures)].join("\n- ")}`);
  process.exit(1);
}
console.log(`Guardrails passed (${textFiles.length} tracked text files scanned).`);
