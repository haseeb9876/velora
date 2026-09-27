import time, socket
import pytest
from security import validate_url, public_addresses, sign, verify
from media import formats, choose

@pytest.mark.parametrize('url',['http://youtube.com/watch?v=x','https://youtube.com.evil.com/a','https://evil.com/?youtube.com','https://127.0.0.1/','file:///etc/passwd','https://youtube.com:444/a','https://user:pass@youtube.com/a','https://youtube.com/\nfoo'])
def test_unsafe_source_urls(url):
    with pytest.raises(ValueError): validate_url(url)

def test_tracking_removed_content_preserved():
    assert validate_url('https://www.youtube.com/watch?v=abc&list=xyz&si=tracking&utm_source=app')=='https://www.youtube.com/watch?v=abc&list=xyz'

@pytest.mark.parametrize('address',['127.0.0.1','169.254.169.254','10.1.1.1','192.168.1.1','::1','fd00::1','::ffff:127.0.0.1'])
def test_egress_blocks_private_and_metadata(monkeypatch,address):
    monkeypatch.setattr(socket,'getaddrinfo',lambda *a,**kw:[(socket.AF_INET,socket.SOCK_STREAM,6,'',(address,443))])
    with pytest.raises(ValueError): public_addresses('example.com',443)

def test_signed_tokens():
    token=sign({'exp':time.time()+60,'sub':'alice'})
    assert verify(token)['sub']=='alice'
    with pytest.raises(ValueError): verify(token+'x')
    with pytest.raises(ValueError): verify(sign({'exp':time.time()-1}))

def test_video_options_merge_audio_and_estimate_total():
    result=formats({'duration':60,'formats':[
        {'format_id':'137','height':1080,'ext':'mp4','vcodec':'avc1','acodec':'none','filesize':1000000,'protocol':'https'},
        {'format_id':'140','ext':'m4a','vcodec':'none','acodec':'aac','filesize':100000,'protocol':'https'},
        {'format_id':'drm','height':2160,'ext':'mp4','vcodec':'avc1','acodec':'aac','has_drm':True,'protocol':'https'}]})
    assert result[0]['spec']=='137+140'
    assert result[0]['size']==1100000
    assert result[0]['estimated'] is False
    assert not any(f.get('height')==2160 for f in result)
    assert choose({'options':result},'mp3')['kind']=='audio'
    with pytest.raises(ValueError): choose({'options':result},'720')

def test_silent_source_remains_downloadable_and_is_labeled():
    result = formats({'formats':[{'format_id':'137','height':1080,'ext':'mp4','vcodec':'avc1','acodec':'none','protocol':'https'}]})
    assert len(result) == 1
    assert result[0]['hasAudio'] is False
    assert result[0]['spec'] == '137'


@pytest.mark.parametrize('url', ['https://dai.ly/x123', 'https://clips.twitch.tv/PublicClip', 'https://bsky.app/profile/example/post/123', 'https://www.linkedin.com/posts/example-123-abcd', 'https://www.snapchat.com/spotlight/example'])
def test_additional_platform_hosts_are_accepted(url):
    assert validate_url(url) == url

@pytest.mark.parametrize('url', ['https://bsky.app.evil.example/post/1', 'https://www.snapchat.com@127.0.0.1/', 'https://clips.twitch.tv:8080/a', 'https://private.example/video'])
def test_expanded_catalog_still_rejects_untrusted_destinations(url):
    with pytest.raises(ValueError): validate_url(url)


def test_unknown_audio_metadata_is_not_mislabeled_as_silent():
    options = formats({'duration':5,'formats':[{'format_id':'1080','height':1080,'ext':'mp4','vcodec':None,'acodec':None,'protocol':'https'}]})
    video = next(f for f in options if f['kind'] == 'video')
    assert video['hasAudio'] is None
    audio = [f for f in options if f['kind'] == 'audio']
    assert {f['ext'] for f in audio} == {'mp3', 'm4a'}
    assert all(f['audioUnconfirmed'] for f in audio)


def test_unknown_resolution_keeps_extractor_preference_on_ties():
    options = formats({'formats':[{'format_id':id,'ext':'mp4','protocol':'https'} for id in ['low','high']]})
    assert next(f for f in options if f['kind'] == 'video')['spec'] == 'high'
