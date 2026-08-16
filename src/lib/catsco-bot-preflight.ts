import { createHash } from 'node:crypto'
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors'
import { z } from 'zod'

const MAX_CONFIG_BYTES=16*1024
const MAX_KEY_BYTES=8*1024
const MAX_RESPONSE_BYTES=128*1024
const REQUEST_TIMEOUT_MS=15_000
const TRUSTED_HTTP_BASE_URL='https://app.catsco.cc'
const configSchema=z.object({
  version:z.literal(1),
  transport:z.literal('catsco-bot-preflight-v1'),
  httpBaseUrl:z.string().min(1),
  expectedBotUid:z.string().regex(/^[1-9]\d*$/),
  apiKeyFile:z.string().min(1)
}).strict()

type BotPreflightConfig=z.infer<typeof configSchema>
export interface BotPreflightReceipt { messageId:string; topicId:string; clientMsgId:string; seqId:string; duplicate:boolean; contentDigest:string }

function configuredPath(): string { return process.env.LOOPCTL_BOT_PREFLIGHT_CONFIG?.trim() || join(homedir(),'.config','loopctl','catsco-bot-preflight.json') }
function secureRead(path:string, maxBytes:number, label:string): string {
  let fd: number | undefined
  try {
    const before=lstatSync(path)
    if (before.isSymbolicLink() || !before.isFile()) throw new Error(`${label} must be a regular file`)
    if ((before.mode&0o777)!==0o600) throw new Error(`${label} must have mode 0600`)
    if (typeof process.getuid==='function' && before.uid!==process.getuid()) throw new Error(`${label} must be owned by the current user`)
    if (before.size>maxBytes) throw new Error(`${label} is too large`)
    fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW)
    const after=fstatSync(fd)
    if (!after.isFile() || (after.mode&0o777)!==0o600 || after.size>maxBytes || after.dev!==before.dev || after.ino!==before.ino || (typeof process.getuid==='function' && after.uid!==process.getuid())) throw new Error(`${label} changed while opening or is unsafe`)
    return readFileSync(fd,'utf8')
  } finally { if(fd!==undefined) closeSync(fd) }
}
function trustedHttpBaseUrl(value:string): string {
  // This transport handles a highly privileged Bot API key. It intentionally
  // does not make the endpoint operator-configurable: config can only select
  // the canonical production CatsCo origin, never an arbitrary SSRF target.
  const raw=value.trim()
  if (raw!==TRUSTED_HTTP_BASE_URL && raw!==`${TRUSTED_HTTP_BASE_URL}/`) throw new Error(`httpBaseUrl must be exactly ${TRUSTED_HTTP_BASE_URL}`)
  const url=new URL(raw)
  if (url.protocol!=='https:' || url.hostname!=='app.catsco.cc' || url.port || url.username || url.password || url.pathname!=='/' || url.search || url.hash) {
    throw new Error(`httpBaseUrl must be exactly ${TRUSTED_HTTP_BASE_URL}`)
  }
  return TRUSTED_HTTP_BASE_URL
}
function loadConfig(): BotPreflightConfig {
  try {
    const config=configSchema.parse(JSON.parse(secureRead(configuredPath(),MAX_CONFIG_BYTES,'Bot preflight config')))
    config.httpBaseUrl=trustedHttpBaseUrl(config.httpBaseUrl)
    if(!config.apiKeyFile.startsWith('/')) throw new Error('apiKeyFile must be an absolute path')
    return config
  } catch(error) { throw new ArgumentError(`Bot preflight configuration is unavailable or invalid: ${error instanceof Error?error.message:'invalid configuration'}`) }
}
function apiKey(config:BotPreflightConfig):string {
  try {
    const value=secureRead(config.apiKeyFile,MAX_KEY_BYTES,'Bot preflight API key').trim()
    if(!value || /[\r\n\0]/.test(value)) throw new Error('Bot preflight API key is invalid')
    return value
  } catch(error) { throw new ArgumentError(`Bot preflight API key is unavailable or invalid: ${error instanceof Error?error.message:'invalid key'}`) }
}
async function boundedResponseText(response:Response): Promise<string> {
  if (!response.body) throw new CommandExecutionError('CatsCo Bot API response body is unavailable')
  const reader=response.body.getReader()
  const chunks:Uint8Array[]=[]
  let bytes=0
  try {
    while(true) {
      const next=await reader.read()
      if(next.done) break
      const chunk=next.value
      bytes+=chunk.byteLength
      if(bytes>MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(()=>undefined)
        throw new CommandExecutionError('CatsCo Bot API response is too large')
      }
      chunks.push(chunk)
    }
  } finally { reader.releaseLock() }
  const combined=new Uint8Array(bytes)
  let offset=0
  for(const chunk of chunks) { combined.set(chunk,offset); offset+=chunk.byteLength }
  return new TextDecoder().decode(combined)
}
async function request(key:string,path:string,init:RequestInit):Promise<unknown> {
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS)
  try {
    const response=await fetch(`${TRUSTED_HTTP_BASE_URL}${path}`,{...init,redirect:'error',signal:controller.signal,headers:{Authorization:`ApiKey ${key}`,...init.headers}})
    const text=await boundedResponseText(response)
    if(!response.ok) throw new CommandExecutionError(`CatsCo Bot API request failed with HTTP ${response.status}`)
    try { return JSON.parse(text) } catch { throw new CommandExecutionError('CatsCo Bot API returned invalid JSON') }
  } catch(error) {
    if(error instanceof CommandExecutionError) throw error
    throw new CommandExecutionError(`CatsCo Bot API request failed: ${error instanceof Error?error.name:'network error'}`)
  } finally { clearTimeout(timer) }
}
function record(value:unknown,label:string):Record<string,unknown> { if(!value||typeof value!=='object'||Array.isArray(value)) throw new CommandExecutionError(`CatsCo Bot API returned invalid ${label}`); return value as Record<string,unknown> }
function contentDigest(content:string):string { return createHash('sha256').update(content).digest('hex') }
function historyRows(value:unknown, topicId:string, sequence:string):Record<string,unknown>[] {
  const envelope=record(value,'message receipt')
  if(String(envelope.topic_id??'')!==topicId || String(envelope.around_id??'')!==sequence || !Array.isArray(envelope.messages)) throw new CommandExecutionError('CatsCo Bot API returned invalid exact message receipt')
  return envelope.messages.map(row=>record(row,'message receipt'))
}

/**
 * Bot-only REST sender for signed preflight evidence. The Controller Ed25519
 * signature is the immutable topology-intent attestation: Bot REST has no
 * Project/group topology-read API. The REST server independently proves that
 * this Bot can persist and read back precisely this evidence message.
 */
export async function sendBotPreflightEvidence(topicId:string, content:string, clientMsgId:string, expectedUid:string, beforeSend?:()=>void):Promise<BotPreflightReceipt> {
  const config=loadConfig()
  if(config.expectedBotUid!==expectedUid) throw new ArgumentError('Bot preflight config identity does not match signed packet principal')
  const key=apiKey(config)
  const me=record(await request(key,'/api/me',{method:'GET'}),'identity')
  if(String(me.uid??'')!==expectedUid || String(me.account_type??'').toLowerCase()!=='bot') throw new CommandExecutionError('CatsCo Bot API identity does not match configured Worker Bot')
  beforeSend?.()
  const sent=record(await request(key,'/api/messages/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic_id:topicId,client_msg_id:clientMsgId,content,msg_type:'text',type:'text'})}),'send receipt')
  const receipt:BotPreflightReceipt={messageId:String(sent.id??''),topicId:String(sent.topic_id??''),clientMsgId:String(sent.client_msg_id??''),seqId:String(sent.seq_id??''),duplicate:sent.duplicate===true,contentDigest:contentDigest(content)}
  if(!receipt.messageId || !receipt.seqId || receipt.messageId!==receipt.seqId || receipt.topicId!==topicId || String(sent.from_uid??'')!==expectedUid || receipt.clientMsgId!==clientMsgId) throw new CommandExecutionError('CatsCo Bot API send receipt failed verification')
  // The server supports around_id and returns a bounded envelope containing
  // the exact persisted message, avoiding false negatives after >100 sends.
  const history=historyRows(await request(key,`/api/messages?topic_id=${encodeURIComponent(topicId)}&around_id=${encodeURIComponent(receipt.seqId)}&limit=1`,{method:'GET'}),topicId,receipt.seqId)
  const confirmed=history.find(row=>String(row.id??'')===receipt.messageId && String(row.seq_id??'')===receipt.seqId && String(row.topic_id??'')===topicId && String(row.from_uid??row.from??'')===expectedUid && String(row.type??'')==='text' && String(row.content??'')===content)
  if(!confirmed) throw new CommandExecutionError('CatsCo Bot API receipt was not server-confirmed')
  return receipt
}
