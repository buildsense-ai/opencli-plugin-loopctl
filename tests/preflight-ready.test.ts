import { afterEach, describe, expect, it, vi } from 'vitest'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { preflightReady } from '../src/lib/commands.js'
import { controllerCanonicalJson } from '../src/lib/controller-provenance.js'

const controllerKeys=generateKeyPairSync('ed25519')
const attackerKeys=generateKeyPairSync('ed25519')
const controllerPublicKey=controllerKeys.publicKey.export({type:'spki',format:'pem'}).toString()
const controllerKeyId=`controller-ed25519:${createHash('sha256').update(controllerPublicKey).digest('base64url')}`

const roots: string[]=[]
afterEach(()=>{
  vi.restoreAllMocks()
  delete process.env.OPENCLI_BINARY
  delete process.env.TEST_CATSCO_UID
  delete process.env.LOOPCTL_TRUSTED_CONTROLLER_KEYS_FILE
  while(roots.length) rmSync(roots.pop()!,{recursive:true,force:true})
})

function signedPacketWithKey(actionPacket:Record<string,unknown>, keyPair:ReturnType<typeof generateKeyPairSync>){
  const publicKey=keyPair.publicKey.export({type:'spki',format:'pem'}).toString()
  const keyId=`controller-ed25519:${createHash('sha256').update(publicKey).digest('base64url')}`
  const {packetDigest: _packetDigest,controllerSignature: _signature,...withoutSignature}=actionPacket
  const unsignedPacket={...withoutSignature,controllerSignatureAlgorithm:'ed25519',controllerKeyId:keyId,controllerPublicKey:publicKey}
  const packetWithDigest={...unsignedPacket,packetDigest:createHash('sha256').update(controllerCanonicalJson(unsignedPacket)).digest('hex')}
  return {...packetWithDigest,controllerSignature:sign(null,Buffer.from(controllerCanonicalJson(packetWithDigest)),keyPair.privateKey).toString('base64')}
}
function signedPacket(actionPacket:Record<string,unknown>){ return signedPacketWithKey(actionPacket,controllerKeys) }

function packet(){
  const actionPacket={
    kind:'preflight_attempt',schema:'loopctl-action-packet-v1',actionId:'action-1',actionKey:'action-key-1',
    action:{id:'action-1',key:'action-key-1',kind:'preflight_attempt',state:'ready',workItemRevision:2,targetPrincipal:'catsco-user:559',targetTopicId:'grp_42',targetDigest:'target-digest'},
    workItemId:'wi-1',workItemRevision:2,targetPrincipal:'catsco-user:559',targetTopicId:'grp_42',targetDigest:'target-digest',
    contracts:{taskContractHash:'task-contract',referenceSnapshotHash:'reference-snapshot',writeScopeHash:'write-scope',acceptanceContractHash:'acceptance-contract'},
    ownerUid:'602',loopId:'loop-1',profileId:'profile-1',catscoProjectId:'81',workerTopicId:'grp_42',evidenceTopicId:'grp_43',
    workerSessionId:'session:v2:catscompany:group:grp_42:agent:559',githubRepo:'org/repo',writeScope:['src'],attemptId:'attempt-1',attemptNumber:1,generation:0,
    runtimePrincipal:'catsco-user:559',leaseExpiresAt:'2030-01-01T00:00:00.000Z',proofMode:'catsco-message',
    workBundle:{contractDigest:'bundle-digest',instructions:'preflight only',deliverables:['readiness']}
  }
  return signedPacket(actionPacket)
}

type Options={ missingProject?:boolean; workerKind?:string; workerAgents?:string; evidenceKind?:string; evidenceAgents?:string; duplicate?:boolean }
function installTrustedControllerKeys(root:string, keys=[{ownerUid:'602',controllerKeyId,publicKey:controllerPublicKey}]){
  const path=join(root,'trusted-controller-keys.json')
  writeFileSync(path,JSON.stringify({version:1,keys}))
  chmodSync(path,0o600)
  process.env.LOOPCTL_TRUSTED_CONTROLLER_KEYS_FILE=path
  return path
}

function installOpenCli(root:string, options:Options={}){
  installTrustedControllerKeys(root)
  const binary=join(root,'opencli.js'), calls=join(root,'calls.jsonl')
  writeFileSync(binary,`#!/usr/bin/env node
const fs=require('fs'); const args=process.argv.slice(2); fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+'\\n');
const opt=${JSON.stringify(options)};
if(args[1]==='me') process.stdout.write(JSON.stringify({uid:process.env.TEST_CATSCO_UID||'559'}));
else if(args[1]==='project-sessions') process.stdout.write(JSON.stringify(opt.missingProject?[{topicId:'grp_42'}]:[{topicId:'grp_42'},{topicId:'grp_43'}]));
else if(args[1]==='group-info') { const worker=args[2]==='42'; process.stdout.write(JSON.stringify(worker?{groupId:'42',topic:'grp_42',kind:opt.workerKind||'agent_task',agentIds:opt.workerAgents||'559',memberIds:'559,602'}:{groupId:'43',topic:'grp_43',kind:opt.evidenceKind||'standard',agentIds:opt.evidenceAgents||'559,574',memberIds:'559,574,602'})); }
else if(args[1]==='send') process.stdout.write(JSON.stringify({messageId:'9',topicId:args[2],clientMsgId:args[args.indexOf('--client-message-id')+1],seqId:'9',duplicate:opt.duplicate===true,contentDigest:'digest'}));
else if(args[1]==='message-receipt') process.stdout.write(JSON.stringify({found:true,serverConfirmed:true,topicId:args[2],clientMsgId:args[args.indexOf('--client-message-id')+1],seqId:'9',contentDigest:'digest'}));
else { process.stderr.write('unexpected'); process.exit(1) }
`)
  chmodSync(binary,0o755); process.env.OPENCLI_BINARY=binary
  return calls
}

async function invoke(root:string, value:unknown, receivedTopic='grp_42'){
  writeFileSync(join(root,'packet.json'),JSON.stringify(value))
  const cwd=process.cwd(); process.chdir(root)
  try{return await preflightReady({'packet-file':'packet.json','received-topic':receivedTopic})}
  finally{process.chdir(cwd)}
}
function calls(path:string):string[][] { return existsSync(path) ? readFileSync(path,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)) : [] }
function sends(path:string){return calls(path).filter(args=>args[1]==='send')}
function stable(prefix:string, parts:string[]){return `${prefix}:${createHash('sha256').update(parts.join('\u0000')).digest('hex')}`}

describe('preflight-ready',()=>{
  it('validates a Project-attached native packet and sends the sole canonical worker_ready event',async()=>{
    const root=mkdtempSync(join(tmpdir(),'preflight-ready-')); roots.push(root)
    const commandCalls=installOpenCli(root)
    const result=await invoke(root,packet())
    const parts=['action-key-1','worker_ready','attempt-1','0','2','session:v2:catscompany:group:grp_42:agent:559']
    expect(result.targetTopicId).toBe('grp_43')
    expect(result.event).toEqual({
      type:'worker_ready',eventId:stable('loop-event',parts),idempotencyKey:stable('loop-evidence',parts),source:'catsco-user:559',entityRef:'attempt:attempt-1',
      payload:{workItemId:'wi-1',expectedRevision:2,attemptId:'attempt-1',generation:0,runtimePrincipal:'catsco-user:559',workerSessionId:'session:v2:catscompany:group:grp_42:agent:559',signature:'catsco-message-attested'}
    })
    expect(result.receipt).toMatchObject({topicId:'grp_43',clientMsgId:stable('loop-evidence',parts),seqId:'9'})
    expect(sends(commandCalls)).toHaveLength(1)
    expect(JSON.parse(sends(commandCalls)[0][3])).toEqual(result.event)
    expect(calls(commandCalls).some(args=>args[0]==='loopctl')).toBe(false)
  })

  it('uses the same action-derived idempotency key on a duplicate receipt',async()=>{
    const root=mkdtempSync(join(tmpdir(),'preflight-ready-')); roots.push(root)
    const commandCalls=installOpenCli(root,{duplicate:true})
    const first=await invoke(root,packet())
    const second=await invoke(root,packet())
    expect(first.event.idempotencyKey).toBe(second.event.idempotencyKey)
    expect(second.receipt.duplicate).toBe(true)
    expect(sends(commandCalls)).toHaveLength(2)
  })

  it.each(['2000-01-01T00:00:00.000Z',new Date().toISOString()])('rejects an expired or non-future lease (%s) before sending',async leaseExpiresAt=>{
    const root=mkdtempSync(join(tmpdir(),'preflight-ready-')); roots.push(root)
    const commandCalls=installOpenCli(root)
    await expect(invoke(root,signedPacket({...packet(),leaseExpiresAt}))).rejects.toThrow('leaseExpiresAt must be in the future')
    expect(sends(commandCalls)).toHaveLength(0)
  })

  it('rechecks lease freshness at the send boundary',async()=>{
    const root=mkdtempSync(join(tmpdir(),'preflight-ready-')); roots.push(root)
    const commandCalls=installOpenCli(root)
    const leaseExpiresAt='2030-01-01T00:00:00.000Z'
    const expiresAt=Date.parse(leaseExpiresAt)
    vi.spyOn(Date,'now').mockReturnValueOnce(expiresAt-1).mockReturnValue(expiresAt)
    await expect(invoke(root,signedPacket({...packet(),leaseExpiresAt}))).rejects.toThrow('leaseExpiresAt must be in the future')
    expect(sends(commandCalls)).toHaveLength(0)
  })

  it('rejects a packet with a mismatched canonical packetDigest before sending',async()=>{
    const root=mkdtempSync(join(tmpdir(),'preflight-ready-')); roots.push(root)
    const commandCalls=installOpenCli(root)
    await expect(invoke(root,{...packet(),packetDigest:'0'.repeat(64)})).rejects.toThrow('packetDigest does not match the canonical Controller action packet')
    expect(sends(commandCalls)).toHaveLength(0)
  })

  it.each([
    ['missing trusted key file',(root:string)=>{ process.env.LOOPCTL_TRUSTED_CONTROLLER_KEYS_FILE=join(root,'absent.json') },'configuration is unavailable or invalid'],
    ['malformed trusted key file',(root:string)=>{ writeFileSync(join(root,'trusted-controller-keys.json'),'{not-json'); chmodSync(join(root,'trusted-controller-keys.json'),0o600) },'configuration is unavailable or invalid'],
    ['unsafe trusted key file mode',(root:string)=>chmodSync(join(root,'trusted-controller-keys.json'),0o644),'must have mode 0600'],
    ['symbolic-link trusted key file',(root:string)=>{ const path=join(root,'trusted-controller-keys.json'); rmSync(path); symlinkSync('other.json',path) },'must not be a symbolic link'],
    ['unknown owner/key pin',(root:string)=>installTrustedControllerKeys(root,[{ownerUid:'999',controllerKeyId,publicKey:controllerPublicKey}]),'not pinned'],
    ['invalid Controller key ID',(_root:string)=>undefined,'key ID does not match'],
    ['invalid Controller signature',(_root:string)=>undefined,'signature is invalid']
  ])('rejects %s before invoking CatsCo or sending evidence',async(_name, configure, message)=>{
    const root=mkdtempSync(join(tmpdir(),'preflight-ready-')); roots.push(root)
    const commandCalls=installOpenCli(root)
    configure(root)
    const value=_name==='invalid Controller key ID' ? {...packet(),controllerKeyId:'controller-ed25519:wrong'} :
      _name==='invalid Controller signature' ? {...packet(),controllerSignature:Buffer.from('tampered').toString('base64')} : packet()
    await expect(invoke(root,value)).rejects.toThrow(message)
    expect(calls(commandCalls)).toHaveLength(0)
    expect(sends(commandCalls)).toHaveLength(0)
  })

  it('rejects a self-carried, correctly signed but unpinned Controller key before CatsCo',async()=>{
    const root=mkdtempSync(join(tmpdir(),'preflight-ready-')); roots.push(root)
    const commandCalls=installOpenCli(root)
    await expect(invoke(root,signedPacketWithKey(packet(),attackerKeys))).rejects.toThrow('not pinned')
    expect(calls(commandCalls)).toHaveLength(0)
    expect(sends(commandCalls)).toHaveLength(0)
  })

  it('uses the Controller canonical key order for packet digest and signature bytes',()=>{
    expect(controllerCanonicalJson({ä:1,Z:{z:-0,a:true}})).toBe('{"Z":{"a":true,"z":0},"ä":1}')
  })

  it.each([
    ['non-preflight packet',(p:any)=>({...p,kind:'execute_attempt',action:{...p.action,kind:'execute_attempt'}}),{},'grp_42'],
    ['unknown packet field',(p:any)=>({...p,unexpected:true}),{},'grp_42'],
    ['mismatched action id',(p:any)=>({...p,action:{...p.action,id:'other-action'}}),{},'grp_42'],
    ['mismatched action key',(p:any)=>({...p,action:{...p.action,key:'other-key'}}),{},'grp_42'],
    ['mismatched action revision',(p:any)=>({...p,action:{...p.action,workItemRevision:3}}),{},'grp_42'],
    ['mismatched action principal',(p:any)=>({...p,action:{...p.action,targetPrincipal:'catsco-user:560'}}),{},'grp_42'],
    ['mismatched action topic',(p:any)=>({...p,action:{...p.action,targetTopicId:'grp_99'}}),{},'grp_42'],
    ['mismatched action digest',(p:any)=>({...p,action:{...p.action,targetDigest:'other-digest'}}),{},'grp_42'],
    ['wrong authenticated Bot',(p:any)=>p,{},'grp_42'],
    ['different received topic',(p:any)=>p,{},'grp_99'],
    ['P2P execution topic',(p:any)=>({...p,targetTopicId:'p2p_559_602',workerTopicId:'p2p_559_602',action:{...p.action,targetTopicId:'p2p_559_602'},workerSessionId:'session:v2:catscompany:group:p2p_559_602:agent:559'}),{},'p2p_559_602'],
    ['same evidence topic',(p:any)=>({...p,evidenceTopicId:'grp_42'}),{},'grp_42'],
    ['wrong worker session',(p:any)=>({...p,workerSessionId:'session:v2:catscompany:group:grp_42:agent:560'}),{},'grp_42'],
    ['missing numeric Project',(p:any)=>({...p,catscoProjectId:'project:auto'}),{},'grp_42'],
    ['missing Project evidence attachment',(p:any)=>p,{missingProject:true},'grp_42'],
    ['wrong execution topology',(p:any)=>p,{workerKind:'standard'},'grp_42'],
    ['wrong execution Worker',(p:any)=>p,{workerAgents:'560'},'grp_42'],
    ['wrong evidence topology',(p:any)=>p,{evidenceKind:'agent_task'},'grp_42'],
    ['Worker absent from evidence topology',(p:any)=>p,{evidenceAgents:'574'},'grp_42']
  ])('rejects %s without sending CatsCo evidence',async(_name, mutate, options, receivedTopic)=>{
    const root=mkdtempSync(join(tmpdir(),'preflight-ready-')); roots.push(root)
    const commandCalls=installOpenCli(root,options as Options)
    if(_name==='wrong authenticated Bot') process.env.TEST_CATSCO_UID='560'
    await expect(invoke(root,mutate(packet()),receivedTopic)).rejects.toThrow()
    expect(sends(commandCalls)).toHaveLength(0)
  })
})
