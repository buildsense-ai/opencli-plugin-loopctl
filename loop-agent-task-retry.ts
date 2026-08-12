import { cli, Strategy } from '@jackwener/opencli/registry'
import { agentTaskRetry } from './src/lib/commands.js'

cli({
  site: 'loop',
  name: 'agent-task-retry',
  description: 'Review-only: provision fresh fenced Topics for a recover_attempt packet and submit its next-generation bundle',
  access: 'write',
  browser: false,
  strategy: Strategy.LOCAL,
  args: [
    { name: 'packet-file', help: 'Relative recover_attempt packet JSON file', required: true },
    { name: 'event-file', help: 'Relative next-generation work_bundle_proposed JSON file', required: true }
  ],
  columns: ['projectId', 'provisionedTopics', 'receipt', 'tick', 'journalPath'],
  defaultFormat: 'json',
  func: agentTaskRetry
})
