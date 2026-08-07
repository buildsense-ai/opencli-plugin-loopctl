import { spawn } from 'node:child_process'
import { CommandExecutionError } from '@jackwener/opencli/errors'

const MAX_OUTPUT = 128 * 1024
const TIMEOUT_MS = 30_000

function unwrap(value: unknown): unknown {
  if (value && typeof value === 'object' && 'data' in value) return (value as { data: unknown }).data
  return value
}

export interface AgentTaskTopic {
  groupId: string
  topic: string
  kind: 'agent_task'
  agentIds: string
}

async function runOpenCli(args: string[]): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.env.OPENCLI_BINARY?.trim() || 'opencli', args, { shell: false, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let killed = false
    const timer = setTimeout(() => { killed = true; child.kill('SIGKILL') }, TIMEOUT_MS)
    child.stdout.on('data', chunk => { stdout += String(chunk); if (Buffer.byteLength(stdout) > MAX_OUTPUT) { killed = true; child.kill('SIGKILL') } })
    child.stderr.on('data', chunk => { stderr += String(chunk).slice(0, 4096) })
    child.on('error', error => { clearTimeout(timer); reject(new CommandExecutionError(`CatsCo provisioning unavailable: ${error.message}`)) })
    child.on('close', code => {
      clearTimeout(timer)
      if (killed) return reject(new CommandExecutionError('CatsCo provisioning timed out or produced too much output'))
      if (code !== 0) return reject(new CommandExecutionError(`CatsCo provisioning failed: ${stderr.trim().slice(0, 512) || `exit ${code ?? 1}`}`))
      try { resolve(JSON.parse(stdout)) } catch { reject(new CommandExecutionError('CatsCo provisioning returned invalid JSON')) }
    })
  })
}

export async function createAgentTaskTopic(name: string, workerAgentUid: string): Promise<AgentTaskTopic> {
  if (!/^[1-9]\d*$/.test(workerAgentUid)) throw new CommandExecutionError('agent-task Worker UID must be numeric')
  if (!name || name.length > 180) throw new CommandExecutionError('agent-task name is invalid')
  const value = await runOpenCli(['catsco', 'group-create', name, workerAgentUid, '--kind', 'agent_task', '--format', 'json'])
  const row = unwrap(value)
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new CommandExecutionError('CatsCo agent-task provisioning returned a non-object')
  const record = row as Record<string, unknown>
  const groupId = String(record.groupId ?? record.group_id ?? '')
  const topic = String(record.topic ?? '')
  const kind = String(record.kind ?? '')
  const agentIds = String(record.agentIds ?? record.agent_ids ?? '')
  const actualIds = agentIds.split(',').map(value => value.trim()).filter(Boolean)
  if (!/^[1-9]\d*$/.test(groupId) || !/^grp_[1-9]\d*$/.test(topic) || kind !== 'agent_task' || actualIds.length !== 1 || actualIds[0] !== workerAgentUid) {
    throw new CommandExecutionError('CatsCo agent-task provisioning response failed topology verification')
  }
  return { groupId, topic, kind: 'agent_task', agentIds }
}

export async function attachTopicToProject(projectId: string, topic: string): Promise<void> {
  if (!/^[1-9]\d*$/.test(projectId)) throw new CommandExecutionError('CatsCo Project id must be numeric')
  await runOpenCli(['catsco', 'project-assign-topic', projectId, topic, '--format', 'json'])
  const sessions = unwrap(await runOpenCli(['catsco', 'project-sessions', projectId, '--format', 'json']))
  if (!Array.isArray(sessions) || !sessions.some(row => row && typeof row === 'object' && String((row as Record<string, unknown>).topicId ?? '') === topic)) {
    throw new CommandExecutionError('CatsCo Project assignment readback did not contain the Attempt topic')
  }
}
