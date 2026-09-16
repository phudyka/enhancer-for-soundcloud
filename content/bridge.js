/*
 * Enhancer for SoundCloud™ — pont (monde isolé)
 *
 * Seul script avec accès aux API chrome.*. Il :
 *   1. synchronise chrome.storage.sync → localStorage 'scsp:settings' (lu par shuffle.js) ;
 *   2. relaie les commandes du service worker / popup vers la page (postMessage) ;
 *   3. remonte les événements de la page (shuffle terminé, état du lecteur) vers
 *      le service worker, qui tient l'historique et alimente le popup / le PiP.
 */
(() => {
    'use strict';
    const DEFAULTS = { hijackPlayerShuffle: true, speedControl: true, library: true, accent: '', homePage: '', blockAds: false };

    // 1. Réglages → page
    async function pushSettings() {
        const { settings } = await chrome.storage.sync.get('settings');
        const merged = { ...DEFAULTS, ...(settings || {}) };
        try { localStorage.setItem('scsp:settings', JSON.stringify(merged)); } catch {}
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
            const once = (e) => {
                if (e.source !== window || e.data?.sce !== 'state') return;
                window.removeEventListener('message', once);
                sendResponse(e.data);
            };
            window.addEventListener('message', once);
            window.postMessage({ sce: 'command', command: 'get-state' }, location.origin);
            setTimeout(() => { window.removeEventListener('message', once); }, 1500);
            return true; // réponse asynchrone
        }
        return false;
    });

    // 3. Événements page → service worker
    window.addEventListener('message', (e) => {
        if (e.source !== window || !e.data) return;
        if (e.data.scsp === 'event') chrome.runtime.sendMessage({ type: 'page-event', event: e.data }).catch(() => {});
        if (e.data.sce === 'state')  chrome.runtime.sendMessage({ type: 'player-state', state: e.data }).catch(() => {});
    });
})();
