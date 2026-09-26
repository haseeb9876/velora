#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p worker/data/tailscale
chmod 700 worker/data/tailscale
exec .tools/tailscale/tailscaled --tun=userspace-networking --socket="$PWD/worker/data/tailscale/tailscaled.sock" --state="$PWD/worker/data/tailscale/tailscaled.state" --statedir="$PWD/worker/data/tailscale" --port=0
