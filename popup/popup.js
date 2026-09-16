const $ = (s) => document.querySelector(s);
const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => null);

function fmtDate(ts) {
    const d = new Date(ts);
    return d.toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function refreshState() {
    const state = await send({ type: 'popup-get-state' });
    const has = state && state.sce === 'state' && state.title;
    $('#now').hidden = !has;
    $('#controls').hidden = !has;
    $('#controls2').hidden = !has;
    $('#empty').hidden = !!has;
    if (!has) return;
    $('#title').textContent = state.title;
    $('#artist').textContent = state.artist || '';
    if (state.artwork) $('#artwork').src = state.artwork;
    $('#play').textContent = state.playing ? '⏸' : '▶';
}

async function refreshHistory() {
    const { history = [] } = await chrome.storage.local.get('history');
    if (!history.length) return;
    $('#history').innerHTML = history.slice(0, 8).map((h) =>
        `<li><span>${escapeHtml(h.source)} · ${h.count}${h.total > h.count ? `/${h.total}` : ''}</span><span>${fmtDate(h.at)}</span></li>`).join('');
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

document.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', async (e) => {
    await send({ type: 'popup-command', command: b.dataset.cmd, force: e.shiftKey });
    if (b.dataset.cmd === 'shuffle' || b.dataset.cmd === 'pip') window.close();
    else setTimeout(refreshState, 300);
}));

$('#open-options').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
$('#open-shortcuts').addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); });
$('#version').textContent = `v${chrome.runtime.getManifest().version}`;

refreshState();
refreshHistory();
