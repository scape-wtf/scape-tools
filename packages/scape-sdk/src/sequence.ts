import { effectNumber, effectRecord } from './effectValidation.js';
import { gizmoSynthError, type GizmoSynth } from './synthesis.js';
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
export function gizmoBusError(value: unknown): string | null {
  let error = effectRecord(value, 'ambience.bus', ['gain', 'delay', 'reverb', 'compressor']);
  if (error)
    return error;
  const bus = value as GizmoAudioBus;
  error = effectNumber(bus.gain, 'ambience.bus.gain', 0, 1);
  if (error)
    return error;
  if (bus.delay !== undefined) {
    const d = bus.delay, p = 'ambience.bus.delay';
    error = effectRecord(d, p, ['time', 'feedback', 'wet', 'modulation']) ?? effectNumber(d.time, `${p}.time`, .005, 2)
      ?? effectNumber(d.feedback, `${p}.feedback`, 0, .85) ?? effectNumber(d.wet, `${p}.wet`, 0, 1);
    if (error)
      return error;
    if (d.modulation !== undefined) {
      const m = d.modulation;
      error = effectRecord(m, `${p}.modulation`, ['frequency', 'depth'])
        ?? effectNumber(m.frequency, `${p}.modulation.frequency`, .01, 5) ?? effectNumber(m.depth, `${p}.modulation.depth`, 0, Math.min(.02, d.time * .5));
      if (error)
        return error;
    }
  }
  if (bus.reverb !== undefined) {
    const r = bus.reverb, p = 'ambience.bus.reverb';
    error = effectRecord(r, p, ['duration', 'decay', 'seed', 'wet'])
      ?? effectNumber(r.duration, `${p}.duration`, .01, 3) ?? effectNumber(r.decay, `${p}.decay`, .1, 8)
      ?? effectNumber(r.seed, `${p}.seed`, 0, 0xffffffff) ?? (!Number.isInteger(r.seed) ? `${p}.seed must be an integer.` : null)
      ?? effectNumber(r.wet, `${p}.wet`, 0, 1);
    if (error)
      return error;
  }
  if (bus.compressor !== undefined) {
    const c = bus.compressor, p = 'ambience.bus.compressor';
    error = effectRecord(c, p, ['threshold', 'knee', 'ratio', 'attack', 'release'])
      ?? effectNumber(c.threshold, `${p}.threshold`, -60, 0) ?? effectNumber(c.knee, `${p}.knee`, 0, 40)
      ?? effectNumber(c.ratio, `${p}.ratio`, 1, 20) ?? effectNumber(c.attack, `${p}.attack`, .001, 1)
      ?? effectNumber(c.release, `${p}.release`, .01, 2);
    if (error)
      return error;
  }
  return null;
}
export function gizmoSequenceError(value: unknown, sources: number): string | null {
  let error = effectRecord(value, 'sequence', ['afterSeconds', 'strikes']);
  if (error)
    return error;
  const result = value as GizmoSequenceStep;
  error = effectNumber(result.afterSeconds, 'sequence.afterSeconds', .1, 30);
  if (error)
    return error;
  if (!Array.isArray(result.strikes) || result.strikes.length > 4)
    return 'sequence.strikes supports at most four strikes per step.';
  let work = 0;
  for (const [i, strike] of result.strikes.entries()) {
    const p = `sequence.strikes[${i}]`;
    error = effectRecord(strike, p, ['source', 'delaySeconds', 'sound'])
      ?? effectNumber(strike.source, `${p}.source`, 0, sources - 1)
      ?? (!Number.isInteger(strike.source) ? `${p}.source must be an integer.` : null)
      ?? effectNumber(strike.delaySeconds, `${p}.delaySeconds`, 0, .1)
      ?? gizmoSynthError(strike.sound, `${p}.sound`);
    if (error)
      return error;
    if (strike.sound.effects?.length)
      return `${p}.sound uses the shared ambience.bus; per-strike effects are not supported.`;
    if (strike.sound.duration > 3)
      return `${p}.sound.duration must be at most three seconds.`;
    work += strike.sound.voices.reduce((n, v) => n + v.duration, 0);
  }
  return work > 24 ? 'sequence exceeds 24 voice-seconds per step.' : null;
}
