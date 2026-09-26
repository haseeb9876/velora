import subprocess
import time

import pytest
from playback import finalize, probe
from media import formats


def test_prefers_h264_at_same_resolution_but_keeps_real_4k():
    options = formats({'duration': 1, 'formats': [
        {'format_id': 'av1', 'height': 1080, 'width': 1920, 'vcodec': 'av01', 'acodec': 'none', 'ext': 'mp4', 'protocol': 'https', 'tbr': 4000},
        {'format_id': 'h264', 'height': 1080, 'width': 1920, 'vcodec': 'avc1', 'acodec': 'none', 'ext': 'mp4', 'protocol': 'https', 'tbr': 3000},
        {'format_id': '4k', 'height': 2160, 'width': 3840, 'vcodec': 'vp9', 'acodec': 'none', 'ext': 'webm', 'protocol': 'https'},
        {'format_id': 'audio', 'vcodec': 'none', 'acodec': 'opus', 'ext': 'webm', 'protocol': 'https'},
    ]})
    assert options[0]['height'] == 2160
    assert options[0]['requiresConversion'] is True
    assert options[0]['sourceExt'] == 'mkv'
    assert options[1]['spec'] == 'h264+audio'
    assert options[1]['requiresConversion'] is False


def test_4k_vp9_opus_becomes_decodable_h264_aac_without_downscaling(tmp_path):
    source = tmp_path / 'owned-4k.mkv'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=3840x2160:rate=12', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000', '-t', '0.6', '-c:v', 'libvpx-vp9', '-threads', '2', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-c:a', 'libopus', str(source)], check=True, timeout=90)
    original = finalize(source, {'kind': 'video', 'height': 2160, 'hasAudio': True, 'profile': 'original'}, lambda: False, lambda _: None, time.monotonic() + 90, lambda _: None)
    assert original == source
    assert {s['codec_name'] for s in probe(original)['streams']} == {'vp9', 'opus'}
    result = finalize(source, {'kind': 'video', 'height': 2160, 'hasAudio': True}, lambda: False, lambda _: None, time.monotonic() + 90, lambda _: None)
    tracks = probe(result)['streams']
    video = next(s for s in tracks if s['codec_type'] == 'video')
    audio = next(s for s in tracks if s['codec_type'] == 'audio')
    assert (video['width'], video['height'], video['codec_name'], video['pix_fmt']) == (3840, 2160, 'h264', 'yuv420p')
    assert audio['codec_name'] == 'aac'
    subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-threads', '2', '-i', str(result), '-f', 'null', '-'], check=True, timeout=30)
    content = result.read_bytes()
    assert content.index(b'moov') < content.index(b'mdat')


def test_missing_audio_and_corrupt_files_are_rejected(tmp_path):
    source = tmp_path / 'silent.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=s=320x180:r=12', '-t', '0.5', '-c:v', 'libx264', str(source)], check=True)
    with pytest.raises(ValueError, match='audio track is missing'):
        finalize(source, {'kind': 'video', 'hasAudio': True}, lambda: False, lambda _: None, time.monotonic() + 30, lambda _: None)
    source.write_bytes(b'not a video')
    with pytest.raises(ValueError, match='unreadable'):
        probe(source)


def test_hdr_input_is_converted_to_sdr_for_compatible_playback(tmp_path):
    source = tmp_path / 'hdr.mkv'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=s=320x180:r=12', '-t', '0.5', '-vf', 'format=yuv420p10le', '-c:v', 'ffv1', '-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc', str(source)], check=True)
    output = finalize(source, {'kind': 'video', 'hasAudio': False}, lambda: False, lambda _: None, time.monotonic() + 30, lambda _: None)
    video = probe(output)['streams'][0]
    assert video['codec_name'] == 'h264'
    assert video['pix_fmt'] == 'yuv420p'
    assert video['color_transfer'] == 'bt709'
