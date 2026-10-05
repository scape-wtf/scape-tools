import {
  exactKeys,
  jsonData,
  ObjectActionError,
  record,
  type ObjectAction,
  type ObjectDefinition,
} from './api.js';
import { gizmoAudioError, type GizmoAudioCommand, type GizmoSounds } from './audio.js';
import { gizmoLightingError, type GizmoLightingState } from './lighting.js';
import { resolveGizmoSounds } from './soundBank.js';

/** Bounded, short-lived cosmetics anchored by the host to an accepted action. */
export interface GizmoFeedback {
  durationMs: number;
  audio?: GizmoAudioCommand[];
  lighting?: GizmoLightingState;
  /** Only the initiating player receives this optional device feedback. */
  haptic?: 'light' | 'heavy';
  cameraShake?: { strength: number; durationMs: number };
  burst?: {
    color: string;
    radiusCells: number;
    particles: number;
    flash?: string;
    particleEmojis?: string[];
  };
  impulse?: { scale: number; rotation: number; durationMs?: number };
}
/** Requests are evaluated atomically by the host, which retains removal authority. */
export interface GizmoReaction {
  feedback?: GizmoFeedback;
  removeArea?: { radiusCells: number };
}
/** Host context available while resolving cosmetic action feedback. */
export interface GizmoReactionContext {
  now: number;
}
/** Optional bounded interaction metadata for host-directed feedback. */
export interface GizmoInteraction {
  tap?: ObjectAction;
  bump?: ObjectAction;
}
export function validGizmoInteraction(value: unknown, definition: ObjectDefinition): boolean {
  return (
    record(value) &&
    exactKeys(value, ['tap', 'bump']) &&
    Object.values(value).every(
      action =>
        record(action) &&
        exactKeys(action, ['name', 'payload']) &&
        typeof action.name === 'string' &&
        Object.hasOwn(definition.actions, action.name) &&
        record(action.payload) &&
        jsonData(action.payload) &&
        JSON.stringify(action.payload).length <= 2048,
    )
  );
}
export function gizmoFeedbackError(value: unknown, sounds: GizmoSounds): string | null {
  if (
    !record(value) ||
    !exactKeys(value, [
      'durationMs',
      'audio',
      'lighting',
      'haptic',
      'cameraShake',
      'burst',
      'impulse',
    ]) ||
    !jsonData(value) ||
    JSON.stringify(value).length > 16384
  )
    return 'Invalid action feedback';
  if (typeof value.durationMs !== 'number' || value.durationMs < 1 || value.durationMs > 2000)
    return 'Feedback duration must be 1–2000 ms';
  if (value.audio !== undefined) {
    const error = gizmoAudioError({ key: 'reaction', at: 0, commands: value.audio }, sounds);
    if (error) return error;
    if (
      (value.audio as GizmoAudioCommand[]).some(
        c => c.delayMs >= Number(value.durationMs) || (c.kind === 'play' && c.loop),
      )
    )
      return 'Feedback sounds must be finite and start during the effect';
  }
  if (value.haptic !== undefined && !['light', 'heavy'].includes(String(value.haptic)))
    return 'Invalid haptic';
  if (value.lighting !== undefined) {
    const error = gizmoLightingError(value.lighting);
    if (error) return error;
  }
  if (value.cameraShake !== undefined) {
    const shake = value.cameraShake;
    if (
      !record(shake) ||
      !exactKeys(shake, ['strength', 'durationMs']) ||
      typeof shake.strength !== 'number' ||
      shake.strength < 0 ||
      shake.strength > 18 ||
      typeof shake.durationMs !== 'number' ||
      shake.durationMs < 1 ||
      shake.durationMs > 500 ||
      shake.durationMs > value.durationMs
    )
      return 'Invalid camera shake';
  }
  if (value.burst !== undefined) {
    const b = value.burst;
    if (
      !record(b) ||
      !exactKeys(b, ['color', 'radiusCells', 'particles', 'flash', 'particleEmojis']) ||
      typeof b.color !== 'string' ||
      !/^#[0-9a-f]{6}$/i.test(b.color) ||
      typeof b.radiusCells !== 'number' ||
      b.radiusCells < 0.1 ||
      b.radiusCells > 8 ||
      !Number.isInteger(b.particles) ||
      Number(b.particles) < 0 ||
      Number(b.particles) > 24
    )
      return 'Invalid radial burst';
    const pictograph = (v: unknown) =>
      typeof v === 'string' &&
      v.length <= 16 &&
      /^\p{Extended_Pictographic}[\uFE0E\uFE0F]?$/u.test(v);
    if (
      (b.flash !== undefined && !pictograph(b.flash)) ||
      (b.particleEmojis !== undefined &&
        (!Array.isArray(b.particleEmojis) ||
          b.particleEmojis.length < 1 ||
          b.particleEmojis.length > 4 ||
          !b.particleEmojis.every(pictograph)))
    )
      return 'Invalid burst artwork';
  }
  if (value.impulse !== undefined) {
    const i = value.impulse;
    if (
      !record(i) ||
      !exactKeys(i, ['scale', 'rotation', 'durationMs']) ||
      typeof i.scale !== 'number' ||
      i.scale < 1 ||
      i.scale > 1.5 ||
      typeof i.rotation !== 'number' ||
      Math.abs(i.rotation) > 0.3
    )
      return 'Invalid sprite impulse';
    if (
      i.durationMs !== undefined &&
      (typeof i.durationMs !== 'number' || i.durationMs < 1 || i.durationMs > value.durationMs)
    )
      return 'Invalid impulse duration';
  }
  return null;
}
export function resolveGizmoReaction(
  definition: ObjectDefinition,
  state: unknown,
  previous: unknown,
  action: ObjectAction,
  now: number,
): GizmoReaction | null {
  if (!definition.react) return null;
  const result = definition.react(
    structuredClone(state),
    structuredClone(previous),
    structuredClone(action),
    { now },
  );
  if (result === null) return null;
  if (!record(result) || !exactKeys(result, ['feedback', 'removeArea']) || !jsonData(result))
    throw new ObjectActionError(400, 'Invalid gizmo reaction');
  if (result.feedback !== undefined) {
    const error = gizmoFeedbackError(result.feedback, resolveGizmoSounds(definition, state));
    if (error) throw new ObjectActionError(400, error);
  }
  if (result.removeArea !== undefined) {
    const area = result.removeArea;
    if (
      !definition.areaRemoval ||
      !record(area) ||
      !exactKeys(area, ['radiusCells']) ||
      !Number.isInteger(area.radiusCells) ||
      Number(area.radiusCells) < 0 ||
      Number(area.radiusCells) > definition.areaRemoval.radiusCells
    )
      throw new ObjectActionError(400, 'Area removal exceeds the declared capability');
  }
  return structuredClone(result) as GizmoReaction;
}
