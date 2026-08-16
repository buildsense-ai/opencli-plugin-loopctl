import { z } from 'zod'

const id = z.string().min(1)
const hash = z.string().min(8)

export const receiptSchema = z.object({
  eventId: id,
  idempotencyKey: id,
  status: z.enum(['pending', 'committed', 'rejected']),
  ingressSequence: z.number().int().positive(),
  ledgerRevision: z.number().int().nonnegative().optional(),
  rejectionCode: id.optional(),
  conflictId: id.optional()
}).passthrough()

export const tickSchema = z.object({
  processed: z.number().int().nonnegative(),
  receipts: z.array(receiptSchema),
  effects: z.object({
    satisfied: z.number().int().nonnegative(),
    retried: z.number().int().nonnegative(),
    obsolete: z.number().int().nonnegative(),
    ownerMismatch: z.boolean()
  }).strict()
}).strict()

const row = z.object({ workItemId: id, revision: z.number().int().positive(), state: id, loopId: id, profileId: id }).passthrough()
const statusCandidate = z.object({ candidateId: id, workItemId: id, workItemRevision: z.number().int().positive(), repository: id, prNumber: z.number().int().positive(), headSha: id, digest: hash }).strict()
const action = z.object({ actionId: id, actionKey: id, kind: z.enum(['preflight_attempt', 'execute_attempt', 'recover_attempt', 'review_candidate', 'plan_next']), state: id, workItemId: id, workItemRevision: z.number().int().positive() }).passthrough()
export const statusSchema = z.object({
  ownerUid: id, ledgerRevision: z.number().int().nonnegative(), inbox: z.array(z.unknown()), ingressConflicts: z.unknown(),
  outbox: z.array(z.unknown()), workItems: z.array(row), attempts: z.array(z.unknown()), candidates: z.array(statusCandidate), actions: z.array(action)
}).passthrough()

const packetBase = {
  kind: z.enum(['preflight_attempt', 'execute_attempt', 'recover_attempt', 'review_candidate', 'plan_next']), schema: z.literal('loopctl-action-packet-v1'),
  actionId: id, actionKey: id, workItemId: id, workItemRevision: z.number().int().positive(),
  targetPrincipal: id, targetTopicId: id, targetDigest: hash, packetDigest: hash,
  action: z.object({ id, key: id, kind: z.string(), state: id, workItemRevision: z.number().int().positive(), targetPrincipal: id, targetTopicId: id, targetDigest: hash }).strict(),
  contracts: z.object({ taskContractHash: hash, referenceSnapshotHash: hash, writeScopeHash: hash, acceptanceContractHash: hash }).strict()
}
const attemptPacket = z.object({ ...packetBase, kind: z.enum(['preflight_attempt', 'execute_attempt']), loopId: id, profileId: id, workerTopicId: id, evidenceTopicId: id.optional(), githubRepo: id, writeScope: z.array(id), attemptId: id, attemptNumber: z.number().int().positive(), generation: z.number().int().nonnegative(), runtimePrincipal: id, leaseExpiresAt: z.string().datetime(), proofMode: z.enum(['ed25519', 'catsco-message']), workBundle: z.record(z.string(), z.unknown()) }).passthrough()
const recoveryPacket = z.object({ ...packetBase, kind: z.literal('recover_attempt'), loopId: id, profileId: id, githubRepo: id, catscoProjectId: id, workerTopicId: id, evidenceTopicId: id.optional(), stewardPrincipal: id, stewardTopicId: id, previousAttempt: z.object({ attemptId: id, attemptNumber: z.number().int().positive(), generation: z.number().int().nonnegative(), controlState: id, reportedState: id, leaseExpiresAt: z.string().datetime(), runtimePrincipal: id, workBundle: z.record(z.string(), z.unknown()) }).strict(), recovery: z.object({ requireFreshWorkerTopic: z.literal(true), requireFreshEvidenceTopic: z.literal(true), requireFreshStewardTopic: z.literal(true), requireFreshWorktree: z.literal(true), requireFreshWorkspaceLease: z.literal(true) }).strict() }).passthrough()
const reviewPacket = z.object({ ...packetBase, kind: z.literal('review_candidate'), loopId: id, profileId: id, githubRepo: id, stewardPrincipal: id, stewardTopicId: id, evidenceTopicId: id.optional(), acceptanceContractHash: hash, candidate: z.object({ candidateId: id, attemptId: id, generation: z.number().int().nonnegative(), deliverable: z.record(z.string(), z.unknown()), digest: hash, trustedEvidence: z.record(z.string(), z.unknown()) }).nullable() }).passthrough()
const nextPacket = z.object({ ...packetBase, kind: z.literal('plan_next'), loopId: id, profileId: id, terminalState: z.enum(['accepted', 'closed']), completedWorkItem: z.object({ workItemId: id, revision: z.number().int().positive(), state: z.enum(['accepted', 'closed']) }).strict(), currentCandidate: z.record(z.string(), z.unknown()).nullable(), outcomeContext: z.record(z.string(), z.unknown()) }).passthrough()
export const actionPacketSchema = z.discriminatedUnion('kind', [attemptPacket, recoveryPacket, reviewPacket, nextPacket])

/** Exact Controller projection accepted by the Worker-only preflight receipt helper. */
export const workerPreflightPacketSchema = z.object({
  kind: z.literal('preflight_attempt'), schema: z.literal('loopctl-action-packet-v1'),
  actionId: id, actionKey: id,
  action: z.object({ id, key: id, kind: z.literal('preflight_attempt'), state: z.literal('ready'), workItemRevision: z.number().int().positive(), targetPrincipal: id, targetTopicId: id, targetDigest: hash }).strict(),
  workItemId: id, workItemRevision: z.number().int().positive(),
  targetPrincipal: id, targetTopicId: id, targetDigest: hash, packetDigest: hash,
  contracts: z.object({ taskContractHash: hash, referenceSnapshotHash: hash, writeScopeHash: hash, acceptanceContractHash: hash }).strict(),
  ownerUid: id, loopId: id, profileId: id, catscoProjectId: id, workerTopicId: id, evidenceTopicId: id, workerSessionId: id,
  githubRepo: id, writeScope: z.array(id), attemptId: id, attemptNumber: z.number().int().positive(), generation: z.number().int().nonnegative(),
  runtimePrincipal: id, leaseExpiresAt: z.string().datetime(), proofMode: z.literal('catsco-message'),
  proofKeyId: id.optional(), proofPublicKey: id.optional(),
  controllerSignatureAlgorithm: z.literal('ed25519'), controllerKeyId: id, controllerPublicKey: z.string().min(1), controllerSignature: z.string().min(1),
  workBundle: z.object({ contractDigest: hash, instructions: id, deliverables: z.array(id) }).strict()
}).strict()
export type ActionPacket = z.infer<typeof actionPacketSchema>
export type WorkerPreflightPacket = z.infer<typeof workerPreflightPacketSchema>
