# 02 — Active-speaker 9:16 reframing approach

Type: research
Status: resolved

## Question

How do we crop 16:9 source to 9:16 so the frame shows **whoever is talking** (the podcast-with-two-people case), runnable on a solo dev's Mac within an evenings budget? Survey the approaches and recommend one:

1. **Active-speaker-detection models** (TalkNet, Light-ASD / LR-ASD class) — quality, runtime cost, Node/Python interop pain.
2. **Diarization + face heuristic** — diarization says who speaks when; face detection finds faces per scene; match voice turns to face positions and cut the crop between them.
3. **Off-the-shelf tools/APIs** that already do auto-reframe (and their cost/lock-in).

Also answer: what's the sane fallback when no face is detectable (screen share, b-roll)? Prefer the simplest approach that convincingly handles the two-person-podcast case.

## Answer

**Recommended: Option 2 — diarization + per-scene face heuristic.**

1. Voice turns come free from ticket 01's transcription API (AssemblyAI `speaker_labels` / Deepgram diarization return per-word speaker labels) — no new diarization integration, no pyannote.
2. One small Python helper (MediaPipe BlazeFace + scene detection, JSON over stdout, spawned via `child_process`) samples frames at 2–5 fps and emits face boxes with mouth keypoints; everything else stays TypeScript + ffmpeg.
3. For a static two-shot, matching speaker→face is left/right slot assignment, confirmed by mouth-movement variance during each speaker's solo turns (the ClipsAI trick — ClipsAI itself is MIT but unmaintained since 2024-01; use as design reference only). Switch the 9:16 crop per diarized turn, snapped to scene cuts.
4. **No-face fallback (screen share, b-roll):** full-width frame letterboxed over a blurred, zoomed copy of itself — one ffmpeg filtergraph. Center-crop is wrong here (destroys slides).
5. **Upgrade path if the heuristic embarrasses itself:** LR-ASD (MIT, 1.0M params, 94.45 mAP AVA, TalkSet weights for in-the-wild video) — genuinely CPU-runnable but research-grade code with CUDA assumptions; ~2 evenings of productionizing. Off-the-shelf APIs (Klap, Vizard, OpusClip) replace the whole product rather than one step; Vizard's free tier is useful as a quality benchmark.

Known risks: crosstalk, hosts moving/swapping seats, and diarization label errors — the crop is only as correct as the diarizer.

Full research with sources: branch `research/active-speaker-reframing`, file `docs/research/02-active-speaker-reframing.md`.
