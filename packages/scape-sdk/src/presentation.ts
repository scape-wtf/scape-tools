/** JSON-only presentation data. The host owns rendering, time and audio devices. */
/** A normalized quaternion in `[x, y, z, w]` order. */
export type Quaternion = [number, number, number, number];
/** One host-rendered pose and shadow sample in a presentation timeline. */
export interface GizmoFrame {
  /** Model orientation. */
  rotation: Quaternion;
  /** Horizontal world position offset. */
  x: number;
  /** Vertical lift above the authored placement. */
  lift: number;
  /** Shadow width, height, and opacity. */
  shadow: [number, number, number]; // width, height, opacity
}
/** A named, bounded cosmetic animation timeline. */
export interface GizmoTimeline {
  /** Stable animation key used by the host to replace a prior timeline. */
  key: string;
  /** Start time relative to the accepted state change, in milliseconds. */
  at: number;
  /** Timeline duration in milliseconds. */
  durationMs: number;
  /** Ordered model frames sampled by the host. */
  frames: GizmoFrame[];
  /** Optional numeric payload for host label or effect selection. */
  number?: number;
}
/** One sampled label transform in a presentation effect. */
export interface GizmoLabelFrame {
  /** Horizontal scale. */
  scaleX: number;
  /** Vertical scale. */
  scaleY: number;
  /** Rotation in radians. */
  rotation: number;
  /** Vertical offset. */
  y: number;
  /** Opacity from 0 to 1. */
  opacity: number;
}
/** Embedded model presentation settings consumed by the host renderer. */
export interface GizmoPresentation {
  model: string; // Embedded GLB base64; external resources are rejected.
  textureSize: number;
  nominalSize: number;
  fitSize: number;
  rest: Quaternion;
  materials: Record<string, string>;
  lighting: {
    sky: string;
    ground: string;
    ambient: number;
    key: number;
    fill: number;
    exposure: number;
    keyColor: string;
    fillColor: string;
    keyPosition: [number, number, number];
    fillPosition: [number, number, number];
  };
  shadow: { color: string; xFactor: number; z: number };
  tap: { name: string; payload: Record<string, unknown> };
  label?: {
    colors: string[];
    durationMs: number;
    riseMs: number;
    fadeMs: number;
    offsetY: number;
    height: number;
    frames: GizmoLabelFrame[];
  };
}
const finite = (n: unknown, min: number, max: number): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const obj = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const color = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const vector = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every(n => finite(n, -1000, 1000));
const quat = (v: unknown): v is Quaternion =>
  Array.isArray(v) &&
  v.length === 4 &&
  v.every(n => finite(n, -1, 1)) &&
  Math.abs(v.reduce((s, n) => s + n * n, 0) - 1) < 0.001;
export function validGizmoPresentation(v: unknown): v is GizmoPresentation {
  if (
    !obj(v) ||
    typeof v.model !== 'string' ||
    v.model.length > 700000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(v.model) ||
    !Number.isInteger(v.textureSize) ||
    !finite(v.textureSize, 64, 512) ||
    !finite(v.nominalSize, 32, 512) ||
    !finite(v.fitSize, 1, v.textureSize) ||
    !quat(v.rest) ||
    !obj(v.materials) ||
    Object.keys(v.materials).length > 16 ||
    !Object.entries(v.materials).every(([k, c]) => k.length <= 80 && color(c)) ||
    !obj(v.lighting) ||
    !color(v.lighting.sky) ||
    !color(v.lighting.ground) ||
    !color(v.lighting.keyColor) ||
    !color(v.lighting.fillColor) ||
    !vector(v.lighting.keyPosition) ||
    !vector(v.lighting.fillPosition) ||
    !['ambient', 'key', 'fill', 'exposure'].every(k => finite(v.lighting[k], 0, 4)) ||
    !obj(v.shadow) ||
    !color(v.shadow.color) ||
    !finite(v.shadow.xFactor, -2, 2) ||
    !finite(v.shadow.z, -500, 500) ||
    !obj(v.tap) ||
    typeof v.tap.name !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(v.tap.name) ||
    !obj(v.tap.payload) ||
    JSON.stringify(v.tap.payload).length > 2048 ||
    v.sound !== undefined
  )
    return false;
  const l = v.label;
  return (
    l === undefined ||
    (obj(l) &&
      Array.isArray(l.colors) &&
      l.colors.length > 0 &&
      l.colors.length <= 32 &&
      l.colors.every(color) &&
      finite(l.durationMs, 100, 5000) &&
      finite(l.riseMs, 1, l.durationMs) &&
      finite(l.fadeMs, 1, l.durationMs) &&
      finite(l.offsetY, -100, 100) &&
      finite(l.height, 8, 64) &&
      Array.isArray(l.frames) &&
      l.frames.length >= 2 &&
      l.frames.length <= 181 &&
      l.frames.every(
        (f: unknown) =>
          obj(f) &&
          finite(f.scaleX, 0, 3) &&
          finite(f.scaleY, 0, 3) &&
          finite(f.rotation, -Math.PI, Math.PI) &&
          finite(f.y, -100, 100) &&
          finite(f.opacity, 0, 1),
      ))
  );
}
export function validGizmoTimeline(v: unknown): v is GizmoTimeline {
  return (
    obj(v) &&
    typeof v.key === 'string' &&
    v.key.length <= 100 &&
    Number.isSafeInteger(v.at) &&
    v.at >= 0 &&
    finite(v.durationMs, 0, 5000) &&
    (v.number === undefined ||
      (Number.isSafeInteger(v.number) && v.number > 0 && v.number <= 1000000)) &&
    Array.isArray(v.frames) &&
    v.frames.length >= 1 &&
    v.frames.length <= 181 &&
    v.frames.every(
      f =>
        obj(f) &&
        quat(f.rotation) &&
        finite(f.x, -512, 512) &&
        finite(f.lift, -512, 512) &&
        Array.isArray(f.shadow) &&
        f.shadow.length === 3 &&
        finite(f.shadow[0], 0, 512) &&
        finite(f.shadow[1], 0, 512) &&
        finite(f.shadow[2], 0, 1),
    )
  );
}
/** Pure authoring helpers: no renderer or platform dependencies. */
export function multiplyQuaternion(a: Quaternion, b: Quaternion): Quaternion {
  const [ax, ay, az, aw] = a,
    [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
export function axisQuaternion(axis: number[], angle: number): Quaternion {
  const s = Math.sin(angle / 2) / Math.hypot(...axis);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}
export function slerpQuaternion(a: Quaternion, b: Quaternion, t: number): Quaternion {
  let dot = a.reduce((s, n, i) => s + n * b[i], 0);
  if (dot < 0) {
    b = b.map(n => -n) as Quaternion;
    dot = -dot;
  }
  const angle = Math.acos(Math.min(1, dot)),
    sin = Math.sin(angle);
  const q = a.map((n, i) =>
    sin < 0.00001
      ? n * (1 - t) + b[i] * t
      : (n * Math.sin((1 - t) * angle) + b[i] * Math.sin(t * angle)) / sin,
  );
  const length = Math.hypot(...q);
  return q.map(n => n / length) as Quaternion;
}
/** Inspect GLB structure before a host parser sees it. No URLs, textures, skins or extensions. */
export function validateGizmoModel(encoded: string): void {
  if (typeof encoded !== 'string' || encoded.length > 700000)
    throw new Error('Gizmo model exceeds its limit');
  const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  const v = new DataView(bytes.buffer);
  if (
    bytes.length < 28 ||
    v.getUint32(0, true) !== 0x46546c67 ||
    v.getUint32(4, true) !== 2 ||
    v.getUint32(8, true) !== bytes.length ||
    v.getUint32(16, true) !== 0x4e4f534a
  )
    throw new Error('Invalid gizmo GLB');
  const size = v.getUint32(12, true),
    end = 20 + size;
  if (
    end + 8 > bytes.length ||
    v.getUint32(end + 4, true) !== 0x004e4942 ||
    end + 8 + v.getUint32(end, true) !== bytes.length
  )
    throw new Error('Invalid gizmo GLB chunks');
  const data = JSON.parse(new TextDecoder().decode(bytes.subarray(20, end))),
    bin = v.getUint32(end, true);
  if (
    data.asset?.version !== '2.0' ||
    data.images?.length ||
    data.textures?.length ||
    data.skins?.length ||
    data.animations?.length ||
    data.extensionsUsed?.length ||
    data.extensionsRequired?.length ||
    !Array.isArray(data.buffers) ||
    data.buffers.length !== 1 ||
    data.buffers[0].uri !== undefined ||
    !finite(data.buffers[0].byteLength, 0, bin) ||
    !Array.isArray(data.nodes) ||
    data.nodes.length > 64 ||
    !Array.isArray(data.meshes) ||
    data.meshes.length > 32 ||
    !Array.isArray(data.accessors) ||
    data.accessors.length > 256 ||
    !Array.isArray(data.bufferViews) ||
    data.bufferViews.length > 256 ||
    !Array.isArray(data.scenes) ||
    data.scenes.length !== 1 ||
    (data.scene !== undefined && data.scene !== 0) ||
    data.materials?.length > 32
  )
    throw new Error('Unsupported gizmo model');
  const scan = (value: any, depth = 0) => {
    if (depth > 20) throw new Error('Gizmo model is too deep');
    if (value && typeof value === 'object')
      for (const [k, c] of Object.entries(value)) {
        if (k === 'uri' || k === 'extensions' || k === 'sparse' || k === 'targets')
          throw new Error('Unsupported gizmo model resource');
        scan(c, depth + 1);
      }
  };
  scan(data);
  for (const b of data.bufferViews)
    if (
      b.buffer !== 0 ||
      !Number.isSafeInteger(b.byteLength) ||
      !finite(b.byteLength, 0, bin) ||
      !Number.isSafeInteger(b.byteOffset ?? 0) ||
      !finite(b.byteOffset ?? 0, 0, bin - b.byteLength) ||
      (b.byteStride !== undefined &&
        (!Number.isSafeInteger(b.byteStride) ||
          !finite(b.byteStride, 4, 252) ||
          b.byteStride % 4 !== 0))
    )
      throw new Error('Invalid model buffer');
  let count = 0;
  for (const a of data.accessors) {
    const b = data.bufferViews[a.bufferView];
    const width = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type];
    const component = (
      { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 } as Record<number, number>
    )[a.componentType];
    if (
      !b ||
      !width ||
      !component ||
      !Number.isSafeInteger(a.count) ||
      !finite(a.count, 1, 100000) ||
      !Number.isSafeInteger(a.byteOffset ?? 0) ||
      !finite(a.byteOffset ?? 0, 0, b.byteLength) ||
      (b.byteStride ?? width * component) < width * component ||
      (a.byteOffset ?? 0) +
        (a.count - 1) * (b.byteStride ?? width * component) +
        width * component >
        b.byteLength
    )
      throw new Error('Invalid model accessor');
    count += a.count;
    if (a.componentType === 5126)
      for (let i = 0; i < a.count; i++)
        for (let c = 0; c < width; c++)
          if (
            !finite(
              v.getFloat32(
                end +
                  8 +
                  (b.byteOffset ?? 0) +
                  (a.byteOffset ?? 0) +
                  i * (b.byteStride ?? width * component) +
                  c * component,
                true,
              ),
              -1000000,
              1000000,
            )
          )
            throw new Error('Invalid model coordinate');
  }
  if (count > 300000) throw new Error('Gizmo model is too complex');
  let primitives = 0;
  for (const mesh of data.meshes) {
    if (!Array.isArray(mesh.primitives)) throw new Error('Invalid model mesh');
    for (const p of mesh.primitives) {
      primitives++;
      if ((p.mode !== undefined && p.mode !== 4) || !data.accessors[p.attributes?.POSITION])
        throw new Error('Unsupported model primitive');
    }
  }
  if (primitives > 64) throw new Error('Gizmo model has too many primitives');
  const seen = new Set<number>();
  const visit = (i: number, depth = 0) => {
    if (depth > 16 || !Number.isInteger(i) || !data.nodes[i] || seen.has(i))
      throw new Error('Invalid model hierarchy');
    seen.add(i);
    const n = data.nodes[i];
    if (n.mesh !== undefined && !data.meshes[n.mesh]) throw new Error('Invalid model mesh');
    for (const k of ['translation', 'rotation', 'scale', 'matrix'])
      if (
        n[k] !== undefined &&
        (!Array.isArray(n[k]) || !n[k].every((x: unknown) => finite(x, -10000, 10000)))
      )
        throw new Error('Invalid model transform');
    for (const c of n.children ?? []) visit(c, depth + 1);
  };
  for (const i of data.scenes[0].nodes ?? []) visit(i);
}
