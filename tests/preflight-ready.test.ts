import { afterEach, describe, expect, it, vi } from 'vitest'
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { preflightReady } from '../src/lib/commands.js'
import { controllerCanonicalJson } from '../src/lib/controller-provenance.js'

const keys=generateKeyPairSync('ed25519')
const publicKey=keys.publicKey.export({type:'spki',format:'pem'}).toString()
const keyId=`controller-ed25519:${createHash('sha256').update(publicKey).digest('base64url')}`
const roots:string[]=[]
afterEach(()=>{vi.restoreAllMocks();delete process.env.LOOPCTL_TRUSTED_CONTROLLER_KEYS_FILE;delete process.env.LOOPCTL_BOT_PREFLIGHT_CONFIG;while(roots.length)rmSync(roots.pop()!,{recursive:true,force:true})})

function signed(value:Record<string,unknown>){
 const unsigned={...value,controllerSignatureAlgorithm:'ed25519',controllerKeyId:keyId,controllerPublicKey:publicKey}
 const withDigest={...unsigned,packetDigest:createHash('sha256').update(controllerCanonicalJson(unsigned)).digest('hex')}
 return {...withDigest,controllerSignature:sign(null,Buffer.from(controllerCanonicalJson(withDigest)),keys.privateKey).toString('base64')}
}
function packet(overrides:Record<string,unknown>={}){return signed({...{
 kind:'preflight_attempt',schema:'loopctl-action-packet-v1',actionId:'action-1',actionKey:'action-key-1',
 action:{id:'action-1',key:'action-key-1',kind:'preflight_attempt',state:'ready',workItemRevision:2,targetPrincipal:'catsco-user:559',targetTopicId:'grp_42',targetDigest:'target-digest'},
 workItemId:'wi-1',workItemRevision:2,targetPrincipal:'catsco-user:559',targetTopicId:'grp_42',targetDigest:'target-digest',
 contracts:{taskContractHash:'task-contract',referenceSnapshotHash:'reference-snapshot',writeScopeHash:'write-scope',acceptanceContractHash:'acceptance-contract'},ownerUid:'602',loopId:'loop-1',profileId:'profile-1',catscoProjectId:'81',workerTopicId:'grp_42',evidenceTopicId:'grp_43',workerSessionId:'session:v2:catscompany:group:grp_42:agent:559',githubRepo:'org/repo',writeScope:['src'],attemptId:'attempt-1',attemptNumber:1,generation:0,runtimePrincipal:'catsco-user:559',leaseExpiresAt:'2030-01-01T00:00:00.000Z',proofMode:'catsco-message',workBundle:{contractDigest:'bundle-digest',instructions:'preflight only',deliverables:['readiness']}
},...overrides})}
function install(root:string,{botUid='559',apiKey='cc_secret_do_not_log',url='https://app.catsco.cc'}={}){
 const pins=join(root,'pins.json');writeFileSync(pins,JSON.stringify({version:1,keys:[{ownerUid:'602',controllerKeyId:keyId,publicKey}]}));chmodSync(pins,0o600);process.env.LOOPCTL_TRUSTED_CONTROLLER_KEYS_FILE=pins
 const key=join(root,'bot.key');writeFileSync(key,apiKey);chmodSync(key,0o600)
 const config=join(root,'bot.json');writeFileSync(config,JSON.stringify({version:1,transport:'catsco-bot-preflight-v1',httpBaseUrl:url,expectedBotUid:botUid,apiKeyFile:key}));chmodSync(config,0o600);process.env.LOOPCTL_BOT_PREFLIGHT_CONFIG=config
 return {key,config,apiKey}
}
function response(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})}
function exactHistory(id:number|string, content:string, topic='grp_43', from=559){return {topic_id:topic,around_id:id,messages:[{id,seq_id:id,topic_id:topic,from_uid:from,type:'text',content}]}}
async function invoke(root:string,value:unknown){writeFileSync(join(root,'packet.json'),JSON.stringify(value));const cwd=process.cwd();process.chdir(root);try{return await preflightReady({'packet-file':'packet.json','received-topic':'grp_42'})}finally{process.chdir(cwd)}}

describe('preflight-ready Bot transport',()=>{
 it('uses no OpenCLI, verifies Bot identity, emits canonical evidence, and confirms an exact persisted receipt',async()=>{
  const root=mkdtempSync(join(tmpdir(),'preflight-bot-'));roots.push(root);const {apiKey}=install(root);let sent='';let idempotency=''
  const fetch=vi.fn(async(url:string,init:RequestInit)=>{if(url.endsWith('/api/me'))return response({uid:'559',account_type:'bot'});if(url.includes('/api/messages?'))return response(exactHistory(9,sent));const body=JSON.parse(String(init.body));sent=body.content;idempotency=body.client_msg_id;return response({id:9,seq_id:9,topic_id:'grp_43',from_uid:559,client_msg_id:idempotency,duplicate:false})});vi.stubGlobal('fetch',fetch)
  const result=await invoke(root,packet())
  expect(fetch).toHaveBeenCalledTimes(3);expect(JSON.stringify(result)).not.toContain(apiKey);expect(result.targetTopicId).toBe('grp_43');expect(result.event).toMatchObject({type:'worker_ready',source:'catsco-user:559',entityRef:'attempt:attempt-1'});expect(JSON.parse(String(fetch.mock.calls[1][1].body))).toEqual({topic_id:'grp_43',client_msg_id:result.event.idempotencyKey,content:JSON.stringify(result.event),msg_type:'text',type:'text'});expect(String(fetch.mock.calls[2][0])).toContain('around_id=9');expect(String(fetch.mock.calls[2][0])).toContain('limit=1')
 })
 it('rejects Controller signature/digest before any HTTP request',async()=>{const root=mkdtempSync(join(tmpdir(),'preflight-bot-'));roots.push(root);install(root);const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(invoke(root,{...packet(),packetDigest:'0'.repeat(64)})).rejects.toThrow('packetDigest');expect(fetch).not.toHaveBeenCalled()})
 it.each(['http://app.catsco.cc','https://evil.example','https://app.catsco.cc:444','https://user@app.catsco.cc','https://127.0.0.1','https://app.catsco.cc/private'])('rejects untrusted Bot API origin %s before HTTP',async(url)=>{const root=mkdtempSync(join(tmpdir(),'preflight-bot-'));roots.push(root);install(root,{url});const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(invoke(root,packet())).rejects.toThrow('httpBaseUrl');expect(fetch).not.toHaveBeenCalled()})
 it('rejects unsafe credential material without leaking it',async()=>{const root=mkdtempSync(join(tmpdir(),'preflight-bot-'));roots.push(root);const {key,apiKey}=install(root);chmodSync(key,0o644);const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(invoke(root,packet())).rejects.toThrow('mode 0600');try{await invoke(root,packet())}catch(error){expect(String(error)).not.toContain(apiKey)}expect(fetch).not.toHaveBeenCalled()})
 it('rejects symlinked Bot config before any HTTP request',async()=>{const root=mkdtempSync(join(tmpdir(),'preflight-bot-'));roots.push(root);const {config}=install(root);rmSync(config);symlinkSync('bot.key',config);const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(invoke(root,packet())).rejects.toThrow('regular file');expect(fetch).not.toHaveBeenCalled()})
 it('rejects non-Bot or mismatched Bot identity before send',async()=>{const root=mkdtempSync(join(tmpdir(),'preflight-bot-'));roots.push(root);install(root);const fetch=vi.fn(async()=>response({uid:'602',account_type:'human'}));vi.stubGlobal('fetch',fetch);await expect(invoke(root,packet())).rejects.toThrow('identity does not match');expect(fetch).toHaveBeenCalledTimes(1)})
 it.each([
  ['different id', {id:10,seq_id:9,topic_id:'grp_43',from_uid:559,client_msg_id:'x',duplicate:false}],
  ['different sequence', {id:9,seq_id:10,topic_id:'grp_43',from_uid:559,client_msg_id:'x',duplicate:false}],
  ['wrong sender', {id:9,seq_id:9,topic_id:'grp_43',from_uid:602,client_msg_id:'x',duplicate:false}],
 ])('rejects send receipt with %s',async(_label,sent)=>{const root=mkdtempSync(join(tmpdir(),'preflight-bot-'));roots.push(root);install(root);const fetch=vi.fn(async(url:string)=>url.endsWith('/api/me')?response({uid:'559',account_type:'bot'}):response(sent));vi.stubGlobal('fetch',fetch);await expect(invoke(root,packet())).rejects.toThrow('send receipt failed verification')})
 it('confirms duplicate evidence through history without relying on missing history client_msg_id',async()=>{const root=mkdtempSync(join(tmpdir(),'preflight-bot-'));roots.push(root);install(root);let content='';const fetch=vi.fn(async(url:string,init:RequestInit)=>{if(url.endsWith('/api/me'))return response({uid:'559',account_type:'bot'});if(url.includes('/api/messages?'))return response(exactHistory(456,content));const body=JSON.parse(String(init.body));content=body.content;return response({id:456,seq_id:456,topic_id:'grp_43',from_uid:559,client_msg_id:body.client_msg_id,duplicate:true})});vi.stubGlobal('fetch',fetch);expect((await invoke(root,packet())).receipt.duplicate).toBe(true)})
 it('finds the exact receipt beyond a latest-page window and rejects mismatched history body',async()=>{const root=mkdtempSync(join(tmpdir(),'preflight-bot-'));roots.push(root);install(root);let content='';const fetch=vi.fn(async(url:string,init:RequestInit)=>{if(url.endsWith('/api/me'))return response({uid:'559',account_type:'bot'});if(url.includes('/api/messages?'))return response({topic_id:'grp_43',around_id:1001,messages:[...Array.from({length:100},(_,i)=>({id:i+1,seq_id:i+1,topic_id:'grp_43',from_uid:559,type:'text',content:'other'})),{id:1001,seq_id:1001,topic_id:'grp_43',from_uid:559,type:'text',content}]});const body=JSON.parse(String(init.body));content=body.content;return response({id:1001,seq_id:1001,topic_id:'grp_43',from_uid:559,client_msg_id:body.client_msg_id,duplicate:false})});vi.stubGlobal('fetch',fetch);await expect(invoke(root,packet())).resolves.toMatchObject({receipt:{seqId:'1001'}});expect(String(fetch.mock.calls[2][0])).toContain('around_id=1001')
  fetch.mockClear();const mismatch=vi.fn(async(url:string,init:RequestInit)=>url.endsWith('/api/me')?response({uid:'559',account_type:'bot'}):url.includes('/api/messages?')?response(exactHistory(9,'wrong')):response({id:9,seq_id:9,topic_id:'grp_43',from_uid:559,client_msg_id:JSON.parse(String(init.body)).client_msg_id,duplicate:false}));vi.stubGlobal('fetch',mismatch);await expect(invoke(root,packet())).rejects.toThrow('not server-confirmed')})
 it('streams and bounds oversized HTTP responses before decode',async()=>{const root=mkdtempSync(join(tmpdir(),'preflight-bot-'));roots.push(root);install(root);const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode('x'.repeat(128*1024+1)));controller.close()}});const fetch=vi.fn(async()=>new Response(stream,{status:200}));vi.stubGlobal('fetch',fetch);await expect(invoke(root,packet())).rejects.toThrow('response is too large');expect(fetch).toHaveBeenCalledTimes(1)})
 it('rejects expired leases without Bot API traffic',async()=>{const root=mkdtempSync(join(tmpdir(),'preflight-bot-'));roots.push(root);install(root);const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(invoke(root,packet({leaseExpiresAt:'2000-01-01T00:00:00.000Z'}))).rejects.toThrow('leaseExpiresAt');expect(fetch).not.toHaveBeenCalled()})
})
