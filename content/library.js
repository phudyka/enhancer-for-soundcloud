/*
 * Enhancer for SoundCloud™ — Bibliothèque des likes (monde principal)
 *
 * Sur /you/likes : recherche instantanée (titre, artiste, tag), tri (date
 * d'ajout, titre, artiste, durée, écoutes, année), filtre par genre, puis sur
 * la sélection : ▶ Lire dans l'ordre, 🔀 Shuffle+, ＋ Créer une playlist.
 *
 * Données : identifiants des likes (cache de shuffle.js) + métadonnées par
 * /tracks?ids=… (50 par requête, 4 en parallèle, ~7 s pour 5 000 titres la
 * première fois), stockées dans IndexedDB « sce-library ». Mises à jour
 * incrémentales : seuls les identifiants inconnus sont téléchargés, les titres
 * qui ne sont plus likés sont retirés.
 *
 * UI : ligne d'outils sous l'en-tête, dans les composants SoundCloud
 * (sc-input, sc-button). La grille native reste affichée tant qu'aucun tri,
 * filtre ou recherche n'est actif ; ensuite notre liste la remplace.
 */
(() => {
    'use strict';
    const NS = 'sce-lib';
    const BATCH = 50, PARALLEL = 4, PAGE = 120;
    const SEL = { top: '.collectionSection__top', list: '.collectionSection .lazyLoadingList, .collectionSection__list', section: '.collectionSection' };
    const $ = (s, r = document) => r.querySelector(s);
    const S = () => window.__scsp;

    const T = {
        fr: { search: 'Rechercher dans vos likes : titre, artiste, tag…', sort: 'Trier', added: "Date d'ajout", title: 'Titre', artist: 'Artiste', duration: 'Durée', plays: 'Écoutes', year: 'Année', genre: 'Tous les genres',
              play: 'Lire', shuffle: 'Shuffle+', playlist: 'Créer une playlist', tracks: 'titres', indexing: 'Indexation des likes… {n} / {t}', indexed: 'Bibliothèque à jour : {n} titres',
              plName: 'Nom de la playlist', created: 'Playlist créée : {t}', tooMany: '500 titres maximum par playlist : les {n} premiers seront pris', none: 'Aucun titre ne correspond', reset: 'Réinitialiser', likes: 'Likes' },
        en: { search: 'Search your likes: title, artist, tag…', sort: 'Sort', added: 'Date liked', title: 'Title', artist: 'Artist', duration: 'Duration', plays: 'Plays', year: 'Year', genre: 'All genres',
              play: 'Play', shuffle: 'Shuffle+', playlist: 'Create playlist', tracks: 'tracks', indexing: 'Indexing likes… {n} / {t}', indexed: 'Library up to date: {n} tracks',
              plName: 'Playlist name', created: 'Playlist created: {t}', tooMany: '500 tracks max per playlist: the first {n} will be used', none: 'No matching tracks', reset: 'Reset', likes: 'Likes' },
    };
    const L = T[(document.documentElement.lang || 'en').slice(0, 2)] || T.en;
    const t = (k, v = {}) => (L[k] || T.en[k] || k).replace(/\{(\w+)\}/g, (_, x) => (typeof v[x] === 'number' ? v[x].toLocaleString() : (v[x] ?? '')));
    const fmtDur = (ms) => { const s = Math.round(ms / 1000); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`; };
    const fmtTotal = (ms) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`; };
    const fold = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    // ── IndexedDB ────────────────────────────────────────────────
    const DB = (() => {
        let dbp = null;
        const open = () => dbp || (dbp = new Promise((res, rej) => {
            const r = indexedDB.open('sce-library', 1);
            r.onupgradeneeded = () => r.result.createObjectStore('tracks', { keyPath: 'id' });
            r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        }));
        const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const tr = db.transaction('tracks', mode); const out = fn(tr.objectStore('tracks')); tr.oncomplete = () => res(out?.result ?? out); tr.onerror = () => rej(tr.error); }); };
        return {
            all: () => tx('readonly', (st) => st.getAll()),
            put: (rows) => tx('readwrite', (st) => { rows.forEach((r) => st.put(r)); }),
            del: (ids) => tx('readwrite', (st) => { ids.forEach((id) => st.delete(id)); }),
        };
    })();

    /** Enregistrement compact d'un titre (≈ 250 octets). */
    const slim = (x) => ({
        id: x.id, title: x.title || '', artist: x.user?.username || '', artistUrl: x.user?.permalink_url || '',
        dur: x.full_duration || x.duration || 0, genre: (x.genre || '').trim(), tags: (x.tag_list || '').slice(0, 300),
        year: Number(String(x.release_date || x.created_at || '').slice(0, 4)) || 0, plays: x.playback_count || 0, likes: x.likes_count || 0,
        art: (x.artwork_url || x.user?.avatar_url || '').replace('-large.', '-t120x120.'), url: x.permalink_url || '', snip: x.policy === 'SNIP',
    });

    // ── Index : identifiants (ordre = date d'ajout) + métadonnées ──
    let ids = [], rows = new Map(), building = false;

    async function buildIndex({ force = false } = {}) {
        if (building) return; building = true;
        try {
            const me = await S().me();
            ids = await S().likesIds(me.id, me.likes_count ?? -1, { force });
            const known = new Map((await DB.all()).map((r) => [r.id, r]));
            const idSet = new Set(ids);
            const stale = [...known.keys()].filter((id) => !idSet.has(id));
            if (stale.length) { await DB.del(stale); stale.forEach((id) => known.delete(id)); }
            const missing = ids.filter((id) => !known.has(id));
            if (missing.length) {
                const batches = []; for (let i = 0; i < missing.length; i += BATCH) batches.push(missing.slice(i, i + BATCH));
                let done = 0;
                const worker = async () => {
                    while (batches.length) {
                        const b = batches.shift();
                        try {
                            const res = await S().api(`/tracks?ids=${b.join(',')}`);
                            const got = (res || []).map(slim); await DB.put(got); got.forEach((r) => known.set(r.id, r));
                        } catch (e) { console.warn('[SCE] lot ignoré', e.message); }
                        done += b.length;
                        S().toast(t('indexing', { n: known.size, t: ids.length }), { sticky: true });
                    }
                };
                await Promise.all(Array.from({ length: PARALLEL }, worker));
                S().toast(t('indexed', { n: known.size }));
            }
            rows = known;
        } finally { building = false; }
    }

    // ── Sélection courante ───────────────────────────────────────
    const state = { q: '', sort: 'added', dir: 'desc', genre: '' };
    const active = () => !!(state.q || state.genre || state.sort !== 'added' || state.dir !== 'desc');

    function selection() {
        const q = fold(state.q).trim();
        const terms = q ? q.split(/\s+/) : [];
        const order = new Map(ids.map((id, i) => [id, i]));
        let list = ids.map((id) => rows.get(id)).filter(Boolean);
        if (state.genre) list = list.filter((r) => r.genre === state.genre);
        if (terms.length) list = list.filter((r) => { const h = fold(`${r.title} ${r.artist} ${r.genre} ${r.tags}`); return terms.every((w) => h.includes(w)); });
        const cmp = {
            added:    (a, b) => order.get(a.id) - order.get(b.id),
            title:    (a, b) => fold(a.title).localeCompare(fold(b.title)),
            artist:   (a, b) => fold(a.artist).localeCompare(fold(b.artist)) || fold(a.title).localeCompare(fold(b.title)),
            duration: (a, b) => a.dur - b.dur,
            plays:    (a, b) => a.plays - b.plays,
            year:     (a, b) => a.year - b.year,
        }[state.sort];
        list.sort(cmp);
        if ((state.sort === 'added') !== (state.dir === 'desc')) list.reverse(); // « ajout » : plus récent d'abord par défaut
        return list;
    }

    // ── UI ────────────────────────────────────────────────────────
    const CSS = `
        .${NS}-bar { display: flex; align-items: center; gap: 8px; padding: 0 24px 8px; flex-wrap: wrap; }
        .${NS}-bar .sc-input { height: 36px; background: #303030; border: 0; color: #fff; padding: 0 12px 0 34px; border-radius: 3px; flex: 1 1 260px; min-width: 200px;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%23999'%3E%3Cpath d='M6.5 1a5.5 5.5 0 014.38 8.82l3.9 3.9-1.06 1.06-3.9-3.9A5.5 5.5 0 116.5 1zm0 1.5a4 4 0 100 8 4 4 0 000-8z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: 11px center; background-size: 14px; }
        .${NS}-bar .sc-input:focus { outline: none; box-shadow: inset 0 0 0 1px #f50; }
        .${NS}-bar select { height: 36px; background: #303030; color: #fff; border: 0; border-radius: 3px; padding: 0 28px 0 10px; font: inherit; font-size: 13px; cursor: pointer; appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%23ccc'%3E%3Cpath d='M4 6l4 4 4-4z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 8px center; }
        .${NS}-bar select.m-on { color: #f50; }
        .${NS}-dir { width: 36px; height: 36px; border: 0; border-radius: 3px; background: #303030; color: #ccc; cursor: pointer; font-size: 14px; }
        .${NS}-dir:hover { color: #fff; }
        .${NS}-count { color: #999; font-size: 13px; margin-left: auto; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .${NS}-actions { display: flex; gap: 8px; }
        .${NS}-actions .sc-button { height: 36px !important; }
        .${NS}-actions .sc-button svg { width: 14px; height: 14px; fill: currentColor; margin-right: 6px; vertical-align: -2px; }
        .${NS}-list { padding: 0 24px 24px; }
        .${NS}-row { display: grid; grid-template-columns: 40px minmax(0, 1fr) 110px 60px 56px; gap: 12px; align-items: center; height: 56px; padding: 0 8px; border-radius: 3px; cursor: pointer; color: #ccc; }
        .${NS}-row:hover { background: #262626; color: #fff; }
        .${NS}-art { width: 40px; height: 40px; border-radius: 2px; background: #333 center/cover no-repeat; position: relative; }
        .${NS}-row:hover .${NS}-art::after { content: ''; position: absolute; inset: 0; border-radius: 2px; background: rgba(0,0,0,.45) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%23fff'%3E%3Cpath d='M4 2v12l9-6z'/%3E%3C/svg%3E") center/16px no-repeat; }
        .${NS}-meta { min-width: 0; }
        .${NS}-title { color: #fff; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .${NS}-title .snip { color: #f50; font-size: 10px; font-weight: 700; margin-left: 6px; vertical-align: 1px; }
        .${NS}-artist { color: #999; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .${NS}-artist a { color: inherit; text-decoration: none; } .${NS}-artist a:hover { color: #fff; text-decoration: underline; }
        .${NS}-genre { color: #999; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; } .${NS}-genre:hover { color: #f50; }
        .${NS}-num { color: #999; font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; }
        .${NS}-more { height: 8px; }
        .${NS}-empty { color: #999; padding: 40px 0; text-align: center; }
    `;
    let bar = null, list = null, nativeList = null, sentinel = null, rendered = 0, current = [];

    function injectStyles() { if ($(`#${NS}-styles`)) return; const s = document.createElement('style'); s.id = `${NS}-styles`; s.textContent = CSS; document.head.appendChild(s); }

    function buildBar() {
        const b = document.createElement('div');
        b.className = `${NS}-bar`;
        b.innerHTML = `
            <input class="sc-input" type="search" placeholder="${t('search')}" autocomplete="off">
            <select class="${NS}-sort" title="${t('sort')}">
                ${['added', 'title', 'artist', 'duration', 'plays', 'year'].map((k) => `<option value="${k}">${t(k)}</option>`).join('')}
            </select>
            <button type="button" class="${NS}-dir" title="Ordre">↓</button>
            <select class="${NS}-genre"><option value="">${t('genre')}</option></select>
            <span class="${NS}-count"></span>
            <div class="${NS}-actions">
                <button type="button" class="sc-button sc-button-medium sc-button-secondary ${NS}-play"><svg viewBox="0 0 16 16"><path d="M4 2v12l9-6z"/></svg>${t('play')}</button>
                <button type="button" class="sc-button sc-button-medium sc-button-secondary ${NS}-shuffle"><svg viewBox="0 0 16 16"><path d="M11.5 1.5l3 3-3 3V5.75h-1.2c-.5 0-.97.25-1.25.66L7.9 8l-1.15-1.6.6-.84A3 3 0 0 1 10.3 4.25h1.2V1.5zM1 4.25h2.3a3 3 0 0 1 2.45 1.27l3.3 4.62c.28.41.75.66 1.25.66h1.2V8.5l3 3-3 3v-2.25h-1.2a3 3 0 0 1-2.45-1.27L4.55 6.36a1.5 1.5 0 0 0-1.25-.61H1v-1.5zM1 10.25h2.3c.5 0 .97-.25 1.25-.66l.6-.84L6.3 10.35l-.55.77A3 3 0 0 1 3.3 12.4H1v-1.5z"/></svg>${t('shuffle')}</button>
                <button type="button" class="sc-button sc-button-medium sc-button-primary ${NS}-create"><svg viewBox="0 0 16 16"><path d="M7 2h2v5h5v2H9v5H7V9H2V7h5z"/></svg>${t('playlist')}</button>
            </div>`;
        const input = b.querySelector('input'), sort = b.querySelector(`.${NS}-sort`), dir = b.querySelector(`.${NS}-dir`), genre = b.querySelector(`.${NS}-genre`);
        let deb; input.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => { state.q = input.value; refresh(); }, 120); });
        sort.addEventListener('change', () => { state.sort = sort.value; state.dir = sort.value === 'added' ? 'desc' : 'asc'; refresh(); });
        dir.addEventListener('click', () => { state.dir = state.dir === 'asc' ? 'desc' : 'asc'; refresh(); });
        genre.addEventListener('change', () => { state.genre = genre.value; refresh(); });
        b.querySelector(`.${NS}-play`).addEventListener('click', () => act('play'));
        b.querySelector(`.${NS}-shuffle`).addEventListener('click', () => act('shuffle'));
        b.querySelector(`.${NS}-create`).addEventListener('click', () => act('create'));
        input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = ''; state.q = ''; refresh(); } });
        return b;
    }

    function fillGenres() {
        const sel = bar.querySelector(`.${NS}-genre`);
        const counts = new Map();
        for (const id of ids) { const g = rows.get(id)?.genre; if (g) counts.set(g, (counts.get(g) || 0) + 1); }
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
        sel.innerHTML = `<option value="">${t('genre')}</option>` + top.map(([g, n]) => `<option value="${g.replace(/"/g, '&quot;')}">${g} (${n})</option>`).join('');
        sel.value = state.genre;
    }

    function label() {
        const parts = [];
        if (state.genre) parts.push(state.genre);
        if (state.q.trim()) parts.push(`« ${state.q.trim()} »`);
        return parts.length ? `${parts.join(' · ')} · ${t('likes')}` : t('likes');
    }

    function refresh() {
        current = selection();
        const total = current.reduce((a, r) => a + r.dur, 0);
        bar.querySelector(`.${NS}-count`).textContent = `${current.length.toLocaleString()} ${t('tracks')} · ${fmtTotal(total)}`;
        bar.querySelector(`.${NS}-dir`).textContent = state.dir === 'asc' ? '↑' : '↓';
        bar.querySelector(`.${NS}-sort`).classList.toggle('m-on', state.sort !== 'added');
        bar.querySelector(`.${NS}-genre`).classList.toggle('m-on', !!state.genre);
        const on = active();
        if (nativeList) nativeList.style.display = on ? 'none' : '';
        list.style.display = on ? '' : 'none';
        if (!on) return;
        list.innerHTML = ''; rendered = 0;
        if (!current.length) { list.innerHTML = `<div class="${NS}-empty">${t('none')}</div>`; return; }
        renderMore();
    }

    function renderMore() {
        const frag = document.createDocumentFragment();
        for (const r of current.slice(rendered, rendered + PAGE)) {
            const row = document.createElement('div');
            row.className = `${NS}-row`; row.dataset.id = r.id;
            row.innerHTML = `
                <div class="${NS}-art" style="${r.art ? `background-image:url('${r.art}')` : ''}"></div>
                <div class="${NS}-meta"><div class="${NS}-title">${esc(r.title)}${r.snip ? '<span class="snip">GO+</span>' : ''}</div>
                    <div class="${NS}-artist"><a href="${esc(r.artistUrl)}">${esc(r.artist)}</a></div></div>
                <div class="${NS}-genre" title="${esc(r.genre)}">${esc(r.genre)}</div>
                <div class="${NS}-num">${r.year || ''}</div>
                <div class="${NS}-num">${fmtDur(r.dur)}</div>`;
            frag.appendChild(row);
        }
        rendered += PAGE;
        sentinel?.remove();
        list.appendChild(frag);
        if (rendered < current.length) { sentinel = document.createElement('div'); sentinel.className = `${NS}-more`; list.appendChild(sentinel); io.observe(sentinel); }
    }
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { io.unobserve(es[0].target); renderMore(); } });
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    async function act(kind, fromId) {
        let sel = current.length ? current : selection();
        if (fromId) { const i = sel.findIndex((r) => r.id === fromId); if (i > 0) sel = sel.slice(i); }
        const idList = sel.map((r) => r.id);
        if (idList.length < 1) return;
        const name = label();
        if (kind === 'shuffle') return S().shuffleIds(idList, { name, label: name });
        if (kind === 'play')    return S().playIds(idList, { name, label: name, summary: `${Math.min(idList.length, S().maxTracks).toLocaleString()} ${t('tracks')}` });
        if (kind === 'create') {
            const title = prompt(t('plName'), name);
            if (!title) return;
            if (idList.length > S().maxTracks) S().toast(t('tooMany', { n: S().maxTracks }));
            const pl = await S().api('/playlists', { method: 'POST', body: { playlist: { title, sharing: 'private', tracks: idList.slice(0, S().maxTracks), tag_list: state.genre || '' } } });
            S().toast(t('created', { t: pl.title }));
            const a = document.createElement('a'); a.href = new URL(pl.permalink_url).pathname; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove();
        }
    }

    // ── Montage sur /you/likes ────────────────────────────────────
    let mounted = false;
    const enabled = () => { try { return JSON.parse(localStorage.getItem('scsp:settings') || '{}').library !== false; } catch { return true; } };
    async function mount() {
        if (!/^\/you\/likes\/?$/.test(location.pathname) || !S() || !enabled()) { unmount(); return; }
        const top = $(SEL.top); if (!top || mounted) return;
        mounted = true;
        injectStyles();
        bar = buildBar(); list = document.createElement('div'); list.className = `${NS}-list`; list.style.display = 'none';
        top.after(bar); bar.after(list);
        nativeList = $(SEL.list);
        list.addEventListener('click', (e) => {
            if (e.target.closest('a')) return;
            const g = e.target.closest(`.${NS}-genre`); if (g) { state.genre = g.textContent; bar.querySelector(`.${NS}-genre`).value = state.genre; refresh(); return; }
            const row = e.target.closest(`.${NS}-row`); if (row) act('play', Number(row.dataset.id));
        });
        try { await buildIndex(); } catch (e) { console.warn('[SCE] bibliothèque', e); S().toast(e.message, { error: true }); return; }
        fillGenres(); refresh();
    }
    function unmount() { if (!mounted) return; bar?.remove(); list?.remove(); if (nativeList) nativeList.style.display = ''; bar = list = nativeList = null; mounted = false; }

    let timer = null;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { if (mounted && !bar?.isConnected) { mounted = false; } mount(); }, 300); };
    for (const fn of ['pushState', 'replaceState']) { const o = history[fn]; history[fn] = function (...a) { const r = o.apply(this, a); schedule(); return r; }; }
    window.addEventListener('popstate', schedule);
    new MutationObserver(() => { if (!mounted || !bar?.isConnected) schedule(); }).observe(document.body, { childList: true, subtree: true });
    schedule();
})();
