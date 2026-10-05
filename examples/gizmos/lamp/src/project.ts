/** Project entry: exports lamp to Scape's SDK loader. */
import { defineProject } from '@scape-wtf/sdk';
import { lamp } from './definition.js';

export default defineProject({ objects: [lamp] });
