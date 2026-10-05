import { effectNumber, effectRecord } from './effectValidation.js';
export function gizmoNoiseSoundError(value, path = 'sound') {
    let error = effectRecord(value, path, [
        'kind',
        'duration',
        'seed',
        'layers',
        'modulation',
        'grains',
        'fade',
    ]);
    if (error)
        return error;
    const v = value;
    if (v.kind !== 'noise')
        return `${path}.kind must be noise.`;
    error =
        effectNumber(v.duration, `${path}.duration`, 0.1, 12) ??
            effectNumber(v.seed, `${path}.seed`, 0, 0xffffffff) ??
            (!Number.isInteger(v.seed) ? `${path}.seed must be an integer.` : null) ??
            effectNumber(v.fade, `${path}.fade`, 0.001, 0.1);
    if (error)
        return error;
    if (!Array.isArray(v.layers) ||
        !v.layers.length ||
        v.layers.length > 8 ||
        v.layers.length * v.duration > 32)
        return `${path}.layers requires 1–8 layers and at most 32 layer-seconds.`;
    for (const [i, layer] of v.layers.entries()) {
        const p = `${path}.layers[${i}]`;
        error =
            effectRecord(layer, p, ['frequency', 'gain']) ??
                effectNumber(layer.frequency, `${p}.frequency`, 20, 16000) ??
                effectNumber(layer.gain, `${p}.gain`, 0, 1);
        if (error)
            return error;
    }
    error = effectRecord(v.modulation, `${path}.modulation`, ['base', 'waves']);
    if (error)
        return error;
    error = effectNumber(v.modulation.base, `${path}.modulation.base`, 0, 1);
    if (error)
        return error;
    if (!Array.isArray(v.modulation.waves) || v.modulation.waves.length > 4)
        return `${path}.modulation.waves supports up to four waves.`;
    for (const [i, wave] of v.modulation.waves.entries()) {
        const p = `${path}.modulation.waves[${i}]`;
        error =
            effectRecord(wave, p, ['speed', 'amount']) ??
                effectNumber(wave.speed, `${p}.speed`, 0, 40) ??
                effectNumber(wave.amount, `${p}.amount`, 0, 1);
        if (error)
            return error;
    }
    const depth = v.modulation.waves.reduce((sum, w) => sum + w.amount, 0);
    if (depth > Math.min(v.modulation.base, 1 - v.modulation.base) + 1e-9)
        return `${path}.modulation must remain within 0–1.`;
    if (v.grains !== undefined) {
        const g = v.grains, p = `${path}.grains`;
        error = effectRecord(g, p, [
            'start',
            'end',
            'interval',
            'duration',
            'amplitude',
            'bias',
            'smoothing',
            'attack',
            'decay',
        ]);
        if (error)
            return error;
        for (const [key, min, max] of [
            ['start', 0, v.duration],
            ['end', 0, v.duration],
            ['bias', 0.25, 8],
            ['smoothing', 0.001, 1],
            ['attack', 0.0001, 0.05],
            ['decay', 0.01, 1],
        ]) {
            error = effectNumber(g[key], `${p}.${key}`, min, max);
            if (error)
                return error;
        }
        for (const [key, min, max] of [
            ['interval', 0.025, 12],
            ['duration', 0.005, 0.2],
            ['amplitude', 0, 1],
        ]) {
            const r = g[key];
            if (!Array.isArray(r) || r.length !== 2)
                return `${p}.${key} must contain two bounds.`;
            error =
                effectNumber(r[0], `${p}.${key}[0]`, min, max) ??
                    effectNumber(r[1], `${p}.${key}[1]`, r[0], max);
            if (error)
                return error;
        }
        if (g.end < g.start ||
            g.end + g.duration[1] > v.duration ||
            Math.ceil((g.end - g.start) / g.interval[0]) > 256)
            return `${p} must fit the sound and contain at most 256 grains.`;
    }
    return null;
}
export function renderGizmoNoise(sound) {
    const error = gizmoNoiseSoundError(sound);
    if (error)
        throw new Error(error);
    const rate = 48000, samples = new Float32Array(Math.round(sound.duration * rate));
    let seed = sound.seed;
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 0xffffffff;
    };
    const layers = sound.layers.map(layer => ({
        ...layer,
        value: 0,
        step: 1 - Math.exp((-2 * Math.PI * layer.frequency) / rate),
    }));
    for (let i = 0; i < samples.length; i++) {
        const noise = random() * 2 - 1, time = i / rate;
        let value = 0;
        for (const layer of layers) {
            layer.value += (noise - layer.value) * layer.step;
            value += layer.value * layer.gain;
        }
        let swell = sound.modulation.base;
        for (const wave of sound.modulation.waves)
            swell += wave.amount * Math.sin(time * wave.speed);
        samples[i] = value * swell;
    }
    const g = sound.grains;
    if (g)
        for (let time = g.start; time < g.end; time += g.interval[0] + random() * (g.interval[1] - g.interval[0])) {
            const start = Math.floor(time * rate), duration = g.duration[0] + random() ** g.bias * (g.duration[1] - g.duration[0]);
            const amplitude = g.amplitude[0] + random() ** g.bias * (g.amplitude[1] - g.amplitude[0]);
            let filtered = 0;
            for (let i = 0; i < duration * rate && start + i < samples.length; i++) {
                filtered += (random() * 2 - 1 - filtered) * g.smoothing;
                samples[start + i] +=
                    filtered *
                        amplitude *
                        Math.min(1, i / rate / g.attack) *
                        Math.exp(-i / rate / (duration * g.decay));
            }
        }
    const fade = Math.min(Math.round(rate * sound.fade), Math.floor(samples.length / 2));
    for (let i = 0; i < fade; i++) {
        samples[i] *= i / fade;
        samples[samples.length - 1 - i] *= i / fade;
    }
    for (let i = 0; i < samples.length; i++)
        samples[i] = Math.max(-1, Math.min(1, samples[i]));
    return { samples: [samples], rate, duration: samples.length / rate };
}
