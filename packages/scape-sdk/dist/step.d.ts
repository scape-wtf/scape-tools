import { type GizmoSpriteAnimation } from './sprite.js';
import { type ObjectDefinition } from './api.js';
import { type GizmoAudioCommand, type GizmoSounds } from './audio.js';
import { type GizmoLightingState } from './lighting.js';
/** Host arrival feedback, not authority to change saved state. IDs are local to a viewer.
 * Pure step callbacks may be evaluated before a predictable arrival to queue audio.
 * The host cancels abandoned arrivals and applies visual feedback only on arrival. */
export interface GizmoStepEvent {
    id: string;
    /** Expected arrival as Unix epoch milliseconds. */
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
