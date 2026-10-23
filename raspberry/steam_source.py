#!/usr/bin/env python3
"""Côté Raspberry : reçoit le jeu Steam en cours envoyé par steam_agent.py (PC)."""
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STALE_AFTER_S = 20.0  # sans nouvelles de l'agent au-delà, on considère qu'il n'y a plus de jeu

_state = {'game': None, 'seen_at': 0.0}
_lock  = threading.Lock()

def current_game():
    """Retourne le nom du jeu en cours (str) ou None."""
    with _lock:
        if _state['game'] and time.time() - _state['seen_at'] <= STALE_AFTER_S:
            return _state['game']
    return None

def _make_handler(secret):
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != '/steam' or self.headers.get('X-Token', '') != secret:
                self.send_response(403)
                self.end_headers()
                return
            try:
                length = min(int(self.headers.get('Content-Length', 0)), 4096)
                data   = json.loads(self.rfile.read(length))
                game   = data.get('game') or None
                if game is not None:
                    game = str(game)[:128]
            except Exception:
                self.send_response(400)
                self.end_headers()
                return
            with _lock:
                _state['game']    = game
                _state['seen_at'] = time.time()
            self.send_response(204)
            self.end_headers()

        def log_message(self, *args):
            pass
    return Handler

def start_server(port, secret):
    server = ThreadingHTTPServer(('0.0.0.0', port), _make_handler(secret))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"[STEAM] Écoute de l'agent PC sur le port {port}", flush=True)
