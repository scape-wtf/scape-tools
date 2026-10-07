import test from 'node:test';
import assert from 'node:assert/strict';
import { perceiveSocialTurn } from './social-decisions.mjs';

test('BUG-177: decision object references preserve piano notes so a clarified request can identify its target', async () => {
  const player = { id: 'visitor', text: 'play the B4 key please' };
  const result = await perceiveSocialTurn({
    config: { name: 'Bot', instructions: '' },
    turn: { events: [{ type: 'speech', player }] },
    observation: {
      self: { x: 1, y: 1, floor: 0 },
      players: [player],
      scene: {
        objects: [
          { id: 'e3', x: 1, y: 2, emoji: '🎹', pianoNote: 'E3' },
          { id: 'b4', x: 2, y: 1, emoji: '🎹', pianoNote: 'B4' },
        ],
      },
    },
    client: {
      async evaluate({ state, questions }) {
        const object = state.objects.find(object => object.pianoNote === 'B4');
        assert.ok(object, 'the decision model must receive the note label');
        assert.match(questions.p0_object.criteria[object.ref], /B4/);
        return {
          activity: { choice: 'stay' },
          mood: { choice: 'neutral' },
          p0_action: { choice: 'interact' },
          p0_tone: { choice: 'neutral' },
          p0_object: { choice: object.ref },
        };
      },
    },
  });
  assert.equal(result.people[0].action, 'interact');
  assert.equal(result.people[0].object.id, 'b4');
});

test('BUG-179: social perception receives capability limits before selecting physical actions', async () => {
  const player = { id: 'visitor', text: 'Break that piano.' };
  const result = await perceiveSocialTurn({
    config: { name: 'Bot', instructions: '' },
    turn: { events: [{ type: 'speech', player }] },
    observation: {
      self: { x: 1, y: 1, floor: 0 },
      players: [player],
      scene: { objects: [{ id: 'piano', emoji: '🎹', x: 2, y: 1 }] },
    },
    client: {
      async evaluate({ state }) {
        assert.equal(state.capabilities?.worldEditing, false);
        return {
          activity: { choice: 'stay' },
          mood: { choice: 'neutral' },
          p0_action: { choice: 'reply' },
          p0_tone: { choice: 'neutral' },
          p0_object: { choice: 'none' },
        };
      },
    },
  });
  assert.equal(result.people[0].action, 'reply');
  assert.equal(result.people[0].object, undefined);
});
