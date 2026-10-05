/** Project entry: exports pressure-pad to Scape's SDK loader. */
import { defineProject } from '@scape-wtf/sdk';
import { pressurePad } from './definition.js';

export default defineProject({ objects: [pressurePad] });
