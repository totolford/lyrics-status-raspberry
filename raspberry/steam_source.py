#!/usr/bin/env python3
"""Côté Raspberry : reçoit l'état envoyé par steam_agent.py (PC) et le sert à jour.

POST /steam        (X-Token)  l'agent pousse {"game", "elapsed_s", "media"}
GET  /agent.py     (X-Token ou ?token=)  dernière version de l'agent (mise à jour auto)
GET  /install.ps1  (?token=)  installateur Windows prêt à l'emploi
"""
import hashlib
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

STALE_AFTER_S = 20.0  # sans nouvelles de l'agent au-delà, on considère qu'il n'y a plus rien
HERE          = Path(__file__).resolve().parent
AGENT_PATH    = HERE / 'steam_agent.py'
INSTALL_TMPL  = HERE / 'install_agent.ps1'

_state = {'game': None, 'elapsed_s': 0, 'media': None, 'seen_at': 0.0}
_lock  = threading.Lock()

def snapshot():
    """État courant de l'agent, ou jeu/musique à None si l'agent est silencieux."""
    with _lock:
        s = dict(_state)
    if time.time() - s['seen_at'] > STALE_AFTER_S:
        return {'game': None, 'elapsed_s': 0, 'media': None}
    elapsed = s['elapsed_s'] + (time.time() - s['seen_at']) if s['game'] else 0
    media = dict(s['media']) if s['media'] else None
    if media:
        media['received_at'] = s['seen_at']
    return {'game': s['game'], 'elapsed_s': int(elapsed), 'media': media}

def current_game():
    """Nom du jeu en cours (str) ou None."""
    return snapshot()['game']

def _clean_media(m):
    if not isinstance(m, dict) or not m.get('title'):
        return None
    pos = m.get('position_ms')
    return {
        'title':       str(m['title'])[:200],
        'artist':      str(m.get('artist') or '')[:200],
        'duration_ms': int(m.get('duration_ms') or 0),
        'position_ms': int(pos) if pos is not None and pos >= 0 else None,
        'playing':     bool(m.get('playing')),
    }

def _make_handler(secret):
    class Handler(BaseHTTPRequestHandler):
        def _authorized(self):
            q = parse_qs(urlparse(self.path).query)
            return secret and (self.headers.get('X-Token', '') == secret or q.get('token', [''])[0] == secret)

        def _send(self, code, body=b'', ctype='text/plain; charset=utf-8'):
            self.send_response(code)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            if urlparse(self.path).path != '/steam' or not self._authorized():
                return self._send(403)
            try:
                length = min(int(self.headers.get('Content-Length', 0)), 8192)
                data   = json.loads(self.rfile.read(length))
                game   = data.get('game') or None
                if game is not None:
                    game = str(game)[:160]
                elapsed = max(0, int(data.get('elapsed_s') or 0))
                media   = _clean_media(data.get('media'))
            except Exception:
                return self._send(400)
            with _lock:
                _state.update(game=game, elapsed_s=elapsed, media=media, seen_at=time.time())
            self._send(204)

        def do_GET(self):
            path = urlparse(self.path).path
            if not self._authorized():
                return self._send(403)
            if path == '/agent.py':
                try:
                    return self._send(200, AGENT_PATH.read_bytes(), 'text/x-python; charset=utf-8')
                except OSError:
                    return self._send(404)
            if path == '/agent.sha256':
                try:
                    return self._send(200, hashlib.sha256(AGENT_PATH.read_bytes()).hexdigest().encode())
                except OSError:
                    return self._send(404)
            if path == '/install.ps1':
                try:
                    host   = self.headers.get('Host', '')
                    script = INSTALL_TMPL.read_text(encoding='utf-8')
                    script = script.replace('__PI_URL__', f'http://{host}').replace('__TOKEN__', secret)
                    return self._send(200, script.encode('utf-8'))
                except OSError:
                    return self._send(404)
            self._send(404)

        def log_message(self, *args):
            pass
    return Handler

def start_server(port, secret):
    server = ThreadingHTTPServer(('0.0.0.0', port), _make_handler(secret))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"[STEAM] Écoute de l'agent PC sur le port {port}", flush=True)
