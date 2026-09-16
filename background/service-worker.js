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
        await pruneHistory();
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
                await chrome.declarativeNetRequest.updateEnabledRulesets(msg.enabled ? { enableRulesetIds: ['ads'] } : { disableRulesetIds: ['ads'] });
                sendResponse({ ok: true });
                break;
            case 'popup-command':      // depuis le popup : relayer à la page
                sendResponse(await sendToPage({ type: 'command', command: msg.command, value: msg.value, force: msg.force }));
                break;
            case 'popup-get-queue': {
                const tab = await soundcloudTab();
                if (!tab) { sendResponse({ ok: false, reason: 'no-tab' }); break; }
                try { sendResponse(await chrome.tabs.sendMessage(tab.id, { type: 'get-queue' }) || { ok: false }); }
                catch (e) { sendResponse({ ok: false, reason: String(e) }); }
                break;
            }
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
        chrome.tabs.create({ url: chrome.runtime.getURL('guide/guide.html') }).catch(() => chrome.runtime.openOptionsPage());
    }
    // Réaligne le blocage des pubs sur le réglage (au cas où le navigateur l'aurait réinitialisé)
    const { settings } = await chrome.storage.sync.get('settings');
    await chrome.declarativeNetRequest.updateEnabledRulesets(settings?.blockAds ? { enableRulesetIds: ['ads'] } : { disableRulesetIds: ['ads'] }).catch(() => {});
});
