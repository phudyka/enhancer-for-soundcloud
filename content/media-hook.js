/*
 * Enhancer for SoundCloud™ — crochet média (monde principal, document_start)
 *
 * 1. SoundCloud crée son <audio> en mémoire sans l'attacher au DOM : on
 *    intercepte HTMLMediaElement.play pour mémoriser l'élément actif
 *    (window.__sceMedia, window.__sceOnMedia).
 *
 * 2. SoundCloud branche cet élément sur son propre AudioContext
 *    (createMediaElementSource). Chrome n'autorise qu'un branchement par
 *    élément : impossible d'en créer un second. On intercepte donc le sien et
 *    on insère une chaîne transparente (input → output, deux GainNode à 1)
 *    entre sa source et ses destinations. audio.js y placera ensuite ses
 *    effets et son analyseur, dans le contexte de SoundCloud, sans rien casser.
 *
 *      SC source ─→ [input ─→ … nos effets … ─→ output] ─→ destinations SC
 *
 *    Exposé : window.__sceAudioTap = { ctx, el, source, input, output },
 *             window.__sceOnAudioTap(fn) — appelé à chaque nouveau branchement.
 *
 * Un élément marqué `el.__sceIgnore = true` (platine B du mode DJ) est laissé
 * tel quel : ni mémorisé comme lecteur actif, ni intercepté dans le graphe.
 *
 * Coût : trois wrappers d'une ligne, rien d'autre.
 */
(() => {
    'use strict';
    if (window.__sceMediaHooked) return;
    window.__sceMediaHooked = true;

    // ── 0. volume natif à 100 % ────────────────────────────────────
    // Le panneau Audio porte un volume linéaire (gain de notre chaîne). Pour qu'il
    // soit la seule atténuation, le volume SoundCloud (relu ici au chargement depuis
    // localStorage) est fixé à 100 % ; l'ancienne valeur devient notre volume initial.
    try {
        const settings = JSON.parse(localStorage.getItem('scsp:settings') || '{}');
        if (settings.speedControl !== false) {
            const KEY = 'V2::local::settings';
            const native = JSON.parse(localStorage.getItem(KEY) || '{}');
            if (native && typeof native === 'object' && ((typeof native.volume === 'number' && native.volume < 1) || native.muted)) {
                const ours = JSON.parse(localStorage.getItem('sce:audio') || '{}') || {};
                if (ours.volume == null) { ours.volume = typeof native.volume === 'number' ? Math.round(native.volume * 100) / 100 : 1; ours.muted = !!native.muted; localStorage.setItem('sce:audio', JSON.stringify(ours)); }
                localStorage.setItem(KEY, JSON.stringify({ ...native, volume: 1, muted: false }));
            }
        }
    } catch {}

    // ── 1. élément média actif ─────────────────────────────────────
    const mediaListeners = new Set();
    const media = { el: null };
    Object.defineProperty(window, '__sceMedia', { get: () => media.el, configurable: false });
    window.__sceOnMedia = (fn) => { mediaListeners.add(fn); if (media.el) fn(media.el); return () => mediaListeners.delete(fn); };
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
        if (media.el !== this && !this.__sceIgnore) { media.el = this; for (const fn of mediaListeners) { try { fn(this); } catch (e) { console.warn('[SCE] media listener', e); } } }
        return origPlay.apply(this, args);
    };

    // ── 2. insertion dans le graphe Web Audio de SoundCloud ────────
    const tapListeners = new Set();
    let tap = null;                         // { ctx, el, source, input, output }
    const taps = new WeakMap();             // source node → tap
    Object.defineProperty(window, '__sceAudioTap', { get: () => tap, configurable: false });
    window.__sceOnAudioTap = (fn) => { tapListeners.add(fn); if (tap) fn(tap); return () => tapListeners.delete(fn); };

    const origCMES = AudioContext.prototype.createMediaElementSource;
    AudioContext.prototype.createMediaElementSource = function (el) {
        const source = origCMES.call(this, el);
        if (el?.__sceIgnore) return source;
        try {
            const input = this.createGain(), output = this.createGain();
            origConnect.call(input, output);                       // chaîne transparente par défaut
            origConnect.call(source, input);
            tap = { ctx: this, el, source, input, output };
            taps.set(source, tap);
            for (const fn of tapListeners) { try { fn(tap); } catch (e) { console.warn('[SCE] tap listener', e); } }
        } catch (e) { console.warn('[SCE] audio tap', e); }
        return source;
    };

    // Les connexions / déconnexions que SoundCloud fait depuis sa source passent par notre sortie
    const origConnect = AudioNode.prototype.connect;
    const origDisconnect = AudioNode.prototype.disconnect;
    AudioNode.prototype.connect = function (...args) {
        const t = taps.get(this);
        return t ? origConnect.apply(t.output, args) : origConnect.apply(this, args);
    };
    AudioNode.prototype.disconnect = function (...args) {
        const t = taps.get(this);
        if (!t) return origDisconnect.apply(this, args);
        if (args.length && args[0] === t.input) return;             // ne jamais couper source → input
        return origDisconnect.apply(t.output, args);
    };
})();
