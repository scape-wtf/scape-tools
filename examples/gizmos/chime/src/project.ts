/** Project entry: exports chime to Scape's SDK loader. */
import { defineProject } from '@scape-wtf/sdk';
import { chime } from './definition.js';

export default defineProject({ objects: [chime] });
