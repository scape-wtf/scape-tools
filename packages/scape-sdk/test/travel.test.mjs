import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defineObject,
  record,
  resolveGizmoTravel,
  travelExitOffsets,
  characterMotionFrame,
  gizmoCharacterMotionError,
} from '../dist/index.js';
import { ObjectRegistry } from '../dist/runtime.js';

const recipe = { destination: { kind: 'offset', x: 4, y: 0 }, exits: [[0, 0]], cooldownMs: 650 };
const base = defineObject({
  type: 'test.transfer',
  version: 1,
  emoji: '🧭',
  label: 'Transfer',
  hint: '',
  initial: () => ({}),
  valid: record,
  actions: {},
  travel: () => recipe,
});

test('linking, directional movement and artwork are independent capabilities', () => {
  const registry = new ObjectRegistry([base]);
  assert.deepEqual(resolveGizmoTravel(base, {}), recipe);
  assert.equal(registry.create(base.emoji, 'test-transfer-instance').linkId, undefined);
  new ObjectRegistry([{ ...base, travel: undefined, link: { size: 2 } }]);
  assert.deepEqual(
    travelExitOffsets(
      {
        exits: [
          [1, 0],
          [0, -1],
        ],
        relative: true,
      },
      0,
      1,
    ),
    [
      [0, 1],
      [1, 0],
    ],
  );
});

test('invalid movement, link, spin and effect recipes are rejected before activation', () => {
  for (const travel of [
    { ...recipe, destination: { kind: 'linked' } },
    { ...recipe, destination: { kind: 'offset', x: 65, y: 0 } },
    { ...recipe, destination: { kind: 'offset', x: 4, y: 0, floor: 1 } },
    { ...recipe, exits: [[2, 0]] },
    { ...recipe, exits: [] },
    { ...recipe, cooldownMs: 0 },
    { ...recipe, arrival: { durationMs: 260, scale: NaN } },
    { ...recipe, feedback: { durationMs: 200, haptic: 'turn-on-mic' } },
  ])
    assert.throws(() => new ObjectRegistry([{ ...base, travel: () => travel }]), /travel/);
  for (const change of [{ link: { size: 100 } }, { spin: Infinity }, { spin: 4.1 }])
    assert.throws(() => new ObjectRegistry([{ ...base, ...change }]));
});

test('state changes cannot introduce invalid travel and cannot modify host link identity', () => {
  const definition = {
    ...base,
    link: { size: 2 },
    initial: () => ({ x: 1 }),
    travel: state => ({ ...recipe, destination: { kind: 'offset', x: state.x, y: 0 } }),
    actions: { set: { permission: 'editor', run: (_state, payload) => payload } },
  };
  const registry = new ObjectRegistry([definition]);
  const instance = {
    ...registry.create(base.emoji, 'test-transfer-instance'),
    linkId: 'host-group',
  };
  const context = { actorId: 'owner', canEdit: true, now: 1000, randomInt: () => 0 };
  assert.throws(
    () => registry.act(instance, { name: 'set', payload: { x: 100 } }, context),
    /travel/,
  );
  assert.equal(
    registry.act(instance, { name: 'set', payload: { x: 2 } }, context).linkId,
    'host-group',
  );
  assert.equal(instance.state.x, 1);
});

const motion = {
  durationMs: 700,
  frames: [
    { at: 0, offset: [0, 0], scale: [1, 1], rotation: 0 },
    { at: 0.5, offset: [0, 2], scale: [0.8, 1.2], rotation: 0.2 },
    { at: 1, offset: [0, 0], scale: [1, 1], rotation: 0 },
  ],
};

test('custom character transforms and arrival activation are independently validated', () => {
  assert.equal(gizmoCharacterMotionError(motion), null);
  assert.deepEqual(characterMotionFrame(motion, 0.5), motion.frames[1]);
  assert.equal(characterMotionFrame(motion, 0.25).offset[1], 1);
  assert.deepEqual(characterMotionFrame(motion, 2), motion.frames[2]);
  new ObjectRegistry([{ ...base, travel: () => ({ ...recipe, motion, activateOnArrival: true }) }]);
  for (const patch of [
    { activateOnArrival: 'yes' },
    { activateOnArrival: true, relative: true },
    { motion: { ...motion, durationMs: Infinity } },
    { motion: { ...motion, frames: [] } },
    { motion: { ...motion, frames: [motion.frames[1], motion.frames[2]] } },
    {
      motion: {
        ...motion,
        frames: [motion.frames[0], { ...motion.frames[1], at: 0 }, motion.frames[2]],
      },
    },
    {
      motion: {
        ...motion,
        frames: [motion.frames[0], { ...motion.frames[1], offset: [0, 5] }, motion.frames[2]],
      },
    },
    { motion, arrival: { durationMs: 100, scale: 0.7 } },
  ])
    assert.throws(
      () => new ObjectRegistry([{ ...base, travel: () => ({ ...recipe, ...patch }) }]),
      /travel/,
    );
});

test('character transforms reject sparse vectors and leave source frames unchanged', () => {
  for (const key of ['offset', 'scale']) {
    const malformed = structuredClone(motion);
    delete malformed.frames[1][key][0];
    assert.ok(gizmoCharacterMotionError(malformed));
  }
  const sample = characterMotionFrame(motion, 0.5);
  sample.offset[1] = 100;
  assert.equal(motion.frames[1].offset[1], 2);
});
