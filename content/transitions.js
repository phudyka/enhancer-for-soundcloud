/*
 * Enhancer for SoundCloud™ — transitions automatiques (monde principal)
 *
 * Quand le titre en cours approche de sa fin, le titre suivant de la file
 * SoundCloud est lu en flux dans un second <audio> (branché sur le même
 * AudioContext, après le volume de l'utilisateur) et un fondu croisé à
 * puissance constante est joué, avec échange des basses à mi-parcours.
 * Lorsque SoundCloud enchaîne lui-même sur ce titre, le lecteur natif est
 * calé sur la position du second flux, puis reprend seul : la file, les
 * compteurs et l'historique de SoundCloud restent inchangés.
 *
 *   idle → preparing (résolution du flux, ~10 s avant) → ready → mixing → idle
 *
 * Réglages : autoMix (défaut : off), autoMixSeconds (4–30 s, défaut 12).
 * Dépend de window.__scePlayer.upcoming (player-api.js), window.__scsp.api
 * (shuffle.js) et window.__sceAudio (audio.js : ctx, master, xfade, eqLow).
 */
(() => {
    'use strict';
    try { if (JSON.parse(localStorage.getItem('scsp:settings') || '{}').extensionDisabled === true) return; } catch {}
    const $ = (s) => document.querySelector(s);
    const SEL = { play: '.playControl', title: '.playbackSoundBadge__titleLink', repeat: '.repeatControl' };
    const L = (document.documentElement.lang || 'en').startsWith('fr')
        ? { to: 'Transition vers', off: 'Transition annulée' }
        : { to: 'Transition to', off: 'Transition cancelled' };
    const readSettings = () => { try { return JSON.parse(localStorage.getItem('scsp:settings') || '{}'); } catch { return {}; } };
    let settings = readSettings();   // relu sur changement seulement, pas à chaque timeupdate
    const enabled = () => settings.autoMix === true;
    const duration = () => Math.min(30, Math.max(4, Number(settings.autoMixSeconds) || 12));
    const S = () => window.__scsp, A = () => window.__sceAudio;
    const currentUrl = () => $(SEL.title)?.getAttribute('href')?.split('?')[0] || null;   // la file et le lecteur n'indiquent pas toujours le même ?in=
    const isPlaying = () => !!$(SEL.play)?.classList.contains('playing');
    const repeatsOne = () => !!$(SEL.repeat)?.classList.contains('m-one');   // le titre reprend au début : rien à enchaîner
    const PREPARE_AHEAD = 10;         // secondes avant le fondu pour résoudre et précharger le flux
    const SWAP_TIMEOUT = 8;           // secondes après le fondu pour que SoundCloud enchaîne, sinon abandon
    const POINTS = 64;

    const state = { phase: 'idle', forUrl: null, track: null, el: null, src: null, low: null, gain: null, mixStart: 0, mixDur: 0, watcher: null, stalled: 0 };
    const curve = (fn) => Float32Array.from({ length: POINTS }, (_, i) => fn(i / (POINTS - 1)));
    const EQUAL_OUT = curve((t) => Math.cos(t * Math.PI / 2)), EQUAL_IN = curve((t) => Math.sin(t * Math.PI / 2));
    const remainingTime = (media) => (media.duration - media.currentTime) / (media.playbackRate || 1);

    /** Résout le titre suivant de la file en URL de flux progressif. */
    async function resolveNext() {
        const items = await window.__scePlayer?.upcoming?.().catch(() => null);
        const next = items?.[0];
        if (!next?.url || !S()?.api) return null;
        const track = await S().api(`/resolve?url=${encodeURIComponent(`https://soundcloud.com${next.url}`)}`).catch(() => null);
        if (!track || track.kind !== 'track') return null;
        const tcs = track.media?.transcodings || [];
        const tc = tcs.find((t) => t.format?.protocol === 'progressive') || tcs.find((t) => /mpeg/.test(t.format?.mime_type || ''));
        if (!tc || track.policy === 'SNIP') return null;
        const res = await S().api(`${tc.url.replace('https://api-v2.soundcloud.com', '')}?track_authorization=${track.track_authorization}`).catch(() => null);
        if (!res?.url) return null;
        return { url: next.url.split('?')[0], title: next.title || track.title || '', stream: res.url };
    }
    /** Second flux, branché après le volume de l'utilisateur (master) dans le contexte de SoundCloud. */
    function ensureB() {
        const a = A(); if (!a?.ctx || !a.master) return false;
        if (state.el && state.gain) return true;
        try {
            const el = new Audio(); el.__sceIgnore = true; el.crossOrigin = 'anonymous'; el.preload = 'auto';
            const src = a.ctx.createMediaElementSource(el);
            const low = a.ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 200;
            const gain = a.ctx.createGain(); gain.gain.value = 0;
            src.connect(low); low.connect(gain); gain.connect(a.master);
            Object.assign(state, { el, src, low, gain });
            return true;
        } catch (e) { console.warn('[SCE] transitions : second flux', e); return false; }
    }
    function reset(silent) {
        const a = A(), ctx = a?.ctx, now = ctx?.currentTime || 0;
        if (a?.xfade) { a.xfade.gain.cancelScheduledValues(now); a.xfade.gain.setTargetAtTime(1, now, 0.05); }
        if (a?.eqLow) { a.eqLow.gain.cancelScheduledValues(now); a.eqLow.gain.setTargetAtTime(0, now, 0.05); }
        if (state.gain) { state.gain.gain.cancelScheduledValues(now); state.gain.gain.setTargetAtTime(0, now, 0.05); }
        if (state.el && !state.el.paused) setTimeout(() => state.el?.pause(), 300);
        clearInterval(state.watcher); state.watcher = null;
        if (state.phase === 'mixing' && !silent) S()?.toast?.(L.off);
        state.phase = 'idle'; state.forUrl = null; state.track = null; state.mixStart = 0;
    }
    function prepare(url) {
        state.phase = 'preparing'; state.forUrl = url;
        resolveNext().then((next) => {
            if (state.phase !== 'preparing' || state.forUrl !== url) return;
            if (!next || next.url === url) { state.phase = 'skip'; return; }
            A()?.ensure?.();
            if (!ensureB()) { state.phase = 'skip'; return; }
            state.track = next;
            state.el.src = next.stream; state.el.load();
            state.phase = 'ready';
            tryBegin(window.__sceMedia);
        }).catch((e) => { console.warn('[SCE] transitions : préparation', e); if (state.phase === 'preparing' && state.forUrl === url) state.phase = 'skip'; });
    }
    function tryBegin(media) {
        if (state.phase !== 'ready' || !media || !enabled() || media.paused || !Number.isFinite(media.duration) || media.duration <= 0) return false;
        const url = currentUrl();
        if (state.forUrl && state.forUrl !== url) { reset(true); return false; }
        const remaining = remainingTime(media);
        if (remaining <= duration() && remaining > 1 && isPlaying() && !repeatsOne()) {
            begin(media);
            return true;
        }
        return false;
    }
    function begin(media) {
        const a = A(); if (!a?.xfade || !state.el) { reset(true); return; }
        const ctx = a.ctx, now = ctx.currentTime, dur = duration();
        state.el.playbackRate = media.playbackRate || 1;
        try { state.el.currentTime = 0; } catch {}
        state.el.play().catch(() => reset(true));
        a.xfade.gain.cancelScheduledValues(now); a.xfade.gain.setValueAtTime(1, now); a.xfade.gain.setValueCurveAtTime(EQUAL_OUT, now, dur);
        state.gain.gain.cancelScheduledValues(now); state.gain.gain.setValueAtTime(0, now); state.gain.gain.setValueCurveAtTime(EQUAL_IN, now, dur);
        // Basses : celles du nouveau titre coupées au départ, échange à mi-parcours
        state.low.gain.cancelScheduledValues(now); state.low.gain.setValueAtTime(-30, now); state.low.gain.setTargetAtTime(0, now + dur * 0.45, 0.4);
        a.eqLow.gain.cancelScheduledValues(now); a.eqLow.gain.setValueAtTime(0, now); a.eqLow.gain.setTargetAtTime(-30, now + dur * 0.45, 0.4);
        state.phase = 'mixing'; state.mixStart = Date.now(); state.mixDur = dur; state.stalled = 0;
        S()?.toast?.(`${L.to} ${state.track.title}`);
        clearInterval(state.watcher); state.watcher = setInterval(watch, 200);
    }
    /** Pendant le fondu : attend que SoundCloud enchaîne sur le titre attendu, puis cale le lecteur natif dessus. */
    function watch() {
        if (state.phase !== 'mixing') { clearInterval(state.watcher); return; }
        const elapsed = (Date.now() - state.mixStart) / 1000;
        const media = window.__sceMedia, url = currentUrl();
        // Autre titre choisi, ou pause prolongée pendant le fondu : le lecteur natif ne doit pas rester muet.
        if (url !== state.forUrl && url !== state.track.url) { reset(true); return; }
        state.stalled = isPlaying() ? 0 : state.stalled + 1;
        if (state.stalled >= 5) { reset(true); return; }
        if (url === state.track.url && media && !media.paused && media.readyState >= 2 && media.currentTime < 3) { swap(media); return; }
        if (elapsed > state.mixDur + SWAP_TIMEOUT) reset(false);
    }
    function swap(media) {
        state.phase = 'swapping'; clearInterval(state.watcher); state.watcher = null;
        const a = A(), ctx = a.ctx;
        const target = state.el.currentTime + 0.08;
        const finish = () => {
            const now = ctx.currentTime;
            a.xfade.gain.cancelScheduledValues(now); a.xfade.gain.setValueAtTime(0, now); a.xfade.gain.linearRampToValueAtTime(1, now + 0.2);
            state.gain.gain.cancelScheduledValues(now); state.gain.gain.setValueAtTime(state.gain.gain.value, now); state.gain.gain.linearRampToValueAtTime(0, now + 0.2);
            a.eqLow.gain.cancelScheduledValues(now); a.eqLow.gain.setValueAtTime(0, now);
            setTimeout(() => { state.el?.pause(); state.phase = 'idle'; state.track = null; state.forUrl = null; }, 300);
        };
        try {
            const now = ctx.currentTime;
            a.xfade.gain.cancelScheduledValues(now); a.xfade.gain.setValueAtTime(0, now);   // A muet le temps du calage
            media.currentTime = target;
            media.addEventListener('seeked', finish, { once: true });
            setTimeout(() => { if (state.phase === 'swapping') { media.removeEventListener('seeked', finish); finish(); } }, 700);
        } catch { finish(); }
    }
    function onTime(media) {
        if (media !== window.__sceMedia || media.__sceIgnore) return;
        if (!enabled()) { if (state.phase !== 'idle') reset(true); return; }
        const url = currentUrl();
        if (state.phase === 'mixing' || state.phase === 'swapping') return;
        if (state.forUrl && state.forUrl !== url) { reset(true); }
        if (!Number.isFinite(media.duration) || media.duration <= 0 || media.paused) return;
        const remaining = remainingTime(media);
        const dur = duration();
        if (state.phase === 'idle' && url && remaining <= dur + PREPARE_AHEAD && remaining > dur + 0.5) prepare(url);
        else if (state.phase === 'ready') tryBegin(media);
    }
    if (typeof window.__sceOnMedia === 'function') {
        window.__sceOnMedia((el) => { if (!el.__sceMixHooked) { el.__sceMixHooked = true; el.addEventListener('timeupdate', () => onTime(el)); } });
    }
    const onSettings = () => { settings = readSettings(); if (!enabled() && state.phase !== 'idle') reset(true); };
    window.addEventListener('sce:settings-change', onSettings);
    window.addEventListener('storage', (e) => { if (e.key === 'scsp:settings') onSettings(); });
    window.__sceTransitions = Object.freeze({ get phase() { return state.phase; }, reset: () => reset(true) });
})();
