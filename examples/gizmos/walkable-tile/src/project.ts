/** Project entry: exports walkable-tile to Scape's SDK loader. */
import { defineProject } from '@scape-wtf/sdk';
import { walkableTile } from './definition.js';

export default defineProject({ objects: [walkableTile] });
