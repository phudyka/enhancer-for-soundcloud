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

    assert.deepEqual({ ...audio.settings }, { rate: 1, preservePitch: true, pitchSemitones: 0, bass: 0, reverb: 0, volume: 1, muted: false, allowVolumeBoost: false });
    audio.setSettings({ rate: 1.25, preservePitch: false, pitchSemitones: 20, bass: 20, reverb: -1 });
    assert.deepEqual({ ...audio.settings }, { rate: 1.25, preservePitch: false, pitchSemitones: 12, bass: 12, reverb: 0, volume: 1, muted: false, allowVolumeBoost: false });
    audio.applyPreset('nightcore');
    assert.deepEqual({ ...audio.settings }, { rate: 1.2, preservePitch: false, pitchSemitones: 0, bass: 0, reverb: 0.1, volume: 1, muted: false, allowVolumeBoost: false });
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

test('volume boost is opt-in, reaches 200%, and drops to 100% when disabled', () => {
    const values = new Map();
    let onMessage;
    const localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    const document = { documentElement: { lang: 'fr' }, body: {}, addEventListener() {}, querySelector() { return null; }, getElementById() { return null; } };
    const window = { addEventListener(type, listener) { if (type === 'message') onMessage = listener; }, dispatchEvent() {}, postMessage(message) { this.reply = message; } };
    vm.runInNewContext(fs.readFileSync('content/audio.js', 'utf8'), { window, document, localStorage, location: { origin: 'https://soundcloud.com' }, MutationObserver: class { observe() {} }, Event, console, setInterval, clearInterval });
    const command = (name, value) => onMessage({ source: window, origin: 'https://soundcloud.com', data: { sce: 'command', command: name, value } });
    window.__sceAudio.setVolume(1.8);
    assert.equal(window.__sceAudio.volume, 1);
    command('audio-set', { allowVolumeBoost: true });
    command('audio-set', { volume: 2.5 });
    assert.equal(window.__sceAudio.volume, 2);
    command('get-audio');
    assert.equal(window.reply.sce, 'audio-state');
    assert.equal(window.reply.settings.volume, 2);
    assert.equal(window.reply.settings.allowVolumeBoost, true);
    command('audio-set', { allowVolumeBoost: false });
    assert.equal(window.__sceAudio.volume, 1);
    assert.equal(JSON.parse(values.get('sce:audio')).allowVolumeBoost, false);
});

test('custom presets apply only selected settings and track changes reset effects when requested', () => {
    const values = new Map();
    let track = '/artist/one';
    let changed;
    const localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    const document = {
        documentElement: { lang: 'fr' }, body: {}, addEventListener() {},
        querySelector(selector) { return selector === '.playbackSoundBadge__titleLink' ? { getAttribute: () => track } : null; },
        querySelectorAll() { return []; }, getElementById() { return null; },
    };
    const window = { addEventListener() {}, dispatchEvent() {} };
    class MutationObserver { constructor(callback) { changed = callback; } observe() {} }
    vm.runInNewContext(fs.readFileSync('content/audio.js', 'utf8'), { window, document, localStorage, MutationObserver, Event, console, setInterval, clearInterval, setTimeout: (callback) => callback() });
    const audio = window.__sceAudio;
    audio.setSettings({ rate: 0.85, bass: 7, reverb: 0.4, volume: 0.3 });
    assert.equal(audio.savePreset('Mon mix', ['rate', 'bass']), true);
    audio.setSettings({ rate: 1.5, bass: 0, volume: 0.6 });
    assert.equal(audio.applyPreset('Mon mix'), true);
    assert.equal(audio.rate, 0.85);
    assert.equal(audio.settings.bass, 7);
    assert.equal(audio.volume, 0.6);
    assert.equal(audio.settings.reverb, 0.4);
    audio.setKeepNext(false);
    track = '/artist/two'; changed();
    assert.deepEqual({ rate: audio.rate, bass: audio.settings.bass, reverb: audio.settings.reverb, volume: audio.volume }, { rate: 1, bass: 0, reverb: 0, volume: 0.6 });
    audio.setSettings({ rate: 1.2, bass: 5 });
    audio.setKeepNext(true);
    track = '/artist/three'; changed();
    assert.equal(audio.rate, 1.2);
    assert.equal(audio.settings.bass, 5);
    assert.equal(audio.removePreset('Mon mix'), true);
    assert.equal(audio.applyPreset('Mon mix'), false);
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
