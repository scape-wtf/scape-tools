/** Shared diagnostics for declarative effects; do not serialize arbitrary author data. */
export declare function effectRecord(value: unknown, path: string, keys: string[]): string | null;
export declare function effectNumber(value: unknown, path: string, min: number, max: number): string | null;
