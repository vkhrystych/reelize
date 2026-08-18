# Reelize — domain glossary

- **Job** — all work and artifacts for one source video; lives in `jobs/<video-id>/`. One job per YouTube video, re-runs land in the same directory.
- **Stage** — one step of the pipeline: `download → transcribe → score → plan → render`. A stage owns named artifacts in the job dir; an existing artifact means the stage is done (file-exists caching).
- **Artifact** — a file a stage produces (`source.mp4`, `transcript.json`, `picks.json`, `plan/*`, `clips/*`, `review.html`). Artifacts are the only interface between stages.
- **Pick** — one moment the scorer selected: start/end timestamps, hook line, title, 4-axis scores (hook, self-contained, payoff, charge), composite. Lives in `picks.json`.
- **Plan** — the cheap JSON+ASS description of how one pick becomes a clip: scene list with crop decisions, plus the caption file. No pixels are touched while planning.
- **Scene** — a shot between two cuts inside a pick's window. Each scene gets either a face-centered 9:16 crop or a blurred letterbox (no face found).
- **Clip** — a rendered vertical 9:16 mp4 with burned captions, in `clips/`. The product's output unit.
- **Re-cut** — re-running only `plan`/`render` on an already-processed job (new caption style, new crop logic) without re-paying for download, transcription, or scoring.
- **Force (cascade)** — `--force <stage>` deletes that stage's artifacts *and every downstream stage's*, so file-exists caching stays honest.
- **Review page** — `review.html` in the job dir: every clip with 🔥/🤔/🗑 verdict buttons and JSON export; the human evaluation step after each run.
- **Driver** — the human running the map/CLI and judging output ("would post").
