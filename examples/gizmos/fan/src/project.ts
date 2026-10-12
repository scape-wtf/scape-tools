/** Project entry: exports fan to Scape's SDK loader. */
import { defineProject } from '@scape-wtf/sdk';
import { fan } from './definition.js';

export default defineProject({
  name: 'Floor fan',
  description:
    'Step onto the fan to get pushed in a configurable direction. Switch it on or off to control the flow.',
  objects: [fan],
});
