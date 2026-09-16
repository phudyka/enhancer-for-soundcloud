/*
 * Enhancer for SoundCloud™ — mode DJ (monde principal)
 *
 * Deux platines :
 *   A = le lecteur SoundCloud lui-même (piloté via l'étage DJ inséré par
 *       audio.js : gain master + égaliseur bas, BPM de l'analyse en direct)
 *   B = un second titre SoundCloud, lu en flux dans un <audio> à nous, branché
 *       sur le même AudioContext (égaliseur bas + gain), avec son propre
 *       estimateur de BPM.
 * Au centre : crossfader à puissance constante, Sync (aligne le tempo de B
 * sur A), Auto-mix (transition automatique 8/16/32 s : fondu croisé, bascule
 * des basses à mi-parcours, pause de A à la fin), points de repère (cue).
 *
 * Dock au-dessus de la barre du lecteur, ouvert par le bouton « platines ».
 * Design system SoundCloud : #1a1a1a, texte #fff/#999, accent, curseurs 2 px.
 */
(() => {
    'use strict';
    const NS = 'sce-dj';
    const FONT = 'Söhne, system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif';
    const $ = (s, r = document) => r.querySelector(s);
    const S = () => window.__scsp, A = () => window.__sceAudio;
    const SEL = { play: '.playControl', title: '.playbackSoundBadge__titleLink', artist: '.playbackSoundBadge__lightLink', art: '.playbackSoundBadge__avatar span[style*="background-image"]', volume: '.playControls__volume' };
    const T = {
        fr: { deckA: 'Platine A · SoundCloud', deckB: 'Platine B', search: 'Charger un titre : recherche…', cue: 'Cue', low: 'Basses', sync: 'Sync', automix: 'Auto-mix', pitch: 'Pitch', empty: 'Aucun titre chargé', loading: 'Chargement…', unavailable: 'Titre indisponible en flux', tip: 'Mode DJ : deux platines, crossfader, auto-mix', toSC: 'Ouvrir dans SoundCloud', bpmNeeded: 'BPM des deux platines nécessaires' },
        en: { deckA: 'Deck A · SoundCloud', deckB: 'Deck B', search: 'Load a track: search…', cue: 'Cue', low: 'Low', sync: 'Sync', automix: 'Auto-mix', pitch: 'Pitch', empty: 'No track loaded', loading: 'Loading…', unavailable: 'Track not streamable', tip: 'DJ mode: two decks, crossfader, auto-mix', toSC: 'Open in SoundCloud', bpmNeeded: 'Both decks need a BPM' },
    };
    const L = T[(document.documentElement.lang || 'en').slice(0, 2)] || T.en;
    const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ── Estimateur de BPM compact (flux spectral + autocorrélation), pour la platine B
    function makeBpm(analyser, getRate) {
        let prev = null, flux = [], timer = null, result = null, frames = 0, spare = null;
        const FPS = 50;
        const tick = () => {
            if (!B.el || B.el.paused) return;
            const n = analyser.frequencyBinCount;
            const mag = spare && spare.length === n ? spare : new Float32Array(n); // deux tampons réutilisés : aucune allocation par image
            analyser.getFloatFrequencyData(mag);
            let f = 0; for (let i = 1; i < n; i++) { const m = Math.pow(10, mag[i] / 20); if (prev) { const d = m - prev[i]; if (d > 0) f += d; } mag[i] = m; }
            spare = prev; prev = mag; flux.push(f); if (flux.length > 40 * FPS) flux.shift();
            if (++frames % 100 === 0 && flux.length > 600) {
                const N = flux.length, mean = flux.reduce((a, b) => a + b, 0) / N, x = flux.map((v) => v - mean);
                const lagMin = Math.floor(FPS * 60 / 200), lagMax = Math.ceil(FPS * 60 / 60); let best = lagMin, bv = -Infinity; const ac = [];
                for (let lag = lagMin; lag <= lagMax + 1; lag++) { let s = 0; for (let i = lag; i < N; i++) s += x[i] * x[i - lag]; ac[lag] = s / (N - lag); }
                for (let lag = lagMin; lag <= lagMax; lag++) { const w = ac[lag] * (1 - 0.15 * Math.abs(Math.log2((FPS * 60 / lag) / 128))); if (w > bv) { bv = w; best = lag; } }
                const y0 = ac[best - 1] || 0, y1 = ac[best], y2 = ac[best + 1] || 0, den = y0 - 2 * y1 + y2, lag = best + (den ? 0.5 * (y0 - y2) / den : 0);
                result = Math.round(FPS * 60 / lag / (getRate() || 1));
            }
        };
        return { start() { clearInterval(timer); timer = setInterval(tick, 1000 / FPS); }, stop() { clearInterval(timer); }, reset() { prev = null; flux = []; result = null; frames = 0; }, get bpm() { return result; } };
    }

    // ── Platine B ─────────────────────────────────────────────────
    const B = { el: null, ctx: null, src: null, eqLow: null, gain: null, an: null, bpm: null, track: null, cue: 0, pitch: 0, lowKill: false };
    async function loadB(track) {
        B.track = track; B.cue = 0;
        ui.bTitle.textContent = L.loading; ui.bArtist.textContent = track.user?.username || '';
        ui.bArt.style.backgroundImage = track.artwork_url ? `url("${track.artwork_url.replace('-large.', '-t200x200.')}")` : '';
        const tc = (track.media?.transcodings || []).find((t) => t.format.protocol === 'progressive') || (track.media?.transcodings || []).find((t) => /mpeg/.test(t.format.mime_type));
        if (!tc) { ui.bTitle.textContent = L.unavailable; return; }
        const res = await S().api(`${tc.url.replace('https://api-v2.soundcloud.com', '')}?track_authorization=${track.track_authorization}`);
        if (!res?.url) { ui.bTitle.textContent = L.unavailable; return; }
        if (!B.el) {
            B.el = new Audio(); B.el.__sceIgnore = true; // media-hook ne doit ni le prendre pour le lecteur SoundCloud ni l'intercepter
            B.el.crossOrigin = 'anonymous'; B.el.preload = 'auto';
            B.el.addEventListener('timeupdate', renderB); B.el.addEventListener('play', renderB); B.el.addEventListener('pause', renderB); B.el.addEventListener('ended', renderB);
        }
        B.el.src = res.url; B.el.playbackRate = 1 + B.pitch / 100; B.el.preservesPitch = false;
        ensureB();
        B.bpm?.reset();
        ui.bTitle.textContent = track.title; ui.bTitle.title = track.title;
        ui.bOpen.href = track.permalink_url;
        renderB();
    }
    function ensureB() {
        if (B.src) return;
        try {
            const ctx = A()?.ctx || (B.ctx = B.ctx || new AudioContext());
            B.ctx = ctx;
            B.src = ctx.createMediaElementSource(B.el);
            B.eqLow = ctx.createBiquadFilter(); B.eqLow.type = 'lowshelf'; B.eqLow.frequency.value = 200;
            B.gain = ctx.createGain(); B.an = ctx.createAnalyser(); B.an.fftSize = 4096; B.an.smoothingTimeConstant = 0;
            B.src.connect(B.eqLow); B.eqLow.connect(B.gain); B.gain.connect(ctx.destination); B.src.connect(B.an);
            B.bpm = makeBpm(B.an, () => B.el.playbackRate); B.bpm.start();
            applyFader();
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        } catch (e) { console.warn('[SCE] platine B', e); }
    }

    // ── Crossfader (puissance constante) et égaliseurs
    const X = { pos: -1, lowA: false, auto: null };
    function applyFader() {
        const a = A(), t = (X.pos + 1) / 2, gA = Math.cos(t * Math.PI / 2), gB = Math.sin(t * Math.PI / 2);
        const now = (a?.ctx || B.ctx)?.currentTime || 0;
        if (a?.master) a.master.gain.setTargetAtTime(gA, now, 0.03);
        if (a?.eqLow) a.eqLow.gain.setTargetAtTime(X.lowA ? -30 : 0, now, 0.05);
        if (B.gain) B.gain.gain.setTargetAtTime(gB, now, 0.03);
        if (B.eqLow) B.eqLow.gain.setTargetAtTime(B.lowKill ? -30 : 0, now, 0.05);
        if (!B.src && B.el) B.el.volume = gB; // repli sans Web Audio
        if (ui) { ui.fader.value = X.pos; ui.lowA.classList.toggle('m-on', X.lowA); ui.lowB.classList.toggle('m-on', B.lowKill); }
    }
    function autoMix(seconds) {
        if (X.auto) { cancelAnimationFrame(X.auto); X.auto = null; ui.auto.classList.remove('m-on'); return; }
        if (!B.el || B.el.paused) B.el?.play().catch(() => {});
        const from = X.pos, t0 = performance.now(); let lowSwapped = false;
        ui.auto.classList.add('m-on');
        const step = () => {
            const k = Math.min(1, (performance.now() - t0) / (seconds * 1000));
            X.pos = from + (1 - from) * k;
            if (!lowSwapped && k > 0.45) { X.lowA = true; B.lowKill = false; lowSwapped = true; }
            applyFader();
            if (k < 1) X.auto = requestAnimationFrame(step);
            else { X.auto = null; ui.auto.classList.remove('m-on'); if ($(SEL.play)?.classList.contains('playing')) $(SEL.play).click(); }
        };
        B.lowKill = true; applyFader();
        X.auto = requestAnimationFrame(step);
    }
    function sync() {
        const bpmA = A()?.analysis?.bpm, bpmB = B.bpm?.bpm;
        if (!bpmA || !bpmB || !B.el) { S()?.toast(L.bpmNeeded, { error: true }); return; }
        let ratio = bpmA / bpmB; while (ratio > 1.5) ratio /= 2; while (ratio < 0.67) ratio *= 2; // double/moitié de tempo
        B.pitch = Math.max(-16, Math.min(16, (ratio - 1) * 100)); B.el.playbackRate = 1 + B.pitch / 100; ui.pitchB.value = B.pitch; renderB();
    }

    // ── UI ────────────────────────────────────────────────────────
    const CSS = `
        .${NS}-btn { width: 24px; height: 48px; padding: 16px 4px; border: 0; background: transparent; color: #fff; cursor: pointer; display: block; }
        .${NS}-btn div { width: 16px; height: 16px; } .${NS}-btn svg { width: 16px; height: 16px; display: block; fill: none; stroke: currentColor; stroke-width: 1.5; }
        .${NS}-btn.m-on { color: var(--sce-accent, #f50); }
        .${NS}-dock { position: fixed; left: 0; right: 0; bottom: 48px; height: 172px; background: #1a1a1a; border-top: 1px solid #333; z-index: 99990; font: 12px ${FONT}; color: #ccc; display: grid; grid-template-columns: 1fr 260px 1fr; gap: 16px; padding: 12px 24px; box-sizing: border-box; }
        .${NS}-deck { display: grid; grid-template-columns: 64px 1fr; grid-template-rows: auto auto auto; gap: 6px 12px; min-width: 0; }
        .${NS}-deck h5 { grid-column: 1 / -1; margin: 0; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: #999; display: flex; justify-content: space-between; }
        .${NS}-deck h5 b { color: #fff; font-variant-numeric: tabular-nums; }
        .${NS}-art { width: 64px; height: 64px; border-radius: 2px; background: #333 center/cover no-repeat; grid-row: 2 / 4; }
        .${NS}-meta { min-width: 0; } .${NS}-title { color: #fff; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .${NS}-artist { color: #999; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .${NS}-bar { position: relative; height: 10px; cursor: pointer; margin-top: 4px; } .${NS}-bar::before { content: ''; position: absolute; left: 0; right: 0; top: 4px; height: 2px; background: #444; } .${NS}-fill { position: absolute; left: 0; top: 4px; height: 2px; background: var(--sce-accent, #f50); }
        .${NS}-ctl { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .${NS}-ctl button, .${NS}-mid button { height: 28px; padding: 0 10px; border: 0; border-radius: 3px; background: #303030; color: #fff; cursor: pointer; font: 500 12px ${FONT}; }
        .${NS}-ctl button:hover, .${NS}-mid button:hover { background: #3a3a3a; } .${NS}-ctl button.m-on, .${NS}-mid button.m-on { background: var(--sce-accent, #f50); }
        .${NS}-ctl .play { width: 28px; padding: 0; } .${NS}-ctl .play svg { width: 12px; height: 12px; fill: currentColor; display: block; margin: auto; }
        .${NS}-ctl label { display: inline-flex; align-items: center; gap: 6px; color: #999; } .${NS}-ctl input[type=range] { width: 90px; height: 2px; accent-color: var(--sce-accent, #f50); }
        .${NS}-ctl .pv { color: #fff; font-variant-numeric: tabular-nums; min-width: 34px; text-align: right; }
        .${NS}-search { position: relative; grid-column: 1 / -1; } .${NS}-search input { width: 100%; height: 30px; box-sizing: border-box; background: #303030; border: 0; border-radius: 3px; color: #fff; padding: 0 10px; font: 12px ${FONT}; }
        .${NS}-results { position: absolute; left: 0; right: 0; bottom: 34px; background: #333; border-radius: 2px; box-shadow: 0 -2px 8px rgba(0,0,0,.4); max-height: 240px; overflow: auto; display: none; z-index: 2; }
        .${NS}-results div { display: flex; gap: 8px; align-items: center; padding: 6px 8px; cursor: pointer; color: #ccc; } .${NS}-results div:hover { background: #404040; color: #fff; }
        .${NS}-results span { width: 28px; height: 28px; border-radius: 2px; background: #444 center/cover; flex: 0 0 auto; } .${NS}-results em { font-style: normal; color: #999; margin-left: auto; white-space: nowrap; }
        .${NS}-mid { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
        .${NS}-fader { width: 100%; height: 4px; accent-color: var(--sce-accent, #f50); cursor: ew-resize; }
        .${NS}-labels { display: flex; justify-content: space-between; width: 100%; color: #999; font-size: 11px; font-weight: 600; margin-top: -6px; }
        .${NS}-mid .row { display: flex; gap: 6px; align-items: center; } .${NS}-mid select { height: 28px; background: #303030; color: #fff; border: 0; border-radius: 3px; font: 12px ${FONT}; }
        .${NS}-open { color: #999; text-decoration: none; font-size: 11px; } .${NS}-open:hover { color: #fff; }
    `;
    let ui = null, dock = null, btn = null;
    const ICON = { play: '<svg viewBox="0 0 16 16"><path d="M4 2v12l9-6z"/></svg>', pause: '<svg viewBox="0 0 16 16"><path d="M3.5 2h3v12h-3zM9.5 2h3v12h-3z"/></svg>' };

    function buildDock() {
        const d = document.createElement('div'); d.className = `${NS}-dock`;
        d.innerHTML = `
            <div class="${NS}-deck ${NS}-a">
                <h5><span>${L.deckA}</span><b class="a-bpm">–</b></h5>
                <div class="${NS}-art a-art"></div>
                <div class="${NS}-meta"><div class="${NS}-title a-title"></div><div class="${NS}-artist a-artist"></div><div class="${NS}-bar a-bar"><div class="${NS}-fill a-fill"></div></div></div>
                <div class="${NS}-ctl"><button class="play a-play">${ICON.play}</button><button class="a-cue">${L.cue}</button><button class="a-low">${L.low}</button>
                    <label>${L.pitch} <input type="range" class="a-pitch" min="-16" max="16" step="0.1" value="0"><span class="pv a-pv">0.0 %</span></label></div>
            </div>
            <div class="${NS}-mid">
                <div class="row"><button class="x-sync">${L.sync}</button><button class="x-auto">${L.automix}</button><select class="x-dur"><option value="8">8 s</option><option value="16" selected>16 s</option><option value="32">32 s</option></select></div>
                <input type="range" class="${NS}-fader" min="-1" max="1" step="0.01" value="-1">
                <div class="${NS}-labels"><span>A</span><span>B</span></div>
            </div>
            <div class="${NS}-deck ${NS}-b">
                <h5><span>${L.deckB}</span><span><a class="${NS}-open b-open" target="_blank">${L.toSC}</a> &nbsp; <b class="b-bpm">–</b></span></h5>
                <div class="${NS}-art b-art"></div>
                <div class="${NS}-meta"><div class="${NS}-title b-title">${L.empty}</div><div class="${NS}-artist b-artist"></div><div class="${NS}-bar b-bar"><div class="${NS}-fill b-fill"></div></div></div>
                <div class="${NS}-ctl"><button class="play b-play">${ICON.play}</button><button class="b-cue">${L.cue}</button><button class="b-low">${L.low}</button>
                    <label>${L.pitch} <input type="range" class="b-pitch" min="-16" max="16" step="0.1" value="0"><span class="pv b-pv">0.0 %</span></label><span class="pv b-time"></span></div>
                <div class="${NS}-search"><input type="search" placeholder="${L.search}" autocomplete="off"><div class="${NS}-results"></div></div>
            </div>`;
        const q = (s) => d.querySelector(s);
        ui = { aBpm: q('.a-bpm'), aArt: q('.a-art'), aTitle: q('.a-title'), aArtist: q('.a-artist'), aFill: q('.a-fill'), aPlay: q('.a-play'), lowA: q('.a-low'), pitchA: q('.a-pitch'), pvA: q('.a-pv'),
               fader: q(`.${NS}-fader`), auto: q('.x-auto'), dur: q('.x-dur'),
               bBpm: q('.b-bpm'), bArt: q('.b-art'), bTitle: q('.b-title'), bArtist: q('.b-artist'), bFill: q('.b-fill'), bPlay: q('.b-play'), lowB: q('.b-low'), pitchB: q('.b-pitch'), pvB: q('.b-pv'), bTime: q('.b-time'), bOpen: q('.b-open'),
               search: q(`.${NS}-search input`), results: q(`.${NS}-results`) };
        // A
        ui.aPlay.addEventListener('click', () => $(SEL.play)?.click());
        let cueA = 0; q('.a-cue').addEventListener('click', (e) => { const m = A()?.media; if (!m) return; if (e.shiftKey) cueA = m.currentTime; else m.currentTime = cueA; });
        q('.a-cue').title = 'Clic : aller au repère · Maj+clic : poser le repère';
        ui.lowA.addEventListener('click', () => { X.lowA = !X.lowA; applyFader(); });
        ui.pitchA.addEventListener('input', () => { const p = parseFloat(ui.pitchA.value); ui.pvA.textContent = `${p.toFixed(1)} %`; A()?.setRate(1 + p / 100); });
        q('.a-bar').addEventListener('click', (e) => { const m = A()?.media; if (!m?.duration) return; const r = e.currentTarget.getBoundingClientRect(); m.currentTime = m.duration * (e.clientX - r.left) / r.width; });
        // centre
        ui.fader.addEventListener('input', () => { X.pos = parseFloat(ui.fader.value); applyFader(); });
        q('.x-sync').addEventListener('click', sync);
        ui.auto.addEventListener('click', () => autoMix(parseInt(ui.dur.value, 10)));
        // B
        ui.bPlay.addEventListener('click', () => { if (!B.el?.src) return; if (B.el.paused) { ensureB(); B.el.play().catch(() => {}); } else B.el.pause(); });
        q('.b-cue').addEventListener('click', (e) => { if (!B.el) return; if (e.shiftKey) B.cue = B.el.currentTime; else B.el.currentTime = B.cue; });
        q('.b-cue').title = 'Clic : aller au repère · Maj+clic : poser le repère';
        ui.lowB.addEventListener('click', () => { B.lowKill = !B.lowKill; applyFader(); });
        ui.pitchB.addEventListener('input', () => { B.pitch = parseFloat(ui.pitchB.value); if (B.el) B.el.playbackRate = 1 + B.pitch / 100; ui.pvB.textContent = `${B.pitch.toFixed(1)} %`; });
        q('.b-bar').addEventListener('click', (e) => { if (!B.el?.duration) return; const r = e.currentTarget.getBoundingClientRect(); B.el.currentTime = B.el.duration * (e.clientX - r.left) / r.width; });
        let deb; ui.search.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(searchB, 250); });
        ui.search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { ui.results.style.display = 'none'; ui.search.blur(); } });
        return d;
    }
    async function searchB() {
        const q = ui.search.value.trim();
        if (q.length < 2) { ui.results.style.display = 'none'; return; }
        let list;
        if (/^https?:\/\/soundcloud\.com\//.test(q)) { const tr = await S().api(`/resolve?url=${encodeURIComponent(q)}`).catch(() => null); list = tr?.kind === 'track' ? [tr] : []; }
        else { const r = await S().api(`/search/tracks?q=${encodeURIComponent(q)}&limit=8`).catch(() => null); list = r?.collection || []; }
        ui.results.innerHTML = list.map((t, i) => `<div data-i="${i}"><span style="${t.artwork_url ? `background-image:url('${t.artwork_url}')` : ''}"></span>${esc(t.title)}<em>${esc(t.user?.username || '')} · ${fmt((t.full_duration || t.duration) / 1000)}</em></div>`).join('');
        ui.results.style.display = list.length ? 'block' : 'none';
        ui.results.querySelectorAll('[data-i]').forEach((el) => el.addEventListener('click', () => { ui.results.style.display = 'none'; ui.search.value = ''; loadB(list[+el.dataset.i]); }));
    }
    function renderA() {
        if (!ui) return;
        const a = A(), m = a?.media;
        ui.aTitle.textContent = $(SEL.title)?.title || $(SEL.title)?.textContent?.trim() || '';
        ui.aArtist.textContent = $(SEL.artist)?.textContent?.trim() || '';
        const art = ($(SEL.art)?.style.backgroundImage || '').match(/url\("?(.*?)"?\)/); ui.aArt.style.backgroundImage = art ? `url("${art[1].replace(/-t\d+x\d+\./, '-t200x200.')}")` : '';
        ui.aPlay.innerHTML = $(SEL.play)?.classList.contains('playing') ? ICON.pause : ICON.play;
        ui.aFill.style.width = m?.duration ? `${(m.currentTime / m.duration) * 100}%` : '0';
        const r = a?.analysis; ui.aBpm.textContent = r ? `${r.bpm} BPM · ${r.key}${r.mode === 'minor' ? 'm' : ''}` : '–';
        const p = ((a?.rate || 1) - 1) * 100; if (document.activeElement !== ui.pitchA) { ui.pitchA.value = p; ui.pvA.textContent = `${p.toFixed(1)} %`; }
    }
    function renderB() {
        if (!ui || !B.el) return;
        ui.bPlay.innerHTML = B.el.paused ? ICON.play : ICON.pause;
        ui.bFill.style.width = B.el.duration ? `${(B.el.currentTime / B.el.duration) * 100}%` : '0';
        ui.bTime.textContent = B.el.duration ? `${fmt(B.el.currentTime)} / ${fmt(B.el.duration)}` : '';
        ui.bBpm.textContent = B.bpm?.bpm ? `${B.bpm.bpm} BPM` : (B.el.paused ? '–' : '…');
    }
    let raf = 0;
    const loop = () => { renderA(); renderB(); raf = requestAnimationFrame(loop); };

    function closeDock() { if (dock) { cancelAnimationFrame(raf); dock.remove(); dock = null; btn?.classList.remove('m-on'); } }
    window.__sceDj = Object.freeze({ close: closeDock });
    function toggle() {
        if (dock) { closeDock(); return; }
        A()?.closePanel();
        if (!$(`#${NS}-styles`)) { const s = document.createElement('style'); s.id = `${NS}-styles`; s.textContent = CSS; document.head.appendChild(s); }
        A()?.ensure();
        dock = buildDock(); document.body.appendChild(dock); btn?.classList.add('m-on');
        applyFader(); loop();
    }
    function mount() {
        if (btn?.isConnected) return;
        const volume = $(SEL.volume); if (!volume) return;
        if (!$(`#${NS}-styles`)) { const s = document.createElement('style'); s.id = `${NS}-styles`; s.textContent = CSS; document.head.appendChild(s); }
        btn = document.createElement('button'); btn.type = 'button'; btn.className = `${NS}-btn sc-mr-1x`; btn.title = L.tip;
        btn.innerHTML = `<div><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="8" r="3.25"/><circle cx="11" cy="8" r="3.25"/><circle cx="5" cy="8" r=".8" fill="currentColor"/><circle cx="11" cy="8" r=".8" fill="currentColor"/></svg></div>`;
        btn.addEventListener('click', toggle);
        volume.parentElement.insertBefore(btn, volume);
        if (dock) btn.classList.add('m-on');
    }
    new MutationObserver(() => { if (!btn?.isConnected) mount(); }).observe(document.body, { childList: true, subtree: true });
    mount();
})();
