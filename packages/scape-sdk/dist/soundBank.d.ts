import { type ObjectDefinition } from './api.js';
import { type GizmoSounds, type GizmoSound } from './audio.js';
/** Local preview result played without submitting an authoritative action. */
export interface GizmoPreview {
    sound: GizmoSound;
    gain: number;
}
export declare function gizmoPreviewError(value: unknown): string | null;
/** State-dependent recipes are prepared/cached by the host; synthesis never runs in a definition callback. */
export declare function resolveGizmoSounds(definition: ObjectDefinition, state: unknown): GizmoSounds;
