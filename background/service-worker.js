/*
 * SoundCloud Enhanced — service worker
 *
 *   - raccourcis globaux (chrome.commands) → onglet SoundCloud actif ou le plus récent
 *   - historique des shuffles (chrome.storage.local, 50 entrées)
 *   - dernier état connu du lecteur, pour le popup et le futur lecteur épinglable
 */

const HISTORY_MAX = 50;

/** Onglet SoundCloud cible : celui qui joue, sinon le dernier utilisé. */
async function soundcloudTab() {
    const tabs = await chrome.tabs.query({ url: 'https://soundcloud.com/*' });
    if (!tabs.length) return null;
    return tabs.find((t) => t.audible) || tabs.find((t) => t.active) || tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
}

async function sendToPage(message) {
    const tab = await soundcloudTab();
    if (!tab) return { ok: false, reason: 'no-tab' };
    try { return await chrome.tabs.sendMessage(tab.id, message); }
    catch (e) { return { ok: false, reason: String(e) }; }
}

chrome.commands.onCommand.addListener((command) => {
    sendToPage({ type: 'command', command });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
        switch (msg?.type) {
            case 'page-event': {
                if (msg.event.type === 'shuffled') {
                    const { history = [] } = await chrome.storage.local.get('history');
                    history.unshift({ source: msg.event.source, count: msg.event.count, total: msg.event.total, at: msg.event.at });
                    await chrome.storage.local.set({ history: history.slice(0, HISTORY_MAX) });
                }
                sendResponse({ ok: true });
                break;
            }
            case 'player-state':
                await chrome.storage.session.set({ playerState: { ...msg.state, tabId: sender.tab?.id, at: Date.now() } });
                sendResponse({ ok: true });
                break;
            case 'popup-command':      // depuis le popup : relayer à la page
                sendResponse(await sendToPage({ type: 'command', command: msg.command, value: msg.value, force: msg.force }));
                break;
            case 'popup-get-state':
                sendResponse(await sendToPage({ type: 'get-state' }));
                break;
            default:
                sendResponse({ ok: false });
        }
    })();
    return true;
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason === 'install') {
        await chrome.storage.sync.set({ settings: { hijackPlayerShuffle: true, speedControl: true } });
        chrome.runtime.openOptionsPage();
    }
});
