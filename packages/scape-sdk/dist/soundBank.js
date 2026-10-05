import { jsonData, ObjectActionError } from './api.js';
import { gizmoSoundsError } from './audio.js';
import { effectNumber, effectRecord } from './effectValidation.js';
export function gizmoPreviewError(value) {
    const shape = effectRecord(value, 'preview', ['sound', 'gain']);
    if (shape)
        return shape;
    const preview = value;
    return (effectNumber(preview.gain, 'preview.gain', 0, 1) ?? gizmoSoundsError({ preview: preview.sound }));
}
const cache = new WeakMap();
/** State-dependent recipes are prepared/cached by the host; synthesis never runs in a definition callback. */
export function resolveGizmoSounds(definition, state) {
    if (!definition.soundBank)
        return definition.sounds ?? {};
    const key = JSON.stringify(state);
    let entries = cache.get(definition);
    const existing = entries?.get(key);
    if (existing)
        return existing;
    try {
        const result = definition.soundBank(structuredClone(state));
        if (!jsonData(result) || JSON.stringify(result).length > 65_536)
            throw new Error('Sound bank exceeds 64 KiB of JSON');
        const error = gizmoSoundsError(result);
        if (error)
            throw new Error(error);
        const sounds = structuredClone(result);
        entries ??= new Map();
        cache.set(definition, entries);
        if (entries.size >= 32)
            entries.delete(entries.keys().next().value);
        entries.set(key, sounds);
        return sounds;
    }
    catch (error) {
        throw new ObjectActionError(400, `${definition.type}: soundBank: ${error instanceof Error ? error.message : 'Evaluation failed'}`);
    }
}
