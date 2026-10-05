import { type ObjectDefinition } from './api.js';
import { type GizmoFeedback } from './reaction.js';
/** Display metadata, never proof of access. The host checks admission on every visit. */
export interface GizmoWorldDestination {
    id: string;
    name: string;
}
/** Host-owned world picker. The selected destination or null is submitted to an editor action. */
export interface GizmoWorldEditor {
    field: string;
    action: string;
    label: string;
}
/** Request navigation for the entering local player; no URL, credentials or room authority. */
export interface GizmoNavigation {
    world: string;
    transition?: {
        durationMs: number;
        scale: number;
        opacity: number;
        trail?: {
            color: string;
            opacity: number;
        };
    };
    feedback?: Pick<GizmoFeedback, 'durationMs' | 'audio' | 'haptic'>;
}
export declare const validGizmoWorldId: (value: unknown) => value is string;
export declare function validGizmoWorldDestination(value: unknown): value is GizmoWorldDestination;
export declare function validGizmoWorldEditor(value: unknown): value is GizmoWorldEditor;
export declare function gizmoNavigationError(value: unknown, definition: ObjectDefinition, state: unknown): string | null;
export declare function resolveGizmoNavigation(definition: ObjectDefinition, state: unknown): GizmoNavigation | null;
