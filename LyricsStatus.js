// ==UserScript==
// @name         Lyrics Status V2
// @namespace    -
// @version      -
// @description  Script for changing your status as lyrics of currently playing song!
// @author       OvalQuilter | OQ project
// @match        *://open.spotify.com/*
// @icon         https://raw.githubusercontent.com/OvalQuilter/lyrics-status/main/Logo.png
// @grant        none
// @run-at       document-start
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js
// ==/UserScript==

let accessToken = null;

function _captureToken(raw) {
    if (raw && raw.startsWith('Bearer ') && raw !== 'Bearer null') accessToken = raw.slice(7);
}
function _captureTokenResponse(data) {
    if (data && data.accessToken && data.accessToken !== 'null' && !data.isAnonymous) accessToken = data.accessToken;
}

(function() {
    const _fetch = window.fetch;
    window.fetch = function(url, init) {
        if (url instanceof Request) _captureToken(url.headers.get('authorization'));
        if (init && init.headers) {
            _captureToken(init.headers instanceof Headers
                ? init.headers.get('authorization')
                : (init.headers['authorization'] || init.headers['Authorization']));
        }
        const result = _fetch.apply(this, arguments);
        const urlStr = typeof url === 'string' ? url : (url instanceof Request ? url.url : '');
        if (urlStr.includes('get_access_token')) {
            result.then(r => r.clone().json().then(_captureTokenResponse).catch(() => {})).catch(() => {});
        }
        return result;
    };
    const _setHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        if (name.toLowerCase() === 'authorization') _captureToken(value);
        return _setHeader.call(this, name, value);
    };
    if (navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener('message', function(event) {
            try {
                const data = event.data;
                if (!data) return;
                const str = typeof data === 'string' ? data : JSON.stringify(data);
                const m = str.match(/"(?:accessToken|access_token)"\s*:\s*"(BQ[^"]+)"/);
                if (m) _captureToken('Bearer ' + m[1]);
                else if (data.accessToken && !data.isAnonymous) _captureToken('Bearer ' + data.accessToken);
            } catch(e) {}
        });
    }
})();

$(function() {

// ── HTML ────────────────────────────────────────────────────────────────────

$(`
<div id="ls-panel">
  <div id="ls-header">
    <div id="ls-header-left">
      <span id="ls-dot" class="dot-off"></span>
      <span id="ls-title">Lyrics Status</span>
    </div>
    <button id="ls-hide" title="Masquer (Esc)">✕</button>
  </div>
  <div id="ls-tabs">
    <button class="ls-tab ls-active" data-tab="run">Run</button>
    <button class="ls-tab" data-tab="config">Config</button>
    <button class="ls-tab" data-tab="debug">Debug</button>
    <button class="ls-tab" data-tab="paroles">Paroles</button>
  </div>
  <div id="ls-body">

    <div id="tab-run" class="ls-page">
      <div id="ls-card">
        <div id="ls-card-track">—</div>
        <div id="ls-card-lyric">En attente...</div>
      </div>
      <div id="ls-log"></div>
      <div id="ls-btns">
        <button id="ls-start">▶ Démarrer</button>
        <button id="ls-stop">■ Arrêter</button>
      </div>
    </div>

    <div id="tab-config" class="ls-page ls-hid">
      <div class="cf-field">
        <div class="cf-label">Token Discord</div>
        <div class="cf-row">
          <input type="password" id="cf-token" placeholder="Coller le token ici..." autocomplete="off">
          <button id="cf-check">Vérifier</button>
        </div>
      </div>
      <div class="cf-field">
        <div class="cf-label">Offset envoi (ms)</div>
        <input type="number" id="cf-offset" value="500" min="0" max="2000">
      </div>
      <div class="cf-field cf-row cf-inline">
        <div class="cf-label" style="margin:0">Démarrage automatique</div>
        <label class="cf-toggle"><input type="checkbox" id="cf-autorun"><span class="cf-slider"></span></label>
      </div>
      <div class="cf-field">
        <div class="cf-label">Opacité — <span id="cf-opacity-val">90</span>%</div>
        <input type="range" id="cf-opacity" min="50" max="100" value="90">
      </div>
      <div class="cf-field">
        <div class="cf-label">
          Mots censurés supplémentaires <span class="cf-hint">(un par ligne)</span>
        </div>
        <textarea id="cf-censor" rows="3" placeholder="mot1&#10;mot2&#10;..."></textarea>
        <div id="cf-censor-status" class="cf-hint" style="margin-top:5px">Base en ligne : chargement...</div>
      </div>
      <div class="cf-field">
        <div class="cf-label">Test Discord</div>
        <button id="cf-test">Envoyer un statut test</button>
      </div>
    </div>

    <div id="tab-debug" class="ls-page ls-hid">
      <div class="db-grid">
        <div class="db-row"><span class="db-lbl">Chanson</span><span id="db-song" class="db-val">—</span></div>
        <div class="db-row"><span class="db-lbl">Progression</span><span id="db-prog" class="db-val">—</span></div>
        <div class="db-row"><span class="db-lbl">Paroles</span><span id="db-lyr" class="db-val">—</span></div>
        <div class="db-row"><span class="db-lbl">Discord</span><span id="db-disc" class="db-val">—</span></div>
        <div class="db-row"><span class="db-lbl">Moy. 2</span><span id="db-avg2" class="db-val">—</span></div>
        <div class="db-row"><span class="db-lbl">Moy. 10</span><span id="db-avg10" class="db-val">—</span></div>
      </div>
      <button id="db-copy">Copier les infos debug</button>
    </div>

    <div id="tab-paroles" class="ls-page ls-hid">
      <div id="par-list"></div>
    </div>

  </div>
</div>
<style>
  #ls-panel {
    position: fixed;
    display: flex; flex-direction: column;
    width: 360px; height: 420px;
    min-width: 240px; min-height: 200px;
    background: #15151e;
    border: 1px solid #28283a;
    border-radius: 14px;
    box-shadow: 0 16px 48px rgba(0,0,0,.75), 0 2px 8px rgba(0,0,0,.4);
    z-index: 99999;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-size: 12px;
    color: #c8c8d8;
    top: 50%; left: 50%;
    transform: translate(-50%,-50%);
    overflow: hidden;
    resize: both;
    transition: transform .2s cubic-bezier(.4,0,.2,1), opacity .2s;
  }
  #ls-panel.ls-gone {
    transform: translate(-50%,-50%) scale(.04) !important;
    opacity: 0 !important;
    pointer-events: none;
  }
  #ls-panel * { box-sizing: border-box; font-family: inherit; }
  #ls-panel button { cursor: pointer; }

  /* header */
  #ls-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 14px; height: 40px; flex-shrink: 0;
    background: #0e0e16;
    border-bottom: 1px solid #28283a;
    cursor: move; user-select: none;
  }
  #ls-header-left { display: flex; align-items: center; gap: 8px; }
  #ls-dot {
    width: 8px; height: 8px; border-radius: 50%;
    display: inline-block; transition: background .3s, box-shadow .3s; flex-shrink: 0;
  }
  .dot-off { background: #3a2a3a; }
  .dot-on  { background: #4cf090; box-shadow: 0 0 8px #4cf090aa; }
  #ls-title { font-size: 13px; font-weight: 600; color: #e8e8f4; letter-spacing: .2px; }
  #ls-hide {
    background: none; border: none; color: #444; font-size: 14px;
    padding: 0; width: 20px; height: 20px; line-height: 20px; text-align: center;
    border-radius: 4px; transition: color .15s, background .15s;
  }
  #ls-hide:hover { color: #e8e8f4; background: rgba(255,255,255,.08); }

  /* tabs */
  #ls-tabs {
    display: flex; flex-shrink: 0;
    background: #0e0e16;
    border-bottom: 1px solid #28283a;
  }
  .ls-tab {
    flex: 1; height: 34px; background: none;
    border: none; border-bottom: 2px solid transparent;
    color: #555; font-size: 11px; font-weight: 500;
    text-transform: uppercase; letter-spacing: .6px;
    transition: color .15s, border-color .15s, background .15s;
  }
  .ls-tab:hover { color: #c8c8d8; background: rgba(255,255,255,.03); }
  .ls-active { color: #818cf8 !important; border-bottom-color: #818cf8 !important; }

  /* body */
  #ls-body { flex: 1; overflow: hidden; min-height: 0; }
  .ls-page { height: 100%; overflow: hidden auto; padding: 12px; }
  .ls-hid  { display: none !important; }

  /* run tab */
  #ls-card {
    background: #1c1c2a; border: 1px solid #28283a; border-radius: 10px;
    padding: 12px 14px; margin-bottom: 10px;
  }
  #ls-card-track {
    font-size: 11px; color: #555; margin-bottom: 5px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  #ls-card-lyric { font-size: 14px; color: #e8e8f4; min-height: 20px; word-break: break-word; }
  #ls-log {
    background: #0e0e16; border: 1px solid #28283a; border-radius: 8px;
    height: 155px; overflow: hidden auto; padding: 8px 10px; margin-bottom: 10px;
    font-size: 11px; line-height: 1.6;
  }
  #ls-log > div { padding: 0; }
  #ls-btns { display: flex; gap: 8px; }
  #ls-start, #ls-stop {
    flex: 1; height: 34px; border: none; border-radius: 8px;
    font-size: 12px; font-weight: 600; cursor: pointer;
    transition: filter .15s, transform .1s;
  }
  #ls-start:active, #ls-stop:active { transform: scale(.97); }
  #ls-start { background: #1e3d2c; color: #5fe09a; border: 1px solid #2a5a3e; }
  #ls-stop  { background: #3d1e1e; color: #e05f5f; border: 1px solid #5a2a2a; }
  #ls-start:hover { filter: brightness(1.15); }
  #ls-stop:hover  { filter: brightness(1.15); }

  /* config tab */
  .cf-field { margin-bottom: 16px; }
  .cf-label { font-size: 10px; color: #555; margin-bottom: 6px; text-transform: uppercase; letter-spacing: .5px; }
  .cf-row { display: flex; align-items: center; gap: 8px; }
  .cf-inline { justify-content: space-between; align-items: center; }
  .cf-field input[type="password"],
  .cf-field input[type="number"],
  .cf-field input[type="text"] {
    width: 100%; background: #1c1c2a; border: 1px solid #28283a; border-radius: 8px;
    color: #c8c8d8; padding: 8px 12px; font-size: 12px; outline: none;
    transition: border-color .15s;
  }
  .cf-field input:focus { border-color: #818cf8; }
  .cf-field input[type="number"] { width: 90px; }
  #cf-check {
    background: #1c1c2a; border: 1px solid #28283a; border-radius: 8px;
    color: #818cf8; padding: 7px 14px; font-size: 12px; white-space: nowrap;
    transition: background .15s, border-color .15s;
  }
  #cf-check:hover { background: #252540; border-color: #818cf8; }
  #cf-test {
    width: 100%; height: 34px; background: #1c1c2a; border: 1px solid #28283a;
    border-radius: 8px; color: #818cf8; font-size: 12px;
    transition: background .15s, border-color .15s;
  }
  #cf-test:hover { background: #252540; border-color: #818cf8; }
  #cf-censor {
    width: 100%; background: #1c1c2a; border: 1px solid #28283a; border-radius: 8px;
    color: #c8c8d8; padding: 8px 10px; font-size: 12px; outline: none;
    resize: none; line-height: 1.6; font-family: inherit;
    transition: border-color .15s;
  }
  #cf-censor:focus { border-color: #818cf8; }
  .cf-hint { font-size: 9px; color: #444; text-transform: none; letter-spacing: 0; }
  input[type="range"] { width: 100%; accent-color: #818cf8; margin-top: 4px; }
  /* toggle switch */
  .cf-toggle { position: relative; display: inline-block; width: 38px; height: 22px; flex-shrink: 0; }
  .cf-toggle input { opacity: 0; width: 0; height: 0; }
  .cf-slider {
    position: absolute; inset: 0; background: #28283a; border-radius: 22px;
    cursor: pointer; transition: background .2s;
  }
  .cf-slider::before {
    content: ''; position: absolute; width: 16px; height: 16px; border-radius: 50%;
    background: #888; bottom: 3px; left: 3px; transition: transform .2s, background .2s;
  }
  .cf-toggle input:checked + .cf-slider { background: #3a3a7a; }
  .cf-toggle input:checked + .cf-slider::before { transform: translateX(16px); background: #818cf8; }

  /* debug tab */
  .db-grid { margin-bottom: 12px; }
  .db-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 6px 0; border-bottom: 1px solid #1c1c2a;
  }
  .db-lbl { color: #555; font-size: 11px; flex-shrink: 0; margin-right: 8px; }
  .db-val { color: #c8c8d8; font-size: 11px; max-width: 210px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; }
  #db-copy {
    width: 100%; height: 32px; background: #1c1c2a; border: 1px solid #28283a;
    border-radius: 8px; color: #555; font-size: 11px; transition: color .15s, background .15s;
  }
  #db-copy:hover { color: #c8c8d8; background: #222232; }

  /* paroles tab */
  .par-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 7px 0; border-bottom: 1px solid #1c1c2a; gap: 8px;
  }
  .par-title { font-size: 12px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #c8c8d8; }
  .par-ok { font-size: 12px; color: #4cf090; flex-shrink: 0; }
  .par-no { font-size: 12px; color: #f06040; flex-shrink: 0; }

  /* log colors */
  .lc-log  { color: #818cf8; }
  .lc-warn { color: #f0a050; }
  .lc-err  { color: #f06060; }
  .c-ok  { color: #4cf090 !important; }
  .c-mid { color: #f0a050 !important; }
  .c-bad { color: #f06060 !important; }
</style>
`).appendTo(document.body);

// ── ELEMENTS ────────────────────────────────────────────────────────────────

const panel        = $('#ls-panel');
const dot          = $('#ls-dot');
const startBtn     = $('#ls-start');
const stopBtn      = $('#ls-stop');
const logWindow    = $('#ls-log');
const cardTrack    = $('#ls-card-track');
const cardLyric    = $('#ls-card-lyric');
const cfToken      = $('#cf-token');
const cfCheck      = $('#cf-check');
const cfOffset     = $('#cf-offset');
const cfAutorun    = $('#cf-autorun');
const cfOpacity    = $('#cf-opacity');
const cfOpacityVal = $('#cf-opacity-val');
const cfCensor     = $('#cf-censor');
const dbSong       = $('#db-song');
const dbProg       = $('#db-prog');
const dbLyr        = $('#db-lyr');
const dbDisc       = $('#db-disc');
const dbAvg2       = $('#db-avg2');
const dbAvg10      = $('#db-avg10');
const dbCopy       = $('#db-copy');
const parList      = $('#par-list');

// ── SETTINGS ────────────────────────────────────────────────────────────────

let settings = {
    token: null,
    autorun: false,
    timings: { sendTimeOffset: 500 },
    style:   { opacity: 0.9 },
    censor:  []
};

// ── STATE ────────────────────────────────────────────────────────────────────

const lyricsCache = new Map();

let stopped          = true,
    startLog         = false,
    stopLog          = false,
    errorCount       = 0,
    waitingStatusSet = false,
    playbackState    = {
        trackName:          null,
        trackAuthor:        null,
        trackId:            null,
        trackDuration:      0,
        trackProgress:      0,
        lyrics:             [],
        currentLyrics:      null,
        hasLyrics:            false,
        lyricsLoading:        false,
        noLyricsStatusSent:   false,
        searchingStatusSent:  false,
        ended:                () => playbackState.trackProgress >= playbackState.trackDuration,
        isPlaying:            false
    },
    requestsHistory = [],
    consoleLogs     = [];

let builtinCensorList = [];
let _censorRegex      = null;

function rebuildCensorRegex() {
    const all = new Set([...builtinCensorList, ...(settings.censor || [])]);
    if (all.size === 0) { _censorRegex = null; return; }
    const parts = [...all]
        .map(w => w.trim())
        .filter(Boolean)
        .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    try {
        // Unicode-aware boundaries: lookahead/lookbehind covering accented Latin chars (À-ÿ)
        _censorRegex = new RegExp(
            '(?<![a-zA-ZÀ-ÿ0-9])(' + parts.join('|') + ')(?![a-zA-ZÀ-ÿ0-9])',
            'gi'
        );
    } catch(e) { _censorRegex = null; }
}

// ── DRAGGABLE ────────────────────────────────────────────────────────────────

(function() {
    const header = document.getElementById('ls-header');
    const el     = document.getElementById('ls-panel');
    let dragging = false, ox = 0, oy = 0;
    header.addEventListener('mousedown', function(e) {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
        dragging = true;
        const r = el.getBoundingClientRect();
        el.style.transition = 'none';
        el.style.transform  = 'none';
        el.style.left       = r.left + 'px';
        el.style.top        = r.top  + 'px';
        ox = e.clientX - r.left;
        oy = e.clientY - r.top;
        e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
        if (!dragging) return;
        el.style.left = (e.clientX - ox) + 'px';
        el.style.top  = (e.clientY - oy) + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
})();

// ── TABS ─────────────────────────────────────────────────────────────────────

$('.ls-tab').each((i, btn) => {
    $(btn).click(() => {
        $('.ls-tab').removeClass('ls-active');
        $(btn).addClass('ls-active');
        $('.ls-page').addClass('ls-hid');
        $('#tab-' + btn.dataset.tab).removeClass('ls-hid');
    });
});

// ── EVENTS ───────────────────────────────────────────────────────────────────

$(document).keyup(e => e.key === 'Escape' && panel.toggleClass('ls-gone'));
$('#ls-hide').click(() => panel.addClass('ls-gone'));

startBtn.click(() => {
    if (stopped) startLog = true;
    stopped = false;
    dot.attr('class', 'dot-on');
});
stopBtn.click(() => {
    if (!stopped) stopLog = true;
    stopped = true;
    dot.attr('class', 'dot-off');
});

cfToken.on('change', () => { settings.token = cfToken.val(); saveSettings(); });
cfCheck.click(() => {
    cfCheck.text('...').prop('disabled', true);
    const valid = checkToken(settings.token);
    cfCheck.text(valid ? '✓ Valide' : '✗ Invalide').css('color', valid ? '#4cf090' : '#f06060').prop('disabled', false);
    setTimeout(() => cfCheck.text('Vérifier').css('color', ''), 2500);
});
cfOffset.on('input', () => { settings.timings.sendTimeOffset = +cfOffset.val() || 500; saveSettings(); });
cfAutorun.on('change', () => { settings.autorun = cfAutorun.prop('checked'); saveSettings(); });
cfOpacity.on('input', () => {
    const v = cfOpacity.val();
    cfOpacityVal.text(v);
    settings.style.opacity = v / 100;
    panel.css('opacity', v / 100);
    saveSettings();
});
cfCensor.on('input', () => {
    settings.censor = cfCensor.val().split('\n').map(w => w.trim()).filter(Boolean);
    rebuildCensorRegex();
    saveSettings();
});
dbCopy.click(() => navigator.clipboard.writeText('`' + JSON.stringify({ playbackState, consoleLogs }) + '`'));

$('#cf-test').click(function() {
    if (!settings.token) { modal('Token manquant', 'Entre un token Discord dans Config.'); return; }
    const btn = $(this);
    btn.text('Envoi...').prop('disabled', true);
    changeStatusRequest(settings.token, '"𝘛𝘦𝘴𝘵 𝘓𝘺𝘳𝘪𝘤𝘴 𝘚𝘵𝘢𝘵𝘶𝘴"');
    setTimeout(() => btn.text('Envoyer un statut test').prop('disabled', false), 2000);
});

// ── HELPERS ──────────────────────────────────────────────────────────────────

function addLog(text, type) {
    type = type || 'log';
    consoleLogs.push({ message: text, type });
    const cls = type === 'warning' ? 'lc-warn' : type === 'error' ? 'lc-err' : 'lc-log';
    $('<div>').addClass(cls).text(text).appendTo(logWindow)[0].scrollIntoView(false);
    if (logWindow.children().length > 30) logWindow.children().first().remove();
}

function formatSeconds(s) {
    s = Math.max(0, Math.round(s));
    const m = Math.floor(s / 60), sec = s % 60;
    return m + ':' + (sec < 10 ? '0' : '') + sec;
}

function toItalic(text) {
    return [...text].map(c => {
        const code = c.codePointAt(0);
        if (code >= 65 && code <= 90)  return String.fromCodePoint(0x1D608 + code - 65);
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D622 + code - 97);
        return c;
    }).join('');
}

function censorText(text) {
    if (!_censorRegex) return text;
    _censorRegex.lastIndex = 0;
    return text.replace(_censorRegex, '***');
}

function getStatusString(lyrics) {
    return '"' + toItalic(censorText(lyrics).replace(/♪/g, '').trim()) + '"';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── TOKEN / SPOTIFY ──────────────────────────────────────────────────────────

(function tryLocalStorage() {
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const val = localStorage.getItem(localStorage.key(i));
            if (!val) continue;
            if (val.startsWith('BQ') && val.length > 50 && val.length < 500 && !/\s/.test(val)) {
                _captureToken('Bearer ' + val);
                if (accessToken) break;
            }
            try {
                const d = JSON.parse(val);
                if (d?.accessToken && !d.isAnonymous) { _captureTokenResponse(d); if (accessToken) break; }
            } catch(e) {}
        }
    } catch(e) {}
})();

(async function tokenPoller() {
    let attempts = 0;
    while (!accessToken && attempts < 3) {
        await refreshAccessToken();
        if (accessToken) break;
        attempts++;
        await new Promise(r => setTimeout(r, 5000));
    }
})();

async function tryGetTokenFromSW() {
    return new Promise(resolve => {
        const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
        if (!sw) { resolve(); return; }
        const mc = new MessageChannel();
        const t  = setTimeout(resolve, 3000);
        mc.port1.onmessage = function(e) {
            clearTimeout(t);
            try {
                const d   = e.data;
                const str = JSON.stringify(d);
                const m   = str.match(/"(?:accessToken|access_token)"\s*:\s*"(BQ[^"]+)"/);
                if (m) _captureToken('Bearer ' + m[1]);
                else if (d && d.accessToken && !d.isAnonymous) _captureToken('Bearer ' + d.accessToken);
            } catch(e) {}
            resolve();
        };
        try {
            sw.postMessage({ type: 'GET_ACCESS_TOKEN', reason: 'transport', productType: 'web_player' }, [mc.port2]);
        } catch(e) { clearTimeout(t); resolve(); }
    });
}

async function refreshAccessToken() {
    await tryGetTokenFromSW();
    if (accessToken) return;
    try {
        const r = await fetch('https://open.spotify.com/get_access_token?reason=transport&productType=web_player');
        if (r.ok) {
            const d = await r.json();
            if (d?.accessToken && !d.isAnonymous) _captureTokenResponse(d);
        }
    } catch(e) {}
}

function checkToken(token) {
    let success = true;
    $.get({ url: 'https://discord.com/api/v9/users/@me', headers: { Authorization: token }, async: false, statusCode: { 401: () => success = false } });
    return success;
}

// ── DISCORD ──────────────────────────────────────────────────────────────────

function changeStatusRequest(token, text) {
    const start = Date.now();
    $.ajax({
        url: 'https://discord.com/api/v9/users/@me/settings',
        method: 'PATCH',
        dataType: 'json',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        data: JSON.stringify({
            custom_status: { text, emoji_id: null, emoji_name: null, expires_at: new Date(Date.now() + 60000).toISOString() }
        }),
        statusCode: {
            200: () => {
                const time = Date.now() - start;
                const cls  = time < 500 ? 'c-ok' : time < 1000 ? 'c-mid' : 'c-bad';
                dbDisc.html(`<span class="${cls}">${time}ms</span>`);
                requestsHistory.push(time);
                if (requestsHistory.length > 30) requestsHistory.shift();
                const len = requestsHistory.length;
                if (len >= 2)  dbAvg2.text( (requestsHistory.slice(len - 2 ).reduce((a,b)=>a+b,0) / 2 ).toFixed() + 'ms');
                if (len >= 10) dbAvg10.text((requestsHistory.slice(len - 10).reduce((a,b)=>a+b,0) / 10).toFixed() + 'ms');
            },
            401: () => {
                modal('Token invalide', 'Le token Discord est invalide ou a expiré.');
                stopLog = true; stopped = true;
                dot.attr('class', 'dot-off');
            }
        }
    });
}

// ── LYRICS ───────────────────────────────────────────────────────────────────

function parseLRC(lrc) {
    const lines = [];
    for (const line of lrc.split('\n')) {
        const m = line.match(/^\[(\d{1,2}):(\d{2}\.\d+)\](.*)/);
        if (!m) continue;
        const ms    = Math.round((parseInt(m[1]) * 60 + parseFloat(m[2])) * 1000);
        const words = m[3].trim();
        if (words) lines.push({ startTimeMs: ms.toString(), words });
    }
    return lines;
}

function loadLyrics(lyrics) {
    if (lyrics.syncType === 'UNSYNCED') {
        const tpl = Math.round(playbackState.trackDuration / lyrics.lines.length);
        lyrics.lines.reduce((p, c) => { playbackState.lyrics.push({ time: p, words: c.words }); return p + tpl; }, tpl);
    } else {
        for (const line of lyrics.lines) playbackState.lyrics.push({ time: +line.startTimeMs, words: line.words });
    }
}

function applyLrcLibResult(d) {
    if (d.syncedLyrics) {
        const lines = parseLRC(d.syncedLyrics);
        if (lines.length > 0) {
            loadLyrics({ syncType: 'LINE_SYNCED', lines });
            playbackState.hasLyrics = true;
            dbLyr.text(`✓ ${lines.length} lignes`);
            return { found: true, syncType: 'LINE_SYNCED', lines };
        }
    }
    if (d.plainLyrics) {
        const lines = d.plainLyrics.split('\n').filter(l => l.trim()).map(w => ({ words: w }));
        loadLyrics({ syncType: 'UNSYNCED', lines });
        playbackState.hasLyrics = true;
        dbLyr.text(`✓ ${lines.length} lignes (non-sync)`);
        return { found: true, syncType: 'UNSYNCED', lines };
    }
    return null;
}

function updateParolesList(id, name, author, found) {
    const label    = name + (author ? ` — ${author}` : '');
    const badge    = found ? '<span class="par-ok">✓</span>' : '<span class="par-no">✗</span>';
    const html     = `<span class="par-title" title="${label}">${label}</span>${badge}`;
    const existing = parList.find(`[data-id="${CSS.escape(id)}"]`);
    if (existing.length) {
        existing.html(html);
    } else {
        $('<div>', { class: 'par-item', 'data-id': id }).html(html).prependTo(parList);
        if (parList.children().length > 50) parList.children().last().remove();
    }
}

// ── SETTINGS LOAD/SAVE ───────────────────────────────────────────────────────

function loadSettings() {
    try {
        const raw = localStorage.getItem('LyricsSender_settings');
        if (raw) settings = $.extend(true, settings, JSON.parse(raw));
        cfToken.val(settings.token || '');
        cfOffset.val(settings.timings.sendTimeOffset);
        cfAutorun.prop('checked', settings.autorun);
        const opPct = Math.round(settings.style.opacity * 100);
        cfOpacity.val(opPct);
        cfOpacityVal.text(opPct);
        panel.css('opacity', settings.style.opacity);
        if (Array.isArray(settings.censor)) cfCensor.val(settings.censor.join('\n'));
    } catch(e) {
        addLog('Erreur chargement config: ' + e, 'error');
    }
}

function saveSettings() {
    localStorage.setItem('LyricsSender_settings', JSON.stringify(settings));
}

// ── MODAL ────────────────────────────────────────────────────────────────────

function modal(title, text) {
    const m = $('<div>').css({
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        background: '#1c1c2a', border: '1px solid #28283a', borderRadius: '12px',
        padding: '18px 22px', zIndex: 999999, minWidth: '220px', textAlign: 'center',
        boxShadow: '0 12px 40px rgba(0,0,0,.7)', fontFamily: 'inherit', fontSize: '13px',
        color: '#c8c8d8'
    }).html(`<div style="font-weight:600;margin-bottom:8px;color:#e8e8f4;font-size:14px">${title}</div><div>${text}</div>`);
    const btn = $('<button>').css({
        marginTop: '14px', background: '#28283a', border: '1px solid #38385a',
        borderRadius: '6px', color: '#c8c8d8', padding: '5px 18px', cursor: 'pointer', fontSize: '12px'
    }).text('OK').click(() => m.remove());
    m.append(btn).appendTo(document.body);
}

// ── PLAYBACK STATE ───────────────────────────────────────────────────────────

// Fast seekbar read — called every 150ms to keep progress accurate
function readProgress() {
    // Cache the element reference; refresh if it left the DOM
    if (!readProgress._el || !document.contains(readProgress._el)) {
        readProgress._el =
            document.querySelector('[data-testid="playback-progressbar"] input[type="range"]') ||
            document.querySelector('[data-testid="progress-bar"] input[type="range"]')         ||
            document.querySelector('[role="slider"][aria-valuenow]');
    }
    const bar = readProgress._el;
    if (!bar) return;
    const now    = parseFloat(bar.getAttribute('aria-valuenow') ?? bar.value ?? 0);
    const max    = parseFloat(bar.getAttribute('aria-valuemax') ?? bar.max  ?? 0);
    const factor = (max > 0 && max <= 3600) ? 1000 : 1;
    const newMs  = Math.round(now * factor);
    if (max > 0) playbackState.trackDuration = Math.round(max * factor);
    // Only accept forward movement OR a seek (large backward jump)
    // This smooths out single-tick DOM jitter without hiding real seeks
    const delta = newMs - playbackState.trackProgress;
    if (delta >= -500 || delta > 2000) {
        playbackState.trackProgress = newMs;
    }
}

function updatePlaybackState() {
    const titleEl  = document.querySelector('[data-testid="context-item-info-title"]');
    const pauseBtn = document.querySelector('[data-testid="control-button-pause"]')
                  || document.querySelector('button[aria-label*="ause"]');
    const playBtn  = document.querySelector('[data-testid="control-button-play"]')
                  || document.querySelector('button[aria-label*="Play"]')
                  || document.querySelector('button[aria-label*="Lecture"]')
                  || document.querySelector('button[aria-label*="Reprendre"]');
    const seekBar  = document.querySelector('[data-testid="playback-progressbar"] input[type="range"]')
                  || document.querySelector('[data-testid="progress-bar"] input[type="range"]')
                  || document.querySelector('[role="slider"][aria-valuenow]');

    if (!titleEl) {
        playbackState.isPlaying = false;
        dbProg.text('⏹ Pas de lecture');
        return $.Deferred().resolve();
    }

    const trackName   = titleEl.textContent?.trim() || null;
    const npArea      = titleEl.closest('[data-testid="now-playing-widget"]')
                     || titleEl.closest('[data-testid="context-item-info"]')
                     || titleEl.parentElement?.parentElement;
    const trackAuthor = npArea?.querySelector('a[href*="/artist/"]')?.textContent?.trim()
                     || document.querySelector('[data-testid="context-item-info-subtitle"] a')?.textContent?.trim()
                     || null;
    const isPlaying   = pauseBtn ? true : (playBtn ? false : playbackState.isPlaying);
    const titleLink   = titleEl.querySelector('a') || titleEl.closest('a');
    const trackId     = titleLink?.getAttribute('href')?.match(/\/track\/([A-Za-z0-9]+)/)?.[1] || trackName;

    let progressMs = 0, durationMs = 0;
    if (seekBar) {
        const now    = parseFloat(seekBar.getAttribute('aria-valuenow') ?? seekBar.value ?? 0);
        const max    = parseFloat(seekBar.getAttribute('aria-valuemax') ?? seekBar.max  ?? 0);
        const factor = (max > 0 && max <= 3600) ? 1000 : 1;
        progressMs   = Math.round(now * factor);
        durationMs   = Math.round(max * factor);
    }

    if (playbackState.trackId !== trackId && trackName) {
        dbLyr.text('Recherche...');
        cardLyric.text('🔍 Recherche de paroles...');
        playbackState.trackName           = trackName;
        playbackState.trackAuthor         = trackAuthor;
        playbackState.trackId             = trackId;
        playbackState.trackDuration       = durationMs;
        playbackState.lyrics              = [];
        playbackState.hasLyrics           = false;
        playbackState.lyricsLoading       = false;
        playbackState.currentLyrics       = null;
        playbackState.noLyricsStatusSent  = false;
        playbackState.searchingStatusSent = false;
        waitingStatusSet                  = false;
        dbSong.text(trackName + (trackAuthor ? ' — ' + trackAuthor : ''));
        cardTrack.text(trackName + (trackAuthor ? ' — ' + trackAuthor : ''));

        if (lyricsCache.has(trackId)) {
            const cached = lyricsCache.get(trackId);
            if (cached.found) {
                loadLyrics({ syncType: cached.syncType, lines: cached.lines });
                playbackState.hasLyrics = true;
                dbLyr.text(`✓ cache (${cached.lines.length} lignes)`);
            } else {
                dbLyr.text('Introuvable (cache)');
            }
        } else {
            playbackState.lyricsLoading = true;

            const qs = [
                `track_name=${encodeURIComponent(trackName)}`,
                trackAuthor ? `artist_name=${encodeURIComponent(trackAuthor)}` : '',
                durationMs > 0 ? `duration=${Math.floor(durationMs / 1000)}` : ''
            ].filter(Boolean).join('&');

            fetch(`https://lrclib.net/api/get?${qs}`)
                .then(r => r.ok ? r.json() : Promise.reject(r.status))
                .then(d => { const r = applyLrcLibResult(d); if (r) return r; throw 404; })
                .catch(() => {
                    const sq = `q=${encodeURIComponent((trackAuthor ? trackAuthor + ' ' : '') + trackName)}`;
                    return fetch(`https://lrclib.net/api/search?${sq}`)
                        .then(r => r.ok ? r.json() : Promise.reject(r.status))
                        .then(results => {
                            if (!Array.isArray(results) || results.length === 0) throw 404;
                            for (const item of results) {
                                const r = applyLrcLibResult(item);
                                if (r) return r;
                            }
                            throw 404;
                        });
                })
                .then(result => {
                    playbackState.lyricsLoading = false;
                    lyricsCache.set(trackId, result);
                    addLog(`Paroles trouvées — ${trackName}`, 'log');
                    updateParolesList(trackId, trackName, trackAuthor, true);
                })
                .catch(err => {
                    playbackState.lyricsLoading = false;
                    lyricsCache.set(trackId, { found: false });
                    playbackState.hasLyrics = false;
                    dbLyr.text(typeof err === 'number' ? `HTTP ${err}` : 'Erreur réseau');
                    addLog(`Paroles non trouvées — ${trackName}`, 'warning');
                    updateParolesList(trackId, trackName, trackAuthor, false);
                });
        }
    }

    if (durationMs > 0) playbackState.trackDuration = durationMs;
    playbackState.trackProgress = progressMs;
    playbackState.isPlaying     = isPlaying;

    dbProg.text(
        `${formatSeconds(progressMs / 1000)} / ${formatSeconds(durationMs / 1000)}` +
        ` | ${isPlaying ? '▶ Lecture' : '⏸ Pause'}`
    );

    return $.Deferred().resolve();
}

// ── CHANGE STATUS ────────────────────────────────────────────────────────────

function changeStatus() {
    return new Promise(res => {
        if (!settings.token) return res();

        if (!playbackState.isPlaying) {
            if (!waitingStatusSet) {
                waitingStatusSet = true;
                changeStatusRequest(settings.token, playbackState.trackName ? '⏸ En pause' : 'Connecté');
            }
            return res();
        }

        // Transitioning from paused → playing: allow re-sending no-lyrics/searching status
        if (waitingStatusSet) {
            playbackState.noLyricsStatusSent  = false;
            playbackState.searchingStatusSent = false;
        }
        waitingStatusSet = false;

        if (playbackState.trackDuration > 0 && playbackState.ended()) return res();

        if (!playbackState.hasLyrics) {
            if (playbackState.lyricsLoading) {
                // Still searching — send "🔍 TrackName" once
                if (!playbackState.searchingStatusSent) {
                    playbackState.searchingStatusSent = true;
                    const searchTitle  = toItalic(censorText(playbackState.trackName || ''));
                    const searchAuthor = playbackState.trackAuthor ? ` — ${toItalic(censorText(playbackState.trackAuthor))}` : '';
                    changeStatusRequest(settings.token, `🔍 ${searchTitle}${searchAuthor}`);
                }
            } else if (!playbackState.noLyricsStatusSent) {
                // Confirmed no lyrics — send title + author aesthetically
                playbackState.noLyricsStatusSent = true;
                const title  = toItalic(censorText(playbackState.trackName || ''));
                const author = playbackState.trackAuthor ? ` — ${toItalic(censorText(playbackState.trackAuthor))}` : '';
                changeStatusRequest(settings.token, `♪ ${title}${author} ♪`);
            }
            return res();
        }

        const target = playbackState.trackProgress + (+settings.timings.sendTimeOffset);

        let activeIdx = -1;
        for (let i = 0; i < playbackState.lyrics.length; i++) {
            if (playbackState.lyrics[i].time <= target && playbackState.lyrics[i].words) {
                activeIdx = i;
            } else if (playbackState.lyrics[i].time > target) {
                break;
            }
        }

        if (activeIdx < 0) return res();
        const activeLyric = playbackState.lyrics[activeIdx];

        cardLyric.text(activeLyric.words);

        if (activeLyric === playbackState.currentLyrics) return res();

        // Block backward movement only if it looks like DOM jitter (<1500ms)
        // Larger backward jumps are treated as real user seeks
        if (playbackState.currentLyrics && activeLyric.time < playbackState.currentLyrics.time) {
            if (playbackState.currentLyrics.time - activeLyric.time < 1500) return res();
            playbackState.currentLyrics = null;
        }

        playbackState.currentLyrics = activeLyric;
        changeStatusRequest(settings.token, getStatusString(activeLyric.words));
        res();
    });
}

// ── INIT ─────────────────────────────────────────────────────────────────────

(async function loadBuiltinCensorList() {
    const langs  = ['fr', 'en'];
    const base   = 'https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/';
    const words  = new Set();
    let loaded   = 0;
    for (const lang of langs) {
        try {
            const r = await fetch(base + lang);
            if (r.ok) {
                const text = await r.text();
                text.split('\n').map(w => w.trim().toLowerCase()).filter(w => w && !w.startsWith('#'))
                    .forEach(w => words.add(w));
                loaded++;
            }
        } catch(e) {}
    }
    builtinCensorList = [...words];
    rebuildCensorRegex();
    const el = document.getElementById('cf-censor-status');
    if (el) {
        if (builtinCensorList.length > 0) {
            el.textContent = `Base en ligne : ${builtinCensorList.length} mots (FR + EN)`;
            el.style.color = '#4cf090';
        } else {
            el.textContent = 'Base en ligne : échec du chargement';
            el.style.color = '#f06060';
        }
    }
})();

loadSettings();

if (settings.autorun) {
    stopped  = false;
    startLog = true;
    dot.attr('class', 'dot-on');
}

(async function playbackLoop() {
    updatePlaybackState().always(async () => {
        if (errorCount >= 10) {
            addLog("Arrêté après trop d'erreurs.", 'warning');
            stopLog = true; stopped = true;
            dot.attr('class', 'dot-off');
            errorCount = 0;
            return;
        }
        await sleep(1500);
        playbackLoop();
    });
})();

(function statusLoop() {
    setInterval(() => {
        if (startLog) {
            startLog = false;
            Object.assign(playbackState, {
                trackName: null, trackAuthor: null, trackId: null,
                trackDuration: 0, trackProgress: 0,
                lyrics: [], currentLyrics: null,
                hasLyrics: false, lyricsLoading: false,
                noLyricsStatusSent: false, searchingStatusSent: false, isPlaying: false
            });
            dbSong.text('—'); dbProg.text('—'); dbLyr.text('—');
            dbDisc.text('—'); dbAvg2.text('—'); dbAvg10.text('—');
            cardTrack.text('—'); cardLyric.text('En attente...');
            addLog('Lyrics Status démarré');
        }
        if (stopLog) {
            stopLog = false;
            dbProg.text('—'); dbLyr.text('—'); dbDisc.text('—');
            dbAvg2.text('—'); dbAvg10.text('—');
            cardLyric.text('Arrêté');
            addLog('Lyrics Status arrêté');
        }
        if (stopped) return;
        readProgress();
        changeStatus();
    }, 150);
})();

}); // document ready
