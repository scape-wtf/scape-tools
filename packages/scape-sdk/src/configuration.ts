import { exactKeys, record } from './api.js';

/** Copy only these state fields through an editor reducer; never copy identity or other live state. */
export interface GizmoConfiguration {
  action: string;
  fields: string[];
  /** Reuse successfully saved configuration for later placements in this session. */
  remember?: boolean;
  /** Open Configure initially for a settings-first gizmo. Defaults to closed. */
  open?: boolean;
}
export function validGizmoConfiguration(value: unknown): value is GizmoConfiguration {
  const id = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
  return (
    record(value) &&
    exactKeys(value, ['action', 'fields', 'remember', 'open']) &&
    id(value.action) &&
    Array.isArray(value.fields) &&
    value.fields.length >= 1 &&
    value.fields.length <= 16 &&
    Array.from(value.fields).every(id) &&
    new Set(value.fields).size === value.fields.length &&
    (value.remember === undefined || typeof value.remember === 'boolean') &&
    (value.open === undefined || typeof value.open === 'boolean')
  );
}
