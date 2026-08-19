import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { JobPaths, Transcript, Word } from "../lib/types.ts";
import { ffmpegPath, log, run } from "../lib/run.ts";

const AAI = "https://api.assemblyai.com/v2";

async function assemblyai(paths: JobPaths, apiKey: string): Promise<Transcript> {
  const audioPath = join(paths.dir, "audio.m4a");
  if (!existsSync(audioPath)) {
    log("transcribe", "extracting audio…");
    await run(ffmpegPath(), ["-y", "-i", paths.source, "-vn", "-c:a", "copy", audioPath], {
      quiet: true,
    });
  }

  log("transcribe", "uploading audio to AssemblyAI…");
  const audio = await readFile(audioPath);
  const uploadRes = await fetch(`${AAI}/upload`, {
    method: "POST",
    headers: { authorization: apiKey },
    body: audio,
  });
  if (!uploadRes.ok) throw new Error(`AssemblyAI upload failed: ${uploadRes.status}`);
  const { upload_url } = (await uploadRes.json()) as { upload_url: string };

  const createRes = await fetch(`${AAI}/transcript`, {
    method: "POST",
    headers: { authorization: apiKey, "content-type": "application/json" },
    body: JSON.stringify({ audio_url: upload_url, speaker_labels: true }),
  });
  if (!createRes.ok) throw new Error(`AssemblyAI create failed: ${createRes.status}`);
  const { id } = (await createRes.json()) as { id: string };

  log("transcribe", `transcript ${id} queued, polling…`);
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetch(`${AAI}/transcript/${id}`, { headers: { authorization: apiKey } });
    const body = (await res.json()) as {
      status: string;
      error?: string;
      words?: { start: number; end: number; text: string; speaker?: string }[];
    };
    if (body.status === "completed") {
      const words: Word[] = (body.words ?? []).map((w) => ({
        start: w.start / 1000,
        end: w.end / 1000,
        text: w.text,
        speaker: w.speaker,
      }));
      return { source: "assemblyai", words };
    }
    if (body.status === "error") throw new Error(`AssemblyAI: ${body.error}`);
    log("transcribe", `…${body.status}`);
  }
}

/** Fallback: YouTube json3 auto-captions. Per-word start offsets only —
 * a word's end is the next word's start (last word gets +0.6s). */
async function fromJson3(paths: JobPaths): Promise<Transcript> {
  const raw = JSON.parse(await readFile(paths.captionsJson3, "utf8"));
  const flat: { t: number; text: string }[] = [];
  for (const ev of raw.events ?? []) {
    if (!ev.segs) continue;
    for (const seg of ev.segs) {
      const text = (seg.utf8 ?? "").trim();
      if (!text) continue;
      flat.push({ t: (ev.tStartMs + (seg.tOffsetMs ?? 0)) / 1000, text });
    }
  }
  flat.sort((a, b) => a.t - b.t);
  const words: Word[] = flat.map((w, i) => ({
    start: w.t,
    end: i + 1 < flat.length ? flat[i + 1].t : w.t + 0.6,
    text: w.text,
  }));
  return { source: "youtube-json3", words };
}

export async function transcribe(paths: JobPaths): Promise<void> {
  if (existsSync(paths.transcript)) {
    log("transcribe", "transcript.json cached, skipping");
    return;
  }
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  const transcript = apiKey
    ? await assemblyai(paths, apiKey)
    : await fromJson3(paths);
  if (!apiKey) {
    log("transcribe", "no ASSEMBLYAI_API_KEY — used YouTube auto-captions (no speaker labels)");
  }
  if (transcript.words.length === 0) {
    throw new Error(
      "transcription produced no words — no YouTube auto-captions were available. " +
        "Set ASSEMBLYAI_API_KEY in .env to transcribe the audio directly.",
    );
  }
  await writeFile(paths.transcript, JSON.stringify(transcript));
  log("transcribe", `${transcript.words.length} words (${transcript.source})`);
}
