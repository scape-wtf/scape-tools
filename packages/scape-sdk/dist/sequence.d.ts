import { type GizmoSynth } from './synthesis.js';
/** A shared, listener-local bus. All strikes feed these persistent effects. */
export interface GizmoAudioBus {
    gain: number;
    delay?: {
        time: number;
        feedback: number;
        wet: number;
        modulation?: {
            frequency: number;
            depth: number;
        };
    };
    reverb?: {
        duration: number;
        decay: number;
        seed: number;
        wet: number;
    };
    compressor?: {
        threshold: number;
        knee: number;
        ratio: number;
        attack: number;
        release: number;
    };
}
export interface GizmoSequenceContext {
    /** Monotonic opportunity counter, including steps that produce no sound. */
    step: number;
    /** Nearest-first source order; positions in world cells, with host-derived attenuation and pan. */
    sources: readonly {
        x: number;
        y: number;
        gain: number;
        pan: number;
    }[];
}
export interface GizmoSequenceStep {
    afterSeconds: number;
    strikes: {
        source: number;
        delaySeconds: number;
        sound: GizmoSynth;
    }[];
}
export type GizmoSequence = (context: GizmoSequenceContext) => GizmoSequenceStep;
export declare function gizmoBusError(value: unknown): string | null;
export declare function gizmoSequenceError(value: unknown, sources: number): string | null;
