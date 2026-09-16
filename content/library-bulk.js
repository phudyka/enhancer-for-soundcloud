/* Shared selection and safe bulk mutations for the likes library. */
(() => {
    'use strict';

    function scopeIds(allIds, visibleRows, filtered) {
        return filtered ? visibleRows.map((row) => row.id) : allIds.slice();
    }

    function playlistTracks(selected, existing = [], limit = 500) {
        const ids = [...new Set([...existing.map((track) => track.id), ...selected])];
        if (ids.length > limit) throw new Error(`Playlist limit: ${limit}`);
        return ids;
    }

    async function addToPlaylist(api, playlistId, selected, limit = 500) {
        const playlist = await api(`/playlists/${playlistId}`);
        let existing = playlist.tracks;
        if (!Array.isArray(existing)) throw new Error('Incomplete playlist track list; update cancelled');
        if (playlist.track_count != null && existing.length < playlist.track_count) {
            const all = [];
            let path = `/playlists/${playlistId}/tracks?limit=200`;
            while (path && all.length < playlist.track_count) {
                const page = await api(path);
                all.push(...(Array.isArray(page) ? page : page?.collection || []));
                if (page?.next_href) {
                    const next = new URL(page.next_href);
                    next.searchParams.delete('client_id');
                    path = next.pathname + next.search;
                } else path = null;
            }
            existing = all;
        }
        if (playlist.track_count != null && existing.length !== playlist.track_count) {
            throw new Error('Incomplete playlist track list; update cancelled');
        }
        const tracks = playlistTracks(selected, existing, limit);
        await api(`/playlists/${playlistId}`, { method: 'PUT', body: { playlist: { tracks } } });
        return tracks.length - existing.length;
    }

    async function unlikeMany(api, selected) {
        const done = [], failed = [];
        for (const id of selected) {
            try { await api(`/likes/tracks/${id}`, { method: 'DELETE' }); done.push(id); }
            catch { failed.push(id); }
        }
        return { done, failed };
    }

    window.__sceLibraryBulk = { scopeIds, playlistTracks, addToPlaylist, unlikeMany };
})();
