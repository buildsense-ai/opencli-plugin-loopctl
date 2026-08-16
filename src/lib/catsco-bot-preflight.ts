import { createHash } from 'node:crypto'
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors'
import { z } from 'zod'
import { canonicalJson } from './events.js'

const MAX_CONFIG_BYTES=16*1024
const MAX_KEY_BYTES=8*1024
const MAX_RESPONSE_BYTES=128*1024
const MAX_HISTORY_ROWS=100
const REQUEST_TIMEOUT_MS=15_000
const TRUSTED_HTTP_BASE_URL='https://app.catsco.cc'
const configSchema=z.object({version:z.literal(1),transport:z.literal('catsco-bot-preflight-v1'),httpBaseUrl:z.string().min(1),expectedBotUid:z.string().regex(/^[1-9]\d*$/),controllerUid:z.literal('602').default('602'),apiKeyFile:z.string().min(1)}).strict()
type BotPreflightConfig=z.infer<typeof configSchema>
export interface BotPreflightReceipt { messageId:string; topicId:string; clientMsgId:string; seqId:string; duplicate:boolean; contentDigest:string }

function configuredPath(): string { return process.env.LOOPCTL_BOT_PREFLIGHT_CONFIG?.trim() || join(homedir(),'.config','loopctl','catsco-bot-preflight.json') }
function secureRead(path:string,maxBytes:number,label:string):string { let fd:number|undefined; try { const before=lstatSync(path); if(before.isSymbolicLink()||!before.isFile()) throw new Error(`${label} must be a regular file`); if((before.mode&0o777)!==0o600) throw new Error(`${label} must have mode 0600`); if(typeof process.getuid==='function'&&before.uid!==process.getuid()) throw new Error(`${label} must be owned by the current user`); if(before.size>maxBytes) throw new Error(`${label} is too large`); fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW); const after=fstatSync(fd); if(!after.isFile()||(after.mode&0o777)!==0o600||after.size>maxBytes||after.dev!==before.dev||after.ino!==before.ino||(typeof process.getuid==='function'&&after.uid!==process.getuid())) throw new Error(`${label} changed while opening or is unsafe`); return readFileSync(fd,'utf8') } finally { if(fd!==undefined) closeSync(fd) } }
function loadConfig():BotPreflightConfig { try { const c=configSchema.parse(JSON.parse(secureRead(configuredPath(),MAX_CONFIG_BYTES,'Bot preflight config'))); const u=new URL(c.httpBaseUrl); if(c.httpBaseUrl!==TRUSTED_HTTP_BASE_URL||u.protocol!=='https:'||u.hostname!=='app.catsco.cc'||u.port||u.username||u.password||u.pathname!=='/'||u.search||u.hash) throw new Error(`httpBaseUrl must be exactly ${TRUSTED_HTTP_BASE_URL}`); if(!c.apiKeyFile.startsWith('/')) throw new Error('apiKeyFile must be an absolute path'); return c } catch(e) { throw new ArgumentError(`Bot preflight configuration is unavailable or invalid: ${e instanceof Error?e.message:'invalid configuration'}`) } }
function apiKey(c:BotPreflightConfig):string { try { const v=secureRead(c.apiKeyFile,MAX_KEY_BYTES,'Bot preflight API key').trim(); if(!v||/[\r\n\0]/.test(v)) throw new Error('Bot preflight API key is invalid'); return v } catch(e) { throw new ArgumentError(`Bot preflight API key is unavailable or invalid: ${e instanceof Error?e.message:'invalid key'}`) } }
async function boundedResponseText(r:Response):Promise<string> { if(!r.body) throw new CommandExecutionError('CatsCo Bot API response body is unavailable'); const reader=r.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;try{while(true){const n=await reader.read();if(n.done)break;bytes+=n.value.byteLength;if(bytes>MAX_RESPONSE_BYTES){await reader.cancel().catch(()=>undefined);throw new CommandExecutionError('CatsCo Bot API response is too large')}chunks.push(n.value)}}finally{reader.releaseLock()}const all=new Uint8Array(bytes);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.byteLength}return new TextDecoder().decode(all) }
async function request(key:string,path:string,init:RequestInit):Promise<unknown>{const c=new AbortController(),timer=setTimeout(()=>c.abort(),REQUEST_TIMEOUT_MS);try{const r=await fetch(`${TRUSTED_HTTP_BASE_URL}${path}`,{...init,redirect:'error',signal:c.signal,headers:{Authorization:`ApiKey ${key}`,...init.headers}});const text=await boundedResponseText(r);if(!r.ok)throw new CommandExecutionError(`CatsCo Bot API request failed with HTTP ${r.status}`);try{return JSON.parse(text)}catch{throw new CommandExecutionError('CatsCo Bot API returned invalid JSON')}}catch(e){if(e instanceof CommandExecutionError)throw e;throw new CommandExecutionError(`CatsCo Bot API request failed: ${e instanceof Error?e.name:'network error'}`)}finally{clearTimeout(timer)}}
function record(v:unknown,label:string):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new CommandExecutionError(`CatsCo Bot API returned invalid ${label}`);return v as Record<string,unknown>}
function contentDigest(content:string):string{return createHash('sha256').update(content).digest('hex')}
async function authenticated(c:BotPreflightConfig,key:string):Promise<void>{const me=record(await request(key,'/api/me',{method:'GET'}),'identity');if(String(me.uid??'')!==c.expectedBotUid||String(me.account_type??'').toLowerCase()!=='bot')throw new CommandExecutionError('CatsCo Bot API identity does not match configured Worker Bot')}

/** Read one server-stored Controller Action; no LLM packet file or polling loop. */
export function assertConfiguredControllerOwner(ownerUid:string):void {
  if (ownerUid!==loadConfig().controllerUid) throw new ArgumentError('preflight packet ownerUid does not match configured Controller UID')
}

/** Read one bounded Bot-authenticated history window and mechanically select its sole Controller Action of the requested kind. */
export async function readNativeActionPacket(receivedTopic:string, expectedKind:'preflight_attempt'|'execute_attempt'):Promise<unknown>{
  if(!/^grp_[1-9]\d*$/.test(receivedTopic))throw new ArgumentError('received-topic must be a numeric CatsCo group topic')
  const c=loadConfig(),key=apiKey(c);await authenticated(c,key)
  // A Worker naturally writes planning/tool messages to its execution topic before it invokes this
  // command. `limit=1` therefore selects Worker chatter rather than the Controller Action. This
  // remains one bounded read, never a poll: choose the unique, strictly-formed Controller row.
  const response=record(await request(key,`/api/messages?topic_id=${encodeURIComponent(receivedTopic)}&latest=true&limit=${MAX_HISTORY_ROWS}`,{method:'GET'}),'native Action history')
  if(!Array.isArray(response.messages)||response.messages.length===0||response.messages.length>MAX_HISTORY_ROWS)throw new CommandExecutionError('CatsCo Bot API returned invalid native Action history')
  const candidates:unknown[]=[]
  for(const rawRow of response.messages){
    const row=record(rawRow,'native Action message')
    // Worker-originated runtime/tool chatter is not Controller evidence and is deliberately
    // ignored before any Controller-envelope validation. Its shape is not an authorization input.
    const sender=String(row.from_uid??row.from??'')
    if(sender===c.expectedBotUid)continue
    if(sender!==c.controllerUid)throw new CommandExecutionError('native Action message sender is invalid')
    if(String(row.topic_id??'')!==receivedTopic)throw new CommandExecutionError('native Action message topic is invalid')
    if(!/^\d+$/.test(String(row.id??''))||String(row.id)!==String(row.seq_id??''))throw new CommandExecutionError('native Action message id/seq is invalid')
    if(String(row.type??'')!=='text'||String(row.msg_type??'text')!=='text')throw new CommandExecutionError('native Action message type is invalid')
    for(const actor of [row.actor_uid,row.actorUid,row.metadata&&typeof row.metadata==='object'?(row.metadata as Record<string,unknown>).actor_uid:undefined]) if(actor!==undefined&&String(actor)!==c.controllerUid)throw new CommandExecutionError('native Action message actor is invalid')
    let packet:unknown
    try{packet=typeof row.content==='string'?JSON.parse(row.content):JSON.parse(canonicalJson(row.content))}catch{throw new CommandExecutionError('native Action message content is not a JSON packet')}
    if(!packet||typeof packet!=='object'||Array.isArray(packet)||typeof (packet as Record<string,unknown>).kind!=='string')throw new CommandExecutionError('native Action message content is not an Action packet')
    if((packet as Record<string,unknown>).kind===expectedKind)candidates.push(packet)
  }
  if(candidates.length!==1)throw new CommandExecutionError(`CatsCo Bot API found ${candidates.length} eligible native Controller ${expectedKind} Action messages; expected exactly one`)
  return candidates[0]
}

/** Compatibility wrapper for the preflight-only receipt path. */
export async function readNativePreflightPacket(receivedTopic:string):Promise<unknown>{return readNativeActionPacket(receivedTopic,'preflight_attempt')}
function isExactLatestReceipt(row:Record<string,unknown>,receipt:BotPreflightReceipt,expectedUid:string,content:string,eventType:'worker_ready'|'runtime_started'):boolean{if(String(row.id??'')!==receipt.messageId||String(row.seq_id??'')!==receipt.seqId||String(row.topic_id??'')!==receipt.topicId||String(row.from_uid??row.from??'')!==expectedUid||String(row.type??'')!==eventType)return false;try{return canonicalJson(row.content)===content}catch{return false}}
export async function sendBotAttemptEvidence(topicId:string,content:string,clientMsgId:string,expectedUid:string,eventType:'worker_ready'|'runtime_started',beforeSend?:()=>void):Promise<BotPreflightReceipt>{const c=loadConfig();if(c.expectedBotUid!==expectedUid)throw new ArgumentError('Bot preflight config identity does not match signed packet principal');const key=apiKey(c);await authenticated(c,key);beforeSend?.();const sent=record(await request(key,'/api/messages/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic_id:topicId,client_msg_id:clientMsgId,content,msg_type:'text',type:'text'})}),'send receipt');const receipt={messageId:String(sent.id??''),topicId:String(sent.topic_id??''),clientMsgId:String(sent.client_msg_id??''),seqId:String(sent.seq_id??''),duplicate:sent.duplicate===true,contentDigest:contentDigest(content)};if(!receipt.messageId||!receipt.seqId||receipt.messageId!==receipt.seqId||receipt.topicId!==topicId||String(sent.from_uid??'')!==expectedUid||receipt.clientMsgId!==clientMsgId)throw new CommandExecutionError('CatsCo Bot API send receipt failed verification');const history=record(await request(key,`/api/messages?topic_id=${encodeURIComponent(topicId)}&latest=true&limit=${MAX_HISTORY_ROWS}`,{method:'GET'}),'message receipt');if(!Array.isArray(history.messages)||history.messages.length===0||history.messages.length>MAX_HISTORY_ROWS)throw new CommandExecutionError('CatsCo Bot API returned invalid latest message receipt');const newest=record(history.messages.at(-1),'message receipt');if(!isExactLatestReceipt(newest,receipt,expectedUid,content,eventType))throw new CommandExecutionError('CatsCo Bot API receipt was not server-confirmed');return receipt}
export async function sendBotPreflightEvidence(topicId:string,content:string,clientMsgId:string,expectedUid:string,beforeSend?:()=>void):Promise<BotPreflightReceipt>{return sendBotAttemptEvidence(topicId,content,clientMsgId,expectedUid,'worker_ready',beforeSend)}
