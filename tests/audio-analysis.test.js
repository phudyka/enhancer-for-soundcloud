const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadAudioAnalysis(context) {
    vm.runInNewContext(fs.readFileSync('content/audio-analysis.js', 'utf8'), context);
    return context.window.__sceAudioAnalysis;
}

// Exercise the production analysis module with spectra at the AnalyserNode boundary.
function analyser({ sampleRate = 48000, rate = 1, preservePitch = true, pitchSemitones = 0, cache } = {}) {
    const values = new Map(cache ? [['sce:analysis:/artist/track', JSON.stringify(cache)]] : []);
    let spectrum, frame = 0;
    const fftSize = 8192;
    const graph = { ctx: { sampleRate }, el: { paused: false, playbackRate: rate, preservesPitch: preservePitch }, an: {
        fftSize, frequencyBinCount: fftSize / 2, getFloatFrequencyData(out) { out.set(typeof spectrum === 'function' ? spectrum(frame++) : spectrum); },
    } };
    const cfg = { rate, preservePitch, pitchSemitones };
    const storage = {
        get length() { return values.size; },
        key(index) { return Array.from(values.keys())[index] || null; },
        getItem: (key) => values.get(key) || null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
    };
    const context = { window: {}, localStorage: storage, document: { querySelector: () => ({ getAttribute: () => '/artist/track' }) } };
    const analysisModule = loadAudioAnalysis(context);
    const analysis = analysisModule.create({
        graph,
        settings: () => cfg,
        storage,
        currentTrack: () => '/artist/track',
        analysisVisible: () => true,
        enabled: () => true,
        render() {},
        timers: { set() {}, clear() {} },
    });
    return { cfg, graph, values, fftSize, sampleRate, run(data, frames = 350) {
        spectrum = data;
        for (let i = 0; i < frames; i++) analysis.tick();
        return analysis.result;
    } };
}

// Sample an analytic Blackman-window spectrum of sinusoidal notes; no production DSP reused.
// AnalyserNode window: https://www.w3.org/TR/webaudio-1.0/#fft-windowing-and-smoothing-over-time
function spectrum(a, notes, shift = 0) {
    const out = new Float32Array(a.fftSize / 2);
    const sinc = (x) => Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    const blackman = (x) => 0.42 * sinc(x) + 0.25 * (sinc(x - 1) + sinc(x + 1)) + 0.04 * (sinc(x - 2) + sinc(x + 2));
    for (let i = 0; i < out.length; i++) {
        let power = 1e-12;
        for (const [midi, amplitude] of notes) {
            const bin = 440 * 2 ** ((midi + shift - 69) / 12) * a.fftSize / a.sampleRate;
            power += (amplitude * blackman(i - bin)) ** 2;
        }
        out[i] = 10 * Math.log10(power);
    }
    return out;
}

for (const sampleRate of [44100, 48000]) {
    test(`flat broadband spectrum has no key at ${sampleRate} Hz`, () => {
        const a = analyser({ sampleRate });
        const result = a.run(new Float32Array(a.fftSize / 2).fill(-40));
        assert.equal(result.key, null);
    });
    test(`recognizes every major and minor triad at ${sampleRate} Hz`, () => {
        const names = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
        for (const mode of ['major', 'minor']) for (let root = 0; root < 12; root++) {
            const a = analyser({ sampleRate });
            const notes = [[60 + root, 1], [60 + root + (mode === 'major' ? 4 : 3), 0.8], [67 + root, 0.7]];
            const result = a.run(spectrum(a, notes));
            assert.equal(result.key, names[root], `${mode} ${names[root]}`);
            assert.equal(result.mode, mode, `${mode} ${names[root]}`);
        }
    });
}

test('a single sustained note does not determine major or minor', () => {
    const a = analyser();
    assert.equal(a.run(spectrum(a, [[60, 1]])).key, null);
});

test('effect transposition does not alter the original key stored for harmonic matching', () => {
    const a = analyser({ pitchSemitones: 5 });
    assert.equal(a.run(spectrum(a, [[60, 1], [64, 0.8], [67, 0.7]])).key, 'C');
});

test('non-integer speed detuning is corrected before chroma accumulation', () => {
    const a = analyser({ rate: 0.85, preservePitch: false });
    const result = a.run(spectrum(a, [[60, 1], [64, 0.8], [67, 0.7]], 12 * Math.log2(0.85)));
    assert.equal(result.key, 'C');
    assert.equal(result.mode, 'major');
});

test('old cached tonalities are reanalysed', () => {
    const a = analyser({ cache: { version: 3, key: 'B♭', mode: 'minor', bpm: 128, conf: 0.9 } });
    assert.equal(a.run(spectrum(a, [[60, 1], [64, 0.8], [67, 0.7]])).key, 'C');
});


test('silence and broadband noise remain unclassified', () => {
    const a = analyser();
    assert.equal(a.run(new Float32Array(a.fftSize / 2).fill(-Infinity)).key, null);
    let seed = 19;
    const noise = new Float32Array(a.fftSize / 2);
    assert.equal(a.run(() => {
        for (let i = 0; i < noise.length; i++) {
            seed = (1664525 * seed + 1013904223) >>> 0;
            noise[i] = -40 + 10 * Math.log10(-Math.log((seed + 1) / 4294967297));
        }
        return noise;
    }).key, null);
});

test('a brief tonal transient is insufficient evidence for a track key', () => {
    const a = analyser();
    const chord = spectrum(a, [[60, 1], [64, 0.8], [67, 0.7]]);
    const silence = new Float32Array(a.fftSize / 2).fill(-Infinity);
    assert.equal(a.run((frame) => frame < 5 ? chord : silence).key, null);
});

test('accumulated key survives changes of actual playback rate', () => {
    const a = analyser();
    const notes = [[60, 1], [64, 0.8], [67, 0.7]];
    assert.equal(a.run(spectrum(a, notes)).key, 'C');
    // Deliberately leave cfg unchanged: the source follows the media element.
    a.graph.el.preservesPitch = false;
    a.graph.el.playbackRate = 1.2;
    assert.equal(a.run(spectrum(a, notes, 12 * Math.log2(1.2))).key, 'C');
});

test('a rhythmic chord retains its tempo and caches the original key for harmonic matching', () => {
    const a = analyser({ pitchSemitones: -7 });
    const chord = spectrum(a, [[60, 1], [64, 0.8], [67, 0.7]]);
    const quiet = Float32Array.from(chord, (db) => db - 24);
    const result = a.run((frame) => frame % 25 < 5 ? chord : quiet, 1500);
    assert.equal(result.bpm, 120);
    assert.equal(result.key, 'C');
    assert.equal(result.cached, true);
    const window = {};
    vm.runInNewContext(fs.readFileSync('content/shared.js', 'utf8'), { window, URL,
        localStorage: { getItem: (k) => a.values.get(k) || null } });
    assert.equal(window.__sceShared.harmonic.read('/artist/track').camelot, '8B');
    a.values.set('sce:analysis:/artist/track', JSON.stringify({ version: 3, key: 'B♭', mode: 'minor', bpm: 120 }));
    assert.equal(window.__sceShared.harmonic.read('/artist/track'), null);
});

test('harmonic-rich detuned chords remain recognizable above a noise floor', () => {
    for (const [root, third, key, mode] of [[48, 3, 'C', 'minor'], [58, 3, 'B♭', 'minor'], [54, 4, 'F♯', 'major']]) {
        const a = analyser();
        const notes = [];
        for (const [midi, amplitude] of [[root, 1], [root + third, 0.8], [root + 7, 0.7]]) {
            for (let h = 1; h <= 4; h++) notes.push([midi + 12 * Math.log2(h), amplitude / h]);
        }
        const data = spectrum(a, notes, 0.15);
        for (let i = 0; i < data.length; i++) data[i] = 10 * Math.log10(10 ** (data[i] / 10) + 1e-6);
        const result = a.run(data);
        assert.equal(result.key, key);
        assert.equal(result.mode, mode);
    }
});
