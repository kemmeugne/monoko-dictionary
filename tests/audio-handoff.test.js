/**
 * The screen-boundary audio rule.
 *
 * There is ONE shared <audio> element, so `playClip` stops whatever is already
 * sounding. Every exercise screen therefore has to wait for its clip before
 * handing over to the next screen — otherwise the professor gets cut off
 * mid-word and the next prompt talks over the answer the learner just earned.
 * That bug shipped once (the last match-pairs word came out as "Qu'est-ce que
 * vous entendez ?"), so the timing logic is tested rather than eyeballed.
 *
 * Extracted from index.html the same way as the other engine tests.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, "index.html"), "utf8");

const a = src.indexOf("// ── Exercise engine ─");
const b = src.indexOf("// ── Match-pairs screen");
if (a < 0 || b < 0) throw new Error("engine markers not found in index.html");

const { afterClip, playingClip, playClip, clipPool, HANDOFF_MIN, HANDOFF_MAX } =
  new Function("Audio", src.slice(a, b) + `
    return { afterClip, playingClip, playClip, clipPool, HANDOFF_MIN, HANDOFF_MAX };`
  )(class {});

// Stand-in for HTMLAudioElement: fires `ended` only when told to.
const fakeAudio = ({ duration = 1, currentTime = 0, paused = false } = {}) => {
  const listeners = {};
  return {
    duration, currentTime, paused, ended: false,
    addEventListener: (k, f) => (listeners[k] ||= []).push(f),
    removeEventListener: (k, f) => { listeners[k] = (listeners[k] || []).filter(x => x !== f); },
    end() { this.ended = true; this.paused = true; (listeners.ended || []).forEach(f => f()); },
    listenerCount: () => (listeners.ended || []).length,
  };
};

describe("afterClip — never hand over while the professor is still talking", () => {
  it("waits for the clip instead of a fixed timer", async () => {
    vi.useFakeTimers();
    const audio = fakeAudio({ duration: 2.5 });
    const done = vi.fn();
    afterClip(audio, done);

    vi.advanceTimersByTime(1000);          // well past the old 420ms hand-off
    expect(done).not.toHaveBeenCalled();

    audio.end();
    vi.advanceTimersByTime(300);           // the beat after the voice
    expect(done).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("removes its listener once it has fired", () => {
    vi.useFakeTimers();
    const audio = fakeAudio({ duration: 1 });
    afterClip(audio, () => {});
    audio.end();
    vi.advanceTimersByTime(300);
    expect(audio.listenerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("still hands over when the clip never loads — no stranded session", () => {
    // `ended` never fires for a clip that failed to load, so the safety net is
    // the only thing between the learner and a permanently frozen screen.
    vi.useFakeTimers();
    const done = vi.fn();
    afterClip(fakeAudio({ duration: NaN }), done);
    vi.advanceTimersByTime(HANDOFF_MIN * 2 + 100);
    expect(done).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("caps the wait near the clip's own duration", () => {
    vi.useFakeTimers();
    const done = vi.fn();
    afterClip(fakeAudio({ duration: 0.8 }), done);   // plays but never reports `ended`
    vi.advanceTimersByTime(2000);
    expect(done).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("never fires twice when `ended` and the ceiling race", () => {
    vi.useFakeTimers();
    const done = vi.fn();
    const audio = fakeAudio({ duration: 0.3 });
    afterClip(audio, done);
    vi.advanceTimersByTime(100);
    audio.end();
    vi.advanceTimersByTime(5000);
    expect(done).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("uses the caller's floor when there is no clip at all", () => {
    // A pool row without a recording still gets its reveal beat.
    vi.useFakeTimers();
    const done = vi.fn();
    afterClip(null, done, 620);
    vi.advanceTimersByTime(500);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(done).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("uses the floor when the clip has already finished", () => {
    // choose-the-audio: the learner may answer long after the clip ended, and
    // waiting on an `ended` event that has already been and gone would hang.
    vi.useFakeTimers();
    const done = vi.fn();
    const audio = fakeAudio({ duration: 1 });
    audio.end();
    afterClip(audio, done, 620);
    vi.advanceTimersByTime(700);
    expect(done).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("playingClip — what is actually sounding right now", () => {
  const url = "https://r2.test/clip.mp3";

  it("is null before anything plays, and for a null url", () => {
    expect(playingClip(null)).toBe(null);
    expect(playingClip("https://r2.test/never-played.mp3")).toBe(null);
  });

  it("reports a clip that is sounding, so it is not restarted mid-word", () => {
    const audio = fakeAudio({ duration: 1 });
    clipPool.set(url, audio);
    playClip(url);
    expect(playingClip(url)).toBe(audio);
  });

  it("is null once the clip has ended, so the caller replays it instead", () => {
    const audio = fakeAudio({ duration: 1 });
    clipPool.set(url, audio);
    playClip(url);
    audio.end();
    expect(playingClip(url)).toBe(null);
  });
});
