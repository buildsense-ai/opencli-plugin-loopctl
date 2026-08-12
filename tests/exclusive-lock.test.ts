import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { acquireExclusiveLock } from '../src/lib/exclusive-lock.js'

const roots: string[] = []
afterEach(() => {
  delete process.env.LOOPCTL_LOCK_STALE_MS
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('exclusive lock recovery', () => {
  it('reclaims a lock owned by a known-dead process', async () => {
    const root = mkdtempSync(join(tmpdir(), 'loop-lock-')); roots.push(root)
    const path = join(root, 'lock')
    writeFileSync(path, JSON.stringify({ schema: 'loopctl-exclusive-lock-v1', token: 'dead', pid: 999_999_999, createdAt: new Date().toISOString() }))
    const lock = await acquireExclusiveLock(path, 'test lock')
    await lock.release()
  })

  it('fails closed while a live process owns the lock', async () => {
    const root = mkdtempSync(join(tmpdir(), 'loop-lock-')); roots.push(root)
    const path = join(root, 'lock')
    const first = await acquireExclusiveLock(path, 'test lock')
    await expect(acquireExclusiveLock(path, 'test lock')).rejects.toThrow(/already active/)
    await first.release()
  })
})
