import {
  boundedJsonData,
  exactKeys,
  ObjectActionError,
  record,
  type ObjectAction,
  type ObjectDefinition,
} from './api.js';
import { validGizmoTimeline, type GizmoFrame } from './presentation.js';

/** Local-only feedback while an action awaits authority. Never predicts saved state or results. */
export interface GizmoPendingFeedback {
  /** Stop waiting visually after 1–5000 ms; this does not cancel the request. */
  durationMs: number;
  /** Repeating visual cycle, 100–2000 ms. Model frames should form a seamless loop. */
  cycleMs: number;
  /** Optional model poses. Requires a model presentation; no result number is allowed. */
  frames?: GizmoFrame[];
  /** Optional gentle pulse for any gizmo, including those without a model. */
  pulse?: { scale: number; rotation: number };
}

/** Host time for cosmetic decisions such as avoiding feedback during a known cooldown. */
export interface GizmoPendingContext {
  now: number;
}

/** Execute on cloned inputs and validate every recipe, including state-dependent outputs. */
export function resolveGizmoPendingFeedback(
  definition: ObjectDefinition,
  state: unknown,
  action: ObjectAction,
  context: GizmoPendingContext,
): GizmoPendingFeedback | null {
  if (!definition.pendingFeedback) return null;
  if (!Object.hasOwn(definition.actions, action.name))
    throw new ObjectActionError(400, 'Unknown pending action');
  const result = definition.pendingFeedback(structuredClone(state), structuredClone(action), {
    ...context,
  });
  if (result === null) return null;
  if (
    !boundedJsonData(result, 65536) ||
    !record(result) ||
    !exactKeys(result, ['durationMs', 'cycleMs', 'frames', 'pulse']) ||
    !Number.isFinite(result.durationMs) ||
    result.durationMs < 1 ||
    result.durationMs > 5000 ||
    !Number.isFinite(result.cycleMs) ||
    result.cycleMs < 100 ||
    result.cycleMs > 2000 ||
    (!result.frames && !result.pulse)
  )
    throw new ObjectActionError(400, 'Invalid pending feedback');
  if (
    result.frames !== undefined &&
    (!definition.presentation ||
      !validGizmoTimeline({
        key: 'pending',
        at: 0,
        durationMs: result.cycleMs,
        frames: result.frames,
      }) ||
      !result.frames.every(
        frame => record(frame) && exactKeys(frame, ['rotation', 'x', 'lift', 'shadow']),
      ))
  )
    throw new ObjectActionError(400, 'Invalid pending model frames');
  if (
    result.pulse !== undefined &&
    (!record(result.pulse) ||
      !exactKeys(result.pulse, ['scale', 'rotation']) ||
      !Number.isFinite(result.pulse.scale) ||
      result.pulse.scale < 1 ||
      result.pulse.scale > 1.15 ||
      !Number.isFinite(result.pulse.rotation) ||
      Math.abs(result.pulse.rotation) > 0.15)
  )
    throw new ObjectActionError(400, 'Invalid pending pulse');
  return structuredClone(result);
}
