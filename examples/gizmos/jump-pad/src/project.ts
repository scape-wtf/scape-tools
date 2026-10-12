/** Standalone project entry for the Scape development CLI. */
import { defineProject } from '@scape-wtf/sdk';
import { jumpPad } from './definition.js';

export default defineProject({
  name: 'Jump pad',
  description: 'Arc four cells east and chain jumps by landing on another pad.',
  objects: [jumpPad],
});
