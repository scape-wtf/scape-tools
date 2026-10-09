import { record } from './api.js';
export function validGizmoTextEditor(value) {
    const id = (v) => typeof v === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(v);
    return (record(value) &&
        id(value.field) &&
        id(value.action) &&
        typeof value.label === 'string' &&
        value.label.length > 0 &&
        value.label.length <= 80 &&
        Number.isInteger(value.maxLength) &&
        Number(value.maxLength) >= 1 &&
        Number(value.maxLength) <= 512);
}
/** Validate bounded plain text; Scape displays it without interpreting HTML. */
export function validGizmoWorldText(value) {
    return (typeof value === 'string' &&
        value.length <= 1024 &&
        Array.from(value).length <= 512 &&
        !/[\u0000-\u001f\u007f]/.test(value));
}
export function gizmoWorldText(definition, state) {
    const text = definition.worldText?.(state) ?? '';
    if (!validGizmoWorldText(text))
        throw new Error('Invalid gizmo world text');
    return text;
}
