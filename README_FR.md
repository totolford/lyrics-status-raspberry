<p align="center">
  <img src="img/Logo.png" width="90" alt="Lyrics Status">
</p>

<h1 align="center">Lyrics Status — Raspberry Pi</h1>

<p align="center">
  Synchronise ton statut personnalisé Discord avec les paroles en temps réel de la chanson que tu écoutes sur Spotify.<br>
  Fonctionne avec <strong>n'importe quel appareil de lecture</strong> — téléphone, appli bureau, console, TV connectée.
</p>

---

> **Spotify Premium requis.** Les paroles synchronisées sont une fonctionnalité réservée aux abonnés Premium.

---

> **Avertissement :** Ce projet est fourni "tel quel". Les auteurs ne sont pas responsables des conséquences liées à son utilisation, notamment d'éventuelles actions de Discord ou Spotify sur ton compte. **Utilisation à tes propres risques.**

---

## ⚠ Avertissement — Token Discord

> Ton token Discord donne un **accès total à ton compte** — messages, amis, serveurs, paiements.
> **Ne le partage jamais avec personne. Ne le colle jamais en public. Ne le commit jamais dans un dépôt.**
>
> Si tu penses que ton token a été compromis, **change ton mot de passe Discord immédiatement** — cela invalide tous les tokens existants.
>
> Ce projet utilise uniquement ton token pour mettre à jour ton statut personnalisé via l'API officielle de Discord. Le token est stocké localement sur ta machine et n'est envoyé nulle part ailleurs.

---

## Aperçu

<video src="https://github.com/user-attachments/assets/cf11d226-cd3a-4393-91d5-4e2305ad6caa" controls width="700"></video>

---

## Version navigateur vs version Raspberry Pi

Ce projet est un fork du userscript navigateur original [OvalQuilter/lyrics-status](https://github.com/OvalQuilter/lyrics-status), réécrit en daemon Raspberry Pi autonome.

| | [Userscript navigateur](https://github.com/OvalQuilter/lyrics-status) | [Daemon Raspberry Pi](https://github.com/totolford/lyrics-status-Best-raspberry) |
|---|---|---|
| **Appareil de lecture** | Doit écouter via le **web player** Spotify | N'importe quel appareil (téléphone, app, console, TV…) |
| **Fluidité** | Bonne | **Plus fluide** — paroles pré-téléchargées, pas de jitter |
| **Paroles au début d'une chanson** | ~1–3s de délai | **Instantané** (pré-téléchargé depuis la file d'attente) |
| **Toujours actif** | Seulement si l'onglet navigateur est ouvert | **Toujours actif** — fonctionne comme un service système |
| **Installation** | Installer Tampermonkey, coller le script | Configuration unique, ensuite entièrement automatique |
| **Interface** | Panneau graphique dans le navigateur | Logs terminal / `journalctl` |
| **Token Spotify** | Capturé automatiquement depuis le web player | OAuth2 — autorisation unique |
| **Matériel requis** | Aucun (utilise ton PC) | Raspberry Pi (n'importe quel modèle) |
| **Censure automatique** | ✓ | ✓ |
| **Détection des pauses instrumentales** | ✓ | ✓ |
| **Découpage des longues paroles** | ✓ | ✓ |

**En résumé :** si tu as un Raspberry Pi, cette version est nettement plus fluide et fiable — elle fonctionne peu importe l'appareil sur lequel tu écoutes ta musique.

---

## Fonctionnalités

- Statut Discord mis à jour en temps réel avec la parole en cours
- Paroles récupérées depuis **[lrclib.net](https://lrclib.net)** (gratuit, sans compte)
- Paroles synchronisées (timestamps LRC) et non-synchronisées (texte brut, répartition uniforme)
- **Pré-télécharge les paroles des 5 prochaines chansons** en file d'attente — aucun délai au début de chaque chanson
- Cache de paroles — une chanson déjà vue se charge instantanément (jusqu'à 200 entrées)
- Les paroles trop longues sont automatiquement coupées en deux parties pour plus de lisibilité
- Les pauses instrumentales sont détectées et affichées comme `♪ ♪ ♪` sur Discord
- **Formats de statut :**
  - En lecture avec paroles : `"𝘵𝘦𝘹𝘵𝘦 𝘥𝘦𝘴 𝘱𝘢𝘳𝘰𝘭𝘦𝘴"` (italique Unicode)
  - En lecture sans paroles : `♪ 𝘛𝘪𝘵𝘳𝘦 — 𝘈𝘳𝘵𝘪𝘴𝘵𝘦 ♪`
  - Pause instrumentale : `♪ ♪ ♪`
  - Recherche de paroles : `🔍 𝘛𝘪𝘵𝘳𝘦 — 𝘈𝘳𝘵𝘪𝘴𝘵𝘦`
  - En pause : `⏸ En pause`
  - Rien en cours : `Connecté`
- Liste de censure intégrée (FR + EN, 800+ mots de LDNOOBW) + mots personnalisés
- Tourne 24h/24 en tant que **service systemd** — démarre automatiquement au boot, résiste à la fermeture du terminal
- OAuth2 Spotify officiel — le token se rafraîchit automatiquement, n'expire jamais

---

## Installation

> Compatible avec Raspberry Pi Zero 2W, 3, 4, 5 — Raspberry Pi OS Lite ou Desktop.

### Étape 1 — Créer une application Spotify Developer

1. Va sur [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Connecte-toi avec ton compte Spotify
3. Clique sur **Create App** et remplis :
   - **App name :** `Lyrics Status` (ou ce que tu veux)
   - **Redirect URIs :** `https://example.com` ← **copie exactement ça**
   - **APIs used :** coche `Web API`
4. Clique sur **Save**, puis va dans **Settings**
5. Note ton **Client ID** et ton **Client Secret** (bouton *View client secret*)

### Étape 2 — Récupérer ton token Discord

> ⚠ **Ne partage jamais ce token. Ne le commit jamais. Il donne un accès total à ton compte.**

1. Ouvre Discord dans ton **navigateur** (pas l'application de bureau)
2. Appuie sur `F12` → onglet **Réseau** (Network)
3. Tape `api` dans la barre de filtre
4. Clique sur n'importe quel channel ou serveur
5. Clique sur une requête vers `discord.com/api/...`
6. Ouvre **En-têtes** → **En-têtes de la requête**
7. Copie la valeur du champ **`authorization`**

### Étape 3 — Cloner le projet sur le Pi

```bash
git clone https://github.com/totolford/lyrics-status-Best-raspberry.git ~/lyrics-status
cd ~/lyrics-status/raspberry
```

### Étape 4 — Lancer le script d'installation

```bash
chmod +x install.sh
./install.sh
```

Ce script : installe les dépendances Python dans un environnement virtuel, crée `config.json` depuis le template, et enregistre le service systemd.

### Étape 5 — Remplir config.json

```bash
nano config.json
```

```json
{
  "spotify": {
    "client_id":     "TON_CLIENT_ID",
    "client_secret": "TON_CLIENT_SECRET"
  },
  "discord": {
    "token": "TON_TOKEN_DISCORD"
  },
  "settings": {
    "send_time_offset_ms":     500,
    "spotify_poll_interval_s": 5,
    "censor_words": []
  }
}
```

Sauvegarde avec `Ctrl+O`, quitte avec `Ctrl+X`.

| Champ | Description |
|---|---|
| `client_id` | Client ID de ton app Spotify Developer |
| `client_secret` | Client Secret de ton app Spotify Developer |
| `token` | Ton token Discord |
| `send_time_offset_ms` | Décalage d'envoi en ms (défaut 500) |
| `spotify_poll_interval_s` | Fréquence d'appel à l'API Spotify en secondes (défaut 5) |
| `censor_words` | Mots supplémentaires à censurer, ex. `["mot1", "mot2"]` |

### Étape 6 — Authentification Spotify (une seule fois)

```bash
venv/bin/python3 auth.py
```

1. Copie l'URL affichée dans le terminal
2. Ouvre-la dans n'importe quel navigateur (PC, téléphone…)
3. Connecte-toi à Spotify et accepte les permissions
4. Tu seras redirigé vers **example.com** — la page se charge normalement
5. Copie l'URL complète depuis la barre d'adresse (ressemble à `https://example.com/?code=AQ...`)
6. Colle-la dans le terminal et appuie sur Entrée

Un fichier `spotify_token.json` est créé. Le daemon peut maintenant démarrer.

### Étape 7 — Lancer le daemon

**Test rapide (manuel, affiche les logs en direct) :**
```bash
venv/bin/python3 lyrics_status.py
```

Tu dois voir :
```
=== Lyrics Status (Raspberry) démarré ===
[CHANSON] Bohemian Rhapsody — Queen
[PAROLES] ✓ 68 lignes (synced, lrclib)
[PREFETCH] 5 chanson(s) en file d'attente...
  [PREFETCH] Don't Stop Me Now — Queen : ✓ (synced)
  → Is this the real life?
```

Arrête avec `Ctrl+C`.

**En tant que service permanent (résiste à la fermeture du terminal et aux reboots) :**
```bash
sudo systemctl start lyrics-status
sudo systemctl status lyrics-status
```

**Commandes utiles :**
```bash
sudo journalctl -u lyrics-status -f   # logs en direct
sudo systemctl stop lyrics-status     # arrêter
sudo systemctl restart lyrics-status  # redémarrer
sudo systemctl disable lyrics-status  # désactiver le démarrage auto
```

### Mettre à jour

```bash
cd ~/lyrics-status
git pull
sudo systemctl restart lyrics-status
```

---

## Dépannage

| Problème | Solution |
|---|---|
| `spotify_token.json introuvable` | Lance `venv/bin/python3 auth.py` |
| `config.json introuvable` | Lance `cp config.example.json config.json` puis remplis-le |
| Erreur Discord 401 | Token expiré — récupère-en un nouveau (Étape 2) et mets à jour `config.json` |
| Paroles introuvables (✗) | Chanson absente de la base lrclib.net — aucun contournement |
| Statut ne se met plus à jour | Vérifie `sudo journalctl -u lyrics-status -f` |
| Rate limit Spotify | Augmente `spotify_poll_interval_s` à `10` dans `config.json` |

---

## Structure des fichiers

```
lyrics-status-Best-raspberry/
├── img/
│   ├── Logo.png
│   └── ExRaspberry.mp4
├── README.md                   ← version anglaise
├── README_FR.md                ← ce fichier
└── raspberry/
    ├── lyrics_status.py        ← daemon (boucle principale)
    ├── auth.py                 ← OAuth2 Spotify (une seule fois)
    ├── config.example.json     ← template de config (sans secrets)
    ├── config.json             ← ta config (ignorée par git)
    ├── spotify_token.json      ← tokens Spotify (ignoré par git)
    ├── requirements.txt        ← dépendances Python
    ├── lyrics-status.service   ← fichier de service systemd
    ├── install.sh              ← script d'installation automatique
    └── .gitignore
```

---

*Fork de [OvalQuilter/lyrics-status](https://github.com/OvalQuilter/lyrics-status) — réécrit en daemon Raspberry Pi avec l'API Web Spotify, paroles via lrclib.net, et intégration systemd.*

*Cette version a été développée avec l'aide de l'IA (Claude) et entièrement relue et retravaillée par un humain.*
