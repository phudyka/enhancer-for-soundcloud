/*
 * Enhancer for SoundCloud™ — service worker
 *
 *   - raccourcis globaux (chrome.commands) → onglet SoundCloud qui joue, sinon le plus récent
 *   - badge de lecture sur l'icône, dernier état connu du lecteur (popup)
 *   - blocage optionnel des pubs (declarativeNetRequest), repli PiP en fenêtre popup
 *   - historique d'écoute local (chrome.storage.local, un tableau par mois)
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

let pendingSoundcloudTab = null;
async function ensureSoundcloudTab() {
    const existing = await soundcloudTab();
    if (existing) return existing;
    if (!pendingSoundcloudTab) {
        pendingSoundcloudTab = chrome.tabs.create({ url: 'https://soundcloud.com/you/likes', active: true })
            .finally(() => { pendingSoundcloudTab = null; });
    }
    return pendingSoundcloudTab;
}

const openPanels = new Set();
async function notifyPanel(windowId, open) {
    if (!Number.isInteger(windowId)) return;
    if (open) openPanels.add(windowId);
    else openPanels.delete(windowId);
    const tabs = await chrome.tabs.query({ windowId, url: 'https://soundcloud.com/*' });
    for (const tab of tabs) chrome.tabs.sendMessage(tab.id, { type: 'panel-state-changed', open }).catch(() => {});
}
chrome.sidePanel?.onOpened?.addListener(({ windowId }) => { notifyPanel(windowId, true).catch(() => {}); });
chrome.sidePanel?.onClosed?.addListener(({ windowId }) => { notifyPanel(windowId, false).catch(() => {}); });

async function sendToPage(message) {
    const tab = await soundcloudTab();
    if (!tab) return { ok: false, reason: 'no-tab' };
    try { return await chrome.tabs.sendMessage(tab.id, message); }
    catch (e) { return { ok: false, reason: String(e) }; }
}

/* ── Historique d'écoute ───────────────────────────────────────────────
 * Clés 'history:AAAA-MM' → tableau d'écoutes { id, url, title, artist, artwork,
 * duration, at, listened }. Une écoute arrive plusieurs fois (progression) :
 * on la remplace par son id. Les écritures sont sérialisées. */
const MIN_LISTENED = 5;                    // secondes : en dessous, ce n'est pas une écoute
const MAX_MONTHS = 24;
const monthKey = (at) => { const d = new Date(at); return `history:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
let historyQueue = Promise.resolve();
const serialized = (task) => { const run = historyQueue.then(task, task); historyQueue = run.catch(() => {}); return run; };

function recordListen(entry) {
    return serialized(async () => {
        if (!entry || typeof entry.id !== 'string' || typeof entry.url !== 'string' || !Number.isFinite(entry.at)) return { ok: false };
        const listened = Math.max(0, Math.round(Number(entry.listened) || 0));
        if (listened < MIN_LISTENED) return { ok: true, skipped: true };
        const clean = {
            id: entry.id.slice(0, 32), url: entry.url.slice(0, 300), title: String(entry.title || '').slice(0, 200),
            artist: entry.artist ? String(entry.artist).slice(0, 200) : null, artwork: entry.artwork ? String(entry.artwork).slice(0, 300) : null,
            duration: Number.isFinite(entry.duration) ? Math.round(entry.duration) : null, at: Math.round(entry.at), listened,
        };
        const key = monthKey(clean.at);
        const stored = await chrome.storage.local.get(key);
        const list = Array.isArray(stored[key]) ? stored[key] : [];
        const index = list.findIndex((item) => item.id === clean.id);
        if (index >= 0) list[index] = { ...list[index], ...clean, listened: Math.max(list[index].listened, listened) };
        else list.push(clean);
        await chrome.storage.local.set({ [key]: list });
        if (!Array.isArray(stored[key])) await pruneHistory();   // nouveau mois seulement : l'élagage relit tout le stockage
        return { ok: true };
    });
}

async function historyKeys() {
    const all = await chrome.storage.local.get(null);
    return Object.keys(all).filter((key) => key.startsWith('history:')).sort();
}

async function pruneHistory() {
    const keys = await historyKeys();
    if (keys.length > MAX_MONTHS) await chrome.storage.local.remove(keys.slice(0, keys.length - MAX_MONTHS));
}

async function readHistory() {
    const all = await chrome.storage.local.get(null);
    return Object.keys(all).filter((key) => key.startsWith('history:')).sort()
        .flatMap((key) => Array.isArray(all[key]) ? all[key] : []);
}

async function clearHistory() {
    return serialized(async () => { await chrome.storage.local.remove(await historyKeys()); return { ok: true }; });
}

chrome.commands.onCommand.addListener((command) => {
    sendToPage({ type: 'command', command });
});

// Le navigateur gère lui-même l'ouverture et la fermeture au clic sur l'icône.
if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
        console.warn('Impossible de configurer le panneau SoundCloud', error);
    });
} else {
    chrome.action.onClicked.addListener(() => {
        if (chrome.sidebarAction?.toggle) {
            chrome.sidebarAction.toggle().catch((error) => console.warn('Impossible de basculer le panneau SoundCloud', error));
        } else {
            chrome.windows.create({ url: chrome.runtime.getURL('popup/popup.html?window=1'), type: 'popup', width: 324, height: 560 }).catch(() => {});
        }
    });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Message destiné au panneau : ne pas répondre à notre propre diffusion.
    if (msg?.type === 'panel-request-close') return false;
    (async () => {
        switch (msg?.type) {
            case 'panel-state':
                if (!sender.tab?.url?.startsWith('https://soundcloud.com/')) { sendResponse({ ok: false }); break; }
                sendResponse({ ok: true, open: openPanels.has(sender.tab.windowId) });
                break;
            case 'panel-toggle': {
                if (!sender.tab?.url?.startsWith('https://soundcloud.com/')) { sendResponse({ ok: false }); break; }
                const windowId = sender.tab.windowId;
                const closing = openPanels.has(windowId) && !!(chrome.sidePanel?.close || chrome.sidebarAction?.toggle);
                if (chrome.sidePanel?.open) {
                    if (closing) await chrome.sidePanel.close({ windowId });
                    else if (openPanels.has(windowId)) {
                        const result = await chrome.runtime.sendMessage({ type: 'panel-request-close', windowId }).catch(() => null);
                        if (!result?.ok) { sendResponse({ ok: false }); break; }
                        await notifyPanel(windowId, false);
                        sendResponse({ ok: true, open: false });
                        break;
                    }
                    else await chrome.sidePanel.open({ windowId });
                } else if (chrome.sidebarAction?.toggle) await chrome.sidebarAction.toggle();
                else { sendResponse({ ok: false }); break; }
                const open = !closing;
                await notifyPanel(windowId, open);
                sendResponse({ ok: true, open });
                break;
            }
            case 'panel-opened':
            case 'panel-disposed': {
                if (!sender.url?.startsWith(chrome.runtime.getURL('popup/popup.html'))) { sendResponse({ ok: false }); break; }
                const windowId = Number(msg.windowId);
                if (!Number.isInteger(windowId)) { sendResponse({ ok: false }); break; }
                await notifyPanel(windowId, msg.type === 'panel-opened');
                sendResponse({ ok: true });
                break;
            }
            case 'panel-close': {
                if (!sender.url?.startsWith(chrome.runtime.getURL('popup/popup.html'))) { sendResponse({ ok: false }); break; }
                const windowId = Number(msg.windowId);
                if (!Number.isInteger(windowId)) { sendResponse({ ok: false }); break; }
                if (chrome.sidePanel?.close) await chrome.sidePanel.close({ windowId });
                else if (chrome.sidebarAction?.close) await chrome.sidebarAction.close();
                else { sendResponse({ ok: false, reason: 'unsupported' }); break; }
                await notifyPanel(windowId, false);
                sendResponse({ ok: true });
                break;
            }
            case 'open-download': {
                if (sender.tab && !sender.tab.url?.startsWith('https://soundcloud.com/')) { sendResponse({ ok: false }); break; }
                const url = new URL(msg.url || '', 'https://soundcloud.com');
                if (url.origin !== 'https://soundcloud.com' || !/^\/[A-Za-z0-9_-]+\/(?:(?:sets|albums)\/)?[A-Za-z0-9_-]+/.test(url.pathname)) { sendResponse({ ok: false }); break; }
                const params = new URLSearchParams({ url: url.href });
                if (msg.preset && typeof msg.preset.name === 'string' && msg.preset.values && typeof msg.preset.values === 'object') {
                    const values = {};
                    for (const [key, min, max] of [['rate', 0.1, 3], ['volume', 0, 1], ['bass', 0, 12], ['reverb', 0, 1], ['pitchSemitones', -12, 12]]) {
                        const value = msg.preset.values[key];
                        if (Number.isFinite(value) && value >= min && value <= max) values[key] = value;
                    }
                    for (const key of ['muted', 'preservePitch']) {
                        if (typeof msg.preset.values[key] === 'boolean') values[key] = msg.preset.values[key];
                    }
                    if (Object.keys(values).length) params.set('preset', JSON.stringify({ name: msg.preset.name.slice(0, 40), values }));
                }
                await chrome.tabs.create({ url: chrome.runtime.getURL(`downloads/downloads.html?${params}`) });
                sendResponse({ ok: true });
                break;
            }
            case 'download-client-id': {
                const tab = await soundcloudTab();
                if (!tab) { sendResponse({ ok: false, reason: 'no-tab' }); break; }
                try { sendResponse(await chrome.tabs.sendMessage(tab.id, { type: 'download-client-id', refresh: !!msg.refresh })); }
                catch (error) { sendResponse({ ok: false, reason: String(error) }); }
                break;
            }
            case 'page-event': {
                if (msg.event?.type === 'pip-fallback') {          // navigateur sans Document PiP : le lecteur popup dans une petite fenêtre
                    await chrome.windows.create({ url: chrome.runtime.getURL('popup/popup.html?window=1'), type: 'popup', width: 324, height: 560 });
                }
                sendResponse({ ok: true });
                break;
            }
            case 'player-state':
                await chrome.storage.session.set({ playerState: { ...msg.state, tabId: sender.tab?.id, at: Date.now() } });
                setBadge(!!msg.state?.playing);
                sendResponse({ ok: true });
                break;
            case 'popup-focus-tab': {
                const tab = await ensureSoundcloudTab();
                if (tab) { await chrome.tabs.update(tab.id, { active: true }); await chrome.windows.update(tab.windowId, { focused: true }); }
                sendResponse({ ok: !!tab });
                break;
            }
            case 'popup-ensure-tab': {
                const tab = await ensureSoundcloudTab();
                sendResponse({ ok: !!tab, tabId: tab?.id });
                break;
            }
            case 'listen':
                sendResponse(await recordListen(msg.entry));
                break;
            case 'history-get':
                sendResponse({ ok: true, entries: await readHistory() });
                break;
            case 'history-clear':
                sendResponse(await clearHistory());
                break;
            case 'set-ad-blocking':
                await chrome.declarativeNetRequest.updateEnabledRulesets(msg.enabled && !(await chrome.storage.sync.get('settings')).settings?.extensionDisabled ? { enableRulesetIds: ['ads'] } : { disableRulesetIds: ['ads'] });
                sendResponse({ ok: true });
                break;
            case 'popup-command':      // depuis le popup : relayer à la page
                sendResponse(await sendToPage({ type: 'command', command: msg.command, value: msg.value, force: msg.force }));
                break;
            case 'popup-get-queue':
            case 'popup-get-audio':
                sendResponse(await sendToPage({ type: msg.type === 'popup-get-queue' ? 'get-queue' : 'get-audio' }) || { ok: false });
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
    })().catch((error) => {                 // jamais de promesse sans réponse côté appelant
        console.warn('[SCE] message', msg?.type, error);
        sendResponse({ ok: false, reason: String(error) });
    });
    return true;
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason === 'install') {
        await chrome.storage.sync.set({ settings: { shuffleMode: 'queue', speedControl: true, library: true } });
        chrome.tabs.create({ url: chrome.runtime.getURL('guide/guide.html') }).catch(() => chrome.runtime.openOptionsPage());
    }
    // Réaligne le blocage des pubs sur le réglage (au cas où le navigateur l'aurait réinitialisé)
    const { settings } = await chrome.storage.sync.get('settings');
    await chrome.declarativeNetRequest.updateEnabledRulesets(settings?.blockAds && !settings?.extensionDisabled ? { enableRulesetIds: ['ads'] } : { disableRulesetIds: ['ads'] }).catch(() => {});
});
