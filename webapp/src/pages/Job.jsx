import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Download } from "lucide-react";
import { getJob, mediaUrl } from "../api.js";
import { Button, Card, Spinner, cn } from "../components/ui.jsx";

const STEPS = [
  { key: "download", label: "Downloading" },
  { key: "transcribe", label: "Transcribing" },
  { key: "score", label: "Finding the moments" },
  { key: "plan", label: "Planning the cuts" },
  { key: "render", label: "Rendering the reelz" },
];

function StageStepper({ stage }) {
  const current = Math.max(0, STEPS.findIndex((s) => s.key === stage));
  return (
    <ol className="flex flex-wrap items-center gap-y-3">
      {STEPS.map((step, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <li key={step.key} className="flex items-center">
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs",
                  state === "done" && "border-emerald-500/40 bg-emerald-500/15 text-emerald-400",
                  state === "active" && "border-border bg-secondary",
                  state === "todo" && "border-border text-muted-foreground",
                )}
              >
                {state === "done" ? <Check className="h-3.5 w-3.5" /> :
                 state === "active" ? <Spinner className="h-3.5 w-3.5" /> : i + 1}
              </span>
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
            </span>
            {i < STEPS.length - 1 && (
              <span className={cn("mx-3 h-px w-6 sm:w-10", i < current ? "bg-emerald-500/40" : "bg-border")} />
            )}
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

      {job.status === "processing" && (
        <Card className="mb-6 p-5">
          <StageStepper stage={job.stage} />
          <p className="mt-4 truncate text-xs text-muted-foreground">
            {job.lastLog[job.lastLog.length - 1] ?? "starting…"}
          </p>
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
