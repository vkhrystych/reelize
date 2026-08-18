import type { Word } from "./types.ts";

/** Style B "karaoke highlight" locked in wayfinder ticket 04:
 * 3-4 word uppercase chunks, whole chunk visible, active word yellow + 106%. */

const FILLER = /^(uh+|um+|u|>+)$/i;

const assTime = (s: number): string => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${sec}`;
};

const HEADER = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial Black,80,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,1,0,1,10,4,2,70,70,470,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

function chunk(words: Word[], maxLen: number): Word[][] {
  const chunks: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    if (cur.length && (w.start - cur[cur.length - 1].end > 0.8 || cur.length >= maxLen)) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(w);
    if (/[.?!]$/.test(w.text)) {
      chunks.push(cur);
      cur = [];
    }
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/** Emit the ASS file for one clip; word times are absolute video seconds,
 * clipStart re-bases them to the clip. */
export function karaokeAss(words: Word[], clipStart: number): string {
  const clean = words.filter((w) => !FILLER.test(w.text.replace(/[.,]/g, "")));
  const YEL = "{\\1c&H17D0FD&\\fscx106\\fscy106}";
  const WHITE = "{\\1c&HFFFFFF&\\fscx100\\fscy100}";
  let out = HEADER;
  for (const ch of chunk(clean, 4)) {
    ch.forEach((w, i) => {
      const text = ch
        .map((x, j) => (j === i ? YEL + x.text.toUpperCase() + WHITE : x.text.toUpperCase()))
        .join(" ");
      const start = w.start - clipStart;
      const end = (i + 1 < ch.length ? ch[i + 1].start : w.end) - clipStart;
      if (end <= 0) return;
      out += `Dialogue: 0,${assTime(Math.max(0, start))},${assTime(end)},Default,,0,0,0,,${text}\n`;
    });
  }
  return out;
}
