import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import type { JobPaths } from "../lib/types.ts";
import { log, run } from "../lib/run.ts";

const FORMAT = "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b";

/** yt-dlp with impersonation; retries with browser cookies — YouTube's
 * PO-token enforcement blocks anonymous 720p+ on many sessions. */
async function ytdlp(args: string[]): Promise<string> {
  const base = ["--impersonate", "chrome", "--no-progress"];
  try {
    return await run("yt-dlp", [...base, ...args], { quiet: true });
  } catch {
    log("download", "anonymous download failed, retrying with Chrome cookies…");
    return run("yt-dlp", [...base, "--cookies-from-browser", "chrome", ...args]);
  }
}

export async function download(url: string, paths: JobPaths): Promise<void> {
  if (!existsSync(paths.meta)) {
    log("download", "fetching metadata…");
    const json = await ytdlp(["-J", "--no-download", url]);
    const info = JSON.parse(json);
    await writeFile(
      paths.meta,
      JSON.stringify(
        { id: info.id, title: info.title, duration: info.duration, url },
        null,
        2,
      ),
    );
  }

  if (!existsSync(paths.captionsJson3)) {
    log("download", "fetching auto-captions (json3)…");
    await ytdlp([
      "--skip-download",
      "--write-auto-subs",
      "--sub-langs",
      "en",
      "--sub-format",
      "json3",
      "-o",
      paths.captionsJson3.replace(/\.en\.json3$/, ""),
      url,
    ]);
    if (!existsSync(paths.captionsJson3)) {
      log("download", "no auto-captions available for this video");
      await writeFile(paths.captionsJson3, JSON.stringify({ events: [] }));
    }
  }

  if (!existsSync(paths.source)) {
    log("download", "downloading source video…");
    await ytdlp(["-f", FORMAT, "-o", paths.source, url]);
  } else {
    log("download", "source.mp4 cached, skipping");
  }
}
