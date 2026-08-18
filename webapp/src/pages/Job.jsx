import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getJob, mediaUrl } from "../api.js";

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
          // resolve tokenized media URLs once per poll
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

  if (error) return <main><p className="error">{error}</p></main>;
  if (!job) return <main><p className="muted">loading…</p></main>;

  return (
    <main>
      <p><Link to="/">← back to dashboard</Link></p>
      <div className="row">
        <h1>{job.title}</h1>
        <span className="spacer" />
        {job.clips.length > 0 && zipUrl && (
          <a className="button primary" href={zipUrl}>⬇ Download all (.zip)</a>
        )}
      </div>

      {job.status === "processing" && (
        <div className="card pad">
          <p>⏳ Processing… this takes a few minutes for long videos.</p>
          <pre className="log">{job.lastLog.join("\n")}</pre>
        </div>
      )}
      {job.status === "error" && (
        <div className="card pad">
          <p className="error">Pipeline failed (tokens refunded):</p>
          <pre className="log">{job.error}</pre>
        </div>
      )}

      <div className="grid">
        {job.clips.map(({ file, src, pick }) => (
          <div key={file} className="card clip">
            <video src={src} controls preload="metadata" />
            <div className="pad">
              <div className="title">{pick ? `#${pick.rank} — ${pick.title}` : file}</div>
              {pick && <p className="muted small">{pick.why}</p>}
              <a className="button" href={src} download={file}>⬇ Download</a>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
