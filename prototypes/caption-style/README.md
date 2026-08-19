# PROTOTYPE — caption style picker (wayfinder ticket 04)

Throwaway. Four burned-caption styles on one real clip (Lex #494, "Jensen on
death", 02:17:28–02:18:14), cropped 9:16 per shot, captions burned via
ASS/libass. Switch variants with ←/→ or the floating bar.

## Run

```
node serve.mjs   # → http://localhost:4174 (?variant=A..D)
```

## Variants

- **A punch** — one giant Impact word at a time, pop-in.
- **B karaoke** — 3–4 word chunk, active word pops yellow (CapCut default look).
- **C cleanbox** — phrase-level, mixed case, dim box, no animation.
- **D builder** — line accumulates word by word, newest word green.

## Rebuild from scratch

```
node extract-words.mjs assets/captions.en.json3 8248 8294 > words.json
node gen-captions.mjs                                  # → captions-{A..D}.ass
ffmpeg -i assets/base-916.mp4 -vf ass=captions-A.ass … # per variant
```

## Rendering-path findings (the other half of the ticket)

- **ASS/libass covers every style tested** — per-word timing, karaoke color
  flips, inline scale animation (`\t`), opaque boxes — all in one `-vf ass=`
  pass. drawtext would need one filter instance per word; not viable.
- **Homebrew's default `ffmpeg` formula (v8/v9, 2026) ships WITHOUT libass,
  freetype, or drawtext.** Subtitle burning needs `brew install ffmpeg-full`
  (binary at `/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg`). The pipeline must
  check for the `subtitles`/`ass` filter at startup, not just for ffmpeg.
- ffmpeg 8+ rejects positional filter args in some builds — use
  `-vf ass=filename=…` form defensively.
- Word timings here came from YouTube json3 auto-captions (free, per-word
  offsets, no durations — end = next word's start). AssemblyAI (ticket 01)
  gives true per-word start/end + speaker labels, so real pipeline data is
  strictly better than what these renders used.
- yt-dlp on this machine needed `curl_cffi==0.13` installed into its venv for
  impersonation, and 720p+ formats needed `--cookies-from-browser chrome`
  (PO-token enforcement, Aug 2026).
