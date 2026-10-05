/** Project entry: exports fan to Scape's SDK loader. */
import { defineProject } from '@scape-wtf/sdk';
import { fan } from './definition.js';

export default defineProject({ objects: [fan] });
