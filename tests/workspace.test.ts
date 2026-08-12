import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { prepareWorkspaceFromPacket } from '../src/lib/workspace.js'

const roots: string[] = []
afterEach(() => {
  delete process.env.LOOPCTL_WORKSPACE_REGISTRY_DIR
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true })
})

function git(cwd: string, args: string[]) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim()
}

function repository(root: string) {
  const bare = join(root, 'repo.git')
  const seed = join(root, 'seed')
  execFileSync('git', ['init', '--bare', bare])
  execFileSync('git', ['init', seed])
  git(seed, ['config', 'user.name', 'Loop Test'])
  git(seed, ['config', 'user.email', 'loop@example.test'])
  writeFileSync(join(seed, 'README.md'), 'seed\n')
  git(seed, ['add', 'README.md'])
  git(seed, ['commit', '-m', 'seed'])
  const baseRevision = git(seed, ['rev-parse', 'HEAD'])
  git(seed, ['remote', 'add', 'origin', bare])
  git(seed, ['push', 'origin', 'HEAD:refs/heads/main'])
  return { bare, baseRevision }
}

describe('workspace preparation', () => {
  it('creates then verifies the exact fenced branch, base revision, path, and lease', async () => {
    const root = mkdtempSync(join(tmpdir(), 'workspace-prepare-')); roots.push(root)
    const { bare, baseRevision } = repository(root)
    const worktreePath = join(root, 'worktree')
    process.env.LOOPCTL_WORKSPACE_REGISTRY_DIR = join(root, 'workspace-registry')
    const contract = {
      repository: 'acme/repo', baseRevision, branchName: 'loop/loop-1/work', worktreePath, gitDir: bare,
      cleanupPolicy: 'retain-until-review', workspaceLease: 'lease-1'
    }
    const packet = {
      kind: 'execute_attempt', loopId: 'loop-1', githubRepo: 'acme/repo',
      workBundle: { instructions: `bounded work\nLOOP_WORKTREE_CONTRACT_V1=${JSON.stringify(contract)}` }
    }

    const created = await prepareWorkspaceFromPacket(packet)
    expect(created).toMatchObject({ state: 'created', worktreePath, gitDir: bare, baseRevision, workspaceLease: 'lease-1' })
    expect(git(worktreePath, ['branch', '--show-current'])).toBe('loop/loop-1/work')
    expect(git(worktreePath, ['rev-parse', 'HEAD'])).toBe(baseRevision)

    const verified = await prepareWorkspaceFromPacket(packet)
    expect(verified).toMatchObject({ state: 'verified', contractDigest: created.contractDigest, workspaceLease: 'lease-1' })
  })

  it('fails closed when a reused workspace lease names a different contract', async () => {
    const root = mkdtempSync(join(tmpdir(), 'workspace-lease-')); roots.push(root)
    const { bare, baseRevision } = repository(root)
    process.env.LOOPCTL_WORKSPACE_REGISTRY_DIR = join(root, 'workspace-registry')
    const packet = (worktreePath: string, branchName: string) => ({
      kind: 'execute_attempt', loopId: 'loop-1', githubRepo: 'acme/repo',
      workBundle: { instructions: `LOOP_WORKTREE_CONTRACT_V1=${JSON.stringify({ repository: 'acme/repo', baseRevision, branchName, worktreePath, gitDir: bare, cleanupPolicy: 'retain-until-review', workspaceLease: 'shared-lease' })}` }
    })
    await prepareWorkspaceFromPacket(packet(join(root, 'one'), 'loop/loop-1/one'))
    await expect(prepareWorkspaceFromPacket(packet(join(root, 'two'), 'loop/loop-1/two'))).rejects.toThrow(/lease is already bound/)
  })
})
