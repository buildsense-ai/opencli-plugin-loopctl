import { cli, Strategy } from '@jackwener/opencli/registry'
import { candidateSubmit } from './src/lib/commands.js'

cli({
  site: 'loop',
  name: 'candidate-submit',
  description: 'Validate and submit a Worker Candidate event to its Attempt topic',
  access: 'write',
  browser: false,
  strategy: Strategy.LOCAL,
  args: [{ name: 'event-file', help: 'Relative Candidate submission JSON file', required: true }],
  columns: ['targetTopicId', 'receipt'],
  defaultFormat: 'json',
  func: candidateSubmit
})
