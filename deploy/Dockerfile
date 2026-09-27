# Both base images support the ARM64 machines in Oracle's Always Free tier.
FROM node:22-bookworm-slim AS javascript
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DATA_DIR=/data \
    JS_RUNTIME=node:/usr/local/bin/node \
    BIND_HOST=127.0.0.1 \
    PORT=8787

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 velora \
    && useradd --uid 10001 --gid 10001 --no-create-home --home-dir /data velora \
    && mkdir /data \
    && chown 10001:10001 /data

COPY --from=javascript /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY worker/requirements.lock /app/worker/requirements.lock
RUN pip install --no-cache-dir -r /app/worker/requirements.lock
COPY worker/*.py /app/worker/
COPY shared/platforms.json /app/shared/platforms.json
COPY --chmod=755 deploy/container-start.sh /app/start.sh

USER 10001:10001
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8787')+'/api/health',timeout=4)"
ENTRYPOINT ["/app/start.sh"]
