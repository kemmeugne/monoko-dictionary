# Monɔkɔ — "Parler avec Monoko" + "Traduction en direct" Improvement Plan

> Audience: an AI agent (or developer) picking up this work. This file is self-contained — read it, then read the file:line references it points to. Code paths are absolute from the repo root.

Last updated: 2026-09-09
Scope: chat (`view === "chat"`) and live translation (`view === "live"`) only. Dictionary, courses, admin, auth are out of scope here.

**Deployment checkpoint (2026-09-09):** Live Translation V2 and privacy-safe
telemetry shipped to production in commit `3182d3c`. Vercel, the complete 322-test
suite and both GitHub Actions jobs passed. The optimized Hugging Face source is
deployed, its pinned runtime is healthy, and CPU Upgrade passed the latency gate.

**Implementation status**: Tier 1 ✅ shipped 2026-04-29. Tier 2 ✅ shipped
2026-04-30. Live Translation V2 is code-complete 2026-09-08; its privacy-safe
telemetry migration was applied on 2026-09-08.

---

## 0. Context an AI needs before editing

- Frontend source is still a single `index.html`, but production is compiled by
  esbuild into `dist/app.js`; use `rg` for symbols because the historical line
  numbers below have moved substantially.
- The chat flow is `sendChat`; search for that symbol and its system prompt.
- The live-translation component is `LiveTranslationView`.
- Lingala TTS helper `lingalaTTS()` calls the HF Space directly, bypassing
  Vercel's function timeout. **Do not move this back behind Vercel.**
- Serverless endpoints in `api/`:
  - `api/chat.js` — gpt-4o-mini SSE proxy, 512 max_tokens. Streams deltas as `data: {"delta":"..."}` events; logs full content + `t_rag_ms` + `t_llm_ms` to `chat_events` after stream ends.
  - `api/rag-context.js` — embedding + `match_parallel_sentences` RPC, threshold 0.3 (configurable via `min_similarity`), top-30.
  - `api/lesson-context.js` — embedding + `match_lesson_items` RPC, threshold 0.4, top-8.
  - `api/elevenlabs-stt.js` — Lingala STT (paid).
  - `api/elevenlabs-tts.js` — Lingala TTS fallback (English-accented, currently unused).
  - `api/mms-tts.js` — proxy + warm-up ping for the HF Space.
  - `api/cron/keep-tts-warm.js` — cron ping to keep HF Space warm (deploys fine; requires Vercel Pro for sub-hourly scheduling).
- TTS Space: `tts_space/app.py`. Source of truth lives in this repo; the HF Space (`Kemz42/monoko-lingala-tts`) is updated by copy-pasting `app.py` into the HF UI and committing. Gradio 6.x — keep `demo.queue()` and the `/gradio_api/call/` prefix.
- All "gotchas" we've already paid for are documented in `CLAUDE.md` — read the "Live Translation + Lingala TTS" section before changing anything in the SSE / Gradio flow.

---

## 1. Observed runtime baseline (2026-04-29, production)

| Endpoint | Warm | Cold | Notes |
|---|---|---|---|
| `/api/rag-context` | ~1.3s | ~3s | OpenAI embed + Supabase RPC |
| `/api/lesson-context` | ~2s | ~3s | Same + lesson expansion |
| `/api/chat` (full RAG) | ~1.2s | n/a | Non-streamed |
| TTS Space, short phrase | ~0.1s | 30–60s | If Space slept, ~30–60s wake-up |
| TTS Space, ~10-word sentence | ~5s | 30–60s | CPU inference |
| End-to-end FR→LN segment | 3–6s | longer if cold | Speak → segment card visible |

The plumbing works. Most remaining wins are **perceived-latency, missing features, and Lingala STT quality** — not infra.

---

## 2. Quick wins (small diff, large UX delta)

### ✅ 2.1 Stream the chat reply — SHIPPED 2026-04-30
- `api/chat.js` now passes `stream: true` to OpenAI and pipes SSE chunks to the client as `data: {"delta":"..."}` events.
- `chat_events` logging happens after the stream ends (full content accumulated before the Supabase write).
- `sendChat` adds an empty assistant placeholder immediately, then consumes the SSE stream with `getReader()`, updating the placeholder on each delta with `setChatMessages(prev => [...prev.slice(0,-1), {role:"assistant", content:snap}])`.
- Loading dots now only show while the placeholder is still empty (`chatMessages[last].content === ""`); they disappear on first token.
- `Corriger` button only appears after streaming is complete (`!chatLoading` guard).

### ✅ 2.2 Automatic Live Translation playback with opt-out — CODE COMPLETE 2026-09-08
- The first autoplay attempt shipped 2026-04-29 and was removed because it lacked
  clear state and user control. V2 restores it as a deliberate interpreter mode:
  automatic playback is on by default, has a visible persistent toggle, and can be
  disabled for reading-only use.
- Lingala synthesis starts immediately after translation, shows "Préparation de
  la voix…", deduplicates concurrent requests and caches completed audio for replay.
- Live Translation and chat now share one bounded, tab-memory-only cache and one
  in-flight request map. Reopening a view or replaying a chat phrase does not repeat
  synthesis, while private conversation text is not persisted.
- Opening Live Translation schedules a fixed `Mbote` synthesis during idle time
  when automatic playback is enabled. The Space itself performs the same fixed
  warm-up at process startup.
- Turning automatic playback off cancels any pending play and avoids synthesis
  until the user explicitly presses the audio button. Text never depends on TTS.

### ✅ 2.3 Pre-warm RAG endpoints on mount — SHIPPED 2026-04-29
- `LiveTranslationView` useEffect fires fire-and-forget POSTs to `/api/rag-context` and `/api/lesson-context` with `{query:"warm", language_id:langId}` alongside the existing TTS Space ping.
- Cuts the ~3s cold-edge-function first-hit for real translations.

### 2.4 Auto-focus chat input on view change
- File: `index.html:1410-1412` already focuses search; mirror it.
- Change: add `useEffect(() => { if (view === "chat") setTimeout(() => inputRef.current?.focus(), 100); }, [view])`.

### 2.5 Persistent contextual chips above the chat input
- File: `index.html:2822-2834` (chips only render when `chatMessages.length === 0`).
- Change: keep one row of chips visible always — `["Décompose la grammaire", "Donne un exemple", "Comment on prononce ?", "Plus simple"]`. Render them above the input pill (`index.html:2887`) so they don't push history offscreen.

### ✅ 2.6 Show retrieved corpus pairs while chat is loading — SHIPPED 2026-04-30
- `searchContext` now returns `{ context, pairs }` — top 3 verified pairs parsed from the formatted RAG string (`• FR → LN [vérifié]` regex).
- `sendChat` sets `chatCorpusPairs` state after RAG resolves; clears it on first streaming token.
- Pairs render above the loading dots (fadeIn, only while placeholder is still empty); disappear instantly when streaming starts.
- Zero extra requests — data already fetched by the RAG call.

---

## 3. Live Translation — smoothness fixes

### ✅ V2 two-speaker workflow — CODE COMPLETE 2026-09-08
- Replaced the direction switch and continuous capture with two explicit speaker
  controls and one phrase per turn.
- Added pipeline states, cancel/retry, text fallback, editable transcript with
  retranslation, normal/slow playback and responsive conversation cards.
- Added default-on automatic result playback with a persistent reading-only opt-out,
  eager Lingala synthesis, visible preparation state and per-session audio caching.
- Context, translation and TTS requests are generation-guarded; stale responses
  cannot reappear after cancel, speaker change, navigation or playback stop.
- Added `api/live-translation-events.js` and
  `sql/live_translation_telemetry.sql`. Only aggregate operational metadata is
  accepted; raw conversation and audio fields are rejected.
- Added Vitest privacy/handler coverage and an authenticated Playwright flow at
  desktop, 390px and 320px, including text translation and transcript correction.

### ✅ 3.1 Replace fixed 6-second Lingala chunking with VAD — SHIPPED 2026-04-30
- Added `startVAD()` / `stopVAD()` using the shared `AnalyserNode` from `startAmplitudeLoop`.
- Polls RMS at 50ms. End-of-utterance: 700ms silence (RMS < 0.01) → `mediaRecorder.stop()`. Hard ceiling at 15s.
- Fallback: if `AudioContext` is unavailable, reverts to old 6s `setTimeout` automatically.
- Both `restartChunk` and `startLingalaSTT` now call `startVAD()` instead of a fixed timer.
- `stopAll` calls `stopVAD()`.

### ✅ 3.2 Real waveform amplitude — SHIPPED 2026-04-29, updated 2026-04-30
- `startAmplitudeLoop(stream)` sets up `AudioContext` + `AnalyserNode`, runs a 60fps RAF loop driving bar heights from real RMS.
- Both French STT and Lingala STT now reuse `liveStreamRef.current` (the persistent mic stream — see Mobile mic stability below). `stopAmplitudeLoop()` no longer stops any tracks; track lifetime is managed by the stream ref.
- `stopAmplitudeLoop()` cancels RAF, closes AudioContext, resets bar heights to 4px.
- Old CSS keyframe animations (`waveA/B/C`) and the `waveBars` config array removed from the component.

### 3.3 Live translation preview while speaking — SUPERSEDED
- File: `index.html:724-744` (FR `recognition.onresult`).
- Today: `liveText` shows interim STT only; translation only fires after 1s pause.
- Change: when `(finalBuffer + interim).length` crosses 12 chars and 1.5s elapsed since last preview call, fire a debounced `/api/chat` with `previewMode:true` (skip RAG, use a tiny prompt) and render its output in a faded segment card. On final commit, replace it with the real translated segment.
- Decision 2026-09-08: do not spend requests on unstable interim speech. V2 shows
  the live transcript, then performs one cancellable corpus-backed translation
  when the speaker finishes. This is clearer and cheaper for a pass-the-phone use case.

### ✅ 3.4 Preserve segments across direction swap — SHIPPED 2026-04-30
- Removed `setSegments([])` from `swapDirection`. Segments persist across swaps, building a single bilingual conversation thread.
- `liveHistoryRef` still resets on swap (translation context is language-specific).
- Note: segment cards still show `sourceLang` from the current direction rather than per-segment direction — will be fixed properly by 3.5.

### ✅ 3.5 Speaker labels and side-aligned bubbles — SHIPPED 2026-04-30
- Segment cards side-align based on `s.fromLingala` (set at translation time, survives direction swaps).
- French-origin segments: left-aligned, white card. Lingala-origin segments: right-aligned, green card.
- Per-segment source label renders `s.fromLingala ? langName : "Français"` — always correct regardless of current direction.
- Screen now reads like a bilingual chat thread between FR and LN speakers.

### ✅ 3.6 Slow-down playback — CODE COMPLETE 2026-09-08
- A single mode control switches all result playback between normal and 0.75x.
- Lingala audio uses `HTMLAudioElement.playbackRate`; French uses the matching
  `SpeechSynthesisUtterance.rate`.

### 3.7 Replay button on the source row
- File: `index.html:1043-1046` (source text rendering).
- Change: if `s.fromLingala` is false, the source was French — re-utter via Web Speech API. If `s.fromLingala` is true, the source was Lingala — re-fetch from `lingalaTTS(s.source)` (cached). Lets the user verify their STT was correct without re-speaking.

---

## 4. "Parler avec Monoko" — close the voice gap

The chat remains keyboard-only, but Lingala fragments in assistant replies can be
played through the shared TTS pipeline.

### 4.1 Mic button inside the chat input pill
- File: `index.html:2887-2898` (input row).
- Change: add a 🎤 inside the input pill. On tap, start `startFrenchSTT` (or detect: if `chatInput` already has Lingala chars, run Lingala STT). On final, set `chatInput` to the transcript — do **not** auto-send. The user can correct then send.
- Reuse the `startFrenchSTT`/`startLingalaSTT` logic from `LiveTranslationView`. Best path: lift them out of the component into module-scope helpers that take a `setText` callback.

### ✅ 4.2 ▶ play button on assistant Lingala phrases — SHIPPED 2026-04-30
- `extractLingalaFragments(text)` parses Lingala from assistant responses: matches after `→`, inside backticks, and inside quotes. Returns an array of fragment strings.
- `playChatLingala(msgIdx)` calls `lingalaTTS` on all fragments from that message, plays them sequentially. `chatPlayingIdx` state tracks which message is currently playing.
- The shared `lingalaAudioCache` and `lingalaAudioRequests` maps avoid duplicate
  synthesis across chat, Live Translation and view remounts.
- 🔊 button shown next to "Corriger" on any assistant message that has fragments and is not currently streaming (`!chatLoading`). Shows a spinner while audio is generating.
- No auto-play — user taps to hear.

### ✅ 4.3 Warm the TTS Space for voice features — SHIPPED 2026-09-08
- Chat retains its lightweight Space ping. Live Translation additionally schedules
  one fixed `Mbote` synthesis during browser idle time when autoplay is enabled.

---

## 5. Quality / accuracy

### 5.1 Restructure the chat system prompt for OpenAI prompt caching
- File: `index.html:1507-1550`.
- Today: the prompt assembles persona + rules + corpus all in one string per request. The corpus changes per query, so the suffix invalidates the cache.
- Change: split into two sections, fixed-first:
  ```
  [persona + rules + examples — same every call, ≥1024 tokens]
  === CORPUS DE RÉFÉRENCE (variable) ===
  ...corpus rows...
  ```
- gpt-4o-mini auto-caches prefixes ≥1024 tokens. Persona block currently is ~1.3k tokens — already long enough. Just make sure no per-query data leaks into the prefix (it doesn't today, but verify after editing).
- Effect: ~50% input-token cost reduction after first call; ~100–300ms TTFT savings.

### 5.2 Bump conversation history from 6 to 12
- File: `index.html:1557` (`newMessages.slice(-6)`).
- After 5.1, input cost is mostly cached, so doubling history is cheap. Long conversations (the natural use case for an AI tutor) currently lose context fast.

### ✅ 5.3 Conversation memory in Live Translation — UPDATED 2026-09-08
- `liveHistoryRef` (useRef) stores last 4 turns (8 messages, `.slice(-8)`).
- Each `/api/chat` call receives `[...liveHistoryRef.current.slice(-8), {role:"user", content:sourceText}]`.
- History updated after each successful translation: pushes user + assistant messages, slices to 8.
- V2 preserves history while speakers alternate direction. Editing an earlier
  transcript resets history before retranslation so stale wording is not reused.

### ✅ 5.4 Per-mode RAG similarity threshold — SHIPPED 2026-04-30
- `api/rag-context.js` now accepts optional `min_similarity` in the request body (defaults to `SIMILARITY_THRESHOLD = 0.3`).
- `handleTranslate` in `LiveTranslationView` sends `min_similarity: 0.5` — only near-exact corpus pairs for live translation.
- Chat (`sendChat`) sends no `min_similarity` — keeps the broad 0.3 threshold for grammar discussions.

### ✅ 5.5 Measure Lingala STT before fine-tuning — PILOT COMPLETE 2026-09-09
- The deterministic 25-clip professor benchmark completed with 25/25 successful
  Scribe v2 requests: 48.6% WER, 7.0% accent-insensitive CER, 669 ms median and
  915 ms p95 API latency.
- The WER/CER gap is mostly orthographic word-boundary variation. Twelve of 25
  transcripts are character-perfect when spaces are ignored; 18/25 are at or
  below 10% CER. This is adequate to retain Scribe for editable live translation,
  but not for automatic pronunciation pass/fail scoring.
- Audit likely audio/reference mismatches (begin with `B-D63`), then expand to
  100 clips and add ordinary phone recordings from several speakers. Fine-tune
  only if the cleaned broader benchmark still fails the product gate.
- `npm run benchmark:stt -- --report-only` regenerates JSON, CSV and the local
  audio-enabled HTML review without sending recordings to ElevenLabs again.
- Future opt-in user mic capture still requires explicit consent, retention rules
  and a privacy notice before any blob is stored for training.

### ⚠ 5.6 TTS warm-up — VIEW PING SHIPPED; CRON NOT CONFIGURED
- `api/cron/keep-tts-warm.js` — pings `${MMS_SPACE_URL}/` with an 8s timeout, returns `{status: "ok"|"loading"|"warming"}`.
- `api/cron/keep-tts-warm.js` exists, but `vercel.json` currently has no cron
  declaration. The view-level GET ping remains active.
- A sub-hourly Vercel cron requires a suitable paid plan. Until that decision,
  low-traffic periods still carry the HuggingFace cold-start risk.

### ✅ 5.7 Add latency telemetry to `chat_events` — SHIPPED 2026-04-30
- `sendChat` measures RAG duration client-side with `performance.now()` and passes `tRagMs` in the `/api/chat` request body.
- `api/chat.js` measures LLM stream duration server-side (`Date.now() - streamStart`) and writes both as `t_rag_ms` + `t_llm_ms` to `chat_events`.
- SQL migration applied: `sql/chat_events_latency.sql` — adds `t_rag_ms integer` and `t_llm_ms integer` columns to `chat_events` (`IF NOT EXISTS`). File also contains ready-to-run p50/p95 queries.

### ✅ Mobile mic stability fix — SHIPPED 2026-04-30
- **Problem**: on iOS/Android, every `getUserMedia` call triggers a permission re-prompt or AudioContext glitch after the first stop/restart cycle, causing the mic to silently stop delivering audio.
- **Fix**: `liveStreamRef = useRef(null)` holds the `MediaStream` for the lifetime of the `LiveTranslationView` component. `startLingalaSTT` and `startFrenchSTT` both check `liveStreamRef.current` first; only call `getUserMedia` if no live stream exists. Track teardown only happens on component unmount (cleanup `useEffect`).
- `stopAmplitudeLoop` no longer stops any tracks — it only cancels the RAF loop and closes the AudioContext. This removes the main source of accidental track termination between chunks.

---

## 6. Strategic moves (bigger lifts, higher upside)

### 6.1 Merge the two screens into one "Conversation" feature
- Today: "Parler avec Monoko" (text chat) and "Traduction en direct" (mic + translate) are separate menu items at `index.html:2008-2009`.
- Pitch: one feature, two modes (Type / Speak). In Speak mode + "Monoko reply on" toggle, Monoko participates as a speaker — user speaks French, Monoko speaks back in Lingala. That's the killer demo for an African-language AI tutor.
- This is also the natural home for everything in §3 and §4.

### 6.2 Export / share conversation
- New: "Exporter" action on both screens. Plain text + a sharable PNG of the conversation card. Free virality, no infra cost.

### 6.3 Spaced repetition seeded from corrections
- Phase 3 of `ROADMAP.md` already plans SR. Pulling forward the seeding side is cheap: every "Corriger" submission queues a flashcard for that user. Daily home shortcut. Closes the loop on the corrections people are already producing.

---

## 7. Execution status

| # | Status | Effort | Impact | Notes |
|---|---|---|---|---|
| ✅ 2.2 Automatic result playback | Code complete 2026-09-08 | S | High | Default on; persistent opt-out; eager synthesis + cache |
| ✅ 2.3 Pre-warm RAG endpoints | Shipped 2026-04-29 | XS | High | On LiveTranslationView mount |
| ✅ 3.2 Real waveform | Shipped 2026-04-29 | S | Medium | AnalyserNode RAF loop, both STT modes |
| ✅ 5.6 Cron TTS warm-up | Shipped 2026-04-29 | XS | High | Needs Vercel Pro for */9 schedule |
| ✅ 3.1 VAD chunking | Shipped 2026-04-30 | M | High | 700ms silence, 15s ceiling, fallback timer |
| ✅ 5.3 LT conversation memory | Shipped 2026-04-30 | S | Medium | liveHistoryRef, last 4 turns, resets on swap |
| ✅ 5.4 Per-mode RAG similarity | Shipped 2026-04-30 | XS | Medium | LT sends 0.5, chat keeps 0.3 |
| ✅ 2.1 Stream chat reply | Shipped 2026-04-30 | M | Very high | SSE stream, loading dots hide on first token |
| ✅ 3.4 Preserve segments on swap | Shipped 2026-04-30 | XS | High | Removed `setSegments([])` from `swapDirection` |
| ✅ 3.5 Speaker-labelled bubbles | Shipped 2026-04-30 | S | High | FR left (white), LN right (green), per-segment label |
| 2.4 Auto-focus chat input | Pending | XS | Low | |
| 2.5 Persistent chat chips | Pending | XS | Low | |
| ✅ 2.6 Show corpus in loader | Shipped 2026-04-30 | S | Medium | Pairs parsed from RAG, fade in above dots |
| 4.1 Mic button in chat | Skipped | M | High | Token cost concern — revisit when monetised |
| ✅ 4.2 ▶ on assistant Lingala | Shipped 2026-04-30 | M | High | `extractLingalaFragments` + shared audio cache |
| ✅ 4.3 Warm Space on chat mount | Shipped 2026-04-30 | XS | Medium | Fires on view === "chat" change |
| ✅ 5.1 Prompt cache restructure | Shipped 2026-04-30 | S | Medium (cost) | Fixed prefix expanded to ≥1024 tokens, corpus appended after |
| ✅ 5.2 12-turn chat history | Shipped 2026-04-30 | XS | Medium | slice(-12) |
| ✅ 5.7 Latency telemetry | Shipped 2026-04-30 | S | Medium | t_rag_ms + t_llm_ms; SQL migration applied |
| ✅ Mobile mic stability | Shipped 2026-04-30 | S | High | liveStreamRef — persistent stream, no re-prompt on restart |
| 3.3 Live translation preview | Pending | M | Medium | AbortController, debounced preview |
| ✅ 3.6 Slow-down playback | Code complete 2026-09-08 | XS | Low-Medium | 0.75x playbackRate button |
| ✅ TTS cache + inference warm-up | Code complete 2026-09-08 | S | High | Shared bounded cache; fixed warm-up; CPU/GPU-aware Space |
| 3.7 Replay source button | Pending | XS | Low-Medium | Re-utter or re-fetch source audio |
| 6.x Strategic | Pending | L | Very high | Merge chat+LT, export, SR |

---

## 8. Things to NOT change

- The direct-from-browser `lingalaTTS()` call. Vercel's 10s timeout makes routing it through `/api/mms-tts` for actual synthesis a regression. Keep the proxy only for the warm-up GET ping.
- Gradio 6.x specifics in `tts_space/app.py` and `lingalaTTS()`: `demo.queue()`, `/gradio_api/call/` prefix, SSE `getReader()` (never `.text()`), `event: complete` parsing. Each of these has a documented past failure in `CLAUDE.md`.
- Auth gating logic at `index.html:1341-1402`. It's stable and not on this scope.
- The corpus-first / "✓ vs ~" / "do not invent words" rules in the system prompt at `index.html:1540-1546`. They were tuned against `monoko_auto_test.py` and the auto-test corpus — touch only with that test re-run.

### Paid TTS decision ladder

Hugging Face bills upgraded Spaces while they are starting or running. At published
rates, CPU Upgrade is `$0.03/hour` (about `$21.60/month` if always on) and a small
Nvidia T4 is `$0.40/hour` (about `$288/month` if always on). Start with CPU Upgrade,
collect warm p50/p95 `tts_ms`, and keep it only if it materially improves the current
~7.2s short-phrase baseline. Trial T4 only if CPU misses the target. Configure sleep
for low traffic only if the lower bill is worth reintroducing cold starts.

Sources: [Spaces overview](https://huggingface.co/docs/hub/spaces-overview),
[GPU hardware](https://huggingface.co/docs/hub/spaces-gpus), and
[Hugging Face pricing](https://huggingface.co/pricing).

### CPU Basic baseline (2026-09-09)

Run `npm run benchmark:tts` to exercise the same Gradio event API as the browser,
download every result and validate its RIFF/WAVE metadata. Two sequential warm
passes over eight phrases produced 16/16 valid 44.1 kHz WAV files. Combined
ready-time median was about 3.7s and p95 was 8.3s; short phrases were generally
2.2-3.7s and the longest phrases 4.0-8.3s. Audio downloads added only 88-343ms,
so synthesis rather than transfer is the dominant cost. Use this exact workload
for the CPU Upgrade comparison.

### CPU Upgrade decision (2026-09-09)

The same benchmark was run twice after moving the Space from CPU Basic
(2 vCPU / 16 GB) to CPU Upgrade (8 vCPU / 32 GB). It again produced 16/16 valid
44.1 kHz WAV files, with a combined 0.93s median and 2.20s p95. Relative to CPU
Basic, median ready time fell by about 75% and p95 by about 73%. This comfortably
clears the 2.5s median / 5s p95 retention targets, so CPU Upgrade is the selected
production tier. At $0.03/hour, the maximum continuous monthly cost is about
$21.60; the configured inactivity sleep policy still controls when billing stops.
Do not trial a T4 for the current workload because the CPU result already meets
the product target.

### Next execution order

1. Keep monitoring production `tts_ms` and failures from
   `live_translation_events`; CPU Upgrade is the selected tier and no T4 trial is
   currently warranted.
2. Have the professor audit the worst 25-clip benchmark rows, beginning with
   `B-D63`, then expand the clean benchmark to 100 clips and multiple speakers.
3. With a separate upload authorization, compare baseline Scribe with a global
   Lingala keyterm list. Decide on STT fine-tuning only after those two controls.

---

## 9. Files an agent will likely touch

- `index.html` — all UI changes (sections 2, 3, 4).
- `api/chat.js` — streaming (2.1), telemetry columns (5.7).
- `api/rag-context.js` — `min_similarity` parameter (5.4).
- `api/cron/keep-tts-warm.js` — new file (5.6).
- `vercel.json` — cron schedule entry (5.6).
- `sql/` — new migration `chat_events_latency.sql` for 5.7.
