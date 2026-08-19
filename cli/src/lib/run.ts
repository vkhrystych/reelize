import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { execFileSync } from "node:child_process";

export function run(
  cmd: string,
  args: string[],
  opts: { quiet?: boolean; cwd?: string } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], cwd: opts.cwd });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => {
      err += d;
      if (!opts.quiet) process.stderr.write(d);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} ${args[0] ?? ""} exited ${code}\n${err.slice(-2000)}`));
    });
  });
}

const FFMPEG_CANDIDATES = [
  "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg",
  "ffmpeg",
];

let cachedFfmpeg: string | null = null;

/** Resolve an ffmpeg that actually has the libass `ass` filter (homebrew's
 * default formula ships without subtitle filters). */
export function ffmpegPath(): string {
  if (cachedFfmpeg) return cachedFfmpeg;
  for (const cand of FFMPEG_CANDIDATES) {
    try {
      if (cand.startsWith("/")) accessSync(cand, constants.X_OK);
      const filters = execFileSync(cand, ["-hide_banner", "-filters"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      if (/\bass\b/.test(filters)) {
        cachedFfmpeg = cand;
        return cand;
      }
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    "No ffmpeg with the `ass` (libass) filter found. Install it: brew install ffmpeg-full",
  );
}

export function ffprobePath(): string {
  const ff = ffmpegPath();
  return ff.endsWith("/ffmpeg") ? ff.slice(0, -"ffmpeg".length) + "ffprobe" : "ffprobe";
}

export const secToStamp = (s: number): string => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
};

export const stampToSec = (stamp: string): number => {
  const parts = stamp.split(":").map(Number);
  if (parts.some(Number.isNaN)) throw new Error(`bad timestamp: ${stamp}`);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
};

export const log = (stage: string, msg: string): void => {
  console.log(`[${stage}] ${msg}`);
};
