import { exactKeys, record } from './api.js';
export function gizmoCharacterMotionError(value) {
    const finite = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
    if (!record(value) ||
        !exactKeys(value, ['durationMs', 'frames']) ||
        !finite(value.durationMs, 100, 2000) ||
        !Array.isArray(value.frames) ||
        value.frames.length < 2 ||
        value.frames.length > 16)
        return 'Invalid character motion';
    let previous = -1;
    for (const frame of value.frames) {
        if (!record(frame) ||
            !exactKeys(frame, ['at', 'offset', 'scale', 'rotation']) ||
            !finite(frame.at, 0, 1) ||
            Number(frame.at) <= previous ||
            !Array.isArray(frame.offset) ||
            frame.offset.length !== 2 ||
            ![...frame.offset].every(n => finite(n, -4, 4)) ||
            !Array.isArray(frame.scale) ||
            frame.scale.length !== 2 ||
            ![...frame.scale].every(n => finite(n, 0.25, 2)) ||
            !finite(frame.rotation, -Math.PI * 4, Math.PI * 4))
            return 'Invalid character frame';
        previous = Number(frame.at);
    }
    const frames = value.frames;
    if (frames[0].at !== 0 ||
        frames.at(-1).at !== 1 ||
        [frames[0], frames.at(-1)].some(f => f.offset.some(n => n !== 0) || f.scale.some(n => n !== 1) || f.rotation !== 0))
        return 'Character motion must start and finish at a neutral pose';
    return null;
}
/** Smooth interpolation of a validated recipe, with exact authored endpoints. */
export function characterMotionFrame(motion, progress) {
    const at = Math.max(0, Math.min(1, progress));
    const index = motion.frames.findIndex(frame => frame.at >= at);
    const b = motion.frames[Math.max(0, index)];
    const a = motion.frames[Math.max(0, index - 1)];
    const t = b.at === a.at ? 0 : (at - a.at) / (b.at - a.at);
    const eased = t * t * (3 - 2 * t);
    const mix = (x, y) => x + (y - x) * eased;
    return {
        at,
        offset: [mix(a.offset[0], b.offset[0]), mix(a.offset[1], b.offset[1])],
        scale: [mix(a.scale[0], b.scale[0]), mix(a.scale[1], b.scale[1])],
        rotation: mix(a.rotation, b.rotation),
    };
}
