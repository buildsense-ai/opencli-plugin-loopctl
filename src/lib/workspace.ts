import { createHash, randomUUID } from 'node:crypto'
import { chmod, lstat, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { CommandExecutionError } from '@jackwener/opencli/errors'
import { z } from 'zod'
import { canonicalJson, worktreeContractSchema } from './events.js'
import { acquireExclusiveLock } from './exclusive-lock.js'

const id = z.string().min(1)
const packetSchema = z.object({
  kind: z.literal('execute_attempt'), loopId: id, githubRepo: id,
  workBundle: z.object({ instructions: id }).passthrough()
}).passthrough()

const MAX_OUTPUT = 128 * 1024
const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex')

function workspaceRegistryDirectory() {
  return resolve(process.env.LOOPCTL_WORKSPACE_REGISTRY_DIR?.trim() || join(homedir(), '.local', 'state', 'loopctl', 'workspaces'))
}

async function git(gitDir: string, args: string[]): Promise<string> {
  return await new Promise((resolveResult, reject) => {
    const child = spawn('git', ['-C', gitDir, ...args], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = '', killed = false
    child.stdout.on('data', chunk => { stdout += String(chunk); if (Buffer.byteLength(stdout) > MAX_OUTPUT) { killed = true; child.kill('SIGKILL') } })
    child.stderr.on('data', chunk => { stderr += String(chunk); if (Buffer.byteLength(stderr) > MAX_OUTPUT) { killed = true; child.kill('SIGKILL') } })
    child.on('error', error => reject(new CommandExecutionError(`git workspace preparation unavailable: ${error.message}`)))
    child.on('close', code => {
      if (killed) return reject(new CommandExecutionError('git workspace preparation produced too much output'))
      if (code !== 0) return reject(new CommandExecutionError(`git workspace preparation failed: ${stderr.trim().slice(0, 512) || `exit ${code ?? 1}`}`))
      resolveResult(stdout.trim())
    })
  })
}

function contractFromInstructions(instructions: string) {
  const marker = 'LOOP_WORKTREE_CONTRACT_V1='
  const lines = instructions.split('\n').filter(line => line.startsWith(marker))
  if (lines.length !== 1) throw new CommandExecutionError('execute packet requires exactly one LOOP_WORKTREE_CONTRACT_V1 line')
  try { return worktreeContractSchema.parse(JSON.parse(lines[0]!.slice(marker.length))) }
  catch { throw new CommandExecutionError('execute packet carries an invalid worktree contract') }
}

function normalizedAbsolute(path: string, label: string) {
  if (!isAbsolute(path) || normalize(path) !== path) throw new CommandExecutionError(`${label} must be normalized and absolute`)
  return resolve(path)
}

function registeredWorktree(list: string, path: string, branch: string): boolean {
  const records = list.split('\n\n').map(record => Object.fromEntries(record.split('\n').map(line => {
    const index = line.indexOf(' ')
    return index < 0 ? [line, ''] : [line.slice(0, index), line.slice(index + 1)]
  })))
  return records.some(record => record.worktree === path && record.branch === `refs/heads/${branch}`)
}

interface WorkspaceLeaseClaim { release(): Promise<void> }

async function claimLease(value: Record<string, unknown>): Promise<WorkspaceLeaseClaim> {
  const directory = workspaceRegistryDirectory()
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700)
  const key = digest({ workspaceLease: value.workspaceLease })
  const path = join(directory, `${key}.json`)
  const lock = await acquireExclusiveLock(`${path}.lock`, `workspace lease ${String(value.workspaceLease)}`)
  try {
    const expectedDigest = digest(value)
    try {
      const current = JSON.parse(await readFile(path, 'utf8')) as { digest?: string }
      if (current.digest !== expectedDigest) throw new CommandExecutionError('workspace lease is already bound to a different contract')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
      await writeFile(temporary, `${JSON.stringify({ schema: 'loopctl-workspace-lease-v1', digest: expectedDigest, contract: value }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      await chmod(temporary, 0o600)
      await rename(temporary, path)
    }
  } catch (error) {
    await lock.release()
    throw error
  }
  return { release: async () => lock.release() }
}

export async function prepareWorkspaceFromPacket(raw: unknown) {
  let packet: z.infer<typeof packetSchema>
  try { packet = packetSchema.parse(raw) }
  catch { throw new CommandExecutionError('workspace-prepare requires an execute_attempt packet') }
  const contract = contractFromInstructions(packet.workBundle.instructions)
  if (!contract.gitDir) throw new CommandExecutionError('worktree contract must include gitDir for workspace-prepare')
  const worktreePath = normalizedAbsolute(contract.worktreePath, 'worktreePath')
  const gitDir = normalizedAbsolute(contract.gitDir, 'gitDir')
  if (!contract.branchName.startsWith(`loop/${packet.loopId}/`)) throw new CommandExecutionError('worktree branch must be scoped to the packet loopId')
  if (worktreePath === gitDir || relative(gitDir, worktreePath) === '') throw new CommandExecutionError('worktreePath must differ from gitDir')

  const baseRevision = await git(gitDir, ['rev-parse', `${contract.baseRevision}^{commit}`])
  const contractDigest = digest(contract)
  const lease = await claimLease({ worktreePath, gitDir, branchName: contract.branchName, baseRevision, workspaceLease: contract.workspaceLease, contractDigest })
  let state: 'created' | 'verified' | undefined
  try {
    try {
      const stat = await lstat(worktreePath)
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new CommandExecutionError('existing worktreePath is not a regular directory')
      const list = await git(gitDir, ['worktree', 'list', '--porcelain'])
      const actualWorktreePath = await realpath(worktreePath)
      if (!registeredWorktree(list, actualWorktreePath, contract.branchName)) {
        throw new CommandExecutionError('existing worktreePath is not registered to the required branch')
      }
      const head = await git(worktreePath, ['rev-parse', 'HEAD'])
      if (head !== baseRevision) throw new CommandExecutionError('existing worktree HEAD does not match the contract base revision')
      state = 'verified'
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await mkdir(dirname(worktreePath), { recursive: true, mode: 0o700 })
      await git(gitDir, ['worktree', 'add', '-b', contract.branchName, worktreePath, baseRevision])
      state = 'created'
    }

    const receipt = {
      schema: 'loopctl-workspace-receipt-v1', state, worktreePath, gitDir, branchName: contract.branchName,
      baseRevision, workspaceLease: contract.workspaceLease, contractDigest
    }
    return { ...receipt, receiptDigest: digest(receipt) }
  } catch (error) {
    if (state === 'created') {
      await git(gitDir, ['worktree', 'remove', '--force', worktreePath]).catch(() => undefined)
    }
    throw error
  } finally { await lease.release() }
}
