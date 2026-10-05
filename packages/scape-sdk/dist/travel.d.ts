import { type ObjectDefinition } from './api.js';
import { type GizmoFeedback } from './reaction.js';
/** Host-created groups are scoped to a definition/version and floor. Independent of travel. */
export interface GizmoLink {
    size: 2;
}
/** Read-only topology, supplied by the host; never persisted into authored state. */
export interface GizmoEnvironment {
    linked: boolean;
}
/** A bounded same-floor movement request when a player walks into this gizmo. */
export interface GizmoTravel {
    destination: {
        kind: 'linked';
    } | {
        kind: 'offset';
        x: number;
        y: number;
    };
    /** Ordered landing offsets around the destination, in cells. */
    exits: [number, number][];
    /** Rotate offsets so +X follows the entering player's direction. */
    relative?: boolean;
    cooldownMs: number;
    feedback?: Pick<GizmoFeedback, 'durationMs' | 'audio' | 'haptic'>;
    /** Optional local-player arrival cosmetics; collision and camera remain host-owned. */
    arrival?: {
        durationMs: number;
        scale: number;
        trail?: {
            color: string;
            opacity: number;
        };
    };
}
export declare const validGizmoLink: (value: unknown) => value is GizmoLink;
export declare function gizmoTravelError(value: unknown, definition: ObjectDefinition, state: unknown): string | null;
export declare function resolveGizmoTravel(definition: ObjectDefinition, state: unknown): GizmoTravel | null;
/** Rotate authored cell offsets; no scene access or movement authority. */
export declare function travelExitOffsets(travel: Pick<GizmoTravel, 'exits' | 'relative'>, dx: number, dy: number): [number, number][];
