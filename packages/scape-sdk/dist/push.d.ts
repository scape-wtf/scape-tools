import { type ObjectDefinition } from './api.js';
/** One adjacent cell at host-controlled speed. No coordinates, player IDs or collision bypass. */
export interface GizmoPush {
    direction: 'right' | 'down' | 'left' | 'up';
    /** Defaults to false. Lateral exits are always allowed. */
    blockOpposingInput?: boolean;
}
export declare function gizmoPushError(value: unknown): string | null;
/** Pure state-derived intent, checked during registration, actions and host evaluation. */
export declare function resolveGizmoPush(definition: ObjectDefinition, state: unknown): GizmoPush | null;
