import { describe, expect, it } from 'vitest'
import { parseFanout, parseIntegrationPlan, parsePlan, runtimeStarted } from '../src/lib/events.js'

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
  it('requires explicit Candidate inputs for an integration plan', () => {
    const event={type:'work_item_registered',eventId:'r-i',idempotencyKey:'r-i',source:'review',entityRef:'work_item:integration',payload:{workItemId:'integration',loopId:'loop-1',profileId:'integration',terminalState:'accepted',taskContractHash:'task-hash-1',referenceSnapshotHash:'ref-hash-1',writeScopeHash:'scope-hash-1',acceptanceContractHash:'accept-hash-1',writeScope:['src'],githubRepo:'org/repo',catscoProjectId:'none',workerTopicId:'p2p_275_559',stewardTopicId:'p2p_275_574',stewardPrincipal:'catsco-user:574'}}
    const bundle={type:'work_bundle_proposed',eventId:'b-i',idempotencyKey:'b-i',source:'review',entityRef:'work_item:integration',payload:{workItemId:'integration',expectedRevision:1,attemptId:'attempt-i',attemptNumber:1,generation:0,runtimePrincipal:'catsco-user:559',proofMode:'catsco-message',leaseExpiresAt:'2030-01-01T00:00:00.000Z',workBundle:{contractDigest:'contract-hash-1',instructions:'integrate\nLOOP_INTEGRATION_INPUTS_V1='+JSON.stringify([{workItemId:'a',candidateId:'c-a',repository:'org/repo',prNumber:1,headSha:'sha-a',digest:'digest-a'}])+'\nLOOP_WORKTREE_CONTRACT_V1='+JSON.stringify({repository:'org/repo',baseRevision:'abc12345',branchName:'loop/loop-1/integration',worktreePath:'/tmp/integration',cleanupPolicy:'retain-until-review',workspaceLease:'lease-integration'}),deliverables:['github_pr']},taskContractHash:'task-hash-1',referenceSnapshotHash:'ref-hash-1',writeScopeHash:'scope-hash-1',acceptanceContractHash:'accept-hash-1'}}
    expect(parseIntegrationPlan(JSON.stringify([event,bundle])).inputs).toHaveLength(1)
    expect(()=>parseIntegrationPlan(JSON.stringify([event,{...bundle,payload:{...bundle.payload,workBundle:{...bundle.payload.workBundle,instructions:'integrate'}}}]))).toThrow(/INPUTS/)
    expect(()=>parseIntegrationPlan(JSON.stringify([event,{...bundle,payload:{...bundle.payload,workBundle:{...bundle.payload.workBundle,instructions:bundle.payload.workBundle.instructions+'\nLOOP_INTEGRATION_INPUTS_V1=[]'}}}]))).toThrow(/exactly one/)
  })
  it('accepts isolated fan-out pairs and rejects duplicate worktrees', () => {
    const pair=(id:string, attempt:string, branch:string, path:string)=>[
      {type:'work_item_registered',eventId:`r-${id}`,idempotencyKey:`r-${id}`,source:'review',entityRef:`work_item:${id}`,payload:{workItemId:id,loopId:'loop-1',profileId:'default',terminalState:'accepted',taskContractHash:'task-hash-1',referenceSnapshotHash:'ref-hash-1',writeScopeHash:'scope-hash-1',acceptanceContractHash:'accept-hash-1',writeScope:['src'],githubRepo:'org/repo',catscoProjectId:'none',workerTopicId:`p2p_275_${attempt}`,stewardTopicId:'p2p_275_574',stewardPrincipal:'catsco-user:574'}},
      {type:'work_bundle_proposed',eventId:`b-${id}`,idempotencyKey:`b-${id}`,source:'review',entityRef:`work_item:${id}`,payload:{workItemId:id,expectedRevision:1,attemptId:attempt,attemptNumber:1,generation:0,runtimePrincipal:`catsco-user:${attempt}`,proofMode:'catsco-message',leaseExpiresAt:'2030-01-01T00:00:00.000Z',workBundle:{contractDigest:'contract-hash-1',instructions:`do work\nLOOP_WORKTREE_CONTRACT_V1=${JSON.stringify({repository:'org/repo',baseRevision:'abc12345',branchName:branch,worktreePath:path,cleanupPolicy:'retain-until-integration',workspaceLease:`lease-${id}`})}`,deliverables:['github_pr']},taskContractHash:'task-hash-1',referenceSnapshotHash:'ref-hash-1',writeScopeHash:'scope-hash-1',acceptanceContractHash:'accept-hash-1'}}
    ]
    expect(parseFanout(JSON.stringify([...pair('a','559','loop/loop-1/a','/tmp/a'),...pair('b','560','loop/loop-1/b','/tmp/b')]))).toHaveLength(4)
    expect(() => parseFanout(JSON.stringify([...pair('a','559','loop/loop-1/a','/tmp/a'),...pair('b','560','loop/loop-1/a','/tmp/b')]))).toThrow(/unique/)
  })
})
