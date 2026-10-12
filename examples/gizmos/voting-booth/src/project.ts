/** Project entry: exports voting-booth to Scape's SDK loader. */
import { defineProject } from '@scape-wtf/sdk';
import { votingBooth } from './definition.js';

export default defineProject({
  name: 'Voting booth',
  description:
    'Ask a question and vote together. Configure the answers, open or close voting, and reset the poll.',
  objects: [votingBooth],
});
