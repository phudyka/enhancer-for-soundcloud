/*
 * Enhancer for SoundCloud™ — Audio : vitesse, effets, analyse (monde principal)
 *
 * Le bouton haut-parleur de SoundCloud ouvre notre panneau ; son curseur au
 * survol règle directement le volume de notre chaîne audio :
 *   · Volume linéaire 0 → 100 % (gain de notre chaîne, le volume natif est
 *     fixé à 100 % au chargement par media-hook.js), sourdine, molette sur le bouton
 *   · Vitesse 0,1× → 3× : curseur logarithmique (même sensation sur toute la
 *     plage), aimant étroit sur 1×, boutons ±0,01, flèches, saisie directe,
 *     double-clic = 1×, molette = ±1 %
 *   · Conservation de la hauteur
 *   · Bass boost (low-shelf 90 Hz, 0 → +12 dB) · Réverb (convolution, 0 → 100 %)
 *   · Presets : Normal · Bass boost · Slowed + Reverb · Nightcore
 *   · Analyse en direct : BPM et tonalité (+ code Camelot), affinés sur ~30 s,
 *     mémorisés par titre. Corrigés de la vitesse, dans la tonalité originale.
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
    try { if (JSON.parse(localStorage.getItem('scsp:settings') || '{}').extensionDisabled === true) return; } catch {}
    const NS = 'sce-audio';
    const KEY = 'sce:audio';
    const PRESET_KEY = 'sce:audio:presets';
    const PRESET_FIELDS = ['rate', 'volume', 'muted', 'preservePitch', 'pitchSemitones', 'bass', 'reverb'];
    const FONT = 'Söhne, system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif';
    const RATE = { min: 0.1, max: 3 };
    const PRESETS = {
        normal:    { rate: 1,    preservePitch: true,  pitchSemitones: 0, bass: 0, reverb: 0 },
        bass:      { rate: 1,    preservePitch: true,  pitchSemitones: 0, bass: 9, reverb: 0 },
        slowed:    { rate: 0.85, preservePitch: false, pitchSemitones: 0, bass: 3, reverb: 0.45 },
        nightcore: { rate: 1.2,  preservePitch: false, pitchSemitones: 0, bass: 0, reverb: 0.1 },
    };
    const T = {
        fr: { speed: 'Vitesse', pitch: 'Conserver la hauteur', bass: 'Bass boost', reverb: 'Réverb', normal: 'Normal', slowed: 'Slowed + Reverb', nightcore: 'Nightcore', bassp: 'Bass boost',
              tip: 'Volume, vitesse, effets et analyse audio', unavailable: 'Effets indisponibles sur ce titre', analysis: 'Analyse', listening: 'écoute…', key: 'tonalité', at: 'à',
              volume: 'Volume', boost: 'Autoriser le volume jusqu’à 200 %', mute: 'Sourdine', muted: 'sourdine', typeRate: 'Cliquer pour saisir une valeur', keepNext: 'Conserver vitesse et effets au prochain titre', custom: 'Mes presets', presetName: 'Nom du preset', save: 'Enregistrer', remove: 'Supprimer', choose: 'Réglages à inclure', pitchPreset: 'Hauteur', pitchShift: 'Transposition', apply: 'Appliquer' },
        en: { speed: 'Speed', pitch: 'Preserve pitch', bass: 'Bass boost', reverb: 'Reverb', normal: 'Normal', slowed: 'Slowed + Reverb', nightcore: 'Nightcore', bassp: 'Bass boost',
              tip: 'Volume, speed, effects and audio analysis', unavailable: 'Effects unavailable for this track', analysis: 'Analysis', listening: 'listening…', key: 'key', at: 'at',
              volume: 'Volume', boost: 'Allow volume up to 200%', mute: 'Mute', muted: 'muted', typeRate: 'Click to type a value', keepNext: 'Keep speed and effects on the next track', custom: 'My presets', presetName: 'Preset name', save: 'Save', remove: 'Delete', choose: 'Settings to include', pitchPreset: 'Pitch', pitchShift: 'Transpose', apply: 'Apply' },
    };
    const L = T[(document.documentElement.lang || 'en').slice(0, 2)] || T.en;

    const store = {
        get() { try { return { ...PRESETS.normal, volume: 1, muted: false, keepNext: true, allowVolumeBoost: false, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return { ...PRESETS.normal, volume: 1, muted: false, keepNext: true, allowVolumeBoost: false }; } },
        set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} },
    };
    let cfg = store.get();
    let media = null, btn = null, panel = null, analysisBar = null;
    const fmtRate = (r) => `${r < 1 ? r.toFixed(2).replace(/0$/, '') : parseFloat(r.toFixed(2))}×`;
    const effectsOn = (c = cfg) => c.bass > 0.01 || c.reverb > 0.01;
    const anyOn = (c = cfg) => effectsOn(c) || Math.abs(c.rate - 1) > 1e-6 || !!c.pitchSemitones;
    const clampRate = (r) => Math.min(RATE.max, Math.max(RATE.min, Math.round(r * 100) / 100));

    // Curseur logarithmique : position 0..1 ↔ vitesse min..max, 1× au même endroit quel que soit l'écran
    const LOG_MIN = Math.log(RATE.min), LOG_MAX = Math.log(RATE.max);
    const posToRate = (p) => Math.exp(LOG_MIN + (LOG_MAX - LOG_MIN) * p);
    const rateToPos = (r) => (Math.log(r) - LOG_MIN) / (LOG_MAX - LOG_MIN);
    const snap = (r) => (Math.abs(r - 1) < 0.02 ? 1 : Math.abs(r - 0.5) < 0.01 ? 0.5 : Math.abs(r - 2) < 0.02 ? 2 : r);
    const clampVolume = (v, boost = cfg.allowVolumeBoost) => Math.min(boost ? 2 : 1, Math.max(0, Math.round(v * 100) / 100));
    function customPresets() {
        try {
            const saved = JSON.parse(localStorage.getItem(PRESET_KEY) || '[]');
            return Array.isArray(saved) ? saved.filter((p) => p && typeof p.name === 'string' && p.values && typeof p.values === 'object').slice(0, 30) : [];
        } catch { return []; }
    }
    function savePreset(name, fields = PRESET_FIELDS) {
        name = String(name || '').trim().slice(0, 40);
        if (!name || !Array.isArray(fields) || Object.hasOwn(PRESETS, name.toLowerCase())) return false;
        const values = {};
        for (const field of PRESET_FIELDS) if (fields.includes(field)) values[field] = cfg[field];
        if (!Object.keys(values).length) return false;
        const presets = customPresets();
        const index = presets.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
        if (index < 0 && presets.length >= 30) return false;
        const preset = { name, values };
        if (index < 0) presets.push(preset); else presets[index] = preset;
        try { localStorage.setItem(PRESET_KEY, JSON.stringify(presets)); } catch { return false; }
        if (panel) renderCustomPresets();
        return true;
    }
    function removePreset(name) {
        const presets = customPresets();
        const filtered = presets.filter((p) => p.name !== name);
        if (filtered.length === presets.length) return false;
        try { localStorage.setItem(PRESET_KEY, JSON.stringify(filtered)); } catch { return false; }
        if (panel) renderCustomPresets();
        return true;
    }

    // ── Graphe Web Audio ─────────────────────────────────────────
    // Priorité : la chaîne transparente que media-hook.js a insérée dans le
    // graphe de SoundCloud (window.__sceAudioTap). Repli : notre propre contexte
    // si SoundCloud ne branche pas l'élément.
    const graph = { ctx: null, el: null, bass: null, dry: null, wet: null, conv: null, an: null, mode: null, pitch: null, pitchDry: null, pitchWet: null };

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
        const an = ctx.createAnalyser(); an.fftSize = 8192; an.smoothingTimeConstant = 0;
        const eqLow = ctx.createBiquadFilter(); eqLow.type = 'lowshelf'; eqLow.frequency.value = 200; eqLow.gain.value = 0;
        const xfade = ctx.createGain();
        const master = ctx.createGain();                       // volume linéaire de l'utilisateur
        input.connect(bass); bass.connect(dry); dry.connect(eqLow);
        bass.connect(lp); lp.connect(conv); conv.connect(wet); wet.connect(eqLow);
        const pitch = window.__scePitchShifter?.live(ctx);
        const pitchDry = ctx.createGain(), pitchWet = ctx.createGain();
        pitchWet.gain.value = 0;
        eqLow.connect(pitchDry); pitchDry.connect(xfade); pitchWet.connect(xfade);
        xfade.connect(master); master.connect(output);
        input.connect(an);
        return { bass, dry, wet, conv, an, eqLow, master, xfade, pitch, pitchDry, pitchWet, pitchOn: false };
    }
    /** Le décalage de hauteur tourne sur le fil principal (ScriptProcessor) : il n'est branché que lorsqu'il sert. */
    let pitchTimer = null;
    function routePitch(on) {
        const { pitch, eqLow, pitchWet } = graph;
        if (!pitch || graph.pitchOn === on) return;
        graph.pitchOn = on;
        clearTimeout(pitchTimer);
        if (on) { eqLow.connect(pitch.node); pitch.node.connect(pitchWet); graph.pitchReadyAt = graph.ctx.currentTime + 0.2; }   // le temps de remplir ses grains
        else pitchTimer = setTimeout(() => { try { eqLow.disconnect(pitch.node); pitch.node.disconnect(); } catch {} }, 150);   // après le fondu vers le signal direct
    }
    function ensureGraph(el) {
        if (!el) return false;
        const tap = window.__sceAudioTap;
        if (tap && tap.el === el) {
            if (graph.el === el && graph.mode === 'tap') return true;
            try {
                tap.input.disconnect(tap.output);                     // on remplace le passe-plat par la chaîne d'effets
                try { graph.pitch?.node.disconnect(); } catch {}      // l'ancienne chaîne ne doit plus rien calculer
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

    const warned = new WeakSet();
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
            graph.master.gain.setTargetAtTime(cfg.muted ? 0 : cfg.volume, t, 0.02);
            graph.pitch?.setSemitones(cfg.pitchSemitones || 0);
            routePitch(!!cfg.pitchSemitones);
            const shifted = !!cfg.pitchSemitones && !!graph.pitch, at = shifted ? Math.max(t, graph.pitchReadyAt || 0) : t;
            for (const gain of [graph.pitchDry.gain, graph.pitchWet.gain]) gain.cancelScheduledValues(t);
            graph.pitchDry.gain.setTargetAtTime(shifted ? 0 : 1, at, 0.02);
            graph.pitchWet.gain.setTargetAtTime(shifted ? 1 : 0, at, 0.02);
        } else {
            try { el.volume = cfg.muted ? 0 : Math.min(1, cfg.volume); } catch {}    // l'élément natif est limité à 100 %
            if (effectsOn() && !warned.has(el)) { warned.add(el); window.__scsp?.toast?.(L.unavailable, { error: true }); }   // une fois par titre, pas à chaque réglage
        }
        updateBtn();
    }
    function set(patch) { cfg = { ...cfg, ...patch }; cfg.volume = clampVolume(cfg.volume); store.set(cfg); apply(); updateBtn(); if (panel) syncPanel(); window.dispatchEvent(new Event('sce:audio-change')); }
    function setSettings(patch) {
        if (!patch || typeof patch !== 'object') return false;
        const next = {};
        if (Number.isFinite(patch.rate)) next.rate = clampRate(patch.rate);
        if (typeof patch.preservePitch === 'boolean') next.preservePitch = patch.preservePitch;
        if (Number.isFinite(patch.pitchSemitones)) next.pitchSemitones = Math.max(-12, Math.min(12, Math.round(patch.pitchSemitones)));
        if (Number.isFinite(patch.bass)) next.bass = Math.min(12, Math.max(0, patch.bass));
        if (Number.isFinite(patch.reverb)) next.reverb = Math.min(1, Math.max(0, patch.reverb));
        if (Number.isFinite(patch.volume)) next.volume = clampVolume(patch.volume, typeof patch.allowVolumeBoost === 'boolean' ? patch.allowVolumeBoost : cfg.allowVolumeBoost);
        if (typeof patch.muted === 'boolean') next.muted = patch.muted;
        if (typeof patch.allowVolumeBoost === 'boolean') next.allowVolumeBoost = patch.allowVolumeBoost;
        if (!Object.keys(next).length) return false;
        set(next);
        return true;
    }
    function applyPreset(name) {
        const values = Object.hasOwn(PRESETS, name) ? PRESETS[name] : customPresets().find((p) => p.name === name)?.values;
        if (!values) return false;
        setSettings(values);
        return true;
    }

    // ── Analyse : BPM (flux spectral + autocorrélation) et tonalité (chroma + profils de Krumhansl) ──
    const Analysis = window.__sceAudioAnalysis.create({
        graph,
        settings: () => cfg,
        analysisVisible: () => analysisVisible(),
        enabled: () => enabled(),
        render: () => { updateAnalysisBar(); updateBtn(); },
        listeningLabel: L.listening,
    });

    /** Exposé aux autres modules (lecteur épinglable, panneau latéral) : graphe, analyse, réglages. */
    window.__sceAudio = Object.freeze({
        get ctx() { return graph.ctx; }, get master() { return graph.master; }, get eqLow() { return graph.eqLow; }, get xfade() { return graph.xfade; },
        get analysis() { return Analysis.result; }, ensure: () => ensureGraph(media), get media() { return media; },
        get rate() { return cfg.rate; }, setRate: (r) => set({ rate: clampRate(r) }), closePanel,
        get volume() { return cfg.volume; }, get muted() { return cfg.muted; },
        setVolume: (v) => set({ volume: clampVolume(v), muted: false }), toggleMute: () => set({ muted: !cfg.muted }),
        get settings() { return { rate: cfg.rate, preservePitch: cfg.preservePitch, pitchSemitones: cfg.pitchSemitones || 0, bass: cfg.bass, reverb: cfg.reverb, volume: cfg.volume, muted: cfg.muted, allowVolumeBoost: cfg.allowVolumeBoost }; },
        get keepNext() { return cfg.keepNext; }, setKeepNext: (value) => set({ keepNext: Boolean(value) }),
        get customPresets() { return customPresets(); }, savePreset, removePreset, setSettings, applyPreset,
    });
    window.addEventListener('message', (event) => {
        if (event.source !== window || event.origin !== location.origin || event.data?.sce !== 'command') return;
        const { command, value } = event.data;
        if (command === 'get-audio') {
            window.postMessage({ sce: 'audio-state', settings: window.__sceAudio.settings, keepNext: cfg.keepNext, presets: customPresets().map(({ name }) => name) }, location.origin);
        } else if (command === 'audio-set' && value && typeof value === 'object' && !Array.isArray(value)) {
            setSettings(value);
        } else if (command === 'audio-keep-next' && typeof value === 'boolean') {
            window.__sceAudio.setKeepNext(value);
        } else if (command === 'audio-preset' && typeof value === 'string') {
            applyPreset(value);
        }
    });
    if (typeof window.__sceOnMedia === 'function') window.__sceOnMedia((el) => { media = el; apply(el); });
    if (typeof window.__sceOnAudioTap === 'function') window.__sceOnAudioTap((tap) => { if (media === tap.el || !media) { media = tap.el; apply(tap.el); } });
    window.addEventListener('sce:speed', (e) => { const r = Number(e.detail?.rate); if (Number.isFinite(r)) set({ rate: clampRate(r) }); });

    // ── UI ────────────────────────────────────────────────────────
    const CSS = `
        /* Le curseur est frère du slider natif : SoundCloud ne reçoit pas ses gestes. */
        .playControls__volume .volume__sliderWrapper { display: none !important; }
        .${NS}-hover-volume { display: none; position: absolute; bottom: 48px; left: -9px; z-index: 2; width: 40px; height: 152px; padding: 12px 13px; box-sizing: border-box; border-radius: 3px; background: #333; box-shadow: 0 2px 8px #0006; }
        .playControls__volume .volume:hover > .${NS}-hover-volume,
        .playControls__volume .volume:has(.volume__button:focus-visible) > .${NS}-hover-volume { display: block; }
        .${NS}-hover-volume input { display: block; width: 14px; height: 128px; margin: 0; writing-mode: vertical-lr; direction: rtl; accent-color: var(--sce-accent, #f50); cursor: pointer; }
        .playControls__volume .volume__button { position: relative; }
        .playControls__volume .volume__button.${NS}-active::after { content: ''; position: absolute; top: 13px; right: 1px; width: 5px; height: 5px; border-radius: 50%; background: var(--sce-accent, #f50); }
        .playControls__volume .volume__button.${NS}-muted { opacity: .45; }
        .${NS}-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .${NS}-mute { width: 22px; height: 22px; flex: 0 0 auto; border: 0; border-radius: 2px; background: transparent; color: #ccc; cursor: pointer; padding: 0; display: grid; place-items: center; }
        .${NS}-mute:hover { color: #fff; background: #444; }
        .${NS}-mute.m-on { color: var(--sce-accent, #f50); }
        .${NS}-mute svg { width: 15px; height: 15px; fill: currentColor; }
        .${NS}-rate-ctl { display: flex; align-items: center; gap: 4px; }
        .${NS}-step { width: 18px; height: 18px; border: 0; border-radius: 2px; background: #444; color: #fff; cursor: pointer; padding: 0; font: 700 13px/18px ${FONT}; }
        .${NS}-step:hover { background: #555; }
        .${NS}-panel .v-rate { cursor: text; border-bottom: 1px dotted #777; min-width: 40px; text-align: right; display: inline-block; }
        .${NS}-panel .i-rate { width: 58px; height: 18px; box-sizing: border-box; background: #222; color: #fff; border: 1px solid #666; border-radius: 2px; font: 700 12px ${FONT}; text-align: right; padding: 0 4px; }
        .${NS}-panel { position: fixed; bottom: 52px; width: 256px; padding: 12px 14px 10px; border-radius: 2px; background: #333; color: #ccc;
                       box-shadow: 0 2px 8px rgba(0,0,0,.4); font: 12px/1.3 ${FONT}; z-index: 99999; user-select: none; }
        .${NS}-panel::after { content: ''; position: absolute; left: var(--arrow, 50%); bottom: -5px; width: 10px; height: 10px; background: #333; transform: translateX(-50%) rotate(45deg); }
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
        .${NS}-panel { max-height: calc(100vh - 76px); overflow-y: auto; scrollbar-width: none; }
        .${NS}-panel::-webkit-scrollbar { display: none; }
        .${NS}-custom summary { display: flex; align-items: center; justify-content: space-between; padding: 7px 0; color: #aaa; cursor: pointer; list-style: none; font: 500 11px ${FONT}; }
        .${NS}-custom summary::-webkit-details-marker { display: none; }
        .${NS}-custom summary::after { content: '▸'; font-size: 13px; transition: transform .15s; }
        .${NS}-custom[open] summary::after { transform: rotate(90deg); }
        .${NS}-custom summary:hover, .${NS}-custom summary:focus-visible { color: #fff; }
        .${NS}-custom-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 6px; }
        .${NS}-custom-fields label { margin: 0; }
        .${NS}-custom-entry { display: flex; gap: 4px; margin: 8px 0; }
        .${NS}-custom-entry input { min-width: 0; flex: 1; background: #292929; color: #fff; border: 1px solid #555; border-radius: 2px; padding: 4px 6px; font: 11px ${FONT}; }
        .${NS}-custom-entry button, .${NS}-custom-list button { border: 0; border-radius: 2px; background: #444; color: #eee; cursor: pointer; font: 11px ${FONT}; padding: 5px 7px; }
        .${NS}-custom-entry button:hover, .${NS}-custom-list button:hover { background: #555; }
        .${NS}-custom-list { display: grid; gap: 4px; }
        .${NS}-custom-item { display: flex; gap: 4px; }
        .${NS}-custom-item button:first-child { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; text-align: left; }
        .${NS}-custom-item button.m-on { background: var(--sce-accent, #f50); color: #fff; }
        .${NS}-analysis-bar { flex: 0 0 auto; display: flex; align-items: center; gap: 5px; margin-left: 8px; padding: 0 8px; height: 24px; align-self: center; border-radius: 3px; background: #e5e5e5; color: #555; font: 600 10px ${FONT}; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .${NS}-analysis-bar b { color: #333; font-size: 11px; }
        .${NS}-analysis-bar .sce-audio-dot { color: #aaa; }
        @media (max-width: 1050px) { .${NS}-analysis-bar { display: none; } }
    `;
    function injectStyles() { if (document.getElementById(`${NS}-styles`)) return; const s = document.createElement('style'); s.id = `${NS}-styles`; s.textContent = CSS; document.head.appendChild(s); }

    const ICON_SPEAKER = '<svg viewBox="0 0 16 16"><path d="M2 6h3l4-3v10l-4-3H2z"/><path d="M11 5.5a3 3 0 0 1 0 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
    function updateBtn() {
        if (!btn) return;
        const bits = [cfg.muted ? L.muted : `${L.volume} ${Math.round(cfg.volume * 100)} %`, fmtRate(cfg.rate)];
        if (cfg.bass > 0.01) bits.push(`bass +${Math.round(cfg.bass)} dB`);
        if (cfg.reverb > 0.01) bits.push(`réverb ${Math.round(cfg.reverb * 100)} %`);
        if (cfg.pitchSemitones) bits.push(`${cfg.pitchSemitones > 0 ? '+' : ''}${cfg.pitchSemitones} st`);
        if (Analysis.result) bits.push(Analysis.label());
        btn.title = `${L.tip} : ${bits.join(' · ')}`;
        btn.classList.toggle(`${NS}-active`, anyOn());
        btn.classList.toggle(`${NS}-muted`, cfg.muted);
        const hover = btn.closest('.volume')?.querySelector(`.${NS}-hover-volume input`);
        if (hover) {
            hover.max = cfg.allowVolumeBoost ? '200' : '100';
            if (hover !== document.activeElement) hover.value = String(Math.round(cfg.volume * 100));
        }
    }
    function updateAnalysisBar() {
        const bar = document.querySelector(`.${NS}-analysis-bar`); if (!bar) return;
        const r = Analysis.result;
        const values = bar.querySelectorAll('b');
        values[0].textContent = r?.bpm ?? '–';
        values[1].textContent = r?.key ? `${r.key}${r.mode === 'minor' ? 'm' : ''}` : '–';
        values[2].textContent = r?.key ? Analysis.camelot(r) : '–';
        bar.title = r ? `${L.analysis} · ${Analysis.label()} · ${Math.round(r.conf * 100)} %` : `${L.analysis} · ${L.listening}`;
    }
    function mountAnalysisBar() {
        if (!analysisVisible()) { document.querySelectorAll(`.${NS}-analysis-bar`).forEach((el) => el.remove()); return; }
        const badge = document.querySelector('.playControls__soundBadge, .playbackSoundBadge');
        if (!badge || !badge.parentElement || badge.previousElementSibling?.classList.contains(`${NS}-analysis-bar`)) return;
        document.querySelectorAll(`.${NS}-analysis-bar`).forEach((el) => el.remove());
        const bar = document.createElement('div'); bar.className = `${NS}-analysis-bar`;
        bar.setAttribute('aria-label', L.analysis);
        bar.innerHTML = '<b>–</b> BPM <span class="sce-audio-dot">·</span> <b>–</b> <span class="sce-audio-dot">·</span> <b>–</b>';
        badge.before(bar); analysisBar = bar; updateAnalysisBar();
    }
    const paint = (input, pct) => input.style.setProperty('--p', `${pct * 100}%`);

    function buildPanel() {
        const p = document.createElement('div');
        p.className = `${NS}-panel`;
        const ticks = [0.1, 0.25, 0.5, 1, 1.5, 2, 3].map((r) => `<span style="left:${rateToPos(r) * 100}%">${r}×</span>`).join('');
        p.innerHTML = `
            <div class="${NS}-head"><span>Audio</span><button type="button" class="${NS}-close" title="Fermer (Échap)">×</button></div>
            <h4><span>${L.volume}</span><b class="v-vol"></b></h4>
            <div class="${NS}-row"><button type="button" class="${NS}-mute" title="${L.mute}">${ICON_SPEAKER}</button><input type="range" class="r-vol" min="0" max="100" step="1" title="${L.volume} — molette : ±2 %"></div>
            <label><input type="checkbox" class="c-volume-boost"> ${L.boost}</label>
            <div class="${NS}-sep"></div>
            <h4><span>${L.speed}</span><span class="${NS}-rate-ctl"><button type="button" class="${NS}-step s-dec" title="−0,01">−</button><b class="v-rate" title="${L.typeRate}"></b><button type="button" class="${NS}-step s-inc" title="+0,01">+</button></span></h4>
            <input type="range" class="r-rate" min="0" max="1" step="0.001" title="${L.speed} — double-clic : 1×, molette : ±1 %, flèches : ±0,01 (Maj : ±0,1)">
            <div class="${NS}-ticks">${ticks}</div>
            <label><input type="checkbox" class="c-pitch"> ${L.pitch}</label>
            <h4><span>${L.pitchShift}</span><b class="v-pitch-shift"></b></h4>
            <input type="range" class="r-pitch-shift" min="-12" max="12" step="1" title="${L.pitchShift} · −12 à +12">
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
            <label><input type="checkbox" class="c-keep-next"> ${L.keepNext}</label>
            <div class="${NS}-sep"></div>
            <details class="${NS}-custom">
                <summary>${L.custom}</summary>
                <div class="${NS}-custom-fields" aria-label="${L.choose}">
                    <label><input type="checkbox" data-field="rate" checked> ${L.speed}</label>
                    <label><input type="checkbox" data-field="volume" checked> ${L.volume}</label>
                    <label><input type="checkbox" data-field="muted" checked> ${L.mute}</label>
                    <label><input type="checkbox" data-field="preservePitch" checked> ${L.pitchPreset}</label>
                    <label><input type="checkbox" data-field="pitchSemitones" checked> ${L.pitchShift}</label>
                    <label><input type="checkbox" data-field="bass" checked> ${L.bass}</label>
                    <label><input type="checkbox" data-field="reverb" checked> ${L.reverb}</label>
                </div>
                <div class="${NS}-custom-entry"><input class="custom-name" maxlength="40" placeholder="${L.presetName}" aria-label="${L.presetName}"><button type="button" class="custom-save">${L.save}</button></div>
                <div class="${NS}-custom-list"></div>
            </details>`;
        const vol = p.querySelector('.r-vol');
        vol.addEventListener('input', () => set({ volume: clampVolume(parseInt(vol.value, 10) / 100), muted: false }));
        vol.addEventListener('wheel', (e) => { e.preventDefault(); set({ volume: clampVolume(cfg.volume + (e.deltaY < 0 ? 0.02 : -0.02)), muted: false }); }, { passive: false });
        p.querySelector('.c-volume-boost').addEventListener('change', (e) => set({ allowVolumeBoost: e.target.checked }));
        p.querySelector(`.${NS}-mute`).addEventListener('click', () => set({ muted: !cfg.muted }));
        const rate = p.querySelector('.r-rate');
        rate.addEventListener('input', () => { const r = snap(clampRate(posToRate(parseFloat(rate.value)))); set({ rate: r }); rate.value = rateToPos(r); paint(rate, rateToPos(r)); });
        rate.addEventListener('dblclick', () => set({ rate: 1 }));
        rate.addEventListener('wheel', (e) => { e.preventDefault(); set({ rate: clampRate(cfg.rate * (e.deltaY < 0 ? 1.01 : 1 / 1.01)) }); }, { passive: false });
        // Précision : flèches ±0,01 (Maj ±0,1), boutons ±0,01, saisie directe de la valeur
        rate.addEventListener('keydown', (e) => {
            const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
            if (!dir) return;
            e.preventDefault(); set({ rate: clampRate(cfg.rate + dir * (e.shiftKey ? 0.1 : 0.01)) });
        });
        p.querySelector('.s-dec').addEventListener('click', () => set({ rate: clampRate(cfg.rate - 0.01) }));
        p.querySelector('.s-inc').addEventListener('click', () => set({ rate: clampRate(cfg.rate + 0.01) }));
        p.querySelector('.v-rate').addEventListener('click', () => {
            const label = p.querySelector('.v-rate'); if (!label || p.querySelector('.i-rate')) return;
            const input = document.createElement('input'); input.type = 'number'; input.className = 'i-rate'; input.min = RATE.min; input.max = RATE.max; input.step = '0.01'; input.value = cfg.rate;
            const done = (commit) => { if (!input.isConnected) return; if (commit) { const r = parseFloat(input.value); if (Number.isFinite(r)) set({ rate: clampRate(r) }); } input.replaceWith(label); };
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } if (e.key === 'Escape') { e.preventDefault(); done(false); } e.stopPropagation(); });
            input.addEventListener('blur', () => done(true));
            label.replaceWith(input); input.focus(); input.select();
        });
        p.querySelector('.c-pitch').addEventListener('change', (e) => set({ preservePitch: e.target.checked }));
        p.querySelector('.r-pitch-shift').addEventListener('input', (e) => set({ pitchSemitones: Number(e.target.value) }));
        p.querySelector('.r-pitch-shift').addEventListener('dblclick', () => set({ pitchSemitones: 0 }));
        p.querySelector('.r-bass').addEventListener('input', (e) => set({ bass: parseFloat(e.target.value) }));
        p.querySelector('.r-reverb').addEventListener('input', (e) => set({ reverb: parseFloat(e.target.value) }));
        p.querySelector('.c-keep-next').addEventListener('change', (e) => set({ keepNext: e.target.checked }));
        p.querySelector('.custom-save').addEventListener('click', () => {
            const input = p.querySelector('.custom-name');
            const fields = [...p.querySelectorAll('[data-field]:checked')].map((el) => el.dataset.field);
            if (savePreset(input.value, fields)) input.value = '';
            else input.focus();
        });
        p.querySelector('.custom-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') p.querySelector('.custom-save').click(); });
        // Re-cliquer le preset actif revient à Normal
        p.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => set({ ...(b.classList.contains('m-on') && b.dataset.p !== 'normal' ? PRESETS.normal : PRESETS[b.dataset.p]) })));
        p.querySelector(`.${NS}-close`).addEventListener('click', closePanel);
        renderCustomPresets(p);
        return p;
    }
    function renderCustomPresets(target = panel) {
        const list = target?.querySelector(`.${NS}-custom-list`); if (!list) return;
        list.replaceChildren();
        for (const preset of customPresets()) {
            const row = document.createElement('div'); row.className = `${NS}-custom-item`;
            const applyButton = document.createElement('button'); applyButton.type = 'button'; applyButton.textContent = preset.name; applyButton.title = `${L.apply} : ${preset.name}`;
            applyButton.classList.toggle('m-on', Object.entries(preset.values).every(([key, value]) => cfg[key] === value));
            applyButton.addEventListener('click', () => applyPreset(preset.name));
            const removeButton = document.createElement('button'); removeButton.type = 'button'; removeButton.textContent = '×'; removeButton.title = `${L.remove} : ${preset.name}`;
            removeButton.addEventListener('click', () => removePreset(preset.name));
            row.append(applyButton, removeButton); list.appendChild(row);
        }
    }
    function syncPanel() {
        const q = (s) => panel.querySelector(s);
        if (q('.v-rate')) q('.v-rate').textContent = fmtRate(cfg.rate);
        q('.r-rate').value = rateToPos(cfg.rate); paint(q('.r-rate'), rateToPos(cfg.rate));
        q('.v-vol').textContent = cfg.muted ? L.muted : `${Math.round(cfg.volume * 100)} %`;
        q('.r-vol').max = cfg.allowVolumeBoost ? '200' : '100';
        q('.r-vol').value = Math.round(cfg.volume * 100); paint(q('.r-vol'), cfg.muted ? 0 : cfg.volume / (cfg.allowVolumeBoost ? 2 : 1));
        q('.c-volume-boost').checked = cfg.allowVolumeBoost;
        q(`.${NS}-mute`).classList.toggle('m-on', cfg.muted);
        q('.c-pitch').checked = cfg.preservePitch;
        q('.r-pitch-shift').value = cfg.pitchSemitones || 0;
        q('.v-pitch-shift').textContent = `${cfg.pitchSemitones > 0 ? '+' : ''}${cfg.pitchSemitones || 0} st`;
        paint(q('.r-pitch-shift'), ((cfg.pitchSemitones || 0) + 12) / 24);
        q('.c-keep-next').checked = cfg.keepNext;
        q('.v-bass').textContent = cfg.bass > 0.01 ? `+${cfg.bass} dB` : 'off'; q('.r-bass').value = cfg.bass; paint(q('.r-bass'), cfg.bass / 12);
        q('.v-reverb').textContent = cfg.reverb > 0.01 ? `${Math.round(cfg.reverb * 100)} %` : 'off'; q('.r-reverb').value = cfg.reverb; paint(q('.r-reverb'), cfg.reverb);
        panel.querySelectorAll('[data-p]').forEach((b) => { const P = PRESETS[b.dataset.p]; b.classList.toggle('m-on', Math.abs(P.rate - cfg.rate) < 1e-6 && P.preservePitch === cfg.preservePitch && (P.pitchSemitones || 0) === (cfg.pitchSemitones || 0) && Math.abs(P.bass - cfg.bass) < .26 && Math.abs(P.reverb - cfg.reverb) < .06); });
        const presets = customPresets();
        panel.querySelectorAll(`.${NS}-custom-item`).forEach((row, index) => {
            const preset = presets[index];
            row.firstElementChild?.classList.toggle('m-on', !!preset && Object.entries(preset.values).every(([key, value]) => cfg[key] === value));
        });
    }
    function closePanel() { panel?.remove(); panel = null; }
    function togglePanel() {
        if (panel) { closePanel(); return; }
        panel = buildPanel(); document.body.appendChild(panel);
        window.dispatchEvent(new CustomEvent('sce:audio-panel', { detail: { panel } }));   // sections d'autres modules (sampler)
        const r = btn.getBoundingClientRect(), width = document.documentElement.clientWidth || window.innerWidth, pw = panel.offsetWidth || 284;
        const left = Math.max(8, Math.min(width - pw - 8, r.left + r.width / 2 - pw / 2));
        panel.style.left = `${left}px`;
        panel.style.setProperty('--arrow', `${Math.max(12, Math.min(244, r.left + r.width / 2 - left))}px`);   // la flèche reste sous le bouton
        syncPanel();
        // Le panneau reste ouvert pendant la navigation dans le titre.
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel) closePanel(); });
    document.addEventListener('pointerdown', (e) => {
        if (panel && !panel.contains(e.target) && !btn?.contains(e.target)) closePanel();
    }, true);

    // Lus à chaque mutation du DOM : gardés en mémoire, relus quand les réglages changent.
    const readFlags = () => { try { const s = JSON.parse(localStorage.getItem('scsp:settings') || '{}'); return { enabled: s.speedControl !== false, analysis: s.showAnalysis !== false }; } catch { return { enabled: true, analysis: true }; } };
    let flags = readFlags();
    const enabled = () => flags.enabled;
    const analysisVisible = () => flags.analysis;
    // Le bouton haut-parleur natif devient le nôtre : clic (intercepté avant SoundCloud) = panneau, molette = volume.
    const onBtnClick = (e) => { e.preventDefault(); e.stopImmediatePropagation(); togglePanel(); btn?.blur(); };
    const onBtnWheel = (e) => { e.preventDefault(); e.stopImmediatePropagation(); set({ volume: clampVolume(cfg.volume + (e.deltaY < 0 ? 0.02 : -0.02)), muted: false }); };
    const onBtnPointer = (e) => e.stopImmediatePropagation();
    function unmount() {
        if (btn) {
            btn.removeEventListener('click', onBtnClick, true);
            btn.removeEventListener('wheel', onBtnWheel, true);
            for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup']) btn.removeEventListener(type, onBtnPointer, true);
            btn.classList.remove(`${NS}-active`, `${NS}-muted`); btn.title = '';
        }
        document.querySelectorAll(`.${NS}-hover-volume`).forEach((el) => el.remove());
        btn = null; document.querySelectorAll(`.${NS}-analysis-bar`).forEach((el) => el.remove()); document.getElementById(`${NS}-styles`)?.remove(); closePanel();
    }
    function mount() {
        if (!enabled()) { unmount(); return; }
        if (btn?.isConnected) { mountAnalysisBar(); return; }
        const native = document.querySelector('.playControls__volume .volume__button'); if (!native) return;
        injectStyles();
        btn = native;
        btn.addEventListener('click', onBtnClick, true);
        btn.addEventListener('wheel', onBtnWheel, { capture: true, passive: false });
        for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup']) btn.addEventListener(type, onBtnPointer, true);
        const volume = native.closest('.volume');
        if (volume && !volume.querySelector(`.${NS}-hover-volume`)) {
            const wrap = document.createElement('div'); wrap.className = `${NS}-hover-volume`;
            const input = document.createElement('input'); input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '1';
            input.value = String(Math.round(cfg.volume * 100)); input.setAttribute('aria-label', L.volume);
            input.addEventListener('input', () => set({ volume: clampVolume(Number(input.value) / 100), muted: false }));
            for (const type of ['pointerdown', 'mousedown', 'click', 'keydown']) input.addEventListener(type, (e) => e.stopPropagation());
            wrap.append(input); volume.append(wrap);
        }
        updateBtn();
        mountAnalysisBar();
    }

    document.addEventListener('keydown', (e) => {
        const el = document.activeElement;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
        if (!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
        if (e.code === 'Period') { e.preventDefault(); set({ rate: clampRate(cfg.rate * 1.1) }); }
        if (e.code === 'Comma')  { e.preventDefault(); set({ rate: clampRate(cfg.rate / 1.1) }); }
        if (e.code === 'Digit0') { e.preventDefault(); set({ ...PRESETS.normal }); }
    });
    // Cet observateur suit la lecture même onglet masqué (retour à Normal au titre suivant) : il garde donc
    // son propre abonnement, et ses éléments en mémoire pour ne pas réinterroger la page à chaque mutation.
    let titleLink = null;
    const trackHref = () => { if (!titleLink?.isConnected) titleLink = document.querySelector('.playbackSoundBadge__titleLink'); return titleLink?.getAttribute('href') || null; };
    let lastTrack = trackHref();
    new MutationObserver(() => {
        const track = trackHref();
        if (track && lastTrack && track !== lastTrack) {
            if (!cfg.keepNext) set(PRESETS.normal);
            else { apply(); if (panel) syncPanel(); }
            setTimeout(() => { if (track === trackHref()) { apply(); if (panel) syncPanel(); } }, 250);
        }
        if (track) lastTrack = track;
        if (enabled() && (!btn?.isConnected || (analysisVisible() && !analysisBar?.isConnected))) mount();   // désactivé : onSettings a déjà tout retiré
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
    // Réglage modifié : 'sce:settings-change' vient du pont (même onglet), 'storage' d'un autre onglet
    const onSettings = () => { flags = readFlags(); if (!enabled()) unmount(); else mount(); };
    window.addEventListener('sce:settings-change', onSettings);
    window.addEventListener('storage', (e) => { if (e.key === 'scsp:settings') onSettings(); });
    mount();
})();
