import { GRID, AGENT_OBJECT_EMOJI } from './contracts.mjs';
export const MAX_TASK_STEPS = 4096;
const configSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'version', 'values'],
  properties: {
    type: { type: 'string' },
    version: { type: 'integer', minimum: 1 },
    values: { type: 'object', additionalProperties: true },
  },
};
const tile = {
  emoji: { type: 'string', minLength: 1, maxLength: 16 },
  objectConfig: {
    ...configSchema,
    description:
      'Only for installed configurable objects, using scape_object_catalog. Omit for ordinary emoji walls/decorations; never invent a type such as wall.',
  },
};
export const taskStepSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: {
      type: 'string',
      enum: ['visit', 'use', 'approach', 'express', 'place', 'build', 'maze', 'wait'],
    },
    width: {
      type: 'integer',
      minimum: 5,
      maximum: 61,
      description:
        'maze: odd width, defaults to 11. Generates connected paths and open entrance/exit without hand-counting rows.',
    },
    height: {
      type: 'integer',
      minimum: 5,
      maximum: 37,
      description:
        'maze: odd height, defaults to 11. Omit x/y together to find nearby empty space automatically.',
    },
    seed: {
      type: 'integer',
      minimum: 1,
      maximum: 2147483647,
      description: 'maze: optional repeatable layout seed.',
    },
    target: {
      type: 'string',
      maxLength: 120,
      description:
        'Observed object ID for visit/use; player ID for approach; registered expression for express.',
    },
    x: { type: 'integer', minimum: 0, maximum: GRID.width - 1 },
    y: { type: 'integer', minimum: 0, maximum: GRID.height - 1 },
    floor: { type: 'integer', enum: [0, 1] },
    ...tile,
    rows: {
      type: 'array',
      minItems: 1,
      maxItems: GRID.height,
      items: { type: 'string', minLength: 1, maxLength: GRID.width },
      description:
        'build: a rectangular tile map, top to bottom from x,y. Dot means leave unchanged. Every other character names a palette entry. Design the complete layout, including openings and routes.',
    },
    palette: {
      type: 'array',
      minItems: 1,
      maxItems: 64,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['symbol', 'emoji'],
        properties: { symbol: { type: 'string', minLength: 1, maxLength: 1 }, ...tile },
      },
      description:
        'build: map each non-dot symbol to an emoji and optional catalog objectConfig. Never include dot: it is reserved for empty cells. Use different entries for different piano notes, sounds or other settings.',
    },
    milliseconds: {
      type: 'integer',
      minimum: 100,
      maximum: 60000,
      description:
        'wait: minimum rest between actions; physical movement and network timing still apply.',
    },
    repeat: {
      type: 'integer',
      minimum: 1,
      maximum: 256,
      description:
        'Repeat this visit/use/expression/wait step. To repeat a melody, include its ordered notes again.',
    },
  },
};
export class TaskPlanError extends Error {
  code = 'invalid_target';
}
export const invalidPlan = (
  message = 'Choose a valid observed action or an in-bounds building layout, with at most 4096 expanded steps.',
) => new TaskPlanError(message);
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const only = (value, fields) =>
  object(value) && Object.keys(value).every(key => fields.includes(key));
const validTile = value =>
  typeof value.emoji === 'string' &&
  AGENT_OBJECT_EMOJI.test(value.emoji) &&
  value.emoji.length <= 16 &&
  (value.objectConfig === undefined ||
    (only(value.objectConfig, ['type', 'version', 'values']) &&
      typeof value.objectConfig.type === 'string' &&
      value.objectConfig.type.length <= 128 &&
      integer(value.objectConfig.version, 1, Number.MAX_SAFE_INTEGER) &&
      object(value.objectConfig.values)));

/** A bounded data-only maze recipe; the same placement validator still authorizes every tile. */
function mazeLayout(step, state, planned) {
  const width = step.width ?? 11,
    height = step.height ?? 11,
    floor = step.floor ?? state.self?.floor;
  if (
    !only(step, ['action', 'width', 'height', 'x', 'y', 'floor', 'emoji', 'seed']) ||
    !integer(width, 5, 61) ||
    !integer(height, 5, 37) ||
    !(width % 2) ||
    !(height % 2) ||
    !integer(step.seed ?? 1, 1, 2147483647) ||
    floor !== state.self?.floor
  )
    throw invalidPlan(
      'Maze width/height must be odd integers within 5..61 and 5..37. Use the current floor, optional emoji/seed and x/y, or omit both coordinates to find space.',
    );
  let { x, y } = step;
  const blocked = (state.scene?.blocked ?? [])
    .filter(cell => integer(cell, 0, GRID.width * GRID.height - 1))
    .map(cell => ({ x: cell % GRID.width, y: Math.floor(cell / GRID.width), floor }));
  const occupied = [
    ...(state.scene?.objects ?? []),
    ...blocked,
    state.self,
    ...(state.roster ?? state.players ?? []),
  ].filter(o => o?.floor === floor);
  const clear = (cx, cy) => {
    if (occupied.some(o => o.x >= cx && o.x < cx + width && o.y >= cy && o.y < cy + height))
      return false;
    for (let dy = 0; dy < height; dy++)
      for (let dx = 0; dx < width; dx++)
        if (planned.has(`${floor}:${cx + dx}:${cy + dy}`)) return false;
    return [
      [cx + 1, cy - 1],
      [cx + width - 2, cy + height],
    ].every(
      ([ex, ey]) =>
        !occupied.some(o => o.x === ex && o.y === ey) && !planned.has(`${floor}:${ex}:${ey}`),
    );
  };
  if (x === undefined && y === undefined) {
    const candidates = [];
    for (let cy = 1; cy + height < GRID.height; cy++)
      for (let cx = 1; cx + width < GRID.width; cx++) {
        if (clear(cx, cy))
          candidates.push({
            x: cx,
            y: cy,
            distance:
              Math.abs(cx + width / 2 - (state.self?.x ?? 0)) +
              Math.abs(cy + height / 2 - (state.self?.y ?? 0)),
          });
      }
    candidates.sort((a, b) => a.distance - b.distance);
    if (!candidates.length)
      throw invalidPlan(
        'No empty rectangle fits this maze. Choose smaller odd dimensions or an explicit clear location.',
      );
    ({ x, y } = candidates[0]);
  }
  if (!integer(x, 1, GRID.width - width - 1) || !integer(y, 1, GRID.height - height - 1))
    throw invalidPlan(
      'Maze origin and dimensions must fit the 64 by 40 grid with a one-cell exterior margin for its openings. Omit x and y together for automatic placement.',
    );
  if (!clear(x, y))
    throw invalidPlan(
      'The maze footprint or space outside its openings is occupied. Omit x/y to find empty space or choose a clear rectangle.',
    );
  const rows = Array.from({ length: height }, () => Array(width).fill('#'));
  let seed = step.seed ?? 1;
  const random = n => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  const stack = [[1, 1]];
  rows[1][1] = '.';
  while (stack.length) {
    const [cx, cy] = stack.at(-1);
    const next = [
      [cx + 2, cy],
      [cx - 2, cy],
      [cx, cy + 2],
      [cx, cy - 2],
    ].filter(
      ([nx, ny]) => nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1 && rows[ny][nx] === '#',
    );
    if (!next.length) {
      stack.pop();
      continue;
    }
    const [nx, ny] = next[random(next.length)];
    rows[(cy + ny) / 2][(cx + nx) / 2] = rows[ny][nx] = '.';
    stack.push([nx, ny]);
  }
  rows[0][1] = rows[height - 1][width - 2] = '.';
  return {
    action: 'build',
    x,
    y,
    floor,
    rows: rows.map(row => row.join('')),
    palette: [{ symbol: '#', emoji: step.emoji ?? '🧱' }],
  };
}

/** Compile data, never code. Validate the entire plan before admitting any work. */
export function compileTask(steps, state, catalog) {
  if (
    !Array.isArray(steps) ||
    !steps.length ||
    steps.length > 512 ||
    JSON.stringify(steps).length > 262144
  )
    throw invalidPlan();
  const expanded = [],
    cells = new Set();
  let bytes = 0;
  const add = step => {
    const size = Buffer.byteLength(JSON.stringify(step));
    // Leave headroom for gateway session/command fields; cap expansion before cloning.
    if (size > 2048 || (bytes += size) > 2 * 1024 * 1024 || expanded.length >= MAX_TASK_STEPS)
      throw invalidPlan();
    expanded.push(structuredClone(step));
  };
  const place = step => {
    if (!state.scene?.editCapabilities?.canPlace)
      throw Object.assign(new Error('World editing is not permitted for this pairing.'), {
        code: 'editing_not_granted',
      });
    if (
      !integer(step.x, 0, GRID.width - 1) ||
      !integer(step.y, 0, GRID.height - 1) ||
      step.floor !== state.self?.floor ||
      !validTile(step)
    )
      throw invalidPlan(
        'Placement needs valid x/y, the current floor, an emoji, and optional catalog configuration. Omit objectConfig for ordinary emoji.',
      );
    if (step.objectConfig && catalog) {
      const entry = catalog.objects?.find(o => o.emoji === step.emoji);
      if (
        !entry?.configuration ||
        entry.type !== step.objectConfig.type ||
        entry.version !== step.objectConfig.version
      )
        throw invalidPlan(
          'objectConfig must match an installed configurable emoji and its catalog type/version. Omit it for ordinary walls and decorations.',
        );
    }
    const key = `${step.floor}:${step.x}:${step.y}`;
    if (
      cells.has(key) ||
      state.scene.objects.some(o => o.x === step.x && o.y === step.y && o.floor === step.floor)
    )
      throw Object.assign(
        invalidPlan(
          `Cell ${step.x},${step.y} on floor ${step.floor} is occupied or repeated. Move the layout or leave that cell empty with a dot.`,
        ),
        { code: 'edit_conflict' },
      );
    cells.add(key);
    add({
      action: 'place',
      x: step.x,
      y: step.y,
      floor: step.floor,
      emoji: step.emoji,
      ...(step.objectConfig ? { objectConfig: step.objectConfig } : {}),
    });
  };
  for (let step of steps) {
    if (!object(step)) throw invalidPlan();
    if (step.action === 'maze') step = mazeLayout(step, state, cells);
    if (step.action === 'place') {
      if (!only(step, ['action', 'x', 'y', 'floor', 'emoji', 'objectConfig'])) throw invalidPlan();
      place(step);
    } else if (step.action === 'build') {
      if (!Array.isArray(step.palette) || !step.palette.length)
        throw invalidPlan(
          'Build requires a palette array, for example [{"symbol":"#","emoji":"🧱"}]. Every non-dot row symbol needs one entry.',
        );
      if (
        !only(step, ['action', 'x', 'y', 'floor', 'rows', 'palette']) ||
        !integer(step.x, 0, GRID.width - 1) ||
        !integer(step.y, 0, GRID.height - 1) ||
        step.floor !== state.self?.floor ||
        !Array.isArray(step.rows) ||
        !step.rows.length ||
        step.rows.length > GRID.height ||
        !Array.isArray(step.palette) ||
        !step.palette.length ||
        step.palette.length > 64
      )
        throw invalidPlan();
      const palette = new Map();
      for (const entry of step.palette) {
        if (entry?.symbol === '.')
          throw invalidPlan(
            'Dot is reserved for empty cells. Remove it from the palette; keep dots in the rows.',
          );
        if (object(entry) && !validTile(entry))
          throw invalidPlan(
            'Each palette entry needs one actual emoji such as 🧱, not a literal # or letter. Omit objectConfig for ordinary emoji; use catalog configuration for gizmos.',
          );
        if (
          !only(entry, ['symbol', 'emoji', 'objectConfig']) ||
          typeof entry.symbol !== 'string' ||
          !/^[!-~]$/.test(entry.symbol) ||
          entry.symbol === '.' ||
          palette.has(entry.symbol) ||
          !validTile(entry)
        )
          throw invalidPlan();
        palette.set(entry.symbol, entry);
      }
      if (typeof step.rows[0] !== 'string') throw invalidPlan('Build rows must be strings.');
      const width = step.rows[0].length;
      if (!width || step.x + width > GRID.width || step.y + step.rows.length > GRID.height)
        throw invalidPlan(
          `The layout must fit inside the ${GRID.width} by ${GRID.height} grid: x + row width <= ${GRID.width}, y + row count <= ${GRID.height}. Move the origin or resize the complete layout.`,
        );
      for (const [dy, row] of step.rows.entries()) {
        if (typeof row !== 'string' || row.length !== width)
          throw invalidPlan(
            `Build row ${dy + 1} must have width ${width}, matching the first row. All rows must be rectangular.`,
          );
        for (let dx = 0; dx < width; dx++) {
          if (row[dx] === '.') continue;
          const entry = palette.get(row[dx]);
          if (!entry)
            throw invalidPlan(
              `Add a palette entry for ${JSON.stringify(row[dx])}, or use a dot for an empty cell.`,
            );
          place({ ...entry, x: step.x + dx, y: step.y + dy, floor: step.floor });
        }
      }
    } else {
      const repeat = step.repeat ?? 1;
      if (!integer(repeat, 1, 256)) throw invalidPlan();
      if (step.action === 'wait') {
        if (
          !only(step, ['action', 'milliseconds', 'repeat']) ||
          !integer(step.milliseconds, 100, 60000)
        )
          throw invalidPlan();
      } else {
        if (
          !only(step, ['action', 'target', 'repeat']) ||
          typeof step.target !== 'string' ||
          step.target.length > 120
        )
          throw invalidPlan();
        const valid = ['visit', 'use'].includes(step.action)
          ? state.scene?.objects.some(o => o.id === step.target)
          : step.action === 'approach'
            ? (state.roster ?? state.players).some(p => p.id === step.target)
            : step.action === 'express' && state.appearance?.expressions?.includes(step.target);
        if (!valid) throw invalidPlan();
      }
      for (let i = 0; i < repeat; i++) {
        const { repeat: ignored, ...item } = step;
        add(item);
      }
    }
  }
  if (!expanded.length) throw invalidPlan();
  return expanded;
}
