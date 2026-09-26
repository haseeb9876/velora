import ipaddress
import importlib.metadata
import logging
import os
import queue
import re
import secrets
import shutil
import signal
import threading
import time
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
import config
import media
from egress import start_proxy
from security import sign, verify
from storage import Store

logger = logging.getLogger('velora')
store = None
proxy = None
jobs_queue = queue.Queue(config.MAX_QUEUE)
lock = threading.RLock()
active = {}
processes = {}
stopping = threading.Event()
inspect_slots = threading.BoundedSemaphore(2)
rates = defaultdict(deque)

def save(job):
    store.put('job', job['owner'], job, job['created'] + 86400)

def clean_folder(id):
    shutil.rmtree(config.DOWNLOADS / id, ignore_errors=True)

def run_worker():
    while not stopping.is_set():
        try:
            id = jobs_queue.get(timeout=1)
        except queue.Empty:
            continue
        with lock:
            job = active.get(id)
        try:
            if not job or job['status'] == 'cancelled':
                continue
            used = sum(f.stat().st_size for f in config.DOWNLOADS.rglob('*') if f.is_file())
            if used + config.MAX_CONCURRENT * config.MAX_FILE * 3 > config.MAX_STORAGE or shutil.disk_usage(config.DOWNLOADS).free < config.MAX_FILE * 3:
                raise ValueError('Temporary storage is full. Remove completed files or wait for them to expire, then try again.')
            job.update(status='processing', progress=0)
            save(job)
            if job.get('preset'):
                info = media.inspect(job['url'], proxy)
                job['option'] = media.choose(info, job['preset'])
                job['title'] = info['title']
                save(job)
            def progress(value):
                value = max(value, job.get('progress', 0))
                if value != job.get('progress') and job['status'] != 'cancelled':
                    job['progress'] = value
                    save(job)
            def set_process(proc):
                with lock:
                    if proc is None:
                        processes.pop(id, None)
                    else:
                        processes[id] = proc
            path = media.download(job, proxy, progress, lambda: job['status'] == 'cancelled' or stopping.is_set(), set_process)
            if job['status'] == 'cancelled':
                clean_folder(id)
            else:
                job.update(status='ready', progress=100, file=str(path), size=path.stat().st_size, expires=time.time() + config.TTL)
            save(job)
        except Exception as exc:
            if job:
                if job['status'] != 'cancelled':
                    job.update(status='failed', error=str(exc) if isinstance(exc, ValueError) else 'The worker could not finish this download. Please try again.')
                save(job)
                clean_folder(id)
            if not isinstance(exc, ValueError):
                logger.exception('Download failed')
        finally:
            with lock:
                active.pop(id, None)
                processes.pop(id, None)
            jobs_queue.task_done()

def janitor():
    while not stopping.wait(60):
        try:
            for job in store.list('job', include_expired=True):
                if job['status'] == 'ready' and job.get('expires', 0) < time.time():
                    clean_folder(job['id'])
                    job.update(status='expired', file=None)
                    save(job)
            store.cleanup()
            with lock:
                cutoff = time.time() - 3600
                for key in list(rates):
                    while rates[key] and rates[key][0] < cutoff:
                        rates[key].popleft()
                    if not rates[key]:
                        del rates[key]
        except Exception:
            logger.exception('Cleanup failed')

@asynccontextmanager
async def lifespan(app):
    global store, proxy
    stopping.clear()
    store = Store()
    server, proxy = start_proxy()
    # Files and subprocesses cannot survive a worker restart reliably.
    for job in store.list('job', include_expired=True):
        if job['status'] in ('queued', 'processing'):
            job.update(status='failed', error='The worker restarted. Please start this download again.')
            clean_folder(job['id'])
            save(job)
    known = {j['id'] for j in store.list('job')}
    for folder in config.DOWNLOADS.iterdir():
        if folder.is_dir() and folder.name not in known:
            shutil.rmtree(folder, ignore_errors=True)
    threads = [threading.Thread(target=run_worker, daemon=True) for _ in range(config.MAX_CONCURRENT)]
    threads.append(threading.Thread(target=janitor, daemon=True))
    for thread in threads:
        thread.start()
    yield
    stopping.set()
    with lock:
        for proc in processes.values():
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGKILL)
    for thread in threads:
        thread.join(timeout=5)
    server.shutdown()
    server.server_close()

app = FastAPI(title='Velora worker', version='1.0.0', lifespan=lifespan, docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=config.ORIGINS, allow_methods=['GET','POST','DELETE'], allow_headers=['Authorization','Content-Type'])

@app.middleware('http')
async def guard(request, call_next):
    origin = request.headers.get('origin')
    if origin and origin not in config.ORIGINS:
        return JSONResponse({'detail': 'This app origin is not allowed by the worker.'}, status_code=403)
    try:
        if int(request.headers.get('content-length', '0')) > 16384:
            return JSONResponse({'detail':'Request is too large.'}, status_code=413)
    except ValueError:
        return JSONResponse({'detail':'Invalid request.'}, status_code=400)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['Cache-Control'] = 'no-store'
    return response

def client_ip(request):
    if config.TRUST_CF and request.client and request.client.host in ('127.0.0.1', '::1'):
        return request.headers.get('cf-connecting-ip', request.client.host)
    if config.TRUST_LOCAL_PROXY and request.client and request.client.host in ('127.0.0.1', '::1'):
        forwarded = request.headers.get('x-forwarded-for', '').split(',')[-1].strip()
        try:
            return str(ipaddress.ip_address(forwarded))
        except ValueError:
            pass
    return request.client.host if request.client else 'unknown'

def rate(request, action, limit, cost=1):
    key = (client_ip(request), action)
    now = time.time()
    with lock:
        if len(rates) > 10000 and key not in rates:
            raise HTTPException(503, 'The worker is busy. Please try again later.')
        values = rates[key]
        while values and values[0] < now - 3600:
            values.popleft()
        if len(values) + cost > limit:
            raise HTTPException(429, 'You have reached the beta hourly limit. Please try again later.', headers={'Retry-After':'3600'})
        values.extend([now] * cost)

def owner(request: Request):
    try:
        token = request.headers.get('authorization', '').removeprefix('Bearer ')
        data = verify(token)
        if data.get('type') != 'session':
            raise ValueError()
        return data['sub']
    except (ValueError, KeyError):
        raise HTTPException(401, 'Your session expired. Please refresh and try again.') from None

class InspectBody(BaseModel):
    url: str = Field(min_length=8, max_length=2048)
    mode: Literal['video','playlist'] = 'video'

class JobBody(BaseModel):
    analysis_id: str = Field(max_length=64)
    option_id: str | None = Field(default=None, max_length=64)
    entry_ids: list[str] = Field(default_factory=list, max_length=50)
    preset: Literal['best','1080','720','480','mp3','m4a'] = 'best'

def public_job(job):
    return {k:v for k,v in job.items() if k not in ('owner','file','url','option','preset')}

@app.get('/api/health')
def health():
    return {'status':'online', 'ffmpeg': bool(shutil.which('ffmpeg')), 'downloader': importlib.metadata.version('yt-dlp'),
            'limits': {'playlist':config.MAX_PLAYLIST,'duration':config.MAX_DURATION,'fileMb':config.MAX_FILE // 1024 // 1024,'retentionHours':config.TTL // 3600}}

@app.post('/api/session')
def session(request: Request):
    rate(request, 'session', 60)
    return {'token':sign({'type':'session','sub':secrets.token_hex(24),'exp':time.time() + 7*86400})}

@app.post('/api/inspect')
def analyze(body: InspectBody, request: Request, user=Depends(owner)):
    rate(request, 'inspect', config.RATE)
    if not inspect_slots.acquire(blocking=False):
        raise HTTPException(503, 'Both analysis slots are busy. Please try again in a moment.')
    try:
        item = media.inspect(body.url, proxy, body.mode == 'playlist')
        item['id'] = str(uuid.uuid4())
        store.put('analysis', user, item, time.time() + 1800)
        # Format selectors remain on the worker; browser only submits opaque IDs.
        public = dict(item)
        if 'options' in public:
            public['options'] = [{k:v for k,v in f.items() if k != 'spec'} for f in item['options']]
        return public
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    finally:
        inspect_slots.release()

@app.post('/api/jobs', status_code=201)
def create_jobs(body: JobBody, request: Request, user=Depends(owner)):
    analysis = store.get(body.analysis_id, 'analysis', user)
    if not analysis:
        raise HTTPException(404, 'This analysis expired. Please analyze the link again.')
    pending = []
    if analysis['kind'] == 'video':
        option = next((f for f in analysis['options'] if f['id'] == body.option_id), None)
        if not option:
            raise HTTPException(422, 'Choose an available format.')
        pending = [{'url':analysis['url'], 'title':analysis['title'], 'option':option, 'label':option['label'] + ' · ' + option['ext'].upper()}]
    else:
        selected = set(body.entry_ids)
        entries = [e for e in analysis['entries'] if e['id'] in selected]
        if not entries or len(entries) != len(selected) or len(entries) > config.MAX_PLAYLIST:
            raise HTTPException(422, 'Choose available playlist items within the beta limit.')
        pending = [{'url':e['url'],'title':e['title'],'preset':body.preset,'label':body.preset.upper() if body.preset in ('mp3','m4a') else ('Best available' if body.preset == 'best' else body.preset + 'p or lower')} for e in entries]
    used = sum(f.stat().st_size for f in config.DOWNLOADS.rglob('*') if f.is_file())
    with lock:
        if used + config.MAX_CONCURRENT * config.MAX_FILE * 3 > config.MAX_STORAGE:
            raise HTTPException(503, 'Temporary storage is busy. Please wait for earlier files to expire or download fewer items.')
        if len(active) + len(pending) > config.MAX_QUEUE or jobs_queue.qsize() + len(pending) > config.MAX_QUEUE:
            raise HTTPException(503, 'The download queue is full. Please try again shortly.')
        if sum(j['owner'] == user for j in active.values()) + len(pending) > config.MAX_PLAYLIST:
            raise HTTPException(429, 'Please wait for your existing downloads to finish.')
        rate(request, 'download', config.RATE, len(pending))
        created = []
        for item in pending:
            job = {**item, 'id':str(uuid.uuid4()), 'owner':user, 'status':'queued','progress':0,'created':time.time()}
            save(job)
            active[job['id']] = job
            jobs_queue.put_nowait(job['id'])
            created.append(public_job(job))
    return {'jobs':created}

@app.get('/api/jobs')
def get_jobs(user=Depends(owner)):
    return {'jobs': sorted([public_job(j) for j in store.list('job', user)], key=lambda j:j['created'], reverse=True)[:50]}

@app.delete('/api/jobs/{id}')
def cancel(id: str, user=Depends(owner)):
    with lock:
        job = store.get(id, 'job', user)
        if not job:
            raise HTTPException(404, 'Download not found.')
        if id in active:
            active[id]['status'] = 'cancelled'
            save(active[id])
        else:
            job.update(status='cancelled', file=None)
            save(job)
            clean_folder(id)
    return {'ok':True}

@app.post('/api/jobs/{id}/ticket')
def ticket(id: str, request: Request, user=Depends(owner)):
    job = store.get(id, 'job', user)
    if not job or job['status'] != 'ready' or job.get('expires', 0) < time.time():
        raise HTTPException(410, 'This file is not ready or has expired. Start another download.')
    token = sign({'type':'file','job':id,'sub':user,'exp':time.time() + 600})
    origin = config.PUBLIC_URL or str(request.base_url).rstrip('/')
    return {'url':f'{origin}/files/{id}?ticket={token}'}

@app.get('/files/{id}')
def file(id: str, ticket: str):
    try:
        data = verify(ticket)
        if data.get('type') != 'file' or data.get('job') != id:
            raise ValueError()
        job = store.get(id, 'job', data['sub'])
        if not job or job['status'] != 'ready' or job['expires'] < time.time():
            raise ValueError()
        path = Path(job['file']).resolve()
        if path.parent != (config.DOWNLOADS / id).resolve() or not path.is_file():
            raise ValueError()
    except (ValueError, KeyError, TypeError):
        raise HTTPException(410, 'This download link expired or the file was removed.') from None
    title = re.sub(r'[\x00-\x1f/\\:*?"<>|]', '', job['title']).strip('. ')[:120] or 'Velora download'
    return FileResponse(path, filename=title + path.suffix, media_type='application/octet-stream', headers={'Cache-Control':'private, no-store'})
