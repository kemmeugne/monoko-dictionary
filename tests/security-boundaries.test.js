import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("production trust boundaries", () => {
  it("keeps corrections private from browser roles", () => {
    const schema = read("sql/security_hardening.sql");
    expect(schema).toContain('drop policy if exists "Public read" on corrections');
    expect(schema).toContain('drop policy if exists "Public insert" on corrections');
    expect(schema).not.toMatch(/create policy[^;]+corrections[^;]+(?:using|check)\s*\(true\)/is);
  });

  it("removes direct XP writes and exposes trusted session RPCs", () => {
    const schema = read("sql/security_hardening.sql");
    const app = read("index.html");
    expect(schema).toContain("create or replace function record_learning_session");
    expect(schema).toContain("create or replace function record_level_challenge_session");
    expect(app).not.toMatch(/from\(["']user_xp_events["']\)[\s\S]{0,80}\.insert\(/);
    expect(app).toContain('rpc("record_learning_session"');
  });

  it("enforces country immutability in PostgreSQL", () => {
    expect(read("sql/security_hardening.sql")).toContain("create trigger profiles_country_immutable");
  });

  it("keeps live translation telemetry free of conversation content", () => {
    const schema = read("sql/live_translation_telemetry.sql");
    const endpoint = read("api/live-translation-events.js");
    expect(schema).toContain("alter table live_translation_events enable row level security");
    expect(schema).not.toMatch(/^\s*(transcript|translation_text|source_text|audio_data|prompt)\s+/im);
    expect(endpoint).toContain('"transcript"');
    expect(endpoint).toContain('"translation"');
    expect(endpoint).toContain("FORBIDDEN_FIELDS");
  });
});
