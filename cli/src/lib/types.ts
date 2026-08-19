export interface Word {
  start: number; // seconds from video start
  end: number;
  text: string;
  speaker?: string;
}

export interface Transcript {
  source: "assemblyai" | "youtube-json3";
  words: Word[];
}

export interface Pick {
  rank: number;
  start: string; // HH:MM:SS
  end: string;
  hook_line: string;
  title: string;
  scores: { hook: number; self_contained: number; payoff: number; charge: number };
  composite: number;
  why: string;
}

export interface Scene {
  start: number; // seconds relative to clip start
  end: number;
  /** center x of the 9:16 crop in source pixels; null → blurred letterbox */
  cropCenterX: number | null;
}

export interface ClipPlan {
  rank: number;
  title: string;
  slug: string;
  startSec: number;
  endSec: number;
  sourceWidth: number;
  sourceHeight: number;
  scenes: Scene[];
}

export interface JobPaths {
  dir: string;
  source: string;
  meta: string;
  captionsJson3: string;
  transcript: string;
  picks: string;
  planDir: string;
  clipsDir: string;
  review: string;
}

export interface Options {
  force: string | null;
  limit: number | null;
  picksFile: string | null;
}
