/** Standalone Website project. */
import { defineProject } from '@scape-wtf/sdk';
import { website } from './definition.js';

export default defineProject({
  name: 'Website',
  description: 'Share a website in your world for visitors to open together.',
  objects: [website],
});
