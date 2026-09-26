"""Start both local services; stop them together with Ctrl+C."""
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

root=Path(__file__).resolve().parents[1]
os.chdir(root)
children=[]
def shutdown(*_):
    for child in children:
        if child.poll() is None:
            os.killpg(child.pid,signal.SIGTERM)
    for child in children:
        try:child.wait(timeout=12)
        except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL)
    sys.exit(0)
signal.signal(signal.SIGINT,shutdown)
signal.signal(signal.SIGTERM,shutdown)
try:
    children.append(subprocess.Popen(['bash','scripts/start-worker.sh'],start_new_session=True))
    children.append(subprocess.Popen(['npm','run','dev','--','--strictPort'],start_new_session=True))
    print('\nVelora: http://127.0.0.1:5173 — press Ctrl+C to stop both services.\n',flush=True)
    while all(child.poll() is None for child in children):time.sleep(.5)
finally:shutdown()
