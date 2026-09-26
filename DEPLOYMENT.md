# Velora deployment

Deployment configured on 26 September 2026.

| Component | Location |
|---|---|
| Public PWA | https://velora-downloader.vercel.app |
| Public source | https://github.com/haseeb9876/velora |
| Ubuntu API and file delivery | https://velora-worker.tail4314ba.ts.net |
| Vercel project | `velora-downloader` in `haseeb9876s-projects` |
| Neon project | `velora` (`patient-wave-82684784`), Singapore |
| Local project | `/home/ubuntu/devops/Downloading-platform` |

Vercel hosts the static app. The Ubuntu worker prepares and serves files through Tailscale Funnel. Neon stores analysis and job metadata, not media. The Vercel project uses Hobby and the Neon organization uses Free; no paid plan was enabled. The free hosting arrangement is subject to the providers' eligibility and usage limits described in the README.

## Keep the worker available

Both user services are installed and enabled:

```bash
systemctl --user status velora-worker velora-connector
systemctl --user restart velora-worker
```

Keep Ubuntu powered on, awake and connected to the internet. Closing a setup terminal is safe. A shutdown, suspension, lost internet connection, or termination of the user's service manager stops downloads. User lingering and power settings have not been changed; user services may stop after every login session ends.

Check public availability:

```bash
curl --fail https://velora-worker.tail4314ba.ts.net/api/health
```

This reports API/FFmpeg availability; an actual download also exercises Neon and the source platform. Check recent worker logs locally with `journalctl --user -u velora-worker -n 50`. Review logs for sensitive details before sharing them.

The connector runs in userspace with project-local binaries. Its persisted account state is under ignored `worker/data/tailscale/`. It does not require router port forwarding. To inspect the public route:

```bash
cd /home/ubuntu/devops/Downloading-platform
.tools/tailscale/tailscale --socket="$PWD/worker/data/tailscale/tailscaled.sock" funnel status
```

## Configuration and updates

`worker/.env` contains the private Neon connection string and the allowed production origin. It is excluded from Git and Vercel uploads. Tailscale state, downloaded files, signing keys, and CLI credentials are also excluded. Never put the Neon connection string in a frontend variable.

Vercel has `VITE_API_URL=https://velora-worker.tail4314ba.ts.net` configured for production and preview. GitHub is connected to the Vercel project. The worker accepts the stable production origins only; arbitrary preview URLs need explicit CORS configuration before they can use the worker.

Frontend builds deploy to Vercel. Python worker changes must also reach this Ubuntu directory and require `systemctl --user restart velora-worker`; a GitHub push alone does not update a worker on another machine. Run the checks in the README before publishing changes.

The current beta processes one job at a time, accepts up to ten playlist items, limits each source to 30 minutes and each prepared file to 500 MB, and uses approximately 2 GB of temporary media storage. Files expire after two hours. Idle cleanup does not query Neon every minute, allowing its compute to suspend between visits.

## Using the app

Open the public PWA, paste a permitted public video link, tap an available quality or audio format. The job starts immediately and the app automatically requests saving when it is ready. Use **Save file / Save again** if your browser blocks that request. Compatible MP4 favors playback compatibility; Original skips compatibility conversion. The original source determines available resolution and whether audio exists.

On supported Android/desktop browsers, use **Install Velora** or the browser's install option. On iPhone/iPad, open in Safari and use **Share → Add to Home Screen**. Installation prompts depend on the browser. Physical-device installation remains a user acceptance check; browser emulation does not prove every device's behavior.

See [VERIFICATION.md](VERIFICATION.md) for the tested platforms and remaining limitations.
