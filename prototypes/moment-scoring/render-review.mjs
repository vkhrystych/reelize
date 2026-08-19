// PROTOTYPE — throwaway (wayfinder ticket 03, moment scoring).
// Renders picks.json into review.html: each pick embeds the YouTube player
// cued to [start,end] plus keep/kill verdict buttons. State is in-memory;
// "Copy verdicts" exports JSON to paste back into the ticket.
// Usage: node render-review.mjs && open review.html
import { readFileSync, writeFileSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("./picks.json", import.meta.url), "utf8"));
const toSec = (ts) => ts.split(":").reduce((a, p) => a * 60 + Number(p), 0);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

const card = (p) => {
  const s = toSec(p.start), e = toSec(p.end);
  return `
  <article class="card" data-rank="${p.rank}">
    <header>
      <span class="rank">#${p.rank}</span>
      <h2>${esc(p.title)}</h2>
      <span class="meta">${p.start} → ${p.end} (${e - s}s) · composite ${p.composite}/25</span>
    </header>
    <iframe loading="lazy" src="https://www.youtube.com/embed/${data.video.id}?start=${s}&end=${e}" allowfullscreen></iframe>
    <p class="hook">“${esc(p.hook_line)}”</p>
    <p class="why">${esc(p.why)}${p.note ? ` <em>(${esc(p.note)})</em>` : ""}</p>
    <p class="scores">hook ${p.scores.hook} · self-contained ${p.scores.self_contained} · payoff ${p.scores.payoff} · charge ${p.scores.charge}</p>
    <div class="verdict">
      <button data-v="post">🔥 Would post</button>
      <button data-v="maybe">🤔 Maybe, re-cut</button>
      <button data-v="kill">🗑 Would not post</button>
    </div>
  </article>`;
};

const html = `<!doctype html>
<meta charset="utf-8">
<title>PROTOTYPE — moment-scoring review: ${esc(data.video.title)}</title>
<style>
  body { font: 16px/1.5 -apple-system, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; background:#111; color:#eee; }
  .banner { background:#5a2; color:#fff; padding:.5rem 1rem; border-radius:8px; font-weight:600; }
  .howto { background:#1c1c1c; border:1px solid #333; border-radius:8px; padding:.8rem 1rem .8rem 2.2rem; }
  .howto li { margin:.25rem 0; }
  .card { border:1px solid #333; border-radius:12px; padding:1rem; margin:1.5rem 0; }
  .card header { display:flex; gap:.6rem; align-items:baseline; flex-wrap:wrap; }
  .rank { font-weight:800; color:#f80; }
  h2 { font-size:1.1rem; margin:0; }
  .meta { color:#999; font-size:.85rem; }
  iframe { width:100%; aspect-ratio:16/9; border:0; border-radius:8px; margin:.6rem 0; }
  .hook { font-style:italic; color:#fc6; margin:.3rem 0; }
  .why { color:#bbb; margin:.3rem 0; }
  .scores { color:#777; font-size:.85rem; }
  .verdict button { margin-right:.5rem; padding:.4rem .8rem; border-radius:8px; border:1px solid #444; background:#222; color:#eee; cursor:pointer; }
  .verdict button.on { background:#f80; color:#000; border-color:#f80; }
  #export { position:fixed; bottom:1rem; right:1rem; padding:.6rem 1rem; border-radius:10px; border:0; background:#f80; color:#000; font-weight:700; cursor:pointer; }
</style>
<p class="banner">PROTOTYPE — wipe me. Claude picked ${data.picks.length} clip-worthy moments from this video. Your job: judge the picks.</p>
<ol class="howto">
  <li>Press play on a card — the clip plays right here, already cut to its start/end.</li>
  <li>Click one verdict button under it: 🔥 would post · 🤔 maybe · 🗑 would not post.</li>
  <li>After all ${data.picks.length}, hit the orange <strong>Copy verdicts</strong> button (bottom-right) and paste the result back to Claude.</li>
</ol>
<h1>${esc(data.video.title)}</h1>
<p>${data.picks.length} picks · ${data.prompt_version} · transcript: ${esc(data.video.transcript_source)}</p>
${data.picks.map(card).join("\n")}
<button id="export">Copy verdicts</button>
<script>
  const verdicts = {};
  document.querySelectorAll(".card").forEach(card => {
    card.querySelectorAll(".verdict button").forEach(btn => btn.onclick = () => {
      card.querySelectorAll(".verdict button").forEach(b => b.classList.remove("on"));
      btn.classList.add("on");
      verdicts[card.dataset.rank] = btn.dataset.v;
    });
  });
  document.getElementById("export").onclick = async () => {
    const out = JSON.stringify({ video: ${JSON.stringify(data.video.id)}, verdicts }, null, 2);
    try { await navigator.clipboard.writeText(out); alert("Copied:\\n" + out); }
    catch { prompt("Copy this:", out); }
  };
</script>`;

writeFileSync(new URL("./review.html", import.meta.url), html);
console.log("wrote review.html");
