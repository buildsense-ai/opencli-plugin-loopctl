import { afterEach, describe, expect, it } from 'vitest'
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { agentTaskRetry, agentTaskStart } from '../src/lib/commands.js'

const roots: string[] = []
afterEach(() => {
  delete process.env.OPENCLI_BINARY
  delete process.env.LOOPCTL_BINARY
  delete process.env.LOOPCTL_PROVISION_JOURNAL_DIR
  delete process.env.FAIL_ASSIGN
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true })
})

function plan() {
  const hashes = { taskContractHash: 'task-hash-1', referenceSnapshotHash: 'reference-hash-1', writeScopeHash: 'scope-hash-1', acceptanceContractHash: 'acceptance-hash-1' }
  return [
    { type: 'work_item_registered', eventId: 'register-1', idempotencyKey: 'register-1', source: 'catsco-user:602', entityRef: 'work_item:wi-1', payload: {
      workItemId: 'wi-1', loopId: 'loop-1', profileId: 'product@1', terminalState: 'accepted', ...hashes, writeScope: ['src/**'], githubRepo: 'acme/repo',
      catscoProjectId: 'project:auto', workerTopicId: 'agent-task:559', evidenceTopicId: 'evidence-topic:559:574', stewardTopicId: 'review-topic:574', stewardPrincipal: 'catsco-user:574', coordinatorSessionId: 'session:v2:catscompany:p2p:p2p_574_602:agent:574', coordinatorSessionTopicId: 'p2p_574_602'
    } },
    { type: 'work_bundle_proposed', eventId: 'bundle-1', idempotencyKey: 'bundle-1', source: 'catsco-user:602', entityRef: 'work_item:wi-1', payload: {
      workItemId: 'wi-1', expectedRevision: 1, attemptId: 'attempt-1', attemptNumber: 1, generation: 1, runtimePrincipal: 'catsco-user:559', proofMode: 'catsco-message', leaseExpiresAt: '2030-01-01T00:00:00.000Z',
      workBundle: { contractDigest: 'bundle-digest-1', instructions: `bounded work\nLOOP_WORKTREE_CONTRACT_V1=${JSON.stringify({ repository: 'acme/repo', baseRevision: 'base-sha', branchName: 'loop/loop-1/wi-1', worktreePath: '/tmp/loopctl-test-worktree', gitDir: '/tmp/loopctl-test.git', cleanupPolicy: 'retain-until-review', workspaceLease: 'lease-1' })}`, deliverables: ['pull request'] }, ...hashes
    } }
  ]
}

function recoveryPacket() {
  const contracts = { taskContractHash: 'task-hash-1', referenceSnapshotHash: 'reference-hash-1', writeScopeHash: 'scope-hash-1', acceptanceContractHash: 'acceptance-hash-1' }
  const worktree = { repository: 'acme/repo', baseRevision: 'base-sha', branchName: 'loop/loop-1/old', worktreePath: '/tmp/old-worktree', gitDir: '/tmp/repo.git', cleanupPolicy: 'retain-until-review', workspaceLease: 'old-lease' }
  return {
    kind: 'recover_attempt', schema: 'loopctl-action-packet-v1', actionId: 'action-recover-1', actionKey: 'recover-attempt-1', workItemId: 'wi-1', workItemRevision: 4,
    targetPrincipal: 'catsco-user:574', targetTopicId: 'grp_103', targetDigest: 'target-digest', packetDigest: 'packet-digest',
    action: { id: 'action-recover-1', key: 'recover-attempt-1', kind: 'recover_attempt', state: 'ready', workItemRevision: 4, targetPrincipal: 'catsco-user:574', targetTopicId: 'grp_103', targetDigest: 'target-digest' },
    contracts, loopId: 'loop-1', profileId: 'product@1', githubRepo: 'acme/repo', catscoProjectId: '41', workerTopicId: 'grp_101', evidenceTopicId: 'grp_102', stewardPrincipal: 'catsco-user:574', stewardTopicId: 'grp_103', coordinatorSessionId: 'session:v2:catscompany:p2p:p2p_574_602:agent:574', coordinatorSessionTopicId: 'p2p_574_602',
    previousAttempt: { attemptId: 'attempt-1', attemptNumber: 1, generation: 1, controlState: 'superseded', reportedState: 'runtime_start_timeout', leaseExpiresAt: '2030-01-01T00:00:00.000Z', runtimePrincipal: 'catsco-user:559', workBundle: { contractDigest: 'old-bundle', instructions: `LOOP_WORKTREE_CONTRACT_V1=${JSON.stringify(worktree)}` } },
    recovery: { requireFreshWorkerTopic: true, requireFreshEvidenceTopic: true, requireFreshStewardTopic: true, requireFreshWorktree: true, requireFreshWorkspaceLease: true }
  }
}

function retryBundle() {
  const hashes = { taskContractHash: 'task-hash-1', referenceSnapshotHash: 'reference-hash-1', writeScopeHash: 'scope-hash-1', acceptanceContractHash: 'acceptance-hash-1' }
  const worktree = { repository: 'acme/repo', baseRevision: 'base-sha', branchName: 'loop/loop-1/retry', worktreePath: '/tmp/retry-worktree', gitDir: '/tmp/repo.git', cleanupPolicy: 'retain-until-review', workspaceLease: 'retry-lease' }
  return { type: 'work_bundle_proposed', eventId: 'bundle-retry', idempotencyKey: 'bundle-retry', source: 'catsco-user:602', entityRef: 'work_item:wi-1', payload: {
    workItemId: 'wi-1', expectedRevision: 4, attemptId: 'attempt-2', attemptNumber: 2, generation: 2, runtimePrincipal: 'catsco-user:559', proofMode: 'catsco-message', leaseExpiresAt: '2030-01-02T00:00:00.000Z',
    workBundle: { contractDigest: 'retry-bundle', instructions: `LOOP_WORKTREE_CONTRACT_V1=${JSON.stringify(worktree)}`, deliverables: ['pull request'] }, ...hashes
  } }
}

function installBinaries(root: string) {
  const opencli = join(root, 'opencli.js')
  const loopctl = join(root, 'loopctl.js')
  const calls = join(root, 'calls.jsonl')
  writeFileSync(opencli, `#!/usr/bin/env node
const fs=require('fs'); const path=require('path'); const root=${JSON.stringify(root)}; const calls=${JSON.stringify(calls)};
const args=process.argv.slice(2); fs.appendFileSync(calls,JSON.stringify(['opencli',...args])+'\\n');
const statePath=path.join(root,'groups.json'); const state=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):{next:101,groups:{}};
const output=value=>process.stdout.write(JSON.stringify(value));
if(args[0]!=='catsco') process.exit(2);
if(args[1]==='me') output({uid:'602'});
else if(args[1]==='projects') output([]);
else if(args[1]==='project-create') output({id:'41'});
else if(args[1]==='group-create') { const id=String(state.next++); const members=args[3]; const kind=args[args.indexOf('--kind')+1]; state.groups[id]={members,kind}; fs.writeFileSync(statePath,JSON.stringify(state)); output({groupId:id,topic:'grp_'+id,kind,agentIds:members}); }
else if(args[1]==='group-info') { const id=args[2]; const group=state.groups[id]; output({groupId:id,topic:'grp_'+id,kind:group.kind,agentIds:group.members,memberIds:'602,'+group.members}); }
else if(args[1]==='project-assign-topic') { if(process.env.FAIL_ASSIGN==='1') { process.stderr.write('assignment denied'); process.exit(1); } output({projectId:args[2],topicId:args[3],assigned:true}); }
else if(args[1]==='project-sessions') output(Object.keys(state.groups).map(id=>({topicId:'grp_'+id})));
else { process.stderr.write('unsupported '+args.slice(0,2).join(' ')); process.exit(1); }
`)
  writeFileSync(loopctl, `#!/usr/bin/env node
const fs=require('fs'); const calls=${JSON.stringify(calls)}; const args=process.argv.slice(2); fs.appendFileSync(calls,JSON.stringify(['loopctl',...args])+'\\n');
if(args[0]==='ingest') process.stdout.write(JSON.stringify({eventId:'receipt-event',idempotencyKey:'receipt-key',status:'pending',ingressSequence:1}));
else if(args[0]==='tick') process.stdout.write(JSON.stringify({processed:2,receipts:[],effects:{satisfied:1,retried:0,obsolete:0,ownerMismatch:false}}));
else if(args[0]==='packet') process.stdout.write(JSON.stringify(${JSON.stringify(recoveryPacket())}));
else process.exitCode=1;
`)
  chmodSync(opencli, 0o755)
  chmodSync(loopctl, 0o755)
  process.env.OPENCLI_BINARY = opencli
  process.env.LOOPCTL_BINARY = loopctl
  process.env.LOOPCTL_PROVISION_JOURNAL_DIR = join(root, 'journal')
  return calls
}

describe('single-item agent task provisioning', () => {
  it('creates and verifies execution, evidence, and review Topics before registering or dispatching', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agent-task-start-')); roots.push(root)
    const calls = installBinaries(root)
    writeFileSync(join(root, 'plan.json'), JSON.stringify(plan()))
    const cwd = process.cwd(); process.chdir(root)
    try {
      const result = await agentTaskStart({ 'plan-file': 'plan.json' })
      expect(result).toMatchObject({ count: 1, projectId: '41', provisionedTopics: {
        workerTopic: { topic: 'grp_101', kind: 'agent_task', agentIds: '559' },
        evidenceTopic: { topic: 'grp_102', kind: 'standard', agentIds: '559,574' },
        reviewTopic: { topic: 'grp_103', kind: 'standard', agentIds: '574' }
      } })
      const journal = JSON.parse(readFileSync(result.journalPath, 'utf8'))
      expect(journal).toMatchObject({ phase: 'completed', manualCleanupTopicIds: ['grp_101', 'grp_102', 'grp_103'] })
    } finally { process.chdir(cwd) }
    const trace = readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    const firstLoopctl = trace.findIndex((entry: string[]) => entry[0] === 'loopctl')
    expect(firstLoopctl).toBeGreaterThan(0)
    expect(trace.slice(0, firstLoopctl).filter((entry: string[]) => entry[1] === 'catsco' && entry[2] === 'group-create')).toHaveLength(3)
    expect(trace.filter((entry: string[]) => entry[0] === 'loopctl' && entry[1] === 'ingest')).toHaveLength(2)
  })

  it('provisions fresh Topics and submits only a next-generation routed bundle for recovery', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agent-task-retry-')); roots.push(root)
    const calls = installBinaries(root)
    writeFileSync(join(root, 'packet.json'), JSON.stringify(recoveryPacket()))
    writeFileSync(join(root, 'bundle.json'), JSON.stringify(retryBundle()))
    const cwd = process.cwd(); process.chdir(root)
    try {
      const result = await agentTaskRetry({ 'packet-file': 'packet.json', 'event-file': 'bundle.json' })
      expect(result).toMatchObject({ projectId: '41', provisionedTopics: {
        workerTopic: { topic: 'grp_101', kind: 'agent_task' }, evidenceTopic: { topic: 'grp_102', kind: 'standard' }, reviewTopic: { topic: 'grp_103', kind: 'standard' }
      } })
      expect(JSON.parse(readFileSync(result.journalPath, 'utf8'))).toMatchObject({ phase: 'completed' })
    } finally { process.chdir(cwd) }
    const trace = readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(trace.filter((entry: string[]) => entry[0] === 'loopctl' && entry[1] === 'ingest')).toHaveLength(1)
  })

  it('journals remote resources and does not register a half-provisioned Attempt when attachment fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agent-task-start-fail-')); roots.push(root)
    const calls = installBinaries(root)
    process.env.FAIL_ASSIGN = '1'
    writeFileSync(join(root, 'plan.json'), JSON.stringify(plan()))
    const cwd = process.cwd(); process.chdir(root)
    try { await expect(agentTaskStart({ 'plan-file': 'plan.json' })).rejects.toThrow(/provisioning failed/) }
    finally { process.chdir(cwd) }
    const files = readdirSync(join(root, 'journal'))
    const journal = JSON.parse(readFileSync(join(root, 'journal', files[0]), 'utf8'))
    expect(journal).toMatchObject({ phase: 'failed', manualCleanupTopicIds: ['grp_101', 'grp_102', 'grp_103'] })
    const trace = readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(trace.some((entry: string[]) => entry[0] === 'loopctl')).toBe(false)
  })
})
