# Reelize MVP — wayfinder map

Label: wayfinder:map

## Destination

A working local CLI (TypeScript) that takes a YouTube URL and outputs a pack of vertical 9:16 clips with burned-in captions and active-speaker framing (the crop shows whoever is talking). Shipped = the map's driver has run 3+ real videos through it and would genuinely post the output.

## Notes

- **Execution override**: this map carries execution — the MVP is built and shipped through the map, not just specced.
- Solo side project, a few evenings a week. TypeScript-first.
- ~$1/video in API costs is acceptable (transcription + Claude scoring). Evenings are scarcer than dollars.
- yt-dlp for ingestion is an accepted risk (own-content positioning per the landing page).
- The crux is **moment scoring** — whether AI finds moments genuinely worth clipping. Everything else is plumbing.
- Skills to consult: `mattpocock-skills:codebase-design` for the pipeline-architecture ticket; `mattpocock-skills:prototype` for prototype tickets; `mattpocock-skills:tdd` once execution slices start.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [01 — Transcription API choice](issues/01-transcription-api-choice.md) — AssemblyAI (per-word timestamps + per-word speaker labels in one call, ~$0.23/hr); fallback Deepgram Nova-3. Full findings on branch `research/transcription-api-choice`. *Revised 2026-08-18 in build: YouTube json3 auto-captions are the free default and prove sufficient for captions; AssemblyAI stays as the opt-in upgrade, needed when active-speaker cropping in static shots (diarization) or non-YouTube input arrives.*
- [02 — Active-speaker 9:16 reframing](issues/02-active-speaker-reframing.md) — diarization (free from ticket 01) + per-scene face heuristic via a small MediaPipe Python helper; crop switches per voice turn, snapped to scene cuts; no-face segments get blurred-letterbox, not center-crop; LR-ASD is the upgrade path. Findings on branch `research/active-speaker-reframing`.
- [03 — Moment scoring: does AI find moments worth clipping?](issues/03-moment-scoring-prototype.md) — **validated, the crux holds**: 8/10 picks got "would post" from the driver on a real 2.5h video. Rubric v2.1 (4 axes, Charge ≥ 4 hard floor) + driver-set policy (clips 15–60s, never a single phrase, 8–12 per video) in `prototypes/moment-scoring/SCORING_PROMPT.md` on branch `prototype/moment-scoring`.
- [04 — Burned-caption style and rendering path](issues/04-caption-style.md) — style B "karaoke highlight" (3–4 word uppercase chunks, active word yellow + 106%); rendered via ASS/libass (`-vf ass=`), spec + emitter on branch `prototype/caption-style`. Caveat: needs `ffmpeg-full` — homebrew's default ffmpeg lacks subtitle filters.
- [05 — Pipeline architecture](issues/05-pipeline-architecture.md) — `download → transcribe → score → plan → render`; `jobs/<video-id>/` with fixed artifact names; file-exists caching + cascading `--force`; single `reelize <url>` command; monorepo `cli/` (TS) + `webapp/` (reserved, out of scope) + `landing/`; MediaPipe behind a Python subprocess seam.
- [07 — Build the MVP CLI](issues/07-build-mvp-cli.md) — built on branch `mvp/cli`, verified on a real clip (crop follows speaker across scene cut, karaoke captions burned). Gaps: `download` needs a driver-at-keyboard run (Keychain), `score` needs `ANTHROPIC_API_KEY` in `.env`.

## Not yet specified

- **Speaker framing edge cases** — crosstalk, hosts moving/swapping seats, diarization label errors (crop is only as correct as the diarizer); sharpens once the heuristic from ticket 02 runs on real footage.
- **Caption edge cases** — crosstalk, music, non-speech segments; depends on transcription API choice.

## Out of scope

- **Self-serve web app, auth, payments, waitlist hookup** — destination is a local CLI proven on real videos; the product shell is a future effort. *Update 2026-08-18: driver pulled a first webapp forward anyway (branch `mvp/cli`: Vite+React in `webapp/`, local API in `cli/src/server.ts`, Supabase wired with dev-mode bypass, simulated token ledger). Productionizing it (real auth enforcement, payments, hosting) still needs its own map.*
- **Publishing/scheduling to TikTok/Shorts/Reels** — Reelize outputs files; posting stays manual.
- **Deployment / running the pipeline anywhere but the driver's machine** — past the destination.
