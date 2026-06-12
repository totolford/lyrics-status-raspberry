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
    if (raw && raw.startsWith('Bearer ') && raw !== 'Bearer null') {
        accessToken = raw.slice(7);
    }
}
function _captureTokenResponse(data) {
    if (data && data.accessToken && data.accessToken !== 'null' && !data.isAnonymous) {
        accessToken = data.accessToken;
    }
}

(function() {
    // Intercept outgoing fetch headers (fallback if SW doesn't handle auth)
    const _fetch = window.fetch;
    window.fetch = function(url, init) {
        if (url instanceof Request) _captureToken(url.headers.get('authorization'));
        if (init && init.headers) {
            _captureToken(
                init.headers instanceof Headers
                    ? init.headers.get('authorization')
                    : (init.headers['authorization'] || init.headers['Authorization'])
            );
        }
        const result = _fetch.apply(this, arguments);
        const urlStr = typeof url === 'string' ? url : (url instanceof Request ? url.url : '');
        if (urlStr.includes('get_access_token')) {
            result.then(r => r.clone().json().then(_captureTokenResponse).catch(() => {})).catch(() => {});
        }
        return result;
    };

    // Intercept XHR auth headers
    const _setHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        if (name.toLowerCase() === 'authorization') _captureToken(value);
        return _setHeader.call(this, name, value);
    };

    // Listen for token coming from Spotify's Service Worker
    if (navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener('message', function(event) {
            try {
                const data = event.data;
                if (!data) return;
                console.log('[LyricsStatus] SW→page:', JSON.stringify(data).substring(0, 300));
                const str = typeof data === 'string' ? data : JSON.stringify(data);
                const m = str.match(/"(?:accessToken|access_token)"\s*:\s*"(BQ[^"]+)"/);
                if (m) _captureToken('Bearer ' + m[1]);
                else if (data.accessToken && !data.isAnonymous) _captureToken('Bearer ' + data.accessToken);
            } catch(e) {}
        });
    }
})();

$(function() {

$(`
<div id="menu-UI" class="hid-anim">
    <div id="menu-tabs">
        <button id="run-tab-button" class="tab-button cur-tab">Run</button>
        <button id="settings-tab-button" class="tab-button">Settings</button>
        <button id="debug-tab-button" class="tab-button">Debug</button>
        <button id="paroles-tab-button" class="tab-button">Paroles</button>
    </div>
    <div id="menu-contents">
        <div id="run-tab" class="tab-content act">
            <div id="log-window"></div>
            <div id="ss-buttons">
                <button id="start" class="button1">Start</button>
                <button id="stop" class="button1">Stop</button>
            </div>
        </div>
        <div id="settings-tab" class="tab-content hid">
            <div class="settings">
                <span class="settings-name">General</span>
                <div class="option">
                    <label for="user-token">Token:</label>
                    <input type="text" id="user-token" class="text-input1">
                    <button id="check-token" class="button1">Check</button>
                </div>
                <div class="option">
                    <label for="autorun">Autorun:</label>
                    <input type="checkbox" id="autorun">
                </div>
            </div>
            <div class="settings">
                <span class="settings-name">Status view</span>
                <div class="option">
                    <label for="enable-timestamp">Enable timestamp</label>
                    <input type="checkbox" id="enable-timestamp" checked>
                </div>
                <div class="option">
                    <label for="enable-label">Enable label</label>
                    <input type="checkbox" id="enable-label" checked>
                </div>
                <div class="option">
                    <span class="fw-500">Preview:</span>
                    <span id="status-preview" class="b-area">[2:17] Song lyrics - La-la-la</span>
                </div>
                <div class="option">
                    <label for="enable-advanced-swt">Advanced settings</label>
                    <input type="checkbox" id="enable-advanced-swt">
                </div>
                <div id="advanced-swt" class="sub-settings hid">
                    <div class="option">
                        <label for="custom-emoji">
                            Custom emoji
                            <img id="custom-emoji-help" class="clickable question-mark1" src="https://www.pngall.com/wp-content/uploads/5/Help-Question-Mark-PNG-Free-Download.png" height="15">
                            :
                        </label>
                        <input style="width: 30px;" maxlength="4" id="custom-emoji" class="text-input1">
                    </div>
                    <div class="option">
                        <label for="custom-status">
                            Custom status
                            <img id="custom-status-help" class="clickable question-mark1" src="https://www.pngall.com/wp-content/uploads/5/Help-Question-Mark-PNG-Free-Download.png" height="15">
                            :
                        </label>
                        <textarea rows="3" cols="40" id="custom-status" class="text-input2"></textarea>
                    </div>
                </div>
            </div>
            <div class="settings">
                <span class="settings-name">Timings</span>
                <div class="option">
                    <label for="send-time-offset">Send time offset:</label>
                    <input type="text" id="send-time-offset" class="text-input1" maxlength="4" value="500">
                    <img id="send-time-offset-help" class="clickable question-mark1" src="https://www.pngall.com/wp-content/uploads/5/Help-Question-Mark-PNG-Free-Download.png" height="15">
                </div>
                <div class="option">
                    <label for="autooffset">Autooffset (experimental):</label>
                    <select id="autooffset">
                        <option value="off" selected>Off</option>
                        <option value="mode1">Last request</option>
                        <option value="mode2">Average of 2 requests</option>
                        <option value="mode3">Average of 10 requests</option>
                        <option value="mode4">Average of 30 requests</option>
                    </select>
                    <img id="autooffset-help" class="clickable question-mark1" src="https://www.pngall.com/wp-content/uploads/5/Help-Question-Mark-PNG-Free-Download.png" height="15" style="left: 1px;">
                </div>
            </div>
            <div class="settings">
                <span class="settings-name">Menu style</span>
                <div class="option">
                    <label for="opacity-range-slider">Opacity</label>
                    <input id="opacity-range-slider" class="range-slider1" type="range" min="50" max="100" value="90">
                </div>
            </div>
            <div id="version">Version 2.1.2</div>
        </div>
        <div id="debug-tab" class="tab-content hid">
            <div class="debug-section">
                <span class="settings-name">Spotify</span>
                <div class="option debug-row">
                    <span>Token :</span>
                    <span id="debug-token" class="b-area debug-value">En attente...</span>
                </div>
                <div class="option debug-row">
                    <span>Chanson :</span>
                    <span id="debug-song" class="b-area debug-value">—</span>
                </div>
                <div class="option debug-row">
                    <span>Paroles :</span>
                    <span id="debug-lyrics" class="b-area debug-value">—</span>
                </div>
                <div class="option debug-row">
                    <span>Progression :</span>
                    <span id="debug-progress" class="b-area debug-value">—</span>
                </div>
                <div class="option debug-row">
                    <span>Appel API :</span>
                    <span id="debug-playback" class="b-area debug-value">—</span>
                </div>
                <div class="option debug-row">
                    <span>File d'attente :</span>
                    <span id="debug-queue" class="b-area debug-value">—</span>
                </div>
            </div>
            <div class="debug-section">
                <span class="settings-name">Discord</span>
                <div class="option debug-row">
                    <span>Dernier envoi :</span>
                    <span id="debug-request" class="b-area debug-value">—</span>
                </div>
                <div class="option debug-row">
                    <span>Moy. 2 :</span>
                    <span id="debug-request-2" class="b-area debug-value">—</span>
                </div>
                <div class="option debug-row">
                    <span>Moy. 10 :</span>
                    <span id="debug-request-10" class="b-area debug-value">—</span>
                </div>
                <div class="option debug-row">
                    <span>Moy. 30 :</span>
                    <span id="debug-request-30" class="b-area debug-value">—</span>
                </div>
            </div>
            <div class="option" style="margin-top: 5px; text-align: center;">
                <button id="copy-debug-info" class="button1">Copier debug</button>
            </div>
        </div>
        <div id="paroles-tab" class="tab-content hid">
            <div id="paroles-list"></div>
        </div>
    </div>
</div>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@100;300;400;500;700;900&display=swap');
        #menu-UI {
            width: 399px;
            height: 350px;
            min-width: 280px;
            min-height: 220px;
            background: rgba(40, 41, 41, var(--alpha));
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            transition: transform .2s ease-in-out, opacity .2s ease-in-out;
            border-radius: 5px;
            box-shadow: rgba(30, 30, 30, var(--alpha)) 5px 5px 10px 1px;
            z-index: 999;
            position: absolute;
            resize: both;
            overflow: hidden;
        }
        #menu-UI * {
            color: rgba(204, 204, 204, var(--alpha));
            font-family: Roboto;
            user-select: none;
        }
        #menu-UI button {
            cursor: pointer;
        }
        #menu-UI input[type="checkbox"] {
            top: 1px;
            position: relative;
        }
        #menu-UI:not(:hover)::-webkit-scrollbar {
            display: none;
        }
        #menu-UI *::-webkit-scrollbar {
            width: 10px;
        }
        #menu-UI *::-webkit-scrollbar-thumb {
            border-radius: 5px;
            background: rgba(65, 65, 65, var(--alpha));
        }
        #menu-UI *::-webkit-scrollbar-thumb:hover {
            background: rgba(75, 75, 75, var(--alpha));
        }
        #menu-tabs button:first-child {
            border-top-left-radius: 5px;
        }
        #menu-tabs button:last-child {
            border-top-right-radius: 5px;
        }
        #menu-tabs > .tab-button {
            width: 25%;
            height: 100%;
            background: rgba(60, 61, 61, var(--alpha));
            transition: background .2s ease-in-out;
            -webkit-transition: background .2s ease-in-out;
            -moz-transition: background .2s ease-in-out;
            border: none;
            float: left;
        }
        #menu-tabs > .tab-button:hover {
            background: rgba(80, 81, 81, var(--alpha));
        }
        #menu-tabs {
            width: 100%;
            height: 18px;
            background: rgba(60, 60, 60, var(--alpha));
            border-top-left-radius: 5px;
            border-top-right-radius: 5px;
            box-shadow: 0px 1px 0px rgba(31, 31, 31, var(--alpha));
            cursor: move;
        }
        #settings-tab {
            margin-left: 5px;
        }
        #run-tab, #settings-tab, #debug-tab, #paroles-tab {
            height: 332px;
            overflow: hidden auto;
        }
        #paroles-list {
            padding: 4px 6px;
        }
        .paroles-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 2px;
            border-bottom: 1px solid rgba(80, 80, 80, 0.4);
            font-size: 12px;
            gap: 6px;
        }
        .paroles-item-title {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .paroles-item-status {
            flex-shrink: 0;
            font-size: 11px;
        }
        #log-window {
            width: 390px;
            height: 250px;
            padding: 4px 0 0 2px;
            margin: 4px 0 0 4px;
            border: solid rgba(105, 105, 105, var(--alpha)) 1px;
            border-radius: 5px;
            background: rgba(55, 55, 55, var(--alpha));
            line-height: 20px;
            font-size: 20px;
            overflow: hidden auto;
        }
        #log-window > span {
            width: 100%;
            margin: 2px 0 0 4px;
            float: left;
        }
        #start {
            background: rgba(127, 191, 63, var(--alpha));
        }
        #stop {
            background: rgba(191, 63, 63, var(--alpha));
        }
        #start:hover {
            background: rgba(142, 206, 78, var(--alpha));
        }
        #stop:hover {
            background: rgba(206, 78, 78, var(--alpha));
        }
        #ss-buttons {
            width: 200px;
            left: 50%;
            transform: translateX(-50%);
            margin-top: 10px;
            position: relative;
            display: flex;
            justify-content: space-between;
        }
        #check-token {
            width: 70px;
            height: 20px;
            background: rgba(105, 105, 105, var(--alpha));
            padding-top: 1px;
            font-size: 13px;
        }
        #check-token:hover {
            background: rgba(115, 115, 115, var(--alpha));
        }
        #custom-status {
            overflow: hidden auto;
        }
        #send-time-offset {
            width: 40px;
            transition: background .2s ease-in-out;
        }
        #autooffset {
            background: rgba(104, 104, 104, var(--alpha));
            border: none;
            border-radius: 3px;
        }
        #autooffset:focus {
            background: rgba(124, 124, 124, var(--alpha));
        }
        #copy-debug-info {
            width: 130px;
            height: 30px;
            background: rgba(105, 105, 105, var(--alpha));
            padding-top: 1px;
            font-size: 16px;
        }
        #copy-debug-info:hover {
            background: rgba(115, 115, 115, var(--alpha));
        }
        #version {
            width: 400px;
            left: -5px;
            text-align: center;
            position: relative;
            display: inline-block;
        }
        .act {
            display: block;
        }
        .hid {
            display: none;
        }
        .act-anim {
            transform: translate(-50%, -50%) scale(1) !important;
            opacity: 100;
        }
        .hid-anim {
            transform: translate(-50%, -50%) scale(0) !important;
            opacity: 0;
        }
        .cur-tab {
            background: rgba(110, 111, 111, var(--alpha)) !important;
        }
        .red {
            color: rgba(234, 0, 0, var(--alpha)) !important;
        }
        .orange {
            color: rgba(255, 182, var(--alpha)) !important;
        }
        .blue {
            color: rgba(150, 150, 200, var(--alpha)) !important;
        }
        .green {
            color: rgba(150, 200, 150, var(--alpha)) !important;
        }
        .button1 {
            width: 90px;
            height: 35px;
            font-size: 17px;
            border: none;
            border-radius: 3px;
            position: relative;
            -webkit-transition: background .2s ease-in-out;
            -moz-transition: background .2s ease-in-out;
            transition: background .2s ease-in-out;
        }
        .text-input1 {
            border: solid 1px gray;
            border-radius: 2px;
            background: rgba(58, 58, 58, var(--alpha));
            -webkit-transition: background .2s ease-in-out, color .2s ease-in-out;
            -moz-transition: background .2s ease-in-out, color .2s ease-in-out;
            transition: background .2s ease-in-out, color .2s ease-in-out;
            text-align: center;
            outline: none;
        }
        .text-input1:disabled {
            color: rgba(184, 184, 184, var(--alpha)) !important;
            background: rgba(48, 48, 48, var(--alpha));
        }
        .text-input2 {
            border: solid 1px gray;
            border-radius: 2px;
            background: rgba(58, 58, 58, var(--alpha));
            -webkit-transition: background .2s ease-in-out, color .2s ease-in-out;
            -moz-transition: background .2s ease-in-out, color .2s ease-in-out;
            transition: background .2s ease-in-out, color .2s ease-in-out;
            text-align: left;
            line-height: 15px;
            resize: none;
            outline: none;
        }
        .text-input2:disabled {
        color: rgba(184, 184, 184, var(--alpha)) !important;
            background: rgba(48, 48, 48, var(--alpha));
        }
        .b-area {
            border: solid rgba(105, 105, 105, var(--alpha)) 1px;
            border-radius: 3px;
            padding: 0 20px 0 20px;
            background: rgba(55, 55, 55, var(--alpha));
        }
        .range-slider1 {
            -webkit-appearance: none;
            -moz-appearance: none;
            appearance: none;
            width: 100px;
            height: 10px;
            border-radius: 5px;
            background: rgba(75, 75, 75, var(--alpha));
            -webkit-transition: background .2s ease-in-out;
            -moz-transition: background .2s ease-in-out;
            transition: background .2s ease-in-out;
        }
        .range-slider1:hover {
            background: rgba(80, 80, 80, var(--alpha));
        }
        .range-slider1::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 20px;
            height: 20px;
            border-radius: 2px;
            background: rgba(90, 90, 90, var(--alpha));
            -webkit-transition: background .2s ease-in-out;
        }
        .range-slider1::-moz-range-thumb {
            -moz-appearance: none;
            width: 25px;
            height: 25px;
            background: rgba(90, 90, 90, var(--alpha));
            -moz-transition: background .2s ease-in-out;
        }
        .range-slider1::-webkit-slider-thumb:hover {
            background: rgba(100, 100, 100, var(--alpha));
        }
        .range-slider1::-moz-range-thumb:hover {
            background: rgba(100, 100, 100, var(--alpha));
        }
        .settings-name {
            font-size: 21px;
            font-weight: 700;
        }
        .option {
            margin: 3px 0 0 10px;
        }
        .sub-settings {
            margin: 3px 0 0 10px;
        }
        .clickable {
            cursor: pointer;
        }
        .question-mark1 {
            bottom: 5px;
            right: 1px;
            margin-right: -2px;
            filter: invert(39%) sepia(0%) saturate(0%) hue-rotate(339deg) brightness(94%) contrast(90%);
            position: relative;
        }

        .fw-500 {
            font-weight: 500;
        }
        .fw-700 {
            font-weight: 700;
        }
        .modal {
            min-width: 300px;
            min-height: 100px;
            max-width: 700px;
            max-height: 450px;
            width: fit-content;
            height: fit-content;
            background: rgba(50, 51, 51, var(--alpha));
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            border-radius: 7px;
            box-shadow: rgba(30, 30, 30, var(--alpha)) 5px 5px 10px 1px;
            font-size: 14px;
            z-index: 9999;
            position: absolute;
        }
        .modal * {
            user-select: none;
        }
        .modal > .top {
            width: 100%;
            height: 18px;
            background: rgba(60, 60, 60, var(--alpha));
            border-top-left-radius: 7px;
            border-top-right-radius: 7px;
            box-shadow: 0px 1px 0px rgba(31, 31, 31, var(--alpha));
        }
        .modal > .top > .title {
            height: 100%;
            left: 6px;
            bottom: 2px;
            position: relative;
            font-size: 14px;
        }
        .modal > .top > .close {
            width: 18px;
            height: 18px;
            background: rgba(228, 64, 64, var(--alpha));
            border-top-left-radius: 7px;
            border-top-right-radius: 7px;
            float: right;
            cursor: pointer;
        }
        .modal > .top > .close > .closeMark {
            left: 2px;
            top: 1px;
            position: relative;
        }
        .modal > .description {
            padding: 5px 5px 0 5px;
            text-align: center;
        }
        @keyframes light {
            from { filter: invert(39%) sepia(0%) saturate(0%) hue-rotate(339deg) brightness(94%) contrast(90%); }
            to { filter: invert(82%) sepia(7%) saturate(0%) hue-rotate(154deg) brightness(82%) contrast(90%); }
        }
        .debug-section {
            margin: 5px 0 0 5px;
        }
        .debug-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-right: 8px;
        }
        .debug-value {
            max-width: 190px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            display: inline-block;
        }
        :root {
            --alpha: .9
        }
    </style>
</div>
`).appendTo(document.body);
// HTML and CSS

let menu                    = $("#menu-UI"),
    startButton             = $("#start"),
    stopButton              = $("#stop"),
    logWindow               = $("#log-window"),
    userTokenInput          = $("#user-token"),
    checkTokenButton        = $("#check-token"),
    autorunCheckbox         = $("#autorun"),
    enableTimestampCheckbox = $("#enable-timestamp"),
    enableLabelCheckbox     = $("#enable-label"),
    statusPreview           = $("#status-preview"),
    advancedSWT             = $("#advanced-swt"),
    enableAdvancedSWT       = $("#enable-advanced-swt"),
    customEmojiHelp         = $("#custom-emoji-help"),
    customEmoji             = $("#custom-emoji"),
    customStatusHelp        = $("#custom-status-help"),
    customStatus            = $("#custom-status"),
    sendTimeOffset          = $("#send-time-offset"),
    sendTimeOffsetHelp      = $("#send-time-offset-help"),
    autooffset              = $("#autooffset"),
    autooffsetHelp          = $("#autooffset-help"),
    opacityRangeSlider      = $("#opacity-range-slider"),
    debugLyrics             = $("#debug-lyrics"),
    debugRequest            = $("#debug-request"),
    debugRequest2           = $("#debug-request-2"),
    debugRequest10          = $("#debug-request-10"),
    debugRequest30          = $("#debug-request-30"),
    debugPlayback           = $("#debug-playback"),
    debugToken              = $("#debug-token"),
    debugSong               = $("#debug-song"),
    debugProgress           = $("#debug-progress"),
    copyDebugInfoButton     = $("#copy-debug-info"),
    parolesList             = $("#paroles-list"),
    debugQueue              = $("#debug-queue");
// Elements

let settings = {
    token: null,
    autorun: false,
    view: {
        timestamp: true,
        label: true,
        advanced: {
            enabled: false,
            customEmoji: "🎶",
            customStatus: "[{timestamp}] Song lyrics - {lyrics}"
        }
    },
    timings: {
        sendTimeOffset: 500,
        autooffset: "off"
    },
    style: {
        opacity: 0.9
    }
}
// Settings

const lyricsCache = new Map(); // trackId → { found, lines, syncType } | { found: false }

let stopped          = true,
    startLog         = false,
    stopLog          = false,
    errorCount       = 0,
    waitingStatusSet = false,
    playbackState = {
        trackName: null,
        trackAuthor: null,
        trackId: null,
        oldTrackId: null,
        trackDuration: 0,
        trackProgress: 0,
        lyrics: [],
        lyricsFullRes: {},
        currentLyrics: null,
        hasLyrics: false,
        ended: () => playbackState.trackProgress >= playbackState.trackDuration,
        isPlaying: false
    },
    requestsHistory = [],
    consoleLogs     = [];
// Misc, in-session variables

// Quick check: Spotify sometimes caches token-like data in localStorage
(function tryLocalStorage() {
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const val = localStorage.getItem(localStorage.key(i));
            if (!val) continue;
            if (val.startsWith('BQ') && val.length > 50 && val.length < 500 && !/\s/.test(val)) {
                _captureToken('Bearer ' + val);
                if (accessToken) { console.log('[LyricsStatus] Token from localStorage'); break; }
            }
            try {
                const d = JSON.parse(val);
                if (d?.accessToken && !d.isAnonymous) { _captureTokenResponse(d); if (accessToken) break; }
            } catch(e) {}
        }
    } catch(e) {}
})();

// Token poller kept as fallback — DOM approach is primary, no longer blocking
(async function tokenPoller() {
    let attempts = 0;
    while (!accessToken && attempts < 3) {
        await refreshAccessToken();
        if (accessToken) break;
        attempts++;
        await new Promise(r => setTimeout(r, 5000));
    }
})();

$(document).keyup((e) => e.key === "Escape" ? menu.toggleClass("act-anim").toggleClass("hid-anim") : false);

// Draggable menu — grab the tab bar to move, skip clicks on tab buttons
(function() {
    const handle = document.getElementById('menu-tabs');
    const el     = document.getElementById('menu-UI');
    if (!handle || !el) return;
    let dragging = false, ox = 0, oy = 0;

    handle.addEventListener('mousedown', function(e) {
        if (e.target.tagName === 'BUTTON') return;
        dragging = true;
        const r = el.getBoundingClientRect();
        // Commit position: drop the centering transform, use explicit px coords
        el.style.transition = 'none';
        el.style.transform  = 'none';
        el.style.left       = r.left + 'px';
        el.style.top        = r.top  + 'px';
        ox = e.clientX - r.left;
        oy = e.clientY - r.top;
        e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
        if (!dragging) return;
        el.style.left = (e.clientX - ox) + 'px';
        el.style.top  = (e.clientY - oy) + 'px';
    });
    document.addEventListener('mouseup', function() { dragging = false; });
})();
$(".tab-button").each((i, tab) => {
    tab = $(tab);

    tab.click(() => {
        $(".tab-button").each((ti, ctab) => {
            ctab = $(ctab);

            if(i === ti) {

                ctab.addClass("cur-tab");
                $(".tab-content").each((ci, cc) => {
                    cc = $(cc);

                    if(ti === ci) {

                        cc.removeClass("hid").addClass("act");
                    } else {
                        cc.removeClass("act").addClass("hid");
                    }
                });
            } else {
                ctab.removeClass("cur-tab");
            }
        });
    });
});
startButton.click(() => { if(stopped) { startLog = true; } stopped = false; });
stopButton.click(() => { if(!stopped) { stopLog = true; } stopped = true; });
userTokenInput.change(() => {
    settings.token = userTokenInput.val();
    saveSettings();
});
checkTokenButton.click(() => {
    checkTokenButton.text("Checking...");

    let valid = checkToken(settings.token);

    checkTokenButton.text("Check");

    if(!valid) return modal("Token check", "Token is invalid.", { descriptionTextColor: "rgba(200, 0, 0, var(--alpha))" });
    modal("Token check", "Token is valid.", { descriptionTextColor: "rgba(0, 200, 0, var(--alpha))" });
});
autorunCheckbox.click(() => {
    settings.autorun = autorunCheckbox.prop("checked");
    saveSettings();
});
enableTimestampCheckbox.click(() => {
    settings.view.timestamp = enableTimestampCheckbox.prop("checked");
    saveSettings();

    statusPreview.text(getStatusString("La-la-la", 137000));
});
enableLabelCheckbox.click(() => {
    settings.view.label = enableLabelCheckbox.prop("checked");
    saveSettings();

    statusPreview.text(getStatusString("La-la-la", 137000));
});
enableAdvancedSWT.click(() => {
    let state = enableAdvancedSWT.prop("checked");

    settings.view.advanced.enabled = state;
    saveSettings();

    advancedSWT
        .toggleClass("hid")
        .toggleClass("act");
    enableTimestampCheckbox.prop("disabled", state);
    enableLabelCheckbox.prop("disabled", state);
});
customEmojiHelp.click(() => {
    modal("Help", `
    <strong>Custom emoji</strong> option allows you to add an emoji before your status.<br>
    Use a unicode emoji. You can get it <a style="color: rgba(154, 154, 154, var(--alpha));" href="https://www.piliapp.com/emoji/list/">here</a>.
    `);
});
customEmoji.on("input", (e) => {
    e.preventDefault();
    let value = customEmoji.val();

    settings.view.advanced.customEmoji = value;
    saveSettings();
});
customStatusHelp.click(() => {
    modal("Help", `
    <strong>Custom status</strong> option allows you to customise your status as you want.<br>
    To display text such as lyrics or timestamp you need to put it in {} brackets.<br>List of all variables you can use (upper/lower attribute means uppercased/lowercased text):<br>
    {lyrics}, {lyrics_upper}, {lyrics_lower}, {lyrics_letters_only}, {lyrics_upper_letters_only}, {lyrics_lower_letters_only} - These variables contains current synchronized lyrics. <strong>letters_only</strong> attribute means there's no punctuations like dots and commas.<br>
    {song_name}, {song_name_upper}, {song_name_lower}, {song_name_cropped}, {song_name_upper_cropped}, {song_name_lower_cropped} - These variables contain current song name. <strong>cropped</strong> attribute means only song name without any other text.<br>
    {song_author}, {song_author_upper}, {song_author_lower} - These variables contains song author.<br><br>
    <strong>Note: Lyrics Status will automatically crop your status if it's too long. Discord not allowing statuses with length over 128 symbols.</strong>
    `);
});
customStatus.on("input", (e) => {
    e.preventDefault();
    let value = customStatus.val();

    settings.view.advanced.customStatus = value;
    saveSettings();
});
sendTimeOffset.on("input", (e) => {
    e.preventDefault();
    let value = sendTimeOffset.val();

    if(value > 2000 || value < 0) {
        sendTimeOffset.css("color", "rgba(200, 0, 0, var(--alpha))");
        $("#send-time-offset-help").css({ animation: "light 2s infinite alternate" });

        return;
    } else if(isNaN(value)) {
        sendTimeOffset.css("color", "rgba(200, 0, 0, var(--alpha))");

        return;
    } else {
        sendTimeOffset.css("color", "inherit");
        $("#send-time-offset-help").css({ animation: "" });
    }

    settings.timings.sendTimeOffset = value;
    saveSettings();
});
sendTimeOffsetHelp.click(() => modal("Help", `
This parameter defines the offset for time before the status changes (in milliseconds).<br>
Default value is <strong>500</strong>. It is not recommended to change this parameter without a reason.<br><br>
<strong>Note: Value bigger than 2000 will be ignored.</strong>
`));
autooffset.change(() => {
    let value = autooffset.val();

    if(value === "off") {
        sendTimeOffset.prop("disabled", false);
    } else {
        sendTimeOffset.prop("disabled", true);
    }

    settings.timings.autooffset = value;
    saveSettings();
});
autooffsetHelp.click(() => modal("Help", `
This option uses time that requests took to change status to set their offset.<br>
It may help you if you have low connection speed.<br>
If you have stable (not depends on fast or no) connection speed you can use any of these modes.<br>
If you have 'jumpy' connection speed it is not recommended to use <strong>Average of 30 requests</strong> mode.<br>
You can test each mode and see what's more suitable for you.<br><br>
<strong>Note: This function is experimental and may be removed/changed in the future.</strong>
`));
opacityRangeSlider.on("input", () => {
    let value = opacityRangeSlider.val() / 100;

    $(":root").css("--alpha", value);

    settings.style.opacity = value;
    saveSettings();
});
copyDebugInfoButton.click(() => {
    navigator.clipboard.writeText("`" + JSON.stringify({
        playbackState,
        consoleLogs
    }) + "`");
});
// Events

function addLog(text, t) {
    t = t ? t[0].toUpperCase() + t.slice(1, t.length) : "Log";

    consoleLogs.push({
        message: text,
        reason: t
    });

    $("<span/>", { class: t === "Warning" ? "orange" : t === "Error" ? "red" : "blue"}).html(`[${t}]: ${text}`).appendTo(logWindow)[0].scrollIntoView(false);

    if(logWindow.children().length >= 30) $(logWindow[0].firstChild).remove();
}
function formatSeconds(s) {
    return (s - (s %= 60)) / 60 + (9 < s ? ':' : ':0' ) + s;
}
function toItalic(text) {
    return [...text].map(c => {
        const code = c.codePointAt(0);
        if (code >= 65 && code <= 90)  return String.fromCodePoint(0x1D608 + code - 65); // A-Z sans-serif italic
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D622 + code - 97); // a-z sans-serif italic
        return c;
    }).join('');
}
function getStatusString(lyrics, time) {
    const styled = toItalic(lyrics.replace(/♪/g, ''));
    return `"${styled}"`;
}
function parseStatusString(status, data) {
    if(typeof data !== "object") return;

    if(data.lyrics) {
        status = status
            .replace("{lyrics}", data.lyrics)
            .replace("{lyrics_upper}", data.lyrics.toUpperCase())
            .replace("{lyrics_lower}", data.lyrics.toLowerCase())
            .replace("{lyrics_letters_only}", data.lyrics.replace(/['",\.]/gi, ""))
            .replace("{lyrics_upper_letters_only}", data.lyrics.toUpperCase().replace(/['",\.]/gi, ""))
            .replace("{lyrics_lower_letters_only}", data.lyrics.toLowerCase().replace(/['",\.]/gi, ""))
            .replace("♪", "🎶");
    }
    if(data.time) status = status.replace("{timestamp}", formatSeconds((data.time / 1000).toFixed()));
    if(data.songName) {
        status = status
            .replace("{song_name}", data.songName)
            .replace("{song_name_upper}", data.songName.toUpperCase())
            .replace("{song_name_lower}", data.songName.toLowerCase())
            .replace("{song_name_cropped}", data.songName.replace(/( ?- ?.+)|(\(.+\))/gi, ""))
            .replace("{song_name_upper_cropped}", data.songName.toUpperCase().replace(/( ?- ?.+)|(\(.+\))/gi, ""))
            .replace("{song_name_lower_cropped}", data.songName.toLowerCase().replace(/( ?- ?.+)|(\(.+\))/gi, ""));
    }
    if(data.songAuthor) {
        status = status
            .replace("{song_author}", data.songAuthor)
            .replace("{song_author_upper}", data.songAuthor.toUpperCase())
            .replace("{song_author_lower}", data.songAuthor.toLowerCase());
    }

    return status.slice(0, 128);
}
function sleep(ms) {
    return new Promise((res, rej) => setTimeout(res, ms));
}
async function tryGetTokenFromSW() {
    return new Promise(resolve => {
        const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
        if (!sw) { resolve(); return; }

        const mc = new MessageChannel();
        const t = setTimeout(resolve, 3000);

        mc.port1.onmessage = function(e) {
            clearTimeout(t);
            try {
                const d = e.data;
                console.log('[LyricsStatus] SW token reply:', JSON.stringify(d).substring(0, 300));
                const str = JSON.stringify(d);
                const m = str.match(/"(?:accessToken|access_token)"\s*:\s*"(BQ[^"]+)"/);
                if (m) _captureToken('Bearer ' + m[1]);
                else if (d && d.accessToken && !d.isAnonymous) _captureToken('Bearer ' + d.accessToken);
            } catch(e) {}
            resolve();
        };

        try {
            sw.postMessage({ type: 'GET_ACCESS_TOKEN', reason: 'transport', productType: 'web_player' }, [mc.port2]);
            console.log('[LyricsStatus] Sent GET_ACCESS_TOKEN to SW');
        } catch(e) { clearTimeout(t); resolve(); }
    });
}
async function refreshAccessToken() {
    // Method 1: ask Spotify's Service Worker directly
    await tryGetTokenFromSW();
    if (accessToken) return;

    // Method 2: direct endpoint (returns 403 on some setups, worth trying)
    try {
        const r = await fetch('https://open.spotify.com/get_access_token?reason=transport&productType=web_player');
        console.log('[LyricsStatus] get_access_token status:', r.status);
        if (r.ok) {
            const d = await r.json();
            console.log('[LyricsStatus] get_access_token:', JSON.stringify({ isAnonymous: d?.isAnonymous, hasToken: !!d?.accessToken }));
            if (d?.accessToken && !d.isAnonymous) _captureTokenResponse(d);
        }
    } catch(e) {
        console.log('[LyricsStatus] get_access_token error:', e.message);
    }
}
function checkToken(token) {
    let success = true;

    $.get({
        url: "https://discord.com/api/v9/users/@me",
        headers: {
            "Authorization": token
        },
        async: false,
        statusCode: {
            401: () => success = false
        }
    });

    return success;
}
function changeStatusRequest(token, text, emoji) {
    let start = Date.now();

    $.ajax({
        url: "https://discord.com/api/v9/users/@me/settings",
        method: "PATCH",
        dataType: "json",
        headers: {
            "Content-Type": "application/json",
            "Authorization": token
        },
        data: JSON.stringify({
            "custom_status": {
                "text": text,
                "emoji_id": null,
                "emoji_name": emoji,
                "expires_at": new Date(Date.now() + 60000).toISOString()
            }
        }),
        statusCode: {
            200: () => {
                let time = Date.now() - start;

                if(time < 500) {
                    debugRequest.html(`<span class="green">${Date.now() - start}ms</span>`);
                } else if(time < 1000) {
                    debugRequest.html(`<span class="orange">${Date.now() - start}ms</span>`);
                } else {
                    debugRequest.html(`<span class="red">${Date.now() - start}ms</span>`);
                }

                requestsHistory.push(time);

                if(requestsHistory.length > 30) requestsHistory.shift();

                let length = requestsHistory.length;

                length >= 2 ? debugRequest2.text(`${(requestsHistory.slice(length - 2, length).reduce((p, c) => p + c, 0) / 2).toFixed()}ms`) : null;
                length >= 10 ? debugRequest10.text(`${(requestsHistory.slice(length - 10, length).reduce((p, c) => p + c, 0) / 10).toFixed()}ms`) : null;
                length >= 30 ? debugRequest30.text(`${(requestsHistory.reduce((p, c) => p + c, 0) / length).toFixed()}ms`) : null;
            },
            401: () => {
                modal("Run", "Token is invalid.", { descriptionTextColor: "rgba(200, 0, 0, var(--alpha))" });
                stopLog = true;
                stopped = true;
            }
        }
    });
}
function loadSettings() {
    let settingsLoaded = localStorage.getItem("LyricsSender_settings");
    settingsLoaded = settingsLoaded ? JSON.parse(settingsLoaded) : settings;

    settings = $.extend(true, settings, settingsLoaded);

    try {
        userTokenInput.val(settings.token);
        autorunCheckbox.prop("checked", settings.autorun);
        enableTimestampCheckbox.prop("checked", settings.view.timestamp);
        enableLabelCheckbox.prop("checked", settings.view.label);
        settings.view.advanced.enabled ? enableAdvancedSWT.click() : null;
        customEmoji.val(settings.view.advanced.customEmoji);
        customStatus.html(settings.view.advanced.customStatus);
        statusPreview.text(getStatusString("La-la-la", 137000));
        sendTimeOffset.val(settings.timings.sendTimeOffset);
        $(`#autooffset option[value='${settings.timings.autooffset}']`).prop("selected", true);
        autooffset.val() !== "off" ? sendTimeOffset.prop("disabled", true) : null;
        opacityRangeSlider.val(settings.style.opacity * 100);

        $(":root").css("--alpha", settings.style.opacity);
    } catch(e) {
        addLog(`An error occured while loading Lyrics Status config!\nPlease open new issue on GitHub and include this error message:<br><span style="color: rgba(150, 0, 0, var(--alpha));user-select: text;">${e}</span>`, "error");
    }
}
function saveSettings() {
    localStorage.setItem("LyricsSender_settings", JSON.stringify(settings));
}
function modal(title, description, styles = {}) {
    let modalWindow = $(`
    <div class="modal">
        <div class="top">
            <span class="title" ${styles.titleTextColor ? `style="color: ${styles.titleTextColor};"` : ""}>${title}</span>
            <div class="close">
                <img class="closeMark" src="https://www.nicepng.com/png/full/61-612286_clip-art-check-mark-close-x-icon-png.png" height="14">
            </div>
        </div>
        <div class="description" ${styles.descriptionTextColor ? `style="color: ${styles.descriptionTextColor};"` : ""}>
            ${description}
        </div>
    </div>
    `);

    modalWindow.appendTo(document.body);

    for (let e of $(".close")) {
        e.parentNode.parentNode === modalWindow[0] ? $(e).click(() => { modalWindow.remove(); }) : null;
    }
}
function loadLyrics(lyrics) {
    if(lyrics.syncType == "UNSYNCED") {
        let timePerLyric = Math.round(playbackState.trackDuration / lyrics.lines.length);
        lyrics.lines.reduce((p, c, i, a) => {
            playbackState.lyrics.push({
                time: p,
                words: c.words
            });
            return p + timePerLyric;
        }, timePerLyric);
    } else {
        for (let line of lyrics.lines) {
            playbackState.lyrics.push({
                time: +line.startTimeMs,
                words: line.words,
            });
        }
    }
}
function parseLRC(lrc) {
    const lines = [];
    for (const line of lrc.split('\n')) {
        const m = line.match(/^\[(\d{1,2}):(\d{2}\.\d+)\](.*)/);
        if (!m) continue;
        const ms = Math.round((parseInt(m[1]) * 60 + parseFloat(m[2])) * 1000);
        const words = m[3].trim();
        if (words) lines.push({ startTimeMs: ms.toString(), words });
    }
    return lines;
}
function updatePlaybackState() {
    let start = Date.now();

    // Read playback state directly from Spotify's DOM — no token required
    const titleEl  = document.querySelector('[data-testid="context-item-info-title"]');
    const pauseBtn = document.querySelector('[data-testid="control-button-pause"]')
                  || document.querySelector('button[aria-label*="ause"]');
    const playBtn  = document.querySelector('[data-testid="control-button-play"]')
                  || document.querySelector('button[aria-label*="Play"]')
                  || document.querySelector('button[aria-label*="Lecture"]')
                  || document.querySelector('button[aria-label*="Reprendre"]');
    // Target the actual slider input inside the progress bar container
    const seekBar  = document.querySelector('[data-testid="playback-progressbar"] input[type="range"]')
                  || document.querySelector('[data-testid="progress-bar"] input[type="range"]')
                  || document.querySelector('[data-testid="playback-progressbar"] [role="slider"]')
                  || document.querySelector('[role="slider"][aria-valuenow]');

    // Log DOM state every 5s for diagnostics
    if (!updatePlaybackState._lastDomLog || Date.now() - updatePlaybackState._lastDomLog > 5000) {
        updatePlaybackState._lastDomLog = Date.now();
        const artistLinkEl = titleEl?.closest('[data-testid]')?.parentElement?.querySelector('a[href*="/artist/"]')
                          || document.querySelector('a[href*="/artist/"]');
        console.log('[LyricsStatus] DOM check:', {
            title: titleEl?.textContent?.trim(),
            artistLink: artistLinkEl?.textContent?.trim(),
            pauseBtn: !!pauseBtn,
            playBtn: !!playBtn,
            seekBar: !!seekBar,
            seekNow: seekBar?.getAttribute('aria-valuenow') ?? seekBar?.value,
            seekMax: seekBar?.getAttribute('aria-valuemax') ?? seekBar?.max,
            seekBarTag: seekBar?.tagName,
        });
    }

    if (!titleEl) {
        playbackState.isPlaying = false;
        debugProgress.text("⏹ Pas de lecture");
        debugPlayback.text(`${Date.now() - start}ms`);
        debugToken.html('—');
        return $.Deferred().resolve();
    }

    const trackName = titleEl.textContent?.trim() || null;

    // Find artist from the first /artist/ link near the now-playing area
    const nowPlayingArea = titleEl.closest('[data-testid="now-playing-widget"]')
                        || titleEl.closest('[data-testid="context-item-info"]')
                        || titleEl.parentElement?.parentElement;
    const trackAuthor = nowPlayingArea?.querySelector('a[href*="/artist/"]')?.textContent?.trim()
                     || document.querySelector('[data-testid="context-item-info-subtitle"] a')?.textContent?.trim()
                     || null;

    // isPlaying: true if pause button visible, false if play button visible, else keep previous
    const isPlaying = pauseBtn ? true : (playBtn ? false : playbackState.isPlaying);

    // Track ID from the title href (fallback: use name as key)
    const titleLink = titleEl.querySelector('a') || titleEl.closest('a');
    const trackId   = titleLink?.getAttribute('href')?.match(/\/track\/([A-Za-z0-9]+)/)?.[1]
                   || trackName;

    // Progress from seek bar — try aria attrs, then input value/max
    let progressMs = 0, durationMs = 0;
    if (seekBar) {
        const now = parseFloat(seekBar.getAttribute('aria-valuenow') ?? seekBar.value ?? 0);
        const max = parseFloat(seekBar.getAttribute('aria-valuemax') ?? seekBar.max ?? 0);
        // Heuristic: if max <= 3600 it's seconds, otherwise ms
        const factor = (max > 0 && max <= 3600) ? 1000 : 1;
        progressMs = Math.round(now * factor);
        durationMs = Math.round(max * factor);
    }

    debugToken.html('<span class="green">✓ DOM</span>');
    debugPlayback.text(`${Date.now() - start}ms`);

    // Refresh queue preload periodically (covers: queue opened after track start, cache hits)
    if (!updatePlaybackState._lastQueueCheck || Date.now() - updatePlaybackState._lastQueueCheck > 30000) {
        updatePlaybackState._lastQueueCheck = Date.now();
        preloadNextTrack();
    }

    if (playbackState.trackId !== trackId && trackName) {
        debugLyrics.text("Chargement...");
        playbackState.trackName     = trackName;
        playbackState.trackAuthor   = trackAuthor;
        // Remove played track from cache to free memory
        if (playbackState.trackId) lyricsCache.delete(playbackState.trackId);
        playbackState.oldTrackId    = playbackState.trackId;
        playbackState.trackId       = trackId;
        playbackState.trackDuration = durationMs;
        playbackState.lyrics        = [];
        playbackState.lyricsFullRes = {};
        playbackState.hasLyrics     = false;
        waitingStatusSet            = false;
        debugSong.text(`${trackName} — ${trackAuthor || '?'}`);

        // Helper: apply a LRCLib response object, returns true if lyrics were loaded
        function applyLrcLibResult(d) {
            if (d.syncedLyrics) {
                const lines = parseLRC(d.syncedLyrics);
                if (lines.length > 0) {
                    loadLyrics({ syncType: 'LINE_SYNCED', lines });
                    playbackState.hasLyrics = true;
                    debugLyrics.text(`✓ ${lines.length} lignes`);
                    return { found: true, syncType: 'LINE_SYNCED', lines };
                }
            }
            if (d.plainLyrics) {
                const lines = d.plainLyrics.split('\n').filter(l => l.trim()).map(w => ({ words: w }));
                loadLyrics({ syncType: 'UNSYNCED', lines });
                playbackState.hasLyrics = true;
                debugLyrics.text(`✓ ${lines.length} l. (non-sync)`);
                return { found: true, syncType: 'UNSYNCED', lines };
            }
            return null;
        }

        // Helper: update the Paroles tab list
        function updateParolesList(id, name, author, found) {
            const existing = parolesList.find(`[data-track-id="${CSS.escape(id)}"]`);
            const html = `<span class="paroles-item-title">${name}${author ? ` — ${author}` : ''}</span>`
                       + `<span class="paroles-item-status ${found ? 'green' : 'orange'}">${found ? '✓' : '✗'}</span>`;
            if (existing.length) {
                existing.html(html);
            } else {
                $('<div>', { class: 'paroles-item', 'data-track-id': id }).html(html).prependTo(parolesList);
                if (parolesList.children().length > 50) parolesList.children().last().remove();
            }
        }

        // Check cache first — instant load, no network request
        if (lyricsCache.has(trackId)) {
            const cached = lyricsCache.get(trackId);
            if (cached.found) {
                loadLyrics({ syncType: cached.syncType, lines: cached.lines });
                playbackState.hasLyrics = true;
                debugLyrics.text(`✓ cache (${cached.lines.length} lignes)`);
            } else {
                debugLyrics.text('Introuvable (cache)');
            }
            // Still preload next tracks even when current came from cache
            preloadNextTrack();
        } else {
            // Fetch from LRCLib
            debugLyrics.text("Chargement...");
            const qs = [
                `track_name=${encodeURIComponent(trackName)}`,
                trackAuthor ? `artist_name=${encodeURIComponent(trackAuthor)}` : '',
                durationMs > 0 ? `duration=${Math.floor(durationMs / 1000)}` : ''
            ].filter(Boolean).join('&');

            fetch(`https://lrclib.net/api/get?${qs}`)
                .then(r => r.ok ? r.json() : Promise.reject(r.status))
                .then(d => {
                    const result = applyLrcLibResult(d);
                    if (result) return result;
                    throw 404;
                })
                .catch(() => {
                    // Fallback: fuzzy search
                    const sq = `q=${encodeURIComponent((trackAuthor ? trackAuthor + ' ' : '') + trackName)}`;
                    return fetch(`https://lrclib.net/api/search?${sq}`)
                        .then(r => r.ok ? r.json() : Promise.reject(r.status))
                        .then(results => {
                            if (!Array.isArray(results) || results.length === 0) throw 404;
                            for (const item of results) {
                                const result = applyLrcLibResult(item);
                                if (result) return result;
                            }
                            throw 404;
                        });
                })
                .then(result => {
                    lyricsCache.set(trackId, result);
                    addLog(`Paroles trouvées — ${trackName}`, "log");
                    updateParolesList(trackId, trackName, trackAuthor, true);
                    // Preload next track in queue if visible
                    preloadNextTrack();
                })
                .catch(err => {
                    lyricsCache.set(trackId, { found: false });
                    playbackState.hasLyrics = false;
                    debugLyrics.text(typeof err === 'number' ? `HTTP ${err}` : `Erreur: ${err?.message || err}`);
                    addLog(`Paroles non trouvées — ${trackName}`, "warning");
                    updateParolesList(trackId, trackName, trackAuthor, false);
                    changeStatusRequest(settings.token, "");
                });
        }
    }

    if (durationMs > 0) playbackState.trackDuration = durationMs;
    playbackState.trackProgress = progressMs;
    playbackState.isPlaying     = isPlaying;

    debugProgress.text(
        `${formatSeconds((progressMs / 1000).toFixed())} / ${formatSeconds((durationMs / 1000).toFixed())}` +
        ` | ${isPlaying ? "▶ En lecture" : "⏸ Pausé"}`
    );

    return $.Deferred().resolve();
}

// Extract up to `count` upcoming tracks from Spotify's queue panel DOM
function getQueueTracks(count) {
    // Row-level selectors: each row should contain both title and artist
    const rowSelectors = [
        '[data-testid="queue-track"]',
        '[data-testid="tracklist-row"]',
        '[data-testid="track-list-item"]',
    ];
    let rows = [];
    for (const sel of rowSelectors) {
        rows = [...document.querySelectorAll(sel)];
        if (rows.length > 0) break;
    }

    const results = [];
    for (const row of rows) {
        if (results.length >= count) break;
        // Title: try specific testid, fallback to first link text
        const titleEl = row.querySelector('[data-testid="queue-track-title"]')
                     || row.querySelector('[data-testid="track-name"]')
                     || row.querySelector('a[href*="/track/"]');
        const title = titleEl?.textContent?.trim();
        if (!title || title === playbackState.trackName) continue;

        const artistEl = row.querySelector('a[href*="/artist/"]');
        const artist   = artistEl?.textContent?.trim() || null;

        // Track ID from href if available
        const href = row.querySelector('a[href*="/track/"]')?.getAttribute('href');
        const id   = href?.match(/\/track\/([A-Za-z0-9]+)/)?.[1] || title;

        results.push({ id, title, artist });
    }
    return results;
}

// Fetch and cache lyrics for a single track (background, no-op if already cached)
function cacheTrackLyrics(id, title, artist) {
    if (lyricsCache.has(id)) return;
    const qs = [
        `track_name=${encodeURIComponent(title)}`,
        artist ? `artist_name=${encodeURIComponent(artist)}` : '',
    ].filter(Boolean).join('&');

    fetch(`https://lrclib.net/api/get?${qs}`)
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(d => {
            if (d.syncedLyrics) {
                const lines = parseLRC(d.syncedLyrics);
                if (lines.length > 0) { lyricsCache.set(id, { found: true, syncType: 'LINE_SYNCED', lines }); return; }
            }
            if (d.plainLyrics) {
                const lines = d.plainLyrics.split('\n').filter(l => l.trim()).map(w => ({ words: w }));
                lyricsCache.set(id, { found: true, syncType: 'UNSYNCED', lines });
                return;
            }
            lyricsCache.set(id, { found: false });
        })
        .catch(() => { lyricsCache.set(id, { found: false }); });
}

// Preload the next 2 tracks in queue, stagger requests by 500ms to avoid hammering the API
function preloadNextTrack() {
    const upcoming = getQueueTracks(2);
    if (upcoming.length === 0) {
        debugQueue.html('<span class="orange">⚠ File fermée</span>');
    } else {
        debugQueue.html(`<span class="green">✓ ${upcoming.length} piste${upcoming.length > 1 ? 's' : ''} — ${upcoming.map(t => t.title).join(', ')}</span>`);
    }
    upcoming.forEach((track, i) => {
        setTimeout(() => cacheTrackLyrics(track.id, track.title, track.artist), i * 500);
    });
}

function changeStatus() {
    return new Promise((res, rej) => {
        if(!settings.token) return res();
        if(!playbackState.isPlaying) {
            if(!waitingStatusSet) {
                waitingStatusSet = true;
                if (playbackState.trackName) {
                    changeStatusRequest(settings.token, "⏸ En pause", "🎵");
                } else {
                    changeStatusRequest(settings.token, "Connecté", "🎵");
                }
            }
            return res();
        }

        waitingStatusSet = false;

        if(playbackState.ended() || !playbackState.hasLyrics) return res();

        let offset = +settings.timings.sendTimeOffset;

        if(settings.timings.autooffset !== "off") {
            let length = requestsHistory.length;

            if(settings.timings.autooffset === "mode1") {
                offset = requestsHistory[length - 1] + 300;
            } else if(settings.timings.autooffset === "mode2") {
                if(length >= 2) {
                    let requests = requestsHistory.slice(length - 2, length);

                    offset = requests.reduce((p, c) => p + c, 0) / 2 + 300;
                }
            } else if(settings.timings.autooffset === "mode3") {
                if(length >= 10) {
                    let requests = requestsHistory.slice(length - 10, length);

                    offset = requests.reduce((p, c) => p + c, 0) / 10 + 300;
                }
            } else if(settings.timings.autooffset === "mode4") {
                if(length >= 30) {
                    offset = requestsHistory.reduce((p, c) => p + c, 0) / length + 250;
                }
            }
        }

        // Find the last lyric whose time <= trackProgress + offset (deterministic, no forward scan ambiguity)
        let activeIdx = -1;
        const target = playbackState.trackProgress + offset;
        for (let i = 0; i < playbackState.lyrics.length; i++) {
            if (playbackState.lyrics[i].time <= target && playbackState.lyrics[i].words) {
                activeIdx = i;
            } else if (playbackState.lyrics[i].time > target) {
                break;
            }
        }

        if (activeIdx < 0) return res();
        const activeLyric = playbackState.lyrics[activeIdx];

        // Update debug display for lines already passed
        debugLyrics.text(activeLyric.words);

        if (activeLyric === playbackState.currentLyrics) return res();

        // Prevent oscillating backward: only go back if it looks like a real seek (>3s)
        if (playbackState.currentLyrics) {
            const prevTime = playbackState.currentLyrics.time;
            if (activeLyric.time < prevTime && prevTime - activeLyric.time < 3000) return res();
        }

        playbackState.currentLyrics = activeLyric;

        if(settings.view.advanced.enabled) {
            let data = {
                lyrics: activeLyric.words,
                time: playbackState.trackProgress,
                songName: playbackState.trackName,
                songAuthor: playbackState.trackAuthor
            };
            changeStatusRequest(settings.token, parseStatusString(settings.view.advanced.customStatus, data), settings.view.advanced.customEmoji);
        } else {
            changeStatusRequest(settings.token, getStatusString(activeLyric.words, playbackState.trackProgress), null);
        }

        res();
    });
}
// Util functions

loadSettings();

if(settings.autorun) {
    stopped = false;
    startLog = true;
}

(async function playbackStateUpdater() {
    let start = Date.now();
    updatePlaybackState().always(async () => {
        if(errorCount >= 10) {
            addLog("Lyrics Status has been stopped due to errors.", "warning");
            stopLog = true;
            stopped = true;

            errorCount = 0;

            return;
        }

        await sleep(1500 - (Date.now() - start));

        playbackStateUpdater();
    });
})();
(async function statusChanger() {
    setInterval(() => {
        if(startLog) {
            startLog = false;
            playbackState.trackName    = null;
            playbackState.trackAuthor  = null;
            playbackState.trackId      = null;
            playbackState.oldTrackId   = null;
            playbackState.trackDuration = 0;
            playbackState.trackProgress = 0;
            playbackState.lyrics        = [];
            playbackState.lyricsFullRes = {};
            playbackState.currentLyrics = null;
            playbackState.hasLyrics     = false;
            playbackState.isPlaying     = false;
            debugToken.html('En attente...');
            debugSong.text("—");
            debugLyrics.text("—");
            debugProgress.text("—");
            debugRequest.text("—");
            debugRequest2.text("—");
            debugRequest10.text("—");
            debugRequest30.text("—");
            addLog("Lyrics Status started...");
        }
        if(stopLog) {
            stopLog = false;
            debugLyrics.text("—");
            debugProgress.text("—");
            debugRequest.text("—");
            debugRequest2.text("—");
            debugRequest10.text("—");
            debugRequest30.text("—");
            addLog("Lyrics Status stopped...");
        }
        if(stopped) {
            return;
        }

        changeStatus();
        playbackState.trackProgress += 150;
    }, 150);
})();
// Init

}); // document ready
