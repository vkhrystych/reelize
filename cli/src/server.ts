/** Local API server for the Reelize webapp.
 * Wraps the CLI pipeline: creates jobs, reports status, serves clips.
 * Tokens: $1 = 10 tokens, a video costs 10 tokens; ledger in jobs/account.json.
 * Run: npm run serve (from cli/) → http://localhost:5177
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "../..");
const CLI_DIR = join(REPO_ROOT, "cli");
const JOBS_DIR = join(REPO_ROOT, "jobs");
const ACCOUNTS = join(JOBS_DIR, "accounts.json");
const OWNERS = join(JOBS_DIR, "owners.json");
const PORT = Number(process.env.PORT ?? 5178);
/** Pricing: 1 token per minute of source video, min 10/job, $1 = 10 tokens.
 * Third-party cost of a 1h video ≈ $2.00 (Apify ~$1.62 + AssemblyAI ~$0.17
 * + Claude scoring ~$0.22), so 60 tokens = $6/hr is a ~3× margin. */
const TOKENS_PER_USD = 10;
const TOKENS_PER_MINUTE = 1;
const MIN_JOB_TOKENS = 10;
/** YouTube duration is unknown at job creation — hold 1h worth, refund after. */
const HOLD_TOKENS = 60;

function jobTokens(durationSeconds: number | null | undefined): number {
  if (!durationSeconds || durationSeconds <= 0) return HOLD_TOKENS;
  return Math.max(MIN_JOB_TOKENS, Math.ceil(durationSeconds / 60) * TOKENS_PER_MINUTE);
}

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

// ---- state store: Supabase Postgres in prod, local JSON files in dev -------

async function sb(pathAndQuery: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${SUPA_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: SUPA_SECRET!,
      authorization: `Bearer ${SUPA_SECRET}`,
      "content-type": "application/json",
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) throw new Error(`supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

interface JobPatch {
  status: string;
  clipCount?: number;
  elapsedMs?: number;
  error?: string | null;
  title?: string | null;
}

interface Store {
  balance(userId: string): Promise<number>;
  adjustTokens(userId: string, delta: number, reason: string, jobId?: string): Promise<number>;
  /** null = no recorded owner (legacy/public job) */
  jobOwner(id: string): Promise<string | null>;
  createJob(id: string, ownerId: string): Promise<void>;
  finishJob(id: string, patch: JobPatch): Promise<void>;
  deleteJob(id: string): Promise<void>;
}

function readJson(path: string): Record<string, number | string> {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}

const fileStore: Store = {
  async balance(userId) {
    return Number(readJson(ACCOUNTS)[userId] ?? 0);
  },
  async adjustTokens(userId, delta) {
    const all = readJson(ACCOUNTS);
    const next = Math.max(0, Number(all[userId] ?? 0) + delta);
    all[userId] = next;
    writeFileSync(ACCOUNTS, JSON.stringify(all, null, 2));
    return next;
  },
  async jobOwner(id) {
    return (readJson(OWNERS)[id] as string) ?? null;
  },
  async createJob(id, ownerId) {
    const all = readJson(OWNERS);
    all[id] = ownerId;
    writeFileSync(OWNERS, JSON.stringify(all, null, 2));
  },
  async finishJob() {},
  async deleteJob(id) {
    const all = readJson(OWNERS);
    delete all[id];
    writeFileSync(OWNERS, JSON.stringify(all, null, 2));
  },
};

const dbStore: Store = {
  async balance(userId) {
    const rows = (await sb(`accounts?user_id=eq.${userId}&select=tokens`)) as { tokens: number }[];
    return rows[0]?.tokens ?? 0;
  },
  async adjustTokens(userId, delta, reason, jobId) {
    const next = Math.max(0, (await this.balance(userId)) + delta);
    await sb(`accounts?on_conflict=user_id`, {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ user_id: userId, tokens: next, updated_at: new Date().toISOString() }),
    });
    await sb("token_transactions", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, delta, reason, job_id: jobId ?? null }),
    });
    return next;
  },
  async jobOwner(id) {
    const rows = (await sb(`jobs?id=eq.${id}&select=owner_id`)) as { owner_id: string | null }[];
    return rows[0]?.owner_id ?? null;
  },
  async createJob(id, ownerId) {
    await sb(`jobs?on_conflict=id`, {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ id, owner_id: ownerId, status: "processing", updated_at: new Date().toISOString() }),
    });
  },
  async finishJob(id, patch) {
    await sb(`jobs?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: patch.status,
        clip_count: patch.clipCount ?? 0,
        elapsed_ms: patch.elapsedMs ?? null,
        error: patch.error ?? null,
        title: patch.title ?? null,
        updated_at: new Date().toISOString(),
      }),
    });
  },
  async deleteJob(id) {
    await sb(`jobs?id=eq.${id}`, { method: "DELETE" });
  },
};

const store: Store = DEV_AUTH ? fileStore : dbStore;

/** Jobs with no recorded owner predate auth — visible to everyone. */
async function canSee(user: AuthUser, jobId: string): Promise<boolean> {
  const owner = await store.jobOwner(jobId);
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

function runCmd(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => (out += d));
    child.stderr.on("data", (d: Buffer) => (err += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(err.trim().slice(-300) || `${cmd} exited ${code}`)),
    );
  });
}

function jobSummary(id: string) {
  const dir = join(JOBS_DIR, id);
  const meta = existsSync(join(dir, "meta.json"))
    ? JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"))
    : { id, title: id };
  const clipsDir = join(dir, "clips");
  const clips = existsSync(clipsDir)
    ? readdirSync(clipsDir).filter((f) => f.endsWith(".mp4") && !f.startsWith(".")).sort()
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
  const statsFile = join(dir, "stats.json");
  const stats = existsSync(statsFile) ? JSON.parse(readFileSync(statsFile, "utf8")) : null;
  return {
    id,
    title: meta.title ?? id,
    thumbnail: existsSync(join(dir, "thumb.jpg"))
      ? `/files/${id}/thumb.jpg`
      : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    status,
    stage,
    clipCount: clips.length,
    elapsedMs: stats?.elapsedMs ?? null,
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
        .filter((f) => f.endsWith(".mp4") && !f.startsWith("."))
        .sort()
        .map((file) => {
          const rank = Number(file.split("-")[0]);
          const pick = picks.find((p: { rank: number }) => p.rank === rank) ?? null;
          return { file, url: `/files/${id}/clips/${encodeURIComponent(file)}`, pick };
        })
    : [];
  return { ...summary, clips };
}

function startJob(id: string, url: string, userId: string, chargedTokens: number): void {
  const state = { log: [] as string[], error: null as string | null };
  running.set(id, state);
  const startedAt = Date.now();
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
    void (async () => {
      const summary = jobSummary(id);
      if (code === 0) {
        const elapsedMs = Date.now() - startedAt;
        writeFileSync(
          join(JOBS_DIR, id, "stats.json"),
          JSON.stringify({ elapsedMs, finishedAt: Date.now() }),
        );
        running.delete(id);
        await store.finishJob(id, {
          status: "done",
          clipCount: summary.clipCount,
          elapsedMs,
          title: summary.title,
        });
        // settle the hold: actual price = 1 token per minute of source video
        const metaFile = join(JOBS_DIR, id, "meta.json");
        const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : {};
        const actual = jobTokens(meta.duration);
        if (actual < chargedTokens) {
          await store.adjustTokens(userId, chargedTokens - actual, "hold-refund", id);
        }
      } else {
        state.error = state.log.slice(-5).join("\n") || `pipeline exited ${code}`;
        await store.finishJob(id, { status: "error", error: state.error, title: summary.title });
        // refund on failure
        await store.adjustTokens(userId, chargedTokens, "refund", id);
      }
    })().catch((err) => console.error("job close bookkeeping failed:", err));
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
  const type = path.endsWith(".mp4")
    ? "video/mp4"
    : path.endsWith(".jpg")
      ? "image/jpeg"
      : "application/octet-stream";
  const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
  if (range && size > 0) {
    const start = Number(range[1]);
    const end = Math.min(range[2] ? Number(range[2]) : size - 1, size - 1);
    if (start >= size || start > end) {
      res.writeHead(416, { "content-range": `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      "content-type": type,
      "content-range": `bytes ${start}-${end}/${size}`,
      "content-length": end - start + 1,
      "accept-ranges": "bytes",
    });
    createReadStream(path, { start, end }).on("error", () => res.destroy()).pipe(res);
  } else {
    res.writeHead(200, { "content-type": type, "content-length": size, "accept-ranges": "bytes" });
    createReadStream(path).on("error", () => res.destroy()).pipe(res);
  }
}

createServer(async (req, res) => {
  try {
    await handle(req, res);
  } catch (err) {
    console.error("request failed:", err);
    if (!res.headersSent) json(res, 500, { error: "internal error" });
    else res.destroy();
  }
}).listen(PORT, () => console.log(`reelize api: http://localhost:${PORT}${DEV_AUTH ? " (dev auth)" : " (supabase auth)"}`));

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const [path] = (req.url ?? "/").split("?");
  const parts = path.split("/").filter(Boolean);

  const user = await authenticate(req);
  if (!user) return json(res, 401, { error: "unauthorized — log in again" });

  // GET /api/account | POST /api/account/topup {usd}
  if (path === "/api/account" && req.method === "GET") {
    return json(res, 200, {
      tokens: await store.balance(user.id),
      tokensPerMinute: TOKENS_PER_MINUTE,
      minJobTokens: MIN_JOB_TOKENS,
      holdTokens: HOLD_TOKENS,
      tokensPerUsd: TOKENS_PER_USD,
    });
  }
  if (path === "/api/account/topup" && req.method === "POST") {
    const { usd } = await readBody(req);
    const amount = Number(usd);
    if (!Number.isFinite(amount) || amount <= 0) return json(res, 400, { error: "invalid amount" });
    const tokens = await store.adjustTokens(user.id, Math.floor(amount * TOKENS_PER_USD), "topup");
    return json(res, 200, { tokens });
  }

  // GET /api/jobs | POST /api/jobs {url}
  if (path === "/api/jobs" && req.method === "GET") {
    const all = existsSync(JOBS_DIR)
      ? readdirSync(JOBS_DIR, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
      : [];
    const visible: string[] = [];
    for (const id of all) if (await canSee(user, id)) visible.push(id);
    return json(res, 200, visible.map(jobSummary));
  }
  if (path === "/api/jobs" && req.method === "POST") {
    const { url } = await readBody(req);
    const id = typeof url === "string" ? videoId(url) : null;
    if (!id) return json(res, 400, { error: "not a valid YouTube URL" });
    if (running.has(id)) return json(res, 409, { error: "already processing" });
    const tokens = await store.balance(user.id);
    if (tokens < HOLD_TOKENS) {
      return json(res, 402, {
        error: `need ${HOLD_TOKENS} tokens to start (1/min held for up to 1h, unused refunded), have ${tokens}`,
      });
    }
    await store.adjustTokens(user.id, -HOLD_TOKENS, "job-hold", id);
    await store.createJob(id, user.id);
    startJob(id, `https://www.youtube.com/watch?v=${id}`, user.id, HOLD_TOKENS);
    return json(res, 201, jobSummary(id));
  }

  // POST /api/jobs/upload?filename=… — raw video body. Title comes from the
  // filename, the poster frame from ffmpeg; download stage is pre-satisfied
  // so the pipeline's file-exists caching skips straight to transcribe.
  if (path === "/api/jobs/upload" && req.method === "POST") {
    const q = new URL(req.url ?? "/", "http://x").searchParams;
    const filename = q.get("filename") ?? "upload.mp4";
    const tokens = await store.balance(user.id);
    if (tokens < MIN_JOB_TOKENS) {
      return json(res, 402, { error: `need at least ${MIN_JOB_TOKENS} tokens, have ${tokens}` });
    }
    // "up" + 9 hex = 11 chars, so the CLI's videoId() accepts it as a job id
    const id = "up" + randomBytes(5).toString("hex").slice(0, 9);
    const dir = join(JOBS_DIR, id);
    mkdirSync(dir, { recursive: true });
    const title =
      filename.replace(/\.[a-z0-9]+$/i, "").replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim() ||
      "Uploaded video";
    writeFileSync(join(dir, "meta.json"), JSON.stringify({ title, duration: null, source: "upload" }, null, 2));
    writeFileSync(join(dir, "captions.en.json3"), JSON.stringify({ events: [] }));
    const source = join(dir, "source.mp4");
    let duration = 0;
    try {
      await pipeline(req, createWriteStream(source));
      duration = Math.round(
        Number(await runCmd("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", source])),
      );
      if (!Number.isFinite(duration) || duration <= 0) throw new Error("no duration");
      writeFileSync(join(dir, "meta.json"), JSON.stringify({ title, duration, source: "upload" }, null, 2));
      await runCmd("ffmpeg", [
        "-y", "-ss", String(Math.min(3, duration / 2)), "-i", source,
        "-frames:v", "1", "-vf", "scale=640:-2", join(dir, "thumb.jpg"),
      ]);
    } catch {
      rmSync(dir, { recursive: true, force: true });
      return json(res, 400, { error: "that file doesn't look like a playable video" });
    }
    // duration is known for uploads — charge the exact price, no hold
    const price = jobTokens(duration);
    if (tokens < price) {
      rmSync(dir, { recursive: true, force: true });
      return json(res, 402, {
        error: `this video is ${Math.ceil(duration / 60)} min = ${price} tokens, you have ${tokens}`,
      });
    }
    await store.adjustTokens(user.id, -price, "job", id);
    await store.createJob(id, user.id);
    startJob(id, id, user.id, price);
    return json(res, 201, jobSummary(id));
  }

  // DELETE /api/jobs/:id
  if (parts[0] === "api" && parts[1] === "jobs" && parts.length === 3 && req.method === "DELETE") {
    const id = parts[2];
    if (!existsSync(join(JOBS_DIR, id)) || !(await canSee(user, id))) {
      return json(res, 404, { error: "no such job" });
    }
    if (running.has(id)) return json(res, 409, { error: "still processing — wait for it to finish" });
    rmSync(join(JOBS_DIR, id), { recursive: true, force: true });
    await store.deleteJob(id);
    return json(res, 200, { ok: true });
  }

  // GET /api/jobs/:id
  if (parts[0] === "api" && parts[1] === "jobs" && parts.length === 3 && req.method === "GET") {
    if (!existsSync(join(JOBS_DIR, parts[2])) && !running.has(parts[2])) {
      return json(res, 404, { error: "no such job" });
    }
    if (!(await canSee(user, parts[2]))) return json(res, 404, { error: "no such job" });
    return json(res, 200, jobDetail(parts[2]));
  }

  // GET /files/:id/thumb.jpg — generated poster frame for uploaded videos
  if (parts[0] === "files" && parts[1] && parts[2] === "thumb.jpg" && parts.length === 3) {
    if (!(await canSee(user, parts[1]))) return json(res, 404, { error: "not found" });
    return serveFile(req, res, join(JOBS_DIR, parts[1], "thumb.jpg"));
  }

  // GET /files/:id/clips/:file (video streaming with range support)
  if (parts[0] === "files" && parts[1] && parts[2] === "clips" && parts[3]) {
    if (!(await canSee(user, parts[1]))) return json(res, 404, { error: "not found" });
    const file = decodeURIComponent(parts[3]);
    if (file.includes("..") || file.includes("/")) return json(res, 400, { error: "bad path" });
    return serveFile(req, res, join(JOBS_DIR, parts[1], "clips", file));
  }

  // GET /api/jobs/:id/zip — stream all clips as a zip
  if (parts[0] === "api" && parts[1] === "jobs" && parts[2] && parts[3] === "zip") {
    if (!(await canSee(user, parts[2]))) return json(res, 404, { error: "not found" });
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
}
