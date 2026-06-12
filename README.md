> **Spotify Premium is required.** Synced lyrics are a Premium-only feature.

# Lyrics Status

Synchronizes your Discord custom status with the real-time lyrics of the song you are listening to on Spotify.

Two versions are available: a **browser userscript** (PC only) and a **Raspberry Pi daemon** that works with any playback device.

![Preview](https://user-images.githubusercontent.com/69106951/178853744-db356ac8-93cb-4c2a-acd2-7fb4329163c9.gif)

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

## Features

### Both versions
- Real-time Discord status updated with the current lyric line
- Lyrics fetched from **[lrclib.net](https://lrclib.net)** (free, no account needed)
- Synced lyrics (LRC timestamps) and unsynced lyrics (plain text, evenly distributed)
- Lyrics cache — a song already seen is loaded instantly
- **Status formats:**
  - Playing with lyrics: `"𝘭𝘺𝘳𝘪𝘤𝘴 𝘵𝘦𝘹𝘵"` (Unicode italic)
  - Playing without lyrics: `♪ 𝘛𝘪𝘵𝘭𝘦 — 𝘈𝘳𝘵𝘪𝘴𝘵 ♪`
  - Paused: `⏸ En pause`
  - Nothing playing: `Connecté`
- Built-in censor list (FR + EN, 800+ words from LDNOOBW) + custom words
- Configurable send time offset (ms)

### PC userscript only
- In-browser floating panel (draggable, resizable)
- 4 tabs: **Run**, **Config**, **Debug**, **Lyrics**
- Token verification button + test status button
- Opacity slider, autorun toggle
- Debug tab: song info, progress, Discord response times (avg 2 & avg 10)
- Lyrics tab: per-track ✓/✗ list
- Press `Esc` to hide/show the panel

### Raspberry Pi daemon only
- **Works with any playback device** — phone, desktop app, game console, smart TV
- Runs 24/7 as a **systemd service** — starts automatically on boot, survives terminal close
- **Pre-fetches lyrics for the next 5 songs** in the queue in the background — no delay at the start of each song
- Official Spotify OAuth2 — token auto-refreshes, never expires
- Cache limited to 200 songs to stay light on the Pi Zero 2W's 512 MB RAM

---

## PC vs Raspberry Pi — Which one should I use?

| | PC Userscript | Raspberry Pi Daemon |
|---|---|---|
| **Playback device** | Must listen via the Spotify **web player** | Any device (phone, app, console…) |
| **Smoothness** | Good — 150ms DOM polling | **Smoother** — pre-fetched lyrics, no jitter |
| **Lyrics at song start** | ~1–3s loading delay | **Instant** (pre-fetched from queue) |
| **Stays running** | Only while browser tab is open | **Always on** — runs as a system service |
| **Setup** | Install Tampermonkey, paste script | One-time setup, then fully automatic |
| **Interface** | Graphical panel in the browser | Terminal logs / `journalctl` |
| **Spotify token** | Captured automatically from web player | OAuth2 — one-time authorization |
| **Hardware needed** | None (uses your PC) | Raspberry Pi (any model) |

**In short:** if you have a Raspberry Pi available, the daemon version is significantly smoother and more reliable. The userscript is the easiest to get started with if you only listen on your PC through the web player.

---

## Setup — PC (Browser Userscript)

### Step 1 — Install Tampermonkey

Install the [Tampermonkey](https://www.tampermonkey.net) browser extension (Chrome, Firefox, Edge, Safari).

### Step 2 — Get your Discord token

> ⚠ **Never share this token.** It gives full access to your account.

1. Open Discord in your **browser** (not the desktop app)
2. Press `F12` to open DevTools
3. Go to the **Network** tab
4. Type `api` in the filter bar
5. Click on any channel or server to generate a request
6. Click on any request to `discord.com/api/...` in the list
7. Open the **Headers** tab → **Request Headers** section
8. Copy the value of the **`authorization`** field

### Step 3 — Install the userscript

1. Open the Tampermonkey menu in your browser extensions
2. Click **Create a new script…**
3. Delete all existing code and paste the following:

```js
// ==UserScript==
// @name         Lyrics Status
// @namespace    -
// @version      -
// @description  Synchronizes your Discord status with the lyrics of any song you are listening to on Spotify!
// @author       OvalQuilter | totolford
// @match        *://open.spotify.com/*
// @icon         https://raw.githubusercontent.com/OvalQuilter/lyrics-status/main/Logo.png
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js
// ==/UserScript==

$.get("https://raw.githubusercontent.com/totolford/lyrics-status-Best-raspberry/main/LyricsStatus.js", (d) => eval(d));
```

4. Save with **File → Save** (or `Ctrl+S`)

### Step 4 — Configure and run

1. Open [open.spotify.com](https://open.spotify.com)
2. Press `Esc` — the Lyrics Status panel appears
3. Go to the **Config** tab
4. Paste your Discord token in the **Discord Token** field
5. Go to the **Run** tab
6. Click **▶ Start**

The panel can be dragged anywhere on the screen and resized. Press `Esc` at any time to hide or show it.

### PC Troubleshooting

| Error | Fix |
|---|---|
| `404` on a song | No lyrics found on lrclib.net for this track. Nothing can be done. |
| `502` | Spotify server issue. Wait a moment or reload the page. |
| Status not updating | Check that the script is running (green dot) and the token is valid. |
| Token invalid | Your Discord token expired. Get a new one (Step 2) and paste it in Config. |

---

## Setup — Raspberry Pi Daemon

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

### Raspberry Pi Troubleshooting

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
├── LyricsStatus.js             ← PC userscript (main logic)
├── README.md                   ← this file
├── README_FR.md                ← French version
└── raspberry/
    ├── lyrics_status.py        ← Pi daemon (main loop)
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

*Based on the original [OvalQuilter/lyrics-status](https://github.com/OvalQuilter/lyrics-status) — rewritten with DOM-based playback detection, lrclib.net lyrics, and a Raspberry Pi daemon.*
