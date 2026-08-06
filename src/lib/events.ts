import { posix } from 'node:path'
import { z } from 'zod'

const id=z.string().min(1), hash=z.string().min(8)
const base={eventId:id,idempotencyKey:id,source:id,entityRef:id}
const contracts={taskContractHash:hash,referenceSnapshotHash:hash,writeScopeHash:hash,acceptanceContractHash:hash}
const deliverable=z.object({kind:z.literal('github_pr'),repository:id,prNumber:z.number().int().positive(),headSha:id,baseSha:id,digest:hash}).strict()
export const registered=z.object({...base,type:z.literal('work_item_registered'),payload:z.object({workItemId:id,loopId:id,profileId:id,terminalState:z.enum(['accepted','closed']),...contracts,writeScope:z.array(id),githubRepo:id,catscoProjectId:id,workerTopicId:id,stewardTopicId:id,stewardPrincipal:id.optional()}).strict()}).strict()
const worktreeContract=z.object({repository:id,baseRevision:id,branchName:id,worktreePath:id,cleanupPolicy:z.enum(['retain-until-review','retain-until-integration','remove-after-candidate']),workspaceLease:id}).strict()
export const worktreeContractSchema=worktreeContract
const bundlePayload=z.object({workItemId:id,expectedRevision:z.number().int().positive(),attemptId:id,attemptNumber:z.number().int().positive(),generation:z.number().int().nonnegative(),runtimePrincipal:id,proofMode:z.enum(['ed25519','catsco-message']).optional(),proofKeyId:id.optional(),proofPublicKey:id.optional(),leaseExpiresAt:z.string().datetime(),workBundle:z.object({contractDigest:hash,instructions:id,deliverables:z.array(id)}).strict(),...contracts}).strict()
export const bundle=z.object({...base,type:z.literal('work_bundle_proposed'),payload:bundlePayload}).strict()
export const runtimeStarted=z.object({...base,type:z.literal('runtime_started'),payload:z.object({workItemId:id,expectedRevision:z.number().int().positive(),attemptId:id,generation:z.number().int().nonnegative(),runtimePrincipal:id,signature:z.literal('catsco-message-attested')}).strict()}).strict()
export const candidate=z.object({...base,type:z.literal('candidate_submitted'),payload:z.object({ownerUid:id,workItemId:id,workItemRevision:z.number().int().positive(),attemptId:id,generation:z.number().int().nonnegative(),runtimePrincipal:id,candidateId:id,deliverable,...contracts,proofMode:z.enum(['ed25519','catsco-message']).optional(),signature:id.optional()}).strict()}).strict()
export const review=z.object({...base,type:z.literal('review_decided'),payload:z.object({workItemId:id,expectedRevision:z.number().int().positive(),candidateId:id,outcome:z.enum(['accepted','changes_requested']),reviewerPrincipal:id,authenticationRef:id.optional(),reviewerProof:id.optional(),reviewedHeadSha:id,reviewedDeliverableDigest:hash,acceptanceContractHash:hash}).strict()}).strict()
export const planEvent=z.union([registered,bundle])
export type LoopEvent= z.infer<typeof registered>|z.infer<typeof bundle>|z.infer<typeof runtimeStarted>|z.infer<typeof candidate>|z.infer<typeof review>
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value
export function canonicalJson(value:unknown):string{return JSON.stringify(canonical(value))}
const integrationInputs=z.object({workItemId:id,candidateId:id,repository:id,prNumber:z.number().int().positive(),headSha:id,digest:hash}).strict()
export const integrationInputsSchema=integrationInputs
export function parseIntegrationPlan(raw:string){
  const parsed=parsePlan(raw)
  const registration=parsed[0], bundleEvent=parsed[1]
  if(registration.type!=='work_item_registered'||bundleEvent.type!=='work_bundle_proposed') throw new Error('integration plan must contain registration followed by bundle')
  const inputLines=bundleEvent.payload.workBundle.instructions.split('\n').filter((value:string)=>value.startsWith('LOOP_INTEGRATION_INPUTS_V1='))
  if(inputLines.length!==1) throw new Error('integration plan requires exactly one LOOP_INTEGRATION_INPUTS_V1 line')
  const inputsLine=inputLines[0]
  let inputs: unknown
  try { inputs=JSON.parse(inputsLine.slice('LOOP_INTEGRATION_INPUTS_V1='.length)) } catch { throw new Error('integration inputs are not valid JSON') }
  if(!Array.isArray(inputs)||inputs.length===0) throw new Error('integration plan requires at least one input Candidate')
  const valid=inputs.map(value=>integrationInputs.parse(value))
  if(valid.some(value=>value.repository!==registration.payload.githubRepo)) throw new Error('integration input repository mismatch')
  if(valid.some(value=>value.digest.length<8||value.headSha.length<1)) throw new Error('integration input digest or head SHA is invalid')
  if(new Set(valid.map(value=>value.workItemId)).size!==valid.length) throw new Error('integration inputs must have unique Work Item IDs')
  const marker='LOOP_WORKTREE_CONTRACT_V1='
  const worktreeLines=bundleEvent.payload.workBundle.instructions.split('\n').filter(value=>value.startsWith(marker))
  if(worktreeLines.length!==1) throw new Error('integration plan requires exactly one LOOP_WORKTREE_CONTRACT_V1 line')
  let worktree: z.infer<typeof worktreeContract>
  try { worktree=worktreeContract.parse(JSON.parse(worktreeLines[0].slice(marker.length))) } catch { throw new Error('integration worktree contract is invalid') }
  if(!posix.isAbsolute(worktree.worktreePath)||posix.normalize(worktree.worktreePath)!==worktree.worktreePath) throw new Error('integration worktreePath must be normalized and absolute')
  if(worktree.repository!==registration.payload.githubRepo||!worktree.branchName.startsWith(`loop/${registration.payload.loopId}/`)) throw new Error('integration worktree contract does not match plan')
  return {events:parsed,inputs:valid,worktree}
}
export function parseFanout(raw:string){
  let value: unknown
  try { value=JSON.parse(raw) } catch { throw new Error('fanout file is not valid JSON') }
  if(!Array.isArray(value)||value.length<4||value.length%2!==0) throw new Error('fanout file must contain at least two registration/bundle pairs')
  const parsed=value.map(item=>planEvent.parse(item))
  const loopIds=new Set(parsed.filter(e=>e.type==='work_item_registered').map(e=>e.payload.loopId))
  if(loopIds.size!==1) throw new Error('fanout plans must share one loopId')
  const workItems=new Set<string>(), attempts=new Set<string>(), branches=new Set<string>(), paths=new Set<string>(), leases=new Set<string>(), workerTopics=new Set<string>(), eventIds=new Set<string>(), idempotencyKeys=new Set<string>()
  for(let i=0;i<parsed.length;i+=2){
    const r=parsed[i], b=parsed[i+1]
    if(r.type!=='work_item_registered'||b.type!=='work_bundle_proposed') throw new Error('fanout must contain registration/bundle pairs')
    for(const event of [r,b]) {
      if(eventIds.has(event.eventId)||idempotencyKeys.has(event.idempotencyKey)) throw new Error('fanout event IDs and idempotency keys must be unique')
      eventIds.add(event.eventId); idempotencyKeys.add(event.idempotencyKey)
    }
    if(r.payload.workItemId!==b.payload.workItemId||b.payload.expectedRevision!==1) throw new Error('fanout pair identity or revision mismatch')
    if(workItems.has(r.payload.workItemId)||attempts.has(b.payload.attemptId)) throw new Error('fanout IDs must be unique')
    const marker='LOOP_WORKTREE_CONTRACT_V1='
    const lines=b.payload.workBundle.instructions.split('\n').filter(value=>value.startsWith(marker))
    if(lines.length!==1) throw new Error('fanout bundle requires exactly one LOOP_WORKTREE_CONTRACT_V1 line')
    let wt: z.infer<typeof worktreeContract>
    try { wt=worktreeContract.parse(JSON.parse(lines[0].slice(marker.length))) } catch { throw new Error('fanout worktree contract is invalid') }
    if(!posix.isAbsolute(wt.worktreePath)||posix.normalize(wt.worktreePath)!==wt.worktreePath) throw new Error('fanout worktreePath must be normalized and absolute')
    const normalizedPath=wt.worktreePath
    if(wt.repository!==r.payload.githubRepo) throw new Error('worktree repository must match githubRepo')
    if(!wt.branchName.startsWith(`loop/${r.payload.loopId}/`)) throw new Error('worktree branch must be scoped to loopId')
    if(branches.has(wt.branchName)||paths.has(normalizedPath)||leases.has(wt.workspaceLease)||workerTopics.has(r.payload.workerTopicId)) throw new Error('fanout worker topics, worktrees, and workspace leases must be unique')
    workItems.add(r.payload.workItemId); attempts.add(b.payload.attemptId); branches.add(wt.branchName); paths.add(normalizedPath); leases.add(wt.workspaceLease); workerTopics.add(r.payload.workerTopicId)
    parsePlan(JSON.stringify([r,b]))
  }
  return parsed
}
export function parsePlan(raw:string){
  let value: unknown
  try { value=JSON.parse(raw) } catch { throw new Error('plan file is not valid JSON') }
  if(!Array.isArray(value)||value.length!==2) throw new Error('plan file must be an array of exactly two events')
  const parsed=value.map(item=>planEvent.parse(item))
  const registration=parsed[0], proposed=parsed[1]
  if(registration.type!=='work_item_registered'||proposed.type!=='work_bundle_proposed') throw new Error('plan must contain work_item_registered followed by work_bundle_proposed')
  const r=registration.payload, b=proposed.payload
  if(r.workItemId!==b.workItemId) throw new Error('plan Work Item IDs must match')
  if(b.expectedRevision!==1) throw new Error('new plan bundle expectedRevision must be 1')
  for(const key of ['taskContractHash','referenceSnapshotHash','writeScopeHash','acceptanceContractHash'] as const) if(r[key]!==b[key]) throw new Error(`plan contract mismatch: ${key}`)
  if(!r.workerTopicId||!r.stewardTopicId||r.workerTopicId===r.stewardTopicId) throw new Error('plan requires distinct worker and steward topics')
  const numericCatscoPrincipal=/^catsco-user:[1-9]\d*$/
  if(r.stewardTopicId.startsWith('grp_')&&(!r.stewardPrincipal||!numericCatscoPrincipal.test(r.stewardPrincipal))) throw new Error('group Steward topic requires a numeric CatsCo principal')
  if(r.stewardPrincipal!==undefined&&!r.stewardPrincipal.startsWith('catsco-user:')) throw new Error('plan stewardPrincipal must be a CatsCo principal')
  if((b.proofMode??'ed25519')==='catsco-message'&&!b.runtimePrincipal.startsWith('catsco-user:')) throw new Error('CatsCo-message bundle requires a CatsCo runtime principal')
  if(b.proofMode==='ed25519'&&(!b.proofKeyId||!b.proofPublicKey)) throw new Error('Ed25519 bundle requires proof key fields')
  return parsed
}
export function parseEvent(raw:string,expected:z.ZodType<unknown>):unknown{return expected.parse(JSON.parse(raw))}
