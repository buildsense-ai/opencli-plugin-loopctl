import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors'
import { actionPacketSchema, receiptSchema, statusSchema, tickSchema } from './schemas.js'
import { bundle, candidate, candidateSubmission, canonicalJson, parseAgentTaskFanout, parseAgentTaskStart, parseEvent, parseFanout, parseIntegrationPlan, parsePlan, registered, review, reviewSubmission, runtimeStarted, runtimeStartedSubmission, workerReady, workerReadySubmission, worktreeContractSchema } from './events.js'
import { readConfinedFile, runLoopctl, unwrap } from './loopctl.js'
import { attachTopicToProject, createAgentTaskTopic, createAttemptProject, createStandardTopic, resolveLoopProject, sendAttemptEvent } from './catsco.js'
import { openProvisionJournal, type ProvisionedTopicRecord } from './provisioning-journal.js'
import { prepareWorkspaceFromPacket } from './workspace.js'

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
  const loopId=events[0]?.type==='work_item_registered' ? events[0].payload.loopId : ''
  const requestedProjects=new Set(events.filter((_: unknown,index: number)=>index%2===0).map((event: any)=>String(event.payload.catscoProjectId)))
  if(requestedProjects.size!==1) throw new ArgumentError('agent-task fanout requires one shared catscoProjectId allocation')
  const projectId=await resolveLoopProject(loopId, [...requestedProjects][0])
  const provisionedTopics: Array<{ workItemId: string; attemptId: string; topic: string; groupId: string; projectId: string }> = []
  const rewritten: any[] = []
  for(let index=0; index<events.length; index+=2) {
    const registration=events[index]
    const bundleEvent=events[index + 1]
    const placeholder=/^agent-task:([1-9]\d*)$/.exec(registration.payload.workerTopicId)
    if(!placeholder) throw new ArgumentError(`agent-task fanout requires workerTopicId agent-task:<WorkerAgentUid> for ${registration.payload.workItemId}`)
    const workerAgentUid=placeholder[1]
    if(bundleEvent.payload.runtimePrincipal !== `catsco-user:${workerAgentUid}`) throw new ArgumentError(`agent-task runtime principal does not match Worker UID for ${registration.payload.workItemId}`)
    const group=await createAgentTaskTopic(`Loop ${registration.payload.loopId} ${bundleEvent.payload.attemptId}`, workerAgentUid)
    await attachTopicToProject(projectId, group.topic)
    const allocated={...registration,payload:{...registration.payload,catscoProjectId:projectId,workerTopicId:group.topic}}
    rewritten.push(allocated,bundleEvent)
    provisionedTopics.push({workItemId:registration.payload.workItemId,attemptId:bundleEvent.payload.attemptId,topic:group.topic,groupId:group.groupId,projectId})
  }
  parseFanout(JSON.stringify(rewritten))
  const receipts=[]
  for(const event of rewritten) receipts.push(await ingest(event))
  return {count:rewritten.length/2,provisionedTopics,receipts,tick:await tick()}
}
export async function agentTaskStart(kwargs:any){
  let parsed: ReturnType<typeof parseAgentTaskStart>
  let raw: string
  try {
    raw=await readConfinedFile(String(kwargs['plan-file']))
    parsed=parseAgentTaskStart(raw)
  } catch(error) { throw new ArgumentError(error instanceof Error ? error.message : 'invalid agent-task start plan') }
  const journalStore=await openProvisionJournal('agent-task-start', JSON.parse(raw))
  const asRecord=(topic: { groupId: string; topic: string; kind: 'agent_task' | 'standard'; agentIds: string; memberIds?: string }): ProvisionedTopicRecord => ({
    groupId: topic.groupId, topic: topic.topic, kind: topic.kind, agentIds: topic.agentIds,
    ...(topic.memberIds ? { memberIds: topic.memberIds } : {})
  })
  try {
    let journal=journalStore.journal()
    // A journal resumes only the same invocation after a failed provisioning step.
    // A fresh agent-task-start invocation always reaches createAttemptProject below.
    const projectId=journal.projectId ?? await createAttemptProject(parsed.registration.payload.loopId, parsed.bundle.payload.attemptId)
    if(!journal.projectId) journal=await journalStore.save({ phase: 'project_resolved', projectId })

    const coordinatorTopic=journal.coordinatorTopic ?? asRecord(await createStandardTopic(
      `Loop ${parsed.registration.payload.loopId} ${parsed.bundle.payload.attemptId} coordinator`, [parsed.reviewAgentUid]
    ))
    if(!journal.coordinatorTopic) journal=await journalStore.save({ phase: 'topics_created', coordinatorTopic,
      manualCleanupTopicIds: [...journal.manualCleanupTopicIds, coordinatorTopic.topic] })

    const workerTopic=journal.workerTopic ?? asRecord(await createAgentTaskTopic(
      `Loop ${parsed.registration.payload.loopId} ${parsed.bundle.payload.attemptId} execution`, parsed.workerAgentUid
    ))
    if(!journal.workerTopic) journal=await journalStore.save({ phase: 'topics_created', workerTopic,
      manualCleanupTopicIds: [...journal.manualCleanupTopicIds, workerTopic.topic] })

    const evidenceTopic=journal.evidenceTopic ?? asRecord(await createStandardTopic(
      `Loop ${parsed.registration.payload.loopId} ${parsed.bundle.payload.attemptId} evidence`, [parsed.workerAgentUid, parsed.reviewAgentUid]
    ))
    if(!journal.evidenceTopic) journal=await journalStore.save({ phase: 'topics_created', evidenceTopic,
      manualCleanupTopicIds: [...journal.manualCleanupTopicIds, evidenceTopic.topic] })

    const reviewTopic=journal.reviewTopic ?? asRecord(await createStandardTopic(
      `Loop ${parsed.registration.payload.loopId} ${parsed.bundle.payload.attemptId} review`, [parsed.reviewAgentUid]
    ))
    if(!journal.reviewTopic) journal=await journalStore.save({ phase: 'topics_created', reviewTopic,
      manualCleanupTopicIds: [...journal.manualCleanupTopicIds, reviewTopic.topic] })

    await attachTopicToProject(projectId, coordinatorTopic.topic)
    await attachTopicToProject(projectId, workerTopic.topic)
    await attachTopicToProject(projectId, evidenceTopic.topic)
    await attachTopicToProject(projectId, reviewTopic.topic)
    journal=await journalStore.save({ phase: 'topics_attached', projectId, coordinatorTopic, workerTopic, evidenceTopic, reviewTopic })

    const coordinatorSessionId=`session:v2:catscompany:group:${coordinatorTopic.topic}:agent:${parsed.reviewAgentUid}`
    const registrationEvent={...parsed.registration,payload:{...parsed.registration.payload,
      catscoProjectId:projectId,workerTopicId:workerTopic.topic,evidenceTopicId:evidenceTopic.topic,
      stewardTopicId:reviewTopic.topic,stewardPrincipal:`catsco-user:${parsed.reviewAgentUid}`,
      coordinatorSessionId,coordinatorSessionTopicId:coordinatorTopic.topic}}
    const routedBundle={...parsed.bundle,payload:{...parsed.bundle.payload,attemptRoute:{
      catscoProjectId:projectId,workerTopicId:workerTopic.topic,evidenceTopicId:evidenceTopic.topic,
      stewardTopicId:reviewTopic.topic,stewardPrincipal:`catsco-user:${parsed.reviewAgentUid}`,
      workerSessionId:`session:v2:catscompany:group:${workerTopic.topic}:agent:${parsed.workerAgentUid}`,
      coordinatorSessionId,coordinatorSessionTopicId:coordinatorTopic.topic
    }}}
    const events=[registrationEvent,routedBundle]
    parsePlan(JSON.stringify(events))

    const registrationReceipt=journal.registrationReceipt ?? await ingest(registrationEvent)
    if(!journal.registrationReceipt) journal=await journalStore.save({ phase: 'registration_ingested', registrationReceipt })
    const bundleReceipt=journal.bundleReceipt ?? await ingest(routedBundle)
    if(!journal.bundleReceipt) journal=await journalStore.save({ phase: 'bundle_ingested', bundleReceipt })
    const tickReceipt=journal.tick ?? await tick()
    journal=await journalStore.save({ phase: 'completed', tick: tickReceipt })
    return { count: 1, projectId, provisionedTopics: { coordinatorTopic, workerTopic, evidenceTopic, reviewTopic }, receipts: [registrationReceipt,bundleReceipt], tick: tickReceipt, journalPath: journalStore.path }
  } catch(error) {
    const journal=journalStore.journal()
    await journalStore.save({ phase: 'failed', error: String(error instanceof Error ? error.message : error).slice(0, 1000),
      manualCleanupTopicIds: journal.manualCleanupTopicIds })
    throw error
  } finally { await journalStore.release() }
}
function bundleInstructions(value: unknown, label: string) {
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof (value as { instructions?: unknown }).instructions!=='string') {
    throw new ArgumentError(`${label} does not contain work bundle instructions`)
  }
  return (value as { instructions: string }).instructions
}

function worktreeContract(instructions: string, label: string) {
  const marker='LOOP_WORKTREE_CONTRACT_V1='
  const lines=instructions.split('\n').filter(line=>line.startsWith(marker))
  if(lines.length!==1) throw new ArgumentError(`${label} requires exactly one LOOP_WORKTREE_CONTRACT_V1 line`)
  try { return worktreeContractSchema.parse(JSON.parse(lines[0].slice(marker.length))) }
  catch { throw new ArgumentError(`${label} worktree contract is invalid`) }
}

export async function agentTaskRetry(kwargs:any){
  let recoveryPacket: Extract<ReturnType<typeof actionPacketSchema.parse>,{kind:'recover_attempt'}>
  let retry: ReturnType<typeof bundle.parse>
  try {
    recoveryPacket=actionPacketSchema.parse(JSON.parse(await readConfinedFile(String(kwargs['packet-file'])))) as Extract<ReturnType<typeof actionPacketSchema.parse>,{kind:'recover_attempt'}>
    if(recoveryPacket.kind!=='recover_attempt'||!['ready','satisfied'].includes(recoveryPacket.action.state)) throw new Error('recovery packet is stale or not actionable')
    retry=bundle.parse(JSON.parse(await readConfinedFile(String(kwargs['event-file']))))
  } catch(error) { throw new ArgumentError(error instanceof Error ? error.message : 'invalid recovery packet or bundle') }
  const p=retry.payload
  if(p.workItemId!==recoveryPacket.workItemId||p.expectedRevision!==recoveryPacket.workItemRevision) throw new ArgumentError('recovery bundle does not bind the current Work Item revision')
  if(p.generation!==recoveryPacket.previousAttempt.generation+1||p.attemptNumber!==recoveryPacket.previousAttempt.attemptNumber+1) throw new ArgumentError('recovery bundle must use exactly the next generation and attempt number')
  if(p.runtimePrincipal!==recoveryPacket.previousAttempt.runtimePrincipal) throw new ArgumentError('recovery bundle runtime principal does not match the fenced predecessor')
  for(const key of ['taskContractHash','referenceSnapshotHash','writeScopeHash','acceptanceContractHash'] as const) if(p[key]!==recoveryPacket.contracts[key]) throw new ArgumentError(`recovery bundle contract mismatch: ${key}`)
  const worker=/^catsco-user:([1-9]\d*)$/.exec(p.runtimePrincipal)
  const reviewer=/^catsco-user:([1-9]\d*)$/.exec(recoveryPacket.stewardPrincipal)
  if(!worker||!reviewer||!/^\d+$/.test(recoveryPacket.catscoProjectId)) throw new ArgumentError('recovery packet does not contain numeric CatsCo principals and Project')
  const previousWorktree=worktreeContract(bundleInstructions(recoveryPacket.previousAttempt.workBundle,'recovery packet'),'recovery packet')
  const nextWorktree=worktreeContract(bundleInstructions(p.workBundle,'recovery bundle'),'recovery bundle')
  if(!nextWorktree.gitDir) throw new ArgumentError('recovery bundle worktree contract requires gitDir for workspace-prepare')
  if(previousWorktree.branchName===nextWorktree.branchName||previousWorktree.worktreePath===nextWorktree.worktreePath||previousWorktree.workspaceLease===nextWorktree.workspaceLease) {
    throw new ArgumentError('recovery bundle must use a fresh branch, worktree path, and workspace lease')
  }

  // Re-read the Controller projection before provisioning anything. A stale
  // recovery packet must never create fresh CatsCo resources.
  const current=await packet({ 'action-id': recoveryPacket.actionId })
  if(current.kind!=='recover_attempt'||current.packetDigest!==recoveryPacket.packetDigest||!['ready','satisfied'].includes(current.action.state)) {
    throw new ArgumentError('recover_attempt packet is stale; no resources were provisioned')
  }
  const journalStore=await openProvisionJournal('agent-task-retry',{packet:recoveryPacket,retry})
  const asRecord=(topic: { groupId: string; topic: string; kind: 'agent_task' | 'standard'; agentIds: string; memberIds?: string }): ProvisionedTopicRecord => ({
    groupId: topic.groupId, topic: topic.topic, kind: topic.kind, agentIds: topic.agentIds,
    ...(topic.memberIds ? { memberIds: topic.memberIds } : {})
  })
  try {
    let journal=journalStore.journal()
    const projectId=journal.projectId ?? recoveryPacket.catscoProjectId
    if(!journal.projectId) journal=await journalStore.save({phase:'project_resolved',projectId})
    const workerTopic=journal.workerTopic ?? asRecord(await createAgentTaskTopic(`Loop ${recoveryPacket.loopId} ${p.attemptId} execution`,worker[1]))
    if(!journal.workerTopic) journal=await journalStore.save({phase:'topics_created',workerTopic,manualCleanupTopicIds:[...journal.manualCleanupTopicIds,workerTopic.topic]})
    const evidenceTopic=journal.evidenceTopic ?? asRecord(await createStandardTopic(`Loop ${recoveryPacket.loopId} ${p.attemptId} evidence`,[worker[1],reviewer[1]]))
    if(!journal.evidenceTopic) journal=await journalStore.save({phase:'topics_created',evidenceTopic,manualCleanupTopicIds:[...journal.manualCleanupTopicIds,evidenceTopic.topic]})
    const reviewTopic=journal.reviewTopic ?? asRecord(await createStandardTopic(`Loop ${recoveryPacket.loopId} ${p.attemptId} review`,[reviewer[1]]))
    if(!journal.reviewTopic) journal=await journalStore.save({phase:'topics_created',reviewTopic,manualCleanupTopicIds:[...journal.manualCleanupTopicIds,reviewTopic.topic]})
    await attachTopicToProject(projectId,workerTopic.topic)
    await attachTopicToProject(projectId,evidenceTopic.topic)
    await attachTopicToProject(projectId,reviewTopic.topic)
    journal=await journalStore.save({phase:'topics_attached',projectId,workerTopic,evidenceTopic,reviewTopic})
    const coordinatorSessionId=String(recoveryPacket.coordinatorSessionId ?? '')
    const coordinatorSessionTopicId=String(recoveryPacket.coordinatorSessionTopicId ?? '')
    if(!coordinatorSessionId||!coordinatorSessionTopicId) throw new ArgumentError('recover_attempt lacks the originating coordinator session route')
    const rewritten={...retry,payload:{...p,attemptRoute:{catscoProjectId:projectId,workerTopicId:workerTopic.topic,evidenceTopicId:evidenceTopic.topic,stewardTopicId:reviewTopic.topic,stewardPrincipal:recoveryPacket.stewardPrincipal,workerSessionId:`session:v2:catscompany:group:${workerTopic.topic}:agent:${worker[1]}`,coordinatorSessionId,coordinatorSessionTopicId}}}
    const bundleReceipt=journal.bundleReceipt ?? await ingest(rewritten)
    if(!journal.bundleReceipt) journal=await journalStore.save({phase:'bundle_ingested',bundleReceipt})
    const tickReceipt=journal.tick ?? await tick()
    await journalStore.save({phase:'completed',tick:tickReceipt})
    return {projectId,provisionedTopics:{workerTopic,evidenceTopic,reviewTopic},receipt:bundleReceipt,tick:tickReceipt,journalPath:journalStore.path}
  } catch(error) {
    const journal=journalStore.journal()
    await journalStore.save({phase:'failed',error:String(error instanceof Error?error.message:error).slice(0,1000),manualCleanupTopicIds:journal.manualCleanupTopicIds})
    throw error
  } finally { await journalStore.release() }
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
export async function workspacePrepare(kwargs:any){
  let packet: unknown
  try { packet=JSON.parse(await readConfinedFile(String(kwargs['packet-file']))) }
  catch(error) { throw new ArgumentError(error instanceof Error ? error.message : 'invalid execute packet file') }
  return prepareWorkspaceFromPacket(packet)
}
export async function bundleCommand(kwargs:any){const event=await readEvent(String(kwargs['event-file']),bundle);return {receipt:await ingest(event),tick:await tick()}}
export async function builder(kwargs:any,schema:any){const event=await readEvent(String(kwargs['event-file']),schema);return JSON.parse(canonicalJson(event))}
async function submitAttestedEvent(
  file: string,
  schema: { parse(value: unknown): { targetTopicId: string; event: { idempotencyKey: string } } },
  label: string
) {
  let submission: { targetTopicId: string; event: { idempotencyKey: string } }
  try { submission=schema.parse(JSON.parse(await readConfinedFile(file))) }
  catch(error) { throw new ArgumentError(error instanceof Error ? error.message : `invalid ${label} submission file`) }
  const content=canonicalJson(submission.event)
  const event=JSON.parse(content) as { source: string }
  const receipt=await sendAttemptEvent(submission.targetTopicId, content, submission.event.idempotencyKey, event.source)
  return {targetTopicId:submission.targetTopicId,event:JSON.parse(content),receipt}
}
export async function readinessSubmit(kwargs:any){
  return submitAttestedEvent(String(kwargs['event-file']),workerReadySubmission,'worker_ready')
}
export async function runtimeStartSubmit(kwargs:any){
  return submitAttestedEvent(String(kwargs['event-file']),runtimeStartedSubmission,'runtime_started')
}
export async function candidateSubmit(kwargs:any){
  return submitAttestedEvent(String(kwargs['event-file']),candidateSubmission,'Candidate')
}
export async function reviewSubmit(kwargs:any){
  return submitAttestedEvent(String(kwargs['event-file']),reviewSubmission,'Review')
}
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
export const schemas={registered,workerReady,runtimeStarted,candidate,review}
