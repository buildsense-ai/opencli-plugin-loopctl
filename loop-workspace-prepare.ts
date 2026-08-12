import { cli, Strategy } from '@jackwener/opencli/registry'
import { workspacePrepare } from './src/lib/commands.js'

cli({
  site: 'loop',
  name: 'workspace-prepare',
  description: 'Worker-only: create and verify the exact fenced Git worktree from an execute packet',
  access: 'write',
  browser: false,
  strategy: Strategy.LOCAL,
  args: [{ name: 'packet-file', help: 'Relative execute_attempt packet JSON file', required: true }],
  columns: ['state', 'worktreePath', 'gitDir', 'branchName', 'baseRevision', 'workspaceLease', 'receiptDigest'],
  defaultFormat: 'json',
  func: workspacePrepare
})
