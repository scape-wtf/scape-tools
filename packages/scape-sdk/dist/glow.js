import { record } from './api.js';
import { effectRecord, effectNumber } from './effectValidation.js';
/** The first actionable validation error, or null when the recipe is valid. */
export function gizmoGlowError(value) {
    const shape = effectRecord(value, 'glow', ['color', 'size', 'pulse', 'opacity', 'hue']);
    if (shape)
        return shape;
    const v = value;
    if (typeof v.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(v.color))
        return 'glow.color must be a six-digit hex color, such as #ff6bd6.';
    const size = effectNumber(v.size, 'glow.size', 16, 128);
    if (size)
        return size;
    for (const [name, fields] of [
        ['pulse', ['speed', 'amount', 'phaseX']],
        ['opacity', ['base', 'amount', 'speed', 'phaseY']],
    ]) {
        const error = effectRecord(v[name], `glow.${name}`, [...fields]);
        if (error)
            return error;
    }
    if (!record(v.pulse) || !record(v.opacity))
        return 'glow.pulse and glow.opacity must be objects.';
    for (const [key, max] of [
        ['speed', 8],
        ['amount', 0.25],
        ['phaseX', 8],
    ]) {
        const error = effectNumber(v.pulse[key], `glow.pulse.${key}`, 0, max);
        if (error)
            return error;
    }
    const base = effectNumber(v.opacity.base, 'glow.opacity.base', 0, 1);
    if (base)
        return base;
    const amount = effectNumber(v.opacity.amount, 'glow.opacity.amount', 0, Math.min(Number(v.opacity.base), 1 - Number(v.opacity.base)));
    if (amount)
        return `${amount} Opacity uses base ± amount; keep both within 0–1 (base is ${v.opacity.base}).`;
    for (const key of ['speed', 'phaseY']) {
        const error = effectNumber(v.opacity[key], `glow.opacity.${key}`, 0, 8);
        if (error)
            return error;
    }
    if (v.hue !== undefined) {
        const shape = effectRecord(v.hue, 'glow.hue', ['speed', 'phaseY', 'saturation', 'lightness']);
        if (shape)
            return shape;
        const hue = v.hue;
        for (const key of ['speed', 'phaseY', 'saturation', 'lightness']) {
            const error = effectNumber(hue[key], `glow.hue.${key}`, 0, key === 'speed' ? 0.25 : 1);
            if (error)
                return error;
        }
    }
    return null;
}
export function validGizmoGlow(value) {
    return gizmoGlowError(value) === null;
}
export function gizmoGlowFrame(glow, seconds, x, y, reducedMotion = false) {
    const time = reducedMotion ? 0 : seconds;
    return {
        size: glow.size *
            (1 + Math.sin(time * glow.pulse.speed + x * glow.pulse.phaseX) * glow.pulse.amount),
        opacity: glow.opacity.base +
            Math.sin(time * glow.opacity.speed + y * glow.opacity.phaseY) * glow.opacity.amount,
        hue: glow.hue ? (time * glow.hue.speed + y * glow.hue.phaseY) % 1 : undefined,
    };
}
