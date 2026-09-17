const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const plain = (value) => JSON.parse(JSON.stringify(value));

function start(t, { href = '/a/one', stored } = {}) {
    t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const values = new Map(stored ? [['sce:samples', JSON.stringify(stored)]] : []);
    const media = { currentTime: 30, duration: 200, addEventListener() {} };
    const keys = {};
    const document = {
        documentElement: { lang: 'fr' }, activeElement: null, body: {},
        querySelector: (sel) => sel.includes('titleLink') ? { getAttribute: () => href, title: 'One' } : null,
        querySelectorAll: () => [], getElementById: () => null, addEventListener: (type, cb) => { keys[type] = cb; },
    };
    const window = { __sceMedia: media, __sceOnMedia: () => {}, addEventListener() {} };
    const context = { window, document, localStorage: { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) }, MutationObserver: class { observe() {} }, setInterval, clearInterval, setTimeout, Number, Math, JSON, console, navigator: {} };
    vm.runInNewContext(fs.readFileSync('content/sampler.js', 'utf8'), context);
    return { S: window.__sceSampler, media, values, key: (code, shiftKey = false) => keys.keydown({ code, shiftKey, preventDefault() {} }), t };
}

test('A and B are set from the keyboard and the loop jumps back to A', (t) => {
    const p = start(t);
    p.key('BracketLeft');                       // A = 30
    p.media.currentTime = 34.5; p.key('BracketRight');
    assert.deepEqual(plain(p.S.loop), { a: 30, b: 34.5, on: false });
    p.key('BracketLeft', true);                 // Maj : A −0,1 s
    assert.equal(p.S.loop.a, 29.9);
    p.key('Backslash');
    assert.equal(p.S.loop.on, true);
    p.media.currentTime = 34.49; p.t.mock.timers.tick(30);
    assert.equal(p.media.currentTime, 29.9);
    p.media.currentTime = 31; p.t.mock.timers.tick(30);
    assert.equal(p.media.currentTime, 31);
    p.key('Backslash');
    assert.equal(p.S.loop.on, false);
});

test('samples are saved per track and can be replayed', (t) => {
    const p = start(t);
    p.S.setPoint('a', 12); p.S.setPoint('b', 15.25);
    p.S.save();
    p.S.setPoint('a', 60); p.S.setPoint('b', 62);
    p.S.save();
    const list = p.S.list();
    assert.equal(list.length, 2);
    assert.equal(list[0].name, 'Sample 1');
    assert.deepEqual(JSON.parse(p.values.get('sce:samples'))['/a/one'][1], { name: 'Sample 2', a: 60, b: 62 });
    p.S.setPoint('a', 1); p.S.setPoint('b', 1.01);       // trop court : pas de boucle possible
    p.S.setLoop(true);
    assert.equal(p.S.loop.on, false);
});

test('samples ignore the playlist context of the track URL', (t) => {
    const p = start(t, { href: '/a/one?in=a/sets/mix', stored: { '/a/one?in=a/sets/old': [{ name: 'Old', a: 1, b: 2 }], '/a/one': [{ name: 'Base', a: 3, b: 4 }] } });
    assert.deepEqual(Object.keys(JSON.parse(p.values.get('sce:samples'))), ['/a/one']);
    assert.deepEqual(p.S.list().map((sample) => sample.name), ['Base', 'Old']);
});
