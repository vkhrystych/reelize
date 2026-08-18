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

export const getAccount = () => request("/api/account");
export const topUp = (usd) =>
  request("/api/account/topup", { method: "POST", body: JSON.stringify({ usd }) });
export const listJobs = () => request("/api/jobs");
export const getJob = (id) => request(`/api/jobs/${id}`);
export const createJob = (url) =>
  request("/api/jobs", { method: "POST", body: JSON.stringify({ url }) });

/** <video src>, download links, and zip can't send headers — carry the token
 * as a query param instead (the API accepts both). */
export async function mediaUrl(path) {
  const token = await getToken();
  return token ? `${path}${path.includes("?") ? "&" : "?"}token=${token}` : path;
}
