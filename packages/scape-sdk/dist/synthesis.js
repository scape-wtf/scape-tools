import { convolveSignal, noiseImpulse } from './synthesisConvolution.js';
import { effectNumber, effectRecord } from './effectValidation.js';
export const GIZMO_SOUND_RATE = 48000;
function envelopeError(value, path, min, max, duration) {
    if (typeof value === 'number')
        return effectNumber(value, path, min, max);
    if (!Array.isArray(value) || value.length < 2 || value.length > 16)
        return `${path} must be a number or 2–16 envelope points.`;
    let previous = -1;
    for (const [i, point] of value.entries()) {
        const p = `${path}[${i}]`, shape = effectRecord(point, p, ['time', 'value', 'curve']);
        if (shape)
            return shape;
        const error = effectNumber(point.time, `${p}.time`, 0, duration) ?? effectNumber(point.value, `${p}.value`, min, max);
        if (error)
            return error;
        if (i === 0 && point.time !== 0 || point.time <= previous)
            return `${p}.time must start at zero and increase strictly.`;
        if (point.curve !== undefined && !['linear', 'exponential', 'step'].includes(point.curve))
            return `${p}.curve must be linear, exponential or step.`;
        if (point.curve === 'exponential' && i && (point.value <= 0 || value[i - 1].value <= 0))
            return `${p} exponential curves need positive endpoints.`;
        previous = point.time;
    }
    return null;
}
function filterError(value, path) {
    const shape = effectRecord(value, path, ['type', 'frequency', 'q']);
    if (shape)
        return shape;
    const filter = value;
    if (!['lowpass', 'highpass', 'bandpass'].includes(filter.type))
        return `${path}.type must be lowpass, highpass or bandpass.`;
    return effectNumber(filter.frequency, `${path}.frequency`, 20, 16000) ?? effectNumber(filter.q, `${path}.q`, .1, 20);
}
export function gizmoSynthError(value, path = 'sound') {
    const shape = effectRecord(value, path, ['kind', 'duration', 'seed', 'voices', 'effects']);
    if (shape)
        return shape;
    const sound = value;
    if (sound.kind !== 'synth')
        return `${path}.kind must be synth.`;
    const durationError = effectNumber(sound.duration, `${path}.duration`, .005, 10);
    if (durationError)
        return durationError;
    if (sound.seed !== undefined && (!Number.isInteger(sound.seed) || sound.seed < 0 || sound.seed > 0xffffffff))
        return `${path}.seed must be an unsigned 32-bit integer.`;
    if (!Array.isArray(sound.voices) || !sound.voices.length || sound.voices.length > 16)
        return `${path}.voices must contain 1–16 voices.`;
    let work = 0;
    for (const [i, voice] of sound.voices.entries()) {
        const p = `${path}.voices[${i}]`, shape = effectRecord(voice, p, ['wave', 'start', 'duration', 'frequency', 'gain', 'pan', 'filter', 'fade', 'noiseDuration', 'noiseRate']);
        if (shape)
            return shape;
        if (!['sine', 'triangle', 'square', 'sawtooth', 'noise'].includes(voice.wave))
            return `${p}.wave must be sine, triangle, square, sawtooth or noise.`;
        let error = effectNumber(voice.start, `${p}.start`, 0, sound.duration) ?? effectNumber(voice.duration, `${p}.duration`, .005, sound.duration);
        if (error)
            return error;
        if (voice.start + voice.duration > sound.duration + 1e-9)
            return `${p} extends beyond sound.duration.`;
        if (voice.fade !== undefined && (!Array.isArray(voice.fade) || voice.fade.length !== 2 || voice.fade.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > .05)))
            return `${p}.fade must contain two seconds from 0 to .05.`;
        if (voice.noiseDuration !== undefined || voice.noiseRate !== undefined) {
            if (voice.wave !== 'noise')
                return `${p}: noiseDuration/noiseRate require a noise voice.`;
            error = effectNumber(voice.noiseDuration, `${p}.noiseDuration`, .005, 1) ?? effectNumber(voice.noiseRate, `${p}.noiseRate`, .25, 4);
            if (error)
                return error;
        }
        work += voice.duration;
        error = envelopeError(voice.gain, `${p}.gain`, 0, 1, voice.duration)
            ?? (voice.wave !== 'noise' || voice.frequency !== undefined ? envelopeError(voice.frequency, `${p}.frequency`, 20, 16000, voice.duration) : null)
            ?? (voice.pan !== undefined ? effectNumber(voice.pan, `${p}.pan`, -1, 1) : null)
            ?? (voice.filter !== undefined ? filterError(voice.filter, `${p}.filter`) : null);
        if (error)
            return error;
    }
    if (work > 32)
        return `${path}.voices exceeds 32 seconds of combined synthesis work.`;
    if (sound.effects !== undefined && (!Array.isArray(sound.effects) || sound.effects.length > 4))
        return `${path}.effects supports at most four effects.`;
    for (const [i, effect] of (sound.effects ?? []).entries()) {
        const p = `${path}.effects[${i}]`;
        const shape = effectRecord(effect, p, ['type', 'frequency', 'q', 'time', 'feedback', 'decay', 'mix', 'duration', 'seed', 'parallel']);
        if (shape)
            return shape;
        let error;
        if (effect.type === 'delay')
            error = effectRecord(effect, p, ['type', 'time', 'feedback', 'mix', 'parallel'])
                ?? effectNumber(effect.time, `${p}.time`, .005, 2) ?? effectNumber(effect.feedback, `${p}.feedback`, 0, .85) ?? effectNumber(effect.mix, `${p}.mix`, 0, 1);
        else if (effect.type === 'noise-reverb')
            error = effectRecord(effect, p, ['type', 'duration', 'decay', 'seed', 'mix', 'parallel'])
                ?? effectNumber(effect.duration, `${p}.duration`, .01, 3) ?? effectNumber(effect.decay, `${p}.decay`, .1, 8)
                ?? effectNumber(effect.seed, `${p}.seed`, 0, 0xffffffff) ?? (!Number.isInteger(effect.seed) ? `${p}.seed must be an unsigned integer.` : null)
                ?? effectNumber(effect.mix, `${p}.mix`, 0, 1);
        else if (effect.type === 'reverb')
            error = effectRecord(effect, p, ['type', 'decay', 'mix'])
                ?? effectNumber(effect.decay, `${p}.decay`, .1, 3) ?? effectNumber(effect.mix, `${p}.mix`, 0, 1);
        else
            error = filterError(effect, p);
        if (error)
            return error;
        if ('parallel' in effect && typeof effect.parallel !== 'boolean')
            return `${p}.parallel must be boolean.`;
    }
    if ((sound.effects ?? []).filter(effect => effect.type === 'noise-reverb').length > 1)
        return `${path}.effects supports at most one noise-reverb.`;
    return null;
}
function envelope(value) {
    if (typeof value === 'number')
        return () => value;
    let index = 1;
    return time => {
        while (index < value.length && time >= value[index].time)
            index++;
        if (index === value.length)
            return value[value.length - 1].value;
        const left = value[index - 1], right = value[index], fraction = (time - left.time) / (right.time - left.time);
        return right.curve === 'step' ? left.value : right.curve === 'exponential'
            ? left.value * (right.value / left.value) ** fraction : left.value + (right.value - left.value) * fraction;
    };
}
/** Standard biquad coefficients; one independent history per channel/voice. */
function filterSample(filter, rate) {
    const w = 2 * Math.PI * filter.frequency / rate, c = Math.cos(w), alpha = Math.sin(w) / (2 * filter.q), a0 = 1 + alpha;
    const b0 = filter.type === 'lowpass' ? (1 - c) / 2 : filter.type === 'highpass' ? (1 + c) / 2 : alpha;
    const b1 = filter.type === 'lowpass' ? 1 - c : filter.type === 'highpass' ? -(1 + c) : 0;
    const b2 = filter.type === 'bandpass' ? -alpha : b0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return x => { const y = (b0 * x + b1 * x1 + b2 * x2 + 2 * c * y1 - (1 - alpha) * y2) / a0; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}
/** Correct the discontinuity of saw/square oscillators to reduce aliasing. */
function polyBlep(phase, step) {
    if (phase < step) {
        const x = phase / step;
        return x + x - x * x - 1;
    }
    if (phase > 1 - step) {
        const x = (phase - 1) / step;
        return x * x + x + x + 1;
    }
    return 0;
}
/** Deterministic PCM rendering. Hosts run this in a bounded worker, never on the game frame. */
export function renderGizmoSynth(sound) {
    const error = gizmoSynthError(sound);
    if (error)
        throw new Error(error);
    const rate = GIZMO_SOUND_RATE, frames = Math.round(sound.duration * rate);
    const samples = [new Float32Array(frames), new Float32Array(frames)];
    let seed = sound.seed ?? 1;
    for (const voice of sound.voices) {
        const frequency = envelope(voice.frequency ?? 440), gain = envelope(voice.gain);
        const filter = voice.filter ? filterSample(voice.filter, rate) : (x) => x;
        const pan = voice.pan ?? 0, left = Math.cos((pan + 1) * Math.PI / 4), right = Math.sin((pan + 1) * Math.PI / 4);
        const first = Math.round(voice.start * rate), count = Math.min(frames - first, Math.round(voice.duration * rate));
        let phase = 0;
        const noise = voice.noiseDuration === undefined ? null : new Float32Array(Math.ceil(voice.noiseDuration * rate));
        if (noise)
            for (let i = 0; i < noise.length; i++) {
                seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                noise[i] = seed / 0xffffffff * 2 - 1;
            }
        const [fadeIn, fadeOut] = voice.fade ?? [.001, .005];
        for (let i = 0; i < count; i++) {
            const time = i / rate, step = frequency(time) / rate;
            let value;
            if (noise) {
                const at = i * (voice.noiseRate ?? 1), index = Math.floor(at);
                value = index >= noise.length ? 0 : noise[index] + ((noise[index + 1] ?? 0) - noise[index]) * (at - index);
            }
            else if (voice.wave === 'noise') {
                seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                value = seed / 0xffffffff * 2 - 1;
            }
            else if (voice.wave === 'sine')
                value = Math.sin(phase * 2 * Math.PI);
            else if (voice.wave === 'sawtooth')
                value = 2 * phase - 1 - polyBlep(phase, step);
            else if (voice.wave === 'triangle')
                value = 1 - 4 * Math.abs(phase - .5);
            else {
                const square = (phase < .5 ? 1 : -1) + polyBlep(phase, step) - polyBlep((phase + .5) % 1, step);
                value = square;
            }
            phase = (phase + step) % 1;
            // Short edge fades prevent discontinuities, including constant-gain voices.
            value = filter(value) * gain(time) * Math.min(1, fadeIn ? i / (rate * fadeIn) : 1, fadeOut ? (count - 1 - i) / (rate * fadeOut) : 1);
            samples[0][first + i] += value * left;
            samples[1][first + i] += value * right;
        }
    }
    const dry = sound.effects?.some(effect => 'parallel' in effect && effect.parallel) ? samples.map(channel => channel.slice()) : samples;
    for (const effect of sound.effects ?? []) {
        const impulse = effect.type === 'noise-reverb' ? noiseImpulse(effect.duration, effect.decay, effect.seed, rate) : null;
        for (const [channel, data] of samples.entries()) {
            const parallel = 'parallel' in effect && effect.parallel;
            const input = parallel ? dry[channel] : data;
            if (effect.type === 'delay') {
                const delay = Math.round(effect.time * rate), history = new Float32Array(delay);
                for (let i = 0; i < frames; i++) {
                    const at = i % delay, wet = history[at];
                    history[at] = input[i] + wet * effect.feedback;
                    data[i] = data[i] * (parallel ? 1 : 1 - effect.mix) + wet * effect.mix;
                }
            }
            else if (effect.type === 'noise-reverb') {
                const wet = convolveSignal(input, impulse[channel]);
                for (let i = 0; i < frames; i++)
                    data[i] = data[i] * (parallel ? 1 : 1 - effect.mix) + wet[i] * effect.mix;
            }
            else if (effect.type === 'reverb') {
                // Parallel damped combs give a bounded, deterministic diffuse tail on both platforms.
                const taps = [.0297, .0371, .0411, .0437].map(t => {
                    const seconds = t + channel * .0017;
                    return { buffer: new Float32Array(Math.round(seconds * rate)), feedback: 10 ** (-3 * seconds / effect.decay), low: 0 };
                });
                for (let i = 0; i < frames; i++) {
                    let wet = 0;
                    for (const tap of taps) {
                        const at = i % tap.buffer.length, out = tap.buffer[at];
                        tap.low = .6 * out + .4 * tap.low;
                        tap.buffer[at] = data[i] + tap.low * tap.feedback;
                        wet += out * .25;
                    }
                    data[i] = data[i] * (1 - effect.mix) + wet * effect.mix;
                }
            }
            else {
                const process = filterSample(effect, rate);
                for (let i = 0; i < frames; i++)
                    data[i] = process(data[i]);
            }
        }
    }
    for (const data of samples)
        for (let i = 0; i < frames; i++) {
            if (!Number.isFinite(data[i]))
                throw new Error('Sound rendering produced a nonfinite sample.');
            data[i] = Math.max(-1, Math.min(1, data[i])) * Math.min(1, (frames - 1 - i) / (rate * .005));
        }
    return { samples, rate, duration: frames / rate };
}
