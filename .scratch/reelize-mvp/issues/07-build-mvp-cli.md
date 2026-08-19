# 07 — Build the MVP CLI

Type: task
Status: closed
Assignee: vkhrystych
Blocked by: 05

## Question

Execute the locked architecture from [05 — Pipeline architecture](05-pipeline-architecture.md): monorepo restructure + `reelize <url>` with all five stages, degradation paths, and a demo run on Lex #494. (Execution override in map Notes — the map carries the build.)

## Resolution

Built on branch `mvp/cli`. Monorepo restructured (root workspace; `cli/` TS, `webapp/` stub, `landing/`); `reelize <url>` implemented with all five stages, file-exists caching, cascading `--force`, `--limit`, `--picks`, root-`.env` loading. Typechecks clean.

**Verified on a real clip** (46s Jensen-on-death segment as local job `demo-local1`): scene detection found the real cut, MediaPipe put the crop on Lex then Jensen (centers 487→821), style-B karaoke captions burned via libass, 1080×1920 output + review.html emitted. Caching + `--force plan` cascade exercised across three runs.

**Known gaps, deliberate:**
1. `download` stage code-complete but not end-to-end-verified this session: `--cookies-from-browser chrome` blocks on a Keychain dialog in non-interactive shells, and retry attempts got the IP temporarily 429'd by YouTube. It works from the driver's own terminal (Keychain prompt clickable; same command succeeded earlier in-session). First real run should be driver-at-keyboard.
2. `score` stage untested against the live API (no `ANTHROPIC_API_KEY` on this machine) — the prompt + parsing mirror the validated ticket-03 prototype; `--picks` covers until a key lands in `.env`.
3. Crop is per-scene largest-face; voice-turn switching within a scene (ticket 02's full design) is future refinement.
