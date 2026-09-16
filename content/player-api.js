/*
 * Enhancer for SoundCloud™ — télécommande du lecteur (monde principal)
 *
 * Expose l'état du lecteur natif et des commandes simples au pont (monde
 * isolé), qui les relaie au popup, au service worker (raccourcis globaux) et
 * au futur lecteur épinglable (Document Picture-in-Picture).
 *
 *   ← { sce: 'command', command: 'toggle-play' | 'next-track' | 'prev-track' | 'seek', value? }
 *   → { sce: 'state', playing, title, artist, artwork, position, duration, url }
 */
(() => {
    'use strict';
    const SEL = {
        play:    '.playControl',
        next:    '.skipControl__next',
        prev:    '.skipControl__prev',
        title:   '.playbackSoundBadge__titleLink',
        artist:  '.playbackSoundBadge__lightLink',
        artwork: '.playbackSoundBadge__avatar .image__full, .playbackSoundBadge__avatar span[style*="background-image"]',
        progress:'.playbackTimeline__progressWrapper',
    };
    const $ = (s) => document.querySelector(s);

    function artworkUrl() {
        const el = $(SEL.artwork);
        const m = el && (el.style?.backgroundImage || '').match(/url\("?(.*?)"?\)/);
        return m ? m[1].replace(/-t\d+x\d+\./, '-t500x500.') : null;
    }

    function state() {
        const media = window.__sceMedia;
        const prog = $(SEL.progress);
        return {
            sce: 'state',
            playing:  !!$(SEL.play)?.classList.contains('playing'),
            title:    $(SEL.title)?.title || $(SEL.title)?.textContent?.trim() || null,
            artist:   $(SEL.artist)?.textContent?.trim() || null,
            url:      $(SEL.title)?.getAttribute('href') || null,
            artwork:  artworkUrl(),
            position: media ? media.currentTime : Number(prog?.getAttribute('aria-valuenow') || 0),
            duration: media ? media.duration    : Number(prog?.getAttribute('aria-valuemax') || 0),
            rate:     media ? media.playbackRate : 1,
        };
    }

    function command(cmd, value) {
        switch (cmd) {
            case 'toggle-play': $(SEL.play)?.click(); break;
            case 'next-track':  $(SEL.next)?.click(); break;
            case 'prev-track':  $(SEL.prev)?.click(); break;
            case 'seek':        if (window.__sceMedia && Number.isFinite(value)) window.__sceMedia.currentTime = value; break;
            case 'get-state':   break;
        }
        window.postMessage(state(), location.origin);
    }

    window.addEventListener('message', (e) => {
        if (e.source !== window || !e.data || e.data.sce !== 'command') return;
        command(e.data.command, e.data.value);
    });

    // Publie l'état à chaque changement notable (lecture/pause, titre), pas en continu.
    let last = '';
    const publish = () => {
        const s = state();
        const sig = `${s.playing}|${s.title}|${s.url}`;
        if (sig !== last) { last = sig; window.postMessage(s, location.origin); }
    };
    new MutationObserver(publish).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'title'] });
    if (typeof window.__sceOnMedia === 'function') window.__sceOnMedia((el) => { el.addEventListener('play', publish); el.addEventListener('pause', publish); });
})();
