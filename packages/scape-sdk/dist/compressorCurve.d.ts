import type { GizmoAudioBus } from './sequence.js';
type Compressor = NonNullable<GizmoAudioBus['compressor']>;
/** Static Web Audio-style curve: unity below threshold, an exponential knee above
 * it, then the declared ratio. Makeup stays at unity: compression never adds
 * an automatic output boost.
 * Reference semantics: WebKit's DynamicsCompressorKernel (kneeCurve/saturate).
 * The dimensionless knee coefficient is solved using its analytic dB slope;
 * this does not copy the browser's detector, lookahead or attack/release engine.
 */
export declare function createCompressorCurve({ threshold, knee, ratio }: Compressor): {
    gain: (_amplitude: number) => number;
    makeup: number;
};
export {};
