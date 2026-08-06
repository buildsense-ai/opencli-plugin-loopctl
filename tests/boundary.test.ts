import { afterEach, describe, expect, it } from 'vitest'
import { chmodSync, mkdtempSync, symlinkSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runLoopctl, readConfinedFile } from '../src/lib/loopctl.js'
import { parsePlan } from '../src/lib/events.js'

const roots:string[]=[]
afterEach(()=>{delete process.env.LOOPCTL_BINARY;while(roots.length)rmSync(roots.pop()!,{recursive:true,force:true})})

describe('OpenCLI boundary safety',()=>{
  it('uses shell-free argv and rejects malformed JSON output',async()=>{
    const root=mkdtempSync(join(tmpdir(),'loop-plugin-boundary-'));roots.push(root)
    const binary=join(root,'fake-loopctl.js')
    writeFileSync(binary,"#!/usr/bin/env node\nprocess.stdout.write('not-json')")
    chmodSync(binary,0o755)
    process.env.LOOPCTL_BINARY=binary
    await expect(runLoopctl(['status'])).rejects.toThrow()
    const marker=join(root,'injected')
    writeFileSync(binary,"#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)))")
    process.env.LOOPCTL_BINARY=binary
    await runLoopctl(['status',`$(touch ${marker})`])
    expect(() => readFileSync(marker)).toThrow()
    delete process.env.LOOPCTL_BINARY
  })
  it('rejects symlinks and files outside cwd',async()=>{
    const root=mkdtempSync(join(tmpdir(),'loop-plugin-files-'));roots.push(root)
    const outside=mkdtempSync(join(tmpdir(),'loop-plugin-outside-'));roots.push(outside)
    writeFileSync(join(outside,'event.json'),'{}')
    symlinkSync(join(outside,'event.json'),join(root,'event.json'))
    const cwd=process.cwd();process.chdir(root)
    try { await expect(readConfinedFile('event.json')).rejects.toThrow() } finally { process.chdir(cwd) }
  })
  it('rejects cross-event plan invariants before side effects',()=>{
    const registration={type:'work_item_registered',eventId:'r',idempotencyKey:'r',source:'review',entityRef:'work_item:w1',payload:{workItemId:'w1',loopId:'l',profileId:'p',terminalState:'accepted',taskContractHash:'task-hash',referenceSnapshotHash:'reference-hash',writeScopeHash:'scope-hash',acceptanceContractHash:'accept-hash',writeScope:['src/**'],githubRepo:'org/repo',catscoProjectId:'project',workerTopicId:'worker',stewardTopicId:'steward'}}
    const bundle={type:'work_bundle_proposed',eventId:'b',idempotencyKey:'b',source:'review',entityRef:'work_item:w1',payload:{workItemId:'w2',expectedRevision:1,attemptId:'a',attemptNumber:1,generation:1,runtimePrincipal:'catsco-user:1',proofMode:'catsco-message',leaseExpiresAt:'2030-01-01T00:00:00.000Z',workBundle:{contractDigest:'bundle-hash',instructions:'do work',deliverables:['PR']},taskContractHash:'task-hash',referenceSnapshotHash:'reference-hash',writeScopeHash:'scope-hash',acceptanceContractHash:'accept-hash'}}
    expect(()=>parsePlan(JSON.stringify([registration,bundle]))).toThrow(/IDs/)
  })

  it('accepts one collaboration group for Worker and Steward when both principals are addressable',()=>{
    const registration={type:'work_item_registered',eventId:'r',idempotencyKey:'r',source:'review',entityRef:'work_item:w1',payload:{workItemId:'w1',loopId:'l',profileId:'p',terminalState:'accepted',taskContractHash:'task-hash',referenceSnapshotHash:'reference-hash',writeScopeHash:'scope-hash',acceptanceContractHash:'accept-hash',writeScope:['src/**'],githubRepo:'org/repo',catscoProjectId:'project',workerTopicId:'grp_1400',stewardTopicId:'grp_1400',stewardPrincipal:'catsco-user:574'}}
    const bundle={type:'work_bundle_proposed',eventId:'b',idempotencyKey:'b',source:'review',entityRef:'work_item:w1',payload:{workItemId:'w1',expectedRevision:1,attemptId:'a',attemptNumber:1,generation:1,runtimePrincipal:'catsco-user:559',proofMode:'catsco-message',leaseExpiresAt:'2030-01-01T00:00:00.000Z',workBundle:{contractDigest:'bundle-hash',instructions:'do work',deliverables:['PR']},taskContractHash:'task-hash',referenceSnapshotHash:'reference-hash',writeScopeHash:'scope-hash',acceptanceContractHash:'accept-hash'}}
    expect(parsePlan(JSON.stringify([registration,bundle]))).toHaveLength(2)
  })

  it('rejects a shared non-group topic or non-numeric group principal',()=>{
    const registration={type:'work_item_registered',eventId:'r',idempotencyKey:'r',source:'review',entityRef:'work_item:w1',payload:{workItemId:'w1',loopId:'l',profileId:'p',terminalState:'accepted',taskContractHash:'task-hash',referenceSnapshotHash:'reference-hash',writeScopeHash:'scope-hash',acceptanceContractHash:'accept-hash',writeScope:['src/**'],githubRepo:'org/repo',catscoProjectId:'project',workerTopicId:'shared',stewardTopicId:'shared',stewardPrincipal:'catsco-user:574'}}
    const bundle={type:'work_bundle_proposed',eventId:'b',idempotencyKey:'b',source:'review',entityRef:'work_item:w1',payload:{workItemId:'w1',expectedRevision:1,attemptId:'a',attemptNumber:1,generation:1,runtimePrincipal:'catsco-user:559',proofMode:'catsco-message',leaseExpiresAt:'2030-01-01T00:00:00.000Z',workBundle:{contractDigest:'bundle-hash',instructions:'do work',deliverables:['PR']},taskContractHash:'task-hash',referenceSnapshotHash:'reference-hash',writeScopeHash:'scope-hash',acceptanceContractHash:'accept-hash'}}
    expect(()=>parsePlan(JSON.stringify([registration,bundle]))).toThrow(/shared topic must be a CatsCo group/)
    registration.payload.workerTopicId='grp_1400';registration.payload.stewardTopicId='grp_1400';registration.payload.stewardPrincipal='catsco-user:review'
    expect(()=>parsePlan(JSON.stringify([registration,bundle]))).toThrow(/numeric CatsCo principals/)
  })
})
