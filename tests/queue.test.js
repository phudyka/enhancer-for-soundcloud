const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const plain = (value) => JSON.parse(JSON.stringify(value));

/* player-api.js avec une file d'attente virtualisée factice : 2 titres passés, l'actif, 3 à suivre. */
function startPlayer(t) {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
    const posted = [];
    const clicks = [];
    const node = (cls, children = {}) => ({
        className: cls, classList: { contains: (c) => cls.split(' ').includes(c), add(c) { cls += ` ${c}`; this._ = cls; }, remove(c) { cls = cls.split(' ').filter((x) => x !== c).join(' '); } },
        querySelector(sel) { for (const [key, el] of Object.entries(children)) if (sel.includes(key)) return el; return null; },
        get cls() { return cls; },
    });
    const item = (i, active) => {
        const title = { textContent: ` Titre ${i} `, getAttribute: (a) => a === 'href' ? `/artist/track-${i}` : null };
        const play = { click: () => clicks.push(`play-${i}`) };
        const remove = { click: () => clicks.push(`remove-${i}`) };
        const art = { style: { backgroundImage: `url("https://i1.sndcdn.com/artworks-x-t50x50.jpg")` } };
        return node(`queueItemView${active ? ' m-active' : ''}`, { '.queueItemView__title': title, '.queueItemView__username': { textContent: `Artiste ${i}` }, '.queueItemView__duration': { textContent: '3:10' }, '.queueItemView__playButton': play, '.queueItemView__remove': remove, '.queueItemView__artworkImage': art });
    };
    const items = [item(1), item(2), item(3, true), item(4), item(5), item(6)];
    let open = false;
    const queue = node('queue');
    const inside = {};
    queue.contains = (target) => target === queue || target === inside;
    const toggle = { contains: (target) => target === toggle, click() { open = !open; clicks.push(open ? 'open' : 'close'); queue.classList[open ? 'add' : 'remove']('m-visible'); } };
    const hide = { click: () => toggle.click() };
    const play = { classList: { contains: () => true }, click() {} };
    const styles = [];
    const documentListeners = {};
    const document = {
        addEventListener(name, cb) { documentListeners[name] = cb; },
        querySelector(sel) {
            if (sel === '.playControl') return play;
            if (sel === '.queue') return queue;
            if (sel === '.playbackSoundBadge__showQueue') return toggle;
            if (sel === '.queue__hide') return hide;
            return null;
        },
        querySelectorAll(sel) { return sel === '.queueItemView' && open ? items : []; },
        getElementById: () => null,
        createElement: () => { const el = { textContent: '' }; styles.push(el); return el; },
        head: { appendChild() {} },
        body: {},
    };
    const listeners = {};
    const window = { addEventListener: (name, cb) => { listeners[name] = cb; }, postMessage: (msg) => posted.push(msg), __sceOnMedia: () => {}, dispatchEvent() {} };
    const context = { window, document, location: { origin: 'https://soundcloud.com' }, MutationObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: (cb) => cb(), setTimeout, clearTimeout, setInterval, clearInterval, Date, Number, Math, Promise, CustomEvent: class {} };
    vm.runInNewContext(fs.readFileSync('content/player-api.js', 'utf8'), context);
    const command = async (command, value) => { listeners.message({ source: window, data: { sce: 'command', command, value } }); for (let i = 0; i < 12; i++) { t.mock.timers.tick(200); await Promise.resolve(); await Promise.resolve(); } };
    return { command, posted, clicks, queue, toggle, inside, outsideClick: (target) => documentListeners.click({ target }), isOpen: () => open };
}

test('clicking outside closes the visible queue while queue and toggle clicks leave it alone', (t) => {
    const p = startPlayer(t);
    p.toggle.click();
    p.outsideClick(p.inside);
    p.outsideClick(p.toggle);
    assert.equal(p.isOpen(), true);
    p.outsideClick({});
    assert.equal(p.isOpen(), false);
    assert.deepEqual(p.clicks, ['open', 'close']);
    p.outsideClick({});
    assert.deepEqual(p.clicks, ['open', 'close']);
});

test('the queue is read through a silently opened panel and closed afterwards', async (t) => {
    const p = startPlayer(t);
    await p.command('get-queue');
    const reply = p.posted.find((m) => m.sce === 'queue');
    assert.ok(reply);
    assert.deepEqual(plain(reply.items.map((i) => [i.index, i.title, i.artist, i.url, i.duration])), [[1, 'Titre 4', 'Artiste 4', '/artist/track-4', '3:10'], [2, 'Titre 5', 'Artiste 5', '/artist/track-5', '3:10'], [3, 'Titre 6', 'Artiste 6', '/artist/track-6', '3:10']]);
    assert.equal(reply.items[0].artwork, 'https://i1.sndcdn.com/artworks-x-t120x120.jpg');
    assert.deepEqual(p.clicks, ['open', 'close']);
    assert.equal(p.isOpen(), false);
    assert.equal(p.queue.cls.includes('sce-queue-silent'), false);
});

test('playing or removing a queued track targets it by index, checked against its url', async (t) => {
    const p = startPlayer(t);
    await p.command('queue-play', { index: 2, url: '/artist/track-5' });
    assert.deepEqual(p.clicks, ['open', 'play-5', 'close']);
    p.clicks.length = 0;
    await p.command('queue-remove', { index: 1, url: '/artist/track-6' });   // index périmé : l'url l'emporte
    assert.deepEqual(p.clicks, ['open', 'remove-6', 'close']);
});
