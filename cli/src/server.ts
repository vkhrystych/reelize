/** Local API server for the Reelize webapp.
 * Wraps the CLI pipeline: creates jobs, reports status, serves clips.
 * Tokens: $1 = 10 tokens, a video costs 10 tokens; ledger in jobs/account.json.
 * Run: npm run serve (from cli/) → http://localhost:5177
 */
import { spawn } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "../..");
const CLI_DIR = join(REPO_ROOT, "cli");
const JOBS_DIR = join(REPO_ROOT, "jobs");
const ACCOUNTS = join(JOBS_DIR, "accounts.json");
const OWNERS = join(JOBS_DIR, "owners.json");
const PORT = Number(process.env.PORT ?? 5178);
const TOKENS_PER_VIDEO = 10;
const TOKENS_PER_USD = 10;

// load repo-root .env (same convention as the CLI; never overrides real env)
const envFile = join(REPO_ROOT, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (m && m[2] && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

mkdirSync(JOBS_DIR, { recursive: true });

// ---- auth ------------------------------------------------------------------

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_SECRET = process.env.SUPABASE_SECRET_KEY;
const DEV_AUTH = !SUPA_URL || !SUPA_SECRET;
if (DEV_AUTH) console.warn("SUPABASE_URL/SUPABASE_SECRET_KEY not set — auth disabled (dev mode)");

type AuthUser = { id: string; email?: string };
const authCache = new Map<string, { user: AuthUser; exp: number }>();

/** Validate the caller's Supabase access token (Authorization: Bearer …, or
 * ?token= for media/zip URLs that can't carry headers). */
async function authenticate(req: IncomingMessage): Promise<AuthUser | null> {
  if (DEV_AUTH) return { id: "dev" };
  const header = req.headers.authorization ?? "";
  const query = new URL(req.url ?? "/", "http://x").searchParams.get("token");
  const token = header.startsWith("Bearer ") ? header.slice(7) : query;
  if (!token) return null;
  const cached = authCache.get(token);
  if (cached && cached.exp > Date.now()) return cached.user;
  try {
    const res = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { apikey: SUPA_SECRET!, authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as AuthUser;
    if (!body.id) return null;
    const user = { id: body.id, email: body.email };
    authCache.set(token, { user, exp: Date.now() + 60_000 });
    return user;
  } catch {
    return null;
  }
}

// ---- tokens (per user) -----------------------------------------------------

function readJson(path: string): Record<string, number | string> {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}

function balance(userId: string): number {
  return Number(readJson(ACCOUNTS)[userId] ?? 0);
}

function setBalance(userId: string, tokens: number): void {
  const all = readJson(ACCOUNTS);
  all[userId] = tokens;
  writeFileSync(ACCOUNTS, JSON.stringify(all, null, 2));
}

// ---- job ownership ---------------------------------------------------------

function jobOwner(id: string): string | null {
  return (readJson(OWNERS)[id] as string) ?? null;
}

function setJobOwner(id: string, userId: string): void {
  const all = readJson(OWNERS);
  all[id] = userId;
  writeFileSync(OWNERS, JSON.stringify(all, null, 2));
}

/** Jobs with no recorded owner predate auth — visible to everyone. */
function canSee(user: AuthUser, jobId: string): boolean {
  const owner = jobOwner(jobId);
  return owner === null || owner === user.id;
}

// ---- jobs ------------------------------------------------------------------

/** In-memory state for pipeline processes started by this server. */
const running = new Map<string, { log: string[]; error: string | null }>();

function videoId(url: string): string | null {
  const m =
    url.match(/[?&]v=([\w-]{11})/) ??
    url.match(/youtu\.be\/([\w-]{11})/) ??
    url.match(/^([\w-]{11})$/);
  return m ? m[1] : null;
}

function jobSummary(id: string) {
  const dir = join(JOBS_DIR, id);
  const meta = existsSync(join(dir, "meta.json"))
    ? JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"))
    : { id, title: id };
  const clipsDir = join(dir, "clips");
  const clips = existsSync(clipsDir)
    ? readdirSync(clipsDir).filter((f) => f.endsWith(".mp4")).sort()
    : [];
  const live = running.get(id);
  const status = live
    ? live.error
      ? "error"
      : "processing"
    : clips.length > 0
      ? "done"
      : "incomplete";
  // current pipeline stage = last stage tag seen in the log
  let stage: string | null = null;
  if (live) {
    for (let i = live.log.length - 1; i >= 0 && !stage; i--) {
      const m = live.log[i].match(/^\[(download|transcribe|score|plan|render)\]/);
      if (m) stage = m[1];
    }
  }
  return {
    id,
    title: meta.title ?? id,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    status,
    stage,
    clipCount: clips.length,
    error: live?.error ?? null,
    lastLog: live?.log.slice(-3) ?? [],
  };
}

function jobDetail(id: string) {
  const dir = join(JOBS_DIR, id);
  const picksFile = join(dir, "picks.json");
  const picks = existsSync(picksFile) ? JSON.parse(readFileSync(picksFile, "utf8")) : [];
  const summary = jobSummary(id);
  const clipsDir = join(dir, "clips");
  const clips = existsSync(clipsDir)
    ? readdirSync(clipsDir)
        .filter((f) => f.endsWith(".mp4"))
        .sort()
        .map((file) => {
          const rank = Number(file.split("-")[0]);
          const pick = picks.find((p: { rank: number }) => p.rank === rank) ?? null;
          return { file, url: `/files/${id}/clips/${encodeURIComponent(file)}`, pick };
        })
    : [];
  return { ...summary, clips };
}

function startJob(id: string, url: string, userId: string): void {
  const state = { log: [] as string[], error: null as string | null };
  running.set(id, state);
  const child = spawn("npm", ["run", "reelize", "--", url, "--jobs", JOBS_DIR], {
    cwd: CLI_DIR,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const collect = (d: Buffer) => {
    for (const line of d.toString().split("\n")) {
      if (line.trim()) state.log.push(line.trim());
    }
    if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  child.on("close", (code) => {
    if (code === 0) {
      running.delete(id);
    } else {
      state.error = state.log.slice(-5).join("\n") || `pipeline exited ${code}`;
      // refund on failure
      setBalance(userId, balance(userId) + TOKENS_PER_VIDEO);
    }
  });
}

// ---- http ------------------------------------------------------------------

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function serveFile(req: IncomingMessage, res: ServerResponse, path: string): void {
  if (!existsSync(path)) return json(res, 404, { error: "not found" });
  const { size } = statSync(path);
  const type = path.endsWith(".mp4") ? "video/mp4" : "application/octet-stream";
  const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, {
      "content-type": type,
      "content-range": `bytes ${start}-${end}/${size}`,
      "content-length": end - start + 1,
      "accept-ranges": "bytes",
    });
    createReadStream(path, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "content-type": type, "content-length": size, "accept-ranges": "bytes" });
    createReadStream(path).pipe(res);
  }
}

createServer(async (req, res) => {
  const [path] = (req.url ?? "/").split("?");
  const parts = path.split("/").filter(Boolean);

  const user = await authenticate(req);
  if (!user) return json(res, 401, { error: "unauthorized — log in again" });

  // GET /api/account | POST /api/account/topup {usd}
  if (path === "/api/account" && req.method === "GET") {
    return json(res, 200, { tokens: balance(user.id), tokensPerVideo: TOKENS_PER_VIDEO });
  }
  if (path === "/api/account/topup" && req.method === "POST") {
    const { usd } = await readBody(req);
    const amount = Number(usd);
    if (!Number.isFinite(amount) || amount <= 0) return json(res, 400, { error: "invalid amount" });
    setBalance(user.id, balance(user.id) + Math.floor(amount * TOKENS_PER_USD));
    return json(res, 200, { tokens: balance(user.id) });
  }

  // GET /api/jobs | POST /api/jobs {url}
  if (path === "/api/jobs" && req.method === "GET") {
    const ids = existsSync(JOBS_DIR)
      ? readdirSync(JOBS_DIR, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
          .filter((id) => canSee(user, id))
      : [];
    return json(res, 200, ids.map(jobSummary));
  }
  if (path === "/api/jobs" && req.method === "POST") {
    const { url } = await readBody(req);
    const id = typeof url === "string" ? videoId(url) : null;
    if (!id) return json(res, 400, { error: "not a valid YouTube URL" });
    if (running.has(id)) return json(res, 409, { error: "already processing" });
    if (balance(user.id) < TOKENS_PER_VIDEO) {
      return json(res, 402, { error: `need ${TOKENS_PER_VIDEO} tokens, have ${balance(user.id)}` });
    }
    setBalance(user.id, balance(user.id) - TOKENS_PER_VIDEO);
    setJobOwner(id, user.id);
    startJob(id, `https://www.youtube.com/watch?v=${id}`, user.id);
    return json(res, 201, jobSummary(id));
  }

  // DELETE /api/jobs/:id
  if (parts[0] === "api" && parts[1] === "jobs" && parts.length === 3 && req.method === "DELETE") {
    const id = parts[2];
    if (!existsSync(join(JOBS_DIR, id)) || !canSee(user, id)) {
      return json(res, 404, { error: "no such job" });
    }
    if (running.has(id)) return json(res, 409, { error: "still processing — wait for it to finish" });
    rmSync(join(JOBS_DIR, id), { recursive: true, force: true });
    const owners = readJson(OWNERS);
    delete owners[id];
    writeFileSync(OWNERS, JSON.stringify(owners, null, 2));
    return json(res, 200, { ok: true });
  }

  // GET /api/jobs/:id
  if (parts[0] === "api" && parts[1] === "jobs" && parts.length === 3 && req.method === "GET") {
    if (!existsSync(join(JOBS_DIR, parts[2])) && !running.has(parts[2])) {
      return json(res, 404, { error: "no such job" });
    }
    if (!canSee(user, parts[2])) return json(res, 404, { error: "no such job" });
    return json(res, 200, jobDetail(parts[2]));
  }

  // GET /files/:id/clips/:file (video streaming with range support)
  if (parts[0] === "files" && parts[1] && parts[2] === "clips" && parts[3]) {
    if (!canSee(user, parts[1])) return json(res, 404, { error: "not found" });
    const file = decodeURIComponent(parts[3]);
    if (file.includes("..") || file.includes("/")) return json(res, 400, { error: "bad path" });
    return serveFile(req, res, join(JOBS_DIR, parts[1], "clips", file));
  }

  // GET /api/jobs/:id/zip — stream all clips as a zip
  if (parts[0] === "api" && parts[1] === "jobs" && parts[2] && parts[3] === "zip") {
    if (!canSee(user, parts[2])) return json(res, 404, { error: "not found" });
    const clipsDir = join(JOBS_DIR, parts[2], "clips");
    if (!existsSync(clipsDir)) return json(res, 404, { error: "no clips" });
    res.writeHead(200, {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="reelize-${parts[2]}.zip"`,
    });
    const zip = spawn("zip", ["-j", "-q", "-", ...readdirSync(clipsDir).map((f) => join(clipsDir, f))]);
    zip.stdout.pipe(res);
    zip.on("error", () => res.end());
    return;
  }

  json(res, 404, { error: "not found" });
}).listen(PORT, () => console.log(`reelize api: http://localhost:${PORT}${DEV_AUTH ? " (dev auth)" : " (supabase auth)"}`));
