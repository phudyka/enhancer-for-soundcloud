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
        deletePlaylist: 'Supprimer la playlist', confirmDeletePlaylist: 'Supprimer définitivement la playlist « {title} » ?',
        deletedPlaylist: 'Playlist supprimée : {title}',
        confirmUnlike: 'Retirer {n} titre(s) de vos likes ?', removed: '{n} titre(s) retiré(s) de la playlist',
        added: '{n} titre(s) ajouté(s)', created: 'Playlist créée : {title}', unliked: '{n} like(s) retiré(s), {f} échec(s)',
        error: 'Action impossible : {error}', limit: 'Une playlist est limitée à {n} titres.', loading: 'Chargement des titres…',
        playerRemove: 'Retirer le titre en cours de la playlist actuelle',
        playerRemoveTip: 'Retirer le titre en cours de la playlist actuelle · Alt-clic : choisir une autre playlist',
        playerRemovePick: 'Retirer de quelle playlist ?', noCurrentTrack: 'Aucun titre en cours',
        removedCurrent: 'Titre retiré de « {title} »', notInPlaylist: 'Ce titre n’est pas dans « {title} »',
    } : {
        manage: 'Manage tracks', close: 'Close', selectAll: 'Select all', clear: 'Clear selection',
        selected: 'selected', remove: 'Remove', add: 'Add to playlist', create: 'Create playlist',
        unlike: 'Remove from likes', playlistName: 'Playlist name',
        noPlaylists: 'No playlists found', confirmRemove: 'Remove {n} track(s) from “{title}”? The tracks will remain on SoundCloud.',
        deletePlaylist: 'Delete playlist', confirmDeletePlaylist: 'Permanently delete playlist “{title}”?',
        deletedPlaylist: 'Playlist deleted: {title}',
        confirmUnlike: 'Remove {n} track(s) from your likes?', removed: '{n} track(s) removed from playlist',
        added: '{n} track(s) added', created: 'Playlist created: {title}', unliked: '{n} like(s) removed, {f} failed',
        error: 'Action failed: {error}', limit: 'A playlist is limited to {n} tracks.', loading: 'Loading tracks…',
        playerRemove: 'Remove current track from the current playlist',
        playerRemoveTip: 'Remove current track from the current playlist · Alt-click: choose another playlist',
        playerRemovePick: 'Remove from which playlist?', noCurrentTrack: 'No track is playing',
        removedCurrent: 'Track removed from “{title}”', notInPlaylist: 'This track is not in “{title}”',
    };
    const t = (key, vars = {}) => labels[key].replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
    const bulk = () => window.__sceLibraryBulk;
    const S = () => window.__scsp, D = () => window.__sceDialog;
    const isPlaylist = () => /^\/[^/]+\/sets\/[^/]+/.test(location.pathname);
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const cardSelector = '.soundList__item, .searchList__item, .audibleTile, .sound, .playlist';
    const artSelector = '.playableTile__artwork, .sound__artwork, .audibleTile__artwork, .playlist__artwork, .sound__coverArt, .image';
    const deleteIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 1.5h3l.75 1H13V4H3V2.5h2.75l.75-1ZM4 5h8l-.5 8.5a1 1 0 0 1-1 .94h-5a1 1 0 0 1-1-.94L4 5Zm2 1.25.25 6h1.25l-.25-6H6Zm2.75 0-.25 6h1.25l.25-6H8.75Z" fill="currentColor"/></svg>';

    let current = null, sequence = 0, scheduled = null, mountingPath = null, unavailablePath = null, mePromise = null;
    let playerButton = null, playerBusy = false;

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

    async function deletePlaylist(button, card, playlist) {
        if (button.disabled) return;
        try {
            if (!await D().confirm(t('confirmDeletePlaylist', { title: playlist.title }), { ok: t('deletePlaylist'), danger: true })) return;
            button.disabled = true;
            await S().api(`/playlists/${playlist.id}`, { method: 'DELETE' });
            card.remove();
            S().toast(t('deletedPlaylist', { title: playlist.title }));
            if (String(playlist.permalink_url || '').startsWith(location.origin + location.pathname)) location.assign('/you/library');
        } catch (error) {
            S().toast(t('error', { error: error.message }), { error: true });
        } finally {
            button.disabled = false;
        }
    }

    function injectCardDeleteStyle() {
        if ($(`#${NS}-card-style`)) return;
        const style = document.createElement('style');
        style.id = `${NS}-card-style`;
        style.textContent = `
            .sce-card-art { position: relative !important; }
            .sce-card-action {
                position: absolute; bottom: 8px; width: 34px; height: 34px;
                display: grid; place-items: center; padding: 8px; border: 0; border-radius: 50%;
                background: #fff !important; color: #111 !important; opacity: 0; pointer-events: none;
                box-shadow: 0 2px 8px #0006; cursor: pointer;
            }
            .${NS}-card-delete { right: 92px; z-index: 7; }
            .${NS}-card-delete svg { width: 18px; height: 18px; }
            .audibleTile:hover .${NS}-card-delete,
            .soundList__item:hover .${NS}-card-delete,
            .searchList__item:hover .${NS}-card-delete,
            .sound:hover .${NS}-card-delete,
            .playlist:hover .${NS}-card-delete,
            .sce-card-art:hover > .${NS}-card-delete,
            .${NS}-card-delete:focus-visible { opacity: 1; pointer-events: auto; }
            .${NS}-card-delete:hover,
            .${NS}-card-delete:focus-visible { color: #d00 !important; }
        `;
        (document.head || document.documentElement).append(style);
    }

    function setupPlaylistCardDelete() {
        injectCardDeleteStyle();
        const add = async (target) => {
            if (!S() || !D()) return;
            const card = target.closest?.(cardSelector);
            if (!card || ['ready', 'skip', 'loading'].includes(card.dataset.scePlaylistDelete)) return;
            const link = card.querySelector('a[href*="/sets/"]');
            if (!link) { card.dataset.scePlaylistDelete = 'skip'; return; }
            const path = new URL(link.href, location.origin).pathname;
            if (!isPlaylistPath(path)) { card.dataset.scePlaylistDelete = 'skip'; return; }
            const art = card.querySelector(artSelector);
            if (!art || art.querySelector(`.${NS}-card-delete`)) return;
            card.dataset.scePlaylistDelete = 'loading';
            try {
                const [me, playlist] = await Promise.all([
                    mePromise || (mePromise = S().me().catch((error) => { mePromise = null; throw error; })),
                    S().api(`/resolve?url=${encodeURIComponent(location.origin + path)}`),
                ]);
                if (playlist.kind !== 'playlist' || String(playlist.user?.id) !== String(me.id)) { card.dataset.scePlaylistDelete = 'skip'; return; }
                art.classList.add('sce-card-art');
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `sce-card-action ${NS}-card-delete`;
                button.title = t('deletePlaylist');
                button.setAttribute('aria-label', button.title);
                button.innerHTML = deleteIcon;
                button.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    deletePlaylist(button, card, playlist);
                });
                art.appendChild(button);
                card.dataset.scePlaylistDelete = 'ready';
            } catch (error) {
                console.warn('[SCE] playlist card delete', error);
                card.dataset.scePlaylistDelete = 'skip';
            }
        };
        document.addEventListener('mouseover', (event) => add(event.target));
        document.addEventListener('focusin', (event) => add(event.target));
    }

    function isPlaylistPath(path) {
        return /^\/[^/]+\/sets\/[^/]+/.test(path);
    }

    function currentTrackPath() {
        const href = $('.playbackSoundBadge__titleLink')?.getAttribute('href');
        if (!href) return null;
        try {
            const url = new URL(href, location.origin);
            return url.origin === location.origin ? url.pathname : null;
        } catch { return null; }
    }

    async function currentTrack() {
        const path = currentTrackPath();
        if (!path) throw new Error(t('noCurrentTrack'));
        const track = await S().api(`/resolve?url=${encodeURIComponent(location.origin + path)}`);
        if (track?.kind !== 'track' || !track.id) throw new Error(t('noCurrentTrack'));
        return track;
    }

    async function ownedCurrentPlaylist(me) {
        if (!isPlaylistPath(location.pathname)) return null;
        const playlist = await S().api(`/resolve?url=${encodeURIComponent(location.origin + location.pathname)}`);
        if (playlist?.kind !== 'playlist' || String(playlist.user?.id) !== String(me.id)) return null;
        return playlist;
    }

    async function pickPlaylist(me) {
        const playlists = await bulk().ownPlaylists(S().api, me.id);
        if (!playlists.length) throw new Error(t('noPlaylists'));
        const index = await D().pick(t('playerRemovePick'), playlists.map((pl) => ({ label: pl.title, detail: pl.track_count ?? '' })));
        return index < 0 ? null : playlists[index];
    }

    async function removePlayingTrack({ choose = false } = {}) {
        if (playerBusy || !S() || !D() || !bulk()) return;
        playerBusy = true;
        playerButton?.classList.add('m-busy');
        playerButton && (playerButton.disabled = true);
        try {
            const [track, me] = await Promise.all([
                currentTrack(),
                mePromise || (mePromise = S().me().catch((error) => { mePromise = null; throw error; })),
            ]);
            const playlist = (choose ? null : await ownedCurrentPlaylist(me)) || await pickPlaylist(me);
            if (!playlist) return;
            const count = await bulk().removeFromPlaylist(S().api, playlist.id, [track.id], me.id);
            S().toast(t(count ? 'removedCurrent' : 'notInPlaylist', { title: playlist.title }), { error: !count });
        } catch (error) {
            S().toast(t('error', { error: error.message }), { error: true });
        } finally {
            playerBusy = false;
            playerButton?.classList.remove('m-busy');
            playerButton && (playerButton.disabled = false);
        }
    }

    function injectPlayerButtonStyle() {
        if ($(`#${NS}-player-style`)) return;
        const style = document.createElement('style');
        style.id = `${NS}-player-style`;
        style.textContent = `
            .${NS}-player-remove {
                display: inline-grid !important; place-items: center; width: 32px; min-width: 32px; height: 32px;
                margin-left: 4px; padding: 0 !important; border: 0 !important; border-radius: 3px;
                background: transparent !important; color: #999 !important; cursor: pointer;
                vertical-align: middle;
            }
            .${NS}-player-remove svg { width: 18px; height: 18px; pointer-events: none; }
            .${NS}-player-remove:hover,
            .${NS}-player-remove:focus-visible { color: #d00 !important; background: rgba(255,255,255,.08) !important; outline: 0; }
            .${NS}-player-remove.m-busy { opacity: .55; cursor: progress; }
        `;
        (document.head || document.documentElement).append(style);
    }

    function mountPlayerButton() {
        if (!S() || !D() || !bulk()) return;
        if (playerButton?.isConnected) return;
        const badge = $('.playControls__soundBadge, .playbackSoundBadge');
        if (!badge) return;
        injectPlayerButtonStyle();
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `${NS}-player-remove`;
        button.title = t('playerRemoveTip');
        button.setAttribute('aria-label', t('playerRemove'));
        button.innerHTML = deleteIcon;
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            removePlayingTrack({ choose: event.altKey });
        });
        const queue = $('.playbackSoundBadge__showQueue');
        if (queue?.parentElement === badge || queue?.parentElement?.closest('.playControls__soundBadge, .playbackSoundBadge') === badge) queue.before(button);
        else badge.appendChild(button);
        playerButton = button;
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
                `${NS}-row input{accent-color:var(--sce-accent,#f50)}.` +
                `${NS}-card-delete{right:92px;z-index:7}.` +
                `${NS}-card-delete:hover,.${NS}-card-delete:focus-visible{color:#d00!important}`;
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
    (window.__sceShared?.onDom || ((fn) => new MutationObserver(fn).observe(document.body, { childList: true, subtree: true })))(() => {
        mountPlayerButton();
        if (current && (!current.button.isConnected || current.path !== location.pathname)) schedule();
        else if (!current && isPlaylist() && $('.soundActions')) schedule();
    });
    setupPlaylistCardDelete();
    mountPlayerButton();
    schedule();
})();
