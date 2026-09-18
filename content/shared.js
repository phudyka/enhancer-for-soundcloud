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
    const soundcloudScript = (src) => {
        try {
            const url = new URL(src);
            const host = url.hostname.toLowerCase();
            return url.protocol === 'https:' && (host === 'soundcloud.com' || host.endsWith('.soundcloud.com')
                || host === 'sndcdn.com' || host.endsWith('.sndcdn.com'));
        } catch { return false; }
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
        for (const src of [...document.scripts].map((script) => script.src).filter(soundcloudScript).reverse()) {
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

    /**
     * Un seul observateur du DOM pour tous les modules, au plus un passage par image affichée.
     * requestAnimationFrame ne tourne pas dans un onglet en arrière-plan : aucun travail de
     * montage pendant l'écoute onglet masqué, un seul rattrapage au retour. À réserver aux
     * tâches d'interface ; ce qui doit suivre la lecture en arrière-plan garde son propre observateur.
     */
    const domListeners = new Set();
    let domQueued = false;
    const flushDom = () => { domQueued = false; for (const fn of domListeners) { try { fn(); } catch (e) { console.warn('[SCE] dom listener', e); } } };
    function onDom(fn) {
        if (!domListeners.size) {
            new MutationObserver(() => { if (!domQueued) { domQueued = true; requestAnimationFrame(flushDom); } })
                .observe(document.documentElement, { childList: true, subtree: true });
        }
        domListeners.add(fn);
    }

    /**
     * Mix harmonique : BPM et tonalité mesurés par l'analyse en direct (audio.js), mémorisés par
     * titre dans localStorage 'sce:analysis:<chemin>'. Seuls les titres déjà écoutés sont connus :
     * aucun flux n'est téléchargé pour les analyser.
     */
    const harmonic = (() => {
        const CAMELOT = {
            major: { C: '8B', 'C♯': '3B', D: '10B', 'E♭': '5B', E: '12B', F: '7B', 'F♯': '2B', G: '9B', 'A♭': '4B', A: '11B', 'B♭': '6B', B: '1B' },
            minor: { C: '5A', 'C♯': '12A', D: '7A', 'E♭': '2A', E: '9A', F: '4A', 'F♯': '11A', G: '6A', 'A♭': '1A', A: '8A', 'B♭': '3A', B: '10A' },
        };
        const PREFIX = 'sce:analysis:', VERSION = 4;
        /** Chemin du titre sans domaine ni contexte de lecture (?in=playlist). */
        const pathOf = (url) => { if (!url) return null; try { return new URL(url, 'https://soundcloud.com').pathname.replace(/\/$/, '') || null; } catch { return null; } };
        const camelot = (key, mode) => CAMELOT[mode]?.[key] || null;
        const parse = (code) => { const m = /^(1[0-2]|[1-9])([AB])$/.exec(code || ''); return m ? { n: Number(m[1]), l: m[2] } : null; };
        /** Rang de tri : 1A, 1B, 2A… 12B. */
        const rank = (code) => { const c = parse(code); return c ? c.n * 2 - (c.l === 'A' ? 1 : 0) : Infinity; };
        const entry = (value) => {
            if (!value || value.version !== VERSION) return null;
            const code = camelot(value.key, value.mode);
            const bpm = Number.isFinite(value.bpm) ? value.bpm : null;
            return code || bpm ? { bpm, key: value.key || null, mode: value.mode || null, camelot: code } : null;
        };
        function read(url) {
            const path = pathOf(url); if (!path) return null;
            try { return entry(JSON.parse(localStorage.getItem(PREFIX + path))); } catch { return null; }
        }
        /** Toutes les analyses mémorisées : Map chemin → { bpm, key, mode, camelot }. Un seul passage sur localStorage. */
        function all() {
            const out = new Map();
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (!k?.startsWith(PREFIX)) continue;
                    try { const value = entry(JSON.parse(localStorage.getItem(k))); if (value) out.set(k.slice(PREFIX.length), value); } catch {}
                }
            } catch {}
            return out;
        }
        /** Roue de Camelot : 1 même clé, 0,85 clé voisine (±1) ou relative (A↔B), 0 sinon ; null si l'une est inconnue. */
        function keyScore(a, b) {
            const x = parse(a), y = parse(b);
            if (!x || !y) return null;
            const step = Math.min((x.n - y.n + 12) % 12, (y.n - x.n + 12) % 12);
            if (step === 0) return x.l === y.l ? 1 : 0.85;
            return step === 1 && x.l === y.l ? 0.85 : 0;
        }
        /** Écart de tempo, demi et double tempo compris : 1 jusqu'à 3 %, 0,6 jusqu'à 6 %, 0 au-delà ; null si inconnu. */
        function tempoScore(a, b) {
            if (!(a > 0) || !(b > 0)) return null;
            const gap = Math.min(...[1, 2, 0.5].map((f) => Math.abs(a * f - b) / b));
            return gap <= 0.03 ? 1 : gap <= 0.06 ? 0.6 : 0;
        }
        /** Compatibilité de `b` après `a` : score 0–1, ou null faute de données communes. La tonalité compte plus que le tempo. */
        function match(a, b) {
            const k = keyScore(a?.camelot, b?.camelot), t = tempoScore(a?.bpm, b?.bpm);
            if (k === null && t === null) return null;
            if (k === 0 || t === 0) return 0;
            if (k === null) return t * 0.6;                   // tempo seul : jamais aussi sûr qu'un accord de tonalité
            if (t === null) return k * 0.8;
            return k * 0.65 + t * 0.35;
        }
        /** Titre en cours : analyse mémorisée, sinon résultat provisoire de l'analyse en direct. `path` exclut le titre des suggestions. */
        function current() {
            const path = pathOf(document.querySelector('.playbackSoundBadge__titleLink')?.getAttribute('href'));
            if (!path) return null;
            const cached = read(path);
            if (cached) return { ...cached, path };
            const live = window.__sceAudio?.analysis;
            const code = camelot(live?.key, live?.mode), bpm = Number.isFinite(live?.bpm) ? live.bpm : null;
            return code || bpm ? { bpm, key: live.key || null, mode: live.mode || null, camelot: code, path, live: true } : { path };
        }
        return Object.freeze({ camelot, rank, pathOf, read, all, current, keyScore, tempoScore, match, label: (a) => [a?.bpm ? `${a.bpm}` : '', a?.camelot || ''].filter(Boolean).join(' · ') });
    })();

    window.__sceShared = Object.freeze({ icons, formatTime, nextPath, clientId, onDom, harmonic });
})();
