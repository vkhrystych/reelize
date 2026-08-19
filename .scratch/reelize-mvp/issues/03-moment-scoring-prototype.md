# 03 — Moment scoring: does AI find moments worth clipping?

Type: prototype
Status: resolved
Assignee: vkhrystych

## Question

The crux of Reelize. Given a timecoded transcript of a real long-form video, can Claude reliably pick the moments the driver would actually clip — and how should "worth clipping" be defined (hook strength, self-containedness, emotional peak, length bounds, clips-per-video count)?

Prototype: take one real video the driver cares about, obtain its transcript any cheap way (YouTube auto-captions are fine — don't wait on ticket 01), run a scoring prompt over it, and put the picked moments in front of the driver to react to. Iterate on the prompt until the picks excite them or the approach is falsified.

Resolution records: the working prompt/rubric, clip length + count policy, and the driver's verdict on pick quality.

## Progress (2026-08-18) — prototype built, awaiting driver reaction

Harness lives on branch `prototype/moment-scoring` in `prototypes/moment-scoring/` (commit ef53ee8):

- `SCORING_PROMPT.md` — rubric v2: four axes (Hook, Self-contained, Payoff, Charge), composite = 2×Hook + Payoff + Charge + SelfContained, bar ≥17/25, 8–12 per video. Driver-set rules (2026-08-18): clips 15–60s, and never a single phrase — every clip needs setup + resolution.
- `transcript-from-json3.mjs` — yt-dlp auto-captions → timecoded transcript (~20s blocks). Whole fetch path costs $0.
- `picks.json` — 10 ranked picks from smoke-test video (Lex Fridman #494, Jensen Huang, 2h26m), scored by Claude in-context.
- `review.html` — double-click page: each pick embeds the YouTube player cued to its start/end + Would-post/Maybe/Kill buttons; "Copy verdicts" exports JSON.

Awaiting from driver: (1) verdicts on the 10 picks, (2) a video of THEIR OWN they'd actually clip — smoke-test video was agent-chosen. Ticket resolves on the driver's quality verdict after a run on their video.

## Answer (2026-08-18)

**The approach is validated: 8 of 10 picks got "would post" from the driver** on a real 2.5h video (Lex Fridman #494, Jensen Huang). The crux of Reelize holds — Claude finds moments genuinely worth clipping from a timecoded transcript alone.

- **Working prompt/rubric**: `prototypes/moment-scoring/SCORING_PROMPT.md` v2.1 on branch `prototype/moment-scoring`. Four axes (Hook, Self-contained, Payoff, Charge), composite = 2×Hook + Payoff + Charge + SelfContained, bar ≥17/25.
- **Clip length + count policy (driver-set)**: 15–60s, never a single phrase (setup + resolution required), 8–12 ranked candidates per video.
- **Review-verdict learning**: both kills (#7 "74→6 days", #10 "leading from behind") were the low-Charge process/management-advice picks → v2.1 adds a hard floor **Charge ≥ 4**. The deliberate borderline pick (#10) was correctly killed, confirming the bar sits about where composite ~19–21 + low charge falls.
- **Verdict mechanism worked**: the localhost review page (embedded players cut to start/end + 🔥/🤔/🗑 + JSON export) is a keeper pattern for the evaluation loop.
- **Open risk carried forward**: smoke-test content was agent-chosen; the rubric hasn't yet run on the driver's own content/niche. Carried into the evaluation-loop ticket.

Assets: branch `prototype/moment-scoring` (`prototypes/moment-scoring/` — rubric, transcript tooling, picks.json, review page, serve.mjs).
