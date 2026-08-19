# 05 — Pipeline architecture

Type: grilling
Status: closed
Assignee: vkhrystych
Blocked by: 01, 02, 03

## Question

Shape of the CLI pipeline: stages (download → transcribe → score → reframe → caption → cut → pack), the intermediate-artifact layout on disk (job directory per video), and caching so a processed video can be re-cut cheaply ("we already have all the info — crop as many vids as possible" without re-paying for transcription/scoring). Consult `mattpocock-skills:codebase-design`. Output: the locked stage contract and job-dir layout that execution slices build against.

## Resolution

Locked with the driver (round 1 explicit; round 2 defaults accepted when the driver called for build to start):

1. **Stages**: `download → transcribe → score → plan → render`. Planning stages emit only JSON/ASS; `render` is the only expensive stage — re-cut = re-run render. Scene/face analysis runs *inside* `plan`, scoped to picked windows only (scanning a 2.5h video for scenes up front is wasted decode).
2. **Job dir**: `jobs/<video-id>/` (gitignored), fixed artifact names: `source.mp4`, `meta.json`, `transcript.json`, `picks.json`, `plan/<n>.json + <n>.ass`, `clips/<n>-<slug>.mp4`, `review.html`.
3. **Caching**: file-exists = valid. `--force <stage>` deletes that stage's artifacts **and everything downstream** (cascade), then rebuilds.
4. **CLI surface**: single command `reelize <url>` (idempotent; stale stages just rerun) + `--force <stage>`, `--limit N`, `--picks <file>` (inject picks, skips scoring — also the no-API-key demo path).
5. **Monorepo**: root npm workspace; `cli/` (TypeScript), `webapp/` (Vite + React, plain JS — folder reserved, build **out of scope** for this map, Supabase auth belongs to that future effort), `landing/` (static page moves there). Keys via root `.env`.
6. **Python seam**: `plan` shells out to `cli/python/analyze_faces.py` (venv at repo root), JSON in/out; MediaPipe quarantined behind `faces.json`, swappable for LR-ASD later.
7. Degradation: no `ASSEMBLYAI_API_KEY` → transcribe falls back to YouTube json3 auto-captions (no speaker labels); no `ANTHROPIC_API_KEY` → score stage errors cleanly (or use `--picks`); no faces → blurred letterbox per ticket 02.
