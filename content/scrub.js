/*
 * Enhancer for SoundCloud™ — loupe de timeline (monde principal)
 *
 * Molette sur la forme d'onde d'un titre ou sur la barre de progression du
 * lecteur : une loupe s'ouvre au-dessus, zoom 2× → 32×, avec la forme d'onde
 * redessinée à cette échelle (échantillons fournis par SoundCloud), une règle
 * de temps et la tête de lecture. Clic ou glisser dans la loupe = placement
 * précis (au centième de seconde). Flèches ← → : ±1 s, Maj : ±0,1 s, Alt : ±0,01 s.
 * Molette vers le bas jusqu'à 1×, Échap ou clic ailleurs : fermeture.
 *
 * Design system SoundCloud : panneau #1a1a1a, barres blanches, portion lue en
 * couleur d'accent, règle grise, police du site.
 */
(() => {
    'use strict';
    try { if (JSON.parse(localStorage.getItem('scsp:settings') || '{}').extensionDisabled === true) return; } catch {}
    const NS = 'sce-scrub';
    const FONT = 'Söhne, system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif';
    const ZOOMS = [1, 2, 4, 8, 16, 32];
    const SEL = { wave: '.waveform', timeline: '.playbackTimeline__progressWrapper', badge: '.playbackSoundBadge__titleLink' };
    const $ = (s) => document.querySelector(s);
    const S = () => window.__scsp;

    let zoom = 1, panel = null, canvas = null, anchor = null, samples = null, samplesFor = null, center = null, dragging = false, raf = 0;
    const media = () => window.__sceMedia;
    const duration = () => { const m = media(); return m && Number.isFinite(m.duration) && m.duration > 0 ? m.duration : Number($(SEL.timeline)?.getAttribute('aria-valuemax') || 0); };
    const position = () => { const m = media(); return m ? m.currentTime : Number($(SEL.timeline)?.getAttribute('aria-valuenow') || 0); };
    const seek = (t) => { const m = media(); if (m) m.currentTime = Math.max(0, Math.min(duration(), t)); };
    const fmt = (s, ms = false) => { const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${ms ? r.toFixed(2).padStart(5, '0') : String(Math.floor(r)).padStart(2, '0')}`; };

    /** Échantillons de la forme d'onde du titre en cours (1800 points), via l'API. */
    async function loadSamples() {
        const href = ($(SEL.badge)?.getAttribute('href') || '').split('?')[0];
        if (!href || !S()) return null;
        if (samplesFor === href) return samples;
        samplesFor = href; samples = null;
        try {
            const tr = await S().api(`/resolve?url=${encodeURIComponent(location.origin + href)}`);
            if (tr?.waveform_url) { const w = await fetch(tr.waveform_url).then((r) => r.json()); samples = { data: w.samples, max: w.height || 140 }; }
        } catch (e) { console.warn('[SCE] waveform', e.message); }
        if (panel) draw();
        return samples;
    }

    const CSS = `
        .${NS} { position: fixed; z-index: 99998; height: 112px; background: #1a1a1a; border-radius: 3px; box-shadow: 0 4px 16px rgba(0,0,0,.5); font: 11px ${FONT}; color: #999; user-select: none; overflow: hidden; }
        .${NS} canvas { display: block; width: 100%; height: 100%; cursor: ew-resize; }
        .${NS}-hud { position: absolute; top: 6px; left: 8px; right: 8px; display: flex; justify-content: space-between; pointer-events: none; }
        .${NS}-hud b { color: #fff; font-weight: 600; font-variant-numeric: tabular-nums; }
        .${NS}-hud .z { color: var(--sce-accent, #f50); font-weight: 700; }
    `;
    function injectStyles() { if ($(`#${NS}-styles`)) return; const s = document.createElement('style'); s.id = `${NS}-styles`; s.textContent = CSS; document.head.appendChild(s); }

    function open(el) {
        injectStyles();
        anchor = el;
        if (!panel) {
            panel = document.createElement('div'); panel.className = NS;
            panel.innerHTML = `<canvas></canvas><div class="${NS}-hud"><span><b class="t"></b></span><span class="z"></span><span class="r"></span></div>`;
            canvas = panel.querySelector('canvas');
            canvas.addEventListener('mousedown', (e) => { dragging = true; seekAt(e); });
            panel.addEventListener('wheel', onWheel, { passive: false });
            document.body.appendChild(panel);
        }
        place();
        loadSamples();
        tick();
    }
    function close() { zoom = 1; cancelAnimationFrame(raf); panel?.remove(); panel = null; canvas = null; center = null; }
    function place() {
        const r = anchor.getBoundingClientRect();
        const w = Math.min(Math.max(r.width, 560), window.innerWidth - 32);
        const left = Math.max(16, Math.min(window.innerWidth - w - 16, r.left + r.width / 2 - w / 2));
        Object.assign(panel.style, { left: `${left}px`, top: `${Math.max(8, r.top - 120)}px`, width: `${w}px` });
        canvas.width = Math.round(w * devicePixelRatio); canvas.height = Math.round(112 * devicePixelRatio);
    }
    /** Fenêtre visible [t0, t1] : centrée sur `center` (curseur au moment du zoom), recadrée dans le titre. */
    function windowRange() {
        const d = duration(), W = d / zoom;
        const c = center ?? position();
        const t0 = Math.max(0, Math.min(d - W, c - W / 2));
        return [t0, t0 + W];
    }
    function seekAt(e) {
        const r = canvas.getBoundingClientRect(), [t0, t1] = windowRange();
        seek(t0 + (t1 - t0) * Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
        draw();
    }
    function niceStep(W) { for (const s of [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120]) if (W / s <= 14) return s; return 300; }

    function draw() {
        if (!panel) return;
        const ctx = canvas.getContext('2d'), dpr = devicePixelRatio, w = canvas.width / dpr, h = canvas.height / dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
        const d = duration(), [t0, t1] = windowRange(), pos = position();
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--sce-accent').trim() || '#ff5500';
        // forme d'onde : rééchantillonnage sur la fenêtre
        const top = 26, bottom = h - 18, mid = top + (bottom - top) * 0.62;
        if (samples && d) {
            const n = samples.data.length, bw = Math.max(2, Math.floor(w / 220)), gap = 1;
            for (let x = 0; x < w; x += bw + gap) {
                const ta = t0 + (t1 - t0) * (x / w), tb = t0 + (t1 - t0) * ((x + bw) / w);
                const ia = Math.floor(ta / d * n), ib = Math.max(ia + 1, Math.ceil(tb / d * n));
                let m = 0; for (let i = ia; i < ib && i < n; i++) m = Math.max(m, samples.data[i]);
                const amp = (m / samples.max) * (mid - top);
                ctx.fillStyle = ta < pos ? accent : '#fff';
                ctx.fillRect(x, mid - amp, bw, amp);
                ctx.globalAlpha = .35; ctx.fillRect(x, mid + 1, bw, amp * .55); ctx.globalAlpha = 1;
            }
        } else { ctx.fillStyle = '#333'; ctx.fillRect(0, mid - 1, w, 2); ctx.fillStyle = accent; ctx.fillRect(0, mid - 1, w * Math.max(0, Math.min(1, (pos - t0) / (t1 - t0))), 2); }
        // règle
        const step = niceStep(t1 - t0);
        ctx.fillStyle = '#555'; ctx.font = `10px ${FONT}`; ctx.textAlign = 'center';
        for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
            const x = (t - t0) / (t1 - t0) * w;
            ctx.fillRect(x, bottom + 2, 1, 5);
            ctx.fillStyle = '#888'; ctx.fillText(step < 1 ? fmt(t, true) : fmt(t), x, h - 4); ctx.fillStyle = '#555';
        }
        // tête de lecture
        if (pos >= t0 && pos <= t1) { const x = (pos - t0) / (t1 - t0) * w; ctx.fillStyle = accent; ctx.fillRect(x - 1, top - 4, 2, bottom - top + 8); }
        panel.querySelector('.t').textContent = fmt(pos, true);
        panel.querySelector('.z').textContent = `${zoom}×`;
        panel.querySelector('.r').textContent = `${fmt(t0)} – ${fmt(t1)}`;
    }
    function tick() { draw(); raf = requestAnimationFrame(tick); }

    function onWheel(e) {
        const el = e.currentTarget === panel ? anchor : e.currentTarget;
        e.preventDefault();
        const i = ZOOMS.indexOf(zoom);
        if (e.deltaY < 0) { if (i < ZOOMS.length - 1) zoom = ZOOMS[i + 1]; }
        else { if (i > 0) zoom = ZOOMS[i - 1]; }
        if (zoom === 1) { close(); return; }
        if (!panel) {
            // centre initial : temps sous le curseur sur l'élément natif
            const r = el.getBoundingClientRect(); center = duration() * Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
            open(el);
        } else draw();
    }
    function onKey(e) {
        if (!panel) return;
        if (e.key === 'Escape') { close(); return; }
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const el = document.activeElement; if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
        e.preventDefault(); e.stopImmediatePropagation();
        const step = e.altKey ? 0.01 : e.shiftKey ? 0.1 : 1;
        seek(position() + (e.key === 'ArrowRight' ? step : -step));
    }

    const bound = new WeakSet();
    function bind() {
        for (const el of [$(SEL.wave), $(SEL.timeline)]) {
            if (!el || bound.has(el)) continue;
            bound.add(el);
            el.addEventListener('wheel', onWheel, { passive: false });
            el.title = (el.title ? el.title + ' · ' : '') + 'Molette : loupe';
        }
    }
    window.addEventListener('mousemove', (e) => { if (dragging && panel) seekAt(e); });
    window.addEventListener('mouseup', () => { dragging = false; });
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', (e) => { if (panel && !panel.contains(e.target) && !anchor?.contains(e.target)) close(); }, true);
    window.addEventListener('resize', () => { if (panel) place(); });
    new MutationObserver(bind).observe(document.body, { childList: true, subtree: true });
    bind();
})();
