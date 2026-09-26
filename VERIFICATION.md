# Verification record

Verified on 26 September 2026 in the connected Ubuntu workspace.

## Automated

- Production TypeScript/Vite build passed.
- 28 backend checks passed: validation, blocked network destinations, signed tokens, job ownership, playlist selection/processing, rate limiting, real FFmpeg processing.
- 8 browser checks passed across desktop (1440px) and mobile (390px): analysis, quality/audio choices, queue, theme, dialogs, installation guidance, platform errors, horizontal overflow, idle polling and foreground refresh.
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
