import { type ObjectDefinition } from './api.js';
export type GizmoSpriteFill = string | {
    from: string;
    to: string;
    y: [number, number];
};
export type GizmoSpriteShape = {
    kind: 'rect';
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
    fill: GizmoSpriteFill;
} | {
    kind: 'text';
    x: number;
    y: number;
    text: string;
    size: number;
    weight: 400 | 600;
    color: string;
}
/** The host may supply a composition marker. The recipe only chooses its rectangle. */
 | {
    kind: 'marker';
    x: number;
    y: number;
    width: number;
    height: number;
};
/** Small layered canvas drawing, rendered by the host. No URLs, HTML, shaders or renderer handles. */
export interface GizmoSpriteRecipe {
    size: number;
    layers: {
        id: string;
        shapes: GizmoSpriteShape[];
    }[];
}
export interface GizmoSpriteFrame {
    at: number;
    offset: [number, number];
    /** Linear RGB material multiplier. */
    tint: [number, number, number];
    curve?: 'linear' | 'out-cubic' | 'out-quadratic';
}
/** Local cosmetic animation of one named layer; reduced motion retains tint only. */
export interface GizmoSpriteAnimation {
    layer: string;
    frames: GizmoSpriteFrame[];
}
export declare function gizmoSpriteError(value: unknown): string | null;
export declare function gizmoSpriteAnimationError(value: unknown): string | null;
export declare function spriteAnimationFrame(animation: GizmoSpriteAnimation, progress: number): GizmoSpriteFrame;
export declare function resolveGizmoSprite(definition: ObjectDefinition, state: unknown): GizmoSpriteRecipe | undefined;
