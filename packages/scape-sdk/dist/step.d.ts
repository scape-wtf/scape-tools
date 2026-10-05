import { type GizmoSpriteAnimation } from './sprite.js';
import { type ObjectDefinition } from './api.js';
import { type GizmoAudioCommand, type GizmoSounds } from './audio.js';
import { type GizmoLightingState } from './lighting.js';
/** Host-observed arrival, not authority to change saved state. IDs are local to a viewer. */
export interface GizmoStepEvent {
    id: string;
    at: number;
    movement: 'walk' | 'push';
}
/** Temporary feedback. The host restores state-driven lighting when durationMs expires. */
export interface GizmoStepEffects {
    durationMs: number;
    lighting?: GizmoLightingState;
    audio?: GizmoAudioCommand[];
    animation?: GizmoSpriteAnimation;
}
export declare function gizmoStepError(value: unknown, sounds: GizmoSounds): string | null;
export declare function resolveGizmoStep(definition: ObjectDefinition, state: unknown, event: GizmoStepEvent): GizmoStepEffects | null;
/** Probe both movement types at catalog/state validation; every live result is checked too. */
export declare function validateGizmoSteps(definition: ObjectDefinition, state: unknown): void;
