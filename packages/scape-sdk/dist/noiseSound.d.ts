import type { GizmoSoundSamples } from './synthesis.js';
/** Layered, filtered noise with optional sparse grains. All timbre belongs to the author. */
export interface GizmoNoiseSound {
    kind: 'noise';
    /** Seconds (.1–12). Rendered once at 48 kHz, then cached by the host. */
    duration: number;
    /** Unsigned 32-bit seed gives identical source samples on every platform. */
    seed: number;
    /** Correlated one-pole low-pass layers, cutoffs in Hz and gains from 0 to 1. */
    layers: {
        frequency: number;
        gain: number;
    }[];
    /** Slow sine modulation; speed is radians/second, and the full sum stays in 0–1. */
    modulation: {
        base: number;
        waves: {
            speed: number;
            amount: number;
        }[];
    };
    /** Short, independently filtered noise bursts over the continuous layers. */
    grains?: {
        start: number;
        end: number;
        /** Minimum/maximum seconds between burst starts. */
        interval: [number, number];
        duration: [number, number];
        amplitude: [number, number];
        /** Exponent applied to random duration/amplitude draws; 1 is uniform. */
        bias: number;
        /** One-pole coefficient (0–1), separate from the continuous layer cutoffs. */
        smoothing: number;
        /** Attack in seconds; decay is a fraction of each grain's duration. */
        attack: number;
        decay: number;
    };
    /** Linear fade at both ends, in seconds. */
    fade: number;
}
export declare function gizmoNoiseSoundError(value: unknown, path?: string): string | null;
export declare function renderGizmoNoise(sound: GizmoNoiseSound): GizmoSoundSamples;
