/*
 * Enhancer for SoundCloud™ — service worker
 *
 *   - raccourcis globaux (chrome.commands) → onglet SoundCloud qui joue, sinon le plus récent
 *   - badge de lecture sur l'icône, dernier état connu du lecteur (popup)
 *   - blocage optionnel des pubs (declarativeNetRequest), repli PiP en fenêtre popup
 */

/** Icône de la barre d'outils : point orange pendant la lecture, rien sinon. */
function setBadge(playing) {
    chrome.action.setBadgeText({ text: playing ? '●' : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#1a1a1a' });
    chrome.action.setBadgeTextColor?.({ color: '#ff5500' });
}

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
                if (msg.event.type === 'pip-fallback') {          // navigateur sans Document PiP : le lecteur popup dans une petite fenêtre
                    await chrome.windows.create({ url: chrome.runtime.getURL('popup/popup.html?window=1'), type: 'popup', width: 324, height: 560 });
                }
                sendResponse({ ok: true });
                break;
            }
            case 'player-state':
                await chrome.storage.session.set({ playerState: { ...msg.state, tabId: sender.tab?.id, at: Date.now() } });
                setBadge(msg.state.playing);
                sendResponse({ ok: true });
                break;
            case 'popup-focus-tab': {
                const tab = await soundcloudTab();
                if (tab) { await chrome.tabs.update(tab.id, { active: true }); await chrome.windows.update(tab.windowId, { focused: true }); }
                sendResponse({ ok: !!tab });
                break;
            }
            case 'set-ad-blocking':
                await chrome.declarativeNetRequest.updateEnabledRulesets(msg.enabled ? { enableRulesetIds: ['ads'] } : { disableRulesetIds: ['ads'] });
                sendResponse({ ok: true });
                break;
            case 'popup-command':      // depuis le popup : relayer à la page
                sendResponse(await sendToPage({ type: 'command', command: msg.command, value: msg.value, force: msg.force }));
                break;
            case 'popup-get-state': {
                const tab = await soundcloudTab();
                if (!tab) { setBadge(false); sendResponse({ ok: false, reason: 'no-tab' }); break; }
                try { const st = await chrome.tabs.sendMessage(tab.id, { type: 'get-state' }); sendResponse(st ? { ...st, tabId: tab.id } : { ok: false }); }
                catch (e) { sendResponse({ ok: false, reason: String(e) }); }
                break;
            }
            default:
                sendResponse({ ok: false });
        }
    })();
    return true;
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason === 'install') {
        await chrome.storage.sync.set({ settings: { hijackPlayerShuffle: true, speedControl: true, library: true } });
        chrome.runtime.openOptionsPage();
    }
    // Réaligne le blocage des pubs sur le réglage (au cas où le navigateur l'aurait réinitialisé)
    const { settings } = await chrome.storage.sync.get('settings');
    await chrome.declarativeNetRequest.updateEnabledRulesets(settings?.blockAds ? { enableRulesetIds: ['ads'] } : { disableRulesetIds: ['ads'] }).catch(() => {});
});
