const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function shared() {
    const window = {};
    vm.runInNewContext(fs.readFileSync('content/shared.js', 'utf8'), { window, URL });
    return window.__sceShared;
}

test('pagination keeps path and parameters but strips the page client id', () => {
    assert.equal(shared().nextPath('https://api-v2.soundcloud.com/me/likes?limit=200&client_id=old&offset=200'), '/me/likes?limit=200&offset=200');
});

test('player time formatting preserves the existing compact display', () => {
    const format = shared().formatTime;
    assert.equal(format(125.8), '2:05');
    assert.equal(format(-5), '0:00');
});

test('the client id comes from the latest page request, then the cache, then the page scripts', async () => {
    const older = 'A'.repeat(32), latest = 'B'.repeat(32), cached = 'C'.repeat(32), scanned = 'D'.repeat(32);
    const stored = new Map([['scsp:client_id', JSON.stringify(cached)]]);
    let entries = [older, latest].map((id) => ({ name: `https://api-v2.soundcloud.com/me?client_id=${id}` }));
    const window = {};
    vm.runInNewContext(fs.readFileSync('content/shared.js', 'utf8'), {
        window, URL, performance: { getEntriesByType: () => entries },
        localStorage: { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
        document: { scripts: [{ src: 'https://a-v2.sndcdn.com/assets/app.js' }] },
        fetch: async () => ({ text: async () => `client_id:"${scanned}"` }),
    });
    assert.equal(await window.__sceShared.clientId(), latest);
    entries = [];
    assert.equal(await window.__sceShared.clientId(), cached);
    assert.equal(await window.__sceShared.clientId(true), scanned);
    assert.equal(JSON.parse(stored.get('scsp:client_id')), scanned);
});

test('the harmonic model follows the Camelot wheel and tolerates half and double tempo', () => {
    const H = shared().harmonic;
    assert.equal(H.camelot('A', 'minor'), '8A');
    assert.equal(H.camelot('C', 'major'), '8B');
    assert.equal(H.keyScore('8A', '8A'), 1);
    assert.equal(H.keyScore('8A', '8B'), 0.85);      // relative
    assert.equal(H.keyScore('12A', '1A'), 0.85);     // la roue boucle
    assert.equal(H.keyScore('8A', '9B'), 0);
    assert.equal(H.keyScore('8A', null), null);
    assert.equal(H.tempoScore(124, 126), 1);
    assert.equal(H.tempoScore(70, 140), 1);          // demi-tempo
    assert.equal(H.tempoScore(121, 128), 0.6);
    assert.equal(H.tempoScore(100, 128), 0);
    assert.equal(H.match({ camelot: '8A', bpm: 124 }, { camelot: '9A', bpm: 100 }), 0);
    assert.equal(H.match({ camelot: '8A' }, { camelot: '8A', bpm: 124 }), 0.8);
    assert.equal(H.match({ bpm: 124 }, { bpm: 125 }), 0.6);
    assert.equal(H.match({}, { camelot: '8A' }), null);
    assert.deepEqual(['2A', '1B', '12B', '1A', 'x'].sort((a, b) => H.rank(a) - H.rank(b)), ['1A', '1B', '2A', '12B', 'x']);
    assert.equal(H.pathOf('https://soundcloud.com/artist/track?in=artist/sets/mix'), '/artist/track');
    assert.equal(H.label({ bpm: 124, camelot: '8A' }), '124 · 8A');
});
