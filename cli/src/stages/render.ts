import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ClipPlan, JobPaths, Options, Pick, Scene } from "../lib/types.ts";
import { ffmpegPath, log, run } from "../lib/run.ts";

const OUT_W = 1080;
const OUT_H = 1920;

function sceneChain(scene: Scene, i: number, srcW: number, srcH: number): string {
  const trim = `[0:v]trim=${scene.start.toFixed(3)}:${scene.end.toFixed(3)},setpts=PTS-STARTPTS`;
  if (scene.cropCenterX === null) {
    // blurred letterbox (ticket 02: no-face segments)
    return (
      `${trim},split[b${i}][f${i}];` +
      `[b${i}]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,crop=${OUT_W}:${OUT_H},boxblur=24,setsar=1[bg${i}];` +
      `[f${i}]scale=${OUT_W}:-2,setsar=1[fg${i}];` +
      `[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2[v${i}]`
    );
  }
  let cropW = Math.round((srcH * 9) / 16 / 2) * 2;
  cropW = Math.min(cropW, srcW);
  const x = Math.max(0, Math.min(srcW - cropW, Math.round(scene.cropCenterX - cropW / 2)));
  return `${trim},crop=${cropW}:${srcH}:${x}:0,scale=${OUT_W}:${OUT_H}:flags=lanczos,setsar=1[v${i}]`;
}

async function renderClip(paths: JobPaths, plan: ClipPlan): Promise<string> {
  const outName = `${String(plan.rank).padStart(2, "0")}-${plan.slug}.mp4`;
  const outPath = join(paths.clipsDir, outName);
  if (existsSync(outPath)) {
    log("render", `clip ${plan.rank} cached, skipping`);
    return outName;
  }

  const chains = plan.scenes.map((s, i) =>
    sceneChain(s, i, plan.sourceWidth, plan.sourceHeight),
  );
  const labels = plan.scenes.map((_, i) => `[v${i}]`).join("");
  const graph =
    chains.join(";") +
    `;${labels}concat=n=${plan.scenes.length}:v=1[cat];` +
    `[cat]ass=filename=plan/${plan.rank}.ass[vout]`;

  log("render", `clip ${plan.rank} "${plan.title}" (${plan.scenes.length} scene(s))…`);
  await run(
    ffmpegPath(),
    [
      "-y",
      "-ss", String(plan.startSec),
      "-to", String(plan.endSec),
      "-i", "source.mp4",
      "-filter_complex", graph,
      "-map", "[vout]",
      "-map", "0:a?",
      "-c:v", "libx264", "-preset", "fast", "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k",
      // temp name + rename: a clip only becomes visible once fully written,
      // so a killed render or a mid-write poll never exposes a truncated file
      `clips/.tmp-${outName}`,
    ],
    { quiet: true, cwd: paths.dir },
  );
  await rename(join(paths.clipsDir, `.tmp-${outName}`), outPath);
  return outName;
}

function reviewPage(title: string, entries: { pick: Pick; file: string }[]): string {
  const cards = entries
    .map(
      ({ pick, file }) => `
    <div class="card" data-rank="${pick.rank}">
      <video src="clips/${file}" controls preload="metadata"></video>
      <h2>#${pick.rank} — ${pick.title}</h2>
      <p class="hook">"${pick.hook_line}"</p>
      <p class="why">${pick.why} · composite ${pick.composite}</p>
      <div class="verdict">
        <button data-v="post">🔥 would post</button>
        <button data-v="maybe">🤔 maybe</button>
        <button data-v="kill">🗑 kill</button>
      </div>
    </div>`,
    )
    .join("\n");

  return `<!doctype html>
<meta charset="utf-8" />
<title>Reelize review — ${title}</title>
<style>
  body { margin: 0; padding: 24px; background: #0d0d10; color: #eee; font: 15px/1.45 -apple-system, sans-serif; }
  h1 { font-size: 20px; } .grid { display: flex; flex-wrap: wrap; gap: 24px; }
  .card { width: 300px; background: #17171c; border: 1px solid #2a2a32; border-radius: 12px; padding: 12px; }
  video { width: 100%; aspect-ratio: 9/16; background: #000; border-radius: 8px; }
  h2 { font-size: 15px; margin: 10px 0 4px; } .hook { color: #ccc; margin: 0 0 4px; font-style: italic; }
  .why { color: #888; margin: 0 0 10px; font-size: 13px; }
  .verdict button { margin-right: 6px; background: #222; color: #eee; border: 1px solid #333; border-radius: 8px; padding: 6px 10px; cursor: pointer; }
  .verdict button.on { background: #eee; color: #111; }
  #export { position: fixed; bottom: 16px; right: 16px; background: #eee; color: #111; border: 0; border-radius: 999px; padding: 10px 18px; font-weight: 600; cursor: pointer; }
</style>
<h1>${title}</h1>
<div class="grid">${cards}</div>
<button id="export">Copy verdicts JSON</button>
<script>
  const verdicts = {};
  document.querySelectorAll(".card").forEach((card) => {
    card.querySelectorAll(".verdict button").forEach((btn) => {
      btn.onclick = () => {
        card.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
        btn.classList.add("on");
        verdicts[card.dataset.rank] = btn.dataset.v;
      };
    });
  });
  document.getElementById("export").onclick = async () => {
    await navigator.clipboard.writeText(JSON.stringify(verdicts, null, 2));
    document.getElementById("export").textContent = "Copied ✓";
  };
</script>
`;
}

export async function render(paths: JobPaths, opts: Options): Promise<void> {
  const picks: Pick[] = JSON.parse(await readFile(paths.picks, "utf8"));
  const selected = opts.limit ? picks.slice(0, opts.limit) : picks;
  await mkdir(paths.clipsDir, { recursive: true });

  const entries: { pick: Pick; file: string }[] = [];
  for (const pick of selected) {
    const planJson = join(paths.planDir, `${pick.rank}.json`);
    if (!existsSync(planJson)) {
      log("render", `pick ${pick.rank} has no plan, skipping`);
      continue;
    }
    const clipPlan: ClipPlan = JSON.parse(await readFile(planJson, "utf8"));
    const file = await renderClip(paths, clipPlan);
    entries.push({ pick, file });
  }

  const meta = JSON.parse(await readFile(paths.meta, "utf8"));
  await writeFile(paths.review, reviewPage(meta.title ?? "job", entries));
  const count = (await readdir(paths.clipsDir)).filter(
    (f) => f.endsWith(".mp4") && !f.startsWith("."),
  ).length;
  log("render", `${count} clip(s) in ${paths.clipsDir}; review page: ${paths.review}`);
}
