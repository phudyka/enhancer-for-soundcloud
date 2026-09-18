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
        style.textContent = '.sce-settings-button{float:left;display:grid;place-items:center;width:38px;height:46px;border:0;background:transparent;color:#ccc;cursor:pointer}.sce-settings-button:hover,.sce-settings-button:focus-visible{color:#fff;background:rgba(255,255,255,.12);outline:2px solid #699fff;outline-offset:-2px}.sce-settings-button svg{width:16px;height:16px;fill:currentColor}.sce-player-pin{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:2147483645;width:32px;height:52px;border:1px solid #555;border-right:0;border-radius:10px 0 0 10px;background:#1f1f1f;color:#ddd;box-shadow:0 8px 24px #0007;display:grid;place-items:center;cursor:pointer}.sce-player-pin[data-side=left]{left:0;right:auto;border-left:0;border-right:1px solid #555;border-radius:0 10px 10px 0}.sce-player-pin[data-side=left] svg{transform:scaleX(-1)}.sce-player-pin:hover,.sce-player-pin:focus-visible,.sce-player-pin[aria-expanded=true]{color:var(--sce-accent,#f50);border-color:currentColor}.sce-player-pin:focus-visible{outline:2px solid #699fff;outline-offset:2px}.sce-player-pin svg{width:20px;height:20px}.sce-settings-overlay{position:fixed;inset:0;z-index:2147483646}.sce-settings-panel{position:absolute;top:54px;right:12px;width:min(480px,calc(100vw - 24px));height:min(660px,calc(100vh - 66px));background:#121212;border:1px solid #333;border-radius:20px;box-shadow:0 12px 36px #0009;overflow:hidden}.sce-settings-frame{display:block;width:100%;height:100%;border:0}.sce-settings-close{position:absolute;top:9px;right:10px;width:32px;height:32px;border:0;border-radius:50%;background:#303030;color:#bbb;cursor:pointer;font:22px/30px Arial,sans-serif}.sce-settings-close:hover,.sce-settings-close:focus-visible{background:#444;color:#fff}.sce-settings-close:focus-visible{outline:2px solid #699fff;outline-offset:2px}';
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
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (sender?.id && sender.id !== chrome.runtime.id) return false;
        if (msg?.type === 'panel-state-changed') { updatePanelPin(!!msg.open); return false; }
        if (msg?.type === 'command') {
            if (msg.command === 'shuffle') window.postMessage({ scsp: 'command', command: 'shuffle', force: !!msg.force }, location.origin);
            else window.postMessage({ sce: 'command', command: msg.command, value: msg.value }, location.origin);
            sendResponse({ ok: true });
        }
        // Requêtes avec réponse : la page répond par un message { sce: <reply> }
        const REQUESTS = { 'get-state': { reply: 'state', timeout: 1500 }, 'get-queue': { reply: 'queue', timeout: 4000 }, 'get-audio': { reply: 'audio-state', timeout: 1500 } };
        if (Object.hasOwn(REQUESTS, msg?.type)) {
            const { reply, timeout } = REQUESTS[msg.type];
            let timer = null;
            const once = (e) => {
                if (e.source !== window || e.data?.sce !== reply) return;
                clearTimeout(timer); window.removeEventListener('message', once);
                sendResponse(e.data);
            };
            window.addEventListener('message', once);
            window.postMessage({ sce: 'command', command: msg.type }, location.origin);
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
    const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : null;
    const finite = (value, min, max) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : null;
    function soundcloudPath(value) {
        if (typeof value !== 'string' || !value) return null;
        try {
            const url = new URL(value || '', location.origin);
            if (url.origin !== 'https://soundcloud.com') return null;
            return url.pathname + url.search;
        } catch { return null; }
    }
    function mediaUrl(value) {
        if (typeof value !== 'string' || !value) return null;
        try {
            const url = new URL(value || '', location.href);
            const host = url.hostname.toLowerCase();
            if (url.protocol !== 'https:') return null;
            if (host === 'soundcloud.com' || host.endsWith('.soundcloud.com') || host === 'sndcdn.com'
                || host.endsWith('.sndcdn.com')) return url.href;
        } catch {}
        return null;
    }
    function cleanState(data) {
        const title = text(data?.title, 300);
        const url = soundcloudPath(data?.url);
        if (!title || !url) {
            return {
                sce: 'state',
                playing: false,
                title: null,
                artist: null,
                url: null,
                artwork: null,
                position: 0,
                duration: 0,
                rate: 1,
                repeat: 'off',
                sleep: null,
            };
        }
        const duration = finite(Number(data.duration), 0, 24 * 60 * 60);
        const position = finite(Number(data.position), 0, 24 * 60 * 60);
        const sleep = data.sleep === 'end' ? 'end' : finite(Number(data.sleep), 0, 24 * 60 * 60);
        return {
            sce: 'state',
            playing: !!data.playing,
            title,
            artist: text(data.artist, 200),
            url,
            artwork: mediaUrl(data.artwork),
            position: position ?? 0,
            duration: duration ?? 0,
            rate: finite(Number(data.rate), 0.1, 4) ?? 1,
            repeat: ['off', 'one', 'all'].includes(data.repeat) ? data.repeat : 'off',
            sleep: data.sleep == null ? null : sleep,
        };
    }
    function cleanListen(entry) {
        const url = soundcloudPath(entry?.url);
        const title = text(entry?.title, 300);
        if (!url || !title || typeof entry?.id !== 'string' || !Number.isFinite(entry.at)) return null;
        return {
            id: entry.id.slice(0, 64),
            url,
            title,
            artist: text(entry.artist, 200),
            artwork: mediaUrl(entry.artwork),
            duration: entry.duration == null ? null : finite(Number(entry.duration), 0, 24 * 60 * 60),
            at: Math.round(entry.at),
            listened: finite(Number(entry.listened), 0, 24 * 60 * 60) ?? 0,
        };
    }
    window.addEventListener('message', (e) => {
        if (e.source !== window || !e.data) return;
        if (e.data.scsp === 'event' && e.data.type === 'pip-fallback') chrome.runtime.sendMessage({ type: 'page-event', event: { type: 'pip-fallback' } }).catch(() => {});
        if (e.data.sce === 'state') {
            const state = cleanState(e.data);
            if (state) chrome.runtime.sendMessage({ type: 'player-state', state }).catch(() => {});
        }
        if (e.data.sce === 'listen') {
            const entry = cleanListen(e.data.entry);
            if (entry) chrome.runtime.sendMessage({ type: 'listen', entry }).catch(() => {});
        }
        if (e.data.sce === 'settings-patch') pendingPatch = pendingPatch.catch(() => {}).then(() => applyPatch(e.data.patch));
    });
    window.addEventListener('message', (event) => {
        const frame = settingsOverlay?.querySelector('.sce-settings-frame');
        if (event.data?.sce === 'close-settings' && frame && event.source === frame.contentWindow
            && event.origin === new URL(frame.src).origin) closeSettings();
    });
})();
