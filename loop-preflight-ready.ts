import { cli, Strategy } from '@jackwener/opencli/registry'
import { preflightReady } from './src/lib/commands.js'

cli({
  site: 'loop',
  name: 'preflight-ready',
  description: 'Worker-only: validate a native preflight packet and receipt-submit worker_ready',
  access: 'write',
  browser: false,
  strategy: Strategy.LOCAL,
  args: [
    { name: 'packet-file', help: 'Relative raw Controller preflight packet JSON file', required: true },
    { name: 'received-topic', help: 'Native received CatsCo grp_<id> topic', required: true }
  ],
  columns: ['targetTopicId', 'event', 'receipt'],
  defaultFormat: 'json',
  func: preflightReady
})
