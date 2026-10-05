/** Hex sRGB or explicit sRGB components from 0 to 1. */
export type GizmoLightColor = string | [number, number, number];
/** A rotating, warped field of seeded spots over a two-color wash. */
export interface GizmoLightPattern {
    kind: 'scattered';
    /** Position coefficients in scene pixels; the fractional sum seeds the pattern. */
    phase: [number, number];
    rotation: {
        speed: number;
        variation: number;
        phase: number;
    };
    density: number;
    warp: {
        frequency: [number, number];
        phase: [number, number];
        amount: number;
    };
    jitter: number;
    palette: GizmoLightColor[];
    spots: {
        /** Minimum/maximum radius in pattern-cell units. */
        size: [number, number];
        aspect: [number, number];
        edge: number;
        gain: [number, number];
        halo: {
            radius: [number, number];
            gain: number;
        };
        fade: {
            speed: [number, number];
            thresholds: [number, number];
        };
    };
    /** Uses light.color/innerColor across the rotated horizontal axis. */
    wash: {
        gain: number;
        falloff: number;
        blend: [number, number];
    };
}
/** Shared world-space light, not a sprite halo. Motion is bounded data, never a shader upload. */
export interface GizmoLight {
    /** Radius in grid cells (.25–12), independent of sprite size. */
    radiusCells: number;
    /** sRGB colors, mixed from the edge toward the center. */
    color: GizmoLightColor;
    innerColor?: GizmoLightColor;
    /** Additive overlay strength (0–1); basement defaults to the surface value. */
    intensity: number;
    basementIntensity?: number;
    /** Contribution to the shared basement darkness reduction (0–1). */
    illumination: number;
    falloff?: {
        start: number;
        edge: number;
        power: number;
    };
    /** Optional spatial pattern; radial lights remain the default. */
    pattern?: GizmoLightPattern;
    /** Continuous value noise. Reduced motion evaluates this recipe at time zero. */
    motion?: {
        /** Seed coefficients applied to scene pixel coordinates. */
        phase: [number, number];
        bias: number;
        bands: [speed: number, amount: number, offset: number][];
        flare?: [speed: number, low: number, high: number, amount: number, offset: number];
        drift?: {
            speed: [number, number];
            phase: [number, number];
            amount: number;
        };
        stretch?: {
            speed: [number, number];
            phase: [number, number];
            amount: number;
        };
        edge?: {
            scale: number;
            drift: number;
            amount: number;
        };
        radius?: [base: number, flicker: number];
    };
}
export declare function gizmoLightError(value: unknown): string | null;
