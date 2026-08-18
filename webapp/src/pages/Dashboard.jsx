import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createJob, getAccount, listJobs, topUp } from "../api.js";

export default function Dashboard() {
  const [account, setAccount] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [url, setUrl] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
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

  const addTokens = async () => {
    const usd = Number(prompt("Top up amount in USD ($1 = 10 tokens):", "5"));
    if (!Number.isFinite(usd) || usd <= 0) return;
    setAccount(await topUp(usd));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const job = await createJob(url);
      setUrl("");
      refresh();
      navigate(`/jobs/${job.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <div className="row">
        <h1>Dashboard</h1>
        <span className="spacer" />
        <span className="chip">🪙 {account?.tokens ?? "…"} tokens</span>
        <button onClick={addTokens}>+ Add tokens</button>
      </div>

      <form className="card row" onSubmit={submit}>
        <input className="grow" placeholder="Paste a YouTube link…" value={url} required
               onChange={(e) => setUrl(e.target.value)} />
        <button className="primary" disabled={busy}>
          {busy ? "Starting…" : `Cut it (${account?.tokensPerVideo ?? 10} 🪙)`}
        </button>
      </form>
      {error && <p className="error">{error}</p>}

      <div className="grid">
        {jobs.map((job) => (
          <div key={job.id} className="card job" onClick={() => navigate(`/jobs/${job.id}`)}>
            <img src={job.thumbnail} alt="" loading="lazy" />
            <div className="pad">
              <div className="title">{job.title}</div>
              <div className="row muted small">
                <span className={`status ${job.status}`}>{job.status}</span>
                <span className="spacer" />
                {job.clipCount > 0 && <span>{job.clipCount} clips</span>}
              </div>
            </div>
          </div>
        ))}
        {jobs.length === 0 && <p className="muted">No videos yet — paste a link above.</p>}
      </div>
    </main>
  );
}
