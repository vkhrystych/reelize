# 01 — Transcription API choice

Type: research
Status: resolved

## Question

Which transcription service should the pipeline use? Hard requirements, in priority order:

1. **Word-level timecodes** — needed to burn word-timed captions.
2. **Speaker diarization** — needed for active-speaker framing (who talks when drives the crop).
3. Cost within the ~$1/video budget for a 1-hour video; callable from TypeScript/Node.

Compare at least: OpenAI Whisper API (gpt-4o-transcribe / whisper-1), Deepgram, AssemblyAI. For each: word-timestamp support, diarization quality/support, price per audio-hour, Node SDK maturity. Recommend one, with a fallback.

## Answer

**Winner: AssemblyAI** (`assemblyai` npm; model `universal-3-5-pro` or `universal-2` with `speaker_labels: true`). One async call returns per-word millisecond timestamps AND per-word speaker labels — the only single-call solution covering both hard requirements — at **$0.23/audio-hour** (U3.5 Pro $0.21 + $0.02 diarization) or $0.17 (U-2), ~4x under the $1 budget. Mature TypeScript SDK (`assemblyai` v4.36.7, 2026-08); `transcribe()` handles upload + polling; 10 h / 5 GB file ceiling means no chunking code.

**Fallback: Deepgram Nova-3** (`@deepgram/sdk` v5.8.0). Word timestamps on by default + `diarize_model` diarization with per-word speaker confidence, **~$0.58/hr** ($0.0077/min + $0.0020/min diarization); faster batch turnaround; $200 signup credit covers ~340 free hours.

**Ruled out: all OpenAI transcription models** — whisper-1 has word timestamps but no diarization; gpt-4o-transcribe has neither; gpt-4o-transcribe-diarize is segment-level only; all behind a 25 MB upload cap that forces chunking 1-hour audio.

Full research (per-service details, limits, primary-source citations): branch `research/transcription-api-choice`, file `docs/research/transcription-api-choice.md` (commit db7c450). Pricing fetched from official pricing pages on 2026-08-18.
