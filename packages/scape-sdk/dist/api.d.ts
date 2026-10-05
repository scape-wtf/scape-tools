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
/** Experimental Scape object authoring contract. Execution isolation is supplied by the host, not this authoring API. */
export interface ObjectInstance {
    id: string;
    type: string;
    version: number;
    state: unknown;
    linkId?: string;
}
/** Portable editor values only; identities and live state never cross placements. */
export interface ObjectConfiguration {
    type: string;
    version: number;
    values: Record<string, unknown>;
}
export interface ObjectViewer {
    actorId: string;
    canEdit: boolean;
}
export interface ObjectContext extends ObjectViewer {
    canRemove?: boolean;
    now: number;
    randomInt: (min: number, max: number) => number;
}
export interface ObjectAction {
    name: string;
    payload: Record<string, unknown>;
}
export interface ObjectControl {
    id: string;
    label: string;
    action: ObjectAction;
    disabled?: boolean;
    pressed?: boolean;
    confirm?: string;
    fields?: string[];
    /** Host action-row switch for a participant action without fields; requires boolean pressed state. */
    icon?: 'toggle';
    /** Icon-only action row button; defaults to the host's media-play-filled icon. Permissions are unchanged. */
    placement?: 'action';
    /** Save on a select change, with no separate button. All referenced fields must be selects. */
    trigger?: 'change';
    /** A local preview control resolves its action through definition.previews, never the server. */
    kind?: 'preview';
    /** Audition this named local preview with the same payload before a normal action. */
    preview?: string;
}
/** A finite choice is author data; the host never interprets its value as a game feature. */
export interface ObjectChoice {
    value: string;
    label: string;
}
export type ObjectField = {
    id: string;
    label: string;
    value: string;
    kind?: 'text';
    maxLength: number;
} | {
    id: string;
    label: string;
    value: string;
    kind: 'select';
    options: ObjectChoice[];
};
export interface ObjectView {
    title: string;
    description: string;
    fields?: ObjectField[];
    controls: ObjectControl[];
}
export interface ObjectDefinition {
    type: string;
    version: number;
    emoji: string;
    label: string;
    hint: string;
    initial: () => unknown;
    valid: (state: unknown) => boolean;
    actions: Record<string, {
        permission: 'participant' | 'editor' | 'remover';
        run: (state: unknown, payload: Record<string, unknown>, context: ObjectContext) => unknown;
    }>;
    interaction?: GizmoInteraction;
    areaRemoval?: {
        radiusCells: number;
    };
    react?: (state: unknown, previous: unknown, action: ObjectAction, context: GizmoReactionContext) => GizmoReaction | null;
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
    previews?: Record<string, {
        permission: 'participant' | 'editor';
        run: (state: unknown, payload: Record<string, unknown>) => GizmoPreview;
    }>;
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
    /** State-derived directional push while occupied. Requires walkable: true; host owns movement. */
    push?: (state: unknown) => GizmoPush | null;
    /** Cosmetic arrival feedback only. Does not grant walkability or change saved state. */
    step?: (state: unknown, event: GizmoStepEvent) => GizmoStepEffects | null;
    animate?: (state: unknown, previous: unknown) => GizmoTimeline;
}
export declare class ObjectActionError extends Error {
    readonly status: 400 | 403 | 409;
    constructor(status: 400 | 403 | 409, message: string);
}
export declare const record: (value: unknown) => value is Record<string, unknown>;
export declare const exactKeys: (value: Record<string, unknown>, keys: string[]) => boolean;
export declare const actorId: (value: unknown) => value is string;
export declare const objectId: (value: unknown) => value is string;
/** Typed authoring helper; the registry checks state before invoking an implementation. */
export declare function defineObject<S>(definition: Omit<ObjectDefinition, 'initial' | 'valid' | 'actions' | 'view' | 'animate' | 'worldText' | 'audio' | 'lighting' | 'step' | 'push' | 'soundBank' | 'previews' | 'sprite' | 'react' | 'travel' | 'navigate'> & {
    initial: () => S;
    valid: (state: unknown) => state is S;
    actions: Record<string, {
        permission: 'participant' | 'editor' | 'remover';
        run: (state: S, payload: Record<string, unknown>, context: ObjectContext) => S;
    }>;
    react?: (state: S, previous: S, action: ObjectAction, context: GizmoReactionContext) => GizmoReaction | null;
    view?: (state: S, viewer: ObjectViewer) => ObjectView;
    soundBank?: (state: S) => GizmoSounds;
    sprite?: (state: S) => GizmoSpriteRecipe;
    previews?: Record<string, {
        permission: 'participant' | 'editor';
        run: (state: S, payload: Record<string, unknown>) => GizmoPreview;
    }>;
    worldText?: (state: S) => string;
    navigate?: (state: S) => GizmoNavigation | null;
    travel?: (state: S) => GizmoTravel | null;
    lighting?: (state: S, environment: GizmoEnvironment) => GizmoLightingState;
    push?: (state: S) => GizmoPush | null;
    step?: (state: S, event: GizmoStepEvent) => GizmoStepEffects | null;
    animate?: (state: S, previous: S) => GizmoTimeline;
    audio?: (state: S, previous: S) => GizmoAudioTimeline | null;
}): ObjectDefinition;
export declare function requirePayload(payload: Record<string, unknown>, keys: string[]): void;
/** Persistent state and action payloads must round-trip through JSON without loss. */
export declare function jsonData(value: unknown, depth?: number): boolean;
/** Local simulation randomness; connected actions always use the server context. */
export declare function localObjectRandomInt(min: number, max: number): number;
/** One atomic development build. Object state remains independent per placed instance. */
export interface ProjectDefinition {
    objects: readonly ObjectDefinition[];
}
export declare const PROJECT_OBJECT_LIMIT = 16;
export declare function defineProject(project: ProjectDefinition): ProjectDefinition;
