/* Utilities shared by the SoundCloud page scripts and the extension player. */
(() => {
    'use strict';

    const icons = Object.freeze({
        play: '<svg viewBox="0 0 16 16"><path d="M4 2v12l9-6z"/></svg>',
        pause: '<svg viewBox="0 0 16 16"><path d="M3.5 2h3v12h-3zM9.5 2h3v12h-3z"/></svg>',
    });
    const formatTime = (seconds) => {
        const whole = Math.max(0, Math.floor(seconds || 0));
        return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
    };
    const nextPath = (href) => {
        const url = new URL(href);
        url.searchParams.delete('client_id');
        return url.pathname + url.search;
    };

    /**
     * client_id de la page : dernier appel api-v2 observé, sinon cache, sinon scan des bundles JS.
     * `refresh` ignore l'historique et le cache (identifiant périmé). Renvoie null si introuvable.
     */
    async function clientId(refresh = false) {
        if (!refresh) {
            const seen = performance.getEntriesByType('resource')
                .map((entry) => (entry.name.match(/api-v2\.soundcloud\.com.*[?&]client_id=([A-Za-z0-9]{20,})/) || [])[1])
                .filter(Boolean).pop();
            if (seen) return seen;
            try {
                const cached = JSON.parse(localStorage.getItem('scsp:client_id') || 'null');
                if (/^[A-Za-z0-9]{20,}$/.test(cached)) return cached;
            } catch {}
        }
        for (const src of [...document.scripts].map((script) => script.src).filter((src) => src.includes('sndcdn')).reverse()) {
            try {
                const match = (await fetch(src).then((response) => response.text())).match(/client_id\s*[:=]\s*['"]([A-Za-z0-9]{20,})['"]/);
                if (match) {
                    try { localStorage.setItem('scsp:client_id', JSON.stringify(match[1])); } catch {}
                    return match[1];
                }
            } catch {}
        }
        return null;
    }

    window.__sceShared = Object.freeze({ icons, formatTime, nextPath, clientId });
})();
