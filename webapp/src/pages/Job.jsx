import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";
import { getJob, mediaUrl } from "../api.js";
import { Button, Card, Spinner } from "../components/ui.jsx";

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
          <p className="mb-3 flex items-center gap-2 text-sm">
            <Spinner /> Processing… this takes a few minutes for long videos.
          </p>
          <pre className="overflow-x-auto rounded-lg bg-background p-3 text-xs text-muted-foreground">
            {job.lastLog.join("\n") || "starting…"}
          </pre>
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
