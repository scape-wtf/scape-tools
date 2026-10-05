import { gizmoSpriteAnimationError, resolveGizmoSprite } from './sprite.js';
import { resolveGizmoSounds } from './soundBank.js';
import { exactKeys, jsonData, ObjectActionError, record } from './api.js';
import { gizmoAudioError } from './audio.js';
import { gizmoLightingError } from './lighting.js';
export function gizmoStepError(value, sounds) {
    if (value === null)
        return null;
    if (!record(value) || !exactKeys(value, ['durationMs', 'lighting', 'audio', 'animation']) || !jsonData(value)
        || JSON.stringify(value).length > 16_384)
        return 'step must return null or at most 16 KiB of feedback JSON.';
    if (typeof value.durationMs !== 'number' || !Number.isFinite(value.durationMs) || value.durationMs < 1 || value.durationMs > 2000)
        return 'step.durationMs must be from 1 to 2000.';
    if (value.lighting !== undefined) {
        const error = gizmoLightingError(value.lighting);
        if (error)
            return error;
    }
    if (value.animation !== undefined) {
        const error = gizmoSpriteAnimationError(value.animation);
        if (error)
            return error;
    }
    if (value.audio !== undefined) {
        const error = gizmoAudioError({ key: 'step', at: 0, commands: value.audio }, sounds);
        if (error)
            return error;
        if (value.audio.some(command => command.delayMs >= Number(value.durationMs)
            || command.kind === 'play' && command.loop))
            return 'step audio must be non-looping and start before feedback expires.';
    }
    return null;
}
export function resolveGizmoStep(definition, state, event) {
    try {
        if (!definition.step)
            return null;
        if (!record(event) || !exactKeys(event, ['id', 'at', 'movement']) || typeof event.id !== 'string'
            || !event.id.length || event.id.length > 100 || !Number.isSafeInteger(event.at) || event.at < 0
            || !['walk', 'push'].includes(event.movement))
            throw new Error('Invalid step event');
        const result = definition.step(structuredClone(state), { ...event });
        const error = gizmoStepError(result, resolveGizmoSounds(definition, state));
        if (error)
            throw new Error(error);
        if (result?.animation && !resolveGizmoSprite(definition, state)?.layers.slice(1).some(layer => layer.id === result.animation.layer))
            throw new Error('Unknown sprite animation layer');
        return structuredClone(result);
    }
    catch (error) {
        throw new ObjectActionError(400, `${definition.type}: step: ${error instanceof Error ? error.message : 'Evaluation failed'}`);
    }
}
/** Probe both movement types at catalog/state validation; every live result is checked too. */
export function validateGizmoSteps(definition, state) {
    if (!definition.step)
        return;
    for (const movement of ['walk', 'push'])
        resolveGizmoStep(definition, state, { id: 'validation-step', at: 0, movement });
}
