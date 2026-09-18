/* Lecteur du panneau latéral et de la fenêtre PiP de repli. */
const $ = (s) => document.querySelector(s);
const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => null);
const { play: ICON_PLAY, pause: ICON_PAUSE } = window.__sceShared.icons;
const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const T = (s) => (window.SCE_T || ((x) => x))(s);

let state = null, stateAt = 0, tabId = null, timer = null, noTab = false, standaloneUrl = '';
let audioLoading = false;

const fmtTime = window.__sceShared.formatTime;
const fmtRate = (r) => `${parseFloat((r || 1).toFixed(2))}×`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Position estimée entre deux états : le lecteur ne publie que les changements notables. */
function livePosition() {
    if (!state) return 0;
    const position = Number(state.position) || 0;
    if (!state.playing) return position;
    const live = position + ((Date.now() - stateAt) / 1000) * (state.rate || 1);
    return state.duration ? Math.min(state.duration, live) : live;
}
function renderProgress() {
    const position = livePosition();
    const pct = state?.duration ? Math.min(100, (position / state.duration) * 100) : 0;
    $('#fill').style.width = `${pct}%`;
    $('#knob').style.left = `${pct}%`;
    $('#cur').textContent = fmtTime(position);
    $('#dur').textContent = fmtTime(state?.duration);
    const bar = $('#bar');
    bar.setAttribute('aria-valuemax', String(Math.round(state?.duration || 0)));
    bar.setAttribute('aria-valuenow', String(Math.round(position)));
    bar.setAttribute('aria-valuetext', `${fmtTime(position)} / ${fmtTime(state?.duration)}`);
}

function render() {
    const has = state && state.sce === 'state' && state.title;
    $('#player').hidden = !has;
    $('#empty').hidden = !!has || noTab;
    $('#standalone').hidden = !noTab;
    if (!has && !$('#audio-panel').hidden) closeAudioPanel();
    const frame = $('#standalone-player');
    if (!noTab && frame.hasAttribute('src')) frame.removeAttribute('src');
    if (noTab && standaloneUrl && !frame.hasAttribute('src')) frame.src = widgetUrl(standaloneUrl);
    frame.hidden = !noTab || !standaloneUrl;
    if (!has) return;
    $('#art').style.backgroundImage = state.artwork ? `url("${state.artwork}")` : '';
    $('#title').textContent = state.title;
    $('#artist').textContent = state.artist || '';
    $('#play').innerHTML = state.playing ? ICON_PAUSE : ICON_PLAY;
    renderProgress();
    $('#repeat').classList.toggle('on', state.repeat && state.repeat !== 'off');
    $('#repeat-n').textContent = state.repeat === 'one' ? '1' : '';
    $('#speed').textContent = fmtRate(state.rate);
    $('#speed').classList.toggle('on', Math.abs((state.rate || 1) - 1) > 1e-6);
    const sleep = state.sleep;
    $('#sleep').classList.toggle('on', sleep != null);
    $('#sleep-left').textContent = sleep === 'end' ? T('fin') : typeof sleep === 'number' ? fmtTime(sleep) : '';
    $('#sleep-cancel').hidden = sleep == null;
}

function soundcloudUrl(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || !['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com'].includes(url.hostname)) return '';
        if (url.pathname === '/' || !url.pathname.slice(1)) return '';
        url.hostname = 'soundcloud.com';
        url.search = '';
        url.hash = '';
        return url.href;
    } catch { return ''; }
}

function widgetUrl(url) {
    const params = new URLSearchParams({ url, auto_play: 'false', hide_related: 'true', show_comments: 'false', show_user: 'true', show_reposts: 'false' });
    return `https://w.soundcloud.com/player/?${params}`;
}

function setStandaloneUrl(value) {
    const url = soundcloudUrl(value);
    $('#standalone-error').hidden = !!url;
    if (!url) return false;
    standaloneUrl = url;
    $('#standalone-url').value = url;
    $('#standalone-player').src = widgetUrl(url);
    chrome.storage.local.set({ standaloneUrl: url }).catch(() => {});
    render();
    return true;
}

/* File d'attente : demandée au chargement, à chaque changement de titre et après une action. */
let queue = [], queueSig = '', queueTimer = null, lastQueueLoad = 0, queueLoading = false;
function renderQueue() {
    const has = state && state.sce === 'state' && state.title;
    $('#queue').hidden = !has;
    if (!has) return;
    $('#queue-empty').hidden = queue.length > 0;
    $('#queue-title').textContent = queue.length ? `${T('À suivre')} · ${queue.length}` : T('À suivre');
    $('#queue-list').innerHTML = queue.map((q) => `<li data-index="${q.index}" data-url="${esc(q.url || '')}" title="${esc(T('Lire ce titre'))}">
        <span class="qart" style="${q.artwork ? `background-image:url('${esc(q.artwork)}')` : ''}"></span>
        <span class="qmeta"><span class="qt">${esc(q.title)}</span><span class="qa">${esc(q.artist)}</span></span>
        ${q.camelot || q.bpm ? `<span class="qk${q.match >= 0.5 ? ' m-match' : ''}" title="${esc(T(q.match >= 0.5 ? 'Enchaînement harmonique compatible' : 'BPM · tonalité Camelot'))}">${esc([q.bpm, q.camelot].filter(Boolean).join(' · '))}</span>` : ''}
        <span class="qd">${esc(q.duration)}</span>
        <button class="qx" data-remove title="${esc(T('Retirer de la file'))}"><svg viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.6" fill="none"/></svg></button></li>`).join('');
}
async function loadQueue() {
    if (queueLoading || !queueSig || document.hidden) return;
    queueLoading = true;
    const requestedSig = queueSig;
    try {
        const r = await send({ type: 'popup-get-queue' });
        if (requestedSig === queueSig && r?.sce === 'queue' && Array.isArray(r.items)) {
            queue = r.items;
            lastQueueLoad = Date.now();
            renderQueue();
        }
    } finally {
        queueLoading = false;
        if (requestedSig !== queueSig && queueSig) scheduleQueue();
    }
}
const scheduleQueue = (delay = 400) => { clearTimeout(queueTimer); queueTimer = setTimeout(loadQueue, delay); };
$('#queue-list').addEventListener('click', async (e) => {
    const li = e.target.closest('li[data-index]'); if (!li) return;
    const value = { index: Number(li.dataset.index), url: li.dataset.url || null };
    await send({ type: 'popup-command', command: e.target.closest('[data-remove]') ? 'queue-remove' : 'queue-play', value });
    scheduleQueue(600);
});
$('#queue-refresh').addEventListener('click', () => loadQueue());

async function poll() {
    const r = await send({ type: 'popup-get-state' });
    noTab = r?.reason === 'no-tab';
    if (r && r.sce === 'state') {
        state = r; stateAt = Date.now(); tabId = r.tabId ?? tabId;
        const url = soundcloudUrl(r.url);
        if (url && url !== standaloneUrl) {
            standaloneUrl = url;
            chrome.storage.local.set({ standaloneUrl: url }).catch(() => {});
        }
    } else { state = null; if (noTab) tabId = null; }
    render();
    const sig = state ? `${state.url}|${state.title}` : '';
    if (sig !== queueSig) { queueSig = sig; if (sig) scheduleQueue(); else { queue = []; renderQueue(); } }
    else if (sig && Date.now() - lastQueueLoad >= 10000) scheduleQueue();
}

async function command(cmd, extra = {}) {
    await send({ type: 'popup-command', command: cmd, ...extra });
    setTimeout(poll, 120);
}

function closeAudioPanel() {
    $('#audio-panel').hidden = true;
    $('#audio-options').setAttribute('aria-expanded', 'false');
}

function renderAudio(audio) {
    if (audio?.sce !== 'audio-state' || !audio.settings) return;
    const settings = audio.settings;
    $('[data-audio="volume"]').max = settings.allowVolumeBoost ? '2' : '1';
    for (const input of document.querySelectorAll('[data-audio]')) {
        const value = settings[input.dataset.audio];
        if (value == null || document.activeElement === input) continue;
        if (input.type === 'checkbox') input.checked = !!value;
        else input.value = value;
    }
    $('#audio-keep-next').checked = !!audio.keepNext;
    const labels = {
        volume: `${Math.round(settings.volume * 100)} %`,
        rate: fmtRate(settings.rate),
        pitchSemitones: `${settings.pitchSemitones > 0 ? '+' : ''}${settings.pitchSemitones} ${T('demi-tons')}`,
        bass: settings.bass ? `+${settings.bass} dB` : T('désactivé'),
        reverb: settings.reverb ? `${Math.round(settings.reverb * 100)} %` : T('désactivé'),
    };
    for (const [key, value] of Object.entries(labels)) $(`#audio-${key}-value`).textContent = value;
    const select = $('#audio-custom-presets');
    const names = Array.isArray(audio.presets) ? audio.presets.filter((name) => typeof name === 'string') : [];
    const current = select.value;
    select.replaceChildren(new Option(T('Mes presets'), ''), ...names.map((name) => new Option(name, name)));
    select.value = names.includes(current) ? current : '';
    select.hidden = !names.length;
}

async function loadAudio() {
    if (audioLoading || $('#audio-panel').hidden) return;
    audioLoading = true;
    try { renderAudio(await send({ type: 'popup-get-audio' })); }
    finally { audioLoading = false; }
}

$('#audio-options').addEventListener('click', () => {
    const panel = $('#audio-panel');
    panel.hidden = !panel.hidden;
    $('#audio-options').setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) loadAudio();
});
$('#audio-close').addEventListener('click', closeAudioPanel);
document.querySelectorAll('[data-audio]').forEach((input) => {
    input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', () => {
        const key = input.dataset.audio;
        const value = input.type === 'checkbox' ? input.checked : Number(input.value);
        if (input.type !== 'checkbox') {
            const display = key === 'volume' ? `${Math.round(value * 100)} %` : key === 'rate' ? fmtRate(value) : key === 'pitchSemitones' ? `${value > 0 ? '+' : ''}${value} ${T('demi-tons')}` : key === 'bass' ? (value ? `+${value} dB` : T('désactivé')) : (value ? `${Math.round(value * 100)} %` : T('désactivé'));
            $(`#audio-${key}-value`).textContent = display;
        }
        send({ type: 'popup-command', command: 'audio-set', value: { [key]: value } });
    });
    input.addEventListener('change', () => setTimeout(loadAudio, 150));
});
$('#audio-keep-next').addEventListener('change', (event) => send({ type: 'popup-command', command: 'audio-keep-next', value: event.target.checked }));
$('#audio-presets').addEventListener('click', async (event) => {
    const name = event.target.closest('[data-preset]')?.dataset.preset;
    if (name) { await send({ type: 'popup-command', command: 'audio-preset', value: name }); setTimeout(loadAudio, 150); }
});
$('#audio-custom-presets').addEventListener('change', async (event) => {
    if (event.target.value) { await send({ type: 'popup-command', command: 'audio-preset', value: event.target.value }); setTimeout(loadAudio, 150); }
});

document.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', async (e) => {
    const cmd = b.dataset.cmd;
    if (cmd === 'shuffle') { b.classList.add('busy'); await command('shuffle', { force: e.shiftKey }); setTimeout(() => b.classList.remove('busy'), 400); return; }
    if (cmd === 'pip') { await command('pip'); return; }
    command(cmd);
}));

$('#bar').addEventListener('click', (e) => {
    if (!state?.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    command('seek', { value: frac * state.duration });
});

// Clavier : espace = lecture/pause, ← → = ±5 s, Maj+← → = titre précédent/suivant (hors champs et boutons).
const seekBy = (seconds) => { if (state?.duration) command('seek', { value: Math.max(0, Math.min(state.duration, livePosition() + seconds)) }); };
document.addEventListener('keydown', (e) => {
    if (!state?.title || e.ctrlKey || e.altKey || e.metaKey) return;
    const onBar = e.target === $('#bar');
    if (!onBar && e.target.closest?.('input, select, textarea, button, a, summary, iframe')) return;
    if (e.code === 'Space') { e.preventDefault(); command('toggle-play'); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const forward = e.key === 'ArrowRight';
        if (e.shiftKey) command(forward ? 'next-track' : 'prev-track'); else seekBy(forward ? 5 : -5);
    }
});

$('#speed').addEventListener('click', (e) => {
    const cur = state?.rate || 1;
    let i = SPEEDS.findIndex((s) => Math.abs(s - cur) < 1e-6);
    if (i < 0) i = 1;
    i = (i + (e.shiftKey ? -1 : 1) + SPEEDS.length) % SPEEDS.length;
    command('speed', { value: SPEEDS[i] });
});

$('#sleep').addEventListener('click', (e) => { e.stopPropagation(); $('#sleep-menu').hidden = !$('#sleep-menu').hidden; });
$('#sleep-menu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sleep]'); if (!b) return;
    $('#sleep-menu').hidden = true;
    command('sleep', { value: b.dataset.sleep === 'end' ? 'end' : Number(b.dataset.sleep) });
});
document.addEventListener('click', () => { $('#sleep-menu').hidden = true; });

const focusTab = async () => { await send({ type: 'popup-focus-tab' }); };
const separateWindow = new URLSearchParams(location.search).has('window');
let panelWindowId = null;
if (!separateWindow) chrome.windows.getCurrent().then((current) => {
    panelWindowId = current.id;
    send({ type: 'panel-opened', windowId: panelWindowId });
}).catch(() => {});
chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg?.type !== 'panel-request-close' || separateWindow || msg.windowId !== panelWindowId) return false;
    respond({ ok: true });
    window.close();
    return false;
});
window.addEventListener('pagehide', () => {
    if (panelWindowId != null) send({ type: 'panel-disposed', windowId: panelWindowId });
});
$('#open-soundcloud').addEventListener('click', focusTab);
$('#close-side-panel').hidden = separateWindow;
$('#close-side-panel').addEventListener('click', async () => {
    const current = await chrome.windows.getCurrent().catch(() => null);
    const result = await send({ type: 'panel-close', windowId: current?.id });
    if (result?.reason === 'unsupported') window.close();
});
$('#open-tab').addEventListener('click', focusTab);
$('#title').addEventListener('click', focusTab);
$('#show-soundcloud').addEventListener('click', focusTab);
$('#open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('#open-shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
$('#open-stats').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('stats/stats.html') }));
$('#standalone-form').addEventListener('submit', (event) => { event.preventDefault(); setStandaloneUrl($('#standalone-url').value); });
$('#standalone-open-tab').addEventListener('click', focusTab);
$('#standalone-options').addEventListener('click', () => chrome.runtime.openOptionsPage());


chrome.storage.sync.get('settings').then(({ settings }) => {
    if (settings?.accent) document.documentElement.style.setProperty('--accent', settings.accent);
});
// L'état arrive à chaque changement important ; seule la position nécessite un rafraîchissement périodique.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.playerState) {
        const next = changes.playerState.newValue;
        if (next && (!tabId || next.tabId === tabId)) {
            state = next; stateAt = Date.now(); noTab = false; render();
            const sig = `${next.url}|${next.title}`;
            if (sig !== queueSig) { queueSig = sig; scheduleQueue(); }
        }
    }
    if (area === 'sync' && changes.settings) document.documentElement.style.setProperty('--accent', changes.settings.newValue?.accent || '#ff5500');
});
chrome.storage.local.get('standaloneUrl').then(({ standaloneUrl: saved }) => {
    const url = soundcloudUrl(saved);
    if (url && !standaloneUrl) { standaloneUrl = url; $('#standalone-url').value = url; }
    poll();
}).catch(poll);
timer = setInterval(() => { if (!document.hidden) { poll(); loadAudio(); } }, 5000);
const progressTimer = setInterval(() => { if (!document.hidden && state?.playing) renderProgress(); }, 500);
window.addEventListener('pagehide', () => { clearInterval(timer); clearInterval(progressTimer); });
