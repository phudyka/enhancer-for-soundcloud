const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const plain = (value) => JSON.parse(JSON.stringify(value));

test('settings changes reach the page immediately and supersede the initial read', async () => {
    const writes = [];
    const events = [];
    let onChanged;
    let resolveInitial;
    const window = { addEventListener() {}, dispatchEvent: (event) => events.push(event.type) };
    const chrome = {
        storage: {
            onChanged: { addListener: (fn) => { onChanged = fn; } },
            sync: { get: () => new Promise((resolve) => { resolveInitial = resolve; }) },
        },
        runtime: { onMessage: { addListener() {} } },
    };
    vm.runInNewContext(fs.readFileSync('content/bridge.js', 'utf8'), {
        window, chrome, localStorage: { setItem: (key, value) => writes.push([key, value]) },
        Event: class { constructor(type) { this.type = type; } },
    });

    onChanged({ settings: { newValue: { hideFooter: true } } }, 'sync');
    assert.equal(JSON.parse(writes.at(-1)[1]).hideFooter, true);
    assert.deepEqual(events, ['sce:settings-change']);

    resolveInitial({ settings: { hideFooter: false } });
    await Promise.resolve();
    assert.equal(writes.length, 1);
});

test('SoundCloud header exposes settings and remounts after header replacement', () => {
    let changed;
    const overlays = [];
    let header = { button: null, querySelector() { return this.button; }, append(button) { this.button = button; } };
    const element = () => ({ setAttribute(name, value) { this[name] = value; }, addEventListener(type, callback) { this[type] = callback; }, append(...children) { this.children = children; }, remove() { this.removed = true; } });
    const document = {
        documentElement: { lang: 'fr' }, head: { append() {} }, body: { append(item) { overlays.push(item); } }, addEventListener() {},
        querySelector: (selector) => selector === '.header__right' ? header : selector === '.sce-settings-button' ? header.button : null,
        createElement: element,
    };
    const chrome = {
        storage: { onChanged: { addListener() {} }, sync: { get: async () => ({ settings: {} }) } },
        runtime: { id: 'test', onMessage: { addListener() {} }, sendMessage: async () => ({ ok: true, open: false }), getURL: (path) => `chrome-extension://test/${path}` },
    };
    class MutationObserver { constructor(callback) { changed = callback; } observe() {} disconnect() {} }
    vm.runInNewContext(fs.readFileSync('content/bridge.js', 'utf8'), {
        window: { addEventListener() {}, dispatchEvent() {} }, document, chrome, MutationObserver,
        localStorage: { setItem() {} }, Event,
    });
    assert.equal(header.button.type, 'button');
    assert.match(header.button.title, /Réglages/);
    header.button.click({ isTrusted: true });
    const overlay = overlays.find((item) => item.className === 'sce-settings-overlay');
    assert.ok(overlay);
    assert.equal(overlay.children[0].children[0].src, 'chrome-extension://test/options/options.html?embedded=1');
    assert.equal(header.button['aria-expanded'], 'true');
    header.button.click({ isTrusted: true });
    assert.equal(overlay.removed, true);
    assert.equal(header.button['aria-expanded'], 'false');
    header = { button: null, querySelector() { return this.button; }, append(button) { this.button = button; } };
    changed();
    assert.ok(header.button);
});

test('the side panel pin follows the configured side', async () => {
    let onChanged;
    const body = { children: [], append(item) { this.children.push(item); } };
    const element = () => ({
        attributes: {},
        dataset: {},
        style: {},
        setAttribute(name, value) { this.attributes[name] = value; this[name] = value; },
        addEventListener(type, callback) { this[type] = callback; },
        append(...children) { this.children = children; },
    });
    const document = {
        documentElement: { lang: 'fr' },
        head: { append() {} },
        body,
        addEventListener() {},
        querySelector: (selector) => selector === '.sce-player-pin' ? body.children.find((item) => item.className === 'sce-player-pin') || null : null,
        createElement: element,
    };
    const chrome = {
        storage: {
            onChanged: { addListener: (fn) => { onChanged = fn; } },
            sync: { get: async () => ({ settings: { panelPinSide: 'left' } }) },
        },
        runtime: { id: 'test', onMessage: { addListener() {} }, sendMessage: async () => ({ ok: true, open: false }) },
    };
    class MutationObserver { observe() {} disconnect() {} }
    vm.runInNewContext(fs.readFileSync('content/bridge.js', 'utf8'), {
        window: { addEventListener() {}, dispatchEvent() {} },
        document,
        chrome,
        MutationObserver,
        localStorage: { setItem() {} },
        Event,
    });
    await Promise.resolve();

    const pin = body.children.find((item) => item.className === 'sce-player-pin');
    assert.equal(pin.dataset.side, 'left');

    onChanged({ settings: { newValue: { panelPinSide: 'right' } } }, 'sync');
    assert.equal(pin.dataset.side, 'right');
});

test('page messages are reduced to the allowed bridge payloads', () => {
    const sent = [];
    const messageListeners = [];
    const window = {
        addEventListener(type, listener) {
            if (type === 'message') messageListeners.push(listener);
        },
        dispatchEvent() {},
    };
    const chrome = {
        storage: {
            onChanged: { addListener() {} },
            sync: { get: async () => ({ settings: {} }) },
        },
        runtime: {
            id: 'test',
            onMessage: { addListener() {} },
            sendMessage(message) {
                sent.push(message);
                return Promise.resolve({ ok: true });
            },
        },
    };
    vm.runInNewContext(fs.readFileSync('content/bridge.js', 'utf8'), {
        window,
        chrome,
        localStorage: { setItem() {} },
        Event,
        URL,
        location: { origin: 'https://soundcloud.com', href: 'https://soundcloud.com/stream' },
    });
    const dispatchMessage = (event) => messageListeners.forEach((listener) => listener(event));

    dispatchMessage({ source: {}, data: { sce: 'state', title: 'Ignored', url: '/ignored' } });
    dispatchMessage({ source: window, data: { scsp: 'event', type: 'unknown', extra: '<x>' } });
    assert.deepEqual(sent, []);

    dispatchMessage({ source: window, data: { scsp: 'event', type: 'pip-fallback', extra: '<x>' } });
    assert.deepEqual(plain(sent.at(-1)), { type: 'page-event', event: { type: 'pip-fallback' } });

    dispatchMessage({
        source: window,
        data: {
            sce: 'state',
            playing: true,
            title: 'A'.repeat(400),
            artist: 'B'.repeat(300),
            url: 'https://soundcloud.com/artist/track?utm=1',
            artwork: 'javascript:alert(1)',
            duration: 500,
            position: 42,
            rate: 99,
            repeat: 'weird',
        },
    });
    assert.equal(sent.at(-1).type, 'player-state');
    assert.equal(sent.at(-1).state.title.length, 300);
    assert.equal(sent.at(-1).state.artist.length, 200);
    assert.equal(sent.at(-1).state.url, '/artist/track?utm=1');
    assert.equal(sent.at(-1).state.artwork, null);
    assert.equal(sent.at(-1).state.rate, 4);
    assert.equal(sent.at(-1).state.repeat, 'off');

    dispatchMessage({ source: window, data: { sce: 'listen', entry: { id: 'x', url: 'https://evil.example/t', title: 'Nope', at: Date.now(), listened: 30 } } });
    assert.notEqual(sent.at(-1).type, 'listen');

});
