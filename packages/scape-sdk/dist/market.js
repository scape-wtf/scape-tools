/** Bounded host-owned market data. Definitions never receive networking or credentials. */
import { exactKeys, record } from './api.js';
export function validSolanaMint(value) {
    return typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}
export function validGizmoMarketToken(value) {
    const text = (v, max) => typeof v === 'string' &&
        v.trim().length > 0 &&
        v.length <= max &&
        !/[\u0000-\u001f\u007f]/.test(v);
    return (value === null ||
        (record(value) &&
            exactKeys(value, ['address', 'symbol', 'name']) &&
            validSolanaMint(value.address) &&
            text(value.symbol, 24) &&
            text(value.name, 100)));
}
export function validGizmoMarket(value) {
    const identifier = (v) => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(v);
    return (record(value) &&
        exactKeys(value, ['kind', 'field', 'action', 'displayField']) &&
        value.kind === 'solana-token' &&
        identifier(value.field) &&
        identifier(value.action) &&
        (value.displayField === undefined ||
            (identifier(value.displayField) && value.displayField !== value.field)));
}
