/** Apify-based YouTube download — the primary path on servers, where
 * datacenter IPs get bot-walled and no cookie jar exists.
 * Actor: streamers/youtube-video-downloader (allows API runs on the free
 * plan; epctex/youtube-video-downloader is cheaper per video but requires a
 * paid Apify subscription — swap here if/when that lands).
 */
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { log } from "./run.ts";

const ACTOR = process.env.APIFY_ACTOR ?? "streamers~youtube-video-downloader";
const QUALITY = process.env.APIFY_QUALITY ?? "720p";
const POLL_MS = 10_000;
const TIMEOUT_MS = 30 * 60_000;

interface RunData {
  id: string;
  status: string;
  defaultDatasetId: string;
}

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const token = process.env.APIFY_TOKEN!;
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`https://api.apify.com/v2/${path}${sep}token=${token}`, init);
  if (!res.ok) throw new Error(`apify ${path.split("?")[0]}: ${res.status} ${await res.text()}`);
  // some actor responses embed raw control chars in JSON strings
  const raw = (await res.text()).replace(/[\x00-\x1f]/g, " ");
  return JSON.parse(raw);
}

export interface ApifyDownload {
  durationSeconds: number | null;
}

/** Run the downloader actor and stream the resulting mp4 to destPath. */
export async function downloadViaApify(videoUrl: string, destPath: string): Promise<ApifyDownload> {
  log("download", `starting Apify run (${ACTOR}, ${QUALITY})…`);
  const started = (await api(`acts/${ACTOR}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      videos: [{ url: videoUrl }],
      preferredQuality: QUALITY,
      preferredFormat: "mp4",
      storeInKVStore: true,
    }),
  })) as { data: RunData };

  const runId = started.data.id;
  const deadline = Date.now() + TIMEOUT_MS;
  let status = started.data.status;
  while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
    if (Date.now() > deadline) throw new Error(`apify run ${runId} timed out after 30 min`);
    await new Promise((r) => setTimeout(r, POLL_MS));
    status = ((await api(`actor-runs/${runId}`)) as { data: RunData }).data.status;
  }
  if (status !== "SUCCEEDED") throw new Error(`apify run ${runId} ended ${status}`);

  const items = (await api(
    `datasets/${started.data.defaultDatasetId}/items`,
  )) as Record<string, unknown>[];
  const item = items.find((i) => typeof i.downloadedFileUrl === "string");
  if (!item) {
    throw new Error(`apify run ${runId} succeeded but returned no downloadedFileUrl`);
  }

  log("download", "fetching video file from Apify storage…");
  const fileRes = await fetch(`${item.downloadedFileUrl}?token=${process.env.APIFY_TOKEN}`);
  if (!fileRes.ok || !fileRes.body) {
    throw new Error(`apify file fetch failed: ${fileRes.status}`);
  }
  await pipeline(Readable.fromWeb(fileRes.body as never), createWriteStream(destPath));
  return { durationSeconds: typeof item.durationSeconds === "number" ? item.durationSeconds : null };
}

/** Video metadata via YouTube's public oEmbed endpoint — not bot-walled,
 * works from datacenter IPs, no auth. No duration though. */
export async function oembedMeta(videoUrl: string): Promise<{ title: string } | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`,
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { title?: string };
    return body.title ? { title: body.title } : null;
  } catch {
    return null;
  }
}
