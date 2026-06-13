<p align="center">
  <img src="img/Logo.png" width="90" alt="Lyrics Status">
</p>

<h1 align="center">Lyrics Status — Raspberry Pi</h1>

<p align="center">
  Synchronizes your Discord custom status with the real-time lyrics of the song you are listening to on Spotify.<br>
  Works with <strong>any playback device</strong> — phone, desktop app, game console, smart TV.
</p>

---

> **Spotify Premium is required.** Synced lyrics are a Premium-only feature.

---

> **Disclaimer:** This project is provided "as is". The authors are not responsible for any consequences resulting from its use, including potential account actions from Discord or Spotify. **Use at your own risk.**

---

## ⚠ Discord Token Warning

> Your Discord token gives **full access to your account** — messages, friends, servers, payments.
> **Never share it with anyone. Never paste it in public. Never commit it to a repository.**
>
> If you believe your token has been leaked, **change your Discord password immediately** — this invalidates all existing tokens.
>
> This project only uses your token to update your custom status via Discord's official API. The token is stored locally on your machine and never sent anywhere else.

---

## Preview

<video src="https://github.com/user-attachments/assets/cf11d226-cd3a-4393-91d5-4e2305ad6caa" controls width="700"></video>

---

## Browser version vs Raspberry Pi version

This project is a fork of the original [OvalQuilter/lyrics-status](https://github.com/OvalQuilter/lyrics-status) browser userscript, rewritten as a standalone Raspberry Pi daemon.

| | [Browser userscript](https://github.com/OvalQuilter/lyrics-status) | [Raspberry Pi daemon](https://github.com/totolford/lyrics-status-Best-raspberry) |
|---|---|---|
| **Playback device** | Must listen via the Spotify **web player** | Any device (phone, app, console, TV…) |
| **Smoothness** | Good | **Smoother** — pre-fetched lyrics, no jitter |
| **Lyrics at song start** | ~1–3s loading delay | **Instant** (pre-fetched from queue) |
| **Stays running** | Only while the browser tab is open | **Always on** — runs as a system service |
| **Setup** | Install Tampermonkey, paste script | One-time setup, then fully automatic |
| **Interface** | Graphical panel in the browser | Terminal logs / `journalctl` |
| **Spotify token** | Captured automatically from web player | OAuth2 — one-time authorization |
| **Hardware needed** | None (uses your PC) | Raspberry Pi (any model) |
| **Auto-censor** | ✓ | ✓ |
| **Instrumental gap detection** | ✓ | ✓ |
| **Long line splitting** | ✓ | ✓ |

**In short:** if you have a Raspberry Pi, this version is significantly smoother and more reliable — it works regardless of which device is playing the music.

---

## Features

- Real-time Discord status updated with the current lyric line
- Lyrics fetched from **[lrclib.net](https://lrclib.net)** (free, no account needed)
- Synced lyrics (LRC timestamps) and unsynced lyrics (plain text, evenly distributed)
- **Pre-fetches lyrics for the next 5 songs** in the queue — no delay at the start of each song
- Lyrics cache — a song already seen loads instantly (up to 200 entries)
- Long lyric lines automatically split into two parts for readability
- Instrumental gaps detected and shown as `♪ ♪ ♪` on Discord
- **Status formats:**
  - Playing with lyrics: `"𝘭𝘺𝘳𝘪𝘤𝘴 𝘵𝘦𝘹𝘵"` (Unicode italic)
  - Playing without lyrics: `♪ 𝘛𝘪𝘵𝘭𝘦 — 𝘈𝘳𝘵𝘪𝘴𝘵 ♪`
  - Instrumental section: `♪ ♪ ♪`
  - Searching for lyrics: `🔍 𝘛𝘪𝘵𝘭𝘦 — 𝘈𝘳𝘵𝘪𝘴𝘵`
  - Paused: `⏸ En pause`
  - Nothing playing: `Connecté`
- Built-in censor list (FR + EN, 800+ words from LDNOOBW) + custom words
- Runs 24/7 as a **systemd service** — starts automatically on boot, survives terminal close
- Official Spotify OAuth2 — token auto-refreshes, never expires

---

## Setup

> Compatible with Raspberry Pi Zero 2W, 3, 4, 5 — Raspberry Pi OS Lite or Desktop.

### Step 1 — Create a Spotify Developer App

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click **Create App** and fill in:
   - **App name:** `Lyrics Status` (or anything)
   - **Redirect URIs:** `https://example.com` ← copy this exactly
   - **APIs used:** check `Web API`
4. Click **Save**, then go to **Settings**
5. Copy your **Client ID** and **Client Secret** (click *View client secret*)

### Step 2 — Get your Discord token

> ⚠ **Never share this token. Never commit it. It gives full access to your account.**

1. Open Discord in your **browser** (not the desktop app)
2. Press `F12` → go to the **Network** tab
3. Type `api` in the filter bar
4. Click on any channel or server
5. Click on any request to `discord.com/api/...`
6. Open **Headers** → **Request Headers**
7. Copy the value of the **`authorization`** field

### Step 3 — Clone the project on the Pi

```bash
git clone https://github.com/totolford/lyrics-status-Best-raspberry.git ~/lyrics-status
cd ~/lyrics-status/raspberry
```

### Step 4 — Run the installer

```bash
chmod +x install.sh
./install.sh
```

This will: install Python dependencies in a virtual environment, create `config.json` from the template, and register the systemd service.

### Step 5 — Fill in config.json

```bash
nano config.json
```

```json
{
  "spotify": {
    "client_id":     "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET"
  },
  "discord": {
    "token": "YOUR_DISCORD_TOKEN"
  },
  "settings": {
    "send_time_offset_ms":     500,
    "spotify_poll_interval_s": 5,
    "censor_words": []
  }
}
```

Save with `Ctrl+O`, exit with `Ctrl+X`.

| Field | Description |
|---|---|
| `client_id` | Spotify Developer App Client ID |
| `client_secret` | Spotify Developer App Client Secret |
| `token` | Your Discord token |
| `send_time_offset_ms` | Send offset in ms (default 500) |
| `spotify_poll_interval_s` | How often to poll Spotify API in seconds (default 5) |
| `censor_words` | Extra words to censor, e.g. `["word1", "word2"]` |

### Step 6 — Authenticate with Spotify (one time only)

```bash
venv/bin/python3 auth.py
```

1. Copy the URL shown in the terminal
2. Open it in any browser (PC, phone…)
3. Log in to Spotify and accept the permissions
4. You will be redirected to **example.com** — the page loads normally
5. Copy the full URL from the address bar (looks like `https://example.com/?code=AQ...`)
6. Paste it in the terminal and press Enter

A `spotify_token.json` file is created. The daemon can now start.

### Step 7 — Start the daemon

**Quick test (manual, shows live logs):**
```bash
venv/bin/python3 lyrics_status.py
```

You should see:
```
=== Lyrics Status (Raspberry) started ===
[SONG] Bohemian Rhapsody — Queen
[LYRICS] ✓ 68 lines (synced, lrclib)
[PREFETCH] 5 song(s) in queue...
  [PREFETCH] Don't Stop Me Now — Queen : ✓ (synced)
  → Is this the real life?
```

Stop with `Ctrl+C`.

**As a permanent service (survives terminal close and reboots):**
```bash
sudo systemctl start lyrics-status
sudo systemctl status lyrics-status
```

**Useful service commands:**
```bash
sudo journalctl -u lyrics-status -f   # live logs
sudo systemctl stop lyrics-status     # stop
sudo systemctl restart lyrics-status  # restart
sudo systemctl disable lyrics-status  # disable autostart
```

### Update

```bash
cd ~/lyrics-status
git pull
sudo systemctl restart lyrics-status
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `spotify_token.json not found` | Run `venv/bin/python3 auth.py` |
| `config.json not found` | Run `cp config.example.json config.json` then fill it in |
| Discord 401 error | Token expired — get a new one (Step 2) and update `config.json` |
| Lyrics not found (✗) | Song not in lrclib.net database — no workaround |
| Status stops updating | Check `sudo journalctl -u lyrics-status -f` for errors |
| Spotify rate limit | Increase `spotify_poll_interval_s` to `10` in `config.json` |

---

## File Structure

```
lyrics-status-Best-raspberry/
├── img/
│   ├── Logo.png
│   └── ExRaspberry.mp4
├── README.md                   ← this file
├── README_FR.md                ← French version
└── raspberry/
    ├── lyrics_status.py        ← daemon (main loop)
    ├── auth.py                 ← Spotify OAuth2 (one time)
    ├── config.example.json     ← config template (no secrets)
    ├── config.json             ← your config (git-ignored)
    ├── spotify_token.json      ← Spotify tokens (git-ignored)
    ├── requirements.txt        ← Python dependencies
    ├── lyrics-status.service   ← systemd unit file
    ├── install.sh              ← automated installer
    └── .gitignore
```

---

*Fork of [OvalQuilter/lyrics-status](https://github.com/OvalQuilter/lyrics-status) — rewritten as a Raspberry Pi daemon with Spotify Web API, lrclib.net lyrics, and systemd integration.*

*Developed with AI assistance (Claude) and fully reviewed and reworked by a human.*
