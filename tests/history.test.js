const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const plain = (value) => JSON.parse(JSON.stringify(value)); // objets d'un autre contexte VM : comparer par structure

/* ── content/history.js : mesure du temps écouté ─────────────────────── */
function startTracker(settings = {}) {
    const posted = [];
    const listeners = {};
    let mediaHandlers = {};
    const media = { paused: false, currentTime: 0, playbackRate: 1, addEventListener(type, cb) { mediaHandlers[type] = cb; } };
    const window = {
        addEventListener: (name, cb) => { listeners[name] = cb; },
        postMessage: (msg) => posted.push(msg),
        __sceOnMedia: (fn) => fn(media),
    };
    const context = { window, document: { addEventListener() {}, hidden: false }, localStorage: { getItem: () => JSON.stringify(settings) }, location: { origin: 'https://soundcloud.com' }, Date, Math };
    vm.runInNewContext(fs.readFileSync('content/history.js', 'utf8'), context);
    const state = (s) => listeners.message({ source: window, data: { sce: 'state', playing: true, ...s } });
    const tick = (t) => { media.currentTime = t; mediaHandlers.timeupdate(); };
    return { posted, state, tick, media, listeners, window };
}

test('listening time accumulates per track and is sent when the track changes', () => {
    const t = startTracker();
    t.state({ url: '/a/one', title: 'One', artist: 'A', duration: 200 });
    for (let s = 0; s <= 12; s += 0.25) t.tick(s);
    assert.equal(t.posted.length, 0);                       // pas encore 15 s : rien envoyé
    t.tick(80);                                             // saut (seek) : ignoré
    for (let s = 80.25; s <= 84; s += 0.25) t.tick(s);
    t.state({ url: '/b/two', title: 'Two', artist: 'B', duration: 100 });
    assert.equal(t.posted.length, 2);                       // envoi intermédiaire à 15 s, puis final au changement de titre
    assert.equal(t.posted[0].entry.id, t.posted[1].entry.id);
    const entry = t.posted[1].entry;
    assert.equal(t.posted[1].sce, 'listen');
    assert.equal(entry.url, '/a/one');
    assert.equal(entry.title, 'One');
    assert.equal(entry.duration, 200);
    assert.equal(entry.listened, 16);
    assert.equal(typeof entry.id, 'string');
});

test('progress is flushed every 15 s of listening and on pause, keeping the same id', () => {
    const t = startTracker();
    t.state({ url: '/a/one', title: 'One', duration: 200 });
    for (let s = 0; s <= 31; s += 0.5) t.tick(s);
    assert.equal(t.posted.length, 2);
    assert.equal(t.posted[0].entry.id, t.posted[1].entry.id);
    assert.equal(t.posted[1].entry.listened, 30);
    t.state({ url: '/a/one', title: 'One', duration: 200, playing: false });
    assert.equal(t.posted.length, 3);
    assert.equal(t.posted[2].entry.listened, 31);
});

test('a listen already sent is not sent again by the next pause or hidden tab', () => {
    const t = startTracker();
    t.state({ url: '/a/one', title: 'One', duration: 200 });
    for (let s = 0; s <= 8; s += 0.5) t.tick(s);
    t.state({ url: '/a/one', title: 'One', duration: 200, playing: false });
    t.state({ url: '/a/one', title: 'One', duration: 200, playing: false });   // état republié sans progression
    t.listeners.pagehide();
    assert.equal(t.posted.length, 1);
    assert.equal(t.posted[0].entry.listened, 8);
});

test('nothing is recorded when history is disabled', () => {
    const t = startTracker({ history: false });
    t.state({ url: '/a/one', title: 'One', duration: 200 });
    for (let s = 0; s <= 40; s += 0.5) t.tick(s);
    t.state({ url: '/b/two', title: 'Two' });
    assert.equal(t.posted.length, 0);
});

/* ── background/service-worker.js : stockage ────────────────────────── */
function startWorker() {
    const local = {};
    let onMessage;
    const chrome = {
        action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
        commands: { onCommand: { addListener() {} } },
        sidePanel: { setPanelBehavior: async () => {} },
        runtime: { getURL: (path) => `chrome-extension://test/${path}`, onMessage: { addListener(listener) { onMessage = listener; } }, onInstalled: { addListener() {} } },
        tabs: { async query() { return []; } },
        storage: {
            session: { async set() {} },
            local: {
                async get(key) { if (key === null) return { ...local }; return key in local ? { [key]: local[key] } : {}; },
                async set(obj) { Object.assign(local, obj); },
                async remove(keys) { for (const k of [].concat(keys)) delete local[k]; },
            },
        },
    };
    vm.runInNewContext(fs.readFileSync('background/service-worker.js', 'utf8'), { chrome, console, Date });
    const soundcloudSender = { tab: { id: 4, windowId: 1, url: 'https://soundcloud.com/stream' } };
    const statsSender = { url: 'chrome-extension://test/stats/stats.html' };
    const send = (message, sender = soundcloudSender) => new Promise((resolve) => onMessage(message, sender, resolve));
    return { send, local, statsSender };
}

test('the worker keeps one entry per listen, updated with the longest time', async () => {
    const w = startWorker();
    const at = new Date(2026, 8, 16, 14, 0).getTime();
    assert.deepEqual(plain(await w.send({ type: 'listen', entry: { id: 'x1', url: '/a/one', title: 'One', at, listened: 3 } })), { ok: true, skipped: true });
    await w.send({ type: 'listen', entry: { id: 'x1', url: '/a/one', title: 'One', artist: 'A', at, listened: 15 } });
    await w.send({ type: 'listen', entry: { id: 'x1', url: '/a/one', title: 'One', artist: 'A', at, listened: 42 } });
    assert.deepEqual(plain(await w.send({ type: 'listen', entry: { id: 'x1', url: '/a/one', title: 'One', artist: 'A', at, listened: 42 } })), { ok: true, skipped: true });   // sans progression : mois non réécrit
    await w.send({ type: 'listen', entry: { id: 'x2', url: '/b/two', title: 'Two', at: at + 60000, listened: 9 } });
    assert.deepEqual(Object.keys(w.local), ['history:2026-09']);
    const { entries } = await w.send({ type: 'history-get' }, w.statsSender);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].listened, 42);
    assert.equal(entries[0].artist, 'A');
    assert.equal(entries[1].url, '/b/two');
    assert.deepEqual(plain(await w.send({ type: 'listen', entry: { url: '/x' } })), { ok: false });
    assert.deepEqual(plain(await w.send({ type: 'history-get' }, { url: 'chrome-extension://test/popup/popup.html' })), { ok: false });
    await w.send({ type: 'history-clear' }, w.statsSender);
    assert.deepEqual(w.local, {});
});

test('installing keeps settings already synced from another device', async () => {
    let onInstalled, sync = { settings: { shuffleMode: 'random', blockAds: true } };
    const opened = [];
    const chrome = {
        action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
        commands: { onCommand: { addListener() {} } },
        sidePanel: { setPanelBehavior: async () => {} },
        runtime: { onMessage: { addListener() {} }, onInstalled: { addListener(listener) { onInstalled = listener; } }, getURL: (path) => path, openOptionsPage() {} },
        tabs: { async query() { return []; }, async create(options) { opened.push(options.url); } },
        declarativeNetRequest: { async updateEnabledRulesets() {} },
        storage: { session: { async set() {} }, local: { async get() { return {}; }, async set() {} }, sync: { async get() { return sync; }, async set(value) { sync = value; } } },
    };
    vm.runInNewContext(fs.readFileSync('background/service-worker.js', 'utf8'), { chrome, console, Date });
    await onInstalled({ reason: 'install' });
    assert.deepEqual(plain(sync.settings), { shuffleMode: 'random', speedControl: true, library: true, blockAds: true });
    assert.deepEqual(opened, ['guide/guide.html']);
});

/* ── stats/stats-model.js : agrégats ────────────────────────────────── */
test('statistics aggregate listens by track, artist and time', () => {
    const context = {};
    vm.runInNewContext(fs.readFileSync('stats/stats-model.js', 'utf8'), context);
    const S = context.SCE_STATS;
    const now = new Date(2026, 8, 16, 18, 0).getTime();
    const day = 86400000;
    const entries = [
        { url: '/a/one', title: 'One', artist: 'A', duration: 100, at: now - 3600000, listened: 95 },
        { url: '/a/one', title: 'One', artist: 'A', duration: 100, at: now - 2 * day, listened: 40 },
        { url: '/b/two', title: 'Two', artist: 'B', duration: 300, at: now - 10 * day, listened: 300 },
        { url: '/c/old', title: 'Old', artist: 'A', duration: 60, at: now - 400 * day, listened: 60 },
    ];
    assert.equal(S.filter(entries, 'today', now).length, 1);
    assert.equal(S.filter(entries, '7d', now).length, 2);
    assert.equal(S.filter(entries, '30d', now).length, 3);
    assert.equal(S.filter(entries, 'all', now).length, 4);
    const sum = S.summarize(S.filter(entries, '30d', now));
    assert.deepEqual(plain(sum), { seconds: 435, plays: 3, tracks: 2, artists: 2, completed: 2 });
    const top = S.topTracks(entries, 2);
    assert.equal(top[0].url, '/b/two');
    assert.equal(top[1].plays, 2);
    assert.equal(top[1].seconds, 135);
    const artists = S.topArtists(entries, 5);
    assert.equal(artists[0].artist, 'B');
    assert.equal(artists[1].tracks, 2);
    assert.equal(S.byHour(entries)[17], 95);
    assert.equal(S.byWeekday(entries).reduce((a, b) => a + b, 0), 495);
    const days = S.byDay(entries, 7, now);
    assert.equal(days.length, 7);
    assert.equal(days[6].seconds, 95);
    assert.equal(days[4].seconds, 40);
    assert.equal(S.fmtDuration(3725), '1 h 02 min');
    assert.equal(S.fmtDuration(59), '59 s');
    const merged = S.topTracks([...entries, { url: '/b/two?in=b/sets/mix', title: 'Two', artist: 'B', at: now, listened: 10 }], 1);   // même titre depuis une playlist
    assert.deepEqual([merged[0].url, merged[0].plays, merged[0].seconds], ['/b/two', 2, 310]);
    const csv = S.toCSV(entries).split('\n');
    assert.equal(csv.length, 5);
    assert.match(csv[1], /"https:\/\/soundcloud\.com\/a\/one","95","100"/);
});
