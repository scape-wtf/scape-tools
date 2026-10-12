import { type ObjectAction, type ObjectDefinition } from './api.js';
import { type GizmoAudioCommand, type GizmoSounds } from './audio.js';
import { type GizmoLightingState } from './lighting.js';
/** Bounded, short-lived cosmetics anchored by the host to an accepted action. */
export interface GizmoFeedback {
    durationMs: number;
    /** A shared, animated positive result number, shown once per accepted event. */
    number?: number;
    audio?: GizmoAudioCommand[];
    /** Replace named voices on this placed object, or overlap separate accepted events (default). */
    audioMode?: 'overlap' | 'replace';
    lighting?: GizmoLightingState;
    /** Only the initiating player receives this optional device feedback. */
    haptic?: 'light' | 'heavy';
    cameraShake?: {
        strength: number;
        durationMs: number;
    };
    /** Restart the burst on this placed object, or overlap accepted bursts (default). */
    burstMode?: 'overlap' | 'replace';
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
/** Explicit, state-independent contact cosmetics for a participant tap/bump action.
 * This is feedback for an attempt, not proof that the action succeeded.
 */
export type GizmoInteractionFeedback = Pick<GizmoFeedback, 'durationMs' | 'audio' | 'audioMode' | 'burst' | 'burstMode'>;
export declare function validateGizmoInteractionFeedback(definition: ObjectDefinition, sounds: GizmoSounds): void;
/** Requests are evaluated atomically by the host, which retains removal authority. */
export interface GizmoReaction {
    feedback?: GizmoFeedback;
    removeArea?: {
        radiusCells: number;
    };
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
export declare function validGizmoInteraction(value: unknown, definition: ObjectDefinition): boolean;
export declare function gizmoFeedbackError(value: unknown, sounds: GizmoSounds): string | null;
export declare function resolveGizmoReaction(definition: ObjectDefinition, state: unknown, previous: unknown, action: ObjectAction, now: number): GizmoReaction | null;
