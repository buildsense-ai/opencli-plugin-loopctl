import { cli, Strategy } from '@jackwener/opencli/registry'
import { agentTaskStart } from './src/lib/commands.js'

cli({
  site: 'loop',
  name: 'agent-task-start',
  description: 'Review-only: atomically journal and provision one Worker execution, evidence, and Review Topic before dispatch',
  access: 'write',
  browser: false,
  strategy: Strategy.LOCAL,
  args: [{ name: 'plan-file', help: 'Single-item plan with agent-task/evidence/review placeholders', required: true }],
  columns: ['count', 'projectId', 'provisionedTopics', 'receipts', 'tick', 'journalPath'],
  defaultFormat: 'json',
  func: agentTaskStart
})
