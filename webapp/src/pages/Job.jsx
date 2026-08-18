import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Clock, Download, Zap } from "lucide-react";
import { getJob, mediaUrl } from "../api.js";
import { Button, Card, Spinner, cn } from "../components/ui.jsx";

const STEPS = [
  { key: "download", label: "Downloading" },
  { key: "transcribe", label: "Transcribing" },
  { key: "score", label: "Finding the moments" },
  { key: "plan", label: "Planning the cuts" },
  { key: "render", label: "Rendering the reelz" },
];

// rough manual-editing effort a finished clip replaces: find the moment,
// reframe to 9:16, caption word-by-word
const MANUAL_MIN_PER_CLIP = 10;

function fmtDuration(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.round(totalSec % 60);
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return s > 0 ? `${m} min ${s} s` : `${m} min`;
  return `${s} s`;
}

function StatsStrip({ job }) {
  const saved = job.clips.length * MANUAL_MIN_PER_CLIP * 60;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
      {job.elapsedMs != null && (
        <span className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" />
          Finished the job in <strong>{fmtDuration(job.elapsedMs / 1000)}</strong>
        </span>
      )}
      <span className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-emerald-400" />
        Saved <strong>~{fmtDuration(saved)}</strong> of manual editing work
      </span>
    </div>
  );
}

function StageStepper({ stage, lastLog }) {
  const current = Math.max(0, STEPS.findIndex((s) => s.key === stage));
  return (
    <ol>
      {STEPS.map((step, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        const last = i === STEPS.length - 1;
        return (
          <li key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs",
                  state === "done" && "border-emerald-500/40 bg-emerald-500/15 text-emerald-400",
                  state === "active" && "border-zinc-500 bg-secondary",
                  state === "todo" && "border-border text-muted-foreground",
                )}
              >
                {state === "done" ? <Check className="h-3.5 w-3.5" /> :
                 state === "active" ? <Spinner className="h-3.5 w-3.5" /> : i + 1}
              </span>
              {!last && (
                <span className={cn("w-px flex-1", i < current ? "bg-emerald-500/40" : "bg-border")} />
              )}
            </div>
            <div className={cn("min-w-0 pt-1", !last && "pb-5")}>
              <span
                className={cn(
                  "text-sm",
                  state === "active" && "font-medium",
                  state === "todo" && "text-muted-foreground",
                  state === "done" && "text-emerald-400",
                )}
              >
                {step.label}
              </span>
              {state === "active" && lastLog && (
                <p className="mt-1 truncate text-xs text-muted-foreground">{lastLog}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function Job() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [zipUrl, setZipUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let timer;
    const poll = () =>
      getJob(id)
        .then(async (j) => {
          j.clips = await Promise.all(
            j.clips.map(async (c) => ({ ...c, src: await mediaUrl(c.url) })),
          );
          setJob(j);
          setZipUrl(await mediaUrl(`/api/jobs/${id}/zip`));
          if (j.status === "processing") timer = setTimeout(poll, 4000);
        })
        .catch((e) => setError(e.message));
    poll();
    return () => clearTimeout(timer);
  }, [id]);

  if (error) return <main className="mx-auto max-w-5xl px-6 py-8"><p className="text-sm text-red-400">{error}</p></main>;
  if (!job) return <main className="mx-auto max-w-5xl px-6 py-8 text-muted-foreground">loading…</main>;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <div className="mb-6 flex items-start gap-3">
        <h1 className="text-xl font-semibold leading-snug tracking-tight">{job.title}</h1>
        <div className="flex-1" />
        {job.clips.length > 0 && zipUrl && (
          <Button href={zipUrl} className="shrink-0">
            <Download className="h-4 w-4" /> Download all
          </Button>
        )}
      </div>

      {job.status === "done" && job.clips.length > 0 && <StatsStrip job={job} />}

      {job.status === "processing" && (
        <Card className="mx-auto mt-10 max-w-md overflow-hidden">
          <img src={job.thumbnail} alt="" className="aspect-video w-full bg-secondary object-cover" />
          <div className="p-6">
            <p className="mb-5 text-sm text-muted-foreground">
              Cutting your reelz — a long video takes a few minutes.
            </p>
            <StageStepper
              stage={job.stage}
              lastLog={job.lastLog[job.lastLog.length - 1] ?? "starting…"}
            />
          </div>
        </Card>
      )}
      {job.status === "error" && (
        <Card className="mb-6 border-red-900 p-5">
          <p className="mb-3 text-sm text-red-400">Pipeline failed — tokens refunded.</p>
          <pre className="overflow-x-auto rounded-lg bg-background p-3 text-xs text-muted-foreground">{job.error}</pre>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {job.clips.map(({ file, src, pick }) => (
          <Card key={file} className="overflow-hidden">
            <video src={src} controls preload="metadata"
                   className="aspect-[9/16] w-full bg-black" />
            <div className="p-4">
              <div className="mb-1 text-sm font-medium leading-snug">
                {pick ? `#${pick.rank} — ${pick.title}` : file}
              </div>
              {pick && <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{pick.why}</p>}
              <Button variant="outline" size="sm" href={src} download={file}>
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
