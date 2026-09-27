import base64
import hashlib
import hmac
import ipaddress
import json
import socket
import time
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
from config import SECRET
from pathlib import Path

CATALOG = json.loads((Path(__file__).resolve().parents[1] / 'shared' / 'platforms.json').read_text())
PLATFORMS = {host: item['name'] for item in CATALOG for host in item['hosts']}

def platform(host):
    return next((v for k, v in PLATFORMS.items() if host == k or host.endswith('.' + k)), None)

def validate_url(url):
    try:
        parts = urlsplit(url.strip())
        host = (parts.hostname or '').lower()
        if parts.scheme != 'https' or parts.username or parts.password or parts.port not in (None, 443) or not platform(host):
            raise ValueError()
        if len(url) > 2048 or any(ord(x) < 32 for x in url):
            raise ValueError()
    except ValueError:
        raise ValueError('Paste a public HTTPS video link from a supported platform.') from None
    # Strip tracking parameters while preserving content IDs and playlist IDs.
    query = urlencode([(k,v) for k,v in parse_qsl(parts.query) if not k.startswith('utm_') and k not in ('si','fbclid','igsh','feature')])
    return urlunsplit(('https', parts.netloc.lower(), parts.path, query, ''))

def public_addresses(host, port):
    addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('Non-public network destinations are blocked.')
    return addresses

def sign(payload):
    raw = base64.urlsafe_b64encode(json.dumps(payload, separators=(',', ':')).encode()).decode().rstrip('=')
    signature = hmac.new(SECRET, raw.encode(), hashlib.sha256).hexdigest()
    return raw + '.' + signature

def verify(token):
    try:
        raw, signature = token.split('.')
        if not hmac.compare_digest(hmac.new(SECRET, raw.encode(), hashlib.sha256).hexdigest(), signature):
            raise ValueError()
        data = json.loads(base64.urlsafe_b64decode(raw + '=' * (-len(raw) % 4)))
        if data['exp'] < time.time():
            raise ValueError()
        return data
    except (ValueError, KeyError, TypeError):
        raise ValueError('Session or download link expired.') from None
