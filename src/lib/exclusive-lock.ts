import { randomUUID } from 'node:crypto'
import { chmod, mkdir, open, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

interface LockRecord {
  schema: 'loopctl-exclusive-lock-v1'
  token: string
  pid: number
  createdAt: string
}

const DEFAULT_STALE_MS = 15 * 60_000

function staleMs(): number {
  const value = Number(process.env.LOOPCTL_LOCK_STALE_MS ?? DEFAULT_STALE_MS)
  if (!Number.isFinite(value) || value < 1_000) throw new Error('LOOPCTL_LOCK_STALE_MS must be at least 1000 milliseconds')
  return value
}

function processIsAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function canReclaim(path: string): Promise<boolean> {
  const timeout = staleMs()
  const metadata = await stat(path)
  let record: Partial<LockRecord> = {}
  try { record = JSON.parse(await readFile(path, 'utf8')) as Partial<LockRecord> } catch { /* invalid lock ages out */ }
  const created = Date.parse(typeof record.createdAt === 'string' ? record.createdAt : metadata.mtime.toISOString())
  const pid = Number(record.pid)
  // A known dead owner is safe to reclaim immediately. If metadata is absent or
  // malformed, wait for the stale horizon so we never race a just-created lock
  // whose writer died before flushing its record.
  if (Number.isSafeInteger(pid) && pid > 0) return !processIsAlive(pid)
  const age = Number.isFinite(created) ? Date.now() - created : Number.POSITIVE_INFINITY
  return age >= timeout
}

export interface ExclusiveLock {
  release(): Promise<void>
}

/**
 * Process-local durable lock with bounded crash recovery. The lock is only
 * reclaimed when its process is gone or its recorded lifetime has exceeded the
 * configured stale threshold; normal concurrent callers fail closed.
 */
export async function acquireExclusiveLock(path: string, label: string): Promise<ExclusiveLock> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const token = randomUUID()
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const handle = await open(path, 'wx', 0o600)
      const record: LockRecord = { schema: 'loopctl-exclusive-lock-v1', token, pid: process.pid, createdAt: new Date().toISOString() }
      try {
        await handle.writeFile(`${JSON.stringify(record)}\n`, 'utf8')
        await handle.sync()
        await chmod(path, 0o600)
      } catch (error) {
        await handle.close()
        await unlink(path).catch(() => undefined)
        throw error
      }
      await handle.close()
      return {
        release: async () => {
          try {
            const current = JSON.parse(await readFile(path, 'utf8')) as Partial<LockRecord>
            if (current.token === token) await unlink(path)
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (!await canReclaim(path)) throw new Error(`${label} is already active`)
      await unlink(path).catch(() => undefined)
    }
  }
  throw new Error(`${label} could not acquire a recovered lock`)
}
