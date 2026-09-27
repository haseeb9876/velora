import time
from fastapi.testclient import TestClient
import app as service

def test_playlist_selection_is_owned_validated_and_processed(monkeypatch):
    def inspect(url,proxy,playlist=False):
        if playlist:
            return {'kind':'playlist','title':'Test playlist','entries':[{'id':'one','url':'https://youtube.com/watch?v=one','title':'First'},{'id':'two','url':'https://youtube.com/watch?v=two','title':'Second'}]}
        return {'kind':'video','title':'Resolved title','options':[{'id':'f1','kind':'audio','ext':'mp3','spec':'audio','bitrate':192,'label':'MP3 · 192 kbps'}]}
    def download(job,proxy,update,cancelled,callback):
        folder=service.config.DOWNLOADS/job['id'];folder.mkdir(exist_ok=True)
        path=folder/'media.mp3';path.write_bytes(b'fixture-audio');return path
    monkeypatch.setattr(service.media,'inspect',inspect)
    monkeypatch.setattr(service.media,'download',download)
    with TestClient(service.app) as client:
        headers={'Authorization':'Bearer '+client.post('/api/session').json()['token']}
        analysis=client.post('/api/inspect',headers=headers,json={'url':'https://youtube.com/playlist?list=test','mode':'playlist'}).json()
        bad=client.post('/api/jobs',headers=headers,json={'analysis_id':analysis['id'],'entry_ids':['forged'],'preset':'mp3'})
        assert bad.status_code==422
        response=client.post('/api/jobs',headers=headers,json={'analysis_id':analysis['id'],'entry_ids':['one','two'],'preset':'mp3'})
        assert response.status_code==201
        assert len(response.json()['jobs'])==2
        for _ in range(100):
            jobs=client.get('/api/jobs',headers=headers).json()['jobs']
            if all(j['status']=='ready' for j in jobs):break
            time.sleep(.02)
        assert len(jobs)==2
        assert all(j['status']=='ready' and j['title']=='Resolved title' for j in jobs)

def test_hourly_analysis_limit(monkeypatch):
    monkeypatch.setattr(service.config,'RATE',1)
    monkeypatch.setattr(service.media,'inspect',lambda *a,**kw:{'kind':'video','title':'Test','options':[]})
    service.rates.clear()
    with TestClient(service.app) as client:
        headers={'Authorization':'Bearer '+client.post('/api/session').json()['token']}
        assert client.post('/api/inspect',headers=headers,json={'url':'https://youtube.com/watch?v=test'}).status_code==200
        response=client.post('/api/inspect',headers=headers,json={'url':'https://youtube.com/watch?v=test'})
        assert response.status_code==429
        assert response.headers['retry-after']=='3600'
    service.rates.clear()
