/*
 * Enhancer for SoundCloud™ — crochet média (monde principal, document_start)
 *
 * SoundCloud crée son <audio> en mémoire sans l'attacher au DOM : impossible
 * de le retrouver par querySelector. On intercepte donc HTMLMediaElement.play
 * AVANT que le code SoundCloud ne s'exécute, pour mémoriser l'élément actif.
 * Tout le reste (vitesse, PiP, état) s'appuie sur window.__sceMedia.
 *
 * Coût : un wrapper d'une ligne autour de play(), rien d'autre.
 */
(() => {
    'use strict';
    if (window.__sceMediaHooked) return;
    window.__sceMediaHooked = true;

    const listeners = new Set();
    const state = { el: null };

    Object.defineProperty(window, '__sceMedia', {
        get: () => state.el,
        configurable: false,
    });

    /** S'abonner aux changements d'élément média actif. */
    window.__sceOnMedia = (fn) => { listeners.add(fn); if (state.el) fn(state.el); return () => listeners.delete(fn); };

    const setActive = (el) => {
        if (state.el === el) return;
        state.el = el;
        for (const fn of listeners) { try { fn(el); } catch (e) { console.warn('[SCE] media listener', e); } }
    };

    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
        setActive(this);
        return origPlay.apply(this, args);
    };
})();
