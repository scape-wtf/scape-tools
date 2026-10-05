import { type GizmoSynth } from './synthesis.js';
/** A shared, listener-local bus. All strikes feed these persistent effects. */
export interface GizmoAudioBus {
    /** Dry bus gain from silence to unity. */
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
/** Host-provided context for one deterministic sequence callback. */
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
/** One bounded sequence result emitted for the current opportunity. */
export interface GizmoSequenceStep {
    /** Delay before the next sequence opportunity, in seconds. */
    afterSeconds: number;
    /** Sound strikes scheduled against the shared bus. */
    strikes: {
        source: number;
        delaySeconds: number;
        sound: GizmoSynth;
    }[];
}
/** Author callback that returns one bounded step without using timers or I/O. */
export type GizmoSequence = (context: GizmoSequenceContext) => GizmoSequenceStep;
export declare function gizmoBusError(value: unknown): string | null;
export declare function gizmoSequenceError(value: unknown, sources: number): string | null;
