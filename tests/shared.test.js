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
