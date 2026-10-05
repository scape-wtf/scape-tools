import { gizmoBusError } from './sequence.js';
import { renderGizmoSynth } from './synthesis.js';
import { fft, noiseImpulse } from './synthesisConvolution.js';
import { createCompressorCurve } from './compressorCurve.js';
export const GIZMO_BUS_FRAMES = 4096;
export const GIZMO_BUS_RATE = 48000;
const N = GIZMO_BUS_FRAMES, SIZE = N * 2;
/** Uniform partitioned convolution: persistent overlap/history, bounded by a three-second impulse. */
class Convolver {
    kernels = [];
    history = [];
    overlap = new Float64Array(N);
    cursor = 0;
    constructor(impulse) {
        for (let at = 0; at < impulse.length; at += N) {
            const r = new Float64Array(SIZE), i = new Float64Array(SIZE);
            r.set(impulse.subarray(at, at + N));
            fft(r, i);
            this.kernels.push({ r, i });
            this.history.push({ r: new Float64Array(SIZE), i: new Float64Array(SIZE) });
        }
    }
    process(input) {
        const slot = this.history[this.cursor];
        slot.r.fill(0);
        slot.i.fill(0);
        slot.r.set(input);
        fft(slot.r, slot.i);
        const r = new Float64Array(SIZE), im = new Float64Array(SIZE);
        for (let k = 0; k < this.kernels.length; k++) {
            const h = this.history[(this.cursor - k + this.history.length) % this.history.length], ir = this.kernels[k];
            for (let j = 0; j < SIZE; j++) {
                r[j] += h.r[j] * ir.r[j] - h.i[j] * ir.i[j];
                im[j] += h.r[j] * ir.i[j] + h.i[j] * ir.r[j];
            }
        }
        fft(r, im, true);
        const output = new Float32Array(N);
        for (let j = 0; j < N; j++) {
            output[j] = r[j] + this.overlap[j];
            this.overlap[j] = r[j + N];
        }
        this.cursor = (this.cursor + 1) % this.history.length;
        return output;
    }
}
/** One shared DSP state per ambient definition. Hosts run it only in a worker. */
export class GizmoSequenceRenderer {
    bus;
    frame = 0;
    strikes = [];
    convolution = [];
    delays = [new Float32Array(100000), new Float32Array(100000)];
    compression = 1;
    compressorCurve;
    constructor(bus) {
        this.bus = bus;
        const error = gizmoBusError(bus);
        if (error)
            throw new Error(error);
        if (bus.compressor)
            this.compressorCurve = createCompressorCurve(bus.compressor);
        if (bus.reverb)
            this.convolution = noiseImpulse(bus.reverb.duration, bus.reverb.decay, bus.reverb.seed, GIZMO_BUS_RATE).map(i => new Convolver(i));
    }
    render(events) {
        if (events.length > 8)
            throw new Error('Audio bus event limit exceeded');
        for (const event of events) {
            if (!Number.isSafeInteger(event.at) || event.at < this.frame || event.at > this.frame + N + 4800)
                throw new Error('Audio bus event is outside its scheduling window');
            if (event.sound.duration > 3 || event.sound.effects?.length)
                throw new Error('Audio bus strikes must be dry and at most three seconds');
            if (this.strikes.length >= 12)
                continue;
            const rendered = renderGizmoSynth(event.sound);
            this.strikes.push({ at: event.at, samples: rendered.samples });
        }
        const dry = [new Float32Array(N), new Float32Array(N)];
        for (const strike of this.strikes)
            for (let i = Math.max(0, strike.at - this.frame); i < N; i++) {
                const source = this.frame + i - strike.at;
                if (source >= strike.samples[0].length)
                    break;
                for (let c = 0; c < 2; c++)
                    dry[c][i] += strike.samples[c][source] * this.bus.gain;
            }
        const output = dry.map(data => data.slice());
        if (this.bus.delay) {
            const d = this.bus.delay;
            for (let i = 0; i < N; i++) {
                const absolute = this.frame + i, index = absolute % 100000;
                const seconds = d.time + (d.modulation ? Math.sin(2 * Math.PI * d.modulation.frequency * absolute / GIZMO_BUS_RATE) * d.modulation.depth : 0);
                const at = (index - seconds * GIZMO_BUS_RATE + 100000) % 100000, left = Math.floor(at), fraction = at - left;
                for (let c = 0; c < 2; c++) {
                    const buffer = this.delays[c], wet = buffer[left] + (buffer[(left + 1) % 100000] - buffer[left]) * fraction;
                    buffer[index] = dry[c][i] + wet * d.feedback;
                    output[c][i] += wet * d.wet;
                }
            }
        }
        if (this.bus.reverb)
            for (let c = 0; c < 2; c++) {
                const wet = this.convolution[c].process(dry[c]);
                for (let i = 0; i < N; i++)
                    output[c][i] += wet[i] * this.bus.reverb.wet;
            }
        const compressor = this.bus.compressor;
        if (compressor) {
            const c = compressor, curve = this.compressorCurve;
            // Apply one gain envelope to the combined stereo bus, including overlapping tails.
            for (let i = 0; i < N; i++) {
                const peak = Math.max(Math.abs(output[0][i]), Math.abs(output[1][i]));
                const target = curve.gain(peak), seconds = target < this.compression ? c.attack : c.release;
                this.compression += (target - this.compression) * (1 - Math.exp(-1 / (seconds * GIZMO_BUS_RATE)));
                for (let channel = 0; channel < 2; channel++)
                    output[channel][i] *= this.compression * curve.makeup;
            }
        }
        this.frame += N;
        this.strikes = this.strikes.filter(strike => strike.at + strike.samples[0].length > this.frame);
        for (const channel of output)
            for (let i = 0; i < N; i++) {
                if (!Number.isFinite(channel[i]))
                    throw new Error('Audio bus produced invalid samples');
                channel[i] = Math.max(-1, Math.min(1, channel[i]));
            }
        return output;
    }
}
