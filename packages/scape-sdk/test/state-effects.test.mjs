import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectRegistry } from '../dist/runtime.js';
import {
  resolveGizmoSounds,
  resolveGizmoSprite,
  resolveGizmoStep,
  renderGizmoSound,
  gizmoSpriteError,
  gizmoSpriteAnimationError,
  gizmoPartialsError,
} from '../dist/index.js';

// A developer-owned bell, with no instrument-specific host knowledge.
const bell = {
  type: 'custom.bell',
  version: 1,
  emoji: '🔔',
  label: 'Bell',
  hint: 'Step to ring',
  initial: () => ({ frequency: '440' }),
  valid: state => ['440', '660'].includes(state.frequency),
  actions: {
    tune: { permission: 'editor', run: (_state, payload) => ({ frequency: payload.frequency }) },
  },
  configuration: { action: 'tune', fields: ['frequency'], remember: true },
  walkable: true,
  soundBank: state => ({
    ring: {
      kind: 'partials',
      duration: 0.2,
      layers: [
        {
          frequency: Number(state.frequency),
          gain: 1,
          partials: [{ ratio: 1, gain: 1, decay: 4 }],
        },
      ],
      amplitude: { gain: 0.1, attack: 0.01, decay: 3, fadeOut: 0.02 },
    },
  }),
  sprite: state => ({
    size: 128,
    layers: [
      {
        id: 'base',
        shapes: [{ kind: 'rect', x: 0, y: 0, width: 128, height: 128, radius: 4, fill: '#abcdef' }],
      },
      {
        id: 'label',
        shapes: [
          {
            kind: 'text',
            x: 64,
            y: 64,
            text: state.frequency,
            size: 24,
            weight: 400,
            color: '#123456',
          },
        ],
      },
    ],
  }),
  previews: {
    ring: {
      permission: 'editor',
      run: state => ({ sound: bell.soundBank(state).ring, gain: 0.5 }),
    },
  },
  step: () => ({
    durationMs: 200,
    animation: {
      layer: 'label',
      frames: [
        { at: 0, offset: [0, 0], tint: [1, 1, 1] },
        { at: 1, offset: [0, 0.1], tint: [0.8, 0.8, 1] },
      ],
    },
  }),
};
const context = { actorId: 'owner', canEdit: true, now: 1, randomInt: () => 0 };
test('configuration, local previews, state sounds and layered sprites work for an unrelated developer gizmo', () => {
  const registry = new ObjectRegistry([bell]),
    initial = registry.create('🔔', 'bell-instance-0001');
  const next = registry.configure(
    initial,
    { type: bell.type, version: 1, values: { frequency: '660' } },
    context,
  );
  assert.equal(initial.state.frequency, '440');
  assert.equal(next.state.frequency, '660');
  assert.deepEqual(registry.configuration(next).values, { frequency: '660' });
  assert.equal(resolveGizmoSounds(bell, next.state).ring.layers[0].frequency, 660);
  assert.equal(resolveGizmoSprite(bell, next.state).layers[1].shapes[0].text, '660');
  const preview = registry.preview(next, { name: 'ring', payload: {} }, context);
  assert.ok(renderGizmoSound(preview.sound).samples[0].some(value => value !== 0));
  assert.throws(
    () => registry.preview(next, { name: 'ring', payload: {} }, { ...context, canEdit: false }),
    /cannot preview/,
  );
  assert.throws(() => registry.act(next, { name: 'ring', payload: {} }, context), /action/);
  assert.throws(
    () =>
      registry.configure(
        initial,
        { type: bell.type, version: 1, values: { frequency: '660', forged: true } },
        context,
      ),
    /fields/,
  );
  assert.throws(
    () =>
      registry.configure(
        initial,
        { type: bell.type, version: 1, values: { frequency: '660' } },
        { ...context, canEdit: false },
      ),
    /configure|edit|permission|cannot perform/i,
  );
});
test('effect validation rejects unsafe sound work, sprites and unknown or root animation layers', () => {
  const sound = bell.soundBank(bell.initial()).ring;
  for (const invalid of [
    { ...sound, duration: 5 },
    { ...sound, layers: Array(9).fill(sound.layers[0]) },
    {
      ...sound,
      layers: [{ ...sound.layers[0], partials: [{ ratio: 1, gain: Infinity, decay: 0 }] }],
    },
  ])
    assert.ok(gizmoPartialsError(invalid));
  const sprite = bell.sprite(bell.initial());
  assert.ok(gizmoSpriteError({ ...sprite, layers: [sprite.layers[0], sprite.layers[0]] }));
  assert.ok(
    gizmoSpriteError({
      ...sprite,
      layers: [{ ...sprite.layers[0], shapes: [{ kind: 'html', html: '<script>' }] }],
    }),
  );
  const animation = bell.step().animation;
  assert.ok(gizmoSpriteAnimationError({ ...animation, frames: [...animation.frames].reverse() }));
  for (const layer of ['missing', 'base'])
    assert.throws(
      () =>
        resolveGizmoStep(
          { ...bell, step: () => ({ durationMs: 200, animation: { ...animation, layer } }) },
          bell.initial(),
          { id: 'arrival', at: 1, movement: 'walk' },
        ),
      /layer/,
    );
  assert.throws(() => new ObjectRegistry([{ ...bell, sounds: { ring: sound } }]), /sound/);
  assert.throws(
    () => new ObjectRegistry([{ ...bell, soundBank: () => ({ bad: { kind: 'unsafe' } }) }]),
    /sound/,
  );
});
