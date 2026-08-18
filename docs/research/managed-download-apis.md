# Managed YouTube download options — state as of 2026-08-18

Context: Reelize needs server-side "YouTube URL in → video file out" from a VPS. Datacenter IPs get bot-walled by YouTube. All facts below fetched live on 2026-08-18 unless marked UNVERIFIED.

## TL;DR

| Option | 1h 720p (~0.7–1 GB) per video | Reliability verdict | Ops burden |
|---|---|---|---|
| Apify: epctex/youtube-video-downloader | **$1.62** (billed $0.00045/sec of video) | 96% run success, updated today | Near zero (API call, S3 delivery) |
| Apify: streamers/youtube-video-downloader | $4.20–6.00 ($0.006/MB free tier → $0.0008/MB at volume) | 99.9% success, 16.4k users, updated today | Near zero |
| RapidAPI (YT-API, YouTube Media Downloader) | ~$0.01–0.30 nominal | Volatile class; CDN links often IP-locked → may not fetch from VPS | Low, but churn risk high |
| Cobalt self-hosted | $0 + proxy bandwidth | Broken on datacenter IPs without residential egress | Medium-high |
| DIY yt-dlp + residential proxy | $2.45–4.00 (bandwidth at $3.5–4/GB) | Works today; permanent cat-and-mouse (PO tokens, cookies) | High |

1h 1080p (~1.5–2 GB): epctex $2.70 · streamers $9–12 · DIY $5.25–8.00. **Apify epctex wins on cost at both resolutions** because it bills per second of video, not per GB.

## 1. Apify actors (video file, not metadata)

### epctex/youtube-video-downloader — current best
- Pricing: pay-per-event, per second of video by resolution: 360p $0.00015/s, 480p $0.00025/s, 720p $0.00045/s, 1080p $0.00075/s, 1440p $0.001/s, 4K $0.0012/s. 1h@720p = 3600 × 0.00045 = **$1.62**; 1h@1080p = **$2.70**. "No platform costs, no proxy costs." <https://apify.com/epctex/youtube-video-downloader>
- Max res 4K. Delivery: Apify key-value store by default, or your own S3 / GCS / DigitalOcean / Azure bucket.
- Health: 4.51★, 4,324 total users, 373 monthly, 96.0% run success; `modifiedAt 2026-08-18` (Apify API <https://api.apify.com/v2/acts/epctex~youtube-video-downloader>) — actively maintained the day of this research.
- Rate limits: none documented; Apify platform concurrency limits apply.

### streamers/youtube-video-downloader — biggest, pricier
- Pricing: pay-per-event **$0.006/MB downloaded** (FREE tier), tiered to $0.005 (Bronze) … $0.0008/MB (Diamond), + flat actor-start fee; min charge $0.50/run. Verified from the actor's `pricingInfos` (started 2026-08-18) via <https://api.apify.com/v2/acts/streamers~youtube-video-downloader>. 1h@720p ≈ $4.20–6.00 on entry tiers.
- 720p standard, higher res available (slower). Delivery to S3/GCS/Azure or Apify storage (auto-deleted ~3 days). 4.25★, 16,399 users, 99.9% run success. <https://apify.com/streamers/youtube-video-downloader>

### truefetch/youtube-video-downloader — cheap but poorly rated
- $0.01 start + $0.30 download-with-storage + metered usage (≈ $0.31+/video); KV-store URL in `video` field; README dated 2026-08-09. **1.93★**, 255 users — rating is a red flag. <https://apify.com/truefetch/youtube-video-downloader>

Note: s-r/youtube-video-downloader is `isDeprecated: true` (Apify API) — skip. YouTube breakage risk is real for all actors, but both top actors show same-day `modifiedAt`, i.e., maintainers are patching continuously.

## 2. RapidAPI-class APIs

- **YT-API (ytjar)** — most popular YouTube API on RapidAPI: popularity 9.9/10, 100% success rate, ~693 ms latency (embedded page metrics). Plans (from page data): BASIC free, PRO $51/mo, ULTRA $144/mo, MEGA $240/mo; exact quotas UNVERIFIED (embedded JSON ambiguous). <https://rapidapi.com/ytjar/api/yt-api>
- **YouTube Media Downloader (DataFanatic)** — popularity 9.9/10, 98% success, ~2.5 s latency; BASIC free, PRO $12/mo, ULTRA $24/mo, MEGA $72/mo (~1.5M req). <https://rapidapi.com/DataFanatic/api/youtube-media-downloader>
- Honest characterization: these mostly resolve googlevideo CDN links rather than proxying the file; such links expire in hours and are typically **IP-bound to the resolver**, so fetching them from your VPS often 403s (widely reported; per-API behavior UNVERIFIED). Listings churn, get suspended, and per-video large-file proxying is rarely included at these prices. Fine for prototypes; not a production backbone.

## 3. Cobalt (cobalt.tools)

- Public API (`api.cobalt.tools`) sits behind bot protection (Turnstile-issued JWT / API keys) and is "**not** intended to be used in other projects without explicit permission" — you must self-host or get instance access. <https://github.com/imputnet/cobalt/blob/main/docs/api.md>
- Self-hosted on datacenter IPs: YouTube is broken/blocked in practice — issue #1475 ("YouTube Download broken even for self hosters", opened 2025-11, still open: empty file tunnels / 0-byte files) and #1230 (how to avoid YouTube IP blocks when self-hosting, no maintainer fix). You end up needing cookies + residential egress anyway. <https://github.com/imputnet/cobalt/issues/1475>, <https://github.com/imputnet/cobalt/issues/1230>
- License: API code AGPL-3.0 (commercial use OK, copyleft — must publish modifications); web UI CC-BY-NC-SA-4.0 (non-commercial). <https://github.com/imputnet/cobalt/blob/main/api/README.md>, <https://github.com/imputnet/cobalt/blob/main/web/README.md>
- Verdict: no advantage over running yt-dlp yourself; same IP problem, plus AGPL obligations.

## 4. DIY: yt-dlp + residential proxies

Per-GB pricing (live pricing pages, 2026-08-18):

| Vendor | PAYG | Cheapest committed | Source |
|---|---|---|---|
| Bright Data | $4/GB | $3/GB ($999/mo, 332 GB) | <https://brightdata.com/pricing/proxy-network/residential-proxies> |
| Oxylabs | n/a (plans only) | $6/GB (5 GB/$30) → $2.50/GB (1 TB/$2,500) | <https://oxylabs.io/pricing/residential-proxy-pool> |
| Decodo (ex-Smartproxy) | $4/GB | $3.50/GB (10 GB/$35) → $2.75/GB (100 GB) | <https://decodo.com/pricing> |

- Per-video math (whole file must transit the proxy — googlevideo URLs are bound to the requesting IP): 1h 720p (0.7–1 GB) at Decodo $3.50/GB = **$2.45–3.50**; at Bright Data PAYG $4 = $2.80–4.00. 1h 1080p (1.5–2 GB) = **$5.25–8.00**.
- YouTube-specific unblocker: none per-GB. Bright Data Web Unlocker is $1.50/1k req PAYG → $1.00/1k at $1,999/mo (<https://brightdata.com/pricing/web-unlocker>), but it targets page/API unlocking, and account-managed YouTube use is excluded; suitability for multi-GB video payloads UNVERIFIED — assume no. Oxylabs shows no YouTube product on the residential pricing page.
- Reliability context: PO tokens alone no longer reliably bypass the bot wall; the current meta is yt-dlp + bgutil-ytdlp-pot-provider + rotated cookies + residential egress, and YouTube keeps tightening (<https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide>, <https://github.com/Brainicism/bgutil-ytdlp-pot-provider>). This is an ongoing maintenance tax, not a set-and-forget.

## 5. Anything new in 2026

- No credible commercial "yt-dlp as a service" emerged — the space is self-host repos and web UIs (e.g. <https://ytdlp.online/>, <https://github.com/hifiwi-fi/yt-dlp-api>). The venue for this product category has effectively become Apify's marketplace (per-event billing, maintained actors).
- Official route still closed: YouTube API Services Developer Policies III.E.1 (updated 2026-06-24) — API clients "must not… download, import, backup, cache, or store copies of YouTube audiovisual content without YouTube's prior written approval." <https://developers.google.com/youtube/terms/developer-policies> and ToS §16.3 (updated 2026-04-28) <https://developers.google.com/youtube/terms/api-services-terms-of-service>. There is no self-serve licensing product for downloads.

## Recommendation for Reelize

1. **Ship an Apify adapter now.** Primary: `epctex/youtube-video-downloader` ($1.62 per 1h@720p, direct-to-S3, updated same-day). Fallback in the same adapter: `streamers/youtube-video-downloader` (larger user base, 99.9% success, but 2–4× the cost). ~1–2 hours of integration; zero proxy ops.
2. **Skip DIY residential proxies for now.** Counterintuitively, DIY is *more expensive* per long video ($2.45–8.00 in bandwidth alone vs $1.62–2.70 on epctex) *plus* the PO-token/cookie maintenance tax. DIY only wins if Apify actors break faster than they're patched, or at enterprise bandwidth pricing (≤ ~$1.5/GB).
3. **Hedge behind an interface.** Define a `Downloader` port (URL + max-res in → S3 key out) so a proxy-based yt-dlp implementation can slot in later. Keep local yt-dlp as the dev-machine implementation.
4. Skip Cobalt (same IP wall, AGPL) and RapidAPI (IP-locked links, listing churn) for production.
