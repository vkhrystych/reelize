# YouTube cookie operations for server-side yt-dlp (research, 2026-08-18)

**TL;DR**
1. **Cookie lifetime:** no fixed TTL — cookies die when YouTube rotates them (any browser reuse of the session kills the exported jar within hours); a correctly done private-window export historically lasted weeks-to-a-month, with 2025 anecdata of 3–5 days; heavy use or datacenter IPs shorten it further.
2. **Ban threshold:** none published anywhere. YouTube ToS bans downloading and automated access outright; enforcement observed in the wild is IP bot-walls, per-account "Video unavailable" blocks on heavily-used accounts, and rare bans — all anecdotal, no numbers.
3. **Playwright re-login:** scripted Google login is actively blocked ("This browser or app may not be secure") and stealth workarounds are a fragile cat-and-mouse game; the durable pattern is a persistent already-logged-in profile you export cookies from, not automated re-login. OAuth alternatives are dead.

---

## 1. How often does a YouTube cookie jar go stale?

**What invalidates cookies — primary source, yt-dlp wiki ["Exporting YouTube cookies"](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies):**
- "YouTube rotates account cookies frequently on open YouTube browser tabs as a security measure." Any exported jar whose parent browser session is used again gets rotated out from under yt-dlp.
- Recommended procedure: log in inside a fresh private/incognito window, navigate to `youtube.com/robots.txt` as the only open tab, export cookies with an extension, then **close the private window and never reopen that session**. The jar then survives because the browser never triggers rotation.

**Mechanics (maintainer analysis, [issue #8227](https://github.com/yt-dlp/yt-dlp/issues/8227)):**
- coletdjnz traced rotation to the browser calling `accounts.youtube.com/RotateCookiesPage` → `RotateCookies`; implementing the rotation dance in yt-dlp was judged "not really feasible or worthwhile to maintain."
- bashonly: "youtube is rapidly invalidating cookies for IP addresses that have been flagged (e.g. data center IPs)" — IP reputation also kills jars.
- bashonly in [issue #12009](https://github.com/yt-dlp/yt-dlp/issues/12009): "after you export the cookies to a cookiefile, you can't use that session in your browser or else the cookies will be rotated." gamer191 adds that use of *other Google services* under the same session can also rotate them ([his export gist](https://gist.github.com/gamer191/ddf0b23b0a6df8e2ffe81bd1dda9154c)).

**Observed lifetime (anecdotal):**
- [Issue #13964](https://github.com/yt-dlp/yt-dlp/issues/13964) (Aug 2025): user reports incognito-exported jars now lasting ~3–5 days vs. ~1 month previously. No maintainer confirmation of a specific TTL exists.
- yt-dlp now detects and warns when supplied cookies were invalidated by rotation ([PR #13014](https://github.com/yt-dlp/yt-dlp/pull/13014), coletdjnz) — watch for this warning in logs as the staleness signal.

**Planning number:** expect a correctly exported jar from a lightly-used account on a clean IP to last **days to weeks (budget ~1–4 weeks, monitor for the rotation warning)**; expect near-immediate death if the session is ever reused in a browser or the server IP is flagged.

## 2. Is there a known volume/rate that gets an account flagged or banned?

**No. There is no official or community-established numeric threshold.** What exists:

**Policy (official):** [YouTube Terms of Service](https://www.youtube.com/t/terms), "Permissions and Restrictions": you may not "access, reproduce, download … any part of the Service or any Content" except as expressly authorized, and may not "access the Service using automated means (such as bots, botnets or scraping technology)". The "Account Suspension & Termination" section lets YouTube terminate for repeated breach or harm. So any yt-dlp use with an account is ToS-breaching by definition; enforcement is discretionary.

**Enforcement observed (all anecdotal, from yt-dlp's tracker):**
- [Issue #10085](https://github.com/yt-dlp/yt-dlp/issues/10085) (Jun 2024): accounts used heavily with yt-dlp got "Video unavailable" on *all* videos via the web player — a per-account soft-block, not a Google-account termination.
- [Issue #10128](https://github.com/yt-dlp/yt-dlp/issues/10128) "Sign in to confirm you're not a bot": IP-level bot wall. coletdjnz (Sep 2024): if still blocked with a valid PO Token, "you are likely either downloading too much too fast and need to slow down, and/or are running from a DC IP which are susceptible to being blocked. We cannot help with this."
- Maintainer warning (gamer191, mirrored into [#13964](https://github.com/yt-dlp/yt-dlp/issues/13964)): "There is a small chance your account could be banned. **DO NOT login with an important Google account** (such as an account you use for Gmail)." Reports of outright bans exist (e.g. cookie-substitution tricks getting accounts banned, per community reports) but full Google-account terminations traced to moderate yt-dlp use are rare in the tracker.

**Maintainer-recommended risk reduction** ([README "Workarounds"/sleep options](https://github.com/yt-dlp/yt-dlp#workarounds)):
`--sleep-requests` (pause between API/metadata requests), `--sleep-interval`/`--max-sleep-interval` (pause between downloads), keep `-N` (concurrent fragments) low or default, avoid datacenter IPs where possible, and use a throwaway account — never a personal one.

## 3. Can Playwright automate re-login to mint fresh cookies?

**Playwright side (official docs, [playwright.dev/docs/auth](https://playwright.dev/docs/auth)):** yes, mechanically. `context.storageState({path})` saves cookies/localStorage/IndexedDB and can bootstrap later contexts already-authenticated; `launchPersistentContext(userDataDir)` keeps a real profile on disk. Docs note stored state must be deleted/refreshed when it expires and treated as a credential.

**Google side: scripted login is actively blocked.** Signing in to `accounts.google.com` from an automated browser hits "Couldn't sign you in — This browser or app may not be secure" ([Google Workspace: control access to less secure apps](https://knowledge.workspace.google.com/admin/apps/control-access-to-less-secure-apps); [Playwright issue #19420](https://github.com/microsoft/playwright/issues/19420); many [Google support threads](https://support.google.com/chrome/thread/224353947/can-t-login-with-automated-tests-this-browser-or-app-may-not-be-secure)). Known community workarounds — `playwright-extra` + stealth plugins, real-Chrome channel with spoofed UA, headful mode (xvfb on a VPS), human-like delays — work intermittently and break without notice; Google's detection is adversarial and updated continuously. App passwords don't apply (they cover IMAP/SMTP-style clients, not web login), and 2FA makes fully unattended re-login essentially impossible.

**The durable pattern instead:** log in **once, manually**, into a persistent profile (`user-data-dir`) or saved `storageState`, then *reuse that session indefinitely without ever re-running the login flow* — periodically dumping cookies from it. Caveat: per §1, a session that keeps getting used gets rotated; so either (a) point yt-dlp at the live profile via `--cookies-from-browser` right after a refresh visit, or (b) rely on yt-dlp itself: `--cookies FILE` both reads and **writes back** the updated cookie jar after each run ([README, `--cookies`](https://github.com/yt-dlp/yt-dlp#filesystem-options)), so a jar that yt-dlp keeps rotating on its own can outlive a static export.

**OAuth alternatives are dead:** the community plugin [yt-dlp-youtube-oauth2](https://github.com/coletdjnz/yt-dlp-youtube-oauth2) is archived (Jan 17, 2026) and marked obsolete; official OAuth landed in yt-dlp 2024.10.22, broke almost immediately (HTTP 400, [issue #11462](https://github.com/yt-dlp/yt-dlp/issues/11462)), and was **removed as broken** in [commit 52c0ffe / #11558](https://github.com/yt-dlp/yt-dlp/commit/52c0ffe40ad6e8404d93296f575007b05b04c686). There is no working OAuth path today.

## Implications for Reelize on a VPS

1. **Cookie strategy:** dedicated throwaway Google account (never the personal one — maintainer warning above), private-window export per the wiki procedure, jar deployed to the VPS. Let yt-dlp own the jar file (`--cookies`) so its own write-backs keep it fresh; alert on the "cookies rotated/invalidated" warning ([PR #13014](https://github.com/yt-dlp/yt-dlp/pull/13014)).
2. **Expected cadence:** plan for a re-export **every 2–4 weeks, possibly as often as weekly** (anecdata trends shorter through 2025). A datacenter VPS IP makes both cookie death and bot-walls more likely — that risk is independent of cookies.
3. **Rate hygiene:** `--sleep-requests 1 --sleep-interval 5 --max-sleep-interval 30`, one download at a time, no burst backfills on the throwaway account.
4. **Playwright auto-refresh: not worth building now.** Automated Google *login* is blocked and stealth bypasses are unreliable; the only semi-durable automation (persistent logged-in profile + periodic cookie dump under xvfb) is real engineering for a flaky win. A ~10-minute monthly manual re-export beats it until volume proves otherwise.
5. **Standing recommendation:** direct file upload (user uploads the source video) removes the entire cookie/ban/ToS problem class and remains the only fully reliable path.
