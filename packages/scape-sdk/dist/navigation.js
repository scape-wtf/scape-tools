import { exactKeys, jsonData, ObjectActionError, record } from './api.js';
import { gizmoFeedbackError } from './reaction.js';
import { resolveGizmoSounds } from './soundBank.js';
export const validGizmoWorldId = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{5,23}$/.test(value);
export function validGizmoWorldDestination(value) {
    return record(value) && exactKeys(value, ['id', 'name']) && validGizmoWorldId(value.id)
        && typeof value.name === 'string' && value.name.length <= 32 && !/[\u0000-\u001f\u007f]/.test(value.name);
}
export function validGizmoWorldEditor(value) {
    const id = (v) => typeof v === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(v);
    return record(value) && exactKeys(value, ['field', 'action', 'label']) && id(value.field) && id(value.action)
        && typeof value.label === 'string' && value.label.length > 0 && value.label.length <= 80;
}
export function gizmoNavigationError(value, definition, state) {
    if (value === null)
        return null;
    if (!record(value) || !exactKeys(value, ['world', 'transition', 'feedback']) || !jsonData(value) || !validGizmoWorldId(value.world))
        return 'Invalid world navigation request';
    if (value.transition !== undefined) {
        const t = value.transition;
        if (!record(t) || !exactKeys(t, ['durationMs', 'scale', 'opacity', 'trail']) || typeof t.durationMs !== 'number' || t.durationMs < 1 || t.durationMs > 1000
            || typeof t.scale !== 'number' || t.scale < .02 || t.scale > 1 || typeof t.opacity !== 'number' || t.opacity < .02 || t.opacity > 1)
            return 'Invalid navigation transition';
        if (t.trail !== undefined && (!record(t.trail) || !exactKeys(t.trail, ['color', 'opacity']) || typeof t.trail.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(t.trail.color)
            || typeof t.trail.opacity !== 'number' || t.trail.opacity < 0 || t.trail.opacity > 1))
            return 'Invalid navigation trail';
    }
    if (value.feedback !== undefined) {
        if (!record(value.feedback) || !exactKeys(value.feedback, ['durationMs', 'audio', 'haptic']))
            return 'Navigation feedback supports audio and haptic only';
        const error = gizmoFeedbackError(value.feedback, resolveGizmoSounds(definition, state));
        if (error)
            return error;
    }
    return null;
}
const cache = new WeakMap();
export function resolveGizmoNavigation(definition, state) {
    try {
        if (!definition.navigate)
            return null;
        const key = JSON.stringify(state), entries = cache.get(definition) ?? new Map();
        if (entries.has(key))
            return structuredClone(entries.get(key));
        const result = definition.navigate(structuredClone(state)), error = gizmoNavigationError(result, definition, state);
        if (error)
            throw new Error(error);
        if (entries.size >= 32)
            entries.delete(entries.keys().next().value);
        entries.set(key, structuredClone(result));
        cache.set(definition, entries);
        return structuredClone(result);
    }
    catch (error) {
        throw new ObjectActionError(400, `${definition.type}: navigate: ${error instanceof Error ? error.message : 'Evaluation failed'}`);
    }
}
