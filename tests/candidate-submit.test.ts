import { afterEach, describe, expect, it } from 'vitest'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { candidateSubmit } from '../src/lib/commands.js'

const roots: string[] = []
afterEach(() => {
  delete process.env.OPENCLI_BINARY
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

function installOpenCli(root: string, receiptOverrides = '') {
  const binary = join(root, 'opencli.js')
  const calls = join(root, 'calls.jsonl')
  writeFileSync(binary, `#!/usr/bin/env node
const fs=require('fs'); const args=process.argv.slice(2); fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+'\\n');
if(args[1]==='send') process.stdout.write(JSON.stringify({messageId:'9',topicId:args[2],clientMsgId:args[args.indexOf('--client-message-id')+1],seqId:'9',duplicate:false,contentDigest:'digest'}));
else process.stdout.write(JSON.stringify({found:true,serverConfirmed:true,topicId:args[2],clientMsgId:args[args.indexOf('--client-message-id')+1],seqId:'9',contentDigest:'digest'${receiptOverrides}}));
`)
  chmodSync(binary, 0o755)
  process.env.OPENCLI_BINARY = binary
  return calls
}

describe('candidate-submit', () => {
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
    expect(argv[0]).toEqual(['catsco', 'send', 'grp_42', expect.any(String), '--client-message-id', 'candidate-idempotency-1', '--format', 'json'])
    expect(JSON.parse(argv[0][3])).toEqual(submission().event)
    expect(argv[1]).toEqual(['catsco', 'message-receipt', 'grp_42', '--client-message-id', 'candidate-idempotency-1', '--format', 'json'])
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
