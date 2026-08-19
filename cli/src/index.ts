#!/usr/bin/env tsx
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { JobPaths, Options } from "./lib/types.ts";
import { log } from "./lib/run.ts";
import { download } from "./stages/download.ts";
import { transcribe } from "./stages/transcribe.ts";
import { score } from "./stages/score.ts";
import { plan } from "./stages/plan.ts";
import { render } from "./stages/render.ts";

// load the repo-root .env (keys only; never overrides the real environment)
const envFile = join(dirname(fileURLToPath(import.meta.url)), "../../.env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (m && m[2] && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const STAGES = ["download", "transcribe", "score", "plan", "render"] as const;
type StageName = (typeof STAGES)[number];

/** Artifacts owned by each stage — what a cascading --force deletes. */
const ARTIFACTS: Record<StageName, (p: JobPaths) => string[]> = {
  download: (p) => [p.source, p.meta, p.captionsJson3],
  transcribe: (p) => [p.transcript, join(p.dir, "audio.m4a")],
  score: (p) => [p.picks],
  plan: (p) => [p.planDir],
  render: (p) => [p.clipsDir, p.review],
};

function usage(): never {
  console.log(`reelize — YouTube video in, pack of captioned 9:16 clips out

Usage: reelize <youtube-url> [options]

Options:
  --force <stage>   re-run a stage and everything after it (${STAGES.join(", ")})
  --limit <n>       only plan/render the top n picks
  --picks <file>    inject a picks.json and skip Claude scoring
  --jobs <dir>      jobs directory (default: ./jobs)

Env: ANTHROPIC_API_KEY (scoring), ASSEMBLYAI_API_KEY (optional, better transcripts)`);
  process.exit(1);
}

function parseArgs(argv: string[]): { url: string; jobsDir: string; opts: Options } {
  let url: string | null = null;
  let jobsDir = "jobs";
  const opts: Options = { force: null, limit: null, picksFile: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") opts.force = argv[++i];
    else if (a === "--limit") opts.limit = Number(argv[++i]);
    else if (a === "--picks") opts.picksFile = resolve(argv[++i]);
    else if (a === "--jobs") jobsDir = argv[++i];
    else if (a.startsWith("-")) usage();
    else url = a;
  }
  if (!url) usage();
  if (opts.force && !STAGES.includes(opts.force as StageName)) {
    console.error(`unknown stage "${opts.force}" — expected one of: ${STAGES.join(", ")}`);
    process.exit(1);
  }
  return { url, jobsDir, opts };
}

function videoId(url: string): string {
  const m =
    url.match(/[?&]v=([\w-]{11})/) ??
    url.match(/youtu\.be\/([\w-]{11})/) ??
    url.match(/^([\w-]{11})$/);
  if (!m) {
    console.error(`cannot extract a YouTube video id from "${url}"`);
    process.exit(1);
  }
  return m[1];
}

async function main(): Promise<void> {
  const { url, jobsDir, opts } = parseArgs(process.argv.slice(2));
  const id = videoId(url);
  const dir = resolve(jobsDir, id);
  await mkdir(dir, { recursive: true });

  const paths: JobPaths = {
    dir,
    source: join(dir, "source.mp4"),
    meta: join(dir, "meta.json"),
    captionsJson3: join(dir, "captions.en.json3"),
    transcript: join(dir, "transcript.json"),
    picks: join(dir, "picks.json"),
    planDir: join(dir, "plan"),
    clipsDir: join(dir, "clips"),
    review: join(dir, "review.html"),
  };

  if (opts.force) {
    const from = STAGES.indexOf(opts.force as StageName);
    for (const stage of STAGES.slice(from)) {
      for (const artifact of ARTIFACTS[stage](paths)) {
        if (existsSync(artifact)) await rm(artifact, { recursive: true, force: true });
      }
    }
    log("reelize", `forced ${opts.force} — cleared it and all downstream stages`);
  }

  log("reelize", `job ${id} → ${dir}`);
  await download(url.length === 11 ? `https://www.youtube.com/watch?v=${id}` : url, paths);
  await transcribe(paths);
  await score(paths, opts);
  await plan(paths, opts);
  await render(paths, opts);
  log("reelize", `done — open ${paths.review}`);
}

main().catch((err) => {
  console.error(`\nreelize failed: ${(err as Error).message}`);
  process.exit(1);
});
