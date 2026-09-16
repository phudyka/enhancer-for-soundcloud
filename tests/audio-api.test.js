const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('audio API applies PiP changes and rejects out-of-range effect values', () => {
    const values = new Map();
    const localStorage = {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
    };
    const document = {
        documentElement: { lang: 'fr' },
        body: {},
        addEventListener() {},
        querySelector() { return null; },
    };
    const window = { addEventListener() {}, dispatchEvent() {} };
    const context = { window, document, localStorage, MutationObserver: class { observe() {} }, Event, console, setInterval, clearInterval };
    vm.runInNewContext(fs.readFileSync('content/audio.js', 'utf8'), context);
    const audio = window.__sceAudio;

    assert.deepEqual({ ...audio.settings }, { rate: 1, preservePitch: true, bass: 0, reverb: 0 });
    audio.setSettings({ rate: 1.25, preservePitch: false, bass: 20, reverb: -1 });
    assert.deepEqual({ ...audio.settings }, { rate: 1.25, preservePitch: false, bass: 12, reverb: 0 });
    audio.applyPreset('nightcore');
    assert.deepEqual({ ...audio.settings }, { rate: 1.2, preservePitch: false, bass: 0, reverb: 0.1 });
    assert.equal(audio.applyPreset('unknown'), false);
});
