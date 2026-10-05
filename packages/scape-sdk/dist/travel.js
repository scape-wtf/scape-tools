import { exactKeys, jsonData, ObjectActionError, record } from './api.js';
import { gizmoFeedbackError } from './reaction.js';
import { resolveGizmoSounds } from './soundBank.js';
export const validGizmoLink = (value) => record(value) && exactKeys(value, ['size']) && value.size === 2;
export function gizmoTravelError(value, definition, state) {
    if (value === null)
        return null;
    if (!record(value) || !exactKeys(value, ['destination', 'exits', 'relative', 'cooldownMs', 'feedback', 'arrival']) || !jsonData(value))
        return 'Invalid travel recipe';
    const d = value.destination;
    if (!record(d) || !(d.kind === 'linked' && exactKeys(d, ['kind']) && definition.link
        || d.kind === 'offset' && exactKeys(d, ['kind', 'x', 'y']) && [d.x, d.y].every(v => Number.isInteger(v) && Math.abs(Number(v)) <= 64)))
        return 'Travel requires a declared link or a bounded offset destination';
    if (!Array.isArray(value.exits) || value.exits.length < 1 || value.exits.length > 9 || value.exits.some(p => !Array.isArray(p) || p.length !== 2 || p.some(n => !Number.isInteger(n) || Math.abs(n) > 1)))
        return 'Travel requires 1–9 adjacent landing offsets';
    if (value.relative !== undefined && typeof value.relative !== 'boolean')
        return 'Invalid travel orientation';
    if (!Number.isInteger(value.cooldownMs) || Number(value.cooldownMs) < 650 || Number(value.cooldownMs) > 5000)
        return 'Travel cooldown must be 650–5000 ms';
    if (value.feedback !== undefined) {
        if (!record(value.feedback) || !exactKeys(value.feedback, ['durationMs', 'audio', 'haptic']))
            return 'Travel feedback supports audio and haptic only';
        const error = gizmoFeedbackError(value.feedback, resolveGizmoSounds(definition, state));
        if (error)
            return error;
    }
    if (value.arrival !== undefined) {
        const a = value.arrival;
        if (!record(a) || !exactKeys(a, ['durationMs', 'scale', 'trail']) || typeof a.durationMs !== 'number' || a.durationMs < 1 || a.durationMs > 2000
            || typeof a.scale !== 'number' || a.scale < .1 || a.scale > 1)
            return 'Invalid arrival animation';
        if (a.trail !== undefined && (!record(a.trail) || !exactKeys(a.trail, ['color', 'opacity']) || typeof a.trail.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(a.trail.color)
            || typeof a.trail.opacity !== 'number' || a.trail.opacity < 0 || a.trail.opacity > 1))
            return 'Invalid arrival trail';
    }
    return null;
}
const cache = new WeakMap();
export function resolveGizmoTravel(definition, state) {
    try {
        if (!definition.travel)
            return null;
        const key = JSON.stringify(state), entries = cache.get(definition) ?? new Map();
        if (entries.has(key))
            return structuredClone(entries.get(key));
        const result = definition.travel(structuredClone(state));
        const error = gizmoTravelError(result, definition, state);
        if (error)
            throw new Error(error);
        if (entries.size >= 32)
            entries.delete(entries.keys().next().value);
        entries.set(key, structuredClone(result));
        cache.set(definition, entries);
        return structuredClone(result);
    }
    catch (error) {
        throw new ObjectActionError(400, `${definition.type}: travel: ${error instanceof Error ? error.message : 'Evaluation failed'}`);
    }
}
/** Rotate authored cell offsets; no scene access or movement authority. */
export function travelExitOffsets(travel, dx, dy) {
    return travel.exits.map(([x, y]) => travel.relative ? [x * dx - y * dy, x * dy + y * dx] : [x, y]);
}
