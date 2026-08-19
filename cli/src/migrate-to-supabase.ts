/** One-time migration: local accounts.json / owners.json / job dirs → Supabase.
 * Run after applying supabase/migrations/001_init.sql:
 *   cd cli && npx tsx src/migrate-to-supabase.ts
 * Idempotent (upserts). Leaves the local files in place as backup.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const JOBS_DIR = join(REPO_ROOT, "jobs");

for (const line of readFileSync(join(REPO_ROOT, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*(#.*)?$/);
  if (m && m[2] && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
const URL_ = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_SECRET_KEY!;

async function sb(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) throw new Error(`supabase ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const readJson = (p: string): Record<string, unknown> =>
  existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};

// 1. token balances
const accounts = readJson(join(JOBS_DIR, "accounts.json"));
for (const [userId, tokens] of Object.entries(accounts)) {
  if (userId === "dev") continue;
  await sb("accounts?on_conflict=user_id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ user_id: userId, tokens }),
  });
  console.log(`account ${userId}: ${tokens} tokens`);
}

// 2. jobs (ownership + metadata from disk artifacts)
const owners = readJson(join(JOBS_DIR, "owners.json"));
const dirs = existsSync(JOBS_DIR)
  ? readdirSync(JOBS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];
for (const id of dirs) {
  const meta = readJson(join(JOBS_DIR, id, "meta.json"));
  const stats = readJson(join(JOBS_DIR, id, "stats.json"));
  const clipsDir = join(JOBS_DIR, id, "clips");
  const clipCount = existsSync(clipsDir)
    ? readdirSync(clipsDir).filter((f) => f.endsWith(".mp4") && !f.startsWith(".")).length
    : 0;
  const ownerId = (owners[id] as string) ?? null;
  await sb("jobs?on_conflict=id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      id,
      owner_id: ownerId === "dev" ? null : ownerId,
      title: meta.title ?? id,
      status: clipCount > 0 ? "done" : "error",
      clip_count: clipCount,
      elapsed_ms: stats.elapsedMs ?? null,
    }),
  });
  console.log(`job ${id}: owner=${ownerId ?? "public"} clips=${clipCount}`);
}

console.log("migration complete");
