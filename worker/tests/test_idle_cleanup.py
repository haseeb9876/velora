import time
from unittest.mock import Mock
import app as service


def test_idle_worker_does_not_query_database_every_minute(monkeypatch):
    database = Mock()
    monkeypatch.setattr(service, 'store', database)
    monkeypatch.setattr(service, 'retained', {})
    monkeypatch.setattr(service, 'last_metadata_cleanup', 10000)
    service.cleanup_once(10060)
    assert database.mock_calls == []
    service.cleanup_once(13600)
    database.cleanup.assert_called_once()


def test_expired_files_are_removed_without_listing_all_database_jobs(monkeypatch, tmp_path):
    database = Mock()
    database.get.return_value = {'id':'expired', 'owner':'test', 'status':'ready', 'created':time.time(), 'file':'test'}
    monkeypatch.setattr(service, 'store', database)
    monkeypatch.setattr(service.config, 'DOWNLOADS', tmp_path)
    monkeypatch.setattr(service, 'retained', {'expired':9999})
    monkeypatch.setattr(service, 'last_metadata_cleanup', 10000)
    folder = tmp_path / 'expired'
    folder.mkdir()
    (folder / 'media.mp4').write_bytes(b'test')
    service.cleanup_once(10060)
    assert not folder.exists()
    assert service.retained == {}
    database.list.assert_not_called()
    database.cleanup.assert_not_called()
    assert database.put.call_args.args[2]['status'] == 'expired'
