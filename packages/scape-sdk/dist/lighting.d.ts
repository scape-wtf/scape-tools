import type { GizmoEnvironment } from './travel.js';
import { type ObjectDefinition } from './api.js';
import { type GizmoLight } from './light.js';
import { type GizmoGlow } from './glow.js';
/** Complete lighting for one state. Missing or null effects are off. */
export interface GizmoLightingState {
    light?: GizmoLight | null;
    glow?: GizmoGlow | null;
}
/** Validate every callback result before it reaches a renderer or an accepted action. */
export declare function gizmoLightingError(value: unknown): string | null;
/** Pure state evaluation; clocks and frame animation belong to the host. */
export declare function resolveGizmoLighting(definition: ObjectDefinition, state: unknown, environment?: GizmoEnvironment): GizmoLightingState;
