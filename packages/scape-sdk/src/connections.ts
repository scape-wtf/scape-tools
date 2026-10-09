import {
  exactKeys,
  jsonData,
  objectId,
  ObjectActionError,
  record,
  type ObjectAction,
  type ObjectDefinition,
} from './api.js';

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
const name = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/.test(value);
const label = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 80;
export function validGizmoConnections(value: unknown): value is GizmoConnection[] {
  return (
    Array.isArray(value) &&
    value.length <= 8 &&
    value.every(
      c =>
        record(c) &&
        exactKeys(c, ['output', 'target', 'input']) &&
        name(c.output) &&
        objectId(c.target) &&
        name(c.input),
    ) &&
    new Set(value.map(c => JSON.stringify(c))).size === value.length
  );
}
export function validateGizmoConnections(definition: ObjectDefinition): void {
  for (const [direction, ports] of [
    ['inputs', definition.inputs],
    ['outputs', definition.outputs],
  ] as const) {
    if (ports === undefined) continue;
    if (!record(ports) || Object.keys(ports).length > 8)
      throw new Error(`Use at most eight ${direction}`);
    for (const [id, port] of Object.entries(ports)) {
      if (
        !name(id) ||
        !record(port) ||
        !label(port.label) ||
        (port.phrase !== undefined && (port.kind !== 'event' || !label(port.phrase))) ||
        !['event', 'boolean'].includes(String(port.kind))
      )
        throw new Error('Invalid connection port');
      if (direction === 'outputs') {
        if (
          !exactKeys(port, ['label', 'phrase', 'kind', 'source']) ||
          (port.source !== undefined &&
            (!definition.walkable ||
              !['arrival', 'departure', 'occupancy'].includes(String(port.source)) ||
              (port.source === 'occupancy') !== (port.kind === 'boolean')))
        )
          throw new Error('Invalid signal source');
        if (port.source === undefined && typeof definition.signals !== 'function')
          throw new Error('Authored outputs require signals');
      } else {
        if (
          !exactKeys(port, [
            'label',
            'phrase',
            'kind',
            'action',
            'payload',
            'value',
            'combine',
            'locks',
          ]) ||
          !name(port.action) ||
          !Object.hasOwn(definition.actions, port.action) ||
          definition.actions[port.action].permission !== 'participant' ||
          definition.areaRemoval ||
          definition.navigate ||
          definition.worldEditor ||
          (port.payload !== undefined &&
            (!record(port.payload) ||
              !jsonData(port.payload) ||
              JSON.stringify(port.payload).length > 1024)) ||
          (port.kind === 'boolean'
            ? !name(port.value)
            : port.value !== undefined || port.combine !== undefined || port.locks !== undefined) ||
          (port.combine !== undefined && port.combine !== 'any') ||
          (port.locks !== undefined &&
            (!Array.isArray(port.locks) ||
              port.locks.length > 8 ||
              port.locks.some(a => !name(a) || !Object.hasOwn(definition.actions, a))))
        )
          throw new Error('Invalid signal input');
      }
    }
  }
  if (definition.signals !== undefined && typeof definition.signals !== 'function')
    throw new Error('signals must be a callback');
}
/** Event outputs use null. Boolean outputs describe current state, including on initial binding. */
export function resolveGizmoSignals(
  definition: ObjectDefinition,
  state: unknown,
  previous = state,
  action: ObjectAction | null = null,
): GizmoSignals {
  const values =
    definition.signals?.(
      structuredClone(state),
      structuredClone(previous),
      action && structuredClone(action),
    ) ?? {};
  if (!record(values) || Object.keys(values).length > 8)
    throw new ObjectActionError(400, 'Invalid gizmo signals');
  for (const [id, value] of Object.entries(values)) {
    const output = Object.hasOwn(definition.outputs ?? {}, id)
      ? definition.outputs![id]
      : undefined;
    if (
      !output ||
      output.source ||
      (output.kind === 'event' ? value !== null || !action : typeof value !== 'boolean')
    )
      throw new ObjectActionError(400, 'Invalid gizmo signal value');
  }
  for (const [id, output] of Object.entries(definition.outputs ?? {}))
    if (output.kind === 'boolean' && !output.source && typeof values[id] !== 'boolean')
      throw new ObjectActionError(400, 'Boolean outputs must report their current value');
  return values as GizmoSignals;
}
