// loop-preflight-ready.ts
import { cli, Strategy } from "@jackwener/opencli/registry";

// src/lib/commands.ts
import { createHash as createHash2 } from "node:crypto";
import { ArgumentError as ArgumentError2, CommandExecutionError as CommandExecutionError4 } from "@jackwener/opencli/errors";

// src/lib/schemas.ts
import { z } from "zod";
var id = z.string().min(1);
var hash = z.string().min(8);
var receiptSchema = z.object({
  eventId: id,
  idempotencyKey: id,
  status: z.enum(["pending", "committed", "rejected"]),
  ingressSequence: z.number().int().positive(),
  ledgerRevision: z.number().int().nonnegative().optional(),
  rejectionCode: id.optional(),
  conflictId: id.optional()
}).passthrough();
var tickSchema = z.object({
  processed: z.number().int().nonnegative(),
  receipts: z.array(receiptSchema),
  effects: z.object({
    satisfied: z.number().int().nonnegative(),
    retried: z.number().int().nonnegative(),
    obsolete: z.number().int().nonnegative(),
    ownerMismatch: z.boolean()
  }).strict()
}).strict();
var row = z.object({ workItemId: id, revision: z.number().int().positive(), state: id, loopId: id, profileId: id }).passthrough();
var statusCandidate = z.object({ candidateId: id, workItemId: id, workItemRevision: z.number().int().positive(), repository: id, prNumber: z.number().int().positive(), headSha: id, digest: hash }).strict();
var action = z.object({ actionId: id, actionKey: id, kind: z.enum(["preflight_attempt", "execute_attempt", "recover_attempt", "review_candidate", "plan_next"]), state: id, workItemId: id, workItemRevision: z.number().int().positive() }).passthrough();
var statusSchema = z.object({
  ownerUid: id,
  ledgerRevision: z.number().int().nonnegative(),
  inbox: z.array(z.unknown()),
  ingressConflicts: z.unknown(),
  outbox: z.array(z.unknown()),
  workItems: z.array(row),
  attempts: z.array(z.unknown()),
  candidates: z.array(statusCandidate),
  actions: z.array(action)
}).passthrough();
var packetBase = {
  kind: z.enum(["preflight_attempt", "execute_attempt", "recover_attempt", "review_candidate", "plan_next"]),
  schema: z.literal("loopctl-action-packet-v1"),
  actionId: id,
  actionKey: id,
  workItemId: id,
  workItemRevision: z.number().int().positive(),
  targetPrincipal: id,
  targetTopicId: id,
  targetDigest: hash,
  packetDigest: hash,
  action: z.object({ id, key: id, kind: z.string(), state: id, workItemRevision: z.number().int().positive(), targetPrincipal: id, targetTopicId: id, targetDigest: hash }).strict(),
  contracts: z.object({ taskContractHash: hash, referenceSnapshotHash: hash, writeScopeHash: hash, acceptanceContractHash: hash }).strict()
};
var attemptPacket = z.object({ ...packetBase, kind: z.enum(["preflight_attempt", "execute_attempt"]), loopId: id, profileId: id, workerTopicId: id, evidenceTopicId: id.optional(), githubRepo: id, writeScope: z.array(id), attemptId: id, attemptNumber: z.number().int().positive(), generation: z.number().int().nonnegative(), runtimePrincipal: id, leaseExpiresAt: z.string().datetime(), proofMode: z.enum(["ed25519", "catsco-message"]), workBundle: z.record(z.string(), z.unknown()) }).passthrough();
var recoveryPacket = z.object({ ...packetBase, kind: z.literal("recover_attempt"), loopId: id, profileId: id, githubRepo: id, catscoProjectId: id, workerTopicId: id, evidenceTopicId: id.optional(), stewardPrincipal: id, stewardTopicId: id, previousAttempt: z.object({ attemptId: id, attemptNumber: z.number().int().positive(), generation: z.number().int().nonnegative(), controlState: id, reportedState: id, leaseExpiresAt: z.string().datetime(), runtimePrincipal: id, workBundle: z.record(z.string(), z.unknown()) }).strict(), recovery: z.object({ requireFreshWorkerTopic: z.literal(true), requireFreshEvidenceTopic: z.literal(true), requireFreshStewardTopic: z.literal(true), requireFreshWorktree: z.literal(true), requireFreshWorkspaceLease: z.literal(true) }).strict() }).passthrough();
var reviewPacket = z.object({ ...packetBase, kind: z.literal("review_candidate"), loopId: id, profileId: id, githubRepo: id, stewardPrincipal: id, stewardTopicId: id, evidenceTopicId: id.optional(), acceptanceContractHash: hash, candidate: z.object({ candidateId: id, attemptId: id, generation: z.number().int().nonnegative(), deliverable: z.record(z.string(), z.unknown()), digest: hash, trustedEvidence: z.record(z.string(), z.unknown()) }).nullable() }).passthrough();
var nextPacket = z.object({ ...packetBase, kind: z.literal("plan_next"), loopId: id, profileId: id, terminalState: z.enum(["accepted", "closed"]), completedWorkItem: z.object({ workItemId: id, revision: z.number().int().positive(), state: z.enum(["accepted", "closed"]) }).strict(), currentCandidate: z.record(z.string(), z.unknown()).nullable(), outcomeContext: z.record(z.string(), z.unknown()) }).passthrough();
var actionPacketSchema = z.discriminatedUnion("kind", [attemptPacket, recoveryPacket, reviewPacket, nextPacket]);
var workerPreflightPacketSchema = z.object({
  kind: z.literal("preflight_attempt"),
  schema: z.literal("loopctl-action-packet-v1"),
  actionId: id,
  actionKey: id,
  action: z.object({ id, key: id, kind: z.literal("preflight_attempt"), state: z.literal("ready"), workItemRevision: z.number().int().positive(), targetPrincipal: id, targetTopicId: id, targetDigest: hash }).strict(),
  workItemId: id,
  workItemRevision: z.number().int().positive(),
  targetPrincipal: id,
  targetTopicId: id,
  targetDigest: hash,
  packetDigest: hash,
  contracts: z.object({ taskContractHash: hash, referenceSnapshotHash: hash, writeScopeHash: hash, acceptanceContractHash: hash }).strict(),
  ownerUid: id,
  loopId: id,
  profileId: id,
  catscoProjectId: id,
  workerTopicId: id,
  evidenceTopicId: id,
  workerSessionId: id,
  githubRepo: id,
  writeScope: z.array(id),
  attemptId: id,
  attemptNumber: z.number().int().positive(),
  generation: z.number().int().nonnegative(),
  runtimePrincipal: id,
  leaseExpiresAt: z.string().datetime(),
  proofMode: z.literal("catsco-message"),
  proofKeyId: id.optional(),
  proofPublicKey: id.optional(),
  controllerSignatureAlgorithm: z.literal("ed25519"),
  controllerKeyId: id,
  controllerPublicKey: z.string().min(1),
  controllerSignature: z.string().min(1),
  workBundle: z.object({ contractDigest: hash, instructions: id, deliverables: z.array(id) }).strict()
}).strict();

// src/lib/events.ts
import { z as z2 } from "zod";
var id2 = z2.string().min(1);
var hash2 = z2.string().min(8);
var base = { eventId: id2, idempotencyKey: id2, source: id2, entityRef: id2 };
var contracts = { taskContractHash: hash2, referenceSnapshotHash: hash2, writeScopeHash: hash2, acceptanceContractHash: hash2 };
var deliverable = z2.object({ kind: z2.literal("github_pr"), repository: id2, prNumber: z2.number().int().positive(), headSha: id2, baseSha: id2, digest: hash2 }).strict();
var registered = z2.object({ ...base, type: z2.literal("work_item_registered"), payload: z2.object({ workItemId: id2, loopId: id2, profileId: id2, terminalState: z2.enum(["accepted", "closed"]), ...contracts, writeScope: z2.array(id2), githubRepo: id2, catscoProjectId: id2, workerTopicId: id2, evidenceTopicId: id2.optional(), stewardTopicId: id2, stewardPrincipal: id2.optional(), coordinatorSessionId: id2.optional(), coordinatorSessionTopicId: id2.optional() }).strict() }).strict();
var worktreeContract = z2.object({ repository: id2, baseRevision: id2, branchName: id2, worktreePath: id2, gitDir: id2.optional(), cleanupPolicy: z2.enum(["retain-until-review", "retain-until-integration", "remove-after-candidate"]), workspaceLease: id2 }).strict();
var attemptRoute = z2.object({ catscoProjectId: id2, workerTopicId: id2, evidenceTopicId: id2, stewardTopicId: id2, stewardPrincipal: id2, workerSessionId: id2, coordinatorSessionId: id2, coordinatorSessionTopicId: id2 }).strict();
var bundlePayload = z2.object({ workItemId: id2, expectedRevision: z2.number().int().positive(), attemptId: id2, attemptNumber: z2.number().int().positive(), generation: z2.number().int().nonnegative(), runtimePrincipal: id2, workerSessionId: id2.optional(), proofMode: z2.enum(["ed25519", "catsco-message"]).optional(), proofKeyId: id2.optional(), proofPublicKey: id2.optional(), leaseExpiresAt: z2.string().datetime(), workBundle: z2.object({ contractDigest: hash2, instructions: id2, deliverables: z2.array(id2) }).strict(), attemptRoute: attemptRoute.optional(), ...contracts }).strict();
var bundle = z2.object({ ...base, type: z2.literal("work_bundle_proposed"), payload: bundlePayload }).strict();
var workerReady = z2.object({ ...base, type: z2.literal("worker_ready"), payload: z2.object({ workItemId: id2, expectedRevision: z2.number().int().positive(), attemptId: id2, generation: z2.number().int().nonnegative(), runtimePrincipal: id2, workerSessionId: id2.optional(), signature: z2.literal("catsco-message-attested") }).strict() }).strict();
var runtimeStarted = z2.object({ ...base, type: z2.literal("runtime_started"), payload: z2.object({ workItemId: id2, expectedRevision: z2.number().int().positive(), attemptId: id2, generation: z2.number().int().nonnegative(), runtimePrincipal: id2, workerSessionId: id2.optional(), signature: z2.literal("catsco-message-attested") }).strict() }).strict();
var attemptTopicId = z2.string().regex(/^(?:p2p_[1-9]\d*_[1-9]\d*|grp_[1-9]\d*)$/, "targetTopicId must be a CatsCo Attempt topic");
var workerReadySubmission = z2.object({ targetTopicId: attemptTopicId, event: workerReady }).strict().superRefine((submission, context) => {
  const payload = submission.event.payload;
  if (submission.event.entityRef !== `attempt:${payload.attemptId}`) context.addIssue({ code: "custom", path: ["event", "entityRef"], message: "worker_ready entityRef must bind its attemptId" });
  if (submission.event.source !== payload.runtimePrincipal) context.addIssue({ code: "custom", path: ["event", "source"], message: "worker_ready source must match runtimePrincipal" });
});
var runtimeStartedSubmission = z2.object({ targetTopicId: attemptTopicId, event: runtimeStarted }).strict().superRefine((submission, context) => {
  const payload = submission.event.payload;
  if (submission.event.entityRef !== `attempt:${payload.attemptId}`) context.addIssue({ code: "custom", path: ["event", "entityRef"], message: "runtime_started entityRef must bind its attemptId" });
  if (submission.event.source !== payload.runtimePrincipal) context.addIssue({ code: "custom", path: ["event", "source"], message: "runtime_started source must match runtimePrincipal" });
});
var candidate = z2.object({ ...base, type: z2.literal("candidate_submitted"), payload: z2.object({ ownerUid: id2, workItemId: id2, workItemRevision: z2.number().int().positive(), attemptId: id2, generation: z2.number().int().nonnegative(), runtimePrincipal: id2, workerSessionId: id2.optional(), candidateId: id2, deliverable, ...contracts, proofMode: z2.enum(["ed25519", "catsco-message"]).optional(), signature: id2.optional() }).strict() }).strict().superRefine((event, context) => {
  if ((event.payload.proofMode ?? "ed25519") === "catsco-message" && !/^catsco-user:[1-9]\d*$/.test(event.payload.runtimePrincipal)) context.addIssue({ code: "custom", path: ["payload", "runtimePrincipal"], message: "CatsCo-message Candidate requires a numeric CatsCo runtime principal" });
});
var candidateSubmission = z2.object({ targetTopicId: attemptTopicId, event: candidate }).strict().superRefine((submission, context) => {
  const payload = submission.event.payload;
  if (submission.event.entityRef !== `attempt:${payload.attemptId}`) context.addIssue({ code: "custom", path: ["event", "entityRef"], message: "Candidate entityRef must bind its attemptId" });
  if (submission.event.source !== payload.runtimePrincipal) context.addIssue({ code: "custom", path: ["event", "source"], message: "Candidate source must match runtimePrincipal" });
});
var review = z2.object({ ...base, type: z2.literal("review_decided"), payload: z2.object({ workItemId: id2, expectedRevision: z2.number().int().positive(), candidateId: id2, outcome: z2.enum(["accepted", "changes_requested"]), reviewerPrincipal: id2, authenticationRef: id2.optional(), reviewerProof: id2.optional(), reviewedHeadSha: id2, reviewedDeliverableDigest: hash2, acceptanceContractHash: hash2 }).strict() }).strict();
var reviewSubmission = z2.object({ targetTopicId: attemptTopicId, event: review }).strict().superRefine((submission, context) => {
  const payload = submission.event.payload;
  if (submission.event.entityRef !== `work_item:${payload.workItemId}`) context.addIssue({ code: "custom", path: ["event", "entityRef"], message: "Review entityRef must bind its workItemId" });
  if (submission.event.source !== payload.reviewerPrincipal) context.addIssue({ code: "custom", path: ["event", "source"], message: "Review source must match reviewerPrincipal" });
});
var planEvent = z2.union([registered, bundle]);
var canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value;
function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}
var integrationInputs = z2.object({ workItemId: id2, candidateId: id2, repository: id2, prNumber: z2.number().int().positive(), headSha: id2, digest: hash2 }).strict();

// src/lib/loopctl.ts
import { constants as fsConstants } from "node:fs";
import { realpath, lstat, open } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { z as z3 } from "zod";
import { CommandExecutionError } from "@jackwener/opencli/errors";
var MAX_OUTPUT = 2 * 1024 * 1024;
var MAX_INPUT = 512 * 1024;
var jsonValue = z3.unknown();
async function readConfinedFile(file) {
  if (!file || isAbsolute(file)) throw new Error("input file must be relative to the current directory");
  const cwd = resolve(process.cwd());
  const requested = resolve(cwd, file);
  const info = await lstat(requested);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("input file must be a regular non-symlink file");
  const actual = await realpath(requested);
  const rel = relative(cwd, actual);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("input file must remain inside the current directory");
  const handle = await open(requested, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error("input file must remain a regular file");
    const value = await handle.readFile("utf8");
    if (Buffer.byteLength(value) > MAX_INPUT) throw new Error("input file is too large");
    return value;
  } finally {
    await handle.close();
  }
}

// src/lib/catsco.ts
import { spawn } from "node:child_process";
import { CommandExecutionError as CommandExecutionError2 } from "@jackwener/opencli/errors";
var MAX_OUTPUT2 = 128 * 1024;
var TIMEOUT_MS = 3e4;
function unwrap(value) {
  if (value && typeof value === "object" && "data" in value) return value.data;
  return value;
}
function asRecord(value, label) {
  const row2 = unwrap(value);
  if (!row2 || typeof row2 !== "object" || Array.isArray(row2)) throw new CommandExecutionError2(`CatsCo ${label} returned a non-object`);
  return row2;
}
function asIdentityRecord(value) {
  const identity = unwrap(value);
  const row2 = Array.isArray(identity) && identity.length === 1 ? identity[0] : identity;
  if (!row2 || typeof row2 !== "object" || Array.isArray(row2)) throw new CommandExecutionError2("CatsCo identity returned an invalid response");
  return row2;
}
async function sendAttemptEvent(topicId, content, clientMsgId, expectedPrincipal, beforeSend) {
  if (!/^(?:p2p_[1-9]\d*_[1-9]\d*|grp_[1-9]\d*)$/.test(topicId)) throw new CommandExecutionError2("attested event targetTopicId must be a CatsCo Attempt topic");
  if (!clientMsgId.trim()) throw new CommandExecutionError2("attested event idempotencyKey is required");
  const expectedUid = /^catsco-user:([1-9]\d*)$/.exec(expectedPrincipal)?.[1];
  if (!expectedUid) throw new CommandExecutionError2("attested event source must be a numeric CatsCo principal");
  const authenticatedUid = await authenticatedCatscoUid();
  if (authenticatedUid !== expectedUid) throw new CommandExecutionError2("CatsCo authenticated sender does not match attested event source");
  beforeSend?.();
  const sent = asRecord(await runOpenCli(["catsco", "send", topicId, content, "--client-message-id", clientMsgId, "--format", "json"]), "attested event send");
  const receipt = {
    messageId: String(sent.messageId ?? ""),
    topicId: String(sent.topicId ?? ""),
    clientMsgId: String(sent.clientMsgId ?? ""),
    seqId: String(sent.seqId ?? ""),
    duplicate: sent.duplicate === true,
    contentDigest: String(sent.contentDigest ?? "")
  };
  if (!receipt.messageId || !receipt.seqId || receipt.topicId !== topicId || receipt.clientMsgId !== clientMsgId || !receipt.contentDigest) {
    throw new CommandExecutionError2("CatsCo attested event send receipt failed verification");
  }
  const confirmed = asRecord(await runOpenCli(["catsco", "message-receipt", topicId, "--client-message-id", clientMsgId, "--format", "json"]), "attested event receipt");
  if (confirmed.found !== true || confirmed.serverConfirmed !== true || String(confirmed.topicId ?? "") !== topicId || String(confirmed.clientMsgId ?? "") !== clientMsgId || String(confirmed.seqId ?? "") !== receipt.seqId || String(confirmed.contentDigest ?? "") !== receipt.contentDigest) {
    throw new CommandExecutionError2("CatsCo attested event receipt was not server-confirmed");
  }
  return receipt;
}
async function runOpenCli(args) {
  return await new Promise((resolve2, reject) => {
    const child = spawn(process.env.OPENCLI_BINARY?.trim() || "opencli", args, { shell: false, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (Buffer.byteLength(stdout) > MAX_OUTPUT2) {
        killed = true;
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk).slice(0, 4096);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new CommandExecutionError2(`CatsCo provisioning unavailable: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (killed) return reject(new CommandExecutionError2("CatsCo provisioning timed out or produced too much output"));
      if (code !== 0) return reject(new CommandExecutionError2(`CatsCo provisioning failed: ${stderr.trim().slice(0, 512) || `exit ${code ?? 1}`}`));
      try {
        resolve2(JSON.parse(stdout));
      } catch {
        reject(new CommandExecutionError2("CatsCo provisioning returned invalid JSON"));
      }
    });
  });
}
async function authenticatedCatscoUid() {
  const row2 = asIdentityRecord(await runOpenCli(["catsco", "me", "--format", "json"]));
  const uid = String(row2.uid ?? "");
  if (!/^[1-9]\d*$/.test(uid)) throw new CommandExecutionError2("CatsCo identity response has no numeric uid");
  return uid;
}
function csv(value) {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}
async function groupInfo(groupId) {
  const row2 = asRecord(await runOpenCli(["catsco", "group-info", groupId, "--format", "json"]), "group topology");
  const returnedGroupId = String(row2.groupId ?? "");
  const topic = String(row2.topic ?? "");
  const kind = String(row2.kind ?? "");
  const agentIds = csv(row2.agentIds).sort();
  const memberIds = csv(row2.memberIds).sort();
  if (returnedGroupId !== groupId || topic !== `grp_${groupId}` || kind !== "standard" && kind !== "agent_task") {
    throw new CommandExecutionError2("CatsCo group topology response did not bind the requested group");
  }
  return { groupId: returnedGroupId, topic, kind, agentIds: agentIds.join(","), memberIds: memberIds.join(",") };
}
async function projectHasTopics(projectId, topics) {
  if (!/^[1-9]\d*$/.test(projectId)) throw new CommandExecutionError2("CatsCo Project id must be numeric");
  const sessions = unwrap(await runOpenCli(["catsco", "project-sessions", projectId, "--format", "json"]));
  if (!Array.isArray(sessions) || topics.some((topic) => !sessions.some((row2) => row2 && typeof row2 === "object" && String(row2.topicId ?? "") === topic))) {
    throw new CommandExecutionError2("CatsCo Project assignment readback did not contain every Attempt topic");
  }
}
async function verifyPreflightRoute(projectId, workerTopic, evidenceTopic, workerUid) {
  if (!/^[1-9]\d*$/.test(workerUid) || !/^grp_[1-9]\d*$/.test(workerTopic) || !/^grp_[1-9]\d*$/.test(evidenceTopic) || workerTopic === evidenceTopic) {
    throw new CommandExecutionError2("preflight route requires distinct numeric CatsCo group topics and Worker UID");
  }
  await projectHasTopics(projectId, [workerTopic, evidenceTopic]);
  const workerGroup = await groupInfo(workerTopic.slice("grp_".length));
  const evidenceGroup = await groupInfo(evidenceTopic.slice("grp_".length));
  const workerAgentIds = workerGroup.agentIds.split(",").filter(Boolean);
  const evidenceAgentIds = evidenceGroup.agentIds.split(",").filter(Boolean);
  if (workerGroup.kind !== "agent_task" || workerAgentIds.length !== 1 || workerAgentIds[0] !== workerUid) {
    throw new CommandExecutionError2("CatsCo execution group topology does not bind the authenticated Worker");
  }
  if (evidenceGroup.kind !== "standard" || !evidenceAgentIds.includes(workerUid)) {
    throw new CommandExecutionError2("CatsCo evidence group topology does not include the authenticated Worker");
  }
}

// src/lib/exclusive-lock.ts
var DEFAULT_STALE_MS = 15 * 6e4;

// src/lib/workspace.ts
import { CommandExecutionError as CommandExecutionError3 } from "@jackwener/opencli/errors";
import { z as z4 } from "zod";
var id3 = z4.string().min(1);
var packetSchema = z4.object({
  kind: z4.literal("execute_attempt"),
  loopId: id3,
  githubRepo: id3,
  workBundle: z4.object({ instructions: id3 }).passthrough()
}).passthrough();
var MAX_OUTPUT3 = 128 * 1024;

// src/lib/controller-provenance.ts
import { createHash, createPublicKey, verify } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ArgumentError } from "@jackwener/opencli/errors";
import { z as z5 } from "zod";
var SIGNING_ALGORITHM = "ed25519";
var MAX_TRUSTED_KEYS_BYTES = 64 * 1024;
var trustedControllerKeysSchema = z5.object({
  version: z5.literal(1),
  keys: z5.array(z5.object({ ownerUid: z5.string().min(1), controllerKeyId: z5.string().min(1), publicKey: z5.string().min(1) }).strict())
}).strict();
function controllerCanonicalJson(value) {
  return JSON.stringify(normalize(value));
}
function normalize(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonical JSON rejects non-finite numbers");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item !== void 0) result[key] = normalize(item);
    }
    return result;
  }
  throw new TypeError(`canonical JSON rejects ${typeof value}`);
}
function controllerKeyId(publicKey) {
  return `controller-ed25519:${createHash("sha256").update(publicKey).digest("base64url")}`;
}
function defaultTrustedKeysPath() {
  return join(homedir(), ".config", "loopctl", "trusted-controller-keys.json");
}
function trustedKeysPath() {
  const configured = process.env.LOOPCTL_TRUSTED_CONTROLLER_KEYS_FILE?.trim();
  return configured || defaultTrustedKeysPath();
}
function readTrustedKeysFile(path) {
  let descriptor;
  try {
    const pathStats = lstatSync(path);
    if (pathStats.isSymbolicLink()) throw new Error("trusted Controller key file must not be a symbolic link");
    if (!pathStats.isFile()) throw new Error("trusted Controller key file must be a regular file");
    if ((pathStats.mode & 511) !== 384) throw new Error("trusted Controller key file must have mode 0600");
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const descriptorStats = fstatSync(descriptor);
    if (!descriptorStats.isFile()) throw new Error("trusted Controller key file must be a regular file");
    if ((descriptorStats.mode & 511) !== 384) throw new Error("trusted Controller key file must have mode 0600");
    if (descriptorStats.size > MAX_TRUSTED_KEYS_BYTES) throw new Error("trusted Controller key file is too large");
    if (typeof process.getuid === "function" && descriptorStats.uid !== process.getuid()) throw new Error("trusted Controller key file must be owned by the current user");
    if (descriptorStats.dev !== pathStats.dev || descriptorStats.ino !== pathStats.ino) throw new Error("trusted Controller key file changed while opening");
    return readFileSync(descriptor, "utf8");
  } finally {
    if (descriptor !== void 0) closeSync(descriptor);
  }
}
function trustedKey(packet) {
  let config;
  try {
    config = trustedControllerKeysSchema.parse(JSON.parse(readTrustedKeysFile(trustedKeysPath())));
    const identities = /* @__PURE__ */ new Set();
    for (const key of config.keys) {
      const identity = `${key.ownerUid}\0${key.controllerKeyId}`;
      if (identities.has(identity)) throw new Error("trusted Controller key configuration has duplicate owner/key entries");
      identities.add(identity);
      if (key.controllerKeyId !== controllerKeyId(key.publicKey)) throw new Error("trusted Controller key configuration has an invalid key ID");
      if (createPublicKey(key.publicKey).asymmetricKeyType !== SIGNING_ALGORITHM) throw new Error("trusted Controller key configuration has a non-Ed25519 public key");
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid configuration";
    throw new ArgumentError(`trusted Controller key configuration is unavailable or invalid: ${detail}`);
  }
  const matches = config.keys.filter((key) => key.ownerUid === packet.ownerUid && key.controllerKeyId === packet.controllerKeyId);
  if (matches.length !== 1) throw new ArgumentError("preflight packet Controller key is not pinned for its owner");
  const pin = matches[0];
  if (pin.publicKey !== packet.controllerPublicKey) throw new ArgumentError("preflight packet Controller public key does not match its trusted pin");
  return pin;
}
function verifyTrustedControllerPreflightPacket(packet) {
  if (packet.controllerSignatureAlgorithm !== SIGNING_ALGORITHM) throw new ArgumentError("preflight packet Controller signature algorithm is invalid");
  if (packet.controllerKeyId !== controllerKeyId(packet.controllerPublicKey)) throw new ArgumentError("preflight packet Controller key ID does not match its public key");
  trustedKey(packet);
  const { controllerSignature: _signature, packetDigest, ...withoutDigest } = packet;
  const expectedDigest = createHash("sha256").update(controllerCanonicalJson(withoutDigest)).digest("hex");
  if (packetDigest !== expectedDigest) throw new ArgumentError("preflight packet packetDigest does not match the canonical Controller action packet");
  const { controllerSignature: _ignoredSignature, ...signaturePayload } = packet;
  try {
    const verified = verify(null, Buffer.from(controllerCanonicalJson(signaturePayload)), createPublicKey(packet.controllerPublicKey), Buffer.from(packet.controllerSignature, "base64"));
    if (!verified) throw new Error("signature mismatch");
  } catch {
    throw new ArgumentError("preflight packet Controller signature is invalid");
  }
}

// src/lib/commands.ts
var numericGroupTopic = /^grp_[1-9]\d*$/;
var stableId = (prefix, parts) => `${prefix}:${createHash2("sha256").update(parts.join("\0")).digest("hex")}`;
function assertFutureLease(packet) {
  if (Date.parse(packet.leaseExpiresAt) <= Date.now()) throw new ArgumentError2("preflight packet leaseExpiresAt must be in the future");
}
function validateWorkerPreflightPacket(packet, receivedTopic, authenticatedUid) {
  assertFutureLease(packet);
  const principal = `catsco-user:${authenticatedUid}`;
  if (!numericGroupTopic.test(receivedTopic)) throw new ArgumentError2("received-topic must be a numeric CatsCo group topic");
  if (!/^[1-9]\d*$/.test(packet.catscoProjectId)) throw new ArgumentError2("preflight packet catscoProjectId must be numeric");
  if (packet.actionId !== packet.action.id || packet.actionKey !== packet.action.key || packet.kind !== packet.action.kind || packet.workItemRevision !== packet.action.workItemRevision || packet.targetPrincipal !== packet.action.targetPrincipal || packet.targetTopicId !== packet.action.targetTopicId || packet.targetDigest !== packet.action.targetDigest) {
    throw new ArgumentError2("preflight packet action duplicates do not agree");
  }
  if (packet.targetPrincipal !== principal || packet.runtimePrincipal !== principal) {
    throw new ArgumentError2("preflight packet target/runtime principal does not match authenticated CatsCo Bot");
  }
  if (packet.targetTopicId !== receivedTopic || packet.workerTopicId !== receivedTopic) {
    throw new ArgumentError2("preflight packet execution topic does not match received-topic");
  }
  if (!numericGroupTopic.test(packet.evidenceTopicId) || packet.evidenceTopicId === receivedTopic) {
    throw new ArgumentError2("preflight packet evidenceTopicId must be a distinct numeric CatsCo group topic");
  }
  const sessionId = `session:v2:catscompany:group:${receivedTopic}:agent:${authenticatedUid}`;
  if (packet.workerSessionId !== sessionId) throw new ArgumentError2("preflight packet workerSessionId is not the canonical Worker session");
}
async function preflightReady(kwargs) {
  let packet;
  try {
    packet = workerPreflightPacketSchema.parse(JSON.parse(await readConfinedFile(String(kwargs["packet-file"]))));
  } catch (error) {
    throw new ArgumentError2(error instanceof Error ? error.message : "invalid preflight packet file");
  }
  verifyTrustedControllerPreflightPacket(packet);
  const receivedTopic = String(kwargs["received-topic"] ?? "");
  const authenticatedUid = await authenticatedCatscoUid();
  validateWorkerPreflightPacket(packet, receivedTopic, authenticatedUid);
  await verifyPreflightRoute(packet.catscoProjectId, packet.workerTopicId, packet.evidenceTopicId, authenticatedUid);
  const parts = [packet.actionKey, "worker_ready", packet.attemptId, String(packet.generation), String(packet.workItemRevision), packet.workerSessionId];
  const event = workerReady.parse({
    type: "worker_ready",
    eventId: stableId("loop-event", parts),
    idempotencyKey: stableId("loop-evidence", parts),
    source: packet.runtimePrincipal,
    entityRef: `attempt:${packet.attemptId}`,
    payload: {
      workItemId: packet.workItemId,
      expectedRevision: packet.workItemRevision,
      attemptId: packet.attemptId,
      generation: packet.generation,
      runtimePrincipal: packet.runtimePrincipal,
      workerSessionId: packet.workerSessionId,
      signature: "catsco-message-attested"
    }
  });
  const content = canonicalJson(event);
  const receipt = await sendAttemptEvent(packet.evidenceTopicId, content, event.idempotencyKey, event.source, () => assertFutureLease(packet));
  return { targetTopicId: packet.evidenceTopicId, event: JSON.parse(content), receipt };
}

// loop-preflight-ready.ts
cli({
  site: "loop",
  name: "preflight-ready",
  description: "Worker-only: validate a native preflight packet and receipt-submit worker_ready",
  access: "write",
  browser: false,
  strategy: Strategy.LOCAL,
  args: [
    { name: "packet-file", help: "Relative raw Controller preflight packet JSON file", required: true },
    { name: "received-topic", help: "Native received CatsCo grp_<id> topic", required: true }
  ],
  columns: ["targetTopicId", "event", "receipt"],
  defaultFormat: "json",
  func: preflightReady
});
