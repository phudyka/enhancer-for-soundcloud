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
              plName: 'Nom de la playlist', created: 'Playlist créée : {t}', tooMany: '500 titres maximum par playlist : les {n} premiers seront pris', none: 'Aucun titre ne correspond', reset: 'Réinitialiser', likes: 'Likes', filter: 'Filtre' },
        en: { search: 'Search your likes: title, artist, tag…', sort: 'Sort', added: 'Date liked', title: 'Title', artist: 'Artist', duration: 'Duration', plays: 'Plays', year: 'Year', genre: 'All genres',
              play: 'Play', shuffle: 'Shuffle+', playlist: 'Create playlist', tracks: 'tracks', indexing: 'Indexing likes… {n} / {t}', indexed: 'Library up to date: {n} tracks',
              plName: 'Playlist name', created: 'Playlist created: {t}', tooMany: '500 tracks max per playlist: the first {n} will be used', none: 'No matching tracks', reset: 'Reset', likes: 'Likes', filter: 'Filter' },
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
    // Tout vit dans la rangée native « Afficher … Filtre » : deux menus compacts
    // (tri, genre) avant le champ Filtre, que l'on remplace par notre recherche
    // à l'identique. Compteur et actions n'apparaissent qu'au-dessus des résultats.
    const CSS = `
        .${NS}-menu { position: relative; display: inline-block; margin-left: 8px; }
        .${NS}-menu > button { height: 32px; padding: 0 28px 0 12px; border-radius: 4px; border: 0; background: #303030; color: #fff; cursor: pointer;
            font: 500 13px ${FONT}; white-space: nowrap; max-width: 180px; overflow: hidden; text-overflow: ellipsis; position: relative; }
        .${NS}-menu > button::after { content: ''; position: absolute; right: 11px; top: 13px; border: 4px solid transparent; border-top: 5px solid #ccc; }
        .${NS}-menu > button:hover { background: #3a3a3a; }
        .${NS}-menu > button.m-on { color: #f50; }
        .${NS}-menu > button.m-on::after { border-top-color: #f50; }
        .${NS}-list-menu { position: absolute; top: 36px; left: 0; min-width: 180px; max-height: 320px; overflow: auto; background: #333; border-radius: 2px;
            box-shadow: 0 2px 8px rgba(0,0,0,.45); padding: 4px 0; z-index: 1000; display: none; font: 13px ${FONT}; }
        .${NS}-menu.m-open .${NS}-list-menu { display: block; }
        .${NS}-list-menu button { display: flex; justify-content: space-between; gap: 12px; width: 100%; height: 32px; padding: 0 12px; border: 0; background: transparent; color: #ccc; cursor: pointer; text-align: left; font: inherit; white-space: nowrap; }
        .${NS}-list-menu button:hover { background: #404040; color: #fff; }
        .${NS}-list-menu button.m-on { color: #f50; }
        .${NS}-list-menu button small { color: #888; font-variant-numeric: tabular-nums; }
        .${NS}-list-menu hr { border: 0; border-top: 1px solid #444; margin: 4px 0; }
        .${NS}-search { margin-left: 8px; }
        .${NS}-head { display: flex; align-items: center; gap: 8px; padding: 4px 24px 12px; color: #999; font: 13px ${FONT}; }
        .${NS}-head b { color: #fff; font-weight: 500; font-variant-numeric: tabular-nums; }
        .${NS}-head .sp { flex: 1; }
        .${NS}-head .sc-button { height: 28px !important; padding: 0 10px !important; font-size: 12px !important; }
        .${NS}-head .sc-button svg { width: 12px; height: 12px; fill: currentColor; margin-right: 5px; vertical-align: -1px; }
        .${NS}-list { padding: 0 24px 24px; font-family: ${FONT}; }
        .${NS}-row { display: grid; grid-template-columns: 40px minmax(0, 1fr) 120px 48px 56px; gap: 12px; align-items: center; height: 56px; padding: 0 8px; border-radius: 3px; cursor: pointer; color: #ccc; }
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
    const FONT = 'Söhne, system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif';
    let sortMenu = null, genreMenu = null, search = null, nativeFilter = null, head = null, list = null, nativeList = null, sentinel = null, rendered = 0, current = [];

    function injectStyles() { if ($(`#${NS}-styles`)) return; const s = document.createElement('style'); s.id = `${NS}-styles`; s.textContent = CSS; document.head.appendChild(s); }

    /** Menu déroulant compact, style menus SoundCloud. items: [{v, label, count, on}] */
    function menu(className, render) {
        const wrap = document.createElement('div'); wrap.className = `${NS}-menu ${className}`;
        wrap.innerHTML = `<button type="button"></button><div class="${NS}-list-menu"></div>`;
        const btn = wrap.firstElementChild, box = wrap.lastElementChild;
        btn.addEventListener('click', (e) => { e.stopPropagation(); const open = !wrap.classList.contains('m-open'); closeMenus(); if (open) { render(box); wrap.classList.add('m-open'); } });
        return wrap;
    }
    const closeMenus = () => document.querySelectorAll(`.${NS}-menu.m-open`).forEach((m) => m.classList.remove('m-open'));
    document.addEventListener('click', closeMenus);

    const SORTS = ['added', 'title', 'artist', 'duration', 'plays', 'year'];
    function renderSortMenu(box) {
        box.innerHTML = SORTS.map((k) => `<button type="button" data-k="${k}" class="${state.sort === k ? 'm-on' : ''}">${t(k)}<small>${state.sort === k ? (state.dir === 'asc' ? '↑' : '↓') : ''}</small></button>`).join('');
        box.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', (e) => {
            e.stopPropagation();
            const k = b.dataset.k;
            if (state.sort === k) state.dir = state.dir === 'asc' ? 'desc' : 'asc';        // re-clic : inverse l'ordre
            else { state.sort = k; state.dir = k === 'added' ? 'desc' : 'asc'; }
            closeMenus(); refresh();
        }));
    }
    function renderGenreMenu(box) {
        const counts = new Map();
        for (const id of ids) { const g = rows.get(id)?.genre; if (g) counts.set(g, (counts.get(g) || 0) + 1); }
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
        box.innerHTML = `<button type="button" data-g="" class="${state.genre ? '' : 'm-on'}">${t('genre')}<small>${ids.length.toLocaleString()}</small></button><hr>` +
            top.map(([g, n]) => `<button type="button" data-g="${esc(g)}" class="${state.genre === g ? 'm-on' : ''}">${esc(g)}<small>${n}</small></button>`).join('');
        box.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); state.genre = b.dataset.g; closeMenus(); refresh(); }));
    }
    function syncMenuLabels() {
        const sb = sortMenu.firstElementChild;
        sb.textContent = state.sort === 'added' && state.dir === 'desc' ? t('added') : `${t(state.sort)} ${state.dir === 'asc' ? '↑' : '↓'}`;
        sb.classList.toggle('m-on', state.sort !== 'added' || state.dir !== 'desc');
        const gb = genreMenu.firstElementChild;
        gb.textContent = state.genre || t('genre');
        gb.classList.toggle('m-on', !!state.genre);
    }

    function buildSearch() {
        // Même composant que le « Filtre » natif : mêmes classes, même place, mais sur toute la bibliothèque
        const inp = document.createElement('input');
        inp.type = 'search'; inp.className = `textfield__input sc-input sc-input-medium ${NS}-search`; inp.placeholder = nativeFilter?.placeholder || t('filter'); inp.autocomplete = 'off';
        inp.title = t('search');
        if (nativeFilter) { inp.style.width = getComputedStyle(nativeFilter).width; }
        let deb; inp.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => { state.q = inp.value; refresh(); }, 120); });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Escape') { inp.value = ''; state.q = ''; refresh(); } });
        return inp;
    }

    function buildHead() {
        const h = document.createElement('div'); h.className = `${NS}-head`;
        h.innerHTML = `<span class="c"></span><span class="sp"></span>
            <button type="button" class="sc-button sc-button-small sc-button-secondary" data-a="play"><svg viewBox="0 0 16 16"><path d="M4 2v12l9-6z"/></svg>${t('play')}</button>
            <button type="button" class="sc-button sc-button-small sc-button-secondary" data-a="shuffle"><svg viewBox="0 0 16 16"><path d="M11.5 1.5l3 3-3 3V5.75h-1.2c-.5 0-.97.25-1.25.66L7.9 8l-1.15-1.6.6-.84A3 3 0 0 1 10.3 4.25h1.2V1.5zM1 4.25h2.3a3 3 0 0 1 2.45 1.27l3.3 4.62c.28.41.75.66 1.25.66h1.2V8.5l3 3-3 3v-2.25h-1.2a3 3 0 0 1-2.45-1.27L4.55 6.36a1.5 1.5 0 0 0-1.25-.61H1v-1.5zM1 10.25h2.3c.5 0 .97-.25 1.25-.66l.6-.84L6.3 10.35l-.55.77A3 3 0 0 1 3.3 12.4H1v-1.5z"/></svg>${t('shuffle')}</button>
            <button type="button" class="sc-button sc-button-small sc-button-primary" data-a="create"><svg viewBox="0 0 16 16"><path d="M7 2h2v5h5v2H9v5H7V9H2V7h5z"/></svg>${t('playlist')}</button>`;
        h.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => act(b.dataset.a)));
        return h;
    }

    function label() {
        const parts = [];
        if (state.genre) parts.push(state.genre);
        if (state.q.trim()) parts.push(`« ${state.q.trim()} »`);
        return parts.length ? `${parts.join(' · ')} · ${t('likes')}` : t('likes');
    }

    function refresh() {
        current = selection();
        syncMenuLabels();
        const on = active();
        if (nativeList) nativeList.style.display = on ? 'none' : '';
        head.style.display = on ? '' : 'none';
        list.style.display = on ? '' : 'none';
        if (!on) return;
        const total = current.reduce((a, r) => a + r.dur, 0);
        head.querySelector('.c').innerHTML = `<b>${current.length.toLocaleString()}</b> ${t('tracks')} · ${fmtTotal(total)}`;
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
        // Rangée native : [titre] [Afficher ▦ ☰ 🔀] [Tri ▾] [Genre ▾] [Filtre → notre recherche]
        const filters = top.querySelector('.collectionSection__filters');
        nativeFilter = filters?.querySelector('input');
        sortMenu = menu('m-sort', renderSortMenu);
        genreMenu = menu('m-genre', renderGenreMenu);
        search = buildSearch();
        if (filters) {
            filters.before(sortMenu, genreMenu);
            const field = nativeFilter?.closest('.textfield, .collectionSection__filterText') || filters;
            field.style.display = 'none';
            filters.appendChild(search);
        } else { top.append(sortMenu, genreMenu, search); }
        head = buildHead(); head.style.display = 'none';
        list = document.createElement('div'); list.className = `${NS}-list`; list.style.display = 'none';
        top.after(head); head.after(list);
        nativeList = $(SEL.list);
        list.addEventListener('click', (e) => {
            if (e.target.closest('a')) return;
            const g = e.target.closest(`.${NS}-genre`); if (g) { state.genre = g.textContent; refresh(); return; }
            const row = e.target.closest(`.${NS}-row`); if (row) act('play', Number(row.dataset.id));
        });
        syncMenuLabels();
        try { await buildIndex(); } catch (e) { console.warn('[SCE] bibliothèque', e); S().toast(e.message, { error: true }); return; }
        refresh();
    }
    function unmount() {
        if (!mounted) return;
        for (const el of [sortMenu, genreMenu, search, head, list]) el?.remove();
        const field = nativeFilter?.closest('.textfield, .collectionSection__filterText'); if (field) field.style.display = '';
        if (nativeList) nativeList.style.display = '';
        sortMenu = genreMenu = search = head = list = nativeList = nativeFilter = null; mounted = false;
    }

    let timer = null;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { if (mounted && !sortMenu?.isConnected) { unmount(); } mount(); }, 300); };
    for (const fn of ['pushState', 'replaceState']) { const o = history[fn]; history[fn] = function (...a) { const r = o.apply(this, a); schedule(); return r; }; }
    window.addEventListener('popstate', schedule);
    new MutationObserver(() => { if (!mounted || !sortMenu?.isConnected) schedule(); }).observe(document.body, { childList: true, subtree: true });
    schedule();
})();
