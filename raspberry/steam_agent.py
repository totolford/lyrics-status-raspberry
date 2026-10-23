#!/usr/bin/env python3
"""
Agent à lancer sur le PC (Windows / Linux / macOS) : détecte le jeu Steam en cours,
même en mode hors ligne, et l'envoie au Raspberry Pi. Aucune dépendance (stdlib seule).

Usage : python steam_agent.py http://IP_DU_PI:8765 MOT_DE_PASSE
        (ou variables d'env PI_URL / STEAM_TOKEN)
"""
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

INTERVAL_S = 5

def _steam_root():
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
    if not root:
        return None
    appid = _running_appid(root)
    return _game_name(root, appid) if appid else None

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
    _lower_priority()
    url   = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get('PI_URL', '')).rstrip('/')
    token = sys.argv[2] if len(sys.argv) > 2 else os.environ.get('STEAM_TOKEN', '')
    if not url or not token:
        sys.exit("Usage : python steam_agent.py http://IP_DU_PI:8765 MOT_DE_PASSE")
    print(f"Agent Steam → {url}", flush=True)
    last = ...
    while True:
        try:
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
