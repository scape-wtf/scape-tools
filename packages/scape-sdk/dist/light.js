import { effectNumber, effectRecord } from './effectValidation.js';
export function gizmoLightError(value) {
    let error = effectRecord(value, 'light', [
        'radiusCells',
        'color',
        'innerColor',
        'intensity',
        'basementIntensity',
        'illumination',
        'falloff',
        'motion',
        'pattern',
    ]);
    if (error)
        return error;
    const v = value;
    for (const key of ['color', 'innerColor']) {
        if (key === 'color' || v[key] !== undefined) {
            error = lightColorError(v[key], `light.${key}`);
            if (error)
                return error;
        }
    }
    if (v.pattern !== undefined && v.motion !== undefined)
        return 'light.pattern and light.motion cannot be combined.';
    if (v.pattern !== undefined) {
        error = lightPatternError(v.pattern);
        if (error)
            return error;
    }
    for (const [key, min, max] of [
        ['radiusCells', 0.25, 12],
        ['intensity', 0, 1],
        ['illumination', 0, 1],
    ]) {
        error = effectNumber(v[key], `light.${key}`, min, max);
        if (error)
            return error;
    }
    if (v.basementIntensity !== undefined) {
        error = effectNumber(v.basementIntensity, 'light.basementIntensity', 0, 1);
        if (error)
            return error;
    }
    if (v.falloff !== undefined) {
        error =
            effectRecord(v.falloff, 'light.falloff', ['start', 'edge', 'power']) ??
                effectNumber(v.falloff.start, 'light.falloff.start', 0, 0.8) ??
                effectNumber(v.falloff.edge, 'light.falloff.edge', 0.81, 1) ??
                effectNumber(v.falloff.power, 'light.falloff.power', 0.25, 8);
        if (error)
            return error;
    }
    const m = v.motion;
    if (m === undefined)
        return null;
    error = effectRecord(m, 'light.motion', [
        'phase',
        'bias',
        'bands',
        'flare',
        'drift',
        'stretch',
        'edge',
        'radius',
    ]);
    if (error)
        return error;
    error =
        tuple(m.phase, 'light.motion.phase', [
            [-8, 8],
            [-8, 8],
        ]) ?? effectNumber(m.bias, 'light.motion.bias', -0.5, 0.5);
    if (error)
        return error;
    if (!Array.isArray(m.bands) || m.bands.length > 4)
        return 'light.motion.bands supports up to four noise bands.';
    for (const [i, band] of m.bands.entries()) {
        error = tuple(band, `light.motion.bands[${i}]`, [
            [0, 20],
            [0, 0.5],
            [0, 1000],
        ]);
        if (error)
            return error;
    }
    if (m.flare !== undefined) {
        error = tuple(m.flare, 'light.motion.flare', [
            [0, 20],
            [0, 0.99],
            [0.01, 1],
            [0, 0.5],
            [0, 1000],
        ]);
        if (error)
            return error;
        if (m.flare[2] <= m.flare[1])
            return 'light.motion.flare high must exceed low.';
    }
    for (const key of ['drift', 'stretch']) {
        const w = m[key];
        if (w === undefined)
            continue;
        error =
            effectRecord(w, `light.motion.${key}`, ['speed', 'phase', 'amount']) ??
                tuple(w.speed, `light.motion.${key}.speed`, [
                    [0, 20],
                    [0, 20],
                ]) ??
                tuple(w.phase, `light.motion.${key}.phase`, [
                    [0, 1000],
                    [0, 1000],
                ]) ??
                effectNumber(w.amount, `light.motion.${key}.amount`, 0, 0.4);
        if (error)
            return error;
    }
    if (m.edge !== undefined) {
        error =
            effectRecord(m.edge, 'light.motion.edge', ['scale', 'drift', 'amount']) ??
                effectNumber(m.edge.scale, 'light.motion.edge.scale', 0.1, 16) ??
                effectNumber(m.edge.drift, 'light.motion.edge.drift', 0, 20) ??
                effectNumber(m.edge.amount, 'light.motion.edge.amount', 0, 0.4);
        if (error)
            return error;
    }
    if (m.radius !== undefined) {
        error = tuple(m.radius, 'light.motion.radius', [
            [0.5, 1.5],
            [0, 0.5],
        ]);
        if (error)
            return error;
    }
    return null;
}
function tuple(value, path, bounds) {
    if (!Array.isArray(value) || value.length !== bounds.length)
        return `${path} must contain ${bounds.length} values.`;
    for (let i = 0; i < bounds.length; i++) {
        const error = effectNumber(value[i], `${path}[${i}]`, ...bounds[i]);
        if (error)
            return error;
    }
    return null;
}
function lightColorError(value, path) {
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value))
        return null;
    if (Array.isArray(value))
        return tuple(value, path, [
            [0, 1],
            [0, 1],
            [0, 1],
        ]);
    return `${path} must be a six-digit hex color or three sRGB components from 0 to 1.`;
}
function range(value, path, min, max, strict = false) {
    const error = tuple(value, path, [
        [min, max],
        [min, max],
    ]);
    if (error)
        return error;
    const [low, high] = value;
    return high < low || (strict && high === low)
        ? `${path} must have ${strict ? 'increasing' : 'ordered'} bounds.`
        : null;
}
function lightPatternError(value) {
    const path = 'light.pattern';
    let error = effectRecord(value, path, [
        'kind',
        'phase',
        'rotation',
        'density',
        'warp',
        'jitter',
        'palette',
        'spots',
        'wash',
    ]);
    if (error)
        return error;
    const p = value;
    if (p.kind !== 'scattered')
        return `${path}.kind must be scattered.`;
    error =
        tuple(p.phase, `${path}.phase`, [
            [-8, 8],
            [-8, 8],
        ]) ??
            effectNumber(p.density, `${path}.density`, 1, 16) ??
            effectNumber(p.jitter, `${path}.jitter`, 0, 1) ??
            effectRecord(p.rotation, `${path}.rotation`, ['speed', 'variation', 'phase']);
    if (error)
        return error;
    error =
        effectNumber(p.rotation.speed, `${path}.rotation.speed`, -2, 2) ??
            effectNumber(p.rotation.variation, `${path}.rotation.variation`, -2, 2) ??
            effectNumber(p.rotation.phase, `${path}.rotation.phase`, -Math.PI * 2, Math.PI * 2) ??
            effectRecord(p.warp, `${path}.warp`, ['frequency', 'phase', 'amount']);
    if (error)
        return error;
    error =
        tuple(p.warp.frequency, `${path}.warp.frequency`, [
            [0, 16],
            [0, 16],
        ]) ??
            tuple(p.warp.phase, `${path}.warp.phase`, [
                [-100, 100],
                [-100, 100],
            ]) ??
            effectNumber(p.warp.amount, `${path}.warp.amount`, 0, 2);
    if (error)
        return error;
    if (!Array.isArray(p.palette) || p.palette.length < 1 || p.palette.length > 8)
        return `${path}.palette requires 1–8 colors.`;
    for (const [i, color] of p.palette.entries()) {
        error = lightColorError(color, `${path}.palette[${i}]`);
        if (error)
            return error;
    }
    const s = p.spots;
    error = effectRecord(s, `${path}.spots`, ['size', 'aspect', 'edge', 'gain', 'halo', 'fade']);
    if (error)
        return error;
    error =
        range(s.size, `${path}.spots.size`, 0.005, 0.5) ??
            range(s.aspect, `${path}.spots.aspect`, 0.1, 1) ??
            effectNumber(s.edge, `${path}.spots.edge`, 0, 0.9) ??
            range(s.gain, `${path}.spots.gain`, 0, 1) ??
            effectRecord(s.halo, `${path}.spots.halo`, ['radius', 'gain']);
    if (error)
        return error;
    error =
        range(s.halo.radius, `${path}.spots.halo.radius`, 0, 0.5, true) ??
            effectNumber(s.halo.gain, `${path}.spots.halo.gain`, 0, 1) ??
            effectRecord(s.fade, `${path}.spots.fade`, ['speed', 'thresholds']);
    if (error)
        return error;
    error =
        range(s.fade.speed, `${path}.spots.fade.speed`, 0, 4) ??
            range(s.fade.thresholds, `${path}.spots.fade.thresholds`, 0, 1, true) ??
            effectRecord(p.wash, `${path}.wash`, ['gain', 'falloff', 'blend']);
    if (error)
        return error;
    return (effectNumber(p.wash.gain, `${path}.wash.gain`, 0, 1) ??
        effectNumber(p.wash.falloff, `${path}.wash.falloff`, 0, 0.8) ??
        range(p.wash.blend, `${path}.wash.blend`, -2, 2, true));
}
