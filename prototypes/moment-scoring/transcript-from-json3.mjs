// PROTOTYPE — throwaway (wayfinder ticket 03, moment scoring).
// Converts yt-dlp json3 auto-captions into a compact timecoded transcript.
// Usage: node transcript-from-json3.mjs <captions.json3> > transcript.txt
import { readFileSync } from "node:fs";

const raw = JSON.parse(readFileSync(process.argv[2], "utf8"));

// json3: events[] with tStartMs + segs[{utf8}]. Auto-captions duplicate text
// across rolling events; keep only events that carry segs and skip pure "\n".
const words = [];
for (const ev of raw.events ?? []) {
  if (!ev.segs) continue;
  for (const seg of ev.segs) {
    const text = (seg.utf8 ?? "").trim();
    if (!text) continue;
    words.push({ t: (ev.tStartMs + (seg.tOffsetMs ?? 0)) / 1000, text });
  }
}

const stamp = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

// Emit one line per ~20s block so the scorer sees timestamps densely enough
// to cut clips but the transcript stays compact.
const BLOCK = 20;
let cur = null;
const lines = [];
for (const w of words) {
  if (!cur || w.t - cur.start >= BLOCK) {
    if (cur) lines.push(`[${stamp(cur.start)}] ${cur.parts.join(" ")}`);
    cur = { start: w.t, parts: [] };
  }
  cur.parts.push(w.text);
}
if (cur) lines.push(`[${stamp(cur.start)}] ${cur.parts.join(" ")}`);

process.stdout.write(lines.join("\n") + "\n");
