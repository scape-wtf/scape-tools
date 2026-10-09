/** Times are seconds relative to the start of a voice. Curve belongs to the incoming segment. */
export interface GizmoSoundPoint {
    /** Time in seconds from the start of the voice. */
    time: number;
    /** Value at this point, interpreted by the envelope field. */
    value: number;
    /** Interpolation used until the next point. */
    curve?: 'linear' | 'exponential' | 'step';
}
/** A constant value or a bounded time/value envelope. */
export type GizmoSoundEnvelope = number | GizmoSoundPoint[];
/** Biquad filter settings applied to one synthesized voice. */
export interface GizmoSoundFilter {
    /** Filter response shape. */
    type: 'lowpass' | 'highpass' | 'bandpass';
    /** Center or cutoff frequency in hertz. */
    frequency: number;
    /** Filter quality factor. */
    q: number;
}
/** One bounded oscillator/noise voice in a procedural sound. */
export interface GizmoSoundVoice {
    /** Waveform used by this voice. */
    wave: 'sine' | 'triangle' | 'square' | 'sawtooth' | 'noise';
    /** Start time in seconds. */
    start: number;
    /** Voice duration in seconds. */
    duration: number;
    /** Optional frequency envelope in hertz. */
    frequency?: GizmoSoundEnvelope;
    /** Amplitude envelope, from silence to the bounded voice gain. */
    gain: GizmoSoundEnvelope;
    /** Stereo pan from left (-1) to right (1). */
    pan?: number;
    /** Optional fade-in and fade-out durations in seconds. */
    fade?: [number, number];
    /** Noise duration used by noise voices. */
    noiseDuration?: number;
    /** Noise refresh rate used by noise voices. */
    noiseRate?: number;
    /** Optional filter applied after the oscillator. */
    filter?: GizmoSoundFilter;
}
/** One bounded effect in a procedural sound chain. */
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
    /** Discriminator for the synthesizer representation. */
    kind: 'synth';
    /** Total rendered duration in seconds. */
    duration: number;
    /** Optional deterministic seed for noise and diffuse effects. */
    seed?: number;
    /** Voices mixed into the sound. */
    voices: GizmoSoundVoice[];
    /** Optional ordered effects applied to the mixed voices. */
    effects?: GizmoSoundEffect[];
}
/** Rendered PCM samples returned by local SDK helpers. */
export interface GizmoSoundSamples {
    /** One Float32 channel array per output channel. */
    samples: Float32Array<ArrayBuffer>[];
    /** Sample rate in hertz. */
    rate: number;
    /** Duration represented by the sample arrays, in seconds. */
    duration: number;
}
/** Sample rate used by Scape's portable procedural renderer. */
export declare const GIZMO_SOUND_RATE = 48000;
export declare function gizmoSynthError(value: unknown, path?: string): string | null;
/** Render deterministic PCM samples for local audio tests. */
export declare function renderGizmoSynth(sound: GizmoSynth): GizmoSoundSamples;
