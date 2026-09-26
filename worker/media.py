import json
import math
import os
import re
import signal
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
import config
from security import validate_url, platform
from urllib.parse import urlsplit

def command(proxy):
    return [
            sys.executable, '-m', 'yt_dlp', '--ignore-config', '--no-cache-dir', '--proxy', proxy,
            '--js-runtimes', config.JS_RUNTIME, '--socket-timeout', '20', '--retries', '2', '--fragment-retries', '2',
            '--no-colors', '--no-warnings']

def source_args(url):
    # These extractors benefit from yt-dlp's supported browser TLS compatibility.
    return ['--impersonate', 'chrome'] if platform(urlsplit(url).hostname or '') in ('TikTok', 'Instagram', 'Facebook') else []

def friendly_error(stderr):
    message = stderr.lower()
    if any(x in message for x in ('sign in', 'login', 'log in', 'cookies', 'private video', 'confirm you’re not', "confirm you're not")):
        return 'This platform requires sign-in or blocked this request. Try another public video; Velora does not access private content.'
    if any(x in message for x in ('not available', 'unavailable', 'removed', '404', 'unsupported url')):
        return 'This video is unavailable or this link type is not supported. Try the original public video link.'
    if '429' in message or 'rate' in message:
        return 'The platform is limiting requests. Please try again later.'
    if 'cannot parse data' in message or 'unexpected response from webpage' in message:
        return 'The platform returned a page the downloader could not read. Try another public link; this platform may need a downloader update.'
    if 'format' in message:
        return 'That quality is no longer available. Analyze the link again or choose another format.'
    return 'The platform could not provide this video. Please try again later or use another public link.'

def inspect(url, proxy, playlist=False):
    url = validate_url(url)
    args = command(proxy) + source_args(url) + ['--dump-single-json', '--skip-download', '--no-progress', '--playlist-end', str(config.MAX_PLAYLIST)]
    args += ['--flat-playlist', '--yes-playlist'] if playlist else ['--no-playlist']
    # Temporary files prevent unbounded captured subprocess output in memory.
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        process = subprocess.Popen(args + ['--', url], stdout=out, stderr=err, start_new_session=True)
        started = time.monotonic()
        while process.poll() is None:
            if time.monotonic() - started > 75 or os.fstat(out.fileno()).st_size > 16 * 1024 * 1024:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
                raise ValueError('The platform took too long to respond. Please try again.')
            time.sleep(.15)
        if process.returncode:
            err.seek(0)
            raise ValueError(friendly_error(err.read(65536).decode(errors='replace')))
        out.seek(0)
        try:
            info = json.load(out)
        except (ValueError, TypeError):
            raise ValueError('The platform returned an unreadable response.') from None
    if info.get('is_live') or info.get('live_status') == 'is_live':
        raise ValueError('Live streams are not supported. Try again after the broadcast ends.')
    if info.get('_type') == 'playlist' or 'entries' in info:
        if not playlist:
            raise ValueError('This link contains multiple videos. Switch to Playlist mode.')
        entries = []
        for item in (info.get('entries') or [])[:config.MAX_PLAYLIST]:
            if not item:
                continue
            entry_url = item.get('webpage_url') or item.get('url') or ''
            if not entry_url.startswith('https://') and item.get('ie_key') == 'Youtube':
                entry_url = 'https://www.youtube.com/watch?v=' + item['id']
            try:
                entry_url = validate_url(entry_url)
            except ValueError:
                continue
            entries.append({'id': str(uuid.uuid4()), 'url': entry_url, 'title': item.get('title') or 'Untitled video', 'duration': item.get('duration')})
        if not entries:
            raise ValueError('No available videos were found in this playlist.')
        return {'kind': 'playlist', 'title': info.get('title') or 'Your playlist', 'platform': platform(urlsplit(url).hostname), 'entries': entries, 'limit': config.MAX_PLAYLIST, 'url': url}
    duration = info.get('duration') or 0
    if duration > config.MAX_DURATION:
        raise ValueError(f'This beta supports videos up to {config.MAX_DURATION // 60} minutes.')
    options = formats(info)
    if not options:
        raise ValueError('No downloadable formats are available for this video.')
    thumb = info.get('thumbnail') or ''
    return {'kind': 'video', 'title': info.get('title') or 'Untitled video', 'creator': info.get('uploader') or info.get('channel') or '',
            'duration': duration, 'thumbnail': thumb if thumb.startswith('https://') else '',
            'platform': platform(urlsplit(url).hostname), 'options': options, 'url': url}

def size_of(fmt, duration):
    if fmt.get('filesize'):
        return int(fmt['filesize']), False
    if fmt.get('filesize_approx'):
        return int(fmt['filesize_approx']), True
    if fmt.get('tbr') and duration:
        return int(fmt['tbr'] * 1000 / 8 * duration), True
    return None, True

def formats(info):
    duration = info.get('duration') or 0
    source_formats = info.get('formats') or ([{**info, 'format_id': info.get('format_id') or 'best'}] if info.get('url') else [])
    usable = [f for f in source_formats if not f.get('has_drm') and re.fullmatch(r'[a-zA-Z0-9_.-]+', str(f.get('format_id', ''))) and f.get('protocol') in ('https','http','m3u8_native','http_dash_segments')]
    audio = [f for f in usable if f.get('vcodec') == 'none' and f.get('acodec') not in ('none', None)]
    best_audio = max(audio, key=lambda f: (f.get('ext') == 'm4a', f.get('abr') or f.get('tbr') or 0), default=None)
    grouped = {}
    for f in usable:
        if f.get('vcodec') == 'none':
            continue
        resolution = min(f['height'], f['width']) if f.get('height') and f.get('width') else (f.get('height') or 0)
        key = (resolution, 'mp4' if f.get('ext') == 'mp4' and (f.get('acodec') != 'none' or not best_audio or best_audio.get('ext') == 'm4a') else 'mkv')
        if key not in grouped or (f.get('tbr') or 0) > (grouped[key].get('tbr') or 0):
            grouped[key] = f
    result = []
    for (height, ext), f in sorted(grouped.items(), key=lambda p: (-p[0][0], p[0][1] != 'mp4')):
        size, estimated = size_of(f, duration)
        spec = f['format_id']
        has_audio = f.get('acodec') != 'none' or best_audio is not None
        if f.get('acodec') == 'none' and best_audio:
            spec += '+' + best_audio['format_id']
            audio_size, audio_estimated = size_of(best_audio, duration)
            size = size + audio_size if size is not None and audio_size is not None else None
            estimated = estimated or audio_estimated
        if size and size > config.MAX_FILE:
            continue
        result.append({'id': str(uuid.uuid4()), 'label': f'{int(height)}p' if height else 'Original', 'height': int(height), 'hasAudio': has_audio, 'ext': ext, 'kind': 'video', 'size': size, 'estimated': estimated, 'fps': f.get('fps'), 'spec': spec})
    if best_audio or any(f.get('acodec') != 'none' for f in usable):
        for ext, kbps in [('mp3', 192), ('m4a', 128)]:
            size = math.ceil(duration * kbps * 1000 / 8) if duration else None
            if size is None or size <= config.MAX_FILE:
                estimated = True
                label = 'MP3 · 192 kbps' if ext == 'mp3' else 'M4A · 128 kbps'
                if ext == 'm4a' and best_audio and best_audio.get('ext') == 'm4a':
                    size, estimated = size_of(best_audio, duration)
                    label = 'M4A · Original audio'
                result.append({'id': str(uuid.uuid4()), 'label': label, 'ext': ext, 'kind': 'audio', 'size': size, 'estimated': estimated, 'spec': best_audio['format_id'] if best_audio else 'bestaudio/best', 'bitrate': kbps})
    return result

def choose(info, preset):
    options = info['options']
    if preset in ('mp3', 'm4a'):
        choice = next((f for f in options if f['kind'] == 'audio' and f['ext'] == preset), None)
    else:
        candidates = [f for f in options if f['kind'] == 'video' and (preset == 'best' or (f['height'] and f['height'] <= int(preset)))]
        choice = candidates[0] if candidates else None
    if not choice:
        raise ValueError('The selected format is unavailable for this playlist item.')
    return choice

def download(job, proxy, update, cancelled, process_callback):
    folder = config.DOWNLOADS / job['id']
    folder.mkdir(exist_ok=True)
    option = job['option']
    args = command(proxy) + source_args(job['url']) + ['--no-playlist', '--no-simulate', '--newline', '--progress', '--progress-delta', '1',
        '--progress-template', 'download:VELORA:%(progress._percent_str)s', '--max-filesize', str(config.MAX_FILE),
        '--match-filters', f'!is_live & duration <=? {config.MAX_DURATION}', '--abort-on-unavailable-fragments', '--hls-prefer-native',
        '--concurrent-fragments', '1', '--limit-rate', '8M', '-f', option['spec'], '-o', str(folder / 'media.%(ext)s'),
        '--print-to-file', 'after_move:filepath', str(folder / 'result.txt')]
    if option['kind'] == 'audio':
        args += ['-x', '--audio-format', option['ext'], '--audio-quality', str(option.get('bitrate', 192)) + 'K']
    else:
        args += ['--merge-output-format', option['ext'], '--remux-video', option['ext']]
    with (folder / 'process.log').open('w+') as log:
        process = subprocess.Popen(args + ['--', validate_url(job['url'])], stdout=log, stderr=log, start_new_session=True)
        process_callback(process)
        start = time.monotonic()
        cursor = 0
        while process.poll() is None:
            if cancelled():
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
                raise ValueError('Download cancelled.')
            files_size = sum(p.stat().st_size for p in folder.iterdir() if p.is_file())
            if time.monotonic() - start > config.TIMEOUT or files_size > config.MAX_FILE * 3:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
                raise ValueError('This download exceeded the beta processing limit. Try a smaller quality.')
            with (folder / 'process.log').open() as reader:
                reader.seek(cursor)
                lines = reader.read(65536)
                cursor = reader.tell()
            matches = re.findall(r'VELORA:\s*([\d.]+)%', lines)
            if matches:
                update(min(95, float(matches[-1]) * .95))
            time.sleep(.5)
        process_callback(None)
        if process.returncode:
            log.seek(0)
            raise ValueError(friendly_error(log.read(65536)))
    marker = folder / 'result.txt'
    if not marker.exists():
        raise ValueError('No file was produced. The video may exceed the size or duration limit.')
    path = Path(marker.read_text().strip().splitlines()[-1]).resolve()
    if path.parent != folder.resolve() or not path.is_file() or path.stat().st_size > config.MAX_FILE:
        raise ValueError('The output exceeded the download limit.')
    probe = subprocess.run(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)], capture_output=True, text=True, timeout=20, check=True)
    metadata = json.loads(probe.stdout)
    if float(metadata.get('format', {}).get('duration', 0)) > config.MAX_DURATION:
        raise ValueError('This video exceeds the beta duration limit.')
    tracks = {track.get('codec_type') for track in metadata.get('streams', [])}
    if option['kind'] == 'audio' and 'audio' not in tracks:
        raise ValueError('This source does not contain an audio track.')
    return path
