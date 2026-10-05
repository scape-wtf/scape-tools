import { effectNumber, effectRecord } from './effectValidation.js';
/** Hex sRGB or explicit sRGB components from 0 to 1. */
export type GizmoLightColor = string | [number, number, number];

/** A rotating, warped field of seeded spots over a two-color wash. */
export interface GizmoLightPattern {
  kind: 'scattered';
  /** Position coefficients in scene pixels; the fractional sum seeds the pattern. */
  phase: [number, number];
  rotation: { speed: number; variation: number; phase: number };
  density: number;
  warp: { frequency: [number, number]; phase: [number, number]; amount: number };
  jitter: number;
  palette: GizmoLightColor[];
  spots: {
    /** Minimum/maximum radius in pattern-cell units. */
    size: [number, number];
    aspect: [number, number];
    edge: number;
    gain: [number, number];
    halo: { radius: [number, number]; gain: number };
    fade: { speed: [number, number]; thresholds: [number, number] };
  };
  /** Uses light.color/innerColor across the rotated horizontal axis. */
  wash: { gain: number; falloff: number; blend: [number, number] };
}

/** Shared world-space light, not a sprite halo. Motion is bounded data, never a shader upload. */
export interface GizmoLight {
  /** Radius in grid cells (.25–12), independent of sprite size. */
  radiusCells: number;
  /** sRGB colors, mixed from the edge toward the center. */
  color: GizmoLightColor;
  innerColor?: GizmoLightColor;
  /** Additive overlay strength (0–1); basement defaults to the surface value. */
  intensity: number;
  basementIntensity?: number;
  /** Contribution to the shared basement darkness reduction (0–1). */
  illumination: number;
  falloff?: { start: number; edge: number; power: number };
  /** Optional spatial pattern; radial lights remain the default. */
  pattern?: GizmoLightPattern;
  /** Continuous value noise. Reduced motion evaluates this recipe at time zero. */
  motion?: {
    /** Seed coefficients applied to scene pixel coordinates. */
    phase: [number, number];
    bias: number;
    bands: [speed: number, amount: number, offset: number][];
    flare?: [speed: number, low: number, high: number, amount: number, offset: number];
    drift?: { speed: [number, number]; phase: [number, number]; amount: number };
    stretch?: { speed: [number, number]; phase: [number, number]; amount: number };
    edge?: { scale: number; drift: number; amount: number };
    radius?: [base: number, flicker: number];
  };
}
export function gizmoLightError(value: unknown): string | null {
    let error = effectRecord(value, 'light', ['radiusCells', 'color', 'innerColor', 'intensity', 'basementIntensity', 'illumination', 'falloff', 'motion', 'pattern']);
    if (error)
        return error;
    const v = value as GizmoLight;
    for (const key of ['color', 'innerColor'] as const) {
        if (key === 'color' || v[key] !== undefined) {
            error = lightColorError(v[key], `light.${key}`);
            if (error) return error;
        }
    }
    if (v.pattern !== undefined && v.motion !== undefined) return 'light.pattern and light.motion cannot be combined.';
    if (v.pattern !== undefined) {
        error = lightPatternError(v.pattern);
        if (error) return error;
    }
    for (const [key, min, max] of [['radiusCells', .25, 12], ['intensity', 0, 1], ['illumination', 0, 1]] as const) {
        error = effectNumber(v[key], `light.${key}`, min, max);
        if (error)
            return error;
    }
    if (v.basementIntensity !== undefined) {
        error = effectNumber(v.basementIntensity, 'light.basementIntensity', 0, 1);
        if (error)
            return error;
    }
    if (v.falloff !== undefined) {
        error = effectRecord(v.falloff, 'light.falloff', ['start', 'edge', 'power']) ?? effectNumber(v.falloff.start, 'light.falloff.start', 0, .8) ?? effectNumber(v.falloff.edge, 'light.falloff.edge', .81, 1) ?? effectNumber(v.falloff.power, 'light.falloff.power', .25, 8);
        if (error)
            return error;
    }
    const m = v.motion;
    if (m === undefined)
        return null;
    error = effectRecord(m, 'light.motion', ['phase', 'bias', 'bands', 'flare', 'drift', 'stretch', 'edge', 'radius']);
    if (error)
        return error;
    error = tuple(m.phase, 'light.motion.phase', [[-8, 8], [-8, 8]]) ?? effectNumber(m.bias, 'light.motion.bias', -.5, .5);
    if (error)
        return error;
    if (!Array.isArray(m.bands) || m.bands.length > 4)
        return 'light.motion.bands supports up to four noise bands.';
    for (const [i, band] of m.bands.entries()) {
        error = tuple(band, `light.motion.bands[${i}]`, [[0, 20], [0, .5], [0, 1000]]);
        if (error)
            return error;
    }
    if (m.flare !== undefined) {
        error = tuple(m.flare, 'light.motion.flare', [[0, 20], [0, .99], [.01, 1], [0, .5], [0, 1000]]);
        if (error)
            return error;
        if (m.flare[2] <= m.flare[1])
            return 'light.motion.flare high must exceed low.';
    }
    for (const key of ['drift', 'stretch'] as const) {
        const w = m[key];
        if (w === undefined)
            continue;
        error = effectRecord(w, `light.motion.${key}`, ['speed', 'phase', 'amount']) ?? tuple(w.speed, `light.motion.${key}.speed`, [[0, 20], [0, 20]]) ?? tuple(w.phase, `light.motion.${key}.phase`, [[0, 1000], [0, 1000]]) ?? effectNumber(w.amount, `light.motion.${key}.amount`, 0, .4);
        if (error)
            return error;
    }
    if (m.edge !== undefined) {
        error = effectRecord(m.edge, 'light.motion.edge', ['scale', 'drift', 'amount']) ?? effectNumber(m.edge.scale, 'light.motion.edge.scale', .1, 16) ?? effectNumber(m.edge.drift, 'light.motion.edge.drift', 0, 20) ?? effectNumber(m.edge.amount, 'light.motion.edge.amount', 0, .4);
        if (error)
            return error;
    }
    if (m.radius !== undefined) {
        error = tuple(m.radius, 'light.motion.radius', [[.5, 1.5], [0, .5]]);
        if (error)
            return error;
    }
    return null;
}

function tuple(value: unknown, path: string, bounds: readonly (readonly [number, number])[]): string | null {
  if (!Array.isArray(value) || value.length !== bounds.length) return `${path} must contain ${bounds.length} values.`;
  for (let i = 0; i < bounds.length; i++) {
    const error = effectNumber(value[i], `${path}[${i}]`, ...bounds[i]);
    if (error) return error;
  }
  return null;
}
function lightColorError(value: unknown, path: string): string | null {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return null;
  if (Array.isArray(value)) return tuple(value, path, [[0, 1], [0, 1], [0, 1]]);
  return `${path} must be a six-digit hex color or three sRGB components from 0 to 1.`;
}
function range(value: unknown, path: string, min: number, max: number, strict = false): string | null {
  const error = tuple(value, path, [[min, max], [min, max]]);
  if (error) return error;
  const [low, high] = value as [number, number];
  return high < low || strict && high === low ? `${path} must have ${strict ? 'increasing' : 'ordered'} bounds.` : null;
}
function lightPatternError(value: unknown): string | null {
  const path = 'light.pattern';
  let error = effectRecord(value, path, ['kind', 'phase', 'rotation', 'density', 'warp', 'jitter', 'palette', 'spots', 'wash']);
  if (error) return error;
  const p = value as GizmoLightPattern;
  if (p.kind !== 'scattered') return `${path}.kind must be scattered.`;
  error = tuple(p.phase, `${path}.phase`, [[-8, 8], [-8, 8]])
    ?? effectNumber(p.density, `${path}.density`, 1, 16)
    ?? effectNumber(p.jitter, `${path}.jitter`, 0, 1)
    ?? effectRecord(p.rotation, `${path}.rotation`, ['speed', 'variation', 'phase']);
  if (error) return error;
  error = effectNumber(p.rotation.speed, `${path}.rotation.speed`, -2, 2)
    ?? effectNumber(p.rotation.variation, `${path}.rotation.variation`, -2, 2)
    ?? effectNumber(p.rotation.phase, `${path}.rotation.phase`, -Math.PI * 2, Math.PI * 2)
    ?? effectRecord(p.warp, `${path}.warp`, ['frequency', 'phase', 'amount']);
  if (error) return error;
  error = tuple(p.warp.frequency, `${path}.warp.frequency`, [[0, 16], [0, 16]])
    ?? tuple(p.warp.phase, `${path}.warp.phase`, [[-100, 100], [-100, 100]])
    ?? effectNumber(p.warp.amount, `${path}.warp.amount`, 0, 2);
  if (error) return error;
  if (!Array.isArray(p.palette) || p.palette.length < 1 || p.palette.length > 8) return `${path}.palette requires 1–8 colors.`;
  for (const [i, color] of p.palette.entries()) {
    error = lightColorError(color, `${path}.palette[${i}]`);
    if (error) return error;
  }
  const s = p.spots;
  error = effectRecord(s, `${path}.spots`, ['size', 'aspect', 'edge', 'gain', 'halo', 'fade']);
  if (error) return error;
  error = range(s.size, `${path}.spots.size`, .005, .5)
    ?? range(s.aspect, `${path}.spots.aspect`, .1, 1)
    ?? effectNumber(s.edge, `${path}.spots.edge`, 0, .9)
    ?? range(s.gain, `${path}.spots.gain`, 0, 1)
    ?? effectRecord(s.halo, `${path}.spots.halo`, ['radius', 'gain']);
  if (error) return error;
  error = range(s.halo.radius, `${path}.spots.halo.radius`, 0, .5, true)
    ?? effectNumber(s.halo.gain, `${path}.spots.halo.gain`, 0, 1)
    ?? effectRecord(s.fade, `${path}.spots.fade`, ['speed', 'thresholds']);
  if (error) return error;
  error = range(s.fade.speed, `${path}.spots.fade.speed`, 0, 4)
    ?? range(s.fade.thresholds, `${path}.spots.fade.thresholds`, 0, 1, true)
    ?? effectRecord(p.wash, `${path}.wash`, ['gain', 'falloff', 'blend']);
  if (error) return error;
  return effectNumber(p.wash.gain, `${path}.wash.gain`, 0, 1)
    ?? effectNumber(p.wash.falloff, `${path}.wash.falloff`, 0, .8)
    ?? range(p.wash.blend, `${path}.wash.blend`, -2, 2, true);
}
