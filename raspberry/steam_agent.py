#!/usr/bin/env python3
"""
Agent à lancer sur le PC (Windows / Linux / macOS) : détecte le jeu en cours
(Steam, même hors ligne, ou n'importe quel autre jeu) et l'envoie au Raspberry Pi.
Aucune dépendance (stdlib seule).

Jeux hors Steam : l'agent télécharge 1x/semaine la liste publique des jeux connus de
Discord (nom des .exe) et compare avec les processus en cours. Pour ajouter un jeu
manquant, crée custom_games.json à côté : {"monjeu.exe": "Mon Jeu"}

Usage : python steam_agent.py http://IP_DU_PI:8765 MOT_DE_PASSE
        (ou variables d'env PI_URL / STEAM_TOKEN)
"""
import json
import os
import re
import sys
import time
import subprocess
import urllib.request
from pathlib import Path

HERE         = Path(__file__).resolve().parent
CACHE_PATH   = HERE / 'games_cache.json'
CUSTOM_PATH  = HERE / 'custom_games.json'
CACHE_MAX_AGE_S = 7 * 86400
DETECTABLE_URL  = 'https://discord.com/api/v9/applications/detectable'

INTERVAL_S = 5

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

def current_game():
    root = _steam_root()
    appid = _running_appid(root) if root else 0
    if appid:
        return _game_name(root, appid)
    return _process_game()

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
        exes = set()
        try:
            pe = PE(); pe.dwSize = ctypes.sizeof(PE)
            ok = k32.Process32FirstW(snap, ctypes.byref(pe))
            while ok:
                exes.add(pe.szExeFile.lower())
                ok = k32.Process32NextW(snap, ctypes.byref(pe))
        finally:
            k32.CloseHandle(snap)
        return exes
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

def _process_game():
    table = _load_table()
    if not table:
        return None
    for exe in _running_exes():
        if exe in table:
            extra = _DETAILS.get(exe)
            detail = None
            if extra:
                try:
                    detail = extra()
                except Exception:
                    detail = None
            return f'{table[exe]} · {detail}' if detail else table[exe]
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

_DETAILS = {'robloxplayerbeta.exe': _roblox_detail}

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
    url   = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get('PI_URL', '')).rstrip('/')
    token = sys.argv[2] if len(sys.argv) > 2 else os.environ.get('STEAM_TOKEN', '')
    if not url or not token:
        sys.exit("Usage : python steam_agent.py http://IP_DU_PI:8765 MOT_DE_PASSE")
    print(f"Agent Steam → {url}", flush=True)
    last = ...
    last_cache_check = 0.0
    while True:
        try:
            if time.time() - last_cache_check > 3600:
                last_cache_check = time.time()
                _refresh_cache_if_old()
            game = current_game()
            if game != last:
                print(f"[JEU] {game or 'aucun'}", flush=True)
                last = game
            req = urllib.request.Request(
                f'{url}/steam',
                data=json.dumps({'game': game}).encode(),
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
