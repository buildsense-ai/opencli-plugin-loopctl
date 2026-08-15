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

export interface StandardTopic {
  groupId: string
  topic: string
  kind: 'standard' | 'agent_task'
  agentIds: string
  memberIds: string
}

export interface CatscoSendReceipt {
  messageId: string
  topicId: string
  clientMsgId: string
  seqId: string
  duplicate: boolean
  contentDigest: string
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  const row = unwrap(value)
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new CommandExecutionError(`CatsCo ${label} returned a non-object`)
  return row as Record<string, unknown>
}

function asIdentityRecord(value: unknown): Record<string, unknown> {
  const identity = unwrap(value)
  const row = Array.isArray(identity) && identity.length === 1 ? identity[0] : identity
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new CommandExecutionError('CatsCo identity returned an invalid response')
  return row as Record<string, unknown>
}

export async function sendAttemptEvent(topicId: string, content: string, clientMsgId: string, expectedPrincipal: string): Promise<CatscoSendReceipt> {
  if (!/^(?:p2p_[1-9]\d*_[1-9]\d*|grp_[1-9]\d*)$/.test(topicId)) throw new CommandExecutionError('attested event targetTopicId must be a CatsCo Attempt topic')
  if (!clientMsgId.trim()) throw new CommandExecutionError('attested event idempotencyKey is required')
  const expectedUid = /^catsco-user:([1-9]\d*)$/.exec(expectedPrincipal)?.[1]
  if (!expectedUid) throw new CommandExecutionError('attested event source must be a numeric CatsCo principal')
  const authenticatedUid = await currentCatscoUid()
  if (authenticatedUid !== expectedUid) throw new CommandExecutionError('CatsCo authenticated sender does not match attested event source')
  const sent = asRecord(await runOpenCli(['catsco', 'send', topicId, content, '--client-message-id', clientMsgId, '--format', 'json']), 'attested event send')
  const receipt = {
    messageId: String(sent.messageId ?? ''),
    topicId: String(sent.topicId ?? ''),
    clientMsgId: String(sent.clientMsgId ?? ''),
    seqId: String(sent.seqId ?? ''),
    duplicate: sent.duplicate === true,
    contentDigest: String(sent.contentDigest ?? '')
  }
  if (!receipt.messageId || !receipt.seqId || receipt.topicId !== topicId || receipt.clientMsgId !== clientMsgId || !receipt.contentDigest) {
    throw new CommandExecutionError('CatsCo attested event send receipt failed verification')
  }
  const confirmed = asRecord(await runOpenCli(['catsco', 'message-receipt', topicId, '--client-message-id', clientMsgId, '--format', 'json']), 'attested event receipt')
  if (confirmed.found !== true || confirmed.serverConfirmed !== true || String(confirmed.topicId ?? '') !== topicId || String(confirmed.clientMsgId ?? '') !== clientMsgId || String(confirmed.seqId ?? '') !== receipt.seqId || String(confirmed.contentDigest ?? '') !== receipt.contentDigest) {
    throw new CommandExecutionError('CatsCo attested event receipt was not server-confirmed')
  }
  return receipt
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

async function currentCatscoUid(): Promise<string> {
  const row = asIdentityRecord(await runOpenCli(['catsco', 'me', '--format', 'json']))
  const uid = String(row.uid ?? '')
  if (!/^[1-9]\d*$/.test(uid)) throw new CommandExecutionError('CatsCo identity response has no numeric uid')
  return uid
}

function csv(value: unknown): string[] {
  return String(value ?? '').split(',').map(item => item.trim()).filter(Boolean)
}

async function groupInfo(groupId: string): Promise<StandardTopic> {
  const row = asRecord(await runOpenCli(['catsco', 'group-info', groupId, '--format', 'json']), 'group topology')
  const returnedGroupId = String(row.groupId ?? '')
  const topic = String(row.topic ?? '')
  const kind = String(row.kind ?? '')
  const agentIds = csv(row.agentIds).sort()
  const memberIds = csv(row.memberIds).sort()
  if (returnedGroupId !== groupId || topic !== `grp_${groupId}` || (kind !== 'standard' && kind !== 'agent_task')) {
    throw new CommandExecutionError('CatsCo group topology response did not bind the requested group')
  }
  return { groupId: returnedGroupId, topic, kind: kind as 'standard' | 'agent_task', agentIds: agentIds.join(','), memberIds: memberIds.join(',') }
}

export async function createStandardTopic(name: string, agentUids: string[]): Promise<StandardTopic> {
  const ownerUid = await currentCatscoUid()
  const expected = [...new Set(agentUids)].sort()
  if (!name || name.length > 180 || expected.length === 0 || expected.some(uid => !/^[1-9]\d*$/.test(uid))) {
    throw new CommandExecutionError('standard evidence/review topic request is invalid')
  }
  const created = asRecord(await runOpenCli(['catsco', 'group-create', name, expected.join(','), '--kind', 'standard', '--format', 'json']), 'standard topic provisioning')
  const groupId = String(created.groupId ?? created.group_id ?? '')
  if (!/^[1-9]\d*$/.test(groupId)) throw new CommandExecutionError('CatsCo standard topic provisioning returned an invalid group id')
  const topology = await groupInfo(groupId)
  if (topology.kind !== 'standard' || topology.agentIds.split(',').filter(Boolean).sort().join(',') !== expected.join(',') ||
    !topology.memberIds.split(',').filter(Boolean).includes(ownerUid)) {
    throw new CommandExecutionError('CatsCo standard topic topology failed verification')
  }
  return { ...topology, kind: 'standard' }
}

export async function createAgentTaskTopic(name: string, workerAgentUid: string): Promise<AgentTaskTopic> {
  const ownerUid = await currentCatscoUid()
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
  const topology = await groupInfo(groupId)
  if (topology.kind !== 'agent_task' || topology.agentIds !== workerAgentUid || !topology.memberIds.split(',').filter(Boolean).includes(ownerUid)) {
    throw new CommandExecutionError('CatsCo agent-task topology failed verification')
  }
  return { groupId, topic, kind: 'agent_task', agentIds }
}

/** Create a Project for one new agent-task-start invocation. Never list or reuse Projects here. */
export async function createAttemptProject(loopId: string, attemptId: string): Promise<string> {
  const name = `Loop ${loopId} ${attemptId}`
  if (!name || name.length > 180) throw new CommandExecutionError('CatsCo Project name is invalid')
  const created = asRecord(await runOpenCli(['catsco', 'project-create', name, '--format', 'json']), 'Project provisioning')
  const projectId = String(created.id ?? created.projectId ?? created.project_id ?? '')
  if (!/^[1-9]\d*$/.test(projectId)) throw new CommandExecutionError('CatsCo Project provisioning returned an invalid Project id')
  return projectId
}

/** Legacy shared-Project resolver; never use for a new agent-task-start invocation. */
export async function resolveLoopProject(loopId: string, requestedProjectId: string): Promise<string> {
  if (/^[1-9]\d*$/.test(requestedProjectId)) return requestedProjectId
  if (requestedProjectId !== 'project:auto') throw new CommandExecutionError('catscoProjectId must be numeric or project:auto')
  const name = `Loop ${loopId}`
  const listed = unwrap(await runOpenCli(['catsco', 'projects', '--format', 'json']))
  if (!Array.isArray(listed)) throw new CommandExecutionError('CatsCo Projects returned invalid JSON')
  const existing = listed.find(row => row && typeof row === 'object' && String((row as Record<string, unknown>).name ?? '') === name) as Record<string, unknown> | undefined
  if (existing && /^[1-9]\d*$/.test(String(existing.id ?? ''))) return String(existing.id)
  const created = unwrap(await runOpenCli(['catsco', 'project-create', name, '--format', 'json']))
  if (!created || typeof created !== 'object' || !/^[1-9]\d*$/.test(String((created as Record<string, unknown>).id ?? ''))) {
    throw new CommandExecutionError('CatsCo Project allocation returned an invalid Project id')
  }
  return String((created as Record<string, unknown>).id)
}

export async function attachTopicToProject(projectId: string, topic: string): Promise<void> {
  if (!/^[1-9]\d*$/.test(projectId)) throw new CommandExecutionError('CatsCo Project id must be numeric')
  await runOpenCli(['catsco', 'project-assign-topic', projectId, topic, '--format', 'json'])
  const sessions = unwrap(await runOpenCli(['catsco', 'project-sessions', projectId, '--format', 'json']))
  if (!Array.isArray(sessions) || !sessions.some(row => row && typeof row === 'object' && String((row as Record<string, unknown>).topicId ?? '') === topic)) {
    throw new CommandExecutionError('CatsCo Project assignment readback did not contain the Attempt topic')
  }
}
