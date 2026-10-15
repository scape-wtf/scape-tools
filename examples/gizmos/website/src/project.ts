/** Standalone Website project. */
import { defineProject } from '@scape-wtf/sdk';
import { website } from './definition.js';

export default defineProject({
  name: 'floored website example',
  description:
    'Embed floored with a fixed developer-authored website declaration. Tap the gizmo to open it.',
  objects: [website],
});
