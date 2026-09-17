/*
 * Enhancer for SoundCloud™ — Bibliothèque des likes (monde principal)
 *
 * Sur /you/likes : recherche instantanée (titre, artiste, tag), tri (date
 * d'ajout, titre, artiste, durée, écoutes, année), filtre par genre, puis sur
 * les résultats : lire, Shuffle+ et sélectionner pour les actions groupées.
 *
 * Données : identifiants des likes (cache de shuffle.js) + métadonnées par
 * /tracks?ids=… (50 par requête, 4 en parallèle, ~7 s pour 5 000 titres la
 * première fois), stockées dans IndexedDB « sce-library ». Mises à jour
 * incrémentales : seuls les identifiants inconnus sont téléchargés, les titres
 * qui ne sont plus likés sont retirés.
 *
 * UI : ligne d'outils sous l'en-tête, dans les composants SoundCloud
 * (sc-input, sc-button). La grille native reste affichée tant qu'aucun tri,
 * filtre ou recherche n'est actif ; la sélection remplace aussi cette liste.
 */
(() => {
    'use strict';
    try { if (JSON.parse(localStorage.getItem('scsp:settings') || '{}').extensionDisabled === true) return; } catch {}
    const NS = 'sce-lib';
    const BATCH = 50, PARALLEL = 4, PAGE = 120;
    const SEL = { top: '.collectionSection__top', list: '.collectionSection .lazyLoadingList, .collectionSection__list', section: '.collectionSection' };
    const $ = (s, r = document) => r.querySelector(s);
    const S = () => window.__scsp, D = () => window.__sceDialog;

    const T = {
        fr: { search: 'Rechercher dans vos likes : titre, artiste, tag…', sort: 'Trier', added: "Date d'ajout", title: 'Titre', artist: 'Artiste', duration: 'Durée', plays: 'Écoutes', year: 'Année', genre: 'Tous les genres',
              play: 'Lire', shuffle: 'Shuffle+', playlist: 'Créer une playlist', tracks: 'titres', indexing: 'Indexation des likes… {n} / {t}', indexed: 'Bibliothèque à jour : {n} titres',
              plName: 'Nom de la playlist', created: 'Playlist créée : {t}', tooMany: '{n} titres maximum par playlist. Réduisez la sélection.', none: 'Aucun titre ne correspond', reset: 'Réinitialiser', likes: 'Likes', filter: 'Filtre',
              select: 'Sélectionner des titres', selectAll: 'Tout sélectionner', selectResults: 'Sélectionner les résultats', clear: 'Effacer la sélection', selected: '{n} sélectionnés', add: 'Ajouter à une playlist', remove: 'Retirer des favoris', removePlaylist: 'Retirer d’une playlist', confirmRemove: 'Retirer {n} titres de vos favoris ? Cette action ne supprime pas les morceaux de SoundCloud.', confirmPlaylistRemove: 'Retirer les titres sélectionnés de « {title} » ? Cette action ne supprime pas les morceaux de SoundCloud.', removed: '{n} favoris retirés', partial: '{n} favoris retirés ; {f} échecs', addedTo: '{n} titres ajoutés à la playlist', removedFrom: '{n} titres retirés de la playlist', noPlaylists: 'Aucune playlist trouvée', actionError: 'Action impossible : {error}' },
        en: { search: 'Search your likes: title, artist, tag…', sort: 'Sort', added: 'Date liked', title: 'Title', artist: 'Artist', duration: 'Duration', plays: 'Plays', year: 'Year', genre: 'All genres',
              play: 'Play', shuffle: 'Shuffle+', playlist: 'Create playlist', tracks: 'tracks', indexing: 'Indexing likes… {n} / {t}', indexed: 'Library up to date: {n} tracks',
              plName: 'Playlist name', created: 'Playlist created: {t}', tooMany: '{n} tracks maximum per playlist. Reduce the selection.', none: 'No matching tracks', reset: 'Reset', likes: 'Likes', filter: 'Filter',
              select: 'Select tracks', selectAll: 'Select all', selectResults: 'Select results', clear: 'Clear selection', selected: '{n} selected', add: 'Add to playlist', remove: 'Remove from likes', removePlaylist: 'Remove from a playlist', confirmRemove: 'Remove {n} tracks from your likes? This will not delete the tracks from SoundCloud.', confirmPlaylistRemove: 'Remove selected tracks from “{title}”? This will not delete the tracks from SoundCloud.', removed: '{n} likes removed', partial: '{n} likes removed; {f} failed', addedTo: '{n} tracks added to playlist', removedFrom: '{n} tracks removed from playlist', noPlaylists: 'No playlists found', actionError: 'Action failed: {error}' },
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
                const worker = async () => {
                    while (batches.length) {
                        const b = batches.shift();
                        try {
                            const res = await S().api(`/tracks?ids=${b.join(',')}`);
                            const got = (res || []).map(slim); await DB.put(got); got.forEach((r) => known.set(r.id, r));
                        } catch (e) { console.warn('[SCE] lot ignoré', e.message); }
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

    /** Clés de tri et de recherche sans accents, calculées une fois par titre (et non à chaque comparaison). */
    const folded = new WeakMap();
    const keys = (r) => { let k = folded.get(r); if (!k) { k = { title: fold(r.title), artist: fold(r.artist), all: fold(`${r.title} ${r.artist} ${r.genre} ${r.tags}`) }; folded.set(r, k); } return k; };

    function selection() {
        const q = fold(state.q).trim();
        const terms = q ? q.split(/\s+/) : [];
        let list = ids.map((id) => rows.get(id) || (!terms.length && !state.genre ? { id, title: `#${id}`, artist: '', dur: 0, genre: '', tags: '', plays: 0, year: 0 } : null)).filter(Boolean);
        if (state.genre) list = list.filter((r) => r.genre === state.genre);
        if (terms.length) list = list.filter((r) => { const h = keys(r).all; return terms.every((w) => h.includes(w)); });
        const cmp = {
            added:    null,                                              // `ids` est déjà dans l'ordre d'ajout
            title:    (a, b) => keys(a).title.localeCompare(keys(b).title),
            artist:   (a, b) => keys(a).artist.localeCompare(keys(b).artist) || keys(a).title.localeCompare(keys(b).title),
            duration: (a, b) => a.dur - b.dur,
            plays:    (a, b) => a.plays - b.plays,
            year:     (a, b) => a.year - b.year,
        }[state.sort];
        if (cmp) list.sort(cmp);
        if ((state.sort === 'added') !== (state.dir === 'desc')) list.reverse(); // « ajout » : plus récent d'abord par défaut
        return list;
    }

    // ── UI ────────────────────────────────────────────────────────
    const FONT = 'Söhne, system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif';
    // Tout vit dans la rangée native « Afficher … Filtre » : deux menus compacts
    // (tri, genre) avant le champ Filtre, que l'on remplace par notre recherche
    // à l'identique. Compteur et actions n'apparaissent qu'au-dessus des résultats.
    const CSS = `
        .${NS}-menu { position: relative; display: inline-block; margin-left: 8px; }
        .${NS}-menu > button { height: 32px; padding: 0 28px 0 12px; border-radius: 4px; border: 0; background: #303030; color: #fff; cursor: pointer;
            font: 500 13px ${FONT}; white-space: nowrap; max-width: 180px; overflow: hidden; text-overflow: ellipsis; position: relative; }
        .${NS}-menu > button::after { content: ''; position: absolute; right: 11px; top: 13px; border: 4px solid transparent; border-top: 5px solid #ccc; }
        .${NS}-menu > button:hover { background: #3a3a3a; }
        .${NS}-menu > button.m-on { color: var(--sce-accent, #f50); padding-right: 30px; }
        .${NS}-menu > button.m-on::after { display: none; }
        /* Filtre actif : la flèche laisse place à une croix qui retire le filtre d'un clic */
        .${NS}-clear { position: absolute; right: 4px; top: 4px; width: 24px; height: 24px; border: 0; border-radius: 50%; background: transparent; color: var(--sce-accent, #f50); cursor: pointer; display: none; font: 16px/24px ${FONT}; text-align: center; padding: 0; }
        .${NS}-clear:hover { background: color-mix(in srgb, var(--sce-accent, #f50) 18%, transparent); color: #fff; }
        .${NS}-menu.m-on .${NS}-clear { display: block; }
        .${NS}-list-menu { position: absolute; top: 36px; left: 0; min-width: 180px; max-height: 320px; overflow: auto; background: #333; border-radius: 2px;
            box-shadow: 0 2px 8px rgba(0,0,0,.45); padding: 4px 0; z-index: 1000; display: none; font: 13px ${FONT}; }
        .${NS}-menu.m-open .${NS}-list-menu { display: block; }
        .${NS}-list-menu button { display: flex; justify-content: space-between; gap: 12px; width: 100%; height: 32px; padding: 0 12px; border: 0; background: transparent; color: #ccc; cursor: pointer; text-align: left; font: inherit; white-space: nowrap; }
        .${NS}-list-menu button:hover { background: #404040; color: #fff; }
        .${NS}-list-menu button.m-on { color: var(--sce-accent, #f50); }
        .${NS}-list-menu button small { color: #888; font-variant-numeric: tabular-nums; }
        .${NS}-list-menu hr { border: 0; border-top: 1px solid #444; margin: 4px 0; }
        .${NS}-search { margin-left: 8px; }
        .${NS}-head { display: flex; align-items: center; gap: 8px; padding: 4px 24px 12px; color: #999; font: 13px ${FONT}; }
        .${NS}-head b { color: #fff; font-weight: 500; font-variant-numeric: tabular-nums; }
        .${NS}-head .sp { flex: 1; }
        .${NS}-head .sc-button { height: 28px !important; padding: 0 10px !important; font-size: 12px !important; }
        .${NS}-head .sc-button svg { width: 12px; height: 12px; fill: currentColor; margin-right: 5px; vertical-align: -1px; }
        .${NS}-head { flex-wrap: wrap; }
        .${NS}-head .bulk-count { color: var(--sce-accent, #f50); min-width: 90px; }
        .${NS}-head [data-a="remove"] { color: #f77; }
        .${NS}-head [data-a]:disabled { opacity: .45; cursor: not-allowed; }
        .${NS}-pick { display: inline-flex; align-items: center; gap: 4px; padding: 4px; color: #fff; font: 12px ${FONT}; cursor: pointer; }
        .${NS}-pick input { accent-color: var(--sce-accent, #f50); width: 18px; height: 18px; cursor: pointer; }
        .${NS}-tile .${NS}-pick { position: relative; z-index: 2; margin-bottom: 4px; }
        .${NS}-list { padding: 0 24px 24px; font-family: ${FONT}; }
        /* Mode « badges » : même grille que les favoris natifs */
        .${NS}-list.m-badges { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 28px 20px; }
        .${NS}-tile { cursor: pointer; min-width: 0; }
        .${NS}-tile .${NS}-art { width: 100%; height: auto; aspect-ratio: 1; border-radius: 2px; }
        .${NS}-tile:hover .${NS}-art::after { content: ''; position: absolute; inset: 0; background: rgba(0,0,0,.25); }
        .${NS}-tile .${NS}-play { position: absolute; left: 50%; top: 50%; width: 60px; height: 60px; margin: -30px 0 0 -30px; border-radius: 50%; background: var(--sce-accent, #f50) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%23fff'%3E%3Cpath d='M5 3v10l8-5z'/%3E%3C/svg%3E") center/26px no-repeat; opacity: 0; transition: opacity .12s; box-shadow: 0 2px 8px rgba(0,0,0,.4); }
        .${NS}-tile:hover .${NS}-play { opacity: 1; }
        .${NS}-tile .${NS}-title { margin-top: 8px; font-size: 14px; }
        .${NS}-tile .${NS}-artist { font-size: 14px; }
        .${NS}-tile .${NS}-sub { color: #999; font-size: 12px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .${NS}-list.m-badges .${NS}-more, .${NS}-list.m-badges .${NS}-empty { grid-column: 1 / -1; }
        .${NS}-row { display: grid; grid-template-columns: 28px 40px minmax(0, 1fr) 120px 48px 56px; gap: 12px; align-items: center; height: 56px; padding: 0 8px; border-radius: 3px; cursor: pointer; color: #ccc; }
        .${NS}-row:hover { background: #262626; color: #fff; }
        .${NS}-art { width: 40px; height: 40px; border-radius: 2px; background: #333 center/cover no-repeat; position: relative; }
        .${NS}-row:hover .${NS}-art::after { content: ''; position: absolute; inset: 0; border-radius: 2px; background: rgba(0,0,0,.45) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%23fff'%3E%3Cpath d='M4 2v12l9-6z'/%3E%3C/svg%3E") center/16px no-repeat; }
        .${NS}-meta { min-width: 0; }
        .${NS}-title { color: #fff; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .${NS}-title .snip { color: var(--sce-accent, #f50); font-size: 10px; font-weight: 700; margin-left: 6px; vertical-align: 1px; }
        .${NS}-artist { color: #999; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .${NS}-artist a { color: inherit; text-decoration: none; } .${NS}-artist a:hover { color: #fff; text-decoration: underline; }
        .${NS}-genre { color: #999; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; } .${NS}-genre:hover { color: var(--sce-accent, #f50); }
        .${NS}-num { color: #999; font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; }
        .${NS}-more { height: 8px; }
        .${NS}-empty { color: #999; padding: 40px 0; text-align: center; }
    `;
    let sortMenu = null, genreMenu = null, search = null, nativeFilter = null, head = null, list = null, nativeList = null, sentinel = null, rendered = 0, current = [];
    let selecting = false, busy = false;
    const selectedIds = new Set();

    function injectStyles() { if ($(`#${NS}-styles`)) return; const s = document.createElement('style'); s.id = `${NS}-styles`; s.textContent = CSS; document.head.appendChild(s); }

    /** Menu déroulant compact, style menus SoundCloud. items: [{v, label, count, on}] */
    function menu(className, render, onClear) {
        const wrap = document.createElement('div'); wrap.className = `${NS}-menu ${className}`;
        wrap.innerHTML = `<button type="button"></button><button type="button" class="${NS}-clear" title="${t('reset')}">×</button><div class="${NS}-list-menu"></div>`;
        const btn = wrap.firstElementChild, box = wrap.lastElementChild;
        btn.addEventListener('click', (e) => { e.stopPropagation(); const open = !wrap.classList.contains('m-open'); closeMenus(); if (open) { render(box); wrap.classList.add('m-open'); } });
        wrap.querySelector(`.${NS}-clear`).addEventListener('click', (e) => { e.stopPropagation(); closeMenus(); onClear(); refresh(); });
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
        const sortOn = state.sort !== 'added' || state.dir !== 'desc';
        sb.classList.toggle('m-on', sortOn); sortMenu.classList.toggle('m-on', sortOn);
        const gb = genreMenu.firstElementChild;
        gb.textContent = state.genre || t('genre');
        gb.classList.toggle('m-on', !!state.genre); genreMenu.classList.toggle('m-on', !!state.genre);
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
            <button type="button" class="sc-button sc-button-small sc-button-secondary" data-a="select">${t('select')}</button>
            <button type="button" class="sc-button sc-button-small sc-button-secondary" data-a="all">${t('selectAll')}</button>
            <button type="button" class="sc-button sc-button-small sc-button-secondary" data-a="clear">${t('clear')}</button>
            <span class="bulk-count" aria-live="polite"></span>
            <button type="button" class="sc-button sc-button-small sc-button-primary" data-a="create">${t('playlist')}</button>
            <button type="button" class="sc-button sc-button-small sc-button-secondary" data-a="add">${t('add')}</button>
            <button type="button" class="sc-button sc-button-small sc-button-secondary" data-a="remove">${t('remove')}</button>
            <button type="button" class="sc-button sc-button-small sc-button-secondary" data-a="removePlaylist">${t('removePlaylist')}</button>`;
        h.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
            if (b.dataset.a === 'select') { selecting = !selecting; refresh(); }
            else if (b.dataset.a === 'all') { selecting = true; window.__sceLibraryBulk.scopeIds(ids, current, active()).forEach((id) => selectedIds.add(id)); refresh(); }
            else if (b.dataset.a === 'clear') { selectedIds.clear(); refresh(); }
            else act(b.dataset.a).catch((e) => S().toast(/Playlist limit/.test(e.message) ? t('tooMany', { n: S().maxTracks }) : t('actionError', { error: e.message }), { error: true }));
        }));
        return h;
    }

    function label() {
        const parts = [];
        if (state.genre) parts.push(state.genre);
        if (state.q.trim()) parts.push(`« ${state.q.trim()} »`);
        return parts.length ? `${parts.join(' · ')} · ${t('likes')}` : t('likes');
    }

    /** Suit le choix natif « Afficher » : badges (grille) ou liste. */
    const mode = () => (document.querySelector('.listDisplayToggle__listToggle')?.classList.contains('sc-button-selected') ? 'list' : 'badges');

    function refresh() {
        if (!mounted || !list) return;                                   // page quittée pendant une action ou l'indexation
        current = selection();
        syncMenuLabels();
        list.classList.toggle('m-badges', mode() === 'badges');
        const on = active() || selecting;
        if (nativeList) nativeList.style.display = on ? 'none' : '';
        head.style.display = '';
        list.style.display = on ? '' : 'none';
        const count = active() ? current.length : ids.length;
        head.querySelector('.c').innerHTML = `<b>${count.toLocaleString()}</b> ${t('tracks')}${active() ? ` · ${fmtTotal(current.reduce((a, r) => a + r.dur, 0))}` : ''}`;
        head.querySelector('.bulk-count').textContent = t('selected', { n: selectedIds.size });
        head.querySelector('[data-a="all"]').textContent = t(active() ? 'selectResults' : 'selectAll');
        for (const button of head.querySelectorAll('[data-a="create"], [data-a="add"], [data-a="remove"], [data-a="removePlaylist"]')) button.disabled = busy || !selectedIds.size;
        if (!on) return;
        list.innerHTML = ''; rendered = 0;
        if (!current.length) { list.innerHTML = `<div class="${NS}-empty">${t('none')}</div>`; return; }
        renderMore();
    }

    function renderMore() {
        const frag = document.createDocumentFragment();
        const badges = mode() === 'badges';
        for (const r of current.slice(rendered, rendered + PAGE)) {
            const row = document.createElement('div');
            row.dataset.id = r.id;
            const pick = `<label class="${NS}-pick"><input type="checkbox" data-pick="${r.id}" ${selectedIds.has(r.id) ? 'checked' : ''} aria-label="${esc(r.title)}"></label>`;
            const art = (r.art || '').replace('-t120x120.', badges ? '-t200x200.' : '-t120x120.');
            if (badges) {
                row.className = `${NS}-tile`;
                row.innerHTML = `${pick}
                    <div class="${NS}-art" style="${art ? `background-image:url('${art}')` : ''}"><span class="${NS}-play"></span></div>
                    <div class="${NS}-title" title="${esc(r.title)}">${esc(r.title)}${r.snip ? '<span class="snip">GO+</span>' : ''}</div>
                    <div class="${NS}-artist"><a href="${esc(r.artistUrl)}">${esc(r.artist)}</a></div>
                    <div class="${NS}-sub">${[r.genre, r.year || '', fmtDur(r.dur)].filter(Boolean).map(esc).join(' · ')}</div>`;
            } else {
                row.className = `${NS}-row`;
                row.innerHTML = `${pick}
                    <div class="${NS}-art" style="${art ? `background-image:url('${art}')` : ''}"></div>
                    <div class="${NS}-meta"><div class="${NS}-title">${esc(r.title)}${r.snip ? '<span class="snip">GO+</span>' : ''}</div>
                        <div class="${NS}-artist"><a href="${esc(r.artistUrl)}">${esc(r.artist)}</a></div></div>
                    <div class="${NS}-genre" title="${esc(r.genre)}">${esc(r.genre)}</div>
                    <div class="${NS}-num">${r.year || ''}</div>
                    <div class="${NS}-num">${fmtDur(r.dur)}</div>`;
            }
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
        if (busy) return;
        if (['create', 'add', 'remove', 'removePlaylist'].includes(kind)) {
            const chosen = [...selectedIds];
            if (!chosen.length) return;
            const bulk = window.__sceLibraryBulk;
            if (['create', 'add'].includes(kind) && chosen.length > S().maxTracks) { S().toast(t('tooMany', { n: S().maxTracks }), { error: true }); return; }
            if (kind === 'remove' && !await D().confirm(t('confirmRemove', { n: chosen.length }), { ok: t('remove'), danger: true })) return;
            let title, playlistId, targetPlaylist, me;
            if (kind === 'create') { title = await D().input(t('plName'), label()); if (!title?.trim()) return; }
            if (kind === 'add' || kind === 'removePlaylist') {
                me = await S().me();
                const playlists = await bulk.ownPlaylists(S().api, me.id);
                if (!playlists.length) { S().toast(t('noPlaylists'), { error: true }); return; }
                targetPlaylist = playlists[await D().pick(t(kind === 'add' ? 'add' : 'removePlaylist'), playlists.map((pl) => ({ label: pl.title, detail: pl.track_count ?? '' })))];
                if (!targetPlaylist) return;
                playlistId = targetPlaylist.id;
                if (kind === 'removePlaylist' && !await D().confirm(t('confirmPlaylistRemove', { title: targetPlaylist.title }), { ok: t('removePlaylist'), danger: true })) return;
            }
            busy = true; refresh();
            try {
                if (kind === 'create') {
                    const tracks = bulk.playlistTracks(chosen, [], S().maxTracks);
                    const pl = await S().api('/playlists', { method: 'POST', body: { playlist: { title: title.trim(), sharing: 'private', tracks, tag_list: state.genre || '' } } });
                    S().toast(t('created', { t: pl.title }));
                } else if (kind === 'add') {
                    const n = await bulk.addToPlaylist(S().api, playlistId, chosen, S().maxTracks);
                    S().toast(t('addedTo', { n }));
                } else if (kind === 'removePlaylist') {
                    const n = await bulk.removeFromPlaylist(S().api, playlistId, chosen, me.id);
                    S().toast(t('removedFrom', { n }));
                } else {
                    const result = await bulk.unlikeMany(S().api, chosen);
                    const gone = new Set(result.done);
                    ids = ids.filter((id) => !gone.has(id));
                    result.done.forEach((id) => { rows.delete(id); selectedIds.delete(id); });
                    if (result.done.length) await DB.del(result.done);
                    S().toast(t(result.failed.length ? 'partial' : 'removed', { n: result.done.length, f: result.failed.length }));
                }
                if (kind !== 'remove') selectedIds.clear();
            } finally { busy = false; refresh(); }
            return;
        }
        let sel = current.length ? current : selection();
        if (fromId) { const i = sel.findIndex((r) => r.id === fromId); if (i > 0) sel = sel.slice(i); }
        const idList = sel.map((r) => r.id);
        if (idList.length < 1) return;
        const name = label();
        if (kind === 'shuffle') return S().shuffleIds(idList, { name, label: name });
        if (kind === 'play')    return S().playIds(idList, { name, label: name, summary: `${Math.min(idList.length, S().maxTracks).toLocaleString()} ${t('tracks')}` });
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
        sortMenu = menu('m-sort', renderSortMenu, () => { state.sort = 'added'; state.dir = 'desc'; });
        genreMenu = menu('m-genre', renderGenreMenu, () => { state.genre = ''; });
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
            if (e.target.closest(`.${NS}-pick`)) return;
            if (e.target.closest('a')) return;
            const g = e.target.closest(`.${NS}-genre`); if (g) { state.genre = g.textContent; refresh(); return; }
            const row = e.target.closest(`.${NS}-row, .${NS}-tile`);
            if (row) { const r = rows.get(Number(row.dataset.id)); if (r?.url) S().openAndPlay(new URL(r.url).pathname); }
        });
        list.addEventListener('change', (e) => {
            const box = e.target.closest('[data-pick]');
            if (!box) return;
            const id = Number(box.dataset.pick);
            if (box.checked) selectedIds.add(id); else selectedIds.delete(id);
            head.querySelector('.bulk-count').textContent = t('selected', { n: selectedIds.size });
            for (const button of head.querySelectorAll('[data-a="create"], [data-a="add"], [data-a="remove"], [data-a="removePlaylist"]')) button.disabled = busy || !selectedIds.size;
        });
        // Le choix natif « Afficher » (badges / liste) bascule aussi notre rendu
        top.querySelector('.listDisplayToggle__options')?.addEventListener('click', () => setTimeout(() => { if (active() || selecting) refresh(); }, 50));
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
        selecting = false; selectedIds.clear();
    }

    // Échap : réinitialise tri, genre et recherche (un seul écouteur, pas un par montage)
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !mounted || !active()) return;
        const el = document.activeElement; if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
        state.q = ''; state.genre = ''; state.sort = 'added'; state.dir = 'desc'; if (search) search.value = ''; refresh();
    });

    let timer = null;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { if (mounted && !sortMenu?.isConnected) { unmount(); } mount(); }, 300); };
    window.addEventListener('sce:settings-change', schedule); // réglage « Bibliothèque » appliqué sans recharger
    for (const fn of ['pushState', 'replaceState']) { const o = history[fn]; history[fn] = function (...a) { const r = o.apply(this, a); schedule(); return r; }; }
    window.addEventListener('popstate', schedule);
    const onLikes = () => location.pathname.startsWith('/you/likes');
    (window.__sceShared?.onDom || ((fn) => new MutationObserver(fn).observe(document.body, { childList: true, subtree: true })))(() => { if (mounted ? !sortMenu?.isConnected : onLikes()) schedule(); });
    schedule();
})();
