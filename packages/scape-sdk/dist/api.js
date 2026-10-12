export class ObjectActionError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
export const record = (value) => !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
export const exactKeys = (value, keys) => Object.keys(value).every(key => keys.includes(key));
export const actorId = (value) => typeof value === 'string' && /^[a-z0-9-]{1,80}$/i.test(value);
export const objectId = (value) => typeof value === 'string' && /^[a-z0-9-]{16,80}$/i.test(value);
/** Typed authoring helper; the registry checks state before invoking an implementation. */
export function defineObject(definition) {
    return definition;
}
export function requirePayload(payload, keys) {
    if (!exactKeys(payload, keys))
        throw new ObjectActionError(400, 'Invalid gizmo action');
}
/** Persistent state and action payloads must round-trip through JSON without loss. */
export function jsonData(value, depth = 0) {
    if (depth > 16)
        return false;
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return true;
    if (typeof value === 'number')
        return Number.isFinite(value);
    if (Array.isArray(value))
        return [...value].every(item => jsonData(item, depth + 1));
    return record(value) && Object.values(value).every(item => jsonData(item, depth + 1));
}
/** Local simulation randomness; connected actions always use the server context. */
export function localObjectRandomInt(min, max) {
    const range = max - min;
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || range < 1 || range > 0x100000000)
        throw new Error('Invalid random range');
    const limit = Math.floor(0x100000000 / range) * range, value = new Uint32Array(1);
    do {
        crypto.getRandomValues(value);
    } while (value[0] >= limit);
    return min + (value[0] % range);
}
/** Project copy uses the same bounds in the authoring SDK, sandbox and shop. */
export function validProjectMetadata(value) {
    return (record(value) &&
        typeof value.name === 'string' &&
        value.name.trim().length >= 1 &&
        value.name.length <= 80 &&
        typeof value.description === 'string' &&
        value.description.trim().length >= 10 &&
        value.description.length <= 1000);
}
export const PROJECT_OBJECT_LIMIT = 16;
export function defineProject(project) {
    if (!validProjectMetadata(project))
        throw new ObjectActionError(400, 'Provide a project name (1–80 characters) and description (10–1000 characters).');
    return project;
}
