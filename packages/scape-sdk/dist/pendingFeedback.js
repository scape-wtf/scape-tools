import { boundedJsonData, exactKeys, ObjectActionError, record, } from './api.js';
import { validGizmoTimeline } from './presentation.js';
/** Execute on cloned inputs and validate every recipe, including state-dependent outputs. */
export function resolveGizmoPendingFeedback(definition, state, action, context) {
    if (!definition.pendingFeedback)
        return null;
    if (!Object.hasOwn(definition.actions, action.name))
        throw new ObjectActionError(400, 'Unknown pending action');
    const result = definition.pendingFeedback(structuredClone(state), structuredClone(action), {
        ...context,
    });
    if (result === null)
        return null;
    if (!boundedJsonData(result, 65536) ||
        !record(result) ||
        !exactKeys(result, ['durationMs', 'cycleMs', 'frames', 'pulse']) ||
        !Number.isFinite(result.durationMs) ||
        result.durationMs < 1 ||
        result.durationMs > 5000 ||
        !Number.isFinite(result.cycleMs) ||
        result.cycleMs < 100 ||
        result.cycleMs > 2000 ||
        (!result.frames && !result.pulse))
        throw new ObjectActionError(400, 'Invalid pending feedback');
    if (result.frames !== undefined &&
        (!definition.presentation ||
            !validGizmoTimeline({
                key: 'pending',
                at: 0,
                durationMs: result.cycleMs,
                frames: result.frames,
            }) ||
            !result.frames.every(frame => record(frame) && exactKeys(frame, ['rotation', 'x', 'lift', 'shadow']))))
        throw new ObjectActionError(400, 'Invalid pending model frames');
    if (result.pulse !== undefined &&
        (!record(result.pulse) ||
            !exactKeys(result.pulse, ['scale', 'rotation']) ||
            !Number.isFinite(result.pulse.scale) ||
            result.pulse.scale < 1 ||
            result.pulse.scale > 1.15 ||
            !Number.isFinite(result.pulse.rotation) ||
            Math.abs(result.pulse.rotation) > 0.15))
        throw new ObjectActionError(400, 'Invalid pending pulse');
    return structuredClone(result);
}
