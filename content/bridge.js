/*
 * Enhancer for SoundCloud™ — pont (monde isolé)
 *
 * Seul script avec accès aux API chrome.*. Il :
 *   1. synchronise chrome.storage.sync → localStorage 'scsp:settings' (lu par shuffle.js) ;
 *   2. relaie les commandes du service worker / popup vers la page (postMessage) ;
 *   3. remonte les événements de la page (shuffle terminé, état du lecteur,
 *      écoutes) vers le service worker, qui tient l'historique et alimente le
 *      panneau latéral / le PiP.
 */
(() => {
    'use strict';
    // 1. Réglages → page (chaque module applique ses propres valeurs par défaut ; une seule source : options.js)
    async function pushSettings() {
        const { settings } = await chrome.storage.sync.get('settings');
        try {
            localStorage.setItem('scsp:settings', JSON.stringify(settings || {}));
            window.dispatchEvent(new Event('sce:settings-change'));
        } catch {}
    }
    pushSettings();
    chrome.storage.onChanged.addListener((changes, area) => { if (area === 'sync' && changes.settings) pushSettings(); });

    // 2. Commandes extension → page
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg?.type === 'command') {
            if (msg.command === 'shuffle') window.postMessage({ scsp: 'command', command: 'shuffle', force: !!msg.force }, location.origin);
            else window.postMessage({ sce: 'command', command: msg.command, value: msg.value }, location.origin);
            sendResponse({ ok: true });
        }
        if (msg?.type === 'get-state') {
            let timer = null;
            const once = (e) => {
                if (e.source !== window || e.data?.sce !== 'state') return;
                clearTimeout(timer); window.removeEventListener('message', once);
                sendResponse(e.data);
            };
            window.addEventListener('message', once);
            window.postMessage({ sce: 'command', command: 'get-state' }, location.origin);
            timer = setTimeout(() => { window.removeEventListener('message', once); sendResponse({ ok: false, reason: 'timeout' }); }, 1500); // jamais de promesse en attente côté popup
            return true; // réponse asynchrone
        }
        return false;
    });

    // 3. Événements page → service worker
    window.addEventListener('message', (e) => {
        if (e.source !== window || !e.data) return;
        if (e.data.scsp === 'event') chrome.runtime.sendMessage({ type: 'page-event', event: e.data }).catch(() => {});
        if (e.data.sce === 'state')  chrome.runtime.sendMessage({ type: 'player-state', state: e.data }).catch(() => {});
        if (e.data.sce === 'listen' && e.data.entry) chrome.runtime.sendMessage({ type: 'listen', entry: e.data.entry }).catch(() => {});
    });
})();
