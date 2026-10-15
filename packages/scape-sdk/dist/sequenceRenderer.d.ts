import { type GizmoAudioBus } from './sequence.js';
import { type GizmoSynth } from './synthesis.js';
export declare const GIZMO_BUS_FRAMES = 4096;
export declare const GIZMO_BUS_RATE = 48000;
export interface GizmoSequenceSpatial {
    id: string;
    gain: number;
    pan: number;
}
export interface GizmoSequenceRenderEvent {
    at: number;
    sound: GizmoSynth;
    source?: string;
    /** Initial host attenuation/pan, applied separately to the dry authored sound. */
    spatial?: {
        gain: number;
        pan: number;
    };
}
/** One shared DSP state per ambient definition. Hosts run it only in a worker. */
export declare class GizmoSequenceRenderer {
    private readonly bus;
    private frame;
    private strikes;
    private convolution;
    private delays;
    private compression;
    private readonly compressorCurve?;
    constructor(bus: GizmoAudioBus);
    render(events: readonly GizmoSequenceRenderEvent[], sources?: readonly GizmoSequenceSpatial[]): Float32Array[];
}
/** Listening prototype: render a complete source-local strike with bounded effect tails.
 * Effects follow the emitter. This does not reproduce a shared nonlinear bus compressor.
 */
export declare function renderGizmoSequenceClip(sound: GizmoSynth, bus: GizmoAudioBus): {
    rate: number;
    duration: number;
    samples: Float32Array<ArrayBuffer>[];
};
