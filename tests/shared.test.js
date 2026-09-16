const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function shared() {
    const window = {};
    vm.runInNewContext(fs.readFileSync('content/shared.js', 'utf8'), { window, URL });
    return window.__sceShared;
}

test('pagination keeps path and parameters but strips the page client id', () => {
    assert.equal(shared().nextPath('https://api-v2.soundcloud.com/me/likes?limit=200&client_id=old&offset=200'), '/me/likes?limit=200&offset=200');
});

test('player time formatting preserves the existing compact display', () => {
    const format = shared().formatTime;
    assert.equal(format(125.8), '2:05');
    assert.equal(format(-5), '0:00');
});
