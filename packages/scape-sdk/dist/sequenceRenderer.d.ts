import { type GizmoAudioBus } from './sequence.js';
import { type GizmoSynth } from './synthesis.js';
export declare const GIZMO_BUS_FRAMES = 4096;
export declare const GIZMO_BUS_RATE = 48000;
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
    render(events: readonly {
        at: number;
        sound: GizmoSynth;
    }[]): Float32Array[];
}
