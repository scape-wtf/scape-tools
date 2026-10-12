/** Project entry: exports pressure-pad to Scape's SDK loader. */
import { defineProject } from '@scape-wtf/sdk';
import { pressurePad } from './definition.js';

export default defineProject({
  name: 'Pressure pad',
  description:
    'Step onto the pad to light it up and play a note. Connect it to Lamp or another gizmo to trigger a response.',
  objects: [pressurePad],
});
