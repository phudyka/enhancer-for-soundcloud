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

    assert.deepEqual({ ...audio.settings }, { rate: 1, preservePitch: true, bass: 0, reverb: 0, volume: 1, muted: false });
    audio.setSettings({ rate: 1.25, preservePitch: false, bass: 20, reverb: -1 });
    assert.deepEqual({ ...audio.settings }, { rate: 1.25, preservePitch: false, bass: 12, reverb: 0, volume: 1, muted: false });
    audio.applyPreset('nightcore');
    assert.deepEqual({ ...audio.settings }, { rate: 1.2, preservePitch: false, bass: 0, reverb: 0.1, volume: 1, muted: false });
    assert.equal(audio.applyPreset('unknown'), false);
});

test('volume is linear, clamped, persisted and independent from presets', () => {
    const values = new Map();
    const localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    const document = { documentElement: { lang: 'fr' }, body: {}, addEventListener() {}, querySelector() { return null; }, getElementById() { return null; } };
    const window = { addEventListener() {}, dispatchEvent() {} };
    const context = { window, document, localStorage, MutationObserver: class { observe() {} }, Event, console, setInterval, clearInterval };
    vm.runInNewContext(fs.readFileSync('content/audio.js', 'utf8'), context);
    const audio = window.__sceAudio;
    audio.setVolume(0.5);
    assert.equal(audio.volume, 0.5);
    audio.setVolume(1.7);
    assert.equal(audio.volume, 1);
    audio.setVolume(0.37);
    audio.toggleMute();
    assert.equal(audio.muted, true);
    audio.applyPreset('slowed');
    assert.equal(audio.volume, 0.37);                       // un preset ne touche pas au volume
    assert.equal(audio.muted, true);
    audio.setVolume(0.8);
    assert.equal(audio.muted, false);                       // régler le volume lève la sourdine
    assert.equal(JSON.parse(values.get('sce:audio')).volume, 0.8);
});

test('media-hook moves the native SoundCloud volume to 100 % and keeps it as our initial volume', () => {
    const values = new Map([['V2::local::settings', JSON.stringify({ volume: 0.6, muted: false, showTimeRemaining: false })]]);
    const localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    class Node { play() {} } class Ctx { createMediaElementSource() {} } class ANode { connect() {} disconnect() {} }
    const context = { window: {}, localStorage, HTMLMediaElement: Node, AudioContext: Ctx, AudioNode: ANode, JSON, Object, console };
    vm.runInNewContext(fs.readFileSync('content/media-hook.js', 'utf8'), context);
    assert.equal(JSON.parse(values.get('V2::local::settings')).volume, 1);
    assert.equal(JSON.parse(values.get('V2::local::settings')).showTimeRemaining, false);
    assert.equal(JSON.parse(values.get('sce:audio')).volume, 0.6);
});
