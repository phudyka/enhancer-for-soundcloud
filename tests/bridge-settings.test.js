const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

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
        runtime: { onMessage: { addListener() {} }, sendMessage: async () => ({ ok: true, open: false }), getURL: (path) => `chrome-extension://test/${path}` },
    };
    class MutationObserver { constructor(callback) { changed = callback; } observe() {} }
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
