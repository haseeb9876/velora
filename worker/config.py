import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / '.env')
DATA = Path(os.getenv('DATA_DIR', str(ROOT / 'data'))).resolve()
DATA.mkdir(parents=True, exist_ok=True)
DOWNLOADS = DATA / 'downloads'
DOWNLOADS.mkdir(exist_ok=True)
ORIGINS = [x.strip().rstrip('/') for x in os.getenv('ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',') if x.strip()]
MAX_CONCURRENT = max(1, min(4, int(os.getenv('MAX_CONCURRENT', '1'))))
MAX_QUEUE = int(os.getenv('MAX_QUEUE', '20'))
MAX_PLAYLIST = int(os.getenv('MAX_PLAYLIST', '10'))
MAX_DURATION = int(os.getenv('MAX_DURATION', '1800'))
MAX_FILE = int(os.getenv('MAX_FILE_MB', '500')) * 1024 * 1024
MAX_STORAGE = int(os.getenv('MAX_STORAGE_MB', '2000')) * 1024 * 1024
TTL = int(os.getenv('FILE_TTL_HOURS', '2')) * 3600
TIMEOUT = int(os.getenv('JOB_TIMEOUT_SECONDS', '900'))
RATE = int(os.getenv('RATE_LIMIT_PER_HOUR', '40'))
PUBLIC_URL = os.getenv('PUBLIC_WORKER_URL', '').rstrip('/')
TRUST_CF = os.getenv('TRUST_CLOUDFLARE', 'false').lower() == 'true'
secret_file = DATA / '.secret'
if not secret_file.exists():
    import secrets
    try:
        with secret_file.open('x') as f:
            f.write(secrets.token_hex(32))
        secret_file.chmod(0o600)
    except FileExistsError:
        pass
SECRET = secret_file.read_text().strip().encode()

LOCAL_NODE = ROOT.parent / 'node_modules' / 'node' / 'bin' / 'node'
JS_RUNTIME = os.getenv('JS_RUNTIME', 'node:' + str(LOCAL_NODE) if LOCAL_NODE.exists() else 'node')

TRUST_LOCAL_PROXY = os.getenv('TRUST_LOCAL_PROXY', 'false').lower() == 'true'
