import { exactKeys, record, ObjectActionError } from './api.js';
export function gizmoPushError(value) {
    if (value === null)
        return null;
    return record(value) && exactKeys(value, ['direction', 'blockOpposingInput'])
        && typeof value.direction === 'string' && ['right', 'down', 'left', 'up'].includes(value.direction)
        && (value.blockOpposingInput === undefined || typeof value.blockOpposingInput === 'boolean')
        ? null : 'push must return null or a cardinal direction with optional boolean blockOpposingInput.';
}
/** Pure state-derived intent, checked during registration, actions and host evaluation. */
export function resolveGizmoPush(definition, state) {
    try {
        if (!definition.push)
            return null;
        const result = definition.push(structuredClone(state));
        const error = gizmoPushError(result);
        if (error)
            throw new Error(error);
        return result === null ? null : { ...result };
    }
    catch (error) {
        throw new ObjectActionError(400, `${definition.type}: push: ${error instanceof Error ? error.message : 'Evaluation failed'}`);
    }
}
