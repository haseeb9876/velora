import time
from fastapi.testclient import TestClient
import pytest
import app as service
from security import sign

@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(service.media,'inspect',lambda *a,**kw:{'kind':'video','url':'https://youtube.com/watch?v=test','title':'A test video','options':[{'id':'f1','spec':'18','kind':'video','label':'720p','ext':'mp4'}]})
    def fake_download(job,proxy,update,cancelled,process_callback):
        folder=service.config.DOWNLOADS/job['id'];folder.mkdir(exist_ok=True)
        path=folder/'media.mp4';path.write_bytes(b'test-media');update(75)
        return path
    monkeypatch.setattr(service.media,'download',fake_download)
    with TestClient(service.app) as c: yield c

def token(client): return {'Authorization':'Bearer '+client.post('/api/session').json()['token']}

def test_full_job_lifecycle_and_ownership(client):
    alice,bob=token(client),token(client)
    analysis=client.post('/api/inspect',json={'url':'https://youtube.com/watch?v=test'},headers=alice).json()
    assert 'spec' not in analysis['options'][0]
    assert client.post('/api/jobs',json={'analysis_id':analysis['id'],'option_id':'f1'},headers=bob).status_code==404
    created=client.post('/api/jobs',json={'analysis_id':analysis['id'],'option_id':'f1'},headers=alice)
    assert created.status_code==201
    id=created.json()['jobs'][0]['id']
    for _ in range(50):
        jobs=client.get('/api/jobs',headers=alice).json()['jobs']
        if jobs[0]['status']=='ready': break
        time.sleep(.02)
    assert jobs[0]['status']=='ready'
    assert 'file' not in jobs[0]
    assert client.get('/api/jobs',headers=bob).json()['jobs']==[]
    assert client.post(f'/api/jobs/{id}/ticket',headers=bob).status_code==410
    url=client.post(f'/api/jobs/{id}/ticket',headers=alice).json()['url']
    download=client.get(url)
    assert download.content==b'test-media'
    assert 'attachment' in download.headers['content-disposition']
    assert client.get(url+'tampered').status_code==410
    assert client.delete(f'/api/jobs/{id}',headers=bob).status_code==404
    assert client.delete(f'/api/jobs/{id}',headers=alice).status_code==200
    assert client.get(url).status_code==410

def test_origin_auth_and_invalid_option(client):
    assert client.post('/api/session',headers={'Origin':'https://evil.example'}).status_code==403
    assert client.get('/api/jobs').status_code==401
    headers=token(client)
    analysis=client.post('/api/inspect',json={'url':'https://youtube.com/watch?v=test'},headers=headers).json()
    assert client.post('/api/jobs',json={'analysis_id':analysis['id'],'option_id':'$(id)'},headers=headers).status_code==422
    expired=sign({'type':'file','job':'fake','sub':'test','exp':time.time()-1})
    assert client.get('/files/fake?ticket='+expired).status_code==410
