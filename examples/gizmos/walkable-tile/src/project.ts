/** Project entry: exports walkable-tile to Scape's SDK loader. */
import { defineProject } from '@scape-wtf/sdk';
import { walkableTile } from './definition.js';

export default defineProject({
  name: 'Walkable tile',
  description: 'Place a simple floor tile that players can walk across.',
  objects: [walkableTile],
});
