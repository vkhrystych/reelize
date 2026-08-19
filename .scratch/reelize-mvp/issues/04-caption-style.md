# 04 — Burned-caption style and rendering path

Type: prototype
Status: closed
Assignee: vkhrystych
Blocked by: 01

## Question

What do the burned-in captions look like, and how are they rendered? Decide:

1. **Style**: word-by-word karaoke pop vs. line-level; font, size, position, highlight color — prototype a few looks on a real frame for the driver to react to.
2. **Rendering path**: ffmpeg drawtext vs. ASS/libass subtitles vs. compositing — constrained by the word-timing data shape the chosen transcription API (ticket 01) returns.

## Resolution

Prototyped 4 styles burned onto a real 9:16 clip from Lex #494 (punch / karaoke-highlight / clean-box / builder); driver picked from the live picker.

1. **Style: B — karaoke highlight.** 3–4 word uppercase chunks (broken at sentence punctuation, >0.8s gaps, or 4 words), whole chunk visible, active word yellow (#FDD017) and scaled to 106%. Reference spec: Arial Black 80px at 1080×1920 PlayRes, white fill, black outline 10 + shadow 4, bottom-center, MarginV 470. Exact ASS emitter in `prototypes/caption-style/gen-captions.mjs` (variant B).
2. **Rendering path: ASS/libass** (`ffmpeg -vf ass=filename=…`). One subtitle file covers per-word color/scale animation natively; drawtext would need a filter instance per word. Word timing maps 1:1 from AssemblyAI's per-word start/end (prototype used json3 auto-captions, which are strictly worse — end times were inferred).
3. **Toolchain caveat**: homebrew's default `ffmpeg` formula has **no** subtitle filters — the pipeline must use/probe for `ffmpeg-full` (see prototype README).

Asset: prototype on branch `prototype/caption-style` (`prototypes/caption-style/` — picker: `node serve.mjs` → http://localhost:4174; heavy media gitignored, README has the rebuild steps).
