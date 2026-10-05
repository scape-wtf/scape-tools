import type { GizmoEnvironment } from './travel.js';
import { ObjectActionError, exactKeys, jsonData, record, type ObjectDefinition } from './api.js';
import { gizmoLightError, type GizmoLight } from './light.js';
import { gizmoGlowError, type GizmoGlow } from './glow.js';

/** Complete lighting for one state. Missing or null effects are off. */
export interface GizmoLightingState {
  light?: GizmoLight | null;
  glow?: GizmoGlow | null;
}

/** Validate every callback result before it reaches a renderer or an accepted action. */
export function gizmoLightingError(value: unknown): string | null {
  if (!record(value) || !exactKeys(value, ['light', 'glow']))
    return 'lighting must contain only light and glow JSON data.';
  const error =
    (value.light != null ? gizmoLightError(value.light) : null) ??
    (value.glow != null ? gizmoGlowError(value.glow) : null);
  if (error) return error;
  if (!jsonData(value)) return 'lighting must contain JSON data.';
  if (JSON.stringify(value).length > 16_384) return 'lighting exceeds 16 KiB.';
  return null;
}

/** Pure state evaluation; clocks and frame animation belong to the host. */
export function resolveGizmoLighting(
  definition: ObjectDefinition,
  state: unknown,
  environment: GizmoEnvironment = { linked: false },
): GizmoLightingState {
  try {
    const result = definition.lighting
      ? definition.lighting(structuredClone(state), { ...environment })
      : { light: definition.light ?? null, glow: definition.glow ?? null };
    const error = gizmoLightingError(result);
    if (error) throw new Error(error);
    return structuredClone(result);
  } catch (error) {
    throw new ObjectActionError(
      400,
      `${definition.type}: lighting: ${error instanceof Error ? error.message : 'Evaluation failed'}`,
    );
  }
}
