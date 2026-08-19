// PROTOTYPE — throwaway (wayfinder ticket 04, caption style).
// Generates 4 ASS subtitle variants from words.json for a 1080x1920 canvas:
//   A punch    — one giant word at a time, pop-in
//   B karaoke  — 3-4 word chunk, active word highlighted yellow
//   C cleanbox — phrase-level, mixed case, dim box, no animation
//   D builder  — words accumulate into the phrase, newest word green
// Usage: node gen-captions.mjs   (reads words.json, writes captions-{A..D}.ass)
import { readFileSync, writeFileSync } from "node:fs";

const raw = JSON.parse(readFileSync("words.json", "utf8"));
const FILLER = /^(uh+|um+|u|>>)$/i;
const words = raw.filter((w) => !FILLER.test(w.text.replace(/[.,]/g, "")));

const ts = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${sec}`;
};

// Chunk words: break at sentence punctuation, a >0.8s gap, or maxLen words.
function chunk(maxLen) {
  const chunks = [];
  let cur = [];
  for (const w of words) {
    if (cur.length && (w.start - cur[cur.length - 1].end > 0.8 || cur.length >= maxLen)) {
      chunks.push(cur); cur = [];
    }
    cur.push(w);
    if (/[.?!]$/.test(w.text)) { chunks.push(cur); cur = []; }
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

const header = (style) => `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${style}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

const dlg = (start, end, text) =>
  `Dialogue: 0,${ts(start)},${ts(end)},Default,,0,0,0,,${text}\n`;

// ---- A: PUNCH — one word, huge, pop-in ------------------------------------
{
  let out = header(
    "Style: Default,Impact,130,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,2,0,1,14,0,5,40,40,0,1"
  );
  for (const w of words) {
    const t = w.text.toUpperCase();
    out += dlg(w.start, Math.max(w.end, w.start + 0.15),
      `{\\pos(540,1230)\\fscx70\\fscy70\\t(0,90,\\fscx100\\fscy100)}${t}`);
  }
  writeFileSync("captions-A.ass", out);
}

// ---- B: KARAOKE — chunk visible, active word yellow -----------------------
{
  let out = header(
    "Style: Default,Arial Black,80,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,1,0,1,10,4,2,70,70,470,1"
  );
  const YEL = "{\\1c&H17D0FD&\\fscx106\\fscy106}", W = "{\\1c&HFFFFFF&\\fscx100\\fscy100}";
  for (const ch of chunk(4)) {
    ch.forEach((w, i) => {
      const text = ch.map((x, j) => (j === i ? YEL + x.text.toUpperCase() + W : x.text.toUpperCase())).join(" ");
      const end = i + 1 < ch.length ? ch[i + 1].start : ch[i].end;
      out += dlg(w.start, end, text);
    });
  }
  writeFileSync("captions-B.ass", out);
}

// ---- C: CLEANBOX — phrase-level, mixed case, dim box, static --------------
{
  let out = header(
    "Style: Default,Helvetica Neue,58,&H00FFFFFF,&H00FFFFFF,&H00000000,&H9C000000,1,0,0,0,100,100,0,0,4,14,0,2,90,90,400,1"
  );
  for (const ch of chunk(8)) {
    out += dlg(ch[0].start, ch[ch.length - 1].end, ch.map((w) => w.text).join(" "));
  }
  writeFileSync("captions-C.ass", out);
}

// ---- D: BUILDER — phrase accumulates, newest word green -------------------
{
  let out = header(
    "Style: Default,Avenir Next,68,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,1,0,1,10,3,5,80,80,0,1"
  );
  const GRN = "{\\1c&H87FF00&}", W = "{\\1c&HFFFFFF&}";
  for (const ch of chunk(6)) {
    ch.forEach((w, i) => {
      const text = "{\\pos(540,1260)}" + ch.slice(0, i + 1)
        .map((x, j) => (j === i ? GRN + x.text.toUpperCase() + W : x.text.toUpperCase()))
        .join(" ");
      const end = i + 1 < ch.length ? ch[i + 1].start : ch[i].end;
      out += dlg(w.start, end, text);
    });
  }
  writeFileSync("captions-D.ass", out);
}

console.log("wrote captions-A.ass .. captions-D.ass");
