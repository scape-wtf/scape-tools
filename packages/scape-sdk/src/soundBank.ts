import { jsonData, ObjectActionError, type ObjectDefinition } from './api.js';
import { gizmoSoundsError, type GizmoSounds, type GizmoSound } from './audio.js';
import { effectNumber, effectRecord } from './effectValidation.js';

/** Local preview result played without submitting an authoritative action. */
export interface GizmoPreview {
  sound: GizmoSound;
  gain: number;
}
export function gizmoPreviewError(value: unknown): string | null {
  const shape = effectRecord(value, 'preview', ['sound', 'gain']);
  if (shape) return shape;
  const preview = value as GizmoPreview;
  return (
    effectNumber(preview.gain, 'preview.gain', 0, 1) ?? gizmoSoundsError({ preview: preview.sound })
  );
}
const cache = new WeakMap<ObjectDefinition, Map<string, GizmoSounds>>();
/** State-dependent recipes are prepared/cached by the host; synthesis never runs in a definition callback. */
export function resolveGizmoSounds(definition: ObjectDefinition, state: unknown): GizmoSounds {
  if (!definition.soundBank) return definition.sounds ?? {};
  const key = JSON.stringify(state);
  let entries = cache.get(definition);
  const existing = entries?.get(key);
  if (existing) return existing;
  try {
    const result = definition.soundBank(structuredClone(state));
    if (!jsonData(result) || JSON.stringify(result).length > 65_536)
      throw new Error('Sound bank exceeds 64 KiB of JSON');
    const error = gizmoSoundsError(result);
    if (error) throw new Error(error);
    const sounds = structuredClone(result);
    entries ??= new Map();
    cache.set(definition, entries);
    if (entries.size >= 32) entries.delete(entries.keys().next().value!);
    entries.set(key, sounds);
    return sounds;
  } catch (error) {
    throw new ObjectActionError(
      400,
      `${definition.type}: soundBank: ${error instanceof Error ? error.message : 'Evaluation failed'}`,
    );
  }
}
