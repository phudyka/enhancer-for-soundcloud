const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function bulk() {
    const window = {};
    vm.runInNewContext(fs.readFileSync('content/shared.js', 'utf8'), { window, URL });
    vm.runInNewContext(fs.readFileSync('content/library-bulk.js', 'utf8'), { window });
    return window.__sceLibraryBulk;
}

test('selects every indexed favorite without a filter, including unloaded metadata', () => {
    assert.deepEqual(Array.from(bulk().scopeIds([1, 2, 3], [{ id: 1 }], false)), [1, 2, 3]);
    assert.deepEqual(Array.from(bulk().scopeIds([1, 2, 3], [{ id: 1 }], true)), [1]);
});

test('rejects playlists above 500 without silently truncating', () => {
    assert.throws(() => bulk().playlistTracks(Array.from({ length: 501 }, (_, i) => i + 1), [], 500), /500/);
    assert.deepEqual(Array.from(bulk().playlistTracks([2, 3], [{ id: 1 }, { id: 2 }], 500)), [1, 2, 3]);
});

test('does not overwrite a playlist when its existing track list remains incomplete', async () => {
    const calls = [];
    await assert.rejects(bulk().addToPlaylist(async (path, opts) => {
        calls.push([path, opts]);
        if (path === '/playlists/7') return { track_count: 3, tracks: [{ id: 1 }] };
        return { collection: [{ id: 1 }] };
    }, 7, [2], 500), /incomplete/i);
    assert.equal(calls.filter(([, opts]) => opts?.method === 'PUT').length, 0);
});

test('loads all existing playlist tracks before appending', async () => {
    const calls = [];
    await bulk().addToPlaylist(async (path, opts) => {
        calls.push([path, opts]);
        if (path === '/playlists/7' && !opts) return { track_count: 2, tracks: [{ id: 1 }] };
        if (path === '/playlists/7/tracks?limit=200') return { collection: [{ id: 1 }, { id: 2 }] };
    }, 7, [3], 500);
    assert.deepEqual(Array.from(calls.at(-1)[1].body.playlist.tracks), [1, 2, 3]);
});

test('appends only new tracks while preserving the playlist order', async () => {
    const calls = [];
    const count = await bulk().addToPlaylist(async (path, opts) => {
        calls.push([path, opts]);
        if (!opts) return { track_count: 2, tracks: [{ id: 1 }, { id: 2 }] };
    }, 7, [2, 3], 500);
    assert.equal(count, 1);
    assert.deepEqual(Array.from(calls[1][1].body.playlist.tracks), [1, 2, 3]);
    assert.equal(calls[1][1].method, 'PUT');
});

test('removes only selected tracks from an owned complete playlist, preserving order', async () => {
    const calls = [];
    const count = await bulk().removeFromPlaylist(async (path, opts) => {
        calls.push([path, opts]);
        if (!opts) return { user: { id: 42 }, track_count: 4, tracks: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 2 }] };
    }, 7, [2], 42);
    assert.equal(count, 2);
    assert.deepEqual(Array.from(calls.at(-1)[1].body.playlist.tracks), [1, 3]);
});

test('refuses to update another user’s playlist or an incomplete track list', async () => {
    const calls = [];
    const api = async (path, opts) => {
        calls.push([path, opts]);
        if (path === '/playlists/7') return { user: { id: 99 }, track_count: 1, tracks: [{ id: 2 }] };
    };
    await assert.rejects(bulk().removeFromPlaylist(api, 7, [2], 42), /owner mismatch/i);
    assert.equal(calls.filter(([, opts]) => opts?.method === 'PUT').length, 0);
    await assert.rejects(bulk().removeFromPlaylist(async (path) => {
        if (path === '/playlists/7') return { user: { id: 42 }, track_count: 2, tracks: [{ id: 2 }] };
        return { collection: [{ id: 2 }] };
    }, 7, [2], 42), /incomplete/i);
});

test('unlikes only requested tracks and reports partial failures', async () => {
    const calls = [];
    const result = await bulk().unlikeMany(async (path, opts) => {
        calls.push([path, opts.method]);
        if (path.endsWith('/2')) throw new Error('failure');
    }, [1, 2, 3]);
    assert.deepEqual(calls, [['/likes/tracks/1', 'DELETE'], ['/likes/tracks/2', 'DELETE'], ['/likes/tracks/3', 'DELETE']]);
    assert.deepEqual(Array.from(result.done), [1, 3]);
    assert.deepEqual(Array.from(result.failed), [2]);
});
