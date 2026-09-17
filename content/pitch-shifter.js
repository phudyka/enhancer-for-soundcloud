/* Small two-grain pitch shifter shared by live playback and local exports. */
(() => {
    'use strict';
    const windowSize = 8192;
    const ringSize = 32768;
    function processor(channels, semitones) {
        const ring = Array.from({ length: channels }, () => new Float32Array(ringSize));
        let position = 0;
        let phase = 0;
        let ratio = 2 ** (semitones / 12);
        const read = (data, delay) => {
            const index = (position - delay + ringSize) % ringSize;
            const first = Math.floor(index);
            return data[first] * (1 - (index - first)) + data[(first + 1) % ringSize] * (index - first);
        };
        return {
            setSemitones(value) { ratio = 2 ** (value / 12); },
            process(input, output) {
                for (let i = 0; i < output[0].length; i++) {
                    for (let ch = 0; ch < channels; ch++) ring[ch][position] = input[ch]?.[i] || 0;
                    const opposite = (phase + 0.5) % 1;
                    const weightA = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
                    const weightB = 1 - weightA;
                    for (let ch = 0; ch < channels; ch++) {
                        const a = read(ring[ch], 128 + phase * windowSize);
                        const b = read(ring[ch], 128 + opposite * windowSize);
                        output[ch][i] = a * weightA + b * weightB;
                    }
                    position = (position + 1) % ringSize;
                    phase = (phase + (1 - ratio) / windowSize + 1) % 1;
                }
            },
        };
    }
    function live(ctx) {
        if (!ctx.createScriptProcessor) return null;
        const node = ctx.createScriptProcessor(2048, 2, 2);
        const shift = processor(2, 0);
        node.onaudioprocess = (event) => shift.process(
            [event.inputBuffer.getChannelData(0), event.inputBuffer.getChannelData(1)],
            [event.outputBuffer.getChannelData(0), event.outputBuffer.getChannelData(1)]);
        return { node, setSemitones: (value) => shift.setSemitones(value) };
    }
    function render(ctx, audio, semitones) {
        if (!semitones) return audio;
        const channels = Math.min(2, audio.numberOfChannels);
        const output = ctx.createBuffer(channels, audio.length, audio.sampleRate);
        const shift = processor(channels, semitones);
        const input = Array.from({ length: channels }, (_, ch) => audio.getChannelData(ch));
        const result = Array.from({ length: channels }, (_, ch) => output.getChannelData(ch));
        shift.process(input, result);
        return output;
    }
    window.__scePitchShifter = { live, render };
})();
