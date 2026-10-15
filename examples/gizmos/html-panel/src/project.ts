import { defineProject } from '@scape-wtf/sdk';
import { htmlPanel } from './definition.js';
export default defineProject({
  name: 'Puzzle terminal',
  description: 'Solve a bundled HTML puzzle to power another gizmo through an SDK connection.',
  objects: [htmlPanel],
});
