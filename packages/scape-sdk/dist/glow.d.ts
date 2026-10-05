/** Bounded decorative glow, evaluated by the host without per-frame author callbacks. */
export interface GizmoGlow {
    color: string;
    size: number;
    pulse: {
        speed: number;
        amount: number;
        phaseX: number;
    };
    opacity: {
        base: number;
        amount: number;
        speed: number;
        phaseY: number;
    };
    hue?: {
        speed: number;
        phaseY: number;
        saturation: number;
        lightness: number;
    };
}
/** The first actionable validation error, or null when the recipe is valid. */
export declare function gizmoGlowError(value: unknown): string | null;
export declare function validGizmoGlow(value: unknown): value is GizmoGlow;
export declare function gizmoGlowFrame(glow: GizmoGlow, seconds: number, x: number, y: number, reducedMotion?: boolean): {
    size: number;
    opacity: number;
    hue: number | undefined;
};
