/** Project entry: exports chime to Scape's SDK loader. */
import { defineProject } from '@scape-wtf/sdk';
import { chime } from './definition.js';

export default defineProject({
  name: 'Chime',
  description: 'Bump to ring instantly; each hit restarts the chime for nearby players.',
  objects: [chime],
});
