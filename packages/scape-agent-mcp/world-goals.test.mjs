import test from 'node:test';
import assert from 'node:assert/strict';
import { objectDestination } from './world-goals.mjs';

test('BUG-177: a named piano key cannot be replaced by another conveyor segment', () => {
  const near = {
    id: 'near',
    x: 2,
    y: 1,
    floor: 0,
    emoji: '🎹',
    pianoNote: 'C4',
    conveyorEmoji: '➡️',
  };
  const requested = { ...near, id: 'requested', x: 3, pianoNote: 'B4' };
  const state = {
    self: { x: 1, y: 1, floor: 0 },
    blocked: [],
    players: [],
    scene: { objects: [near, requested] },
  };
  const destination = objectDestination(state, requested);
  assert.equal(destination.object.id, requested.id);
  assert.equal(Math.abs(destination.x - requested.x) + Math.abs(destination.y - requested.y), 1);
  // Ordinary conveyor rides retain their reachable-chain boarding behavior.
  const belt = { ...requested, emoji: '➡️', pianoNote: undefined };
  assert.equal(
    objectDestination({ ...state, scene: { objects: [near, belt] } }, belt).object.id,
    near.id,
  );
});
