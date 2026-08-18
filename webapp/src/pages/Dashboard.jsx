import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Coins, Film, Plus, Scissors } from "lucide-react";
import { createJob, getAccount, listJobs, topUp } from "../api.js";
import { Badge, Button, Card, Dialog, Input, Spinner } from "../components/ui.jsx";

const statusVariant = { done: "success", processing: "warning", error: "error", incomplete: "outline" };

export default function Dashboard() {
  const [account, setAccount] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [url, setUrl] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [usd, setUsd] = useState("5");
  const navigate = useNavigate();

  const refresh = () => {
    getAccount().then(setAccount).catch(() => {});
    listJobs().then(setJobs).catch((e) => setError(e.message));
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, []);

  const confirmTopUp = async (e) => {
    e.preventDefault();
    const amount = Number(usd);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setAccount(await topUp(amount));
    setTopupOpen(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const job = await createJob(url);
      setUrl("");
      navigate(`/jobs/${job.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <div className="flex-1" />
        <Badge variant="secondary" className="h-8 px-3 text-sm">
          <Coins className="h-3.5 w-3.5" /> {account?.tokens ?? "…"}
        </Badge>
        <Button variant="outline" onClick={() => setTopupOpen(true)}>
          <Plus className="h-4 w-4" /> Add tokens
        </Button>
      </div>

      <Card className="mb-2 p-3">
        <form className="flex gap-3" onSubmit={submit}>
          <Input placeholder="Paste a YouTube link…" value={url} required
                 onChange={(e) => setUrl(e.target.value)} />
          <Button disabled={busy} className="shrink-0">
            {busy ? <Spinner /> : <Scissors className="h-4 w-4" />}
            Cut it · {account?.tokensPerVideo ?? 10} tokens
          </Button>
        </form>
      </Card>
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => (
          <Card
            key={job.id}
            className="cursor-pointer overflow-hidden transition-colors hover:border-zinc-600"
            onClick={() => navigate(`/jobs/${job.id}`)}
          >
            <img src={job.thumbnail} alt="" loading="lazy"
                 className="aspect-video w-full bg-secondary object-cover" />
            <div className="p-4">
              <div className="mb-2 line-clamp-2 text-sm font-medium leading-snug">{job.title}</div>
              <div className="flex items-center gap-2">
                <Badge variant={statusVariant[job.status] ?? "outline"}>
                  {job.status === "processing" && <Spinner className="h-3 w-3" />}
                  {job.status}
                </Badge>
                <div className="flex-1" />
                {job.clipCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Film className="h-3.5 w-3.5" /> {job.clipCount} clips
                  </span>
                )}
              </div>
            </div>
          </Card>
        ))}
        {jobs.length === 0 && (
          <p className="text-sm text-muted-foreground">No videos yet — paste a link above.</p>
        )}
      </div>

      <Dialog
        open={topupOpen}
        onClose={() => setTopupOpen(false)}
        title="Add tokens"
        description="$1 = 10 tokens · one video costs 10 tokens."
      >
        <form className="flex gap-3" onSubmit={confirmTopUp}>
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <Input type="number" min="1" step="1" value={usd} autoFocus className="pl-7"
                   onChange={(e) => setUsd(e.target.value)} />
          </div>
          <Button>Top up</Button>
        </form>
      </Dialog>
    </main>
  );
}
