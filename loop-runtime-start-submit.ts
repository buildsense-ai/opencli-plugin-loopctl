import { cli, Strategy } from '@jackwener/opencli/registry'
import { runtimeStartSubmit } from './src/lib/commands.js'

cli({
  site: 'loop',
  name: 'runtime-start-submit',
  description: 'Worker-only: submit runtime_started JSON with CatsCo receipt verification',
  access: 'write',
  browser: false,
  strategy: Strategy.LOCAL,
  args: [{ name: 'received-topic', help: 'Native received CatsCo grp_<id> execution topic', required: true }],
  columns: ['targetTopicId', 'event', 'receipt'],
  defaultFormat: 'json',
  func: runtimeStartSubmit
})
