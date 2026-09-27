#!/bin/sh
set -eu
umask 077

# One API process owns the queue and cleanup threads. Do not add --workers > 1.
exec python -m uvicorn app:app --app-dir /app/worker \
  --host "${BIND_HOST:-127.0.0.1}" --port "${PORT:-8787}" \
  --no-access-log --no-proxy-headers
