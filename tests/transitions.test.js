const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

/* Contexte audio factice : chaque paramètre note les appels de planification. */
function param(value) { return { value, calls: [], cancelScheduledValues() { this.calls.push('cancel'); }, setValueAtTime(v) { this.value = v; this.calls.push(`set:${v}`); }, setTargetAtTime(v) { this.value = v; this.calls.push(`target:${v}`); }, setValueCurveAtTime(curve, at, dur) { this.calls.push(`curve:${curve[0]}->${curve[curve.length - 1]}:${dur}`); }, linearRampToValueAtTime(v) { this.value = v; this.calls.push(`ramp:${v}`); } }; }
function start(t, opts = {}) {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
    const ctx = { currentTime: 0, createMediaElementSource: () => ({ connect() {} }), createBiquadFilter: () => ({ type: '', frequency: { value: 0 }, gain: param(0), connect() {} }), createGain: () => ({ gain: param(0), connect() {} }) };
    const audio = { ctx, master: { gain: param(1) }, xfade: { gain: param(1) }, eqLow: { gain: param(0) }, ensure() {} };
    const media = { duration: 200, currentTime: 0, playbackRate: 1, paused: false, readyState: 4, handlers: {}, addEventListener(type, cb) { this.handlers[type] = cb; }, removeEventListener() {} };
    let title = { href: '/a/one' };
    const toasts = [];
    const apiCalls = [];
    const B = { played: 0, paused: 0, src: null, currentTime: 0, playbackRate: 1, load() {}, play() { this.played++; return Promise.resolve(); }, pause() { this.paused++; } };
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const window = {
        __sceMedia: media, __sceOnMedia: (fn) => fn(media),
        __sceAudio: audio,
        __scePlayer: { upcoming: async () => { if (opts.upcomingDelay) await wait(opts.upcomingDelay); return [{ url: '/b/two', title: 'Two' }]; } },
        __scsp: { api: async (path) => { apiCalls.push(path); if (path.startsWith('/resolve')) return { kind: 'track', track_authorization: 'tok', media: { transcodings: [{ url: 'https://api-v2.soundcloud.com/media/1/stream/progressive', format: { protocol: 'progressive', mime_type: 'audio/mpeg' } }] } }; return { url: 'https://cf.sndcdn.com/stream.mp3' }; }, toast: (m) => toasts.push(m) },
        addEventListener() {},
    };
    const flags = { playing: true, repeatOne: false };
    const document = { documentElement: { lang: 'fr' }, querySelector: (sel) => sel === '.playControl' ? { classList: { contains: () => flags.playing } } : sel === '.repeatControl' ? { classList: { contains: () => flags.repeatOne } } : { getAttribute: () => title.href } };
    const context = { window, document, localStorage: { getItem: () => JSON.stringify({ autoMix: true, autoMixSeconds: '12' }) }, Audio: function () { return B; }, Float32Array, Math, Number, JSON, console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise, encodeURIComponent };
    vm.runInNewContext(fs.readFileSync('content/transitions.js', 'utf8'), context);
    const tick = async (time) => { media.currentTime = time; media.handlers.timeupdate(); await new Promise((resolve) => setImmediate(resolve)); };   // vide la file des microtâches (résolution du flux)
    return { tick, media, audio, B, toasts, apiCalls, flags, setTitle: (href) => { title = { href }; }, phase: () => window.__sceTransitions.phase, t };
}

test('the next track is resolved ahead of time, crossfaded, then the native player is aligned and takes over', async (t) => {
    const p = start(t);
    await p.tick(100);
    assert.equal(p.phase(), 'idle');
    await p.tick(180);                                        // 20 s restantes : résolution du flux
    assert.equal(p.phase(), 'ready');
    assert.equal(p.B.src, 'https://cf.sndcdn.com/stream.mp3');
    assert.equal(p.apiCalls.length, 2);
    await p.tick(188.5);                                      // 11,5 s restantes : début du fondu de 12 s
    assert.equal(p.phase(), 'mixing');
    assert.equal(p.B.played, 1);
    assert.match(p.audio.xfade.gain.calls.at(-1), /^curve:1->6\.12\d*e-17:12$/);   // courbe cosinus 1 → 0 sur 12 s
    assert.equal(p.toasts[0], 'Transition vers Two');
    // SoundCloud enchaîne sur le titre attendu
    p.B.currentTime = 11.2;
    p.setTitle('/b/two'); p.media.currentTime = 0.4;
    p.t.mock.timers.tick(250);
    assert.equal(p.phase(), 'swapping');
    assert.equal(p.media.currentTime, 11.28);                 // calé sur le second flux
    p.media.handlers.seeked();
    p.t.mock.timers.tick(400);
    assert.equal(p.phase(), 'idle');
    assert.equal(p.B.paused, 1);
    assert.equal(p.audio.xfade.gain.value, 1);
});

test('a transition is abandoned when SoundCloud does not move on to the expected track', async (t) => {
    const p = start(t);
    await p.tick(181);
    await p.tick(189);
    assert.equal(p.phase(), 'mixing');
    p.t.mock.timers.tick(21000);                              // 12 s de fondu + 8 s d'attente dépassés
    assert.equal(p.phase(), 'idle');
    assert.equal(p.toasts.at(-1), 'Transition annulée');
    assert.equal(p.audio.xfade.gain.value, 1);
});

test('a transition starts when preparation finishes after the fade window has opened', async (t) => {
    const p = start(t, { upcomingDelay: 9500 });
    await p.tick(180);                                         // préparation à 20 s de la fin
    assert.equal(p.phase(), 'preparing');
    p.media.currentTime = 188.5;                               // la fenêtre de fondu est déjà ouverte
    p.t.mock.timers.tick(9500);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(p.phase(), 'mixing');
    assert.equal(p.B.played, 1);
});

test('choosing another track during the crossfade gives the native player its sound back', async (t) => {
    const skipped = start(t);
    await skipped.tick(181);
    await skipped.tick(189);
    assert.equal(skipped.phase(), 'mixing');
    skipped.setTitle('/c/three');                             // ni le titre sortant, ni le titre attendu
    skipped.t.mock.timers.tick(250);
    assert.equal(skipped.phase(), 'idle');
    assert.equal(skipped.audio.xfade.gain.value, 1);
    assert.notEqual(skipped.toasts.at(-1), 'Transition annulée');
});

test('no transition starts while the current track repeats', async (t) => {
    const p = start(t);
    p.flags.repeatOne = true;
    await p.tick(181);
    await p.tick(189);
    assert.notEqual(p.phase(), 'mixing');
    assert.equal(p.B.played, 0);
});

test('a pause that lasts during the crossfade cancels it', async (t) => {
    const p = start(t);
    await p.tick(181);
    await p.tick(189);
    p.flags.playing = false;
    p.t.mock.timers.tick(450);                                // bref passage hors lecture : toléré
    assert.equal(p.phase(), 'mixing');
    p.t.mock.timers.tick(800);
    assert.equal(p.phase(), 'idle');
    assert.equal(p.audio.xfade.gain.value, 1);
});
