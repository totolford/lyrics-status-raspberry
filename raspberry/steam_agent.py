#!/usr/bin/env python3
"""
Agent à lancer sur le PC (Windows / Linux / macOS) : détecte le jeu en cours
(Steam, même hors ligne, ou n'importe quel autre jeu) et l'envoie au Raspberry Pi.
Aucune dépendance (stdlib seule).

Jeux hors Steam : l'agent télécharge 1x/semaine la liste publique des jeux connus de
Discord (nom des .exe) et compare avec les processus en cours. Pour ajouter un jeu
manquant, crée custom_games.json à côté : {"monjeu.exe": "Mon Jeu"}

Musique jouée sur le PC (YouTube, Deezer, VLC...) : lue via Windows (paquets winrt,
installés par install_agent.ps1) et envoyée au Pi, qui affiche les paroles.

Mise à jour automatique : l'agent récupère la dernière version auprès du Pi.

Usage : python steam_agent.py [http://IP_DU_PI:8765 MOT_DE_PASSE]
        (sinon : variables PI_URL / STEAM_TOKEN, ou pi_url / token dans agent_config.json)
"""
import glob
import json
import os
import re
import sys
import time
import subprocess
import threading
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE         = Path(__file__).resolve().parent
CACHE_PATH   = HERE / 'games_cache.json'
CUSTOM_PATH  = HERE / 'custom_games.json'
CACHE_MAX_AGE_S = 7 * 86400
DETECTABLE_URL  = 'https://discord.com/api/v9/applications/detectable'

INTERVAL_S = 5
UPDATE_CHECK_S = 1800
CONFIG_PATH = HERE / 'agent_config.json'

def _load_config():
    try:
        return json.loads(CONFIG_PATH.read_text(encoding='utf-8-sig'))
    except Exception:
        return {}

def _steam_root():
    try:
        return _steam_root_unsafe()
    except Exception:
        return None

def _steam_root_unsafe():
    if sys.platform == 'win32':
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Software\Valve\Steam') as k:
            return Path(winreg.QueryValueEx(k, 'SteamPath')[0])
    home = Path.home()
    for p in (home / '.steam/steam', home / '.local/share/Steam',
              home / 'Library/Application Support/Steam'):
        if p.exists():
            return p
    return None

def _running_appid(root):
    """AppID du jeu lancé par Steam (0 si aucun). Écrit par le client Steam, même hors ligne."""
    if sys.platform == 'win32':
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Software\Valve\Steam') as k:
                return int(winreg.QueryValueEx(k, 'RunningAppID')[0])
        except OSError:
            return 0
    for reg in (Path.home() / '.steam/registry.vdf', root / 'registry.vdf' if root else None):
        if reg and reg.exists():
            m = re.search(r'"RunningAppID"\s+"(\d+)"', reg.read_text(errors='ignore'))
            if m:
                return int(m[1])
    return 0

def _library_dirs(root):
    dirs = [root / 'steamapps']
    vdf = root / 'steamapps' / 'libraryfolders.vdf'
    if vdf.exists():
        for m in re.finditer(r'"path"\s+"([^"]+)"', vdf.read_text(errors='ignore')):
            dirs.append(Path(m[1].replace('\\\\', '\\')) / 'steamapps')
    return dirs

def _game_name(root, appid):
    for d in _library_dirs(root):
        acf = d / f'appmanifest_{appid}.acf'
        if acf.exists():
            m = re.search(r'"name"\s+"([^"]+)"', acf.read_text(errors='ignore'))
            if m:
                return m[1]
    return f'Steam game {appid}'  # raccourci non-Steam ou jeu hors bibliothèques connues

def current_game_info():
    """(texte affiché, nom de base du jeu) ou (None, None)."""
    root  = _steam_root()
    appid = _running_appid(root) if root else 0
    exes  = _running_exes()
    base  = _game_name(root, appid) if appid else (_process_game(exes) or _pseudo_game(exes))
    if not base:
        _stop_all_details()
        return None, None
    for key, (fn, stop) in _all_details().items():
        if _present(key, exes):
            try:
                detail = fn()
            except Exception:
                detail = None
            return (f'{base} · {detail}' if detail else base), base
        if stop:
            stop()  # le jeu n'est pas lancé : on coupe son écoute éventuelle
    return base, base

def current_game():
    return current_game_info()[0]

def _present(key, exes):
    """key = nom d'exe exact, ou préfixe terminé par * (ex. 'fivem*')."""
    if key.endswith('*'):
        return any(e.startswith(key[:-1]) for e in exes)
    return key in exes

# ── Jeux hors Steam ───────────────────────────────────────────────────────────

def build_cache():
    """Télécharge la liste Discord et en tire une petite table exe -> jeu (lancé en sous-processus)."""
    req = urllib.request.Request(DETECTABLE_URL, headers={'User-Agent': 'lyrics-status-agent'})
    with urllib.request.urlopen(req, timeout=60) as r:
        apps = json.loads(r.read())
    names = {}
    for app in apps:
        for ex in app.get('executables', []):
            if ex.get('os') != 'win32' or ex.get('is_launcher'):
                continue
            exe = ex['name'].lstrip('>').replace('\\', '/').rsplit('/', 1)[-1].lower()
            if exe.endswith('.exe'):
                names.setdefault(exe, set()).add(app['name'])
    # un nom d'exe partagé par plusieurs jeux (game.exe...) est trop ambigu : ignoré
    table = {exe: next(iter(n)) for exe, n in names.items() if len(n) == 1}
    tmp = CACHE_PATH.with_suffix('.tmp')
    tmp.write_text(json.dumps(table))
    tmp.replace(CACHE_PATH)

def _refresh_cache_if_old():
    try:
        if CACHE_PATH.exists() and time.time() - CACHE_PATH.stat().st_mtime < CACHE_MAX_AGE_S:
            return
        flags = 0x08000000 if sys.platform == 'win32' else 0  # CREATE_NO_WINDOW
        subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--build-cache'],
                         creationflags=flags, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

def _running_exes():
    """Noms (minuscules) des programmes en cours, sans dépendance."""
    if sys.platform == 'win32':
        return set(_process_map().values())
    return _running_exes_posix()

def _process_map():
    """Windows : {pid: nom d'exe en minuscules} via un instantané de la liste des processus."""
    import ctypes
    from ctypes import wintypes
    class PE(ctypes.Structure):
        _fields_ = [('dwSize', wintypes.DWORD), ('cntUsage', wintypes.DWORD),
                    ('th32ProcessID', wintypes.DWORD), ('th32DefaultHeapID', ctypes.c_size_t),
                    ('th32ModuleID', wintypes.DWORD), ('cntThreads', wintypes.DWORD),
                    ('th32ParentProcessID', wintypes.DWORD), ('pcPriClassBase', wintypes.LONG),
                    ('dwFlags', wintypes.DWORD), ('szExeFile', ctypes.c_wchar * 260)]
    k32 = ctypes.windll.kernel32
    k32.CreateToolhelp32Snapshot.restype  = wintypes.HANDLE
    k32.Process32FirstW.argtypes = k32.Process32NextW.argtypes = [wintypes.HANDLE, ctypes.POINTER(PE)]
    k32.CloseHandle.argtypes = [wintypes.HANDLE]
    snap = k32.CreateToolhelp32Snapshot(0x2, 0)  # TH32CS_SNAPPROCESS
    procs = {}
    try:
        pe = PE(); pe.dwSize = ctypes.sizeof(PE)
        ok = k32.Process32FirstW(snap, ctypes.byref(pe))
        while ok:
            procs[pe.th32ProcessID] = pe.szExeFile.lower()
            ok = k32.Process32NextW(snap, ctypes.byref(pe))
    finally:
        k32.CloseHandle(snap)
    return procs

def _running_exes_posix():
    exes = set()
    if sys.platform == 'darwin':
        out = subprocess.run(['ps', '-A', '-o', 'comm='], capture_output=True, text=True).stdout
        return {l.strip().rsplit('/', 1)[-1].lower() for l in out.splitlines()}
    for d in Path('/proc').glob('[0-9]*'):  # Linux : jeux Windows sous Wine/Proton inclus
        try:
            argv = (d / 'cmdline').read_bytes().split(b'\0')
        except OSError:
            continue
        for a in argv[:2]:
            exes.add(a.decode(errors='ignore').replace('\\', '/').rsplit('/', 1)[-1].lower())
    return exes

_table = {}
_table_mtime = 0.0

def _load_table():
    global _table, _table_mtime
    try:
        m = sum(p.stat().st_mtime for p in (CACHE_PATH, CUSTOM_PATH) if p.exists())
        if m != _table_mtime:
            table = json.loads(CACHE_PATH.read_text()) if CACHE_PATH.exists() else {}
            if CUSTOM_PATH.exists():
                table.update({k.lower(): v for k, v in json.loads(CUSTOM_PATH.read_text()).items()})
            _table, _table_mtime = table, m
    except Exception:
        pass
    return _table

def _process_game(exes):
    table = _load_table()
    for exe in exes:
        if exe in table:
            return table[exe]
    return None

# ── Détails par jeu (ajoutés au nom : "ROBLOX · Adopt Me!") ───────────────────

_roblox = {'path': None, 'offset': 0, 'place': None, 'names': {}}
_ROBLOX_JOIN = re.compile(rb"Joining game '[0-9a-fA-F-]+' place (\d+)")

def _roblox_name(place_id):
    cache = _roblox['names']
    hit = cache.get(place_id)
    if hit and (hit[0] or time.time() - hit[1] < 60):  # échec : on réessaie après 60 s
        return hit[0]
    name = None
    try:
        def get(u):
            return json.loads(urllib.request.urlopen(u, timeout=5).read())
        uni = get(f'https://apis.roblox.com/universes/v1/places/{place_id}/universe')['universeId']
        name = get(f'https://games.roblox.com/v1/games?universeIds={uni}')['data'][0]['name']
        name = re.sub(r'^(\s*\[[^\]]*\])+\s*', '', name).strip() or name  # retire les [tags] de début
    except Exception:
        pass
    cache[place_id] = (name, time.time())
    return name

def _roblox_detail():
    """Nom exact de l'expérience Roblox, lu dans le dernier log du client (lecture incrémentale)."""
    logs = Path(os.environ.get('LOCALAPPDATA', '')) / 'Roblox' / 'logs'
    files = list(logs.glob('*Player*.log')) if logs.is_dir() else []
    if not files:
        return None
    path = max(files, key=lambda f: f.stat().st_mtime)
    st = _roblox
    if st['path'] != path or path.stat().st_size < st['offset']:
        st.update(path=path, offset=0, place=None)
    with open(path, 'rb') as f:
        f.seek(st['offset'])
        data = f.read()
        st['offset'] += len(data)
    for m in _ROBLOX_JOIN.finditer(data):
        st['place'] = int(m[1])
    return _roblox_name(st['place']) if st['place'] else None

# ── War Thunder : API locale http://127.0.0.1:8111 (ouverte seulement quand le jeu tourne) ──

def _warthunder_detail():
    try:
        with urllib.request.urlopen('http://127.0.0.1:8111/mission.json', timeout=1) as r:
            status = json.loads(r.read()).get('status')
    except Exception:
        return None
    return {'running': 'en combat', 'success': 'victoire', 'fail': 'défaite'}.get(status, 'hangar')

# ── CS2 : Game State Integration (Valve). Le jeu POSTe l'état vers un petit serveur local ──

GSI_PORT = 3399
_GSI_CFG = '''"Lyrics Status"
{
  "uri"       "http://127.0.0.1:%d"
  "timeout"   "5.0"
  "buffer"    "0.1"
  "throttle"  "0.5"
  "heartbeat" "10.0"
  "data"
  {
    "provider"     "1"
    "map"          "1"
    "player_id"    "1"
  }
}
''' % GSI_PORT
_gsi = {'server': None, 'data': None, 'at': 0.0}

def install_cs2_cfg():
    """Écrit le fichier GSI dans le dossier cfg de CS2 (une fois) si on le trouve."""
    root = _steam_root()
    if not root:
        return None
    for d in _library_dirs(root):
        cfg_dir = d / 'common' / 'Counter-Strike Global Offensive' / 'game' / 'csgo' / 'cfg'
        if cfg_dir.is_dir():
            f = cfg_dir / 'gamestate_integration_lyricsstatus.cfg'
            if not f.exists() or f.read_text() != _GSI_CFG:
                f.write_text(_GSI_CFG)
                return True  # nouvellement écrit : CS2 doit être relancé pour le lire
            return False
    return None

def _gsi_start():
    if _gsi['server']:
        return
    from http.server import BaseHTTPRequestHandler, HTTPServer
    class H(BaseHTTPRequestHandler):
        def do_POST(self):
            try:
                body = self.rfile.read(min(int(self.headers.get('Content-Length', 0)), 200000))
                _gsi['data'], _gsi['at'] = json.loads(body), time.time()
            except Exception:
                pass
            self.send_response(200); self.end_headers()
        def log_message(self, *a):
            pass
    try:
        srv = HTTPServer(('127.0.0.1', GSI_PORT), H)
    except OSError:
        return
    _gsi['server'] = srv
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    if install_cs2_cfg():
        print("[CS2] Fichier GSI installé : relance CS2 pour activer les détails de partie.", flush=True)

def _gsi_stop():
    srv = _gsi['server']
    if srv:
        _gsi.update(server=None, data=None)
        threading.Thread(target=srv.shutdown, daemon=True).start()
        srv.server_close()

_CS2_MODES = {'competitive': 'Compétitif', 'casual': 'Occasionnel', 'deathmatch': 'Deathmatch',
              'scrimcomp2v2': 'Wingman', 'gungameprogressive': 'Course aux armes'}

def _cs2_detail():
    _gsi_start()
    data = _gsi['data']
    if not data or time.time() - _gsi['at'] > 30:
        return None
    m = data.get('map')
    if not m or not m.get('name'):
        return None
    name  = m['name'].split('_', 1)[-1].replace('_', ' ').title()
    parts = [_CS2_MODES.get(m.get('mode'), (m.get('mode') or '').title()), name]
    ct, t = m.get('team_ct', {}).get('score'), m.get('team_t', {}).get('score')
    if ct is not None and t is not None:
        team = (data.get('player') or {}).get('team')
        parts.append(f'{t}-{ct}' if team == 'T' else f'{ct}-{t}')
    return ' · '.join(p for p in parts if p)

# ── Arma Reforger : le nom du serveur est écrit dans console.log à la connexion ──

_arma = {'path': None, 'offset': 0, 'server': None}
_ARMA_SERVER = re.compile(rb"Server Name:\s+'(.*)'")

def _arma_log_dirs():
    home = Path.home()
    for docs in (home / 'Documents', home / 'OneDrive' / 'Documents', home / 'OneDrive' / 'Documents'):
        yield docs / 'My Games' / 'ArmaReforger' / 'logs'

def _clean_server_name(name):
    parts = [p.strip() for p in name.split('|')]
    parts = [p for p in parts if p and not re.search(r'discord\.gg|https?://|www\.', p, re.I)]
    out = ' | '.join(parts) or name
    return out if len(out) <= 60 else out[:57] + '…'

def _arma_detail():
    logs = [f for d in _arma_log_dirs() if d.is_dir() for f in d.glob('*/console.log')]
    if not logs:
        return None
    path = max(logs, key=lambda f: f.stat().st_mtime)
    st = _arma
    if st['path'] != path or path.stat().st_size < st['offset']:
        st.update(path=path, offset=0, server=None)
    with open(path, 'rb') as f:
        f.seek(st['offset'])
        data = f.read()
        st['offset'] += len(data)
    for m in _ARMA_SERVER.finditer(data):
        st['server'] = _clean_server_name(m[1].decode(errors='ignore'))
    return st['server']

# ── Valorant : API locale du client Riot (lockfile), lecture seule de la présence ──

_VAL_MAPS = {'ascent': 'Ascent', 'bonsai': 'Split', 'triad': 'Haven', 'duality': 'Bind', 'port': 'Icebox',
             'foxtrot': 'Breeze', 'canyon': 'Fracture', 'pitt': 'Pearl', 'jam': 'Lotus',
             'juliett': 'Sunset', 'infinity': 'Abyss', 'rook': 'Corrode'}
_VAL_QUEUES = {'competitive': 'Compétitif', 'unrated': 'Non classé', 'spikerush': 'Spike Rush',
               'deathmatch': 'Deathmatch', 'swiftplay': 'Swiftplay', 'premier': 'Premier',
               'ggteam': 'Escalade', 'onefa': 'Réplication', 'snowball': 'Boules de neige',
               'hurm': 'Match à mort par équipe', 'custom': 'Partie perso'}

def _riot_get(path):
    import base64, ssl
    lock = Path(os.environ.get('LOCALAPPDATA', '')) / 'Riot Games' / 'Riot Client' / 'Config' / 'lockfile'
    _, _, port, password, proto = lock.read_text().strip().split(':')
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE  # certificat auto-signé du client Riot, connexion 127.0.0.1 uniquement
    req = urllib.request.Request(f'{proto}://127.0.0.1:{port}{path}', headers={
        'Authorization': 'Basic ' + base64.b64encode(f'riot:{password}'.encode()).decode()})
    return json.loads(urllib.request.urlopen(req, timeout=2, context=ctx).read())

def _find_key(obj, key):
    """Cherche une clé à n'importe quelle profondeur (le format de présence a changé selon les versions)."""
    if isinstance(obj, dict):
        if key in obj:
            return obj[key]
        for v in obj.values():
            r = _find_key(v, key)
            if r is not None:
                return r
    return None

def _valorant_detail():
    import base64
    me = _riot_get('/chat/v1/session').get('puuid')
    for pr in _riot_get('/chat/v4/presences').get('presences', []):
        if pr.get('puuid') != me or pr.get('product') != 'valorant' or not pr.get('private'):
            continue
        priv  = json.loads(base64.b64decode(pr['private']))
        state = _find_key(priv, 'sessionLoopState')
        if state == 'PREGAME':
            return 'sélection des agents'
        if state != 'INGAME':
            return None
        queue = _find_key(priv, 'queueId') or ''
        mapid = (_find_key(priv, 'matchMap') or '').rsplit('/', 1)[-1].lower()
        ally  = _find_key(priv, 'partyOwnerMatchScoreAllyTeam')
        enemy = _find_key(priv, 'partyOwnerMatchScoreEnemyTeam')
        parts = [_VAL_QUEUES.get(queue, queue.title()), _VAL_MAPS.get(mapid, mapid.title())]
        if ally is not None and enemy is not None:
            parts.append(f'{ally}-{enemy}')
        return ' · '.join(p for p in parts if p)
    return None

# ── Apex Legends : rang via l'API tierce Mozambique (clé gratuite dans agent_config.json) ──

_apex = {'at': 0.0, 'text': None}
_APEX_TIERS = {'Apex Predator': 'Prédateur', 'Master': 'Maître', 'Rookie': 'Débutant'}

def _http_json(url):
    return json.loads(urllib.request.urlopen(url, timeout=6).read())

def _apex_detail():
    if time.time() - _apex['at'] < 120:  # le rang change peu : une requête toutes les 2 min
        return _apex['text']
    _apex['at'] = time.time()
    try:
        cfg = _load_config().get('apex', {})
        if not cfg.get('key') or not cfg.get('player'):
            return None
        from urllib.parse import quote
        data = _http_json('https://api.mozambiquehe.re/bridge?auth=%s&player=%s&platform=%s' % (
            quote(cfg['key']), quote(cfg['player']), quote(cfg.get('platform', 'PC'))))
        rank = data['global']['rank']
        name = _APEX_TIERS.get(rank['rankName'], rank['rankName'])
        pos  = rank.get('ladderPosPlatform', -1)
        if rank['rankName'] == 'Apex Predator' and pos and pos > 0:
            _apex['text'] = f'{name} #{pos}'
        else:
            div = rank.get('rankDiv')
            _apex['text'] = f"{name}{' ' + str(div) if div else ''} · {rank.get('rankScore', 0)} RP"
    except Exception:
        _apex['text'] = None
    return _apex['text']

# ── Suivi de fichier de log (lecture incrémentale) ───────────────────────────

def _expand_globs(patterns):
    files = []
    for pat in ([patterns] if isinstance(patterns, str) else patterns):
        files += [Path(f) for f in glob.glob(os.path.expandvars(os.path.expanduser(pat)))]
    return [f for f in files if f.is_file()]

def _tail_last_match(state, patterns, regex):
    """Dernière correspondance (regex bytes) dans le log le plus récent ; lit seulement le nouveau."""
    files = _expand_globs(patterns)
    if not files:
        return None
    path = max(files, key=lambda f: f.stat().st_mtime)
    if state.get('path') != path or path.stat().st_size < state.get('offset', 0):
        state.update(path=path, offset=0, match=None)
    with open(path, 'rb') as f:
        f.seek(state['offset'])
        data = f.read()
        state['offset'] += len(data)
    for m in regex.finditer(data):
        state['match'] = m
    return state.get('match')

def _log_is_recent(patterns, max_age_s):
    files = _expand_globs(patterns)
    return bool(files) and time.time() - max(f.stat().st_mtime for f in files) < max_age_s

# ── Minecraft Java : javaw.exe est trop générique, on se fie au log récent ──

def _mc_logs():
    if sys.platform == 'win32':
        return ['%APPDATA%/.minecraft/logs/latest.log']
    if sys.platform == 'darwin':
        return ['~/Library/Application Support/minecraft/logs/latest.log']
    return ['~/.minecraft/logs/latest.log']

_mc = {}
_MC_RE = re.compile(rb"Connecting to ([^,\r\n]+), (\d+)|(Starting integrated minecraft server)")

def _minecraft_active(exes):
    return 'javaw.exe' in exes and _log_is_recent(_mc_logs(), 180)

def _minecraft_detail():
    if not _log_is_recent(_mc_logs(), 180):
        return None
    m = _tail_last_match(_mc, _mc_logs(), _MC_RE)
    if not m:
        return None
    return 'Solo' if m.group(3) else m.group(1).decode(errors='ignore').strip()[:60]

# ── FiveM : le nom du serveur est dans le titre de la fenêtre ────────────────

def _window_titles(exe_prefix):
    """Windows : titres des fenêtres visibles appartenant à un exe qui commence par exe_prefix."""
    if sys.platform != 'win32':
        return []
    import ctypes
    from ctypes import wintypes
    user32 = ctypes.windll.user32
    procs  = _process_map()
    titles = []
    WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def cb(hwnd, _):
        if user32.IsWindowVisible(hwnd):
            pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            if procs.get(pid.value, '').startswith(exe_prefix):
                buf = ctypes.create_unicode_buffer(256)
                user32.GetWindowTextW(hwnd, buf, 256)
                if buf.value:
                    titles.append(buf.value)
        return True
    user32.EnumWindows(WNDENUMPROC(cb), 0)
    return titles

def _fivem_detail():
    for t in _window_titles('fivem'):
        if ' - ' in t:
            name = re.sub(r'\^\d', '', t.split(' - ', 1)[1]).strip()  # codes couleur ^1
            if name:
                return _clean_server_name(name)
    return None

# ── League of Legends : API locale « Live Client Data » (https, certificat auto-signé) ──

def _local_ssl():
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE  # 127.0.0.1 uniquement
    return ctx

_LOL_MODES = {'CLASSIC': 'Faille', 'ARAM': 'ARAM', 'URF': 'URF', 'TFT': 'TFT', 'CHERRY': 'Arena'}

def _lol_detail():
    with urllib.request.urlopen('https://127.0.0.1:2999/liveclientdata/allgamedata',
                                timeout=2, context=_local_ssl()) as r:
        data = json.loads(r.read())
    ap   = data.get('activePlayer', {})
    me   = {ap.get('riotId'), ap.get('summonerName'), ap.get('riotIdGameName')} - {None, ''}
    mine = next((p for p in data.get('allPlayers', [])
                 if me & {p.get('riotId'), p.get('summonerName'), p.get('riotIdGameName')}), None)
    t    = int(data.get('gameData', {}).get('gameTime', 0))
    parts = []
    if mine:
        sc = mine.get('scores', {})
        parts.append(f"{mine.get('championName', '')} {sc.get('kills', 0)}/{sc.get('deaths', 0)}/{sc.get('assists', 0)}")
    mode = data.get('gameData', {}).get('gameMode', '')
    if mode:
        parts.append(_LOL_MODES.get(mode, mode.title()))
    parts.append(f'{t // 60}:{t % 60:02d}')
    return ' · '.join(parts)

# ── Jeux / détails ajoutés par l'utilisateur : custom_details.json ───────────
# {"monjeu.exe": {"name": "Mon Jeu", "log": "%APPDATA%/MonJeu/*.log", "regex": "Serveur: (.+)"}}

DETAILS_PATH = HERE / 'custom_details.json'
_custom = {'mtime': 0.0, 'cfg': {}, 'tails': {}}

def _custom_cfg():
    try:
        m = DETAILS_PATH.stat().st_mtime if DETAILS_PATH.exists() else 0.0
        if m != _custom['mtime']:
            cfg = json.loads(DETAILS_PATH.read_text(encoding='utf-8-sig')) if m else {}
            _custom.update(mtime=m, cfg={k.lower(): v for k, v in cfg.items() if isinstance(v, dict)}, tails={})
    except Exception:
        pass
    return _custom['cfg']

def _custom_detail_fn(exe, cfg):
    def fn():
        if not cfg.get('log') or not cfg.get('regex'):
            return None
        state = _custom['tails'].setdefault(exe, {})
        m = _tail_last_match(state, cfg['log'], re.compile(cfg['regex'].encode()))
        if not m:
            return None
        g = m.group(1) if m.groups() else m.group(0)
        return g.decode(errors='ignore').strip()[:60]
    return fn

def _all_details():
    d = dict(_DETAILS)
    for exe, cfg in _custom_cfg().items():
        if cfg.get('log') and cfg.get('regex'):
            d[exe] = (_custom_detail_fn(exe, cfg), None)
    return d

def _pseudo_game(exes):
    """Jeux qu'on reconnaît autrement que par un nom d'exe unique."""
    if _minecraft_active(exes):
        return 'Minecraft'
    if any(e.startswith('fivem') for e in exes):
        return 'FiveM'
    for exe, cfg in _custom_cfg().items():
        if cfg.get('name') and exe in exes:
            return cfg['name']
    return None

# ── Musique jouée sur le PC (Windows : contrôles multimédia système) ─────────

_media_state = {'warned': False}

async def _media_async(Mgr, ignore):
    mgr = await Mgr.request_async()
    for sess in mgr.get_sessions():
        app = (sess.source_app_user_model_id or '').lower()
        if any(i in app for i in ignore):
            continue
        if int(sess.get_playback_info().playback_status) != 4:  # 4 = PLAYING
            continue
        props = await sess.try_get_media_properties_async()
        if not props.title:
            continue
        tl     = sess.get_timeline_properties()
        end_ms = int((tl.end_time - tl.start_time).total_seconds() * 1000)
        pos = None
        if end_ms > 0:
            pos = int(tl.position.total_seconds() * 1000)
            try:  # la position est figée à last_updated_time : on ajoute le temps écoulé depuis
                age = (datetime.now(timezone.utc) - tl.last_updated_time).total_seconds()
                pos += int(max(0.0, min(age, 3600.0)) * 1000)
            except Exception:
                pass
            pos = min(pos, end_ms)
        return {'title': props.title, 'artist': props.artist or '', 'duration_ms': max(end_ms, 0),
                'position_ms': pos, 'playing': True}
    return None

def current_media(cfg):
    if sys.platform != 'win32' or cfg.get('media') is False:
        return None
    try:
        import asyncio
        from winrt.windows.media.control import GlobalSystemMediaTransportControlsSessionManager as Mgr
    except ImportError:
        if not _media_state['warned']:
            _media_state['warned'] = True
            print("[MEDIA] Paquets winrt absents : musique du PC désactivée (relance install_agent.ps1).", flush=True)
        return None
    ignore = [a.lower() for a in cfg.get('media_ignore', ['spotify'])]
    try:
        return asyncio.run(_media_async(Mgr, ignore))
    except Exception as e:
        if not _media_state['warned']:
            _media_state['warned'] = True
            print(f"[MEDIA] Lecture impossible: {e}", flush=True)
        return None

# ── Mise à jour automatique depuis le Pi ─────────────────────────────────────

def _self_update(url, token):
    me = Path(__file__).resolve()
    try:
        req = urllib.request.Request(f'{url}/agent.py', headers={'X-Token': token})
        new = urllib.request.urlopen(req, timeout=15).read()
        cur = me.read_bytes()
        if new == cur or len(new) < 2000:
            return
        compile(new, str(me), 'exec')  # n'installe jamais un fichier cassé
        me.with_name(me.name + '.bak').write_bytes(cur)
        me.write_bytes(new)
        print("[UPDATE] Nouvelle version installée, redémarrage...", flush=True)
        flags = 0x08000000 if sys.platform == 'win32' else 0
        subprocess.Popen([sys.executable, str(me), *sys.argv[1:]], creationflags=flags)
        os._exit(0)
    except Exception as e:
        print(f"[UPDATE] Vérification impossible: {e}", flush=True)

def _stop_all_details():
    for _, stop in _DETAILS.values():
        if stop:
            stop()

# exe -> (fonction de détail, fonction d'arrêt ou None) ; appelée seulement si l'exe tourne
_DETAILS = {
    'robloxplayerbeta.exe': (_roblox_detail, None),
    'aces.exe':             (_warthunder_detail, None),
    'cs2.exe':              (_cs2_detail, _gsi_stop),
    'armareforgersteam.exe':              (_arma_detail, None),
    'armareforger_be.exe':                (_arma_detail, None),
    'armareforgersteam_experimental.exe': (_arma_detail, None),
    'valorant-win64-shipping.exe':        (_valorant_detail, None),
    'r5apex.exe':                         (_apex_detail, None),
    'r5apex_dx12.exe':                    (_apex_detail, None),
    'league of legends.exe':              (_lol_detail, None),
    'javaw.exe':                          (_minecraft_detail, None),
    'fivem*':                             (_fivem_detail, None),
}

def _lower_priority():
    """Priorité CPU minimale pour ne jamais gêner le jeu."""
    try:
        if sys.platform == 'win32':
            import ctypes
            ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(), 0x40)  # IDLE
        else:
            os.nice(19)
    except Exception:
        pass

def main():
    if '--build-cache' in sys.argv:
        build_cache()
        return
    _lower_priority()
    cfg   = _load_config()
    args  = [a for a in sys.argv[1:] if not a.startswith('--')]
    url   = (args[0] if len(args) > 0 else os.environ.get('PI_URL') or cfg.get('pi_url', '')).rstrip('/')
    token = args[1] if len(args) > 1 else os.environ.get('STEAM_TOKEN') or cfg.get('token', '')
    if not url or not token:
        sys.exit("Usage : python steam_agent.py http://IP_DU_PI:8765 MOT_DE_PASSE (ou pi_url/token dans agent_config.json)")
    print(f"Agent → {url}", flush=True)
    last = ...
    last_cache_check = last_update_check = 0.0
    session = {'base': None, 'start': 0.0}
    while True:
        try:
            now = time.time()
            if now - last_cache_check > 3600:
                last_cache_check = now
                _refresh_cache_if_old()
            if now - last_update_check > UPDATE_CHECK_S:
                last_update_check = now
                _self_update(url, token)
            game, base = current_game_info()
            if game != last:
                print(f"[JEU] {game or 'aucun'}", flush=True)
                last = game
            if base != session['base']:
                session.update(base=base, start=now)
            payload = {'game': game, 'elapsed_s': int(now - session['start']) if base else 0,
                       'media': current_media(cfg)}
            req = urllib.request.Request(
                f'{url}/steam',
                data=json.dumps(payload).encode(),
                headers={'X-Token': token, 'Content-Type': 'application/json'},
                method='POST',
            )
            urllib.request.urlopen(req, timeout=5).close()
        except Exception as e:
            print(f"[WARN] {e}", flush=True)
        time.sleep(INTERVAL_S)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
