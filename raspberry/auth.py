#!/usr/bin/env python3
"""
Authentification Spotify (OAuth2) — à lancer une seule fois.
Génère spotify_token.json avec le refresh token.

Redirect URI à configurer dans le Spotify Developer Dashboard :
  https://localhost:8888/callback
"""
import json
import base64
import urllib.parse
import sys
import requests
from pathlib import Path

CONFIG_PATH = Path(__file__).parent / 'config.json'
TOKEN_PATH  = Path(__file__).parent / 'spotify_token.json'

SCOPES       = 'user-read-playback-state user-read-currently-playing'
REDIRECT_URI = 'https://localhost:8888/callback'

# ── Échange du code contre les tokens ────────────────────────────────────────

def exchange_code(client_id, client_secret, code):
    creds = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    r = requests.post('https://accounts.spotify.com/api/token', data={
        'grant_type':   'authorization_code',
        'code':          code,
        'redirect_uri':  REDIRECT_URI,
    }, headers={'Authorization': f'Basic {creds}'}, timeout=15)
    if r.status_code != 200:
        print(f"\n[ERREUR] Échange code: {r.status_code} — {r.text}")
        sys.exit(1)
    return r.json()

def save_tokens(tokens):
    TOKEN_PATH.write_text(json.dumps({
        'refresh_token': tokens['refresh_token'],
        'access_token':  tokens['access_token'],
        'expires_at':    0,
    }, indent=2))
    print(f"\n✓ Succès ! Token sauvegardé dans : {TOKEN_PATH}")
    print("Tu peux maintenant lancer lyrics_status.py\n")

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not CONFIG_PATH.exists():
        print(f"[ERREUR] {CONFIG_PATH} introuvable.")
        print("Copie config.example.json vers config.json et remplis tes identifiants.")
        sys.exit(1)

    with open(CONFIG_PATH) as f:
        config = json.load(f)

    client_id     = config['spotify']['client_id']
    client_secret = config['spotify']['client_secret']

    if not client_id or not client_secret or 'VOTRE' in client_id:
        print("[ERREUR] Remplis client_id et client_secret dans config.json avant de continuer.")
        sys.exit(1)

    params = urllib.parse.urlencode({
        'client_id':     client_id,
        'response_type': 'code',
        'redirect_uri':  REDIRECT_URI,
        'scope':         SCOPES,
    })
    auth_url = f'https://accounts.spotify.com/authorize?{params}'

    print("=" * 60)
    print("       Authentification Spotify")
    print("=" * 60)
    print()
    print("1. Ouvre cette URL dans ton navigateur (PC ou téléphone) :")
    print()
    print(f"   {auth_url}")
    print()
    print("2. Connecte-toi à Spotify et accepte les permissions.")
    print()
    print("3. Tu seras redirigé vers une page d'ERREUR — c'est normal.")
    print("   Copie l'URL complète depuis la barre d'adresse du navigateur.")
    print("   Elle ressemble à : https://localhost:8888/callback?code=AQ...")
    print()
    print("─" * 60)

    raw = input("Colle l'URL ici et appuie sur Entrée : ").strip()

    try:
        parsed = urllib.parse.urlparse(raw)
        params_dict = urllib.parse.parse_qs(parsed.query)
        code = params_dict.get('code', [None])[0]
    except Exception:
        code = None

    if not code:
        # Peut-être que l'utilisateur a juste collé le code brut
        if raw and len(raw) > 10 and ' ' not in raw and '?' not in raw:
            code = raw
        else:
            print("\n[ERREUR] Impossible de lire le code dans ce que tu as collé.")
            print("Assure-toi de copier l'URL COMPLÈTE depuis la barre d'adresse.")
            sys.exit(1)

    print("\nÉchange du code en cours...")
    tokens = exchange_code(client_id, client_secret, code)
    save_tokens(tokens)

if __name__ == '__main__':
    main()
