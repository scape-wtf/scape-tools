import { type GizmoPartialsSound } from './partials.js';
import { type GizmoNoiseSound } from './noiseSound.js';
import { type GizmoAudioBus } from './sequence.js';
import { type GizmoSynth, type GizmoSoundSamples } from './synthesis.js';
/** Procedural definitions or optional recorded PCM16 WAV imports. */
export type GizmoSound = GizmoSynth | GizmoNoiseSound | GizmoPartialsSound | string;
/** Named sound catalog referenced by audio timelines and ambience. */
export type GizmoSounds = Record<string, GizmoSound>;
/** Render a portable procedural or encoded sound into PCM samples for local tests. */
export declare function renderGizmoSound(sound: GizmoSound): GizmoSoundSamples;
/** One weighted sound choice in a playlist ambience definition. */
export interface GizmoSoundChoice {
    /** Name in the containing sound catalog. */
    sound: string;
    /** Playback gain. */
    gain: number;
    /** Playback rate multiplier. */
    rate: number;
    /** Stereo pan from left (-1) to right (1). */
    pan: number;
    /** Relative selection weight. */
    weight: number;
}
/** Host-scheduled randomized ambience playlist settings. */
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
/** Persistent sequence-bus ambience settings. */
export interface GizmoSequenceAmbience {
    /** Discriminator for the shared sequence-bus form. */
    mode: 'sequence';
    /** Persistent effect bus receiving sequence strikes. */
    bus: GizmoAudioBus;
    rangeCells: [number, number];
    maxSources: number;
    stereo: number;
    duckWhileSpeaking: boolean;
    /** Remaining level during speech ducking (0–1); defaults to 0. */
    duckGain?: number;
}
export type GizmoAmbience = GizmoPlaylistAmbience | GizmoSequenceAmbience;
/** One bounded start/stop command emitted by an audio timeline. */
/** Start or stop one named voice at a bounded timeline offset. */
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
    /** Stable key used to replace or cancel a prior timeline. */
    key: string;
    /** Timeline start offset in milliseconds. */
    at: number;
    /** Commands evaluated by the host. */
    commands: GizmoAudioCommand[];
}
/** Maximum encoded WAV size accepted by the SDK. */
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
