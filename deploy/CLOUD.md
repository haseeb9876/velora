# Cloud worker deployment

Status: deployment package prepared; cloud provisioning and public cutover must be verified separately. The laptop remains the current worker until cutover completes.

## Free host selected

Oracle Cloud Always Free, reviewed 27 September 2026:

- `VM.Standard.A1.Flex`, **2 OCPUs and 12 GB memory total across the account**.
- Ubuntu 24.04 ARM64 image marked Always Free eligible; 50 GB boot volume.
- Home region only; total eligible boot/block volumes must remain within 200 GB.
- The documented outbound allowance is 10 TB/month. Do not provision a paid load balancer, NAT gateway, marketplace image or paid compute shape.
- Account verification normally requires a phone and card. Keep the account free; promotional trial credit does not establish that a resource is Always Free.
- Capacity is not guaranteed. Oracle can reclaim idle free VMs. Do not generate artificial activity to evade reclamation.

Sources: [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [account requirements](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm).

The VM runs independently of the owner's laptop. Vercel continues serving the frontend, and Neon continues storing production metadata. Cloud-hosted social extraction must be tested before cutover: platforms can treat datacenter IPs differently from residential connections.

### Signup troubleshooting

If **Continue** is disabled on Oracle's address/phone step before payment verification, check form validation first. This does not establish that the account or card has been rejected.

- Check the message beside each required field. Enter the city name alone, select the province/state if required, and enter the genuine postal code for the selected country.
- Select the phone country correctly and follow the number format shown by the form. Do not repeat a separately selected country code. Manually re-enter autofilled fields if they have not triggered validation.
- If every field is valid but the button remains disabled, try a current desktop browser with scripts/cookies permitted for the signup site. Reuse the same account details; do not create duplicate free accounts.
- If an email link has expired, Oracle documents a 30-minute validity period. Request a fresh link through the normal signup flow.
- For unresolved signup issues, use the Chat link Oracle identifies in its [Free Tier FAQ](https://www.oracle.com/cloud/free/faq/). Ask for help with the address/phone form, including the field message and browser version. Keep credentials, full addresses, phone numbers and card information out of project files and chat.

These are diagnostic steps, not a confirmed fix. Account verification must finish before resource availability or deployment can be checked. See the [official signup instructions](https://docs.oracle.com/en-us/iaas/Content/GSG/Tasks/signingup_topic-Sign_Up_for_Free_Oracle_Cloud_Promotion.htm).

## Runtime package

`deploy/Dockerfile` includes Python 3.12, Node 22, FFmpeg and the existing pinned Python dependencies. It runs as UID/GID 10001. The Docker build context allows only worker code, requirements, the platform catalog and the container entrypoint; credentials, local media and Tailscale state are excluded.

`deploy/compose.cloud.yml` is for a **Linux VM**. Host networking keeps the worker bound to `127.0.0.1:8787` and preserves the existing trusted-loopback proxy rule. Caddy alone exposes public HTTPS. There is one API process and one processing worker; running multiple processes against the same production database is unsupported.

The worker has a read-only root filesystem, a persistent `/data` mount, 8 GB memory limit and 1.8 CPU allocation. Its signing key and temporary files survive container replacement through `/data`. Automatic container restart depends on Docker being enabled at VM boot.

### Local container verification

On 27 September 2026, the Linux AMD64 image built successfully and all **49 backend tests** passed inside the container with the same 8 GB / 1.8 CPU limits. This includes real generated 4K VP9/Opus conversion to H.264/AAC without downscaling, HDR conversion, ownership and outbound request restrictions. Caddy configuration validation also passed.

The test suite places its simulated download storage under `/tmp`, so its temporary filesystem needs at least the worker's 1.5 GB processing reservation. The production container instead stores downloads on the persistent `/data` disk; its small `/tmp` mount is intentional.

```bash
docker build -f deploy/Dockerfile -t velora-worker:cloud .
docker run --rm --read-only --tmpfs /tmp:size=4g,mode=1777 \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 8g --cpus 1.8 \
  -v "$PWD/worker/tests:/app/worker/tests:ro" \
  --entrypoint python velora-worker:cloud \
  -m pytest /app/worker/tests -q -p no:cacheprovider
```

An isolated SQLite container also completed real Facebook MP4 (H.264/AAC) and MP3 downloads. A separate 1080p download survived a container restart: its existing session, signed file ticket, metadata and media remained valid, and the saved file passed full FFmpeg decoding. Allowed-origin CORS, rejected-origin access and anonymous ownership enforcement were also checked. A Snapchat inspection initially failed; a later direct extraction through the same guarded proxy succeeded. This illustrates why one successful sample is not a platform availability guarantee. Native ARM64, Oracle network access, public HTTPS and VM reboot checks remain pending until a VM exists.

## VM setup

1. Confirm existing tenancy usage before allocating the Always Free resources above. Use a public subnet with an Internet Gateway and a public IPv4 address. Allow TCP 80/443 from the internet and TCP 22 only from the administrator's current public IP. Keep 8787 private. Check both OCI network rules and the Ubuntu firewall.
2. Install Docker Engine and Compose from the [official Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/), and enable Docker at boot. Clone the Velora repository to `/srv/velora/app`.
3. Create `/srv/velora/data` owned by UID/GID 10001 and mode 0700. Copy `deploy/cloud.env.example` to `deploy/cloud.env` with mode 0600. Initially leave `DATABASE_URL` empty to isolate cloud smoke tests from production.
4. Set a public backend hostname that resolves to the VM. A free `velora.<PUBLIC-IP>.sslip.io` hostname can be used with Caddy's automatically renewed certificate. This depends on third-party DNS and certificate issuance; verify resolution and HTTPS before use. See [sslip.io](https://sslip.io/) and [Caddy HTTPS](https://caddyserver.com/docs/quick-starts/https).
5. Set `PUBLIC_WORKER_URL=https://<backend-hostname>` and the exact production origin in `deploy/cloud.env`. Set `VELORA_HOSTNAME` in the shell or Compose environment file.

From the cloned project, on the **cloud VM**:

```bash
docker compose -f deploy/compose.cloud.yml build
docker compose -f deploy/compose.cloud.yml up -d
docker compose -f deploy/compose.cloud.yml ps
```

Keep `deploy/cloud.env`, the persistent data directory and SSH/API keys out of Git. Do not publish expanded `docker compose config` output, since it can contain runtime secrets. Use `docker compose ... config --quiet` for validation.

## Validate before cutover

- Verify the public health endpoint and CORS behavior through HTTPS.
- Run actual YouTube, Facebook, TikTok, Instagram and X samples available to the operator. Also test MP3, video/audio merging, compatible MP4 and a permitted high-resolution source where available. Report individual platform failures honestly.
- Confirm an automatic browser save and full-file decode, not just an API health response.
- Confirm container restart and a VM reboot recover the service and retain the signing key/files. Reboots interrupt active processing; retry is available.
- Remove only smoke-test jobs and media.

## Production migration and rollback

1. Confirm the old worker queue is idle. Stop its API before connecting a new process to the production Neon database. Two workers must never perform startup recovery/cleanup on the same production job table simultaneously.
2. Copy the existing signing key (`worker/data/.secret`) and still-valid download folders over SSH into the new persistent data directory. Preserve private permissions and set ownership to 10001. Do not copy Tailscale state or expose the key in terminal/chat output.
3. Update retained jobs' stored absolute media paths from the laptop's download root to `/data/downloads` after verifying the target files. Keep a private rollback mapping of changed job IDs/paths; never change unrelated metadata or owners. Back up configuration and metadata before migration.
4. Configure the production Neon connection securely on the VM, start the cloud worker, and verify existing owned file tickets plus a newly created download.
5. Change Vercel's production `VITE_API_URL` to the new HTTPS backend, redeploy, and verify the installed-app update path. Keep the old endpoint available as a forwarding proxy during a brief migration window if existing clients still use the old frontend, then disable the laptop worker/connector after verifying the new app. Old offline clients need to reopen online to receive the new endpoint.
6. Verify the public app while both laptop services are stopped. Only then record laptop independence as complete.

If validation fails before public cutover, stop the new worker, restore any changed job paths/configuration, and restart the old worker. After new cloud jobs exist, rollback also requires copying any still-valid new media and reconciling their paths; never delete user files as part of an automatic rollback.

Routine frontend changes continue to deploy from GitHub to Vercel. Backend changes must be pulled and rebuilt on the cloud VM, with a queue-idle check before replacement. The laptop is then only a development machine.
