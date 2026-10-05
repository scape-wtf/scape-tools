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
