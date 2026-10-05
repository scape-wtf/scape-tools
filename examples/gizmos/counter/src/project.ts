/** Project entry: exports counter to Scape's SDK loader. */
import { defineProject } from '@scape-wtf/sdk';
import { counter } from './definition.js';

export default defineProject({ objects: [counter] });
