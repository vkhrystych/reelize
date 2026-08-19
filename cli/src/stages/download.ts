import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JobPaths } from "../lib/types.ts";
import { downloadViaApify, oembedMeta } from "../lib/apify.ts";
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
  const apify = !!process.env.APIFY_TOKEN;

  if (!existsSync(paths.meta)) {
    log("download", "fetching metadata…");
    let meta: { id?: string; title?: string; duration?: number | null } | null = null;
    if (apify) {
      // oEmbed: public, not bot-walled, safe from datacenter IPs
      const oe = await oembedMeta(url);
      if (oe) meta = { title: oe.title, duration: null };
    }
    if (!meta) {
      const info = JSON.parse(await ytdlp(["-J", "--no-download", url]));
      meta = { id: info.id, title: info.title, duration: info.duration };
    }
    await writeFile(paths.meta, JSON.stringify({ ...meta, url }, null, 2));
  }

  if (!existsSync(paths.captionsJson3)) {
    log("download", "fetching auto-captions (json3)…");
    try {
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
    } catch {
      log("download", "caption fetch failed (transcribe will need ASSEMBLYAI_API_KEY)");
    }
    if (!existsSync(paths.captionsJson3)) {
      await writeFile(paths.captionsJson3, JSON.stringify({ events: [] }));
    }
  }

  if (!existsSync(paths.source)) {
    if (apify) {
      // primary on servers: datacenter IPs are bot-walled for direct download
      try {
        const result = await downloadViaApify(url, paths.source);
        if (result.durationSeconds) {
          const meta = JSON.parse(await readFile(paths.meta, "utf8"));
          if (!meta.duration) {
            meta.duration = result.durationSeconds;
            await writeFile(paths.meta, JSON.stringify(meta, null, 2));
          }
        }
        return;
      } catch (err) {
        log("download", `Apify failed (${(err as Error).message.split("\n")[0]}), falling back to yt-dlp…`);
      }
    }
    log("download", "downloading source video via yt-dlp…");
    await ytdlp(["-f", FORMAT, "-o", paths.source, url]);
  } else {
    log("download", "source.mp4 cached, skipping");
  }
}
