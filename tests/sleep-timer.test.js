const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

/* player-api.js avec un DOM minimal : bouton lecture, badge du titre, média factice. */
function startPlayer(t) {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
    const posted = [];
    const playClasses = new Set(['playing']);
    const play = { classList: { contains: (c) => playClasses.has(c) }, click() { playClasses.has('playing') ? playClasses.delete('playing') : playClasses.add('playing'); } };
    const title = { title: 'One', textContent: 'One', getAttribute: () => '/a/one' };
    const document = {
        addEventListener() {},
        querySelector(sel) { if (sel === '.playControl') return play; if (sel === '.playbackSoundBadge__titleLink') return title; return null; },
        body: {},
    };
    const listeners = {}, mediaHandlers = {};
    const gain = { value: 1, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.ramped = v; } };
    const media = { currentTime: 10, duration: 200, playbackRate: 1, volume: 1, addEventListener(type, cb) { mediaHandlers[type] = cb; } };
    const window = {
        addEventListener: (name, cb) => { listeners[name] = cb; },
        postMessage: (msg) => posted.push(msg),
        __sceMedia: media,
        __sceAudioTap: { ctx: { currentTime: 0 }, output: { gain } },
        __sceOnMedia: (fn) => fn(media),
        dispatchEvent() {},
    };
    const context = { window, document, location: { origin: 'https://soundcloud.com' }, MutationObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: (cb) => cb(), setTimeout, clearTimeout, setInterval, clearInterval, Date, Number, Math, CustomEvent: class {} };
    vm.runInNewContext(fs.readFileSync('content/player-api.js', 'utf8'), context);
    const command = (command, value) => listeners.message({ source: window, data: { sce: 'command', command, value } });
    const last = () => posted[posted.length - 1];
    return { command, last, posted, playClasses, gain, mediaHandlers };
}

test('a timed stop fades the audio chain, pauses, then restores the level', (t) => {
    const p = startPlayer(t);
    p.command('sleep', 1);
    assert.equal(p.last().sleep, 60);
    t.mock.timers.tick(30000);
    p.command('get-state');
    assert.equal(p.last().sleep, 30);
    t.mock.timers.tick(22000);                                  // 52 s : le fondu de 8 s démarre
    assert.equal(p.gain.ramped, 0.0001);
    assert.equal(p.playClasses.has('playing'), true);
    t.mock.timers.tick(8500);
    assert.equal(p.playClasses.has('playing'), false);          // pause
    p.gain.value = 0;
    t.mock.timers.tick(300);                                    // minuteur imbriqué : rétablissement du niveau
    assert.equal(p.gain.value, 1);                              // niveau rétabli
    assert.equal(p.last().sleep, null);
});

test('cancelling the timer clears the state without pausing', (t) => {
    const p = startPlayer(t);
    p.command('sleep', 15);
    assert.equal(p.last().sleep, 900);
    p.command('sleep', 0);
    assert.equal(p.last().sleep, null);
    t.mock.timers.tick(20 * 60000);
    assert.equal(p.playClasses.has('playing'), true);
});

test('stopping at the end of the track pauses the next one as soon as it starts', (t) => {
    const p = startPlayer(t);
    p.command('sleep', 'end');
    assert.equal(p.last().sleep, 'end');
    p.playClasses.delete('playing');                            // SoundCloud termine le titre…
    p.mediaHandlers.ended();
    t.mock.timers.tick(400);
    p.playClasses.add('playing');                               // … puis enchaîne le suivant
    t.mock.timers.tick(400);
    assert.equal(p.playClasses.has('playing'), false);
    assert.equal(p.last().sleep, null);
});
