import { type GizmoSignals } from './connections.js';
import { type GizmoReaction } from './reaction.js';
import { type GizmoPreview } from './soundBank.js';
import { type ObjectConfiguration, type ObjectAction, type ObjectContext, type ObjectDefinition, type ObjectInstance } from './api.js';
export declare const OBJECT_STATE_BYTE_LIMIT = 32768;
/** Validate an opaque saved envelope without activating an uninstalled definition. */
export declare function isObjectEnvelope(value: unknown): value is ObjectInstance;
/** Account libraries may preserve configuration for a currently uninstalled gizmo. */
export declare function isObjectConfiguration(value: unknown): value is ObjectConfiguration;
/** A disabled definition and its validation error; saved state is unchanged. */
export interface GizmoFailure {
    type: string;
    emoji: string;
    label: string;
    message: string;
}
export declare class ObjectRegistry {
    private definitions;
    private emojis;
    private disabled;
    /** By default, any invalid definition rejects registration. Optional isolation records failures locally; uploads always validate the whole project. */
    constructor(definitions: readonly ObjectDefinition[], options?: {
        isolateInvalidDefinitions?: boolean;
    });
    failures(): readonly GizmoFailure[];
    private recordFailure;
    /** Disable a definition in this registry and record the reason. */
    disable(definition: ObjectDefinition, message: string): void;
    /** Replace registered definitions atomically. */
    reset(definitions: readonly ObjectDefinition[]): void;
    /** Copy the registry with additional definitions, preserving disabled definitions. */
    fork(additional?: readonly ObjectDefinition[]): ObjectRegistry;
    all(): ObjectDefinition[];
    forEmoji(emoji: string): ObjectDefinition | undefined;
    definition(instance: ObjectInstance): ObjectDefinition;
    validate(value: unknown): value is ObjectInstance;
    create(emoji: string, id: string): ObjectInstance | undefined;
    /** Copy declared configuration only, never unrelated runtime state. */
    configuration(instance: ObjectInstance): ObjectConfiguration | undefined;
    /** Restore portable values through the declared reducer and supplied editing permission. */
    configure(instance: ObjectInstance, configuration: unknown, context: ObjectContext): ObjectInstance;
    /** Evaluate local audition data without applying state or sending any network action. */
    preview(instance: ObjectInstance, action: ObjectAction, viewer: {
        actorId: string;
        canEdit: boolean;
    }): GizmoPreview;
    act(instance: ObjectInstance, action: ObjectAction, context: ObjectContext): ObjectInstance;
    execute(instance: ObjectInstance, action: ObjectAction, context: ObjectContext): {
        instance: ObjectInstance;
        reaction: GizmoReaction | null;
        signals: GizmoSignals;
    };
}
