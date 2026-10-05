import { record, type ObjectDefinition } from './api.js';

/** A single text field rendered by Scape's existing anchored configuration popover. */
export interface GizmoTextEditor { field: string; action: string; label: string; maxLength: number }
export function validGizmoTextEditor(value: unknown): value is GizmoTextEditor {
  const id = (v: unknown) => typeof v === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(v);
  return record(value) && id(value.field) && id(value.action)
    && typeof value.label === 'string' && value.label.length > 0 && value.label.length <= 80
    && Number.isInteger(value.maxLength) && Number(value.maxLength) >= 1 && Number(value.maxLength) <= 512;
}
/** Plain, bounded text only: hosts must never interpret this as HTML. */
export function validGizmoWorldText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 1024 && Array.from(value).length <= 512
    && !/[\u0000-\u001f\u007f]/.test(value);
}
export function gizmoWorldText(definition: ObjectDefinition, state: unknown): string {
  const text = definition.worldText?.(state) ?? '';
  if (!validGizmoWorldText(text)) throw new Error('Invalid gizmo world text');
  return text;
}
