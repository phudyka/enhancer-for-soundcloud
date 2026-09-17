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
    let bridgeSettings = {};
    const panelPinSide = () => bridgeSettings.panelPinSide === 'right' ? 'right' : 'left';
    function applySettings(settings) {
        bridgeSettings = settings || {};
        let wasDisabled = false;
        try { wasDisabled = JSON.parse(localStorage.getItem?.('scsp:settings') || '{}').extensionDisabled === true; } catch {}
        try {
            localStorage.setItem('scsp:settings', JSON.stringify(settings || {}));
            window.dispatchEvent(new Event('sce:settings-change'));
        } catch {}
        updatePanelPin(panelOpen);
        if (wasDisabled !== (settings?.extensionDisabled === true)) {
            try { location.reload(); } catch {}
        }
    }
    let settingsChanged = false;
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.settings) { settingsChanged = true; applySettings(changes.settings.newValue); }
    });
    chrome.storage.sync.get('settings').then(({ settings }) => { if (!settingsChanged) applySettings(settings); }).catch(() => {});

    // Les réglages restent dans leur page d'extension, affichée dans SoundCloud.
    let settingsOverlay = null;
    const french = () => (document.documentElement.lang || '').startsWith('fr');
    function closeSettings() {
        settingsOverlay?.remove();
        settingsOverlay = null;
        document.querySelector('.sce-settings-button')?.setAttribute('aria-expanded', 'false');
    }
    function toggleSettings() {
        if (settingsOverlay) { closeSettings(); return; }
        const overlay = document.createElement('div'); overlay.className = 'sce-settings-overlay';
        const panel = document.createElement('div'); panel.className = 'sce-settings-panel';
        panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Enhancer for SoundCloud™');
        const close = document.createElement('button'); close.type = 'button'; close.className = 'sce-settings-close';
        close.textContent = '×'; close.title = french() ? 'Fermer les réglages' : 'Close settings'; close.setAttribute('aria-label', close.title);
        close.addEventListener('click', closeSettings);
        const frame = document.createElement('iframe'); frame.className = 'sce-settings-frame';
        frame.title = french() ? 'Enhancer for SoundCloud™ — Réglages' : 'Enhancer for SoundCloud™ — Settings';
        frame.src = chrome.runtime.getURL('options/options.html?embedded=1');
        panel.append(frame, close); overlay.append(panel); document.body.append(overlay);
        overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay) closeSettings(); });
        settingsOverlay = overlay;
        document.querySelector('.sce-settings-button')?.setAttribute('aria-expanded', 'true');
    }
    // Accès direct aux réglages depuis l'en-tête SoundCloud, même sans panneau latéral.
    function mountSettingsButton() {
        const header = document.querySelector('.header__right');
        if (!header || header.querySelector('.sce-settings-button')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sce-settings-button';
        button.title = french() ? 'Réglages d’Enhancer for SoundCloud™' : 'Enhancer for SoundCloud™ settings';
        button.setAttribute('aria-label', button.title);
        button.setAttribute('aria-expanded', settingsOverlay ? 'true' : 'false');
        button.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.6 1h2.8l.4 1.9 1.3.7 1.8-.7 1.4 2.4-1.4 1.3v1.4l1.4 1.3-1.4 2.4-1.8-.7-1.3.7-.4 1.9H6.6l-.4-1.9-1.3-.7-1.8.7L1.7 9.3l1.4-1.3V6.6L1.7 5.3l1.4-2.4 1.8.7 1.3-.7zM8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>';
        button.addEventListener('click', (event) => { if (event.isTrusted) toggleSettings(); });
        header.append(button);
    }
    // L'onglet reste accessible une fois le panneau fermé, sans passer par l'icône de l'extension.
    let panelOpen = false;
    const panelLabel = (open) => french()
        ? (open ? 'Fermer le lecteur latéral' : 'Ouvrir le lecteur latéral')
        : (open ? 'Close side player' : 'Open side player');
    function updatePanelPin(open) {
        panelOpen = open;
        if (typeof document === 'undefined') return;
        const pin = document.querySelector('.sce-player-pin');
        if (!pin) return;
        pin.title = panelLabel(open);
        pin.setAttribute('aria-label', pin.title);
        pin.setAttribute('aria-expanded', String(open));
        pin.dataset.side = panelPinSide();
    }
    function mountPanelPin() {
        if (!document.body || document.querySelector('.sce-player-pin')) return;
        const pin = document.createElement('button');
        pin.type = 'button';
        pin.className = 'sce-player-pin';
        pin.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 3.5h14v13H3zM12.5 3.5v13M6 10h4m-2-2-2 2 2 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        pin.addEventListener('click', (event) => {
            if (!event.isTrusted) return;
            chrome.runtime.sendMessage({ type: 'panel-toggle' }).then((result) => {
                if (result?.ok) updatePanelPin(result.open);
            }).catch(() => {});
        });
        document.body.append(pin);
        updatePanelPin(panelOpen);
        chrome.runtime.sendMessage({ type: 'panel-state' }).then((result) => {
            if (typeof result?.open === 'boolean') updatePanelPin(result.open);
        }).catch(() => {});
    }
    if (typeof document !== 'undefined') {
        const style = document.createElement('style');
        style.textContent = '.sce-settings-button{float:left;display:grid;place-items:center;width:38px;height:46px;border:0;background:transparent;color:#ccc;cursor:pointer}.sce-settings-button:hover,.sce-settings-button:focus-visible{color:#fff;background:rgba(255,255,255,.12)}.sce-settings-button svg{width:16px;height:16px;fill:currentColor}.sce-player-pin{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:2147483645;width:30px;height:48px;border:1px solid #555;border-right:0;border-radius:5px 0 0 5px;background:#252525;color:#ddd;box-shadow:0 2px 10px #0008;display:grid;place-items:center;cursor:pointer}.sce-player-pin[data-side=left]{left:0;right:auto;border-left:0;border-right:1px solid #555;border-radius:0 5px 5px 0}.sce-player-pin[data-side=left] svg{transform:scaleX(-1)}.sce-player-pin:hover,.sce-player-pin:focus-visible,.sce-player-pin[aria-expanded=true]{color:var(--sce-accent,#f50);border-color:currentColor}.sce-player-pin svg{width:20px;height:20px}.sce-settings-overlay{position:fixed;inset:0;z-index:2147483646}.sce-settings-panel{position:absolute;top:54px;right:12px;width:min(480px,calc(100vw - 24px));height:min(660px,calc(100vh - 66px));background:#141414;border:1px solid #444;border-radius:7px;box-shadow:0 12px 36px #0009;overflow:hidden}.sce-settings-frame{display:block;width:100%;height:100%;border:0}.sce-settings-close{position:absolute;top:9px;right:10px;width:28px;height:28px;border:0;border-radius:50%;background:#303030;color:#bbb;cursor:pointer;font:22px/26px Arial,sans-serif}.sce-settings-close:hover,.sce-settings-close:focus-visible{background:#444;color:#fff}';
        (document.head || document.documentElement).append(style);
        mountSettingsButton();
        mountPanelPin();
        let settingsButton = null, panelPin = null;
        const observer = new MutationObserver(() => {
            if (!chrome.runtime?.id) { observer.disconnect(); return; }   // extension rechargée : ce pont est orphelin
            if (settingsButton?.isConnected && panelPin?.isConnected) return;
            mountSettingsButton(); mountPanelPin();
            settingsButton = document.querySelector('.sce-settings-button'); panelPin = document.querySelector('.sce-player-pin');
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        document.addEventListener?.('keydown', (event) => { if (event.key === 'Escape' && settingsOverlay) closeSettings(); });
    }

    // 2. Commandes extension → page
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg?.type === 'panel-state-changed') { updatePanelPin(!!msg.open); return false; }
        if (msg?.type === 'command') {
            if (msg.command === 'shuffle') window.postMessage({ scsp: 'command', command: 'shuffle', force: !!msg.force }, location.origin);
            else window.postMessage({ sce: 'command', command: msg.command, value: msg.value }, location.origin);
            sendResponse({ ok: true });
        }
        // Requêtes avec réponse : la page répond par un message { sce: <reply> }
        const REQUESTS = { 'get-state': { reply: 'state', timeout: 1500 }, 'get-queue': { reply: 'queue', timeout: 4000 }, 'get-audio': { reply: 'audio-state', timeout: 1500 }, 'download-client-id': { reply: 'download-client-id', timeout: 15000 } };
        if (Object.hasOwn(REQUESTS, msg?.type)) {
            const { reply, timeout } = REQUESTS[msg.type];
            let timer = null;
            const once = (e) => {
                if (e.source !== window || e.data?.sce !== reply) return;
                clearTimeout(timer); window.removeEventListener('message', once);
                sendResponse(e.data);
            };
            window.addEventListener('message', once);
            window.postMessage({ sce: 'command', command: msg.type, value: msg.type === 'download-client-id' ? { refresh: !!msg.refresh } : undefined }, location.origin);
            timer = setTimeout(() => { window.removeEventListener('message', once); sendResponse({ ok: false, reason: 'timeout' }); }, timeout); // jamais de promesse en attente côté popup
            return true; // réponse asynchrone
        }
        return false;
    });

    // 2b. Réglages modifiés depuis la page (personnalisation libre) → chrome.storage.sync, clés autorisées seulement
    const PAGE_KEYS = new Set(['hiddenCustom', 'customizeMode']);
    async function applyPatch(patch) {
        const clean = {};
        for (const [key, value] of Object.entries(patch || {})) {
            if (!PAGE_KEYS.has(key)) continue;
            if (key === 'hiddenCustom') clean[key] = Array.isArray(value) ? value.filter((x) => typeof x === 'string' && x.length < 400).slice(0, 300) : [];
            else clean[key] = !!value;
        }
        if (!Object.keys(clean).length) return;
        const { settings } = await chrome.storage.sync.get('settings');
        await chrome.storage.sync.set({ settings: { ...(settings || {}), ...clean } });
    }
    let pendingPatch = Promise.resolve();

    // 3. Événements page → service worker
    window.addEventListener('message', (e) => {
        if (e.source !== window || !e.data) return;
        if (e.data.scsp === 'event') chrome.runtime.sendMessage({ type: 'page-event', event: e.data }).catch(() => {});
        if (e.data.sce === 'state')  chrome.runtime.sendMessage({ type: 'player-state', state: e.data }).catch(() => {});
        if (e.data.sce === 'listen' && e.data.entry) chrome.runtime.sendMessage({ type: 'listen', entry: e.data.entry }).catch(() => {});
        if (e.data.sce === 'settings-patch') pendingPatch = pendingPatch.catch(() => {}).then(() => applyPatch(e.data.patch));
        if (e.data.sce === 'download-open' && typeof e.data.url === 'string') {
            try {
                const url = new URL(e.data.url, location.origin);
                if (url.origin === 'https://soundcloud.com') {
                    const source = e.data.preset;
                    const values = {};
                    if (source?.values && typeof source.values === 'object') {
                        for (const key of ['rate', 'volume', 'bass', 'reverb', 'pitchSemitones']) {
                            if (Number.isFinite(source.values[key])) values[key] = source.values[key];
                        }
                        for (const key of ['muted', 'preservePitch']) {
                            if (typeof source.values[key] === 'boolean') values[key] = source.values[key];
                        }
                    }
                    const preset = typeof source?.name === 'string' && Object.keys(values).length
                        ? { name: source.name.slice(0, 40), values } : null;
                    chrome.runtime.sendMessage({ type: 'open-download', url: url.href, preset }).catch(() => {});
                }
            } catch {}
        }
    });
    window.addEventListener('message', (event) => {
        const frame = settingsOverlay?.querySelector('.sce-settings-frame');
        if (event.data?.sce === 'close-settings' && frame && event.source === frame.contentWindow
            && event.origin === new URL(frame.src).origin) closeSettings();
    });
})();
