import type { ActionButton } from './actionButtons.js';
import type { GizmoConnection, GizmoInput, GizmoOutput, GizmoSignals } from './connections.js';
import type { GizmoNavigation, GizmoWorldEditor } from './navigation.js';
import type { GizmoLink, GizmoTravel, GizmoEnvironment } from './travel.js';
import type { GizmoInteraction, GizmoReaction, GizmoReactionContext } from './reaction.js';
import type { GizmoSpriteRecipe } from './sprite.js';
import type { GizmoConfiguration } from './configuration.js';
import type { GizmoPreview } from './soundBank.js';
import type { GizmoPush } from './push.js';
import type { GizmoLightingState } from './lighting.js';
import type { GizmoStepEvent, GizmoStepEffects } from './step.js';
import type { GizmoLight } from './light.js';
import type { GizmoSequence } from './sequence.js';
import type { GizmoGlow } from './glow.js';
import type { GizmoAmbience, GizmoSounds, GizmoAudioTimeline } from './audio.js';
import type { GizmoTextEditor } from './text.js';
import type { GizmoPresentation, GizmoTimeline } from './presentation.js';
/** Scape object definition. Scape isolates uploaded code; local SDK tests do not. */
export interface ObjectInstance {
  /** Stable identity assigned by Scape for one placed instance. */
  id: string;
  /** Namespaced definition type that created this instance. */
  type: string;
  /** Definition version used to validate the saved state. */
  version: number;
  /** Author-owned state returned by the definition's `initial` and actions. */
  state: unknown;
  /** Optional Scape-managed link identity for grouped world behavior. */
  linkId?: string;
  /** Scape-owned outgoing wires; excluded from portable configuration. */
  connections?: GizmoConnection[];
  /** Last applied held inputs, maintained by Scape, never authored state. */
  signalInputs?: Record<string, boolean>;
}
/** Portable editor values only; identities and live state never cross placements. */
export interface ObjectConfiguration {
  /** Definition type whose configuration is being stored. */
  type: string;
  /** Definition version that established the configuration shape. */
  version: number;
  /** Declared editor values; never include identity, credentials, or live state. */
  values: Record<string, unknown>;
}
/** Identity and editing authority visible to a view callback. */
export interface ObjectViewer {
  /** Host-issued actor identifier for the viewer. */
  actorId: string;
  /** Whether the viewer may invoke editor-permission actions. */
  canEdit: boolean;
}
/** Authority, clock, and bounded randomness supplied to an authoritative action. */
export interface ObjectContext extends ObjectViewer {
  /** Whether this actor may remove the placed instance. */
  canRemove?: boolean;
  /** Host time in milliseconds; do not use a process clock for game decisions. */
  now: number;
  /** Host-provided inclusive random integer source. */
  randomInt: (min: number, max: number) => number;
}
/** Name and JSON payload submitted to a definition action. */
export interface ObjectAction {
  /** Action key declared in the definition. */
  name: string;
  /** JSON-compatible action input, validated by Scape before execution. */
  payload: Record<string, unknown>;
}
/** A participant/editor control rendered by Scape's shared configuration UI. */
export interface ObjectControl {
  /** Stable control identifier used by Scape for focus and drafts. */
  id: string;
  /** Accessible button label and tooltip. */
  label: string;
  /** Action invoked when the control is submitted. */
  action: ObjectAction;
  /** Disables submission without changing the action's permission. */
  disabled?: boolean;
  /** Current state for a toggle control. */
  pressed?: boolean;
  /** Confirmation message shown before an action. Required for an icon-first button. */
  confirm?: string;
  /** Two-step content action using a preset or approved icon ID; requires confirm. */
  button?: ActionButton;
  /** Editor field identifiers submitted with this control. */
  fields?: string[];
  /** Host action-row switch for a participant action without fields; requires boolean pressed state. */
  icon?: 'toggle';
  /** Icon-only action row button; defaults to Scape’s media-play-filled icon. Permissions are unchanged. */
  placement?: 'action';
  /** Save on a select change, with no separate button. All referenced fields must be selects. */
  trigger?: 'change';
  /** A local preview control resolves its action through definition.previews, never the server. */
  kind?: 'preview';
  /** Audition this named local preview with the same payload before a normal action. */
  preview?: string;
}
/** A finite choice is author data; Scape never interprets its value as a game feature. */
export interface ObjectChoice {
  /** Stable submitted value. */
  value: string;
  /** Human-readable label shown in the control. */
  label: string;
}
/** One bounded text or select editor field in an object view. */
export type ObjectField =
  | { id: string; label: string; value: string; kind?: 'text'; maxLength: number }
  | { id: string; label: string; value: string; kind: 'select'; options: ObjectChoice[] };
/** Declarative editor content rendered inside Scape's shared popover. */
export interface ObjectView {
  /** Visible panel title. */
  title: string;
  /** Supporting description for the current state or controls. */
  description: string;
  /** Optional editable fields. */
  fields?: ObjectField[];
  /** Actions available to the current viewer. */
  controls: ObjectControl[];
}
/** Complete author-owned contract for one versioned Scape gizmo type. */
export interface ObjectDefinition {
  /** Namespaced, stable identifier for this definition. */
  type: string;
  /** Increment when saved state or behavior becomes incompatible. */
  version: number;
  /** Unique emoji identity used by Scape catalog. */
  emoji: string;
  /** Short human-readable name shown in the developer and world UI. */
  label: string;
  /** Concise hint shown beside the gizmo in catalogs. */
  hint: string;
  /** Creates fresh state for a placement. Must not read external state. */
  initial: () => unknown;
  /** Returns true only for valid state for this definition version. */
  valid: (state: unknown) => boolean;
  /** Authoritative actions keyed by the names used in `ObjectControl.action`. */
  actions: Record<
    string,
    {
      permission: 'participant' | 'editor' | 'remover';
      run: (state: unknown, payload: Record<string, unknown>, context: ObjectContext) => unknown;
    }
  >;
  inputs?: Record<string, GizmoInput>;
  outputs?: Record<string, GizmoOutput>;
  signals?: (state: unknown, previous: unknown, action: ObjectAction | null) => GizmoSignals;
  interaction?: GizmoInteraction;
  areaRemoval?: { radiusCells: number };
  react?: (
    state: unknown,
    previous: unknown,
    action: ObjectAction,
    context: GizmoReactionContext,
  ) => GizmoReaction | null;
  view?: (state: unknown, viewer: ObjectViewer) => ObjectView;
  /** Editing always requires the placer and build permission; this can additionally require administration. */
  editPolicy?: 'placer' | 'placer-admin';
  textEditor?: GizmoTextEditor;
  worldEditor?: GizmoWorldEditor;
  /** Optional proximity limit for the world label, in cells. */
  worldTextRange?: number;
  navigate?: (state: unknown) => GizmoNavigation | null;
  configuration?: GizmoConfiguration;
  worldText?: (state: unknown) => string;
  presentation?: GizmoPresentation;
  sprite?: (state: unknown) => GizmoSpriteRecipe;
  sounds?: GizmoSounds;
  /** Alternative to static sounds: up to 16 pitch/state-specific recipes, at most 64 KiB. */
  soundBank?: (state: unknown) => GizmoSounds;
  previews?: Record<
    string,
    {
      permission: 'participant' | 'editor';
      run: (state: unknown, payload: Record<string, unknown>) => GizmoPreview;
    }
  >;

  audio?: (state: unknown, previous: unknown) => GizmoAudioTimeline | null;
  ambience?: GizmoAmbience;
  sequence?: GizmoSequence;
  glow?: GizmoGlow;
  light?: GizmoLight;
  /** Replaces fixed light/glow for this state; absent effects are off. */
  lighting?: (state: unknown, environment: GizmoEnvironment) => GizmoLightingState;
  /** Explicit collision policy. Defaults to false; fixed for this definition version. */
  walkable?: boolean;
  /** Host-assigned grouping, independent of movement. */
  link?: GizmoLink;
  travel?: (state: unknown) => GizmoTravel | null;
  /** Decorative rotation in radians/second; disabled for reduced motion. */
  spin?: number;
  /** State-derived directional push while occupied. Requires walkable: true; Scape handles movement. */
  push?: (state: unknown) => GizmoPush | null;
  /** Cosmetic arrival feedback only. Does not grant walkability or change saved state. */
  step?: (state: unknown, event: GizmoStepEvent) => GizmoStepEffects | null;
  animate?: (state: unknown, previous: unknown) => GizmoTimeline;
}
export class ObjectActionError extends Error {
  constructor(
    public readonly status: 400 | 403 | 409,
    message: string,
  ) {
    super(message);
  }
}
export const record = (value: unknown): value is Record<string, unknown> =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
export const exactKeys = (value: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(value).every(key => keys.includes(key));
export const actorId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9-]{1,80}$/i.test(value);
export const objectId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9-]{16,80}$/i.test(value);

/** Typed authoring helper; the registry checks state before invoking an implementation. */
export function defineObject<S>(
  definition: Omit<
    ObjectDefinition,
    | 'signals'
    | 'initial'
    | 'valid'
    | 'actions'
    | 'view'
    | 'animate'
    | 'worldText'
    | 'audio'
    | 'lighting'
    | 'step'
    | 'push'
    | 'soundBank'
    | 'previews'
    | 'sprite'
    | 'react'
    | 'travel'
    | 'navigate'
  > & {
    signals?: (state: S, previous: S, action: ObjectAction | null) => GizmoSignals;
    initial: () => S;
    valid: (state: unknown) => state is S;
    actions: Record<
      string,
      {
        permission: 'participant' | 'editor' | 'remover';
        run: (state: S, payload: Record<string, unknown>, context: ObjectContext) => S;
      }
    >;
    react?: (
      state: S,
      previous: S,
      action: ObjectAction,
      context: GizmoReactionContext,
    ) => GizmoReaction | null;
    view?: (state: S, viewer: ObjectViewer) => ObjectView;
    soundBank?: (state: S) => GizmoSounds;
    sprite?: (state: S) => GizmoSpriteRecipe;
    previews?: Record<
      string,
      {
        permission: 'participant' | 'editor';
        run: (state: S, payload: Record<string, unknown>) => GizmoPreview;
      }
    >;
    worldText?: (state: S) => string;
    navigate?: (state: S) => GizmoNavigation | null;
    travel?: (state: S) => GizmoTravel | null;
    lighting?: (state: S, environment: GizmoEnvironment) => GizmoLightingState;
    push?: (state: S) => GizmoPush | null;
    step?: (state: S, event: GizmoStepEvent) => GizmoStepEffects | null;
    animate?: (state: S, previous: S) => GizmoTimeline;
    audio?: (state: S, previous: S) => GizmoAudioTimeline | null;
  },
): ObjectDefinition {
  return definition as ObjectDefinition;
}

export function requirePayload(payload: Record<string, unknown>, keys: string[]): void {
  if (!exactKeys(payload, keys)) throw new ObjectActionError(400, 'Invalid gizmo action');
}

/** Persistent state and action payloads must round-trip through JSON without loss. */
export function jsonData(value: unknown, depth = 0): boolean {
  if (depth > 16) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return [...value].every(item => jsonData(item, depth + 1));
  return record(value) && Object.values(value).every(item => jsonData(item, depth + 1));
}

/** Local simulation randomness; connected actions always use the server context. */
export function localObjectRandomInt(min: number, max: number): number {
  const range = max - min;
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || range < 1 || range > 0x100000000)
    throw new Error('Invalid random range');
  const limit = Math.floor(0x100000000 / range) * range,
    value = new Uint32Array(1);
  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);
  return min + (value[0] % range);
}

/** One atomic development build. Object state remains independent per placed instance. */
export interface ProjectDefinition {
  objects: readonly ObjectDefinition[];
}
export const PROJECT_OBJECT_LIMIT = 16;
export function defineProject(project: ProjectDefinition): ProjectDefinition {
  return project;
}
