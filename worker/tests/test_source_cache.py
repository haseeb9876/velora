from source_cache import SourceCache
import source_cache
import media


def test_cache_is_bounded_expires_and_does_not_share_mutable_values(monkeypatch):
    now = [100]
    monkeypatch.setattr(source_cache.time, 'monotonic', lambda: now[0])
    cache = SourceCache(ttl=5, max_bytes=20, max_entries=2)
    cache.put('a', {'formats': [1]}, 10)
    cache.get('a')['formats'].append(2)
    assert cache.get('a') == {'formats': [1]}
    cache.put('b', {}, 10)
    cache.put('c', {}, 10)
    assert cache.get('a') is None
    now[0] += 6
    assert cache.get('c') is None
    assert not cache.entries


def test_repeat_inspection_reuses_metadata_without_running_an_extractor(monkeypatch):
    cache = SourceCache()
    url = 'https://youtube.com/watch?v=fixture'
    cache.put((url, False), {'title': 'Cached fixture', 'duration': 1, 'formats': [
        {'format_id': 'video', 'height': 1080, 'ext': 'mp4', 'vcodec': 'avc1', 'acodec': 'aac', 'protocol': 'https'}]}, 1000)
    monkeypatch.setattr(media, 'source_cache', cache)
    monkeypatch.setattr(media.subprocess, 'Popen', lambda *a, **k: (_ for _ in ()).throw(AssertionError('Unexpected duplicate extraction')))
    first, second = media.inspect(url, 'unused'), media.inspect(url, 'unused')
    assert first['title'] == second['title'] == 'Cached fixture'
    assert first['options'][0]['id'] != second['options'][0]['id']
    assert 'url' not in first['options'][0]
