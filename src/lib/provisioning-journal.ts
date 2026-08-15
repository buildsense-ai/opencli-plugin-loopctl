import { createHash } from 'node:crypto'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { canonicalJson } from './events.js'
import { acquireExclusiveLock } from './exclusive-lock.js'

export interface ProvisionedTopicRecord {
  groupId: string
  topic: string
  kind: 'agent_task' | 'standard'
  agentIds: string
  memberIds?: string
}

export interface ProvisioningJournal {
  schema: 'loopctl-provision-journal-v2'
  id: string
  kind: 'agent-task-start' | 'agent-task-retry'
  planDigest: string
  phase: 'validated' | 'project_resolved' | 'topics_created' | 'topics_attached' | 'registration_ingested' | 'bundle_ingested' | 'completed' | 'failed'
  createdAt: string
  updatedAt: string
  projectId?: string
  coordinatorTopic?: ProvisionedTopicRecord
  workerTopic?: ProvisionedTopicRecord
  evidenceTopic?: ProvisionedTopicRecord
  reviewTopic?: ProvisionedTopicRecord
  registrationReceipt?: unknown
  bundleReceipt?: unknown
  tick?: unknown
  error?: string
  manualCleanupTopicIds: string[]
}

type LegacyProvisioningJournal = Omit<ProvisioningJournal, 'schema'> & { schema: 'loopctl-provision-journal-v1' }

const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex')
const now = () => new Date().toISOString()

function numericIds(value: unknown): string[] | undefined {
  if (typeof value !== 'string') return undefined
  const ids = value.split(',').map(id => id.trim())
  if (ids.length === 0 || ids.some(id => !/^[1-9]\d*$/.test(id)) || new Set(ids).size !== ids.length) return undefined
  return ids.sort()
}

function isProvisionedTopicRecord(value: unknown): value is ProvisionedTopicRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const topic = value as Record<string, unknown>
  const groupId = topic.groupId
  const topicId = topic.topic
  const kind = topic.kind
  return typeof groupId === 'string' && typeof topicId === 'string' && /^[1-9]\d*$/.test(groupId) && topicId === `grp_${groupId}` &&
    (kind === 'agent_task' || kind === 'standard') && numericIds(topic.agentIds) !== undefined &&
    (topic.memberIds === undefined || numericIds(topic.memberIds) !== undefined)
}

function hasExactAgents(topic: ProvisionedTopicRecord, expected: string[]): boolean {
  const actual = numericIds(topic.agentIds)
  return actual !== undefined && actual.length === expected.length && actual.every((id, index) => id === expected[index])
}

function includesRoleMembers(topic: ProvisionedTopicRecord, expected: string[]): boolean {
  const members = topic.memberIds === undefined ? undefined : numericIds(topic.memberIds)
  return members === undefined || expected.every(id => members.includes(id))
}

function retryRolePrincipals(plan: unknown): { worker: string; reviewer: string } | undefined {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return undefined
  const value = plan as Record<string, unknown>
  const packet = value.packet
  const retry = value.retry
  if (!packet || typeof packet !== 'object' || Array.isArray(packet) || !retry || typeof retry !== 'object' || Array.isArray(retry)) return undefined
  const packetRecord = packet as Record<string, unknown>
  const retryRecord = retry as Record<string, unknown>
  const payload = retryRecord.payload
  if (packetRecord.kind !== 'recover_attempt' || retryRecord.type !== 'work_bundle_proposed' || !payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const worker = /^catsco-user:([1-9]\d*)$/.exec(String((payload as Record<string, unknown>).runtimePrincipal ?? ''))?.[1]
  const reviewer = /^catsco-user:([1-9]\d*)$/.exec(String(packetRecord.stewardPrincipal ?? ''))?.[1]
  return worker && reviewer ? { worker, reviewer } : undefined
}

/**
 * v1 retry journals are migrated only when their persisted routing can be
 * bound to the current retry's Worker and Review principals. v1 starts route
 * through a caller-owned coordinator session and cannot be reinterpreted as a
 * Project-owned coordinator invocation.
 */
function migrateLegacyRetryJournal(value: unknown, kind: ProvisioningJournal['kind'], id: string, planDigest: string, plan: unknown): ProvisioningJournal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('provisioning journal identity does not match the requested plan')
  const legacy = value as Partial<LegacyProvisioningJournal>
  if (legacy.schema !== 'loopctl-provision-journal-v1') throw new Error('provisioning journal identity does not match the requested plan')
  if (kind !== 'agent-task-retry') throw new Error('v1 agent-task-start journal cannot be resumed as a Project-owned coordinator invocation; create a new plan')
  const principals = retryRolePrincipals(plan)
  const workerTopic = legacy.workerTopic
  const evidenceTopic = legacy.evidenceTopic
  const reviewTopic = legacy.reviewTopic
  const workerAgents = principals ? [principals.worker] : []
  const evidenceAgents = principals ? [principals.worker, principals.reviewer].sort() : []
  const reviewAgents = principals ? [principals.reviewer] : []
  const topicIds = [workerTopic?.topic, evidenceTopic?.topic, reviewTopic?.topic]
  if (legacy.kind !== kind || legacy.planDigest !== planDigest || legacy.id !== id ||
    !Array.isArray(legacy.manualCleanupTopicIds) || !legacy.manualCleanupTopicIds.every(topic => typeof topic === 'string') ||
    typeof legacy.projectId !== 'string' || !/^[1-9]\d*$/.test(legacy.projectId) || !principals ||
    !isProvisionedTopicRecord(workerTopic) || !isProvisionedTopicRecord(evidenceTopic) || !isProvisionedTopicRecord(reviewTopic) ||
    workerTopic.kind !== 'agent_task' || evidenceTopic.kind !== 'standard' || reviewTopic.kind !== 'standard' ||
    new Set(topicIds).size !== topicIds.length ||
    !hasExactAgents(workerTopic, workerAgents) || !hasExactAgents(evidenceTopic, evidenceAgents) || !hasExactAgents(reviewTopic, reviewAgents) ||
    !includesRoleMembers(workerTopic, workerAgents) || !includesRoleMembers(evidenceTopic, evidenceAgents) || !includesRoleMembers(reviewTopic, reviewAgents)) {
    throw new Error('v1 retry journal topology is incompatible with safe migration')
  }
  return { ...legacy, schema: 'loopctl-provision-journal-v2' } as ProvisioningJournal
}

function directory(): string {
  return resolve(process.env.LOOPCTL_PROVISION_JOURNAL_DIR?.trim() || join(homedir(), '.local', 'state', 'loopctl', 'provisioning'))
}

async function persist(path: string, value: ProvisioningJournal): Promise<void> {
  const dir = directory()
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await chmod(dir, 0o700)
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await chmod(temporary, 0o600)
  await rename(temporary, path)
}

export async function openProvisionJournal(kind: ProvisioningJournal['kind'], plan: unknown) {
  const planDigest = digest(plan)
  const id = `${kind}:${planDigest}`
  const path = join(directory(), `${kind}-${planDigest}.json`)
  const dir = directory()
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await chmod(dir, 0o700)
  const lock = await acquireExclusiveLock(`${path}.lock`, `provisioning journal ${id}`)
  let journal: ProvisioningJournal
  try {
    try {
      const existing = JSON.parse(await readFile(path, 'utf8')) as unknown
      const isLegacy = !!existing && typeof existing === 'object' && !Array.isArray(existing) &&
        (existing as { schema?: unknown }).schema === 'loopctl-provision-journal-v1'
      journal = isLegacy ? migrateLegacyRetryJournal(existing, kind, id, planDigest, plan) : existing as ProvisioningJournal
      if (journal.schema !== 'loopctl-provision-journal-v2' || journal.kind !== kind || journal.planDigest !== planDigest || journal.id !== id) {
        throw new Error('provisioning journal identity does not match the requested plan')
      }
      if (journal.phase !== 'validated' && journal.phase !== 'failed') {
        throw new Error(`provisioning journal requires explicit recovery before resume: ${journal.phase}`)
      }
      if (isLegacy) await persist(path, journal)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const timestamp = now()
      journal = {
        schema: 'loopctl-provision-journal-v2', id, kind, planDigest, phase: 'validated',
        createdAt: timestamp, updatedAt: timestamp, manualCleanupTopicIds: []
      }
      await persist(path, journal)
    }
  } catch (error) {
    await lock.release()
    throw error
  }

  const release = async () => lock.release()
  const save = async (patch: Partial<Omit<ProvisioningJournal, 'schema' | 'id' | 'kind' | 'planDigest' | 'createdAt'>>) => {
    journal = { ...journal, ...patch, updatedAt: now() }
    await persist(path, journal)
    return journal
  }
  return { journal: () => journal, path, save, release }
}
