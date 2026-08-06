import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors'
import { actionPacketSchema, receiptSchema, statusSchema, tickSchema } from './schemas.js'
import { bundle, candidate, parseAgentTaskFanout, parseEvent, parseFanout, parseIntegrationPlan, parsePlan, registered, review, runtimeStarted } from './events.js'
import { readConfinedFile, runLoopctl, unwrap } from './loopctl.js'
import { createAgentTaskTopic } from './catsco.js'

const asObject=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new CommandExecutionError('loopctl returned a non-object JSON value');return value as Record<string,unknown>}
const parseResponse=<T>(schema:{parse(value:unknown):T},value:unknown,label:string):T=>{try{return schema.parse(value)}catch{throw new CommandExecutionError(`loopctl returned malformed ${label} JSON`)}}
const assertAcceptedReceipt=(value:unknown)=>{const receipt=parseResponse(receiptSchema,value,'receipt');if(receipt.status==='rejected')throw new ArgumentError(`loopctl rejected event: ${receipt.rejectionCode??'unknown'}`);return receipt}
export async function status(kwargs:any){const args=['status'];if(kwargs['work-item'])args.push('--work-item',String(kwargs['work-item']));return parseResponse(statusSchema,unwrap(await runLoopctl(args)),'status')}
export async function pending(){const value=parseResponse(statusSchema,unwrap(await runLoopctl(['status'])),'status');return {actions:value.actions.filter(a=>a.state==='ready'),current:value.workItems.filter(w=>['assigned','in_progress','candidate','changes_requested'].includes(w.state))}}
export async function packet(kwargs:any){return parseResponse(actionPacketSchema,unwrap(await runLoopctl(['packet','--action-id',String(kwargs['action-id'])])),'packet')}
async function ingest(event:unknown){return assertAcceptedReceipt(unwrap(await runLoopctl(['ingest','--file','-'],`${JSON.stringify(event)}\n`)))}
async function tick(){return parseResponse(tickSchema,unwrap(await runLoopctl(['tick'])),'tick')}
const readPlan=async(file:string)=>{try{return parsePlan(await readConfinedFile(file))}catch(error){throw new ArgumentError(error instanceof Error?error.message:'invalid plan file')}}
const readEvent=async(file:string,schema:any)=>{try{return parseEvent(await readConfinedFile(file),schema)}catch(error){throw new ArgumentError(error instanceof Error?error.message:'invalid event file')}}
export async function start(kwargs:any){const events=await readPlan(String(kwargs['plan-file']));const receipts=[];receipts.push(await ingest(events[0]));receipts.push(await ingest(events[1]));return {receipts,tick:await tick()}}
export async function fanout(kwargs:any){
  let events: any[]
  try { events=parseFanout(await readConfinedFile(String(kwargs['plan-file']))) } catch(error) { throw new ArgumentError(error instanceof Error?error.message:'invalid fanout file') }
  const receipts=[]
  for(const event of events) receipts.push(await ingest(event))
  return {count:events.length/2,receipts,tick:await tick()}
}
export async function agentTaskFanout(kwargs:any){
  let events: any[]
  try { events=parseAgentTaskFanout(await readConfinedFile(String(kwargs['plan-file']))) } catch(error) { throw new ArgumentError(error instanceof Error?error.message:'invalid agent-task fanout file') }
  const provisionedTopics: Array<{ workItemId: string; attemptId: string; topic: string; groupId: string }> = []
  const rewritten: any[] = []
  for(let index=0; index<events.length; index+=2) {
    const registration=events[index]
    const bundleEvent=events[index + 1]
    const placeholder=/^agent-task:([1-9]\d*)$/.exec(registration.payload.workerTopicId)
    if(!placeholder) throw new ArgumentError(`agent-task fanout requires workerTopicId agent-task:<WorkerAgentUid> for ${registration.payload.workItemId}`)
    const workerAgentUid=placeholder[1]
    if(bundleEvent.payload.runtimePrincipal !== `catsco-user:${workerAgentUid}`) throw new ArgumentError(`agent-task runtime principal does not match Worker UID for ${registration.payload.workItemId}`)
    const group=await createAgentTaskTopic(`Loop ${registration.payload.loopId} ${bundleEvent.payload.attemptId}`, workerAgentUid)
    const allocated={...registration,payload:{...registration.payload,workerTopicId:group.topic}}
    rewritten.push(allocated,bundleEvent)
    provisionedTopics.push({workItemId:registration.payload.workItemId,attemptId:bundleEvent.payload.attemptId,topic:group.topic,groupId:group.groupId})
  }
  parseFanout(JSON.stringify(rewritten))
  const receipts=[]
  for(const event of rewritten) receipts.push(await ingest(event))
  return {count:rewritten.length/2,provisionedTopics,receipts,tick:await tick()}
}
export async function integrate(kwargs:any){
  let plan: ReturnType<typeof parseIntegrationPlan>
  try { plan=parseIntegrationPlan(await readConfinedFile(String(kwargs['plan-file']))) } catch(error) { throw new ArgumentError(error instanceof Error?error.message:'invalid integration plan') }
  const integrationRegistration=plan.events[0]
  if(integrationRegistration.type!=='work_item_registered') throw new ArgumentError('integration plan must start with registration')
  const current=await status({})
  const loopItems=current.workItems.filter(row=>row.loopId===integrationRegistration.payload.loopId&&row.workItemId!==integrationRegistration.payload.workItemId)
  const declared=new Set(plan.inputs.map(input=>input.workItemId))
  const missing=plan.inputs.filter(input=>{
    const item=current.workItems.find(row=>row.workItemId===input.workItemId)
    const candidate=current.candidates.find((row:any)=>row.workItemId===input.workItemId&&row.candidateId===input.candidateId)
    return !item||item.loopId!==integrationRegistration.payload.loopId||!['accepted','closed'].includes(item.state)||!candidate||candidate.repository!==input.repository||candidate.prNumber!==input.prNumber||candidate.headSha!==input.headSha||candidate.digest!==input.digest
  })
  const unfinished=loopItems.filter(item=>!['accepted','closed'].includes(item.state))
  const omitted=loopItems.filter(item=>!declared.has(item.workItemId))
  if(missing.length||unfinished.length||omitted.length) {
    const ids=[...new Set([...missing.map(input=>input.workItemId),...unfinished.map(item=>item.workItemId),...omitted.map(item=>item.workItemId)])]
    throw new ArgumentError(`integration barrier is not satisfied for: ${ids.join(', ')}`)
  }
  const receipts=[]
  for(const event of plan.events) receipts.push(await ingest(event))
  return {inputCount:plan.inputs.length,receipts,tick:await tick()}
}
export async function bundleCommand(kwargs:any){const event=await readEvent(String(kwargs['event-file']),bundle);return {receipt:await ingest(event),tick:await tick()}}
import { canonicalJson } from './events.js'
export async function builder(kwargs:any,schema:any){const event=await readEvent(String(kwargs['event-file']),schema);return JSON.parse(canonicalJson(event))}
export async function next(kwargs:any){
  const actionId=String(kwargs['plan-next-action-id']??'')
  if(!actionId) throw new ArgumentError('next requires --plan-next-action-id')
  const packet=parseResponse(actionPacketSchema,unwrap(await runLoopctl(['packet','--action-id',actionId])),'packet')
  if(packet.kind!=='plan_next'||!['accepted','closed'].includes(packet.completedWorkItem.state)||!['ready','satisfied'].includes(packet.action.state)) throw new ArgumentError('plan_next action is stale or not current')
  const events=await readPlan(String(kwargs['plan-file']))
  const registration=events[0] as Extract<typeof events[number],{type:'work_item_registered'}>
  if(registration.payload.loopId!==packet.loopId) throw new ArgumentError('next plan loopId does not match plan_next packet')
  if(registration.payload.workItemId===packet.completedWorkItem.workItemId) throw new ArgumentError('next plan must use a new Work Item ID')
  const receipts=[];receipts.push(await ingest(events[0]));receipts.push(await ingest(events[1]));return {planNextPacket:packet,receipts,tick:await tick()}
}
export const schemas={registered,runtimeStarted,candidate,review}
