#!/usr/bin/env python3
import json
import time
import re
import sys
import base64
import threading
import requests
from pathlib import Path
from datetime import datetime, timedelta, timezone

CONFIG_PATH = Path(__file__).parent / 'config.json'
TOKEN_PATH  = Path(__file__).parent / 'spotify_token.json'

SPOTIFY_POLL_INTERVAL = 5.0   # secondes entre chaque appel API Spotify
LYRIC_INTERVAL        = 0.15  # secondes entre chaque mise à jour de la parole
PREFETCH_COUNT        = 5     # nombre de prochaines chansons à pré-télécharger

# ── ITALIC UNICODE ────────────────────────────────────────────────────────────

_ITALIC = {}
for _i, _c in enumerate('ABCDEFGHIJKLMNOPQRSTUVWXYZ'):
    _ITALIC[_c] = chr(0x1D608 + _i)
for _i, _c in enumerate('abcdefghijklmnopqrstuvwxyz'):
    _ITALIC[_c] = chr(0x1D622 + _i)

def to_italic(text):
    return ''.join(_ITALIC.get(c, c) for c in text)

# ── CENSOR ────────────────────────────────────────────────────────────────────

def build_censor_regex(words):
    parts = [re.escape(w.strip()) for w in words if w.strip()]
    if not parts:
        return None
    pattern = r'(?<![a-zA-ZÀ-ÿ0-9])(' + '|'.join(parts) + r')(?![a-zA-ZÀ-ÿ0-9])'
    try:
        return re.compile(pattern, re.IGNORECASE)
    except Exception:
        return None

def censor_text(text, regex):
    if not regex:
        return text
    return regex.sub('***', text)

def get_status_string(words, censor_regex):
    text = censor_text(words, censor_regex).replace('♪', '').strip()
    return f'"{to_italic(text)}"'

# ── SPOTIFY TOKEN ─────────────────────────────────────────────────────────────

class SpotifyToken:
    def __init__(self, client_id, client_secret):
        self.client_id     = client_id
        self.client_secret = client_secret
        self.access_token  = None
        self.expires_at    = 0.0
        self.refresh_token = None
        self._lock         = threading.Lock()
        self._load()

    def _load(self):
        if not TOKEN_PATH.exists():
            print("[ERREUR] spotify_token.json introuvable. Lance auth.py d'abord.", flush=True)
            sys.exit(1)
        with open(TOKEN_PATH) as f:
            data = json.load(f)
        self.refresh_token = data.get('refresh_token')
        self.access_token  = data.get('access_token')
        self.expires_at    = float(data.get('expires_at', 0))

    def _save(self):
        try:
            data = {}
            if TOKEN_PATH.exists():
                with open(TOKEN_PATH) as f:
                    data = json.load(f)
            data['access_token'] = self.access_token
            data['expires_at']   = self.expires_at
            if self.refresh_token:
                data['refresh_token'] = self.refresh_token
            with open(TOKEN_PATH, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"[WARN] Impossible de sauvegarder le token: {e}", flush=True)

    def get(self):
        with self._lock:
            if time.time() < self.expires_at - 60:
                return self.access_token
            self._refresh()
            return self.access_token

    def _refresh(self):
        creds = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        try:
            r = requests.post('https://accounts.spotify.com/api/token', data={
                'grant_type':    'refresh_token',
                'refresh_token': self.refresh_token,
            }, headers={'Authorization': f'Basic {creds}'}, timeout=10)
        except Exception as e:
            print(f"[ERREUR] Refresh token réseau: {e}", flush=True)
            return
        if r.status_code == 200:
            d = r.json()
            self.access_token = d['access_token']
            self.expires_at   = time.time() + d.get('expires_in', 3600)
            if 'refresh_token' in d:
                self.refresh_token = d['refresh_token']
            self._save()
            print("[INFO] Token Spotify rafraîchi.", flush=True)
        else:
            print(f"[ERREUR] Refresh token Spotify: {r.status_code} — {r.text}", flush=True)

# ── SPOTIFY API ───────────────────────────────────────────────────────────────

def fetch_currently_playing(token):
    try:
        r = requests.get(
            'https://api.spotify.com/v1/me/player/currently-playing',
            headers={'Authorization': f'Bearer {token}'},
            timeout=8,
        )
        if r.status_code in (204, 404):
            return None
        if r.status_code == 200:
            return r.json()
        print(f"[WARN] Spotify API: {r.status_code}", flush=True)
    except Exception as e:
        print(f"[WARN] Spotify réseau: {e}", flush=True)
    return None

def fetch_queue(token):
    """Retourne la liste des prochaines chansons dans la file d'attente."""
    try:
        r = requests.get(
            'https://api.spotify.com/v1/me/player/queue',
            headers={'Authorization': f'Bearer {token}'},
            timeout=8,
        )
        if r.status_code == 200:
            return r.json().get('queue', [])
    except Exception:
        pass
    return []

# ── LYRICS CACHE ──────────────────────────────────────────────────────────────

# Clé : track_id  |  Valeur : lyrics_data (dict) ou None si introuvable
_lyrics_cache      = {}
_cache_lock        = threading.Lock()
_prefetch_in_progress = set()  # track_ids en cours de téléchargement

def cache_get(track_id):
    with _cache_lock:
        return _lyrics_cache.get(track_id, ...)  # ... = absent du cache

def cache_set(track_id, data):
    with _cache_lock:
        _lyrics_cache[track_id] = data
        # Limite à 200 entrées pour éviter de saturer la RAM du Pi Zero
        if len(_lyrics_cache) > 200:
            oldest = next(iter(_lyrics_cache))
            del _lyrics_cache[oldest]

# ── LYRICS (lrclib.net) ───────────────────────────────────────────────────────

def _parse_lrc(lrc_text):
    lines = []
    for line in lrc_text.split('\n'):
        m = re.match(r'^\[(\d{1,2}):(\d{2}\.\d+)\](.*)', line)
        if not m:
            continue
        ms    = round((int(m[1]) * 60 + float(m[2])) * 1000)
        words = m[3].strip()
        if words:
            lines.append({'time': ms, 'words': words})
    return lines

def _try_lrclib_item(item):
    if item.get('syncedLyrics'):
        lines = _parse_lrc(item['syncedLyrics'])
        if lines:
            return {'type': 'synced', 'lines': lines}
    if item.get('plainLyrics'):
        raw = [l.strip() for l in item['plainLyrics'].split('\n') if l.strip()]
        if raw:
            return {'type': 'unsynced', 'lines': raw}
    return None

def fetch_lyrics(track_id, track_name, artist_name, duration_ms):
    """Télécharge les paroles, en vérifiant le cache d'abord."""
    cached = cache_get(track_id)
    if cached is not ...:
        return cached  # None = introuvable (déjà tenté), dict = trouvé

    params = {'track_name': track_name}
    if artist_name:
        params['artist_name'] = artist_name
    if duration_ms:
        params['duration'] = duration_ms // 1000

    result = None
    try:
        r = requests.get('https://lrclib.net/api/get', params=params, timeout=12)
        if r.status_code == 200:
            result = _try_lrclib_item(r.json())
    except Exception:
        pass

    if not result:
        try:
            q = f"{artist_name} {track_name}" if artist_name else track_name
            r = requests.get('https://lrclib.net/api/search', params={'q': q}, timeout=12)
            if r.status_code == 200:
                for item in r.json():
                    result = _try_lrclib_item(item)
                    if result:
                        break
        except Exception:
            pass

    cache_set(track_id, result)
    return result

def prefetch_queue(sp_token):
    """Télécharge les paroles des prochaines chansons en arrière-plan."""
    token = sp_token.get()
    queue = fetch_queue(token)
    if not queue:
        return

    to_fetch = []
    for track in queue[:PREFETCH_COUNT]:
        tid = track.get('id')
        if not tid:
            continue
        cached = cache_get(tid)
        if cached is ... and tid not in _prefetch_in_progress:
            to_fetch.append(track)

    if not to_fetch:
        return

    print(f"[PREFETCH] {len(to_fetch)} chanson(s) en file d'attente...", flush=True)

    for track in to_fetch:
        tid         = track.get('id')
        tname       = track.get('name', '')
        artist_name = track['artists'][0]['name'] if track.get('artists') else ''
        duration_ms = track.get('duration_ms', 0)

        _prefetch_in_progress.add(tid)
        result = fetch_lyrics(tid, tname, artist_name, duration_ms)
        _prefetch_in_progress.discard(tid)

        status = f"✓ ({result['type']})" if result else "✗ introuvable"
        print(f"  [PREFETCH] {tname} — {artist_name} : {status}", flush=True)
        time.sleep(0.3)  # petit délai pour ne pas surcharger lrclib.net

def get_active_lyric(lines, progress_ms, offset_ms):
    target = progress_ms + offset_ms
    active = None
    for line in lines:
        if line['time'] <= target:
            active = line
        else:
            break
    return active

# ── DISCORD ───────────────────────────────────────────────────────────────────

def set_discord_status(token, text):
    expires = (datetime.now(timezone.utc) + timedelta(minutes=1)).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    try:
        r = requests.patch(
            'https://discord.com/api/v9/users/@me/settings',
            headers={'Authorization': token, 'Content-Type': 'application/json'},
            json={'custom_status': {
                'text':       text,
                'emoji_id':   None,
                'emoji_name': None,
                'expires_at': expires,
            }},
            timeout=8,
        )
        if r.status_code == 401:
            print("[ERREUR] Token Discord invalide ou expiré. Vérifie config.json.", flush=True)
            return False
        return r.status_code == 200
    except Exception as e:
        print(f"[WARN] Discord réseau: {e}", flush=True)
        return False

# ── MAIN ──────────────────────────────────────────────────────────────────────

def main():
    if not CONFIG_PATH.exists():
        print(f"[ERREUR] {CONFIG_PATH} introuvable. Copie config.example.json vers config.json.", flush=True)
        sys.exit(1)

    with open(CONFIG_PATH) as f:
        config = json.load(f)

    sp_token      = SpotifyToken(config['spotify']['client_id'], config['spotify']['client_secret'])
    discord_token = config['discord']['token']
    offset_ms     = int(config.get('settings', {}).get('send_time_offset_ms', 500))
    poll_interval = float(config.get('settings', {}).get('spotify_poll_interval_s', SPOTIFY_POLL_INTERVAL))
    censor_words  = config.get('settings', {}).get('censor_words', [])
    censor_regex  = build_censor_regex(censor_words)

    print("=== Lyrics Status (Raspberry) démarré ===", flush=True)

    api_progress_ms  = 0
    api_fetch_time   = 0.0
    api_is_playing   = False
    current_track_id = None
    lyrics_data      = None
    current_lyric    = None
    last_sent_status = None
    paused_sent      = False
    idle_sent        = False
    last_spotify_poll = 0.0

    while True:
        now = time.time()

        # ── Appel API Spotify (toutes les poll_interval secondes) ────────────
        if now - last_spotify_poll >= poll_interval:
            last_spotify_poll = now
            token   = sp_token.get()
            playing = fetch_currently_playing(token)

            if not playing or not playing.get('item'):
                api_is_playing = False
                if not idle_sent:
                    idle_sent = True
                    paused_sent = False
                    set_discord_status(discord_token, 'Connecté')
                    last_sent_status = 'Connecté'
                    print("[INFO] Aucune lecture en cours.", flush=True)
                time.sleep(LYRIC_INTERVAL)
                continue

            idle_sent = False
            track        = playing['item']
            track_id     = track['id']
            track_name   = track['name']
            artist_name  = track['artists'][0]['name'] if track.get('artists') else ''
            duration_ms  = track['duration_ms']
            api_progress_ms = playing['progress_ms']
            api_fetch_time  = time.time()
            api_is_playing  = playing['is_playing']

            # ── Changement de chanson ─────────────────────────────────────────
            if track_id != current_track_id:
                current_track_id = track_id
                current_lyric    = None
                paused_sent      = False
                last_sent_status = None
                label = f"{track_name} — {artist_name}" if artist_name else track_name
                print(f"[CHANSON] {label}", flush=True)

                lyrics_data = fetch_lyrics(track_id, track_name, artist_name, duration_ms)
                if lyrics_data:
                    src = "cache" if cache_get(track_id) is not ... else "lrclib"
                    print(f"[PAROLES] ✓ {len(lyrics_data['lines'])} lignes ({lyrics_data['type']}, {src})", flush=True)
                else:
                    print("[PAROLES] ✗ Introuvables", flush=True)

                # Pré-téléchargement de la file d'attente en arrière-plan
                threading.Thread(
                    target=prefetch_queue,
                    args=(sp_token,),
                    daemon=True,
                ).start()

        # ── Pas de lecture active ─────────────────────────────────────────────
        if not api_is_playing:
            if not paused_sent:
                paused_sent = True
                set_discord_status(discord_token, '⏸ En pause')
                last_sent_status = '⏸ En pause'
            time.sleep(LYRIC_INTERVAL)
            continue

        paused_sent = False

        # ── Estimation locale de la progression ───────────────────────────────
        elapsed_ms  = (time.time() - api_fetch_time) * 1000
        progress_ms = int(api_progress_ms + elapsed_ms)

        # ── Pas de paroles : affiche titre + artiste ──────────────────────────
        if not lyrics_data:
            title  = to_italic(censor_text(track_name or '', censor_regex))
            artist = f" — {to_italic(censor_text(artist_name, censor_regex))}" if artist_name else ''
            status = f"♪ {title}{artist} ♪"
            if status != last_sent_status:
                set_discord_status(discord_token, status)
                last_sent_status = status
            time.sleep(LYRIC_INTERVAL)
            continue

        # ── Paroles non synchronisées : affiche titre ─────────────────────────
        if lyrics_data['type'] == 'unsynced':
            title  = to_italic(censor_text(track_name or '', censor_regex))
            artist = f" — {to_italic(censor_text(artist_name, censor_regex))}" if artist_name else ''
            status = f"♪ {title}{artist} ♪"
            if status != last_sent_status:
                set_discord_status(discord_token, status)
                last_sent_status = status
            time.sleep(LYRIC_INTERVAL)
            continue

        # ── Paroles synchronisées ─────────────────────────────────────────────
        active = get_active_lyric(lyrics_data['lines'], progress_ms, offset_ms)
        if active and active is not current_lyric:
            current_lyric = active
            status = get_status_string(active['words'], censor_regex)
            if status != last_sent_status:
                set_discord_status(discord_token, status)
                last_sent_status = status
                print(f"  → {active['words'][:70]}", flush=True)

        time.sleep(LYRIC_INTERVAL)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n[INFO] Arrêt.", flush=True)
