import { effectNumber, effectRecord } from './effectValidation.js';
import { GIZMO_SOUND_RATE, type GizmoSoundSamples } from './synthesis.js';

/** Multiplicative amplitude factors, in seconds and inverse seconds. */
export interface GizmoAmplitude {
  gain: number;
  attack: number;
  attackCurve?: 'linear' | 'sine-squared';
  decay?: number;
  release?: { at: number; time: number };
  fadeOut: number;
}
/** A bounded, ordered signal chain. Filters and nonlinear stages are reusable sound primitives. */
export type GizmoSignalStage =
  | { kind: 'pole'; frequency: number; subtract?: number }
  | { kind: 'noise'; seed: number; gain: number; decay: number }
  | { kind: 'soft-clip' | 'hard-clip'; drive: number };
export interface GizmoPartialLayer {
  frequency: number;
  partials: { ratio: number; gain: number; decay: number }[];
  /** Fractional frequency deviation and cycles per second. */
  vibrato?: { depth: number; rate: number };
  stages?: GizmoSignalStage[];
  gain: number;
}
/** Additive oscillators, optional oversampling and ordered signal processing; no instrument presets. */
export interface GizmoPartialsSound {
  kind: 'partials';
  duration: number;
  oversample?: 1 | 2 | 4;
  layers: GizmoPartialLayer[];
  stages?: GizmoSignalStage[];
  amplitude: GizmoAmplitude;
  /** Parallel dry-signal echoes, followed by a final edge fade. */
  echoes?: { time: number; gain: number }[];
  tailFade?: number;
}

function stagesError(value: unknown, path: string): string | null {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length > 8) return `${path} supports up to eight stages.`;
  for (const [i, stage] of value.entries()) {
    const p = `${path}[${i}]`, shape = effectRecord(stage, p, ['kind', 'frequency', 'subtract', 'seed', 'gain', 'decay', 'drive']);
    if (shape) return shape;
    if (stage.kind === 'pole') {
      const error = effectRecord(stage, p, ['kind', 'frequency', 'subtract'])
        ?? effectNumber(stage.frequency, `${p}.frequency`, 20, 20000)
        ?? (stage.subtract === undefined ? null : effectNumber(stage.subtract, `${p}.subtract`, 0, 1));
      if (error) return error;
    } else if (stage.kind === 'noise') {
      const error = effectRecord(stage, p, ['kind', 'seed', 'gain', 'decay'])
        ?? effectNumber(stage.seed, `${p}.seed`, 1, 0xffffffff)
        ?? (!Number.isInteger(stage.seed) ? `${p}.seed must be an integer.` : null)
        ?? effectNumber(stage.gain, `${p}.gain`, 0, 1) ?? effectNumber(stage.decay, `${p}.decay`, 0, 2000);
      if (error) return error;
    } else if (stage.kind === 'soft-clip' || stage.kind === 'hard-clip') {
      const error = effectRecord(stage, p, ['kind', 'drive']) ?? effectNumber(stage.drive, `${p}.drive`, .01, 100);
      if (error) return error;
    } else return `${p}.kind is unsupported.`;
  }
  return null;
}
export function gizmoPartialsError(value: unknown, path = 'sound'): string | null {
  const shape = effectRecord(value, path, ['kind', 'duration', 'oversample', 'layers', 'stages', 'amplitude', 'echoes', 'tailFade']);
  if (shape) return shape;
  const sound = value as GizmoPartialsSound;
  if (sound.kind !== 'partials') return `${path}.kind must be partials.`;
  let error = effectNumber(sound.duration, `${path}.duration`, .005, 4);
  if (error) return error;
  if (![1, 2, 4].includes(sound.oversample ?? 1)) return `${path}.oversample must be 1, 2 or 4.`;
  if (!Array.isArray(sound.layers) || !sound.layers.length || sound.layers.length > 8) return `${path}.layers requires 1–8 layers.`;
  let work = 0;
  for (const [i, layer] of sound.layers.entries()) {
    const p = `${path}.layers[${i}]`;
    error = effectRecord(layer, p, ['frequency', 'partials', 'vibrato', 'stages', 'gain'])
      ?? effectNumber(layer.frequency, `${p}.frequency`, 20, 16000) ?? effectNumber(layer.gain, `${p}.gain`, 0, 1)
      ?? stagesError(layer.stages, `${p}.stages`);
    if (error) return error;
    if (!Array.isArray(layer.partials) || !layer.partials.length || layer.partials.length > 32) return `${p}.partials requires 1–32 partials.`;
    for (const [j, partial] of layer.partials.entries()) {
      const pp = `${p}.partials[${j}]`;
      error = effectRecord(partial, pp, ['ratio', 'gain', 'decay'])
        ?? effectNumber(partial.ratio, `${pp}.ratio`, .125, 64)
        ?? effectNumber(partial.gain, `${pp}.gain`, -1, 1) ?? effectNumber(partial.decay, `${pp}.decay`, 0, 2000);
      if (error) return error;
    }
    if (layer.vibrato !== undefined) {
      error = effectRecord(layer.vibrato, `${p}.vibrato`, ['depth', 'rate'])
        ?? effectNumber(layer.vibrato.depth, `${p}.vibrato.depth`, 0, .1)
        ?? effectNumber(layer.vibrato.rate, `${p}.vibrato.rate`, .01, 30);
      if (error) return error;
    }
    work += (layer.partials.length + (layer.stages?.length ?? 0)) * sound.duration * (sound.oversample ?? 1);
  }
  work += (sound.stages?.length ?? 0) * sound.duration * (sound.oversample ?? 1);
  if (work > 512) return `${path} exceeds 512 operator-seconds of synthesis work.`;
  error = stagesError(sound.stages, `${path}.stages`)
    ?? effectRecord(sound.amplitude, `${path}.amplitude`, ['gain', 'attack', 'attackCurve', 'decay', 'release', 'fadeOut']);
  if (error) return error;
  const a = sound.amplitude, p = `${path}.amplitude`;
  error = effectNumber(a.gain, `${p}.gain`, 0, 1) ?? effectNumber(a.attack, `${p}.attack`, 0, sound.duration)
    ?? effectNumber(a.fadeOut, `${p}.fadeOut`, .001, sound.duration)
    ?? (a.decay === undefined ? null : effectNumber(a.decay, `${p}.decay`, 0, 2000));
  if (error) return error;
  if (a.attackCurve !== undefined && !['linear', 'sine-squared'].includes(a.attackCurve)) return `${p}.attackCurve is unsupported.`;
  if (a.release !== undefined) {
    error = effectRecord(a.release, `${p}.release`, ['at', 'time'])
      ?? effectNumber(a.release.at, `${p}.release.at`, 0, sound.duration)
      ?? effectNumber(a.release.time, `${p}.release.time`, .001, 4);
    if (error) return error;
  }
  if (sound.echoes !== undefined) {
    if (!Array.isArray(sound.echoes) || sound.echoes.length > 4) return `${path}.echoes supports up to four taps.`;
    for (const echo of sound.echoes) {
      error = effectRecord(echo, `${path}.echoes`, ['time', 'gain'])
        ?? effectNumber(echo.time, `${path}.echoes.time`, .001, 4) ?? effectNumber(echo.gain, `${path}.echoes.gain`, 0, 1);
      if (error) return error;
    }
  }
  return sound.tailFade === undefined ? null : effectNumber(sound.tailFade, `${path}.tailFade`, .001, sound.duration);
}

function signalChain(stages: GizmoSignalStage[] = [], rate: number): (sample: number) => number {
  const chain = stages.map(stage => {
    if (stage.kind === 'pole') {
      let history = 0;
      const smoothing = 1 - Math.exp(-2 * Math.PI * stage.frequency / rate);
      return (sample: number) => {
        history += smoothing * (sample - history);
        return stage.subtract === undefined ? history : sample - history * stage.subtract;
      };
    }
    if (stage.kind === 'noise') {
      let seed = stage.seed, gain = stage.gain;
      const decay = Math.exp(-stage.decay / rate);
      return (sample: number) => {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        const value = sample + seed / 0x80000000 * gain;
        gain *= decay;
        return value;
      };
    }
    return (sample: number) => {
      const driven = sample * stage.drive;
      return stage.kind === 'soft-clip' ? driven / (1 + Math.abs(driven)) : Math.max(-1, Math.min(1, driven));
    };
  });
  return sample => { for (const stage of chain) sample = stage(sample); return sample; };
}

/** Deterministic PCM only. Hosts render this in a worker, with their normal time/cache budgets. */
export function renderGizmoPartials(sound: GizmoPartialsSound, rate = GIZMO_SOUND_RATE): GizmoSoundSamples {
  const error = gizmoPartialsError(sound); if (error) throw new Error(error);
  if (!Number.isInteger(rate) || rate < 8000 || rate > 48000) throw new Error('Invalid sample rate');
  const frames = Math.ceil(sound.duration * rate), samples = new Float32Array(frames);
  const oversample = sound.oversample ?? 1, renderRate = rate * oversample;
  const layers = sound.layers.map(layer => ({
    ...layer, phase: 0, process: signalChain(layer.stages, renderRate),
    partials: layer.partials.filter(partial => layer.frequency * partial.ratio * (1 + (layer.vibrato?.depth ?? 0)) < rate * (oversample > 1 ? .45 : .5)).map(partial => {
      const angle = 2 * Math.PI * layer.frequency * partial.ratio / renderRate, decay = Math.exp(-partial.decay / renderRate);
      return { ...partial, real: partial.gain, imaginary: 0, rotationReal: Math.cos(angle) * decay, rotationImaginary: Math.sin(angle) * decay };
    }),
  }));
  const process = signalChain(sound.stages, renderRate), a = sound.amplitude;
  for (let i = 0; i < frames; i++) {
    let value = 0;
    for (let sub = 0; sub < oversample; sub++) {
      value = 0;
      const t = (i * oversample + sub) / renderRate;
      for (const layer of layers) {
        let signal = 0;
        if (layer.vibrato) layer.phase += 2 * Math.PI * layer.frequency * (1 + layer.vibrato.depth * Math.sin(2 * Math.PI * layer.vibrato.rate * t)) / renderRate;
        for (const partial of layer.partials) {
          if (layer.vibrato) signal += Math.sin(layer.phase * partial.ratio) * partial.gain * Math.exp(-t * partial.decay);
          else {
            signal += partial.imaginary;
            const real = partial.real * partial.rotationReal - partial.imaginary * partial.rotationImaginary;
            partial.imaginary = partial.real * partial.rotationImaginary + partial.imaginary * partial.rotationReal;
            partial.real = real;
          }
        }
        value += layer.process(signal) * layer.gain;
      }
      value = process(value);
    }
    const t = i / rate, attack = a.attack ? Math.min(1, t / a.attack) : 1;
    const envelope = (a.attackCurve === 'sine-squared' ? Math.sin(attack * Math.PI / 2) ** 2 : attack)
      * Math.exp(-t * (a.decay ?? 0)) * (a.release ? Math.exp(-Math.max(0, t - a.release.at) / a.release.time) : 1)
      * Math.min(1, (sound.duration - t) / a.fadeOut);
    samples[i] = value * envelope * a.gain;
  }
  if (sound.echoes?.length) {
    const dry = samples.slice();
    for (const echo of sound.echoes) {
      const delay = Math.round(rate * echo.time);
      for (let i = delay; i < frames; i++) samples[i] += dry[i - delay] * echo.gain;
    }
  }
  for (let i = 0; i < frames; i++) {
    if (sound.tailFade) samples[i] *= Math.min(1, (frames - 1 - i) / (rate * sound.tailFade));
    if (!Number.isFinite(samples[i])) throw new Error('Nonfinite sound sample');
    samples[i] = Math.max(-1, Math.min(1, samples[i]));
  }
  return { samples: [samples], rate, duration: frames / rate };
}
