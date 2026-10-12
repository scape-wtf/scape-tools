/** Cosmetic transforms over an authorized movement, independent of character artwork. */
export interface GizmoCharacterFrame {
    /** Normalized time, from 0 to 1. */
    at: number;
    /** Screen-plane offset in cells; positive Y lifts the character. */
    offset: [number, number];
    scale: [number, number];
    /** Screen-plane rotation in radians. */
    rotation: number;
}
/** Bounded transform animation; never grants movement or skeletal access. */
export interface GizmoCharacterMotion {
    durationMs: number;
    frames: GizmoCharacterFrame[];
}
export declare function gizmoCharacterMotionError(value: unknown): string | null;
/** Smooth interpolation of a validated recipe, with exact authored endpoints. */
export declare function characterMotionFrame(motion: GizmoCharacterMotion, progress: number): GizmoCharacterFrame;
