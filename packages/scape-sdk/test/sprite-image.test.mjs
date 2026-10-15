import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { gizmoSpriteError } from '../dist/index.js';

// Structural fixtures: browser decoding owns CRC and compressed pixel checks.
function chunk(name, data = Buffer.alloc(0)) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(name, 4);
  data.copy(result, 8);
  return result;
}
function png(width = 1, height = 1, extra = []) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    ...extra,
    chunk('IDAT', deflateSync(Buffer.alloc(5))),
    chunk('IEND'),
  ]).toString('base64');
}
function recipe(source, overrides = {}) {
  return {
    size: 192,
    layers: [
      {
        id: 'image',
        shapes: [{ kind: 'image', x: 0, y: 0, width: 192, height: 192, png: source, ...overrides }],
      },
    ],
  };
}
test('embedded sprite PNG accepts bounded static RGB/RGBA and rejects executable or remote sources', () => {
  assert.equal(gizmoSpriteError(recipe(png())), null);
  for (const source of [
    '',
    'https://example.com/icon.png',
    'data:image/png;base64,' + png(),
    Buffer.from('<svg onload="alert(1)"/>').toString('base64'),
    'A'.repeat(12004),
    png(0),
    png(257),
    png(1, 257),
    png(1, 1, [chunk('acTL')]),
    png(1, 1, [chunk('iCCP')]),
    png().slice(0, -4),
  ]) {
    assert.ok(gizmoSpriteError(recipe(source)), source.slice(0, 40));
  }
  assert.ok(gizmoSpriteError(recipe(png(), { x: 1 })), 'image must fit the sprite');
  assert.ok(gizmoSpriteError(recipe(png(), { url: 'https://example.com' })), 'no extra URL field');
});
