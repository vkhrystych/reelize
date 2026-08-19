# Reelize webapp

Vite + React (plain JS). Talks to the local API server that wraps the CLI pipeline.

```
# terminal 1 — API (wraps the pipeline, port 5178)
cd cli && npm run serve

# terminal 2 — webapp (port 5180, proxies /api and /files to 5178)
cd webapp && npm run dev
```

Open http://localhost:5180.

- **Auth**: Supabase — copy `.env.example` to `.env` and fill in your project's URL + anon key. Without them the app runs in **dev mode** (auth bypassed with a single button).
- **Tokens**: $1 = 10 tokens, one video costs 10. Top-up is local/simulated for now (ledger in `jobs/account.json`); real payments are a future effort. Failed pipelines auto-refund.
- **Flow**: paste a YouTube link on the dashboard → job appears with thumbnail + status → click through to watch, download single clips, or grab all as a zip.

Not yet production: no server-side auth check on the API, payments simulated, single-user ledger.
