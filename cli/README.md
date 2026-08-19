# reelize CLI

YouTube URL in → pack of vertical 9:16 clips with burned karaoke captions out.

```
npm install                       # from repo root
cd cli
npm run reelize -- "https://www.youtube.com/watch?v=<id>" [options]
```

Options:

- `--force <stage>` — re-run a stage and everything after it (`download`, `transcribe`, `score`, `plan`, `render`)
- `--limit <n>` — only plan/render the top n picks
- `--picks <file>` — inject a picks.json, skip Claude scoring
- `--jobs <dir>` — jobs directory (default `./jobs`; use `--jobs ../jobs` from `cli/`)

Environment (root `.env` or exported):

- `ANTHROPIC_API_KEY` — moment scoring (Claude). Without it, `score` fails cleanly; use `--picks`.
- `ASSEMBLYAI_API_KEY` — optional; per-word transcript with speaker labels. Without it, falls back to YouTube auto-captions (no speakers, rougher word ends).

## Stages and artifacts (`jobs/<video-id>/`)

| Stage | Artifacts | Notes |
|---|---|---|
| download | `source.mp4`, `meta.json`, `captions.en.json3` | yt-dlp, Chrome impersonation; retries with `--cookies-from-browser chrome` |
| transcribe | `transcript.json` (+`audio.m4a` when AssemblyAI) | per-word `{start,end,text,speaker?}` |
| score | `picks.json` | rubric v2.1 (`prompts/SCORING_PROMPT.md`), claude-opus-5 |
| plan | `plan/<rank>.json`, `plan/<rank>.ass` | scene cuts + MediaPipe faces → crop plan; style-B karaoke ASS |
| render | `clips/*.mp4`, `review.html` | one ffmpeg pass per clip: per-scene crop/letterbox → concat → libass burn |

Caching is file-exists: delete an artifact (or `--force` its stage) to rebuild. Force cascades downstream.

## System dependencies

- **ffmpeg with libass** — `brew install ffmpeg-full` (homebrew's plain `ffmpeg` has *no* subtitle filters; the CLI probes for the `ass` filter and errors if absent)
- **yt-dlp** with `curl_cffi` in its venv for impersonation (`pip install "curl_cffi==0.13"` into yt-dlp's libexec)
- **Python venv** at repo root `cli-py-venv/` with `mediapipe` + `opencv-python` for face detection (`python3 -m venv cli-py-venv && cli-py-venv/bin/pip install mediapipe opencv-python`); without it, all scenes render as blurred letterbox
