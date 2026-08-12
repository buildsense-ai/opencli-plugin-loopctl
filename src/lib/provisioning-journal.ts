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
  schema: 'loopctl-provision-journal-v1'
  id: string
  kind: 'agent-task-start' | 'agent-task-retry'
  planDigest: string
  phase: 'validated' | 'project_resolved' | 'topics_created' | 'topics_attached' | 'registration_ingested' | 'bundle_ingested' | 'completed' | 'failed'
  createdAt: string
  updatedAt: string
  projectId?: string
  workerTopic?: ProvisionedTopicRecord
  evidenceTopic?: ProvisionedTopicRecord
  reviewTopic?: ProvisionedTopicRecord
  registrationReceipt?: unknown
  bundleReceipt?: unknown
  tick?: unknown
  error?: string
  manualCleanupTopicIds: string[]
}

const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex')
const now = () => new Date().toISOString()

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
      journal = JSON.parse(await readFile(path, 'utf8')) as ProvisioningJournal
      if (journal.schema !== 'loopctl-provision-journal-v1' || journal.kind !== kind || journal.planDigest !== planDigest || journal.id !== id) {
        throw new Error('provisioning journal identity does not match the requested plan')
      }
      if (journal.phase !== 'validated' && journal.phase !== 'failed') {
        throw new Error(`provisioning journal requires explicit recovery before resume: ${journal.phase}`)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const timestamp = now()
      journal = {
        schema: 'loopctl-provision-journal-v1', id, kind, planDigest, phase: 'validated',
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
