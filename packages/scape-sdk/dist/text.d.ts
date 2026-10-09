import { type ObjectDefinition } from './api.js';
/** A single text field rendered by Scape's existing anchored configuration popover. */
export interface GizmoTextEditor {
    field: string;
    action: string;
    label: string;
    maxLength: number;
}
export declare function validGizmoTextEditor(value: unknown): value is GizmoTextEditor;
/** Validate bounded plain text; Scape displays it without interpreting HTML. */
export declare function validGizmoWorldText(value: unknown): value is string;
export declare function gizmoWorldText(definition: ObjectDefinition, state: unknown): string;
