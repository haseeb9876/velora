#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -x .venv/bin/python ]; then
  echo 'Run python3 -m venv .venv and .venv/bin/pip install -r worker/requirements.txt first.'
  exit 1
fi
exec .venv/bin/python -m uvicorn app:app --app-dir worker --host 127.0.0.1 --port 8787 --no-access-log --no-proxy-headers
