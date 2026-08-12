import { afterEach, describe, expect, it } from 'vitest'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { candidateSubmit, readinessSubmit, reviewSubmit, runtimeStartSubmit } from '../src/lib/commands.js'

const roots: string[] = []
afterEach(() => {
  delete process.env.OPENCLI_BINARY
  delete process.env.TEST_CATSCO_UID
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true })
})

function submission() {
  return {
    targetTopicId: 'grp_42',
    event: {
      type: 'candidate_submitted', eventId: 'candidate-event-1', idempotencyKey: 'candidate-idempotency-1', source: 'catsco-user:559', entityRef: 'attempt:attempt-1',
      payload: {
        ownerUid: '602', workItemId: 'wi-1', workItemRevision: 3, attemptId: 'attempt-1', generation: 1, runtimePrincipal: 'catsco-user:559', candidateId: 'candidate-1',
        deliverable: { kind: 'github_pr', repository: 'org/repo', prNumber: 7, headSha: 'head-sha', baseSha: 'base-sha', digest: 'deliverable-digest' },
        taskContractHash: 'task-contract', referenceSnapshotHash: 'reference-snapshot', writeScopeHash: 'write-scope', acceptanceContractHash: 'acceptance-contract', proofMode: 'catsco-message'
      }
    }
  }
}

function readinessSubmission() {
  return {
    targetTopicId: 'grp_42',
    event: {
      type: 'worker_ready', eventId: 'worker-ready-event-1', idempotencyKey: 'worker-ready-idempotency-1',
      source: 'catsco-user:559', entityRef: 'attempt:attempt-1',
      payload: {
        workItemId: 'wi-1', expectedRevision: 2, attemptId: 'attempt-1', generation: 1,
        runtimePrincipal: 'catsco-user:559', signature: 'catsco-message-attested'
      }
    }
  }
}

function runtimeSubmission() {
  return {
    targetTopicId: 'grp_42',
    event: {
      type: 'runtime_started', eventId: 'runtime-started-event-1', idempotencyKey: 'runtime-started-idempotency-1',
      source: 'catsco-user:559', entityRef: 'attempt:attempt-1',
      payload: {
        workItemId: 'wi-1', expectedRevision: 2, attemptId: 'attempt-1', generation: 1,
        runtimePrincipal: 'catsco-user:559', signature: 'catsco-message-attested'
      }
    }
  }
}

function reviewSubmission() {
  return {
    targetTopicId: 'grp_42',
    event: {
      type: 'review_decided', eventId: 'review-event-1', idempotencyKey: 'review-idempotency-1',
      source: 'catsco-user:574', entityRef: 'work_item:wi-1',
      payload: {
        workItemId: 'wi-1', expectedRevision: 4, candidateId: 'candidate-1', outcome: 'accepted',
        reviewerPrincipal: 'catsco-user:574', reviewedHeadSha: 'head-sha', reviewedDeliverableDigest: 'deliverable-digest',
        acceptanceContractHash: 'acceptance-contract'
      }
    }
  }
}

function installOpenCli(root: string, receiptOverrides = '') {
  const binary = join(root, 'opencli.js')
  const calls = join(root, 'calls.jsonl')
  writeFileSync(binary, `#!/usr/bin/env node
const fs=require('fs'); const args=process.argv.slice(2); fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+'\\n');
if(args[1]==='me') process.stdout.write(JSON.stringify({uid:process.env.TEST_CATSCO_UID||'559'}));
else if(args[1]==='send') process.stdout.write(JSON.stringify({messageId:'9',topicId:args[2],clientMsgId:args[args.indexOf('--client-message-id')+1],seqId:'9',duplicate:false,contentDigest:'digest'}));
else process.stdout.write(JSON.stringify({found:true,serverConfirmed:true,topicId:args[2],clientMsgId:args[args.indexOf('--client-message-id')+1],seqId:'9',contentDigest:'digest'${receiptOverrides}}));
`)
  chmodSync(binary, 0o755)
  process.env.OPENCLI_BINARY = binary
  return calls
}

describe('attempt event submission', () => {
  it('sends only canonical worker_ready JSON and requires a matching server receipt', async () => {
    const root = mkdtempSync(join(tmpdir(), 'readiness-submit-')); roots.push(root)
    const calls = installOpenCli(root)
    writeFileSync(join(root, 'worker-ready.json'), JSON.stringify(readinessSubmission()))
    const cwd = process.cwd(); process.chdir(root)
    try {
      const result = await readinessSubmit({ 'event-file': 'worker-ready.json' })
      expect(result.receipt).toMatchObject({ topicId: 'grp_42', clientMsgId: 'worker-ready-idempotency-1', seqId: '9' })
    } finally { process.chdir(cwd) }
    const argv = readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(argv[0]).toEqual(['catsco', 'me', '--format', 'json'])
    expect(JSON.parse(argv[1][3])).toEqual(readinessSubmission().event)
    expect(argv[2]).toEqual(['catsco', 'message-receipt', 'grp_42', '--client-message-id', 'worker-ready-idempotency-1', '--format', 'json'])
  })

  it('sends only canonical runtime_started JSON and requires a matching server receipt', async () => {
    const root = mkdtempSync(join(tmpdir(), 'runtime-start-submit-')); roots.push(root)
    const calls = installOpenCli(root)
    writeFileSync(join(root, 'runtime-started.json'), JSON.stringify(runtimeSubmission()))
    const cwd = process.cwd(); process.chdir(root)
    try {
      const result = await runtimeStartSubmit({ 'event-file': 'runtime-started.json' })
      expect(result.receipt).toMatchObject({ topicId: 'grp_42', clientMsgId: 'runtime-started-idempotency-1', seqId: '9' })
    } finally { process.chdir(cwd) }
    const argv = readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(argv[0]).toEqual(['catsco', 'me', '--format', 'json'])
    expect(argv[1]).toEqual(['catsco', 'send', 'grp_42', expect.any(String), '--client-message-id', 'runtime-started-idempotency-1', '--format', 'json'])
    expect(JSON.parse(argv[1][3])).toEqual(runtimeSubmission().event)
    expect(argv[2]).toEqual(['catsco', 'message-receipt', 'grp_42', '--client-message-id', 'runtime-started-idempotency-1', '--format', 'json'])
  })

  it('rejects runtime_started transport metadata embedded in the event', async () => {
    const root = mkdtempSync(join(tmpdir(), 'runtime-start-submit-')); roots.push(root)
    writeFileSync(join(root, 'runtime-started.json'), JSON.stringify({ ...runtimeSubmission(), event: { ...runtimeSubmission().event, targetTopicId: 'grp_42' } }))
    const cwd = process.cwd(); process.chdir(root)
    try { await expect(runtimeStartSubmit({ 'event-file': 'runtime-started.json' })).rejects.toThrow() }
    finally { process.chdir(cwd) }
  })

  it('sends only canonical Candidate JSON and requires a matching server receipt', async () => {
    const root = mkdtempSync(join(tmpdir(), 'candidate-submit-')); roots.push(root)
    const calls = installOpenCli(root)
    writeFileSync(join(root, 'candidate.json'), JSON.stringify(submission()))
    const cwd = process.cwd(); process.chdir(root)
    try {
      const result = await candidateSubmit({ 'event-file': 'candidate.json' })
      expect(result.receipt).toMatchObject({ topicId: 'grp_42', clientMsgId: 'candidate-idempotency-1', seqId: '9' })
    } finally { process.chdir(cwd) }
    const argv = readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(argv[0]).toEqual(['catsco', 'me', '--format', 'json'])
    expect(argv[1]).toEqual(['catsco', 'send', 'grp_42', expect.any(String), '--client-message-id', 'candidate-idempotency-1', '--format', 'json'])
    expect(JSON.parse(argv[1][3])).toEqual(submission().event)
    expect(argv[2]).toEqual(['catsco', 'message-receipt', 'grp_42', '--client-message-id', 'candidate-idempotency-1', '--format', 'json'])
  })

  it('sends only canonical Review decision JSON and requires a matching server receipt', async () => {
    const root = mkdtempSync(join(tmpdir(), 'review-submit-')); roots.push(root)
    process.env.TEST_CATSCO_UID = '574'
    const calls = installOpenCli(root)
    writeFileSync(join(root, 'review.json'), JSON.stringify(reviewSubmission()))
    const cwd = process.cwd(); process.chdir(root)
    try {
      const result = await reviewSubmit({ 'event-file': 'review.json' })
      expect(result.receipt).toMatchObject({ topicId: 'grp_42', clientMsgId: 'review-idempotency-1', seqId: '9' })
    } finally { process.chdir(cwd) }
    const argv = readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(argv[0]).toEqual(['catsco', 'me', '--format', 'json'])
    expect(JSON.parse(argv[1][3])).toEqual(reviewSubmission().event)
  })

  it('rejects an event whose claimed source does not match the authenticated CatsCo sender', async () => {
    const root = mkdtempSync(join(tmpdir(), 'candidate-submit-')); roots.push(root)
    installOpenCli(root)
    process.env.TEST_CATSCO_UID = '602'
    writeFileSync(join(root, 'candidate.json'), JSON.stringify(submission()))
    const cwd = process.cwd(); process.chdir(root)
    try { await expect(candidateSubmit({ 'event-file': 'candidate.json' })).rejects.toThrow(/authenticated sender/) }
    finally { process.chdir(cwd) }
  })

  it('rejects a receipt that is not server-confirmed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'candidate-submit-')); roots.push(root)
    installOpenCli(root, ',serverConfirmed:false')
    writeFileSync(join(root, 'candidate.json'), JSON.stringify(submission()))
    const cwd = process.cwd(); process.chdir(root)
    try { await expect(candidateSubmit({ 'event-file': 'candidate.json' })).rejects.toThrow(/server-confirmed/) }
    finally { process.chdir(cwd) }
  })

  it('rejects a CatsCo-message Candidate without a numeric CatsCo runtime principal', async () => {
    const root = mkdtempSync(join(tmpdir(), 'candidate-submit-')); roots.push(root)
    writeFileSync(join(root, 'candidate.json'), JSON.stringify({
      ...submission(),
      event: { ...submission().event, source: 'runtime-1', payload: { ...submission().event.payload, runtimePrincipal: 'runtime-1' } }
    }))
    const cwd = process.cwd(); process.chdir(root)
    try { await expect(candidateSubmit({ 'event-file': 'candidate.json' })).rejects.toThrow(/numeric CatsCo runtime principal/) }
    finally { process.chdir(cwd) }
  })

  it('rejects transport metadata embedded in the Candidate event', async () => {
    const root = mkdtempSync(join(tmpdir(), 'candidate-submit-')); roots.push(root)
    writeFileSync(join(root, 'candidate.json'), JSON.stringify({ ...submission(), event: { ...submission().event, targetTopicId: 'grp_42' } }))
    const cwd = process.cwd(); process.chdir(root)
    try { await expect(candidateSubmit({ 'event-file': 'candidate.json' })).rejects.toThrow() }
    finally { process.chdir(cwd) }
  })
})
