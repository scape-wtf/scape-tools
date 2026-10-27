import { defineProject } from '@scape-wtf/sdk';
import { eventForm } from './definition.js';
export default defineProject({
  name: 'Event form',
  description:
    'Every native form field: text, select, date, time, colors, number, checkbox and notes.',
  objects: [eventForm],
});
