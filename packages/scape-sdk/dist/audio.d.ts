import { type GizmoPartialsSound } from './partials.js';
import { type GizmoNoiseSound } from './noiseSound.js';
import { type GizmoAudioBus } from './sequence.js';
import { type GizmoSynth, type GizmoSoundSamples } from './synthesis.js';
/** Procedural definitions or optional recorded PCM16 WAV imports. */
export type GizmoSound = GizmoSynth | GizmoNoiseSound | GizmoPartialsSound | string;
export type GizmoSounds = Record<string, GizmoSound>;
export declare function renderGizmoSound(sound: GizmoSound): GizmoSoundSamples;
export interface GizmoSoundChoice {
    sound: string;
    gain: number;
    rate: number;
    pan: number;
    weight: number;
}
export interface GizmoPlaylistAmbience {
    /** Loop gain divided by sqrt(current audible sources); defaults to false. */
    normalizeSources?: boolean;
    /** Loop start coefficients in seconds per cell, each −16 to 16; defaults to zero. */
    loopPhase?: [number, number];
    sounds: GizmoSoundChoice[];
    intervalSeconds: [number, number];
    chance: number;
    rangeCells: [number, number];
    maxSources: number;
    stereo: number;
    loop: boolean;
    duckWhileSpeaking: boolean;
    /** Remaining level during speech ducking (0–1); defaults to 0. */
    duckGain?: number;
}
export interface GizmoSequenceAmbience {
    mode: 'sequence';
    bus: GizmoAudioBus;
    rangeCells: [number, number];
    maxSources: number;
    stereo: number;
    duckWhileSpeaking: boolean;
    /** Remaining level during speech ducking (0–1); defaults to 0. */
    duckGain?: number;
}
export type GizmoAmbience = GizmoPlaylistAmbience | GizmoSequenceAmbience;
export type GizmoAudioCommand = {
    kind: 'stop';
    voice: string;
    delayMs: number;
} | {
    kind: 'play';
    voice: string;
    delayMs: number;
    sound: string;
    gain: number;
    rate: number;
    loop: boolean;
    rangeCells: [number, number];
    stereo: number;
};
/** A bounded cosmetic response to an accepted state transition, independent of visual animation. */
export interface GizmoAudioTimeline {
    key: string;
    at: number;
    commands: GizmoAudioCommand[];
}
export declare const GIZMO_AUDIO_MAX_BYTES = 960044;
/** Validate before allocating playback resources. Supports recorded or generated mono/stereo WAV. */
export declare function readGizmoSound(encoded: string): {
    samples: Float32Array<ArrayBuffer>[];
    rate: number;
    duration: number;
};
export declare function gizmoSoundsError(value: unknown): string | null;
export declare function gizmoAmbienceError(value: unknown, sounds?: GizmoSounds): string | null;
export declare function validGizmoAmbience(value: unknown): value is GizmoAmbience;
export declare function gizmoAudioError(value: unknown, sounds: GizmoSounds): string | null;
/** File encoding only. Authors supply samples created by any recording or synthesis tool. */
export declare function encodeGizmoWav(channels: readonly Float32Array[], rate: number): string;
