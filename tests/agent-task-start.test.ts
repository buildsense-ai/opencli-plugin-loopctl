import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { agentTaskRetry, agentTaskStart } from '../src/lib/commands.js'
import { canonicalJson } from '../src/lib/events.js'
import { openProvisionJournal } from '../src/lib/provisioning-journal.js'
import '../loop-agent-task-retry.js'

const roots: string[] = []
const originalCwd = process.cwd()
afterEach(() => {
  // Never delete a test's active directory: a failed test must not poison later tests.
  process.chdir(originalCwd)
  delete process.env.OPENCLI_BINARY
  delete process.env.LOOPCTL_BINARY
  delete process.env.LOOPCTL_PROVISION_JOURNAL_DIR
  delete process.env.FAIL_ASSIGN
  delete process.env.OMIT_ASSIGNED_TOPIC
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true })
})

function plan() {
  const hashes = { taskContractHash: 'task-hash-1', referenceSnapshotHash: 'reference-hash-1', writeScopeHash: 'scope-hash-1', acceptanceContractHash: 'acceptance-hash-1' }
  return [
    { type: 'work_item_registered', eventId: 'register-1', idempotencyKey: 'register-1', source: 'catsco-user:602', entityRef: 'work_item:wi-1', payload: {
      workItemId: 'wi-1', loopId: 'loop-1', profileId: 'product@1', terminalState: 'accepted', ...hashes, writeScope: ['src/**'], githubRepo: 'acme/repo',
      catscoProjectId: 'project:new', workerTopicId: 'agent-task:559', evidenceTopicId: 'evidence-topic:559:574', stewardTopicId: 'review-topic:574', stewardPrincipal: 'catsco-user:574'
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
else if(args[1]==='group-create') { const id=String(state.next++); const members=args[3]; const kind=args[args.indexOf('--kind')+1]; const agentIds=members.split(',').filter(id=>id!=='602').join(','); state.groups[id]={members,kind,agentIds}; fs.writeFileSync(statePath,JSON.stringify(state)); output({groupId:id,topic:'grp_'+id,kind,agentIds}); }
else if(args[1]==='group-info') { const id=args[2]; const group=state.groups[id]; const memberIds=['602',...group.members.split(',')].filter((value,index,values)=>values.indexOf(value)===index).join(','); output({groupId:id,topic:'grp_'+id,kind:group.kind,agentIds:group.agentIds,memberIds}); }
else if(args[1]==='project-assign-topic') { if(process.env.FAIL_ASSIGN==='1') { process.stderr.write('assignment denied'); process.exit(1); } output({projectId:args[2],topicId:args[3],assigned:true}); }
else if(args[1]==='project-sessions') output(Object.keys(state.groups).filter(id=>process.env.OMIT_ASSIGNED_TOPIC!=='1').map(id=>({topicId:'grp_'+id})));
else { process.stderr.write('unsupported '+args.slice(0,2).join(' ')); process.exit(1); }
`)
  writeFileSync(loopctl, `#!/usr/bin/env node
const fs=require('fs'); const calls=${JSON.stringify(calls)}; const args=process.argv.slice(2); const input=args[0]==='ingest'?fs.readFileSync(0,'utf8'):''; fs.appendFileSync(calls,JSON.stringify(['loopctl',...args,input])+'\\n');
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
  it('creates and verifies a fresh Project plus coordinator, execution, evidence, and review Topics before registering or dispatching', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agent-task-start-')); roots.push(root)
    const calls = installBinaries(root)
    writeFileSync(join(root, 'plan.json'), JSON.stringify(plan()))
    const cwd = process.cwd(); process.chdir(root)
    try {
      const result = await agentTaskStart({ 'plan-file': 'plan.json' })
      expect(result).toMatchObject({ count: 1, projectId: '41', provisionedTopics: {
        coordinatorTopic: { topic: 'grp_101', kind: 'standard', agentIds: '574' },
        workerTopic: { topic: 'grp_102', kind: 'agent_task', agentIds: '559' },
        evidenceTopic: { topic: 'grp_103', kind: 'standard', agentIds: '559,574' },
        reviewTopic: { topic: 'grp_104', kind: 'standard', agentIds: '574' }
      } })
      const journal = JSON.parse(readFileSync(result.journalPath, 'utf8'))
      expect(journal).toMatchObject({ schema: 'loopctl-provision-journal-v2', phase: 'completed', manualCleanupTopicIds: ['grp_101', 'grp_102', 'grp_103', 'grp_104'] })
    } finally { process.chdir(cwd) }
    const trace = readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    const firstLoopctl = trace.findIndex((entry: string[]) => entry[0] === 'loopctl')
    expect(firstLoopctl).toBeGreaterThan(0)
    const provisioning = trace.slice(0, firstLoopctl)
    expect(provisioning.filter((entry: string[]) => entry[1] === 'catsco' && entry[2] === 'projects')).toHaveLength(0)
    expect(provisioning.filter((entry: string[]) => entry[1] === 'catsco' && entry[2] === 'project-create')).toHaveLength(1)
    expect(provisioning.filter((entry: string[]) => entry[1] === 'catsco' && entry[2] === 'group-create')).toHaveLength(4)
    expect(provisioning.filter((entry: string[]) => entry[1] === 'catsco' && entry[2] === 'project-assign-topic')).toHaveLength(4)
    const ingests = trace.filter((entry: string[]) => entry[0] === 'loopctl' && entry[1] === 'ingest')
    expect(ingests).toHaveLength(2)
    const registration = JSON.parse(ingests[0][ingests[0].length - 1])
    expect(registration.payload).toMatchObject({
      catscoProjectId: '41', coordinatorSessionTopicId: 'grp_101',
      coordinatorSessionId: 'session:v2:catscompany:group:grp_101:agent:574',
      workerTopicId: 'grp_102', evidenceTopicId: 'grp_103', stewardTopicId: 'grp_104'
    })
  }, 30_000)

  it('accepts the deployed owner-and-Worker standard group topology', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agent-task-start-owner-topology-')); roots.push(root)
    installBinaries(root)
    const ownerReviewPlan: any[] = plan()
    ownerReviewPlan[0].payload.evidenceTopicId = 'evidence-topic:559:602'
    ownerReviewPlan[0].payload.stewardTopicId = 'review-topic:602'
    ownerReviewPlan[0].payload.stewardPrincipal = 'catsco-user:602'
    writeFileSync(join(root, 'plan.json'), JSON.stringify(ownerReviewPlan))
    const cwd = process.cwd(); process.chdir(root)
    try {
      const result = await agentTaskStart({ 'plan-file': 'plan.json' })
      expect(result.provisionedTopics).toMatchObject({
        coordinatorTopic: { kind: 'standard', agentIds: '', memberIds: '602' },
        workerTopic: { kind: 'agent_task', agentIds: '559' },
        evidenceTopic: { kind: 'standard', agentIds: '559', memberIds: '559,602' },
        reviewTopic: { kind: 'standard', agentIds: '', memberIds: '602' }
      })
      const journal = JSON.parse(readFileSync(result.journalPath, 'utf8'))
      expect(journal).toMatchObject({ phase: 'completed', projectId: '41' })
    } finally { process.chdir(cwd) }
  }, 30_000)

  it('rejects a caller-provided historical P2P bundle route before provisioning', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agent-task-start-route-')); roots.push(root)
    const routedPlan: any[] = plan()
    routedPlan[1].payload.attemptRoute = {
      catscoProjectId: '41', workerTopicId: 'p2p_559_574', evidenceTopicId: 'p2p_559_574', stewardTopicId: 'p2p_559_574',
      stewardPrincipal: 'catsco-user:574', workerSessionId: 'session:v2:catscompany:p2p:p2p_559_574:agent:559',
      coordinatorSessionId: 'session:v2:catscompany:p2p:p2p_574_602:agent:574', coordinatorSessionTopicId: 'p2p_574_602'
    }
    writeFileSync(join(root, 'plan.json'), JSON.stringify(routedPlan))
    const cwd = process.cwd(); process.chdir(root)
    try { await expect(agentTaskStart({ 'plan-file': 'plan.json' })).rejects.toThrow(/do not supply bundle attemptRoute/) }
    finally { process.chdir(cwd) }
    expect(readdirSync(root)).toEqual(['plan.json'])
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
  }, 30_000)

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
    expect(journal).toMatchObject({ phase: 'failed', manualCleanupTopicIds: ['grp_101', 'grp_102', 'grp_103', 'grp_104'] })
    const trace = readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(trace.some((entry: string[]) => entry[0] === 'loopctl')).toBe(false)
  }, 30_000)

  it('aborts before loopctl ingest when assignment readback omits a successfully assigned Topic', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agent-task-start-readback-')); roots.push(root)
    const calls = installBinaries(root)
    process.env.OMIT_ASSIGNED_TOPIC = '1'
    writeFileSync(join(root, 'plan.json'), JSON.stringify(plan()))
    const cwd = process.cwd(); process.chdir(root)
    try { await expect(agentTaskStart({ 'plan-file': 'plan.json' })).rejects.toThrow(/assignment readback/) }
    finally { process.chdir(cwd) }
    const trace = readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(trace.filter((entry: string[]) => entry[1] === 'catsco' && entry[2] === 'project-assign-topic')).toHaveLength(1)
    expect(trace.some((entry: string[]) => entry[0] === 'loopctl' && entry[1] === 'ingest')).toBe(false)
  }, 30_000)

  it('migrates only topology-compatible v1 retry journals and rejects v1 start route reinterpretation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agent-task-journal-v1-')); roots.push(root)
    const journalDir = join(root, 'journal')
    process.env.LOOPCTL_PROVISION_JOURNAL_DIR = journalDir
    const retryPlan = { packet: recoveryPacket(), retry: retryBundle() }
    const digest = createHash('sha256').update(canonicalJson(retryPlan)).digest('hex')
    const id = `agent-task-retry:${digest}`
    const journalPath = join(journalDir, `agent-task-retry-${digest}.json`)
    const timestamp = '2025-01-01T00:00:00.000Z'
    const topic = (groupId: string, kind: 'agent_task' | 'standard', agentIds: string) => ({ groupId, topic: `grp_${groupId}`, kind, agentIds })
    mkdirSync(journalDir, { recursive: true })
    writeFileSync(journalPath, JSON.stringify({
      schema: 'loopctl-provision-journal-v1', id, kind: 'agent-task-retry', planDigest: digest, phase: 'failed', createdAt: timestamp, updatedAt: timestamp,
      projectId: '41', workerTopic: topic('101', 'agent_task', '559'), evidenceTopic: topic('102', 'standard', '559,574'), reviewTopic: topic('103', 'standard', '574'), manualCleanupTopicIds: ['grp_101', 'grp_102', 'grp_103']
    }))
    const migrated = await openProvisionJournal('agent-task-retry', retryPlan)
    expect(migrated.journal()).toMatchObject({ schema: 'loopctl-provision-journal-v2', projectId: '41', workerTopic: { topic: 'grp_101' } })
    expect(JSON.parse(readFileSync(journalPath, 'utf8'))).toMatchObject({ schema: 'loopctl-provision-journal-v2' })
    await migrated.release()

    const writeLegacyRetry = (caseName: string, topics: { workerTopic: unknown; evidenceTopic: unknown; reviewTopic: unknown }) => {
      const casePlan = { ...retryPlan, migrationCase: caseName }
      const caseDigest = createHash('sha256').update(canonicalJson(casePlan)).digest('hex')
      writeFileSync(join(journalDir, `agent-task-retry-${caseDigest}.json`), JSON.stringify({
        schema: 'loopctl-provision-journal-v1', id: `agent-task-retry:${caseDigest}`, kind: 'agent-task-retry', planDigest: caseDigest, phase: 'failed', createdAt: timestamp, updatedAt: timestamp,
        projectId: '41', ...topics, manualCleanupTopicIds: ['grp_101', 'grp_102', 'grp_103']
      }))
      return casePlan
    }
    await expect(openProvisionJournal('agent-task-retry', writeLegacyRetry('swapped-kinds', {
      workerTopic: topic('101', 'standard', '559'), evidenceTopic: topic('102', 'agent_task', '559,574'), reviewTopic: topic('103', 'standard', '574')
    }))).rejects.toThrow(/topology is incompatible/)
    await expect(openProvisionJournal('agent-task-retry', writeLegacyRetry('duplicate-topics', {
      workerTopic: topic('101', 'agent_task', '559'), evidenceTopic: topic('101', 'standard', '559,574'), reviewTopic: topic('103', 'standard', '574')
    }))).rejects.toThrow(/topology is incompatible/)
    await expect(openProvisionJournal('agent-task-retry', writeLegacyRetry('wrong-role-membership', {
      workerTopic: topic('101', 'agent_task', '574'), evidenceTopic: topic('102', 'standard', '559,574'), reviewTopic: topic('103', 'standard', '574')
    }))).rejects.toThrow(/topology is incompatible/)
    await expect(openProvisionJournal('agent-task-retry', writeLegacyRetry('missing-worker-route', {
      workerTopic: undefined, evidenceTopic: topic('102', 'standard', '559,574'), reviewTopic: topic('103', 'standard', '574')
    }))).rejects.toThrow(/topology is incompatible/)
    await expect(openProvisionJournal('agent-task-retry', writeLegacyRetry('missing-worker-member', {
      workerTopic: { ...topic('101', 'agent_task', '559'), memberIds: '602' }, evidenceTopic: topic('102', 'standard', '559,574'), reviewTopic: topic('103', 'standard', '574')
    }))).rejects.toThrow(/topology is incompatible/)

    const startPlan = plan()
    const startDigest = createHash('sha256').update(canonicalJson(startPlan)).digest('hex')
    const startPath = join(journalDir, `agent-task-start-${startDigest}.json`)
    writeFileSync(startPath, JSON.stringify({
      schema: 'loopctl-provision-journal-v1', id: `agent-task-start:${startDigest}`, kind: 'agent-task-start', planDigest: startDigest, phase: 'failed', createdAt: timestamp, updatedAt: timestamp,
      projectId: '41', workerTopic: topic('101', 'agent_task', '559'), evidenceTopic: topic('102', 'standard', '559,574'), reviewTopic: topic('103', 'standard', '574'), manualCleanupTopicIds: ['grp_101', 'grp_102', 'grp_103']
    }))
    await expect(openProvisionJournal('agent-task-start', startPlan)).rejects.toThrow(/cannot be resumed as a Project-owned coordinator/)
  }, 30_000)

  it('runs strict v1 retry topology rejection through the generated command artifact', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agent-task-retry-built-')); roots.push(root)
    const calls = installBinaries(root)
    const journalDir = join(root, 'journal')
    const packet = recoveryPacket()
    const retry = retryBundle()
    const retryPlan = { packet, retry }
    const digest = createHash('sha256').update(canonicalJson(retryPlan)).digest('hex')
    mkdirSync(journalDir, { recursive: true })
    writeFileSync(join(journalDir, `agent-task-retry-${digest}.json`), JSON.stringify({
      schema: 'loopctl-provision-journal-v1', id: `agent-task-retry:${digest}`, kind: 'agent-task-retry', planDigest: digest,
      phase: 'failed', createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z', projectId: '41',
      workerTopic: { groupId: '101', topic: 'grp_101', kind: 'standard', agentIds: '559' },
      evidenceTopic: { groupId: '102', topic: 'grp_102', kind: 'standard', agentIds: '559,574' },
      reviewTopic: { groupId: '103', topic: 'grp_103', kind: 'standard', agentIds: '574' },
      manualCleanupTopicIds: ['grp_101', 'grp_102', 'grp_103']
    }))
    writeFileSync(join(root, 'packet.json'), JSON.stringify(packet))
    writeFileSync(join(root, 'bundle.json'), JSON.stringify(retry))
    const command = (globalThis as { __opencli_registry__?: Map<string, { func?: (kwargs: Record<string, string>) => Promise<unknown> }> }).__opencli_registry__?.get('loop/agent-task-retry')
    expect(command?.func).toBeTypeOf('function')
    const cwd = process.cwd(); process.chdir(root)
    try { await expect(command!.func!({ 'packet-file': 'packet.json', 'event-file': 'bundle.json' })).rejects.toThrow(/topology is incompatible/) }
    finally { process.chdir(cwd) }
    const trace = readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(trace.filter((entry: string[]) => entry[0] === 'loopctl' && entry[1] === 'ingest')).toHaveLength(0)
  }, 30_000)
})
