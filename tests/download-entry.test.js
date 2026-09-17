const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('download entry follows the playing track and each visible track', () => {
    const messages = [];
    const inserted = [];
    const makeButton = () => ({ setAttribute() {}, addEventListener(type, fn) { if (type === 'click') this.click = fn; } });
    const queueButton = { before(button) { inserted.push(button); } };
    const actions = { querySelector(selector) { return selector === '.playbackSoundBadge__showQueue' ? queueButton : inserted.find((b) => b.className.includes('sce-download-player')); } };
    const rowButtons = [];
    const row = {
        classList: { contains: (name) => name === 'm-playable' },
        querySelector(selector) {
            if (selector === '.sce-download') return rowButtons[0];
            if (selector === '.trackItem__trackTitle') return { href: 'https://soundcloud.com/artist/track-two' };
            return null;
        },
        append(button) { rowButtons.push(button); },
        dataset: {},
    };
    let playing = 'https://soundcloud.com/artist/track-one';
    const document = {
        documentElement: { lang: 'fr' }, head: { append() {} }, scripts: [],
        createElement: () => makeButton(),
        querySelector(selector) {
            if (selector === '.playbackSoundBadge__actions') return actions;
            if (selector === '.playbackSoundBadge__titleLink') return { href: playing };
            return null;
        },
        querySelectorAll(selector) { return selector.startsWith('.trackItem') && !(row.dataset.sceDl != null && selector.includes(':not([data-sce-dl])')) ? [row] : []; },
    };
    const window = { addEventListener() {}, postMessage(value) { messages.push(value); } };
    vm.runInNewContext(fs.readFileSync('content/download-entry.js', 'utf8'), {
        document, window, navigator: { language: 'fr' }, location: { origin: 'https://soundcloud.com', pathname: '/discover' },
        MutationObserver: class { observe() {} }, URL, setTimeout, clearTimeout,
    });
    assert.equal(inserted.length, 1);
    assert.equal(rowButtons.length, 1);
    playing = 'https://soundcloud.com/artist/track-three';
    const event = () => ({ preventDefault() {}, stopPropagation() {} });
    inserted[0].click(event());
    rowButtons[0].click(event());
    assert.deepEqual(messages.map((m) => m.url), [playing, 'https://soundcloud.com/artist/track-two']);
    assert.match(inserted[0].innerHTML, /<svg/);
});

test('refreshing the download client ID ignores stale resource history and cache', async () => {
    const stale = 'A'.repeat(32), fresh = 'B'.repeat(32);
    const messages = [];
    let onMessage;
    const stored = new Map([['scsp:client_id', JSON.stringify(stale)]]);
    const document = {
        documentElement: { lang: 'fr' }, head: { append() {} },
        scripts: [{ src: 'https://a-v2.sndcdn.com/assets/app.js' }],
        createElement: () => ({ setAttribute() {}, addEventListener() {} }),
        querySelector: () => null,
        querySelectorAll: () => [],
    };
    const window = {
        addEventListener(type, callback) { if (type === 'message') onMessage = callback; },
        postMessage(value) { messages.push(value); },
    };
    const context = vm.createContext({
        document, window, navigator: { language: 'fr' }, location: { origin: 'https://soundcloud.com', pathname: '/discover' },
        localStorage: { getItem(key) { return stored.get(key) || null; }, setItem(key, value) { stored.set(key, value); } },
        performance: { getEntriesByType: () => [{ name: `https://api-v2.soundcloud.com/tracks?client_id=${stale}` }] },
        fetch: async () => ({ text: async () => `client_id:'${fresh}'` }),
        MutationObserver: class { observe() {} }, URL, setTimeout, clearTimeout,
    });
    for (const file of ['content/shared.js', 'content/download-entry.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    await onMessage({ source: window, data: { sce: 'command', command: 'download-client-id', value: { refresh: true } } });
    assert.equal(messages.at(-1).clientId, fresh);
    assert.equal(JSON.parse(stored.get('scsp:client_id')), fresh);
});
