import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClipPlan, JobPaths, Options, Pick, Scene, Transcript } from "../lib/types.ts";
import { karaokeAss } from "../lib/captions.ts";
import { ffmpegPath, ffprobePath, log, run, stampToSec } from "../lib/run.ts";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "../../..");
const FACES_SCRIPT = join(here, "../../python/analyze_faces.py");
const VENV_PYTHON = join(REPO_ROOT, "cli-py-venv/bin/python");

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

async function sourceDims(source: string): Promise<{ width: number; height: number }> {
  const out = await run(
    ffprobePath(),
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", source],
    { quiet: true },
  );
  const [width, height] = out.trim().split(",").map(Number);
  return { width, height };
}

async function sceneCuts(source: string, startSec: number, dur: number): Promise<number[]> {
  const out = await run(
    ffmpegPath(),
    ["-ss", String(startSec), "-t", String(dur), "-i", source,
     "-vf", "select='gt(scene,0.3)',metadata=print:file=-", "-f", "null", "-"],
    { quiet: true },
  );
  const cuts = [...out.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
  // drop cuts that would create sub-0.5s scenes
  const kept: number[] = [];
  for (const c of cuts) {
    if (c < 0.5 || c > dur - 0.5) continue;
    if (kept.length && c - kept[kept.length - 1] < 0.5) continue;
    kept.push(c);
  }
  return kept;
}

type FaceMap = Record<string, { cx: number; cy: number; w: number; h: number; score: number }[]>;

async function detectFaces(framesDir: string): Promise<FaceMap | null> {
  const python = existsSync(VENV_PYTHON) ? VENV_PYTHON : "python3";
  try {
    const out = await run(python, [FACES_SCRIPT, framesDir], { quiet: true });
    return JSON.parse(out) as FaceMap;
  } catch (err) {
    log("plan", `face detection unavailable (${(err as Error).message.split("\n")[0]}) — falling back to letterbox`);
    return null;
  }
}

export async function plan(paths: JobPaths, opts: Options): Promise<void> {
  const picks: Pick[] = JSON.parse(await readFile(paths.picks, "utf8"));
  const selected = opts.limit ? picks.slice(0, opts.limit) : picks;
  const transcript: Transcript = JSON.parse(await readFile(paths.transcript, "utf8"));
  await mkdir(paths.planDir, { recursive: true });
  const { width, height } = await sourceDims(paths.source);

  for (const pick of selected) {
    const planJson = join(paths.planDir, `${pick.rank}.json`);
    const planAss = join(paths.planDir, `${pick.rank}.ass`);
    if (existsSync(planJson) && existsSync(planAss)) {
      log("plan", `pick ${pick.rank} cached, skipping`);
      continue;
    }

    const startSec = stampToSec(pick.start);
    const endSec = stampToSec(pick.end);
    const dur = endSec - startSec;
    log("plan", `pick ${pick.rank} "${pick.title}" (${dur}s): scenes…`);

    const cuts = await sceneCuts(paths.source, startSec, dur);
    const bounds = [0, ...cuts, dur];

    // one frame from the middle of each scene → face detection
    const framesDir = join(paths.planDir, `frames-${pick.rank}`);
    await mkdir(framesDir, { recursive: true });
    for (let i = 0; i < bounds.length - 1; i++) {
      const mid = startSec + (bounds[i] + bounds[i + 1]) / 2;
      await run(
        ffmpegPath(),
        ["-y", "-ss", String(mid), "-i", paths.source, "-frames:v", "1", join(framesDir, `${i}.jpg`)],
        { quiet: true },
      );
    }
    const faces = await detectFaces(framesDir);

    const scenes: Scene[] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const sceneFaces = faces?.[`${i}.jpg`] ?? [];
      // largest face wins the crop; no face → blurred letterbox (ticket 02)
      const best = sceneFaces.sort((a, b) => b.w * b.h - a.w * a.h)[0];
      scenes.push({
        start: bounds[i],
        end: bounds[i + 1],
        cropCenterX: best ? Math.round(best.cx * width) : null,
      });
    }

    const words = transcript.words.filter((w) => w.start >= startSec && w.start < endSec);
    await writeFile(planAss, karaokeAss(words, startSec, pick.title));

    const clipPlan: ClipPlan = {
      rank: pick.rank,
      title: pick.title,
      slug: slugify(pick.title),
      startSec,
      endSec,
      sourceWidth: width,
      sourceHeight: height,
      scenes,
    };
    await writeFile(planJson, JSON.stringify(clipPlan, null, 2));
    await rm(framesDir, { recursive: true, force: true });
    log("plan", `pick ${pick.rank}: ${scenes.length} scene(s), ${words.length} words`);
  }
}
