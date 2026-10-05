/** Copy only these state fields through an editor reducer; never copy identity or other live state. */
export interface GizmoConfiguration {
    action: string;
    fields: string[];
    /** Reuse successfully saved configuration for later placements in this session. */
    remember?: boolean;
    /** Open Configure initially for a settings-first gizmo. Defaults to closed. */
    open?: boolean;
}
export declare function validGizmoConfiguration(value: unknown): value is GizmoConfiguration;
