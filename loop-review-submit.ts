import { cli, Strategy } from '@jackwener/opencli/registry'
import { reviewSubmit } from './src/lib/commands.js'

cli({
  site: 'loop',
  name: 'review-submit',
  description: 'Review-only: submit a receipt-attested review_decided event to an Attempt evidence lane',
  access: 'write',
  browser: false,
  strategy: Strategy.LOCAL,
  args: [{ name: 'event-file', help: 'Relative Review decision submission JSON file', required: true }],
  columns: ['targetTopicId', 'event', 'receipt'],
  defaultFormat: 'json',
  func: reviewSubmit
})
