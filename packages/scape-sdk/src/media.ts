/** Host-owned live media. Saved gizmo state contains catalogue IDs, never stream URLs. */
import { exactKeys, record } from './api.js';

export interface GizmoMedia {
  kind: 'live-tv';
  field: string;
  action: string;
}

/** An opaque channel/feed key supplied by the host catalogue. */
export function validGizmoMediaChannel(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^[A-Za-z0-9_.%~-]{1,240}$/.test(value));
}

export function validGizmoMedia(value: unknown): value is GizmoMedia {
  const identifier = (v: unknown) =>
    typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(v);
  return (
    record(value) &&
    exactKeys(value, ['kind', 'field', 'action']) &&
    value.kind === 'live-tv' &&
    identifier(value.field) &&
    identifier(value.action)
  );
}
