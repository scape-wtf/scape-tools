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
    render(events, sources) {
        if (sources &&
            (sources.length > 16 ||
                sources.some(s => typeof s.id !== 'string' ||
                    s.id.length > 256 ||
                    !Number.isFinite(s.gain) ||
                    s.gain < 0 ||
                    s.gain > 1 ||
                    !Number.isFinite(s.pan) ||
                    Math.abs(s.pan) > 1)))
            throw new Error('Invalid audio source spatial state');
        if (events.length > 8)
            throw new Error('Audio bus event limit exceeded');
        for (const event of events) {
            if (!Number.isSafeInteger(event.at) ||
                event.at < this.frame ||
                event.at > this.frame + N + 4800)
                throw new Error('Audio bus event is outside its scheduling window');
            if (event.sound.duration > 3 || event.sound.effects?.length)
                throw new Error('Audio bus strikes must be dry and at most three seconds');
            if (this.strikes.length >= 12)
                continue;
            if (event.source !== undefined &&
                (typeof event.source !== 'string' ||
                    event.source.length > 256 ||
                    !event.spatial ||
                    !Number.isFinite(event.spatial.gain) ||
                    event.spatial.gain < 0 ||
                    event.spatial.gain > 1 ||
                    !Number.isFinite(event.spatial.pan) ||
                    Math.abs(event.spatial.pan) > 1))
                throw new Error('Invalid audio strike source');
            const rendered = renderGizmoSynth(event.sound);
            const gain = event.source !== undefined ? event.spatial.gain : 1;
            const pan = event.source !== undefined ? event.spatial.pan : 0;
            this.strikes.push({
                at: event.at,
                samples: rendered.samples,
                source: event.source,
                gain,
                pan,
                targetGain: gain,
                targetPan: pan,
                remaining: 0,
            });
        }
        const dry = [new Float32Array(N), new Float32Array(N)];
        for (const strike of this.strikes) {
            if (sources && strike.source !== undefined) {
                const source = sources.find(s => s.id === strike.source);
                const gain = source?.gain ?? 0;
                const pan = source?.pan ?? strike.pan;
                if (gain !== strike.targetGain || pan !== strike.targetPan) {
                    strike.targetGain = gain;
                    strike.targetPan = pan;
                    strike.remaining = GIZMO_BUS_RATE * 0.25;
                }
            }
            for (let i = Math.max(0, strike.at - this.frame); i < N; i++) {
                const source = this.frame + i - strike.at;
                if (source >= strike.samples[0].length)
                    break;
                if (strike.remaining > 0) {
                    strike.gain += (strike.targetGain - strike.gain) / strike.remaining;
                    strike.pan += (strike.targetPan - strike.pan) / strike.remaining--;
                }
                // Rotate the existing stereo image toward the listener-relative direction.
                // Preserve authored stereo offsets; apply host proximity exactly once.
                const angle = (Math.abs(strike.pan) * Math.PI) / 2;
                const left = strike.samples[0][source], right = strike.samples[1][source];
                const gain = (strike.gain * this.bus.gain) / Math.sqrt(1 + Math.sin(angle));
                dry[0][i] +=
                    (strike.pan >= 0 ? left * Math.cos(angle) : left + right * Math.sin(angle)) * gain;
                dry[1][i] +=
                    (strike.pan <= 0 ? right * Math.cos(angle) : right + left * Math.sin(angle)) * gain;
            }
        }
        const output = dry.map(data => data.slice());
        if (this.bus.delay) {
            const d = this.bus.delay;
            for (let i = 0; i < N; i++) {
                const absolute = this.frame + i, index = absolute % 100000;
                const seconds = d.time +
                    (d.modulation
                        ? Math.sin((2 * Math.PI * d.modulation.frequency * absolute) / GIZMO_BUS_RATE) *
                            d.modulation.depth
                        : 0);
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
                this.compression +=
                    (target - this.compression) * (1 - Math.exp(-1 / (seconds * GIZMO_BUS_RATE)));
                for (let channel = 0; channel < 2; channel++)
                    output[channel][i] *= this.compression * curve.makeup;
            }
        }
        this.frame += N;
        this.strikes = this.strikes.filter(strike => strike.at + strike.samples[0].length > this.frame &&
            (strike.targetGain > 0 || strike.remaining > 0));
        for (const channel of output)
            for (let i = 0; i < N; i++) {
                if (!Number.isFinite(channel[i]))
                    throw new Error('Audio bus produced invalid samples');
                channel[i] = Math.max(-1, Math.min(1, channel[i]));
            }
        return output;
    }
}
/** Listening prototype: render a complete source-local strike with bounded effect tails.
 * Effects follow the emitter. This does not reproduce a shared nonlinear bus compressor.
 */
export function renderGizmoSequenceClip(sound, bus) {
    const renderer = new GizmoSequenceRenderer(bus);
    const first = renderer.render([{ at: 0, sound }]);
    const delayTail = bus.delay
        ? bus.delay.time *
            (bus.delay.feedback > 0 ? Math.ceil(Math.log(0.0001) / Math.log(bus.delay.feedback)) : 1)
        : 0;
    const frames = Math.ceil(Math.min(12, sound.duration + Math.max(delayTail, bus.reverb?.duration ?? 0) + 0.1) *
        GIZMO_BUS_RATE);
    const samples = [new Float32Array(frames), new Float32Array(frames)];
    for (let at = 0; at < frames; at += N) {
        const block = at === 0 ? first : renderer.render([]);
        for (let c = 0; c < 2; c++)
            samples[c].set(block[c].subarray(0, Math.min(N, frames - at)), at);
    }
    // Bound very long feedback tails without an abrupt endpoint.
    for (let i = Math.max(0, frames - 960); i < frames; i++)
        for (const c of samples)
            c[i] *= (frames - 1 - i) / 960;
    return { rate: GIZMO_BUS_RATE, duration: frames / GIZMO_BUS_RATE, samples };
}
