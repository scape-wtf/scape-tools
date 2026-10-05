/** JSON-only presentation data. The host owns rendering, time and audio devices. */
/** A normalized quaternion in `[x, y, z, w]` order. */
export type Quaternion = [number, number, number, number];
/** One host-rendered pose and shadow sample in a presentation timeline. */
export interface GizmoFrame {
    /** Model orientation. */
    rotation: Quaternion;
    /** Horizontal world position offset. */
    x: number;
    /** Vertical lift above the authored placement. */
    lift: number;
    /** Shadow width, height, and opacity. */
    shadow: [number, number, number];
}
/** A named, bounded cosmetic animation timeline. */
export interface GizmoTimeline {
    /** Stable animation key used by the host to replace a prior timeline. */
    key: string;
    /** Start time relative to the accepted state change, in milliseconds. */
    at: number;
    /** Timeline duration in milliseconds. */
    durationMs: number;
    /** Ordered model frames sampled by the host. */
    frames: GizmoFrame[];
    /** Optional numeric payload for host label or effect selection. */
    number?: number;
}
/** One sampled label transform in a presentation effect. */
export interface GizmoLabelFrame {
    /** Horizontal scale. */
    scaleX: number;
    /** Vertical scale. */
    scaleY: number;
    /** Rotation in radians. */
    rotation: number;
    /** Vertical offset. */
    y: number;
    /** Opacity from 0 to 1. */
    opacity: number;
}
/** Embedded model presentation settings consumed by the host renderer. */
export interface GizmoPresentation {
    model: string;
    textureSize: number;
    nominalSize: number;
    fitSize: number;
    rest: Quaternion;
    materials: Record<string, string>;
    lighting: {
        sky: string;
        ground: string;
        ambient: number;
        key: number;
        fill: number;
        exposure: number;
        keyColor: string;
        fillColor: string;
        keyPosition: [number, number, number];
        fillPosition: [number, number, number];
    };
    shadow: {
        color: string;
        xFactor: number;
        z: number;
    };
    tap: {
        name: string;
        payload: Record<string, unknown>;
    };
    label?: {
        colors: string[];
        durationMs: number;
        riseMs: number;
        fadeMs: number;
        offsetY: number;
        height: number;
        frames: GizmoLabelFrame[];
    };
}
export declare function validGizmoPresentation(v: unknown): v is GizmoPresentation;
export declare function validGizmoTimeline(v: unknown): v is GizmoTimeline;
/** Pure authoring helpers: no renderer or platform dependencies. */
export declare function multiplyQuaternion(a: Quaternion, b: Quaternion): Quaternion;
export declare function axisQuaternion(axis: number[], angle: number): Quaternion;
export declare function slerpQuaternion(a: Quaternion, b: Quaternion, t: number): Quaternion;
/** Inspect GLB structure before a host parser sees it. No URLs, textures, skins or extensions. */
export declare function validateGizmoModel(encoded: string): void;
