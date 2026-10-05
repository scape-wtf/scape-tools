import { type GizmoReaction } from './reaction.js';
import { type GizmoPreview } from './soundBank.js';
import { type ObjectConfiguration, type ObjectAction, type ObjectContext, type ObjectDefinition, type ObjectInstance } from './api.js';
export declare const OBJECT_STATE_BYTE_LIMIT = 32768;
/** Validate an opaque saved envelope without activating an uninstalled definition. */
export declare function isObjectEnvelope(value: unknown): value is ObjectInstance;
/** Account libraries may preserve configuration for a currently uninstalled gizmo. */
export declare function isObjectConfiguration(value: unknown): value is ObjectConfiguration;
/** A disabled trusted definition, retained for host diagnostics without touching saved state. */
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
    /** Isolation is for trusted bundled catalogs only. Uploaded projects must remain atomic. */
    constructor(definitions: readonly ObjectDefinition[], options?: {
        isolateInvalidDefinitions?: boolean;
    });
    failures(): readonly GizmoFailure[];
    private recordFailure;
    /** Host preparation may reject one model without revalidating unrelated definitions. */
    disable(definition: ObjectDefinition, message: string): void;
    /** Atomically install a complete catalog while preserving host references. */
    reset(definitions: readonly ObjectDefinition[]): void;
    /** A separate host catalog keeps unavailable built-ins and their placement guard. */
    fork(additional?: readonly ObjectDefinition[]): ObjectRegistry;
    all(): ObjectDefinition[];
    forEmoji(emoji: string): ObjectDefinition | undefined;
    definition(instance: ObjectInstance): ObjectDefinition;
    validate(value: unknown): value is ObjectInstance;
    create(emoji: string, id: string): ObjectInstance | undefined;
    /** Copy declared configuration only, never unrelated runtime state. */
    configuration(instance: ObjectInstance): ObjectConfiguration | undefined;
    /** Restore portable values through the normal reducer and host-derived editing authority. */
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
    };
}
