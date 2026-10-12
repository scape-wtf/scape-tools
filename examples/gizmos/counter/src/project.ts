/** Project entry: exports counter to Scape's SDK loader. */
import { defineProject } from '@scape-wtf/sdk';
import { counter } from './definition.js';

export default defineProject({
  name: 'Counter',
  description:
    'Count together with a shared counter. Bump to add one and see the animated total; editors can reset it.',
  objects: [counter],
});
