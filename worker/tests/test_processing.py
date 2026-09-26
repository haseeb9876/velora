"""Real yt-dlp + FFmpeg tests using locally generated, owned media.

Only the test substitutes an info JSON and bypasses the egress proxy for its
loopback fixture server. Production URL and network policies stay unchanged.
"""
import functools
import json
import subprocess
import sys
import threading
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import pytest
import media

@pytest.fixture
def fixture_media(tmp_path,monkeypatch):
    subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=0x7862d9:s=320x180:r=24','-t','1','-an','-c:v','libx264','-pix_fmt','yuv420p',str(tmp_path/'video.mp4')],check=True)
    subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','1','-vn','-c:a','aac',str(tmp_path/'audio.m4a')],check=True)
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self,*args): pass
    server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(tmp_path)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}'
    info={'id':'owned-fixture','title':'Velora generated test media','duration':1,'extractor':'generic','webpage_url':base+'/video.mp4','formats':[
        {'format_id':'video','url':base+'/video.mp4','ext':'mp4','vcodec':'h264','acodec':'none','height':180,'protocol':'http'},
        {'format_id':'audio','url':base+'/audio.m4a','ext':'m4a','vcodec':'none','acodec':'aac','protocol':'http'}]}
    metadata=tmp_path/'info.json';metadata.write_text(json.dumps(info))
    monkeypatch.setattr(media,'command',lambda proxy:[sys.executable,'-m','yt_dlp','--ignore-config','--proxy','','--load-info-json',str(metadata)])
    yield
    server.shutdown();server.server_close()

@pytest.mark.parametrize('kind,ext,spec,expected',[('video','mp4','video+audio',{'video','audio'}),('audio','mp3','audio',{'audio'}),('audio','m4a','audio',{'audio'})])
def test_real_processing(fixture_media,kind,ext,spec,expected):
    job={'id':str(uuid.uuid4()),'url':'https://youtube.com/watch?v=owned-fixture','option':{'kind':kind,'ext':ext,'spec':spec,'bitrate':192}}
    path=media.download(job,'unused',lambda _:None,lambda:False,lambda _:None)
    assert path.suffix=='.'+ext
    result=subprocess.run(['ffprobe','-v','error','-show_streams','-of','json',str(path)],capture_output=True,text=True,check=True)
    streams=json.loads(result.stdout)['streams']
    assert {s['codec_type'] for s in streams}==expected
    assert path.stat().st_size>1000
