async function request(path, options) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
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
