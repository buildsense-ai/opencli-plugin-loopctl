import { z } from 'zod'

const id=z.string().min(1), hash=z.string().min(8)
const base={eventId:id,idempotencyKey:id,source:id,entityRef:id}
const contracts={taskContractHash:hash,referenceSnapshotHash:hash,writeScopeHash:hash,acceptanceContractHash:hash}
const deliverable=z.object({kind:z.literal('github_pr'),repository:id,prNumber:z.number().int().positive(),headSha:id,baseSha:id,digest:hash}).strict()
export const registered=z.object({...base,type:z.literal('work_item_registered'),payload:z.object({workItemId:id,loopId:id,profileId:id,terminalState:z.enum(['accepted','closed']),...contracts,writeScope:z.array(id),githubRepo:id,catscoProjectId:id,workerTopicId:id,stewardTopicId:id,stewardPrincipal:id.optional()}).strict()}).strict()
const bundlePayload=z.object({workItemId:id,expectedRevision:z.number().int().positive(),attemptId:id,attemptNumber:z.number().int().positive(),generation:z.number().int().nonnegative(),runtimePrincipal:id,proofMode:z.enum(['ed25519','catsco-message']).optional(),proofKeyId:id.optional(),proofPublicKey:id.optional(),leaseExpiresAt:z.string().datetime(),workBundle:z.object({contractDigest:hash,instructions:id,deliverables:z.array(id)}).strict(),...contracts}).strict()
export const bundle=z.object({...base,type:z.literal('work_bundle_proposed'),payload:bundlePayload}).strict()
export const runtimeStarted=z.object({...base,type:z.literal('runtime_started'),payload:z.object({workItemId:id,expectedRevision:z.number().int().positive(),attemptId:id,generation:z.number().int().nonnegative(),runtimePrincipal:id,signature:z.literal('catsco-message-attested')}).strict()}).strict()
export const candidate=z.object({...base,type:z.literal('candidate_submitted'),payload:z.object({ownerUid:id,workItemId:id,workItemRevision:z.number().int().positive(),attemptId:id,generation:z.number().int().nonnegative(),runtimePrincipal:id,candidateId:id,deliverable,...contracts,proofMode:z.enum(['ed25519','catsco-message']).optional(),signature:id.optional()}).strict()}).strict()
export const review=z.object({...base,type:z.literal('review_decided'),payload:z.object({workItemId:id,expectedRevision:z.number().int().positive(),candidateId:id,outcome:z.enum(['accepted','changes_requested']),reviewerPrincipal:id,authenticationRef:id.optional(),reviewerProof:id.optional(),reviewedHeadSha:id,reviewedDeliverableDigest:hash,acceptanceContractHash:hash}).strict()}).strict()
export const planEvent=z.union([registered,bundle])
export type LoopEvent= z.infer<typeof registered>|z.infer<typeof bundle>|z.infer<typeof runtimeStarted>|z.infer<typeof candidate>|z.infer<typeof review>
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value
export function canonicalJson(value:unknown):string{return JSON.stringify(canonical(value))}
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
  if(!r.workerTopicId||!r.stewardTopicId) throw new Error('plan requires worker and steward topics')
  const sharedTopic=r.workerTopicId===r.stewardTopicId
  if(sharedTopic&&!r.workerTopicId.startsWith('grp_')) throw new Error('shared topic must be a CatsCo group topic')
  const numericCatscoPrincipal=/^catsco-user:[1-9]\d*$/
  if(sharedTopic&&(!r.stewardPrincipal||!numericCatscoPrincipal.test(r.stewardPrincipal)||!numericCatscoPrincipal.test(b.runtimePrincipal))) throw new Error('shared group requires numeric CatsCo principals for Steward and Worker')
  if(r.stewardPrincipal!==undefined&&!r.stewardPrincipal.startsWith('catsco-user:')) throw new Error('plan stewardPrincipal must be a CatsCo principal')
  if((b.proofMode??'ed25519')==='catsco-message'&&!b.runtimePrincipal.startsWith('catsco-user:')) throw new Error('CatsCo-message bundle requires a CatsCo runtime principal')
  if(b.proofMode==='ed25519'&&(!b.proofKeyId||!b.proofPublicKey)) throw new Error('Ed25519 bundle requires proof key fields')
  return parsed
}
export function parseEvent(raw:string,expected:z.ZodType<unknown>):unknown{return expected.parse(JSON.parse(raw))}
