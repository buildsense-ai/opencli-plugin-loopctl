import { cli, Strategy } from '@jackwener/opencli/registry'
import { agentTaskFanout } from './src/lib/commands.js'

cli({
  site: 'loop',
  name: 'agent-task-fanout',
  description: 'Review-only: provision one CatsCo agent_task conversation per Attempt, then register and dispatch the fan-out',
  access: 'write',
  browser: false,
  strategy: Strategy.LOCAL,
  args: [{ name: 'plan-file', help: 'Fan-out JSON with workerTopicId agent-task:<WorkerAgentUid> placeholders', required: true }],
  columns: ['count', 'provisionedTopics', 'receipts', 'tick'],
  defaultFormat: 'json',
  func: agentTaskFanout,
})
