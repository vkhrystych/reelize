import { existsSync } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import type { JobPaths, Options, Pick, Transcript } from "../lib/types.ts";
import { log, secToStamp } from "../lib/run.ts";

const here = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = join(here, "../../prompts/SCORING_PROMPT.md");

/** One line per ~20s block, matching the format the scoring prompt expects. */
function blockTranscript(transcript: Transcript): string {
  const BLOCK = 20;
  const lines: string[] = [];
  let cur: { start: number; parts: string[] } | null = null;
  for (const w of transcript.words) {
    if (!cur || w.start - cur.start >= BLOCK) {
      if (cur) lines.push(`[${secToStamp(cur.start)}] ${cur.parts.join(" ")}`);
      cur = { start: w.start, parts: [] };
    }
    cur.parts.push(w.text);
  }
  if (cur) lines.push(`[${secToStamp(cur.start)}] ${cur.parts.join(" ")}`);
  return lines.join("\n");
}

function parsePicks(text: string): Pick[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`scoring response contained no JSON array:\n${text.slice(0, 500)}`);
  const picks = JSON.parse(match[0]) as Pick[];
  if (!Array.isArray(picks) || picks.length === 0) throw new Error("scoring returned no picks");
  return picks;
}

export async function score(paths: JobPaths, opts: Options): Promise<void> {
  if (existsSync(paths.picks)) {
    log("score", "picks.json cached, skipping");
    return;
  }

  if (opts.picksFile) {
    log("score", `using injected picks from ${opts.picksFile}`);
    const raw = JSON.parse(await readFile(opts.picksFile, "utf8"));
    // accept either a bare array or the prototype's {picks: [...]} shape
    const picks: Pick[] = Array.isArray(raw) ? raw : raw.picks;
    await writeFile(paths.picks, JSON.stringify(picks, null, 2));
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "score: ANTHROPIC_API_KEY is not set. Export it, or pass --picks <file> to inject picks.",
    );
  }

  const transcript: Transcript = JSON.parse(await readFile(paths.transcript, "utf8"));
  const prompt = await readFile(PROMPT_PATH, "utf8");
  const blocks = blockTranscript(transcript);

  log("score", `scoring transcript (${transcript.words.length} words) with Claude…`);
  const client = new Anthropic();
  const stream = client.messages.stream({
    model: "claude-opus-5",
    max_tokens: 16000,
    system: prompt,
    messages: [
      {
        role: "user",
        content: `Here is the transcript. Respond with the JSON array only.\n\n${blocks}`,
      },
    ],
  });
  const response = await stream.finalMessage();
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const picks = parsePicks(text);
  await writeFile(paths.picks, JSON.stringify(picks, null, 2));
  log("score", `${picks.length} picks (top: "${picks[0].title}")`);
}
