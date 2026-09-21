/*
 * Enhancer for SoundCloud - Audio analysis module.
 *
 * The interface stays small: create an analyser bound to an audio graph, then
 * attach it and read its current result. The FFT, BPM, key, cache, and pacing
 * implementation stays behind that interface.
 */
(() => {
    'use strict';

    const IDLE_MS = 500;
    const FRAME_MS = 20;
    const HISTORY_S = 40;
    const BPM_MIN = 60;
    const BPM_MAX = 200;
    const DB_TO_AMP = Math.LN10 / 20;
    const VERSION = 4;
    const PREFIX = 'sce:analysis:';
    const NOTES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
    const CAMELOT = Object.freeze({
        major: Object.freeze({ C: '8B', 'C♯': '3B', D: '10B', 'E♭': '5B', E: '12B', F: '7B', 'F♯': '2B', G: '9B', 'A♭': '4B', A: '11B', 'B♭': '6B', B: '1B' }),
        minor: Object.freeze({ C: '5A', 'C♯': '12A', D: '7A', 'E♭': '2A', E: '9A', F: '4A', 'F♯': '11A', G: '6A', 'A♭': '1A', A: '8A', 'B♭': '3A', B: '10A' }),
    });
    const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

    const defaultTrack = () => document.querySelector('.playbackSoundBadge__titleLink')?.getAttribute('href')?.split('?')[0] || null;
    const camelot = (keyOrResult, mode) => {
        const key = typeof keyOrResult === 'object' ? keyOrResult?.key : keyOrResult;
        const resultMode = typeof keyOrResult === 'object' ? keyOrResult?.mode : mode;
        return CAMELOT[resultMode]?.[key] || null;
    };

    function purgeLegacyCache(storage) {
        try {
            if (!storage || typeof storage.key !== 'function') return;
            for (let i = storage.length - 1; i >= 0; i--) {
                const key = storage.key(i);
                if (key?.startsWith(PREFIX) && key.includes('?')) storage.removeItem(key);
            }
        } catch {}
    }

    function create(options = {}) {
        const graph = options.graph;
        const settings = options.settings || (() => ({ rate: 1 }));
        const storage = options.storage || localStorage;
        const currentTrack = options.currentTrack || defaultTrack;
        const analysisVisible = options.analysisVisible || (() => true);
        const enabled = options.enabled || (() => true);
        const render = options.render || (() => {});
        const listeningLabel = options.listeningLabel || 'listening...';
        const timers = options.timers || { set: setInterval, clear: clearInterval };
        let timer = null;
        let prevMag = null;
        let spareMag = null;
        let flux = [];
        let chroma = new Float64Array(12);
        let frames = 0;
        let tonalFrames = 0;
        let trackKey = null;
        let result = null;
        let liveTrack = null;
        let lastTrackCheck = 0;
        let pace = 0;
        const frameChroma = new Float64Array(12);

        purgeLegacyCache(storage);

        const cacheGet = (key) => {
            try {
                const value = JSON.parse(storage.getItem(PREFIX + key));
                return value?.version === VERSION ? value : null;
            } catch { return null; }
        };
        const cacheSet = (key, value) => {
            try { storage.setItem(PREFIX + key, JSON.stringify({ ...value, version: VERSION })); } catch {}
        };
        const setPace = (ms) => {
            if (pace === ms) return;
            pace = ms;
            timers.clear(timer);
            timer = timers.set(tick, ms);
        };
        function reset() {
            prevMag = null;
            flux = [];
            chroma = new Float64Array(12);
            frames = 0;
            tonalFrames = 0;
            result = null;
        }
        function collectChroma(mag) {
            frameChroma.fill(0);
            const hz = graph.ctx.sampleRate / graph.an.fftSize;
            const speed = graph.el.preservesPitch === false ? graph.el.playbackRate : 1;
            const lo = Math.max(3, Math.ceil(110 * speed / hz));
            const hi = Math.min(mag.length - 4, Math.floor(1800 * speed / hz));
            let peak = -Infinity, power = 0, logPower = 0, count = 0;
            for (let i = lo; i <= hi; i++) {
                const db = Number.isFinite(mag[i]) ? mag[i] : -120;
                peak = Math.max(peak, db);
                power += Math.exp(db * 2 * DB_TO_AMP);
                logPower += db * 2 * DB_TO_AMP;
                count++;
            }
            if (!count || peak < -80 || Math.exp(logPower / count) / (power / count) > 0.35) return;
            for (let i = lo; i <= hi; i++) {
                const left = mag[i - 1], db = mag[i], right = mag[i + 1];
                if (!Number.isFinite(db) || db < peak - 35 || db <= left || db < right) continue;
                if (db - Math.max(mag[i - 3], mag[i + 3]) < 6) continue;
                const den = left - 2 * db + right;
                const offset = Number.isFinite(den) && den ? Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / den)) : 0;
                const midi = 69 + 12 * Math.log2((i + offset) * hz / speed / 440);
                const note = Math.round(midi);
                const weight = Math.exp((db - peak) * DB_TO_AMP / 2);
                frameChroma[((note % 12) + 12) % 12] += weight;
            }
            const total = frameChroma.reduce((a, b) => a + b, 0);
            if (total) {
                tonalFrames++;
                for (let i = 0; i < 12; i++) chroma[i] += frameChroma[i] / total;
            }
        }
        function tick() {
            const el = graph.el;
            if (!el || el.paused || !analysisVisible() || !enabled()) { setPace(IDLE_MS); return; }
            const now = Date.now();
            if (now - lastTrackCheck >= 480 || trackKey === null) { lastTrackCheck = now; liveTrack = currentTrack(); }
            const key = liveTrack;
            if (key !== trackKey) {
                trackKey = key;
                reset();
                const cached = key && cacheGet(key);
                if (cached) result = { ...cached, cached: true };
                render();
            }
            if (result?.cached) { setPace(IDLE_MS); return; }
            setPace(FRAME_MS);
            const an = graph.an, n = an.frequencyBinCount;
            const mag = spareMag && spareMag.length === n ? spareMag : new Float32Array(n);
            an.getFloatFrequencyData(mag);
            collectChroma(mag);
            let spectralFlux = 0;
            for (let i = 1; i < n; i++) {
                const value = Math.exp(mag[i] * DB_TO_AMP);
                if (prevMag) {
                    const delta = value - prevMag[i];
                    if (delta > 0) spectralFlux += delta;
                }
                mag[i] = value;
            }
            spareMag = prevMag;
            prevMag = mag;
            flux.push(spectralFlux);
            if (flux.length > HISTORY_S * 1000 / FRAME_MS) flux.shift();
            frames++;
            if (frames % 50 === 0 && flux.length >= 300) {
                const next = estimate();
                result = { ...next, bpm: next.bpm ?? result?.bpm ?? null };
                render();
                if (frames >= 1500 && next.conf > 0.35 && next.bpm && next.key && key) {
                    cacheSet(key, { bpm: next.bpm, key: next.key, mode: next.mode, conf: next.conf, keyConf: next.keyConf });
                    result.cached = true;
                    prevMag = spareMag = null;
                    flux = [];
                }
            }
        }
        function estimate() {
            const frameCount = flux.length;
            const mean = flux.reduce((a, b) => a + b, 0) / frameCount;
            const centered = flux.map((value) => value - mean);
            const fps = 1000 / FRAME_MS;
            const lagMin = Math.floor(fps * 60 / BPM_MAX);
            const lagMax = Math.ceil(fps * 60 / BPM_MIN);
            const ac = new Float64Array(lagMax + 2);
            for (let lag = lagMin; lag <= lagMax + 1; lag++) {
                let sum = 0;
                for (let i = lag; i < frameCount; i++) sum += centered[i] * centered[i - lag];
                ac[lag] = sum / (frameCount - lag);
            }
            let best = lagMin, bestValue = -Infinity;
            for (let lag = lagMin; lag <= lagMax; lag++) {
                const value = ac[lag] * (1 - 0.15 * Math.abs(Math.log2((fps * 60 / lag) / 128)));
                if (value > bestValue) { bestValue = value; best = lag; }
            }
            const y0 = ac[best - 1] || 0, y1 = ac[best], y2 = ac[best + 1] || 0, den = y0 - 2 * y1 + y2;
            const lag = best + (den ? 0.5 * (y0 - y2) / den : 0);
            let bpm = fps * 60 / lag;
            if (bpm < 90) bpm *= 2;
            else if (bpm < 100) {
                const doubleLag = Math.round(lag / 2);
                if (doubleLag >= lagMin && ac[doubleLag] >= y1 * 0.82) bpm = fps * 60 / doubleLag;
            }
            const ac0 = centered.reduce((a, value) => a + value * value, 0) / frameCount;
            const conf = Math.max(0, Math.min(1, ac0 ? y1 / ac0 : 0));
            const c = Array.from(chroma);
            const chromaMean = c.reduce((a, b) => a + b, 0) / 12;
            let bestKey = 0, bestMode = 'major', bestR = -Infinity, second = -Infinity;
            for (const [mode, profile] of [['major', MAJ], ['minor', MIN]]) {
                const profileMean = profile.reduce((a, b) => a + b, 0) / 12;
                for (let key = 0; key < 12; key++) {
                    let num = 0, d1 = 0, d2 = 0;
                    for (let i = 0; i < 12; i++) {
                        const a = c[(i + key) % 12] - chromaMean;
                        const b = profile[i] - profileMean;
                        num += a * b;
                        d1 += a * a;
                        d2 += b * b;
                    }
                    const r = num / Math.sqrt(d1 * d2 || 1);
                    if (r > bestR) { second = bestR; bestR = r; bestKey = key; bestMode = mode; }
                    else if (r > second) second = r;
                }
            }
            bpm = bpm / (settings().rate || 1);
            const peakChroma = Math.max(...c);
            const tonalNotes = c.filter((value) => value > peakChroma * 0.15).length;
            return {
                bpm: conf >= 0.2 ? Math.round(bpm) : null,
                key: tonalFrames >= 150 && tonalNotes >= 3 && bestR >= 0.6 && bestR - second >= 0.05 ? NOTES[bestKey] : null,
                mode: bestMode,
                conf,
                keyConf: Math.max(0, bestR - second),
            };
        }
        function label(item = result) {
            if (!item) return listeningLabel;
            const code = item.key ? camelot(item) : '–';
            return `${item.bpm ?? '–'} BPM · ${item.key ? item.key + (item.mode === 'minor' ? 'm' : '') : '–'} · ${code}`;
        }
        return Object.freeze({
            attach() { pace = 0; setPace(IDLE_MS); },
            tick,
            label,
            camelot,
            get result() { return result; },
        });
    }

    window.__sceAudioAnalysis = Object.freeze({ create, camelot, version: VERSION });
})();
