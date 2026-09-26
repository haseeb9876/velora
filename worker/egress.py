"""Loopback-only outbound proxy: pin DNS answers and block private destinations.

yt-dlp uses this for all HTTP(S) media requests, including redirects. FFmpeg
is used for processing local files, not as a network downloader.
"""
import select
import socket
import socketserver
import threading
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlsplit
from security import public_addresses

def connect_public(host, port):
    if port not in (80, 443):
        raise ValueError('Port is blocked')
    answers = public_addresses(host, port)
    for family, kind, proto, _, address in answers:
        sock = socket.socket(family, kind, proto)
        sock.settimeout(20)
        try:
            sock.connect(address)
            return sock
        except OSError:
            sock.close()
    raise OSError('Destination unavailable')

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def relay(self, upstream):
        upstream.settimeout(None)
        self.connection.settimeout(None)
        while True:
            ready, _, _ = select.select([self.connection, upstream], [], [], 45)
            if not ready:
                return
            for source in ready:
                data = source.recv(65536)
                if not data:
                    return
                (upstream if source is self.connection else self.connection).sendall(data)

    def do_CONNECT(self):
        try:
            parts = urlsplit('https://' + self.path)
            with connect_public(parts.hostname, parts.port or 443) as upstream:
                self.send_response(200)
                self.end_headers()
                self.relay(upstream)
        except (ValueError, OSError):
            self.close_connection = True

    def do_GET(self):
        try:
            parts = urlsplit(self.path)
            if parts.scheme != 'http' or parts.username or parts.password:
                raise ValueError()
            with connect_public(parts.hostname, parts.port or 80) as upstream:
                path = parts.path or '/'
                if parts.query:
                    path += '?' + parts.query
                headers = ''.join(f'{k}: {v}\r\n' for k,v in self.headers.items() if k.lower() not in ('proxy-connection','proxy-authorization','connection','host'))
                upstream.sendall(f'GET {path} HTTP/1.1\r\nHost: {parts.netloc}\r\n{headers}Connection: close\r\n\r\n'.encode())
                while data := upstream.recv(65536):
                    self.connection.sendall(data)
        except (ValueError, OSError):
            self.close_connection = True

class Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

def start_proxy():
    server = Server(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f'http://127.0.0.1:{server.server_address[1]}'
