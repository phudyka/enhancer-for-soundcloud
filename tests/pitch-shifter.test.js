const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function buffer(length, sampleRate = 44100) {
    const data = new Float32Array(length);
    return { numberOfChannels: 1, length, sampleRate, getChannelData: () => data };
}

function energyAt(samples, frequency, sampleRate) {
    const start = Math.floor(sampleRate / 2);
    let real = 0, imaginary = 0;
    for (let i = start; i < samples.length; i++) {
        const angle = 2 * Math.PI * frequency * i / sampleRate;
        real += samples[i] * Math.cos(angle);
        imaginary += samples[i] * Math.sin(angle);
    }
    return real * real + imaginary * imaginary;
}

test('independent pitch changes a tone without changing its duration', () => {
    const window = {};
    vm.runInNewContext(fs.readFileSync('content/pitch-shifter.js', 'utf8'), { window, Float32Array, Math });
    const context = { createBuffer: (channels, length, sampleRate) => {
        assert.equal(channels, 1);
        return buffer(length, sampleRate);
    } };
    const input = buffer(44100);
    const samples = input.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(2 * Math.PI * 440 * i / 44100);
    assert.equal(window.__scePitchShifter.render(context, input, 0), input);
    const shifted = window.__scePitchShifter.render(context, input, 12);
    assert.equal(shifted.length, input.length);
    assert.ok(energyAt(shifted.getChannelData(0), 880, 44100) > energyAt(shifted.getChannelData(0), 440, 44100) * 20);
});
