/*
 * Enhancer for SoundCloud™ — Audio : vitesse, effets, analyse (monde principal)
 *
 * Bouton « jauge » à gauche du volume (mêmes cotes que les icônes SoundCloud).
 * Panneau dans le style du popover de volume :
 *   · Vitesse 0,1× → 3× : curseur logarithmique (même sensation sur toute la
 *     plage), aimant sur 1×, double-clic = 1×, molette = ±1 %
 *   · Conservation de la hauteur
 *   · Bass boost (low-shelf 90 Hz, 0 → +12 dB) · Réverb (convolution, 0 → 100 %)
 *   · Presets : Normal · Bass boost · Slowed + Reverb · Nightcore
 *   · Analyse en direct : BPM et tonalité (+ code Camelot), affinés sur ~30 s,
 *     mémorisés par titre. Corrigés de la vitesse et du décalage de hauteur.
 *
 * Traitement : SoundCloud branche déjà son <audio> sur un AudioContext.
 * media-hook.js intercepte ce branchement et y insère une chaîne transparente
 * (window.__sceAudioTap) ; nos effets et l'analyseur s'y logent, dans le
 * contexte de SoundCloud. Repli sur notre propre contexte si l'élément n'est
 * pas branché.
 *
 *   source ─┬→ lowshelf(bass) ─┬─ dry ──────────────┐
 *           │                  └─ lowpass → convolver → wet ┴→ sortie
 *           └→ analyser (BPM / tonalité, aucune sortie)
 */
(() => {
    'use strict';
    const NS = 'sce-audio';
    const KEY = 'sce:audio';
    const FONT = 'Söhne, system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif';
    const RATE = { min: 0.1, max: 3 };
    const PRESETS = {
        normal:    { rate: 1,    preservePitch: true,  bass: 0, reverb: 0 },
        bass:      { rate: 1,    preservePitch: true,  bass: 9, reverb: 0 },
        slowed:    { rate: 0.85, preservePitch: false, bass: 3, reverb: 0.45 },
        nightcore: { rate: 1.2,  preservePitch: false, bass: 0, reverb: 0.1 },
    };
    const T = {
        fr: { speed: 'Vitesse', pitch: 'Conserver la hauteur', bass: 'Bass boost', reverb: 'Réverb', normal: 'Normal', slowed: 'Slowed + Reverb', nightcore: 'Nightcore', bassp: 'Bass boost',
              tip: 'Vitesse, effets et analyse audio', unavailable: 'Effets indisponibles sur ce titre', analysis: 'Analyse', listening: 'écoute…', key: 'tonalité', at: 'à' },
        en: { speed: 'Speed', pitch: 'Preserve pitch', bass: 'Bass boost', reverb: 'Reverb', normal: 'Normal', slowed: 'Slowed + Reverb', nightcore: 'Nightcore', bassp: 'Bass boost',
              tip: 'Speed, effects and audio analysis', unavailable: 'Effects unavailable for this track', analysis: 'Analysis', listening: 'listening…', key: 'key', at: 'at' },
    };
    const L = T[(document.documentElement.lang || 'en').slice(0, 2)] || T.en;

    const store = {
        get() { try { return { ...PRESETS.normal, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return { ...PRESETS.normal }; } },
        set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} },
    };
    let cfg = store.get();
    let media = null, btn = null, panel = null;
    const fmtRate = (r) => `${r < 1 ? r.toFixed(2).replace(/0$/, '') : parseFloat(r.toFixed(2))}×`;
    const effectsOn = (c = cfg) => c.bass > 0.01 || c.reverb > 0.01;
    const anyOn = (c = cfg) => effectsOn(c) || Math.abs(c.rate - 1) > 1e-6;
    const clampRate = (r) => Math.min(RATE.max, Math.max(RATE.min, Math.round(r * 100) / 100));

    // Curseur logarithmique : position 0..1 ↔ vitesse min..max, 1× au même endroit quel que soit l'écran
    const LOG_MIN = Math.log(RATE.min), LOG_MAX = Math.log(RATE.max);
    const posToRate = (p) => Math.exp(LOG_MIN + (LOG_MAX - LOG_MIN) * p);
    const rateToPos = (r) => (Math.log(r) - LOG_MIN) / (LOG_MAX - LOG_MIN);
    const snap = (r) => (Math.abs(r - 1) < 0.035 ? 1 : Math.abs(r - 0.5) < 0.02 ? 0.5 : Math.abs(r - 2) < 0.05 ? 2 : r);

    // ── Graphe Web Audio ─────────────────────────────────────────
    // Priorité : la chaîne transparente que media-hook.js a insérée dans le
    // graphe de SoundCloud (window.__sceAudioTap). Repli : notre propre contexte
    // si SoundCloud ne branche pas l'élément.
    const graph = { ctx: null, el: null, bass: null, dry: null, wet: null, conv: null, an: null, mode: null };

    function impulse(ctx, seconds = 2.4, decay = 3) {
        const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
        return buf;
    }
    /** Construit bass → (dry | lowpass → convolver → wet) entre `input` et `output`, plus l'analyseur sur `input`. */
    function buildChain(ctx, input, output) {
        const bass = ctx.createBiquadFilter(); bass.type = 'lowshelf'; bass.frequency.value = 90; bass.gain.value = 0;
        const dry = ctx.createGain(), wet = ctx.createGain(); wet.gain.value = 0;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4500;
        const conv = ctx.createConvolver(); conv.buffer = (graph.conv && graph.ctx === ctx) ? graph.conv.buffer : impulse(ctx);
        const an = ctx.createAnalyser(); an.fftSize = 4096; an.smoothingTimeConstant = 0;
        // Étage DJ : égaliseur bas (kill) + gain master de la platine A, avant la sortie
        const eqLow = ctx.createBiquadFilter(); eqLow.type = 'lowshelf'; eqLow.frequency.value = 200; eqLow.gain.value = 0;
        const master = ctx.createGain();
        input.connect(bass); bass.connect(dry); dry.connect(eqLow);
        bass.connect(lp); lp.connect(conv); conv.connect(wet); wet.connect(eqLow);
        eqLow.connect(master); master.connect(output);
        input.connect(an);
        return { bass, dry, wet, conv, an, eqLow, master };
    }
    function ensureGraph(el) {
        if (!el) return false;
        const tap = window.__sceAudioTap;
        if (tap && tap.el === el) {
            if (graph.el === el && graph.mode === 'tap') return true;
            try {
                tap.input.disconnect(tap.output);                     // on remplace le passe-plat par la chaîne d'effets
                Object.assign(graph, { ctx: tap.ctx, el, mode: 'tap', ...buildChain(tap.ctx, tap.input, tap.output) });
                Analysis.attach();
                return true;
            } catch (e) { console.warn('[SCE] insertion dans le graphe SoundCloud', e); return false; }
        }
        if (graph.el === el && graph.mode === 'own') return true;
        try {                                                          // repli : élément non branché par SoundCloud
            const ctx = graph.ctx && graph.mode === 'own' ? graph.ctx : new AudioContext();
            const src = ctx.createMediaElementSource(el);
            const input = ctx.createGain(); src.connect(input);
            Object.assign(graph, { ctx, el, mode: 'own', ...buildChain(ctx, input, ctx.destination) });
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});
            Analysis.attach();
            return true;
        } catch (e) { console.warn('[SCE] audio graph', e); return false; }
    }

    function apply(el = media) {
        if (!el) return;
        try { el.playbackRate = cfg.rate; el.defaultPlaybackRate = cfg.rate; } catch {}
        if ('preservesPitch' in el) el.preservesPitch = cfg.preservePitch;
        if (ensureGraph(el)) {
            if (graph.ctx.state === 'suspended') graph.ctx.resume().catch(() => {});
            const t = graph.ctx.currentTime;
            graph.bass.gain.setTargetAtTime(cfg.bass, t, 0.05);
            graph.wet.gain.setTargetAtTime(cfg.reverb * 0.9, t, 0.05);
            graph.dry.gain.setTargetAtTime(1 - cfg.reverb * 0.35, t, 0.05);
        } else if (effectsOn()) window.__scsp?.toast?.(L.unavailable, { error: true });
        updateBtn();
    }
    function set(patch) { cfg = { ...cfg, ...patch }; store.set(cfg); apply(); if (panel) syncPanel(); window.dispatchEvent(new Event('sce:audio-change')); }
    function setSettings(patch) {
        if (!patch || typeof patch !== 'object') return false;
        const next = {};
        if (Number.isFinite(patch.rate)) next.rate = clampRate(patch.rate);
        if (typeof patch.preservePitch === 'boolean') next.preservePitch = patch.preservePitch;
        if (Number.isFinite(patch.bass)) next.bass = Math.min(12, Math.max(0, patch.bass));
        if (Number.isFinite(patch.reverb)) next.reverb = Math.min(1, Math.max(0, patch.reverb));
        if (!Object.keys(next).length) return false;
        set(next);
        return true;
    }
    function applyPreset(name) {
        if (!Object.hasOwn(PRESETS, name)) return false;
        set(PRESETS[name]);
        return true;
    }

    // ── Analyse : BPM (flux spectral + autocorrélation) et tonalité (chroma + profils de Krumhansl) ──
    const Analysis = (() => {
        const FRAME_MS = 20, HISTORY_S = 40, BPM_MIN = 60, BPM_MAX = 200;
        const NOTES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
        const CAMELOT = { major: { C: '8B', 'C♯': '3B', D: '10B', 'E♭': '5B', E: '12B', F: '7B', 'F♯': '2B', G: '9B', 'A♭': '4B', A: '11B', 'B♭': '6B', B: '1B' },
                          minor: { C: '5A', 'C♯': '12A', D: '7A', 'E♭': '2A', E: '9A', F: '4A', 'F♯': '11A', G: '6A', 'A♭': '1A', A: '8A', 'B♭': '3A', B: '10A' } };
        const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
        const MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
        let timer = null, prevMag = null, spareMag = null, flux = [], chroma = new Float64Array(12), frames = 0, trackKey = null, result = null, binNote = null;

        const currentTrack = () => document.querySelector('.playbackSoundBadge__titleLink')?.getAttribute('href') || null;
        const cacheGet = (k) => { try { return JSON.parse(localStorage.getItem(`sce:analysis:${k}`)); } catch { return null; } };
        const cacheSet = (k, v) => { try { localStorage.setItem(`sce:analysis:${k}`, JSON.stringify(v)); } catch {} };

        function reset() { prevMag = null; flux = []; chroma = new Float64Array(12); frames = 0; result = null; }
        function prepareBins() {
            const an = graph.an, sr = graph.ctx.sampleRate, n = an.frequencyBinCount;
            binNote = new Int8Array(n).fill(-1);
            for (let i = 1; i < n; i++) { const f = i * sr / (2 * n); if (f < 55 || f > 4200) continue; binNote[i] = Math.round(12 * Math.log2(f / 440)) % 12; if (binNote[i] < 0) binNote[i] += 12; }
        }
        function tick() {
            const el = graph.el; if (!el || el.paused) return;
            const tk = currentTrack();
            if (tk !== trackKey) { trackKey = tk; reset(); const c = tk && cacheGet(tk); if (c) { result = { ...c, cached: true }; render(); } }
            if (result?.cached) return;
            const an = graph.an, n = an.frequencyBinCount;
            const mag = spareMag && spareMag.length === n ? spareMag : new Float32Array(n); // deux tampons en alternance : aucune allocation à 50 Hz
            an.getFloatFrequencyData(mag);
            if (!binNote || binNote.length !== n) prepareBins();
            // flux spectral (onsets) + chroma pondéré
            let fl = 0;
            for (let i = 1; i < n; i++) {
                const m = Math.pow(10, mag[i] / 20); // dB → amplitude
                if (prevMag) { const d = m - prevMag[i]; if (d > 0) fl += d; }
                if (binNote[i] >= 0) chroma[binNote[i]] += m * m;
                mag[i] = m;
            }
            spareMag = prevMag; prevMag = mag;
            flux.push(fl); if (flux.length > HISTORY_S * 1000 / FRAME_MS) flux.shift();
            frames++;
            if (frames % 100 === 0 && flux.length > 600) { result = estimate(); render(); if (frames >= 1500 && result.conf > 0.35 && tk) cacheSet(tk, { bpm: result.bpm, key: result.key, mode: result.mode, conf: result.conf }); }
        }
        function estimate() {
            // Autocorrélation du flux (moyenne retirée) sur les périodes 60–200 BPM, interpolation parabolique
            const N = flux.length, mean = flux.reduce((a, b) => a + b, 0) / N, x = flux.map((v) => v - mean);
            const fps = 1000 / FRAME_MS, lagMin = Math.floor(fps * 60 / BPM_MAX), lagMax = Math.ceil(fps * 60 / BPM_MIN);
            const ac = new Float64Array(lagMax + 2);
            for (let lag = lagMin; lag <= lagMax + 1; lag++) { let s = 0; for (let i = lag; i < N; i++) s += x[i] * x[i - lag]; ac[lag] = s / (N - lag); }
            let best = lagMin, bv = -Infinity;
            for (let lag = lagMin; lag <= lagMax; lag++) { const w = ac[lag] * (1 - 0.15 * Math.abs(Math.log2((fps * 60 / lag) / 128))); if (w > bv) { bv = w; best = lag; } } // léger a priori vers 128 BPM
            const y0 = ac[best - 1] || 0, y1 = ac[best], y2 = ac[best + 1] || 0, den = (y0 - 2 * y1 + y2);
            const lag = best + (den ? 0.5 * (y0 - y2) / den : 0);
            let bpm = fps * 60 / lag;
            const ac0 = x.reduce((a, v) => a + v * v, 0) / N;
            const conf = Math.max(0, Math.min(1, ac0 ? y1 / ac0 : 0));
            // Tonalité : corrélation du chroma avec les 24 profils
            const c = Array.from(chroma), cm = c.reduce((a, b) => a + b, 0) / 12;
            let bestKey = 0, bestMode = 'major', bestR = -Infinity, second = -Infinity;
            for (const [mode, prof] of [['major', MAJ], ['minor', MIN]]) {
                const pm = prof.reduce((a, b) => a + b, 0) / 12;
                for (let k = 0; k < 12; k++) {
                    let num = 0, d1 = 0, d2 = 0;
                    for (let i = 0; i < 12; i++) { const a = c[(i + k) % 12] - cm, b = prof[i] - pm; num += a * b; d1 += a * a; d2 += b * b; }
                    const r = num / Math.sqrt(d1 * d2 || 1);
                    if (r > bestR) { second = bestR; bestR = r; bestKey = k; bestMode = mode; } else if (r > second) second = r;
                }
            }
            // Corrections : la vitesse change le tempo mesuré ; sans conservation de hauteur, elle décale la tonalité
            bpm = bpm / cfg.rate;
            let semis = cfg.preservePitch ? 0 : Math.round(12 * Math.log2(cfg.rate));
            const keyIdx = ((bestKey - semis) % 12 + 12) % 12;
            return { bpm: Math.round(bpm), key: NOTES[keyIdx], mode: bestMode, conf, keyConf: Math.max(0, bestR - second) };
        }
        function label(r = result) {
            if (!r) return L.listening;
            const cam = CAMELOT[r.mode][r.key];
            return `${r.bpm} BPM · ${r.key}${r.mode === 'minor' ? 'm' : ''} · ${cam}`;
        }
        function render() { if (panel) syncPanel(); updateBtn(); }
        return {
            attach() { clearInterval(timer); timer = setInterval(tick, FRAME_MS); },
            label, camelot: (r) => CAMELOT[r.mode][r.key], get result() { return result; },
        };
    })();

    /** Exposé au mode DJ : contexte, gain master et égaliseur bas de la platine A, analyse courante. */
    window.__sceAudio = Object.freeze({
        get ctx() { return graph.ctx; }, get master() { return graph.master; }, get eqLow() { return graph.eqLow; },
        get analysis() { return Analysis.result; }, ensure: () => ensureGraph(media), get media() { return media; },
        get rate() { return cfg.rate; }, setRate: (r) => set({ rate: clampRate(r) }), closePanel,
        get settings() { return { rate: cfg.rate, preservePitch: cfg.preservePitch, bass: cfg.bass, reverb: cfg.reverb }; },
        setSettings, applyPreset,
    });
    if (typeof window.__sceOnMedia === 'function') window.__sceOnMedia((el) => { media = el; apply(el); });
    if (typeof window.__sceOnAudioTap === 'function') window.__sceOnAudioTap((tap) => { if (media === tap.el || !media) { media = tap.el; apply(tap.el); } });
    window.addEventListener('sce:speed', (e) => { const r = Number(e.detail?.rate); if (Number.isFinite(r)) set({ rate: clampRate(r) }); });

    // ── UI ────────────────────────────────────────────────────────
    const CSS = `
        .${NS}-btn { width: 24px; height: 48px; padding: 16px 4px; border: 0; background: transparent; color: #fff; cursor: pointer; display: block; }
        .${NS}-btn div { width: 16px; height: 16px; }
        .${NS}-btn svg { width: 16px; height: 16px; display: block; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
        .${NS}-btn.m-active { color: var(--sce-accent, #f50); }
        .${NS}-btn.m-open { color: #fff; opacity: 1; }
        .${NS}-panel { position: fixed; bottom: 52px; width: 256px; padding: 12px 14px 10px; border-radius: 2px; background: #333; color: #ccc;
                       box-shadow: 0 2px 8px rgba(0,0,0,.4); font: 12px/1.3 ${FONT}; z-index: 99999; user-select: none; }
        .${NS}-panel::after { content: ''; position: absolute; left: 50%; bottom: -5px; width: 10px; height: 10px; background: #333; transform: translateX(-50%) rotate(45deg); }
        .${NS}-panel h4 { margin: 0 0 6px; font-size: 12px; font-weight: 400; color: #999; display: flex; justify-content: space-between; }
        .${NS}-head { display: flex; align-items: center; justify-content: space-between; margin: -4px -6px 8px 0; }
        .${NS}-head span { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: #999; }
        .${NS}-close { width: 22px; height: 22px; border: 0; border-radius: 50%; background: transparent; color: #999; cursor: pointer; font: 16px/22px ${FONT}; padding: 0; }
        .${NS}-close:hover { color: #fff; background: #444; }
        .${NS}-panel h4 b { color: #fff; font-weight: 700; font-variant-numeric: tabular-nums; }
        /* Curseur SoundCloud : piste 2 px, remplissage orange jusqu'au curseur, poignée 12 px */
        .${NS}-panel input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 14px; margin: 2px 0 2px; background: transparent; cursor: pointer; }
        .${NS}-panel input[type=range]::-webkit-slider-runnable-track { height: 2px; border-radius: 1px; background: linear-gradient(90deg, var(--sce-accent, #f50) var(--p, 0%), #555 var(--p, 0%)); }
        .${NS}-panel input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; margin-top: -5px; border-radius: 50%; background: #fff; border: 0; box-shadow: 0 1px 3px rgba(0,0,0,.5); transition: transform .1s; }
        .${NS}-panel input[type=range]:hover::-webkit-slider-thumb, .${NS}-panel input[type=range]:active::-webkit-slider-thumb { transform: scale(1.25); }
        .${NS}-panel input[type=range]::-moz-range-track { height: 2px; background: #555; }
        .${NS}-panel input[type=range]::-moz-range-progress { height: 2px; background: var(--sce-accent, #f50); }
        .${NS}-panel input[type=range]::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 0; }
        .${NS}-ticks { position: relative; height: 12px; margin: -2px 6px 6px; color: #777; font-size: 9px; font-variant-numeric: tabular-nums; }
        .${NS}-ticks span { position: absolute; transform: translateX(-50%); }
        .${NS}-ticks span::before { content: ''; position: absolute; left: 50%; top: -6px; width: 1px; height: 4px; background: #666; }
        .${NS}-panel label { display: flex; align-items: center; gap: 6px; margin: 0 0 10px; cursor: pointer; color: #999; font-size: 11px; }
        .${NS}-panel label input { accent-color: var(--sce-accent, #f50); margin: 0; }
        .${NS}-sep { height: 1px; background: #444; margin: 2px 0 10px; }
        .${NS}-presets { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 10px; }
        .${NS}-presets button { height: 26px; border-radius: 2px; border: 0; background: #444; color: #ccc; cursor: pointer; font: 500 11px ${FONT}; }
        .${NS}-presets button:hover { background: #555; color: #fff; }
        .${NS}-presets button.m-on { background: var(--sce-accent, #f50); color: #fff; }
        /* Analyse : titre et trois tuiles BPM / tonalité / Camelot */
        .${NS}-analysis { padding-top: 8px; border-top: 1px solid #444; }
        .${NS}-analysis h4 { margin-bottom: 8px; }
        .${NS}-tiles { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
        .${NS}-tile { background: #2a2a2a; border-radius: 3px; padding: 7px 6px 6px; text-align: center; }
        .${NS}-tile b { display: block; color: #fff; font-size: 15px; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
        .${NS}-tile small { display: block; margin-top: 3px; color: #888; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
        .${NS}-tiles.m-live b { color: var(--sce-accent, #f50); }
    `;
    function injectStyles() { if (document.getElementById(`${NS}-styles`)) return; const s = document.createElement('style'); s.id = `${NS}-styles`; s.textContent = CSS; document.head.appendChild(s); }

    function updateBtn() {
        if (!btn) return;
        const bits = [fmtRate(cfg.rate)];
        if (cfg.bass > 0.01) bits.push(`bass +${Math.round(cfg.bass)} dB`);
        if (cfg.reverb > 0.01) bits.push(`réverb ${Math.round(cfg.reverb * 100)} %`);
        if (Analysis.result) bits.push(Analysis.label());
        btn.title = `${L.tip} : ${bits.join(' · ')}`;
        btn.classList.toggle('m-active', anyOn());
    }
    const paint = (input, pct) => input.style.setProperty('--p', `${pct * 100}%`);

    function buildPanel() {
        const p = document.createElement('div');
        p.className = `${NS}-panel`;
        const ticks = [0.1, 0.25, 0.5, 1, 1.5, 2, 3].map((r) => `<span style="left:${rateToPos(r) * 100}%">${r}×</span>`).join('');
        p.innerHTML = `
            <div class="${NS}-head"><span>Audio</span><button type="button" class="${NS}-close" title="Fermer (Échap)">×</button></div>
            <h4><span>${L.speed}</span><b class="v-rate"></b></h4>
            <input type="range" class="r-rate" min="0" max="1" step="0.001" title="${L.speed} — double-clic : 1×, molette : ±1 %">
            <div class="${NS}-ticks">${ticks}</div>
            <label><input type="checkbox" class="c-pitch"> ${L.pitch}</label>
            <div class="${NS}-sep"></div>
            <h4><span>${L.bass}</span><b class="v-bass"></b></h4>
            <input type="range" class="r-bass" min="0" max="12" step="0.5">
            <h4 style="margin-top:6px"><span>${L.reverb}</span><b class="v-reverb"></b></h4>
            <input type="range" class="r-reverb" min="0" max="1" step="0.02">
            <div class="${NS}-sep" style="margin-top:8px"></div>
            <div class="${NS}-presets">
                <button type="button" data-p="normal">${L.normal}</button>
                <button type="button" data-p="bass">${L.bassp}</button>
                <button type="button" data-p="slowed">${L.slowed}</button>
                <button type="button" data-p="nightcore">${L.nightcore}</button>
            </div>
            <div class="${NS}-analysis">
                <h4><span>${L.analysis}</span></h4>
                <div class="${NS}-tiles"><div class="${NS}-tile"><b class="v-bpm">–</b><small>BPM</small></div><div class="${NS}-tile"><b class="v-key">–</b><small>${L.key}</small></div><div class="${NS}-tile"><b class="v-cam">–</b><small>Camelot</small></div></div>
            </div>`;
        const rate = p.querySelector('.r-rate');
        rate.addEventListener('input', () => { const r = snap(clampRate(posToRate(parseFloat(rate.value)))); set({ rate: r }); rate.value = rateToPos(r); paint(rate, rateToPos(r)); });
        rate.addEventListener('dblclick', () => set({ rate: 1 }));
        rate.addEventListener('wheel', (e) => { e.preventDefault(); set({ rate: clampRate(cfg.rate * (e.deltaY < 0 ? 1.01 : 1 / 1.01)) }); }, { passive: false });
        p.querySelector('.c-pitch').addEventListener('change', (e) => set({ preservePitch: e.target.checked }));
        p.querySelector('.r-bass').addEventListener('input', (e) => set({ bass: parseFloat(e.target.value) }));
        p.querySelector('.r-reverb').addEventListener('input', (e) => set({ reverb: parseFloat(e.target.value) }));
        // Re-cliquer le preset actif revient à Normal
        p.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => set({ ...(b.classList.contains('m-on') && b.dataset.p !== 'normal' ? PRESETS.normal : PRESETS[b.dataset.p]) })));
        p.querySelector(`.${NS}-close`).addEventListener('click', closePanel);
        return p;
    }
    function syncPanel() {
        const q = (s) => panel.querySelector(s);
        q('.v-rate').textContent = fmtRate(cfg.rate);
        q('.r-rate').value = rateToPos(cfg.rate); paint(q('.r-rate'), rateToPos(cfg.rate));
        q('.c-pitch').checked = cfg.preservePitch;
        q('.v-bass').textContent = cfg.bass > 0.01 ? `+${cfg.bass} dB` : 'off'; q('.r-bass').value = cfg.bass; paint(q('.r-bass'), cfg.bass / 12);
        q('.v-reverb').textContent = cfg.reverb > 0.01 ? `${Math.round(cfg.reverb * 100)} %` : 'off'; q('.r-reverb').value = cfg.reverb; paint(q('.r-reverb'), cfg.reverb);
        panel.querySelectorAll('[data-p]').forEach((b) => { const P = PRESETS[b.dataset.p]; b.classList.toggle('m-on', Math.abs(P.rate - cfg.rate) < 1e-6 && P.preservePitch === cfg.preservePitch && Math.abs(P.bass - cfg.bass) < .26 && Math.abs(P.reverb - cfg.reverb) < .06); });
        const r = Analysis.result, tiles = q(`.${NS}-tiles`);
        q('.v-bpm').textContent = r ? r.bpm : '–';
        q('.v-key').textContent = r ? `${r.key}${r.mode === 'minor' ? 'm' : ''}` : '–';
        q('.v-cam').textContent = r ? Analysis.camelot(r) : '–';
        tiles.className = `${NS}-tiles ${r && !r.cached ? 'm-live' : ''}`;
        tiles.title = r ? `confiance BPM ${Math.round(r.conf * 100)} %${r.cached ? ' · mémorisé' : ' · en cours'}` : '';
    }
    function closePanel() { panel?.remove(); panel = null; btn?.classList.remove('m-open'); }
    function togglePanel() {
        if (panel) { closePanel(); return; }
        window.__sceDj?.close();
        panel = buildPanel(); document.body.appendChild(panel); btn.classList.add('m-open');
        const r = btn.getBoundingClientRect();
        panel.style.left = `${Math.max(8, Math.min(window.innerWidth - 272, r.left + r.width / 2 - 128))}px`;
        syncPanel();
        // Le panneau reste ouvert pendant la navigation dans le titre.
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel) closePanel(); });

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
        if (e.code === 'Period') { e.preventDefault(); set({ rate: clampRate(cfg.rate * 1.1) }); }
        if (e.code === 'Comma')  { e.preventDefault(); set({ rate: clampRate(cfg.rate / 1.1) }); }
        if (e.code === 'Digit0') { e.preventDefault(); set({ ...PRESETS.normal }); }
    });
    new MutationObserver(() => { if (!btn?.isConnected) mount(); }).observe(document.body, { childList: true, subtree: true });
    // Réglage modifié : 'sce:settings-change' vient du pont (même onglet), 'storage' d'un autre onglet
    const onSettings = () => { if (!enabled()) { btn?.remove(); btn = null; closePanel(); } else mount(); };
    window.addEventListener('sce:settings-change', onSettings);
    window.addEventListener('storage', (e) => { if (e.key === 'scsp:settings') onSettings(); });
    mount();
})();
