import { type ObjectAction, type ObjectDefinition } from './api.js';
import { type GizmoFrame } from './presentation.js';
/** Local-only feedback while an action awaits authority. Never predicts saved state or results. */
export interface GizmoPendingFeedback {
    /** Stop waiting visually after 1–5000 ms; this does not cancel the request. */
    durationMs: number;
    /** Repeating visual cycle, 100–2000 ms. Model frames should form a seamless loop. */
    cycleMs: number;
    /** Optional model poses. Requires a model presentation; no result number is allowed. */
    frames?: GizmoFrame[];
    /** Optional gentle pulse for any gizmo, including those without a model. */
    pulse?: {
        scale: number;
        rotation: number;
    };
}
/** Host time for cosmetic decisions such as avoiding feedback during a known cooldown. */
export interface GizmoPendingContext {
    now: number;
}
/** Execute on cloned inputs and validate every recipe, including state-dependent outputs. */
export declare function resolveGizmoPendingFeedback(definition: ObjectDefinition, state: unknown, action: ObjectAction, context: GizmoPendingContext): GizmoPendingFeedback | null;
