# Lyrics Status — Raspberry Pi

Daemon Python qui tourne en arrière-plan sur un Raspberry Pi et met à jour ton statut Discord avec les paroles de la chanson que tu écoutes sur Spotify — **peu importe l'appareil** (téléphone, PC, console...).

---

## Comment ça marche

```
Raspberry Pi (daemon)
  ├─ Spotify Web API  →  chanson en cours + position (ms), n'importe quel appareil
  ├─ lrclib.net       →  paroles synchronisées
  └─ Discord API      →  PATCH custom_status en temps réel
```

Contrairement au userscript navigateur, ce daemon utilise l'**API officielle Spotify** : il suffit d'être connecté à Spotify sur n'importe quel appareil pour que ça fonctionne.

---

## Prérequis

| Matériel / Logiciel | Notes |
|---|---|
| Raspberry Pi (Zero 2W, 3, 4...) | Avec Raspberry Pi OS Lite ou Desktop |
| Python 3.9+ | Pré-installé sur Raspberry Pi OS |
| Compte Spotify **Premium** | Requis pour les paroles synchronisées |
| Token Discord | Voir la section dédiée ci-dessous |
| Compte Spotify Developer | Gratuit — pour les identifiants API |

---

## Étape 1 — Créer une application Spotify Developer

> Cette étape se fait sur n'importe quel navigateur (PC, téléphone...).

1. Va sur [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Connecte-toi avec ton compte Spotify
3. Clique sur **Create App**
4. Remplis les champs :
   - **App name** : `Lyrics Status` (ou ce que tu veux)
   - **App description** : ce que tu veux
   - **Redirect URIs** : `https://example.com` ← **copie exactement ça**
   - **APIs used** : coche `Web API`
5. Accepte les conditions et clique **Save**
6. Sur la page de ton app, clique sur **Settings**
7. Note quelque part ton **Client ID** et ton **Client Secret** (bouton *View client secret*)

---

## Étape 2 — Récupérer ton token Discord

> ⚠ Ton token Discord donne un accès complet à ton compte. Ne le partage **jamais**.

1. Ouvre Discord dans ton **navigateur** (pas l'application de bureau)
2. Appuie sur `F12` pour ouvrir les DevTools
3. Va dans l'onglet **Réseau** (Network)
4. Dans la barre de filtre, tape `api`
5. Clique sur n'importe quel channel ou serveur pour générer une requête
6. Clique sur une requête vers `discord.com/api/...` dans la liste
7. Ouvre l'onglet **En-têtes** (Headers) → section **En-têtes de la requête**
8. Copie la valeur du champ **`authorization`** (commence par `MT...` ou similaire)

---

## Étape 3 — Installer sur le Raspberry Pi

### Cloner le projet

```bash
git clone https://github.com/totolford/lyrics-status-Best-raspberry.git ~/lyrics-status
cd ~/lyrics-status/raspberry
```

### Méthode rapide (script automatique)

```bash
chmod +x install.sh
./install.sh
```

Le script va :
- Vérifier/installer Python 3 et pip
- Installer les dépendances Python
- Créer `config.json` depuis le template
- Configurer le service systemd (démarrage automatique)

### Méthode manuelle

```bash
pip3 install --user -r requirements.txt
cp config.example.json config.json
```

---

## Étape 4 — Configurer config.json

Ouvre le fichier :

```bash
nano config.json
```

Remplis les champs :

```json
{
  "spotify": {
    "client_id":     "abc123...",
    "client_secret": "def456..."
  },
  "discord": {
    "token": "ton.token.discord"
  },
  "settings": {
    "send_time_offset_ms":     500,
    "spotify_poll_interval_s": 5,
    "censor_words": []
  }
}
```

| Champ | Description |
|---|---|
| `client_id` | Client ID de ton app Spotify Developer |
| `client_secret` | Client Secret de ton app Spotify Developer |
| `token` | Ton token Discord |
| `send_time_offset_ms` | Décalage d'envoi en ms (par défaut 500) |
| `spotify_poll_interval_s` | Fréquence d'appel à l'API Spotify en secondes (par défaut 5) |
| `censor_words` | Liste de mots à censurer (ex: `["mot1", "mot2"]`) |

Sauvegarde avec `Ctrl+O`, quitte avec `Ctrl+X`.

---

## Étape 5 — Authentification Spotify (une seule fois)

Cette étape génère le fichier `spotify_token.json` qui permet au daemon de rester connecté indéfiniment.

```bash
python3 auth.py
```

Le script affiche une URL. Voici la procédure (fonctionne sur Pi headless comme sur PC) :

1. Copie l'URL affichée dans le terminal
2. Ouvre-la dans un navigateur (ton PC, ton téléphone, peu importe)
3. Connecte-toi à Spotify et accepte les permissions
4. Tu seras redirigé vers **example.com** — la page se charge normalement
5. Copie l'URL complète depuis la barre d'adresse (elle ressemble à `https://example.com/?code=AQ...`)
6. Colle-la dans le terminal et appuie sur Entrée

Un fichier `spotify_token.json` est créé. Le daemon peut maintenant démarrer.

---

## Étape 6 — Lancer le daemon

### Test rapide (manuel)

```bash
python3 lyrics_status.py
```

Tu dois voir des logs comme :

```
=== Lyrics Status (Raspberry) démarré ===
[CHANSON] Bohemian Rhapsody — Queen
[PAROLES] ✓ 68 lignes (synced)
  → Is this the real life?
  → Is this just fantasy?
```

Arrête avec `Ctrl+C`.

### Démarrage comme service (permanent)

```bash
# Démarrer
sudo systemctl start lyrics-status

# Vérifier le statut
sudo systemctl status lyrics-status

# Voir les logs en direct
sudo journalctl -u lyrics-status -f

# Arrêter
sudo systemctl stop lyrics-status

# Désactiver le démarrage automatique
sudo systemctl disable lyrics-status
```

Le service démarre automatiquement à chaque boot du Pi.

---

## Dépannage

### `spotify_token.json introuvable`
Lance `python3 auth.py` pour générer le fichier.

### `config.json introuvable`
```bash
cp config.example.json config.json
nano config.json
```

### Token Discord invalide (erreur 401)
Ton token Discord a expiré. Recommence l'étape 2 pour en obtenir un nouveau, puis mets à jour `config.json`.

### Paroles non trouvées (✗)
Certaines chansons ne sont pas dans la base de données [lrclib.net](https://lrclib.net). Il n'existe pas de contournement.

### Le statut ne se met plus à jour
- Vérifie que Spotify est bien en train de jouer (`is_playing: true`)
- Vérifie les logs : `sudo journalctl -u lyrics-status -f`
- Le token Spotify se rafraîchit automatiquement — si ça échoue, vérifie `client_id` et `client_secret`

### Trop de requêtes API Spotify (rate limit)
Augmente `spotify_poll_interval_s` dans `config.json` (ex: `10`).

---

## Structure des fichiers

```
raspberry/
├── lyrics_status.py        ← daemon principal
├── auth.py                 ← authentification Spotify (1 seule fois)
├── config.example.json     ← template de configuration
├── config.json             ← ta config (ignorée par git)
├── spotify_token.json      ← tokens Spotify (ignoré par git)
├── requirements.txt        ← dépendances Python
├── lyrics-status.service   ← service systemd
├── install.sh              ← script d'installation
└── .gitignore
```

---

## Différences avec le userscript navigateur

| | Userscript (navigateur) | Daemon Raspberry Pi |
|---|---|---|
| **Plateforme** | Browser sur open.spotify.com | N'importe quel appareil |
| **Token Spotify** | Capturé depuis le web player | OAuth2 officiel |
| **Paroles** | lrclib.net | lrclib.net (identique) |
| **Discord** | API Discord | API Discord (identique) |
| **Démarrage** | Manuel (bouton dans l'UI) | Automatique au boot |
| **Interface** | Panneau graphique in-browser | Logs terminal / journald |
