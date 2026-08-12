import { cli, Strategy } from '@jackwener/opencli/registry'
import { runtimeStartSubmit } from './src/lib/commands.js'

cli({
  site: 'loop',
  name: 'runtime-start-submit',
  description: 'Worker-only: submit runtime_started JSON with CatsCo receipt verification',
  access: 'write',
  browser: false,
  strategy: Strategy.LOCAL,
  args: [{ name: 'event-file', help: 'Relative runtime_started submission JSON file', required: true }],
  columns: ['targetTopicId', 'event', 'receipt'],
  defaultFormat: 'json',
  func: runtimeStartSubmit
})
