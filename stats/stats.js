/* Enhancer for SoundCloud™ — page Statistiques d'écoute. Lit l'historique via le service worker. */
const $ = (id) => document.getElementById(id);
const T = (s) => (window.SCE_T || ((x) => x))(s);
const S = window.SCE_STATS;
const lang = document.documentElement.lang || 'fr';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString(lang);
const link = (url) => `https://soundcloud.com${url}`;
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? T(one) : T(many)}`;
const art = (url, round) => `<span class="art${round ? ' round' : ''}" style="${url ? `background-image:url('${esc(url)}')` : ''}"></span>`;

let all = [];

function bars(container, labelsEl, labels, values, titles) {
    const max = Math.max(1, ...values);
    container.innerHTML = values.map((v, i) => `<div class="b${v ? '' : ' empty'}" style="height:${v ? Math.max(3, (v / max) * 100) : 2}%" title="${esc(titles[i])}"></div>`).join('');
    labelsEl.innerHTML = labels.map((l) => `<span>${esc(l)}</span>`).join('');
}

function render() {
    const period = $('period').value;
    const entries = S.filter(all, period);
    $('none').hidden = all.length > 0;
    $('none-period').hidden = !(all.length > 0 && entries.length === 0);
    $('content').hidden = entries.length === 0;
    $('export-csv').disabled = $('export-json').disabled = entries.length === 0;
    $('clear').disabled = all.length === 0;
    if (!entries.length) return;

    const sum = S.summarize(entries);
    $('t-time').textContent = S.fmtDuration(sum.seconds, lang);
    $('t-plays').textContent = fmt(sum.plays);
    $('t-tracks').textContent = fmt(sum.tracks);
    $('t-artists').textContent = fmt(sum.artists);
    $('t-completed').textContent = fmt(sum.completed);

    const days = period === 'today' ? 1 : period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const perDay = S.byDay(entries, days);
    $('h-days').textContent = days === 1 ? T('Écoute du jour') : `${T('Écoute par jour')} · ${days} ${T('jours')}`;
    const dayLabel = (d) => d.toLocaleDateString(lang, { day: 'numeric', month: 'short' });
    const every = Math.max(1, Math.ceil(days / 10));
    bars($('c-days'), $('l-days'), perDay.map((d, i) => (days <= 7 || i % every === 0) ? dayLabel(d.day) : ''), perDay.map((d) => d.seconds), perDay.map((d) => `${dayLabel(d.day)} · ${S.fmtDuration(d.seconds, lang)}`));

    const hours = S.byHour(entries);
    bars($('c-hours'), $('l-hours'), hours.map((_, h) => h % 3 === 0 ? `${h}h` : ''), hours, hours.map((v, h) => `${h}:00 · ${S.fmtDuration(v, lang)}`));

    const week = S.byWeekday(entries);
    const monday = new Date(2024, 0, 1); // un lundi
    const dayNames = week.map((_, i) => new Date(monday.getTime() + i * 86400000).toLocaleDateString(lang, { weekday: 'short' }));
    bars($('c-week'), $('l-week'), dayNames, week, week.map((v, i) => `${dayNames[i]} · ${S.fmtDuration(v, lang)}`));

    $('top-tracks').innerHTML = S.topTracks(entries, 10).map((t, i) => `<li><span class="n">${i + 1}</span>${art(t.artwork)}<span class="meta"><span class="t"><a href="${esc(link(t.url))}" target="_blank" rel="noopener">${esc(t.title)}</a></span><span class="s">${esc(t.artist || '')}</span></span><span class="r"><b>${S.fmtDuration(t.seconds, lang)}</b>${plural(t.plays, 'écoute', 'écoutes')}</span></li>`).join('');
    $('top-artists').innerHTML = S.topArtists(entries, 10).map((a, i) => `<li><span class="n">${i + 1}</span>${art(a.artwork, true)}<span class="meta"><span class="t">${esc(a.artist)}</span><span class="s">${plural(a.tracks, 'titre', 'titres')}</span></span><span class="r"><b>${S.fmtDuration(a.seconds, lang)}</b>${plural(a.plays, 'écoute', 'écoutes')}</span></li>`).join('');
    $('recent').innerHTML = S.recent(entries, 50).map((e) => `<li>${art(e.artwork)}<span class="meta"><span class="t"><a href="${esc(link(e.url))}" target="_blank" rel="noopener">${esc(e.title)}</a></span><span class="s">${esc(e.artist || '')}</span></span><span class="r"><b>${S.fmtDuration(e.listened, lang)}${e.duration ? ` / ${S.fmtDuration(e.duration, lang)}` : ''}</b>${new Date(e.at).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })}</span></li>`).join('');
}

async function load() {
    const r = await chrome.runtime.sendMessage({ type: 'history-get' }).catch(() => null);
    all = (r && r.entries) || [];
    render();
}

function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
$('export-csv').addEventListener('click', () => download(`soundcloud-ecoutes-${stamp()}.csv`, S.toCSV(S.filter(all, $('period').value)), 'text/csv'));
$('export-json').addEventListener('click', () => download(`soundcloud-ecoutes-${stamp()}.json`, JSON.stringify(S.filter(all, $('period').value), null, 2), 'application/json'));
$('period').addEventListener('change', render);
$('open-options').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

// Effacement en deux clics, sans dialogue natif.
let armTimer = null;
$('clear').addEventListener('click', async () => {
    const b = $('clear');
    if (!b.classList.contains('armed')) {
        b.classList.add('armed'); b.textContent = T("Confirmer l'effacement");
        armTimer = setTimeout(() => { b.classList.remove('armed'); b.textContent = T("Effacer l'historique"); }, 4000);
        return;
    }
    clearTimeout(armTimer);
    b.classList.remove('armed'); b.textContent = T("Effacer l'historique");
    await chrome.runtime.sendMessage({ type: 'history-clear' }).catch(() => null);
    await load();
});

chrome.storage.sync.get('settings').then(({ settings }) => {
    if (settings?.accent) document.documentElement.style.setProperty('--accent', settings.accent);
});
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.keys(changes).some((k) => k.startsWith('history:'))) load();
});
load();
