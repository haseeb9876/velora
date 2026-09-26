import os,sys,tempfile
from pathlib import Path
os.environ['DATA_DIR']=tempfile.mkdtemp(prefix='velora-test-')
os.environ.pop('DATABASE_URL',None)
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
