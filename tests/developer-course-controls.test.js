import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = source.indexOf("const developerLessonTarget");
const end = source.indexOf("const earnedMedals", start);

if (start < 0 || end < 0) throw new Error("developer lesson target helper not found");

const developerLessonTarget = new Function(
  `${source.slice(start, end)} return developerLessonTarget;`
)();

const lessons = [10, 11, 12].map(id => ({ lesson: { id } }));

describe("developer course controls", () => {
  it("advances only the next incomplete lesson", () => {
    expect(developerLessonTarget(lessons, new Set([10]), 11)).toBe(2);
  });

  it("rejects completed and locked lessons", () => {
    const progress = new Set([10]);
    expect(developerLessonTarget(lessons, progress, 10)).toBeNull();
    expect(developerLessonTarget(lessons, progress, 12)).toBeNull();
  });

  it("has no completion target after the full trail", () => {
    expect(developerLessonTarget(lessons, new Set([10, 11, 12]), 12)).toBeNull();
  });

  it("keeps the completion command behind the developer gate", () => {
    expect(source).toContain('isDeveloper && !completed && <button className="m-developer-complete"');
    expect(source).toContain("Simuler la prochaine leçon");
  });
});
