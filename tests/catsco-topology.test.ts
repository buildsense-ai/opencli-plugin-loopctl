import { afterEach, describe, expect, it } from 'vitest'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createStandardTopic } from '../src/lib/catsco.js'

const roots: string[] = []
afterEach(() => {
  delete process.env.OPENCLI_BINARY
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true })
})

function install(root: string, swapped = false) {
  const binary = join(root, 'opencli.js')
  writeFileSync(binary, `#!/usr/bin/env node
const args=process.argv.slice(2);
if(args[1]==='me') process.stdout.write(JSON.stringify({uid:'602'}));
else if(args[1]==='group-create') process.stdout.write(JSON.stringify({groupId:'101',topic:'grp_101',kind:'standard',agentIds:'559,574'}));
else if(args[1]==='group-info') process.stdout.write(JSON.stringify({groupId:${swapped ? "'102'" : "'101'"},topic:${swapped ? "'grp_102'" : "'grp_101'"},kind:'standard',agentIds:'559,574',memberIds:'602,559,574'}));
else { process.stderr.write('unexpected'); process.exit(1) }
`)
  chmodSync(binary, 0o755)
  process.env.OPENCLI_BINARY = binary
}

describe('CatsCo provisioning topology', () => {
  it('rejects a group-info response not bound to the requested group id and topic', async () => {
    const root = mkdtempSync(join(tmpdir(), 'catsco-topology-')); roots.push(root)
    install(root, true)
    await expect(createStandardTopic('evidence', ['559', '574'])).rejects.toThrow(/did not bind/)
  })

  it('accepts exact group-id and topic readback', async () => {
    const root = mkdtempSync(join(tmpdir(), 'catsco-topology-')); roots.push(root)
    install(root)
    await expect(createStandardTopic('evidence', ['559', '574'])).resolves.toMatchObject({ groupId: '101', topic: 'grp_101', kind: 'standard' })
  })
})
