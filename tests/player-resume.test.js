const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function startPlayer({ saved = null, url = '/artist/track', currentTime = 0, duration = 240 } = {}) {
    const values = new Map();
    if (saved) values.set('sce:last-position', JSON.stringify(saved));
    const localStorage = {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
    };
    const handlers = {};
    const posted = [];
    const play = { classList: { contains: (name) => name === 'playing' } };
    const title = { title: 'Track', textContent: 'Track', getAttribute: (name) => name === 'href' ? url : null };
    const media = {
        currentTime,
        duration,
        playbackRate: 1,
        addEventListener(type, callback) { handlers[type] = callback; },
    };
    const document = {
        addEventListener() {},
        querySelector(selector) {
            if (selector === '.playControl') return play;
            if (selector === '.playbackSoundBadge__titleLink') return title;
            return null;
        },
        body: {},
    };
    const window = {
        addEventListener() {},
        postMessage(message) { posted.push(message); },
        __sceMedia: media,
        __sceOnMedia(callback) { callback(media); },
        dispatchEvent() {},
    };
    const context = {
        window, document, localStorage, location: { origin: 'https://soundcloud.com' },
        MutationObserver: class { observe() {} disconnect() {} },
        requestAnimationFrame(callback) { callback(); },
        setTimeout, clearTimeout, setInterval, clearInterval, Date, Number, Math,
        CustomEvent: class {},
    };
    vm.runInNewContext(fs.readFileSync('content/player-api.js', 'utf8'), context);
    return { media, handlers, posted, values };
}

test('player resumes the last track position after a page reload', () => {
    const player = startPlayer({ saved: { url: '/artist/track', position: 200, duration: 240, at: Date.now() } });

    assert.equal(player.media.currentTime, 200);
    assert.equal(JSON.parse(player.values.get('sce:last-position')).position, 200);
    assert.equal(player.posted.at(-1).position, 200);
});

test('player does not resume a different track or a nearly finished track', () => {
    const other = startPlayer({ saved: { url: '/artist/other', position: 200, duration: 240, at: Date.now() } });
    assert.equal(other.media.currentTime, 0);

    const ended = startPlayer({ saved: { url: '/artist/track', position: 236, duration: 240, at: Date.now() } });
    assert.equal(ended.media.currentTime, 0);
});

test('player stores the current track position while listening', () => {
    const player = startPlayer({ currentTime: 0 });

    player.media.currentTime = 123.45;
    player.handlers.timeupdate();

    const saved = JSON.parse(player.values.get('sce:last-position'));
    assert.equal(saved.url, '/artist/track');
    assert.equal(saved.position, 123.5);
    assert.equal(saved.duration, 240);
});
