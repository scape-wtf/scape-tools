import { type ObjectAction, type ObjectDefinition } from './api.js';
export type GizmoSignalKind = 'event' | 'boolean';
export interface GizmoInput {
    label: string;
    /** Optional event action phrase before its item, e.g. "turn on". */
    phrase?: string;
    kind: GizmoSignalKind;
    /** Explicitly exposed participant action. Signals never grant editing/removal authority. */
    action: string;
    payload?: Record<string, unknown>;
    /** Boolean payload field; required for boolean inputs. */
    value?: string;
    /** Boolean sources may be combined with OR; otherwise only one source is allowed. */
    combine?: 'any';
    /** Manual actions disabled while this boolean input is connected. */
    locks?: string[];
}
export interface GizmoOutput {
    label: string;
    /** Optional event condition before its source item, e.g. "a round ends on". */
    phrase?: string;
    kind: GizmoSignalKind;
    /** Optional authoritative movement source. Requires walkable: true. */
    source?: 'arrival' | 'departure' | 'occupancy';
}
export interface GizmoConnection {
    output: string;
    target: string;
    input: string;
}
export type GizmoSignals = Record<string, boolean | null>;
export declare function validGizmoConnections(value: unknown): value is GizmoConnection[];
export declare function validateGizmoConnections(definition: ObjectDefinition): void;
/** Event outputs use null. Boolean outputs describe current state, including on initial binding. */
export declare function resolveGizmoSignals(definition: ObjectDefinition, state: unknown, previous?: unknown, action?: ObjectAction | null): GizmoSignals;
