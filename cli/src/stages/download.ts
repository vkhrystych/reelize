import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JobPaths } from "../lib/types.ts";
import { log, run } from "../lib/run.ts";

const FORMAT = "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b";
const COOKIES_FILE = join(dirname(fileURLToPath(import.meta.url)), "../../..", ".yt-cookies.txt");

/** yt-dlp with impersonation. When YouTube rate-limits/bot-checks the
 * anonymous session, retry with the exported cookie jar. We never use
 * --cookies-from-browser here: Chrome cookie decryption blocks on a macOS
 * Keychain dialog, which hangs forever in headless contexts. */
async function ytdlp(args: string[]): Promise<string> {
  const base = ["--impersonate", "chrome", "--no-progress"];
  try {
    return await run("yt-dlp", [...base, ...args], { quiet: true });
  } catch (err) {
    if (existsSync(COOKIES_FILE)) {
      log("download", "anonymous access blocked, retrying with saved cookies…");
      return run("yt-dlp", [...base, "--cookies", COOKIES_FILE, ...args], { quiet: true });
    }
    throw new Error(
      "YouTube blocked the anonymous download (rate limit / bot check) and no cookie jar exists.\n" +
        "One-time fix — run this in your own terminal and approve the Keychain prompt:\n" +
        `  yt-dlp --cookies-from-browser chrome --cookies ${COOKIES_FILE} --skip-download "https://www.youtube.com/watch?v=jNQXAC9IVRw"\n` +
        "then retry the video.",
    );
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
