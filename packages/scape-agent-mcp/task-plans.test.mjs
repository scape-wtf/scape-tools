import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTask } from './task-plans.mjs';
const state = {
  self: { floor: 0 },
  players: [{ id: 'p' }],
  scene: {
    editCapabilities: { canPlace: true },
    objects: [{ id: 'piano', x: 63, y: 39, floor: 0 }],
  },
  appearance: { expressions: ['happy'] },
};
const build = (extra = {}) => ({
  action: 'build',
  x: 0,
  y: 0,
  floor: 0,
  rows: ['##.', '.##'],
  palette: [{ symbol: '#', emoji: '🧱' }],
  ...extra,
});
test('FR-181: rejected layouts explain the exact repair instead of unrelated target advice', () => {
  for (const [step, message] of [
    [build({ rows: ['##', '#'] }), /row 2.*width 2/i],
    [build({ x: 63 }), /64.*40/],
    [build({ palette: [{ symbol: '.', emoji: '⬜' }] }), /reserved.*empty/i],
    [build({ rows: ['?'] }), /palette.*\?/i],
    [build({ palette: [{ symbol: '#', emoji: '#' }] }), /actual emoji/],
    [build({ palette: undefined }), /palette array/],
    [
      build({ rows: [{ length: 'untrusted'.repeat(1000) }] }),
      /^Error: Build rows must be strings\.$/,
    ],
  ])
    assert.throws(() => compileTask([step], state), message);
});

test('FR-181: maze recipe builds connected paths, two openings and more than forty walls', () => {
  const walls = compileTask([{ action: 'maze', width: 11, height: 11, x: 1, y: 1 }], state);
  assert.equal(walls.length, 70);
  assert.ok(walls.every(w => w.emoji === '🧱' && w.floor === 0));
  const blocked = new Set(walls.map(w => `${w.x - 1},${w.y - 1}`));
  const seen = new Set(['1,0']),
    queue = [[1, 0]];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      const key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= 11 || ny >= 11 || blocked.has(key) || seen.has(key)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  assert.equal(seen.size, 121 - walls.length);
  assert.ok(seen.has('9,10'));
  assert.equal(
    [...seen].filter(k => {
      const [x, y] = k.split(',').map(Number);
      return x === 0 || y === 0 || x === 10 || y === 10;
    }).length,
    2,
  );
  assert.deepEqual(
    walls,
    compileTask([{ action: 'maze', width: 11, height: 11, x: 1, y: 1 }], state),
  );
  assert.notDeepEqual(walls, compileTask([{ action: 'maze', x: 1, y: 1, seed: 2 }], state));
  for (const extra of [
    { width: 10 },
    { height: 41 },
    { x: 60, y: 0 },
    { x: 0 },
    { floor: 1 },
    { seed: 0 },
    { objectConfig: {} },
  ])
    assert.throws(() => compileTask([{ action: 'maze', ...extra }], state));
});

test('FR-181: automatic maze placement avoids players, existing objects and earlier plans', () => {
  const occupied = {
    ...state,
    self: { x: 20, y: 20, floor: 0 },
    players: [{ id: 'p', x: 22, y: 20, floor: 0 }],
  };
  const walls = compileTask([{ action: 'maze' }, { action: 'maze' }], occupied);
  assert.equal(walls.length, 140);
  assert.equal(new Set(walls.map(w => `${w.x},${w.y}`)).size, 140);
  assert.ok(walls.every(w => !(w.x === 20 && w.y === 20) && !(w.x === 22 && w.y === 20)));
  assert.throws(
    () =>
      compileTask([{ action: 'maze' }], {
        ...occupied,
        scene: { ...occupied.scene, editCapabilities: { canPlace: false } },
      }),
    { code: 'editing_not_granted' },
  );
  assert.throws(
    () =>
      compileTask([{ action: 'maze' }], {
        ...occupied,
        scene: {
          ...occupied.scene,
          objects: [],
          blocked: Array.from({ length: 64 * 40 }, (_, i) => i),
        },
      }),
    /No empty rectangle/,
  );
  const edge = compileTask([{ action: 'maze' }], { ...state, self: { x: 32, y: 11, floor: 0 } });
  assert.ok(Math.min(...edge.map(w => w.y)) >= 1);
  for (const [x, y] of [
    [2, 2],
    [2, 0],
    [4, 6],
  ]) {
    assert.throws(
      () =>
        compileTask([{ action: 'maze', x: 1, y: 1, width: 5, height: 5 }], {
          ...state,
          scene: { ...state.scene, objects: [{ x, y, floor: 0 }] },
        }),
      /footprint.*occupied/,
    );
  }
});

test('FR-181: invented gizmo configuration is rejected before accepting a plan', () => {
  assert.throws(
    () =>
      compileTask(
        [
          build({
            palette: [
              { symbol: '#', emoji: '🧱', objectConfig: { type: 'wall', version: 1, values: {} } },
            ],
          }),
        ],
        state,
        { objects: [] },
      ),
    /catalog type\/version/,
  );
});
test('FR-181: compact layouts compile hundreds of configured tiles and preserve empty routes', () => {
  const rows = Array(30).fill('#'.repeat(30));
  const tiles = compileTask([build({ rows })], state);
  assert.equal(tiles.length, 900);
  assert.deepEqual(tiles.at(-1), { action: 'place', x: 29, y: 29, floor: 0, emoji: '🧱' });
  assert.deepEqual(
    compileTask([build()], state).map(t => [t.x, t.y]),
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
  );
});
test('FR-181: piano arrangements retain per-note configuration and long ordered scores/rests', () => {
  const c = {
    type: 'scape.piano',
    version: 1,
    values: { pitch: 'C', range: '4', sound: 'classic' },
  };
  const d = { ...c, values: { ...c.values, pitch: 'D' } };
  const result = compileTask(
    [
      build({
        rows: ['CDC'],
        palette: [
          { symbol: 'C', emoji: '🎹', objectConfig: c },
          { symbol: 'D', emoji: '🎹', objectConfig: d },
        ],
      }),
      { action: 'use', target: 'piano', repeat: 64 },
      { action: 'wait', milliseconds: 500 },
    ],
    state,
  );
  assert.equal(result.length, 68);
  assert.deepEqual(
    result.slice(0, 3).map(t => t.objectConfig.values.pitch),
    ['C', 'D', 'C'],
  );
  c.values.pitch = 'F';
  assert.equal(result[0].objectConfig.values.pitch, 'C');
  assert.equal(result.at(-1).milliseconds, 500);
});
test('FR-181: validate full plans before mutation, preserve access, occupancy and bounded input', () => {
  for (const bad of [
    build({ x: 63 }),
    build({ rows: ['#', '##'] }),
    build({ rows: ['?'] }),
    build({ floor: 1 }),
    build({ palette: [{ symbol: '.', emoji: '🧱' }] }),
    build({ rows: ['#'], x: 63, y: 39 }),
    { action: 'place', x: 0, y: 0, floor: 0, emoji: '🌲', canManage: true },
    { action: 'wait', milliseconds: 0 },
  ])
    assert.throws(() => compileTask([bad], state));
  assert.throws(() => compileTask([build(), build()], state), { code: 'edit_conflict' });
  assert.throws(
    () =>
      compileTask([build()], {
        ...state,
        scene: { ...state.scene, editCapabilities: { canPlace: false } },
      }),
    { code: 'editing_not_granted' },
  );
  assert.throws(() =>
    compileTask(Array(17).fill({ action: 'use', target: 'piano', repeat: 256 }), state),
  );
});

test('FR-181: palette expansion is bounded before cloning oversized configuration', () => {
  const palette = [
    {
      symbol: '#',
      emoji: '🪧',
      objectConfig: { type: 'scape.sign', version: 1, values: { message: 'x'.repeat(200000) } },
    },
  ];
  assert.throws(() =>
    compileTask([build({ rows: Array(30).fill('#'.repeat(30)), palette })], state),
  );
  palette[0].objectConfig.values.message = 'x'.repeat(1800);
  assert.throws(() =>
    compileTask([build({ rows: Array(39).fill('#'.repeat(64)), palette })], state),
  );
});
