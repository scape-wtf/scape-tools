import type { GizmoAudioBus } from './sequence.js';

type Compressor = NonNullable<GizmoAudioBus['compressor']>;

/** Static Web Audio-style curve: unity below threshold, an exponential knee above
 * it, then the declared ratio. Makeup stays at unity: compression never adds
 * an automatic output boost.
 * Reference semantics: WebKit's DynamicsCompressorKernel (kneeCurve/saturate).
 * The dimensionless knee coefficient is solved using its analytic dB slope;
 * this does not copy the browser's detector, lookahead or attack/release engine.
 */
export function createCompressorCurve({ threshold, knee, ratio }: Compressor) {
  const start = 10 ** (threshold / 20),
    end = start * 10 ** (knee / 20);
  const slope = 1 / ratio;
  if (ratio === 1) return { gain: (_amplitude: number) => 1, makeup: 1 };

  // With u = k * (end - start), the knee is start + span * (1-exp(-u*p))/u.
  // Match its logarithmic slope to 1/ratio at the upper knee boundary. Solving
  // once per bus avoids repeated coefficient searches on every audio chunk.
  let coefficient = 0;
  if (knee > 0) {
    let low = 0,
      high = 64;
    for (let iteration = 0; iteration < 40; iteration++) {
      coefficient = (low + high) / 2;
      const output = start + ((end - start) * -Math.expm1(-coefficient)) / coefficient;
      const endSlope = (end * Math.exp(-coefficient)) / output;
      if (endSlope > slope) low = coefficient;
      else high = coefficient;
    }
  }
  const kneeOutput = (amplitude: number) =>
    start +
    ((end - start) * -Math.expm1((-coefficient * (amplitude - start)) / (end - start))) /
      coefficient;
  const upperOutput = knee > 0 ? kneeOutput(end) : start;
  const output = (amplitude: number): number => {
    if (amplitude <= start) return amplitude;
    if (knee > 0 && amplitude < end) return kneeOutput(amplitude);
    return upperOutput * (amplitude / end) ** slope;
  };
  return {
    gain: (amplitude: number) => (amplitude <= start ? 1 : output(amplitude) / amplitude),
    makeup: 1,
  };
}
