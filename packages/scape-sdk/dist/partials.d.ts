import { type GizmoSoundSamples } from './synthesis.js';
/** Multiplicative amplitude factors, in seconds and inverse seconds. */
export interface GizmoAmplitude {
    gain: number;
    attack: number;
    attackCurve?: 'linear' | 'sine-squared';
    decay?: number;
    release?: {
        at: number;
        time: number;
    };
    fadeOut: number;
}
/** A bounded, ordered signal chain. Filters and nonlinear stages are reusable sound primitives. */
export type GizmoSignalStage = {
    kind: 'pole';
    frequency: number;
    subtract?: number;
} | {
    kind: 'noise';
    seed: number;
    gain: number;
    decay: number;
} | {
    kind: 'soft-clip' | 'hard-clip';
    drive: number;
};
export interface GizmoPartialLayer {
    frequency: number;
    partials: {
        ratio: number;
        gain: number;
        decay: number;
    }[];
    /** Fractional frequency deviation and cycles per second. */
    vibrato?: {
        depth: number;
        rate: number;
    };
    stages?: GizmoSignalStage[];
    gain: number;
}
/** Additive oscillators, optional oversampling and ordered signal processing; no instrument presets. */
export interface GizmoPartialsSound {
    kind: 'partials';
    duration: number;
    oversample?: 1 | 2 | 4;
    layers: GizmoPartialLayer[];
    stages?: GizmoSignalStage[];
    amplitude: GizmoAmplitude;
    /** Parallel dry-signal echoes, followed by a final edge fade. */
    echoes?: {
        time: number;
        gain: number;
    }[];
    tailFade?: number;
}
export declare function gizmoPartialsError(value: unknown, path?: string): string | null;
/** Deterministic PCM only. Hosts render this in a worker, with their normal time/cache budgets. */
export declare function renderGizmoPartials(sound: GizmoPartialsSound, rate?: number): GizmoSoundSamples;
