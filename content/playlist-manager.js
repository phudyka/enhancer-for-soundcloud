/* Direct and bulk track actions on playlists owned by the current user. */
(() => {
    'use strict';
    try { if (JSON.parse(localStorage.getItem('scsp:settings') || '{}').extensionDisabled === true) return; } catch {}

    const NS = 'sce-playlist-manager';
    const $ = (selector, root = document) => root.querySelector(selector);
    const fr = (document.documentElement.lang || 'en').startsWith('fr');
    const labels = fr ? {
        manage: 'Gérer les titres', close: 'Fermer', selectAll: 'Tout sélectionner', clear: 'Effacer la sélection',
        selected: 'sélectionnés', remove: 'Retirer', add: 'Ajouter à une playlist', create: 'Créer une playlist',
        unlike: 'Retirer des likes', playlistName: 'Nom de la playlist',
        noPlaylists: 'Aucune playlist trouvée', confirmRemove: 'Retirer {n} titre(s) de « {title} » ? Les morceaux ne seront pas supprimés de SoundCloud.',
        confirmUnlike: 'Retirer {n} titre(s) de vos likes ?', removed: '{n} titre(s) retiré(s) de la playlist',
        added: '{n} titre(s) ajouté(s)', created: 'Playlist créée : {title}', unliked: '{n} like(s) retiré(s), {f} échec(s)',
        error: 'Action impossible : {error}', limit: 'Une playlist est limitée à {n} titres.', loading: 'Chargement des titres…',
    } : {
        manage: 'Manage tracks', close: 'Close', selectAll: 'Select all', clear: 'Clear selection',
        selected: 'selected', remove: 'Remove', add: 'Add to playlist', create: 'Create playlist',
        unlike: 'Remove from likes', playlistName: 'Playlist name',
        noPlaylists: 'No playlists found', confirmRemove: 'Remove {n} track(s) from “{title}”? The tracks will remain on SoundCloud.',
        confirmUnlike: 'Remove {n} track(s) from your likes?', removed: '{n} track(s) removed from playlist',
        added: '{n} track(s) added', created: 'Playlist created: {title}', unliked: '{n} like(s) removed, {f} failed',
        error: 'Action failed: {error}', limit: 'A playlist is limited to {n} tracks.', loading: 'Loading tracks…',
    };
    const t = (key, vars = {}) => labels[key].replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
    const bulk = () => window.__sceLibraryBulk;
    const S = () => window.__scsp, D = () => window.__sceDialog;
    const isPlaylist = () => /^\/[^/]+\/sets\/[^/]+/.test(location.pathname);
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    let current = null, sequence = 0, scheduled = null, mountingPath = null, unavailablePath = null, mePromise = null;

    function unmount() {
        current?.button.remove();
        current?.panel?.remove();
        current = null;
    }

    async function fullTrackDetails(tracks) {
        const missing = [...new Set(tracks.filter((track) => !track.title).map((track) => track.id))];
        if (!missing.length) return tracks;
        const details = new Map();
        for (let i = 0; i < missing.length; i += 50) {
            try {
                const page = await S().api(`/tracks?ids=${missing.slice(i, i + 50).join(',')}`);
                for (const track of Array.isArray(page) ? page : []) details.set(track.id, track);
            } catch { /* Les identifiants restent sélectionnables si les métadonnées manquent. */ }
        }
        return tracks.map((track) => details.get(track.id) || track);
    }

    function render(ctx) {
        const panel = ctx.panel;
        panel.querySelector('[data-count]').textContent = `${ctx.selected.size} ${t('selected')}`;
        panel.querySelector('[data-action="all"]').disabled = ctx.busy;
        panel.querySelector('[data-action="clear"]').disabled = ctx.busy || !ctx.selected.size;
        for (const button of panel.querySelectorAll('[data-action="remove"], [data-action="add"], [data-action="create"], [data-action="unlike"]')) {
            button.disabled = ctx.busy || !ctx.selected.size;
        }
        const list = panel.querySelector('[data-list]');
        list.replaceChildren();
        for (const track of ctx.tracks) {
            const id = track.id;
            const row = document.createElement('div');
            row.className = `${NS}-row`;
            const title = track.title || `#${id}`;
            row.innerHTML = `<label><input type="checkbox" data-id="${id}" ${ctx.selected.has(id) ? 'checked' : ''} ${ctx.busy ? 'disabled' : ''}><span>${esc(title)}</span></label><button type="button" class="sc-button sc-button-small sc-button-secondary" data-remove="${id}" ${ctx.busy ? 'disabled' : ''}>${t('remove')}</button>`;
            list.appendChild(row);
        }
    }

    async function act(ctx, action, singleId) {
        if (ctx.busy) return;
        const selected = singleId == null ? [...ctx.selected] : [singleId];
        if (!selected.length) return;
        if (['add', 'create'].includes(action) && selected.length > S().maxTracks) {
            S().toast(t('limit', { n: S().maxTracks }), { error: true }); return;
        }
        let title, target;
        try {
            if (action === 'remove' && !await D().confirm(t('confirmRemove', { n: selected.length, title: ctx.playlist.title }), { ok: t('remove'), danger: true })) return;
            if (action === 'unlike' && !await D().confirm(t('confirmUnlike', { n: selected.length }), { ok: t('unlike'), danger: true })) return;
            if (action === 'create') { title = await D().input(t('playlistName'), ctx.playlist.title); if (!title?.trim()) return; }
            if (action === 'add') {
                const playlists = await bulk().ownPlaylists(S().api, ctx.meId);
                if (!playlists.length) { S().toast(t('noPlaylists'), { error: true }); return; }
                target = playlists[await D().pick(t('add'), playlists.map((pl) => ({ label: pl.title, detail: pl.track_count ?? '' })))];
                if (!target) return;
            }
            ctx.busy = true; render(ctx);
            if (action === 'remove') {
                const count = await bulk().removeFromPlaylist(S().api, ctx.playlist.id, selected, ctx.meId);
                const removed = new Set(selected.map(String));
                ctx.tracks = ctx.tracks.filter((track) => !removed.has(String(track.id)));
                selected.forEach((id) => ctx.selected.delete(id));
                S().toast(t('removed', { n: count }));
                if (count) location.reload();
            } else if (action === 'add') {
                const count = await bulk().addToPlaylist(S().api, target.id, selected, S().maxTracks);
                S().toast(t('added', { n: count }));
                ctx.selected.clear();
            } else if (action === 'create') {
                const pl = await S().api('/playlists', { method: 'POST', body: { playlist: { title: title.trim(), sharing: 'private', tracks: selected } } });
                S().toast(t('created', { title: pl.title }));
                ctx.selected.clear();
            } else if (action === 'unlike') {
                const result = await bulk().unlikeMany(S().api, selected);
                result.done.forEach((id) => ctx.selected.delete(id));
                S().toast(t('unliked', { n: result.done.length, f: result.failed.length }));
            }
        } catch (error) {
            S().toast(t('error', { error: error.message }), { error: true });
        } finally {
            ctx.busy = false;
            if (ctx.panel?.isConnected) render(ctx);
        }
    }

    async function open(ctx) {
        if (ctx.panel) { ctx.panel.remove(); ctx.panel = null; ctx.selected.clear(); return; }
        const panel = document.createElement('section');
        panel.className = NS;
        panel.innerHTML = `<div class="${NS}-toolbar"><strong>${esc(ctx.playlist.title)}</strong><span data-count></span><button type="button" data-action="all">${t('selectAll')}</button><button type="button" data-action="clear">${t('clear')}</button><button type="button" data-action="add">${t('add')}</button><button type="button" data-action="create">${t('create')}</button><button type="button" data-action="unlike">${t('unlike')}</button><button type="button" data-action="remove">${t('remove')}</button><button type="button" data-action="close">${t('close')}</button></div><div data-list>${t('loading')}</div>`;
        ctx.button.closest('.soundActions')?.after(panel);
        ctx.panel = panel;
        panel.addEventListener('change', (event) => {
            const input = event.target.closest('[data-id]');
            if (!input) return;
            const id = Number(input.dataset.id);
            if (input.checked) ctx.selected.add(id); else ctx.selected.delete(id);
            render(ctx);
        });
        panel.addEventListener('click', (event) => {
            const single = event.target.closest('[data-remove]');
            if (single) { act(ctx, 'remove', Number(single.dataset.remove)); return; }
            const action = event.target.closest('[data-action]')?.dataset.action;
            if (action === 'close') { open(ctx); return; }
            if (action === 'all') { ctx.tracks.forEach((track) => ctx.selected.add(track.id)); render(ctx); return; }
            if (action === 'clear') { ctx.selected.clear(); render(ctx); return; }
            if (action) act(ctx, action);
        });
        try {
            const { existing } = await bulk().readPlaylist(S().api, ctx.playlist.id);
            if (ctx.panel !== panel) return;
            ctx.tracks = await fullTrackDetails(existing);
            render(ctx);
        } catch (error) {
            S().toast(t('error', { error: error.message }), { error: true });
            panel.remove(); ctx.panel = null;
        }
    }

    async function mount() {
        const path = location.pathname;
        if (unavailablePath !== path) unavailablePath = null;      // autre page : nouvel essai au retour
        if (!isPlaylist() || !S()) { unmount(); return; }
        if (unavailablePath === path) return;
        if (current?.path === path && current.button.isConnected) return;
        if (mountingPath === path || !$('.soundActions')) return;   // l'observateur relance dès que la rangée d'actions existe
        mountingPath = path;
        unmount();
        const seq = ++sequence;
        try {
            const [me, playlist] = await Promise.all([
                mePromise || (mePromise = S().me().catch((error) => { mePromise = null; throw error; })),   // seul l'identifiant sert : une requête par page chargée
                S().api(`/resolve?url=${encodeURIComponent(location.origin + path)}`),
            ]);
            if (seq !== sequence || location.pathname !== path) return;
            if (playlist.kind !== 'playlist' || String(playlist.user?.id) !== String(me.id)) { unavailablePath = path; return; }
            const actions = $('.soundActions .sc-button-group, .soundActions');
            if (!actions) return;
            const button = document.createElement('button');
            button.type = 'button'; button.className = `sc-button sc-button-small sc-button-secondary ${NS}-button`;
            button.textContent = t('manage');
            actions.appendChild(button);
            const style = $(`#${NS}-style`) || document.createElement('style');
            style.id = `${NS}-style`;
            style.textContent = `.${NS}{margin:16px 0;padding:14px;background:#222;color:#eee;border-radius:4px}.` +
                `${NS}-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px}.` +
                `${NS}-toolbar button{background:#333;color:#eee;border:1px solid #555;border-radius:3px;padding:6px;cursor:pointer}.` +
                `${NS}-toolbar button:disabled,.${NS}-row button:disabled{opacity:.45}.` +
                `${NS}-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px;border-bottom:1px solid #444}.` +
                `${NS}-row label{display:flex;align-items:center;gap:8px;min-width:0;cursor:pointer}.` +
                `${NS}-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.` +
                `${NS}-row input{accent-color:var(--sce-accent,#f50)}`;
            if (!style.isConnected) document.head.appendChild(style);
            const ctx = { path, playlist, meId: me.id, button, panel: null, tracks: [], selected: new Set(), busy: false };
            button.addEventListener('click', () => open(ctx));
            current = ctx;
        } catch (error) { console.warn('[SCE] playlist manager', error); unavailablePath = path; }   // sinon chaque mutation du DOM relance les requêtes
        finally { mountingPath = null; }
    }

    function schedule() {
        if (scheduled) return;
        scheduled = setTimeout(() => { scheduled = null; mount(); }, 300);
    }
    for (const name of ['pushState', 'replaceState']) {
        const original = history[name];
        history[name] = function (...args) { const result = original.apply(this, args); schedule(); return result; };
    }
    window.addEventListener('popstate', schedule);
    new MutationObserver(() => {
        if (current && (!current.button.isConnected || current.path !== location.pathname)) schedule();
        else if (!current && isPlaylist() && $('.soundActions')) schedule();
    }).observe(document.body, { childList: true, subtree: true });
    schedule();
})();
