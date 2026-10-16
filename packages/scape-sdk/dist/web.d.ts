import { type ObjectDefinition, type ObjectView } from './api.js';
/** Host-rendered web content. External applications own their networking and multiplayer. */
export interface GizmoWebView {
    /** Accessible frame title. */
    title: string;
    /** Show the host's expand/retract button. Defaults to true; this does not grant browser Fullscreen API access. */
    fullscreen?: boolean;
    /** Absolute HTTPS embed URL. Mutually exclusive with html. */
    url?: string;
    /** HTML/CSS, at most 16,384 characters. Static unless interactive is explicitly true. */
    html?: string;
    /** HTML-only opt-in to inline JavaScript and the public bridge. External resources remain blocked. */
    interactive?: boolean;
    /** Opt in to the public room-context bridge for an external site or interactive HTML panel. */
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
/** A source declaration is fixed in the definition; live data comes only from the view. */
export declare function validGizmoWebDefinition(value: unknown): value is Omit<GizmoWebView, 'data'>;
/** Resolve only the declared source, never a URL/HTML supplied by mutable view state. */
export declare function resolveGizmoWebView(definition: ObjectDefinition, view: ObjectView): GizmoWebView | undefined;
