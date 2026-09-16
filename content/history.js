/*
 * Enhancer for SoundCloud™ — historique d'écoute (monde principal)
 *
 * Mesure le temps réellement écouté par titre, sans rien envoyer hors du
 * navigateur : l'état du lecteur (player-api.js, message { sce: 'state' })
 * donne le titre courant ; l'élément <audio> capturé par media-hook.js
 * donne la progression. Les écoutes sont remontées au service worker par le
 * pont ({ sce: 'listen', entry }) qui les range dans chrome.storage.local.
 *
 * Une écoute = un titre joué d'affilée. Elle est envoyée à chaque pause,
 * changement de titre, fermeture de page, et toutes les 15 s de lecture pour
 * survivre à une fermeture brutale. Le service worker ne garde que les
 * écoutes d'au moins 5 s (voir MIN_LISTENED côté worker).
 *
 * Réglage 'history' (défaut : activé) dans localStorage 'scsp:settings'.
 */
(() => {
    'use strict';
    const FLUSH_EVERY = 15;          // secondes écoutées entre deux envois
    const MAX_STEP = 2;              // au-delà, c'est un saut (seek), pas de l'écoute
    const enabled = () => { try { return JSON.parse(localStorage.getItem('scsp:settings') || '{}').history !== false; } catch { return true; } };

    let current = null;              // { id, url, title, artist, artwork, duration, at, listened, sentAt }
    let lastTime = null;             // dernière position connue du média

    function flush(final) {
        if (!current || current.listened <= 0) return;
        if (!final && current.listened - current.sentAt < FLUSH_EVERY) return;
        current.sentAt = current.listened;
        const { sentAt, ...entry } = current;
        entry.listened = Math.round(entry.listened);
        window.postMessage({ sce: 'listen', entry }, location.origin);
    }

    function start(state) {
        flush(true);
        current = {
            id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            url: state.url, title: state.title, artist: state.artist || null, artwork: state.artwork || null,
            duration: Number.isFinite(state.duration) ? Math.round(state.duration) : null,
            at: Date.now(), listened: 0, sentAt: 0,
        };
        lastTime = null;
    }

    function onState(state) {
        if (!enabled()) { if (current) { flush(true); current = null; } return; }
        if (!state.url || !state.title) return;
        if (!current || current.url !== state.url) start(state);
        else if (current.duration == null && Number.isFinite(state.duration)) current.duration = Math.round(state.duration);
        if (!state.playing) flush(true);
    }

    function onTimeUpdate(media) {
        if (!current || media.paused) { lastTime = media.currentTime; return; }
        const now = media.currentTime;
        if (lastTime != null) {
            const step = now - lastTime;
            if (step > 0 && step <= MAX_STEP * Math.max(1, media.playbackRate || 1)) { current.listened += step; flush(false); }
        }
        lastTime = now;
    }

    window.addEventListener('message', (e) => {
        if (e.source !== window || !e.data || e.data.sce !== 'state') return;
        onState(e.data);
    });
    if (typeof window.__sceOnMedia === 'function') {
        window.__sceOnMedia((el) => {
            if (el.__sceHistoryHooked) return;
            el.__sceHistoryHooked = true;
            el.addEventListener('timeupdate', () => onTimeUpdate(el));
            el.addEventListener('seeking', () => { lastTime = null; });
            el.addEventListener('ended', () => flush(true));
        });
    }
    window.addEventListener('pagehide', () => flush(true));
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(true); });
})();
