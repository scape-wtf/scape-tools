export interface GizmoMedia {
    kind: 'live-tv';
    field: string;
    action: string;
}
/** An opaque channel/feed key supplied by the host catalogue. */
export declare function validGizmoMediaChannel(value: unknown): value is string | null;
export declare function validGizmoMedia(value: unknown): value is GizmoMedia;
