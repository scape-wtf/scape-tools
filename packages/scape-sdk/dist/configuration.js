import { exactKeys, record } from './api.js';
export function validGizmoConfiguration(value) {
    const id = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
    return record(value) && exactKeys(value, ['action', 'fields', 'remember', 'open']) && id(value.action)
        && Array.isArray(value.fields) && value.fields.length >= 1 && value.fields.length <= 16
        && Array.from(value.fields).every(id) && new Set(value.fields).size === value.fields.length
        && (value.remember === undefined || typeof value.remember === 'boolean')
        && (value.open === undefined || typeof value.open === 'boolean');
}
