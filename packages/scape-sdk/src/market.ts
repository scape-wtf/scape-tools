/** Bounded host-owned market data. Definitions never receive networking or credentials. */
import { exactKeys, record } from './api.js';

export interface GizmoMarketToken {
  address: string;
  symbol: string;
  name: string;
}
export interface GizmoMarket {
  kind: 'solana-token';
  field: string;
  action: string;
  /** Optional shared field: 'label' (default) or 'card'. */
  displayField?: string;
}
export function validSolanaMint(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}
export function validGizmoMarketToken(value: unknown): value is GizmoMarketToken | null {
  const text = (v: unknown, max: number) =>
    typeof v === 'string' &&
    v.trim().length > 0 &&
    v.length <= max &&
    !/[\u0000-\u001f\u007f]/.test(v);
  return (
    value === null ||
    (record(value) &&
      exactKeys(value, ['address', 'symbol', 'name']) &&
      validSolanaMint(value.address) &&
      text(value.symbol, 24) &&
      text(value.name, 100))
  );
}
export function validGizmoMarket(value: unknown): value is GizmoMarket {
  const identifier = (v: unknown) =>
    typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(v);
  return (
    record(value) &&
    exactKeys(value, ['kind', 'field', 'action', 'displayField']) &&
    value.kind === 'solana-token' &&
    identifier(value.field) &&
    identifier(value.action) &&
    (value.displayField === undefined ||
      (identifier(value.displayField) && value.displayField !== value.field))
  );
}
