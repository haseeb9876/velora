# Velora

Live app: https://velora-downloader.vercel.app

Source: https://github.com/haseeb9876/velora

The connected Ubuntu installation is deployed. See [DEPLOYMENT.md](DEPLOYMENT.md) for its services and current URLs. The steps below also support a fresh installation.

A responsive, installable social-video downloader for a small, free beta. React + TypeScript provides the interface; an Ubuntu Python worker uses yt-dlp and FFmpeg to analyze and prepare media. Neon Postgres is optional; local SQLite works immediately with no account or subscription.

## Run locally

Requirements: Ubuntu, Python 3.12+, Node 20.19+ for the frontend (npm also installs project-local Node 22 for yt-dlp), FFmpeg and FFprobe.

```bash
cd /home/ubuntu/devops/Downloading-platform
npm ci
python3 -m venv .venv
.venv/bin/pip install -r worker/requirements.lock
python3 scripts/make-icons.py
bash scripts/start-worker.sh
```

In a second terminal:

```bash
cd /home/ubuntu/devops/Downloading-platform
npm run dev
```

Alternatively, after installing dependencies, run `npm run dev:full` to start both services together.

Open http://127.0.0.1:5173. Vite proxies `/api` and `/files` to the worker on port 8787. Keep both terminals running. No secrets or platform cookies are needed.

## Features

- Single-video inspection with actual available qualities, codec details, frame rate, and exact or estimated source size. A bounded five-minute extraction cache accelerates repeated links and avoids repeating extraction before download.
- One-click quality buttons start processing and automatically request browser saving when ready. Save again remains available if the browser blocks automatic saving.
- Compatible MP4 output prefers H.264 sources, converts other video codecs to H.264/AAC as needed, tone maps HDR to SDR, and preserves resolution without upscaling. Original mode keeps source codecs for faster preparation. MP3 and M4A audio extraction remain available.
- Prepared media is probed for missing tracks and invalid duration; beginning/middle/end decode checks reject detectable broken output. Transcoded output is checked for retained resolution and complete duration.
- Playlist selection and per-item preparation; default maximum 10 items. Source-platform playlist support varies.
- Anonymous browser sessions, job ownership checks, queued processing, cancellation, file removal and signed download links.
- Responsive light/dark UI, original geometric V logo, local fonts, matching PWA icons and a complete offline app shell. First-time mobile visitors receive a friendly installation dialog; Not now snoozes it for 24 hours while the install banner remains available. Native installation still requires a user tap; Safari instructions are included.
- Each production build has a unique version and precached assets. Open, online apps check for updates on launch, focus/resume, reconnect and every minute. Updates apply after a short idle period, defer during active jobs or format selection, preserve the current link and preferences, and coordinate across tabs. A manual Check updates control is available.
- Searchable download history with status filters and retry for failed/expired files. Retry rechecks source formats and uses the same ownership, queue and rate controls. Video/audio and playback preferences are remembered; app shortcuts open a new download, the library or audio mode. Pasted share text is cleaned to its video URL.
- Primary source adapters: YouTube, Facebook, TikTok and Instagram. Extended adapters: Vimeo, Reddit, X, Pinterest, Dailymotion, Twitch clips/recordings, Bluesky, LinkedIn and Snapchat Spotlight. The searchable catalog and worker share one explicit platform allowlist. An adapter is not a promise that every URL or source server will permit downloading.
- Optional Neon storage using the same document schema as SQLite. Media files always live on the Ubuntu worker.

## Free public beta architecture

```text
Mobile / laptop browser or installed PWA
    ├── Vercel: static UI and PWA assets
    └── HTTPS tunnel → Ubuntu worker: API, queue, yt-dlp, FFmpeg, temporary files
                           └── SQLite locally OR Neon Postgres for job metadata
```

Video bytes travel directly from the worker to the browser, not through a Vercel Function. Installing the PWA does not install a background download engine on the phone. The worker and its internet connection must remain online. Mobile browsers control file saving and may suspend activity when closed.

Vercel Hobby is for personal, non-commercial use. Confirm the intended beta is eligible before deployment; being temporarily free to visitors does not by itself establish eligibility. No paid service is provisioned by this repository.

### Configure the worker

Copy `worker/.env.example` to `worker/.env` and edit it. Never commit `.env` or `worker/data`.

- `ALLOWED_ORIGINS`: exact Vercel origin, e.g. `https://your-project.vercel.app`. Add local origins only if needed. No trailing slash or wildcard.
- `PUBLIC_WORKER_URL`: public HTTPS URL of the worker tunnel.
- `TRUST_LOCAL_PROXY=true`: only behind your own local HTTPS reverse proxy that overwrites or safely appends `X-Forwarded-For`. The startup script disables blanket forwarded-header trust; the application uses the rightmost forwarded address only for requests from loopback. Leave false for direct local use.
- `DATABASE_URL`: optional Neon pooled PostgreSQL connection string with `sslmode=require`. Keep this only on Ubuntu. It must never be prefixed with `VITE_`.
- `MAX_CONCURRENT=1`, `MAX_QUEUE=20`, `MAX_PLAYLIST=10`, `MAX_DURATION=1800`, `MAX_FILE_MB=500`, `MAX_STORAGE_MB=2000`, `FILE_TTL_HOURS=2`, `JOB_TIMEOUT_SECONDS=900`, `RATE_LIMIT_PER_HOUR=40`.

Processing reserves room for temporary video, audio and merged output. The 2 GB storage limit can fill before ten large playlist items complete; remove downloaded files from My downloads, select smaller formats, or adjust limits to your machine's capacity. Storage limits are approximate admission controls rather than filesystem quotas.

### Connect Neon (optional)

1. Create a Neon project using its free plan and copy its pooled connection string.
2. Add it as `DATABASE_URL` in `worker/.env`.
3. Restart the worker. It creates `velora_documents` and its index automatically.

Existing SQLite records are not migrated automatically. Switching databases starts a separate queue/history. Do not run multiple worker processes against the same queue: this beta uses one API process and in-process worker threads.

### Expose Ubuntu over HTTPS

A public HTTPS worker endpoint is required before remote users can download. This deployment uses Tailscale Funnel; current details are in [DEPLOYMENT.md](DEPLOYMENT.md). The alternatives below describe setup on another machine.

**Option A — eligible personal testing with Tailscale Funnel.** [Funnel](https://tailscale.com/docs/features/tailscale-funnel) can publish a local service on an HTTPS `*.ts.net` hostname. It is available on all plans, has bandwidth limits, and requires a Tailscale login and enabling Funnel for the device. The [free Personal plan](https://tailscale.com/pricing) is only for non-commercial use; do not assume a commercial beta qualifies because it is free to visitors.

After installing Tailscale using its official Ubuntu instructions and signing in:

```bash
tailscale funnel 8787
```

Follow the CLI's account/HTTPS setup instructions. Keep the process running. Set the displayed HTTPS origin as both `PUBLIC_WORKER_URL` on Ubuntu and `VITE_API_URL` on Vercel. Set `TRUST_LOCAL_PROXY=true` only when your own local proxy is the only route into the loopback-bound worker.

**Option B — your own public IP and HTTPS reverse proxy.** If your ISP allows inbound connections and your router can forward ports 80/443 to Ubuntu, use a hostname you control (a suitable free dynamic-DNS hostname can work) and an HTTPS reverse proxy such as Caddy. The template in `deploy/Caddyfile` proxies to the worker and overwrites the client-IP header. Configure the hostname, router and HTTPS certificate before pointing Vercel at it. Carrier-grade NAT can prevent this option; a public IP cannot be assumed.

**Cloudflare correction:** do not use a free Cloudflare Tunnel as the media-download path for this app. Its [routing documentation](https://developers.cloudflare.com/tunnel/concepts/routing/) describes restrictions on serving video and large files on free/self-service plans. No Cloudflare tunnel was created. The worker's optional Cloudflare header setting exists for independently permitted API-only arrangements, not a recommendation to send media through that service.

### Deploy the UI to Vercel

1. Put this project in your Git repository and import it into Vercel.
2. Use the Vite preset, build command `npm run build`, output directory `dist`.
3. Set `VITE_API_URL` to the worker's HTTPS origin. This is a public URL, not a secret. Do not put database credentials in Vercel frontend variables.
4. Set the exact deployed `https://…vercel.app` origin in the worker's `ALLOWED_ORIGINS`, then restart the worker.
5. Test `/api/health` on the worker URL, inspect a permitted public video in the UI, download both video and audio, and test installation on real devices.

The generated Vercel hostname is subject to availability. Deployment status and current service URLs are recorded in `DEPLOYMENT.md`. Credentials are kept on Ubuntu and are not included in this repository.

### Ubuntu services

The deployment setup uses two user services, `velora-worker.service` and `velora-connector.service`, to keep the worker and userspace HTTPS connector running when setup terminals close. Their templates are in `scripts/`. The connector uses project-local Tailscale binaries and persisted state under the ignored `worker/data/tailscale/` directory. It does not install a system VPN interface.

```bash
systemctl --user status velora-worker velora-connector
systemctl --user restart velora-worker
```

User services depend on the Ubuntu user's service manager. Without user lingering they may stop after all login sessions end. The machine must stay powered on, awake and connected; stopping/suspending it prevents remote downloads. No power or router settings are changed automatically.

For another Ubuntu installation, adjust paths in the service templates, copy them to `~/.config/systemd/user/`, run `systemctl --user daemon-reload`, then enable/start both services after configuring the environment and connector sign-in.

## Security and privacy

- Source URLs must use HTTPS and a known social-platform hostname; credentials and nonstandard ports are rejected.
- yt-dlp network requests go through a loopback egress proxy that rejects private, loopback, link-local and metadata destinations, including redirect destinations. DNS results are validated and the connection pins a checked address. FFmpeg processes locally downloaded files.
- Extractor-provided opaque format IDs are stored server-side; clients cannot supply command-line options, output paths or executable commands. Subprocesses use argument arrays, not a shell.
- Signed anonymous sessions isolate queues; signed download tickets expire after ten minutes. Treat tickets as bearer credentials. Access logging is disabled by the supplied startup script to avoid recording ticket URLs.
- CORS uses an explicit origin list. Rate limiting is process-local, and is a small-beta control rather than a distributed anti-abuse service. CORS alone does not stop scripts outside browsers.
- Files expire after two hours; job metadata after 24 hours; analyses after 30 minutes. File expiry is checked locally once a minute; expired database metadata is deleted hourly and at startup so an idle Neon compute can sleep. Clearing browser data loses access to existing jobs.
- Private content, account-cookie imports, DRM bypasses, and paywall access are not implemented. Use only content you own or have permission to download and comply with source-platform terms.

## Checks

```bash
npm run build
.venv/bin/python -m pytest worker/tests -q
npx playwright install chromium
npm run test:e2e
npm run test:pwa
npm run test:updates
```

Update tests build and serve two real app releases to verify periodic detection, safe activation, draft preservation, cross-tab behavior and offline reopening. Backend tests cover URL/network validation, signatures, ownership, queue lifecycle, real yt-dlp media retrieval from an owned fixture, FFmpeg merging and audio conversion. Browser tests use mocked platform responses to test UI behavior deterministically; they do not prove live platform availability.

## Maintenance and known limits

Social websites change frequently. Update yt-dlp in the virtual environment with `.venv/bin/pip install -U 'yt-dlp[default,curl-cffi]'`, run the tests, then record updated versions using `.venv/bin/pip freeze > worker/requirements.lock`. Authentication requirements, geographic restrictions and anti-bot blocks are surfaced as errors; no success is fabricated.

Background processing continues on Ubuntu. Saving is automatically requested for jobs started in the current tab when that tab is visible. Pending requests survive a reload in that tab. Browsers may restrict automatic/multiple file saving or suspend a phone in the background; use Save file / Save again if needed. The app does not claim that the browser saved a file merely because a download was requested.

Compatible MP4 may take longer, particularly for 4K. Conversion can change file size and recompress video; the UI labels source sizes separately when output size is unknown. Original mode keeps source codecs and may need a player that supports VP9/AV1/HEVC. The free Ubuntu worker cannot promise instant source lookups or real-time 4K conversion.

The install invitation remains visible until the app detects standalone mode or receives an installation event and remembers that state locally. Native installation requires a user gesture and browser support; iOS has manual instructions. Browsers do not universally report whether a PWA has been uninstalled.

Neon connections are checked when borrowed from the pool, and unused connections are released after 60 seconds. This avoids reusing an idle connection that the database has closed; it does not keep Neon awake with background health queries.

The PWA shell can open offline after an online visit. Media analysis and downloads require connectivity. Installation prompts and receiving shared links vary by browser, especially on iOS.

Before a broader launch, verify source permissions and provider terms, establish a stable worker endpoint, add operational monitoring and backups, verify the brand name, and publish operator/contact details appropriate to your deployment.

Every social URL cannot be guaranteed: adapters depend on public source availability and supported link types. When a platform omits audio metadata, the interface says audio is checked during download instead of incorrectly labeling the video silent. Audio-only attempts fail clearly if the source actually has no audio.

Rapid updates apply to the app code and styles while it is open, online and safe to refresh. Offline or OS-suspended apps update when they return. A device running the previous updater needs to reopen Velora once to receive this release. Home-screen icon/name changes follow the browser's separate manifest-update schedule; no instant OS-wide update is promised.
