/** Host-rendered web content. External applications own their networking and multiplayer. */
export interface GizmoWebView {
    /** Accessible frame title. */
    title: string;
    /** Absolute HTTPS embed URL. Mutually exclusive with html. */
    url?: string;
    /** Static HTML/CSS, at most 16,384 characters. Scripts and network resources are disabled. */
    html?: string;
    /** Opt in to the public room-context bridge for an external site. */
    context?: boolean;
    /** Explicit public data shared with the embedded site; never pass private state. */
    data?: Record<string, unknown>;
    /** Participant actions this site may request. Editor/remover actions are never exposed. */
    actions?: string[];
    /** Host-side placement restrictions, not a signed identity or external-service ban. */
    rooms?: {
        allow?: string[];
        deny?: string[];
    };
}
/** Minimal public context. This browser message is not an authentication proof. */
export interface GizmoWebContext {
    roomId: string | null;
    objectId: string;
    objectType: string;
    floor: number;
}
/** Portable validation also runs in QuickJS, where the browser URL API is unavailable. */
export declare function validGizmoWebUrl(value: unknown): value is string;
export declare function validGizmoWebView(value: unknown): value is GizmoWebView;
/** Deny wins; a restricted embed requires an actual connected room. */
export declare function gizmoWebRoomAllowed(view: GizmoWebView, roomId: string | null): boolean;
