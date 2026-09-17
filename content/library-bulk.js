/* Shared selection and safe bulk mutations for the likes library. */
(() => {
    'use strict';
    try { if (JSON.parse(localStorage.getItem('scsp:settings') || '{}').extensionDisabled === true) return; } catch {}

    function scopeIds(allIds, visibleRows, filtered) {
        return filtered ? visibleRows.map((row) => row.id) : allIds.slice();
    }

    function playlistTracks(selected, existing = [], limit = 500) {
        const ids = [...new Set([...existing.map((track) => track.id), ...selected])];
        if (ids.length > limit) throw new Error(`Playlist limit: ${limit}`);
        return ids;
    }

    /** Toutes les playlists (hors albums) d'un utilisateur, pagination comprise. */
    async function ownPlaylists(api, userId) {
        const playlists = [];
        let path = `/users/${userId}/playlists_without_albums?limit=200`;
        while (path) {
            const page = await api(path);
            playlists.push(...(page.collection || []));
            path = page.next_href ? window.__sceShared.nextPath(page.next_href) : null;
        }
        return playlists;
    }

    async function readPlaylist(api, playlistId) {
        const playlist = await api(`/playlists/${playlistId}`);
        let existing = playlist.tracks;
        if (!Array.isArray(existing)) throw new Error('Incomplete playlist track list; update cancelled');
        if (playlist.track_count != null && existing.length < playlist.track_count) {
            const all = [];
            let path = `/playlists/${playlistId}/tracks?limit=200`;
            while (path && all.length < playlist.track_count) {
                const page = await api(path);
                all.push(...(Array.isArray(page) ? page : page?.collection || []));
                path = page?.next_href ? window.__sceShared.nextPath(page.next_href) : null;
            }
            existing = all;
        }
        if (playlist.track_count != null && existing.length !== playlist.track_count) {
            throw new Error('Incomplete playlist track list; update cancelled');
        }
        return { playlist, existing };
    }

    async function addToPlaylist(api, playlistId, selected, limit = 500) {
        const { existing } = await readPlaylist(api, playlistId);
        const tracks = playlistTracks(selected, existing, limit);
        await api(`/playlists/${playlistId}`, { method: 'PUT', body: { playlist: { tracks } } });
        return tracks.length - existing.length;
    }

    async function removeFromPlaylist(api, playlistId, selected, ownerId) {
        const { playlist, existing } = await readPlaylist(api, playlistId);
        if (String(playlist.user?.id) !== String(ownerId)) throw new Error('Playlist owner mismatch; update cancelled');
        const unwanted = new Set(selected.map(String));
        const tracks = existing.map((track) => track.id).filter((id) => !unwanted.has(String(id)));
        if (tracks.length === existing.length) return 0;
        await api(`/playlists/${playlistId}`, { method: 'PUT', body: { playlist: { tracks } } });
        return existing.length - tracks.length;
    }

    async function unlikeMany(api, selected) {
        const done = [], failed = [];
        for (const id of selected) {
            try { await api(`/likes/tracks/${id}`, { method: 'DELETE' }); done.push(id); }
            catch { failed.push(id); }
        }
        return { done, failed };
    }

    window.__sceLibraryBulk = { scopeIds, playlistTracks, ownPlaylists, readPlaylist, addToPlaylist, removeFromPlaylist, unlikeMany };
})();
