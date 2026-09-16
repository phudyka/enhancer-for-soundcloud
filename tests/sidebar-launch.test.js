const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function startWorker(existingTabs = []) {
    const tabs = [...existingTabs];
    const created = [];
    let onMessage;
    const chrome = {
        action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
        commands: { onCommand: { addListener() {} } },
        sidePanel: { setPanelBehavior: async () => {} },
        runtime: { onMessage: { addListener(listener) { onMessage = listener; } }, onInstalled: { addListener() {} } },
        tabs: {
            async query() { return [...tabs]; },
            async create(options) {
                created.push(options);
                const tab = { id: 100 + created.length, windowId: 1, url: options.url };
                tabs.push(tab);
                return tab;
            },
            async update() {},
        },
        windows: { async update() {} },
        storage: { session: { async set() {} } },
    };
    vm.runInNewContext(fs.readFileSync('background/service-worker.js', 'utf8'), { chrome, console, Date });
    const send = (message) => Promise.race([
        new Promise((resolve) => onMessage(message, {}, resolve)),
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

test('opening the player reuses an existing SoundCloud tab', async () => {
    const worker = startWorker([{ id: 4, windowId: 1, url: 'https://soundcloud.com/stream' }]);
    const result = await worker.send({ type: 'popup-ensure-tab' });
    assert.equal(result.ok, true);
    assert.equal(worker.created.length, 0);
});
