/** Project entry: exports voting-booth to Scape's SDK loader. */
import { defineProject } from '@scape-wtf/sdk';
import { votingBooth } from './definition.js';

export default defineProject({ objects: [votingBooth] });
