import { cli, Strategy } from '@jackwener/opencli/registry'
import { readinessSubmit } from './src/lib/commands.js'

cli({
  site: 'loop',
  name: 'readiness-submit',
  description: 'Worker-only: submit receipt-attested worker_ready JSON before an Attempt starts',
  access: 'write',
  browser: false,
  strategy: Strategy.LOCAL,
  args: [{ name: 'event-file', help: 'Relative worker_ready submission JSON file', required: true }],
  columns: ['targetTopicId', 'event', 'receipt'],
  defaultFormat: 'json',
  func: readinessSubmit
})
