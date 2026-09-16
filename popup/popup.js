/* Lecteur du panneau latéral et de la fenêtre PiP de repli. */
const $ = (s) => document.querySelector(s);
const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => null);
const ICON_PLAY  = '<svg viewBox="0 0 16 16"><path d="M4 2v12l9-6z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 16 16"><path d="M3.5 2h3v12h-3zM9.5 2h3v12h-3z"/></svg>';
const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

let state = null, tabId = null, timer = null;

const fmtTime = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtRate = (r) => `${parseFloat((r || 1).toFixed(2))}×`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function render() {
    const has = state && state.sce === 'state' && state.title;
    $('#player').hidden = !has;
    $('#empty').hidden = !!has;
    if (!has) return;
    $('#art').style.backgroundImage = state.artwork ? `url("${state.artwork}")` : '';
    $('#title').textContent = state.title;
    $('#artist').textContent = state.artist || '';
    $('#play').innerHTML = state.playing ? ICON_PAUSE : ICON_PLAY;
    const pct = state.duration ? Math.min(100, (state.position / state.duration) * 100) : 0;
    $('#fill').style.width = `${pct}%`;
    $('#knob').style.left = `${pct}%`;
    $('#cur').textContent = fmtTime(state.position);
    $('#dur').textContent = fmtTime(state.duration);
    $('#repeat').classList.toggle('on', state.repeat && state.repeat !== 'off');
    $('#repeat-n').textContent = state.repeat === 'one' ? '1' : '';
    $('#speed').textContent = fmtRate(state.rate);
    $('#speed').classList.toggle('on', Math.abs((state.rate || 1) - 1) > 1e-6);
}

async function poll() {
    const r = await send({ type: 'popup-get-state' });
    if (r && r.sce === 'state') { state = r; tabId = r.tabId ?? tabId; }
    else state = null;
    render();
}

async function command(cmd, extra = {}) {
    await send({ type: 'popup-command', command: cmd, ...extra });
    setTimeout(poll, 120);
}

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

$('#speed').addEventListener('click', (e) => {
    const cur = state?.rate || 1;
    let i = SPEEDS.findIndex((s) => Math.abs(s - cur) < 1e-6);
    if (i < 0) i = 1;
    i = (i + (e.shiftKey ? -1 : 1) + SPEEDS.length) % SPEEDS.length;
    command('speed', { value: SPEEDS[i] });
});

const focusTab = async () => { await send({ type: 'popup-focus-tab' }); };
$('#open-tab').addEventListener('click', focusTab);
$('#title').addEventListener('click', focusTab);
$('#show-soundcloud').addEventListener('click', focusTab);
$('#open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('#open-shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
$('#open-stats').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('stats/stats.html') }));


chrome.storage.sync.get('settings').then(({ settings }) => {
    if (settings?.accent) document.documentElement.style.setProperty('--accent', settings.accent);
});
// L'état arrive à chaque changement important ; seule la position nécessite un rafraîchissement périodique.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.playerState) {
        const next = changes.playerState.newValue;
        if (next && (!tabId || next.tabId === tabId)) { state = next; render(); }
    }
    if (area === 'sync' && changes.settings) document.documentElement.style.setProperty('--accent', changes.settings.newValue?.accent || '#ff5500');
});
if (!new URLSearchParams(location.search).has('window')) {
    send({ type: 'popup-ensure-tab' }).then(poll);
} else {
    poll();
}
timer = setInterval(() => { if (!document.hidden) poll(); }, 5000);
window.addEventListener('unload', () => clearInterval(timer));
