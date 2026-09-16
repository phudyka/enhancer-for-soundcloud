const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
test('the toolbar action opens the browser sidebar instead of a compact popup', () => {
    const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
    const worker = fs.readFileSync('background/service-worker.js', 'utf8');
    const popup = fs.readFileSync('popup/popup.js', 'utf8');
    assert.equal(manifest.action.default_popup, undefined);
    assert.equal(manifest.side_panel.default_path, 'popup/popup.html');
    assert.equal(manifest.sidebar_action.default_panel, 'popup/popup.html');
    assert.match(worker, /setPanelBehavior\(\{ openPanelOnActionClick: true \}\)/);
    assert.match(worker, /chrome\.sidebarAction\.toggle\(\)/);
    assert.doesNotMatch(worker, /chrome\.sidePanel\.open\(/);
    assert.doesNotMatch(popup, /compactPopup|closeIfPopup/);
    assert.match(popup, /chrome\.storage\.onChanged\.addListener/);
});
