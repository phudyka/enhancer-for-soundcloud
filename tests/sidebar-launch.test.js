const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function startWorker(existingTabs = [], sidePanel = { setPanelBehavior: async () => {} }, panelMessage = async () => ({ ok: true })) {
    const tabs = [...existingTabs];
    const created = [];
    let onMessage;
    const chrome = {
        action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
        commands: { onCommand: { addListener() {} } },
        sidePanel,
        runtime: { getURL: (path) => `chrome-extension://test/${path}`, sendMessage: panelMessage, onMessage: { addListener(listener) { onMessage = listener; } }, onInstalled: { addListener() {} } },
        tabs: {
            async query() { return [...tabs]; },
            async create(options) {
                created.push(options);
                const tab = { id: 100 + created.length, windowId: 1, url: options.url };
                tabs.push(tab);
                return tab;
            },
            async update() {},
            async sendMessage() {},
        },
        windows: { async update() {} },
        storage: { session: { async set() {} } },
    };
    vm.runInNewContext(fs.readFileSync('background/service-worker.js', 'utf8'), { chrome, console, Date });
    const popupSender = { url: 'chrome-extension://test/popup/popup.html' };
    const send = (message, sender = popupSender) => Promise.race([
        new Promise((resolve) => onMessage(message, sender, resolve)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('No worker response')), 100)),
    ]);
    return { send, created };
}

test('opening the player creates one SoundCloud browser tab when none exists', async () => {
    const worker = startWorker();
    const first = await worker.send({ type: 'popup-ensure-tab' });
    const second = await worker.send({ type: 'popup-ensure-tab' });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(worker.created.length, 1);
    assert.equal(worker.created[0].url, 'https://soundcloud.com/you/likes');
});

test('the page pin opens and closes the panel only from a SoundCloud tab', async () => {
    const actions = [];
    const sidePanel = {
        setPanelBehavior: async () => {},
        async open({ windowId }) { actions.push(['open', windowId]); },
        async close({ windowId }) { actions.push(['close', windowId]); },
    };
    const worker = startWorker([{ id: 4, windowId: 1, url: 'https://soundcloud.com/stream' }], sidePanel);
    const sender = { tab: { id: 4, windowId: 1, url: 'https://soundcloud.com/stream' } };
    assert.equal((await worker.send({ type: 'panel-toggle' }, sender)).open, true);
    assert.equal((await worker.send({ type: 'panel-state' }, sender)).open, true);
    assert.equal((await worker.send({ type: 'panel-toggle' }, sender)).open, false);
    assert.deepEqual(actions, [['open', 1], ['close', 1]]);
    assert.equal((await worker.send({ type: 'panel-toggle' }, { tab: { ...sender.tab, url: 'https://example.com/' } })).ok, false);
});

test('the page pin asks the panel to close on Chromium versions without sidePanel.close', async () => {
    const messages = [];
    const sidePanel = { setPanelBehavior: async () => {}, async open() {} };
    const worker = startWorker([{ id: 4, windowId: 1, url: 'https://soundcloud.com/stream' }], sidePanel,
        async (message) => { messages.push(message); return { ok: true }; });
    const sender = { tab: { id: 4, windowId: 1, url: 'https://soundcloud.com/stream' } };
    assert.equal((await worker.send({ type: 'panel-toggle' }, sender)).open, true);
    assert.equal((await worker.send({ type: 'panel-toggle' }, sender)).open, false);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, 'panel-request-close');
    assert.equal(messages[0].windowId, 1);
});

test('opening the player reuses an existing SoundCloud tab', async () => {
    const worker = startWorker([{ id: 4, windowId: 1, url: 'https://soundcloud.com/stream' }]);
    const result = await worker.send({ type: 'popup-ensure-tab' });
    assert.equal(result.ok, true);
    assert.equal(worker.created.length, 0);
});
