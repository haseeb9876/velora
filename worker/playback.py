"""Local, bounded media validation and broadly compatible MP4 output."""
import json
import os
import signal
import subprocess
import time
import config


def probe(path):
    try:
        result = subprocess.run(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)], capture_output=True, text=True, timeout=25, check=True)
        info = json.loads(result.stdout)
    except (subprocess.SubprocessError, ValueError):
        raise ValueError('The source produced an unreadable file. Try another quality.') from None
    duration = float(info.get('format', {}).get('duration') or 0)
    if duration <= 0 or duration > config.MAX_DURATION + 1:
        raise ValueError('The source produced an invalid or over-limit duration.')
    return info


def run(args, folder, cancelled, process_callback, deadline):
    with (folder / 'validation.log').open('w+') as log:
        process = subprocess.Popen(args, stdout=log, stderr=log, start_new_session=True)
        process_callback(process)
        try:
            while process.poll() is None:
                if cancelled() or time.monotonic() > deadline:
                    raise ValueError('Processing stopped or took too long. Try a smaller quality or Original format.')
                if any(p.stat().st_size > config.MAX_FILE for p in folder.iterdir() if p.suffix in ('.mp4', '.mkv', '.webm', '.mp3', '.m4a')):
                    raise ValueError('The prepared file exceeded the beta size limit. Try a smaller quality.')
                time.sleep(.2)
            if process.returncode:
                raise ValueError('The video could not be decoded correctly. Try another quality or source link.')
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            process_callback(None)


def finalize(path, option, cancelled, process_callback, deadline, update):
    info = probe(path)
    streams = info.get('streams', [])
    video = next((s for s in streams if s.get('codec_type') == 'video'), None)
    audio = next((s for s in streams if s.get('codec_type') == 'audio'), None)
    if option['kind'] == 'video' and not video:
        raise ValueError('The source did not produce a video track. Try another quality.')
    if (option['kind'] == 'audio' or option.get('hasAudio') is True) and not audio:
        raise ValueError('The expected audio track is missing. Try another quality.')
    source_duration = float(info['format']['duration'])
    if video and option.get('profile', 'compatible') == 'compatible':
        destination = path.parent / 'compatible.mp4'
        hdr = video.get('color_transfer') in ('smpte2084', 'arib-std-b67')
        encode = video.get('codec_name') != 'h264' or video.get('pix_fmt') not in ('yuv420p', 'yuvj420p') or hdr
        args = ['ffmpeg', '-hide_banner', '-nostdin', '-v', 'error', '-xerror', '-threads', '2', '-i', str(path), '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn']
        if encode:
            filters = 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p' if hdr else 'format=yuv420p'
            args += ['-vf', filters, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-threads', '2', '-filter_threads', '2']
        else:
            args += ['-c:v', 'copy']
        args += ['-c:a', 'copy'] if not audio or (audio.get('codec_name') == 'aac' and audio.get('channels', 2) <= 2) else ['-c:a', 'aac', '-b:a', '192k', '-ac', '2']
        args += ['-movflags', '+faststart', '-max_muxing_queue_size', '2048', str(destination)]
        update(96)
        run(args, path.parent, cancelled, process_callback, deadline)
        output = probe(destination)
        if abs(float(output['format']['duration']) - source_duration) > max(1, source_duration * .02):
            raise ValueError('The prepared video is incomplete. Try the download again.')
        if option.get('height') and min(next(s for s in output['streams'] if s['codec_type'] == 'video')[axis] for axis in ('width', 'height')) < option['height']:
            raise ValueError('The source did not provide the selected resolution. Analyze the link again.')
        path.unlink()
        path = destination
    update(98)
    # Decode samples, including the end, to catch broken tracks before serving.
    positions = [0] if source_duration <= 6 else [0, source_duration / 2, max(0, source_duration - 2)]
    for position in positions:
        run(['ffmpeg', '-hide_banner', '-nostdin', '-v', 'error', '-xerror', '-threads', '2', '-ss', str(position), '-i', str(path), '-t', '2', '-map', '0:v:0?', '-map', '0:a:0?', '-f', 'null', '-'], path.parent, cancelled, process_callback, deadline)
    return path
