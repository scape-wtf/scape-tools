import test from 'node:test';
import assert from 'node:assert/strict';
import { GizmoSequenceRenderer, GIZMO_BUS_FRAMES as N } from '../dist/sequenceRenderer.js';
import { renderGizmoSynth, gizmoBusError, gizmoSequenceError } from '../dist/index.js';
import { convolveSignal, noiseImpulse } from '../dist/synthesisConvolution.js';
const sound = {
  kind: 'synth',
  duration: 0.04,
  voices: [{ wave: 'sine', start: 0, duration: 0.04, frequency: 440, gain: 0.1 }],
};
const energy = a => a.reduce((n, x) => n + x * x, 0);
test('shared convolution preserves a strike across chunk boundaries and retains its complete tail', () => {
  const reverb = { duration: 0.35, decay: 2.8, seed: 145, wet: 0.38 },
    renderer = new GizmoSequenceRenderer({ gain: 0.9, reverb });
  const length = N * 6,
    actual = [[], []];
  for (let block = 0; block < 6; block++)
    renderer
      .render(block === 0 ? [{ at: N - 50, sound }] : [])
      .forEach((data, c) => actual[c].push(...data));
  const rendered = renderGizmoSynth(sound),
    impulses = noiseImpulse(reverb.duration, reverb.decay, reverb.seed, 48000);
  for (let c = 0; c < 2; c++) {
    const dry = new Float32Array(length);
    dry.set(
      rendered.samples[c].map(x => x * 0.9),
      N - 50,
    );
    const wet = convolveSignal(dry, impulses[c]);
    for (let i = 0; i < length; i++)
      assert.ok(
        Math.abs(actual[c][i] - (dry[i] + wet[i] * 0.38)) < 1e-8,
        `continuous convolution ${i}`,
      );
    assert.ok(energy(actual[c].slice(N * 2, N * 4)) > 0);
  }
});
test('feedback and modulation carry state between blocks; compressor responds to the combined bus', () => {
  const bus = {
    gain: 1,
    delay: { time: 0.15, feedback: 0.4, wet: 0.5, modulation: { frequency: 0.075, depth: 0.001 } },
  };
  const renderer = new GizmoSequenceRenderer(bus);
  renderer.render([{ at: 0, sound }]);
  assert.ok(energy(renderer.render([])[0]) > 0);
  assert.ok(energy(renderer.render([])[0]) > 0);
  const compressor = { threshold: -30, knee: 18, ratio: 8, attack: 0.001, release: 0.24 };
  const loud = { ...sound, voices: [{ ...sound.voices[0], gain: 0.4 }] };
  const one = new GizmoSequenceRenderer({ gain: 1, compressor }).render([{ at: 0, sound: loud }]);
  const two = new GizmoSequenceRenderer({ gain: 1, compressor }).render([
    { at: 0, sound: loud },
    { at: 0, sound: loud },
  ]);
  assert.ok(energy(two[0]) < energy(one[0]) * 3.5, 'two overlapping sounds drive one compressor');
  assert.ok(two.every(c => c.every(x => Number.isFinite(x) && Math.abs(x) <= 1)));
});
test('sequence resource limits reject invalid DSP, callbacks and scheduling windows', () => {
  assert.match(
    gizmoBusError({ gain: 1, reverb: { duration: 100, decay: 2, seed: 1, wet: 0.5 } }),
    /duration/,
  );
  assert.match(gizmoSequenceError({ afterSeconds: 0, strikes: [] }, 1), /afterSeconds/);
  assert.match(
    gizmoSequenceError({ afterSeconds: 0.1, strikes: [{ source: 2, delaySeconds: 0, sound }] }, 1),
    /source/,
  );
  assert.match(
    gizmoSequenceError(
      {
        afterSeconds: 0.1,
        strikes: [
          {
            source: 0,
            delaySeconds: 0,
            sound: { ...sound, effects: [{ type: 'delay', time: 0.1, feedback: 0.2, mix: 0.5 }] },
          },
        ],
      },
      1,
    ),
    /shared/,
  );
  const renderer = new GizmoSequenceRenderer({ gain: 1 });
  assert.throws(() => renderer.render([{ at: -1, sound }]), /window/);
  assert.throws(() => renderer.render(Array(9).fill({ at: 0, sound })), /limit/);
  assert.doesNotThrow(
    () => renderer.render([{ at: N + 4800, sound }]),
    'sample rounding may land exactly on the window edge',
  );
});

test('quiet bus audio retains unity gain without automatic compressor makeup', () => {
  const compressor = { threshold: -20, knee: 18, ratio: 4, attack: 0.01, release: 0.24 };
  const quiet = { ...sound, voices: [{ ...sound.voices[0], gain: 0.01 }] };
  const input = new GizmoSequenceRenderer({ gain: 1 }).render([{ at: 0, sound: quiet }]);
  const output = new GizmoSequenceRenderer({ gain: 1, compressor }).render([
    { at: 0, sound: quiet },
  ]);
  const measured = Math.sqrt(energy(output[0]) / energy(input[0]));
  // Owner-requested unity-gain listening test: preserve quiet samples exactly.
  assert.equal(measured, 1);
  assert.deepEqual(output, input);
});

test('compressor knee starts at threshold, joins continuously, and supports hard-knee/unity limits', async () => {
  const { createCompressorCurve } = await import('../dist/compressorCurve.js');
  const params = { threshold: -20, knee: 18, ratio: 4, attack: 0.01, release: 0.24 };
  const curve = createCompressorCurve(params);
  for (const amplitude of [0, 0.001, 0.04, 0.08, 0.1])
    assert.equal(curve.gain(amplitude), 1, 'no compression below the actual threshold');
  const end = 10 ** (-2 / 20),
    output = x => x * curve.gain(x);
  for (const boundary of [0.1, end])
    assert.ok(Math.abs(output(boundary - 1e-8) - output(boundary + 1e-8)) < 3e-8);
  assert.ok(
    Math.abs(output(end * 2) / output(end) - 2 ** 0.25) < 1e-10,
    'declared ratio beyond the knee',
  );
  const hard = createCompressorCurve({ ...params, knee: 0 });
  assert.equal(hard.gain(0.1), 1);
  assert.ok(Math.abs(hard.gain(1) - 10 ** (-15 / 20)) < 1e-12);
  for (const threshold of [-60, -20, 0])
    for (const knee of [0, 1e-9, 18, 40])
      for (const ratio of [1, 4, 20]) {
        const c = createCompressorCurve({ ...params, threshold, knee, ratio });
        assert.equal(c.makeup, 1);
        for (const x of [0, 1e-6, 0.001, 0.1, 0.5, 1, 10])
          assert.ok(Number.isFinite(c.gain(x)) && c.gain(x) > 0 && c.gain(x) <= 1 + 1e-12);
        if (ratio === 1) {
          assert.equal(c.makeup, 1);
          assert.equal(c.gain(10), 1);
        }
      }
  const unity = { ...params, ratio: 1 };
  assert.deepEqual(
    new GizmoSequenceRenderer({ gain: 1, compressor: unity }).render([{ at: 0, sound }]),
    new GizmoSequenceRenderer({ gain: 1 }).render([{ at: 0, sound }]),
  );
});

test('BUG-233: source removal fades only its dry notes while the shared bus continues', () => {
  const long = { ...sound, duration: 1, voices: [{ ...sound.voices[0], duration: 1 }] };
  const renderer = new GizmoSequenceRenderer({ gain: 1 });
  const sources = [
    { id: 'a', gain: 1, pan: 0 },
    { id: 'b', gain: 1, pan: 0 },
  ];
  renderer.render([{ at: 0, sound: long, source: 'a', spatial: { gain: 1, pan: 0 } }], sources);
  let last;
  for (let i = 0; i < 5; i++) last = renderer.render([], sources.slice(1));
  assert.ok(energy(last[0]) < 1e-12, 'a removed source must finish fading within 300 ms');
  const continuing = renderer.render(
    [{ at: N * 6, sound: long, source: 'b', spatial: { gain: 1, pan: 0 } }],
    sources.slice(1),
  );
  assert.ok(energy(continuing[0]) > 0, 'the other source still plays on the same clock');
});

test('BUG-233: removing one source preserves another overlapping note and reverb', () => {
  const long = { ...sound, duration: 1, voices: [{ ...sound.voices[0], duration: 1 }] };
  const bus = { gain: 1, reverb: { duration: 0.35, decay: 2, seed: 4, wet: 0.3 } };
  const mixed = new GizmoSequenceRenderer(bus),
    reference = new GizmoSequenceRenderer(bus);
  const event = id => ({ at: 0, sound: long, source: id, spatial: { gain: 1, pan: 0 } });
  const spatial = [
    { id: 'a', gain: 1, pan: 0 },
    { id: 'b', gain: 1, pan: 0 },
  ];
  mixed.render([event('a'), event('b')], spatial);
  reference.render([event('b')], spatial);
  let output, expected;
  for (let i = 0; i < 9; i++) {
    output = mixed.render([], spatial.slice(1));
    expected = reference.render([], spatial.slice(1));
  }
  assert.ok(energy(output[0]) > 0);
  assert.ok(
    output[0].every((v, i) => Math.abs(v - expected[0][i]) < 1e-7),
    'removed source has faded; the other note and bus clock are intact',
  );
});

test('BUG-233: spatial updates smoothly attenuate existing notes without applying initial distance twice', () => {
  const long = { ...sound, duration: 1, voices: [{ ...sound.voices[0], duration: 1 }] };
  const renderer = new GizmoSequenceRenderer({ gain: 1 }),
    reference = new GizmoSequenceRenderer({ gain: 1 });
  const event = { at: 0, sound: long, source: 'a', spatial: { gain: 0.5, pan: 0 } };
  const initial = renderer.render([event], [{ id: 'a', gain: 0.5, pan: 0 }]),
    dry = reference.render([{ at: 0, sound: long }]);
  assert.ok(initial[0].every((v, i) => Math.abs(v - dry[0][i] * 0.5) < 1e-7));
  let output, expected;
  for (let i = 0; i < 4; i++) {
    output = renderer.render([], [{ id: 'a', gain: 0.25, pan: 0 }]);
    expected = reference.render([]);
  }
  assert.ok(output[0].every((v, i) => Math.abs(v - expected[0][i] * 0.25) < 1e-7));
  assert.throws(() => renderer.render([], [{ id: 'a', gain: Infinity, pan: 0 }]), /spatial/);
});

test('BUG-233: a ringing source moves across stereo without restarting its note', () => {
  const long = { ...sound, duration: 1, voices: [{ ...sound.voices[0], duration: 1, pan: 0 }] };
  const renderer = new GizmoSequenceRenderer({ gain: 1 });
  const initial = renderer.render(
    [{ at: 0, sound: long, source: 'moving', spatial: { gain: 1, pan: -0.6 } }],
    [{ id: 'moving', gain: 1, pan: -0.6 }],
  );
  assert.ok(energy(initial[0]) > energy(initial[1]));
  let moved;
  for (let i = 0; i < 4; i++) moved = renderer.render([], [{ id: 'moving', gain: 1, pan: 0.6 }]);
  const expectedRatio = ((1 + Math.sin((0.6 * Math.PI) / 2)) / Math.cos((0.6 * Math.PI) / 2)) ** 2;
  assert.ok(
    Math.abs(energy(moved[1]) / energy(moved[0]) - expectedRatio) < 1e-5,
    'the final stereo position is absolute +0.6, without compounding the original pan',
  );
  assert.ok(moved.every(channel => channel.every(v => Number.isFinite(v) && Math.abs(v) <= 1)));
});

test('BUG-233: near-silent strike entry never boosts fixed envelope floors above the dry note', () => {
  const quiet = {
    kind: 'synth',
    duration: 1,
    voices: [
      {
        wave: 'sine',
        start: 0,
        duration: 1,
        frequency: 440,
        fade: [0, 0],
        gain: [
          { time: 0, value: 0.0001 },
          { time: 0.003, value: 0.01, curve: 'exponential' },
          { time: 1, value: 0.0001, curve: 'exponential' },
        ],
      },
    ],
  };
  const renderer = new GizmoSequenceRenderer({ gain: 1 }),
    reference = new GizmoSequenceRenderer({ gain: 1 });
  let actual = renderer.render(
    [{ at: 0, sound: quiet, source: 'a', spatial: { gain: 0.0012, pan: 0 } }],
    [{ id: 'a', gain: 0.0012, pan: 0 }],
  );
  let dry = reference.render([{ at: 0, sound: quiet }]);
  assert.ok(
    actual[0].every((v, i) => Math.abs(v - dry[0][i] * 0.0012) < 1e-9),
    'distance applies to the complete authored envelope at onset',
  );
  for (let block = 0; block < 5; block++) {
    actual = renderer.render([], [{ id: 'a', gain: 1, pan: 0 }]);
    dry = reference.render([]);
    assert.ok(
      energy(actual[0]) <= energy(dry[0]) * 1.000001,
      'approaching cannot amplify a note above its authored level',
    );
  }
  assert.ok(
    actual[0].every((v, i) => Math.abs(v - dry[0][i]) < 1e-9),
    'nearby notes reach unity distance gain',
  );
});

for (const initial of [0, 1e-8, 0.2])
  test(`BUG-233: spatial gain ${initial} remains bounded through movement and removal`, () => {
    const long = { ...sound, duration: 1, voices: [{ ...sound.voices[0], duration: 1 }] };
    const renderer = new GizmoSequenceRenderer({ gain: 1 }),
      reference = new GizmoSequenceRenderer({ gain: 1 });
    for (let block = 0; block < 9; block++) {
      const spatial = block < 5 ? [{ id: 'a', gain: 1, pan: 0 }] : [];
      const actual = renderer.render(
        block === 0
          ? [{ at: 0, sound: long, source: 'a', spatial: { gain: initial, pan: 0 } }]
          : [],
        spatial,
      );
      const dry = reference.render(block === 0 ? [{ at: 0, sound: long }] : []);
      assert.ok(
        actual[0].every((v, i) => Number.isFinite(v) && Math.abs(v) <= Math.abs(dry[0][i]) + 1e-9),
      );
      if (block === 8) assert.ok(energy(actual[0]) < 1e-12);
    }
  });

test('BUG-233: complete emitter clips retain their recipe, include bounded tails and end quietly', async () => {
  const { renderGizmoSequenceClip } = await import('../dist/sequenceRenderer.js');
  const bus = {
    gain: 0.7,
    reverb: { duration: 0.3, decay: 2, seed: 5, wet: 0.2 },
    delay: { time: 0.08, feedback: 0.2, wet: 0.1 },
  };
  const clip = renderGizmoSequenceClip(sound, bus),
    reference = new GizmoSequenceRenderer(bus).render([{ at: 0, sound }]);
  assert.ok(clip.duration > sound.duration + 0.3 && clip.duration <= 12);
  assert.deepEqual(clip.samples[0].subarray(0, N), reference[0]);
  assert.ok(
    energy(clip.samples[0].subarray(Math.ceil(sound.duration * 48000), N * 3)) > 0,
    'effect tail is retained',
  );
  for (const c of clip.samples) {
    assert.equal(c[c.length - 1], 0);
    assert.ok(c.every(v => Number.isFinite(v) && Math.abs(v) <= 1));
  }
});
