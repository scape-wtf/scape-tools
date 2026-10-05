import { record } from './api.js';

/** Shared diagnostics for declarative effects; do not serialize arbitrary author data. */
export function effectRecord(value: unknown, path: string, keys: string[]): string | null {
  if (!record(value)) return `${path} must be an object.`;
  const extra = Object.keys(value).find(key => !keys.includes(key));
  return extra === undefined
    ? null
    : `${path} has an unsupported field: ${JSON.stringify(extra.slice(0, 60))}.`;
}
export function effectNumber(
  value: unknown,
  path: string,
  min: number,
  max: number,
): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max)
    return null;
  const received =
    typeof value === 'number' ? String(value) : value === undefined ? 'missing' : typeof value;
  return `${path} must be a finite number from ${min} to ${max}; received ${received}.`;
}
