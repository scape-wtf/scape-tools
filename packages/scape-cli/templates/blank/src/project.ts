import { defineProject } from '@scape-wtf/sdk';
import myObject from './definition.js';

// Import additional definitions and add them here. Types and emojis must be unique.
export default defineProject({
  name: 'My gizmo',
  description: 'A custom gizmo for your world. Replace this with what your gizmo does.',
  objects: [myObject],
});
