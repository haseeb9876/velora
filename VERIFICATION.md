# Verification record

Verified on 26 September 2026 in the connected Ubuntu workspace.

## Automated

- Production TypeScript/Vite build passed.
- 36 backend checks passed: validation, blocked network destinations, signed tokens, job ownership, playlist selection/processing, rate limiting, real FFmpeg processing.
- 12 browser checks passed across desktop (1440px) and mobile (390px): analysis, quality/audio choices, queue, theme, dialogs, installation guidance, platform errors, horizontal overflow, idle polling and foreground refresh.
- Production PWA test passed: manifest, PNG icons, share-target configuration and offline shell after a previous online visit. This is not a substitute for installation testing on a physical iPhone/Android phone.
- Frontend dependency audit reported zero vulnerabilities when dependencies were installed.

## Live media

| Platform | Observed result |
|---|---|
| YouTube | Real API analysis and downloads passed for a short public sample. Saved MKV contained VP9 video + AAC audio; saved MP3 contained audio. |
| TikTok | Real API analysis and downloads passed after enabling yt-dlp browser compatibility. Saved MP4 contained H.264 video + AAC audio; MP3 conversion passed. |
| Instagram | Real API analysis and download passed for an upstream sample reel. The source was silent; saved MP4 correctly contained H.264 video without an audio track. UI labels silent sources. |
| Facebook | The initial upstream sample failed, but the user-provided public Facebook share/reel URL passed real API analysis and downloads. Qualities up to 1440p were exposed. Saved MP4 contained H.264 video + AAC audio; MP3 conversion passed. |
| Vimeo | The sample requested authentication; no successful download was claimed. |
| X, Reddit, Pinterest | Adapters wired through yt-dlp; not live-verified in this session. |

Temporary live-test downloads were removed after verification. Automated tests use isolated temporary directories and generated media; browser response fixtures are used only in tests, never in the application.

## Deployment state

- Public Vercel deployment is ready at https://velora-downloader.vercel.app and returns HTTP 200 without authentication.
- Public GitHub repository: https://github.com/haseeb9876/velora.
- Neon Free project is connected; schema creation and a temporary write/read/cleanup check passed against the actual database.
- Tailscale Funnel is enabled at https://velora-worker.tail4314ba.ts.net; both Ubuntu user services are enabled and active.
- A real Facebook video-with-audio download and MP3 download passed through the public HTTPS worker using the production app origin. Saved files were checked with FFprobe and test downloads removed.
- The deployed app also passed a real mobile-viewport browser flow: live Facebook analysis, highest available 1440p download saved with AV1 video (1440 × 2560) and AAC audio, no horizontal overflow, and an offline PWA shell after visiting online. Test files were removed.
- No paid plan or resource was enabled.

This is a deployed small beta, not a guarantee of unrestricted social-platform downloads or uninterrupted availability. Ubuntu must remain awake and online. See [DEPLOYMENT.md](DEPLOYMENT.md).

## September 2026 refinement release

- Updated interaction: a single quality-button click queues the job and automatically requests saving. Regression coverage verifies only one automatic save attempt, explicit Original mode, idle polling and recurring install guidance that stops after a recorded installation.
- Generated 3840 × 2160 VP9/Opus media was converted to H.264/AAC MP4 with no downscaling. The entire saved fixture decoded successfully; MP4 metadata precedes media data for playback startup. Original mode preserved VP9/Opus. A separate 10-bit HDR fixture was converted to 8-bit SDR. Missing expected audio and unreadable media are rejected.
- Short-lived metadata reuse, cache isolation/limits/expiry, actual cached-source downloading and fallback after an expired source URL were tested.
- In isolated staging, the provided Facebook link took 9.927 seconds to inspect initially and 0.006 seconds on a cache hit. This is a local-worker observation, not a promise for every link or an internet latency measurement.
- A real mobile browser lookup using the warm staging cache took 0.22 seconds. One tap on 720p produced an automatic download in 9.14 seconds with H.264/AAC tracks; full-file decoding passed. Real YouTube, TikTok, Facebook and silent Instagram samples also passed the updated staging pipeline.
- A stale Neon connection was reproduced in the previous deployment. Pool checkout now checks connection health. An actual Neon test disconnected only its own client socket; the following read recovered in 1.87 seconds.
- The original failing 4K URL/player was unavailable, so that specific historical incident could not be reproduced. The 4K regression uses generated media; mobile/desktop playback also depends on device decoding capability.

- Production verification after release: a real 1440p Facebook download saved automatically from the public mobile browser with H.264 video (1440 × 2560) and AAC audio; full-file decoding passed. Initial lookup took 10.48 seconds and preparation plus saving took 92.03 seconds on this four-core Ubuntu/free-tunnel setup. A subsequent cached lookup through public HTTPS took 3.848 seconds. These observations distinguish source lookup speed from high-resolution preparation time.
- Public responsive layouts passed at 320, 390, 768 and 1440 pixels. The logo and license-notice asset routes returned the correct content types; the updated offline PWA shell passed. Homepage screenshots were refreshed from the deployed app.
- Final release checks: 36 backend, 12 desktop/mobile browser, and 1 PWA check passed (49 total). The production worker and connector are active; temporary staging services were stopped and smoke-test downloads removed.

## 27 September 2026 install and update release

- First-visit mobile installation dialog with native-prompt handling, manual instructions, a 24-hour reminder snooze and suppression after installation is detected. Reviewed at 320px and 390px without horizontal overflow.
- Versioned release assets and revalidation headers replace the fixed service-worker version. Two real builds verified periodic detection, manual activation preserving a typed link, automatic activation after active downloads finish, offline reopening, and an update in a second tab without interrupting the first tab's focused draft.
- Library search/status filters, owned retry with fresh format selection, remembered format/playback preferences, app shortcuts, share-text normalization and a searchable shared 13-platform catalog.
- Missing source audio metadata no longer means “silent.” Video keeps available tracks; audio-only choices are offered with an availability note and actual output is validated.
- Added backend coverage for new platform hostnames and malicious lookalikes, retry ownership/rate/queue limits, expiry before scheduled cleanup, source-quality changes and unknown audio metadata.
- Live analysis succeeded for Dailymotion, Twitch, Bluesky, LinkedIn and Snapchat Spotlight samples. One Dailymotion sample was removed and one Bluesky sample was unavailable; alternate public samples succeeded. Individual-link failures remain possible.
- Real Twitch 1080p video saved with H.264/AAC, and MP3 extraction passed. Bluesky 360p video saved with H.264/AAC, and MP3 extraction passed. Test files were removed after verification.

- Real Snapchat Spotlight video saved with H.264/AAC and MP3 extraction passed; test files were removed. Dailymotion and LinkedIn were verified for analysis, without a completed file claim in this release.
- The final preview check exposed `Vary: Origin` headers preventing offline module/cache matches. Public precached assets now match by URL independent of that header; the two-release server includes the same header for regression coverage.

- Final automated checks: 49 backend, 22 mobile/desktop UI, 3 real two-release update and 1 production offline PWA check passed (75 total). Production dependency audit reported zero vulnerabilities. The TypeScript/Vite build and whitespace checks passed.

- Public deployment `bf5f5cc` is ready. Actual first-visit popups passed at 320px/390px, responsive layouts passed at 320/390/768/1440px, and the public mobile app reopened offline. `/version.json` returned the correct build with `Cache-Control: no-cache, must-revalidate`.
- A live public mobile browser analyzed the Snapchat sample in 7.24 seconds; one quality tap automatically saved H.264/AAC MP4 (480 × 880) in 15.48 seconds. Full-file FFmpeg decoding passed and the test job/file was removed. These are sample observations, not universal timing promises.
- Production screenshots were refreshed, including `docs/mobile-install.png`. The Ubuntu worker and HTTPS connector were active after the worker update; no production job was queued or processing at restart.
