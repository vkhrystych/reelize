// PROTOTYPE — throwaway (wayfinder ticket 03). YouTube embeds refuse to play
// from file://, so serve review.html over localhost instead.
// Usage: node serve.mjs  → opens http://localhost:4173
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const PORT = 4173;
createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(readFileSync(new URL("./review.html", import.meta.url)));
}).listen(PORT, () => console.log(`review page: http://localhost:${PORT}`));
