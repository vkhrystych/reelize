// PROTOTYPE — throwaway (wayfinder ticket 04, caption style).
// Serves the variant picker + the rendered variant-*.mp4 files with range
// support so <video> seeking works.
// Usage: node serve.mjs  → http://localhost:4174
import { createServer } from "node:http";
import { statSync, createReadStream, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname;
const PORT = 4174;

createServer((req, res) => {
  const path = req.url.split("?")[0];
  if (path === "/" || path === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(readFileSync(join(ROOT, "index.html")));
  }
  if (/^\/variant-[A-D]\.mp4$/.test(path)) {
    const file = join(ROOT, path.slice(1));
    const { size } = statSync(file);
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
    if (range) {
      const start = +range[1];
      const end = range[2] ? +range[2] : size - 1;
      res.writeHead(206, {
        "content-type": "video/mp4",
        "content-range": `bytes ${start}-${end}/${size}`,
        "content-length": end - start + 1,
        "accept-ranges": "bytes",
      });
      return createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { "content-type": "video/mp4", "content-length": size, "accept-ranges": "bytes" });
    return createReadStream(file).pipe(res);
  }
  res.writeHead(404); res.end("not found");
}).listen(PORT, () => console.log(`caption picker: http://localhost:${PORT}`));
