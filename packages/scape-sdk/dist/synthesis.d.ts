/** Times are seconds relative to the start of a voice. Curve belongs to the incoming segment. */
export interface GizmoSoundPoint {
    time: number;
    value: number;
    curve?: 'linear' | 'exponential' | 'step';
}
export type GizmoSoundEnvelope = number | GizmoSoundPoint[];
export interface GizmoSoundFilter {
    type: 'lowpass' | 'highpass' | 'bandpass';
    frequency: number;
    q: number;
}
export interface GizmoSoundVoice {
    wave: 'sine' | 'triangle' | 'square' | 'sawtooth' | 'noise';
    start: number;
    duration: number;
    frequency?: GizmoSoundEnvelope;
    gain: GizmoSoundEnvelope;
    pan?: number;
    fade?: [number, number];
    noiseDuration?: number;
    noiseRate?: number;
    filter?: GizmoSoundFilter;
}
export type GizmoSoundEffect = GizmoSoundFilter | {
    type: 'delay';
    time: number;
    feedback: number;
    mix: number;
    parallel?: boolean;
} | {
    type: 'noise-reverb';
    duration: number;
    decay: number;
    seed: number;
    mix: number;
    parallel?: boolean;
} | {
    type: 'reverb';
    decay: number;
    mix: number;
};
/** Portable sound design. No audio nodes, device access, timers or instrument presets. */
export interface GizmoSynth {
    kind: 'synth';
    duration: number;
    seed?: number;
    voices: GizmoSoundVoice[];
    effects?: GizmoSoundEffect[];
}
export interface GizmoSoundSamples {
    samples: Float32Array<ArrayBuffer>[];
    rate: number;
    duration: number;
}
export declare const GIZMO_SOUND_RATE = 48000;
export declare function gizmoSynthError(value: unknown, path?: string): string | null;
/** Deterministic PCM rendering. Hosts run this in a bounded worker, never on the game frame. */
export declare function renderGizmoSynth(sound: GizmoSynth): GizmoSoundSamples;
