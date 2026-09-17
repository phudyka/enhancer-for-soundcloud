/*
 * Enhancer for SoundCloud™ — télécommande du lecteur (monde principal)
 *
 * Expose l'état du lecteur natif et des commandes simples au pont (monde
 * isolé), qui les relaie au popup, au service worker (raccourcis globaux) et
 * au futur lecteur épinglable (Document Picture-in-Picture).
 *
 *   ← { sce: 'command', command: 'toggle-play' | 'next-track' | 'prev-track' | 'repeat' | 'seek' | 'speed' | 'sleep', value? }
 *   → { sce: 'state', playing, title, artist, artwork, position, duration, url, rate, repeat, sleep }
 *
 * File d'attente : { sce: 'command', command: 'get-queue' | 'queue-play' | 'queue-remove', value? }
 *   → { sce: 'queue', items: [{ index, title, artist, url, artwork, duration }] }
 * SoundCloud ne rend les éléments de sa file que lorsque le panneau est ouvert
 * (liste virtualisée) : on l'ouvre invisible le temps de la lire, puis on le
 * referme, sauf s'il était déjà ouvert par l'utilisateur.
 *
 * Minuteur d'arrêt ('sleep') : value = minutes → fondu de 8 s puis pause ;
 * value = 'end' → pause à la fin du titre en cours ; value = 0 → annulation.
 * L'état expose `sleep` : secondes restantes, 'end', ou null.
 */
(() => {
    'use strict';
    try { if (JSON.parse(localStorage.getItem('scsp:settings') || '{}').extensionDisabled === true) return; } catch {}
    const SEL = {
        play:    '.playControl',
        next:    '.skipControl__next',
        prev:    '.skipControl__prev',
        repeat:  '.repeatControl',
        title:   '.playbackSoundBadge__titleLink',
        artist:  '.playbackSoundBadge__lightLink',
        artwork: '.playbackSoundBadge__avatar .image__full, .playbackSoundBadge__avatar span[style*="background-image"]',
        progress:'.playbackTimeline__progressWrapper',
        queue:   '.queue',
        queueToggle: '.playbackSoundBadge__showQueue',
        queueHide: '.queue__hide',
        queueItem: '.queueItemView',
    };
    const SILENT = 'sce-queue-silent';
    const QUEUE_LIMIT = 30;
    const $ = (s) => document.querySelector(s);

    document.addEventListener('click', (event) => {
        const queue = $(SEL.queue);
        if (!queue?.classList.contains('m-visible') || queue.classList.contains(SILENT)) return;
        const toggle = $(SEL.queueToggle);
        if (queue.contains(event.target) || toggle?.contains(event.target)) return;
        $(SEL.queueHide)?.click();
    }, true);

    function artworkUrl() {
        const el = $(SEL.artwork);
        const m = el && (el.style?.backgroundImage || '').match(/url\("?(.*?)"?\)/);
        return m ? m[1].replace(/-t\d+x\d+\./, '-t500x500.') : (el?.src || null);
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
            repeat:   $(SEL.repeat)?.classList.contains('m-one') ? 'one' : $(SEL.repeat)?.classList.contains('m-all') ? 'all' : 'off',
            sleep:    sleep.at ? Math.max(0, Math.round((sleep.at - Date.now()) / 1000)) : sleep.endOfTrack ? 'end' : null,
        };
    }

    // The pinned player reads the same snapshot as the popup and service worker.
    window.__scePlayerState = state;

    /* ── Minuteur d'arrêt ─────────────────────────────────────────── */
    const sleep = { at: null, endOfTrack: false, timer: null, fading: false };
    const FADE_SECONDS = 8;
    const isPlaying = () => !!$(SEL.play)?.classList.contains('playing');
    const pauseIfPlaying = () => { if (isPlaying()) $(SEL.play)?.click(); };

    function cancelSleep(publish = true) {
        clearTimeout(sleep.timer); sleep.timer = null;
        sleep.at = null; sleep.endOfTrack = false;
        if (sleep.fading) restoreGain();
        if (publish) window.postMessage(state(), location.origin);
    }
    function restoreGain() {
        sleep.fading = false;
        const tap = window.__sceAudioTap;
        if (tap) { const g = tap.output.gain; g.cancelScheduledValues(tap.ctx.currentTime); g.setValueAtTime(1, tap.ctx.currentTime); }
        else if (window.__sceMedia) window.__sceMedia.volume = sleep.volume ?? 1;
    }
    /** Fondu vers le silence (gain de la chaîne audio, sinon volume du média), puis pause et retour au niveau initial. */
    function fadeAndPause() {
        sleep.timer = null; sleep.at = null;
        if (!isPlaying()) { cancelSleep(); return; }
        sleep.fading = true;
        const tap = window.__sceAudioTap, media = window.__sceMedia;
        if (tap) {
            const g = tap.output.gain, now = tap.ctx.currentTime;
            g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0.0001, now + FADE_SECONDS);
        } else if (media) {
            sleep.volume = media.volume;
            const steps = FADE_SECONDS * 10, start = media.volume;
            let i = 0;
            const iv = setInterval(() => { i++; media.volume = Math.max(0, start * (1 - i / steps)); if (i >= steps || !sleep.fading) clearInterval(iv); }, 100);
        }
        setTimeout(() => { if (!sleep.fading) return; pauseIfPlaying(); setTimeout(() => { restoreGain(); window.postMessage(state(), location.origin); }, 250); }, FADE_SECONDS * 1000 + 200);
    }
    function setSleep(value) {
        cancelSleep(false);
        if (value === 'end') sleep.endOfTrack = true;
        else if (Number.isFinite(Number(value)) && Number(value) > 0) {
            sleep.at = Date.now() + Number(value) * 60000;
            sleep.timer = setTimeout(fadeAndPause, Math.max(0, sleep.at - Date.now() - FADE_SECONDS * 1000));
        }
        window.postMessage(state(), location.origin);
    }
    /** Fin du titre : SoundCloud enchaîne sur le suivant ; on le met en pause dès qu'il démarre. */
    function onTrackEnded() {
        if (!sleep.endOfTrack) return;
        sleep.endOfTrack = false;
        let tries = 0;
        const iv = setInterval(() => { tries++; if (isPlaying()) { pauseIfPlaying(); clearInterval(iv); window.postMessage(state(), location.origin); } else if (tries > 30) clearInterval(iv); }, 200);
    }

    /* ── File d'attente ───────────────────────────────────────────── */
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    function silentStyle() {
        if (document.getElementById(`${SILENT}-style`)) return;
        const style = document.createElement('style'); style.id = `${SILENT}-style`;
        style.textContent = `.queue.${SILENT} { visibility: hidden !important; pointer-events: none !important; transition: none !important; }`;
        (document.head || document.documentElement).appendChild(style);
    }
    /** Élément de la file → données du panneau. `index` est relatif au titre actif (1 = suivant). */
    function queueItemData(el, index) {
        const titleEl = el.querySelector('.queueItemView__title a, a.queueItemView__title, .queueItemView__title');
        const artSelector = '.queueItemView__artworkImage, .queueItemView__artwork .image__full, .queueItemView__artwork img, .queueItemView__artwork [style*="background-image"], [style*="background-image"]';
        const artNodes = el.querySelectorAll ? [...el.querySelectorAll(artSelector)] : [el.querySelector(artSelector)];
        let artwork = null;
        for (const art of artNodes) {
            if (!art) continue;
            const sources = [art.style?.backgroundImage, art.getAttribute?.('data-original'), art.getAttribute?.('src'),
                typeof getComputedStyle === 'function' ? getComputedStyle(art).backgroundImage : ''];
            for (const source of sources) {
                if (!source || source === 'none') continue;
                const url = source.match(/url\(["']?([^"')]+)["']?\)/)?.[1] || source;
                if (/^https?:\/\//.test(url)) { artwork = url; break; }
            }
            if (artwork) break;
        }
        return {
            index,
            title: (titleEl?.textContent || '').trim(),
            artist: (el.querySelector('.queueItemView__username')?.textContent || '').trim(),
            url: titleEl?.getAttribute?.('href') || null,
            artwork: artwork?.replace(/-t\d+x\d+\./, '-t120x120.') || null,
            duration: (el.querySelector('.queueItemView__duration')?.textContent || '').trim(),
        };
    }
    /** Titres rendus après le titre actif, dans l'ordre. */
    function upcomingItems() {
        const items = [...document.querySelectorAll(SEL.queueItem)];
        const active = items.findIndex((el) => el.classList.contains('m-active'));
        return items.slice(active + 1, active + 1 + QUEUE_LIMIT);
    }
    let queueBusy = null;
    /** Ouvre la file si besoin (invisible), exécute `fn(items)`, referme. Sérialisé. */
    function withQueue(fn) {
        const run = async () => {
            const queue = $(SEL.queue);
            const wasOpen = !!queue?.classList.contains('m-visible');
            if (!wasOpen) {
                if (!queue || !$(SEL.queueToggle)) return fn([]);
                silentStyle(); queue.classList.add(SILENT);
                $(SEL.queueToggle).click();
                await wait(500);
            }
            try { return await fn(upcomingItems()); }
            finally {
                if (!wasOpen) {
                    $(SEL.queueHide)?.click();
                    await wait(300);
                    queue.classList.remove(SILENT);
                }
            }
        };
        queueBusy = (queueBusy || Promise.resolve()).then(run, run);
        return queueBusy;
    }
    const publishQueue = (items) => window.postMessage({ sce: 'queue', items: items.map((el, i) => queueItemData(el, i + 1)) }, location.origin);
    function queueCommand(cmd, value) {
        const target = (items) => {
            const idx = Number(value?.index) - 1;
            const byIndex = items[idx];
            if (byIndex && (!value?.url || queueItemData(byIndex, idx + 1).url === value.url)) return byIndex;
            return items.find((el, i) => queueItemData(el, i + 1).url === value?.url) || null;
        };
        return withQueue(async (items) => {
            if (cmd === 'queue-play') {
                target(items)?.querySelector('.queueItemView__playButton, .queueItemView__artwork')?.click();
                await wait(150);
                publishQueue(upcomingItems());
            } else if (cmd === 'queue-remove') {
                target(items)?.querySelector('.queueItemView__remove')?.click();
                await wait(150);
                publishQueue(upcomingItems());
            } else publishQueue(items);
        });
    }

    /** Titres à suivre (données), pour les transitions automatiques. */
    window.__scePlayer = Object.freeze({ upcoming: () => withQueue(async (items) => items.map((el, i) => queueItemData(el, i + 1))) });

    function command(cmd, value) {
        if (cmd === 'get-queue' || cmd === 'queue-play' || cmd === 'queue-remove') { queueCommand(cmd, value); if (cmd === 'get-queue') return; }
        switch (cmd) {
            case 'toggle-play': $(SEL.play)?.click(); break;
            case 'next-track':  $(SEL.next)?.click(); break;
            case 'prev-track':  $(SEL.prev)?.click(); break;
            case 'seek':        if (window.__sceMedia && Number.isFinite(value)) window.__sceMedia.currentTime = value; break;
            case 'repeat':      $(SEL.repeat)?.click(); break;
            case 'speed':       window.dispatchEvent(new CustomEvent('sce:speed', { detail: { rate: value } })); break;
            case 'sleep':       setSleep(value); return;
            case 'get-state':   break;
        }
        window.postMessage(state(), location.origin);
    }

    window.addEventListener('message', (e) => {
        if (e.source !== window || !e.data || e.data.sce !== 'command') return;
        command(e.data.command, e.data.value);
    });

    // Publie l'état à chaque changement notable (lecture/pause, titre), pas en continu.
    // Les mutations sont regroupées par image, et seules celles de la barre du lecteur
    // sont observées avec leurs attributs (le reste de la page en change en permanence).
    let last = '', queued = false, bar = null;
    const publish = () => {
        queued = false;
        const s = state();
        const sig = `${s.playing}|${s.title}|${s.url}`;
        if (sig !== last) { last = sig; window.postMessage(s, location.origin); }
    };
    const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(publish); } };
    const barObserver = new MutationObserver(schedule);
    function attach() {
        const el = document.querySelector('.playControls');
        if (!el || el === bar) return;
        bar = el; barObserver.disconnect();
        barObserver.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'title'] });
        schedule();
    }
    new MutationObserver(() => { if (!bar?.isConnected) attach(); }).observe(document.body, { childList: true, subtree: true });
    attach();
    if (typeof window.__sceOnMedia === 'function') window.__sceOnMedia((el) => { el.addEventListener('play', schedule); el.addEventListener('pause', schedule); el.addEventListener('ended', onTrackEnded); });
})();
