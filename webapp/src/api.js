import { getToken } from "./auth.js";

async function request(path, options) {
  const token = await getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("session expired");
  }
  if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`);
  return body;
}

/** Server-generated thumbnails live under /files/… and need the auth token;
 * YouTube thumbnails are absolute URLs and pass through untouched. */
async function withMediaThumb(job) {
  if (job.thumbnail?.startsWith("/")) job.thumbnail = await mediaUrl(job.thumbnail);
  return job;
}

export const getAccount = () => request("/api/account");
export const topUp = (usd) =>
  request("/api/account/topup", { method: "POST", body: JSON.stringify({ usd }) });
export const listJobs = () => request("/api/jobs").then((jobs) => Promise.all(jobs.map(withMediaThumb)));
export const getJob = (id) => request(`/api/jobs/${id}`).then(withMediaThumb);
export const createJob = (url) =>
  request("/api/jobs", { method: "POST", body: JSON.stringify({ url }) });
export const deleteJob = (id) => request(`/api/jobs/${id}`, { method: "DELETE" });

/** Upload a local video file. XHR instead of fetch for upload progress;
 * onProgress gets 0–100. */
export async function uploadJob(file, onProgress) {
  const token = await getToken();
  const job = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/jobs/upload?filename=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader("content-type", "application/octet-stream");
    if (token) xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON error */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body.error ?? `upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("upload failed — is the server running?"));
    xhr.send(file);
  });
  return withMediaThumb(job);
}

/** <video src>, download links, and zip can't send headers — carry the token
 * as a query param instead (the API accepts both). */
export async function mediaUrl(path) {
  const token = await getToken();
  return token ? `${path}${path.includes("?") ? "&" : "?"}token=${token}` : path;
}
