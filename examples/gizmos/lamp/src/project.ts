/** Project entry: exports lamp to Scape's SDK loader. */
import { defineProject } from '@scape-wtf/sdk';
import { lamp } from './definition.js';

export default defineProject({
  name: 'Lamp',
  description:
    'Light up your world with a switchable lamp. Choose a color or connect it to another gizmo.',
  objects: [lamp],
});
