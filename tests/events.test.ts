import { describe, expect, it } from 'vitest'
import { parseAgentTaskFanout, parseAgentTaskStart, parseFanout, parseIntegrationPlan, parsePlan, runtimeStarted } from '../src/lib/events.js'

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
  it('accepts one fresh execution/evidence/review placeholder triple for agent-task start', () => {
    const registration={type:'work_item_registered',eventId:'r-start',idempotencyKey:'r-start',source:'review',entityRef:'work_item:w-start',payload:{workItemId:'w-start',loopId:'loop-1',profileId:'default',terminalState:'accepted',taskContractHash:'task-hash-1',referenceSnapshotHash:'ref-hash-1',writeScopeHash:'scope-hash-1',acceptanceContractHash:'accept-hash-1',writeScope:['src'],githubRepo:'org/repo',catscoProjectId:'project:auto',workerTopicId:'agent-task:559',evidenceTopicId:'evidence-topic:559:574',stewardTopicId:'review-topic:574',stewardPrincipal:'catsco-user:574',coordinatorSessionId:'session:v2:catscompany:p2p:p2p_574_602:agent:574',coordinatorSessionTopicId:'p2p_574_602'}}
    const bundle={type:'work_bundle_proposed',eventId:'b-start',idempotencyKey:'b-start',source:'review',entityRef:'work_item:w-start',payload:{workItemId:'w-start',expectedRevision:1,attemptId:'attempt-start',attemptNumber:1,generation:1,runtimePrincipal:'catsco-user:559',proofMode:'catsco-message',leaseExpiresAt:'2030-01-01T00:00:00.000Z',workBundle:{contractDigest:'contract-hash-1',instructions:'do work\nLOOP_WORKTREE_CONTRACT_V1='+JSON.stringify({repository:'org/repo',baseRevision:'base-sha',branchName:'loop/loop-1/w-start',worktreePath:'/tmp/w-start',gitDir:'/tmp/repo.git',cleanupPolicy:'retain-until-review',workspaceLease:'lease-start'}),deliverables:['github_pr']},taskContractHash:'task-hash-1',referenceSnapshotHash:'ref-hash-1',writeScopeHash:'scope-hash-1',acceptanceContractHash:'accept-hash-1'}}
    expect(parseAgentTaskStart(JSON.stringify([registration,bundle]))).toMatchObject({ workerAgentUid:'559',reviewAgentUid:'574' })
    expect(()=>parseAgentTaskStart(JSON.stringify([{...registration,payload:{...registration.payload,evidenceTopicId:'evidence-topic:560:574'}},bundle]))).toThrow(/same Worker/)
  })

  it('accepts isolated fan-out pairs and rejects duplicate worktrees', () => {
    const pair=(id:string, attempt:string, branch:string, path:string)=>[
      {type:'work_item_registered',eventId:`r-${id}`,idempotencyKey:`r-${id}`,source:'review',entityRef:`work_item:${id}`,payload:{workItemId:id,loopId:'loop-1',profileId:'default',terminalState:'accepted',taskContractHash:'task-hash-1',referenceSnapshotHash:'ref-hash-1',writeScopeHash:'scope-hash-1',acceptanceContractHash:'accept-hash-1',writeScope:['src'],githubRepo:'org/repo',catscoProjectId:'none',workerTopicId:`p2p_275_${attempt}`,stewardTopicId:'p2p_275_574',stewardPrincipal:'catsco-user:574'}},
      {type:'work_bundle_proposed',eventId:`b-${id}`,idempotencyKey:`b-${id}`,source:'review',entityRef:`work_item:${id}`,payload:{workItemId:id,expectedRevision:1,attemptId:attempt,attemptNumber:1,generation:0,runtimePrincipal:`catsco-user:${attempt}`,proofMode:'catsco-message',leaseExpiresAt:'2030-01-01T00:00:00.000Z',workBundle:{contractDigest:'contract-hash-1',instructions:`do work\nLOOP_WORKTREE_CONTRACT_V1=${JSON.stringify({repository:'org/repo',baseRevision:'abc12345',branchName:branch,worktreePath:path,cleanupPolicy:'retain-until-integration',workspaceLease:`lease-${id}`})}`,deliverables:['github_pr']},taskContractHash:'task-hash-1',referenceSnapshotHash:'ref-hash-1',writeScopeHash:'scope-hash-1',acceptanceContractHash:'accept-hash-1'}}
    ]
    expect(parseFanout(JSON.stringify([...pair('a','559','loop/loop-1/a','/tmp/a'),...pair('b','560','loop/loop-1/b','/tmp/b')]))).toHaveLength(4)
    expect(() => parseFanout(JSON.stringify([...pair('a','559','loop/loop-1/a','/tmp/a'),...pair('b','560','loop/loop-1/a','/tmp/b')]))).toThrow(/unique/)
    const sharedTopicPair=(id:string, attempt:string, branch:string, path:string)=>{
      const [registration,bundle]=pair(id,attempt,branch,path)
      registration.payload.workerTopicId='p2p_559_602'
      return [registration,bundle]
    }
    expect(() => parseFanout(JSON.stringify([...sharedTopicPair('a','559','loop/loop-1/a','/tmp/a'),...sharedTopicPair('b','560','loop/loop-1/b','/tmp/b')]))).toThrow(/worker topics/)
    const [agentTaskA, agentTaskBundleA]=pair('agent-a','attempt-agent-a','loop/loop-1/agent-a','/tmp/agent-a')
    const [agentTaskB, agentTaskBundleB]=pair('agent-b','attempt-agent-b','loop/loop-1/agent-b','/tmp/agent-b')
    agentTaskA.payload.workerTopicId='agent-task:559'
    agentTaskB.payload.workerTopicId='agent-task:559'
    agentTaskBundleA.payload.runtimePrincipal='catsco-user:559'
    agentTaskBundleB.payload.runtimePrincipal='catsco-user:559'
    expect(parseAgentTaskFanout(JSON.stringify([agentTaskA,agentTaskBundleA,agentTaskB,agentTaskBundleB]))).toHaveLength(4)
  })
})
