/*
 * Enhancer for SoundCloud™ — Audio : vitesse et effets (monde principal)
 *
 * Bouton « jauge » à gauche du volume (mêmes cotes que les icônes SoundCloud).
 * Panneau dans le style du popover de volume :
 *   · Vitesse 0,5× → 2× avec conservation de la hauteur
 *   · Bass boost (filtre low-shelf 90 Hz, 0 → +12 dB)
 *   · Réverbération (convolution, réponse impulsionnelle générée, 0 → 100 %)
 *   · Presets : Slowed + Reverb · Nightcore · Bass boost · Normal
 *
 * Traitement : Web Audio API sur l'<audio> capté par media-hook.js. SoundCloud
 * alimente cet élément par MediaSource (blob: même origine), donc le routage
 * dans un AudioContext ne « teinte » pas la sortie. Le graphe n'est créé qu'à
 * la première activation d'un effet ; à vide il est transparent.
 *
 *   source → lowshelf(bass) → ┬─ dry ─────────┐
 *                             └─ convolver → wet ┴→ sortie
 */
(() => {
    'use strict';
    const NS = 'sce-audio';
    const KEY = 'sce:audio';
    const FONT = 'Söhne, system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif';
    const RATE = { min: 0.5, max: 2, step: 0.05 };
    const PRESETS = {
        normal:   { rate: 1,    preservePitch: true,  bass: 0, reverb: 0 },
        slowed:   { rate: 0.85, preservePitch: false, bass: 3, reverb: 0.45 },
        nightcore:{ rate: 1.2,  preservePitch: false, bass: 0, reverb: 0.1 },
        bass:     { rate: 1,    preservePitch: true,  bass: 9, reverb: 0 },
    };
    const T = {
        fr: { title: 'Audio', speed: 'Vitesse', pitch: 'Conserver la hauteur', bass: 'Bass boost', reverb: 'Réverb', presets: 'Presets', normal: 'Normal', slowed: 'Slowed + Reverb', nightcore: 'Nightcore', bassp: 'Bass boost', tip: 'Vitesse et effets audio', unavailable: 'Effets indisponibles sur ce titre' },
        en: { title: 'Audio', speed: 'Speed', pitch: 'Preserve pitch', bass: 'Bass boost', reverb: 'Reverb', presets: 'Presets', normal: 'Normal', slowed: 'Slowed + Reverb', nightcore: 'Nightcore', bassp: 'Bass boost', tip: 'Speed and audio effects', unavailable: 'Effects unavailable for this track' },
    };
    const L = T[(document.documentElement.lang || 'en').slice(0, 2)] || T.en;

    const store = {
        get() { try { return { ...PRESETS.normal, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return { ...PRESETS.normal }; } },
        set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} },
    };
    let cfg = store.get();
    let media = null, btn = null, panel = null;
    const fmtRate = (r) => `${parseFloat(r.toFixed(2))}×`;
    const effectsOn = (c = cfg) => c.bass > 0.01 || c.reverb > 0.01;
    const anyOn = (c = cfg) => effectsOn(c) || Math.abs(c.rate - 1) > 1e-6;

    // ── Graphe Web Audio (paresseux) ─────────────────────────────
    const graph = { ctx: null, el: null, src: null, bass: null, dry: null, wet: null, conv: null };

    function impulse(ctx, seconds = 2.4, decay = 3) {
        const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
        return buf;
    }

    function ensureGraph(el) {
        if (!el || graph.el === el) return true;
        try {
            const ctx = graph.ctx || (graph.ctx = new AudioContext());
            const src = ctx.createMediaElementSource(el);
            const bass = ctx.createBiquadFilter(); bass.type = 'lowshelf'; bass.frequency.value = 90; bass.gain.value = 0;
            const dry = ctx.createGain(), wet = ctx.createGain(); wet.gain.value = 0;
            const conv = ctx.createConvolver(); conv.buffer = graph.conv?.buffer || impulse(ctx);
            const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4500; // réverb sombre, façon slowed
            src.connect(bass); bass.connect(dry); dry.connect(ctx.destination);
            bass.connect(lp); lp.connect(conv); conv.connect(wet); wet.connect(ctx.destination);
            Object.assign(graph, { el, src, bass, dry, wet, conv });
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});
            return true;
        } catch (e) { console.warn('[SCE] audio graph', e); return false; }
    }

    function apply(el = media) {
        if (!el) return;
        el.playbackRate = cfg.rate; el.defaultPlaybackRate = cfg.rate;
        if ('preservesPitch' in el) el.preservesPitch = cfg.preservePitch;
        if (effectsOn() || graph.el === el) {
            if (ensureGraph(el)) {
                const t = graph.ctx.currentTime;
                graph.bass.gain.setTargetAtTime(cfg.bass, t, 0.05);
                graph.wet.gain.setTargetAtTime(cfg.reverb * 0.9, t, 0.05);
                graph.dry.gain.setTargetAtTime(1 - cfg.reverb * 0.35, t, 0.05);
            } else if (effectsOn()) window.__scsp?.toast?.(L.unavailable, { error: true });
        }
        updateBtn();
    }

    function set(patch) { cfg = { ...cfg, ...patch }; store.set(cfg); apply(); if (panel) syncPanel(); }

    if (typeof window.__sceOnMedia === 'function') window.__sceOnMedia((el) => { media = el; apply(el); });
    window.addEventListener('sce:speed', (e) => { const r = Number(e.detail?.rate); if (Number.isFinite(r)) set({ rate: clamp(r) }); });
    const clamp = (r) => Math.min(RATE.max, Math.max(RATE.min, Math.round(r / RATE.step) * RATE.step));

    // ── UI ────────────────────────────────────────────────────────
    const CSS = `
        .${NS}-btn { width: 24px; height: 48px; padding: 16px 4px; border: 0; background: transparent; color: #fff; cursor: pointer; display: block; }
        .${NS}-btn div { width: 16px; height: 16px; }
        .${NS}-btn svg { width: 16px; height: 16px; display: block; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
        .${NS}-btn.m-active { color: #f50; }
        .${NS}-panel { position: fixed; bottom: 52px; width: 236px; padding: 12px 14px 10px; border-radius: 2px; background: #333; color: #ccc;
                       box-shadow: 0 2px 8px rgba(0,0,0,.4); font: 12px/1.3 ${FONT}; z-index: 99999; }
        .${NS}-panel::after { content: ''; position: absolute; left: 50%; bottom: -5px; width: 10px; height: 10px; background: #333; transform: translateX(-50%) rotate(45deg); }
        .${NS}-panel h4 { margin: 0 0 6px; font-size: 12px; font-weight: 400; color: #999; display: flex; justify-content: space-between; }
        .${NS}-panel h4 b { color: #fff; font-weight: 700; font-variant-numeric: tabular-nums; }
        .${NS}-panel input[type=range] { width: 100%; height: 2px; margin: 4px 0 10px; accent-color: #f50; cursor: pointer; }
        .${NS}-panel label { display: flex; align-items: center; gap: 6px; margin: -4px 0 10px; cursor: pointer; color: #999; font-size: 11px; }
        .${NS}-panel label input { accent-color: #f50; margin: 0; }
        .${NS}-sep { height: 1px; background: #444; margin: 2px 0 10px; }
        .${NS}-presets { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
        .${NS}-presets button { height: 26px; border-radius: 2px; border: 0; background: #444; color: #ccc; cursor: pointer; font: 500 11px ${FONT}; }
        .${NS}-presets button:hover { background: #555; color: #fff; }
        .${NS}-presets button.m-on { background: #f50; color: #fff; }
    `;
    function injectStyles() { if (document.getElementById(`${NS}-styles`)) return; const s = document.createElement('style'); s.id = `${NS}-styles`; s.textContent = CSS; document.head.appendChild(s); }

    function updateBtn() {
        if (!btn) return;
        const bits = [fmtRate(cfg.rate)]; if (cfg.bass > 0.01) bits.push(`bass +${Math.round(cfg.bass)} dB`); if (cfg.reverb > 0.01) bits.push(`réverb ${Math.round(cfg.reverb * 100)} %`);
        btn.title = `${L.tip} : ${bits.join(' · ')}`;
        btn.classList.toggle('m-active', anyOn());
    }

    function buildPanel() {
        const p = document.createElement('div');
        p.className = `${NS}-panel`;
        p.innerHTML = `
            <h4><span>${L.speed}</span><b class="v-rate"></b></h4>
            <input type="range" class="r-rate" min="${RATE.min}" max="${RATE.max}" step="${RATE.step}">
            <label><input type="checkbox" class="c-pitch"> ${L.pitch}</label>
            <div class="${NS}-sep"></div>
            <h4><span>${L.bass}</span><b class="v-bass"></b></h4>
            <input type="range" class="r-bass" min="0" max="12" step="0.5">
            <h4><span>${L.reverb}</span><b class="v-reverb"></b></h4>
            <input type="range" class="r-reverb" min="0" max="1" step="0.05">
            <div class="${NS}-sep"></div>
            <div class="${NS}-presets">
                <button type="button" data-p="normal">${L.normal}</button>
                <button type="button" data-p="bass">${L.bassp}</button>
                <button type="button" data-p="slowed">${L.slowed}</button>
                <button type="button" data-p="nightcore">${L.nightcore}</button>
            </div>`;
        p.querySelector('.r-rate').addEventListener('input', (e) => set({ rate: clamp(parseFloat(e.target.value)) }));
        p.querySelector('.c-pitch').addEventListener('change', (e) => set({ preservePitch: e.target.checked }));
        p.querySelector('.r-bass').addEventListener('input', (e) => set({ bass: parseFloat(e.target.value) }));
        p.querySelector('.r-reverb').addEventListener('input', (e) => set({ reverb: parseFloat(e.target.value) }));
        p.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => set({ ...PRESETS[b.dataset.p] })));
        return p;
    }
    function syncPanel() {
        panel.querySelector('.v-rate').textContent = fmtRate(cfg.rate);
        panel.querySelector('.r-rate').value = cfg.rate;
        panel.querySelector('.c-pitch').checked = cfg.preservePitch;
        panel.querySelector('.v-bass').textContent = cfg.bass > 0.01 ? `+${cfg.bass} dB` : 'off';
        panel.querySelector('.r-bass').value = cfg.bass;
        panel.querySelector('.v-reverb').textContent = cfg.reverb > 0.01 ? `${Math.round(cfg.reverb * 100)} %` : 'off';
        panel.querySelector('.r-reverb').value = cfg.reverb;
        panel.querySelectorAll('[data-p]').forEach((b) => { const P = PRESETS[b.dataset.p]; b.classList.toggle('m-on', Math.abs(P.rate - cfg.rate) < 1e-6 && P.preservePitch === cfg.preservePitch && Math.abs(P.bass - cfg.bass) < .26 && Math.abs(P.reverb - cfg.reverb) < .06); });
    }
    function closePanel() { panel?.remove(); panel = null; }
    function togglePanel() {
        if (panel) { closePanel(); return; }
        panel = buildPanel(); document.body.appendChild(panel);
        const r = btn.getBoundingClientRect();
        panel.style.left = `${Math.max(8, Math.min(window.innerWidth - 252, r.left + r.width / 2 - 118))}px`;
        syncPanel();
        const close = (e) => { if (panel && !panel.contains(e.target) && !btn.contains(e.target)) { closePanel(); document.removeEventListener('mousedown', close, true); } };
        document.addEventListener('mousedown', close, true);
        document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { closePanel(); document.removeEventListener('keydown', esc); } });
    }

    const enabled = () => { try { return JSON.parse(localStorage.getItem('scsp:settings') || '{}').speedControl !== false; } catch { return true; } };
    function mount() {
        if (btn?.isConnected) return;
        if (!enabled()) { btn?.remove(); btn = null; return; }
        const volume = document.querySelector('.playControls__volume'); if (!volume) return;
        injectStyles();
        btn = document.createElement('button'); btn.type = 'button'; btn.className = `${NS}-btn sc-mr-1x`; btn.setAttribute('aria-label', L.tip);
        btn.innerHTML = `<div><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.75 11.25a5.25 5.25 0 1 1 10.5 0"/><path d="M8 11.25l2.6-3.6"/><circle cx="8" cy="11.25" r=".9" fill="currentColor" stroke="none"/></svg></div>`;
        btn.addEventListener('click', togglePanel);
        volume.parentElement.insertBefore(btn, volume);
        updateBtn();
    }

    document.addEventListener('keydown', (e) => {
        const el = document.activeElement;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
        if (!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
        if (e.code === 'Period') { e.preventDefault(); set({ rate: clamp(cfg.rate + 0.25) }); }
        if (e.code === 'Comma')  { e.preventDefault(); set({ rate: clamp(cfg.rate - 0.25) }); }
        if (e.code === 'Digit0') { e.preventDefault(); set({ ...PRESETS.normal }); }
    });
    new MutationObserver(() => { if (!btn?.isConnected) mount(); }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('storage', (e) => { if (e.key === 'scsp:settings') { if (!enabled()) { btn?.remove(); btn = null; } else mount(); } });
    mount();
})();
