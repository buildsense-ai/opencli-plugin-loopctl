import { cli, Strategy } from '@jackwener/opencli/registry'
import { workspacePrepare } from './src/lib/commands.js'

cli({
  site: 'loop',
  name: 'workspace-prepare',
  description: 'Worker-only: server-read the native execute packet and create the exact fenced Git worktree',
  access: 'write',
  browser: false,
  strategy: Strategy.LOCAL,
  args: [{ name: 'received-topic', help: 'Native received CatsCo grp_<id> topic', required: true }],
  columns: ['state', 'worktreePath', 'gitDir', 'branchName', 'baseRevision', 'workspaceLease', 'receiptDigest'],
  defaultFormat: 'json',
  func: workspacePrepare
})
