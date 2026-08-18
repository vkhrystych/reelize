// PROTOTYPE — throwaway (wayfinder ticket 04, caption style).
// Pulls per-word timings for the clip window out of yt-dlp json3 auto-captions,
// re-based to clip-relative seconds. Word end = next word's start (json3 has no
// per-word durations); last word gets +0.6s.
// Usage: node extract-words.mjs assets/captions.en.json3 8248 8294 > words.json
import { readFileSync } from "node:fs";

const [file, startS, endS] = [process.argv[2], +process.argv[3], +process.argv[4]];
const raw = JSON.parse(readFileSync(file, "utf8"));

const words = [];
for (const ev of raw.events ?? []) {
  if (!ev.segs) continue;
  for (const seg of ev.segs) {
    const text = (seg.utf8 ?? "").trim();
    if (!text) continue;
    words.push({ t: (ev.tStartMs + (seg.tOffsetMs ?? 0)) / 1000, text });
  }
}
words.sort((a, b) => a.t - b.t);

const inWin = words.filter((w) => w.t >= startS && w.t < endS);
const out = inWin.map((w, i) => ({
  start: +(w.t - startS).toFixed(3),
  end: +(((i + 1 < inWin.length ? inWin[i + 1].t : w.t + 0.6) - startS)).toFixed(3),
  text: w.text,
}));

process.stdout.write(JSON.stringify(out, null, 1) + "\n");
