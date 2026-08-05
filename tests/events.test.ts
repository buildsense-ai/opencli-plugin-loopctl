import { describe, expect, it } from 'vitest'
import { parsePlan, runtimeStarted } from '../src/lib/events.js'

describe('strict Agent event builders', () => {
  it('rejects prototype or identity fields outside the existing event schema', () => {
    expect(() => runtimeStarted.parse({ type:'runtime_started', eventId:'e', idempotencyKey:'k', source:'s', entityRef:'r', senderUid:'forged', payload:{ workItemId:'w', expectedRevision:2, attemptId:'a', generation:1, runtimePrincipal:'catsco-user:1', signature:'catsco-message-attested' } })).toThrow()
  })
  it('requires the attestation marker for runtime startup', () => {
    expect(() => runtimeStarted.parse({ type:'runtime_started', eventId:'e', idempotencyKey:'k', source:'s', entityRef:'r', payload:{ workItemId:'w', expectedRevision:2, attemptId:'a', generation:1, runtimePrincipal:'catsco-user:1', signature:'manual' } })).toThrow()
  })
  it('requires registration then bundle in a plan', () => {
    expect(() => parsePlan('[]')).toThrow()
  })
})
