import { type ObjectAction, type ObjectDefinition } from './api.js';
import { type GizmoAudioCommand, type GizmoSounds } from './audio.js';
import { type GizmoLightingState } from './lighting.js';
/** Bounded, short-lived cosmetics anchored by the host to an accepted action. */
export interface GizmoFeedback {
    durationMs: number;
    audio?: GizmoAudioCommand[];
    lighting?: GizmoLightingState;
    /** Only the initiating player receives this optional device feedback. */
    haptic?: 'light' | 'heavy';
    cameraShake?: {
        strength: number;
        durationMs: number;
    };
    burst?: {
        color: string;
        radiusCells: number;
        particles: number;
        flash?: string;
        particleEmojis?: string[];
    };
    impulse?: {
        scale: number;
        rotation: number;
        durationMs?: number;
    };
}
/** Requests are evaluated atomically by the host, which retains removal authority. */
export interface GizmoReaction {
    feedback?: GizmoFeedback;
    removeArea?: {
        radiusCells: number;
    };
}
export interface GizmoReactionContext {
    now: number;
}
export interface GizmoInteraction {
    tap?: ObjectAction;
    bump?: ObjectAction;
}
export declare function validGizmoInteraction(value: unknown, definition: ObjectDefinition): boolean;
export declare function gizmoFeedbackError(value: unknown, sounds: GizmoSounds): string | null;
export declare function resolveGizmoReaction(definition: ObjectDefinition, state: unknown, previous: unknown, action: ObjectAction, now: number): GizmoReaction | null;
