/** JSON-only presentation data. The host owns rendering, time and audio devices. */
export type Quaternion = [number, number, number, number];
export interface GizmoFrame {
    rotation: Quaternion;
    x: number;
    lift: number;
    shadow: [number, number, number];
}
export interface GizmoTimeline {
    key: string;
    at: number;
    durationMs: number;
    frames: GizmoFrame[];
    number?: number;
}
export interface GizmoLabelFrame {
    scaleX: number;
    scaleY: number;
    rotation: number;
    y: number;
    opacity: number;
}
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
